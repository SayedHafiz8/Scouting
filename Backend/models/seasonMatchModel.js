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

// ⚠️ season اتشال من نص الاندكسين دول وراح للـpost-filter، و_id اتضاف كفاصل.
//
// السبب: season كان بين حقول المساواة وحقل الترتيب (matchDate)، فكان بيكسر
// تتابع الـmatchDate — أي استعلام بيفلتر ageGroup+league ويرتّب بالتاريخ كان
// بيقع على SORT حاجزة. والاستعلامات الحقيقية مابتبعتش season غالبًا أصلاً:
//   • my-matches: {ageGroup, league, matchDate[gte]} — بلا season
//   • age-group-detail: {ageGroup, league} + season **اختياري** — لما يتبعت
//     بيـpost-filter على مجموعة صغيرة (فئة واحدة + دوري)، وده رخيص.
// الترتيب الجديد: المساواة ثم matchDate متتابع ثم _id فاصل التعادل.
seasonMatchSchema.index({ ageGroup: 1, league: 1, matchDate: 1, _id: 1 });
// صفحة "ماتشاتي" ودوري المحترفين — GET ?league مع ترتيب/مدى matchDate (بلا season)
seasonMatchSchema.index({ league: 1, matchDate: 1, _id: 1 });
seasonMatchSchema.index({ season: 1, status: 1 });
// عدّاد "عدد المباريات الحاضرها" فى الداشبورد وإحصائيات التقييمات الشهرية (attendees: multikey + مدى تاريخ)
seasonMatchSchema.index({ attendees: 1, matchDate: 1 });
// عداد "كل المباريات الى اتلعبت" فى داشبورد الأدمن (بدون أي فلتر تاني غير matchDate)
//
// `_id` هنا مش تزويدة: ApiFeature.sort() بتضيف فاصل تعادل لكل ترتيب، فالترتيب
// الفعلي للقايمة الافتراضية بقى { matchDate: 1, _id: 1 }. من غير `_id` في الفهرس
// الـplanner مايقدرش يخدم الترتيب المركّب ده، وبيقع على SORT <- COLLSCAN على
// المسار غير المفلتر (مقيس بـ.explain قبل الإضافة).
//
// و`{ matchDate: 1 }` المنفرد اتشال مش اتساب جنبه: هو بادئة زايدة من الفهرس ده،
// يعني تكلفة كتابة على كل insert/update مقابل صفر قراءة.
seasonMatchSchema.index({ matchDate: 1, _id: 1 });
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

// ⚠️ الـpopulate التلقائي (pre(/^find/)) اتشال — الافتراضي كان مقلوب.
//
// قبل كده كل عملية تطابق /^find/ كانت بتعمل populate لأربع مسارات، و20+ موضع
// (الفاليديشن، الـownership، الكنترولرز، السكوينس) كان **مضطر** يكتب
// setOptions({ skipPopulate: true }) عشان يتهرب منه — الحالة الشاذة بقت القاعدة.
// والأسوأ: findOneAndUpdate بيطابق /^find/ كمان، فكل كتابة حالة/حضور كانت بتدفع
// تمن أربع عمليات ربط للقراءة على الفاضي. وصفحة تفاصيل المباراة الواحدة كانت
// ~13 استعلام (4 من الهوك + 4 صريحة + 4 متداخلة + البحث).
//
// دلوقتي الـpopulate صريح في المسارين اللي بيحتاجوه بس (getAll, getSpecific)
// عن طريق الدالة دي. أي مسار تاني بياخد raw ObjectIds تلقائيًا — وهو اللي كان
// عايزه أصلاً.
export const populateMatchDisplay = (query) =>
    query
        .populate({ path: "ageGroup", select: "name birthYear" })
        .populate({ path: "homeTeam", select: "name clubName" })
        .populate({ path: "awayTeam", select: "name clubName" })
        .populate({ path: "attendees", select: "name email role" });

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
