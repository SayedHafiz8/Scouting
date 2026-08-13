// ============================================================================
// المصدر الوحيد لمعايير تقييم الكشاف/المراقب (Observer) — أي إضافة/تعديل لمعيار بيتم من هنا بس
// الموديل والفاليديشن والإحصائيات كلهم بيشتقوا منه، فالتوسّع بيبقى تعديل ملف واحد.
// كل معيار من 1 لـ 10، والـ overallRating = متوسطهم. الفئات دي مصممة خصيصى لدور الكشف/المراقبة
// (مش تدريب) وفيها فئة مخصصة لتصوير ورفع الفيديو، من غير أي تكرار بين المعايير.
// ============================================================================

export const EVALUATION_CRITERIA = {
    scouting:        ["talentIdentification", "matchAnalysis", "reportAccuracy"],
    videoWork:       ["videoRecordingQuality", "videoUploadTimeliness", "videoCoverage"],
    professionalism: ["punctuality", "commitment", "attitude"],
    collaboration:   ["communication", "reportTimeliness"],
};

// ["scouting.talentIdentification", ...] — يستخدمه حساب المتوسط والفاليديشن
export const EVALUATION_METRIC_PATHS = Object.entries(EVALUATION_CRITERIA)
    .flatMap(([category, keys]) => keys.map((key) => `${category}.${key}`));

// الفئات كأسماء بس — للاستخدام في hooks التحديث و aggregation
export const EVALUATION_CATEGORIES = Object.keys(EVALUATION_CRITERIA);
