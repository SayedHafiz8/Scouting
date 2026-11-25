import mongoose from "mongoose";

import {
    REPORT_METRIC_GROUPS,
    REPORT_GROUP_KEYS,
    REPORT_METRIC_PAIRS,
    RATING_MIN,
    RATING_MAX,
} from "../constants/reportMetrics.js";

// بند تقييم واحد — نفس التعريف بالظبط لكل الـ31 بند، فمكتوب مرة واحدة.
// البلوكات المكررة اللي كانت هنا قبل كده بقت 10 سطور بأسماء المجموعات صريحة
// تحت، وده اللي محتاجين نلاقيه بالـgrep — مش تكرار { type: Number, min, max }.
const ratingGroup = (fields) =>
    Object.fromEntries(
        fields.map((field) => [
            field,
            { type: Number, min: RATING_MIN, max: RATING_MAX, required: true },
        ])
    );

const scoutingReportSchema = new mongoose.Schema(
    {
        player: {
            type: mongoose.Schema.ObjectId,
            ref: "Player",
            required: true,
        },
        // كاتب التقرير — كوتش أو أوبزيرفر (الراوت مفتوح للاتنين والكونترولر
        // بيحط req.user._id).
        //
        // §12 — مش required عمداً، بنفس منطق Player.coach في §9: لما يتمسح
        // الكاتب نهائياً بنصفّر الحقل ده والتقرير يفضل، لأن التقرير حقيقة
        // تاريخية عن اللاعب مش ملكية للكاتب. الإنشاء لسه بيحطّه دايماً
        // سيرفر-سايد فمفيش تقرير بيتولد بلا كاتب.
        coach: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
        },
        matchDate: {
            type: Date,
            required: true,
        },

        // ⚠️ طلب مالك 2026-09 — "friendly" و"training" اتلغوا من الواجهة والتحقق:
        // كل تقرير جديد بقى "official". القيمتين القدام باقيين في الـenum عشان
        // التقارير القديمة المخزّنة بيهم تفضل صالحة للقراءة والتعديل، مش عشان
        // يتبعتوا من العميل — createValidate بيرفض أي قيمة غير "official".
        matchType: {
            type: String,
            enum: ["official", "friendly", "training"],
            default: "official",
        },

        // ===== Match teams (الفريقين اللي بيلعبوا في الماتش) =====
        // لو الفريق متسجل في النظام بيتحط كـ ref، ولو مش متسجل (أو مباراة ودية/تدريب) بيتحط
        // اسمه كنص حر في homeTeamName/awayTeamName بدال. واحد بس من الاتنين بيتحط لكل جانب.
        homeTeam: {
            type: mongoose.Schema.ObjectId,
            ref: "Team",
            default: null,
        },
        homeTeamName: {
            type: String,
            trim: true,
            default: null,
        },
        awayTeam: {
            type: mongoose.Schema.ObjectId,
            ref: "Team",
            default: null,
        },
        awayTeamName: {
            type: String,
            trim: true,
            default: null,
        },

        // ربط اختياري بمباراة الموسم — التقرير ممكن يتربط بماتش مجدول
        seasonMatch: {
            type: mongoose.Schema.ObjectId,
            ref: "SeasonMatch",
            default: null,
        },

        // الفئة العمرية اللي اللاعب لعب معاها المباراة دي — لاعب مواليد 2011 ممكن
        // يلعب مع فئة 2010. بتتحدد بس لما مايكونش فيه مباراة من الجدول (seasonMatch
        // = null)؛ لو التقرير مربوط بمباراة، فئتها هي المصدر مش الحقل ده.
        playedWithAgeGroup: {
            type: mongoose.Schema.ObjectId,
            ref: "AgeGroup",
            default: null,
        },

        // ═══ بنود التقييم — 10 مجموعات / 31 بند، كل بند من 1 لـ 10 ═══
        //
        // طلب مالك 2026-11-18 — استبدال كامل للمجموعات القديمة (technical /
        // physical / mental). و2026-11-25 — تلات بنود اتضافوا للمهارات الفنية
        // والسلّم رجع 1→10. البنود والأسماء في constants/reportMetrics.js، وهو
        // المصدر الوحيد اللي الفاليديشن والإحصائيات والـswagger بيشتقوا منه كمان.
        //
        // ⚠️ بلا migration بقرار المالك: التقارير القديمة بتفضل في الداتابيز
        // بحقولها القديمة وبـoverallRating على سلّم العشرة، وبتتقرأ بمجموعات
        // جديدة فاضية (Mongoose strict mode بيتجاهل المسارات غير المعرّفة).
        decisionMaking: ratingGroup(REPORT_METRIC_GROUPS.decisionMaking),
        selfMotivation: ratingGroup(REPORT_METRIC_GROUPS.selfMotivation),
        technicalSkills: ratingGroup(REPORT_METRIC_GROUPS.technicalSkills),
        physicalAbilities: ratingGroup(REPORT_METRIC_GROUPS.physicalAbilities),
        personality: ratingGroup(REPORT_METRIC_GROUPS.personality),
        specialDefending: ratingGroup(REPORT_METRIC_GROUPS.specialDefending),
        specialAttacking: ratingGroup(REPORT_METRIC_GROUPS.specialAttacking),
        workEthic: ratingGroup(REPORT_METRIC_GROUPS.workEthic),
        onFieldLeadership: ratingGroup(REPORT_METRIC_GROUPS.onFieldLeadership),
        winningMentality: ratingGroup(REPORT_METRIC_GROUPS.winningMentality),

        // ===== Overall Rating (يتحسب تلقائي) =====
        // الحد الأقصى 10 (كان 5 لمدة أسبوع بين 2026-11-18 و2026-11-25). القيم
        // المخزّنة من الأسبوع ده صالحة — المجال الجديد أوسع، فمفيش تقرير بيترفض.
        overallRating: {
            type: Number,
            min: RATING_MIN,
            max: RATING_MAX,
        },

        notes: {
            type: String,
        },
    },
    { timestamps: true }
);

