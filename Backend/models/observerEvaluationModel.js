import mongoose from "mongoose";
import {
    EVALUATION_CRITERIA,
    EVALUATION_CATEGORIES,
    EVALUATION_METRIC_PATHS,
} from "../utils/observerEvaluationCriteria.js";

// ===== بناء شكل الفئات ديناميكيًا من ملف المعايير — إضافة معيار = تعديل الكونفيج بس =====
const ratingType = () => ({ type: Number, min: 1, max: 10, required: true });

const categoryShape = {};
for (const [category, keys] of Object.entries(EVALUATION_CRITERIA)) {
    categoryShape[category] = Object.fromEntries(keys.map((k) => [k, ratingType()]));
}

// ===== snapshot لبيانات الكشاف الموجودة أصلًا — بتتحسب من السيرفر مش بيكتبها الأدمن =====
const statsShape = {
    reportsCount:    { type: Number, default: 0 }, // تقارير كتبها في نفس الشهر
    matchesAttended: { type: Number, default: 0 }, // ماتشات حضرها في نفس الشهر
    mediaCount:      { type: Number, default: 0 }, // ميديا رفعها في نفس الشهر
    playersObserved: { type: Number, default: 0 }, // إجمالي اللاعبين المتابَعين منه (لقطة وقت الحفظ)
    capturedAt:      { type: Date },
};

const observerEvaluationSchema = new mongoose.Schema(
    {
        observer: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
            required: true,
        },
        // الأدمن اللي عمل التقييم — بيتحدد من السيرفر
        //
        // §12 — مش required عمداً: نفس منطق coachEvaluationModel. حذف الأدمن
        // بيصفّر الحقل والتقييم يفضل. الإنشاء لسه بيحطّه سيرفر-سايد.
        evaluator: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
        },
        year: {
            type: Number,
            required: true,
        },
        month: {
            type: Number,
            required: true,
            min: 1,
            max: 12,
        },

        ...categoryShape,

        // بيتحسب تلقائي = متوسط الـ 12 معيار
        overallRating: {
            type: Number,
            min: 1,
            max: 10,
        },

        status: {
            type: String,
            enum: ["draft", "published", "archived"],
            default: "draft",
        },
        publishedAt: {
            type: Date,
            default: null,
        },

        strengths: { type: String },
        areasForImprovement: { type: String },
        notes: { type: String },

        stats: statsShape,
    },
    { timestamps: true }
);

// ===== helpers لحساب المتوسط عبر المسارات "cat.key" =====
const getPath = (obj, path) =>
    path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const averageOverPaths = (source) => {
    const scores = EVALUATION_METRIC_PATHS.map((p) => getPath(source, p));
    const sum = scores.reduce((acc, v) => acc + v, 0);
    return parseFloat((sum / scores.length).toFixed(2));
};

observerEvaluationSchema.pre("save", function () {
    this.overallRating = averageOverPaths(this);
});

// تحديث overallRating لما أي معيار يتغير عن طريق findByIdAndUpdate (nested أو dot-notation)
observerEvaluationSchema.pre("findOneAndUpdate", async function () {
    const update = this.getUpdate();

    const touchesRatings =
        EVALUATION_CATEGORIES.some((c) => update[c]) ||
        Object.keys(update).some((key) =>
            EVALUATION_CATEGORIES.some((c) => key.startsWith(`${c}.`))
        );

    if (!touchesRatings) return;

    const current = await this.model.findOne(this.getQuery()).lean();
    if (!current) return;

    // دمج الـ dot-notation جوه أوبجكت لكل فئة
    const flat = {};
    for (const key in update) {
        if (!key.includes(".")) continue;
        const [parent, child] = key.split(".");
        if (EVALUATION_CATEGORIES.includes(parent)) {
            flat[parent] = { ...(flat[parent] || {}), [child]: update[key] };
        }
    }

    const merged = {};
    for (const c of EVALUATION_CATEGORIES) {
        merged[c] = { ...current[c], ...update[c], ...flat[c] };
    }

    update.overallRating = averageOverPaths(merged);
});

// كل أدمن له تقييم مستقل لنفس الكشاف في نفس الشهر (uniqueness per evaluator)
//
// §12 — partial على evaluator: نفس منطق coachEvaluationModel بالظبط. حذف أدمنين
// قيّموا نفس الأوبزيرفر في نفس الشهر كان هيولّد دوكيومنتين متطابقين بـ
// evaluator: null ويوقف الحذف. الفرادة بتفضل على التقييمات اللي ليها مُقيّم.
observerEvaluationSchema.index(
    { observer: 1, evaluator: 1, year: 1, month: 1 },
    { unique: true, partialFilterExpression: { evaluator: { $type: "objectId" } } }
);
// list الكشاف لتقييماته المنشورة مرتبة بالأحدث
observerEvaluationSchema.index({ observer: 1, status: 1, year: -1, month: -1 });
// list الأدمن لتقييماته هو
observerEvaluationSchema.index({ evaluator: 1, year: -1, month: -1 });

const ObserverEvaluation = mongoose.model("ObserverEvaluation", observerEvaluationSchema);

export default ObserverEvaluation;
