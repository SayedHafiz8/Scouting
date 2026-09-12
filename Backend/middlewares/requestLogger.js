import morgan from "morgan";

// ============================================================================
// audit-backend — سر الويبهوك بينزل في لوجز الوصول بالنص الصريح.
//
// app.js بيركّب `POST /webhooks/bunny/:secret` (C1/F7a): السر مقطع في المسار
// نفسه، وmorgan('combined') بيسجّل الـURL كامل. يعني BUNNY_STREAM_WEBHOOK_SECRET
// بيتكتب على الديسك في كل ضربة ويبهوك — في لوج العملية، وفي لوج أي reverse
// proxy قدّامها. نفس فئة مشكلة الـtoken-in-query-string اللي اتقفلت في
// socket/authenticateSocket.js، طبقة واحدة فوق.
//
// وأسوأ من توكن وصول: السر ده **مابينتهيش لوحده**. أي حد معاه قراءة على اللوجز
// يقدر يزوّر نداءات ويبهوك ويغيّر حالة الميديا لحد ما حد يلفّه يدوياً.
//
// ليه الإصلاح في طبقة اللوج مش في المسار:
//   باني هي اللي بتنادي الـURL ده. تغيير شكل المسار (نقل السر لهيدر مثلاً) معناه
//   إعادة ضبط على ناحية باني — خارج النطاق عن قصد. المسار والـparam والتحقق
//   (crypto.timingSafeEqual في playerMediaController.bunnyWebhook) كلهم زي ما هم.
//
// ليه على **نمط المسار** مش على قيمة السر:
//   لو الطمس اتعمل بمقارنة القيمة، الطبقة دي بتحتاج تقرا السر عشان تخفيه —
//   فبيبقى في نطاق الكود ده، وبيبطل يشتغل أول ما السر يتلف (rotation) أو يكون
//   مش متظبط أصلاً. والأهم: **المحاولة الغلط مش هتتطمس**. المهاجم اللي بيجرّب
//   أسرار بيتكتب كل تخمين بالنص في اللوج، والتخمينات دي بتتعاد استخدامها في
//   سياقات تانية (password spraying على نفس القيم). النمط بيطمس الاتنين.
//
// ليه override للتوكن المدمج `:url` مش فورمات جديدة:
//   'combined' و'dev' الاتنين بيستخدموا `:url`. الـoverride بيغطي الاتنين
//   (البرودكشن والتطوير) من نقطة واحدة من غير ما نعيد كتابة تعريف الفورمات.
//   وكل مسار تاني بيرجع من الدالة من غير تغيير حرف واحد.
// ============================================================================

// المقاطع الحساسة في المسارات. المقطع بعد البادئة هو اللي بيتطمس، واللي بعده
// (باقي المسار + query string) بيفضل زي ما هو.
//
// `i` مقصودة: توجيه Express مش حساس لحالة الأحرف افتراضياً ("case sensitive
// routing" مطفي)، يعني /WEBHOOKS/BUNNY/<secret> بتوصل نفس الهاندلر. من غير
// الفلاج ده، تغيير حالة الأحرف بيبقى تحايل على الطمس بحرف واحد.
//
// والطمس بيشتغل قبل الـrouting، فبيغطي كمان الطلبات اللي **مابتوصلش** الهاندلر
// أصلاً (method غلط، مقاطع زيادة) واللي بتروح لمعالج الـ404.
const REDACTED_PATH_SEGMENTS = [
    // app.js — POST /webhooks/bunny/:secret
    /^(\/webhooks\/bunny\/)[^/?#]+/i,
];

export const REDACTION_PLACEHOLDER = "[REDACTED]";

/**
 * بترجّع الـURL جاهز للتسجيل: المقطع الحساس متبدّل بـ[REDACTED] لو المسار
 * بيطابق نمط محفوظ، وإلا الـURL نفسه من غير تغيير.
 *
 * ملاحظة: بتشتغل على الـURL الخام (غير مفكوك الترميز) عن قصد — طلب زي
 * /webhooks/bunny/%73ecret بيوصل الهاندلر بسر مفكوك صحيح، والفئة [^/?#]+
 * بتلقط الشكل المرمّز زي ما بتلقط العادي.
 *
 * @param {string} url
 * @returns {string}
 */
export const redactSensitiveUrl = (url) => {
    if (typeof url !== "string" || url === "") return url;

    for (const pattern of REDACTED_PATH_SEGMENTS) {
        if (pattern.test(url)) {
            return url.replace(pattern, `$1${REDACTION_PLACEHOLDER}`);
        }
    }

    return url;
};

// override للتوكن المدمج. morgan بيفكّ التوكنات وقت التسجيل مش وقت تجميع
// الفورمات، فالتسجيل هنا (وقت تحميل الموديول) بيغطي أي middleware اتعمل قبله
// أو بعده. الأصل هو `req.originalUrl || req.url` — بنحافظ على نفس الترتيب.
morgan.token("url", (req) => redactSensitiveUrl(req.originalUrl || req.url));

/**
 * بتبني middleware التسجيل. الفورمات والستريم قابلين للحقن عشان الاختبارات
 * تقدر تمسك السطر المكتوب من غير ما تتفرّج على stdout بتاع العملية.
 *
 * @param {object} [options]
 * @param {string} [options.format]  فورمات morgan (افتراضي: حسب NODE_ENV)
 * @param {NodeJS.WritableStream} [options.stream]
 */
export const createRequestLogger = ({ format, stream } = {}) => {
    const resolved = format ?? (process.env.NODE_ENV === "production" ? "combined" : "dev");
    return morgan(resolved, stream ? { stream } : undefined);
};

export default createRequestLogger;