// ===== حساب Overall Rating تلقائي قبل الحفظ =====
//
// بياخد أوبجكت فيه الـ10 مجموعات (مستند أو نتيجة دمج) وبيرجّع متوسط الـ31 بند
// الموجودة فعلاً. بيتجاهل أي بند مش رقم صالح بدل ما يجمعه ويطلّع NaN — ده مهم
// دلوقتي بالتحديد: التقارير القديمة مالهاش المجموعات الجديدة خالص (بلا
// migration)، فتعديل واحد منها كان هيكتب overallRating = NaN ويخرب المستند.
// بيرجّع null لو مفيش ولا بند، والمنادي بيسيب القيمة القديمة زي ما هي.
function calcOverallRating(source) {
    const scores = REPORT_METRIC_PAIRS
        .map(([group, field]) => source?.[group]?.[field])
        .filter((v) => typeof v === "number" && Number.isFinite(v));

    if (!scores.length) return null;

    const sum = scores.reduce((acc, val) => acc + val, 0);
    return parseFloat((sum / scores.length).toFixed(2));
}

scoutingReportSchema.pre("save", function () {
    const rating = calcOverallRating(this);
    if (rating !== null) this.overallRating = rating;
});

scoutingReportSchema.pre("findOneAndUpdate", async function () {
    const update = this.getUpdate();

    // أي مجموعة من الـ10 اتبعتت ككائن، أو أي بند منها بـdot notation
    const hasNestedUpdate = REPORT_GROUP_KEYS.some(
        (group) => update[group] || Object.keys(update).some((key) => key.startsWith(`${group}.`))
    );

    if (!hasNestedUpdate) return;

    // .select: الهوك بيحسب متوسط البنود بس — مش محتاج المستند كامل (notes وباقي
    // الحقول) عشان كده.
    const current = await this.model.findOne(this.getQuery())
        .select(REPORT_GROUP_KEYS.join(" "))
        .lean();
    if (!current) return;

    // لازم تدمج الـ dot notation كمان مش بس nested objects
    const flatUpdate = {};
    for (const key in update) {
        if (key.includes(".")) {
            const [parent, child] = key.split(".");
            flatUpdate[parent] = { ...(flatUpdate[parent] || {}), [child]: update[key] };
        }
    }

    const merged = Object.fromEntries(
        REPORT_GROUP_KEYS.map((group) => [
            group,
            { ...current[group], ...update[group], ...flatUpdate[group] },
        ])
    );

    const rating = calcOverallRating(merged);
    if (rating !== null) update.overallRating = rating;
});

