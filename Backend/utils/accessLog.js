// Backend/utils/accessLog.js
//
// Stage 2 — أثر تدقيق لمحاولات الوصول المرفوضة خارج النطاق.
//
// Constitution Principle IV بيطلب إن كل محاولة مرفوضة تتسجّل بما يكفي للتحقيق:
// معرّف المستخدم، الرول، المسار، ومعرّف المورد المطلوب. الأربعة موجودين تحت.
//
// ليه سطر لوج مش كولكشن: المشروع عنده كولكشن تدقيق واحد
// (idCardAccessLogModel) وهو بيسجّل قراءات **ناجحة** ومحدودة العدد وبتيجي من
// بني آدم. هنا العكس تماماً — أي حد معاه توكن صالح يقدر يولّد مستند لكل طلب
// بلوب على ids، يعني ميزة تدقيق بتتحوّل لناقل استنزاف قرص على نفس الداتابيز
// اللي بتخدم التطبيق. الـTTL index بيحدّ مدة الاحتفاظ مش معدّل الكتابة، فالنافذة
// بتفضل مفتوحة. سطور اللوج بتروح لستريم العملية حيث الـrotation والاحتفاظ
// المطبّقين على المستوى ده بيشتغلوا أصلاً، ورميها مايكلّفش حاجة.
//
// نقطة واحدة عشان أسماء الحقول ماتتفرقعش بين خمس مواضع نداء — أثر تدقيق
// بأسماء حقول مختلفة مش أثر تدقيق.
//
// الاختبارات بتعمل spy على الموديول ده (نفس نمط الـI/O الخارجي الموكوك في
// tests/setup.js) وبتتأكد إن كل رفض بيسجّل مرة واحدة بالحقول الأربعة.

// Stage 7 (hardening) — writeDenialLog هو الكاتب الداخلي الوحيد. logScopeDenial
// (فوق تاريخياً) وlogRoleDenial (تحت، جديد) بيمرّوا عليه بس، فأسماء الحقول
// الأربعة (userId, role, path, resourceId) ماتتفرقعش بين الطبقتين — نفس
// المنطق اللي عمل الملف ده من الأساس (راجع التعليق فوق).
function writeDenialLog(event, { req, resource, resourceId }) {
    const entry = {
        event,
        userId: req?.user?._id ? String(req.user._id) : null,
        role: req?.user?.role ?? null,
        method: req?.method ?? null,
        path: req?.originalUrl ?? req?.url ?? null,
        resource,
        resourceId: resourceId ? String(resourceId) : null,
        at: new Date().toISOString(),
    };

    console.warn(JSON.stringify(entry));
}

/**
 * @param {object} params
 * @param {import('express').Request} params.req  الطلب المرفوض
 * @param {string} params.resource                نوع المورد ("player" | "seasonMatch" | "team" | ...)
 * @param {string} params.resourceId              معرّف المورد المطلوب
 */
export function logScopeDenial({ req, resource, resourceId }) {
    writeDenialLog("scope_denied", { req, resource, resourceId });
}

// Stage 7 — رفض على مستوى بوابة الرول (allowedTo)، مش طبقة النطاق. بيتنفّذ
// قبل ما أي سياق خاص بالمورد يتحدد، فـresource هنا اسم المسار (baseUrl بدون
// بادئة /api/v1) مش اسم دومين، وresourceId بيتاخد من req.params.id لو موجود
// وإلا null (مش placeholder — فرق بين "مفيش id" و"id فاضي").
export function logRoleDenial({ req, resource }) {
    writeDenialLog("role_denied", { req, resource, resourceId: req?.params?.id ?? null });
}

export default logScopeDenial;
