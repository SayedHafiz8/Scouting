import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        lowercase: true
    },
    ageGroup: {
        type: mongoose.Schema.ObjectId,
        ref: 'AgeGroup'
    },
    // الدوري: الممتاز أو المحترفين — الفريق بيبقى تابع لدوري واحد بس
    league: {
        type: String,
        enum: ["premier", "professional"],
        required: true,
        default: "premier"
    },
    clubName: {
        type: String,
        required: true
    },
    active: {
        type: Boolean,
        default: true
    }
}, {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// اللاعبين التابعين للفريق (الربط من ناحية Player.team)
teamSchema.virtual('players', {
    ref: 'Player',
    localField: '_id',
    foreignField: 'team'
});

teamSchema.index({name: 1, ageGroup: 1, league: 1}, {
    unique: true,
    partialFilterExpression: {
        active: { $eq: true }
    }
});

// ليستة فرق الفئة العمرية مقسّمة بالدوري (صفحة تفاصيل الفئة العمرية — GET ?ageGroup&league)
// index منفصل عن الـ unique اللي فوق لأن الاستعلام بيفلتر بـ ageGroup+league بس (من غير name)
teamSchema.index({ ageGroup: 1, league: 1 });

teamSchema.pre(/^find/, function() {
    if (this.getOptions().bypassFilter) return;
    this.find({ active: { $ne: false } });
});

// Stage 13 — فرق دوري المحترفين مالهاش فئة عمرية، بنفس نمط Player.isProfessional
// (playedModel.js). الحقل مش required على مستوى الـschema، والإلزام برمجي هنا:
// professional → يتمسح صراحة، غير كده لسه مطلوب صراحة زي ما كان بالظبط.
teamSchema.pre('save', function() {
    if (this.league === 'professional') {
        this.ageGroup = undefined;
        return;
    }
    if (!this.ageGroup) {
        throw new Error("Team must belong to an ageGroup");
    }
});

// PATCH /teams/:id لا يفرض league اليوم — الحقل ده بيتلمس بس لما league فعلاً
// جزء من طلب التعديل (زي pre('save') بالظبط، مطبّق على $set/الجسم الخام).
teamSchema.pre('findOneAndUpdate', function() {
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
        throw new Error("Team must belong to an ageGroup");
    }
});

const Team = mongoose.model('Team', teamSchema);

export default Team;