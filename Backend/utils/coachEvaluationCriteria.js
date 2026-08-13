// ============================================================================
// المصدر الوحيد لمعايير تقييم الكشاف (Coach) — أي إضافة/تعديل لمعيار بيتم من هنا بس
// الموديل والفاليديشن والإحصائيات كلهم بيشتقوا منه. الكشاف هنا دوره اكتشاف ومتابعة
// اللاعبين (مش تدريب)، فالفئات مركّزة على جودة الكشف، توثيق الفيديو، إدارة قائمة
// لاعبيه، والانضباط المهني — من غير أي فئة متعلقة بالتدريب.
// كل معيار من 1 لـ 10، والـ overallRating = متوسطهم.
// ============================================================================

export const EVALUATION_CRITERIA = {
    scouting:          ["talentIdentification", "matchAnalysis", "reportAccuracy"],
    videoWork:         ["videoRecordingQuality", "videoUploadTimeliness", "videoCoverage"],
    rosterManagement:  ["playerProfileQuality", "squadOrganization"],
    professionalism:   ["punctuality", "commitment", "matchAttendance"],
};

// ["scouting.talentIdentification", ...] — يستخدمه حساب المتوسط والفاليديشن
export const EVALUATION_METRIC_PATHS = Object.entries(EVALUATION_CRITERIA)
    .flatMap(([category, keys]) => keys.map((key) => `${category}.${key}`));

// الفئات كأسماء بس — للاستخدام في hooks التحديث و aggregation
export const EVALUATION_CATEGORIES = Object.keys(EVALUATION_CRITERIA);
