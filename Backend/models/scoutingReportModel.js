import mongoose from "mongoose";

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

        // نوع التقرير: مباراة رسمية (مرتبطة بجدول الموسم)، مباراة ودية، أو تدريب —
        // التدريب مفيهوش فرق خالص، والودية بيتكتب/يتحدد فيها اسم الفريق التاني بس (فريق
        // اللاعب نفسه بيتحط تلقائي لو متسجل)
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

        // ===== Technical Skills =====
        technical: {
            passing: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            dribbling: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            shooting: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            ballControl: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
        },

        // ===== Physical Skills =====
        physical: {
            speed: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            stamina: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            strength: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            agility: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
        },

        // ===== Mental Skills =====
        mental: {
            positioning: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            decisionMaking: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            teamwork: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
            attitude: {
                type: Number,
                min: 1,
                max: 10,
                required: true,
            },
        },

        // ===== Overall Rating (يتحسب تلقائي) =====
        overallRating: {
            type: Number,
            min: 1,
            max: 10,
        },

        notes: {
            type: String,
        },
    },
    { timestamps: true }
);

// ===== حساب Overall Rating تلقائي قبل الحفظ =====
function calcOverallRating(doc) {
    const allScores = [
        doc.technical.passing,
        doc.technical.dribbling,
        doc.technical.shooting,
        doc.technical.ballControl,
        doc.physical.speed,
        doc.physical.stamina,
        doc.physical.strength,
        doc.physical.agility,
        doc.mental.positioning,
        doc.mental.decisionMaking,
        doc.mental.teamwork,
        doc.mental.attitude,
    ];

    const sum = allScores.reduce((acc, val) => acc + val, 0);
    return parseFloat((sum / allScores.length).toFixed(2));
}

scoutingReportSchema.pre("save", function () {
    this.overallRating = calcOverallRating(this);
    
});

scoutingReportSchema.pre("findOneAndUpdate", async function () {
    const update = this.getUpdate();

    const hasNestedUpdate =
        update.technical || update.physical || update.mental ||
        Object.keys(update).some(key =>
            key.startsWith("technical.") ||
            key.startsWith("physical.") ||
            key.startsWith("mental.")
        );

    if (!hasNestedUpdate) return;

    const current = await this.model.findOne(this.getQuery()).lean();
    if (!current) return;

    // لازم تدمج الـ dot notation كمان مش بس nested objects
    const flatUpdate = {};
    for (const key in update) {
        if (key.includes(".")) {
            const [parent, child] = key.split(".");
            flatUpdate[parent] = { ...(flatUpdate[parent] || {}), [child]: update[key] };
        }
    }

    const merged = {
        technical: { ...current.technical, ...update.technical, ...flatUpdate.technical },
        physical:  { ...current.physical,  ...update.physical,  ...flatUpdate.physical  },
        mental:    { ...current.mental,     ...update.mental,    ...flatUpdate.mental    },
    };

    const allScores = [
        merged.technical.passing, merged.technical.dribbling,
        merged.technical.shooting, merged.technical.ballControl,
        merged.physical.speed, merged.physical.stamina,
        merged.physical.strength, merged.physical.agility,
        merged.mental.positioning, merged.mental.decisionMaking,
        merged.mental.teamwork, merged.mental.attitude,
    ];

    update.overallRating = parseFloat(
        (allScores.reduce((a, v) => a + v, 0) / allScores.length).toFixed(2)
    );
});

// §12 — الفرادة بتتطبّق على التقارير اللي ليها كاتب بس.
//
// السبب: لما يتمسح يوزر نهائياً بنصفّر coach → null بدل ما نمسح تقاريره (التاريخ
// الكشفي بيفضل). لو الـindex فضل unique عادي، لاعب عنده تقريرين من كاتبين
// مختلفين في نفس تاريخ المباراة والاتنين اتمسحوا → دوكيومنتين متطابقين بـ
// {player, coach: null, matchDate} → duplicate key error بيوقف الحذف نفسه.
//
// $type: "objectId" بيستثني الـnull والحقل الغايب من الـindex، فالتقارير اليتيمة
// مابتتصادمش، والقاعدة الأصلية (كاتب واحد = تقرير واحد للاعب في اليوم) بتفضل
// مطبّقة بالكامل على كل تقرير ليه كاتب فعلاً.
scoutingReportSchema.index(
    { player: 1, coach: 1, matchDate: 1 },
    { unique: true, partialFilterExpression: { coach: { $type: "objectId" } } }
);
scoutingReportSchema.index({ player: 1, createdAt: -1 });
scoutingReportSchema.index({ coach: 1, createdAt: -1 });
// list سكوب على اللاعب مرتب بتاريخ الماتش (report-list default sort: -matchDate)
scoutingReportSchema.index({ player: 1, matchDate: -1 });
// الربط العكسي SeasonMatch.reports (foreignField: seasonMatch) — بس للتقارير المربوطة فعلاً بماتش
scoutingReportSchema.index({ seasonMatch: 1 }, { sparse: true });
// §11 — الـtext index على notes اتشال: ApiFeature عمره ما استخدم $text (كان
// بيبني $regex)، والبحث في التقارير اتشال أصلاً لعدم وجود مستهلك. text index
// بيفهرس كل كلمة في كل مستند فتكلفة كتابته أعلى من index عادي — وكانت بعائد صفر.

// ===== Populate Player و Coach تلقائي =====


const ScoutingReport = mongoose.model("ScoutingReport", scoutingReportSchema);

export default ScoutingReport;