import asyncHandler from "express-async-handler";

import AgeGroup from "../models/ageGroupModel.js";
import { creating, gettingSpecific } from "../services/services.js";
import ApiFeature from "../utils/apiFeatures.js";

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
export const create = creating(AgeGroup);

// audit-database I2 — وايت ليست الترتيب. birthYear مفهرس (unique)، وهو القيمة
// الوحيدة اللي بتوصل هنا أصلاً (DEFAULT_SORT تحت). name مضاف لأنه unique ومفهرس برضه.
const AGE_GROUP_SORT_FIELDS = ["birthYear", "name"];

// الترتيب دايمًا بالسنة تصاعديًا (ما لم العميل يطلب ترتيب تاني بنفسه) — عشان أي
// فئة جديدة تتحط في مكانها الصح تلقائيًا.
//
// ⚠️ ماينفعش يتطبّق بـ`req.query.sort = "..."`: في Express 5 الـquery عبارة عن
// getter بيعيد الـparse في كل قراءة من غير memoization (`req.query === req.query`
// بترجع false)، فالكتابة بتضيع قبل ما ApiFeature يقراها والاستعلام بيتنفّذ بلا
// ترتيب. الشكل اللي كان هنا (Object.defineProperty على req) كان بيشتغل فعلاً،
// لكنه كان الطريقة التانية في المشروع لنفس المشكلة — اتوحّد على الشكل ده:
// أوبجكت query صريح بيتمرّر لـApiFeature، بلا أي لمس لـreq.
//
// ملاحظة على فاصل التعادل: ApiFeature.sort() بتضيف `_id` لكل ترتيب. على
// birthYear الإضافة دي **لا-عملية** فعلياً — الحقل معلَن `unique: true` في
// ageGroupModel فمفيش مستندين يقدروا يتعادلوا فيه والمقارنة عمرها ما توصل
// لـ_id. لكن ?sort=name (name برضه unique) وأي حقل يتضاف للوايت ليست بعدين
// **مش** مضمون فرادته، فالفاصل هو اللي بيضمن الحتمية هناك.
const DEFAULT_SORT = "birthYear";

// @desc    Get all age groups
// @route   POST api/v1/ages
// @access  private
//
// الشكل ده كان `gettingAll(...)`، واتفك منها لأن الفاكتوري بتقرا `req.query`
// جواها ومحدش من برّه يقدر يحقن فيه قيمة من غير ما يعدّل `req`. باقي الجسم مطابق
// لـservices.gettingAll سطر بسطر عن قصد.
export const getAll = asyncHandler(async (req, res, next) => {
    const queryParams = { ...req.query, sort: req.query.sort || DEFAULT_SORT };

    // الفرونت مبيبعتش أي param فلترة على /ages — الوايت ليست الفاضية بتسقطهم كلهم،
    // وsort شغّال عبر RESERVED_QUERY_KEYS.
    const features = new ApiFeature(
        AgeGroup.find({}),
        queryParams,
        req.params,
        req.user
    ).filter({});

    const countFilter = features.query.getFilter();
    features.sort(AGE_GROUP_SORT_FIELDS).limitFields().applyPagination();

    const [documentCount, documents] = await Promise.all([
        AgeGroup.countDocuments(countFilter),
        features.query,
    ]);
    features.buildPagination(documentCount);

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents },
    });
});

// @desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const getSpecific = gettingSpecific(AgeGroup);