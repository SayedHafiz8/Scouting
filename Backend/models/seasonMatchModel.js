import mongoose from "mongoose";

const seasonMatchSchema = new mongoose.Schema({
    ageGroup: {
        type: mongoose.Schema.ObjectId,
        ref: "AgeGroup"
    },
    // الموسم بصيغة "2025/2026" — index عشان الفلترة والتجميع بالموسم
    season: {
        type: String,
        required: true,
        trim: true
    },
    // الدوري: الممتاز أو المحترفين — لكل فئة عمرية جدولين منفصلين
    league: {
        type: String,
        enum: ["premier", "professional"],
        required: true,
        default: "premier"
    },
    matchDate: {
        type: Date,
        required: true
    },
    homeTeam: {
        type: mongoose.Schema.ObjectId,
        ref: "Team",
        required: true
    },
    awayTeam: {
        type: mongoose.Schema.ObjectId,
        ref: "Team",
        required: true
    },
    venue: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ["scheduled", "completed", "cancelled", "postponed"],
        default: "scheduled"
    },
    result: {
        homeScore: { type: Number, min: 0 },
        awayScore: { type: Number, min: 0 }
    },
    // الكشافين (كوتشات/أوبزيرفرز) المتعينين لحضور المباراة — اختياري وممكن يتعدل بعدين
    attendees: {
        type: [{ type: mongoose.Schema.ObjectId, ref: "User" }],
        default: []
    },
    // audit — بيتحطوا من السيرفر مش من العميل
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: "User",
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.ObjectId,
        ref: "User"
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// جدول الفئة/الموسم/الدوري مرتب بالتاريخ (صفحة تفاصيل الفئة العمرية — GET ?ageGroup&season&league)
seasonMatchSchema.index({ ageGroup: 1, season: 1, league: 1, matchDate: 1 });
// الجدول الكامل لكل الكشافين مقسّم بالدوري (صفحة "ماتشاتي" — GET ?league&season، من غير ageGroup)
seasonMatchSchema.index({ league: 1, season: 1, matchDate: 1 });
seasonMatchSchema.index({ season: 1, status: 1 });
// عدّاد "عدد المباريات الحاضرها" فى الداشبورد وإحصائيات التقييمات الشهرية (attendees: multikey + مدى تاريخ)
seasonMatchSchema.index({ attendees: 1, matchDate: 1 });
// عداد "كل المباريات الى اتلعبت" فى داشبورد الأدمن (بدون أي فلتر تاني غير matchDate)
seasonMatchSchema.index({ matchDate: 1 });
// بوابة رفع الفيديو (mediaMatchGate) — لاقي مباراة الفريق ده (home أو away) في نافذة 3 أيام
seasonMatchSchema.index({ homeTeam: 1, matchDate: -1 });
seasonMatchSchema.index({ awayTeam: 1, matchDate: -1 });

// الربط العكسي: التقارير المكتوبة على المباراة دي (بيتعملها populate في صفحة التفاصيل بس)
seasonMatchSchema.virtual("reports", {
    ref: "ScoutingReport",
    localField: "_id",
    foreignField: "seasonMatch"
});

// الربط العكسي: الصور/الفيديوهات المرفوعة وهي مربوطة بالمباراة دي (بيتعملها populate في صفحة التفاصيل بس)
seasonMatchSchema.virtual("media", {
    ref: "PlayerMedia",
    localField: "_id",
    foreignField: "seasonMatch"
});

// setOptions({ skipPopulate: true }) بيتستخدم لما نحتاج نجيب المستند بالـ raw ObjectIds
// (من غير populate) — مثلاً وقت المقارنات الداخلية فى الفاليديشن/الـ ownership checks
seasonMatchSchema.pre(/^find/, function () {
    if (this.getOptions().skipPopulate) return;
    this.populate({ path: "ageGroup", select: "name birthYear" })
        .populate({ path: "homeTeam", select: "name clubName" })
        .populate({ path: "awayTeam", select: "name clubName" })
        .populate({ path: "attendees", select: "name email role" });
});

// Stage 13 (constitution v1.2.0) — مباراة دوري المحترفين مالهاش فئة عمرية، بنفس
// نمط Team.ageGroup و Player.isProfessional بالضبط: مش required على مستوى الـschema،
// والإلزام برمجي هنا. professional → يتمسح صراحة، غير كده لسه مطلوب صراحة زي ما كان.
seasonMatchSchema.pre('save', function() {
    if (this.league === 'professional') {
        this.ageGroup = undefined;
        return;
    }
    if (!this.ageGroup) {
        throw new Error("SeasonMatch must belong to an ageGroup");
    }
});

seasonMatchSchema.pre('findOneAndUpdate', function() {
    const update = this.getUpdate() || {};
    const league = update.league ?? update.$set?.league;
    if (league === undefined) return;
    if (league === 'professional') {
        update.$unset = { ...(update.$unset), ageGroup: "" };
        if (update.$set) delete update.$set.ageGroup;
        delete update.ageGroup;
        this.setUpdate(update);
        return;
    }
    const ageGroup = update.ageGroup ?? update.$set?.ageGroup;
    if (!ageGroup) {
        throw new Error("SeasonMatch must belong to an ageGroup");
    }
});

const SeasonMatch = mongoose.model("SeasonMatch", seasonMatchSchema);

export default SeasonMatch;
