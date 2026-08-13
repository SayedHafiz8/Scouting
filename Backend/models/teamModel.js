import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        lowercase: true
    },
    ageGroup: {
        type: mongoose.Schema.ObjectId,
        ref: 'AgeGroup',
        required: true
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

const Team = mongoose.model('Team', teamSchema);

export default Team;