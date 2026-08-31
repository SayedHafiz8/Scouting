// ============================================================================
// حدود الوقت — مصدر واحد للحقيقة. **كل** مقارنة تاريخ/شهر في السيرفر لازم تعدّي
// من هنا، ومن هنا بس.
//
// ليه الملف ده موجود أصلاً (audit-backend C3):
// العميل بيبعت `year` و`month` كأرقام مجرّدة (من `<select>`)، و`matchDate` بيتخزن
// منتصف ليل **UTC** (جاي من `<input type="date">`). يعني كل الأرقام اللي بنقارن
// بيها بتتولد في نطاق UTC. لو السيرفر قارنها بتوقيته المحلي، بيبقى فيه نافذة
// عرضها = فرق المنطقة الزمنية، الجانبين فيها مش متفقين على "الشهر الحالي" ولا
// "النهاردة" إيه.
//
// ودي مش نظرية: يوم 2026-08-31 الساعة 21:53 UTC (= 2026-09-01 00:53 على سيرفر
// GMT+0300) كان `isCurrentMonth` في coachEvaluationController بيرجع false لتقييم
// شهر 8، فقفل الـblind review بيتخطّى بالكامل — يعني أدمن يقدر يشوف تقييم أدمن
// تاني قبل ما ينشر بتاعه، لمدة 3 ساعات كل نهاية شهر. ده تسريب صلاحيات، مش
// تفصيلة عرض.
//
// القاعدة: مفيش `getFullYear` / `getMonth` / `getDate` (بدون UTC) في أي كود
// بيقارن مدخلات المستخدم. الصيغة المحلية للعرض بس، وده شغل الفرونت إند.
// ============================================================================

export const DAY_MS = 86_400_000;

/** الشهر الحالي بتوقيت UTC — `month` بواحد-أساس (1..12) زي ما العميل بيبعته. */
export const currentYearMonthUTC = (now = new Date()) => ({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
});

/**
 * هل (year, month) هما الشهر الحالي بتوقيت UTC؟
 * بيقبل نص أو رقم — `Number()` عن قصد عشان `req.query` بتيجي نصوص.
 * أي قيمة مش رقم (NaN) بترجع false: مقارنة مش محسومة تتعامل كـ"مش الشهر الحالي"
 * وده الاتجاه الآمن هنا لأن الاستدعاءات الجاية بتقفل مش بتفتح.
 */
export const isCurrentMonthUTC = (year, month, now = new Date()) => {
    const current = currentYearMonthUTC(now);
    return Number(year) === current.year && Number(month) === current.month;
};

/**
 * سنة تاريخ متخزّن كمنتصف ليل UTC (اللي جاي من `<input type="date">`).
 * لازم UTC: "2010-01-01" بيتفكّ لـ 2010-01-01T00:00:00Z، وعلى سيرفر بتوقيت سالب
 * (مثلاً UTC-5) الـ getFullYear المحلي بيرجّع **2009** — يعني لاعب مواليد أول
 * يناير بياخد فئة عمرية غلط، أو يترفض تسجيله لو مفيش AgeGroup للسنة الغلط دي.
 */
export const yearOfUTC = (date) => new Date(date).getUTCFullYear();

/** منتصف ليل النهاردة بتوقيت UTC كـ epoch ms. */
export const startOfTodayUTC = (now = new Date()) =>
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

/**
 * اليوم الكامل اللي `date` واقعة فيه بتوقيت UTC — `{ start, end }` نصف مفتوح
 * (`$gte: start, $lt: end`).
 *
 * البديل اللي كان مستعمل، `new Date(d); d.setHours(0,0,0,0)`، بيرجّع منتصف ليل
 * **محلي**. ولأن `matchDate` متخزّن منتصف ليل UTC، النافذة كانت بتتزح بمقدار فرق
 * توقيت السيرفر: على GMT+3 "يوم المباراة" كان بيبتدي 21:00Z امبارح ويقفل 21:00Z
 * النهاردة — يعني آخر 3 ساعات من يوم المباراة الحقيقي كانت مرفوضة، وأول 3 ساعات
 * قبله كانت مقبولة.
 */
export const utcDayRange = (date) => {
    const start = startOfTodayUTC(new Date(date));
    return { start: new Date(start), end: new Date(start + DAY_MS) };
};
