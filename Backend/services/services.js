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

// ============================================================================
// audit-backend — الـmass assignment على مسار الإنشاء.
//
// الشكل القديم كان `model.create(req.body)` — الـbody الخام بالكامل. الفاليديشن
// (createValidate) بيتحقق من الحقول المعروفة لكن **مابيشيلش** اللي مش معروف،
// فأي حقل موجود في المخطط كان قابل للكتابة من العميل. strict mode بيسقط اللي
// مش في المخطط، فالخطر هو الحقول اللي **جوه** المخطط ومش مفروض العميل يكتبها.
//
// على User ده كان: profileImg و idCardFrontImg/BackImg و active و
// passwordChangedAt و refreshToken و vaultFailedAttempts و vaultLockedUntil.
//
// و`profileImg` تحديداً هو نفس الـsigning oracle اللي اتقفل صراحةً في
// authController.updateLoggedUser و userController.update: كتابة المسار حر من
// غير رفع فعلي بتخلي resolveImageUrl يوقّعه تلقائي ويرجّع URL صالح على media
// zone. التعليقين هناك موجودين وموثّقين، وtests/massAssignment.test.js بيغطّي
// مسارَي التعديل الاتنين — والإنشاء كان مفتوح. الباب كان مقفول من ناحيتين
// ومفتوح من التالتة.
//
// ليه الإصلاح هنا في الفاكتوري مش في كل كنترولر:
//   • `update` و`updateLoggedUser` كنترولرز مكتوبين بالإيد، فتعداد الحقول
//     جوّاهم طبيعي. أما `create` فهو `creating(Model)` — مفيش جسم أعدّد فيه،
//     فمطابقة نفس الشكل حرفياً كانت معناها التخلي عن الفاكتوري في User وحده،
//     وده تغيير أكبر وبيبعده عن التلات مواضع التانية.
//   • الآلية واحدة زي ما هي: وايت ليست حقول معلَنة. اللي اتغير إن مكانها بقى
//     عند نقطة الكتابة نفسها.
//
// `allowed` **إجبارية**: لو اختيارية، غيابها بيبقى معناه "بلا حماية"، وأي
// `creating(NewModel)` في المستقبل بيفتح الباب تاني بصمت. الرمي بيحصل وقت
// تحميل الموديول — صاخب وفوري ومستحيل يعدّي.
//
// وترتيب الإسناد اتعكس عن قصد: الانتقاء الأول وبعده ownerField. كان
// `req.body[field] = req.user._id` قبل الإنشاء (فالعميل مكانش يقدر يزوّره
// أصلاً)، بس دلوقتي بقى مستحيل تركيبياً مش بالترتيب بس.
// ============================================================================
export const creating = (model, { ownerField = null, populate = null, allowed } = {}) => {
    if (!Array.isArray(allowed) || allowed.length === 0) {
        throw new Error(
            `creating(${model.modelName}) requires a non-empty \`allowed\` field whitelist. ` +
            `Passing req.body straight to create() lets a client write any schema field, ` +
            `including ones it must never set (on User: profileImg, active, passwordChangedAt, ` +
            `refreshToken, the vault lockout counters). Declare the fields this route accepts.`
        );
    }

    return asyncHandler(async (req, res, next) => {
        const payload = {};
        for (const key of allowed) {
            if (req.body[key] !== undefined) payload[key] = req.body[key];
        }

        // بعد الانتقاء: الحقل ده بيتحدد من التوكن، مش من العميل
        if (ownerField) {
            payload[ownerField] = req.user._id;
        }

        let document = await model.create(payload);

        if (populate) {
            document = await applyPopulate(model.findById(document._id), populate);
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

        // TODO (مقرَّر، مش منفَّذ — خارج نطاق فرع الترتيب عن قصد):
        //
        // الذيل ده — التقاط countFilter، بعده sort/limitFields/applyPagination،
        // بعده Promise.all([countDocuments, query]) — **متكرر حرفياً في تمانية
        // مواضع**: هنا، وسبع نسخ مكتوبة باليد في:
        //
        //   controllers/agesController.js:56
        //   controllers/coachEvaluationController.js:181
        //   controllers/observerEvaluationController.js:131
        //   controllers/playerController.js:445
        //   controllers/playerMediaController.js:222
        //   controllers/scoutingReportController.js:256
        //   controllers/seasonMatchController.js:112
        //
        // ليه ده مهم: ترتيب الخطوات هنا **عقد أمني**، مش ستايل. countFilter لازم
        // يتلقط بعد .filter() وقبل applyPagination بالظبط — لو اتلقط قبل .filter()
        // العدّ بيتم على نطاق أوسع من اللي المستخدم مسموح له يشوفه، فبيسرّب وجود
        // مستندات برّه نطاق ملكيته في الـpagination metadata. تمانية مواضع بتعيد
        // تنفيذ نفس العقد يدوياً = تمانية أماكن العقد ده يقدر يتكسر فيها بصمت
        // واحد ورا التاني.
        //
        // الحل المقرَّر: استخراج الذيل لهيلبر واحد ينده منه الفاكتوري والكنترولرز
        // المكتوبة باليد، فالترتيب يتحدد في مكان واحد. اللي اترفض صراحةً بدلاً منه:
        // تمرير queryParams كـargument رابع لهاندلر Express — بيدي نفس الدالة
        // سلوكين حسب اللي بيناديها، وبيعتمد على "Express بيمرّر تلات arguments بس"
        // كعقد ضمني يتكسر بصمت مع أي wrapper أو middleware جديد.
        //
        // مااتعملش هنا لأنه مالوش علاقة بالترتيب وكان هيكبّر الـdiff.
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