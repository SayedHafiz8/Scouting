// ═══════════════════════════════════════════════════════════════════════════
//  بنود تقييم تقرير الكشاف — مصدر الحقيقة الوحيد
// ═══════════════════════════════════════════════════════════════════════════
//
// طلب مالك 2026-11-18 — استبدال كامل تالت لمجموعة البنود. المجموعات القديمة
// (technical/physical/mental) اتشالت بالكامل
// وأسماء المجموعات الجديدة كلها مختلفة عنها عن قصد: كده مفيش مستند قديم بيتقرأ
// نُصّه بالشكل الجديد ونُصّه بالقديم — المستند القديم بيطلع بكل المجموعات
// الجديدة فاضية، وهو السلوك المفهوم.
//
// ⚠️ ولا توافق رجعي ولا migration — نفس قرار المالك المتكرر ("امسح إلي مش
// محتاجينه وخلي الموجود عادي"). التقارير القديمة بتفضل في الداتابيز بحقولها
// وبـoverallRating على سلّم العشرة، بس مابتتعرضش: Mongoose strict mode بيتجاهل
// المسارات اللي مش معرّفة في المخطط وقت القراءة.
//
// ⚠️ الملف ده المصدر الوحيد. الموديل والفاليديشن وتجميعة الإحصائيات والـswagger
// كلهم بيشتقوا منه، فإضافة بند واحدة بتتعمل هنا بس. لو ضفت بند، شوف كمان:
//   • frontend/src/app/features/scouting-reports/report-metrics.ts (نفس الشكل)
//   • الترجمة: src/assets/i18n/{en,ar}.json تحت REPORTS.GROUPS و REPORTS.METRICS
//
// التسمية بالعربي (اللي العميل بيعرضها) جوه ملف الترجمة، مش هنا — ده المفتاح.

// طلب مالك 2026-11-25 — السلّم رجع 1→10 بعد أسبوع من التحويل لـ1→5. التقارير
// اللي اتكتبت في الفترة دي قيمها 1→5 صالحة في السلّم الجديد (مجاله أوسع)، بس
// متوسطها بيبان أقل من اللي بعده — بلا migration، نفس القرار المتكرر.
export const RATING_MIN = 1;
export const RATING_MAX = 10;

// المجموعة → بنودها، بالترتيب اللي بيتعرض بيه في الفورم والتفاصيل بالظبط.
//
// أول 4 مجموعات بنود عامة؛ والـ6 اللي بعدهم تحت عنوان واحد في الواجهة
// ("القدرات الخاصة والسمات السلوكية") — العنوان ده عنوان عرض بس، مش مستوى
// بيانات، عشان الإحصائيات تفضل مسطّحة بمستوى واحد.
export const REPORT_METRIC_GROUPS = {
    // اتخاذ القرار
    decisionMaking: ["positioningAndPossession", "interceptingWithoutTackling"],
    // الدافعية الذاتية
    selfMotivation: ["consistency", "winningBallBack", "coachability"],
    // المهارات الفنية — التلات بنود الأخيرة اتضافوا 2026-11-25
    technicalSkills: [
        "firstTouch", "twoFooted", "shieldingUnderPressure", "beatingOpponent",
        "longPassing", "shortPassing", "heading",
    ],
    // القدرات البدنية
    physicalAbilities: ["pace", "agility", "dynamism", "bodyUseInDuels"],
    // الشخصية
    personality: ["leadership", "motivatingTeammates", "teamwork"],
    // القدرات الخاصة – الدفاع
    specialDefending: ["blockingShots", "strongInDuels", "preventingPenetration"],
    // القدرات الخاصة – الهجوم
    specialAttacking: ["buildUpPlay", "creatingGoals", "scoringGoals"],
    // أخلاقيات العمل
    workEthic: ["maximumEffort", "continuousImprovement", "purposeAndDedication"],
    // التوجيه داخل الملعب
    onFieldLeadership: ["inspiringLeader", "teamSpirit"],
    // عقلية الفوز
    winningMentality: ["fullCommitment"],
};

export const REPORT_GROUP_KEYS = Object.keys(REPORT_METRIC_GROUPS);

// [[group, field], ...] — للتجميعات اللي محتاجة الاتنين (مسار $avg مثلاً)
export const REPORT_METRIC_PAIRS = Object.entries(REPORT_METRIC_GROUPS).flatMap(
    ([group, fields]) => fields.map((field) => [group, field])
);

// ["decisionMaking.positioningAndPossession", ...] — لسلاسل express-validator
export const REPORT_METRIC_PATHS = REPORT_METRIC_PAIRS.map(([g, f]) => `${g}.${f}`);

// أسماء البنود مسطّحة بلا مجموعة — مخرج /statistics مسطّح (موثّق كده في
// ReportStatistics)، فأي تكرار في اسم بند بين مجموعتين كان بيخلي متوسط يكتب
// فوق التاني بالصمت. الحارس ده بيفضح الغلط وقت الإقلاع بدل ما يسيبه يتسرّب
// لأرقام غلط في الواجهة.
export const REPORT_METRIC_FIELDS = REPORT_METRIC_PAIRS.map(([, f]) => f);

const duplicates = REPORT_METRIC_FIELDS.filter((f, i) => REPORT_METRIC_FIELDS.indexOf(f) !== i);
if (duplicates.length) {
    throw new Error(
        `reportMetrics: duplicate metric field name(s) across groups: ${[...new Set(duplicates)].join(", ")}. ` +
        `Flat /statistics output requires every field name to be unique.`
    );
}