// audit-database D1 — الفرادة على **المباراة نفسها**، مش على اليوم.
//
// ═══ اللي كان قبل كده وليه اتغيّر ═══
// المفتاح كان { player, coach, matchDate } والقاعدة المعلنة "كاتب واحد = تقرير
// واحد للاعب في اليوم". القاعدة دي كانت بتتحقق للتقرير الرسمي المربوط بمباراة
// **بالصدفة** بس: resolveSeasonMatchToBody بيكتب matchDate = match.matchDate،
// والقيمة دي UTC-midnight (جاية من <input type="date">)، فكل تقارير نفس المباراة
// بتشترك في نفس القيمة بالظبط.
//
// أما الودّي والتدريب (والرسمي على لاعب بلا فريق مسجّل)، setPlayerToBody بيحط
// matchDate = new Date() — بساعة ودقيقة وثانية وميلي ثانية. فتقريرين بينهم ميلي
// ثانية واحدة مفتاحهم مختلف، والـindex مابيلمسهمش. مُثبَت بالتنفيذ: تقريرين ودّي
// بينهم 1ms على نفس اللاعب من نفس الكاتب → **الاتنين اتخزنوا**. (نفس التقريرين في
// نفس اللحظة بالظبط اتمنعوا بـE11000 — فالـindex كان سليم، المشكلة في القيمة.)
//
// ═══ القاعدة الجديدة (قرار مالك، خيار A) ═══
// الفرادة بقت على مرجع المباراة نفسه: **تقرير واحد لكل (لاعب، كاتب، مباراة)**.
// ده أدق من "في اليوم" في الاتجاهين:
//   • بيمنع التقرير المكرر على نفس المباراة مهما كانت قيمة matchDate.
//   • وبيسمح بتقريرين على **مباراتين مختلفتين في نفس اليوم** (بطولة بيومين
//     ماتشات) — اللي القاعدة القديمة كانت بتمنعه بالغلط.
//
// ═══ اللي **مش** متغطّى، بقرار صريح ═══
// التقارير اللي مالهاش seasonMatch — الودّي، التدريب، والرسمي على لاعب بلا فريق
// مسجّل (resolveMatchTypeFields بيرجع بدري في الحالة دي) — **بلا أي قيد فرادة**.
// السبب مش إهمال: السيرفر مالوش أي مفهوم لهوية المباراة في الحالات دي، وأي مفتاح
// نختاره (تاريخ، أو تاريخ + اسم خصم نص حر) بيبقى جاي من العميل وقابل للتغيير
// عشان يتخطّى القيد. القرار إن الحالات دي تفضل مفتوحة بوضوح بدل قيد بيوهم
// بالحماية. الأثر المعروف والمقبول: عدّاد reportsCount في لقطة التقييم الشهري
// (coachEvaluationController.js:81) قابل للتضخيم من المسارات دي.
//
// ═══ ليه partial على الحقلين ═══
// coach — §12: لما يتمسح يوزر نهائياً بنصفّر coach → null بدل ما نمسح تقاريره.
//   من غير الاستثناء، تقريرين من كاتبين مختلفين على نفس المباراة والاتنين
//   اتمسحوا → مستندين متطابقين بـ{player, coach: null, seasonMatch} → duplicate
//   key error بيوقف الحذف نفسه.
// seasonMatch — القيمة الافتراضية null (كل الودّي والتدريب)، ولو مااستثنيناهاش
//   كان تقرير ودّي تاني على نفس اللاعب هيتمنع بمفتاح {player, coach, null} —
//   وده بالظبط القيد اللي القرار فوق بيقول ماينفعش يتطبّق من غير هوية مباراة.
scoutingReportSchema.index(
    { player: 1, coach: 1, seasonMatch: 1 },
    {
        unique: true,
        partialFilterExpression: {
            coach: { $type: "objectId" },
            seasonMatch: { $type: "objectId" },
        },
    }
);
scoutingReportSchema.index({ player: 1, createdAt: -1 });
scoutingReportSchema.index({ coach: 1, createdAt: -1 });
// list سكوب على اللاعب مرتب بتاريخ الماتش (report-list default sort: -matchDate)
scoutingReportSchema.index({ player: 1, matchDate: -1, _id: -1 });  // _id فاصل تعادل لترتيب matchDate (قايمة تقارير اللاعب)
// الربط العكسي SeasonMatch.reports (foreignField: seasonMatch) — بس للتقارير المربوطة فعلاً بماتش
scoutingReportSchema.index({ seasonMatch: 1 }, { sparse: true });
// §11 — الـtext index على notes اتشال: ApiFeature عمره ما استخدم $text (كان
// بيبني $regex)، والبحث في التقارير اتشال أصلاً لعدم وجود مستهلك. text index
// بيفهرس كل كلمة في كل مستند فتكلفة كتابته أعلى من index عادي — وكانت بعائد صفر.

// ===== Populate Player و Coach تلقائي =====


const ScoutingReport = mongoose.model("ScoutingReport", scoutingReportSchema);

export default ScoutingReport;