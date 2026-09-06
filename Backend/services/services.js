import asyncHandler from "express-async-handler";

import AppError from "../utils/appError.js";
import ApiFeature from "../utils/apiFeatures.js";

// helper بسيط بيطبق populate لو موجود، عشان متكررش نفس الـ if في كل دالة
const applyPopulate = (query, populateOptions) => {
    if (!populateOptions) return query;

    if (Array.isArray(populateOptions)) {
        populateOptions.forEach((opt) => {
            query = query.populate(opt);
        });
    } else {
        query = query.populate(populateOptions);
    }

    return query;
};

export const creating = (model, field = null, populateOptions = null) => {
    return asyncHandler(async (req, res, next) => {
        if (field) {
            req.body[field] = req.user._id;
        }

        let document = await model.create(req.body);

        if (populateOptions) {
            document = await applyPopulate(model.findById(document._id), populateOptions);
        }

        res.status(201).json({
            status: "success",
            data: {
                document,
            },
        });
    });
};

// `baseFilterFn`: اختياري، `async (req) => filterObject` — لو موجودة، الفلتر الراجع منها
// بيتحط في model.find(filterObject) بدل model.find() الفاضي الافتراضي.
// مستخدمة لسكوبات ملكية مركّبة (زي أوبزيرفر بيشوف بس مباريات فرق اللاعبين المتابعهم)
// اللي buildOwnerScope في ApiFeature مش بتقدر تعبّر عنها (فيلد واحد = user._id).
// لازم ترجع plain object مش Query — الـ Query بتاع Mongoose thenable، فلو رجعناه من دالة
// async وعملنا await عليه، الـ await بينفذ الكويري فعليًا (بيرجع النتايج) بدل الـ Query نفسه.
// الفلاتر بتاعة ApiFeature (.filter()) بتتراكب فوقه بعدين عادي.
// §11 — الباراميتر searchFields اتشال: بعد ما البحث اتضيّق على Player (اللي ليه
// كنترولر مخصص) مبقاش فيه ولا مستدعي واحد للـgettingAll بيبحث. الوحيد اللي كان
// بيبعته هو seasonMatches بـ["venue"]، ومفيش UI بيطلبه.
// audit-database I2 — `filterOptions.sortable` وايت ليست حقول الترتيب، بنفس شكل
// `filterOptions.allowed` بتاعة الفلاتر. غيابها = مفيش ترتيب من العميل خالص
// (ApiFeature.sort افتراضيها قايمة فاضية) — الفشل المقفول، عشان مستدعي جديد ينسى
// يمرّرها مايفتحش الباب لـCOLLSCAN من غير ما حد ياخد باله.
export const gettingAll = (model, filterOptions = {}, populateOptions = null, baseFilterFn = null) => {
    const { sortable = [], ...apiFilterOptions } = filterOptions;

    return asyncHandler(async (req, res, next) => {
        const baseFilter = baseFilterFn ? await baseFilterFn(req) : {};
        const features = new ApiFeature(model.find(baseFilter), req.query, req.params, req.user)
            .filter(apiFilterOptions)

        // perf audit 2026-09-04 — العدّ والجلب كانوا بيتنفذوا بالتتابع (await على
        // countDocuments، وبعد ما يخلص بس يبدأ الـfind)، رغم إنهم **مستقلين
        // تماماً**: العدد بيدخل على البيانات الوصفية بس، مش على skip/limit
        // (شوف applyPagination في apiFeatures.js). يعني رحلة شبكة كاملة كانت
        // بتتهدر في كل طلب قائمة في التطبيق كله — قياس رحلة الشبكة الواحدة
        // لـ Atlas في هذا الإعداد ≈ 100ms.
        //
        // أمنياً: الفلتر المستخدم في العدّ هو نفس الكائن اللي الكويري نفسه شايله
        // (getFilter من نفس الكويري، بعد .filter() بالظبط زي قبل كده) — نطاق
        // الملكية بيتحدد قبل النقطة دي ومابيتلمسش هنا. sort/limitFields/
        // applyPagination مابيغيروش الفلتر، بيضيفوا sort/projection/skip/limit بس.
        const countFilter = features.query.getFilter();

        features.sort(sortable).limitFields().applyPagination();

        const finalQuery = applyPopulate(features.query, populateOptions);

        const [documentCount, documents] = await Promise.all([
            model.countDocuments(countFilter),
            finalQuery,
        ]);

        features.buildPagination(documentCount);
        const { pagination } = features;

        if (!documents) {
            return next(new AppError(`No documents yet`, 404));
        }
        res.status(200).json({
            status: "success",
            count: documents.length,
            pagination,
            data: {
                documents,
            },
        });
    });
};

export const gettingSpecific = (model, populateOptions = null) => {
    return asyncHandler(async (req, res, next) => {
        const { id } = req.params;

        const query = applyPopulate(model.findById(id), populateOptions);
        const document = await query;

        if (!document) {
            return next(new AppError(`No document for this Id '${id}'`, 404));
        }
        res.status(200).json({
            status: "success",
            data: {
                document,
            },
        });
    });
};

export const updating = (model, populateOptions = null) => {
    return asyncHandler(async (req, res, next) => {
        const body = req.body;
        const id = req.params.id;

        const query = model.findByIdAndUpdate(id, body, {
            returnDocument: "after",
            runValidators: true,
        });

        const document = await applyPopulate(query, populateOptions);

        if (!document) {
            return next(new AppError(`No document for This Id: ${id}`, 404));
        }
        res.status(200).json({
            status: "success",
            data: {
                document,
            },
        });
    });
};

export const softDelete = (model) => {
    return asyncHandler(async (req, res, next) => {
        const id = req.params.id;
        const document = await model.findByIdAndUpdate(
            id,
            {
                active: false,
            },
            { returnDocument: "after", runValidators: true }
        );
        if (!document) {
            return next(new AppError(`No document for This Id: ${id}`, 404));
        }
        res.status(204).json({
            status: "success",
        });
    });
};

export const restoring = (model, populateOptions = null) => {
    return asyncHandler(async (req, res, next) => {
        const id = req.params.id;

        const query = model
            .findByIdAndUpdate(
                id,
                {
                    active: true,
                },
                { returnDocument: "after", runValidators: true }
            )
            .setOptions({ bypassFilter: true });

        const document = await applyPopulate(query, populateOptions);

        if (!document) {
            return next(new AppError(`No document for This Id: ${id}`, 404));
        }
        res.status(200).json({
            status: "success",
            data: {
                document,
            },
        });
    });
};

export const deleteOne = (model) =>
    asyncHandler(async (req, res, next) => {
        const { id } = req.params;
        const document = await model.findByIdAndDelete(id);
        if (!document) {
            return next(new AppError(`No document for This Id: ${id}`, 404));
        }
        res.status(204).json({
            status: "success",
        });
    });