import mongoose from "mongoose";
import AgeGroup from "./ageGroupModel.js";
import AppError from "../utils/appError.js";
import { resolveImageUrl } from "../utils/mediaUrl.js";

const playerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    city: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true
    },
    dateOfBirth: {
        type: Date,
        required: true
    },
    position:{
        type:String,
        enum:[
        "GK",
        "CB",
        "LB",
        "RB",
        "CM",
        "DM",
        "AM",
        "LW",
        "RW",
        "ST"
        ]
    },
    ageGroup: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AgeGroup"
        
    },
    team: {
        type: mongoose.Schema.ObjectId,
        ref: 'Team',
        default: null
    },
    // اسم فريق حر لما الفريق مش موجود في قايمة الفرق المسجلة — مش مرتبط بأي Team حقيقي،
    // ومتبادل الاستبعاد مع team (واحد بس يتحط في نفس الوقت، اتفرضت في الـ validation)
    teamName: {
        type: String,
        trim: true,
        maxlength: 100,
        default: null
    },
    height: {
        type: Number,
    },
    weight: {
        type: Number,
    },
    preferredFoot:{
        type:String,
        enum:["right","left","both"]
    },
    nationality: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: true
    },
    status:{
        type:String,
        enum:[
            "pending",
            "selected",
            "rejected",
            "observed"
        ],
        default:"pending"
    },
    // اللاعب المتابَع (observed) ممكن يتربط بأكتر من أوبزيرفر — وبس اللي في الليست دي يقدروا يشوفوه
    observers: {
        type: [{ type: mongoose.Schema.ObjectId, ref: 'User' }],
        default: []
    },
    notes: {
        type: String
    },
    profileImg: {
        type: String
    },
    // §9 — مش required عمداً: لما كوتش يتمسح نهائياً بنفضّي الحقل ده بدل ما نمسح
    // لاعبينه (بيانات لاعبين قاصرين، مش هنـcascade عليها). اللاعب بيبقى "يتيم"
    // ويفضل مرئي للأدمن والأوبزيرفرز المعيَّنين بس، لحد ما الأدمن يعيّنله كوتش
    // جديد من PATCH /players/:id/coach. الإنشاء لسه بيحطّه دايماً
    // (setUserIdToBody في playerRouter) فمفيش لاعب بيتولد بلا كوتش.
    coach: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
},
    // Stage 2 — مين أنشأ اللاعب أصلاً. مش بديل لـcoach: الملكية بتفضل في coach،
    // ودي نسبة إنشاء بتتقري في فرع واحد بس من سكوب proScout — اللاعب اللي لسه
    // متربطش بفريق (team: null). لاعب ليه فريق، النطاق بيتحدد من دوري الفريق
    // وبس، مهما كان مين أنشأه.
    //
    // مش required عن قصد (نفس منطق coach فوق): المستندات اللي اتعملت قبل
    // الحقل ده مالهاش قيمة، وservices.updating بيشغّل runValidators:true —
    // فlو خليناه required كان أي تعديل على لاعب قديم هيفشل لحد ما الـbackfill
    // يخلص، يعني كل تعديل مربوط بترتيب الميجريشن. scripts/backfillPlayerCreatedBy.js
    // بيملاه من coach، واللاعب اليتيم (بلا كوتش) بيتساب فاضي — مالوش منشئ حقيقي،
    // والقيمة الغايبة بتتصرف زي null بالظبط في استعلام النطاق.
    //
    // بيتحط من السيرفر بس (playerController.create)، وlockField("createdBy") في
    // playerValidation بيمنع أي قيمة جاية من العميل في الإنشاء والتعديل.
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    },
    // §11 — كلمات البحث المطبّعة (lowercase) المشتقة من name + city.
    //
    // ليه حقل مشتق أصلاً: الـ$regex الـcase-insensitive (i) مابيستخدمش حدود
    // الـbtree index حتى مع ^، والـ$regex كمان مابيستفيدش من الـcollation في بناء
    // الحدود. فالطريقة الوحيدة المضمونة لبحث سريع مفهرس هي حقل مطبّع سلفاً
    // وبحث case-sensitive عليه.
    //
    // ليه مصفوفة كلمات مش نص واحد: multikey index بيخلي "Sal" تلاقي
    // "Mohamed Salah" — الكوتش بيدور بالاسم الأخير زي ما بيدور بالأول تماماً.
    // نص واحد بـ^ كان هيطابق من أول الاسم الكامل بس.
    //
    // ليه name وcity في مصفوفة واحدة: صندوق البحث في الواجهة واحد وبيدوّر في
    // الاتنين، فمصفوفة واحدة بتدي IXSCAN واحد بدل $or على index-ين.
    //
    // select: false — بيانات مشتقة داخلية، مالهاش لزوم في أي رد API.
    searchTokens: {
        type: [String],
        default: [],
        select: false,
    },
},{ timestamps: true });

// Valid birth-year range for age groups (2007 → 2019)
const MIN_BIRTH_YEAR = 2007;
const MAX_BIRTH_YEAR = 2019;

function getBirthYear(dateOfBirth) {
    return new Date(dateOfBirth).getFullYear();
}

// §11 — بيحوّل الاسم والمدينة لكلمات مطبّعة للبحث بالبادئة.
// مُصدَّرة عشان سكريبت الـbackfill يستخدم نفس المنطق بالظبط بدل ما يعيد كتابته.
export const buildSearchTokens = (...values) => {
    const tokens = values
        .filter(Boolean)
        .flatMap((v) => String(v).toLowerCase().split(/\s+/))
        .filter(Boolean);
    return [...new Set(tokens)];
};




playerSchema.pre('save', async function () {
    const birthYear = getBirthYear(this.dateOfBirth);

    if (birthYear < MIN_BIRTH_YEAR || birthYear > MAX_BIRTH_YEAR) {
        throw new AppError(`Player birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR} (got: ${birthYear})`, 400);
    }

    const ageGroup = await AgeGroup.findOne({ birthYear });

    if (!ageGroup) {
        throw new AppError(`No age group is configured for birth year ${birthYear}. Please ask the admin to add it.`, 400);
    }

    this.ageGroup = ageGroup._id;
});

// §11 — نفس نمط اشتقاق ageGroup فوق: الحقل بيتحسب سيرفر-سايد دايماً ومابيتقبلش
// من العميل. بيتحدّث لو الاسم أو المدينة اتغيّرت.
playerSchema.pre('save', function () {
    if (this.isNew || this.isModified('name') || this.isModified('city')) {
        this.searchTokens = buildSearchTokens(this.name, this.city);
    }
});

// Database indexes
playerSchema.index({ coach: 1, createdAt:-1 });
// §11 — البحث بالبادئة. multikey على searchTokens: استعلام
// { searchTokens: /^moh/ } بياخد حدود index حقيقية (case-sensitive على حقل
// مطبّع سلفاً) بدل الـCOLLSCAN اللي كان بيعمله الـ$regex الـcase-insensitive.
// الـtext index القديم على name اتشال — search() مكانش بيستخدم $text أبداً
// فكان تكلفة كتابة على كل insert/update بعائد صفر.
playerSchema.index({ searchTokens: 1 });
// نفس البحث لكن جوه سكوب ملكية الكوتش — وده المسار الأكتر استخداماً فعلياً
// (الكوتش بيدوّر في لاعبينه هو). من غير الـindex ده الـplanner بيختار
// coach_1_createdAt_-1 وبيفلتر الـregex في الذاكرة: مقيس بـexplain على 5000 لاعب
// موزّعين على 40 كوتش → exam 125 لـ ret 16 (7.8×). مع الـindex ده → exam 16 (1.0×).
// searchTokens_1 فوق بيفضل مطلوب لمسار الأدمن (بحث بدون سكوب كوتش) لأن الـcoach
// هنا هو الـprefix. التكلفة: مدخل لكل كلمة لكل لاعب — وإنشاء اللاعبين عملية
// بشرية نادرة، مش كتابة عالية التردد.
playerSchema.index({ coach: 1, searchTokens: 1 });
// فلترة بالمركز والقدم المفضلة
playerSchema.index({ coach: 1, position: 1 });
playerSchema.index({ coach: 1, preferredFoot: 1 });
// فلترة/تجميع بالفئة العمرية (coach path)
// يغطي: list {coach, ageGroup, status?} + counts {coach} group-by ageGroup (prefix coach,ageGroup)
playerSchema.index({ coach: 1, ageGroup: 1, status: 1 });
// admin path: list {ageGroup, status?} + counts (no coach) group-by ageGroup (prefix ageGroup)
playerSchema.index({ ageGroup: 1, status: 1 });
// dashboard aggregations — status filtering & grouping
// admin dashboard byStatus (prefix status) + counts {status} group-by ageGroup
playerSchema.index({ status: 1, ageGroup: 1 });
// coach dashboard byStatus (prefix coach,status) + counts {coach, status} group-by ageGroup
playerSchema.index({ coach: 1, status: 1, ageGroup: 1 });
// observer path: list/counts for players assigned to an observer (multikey index on the array)
playerSchema.index({ observers: 1, ageGroup: 1 });
// daily summary — range query on createdAt across all coaches
playerSchema.index({ createdAt: 1 });           // dailySummary: $match createdAt > lastSentAt
// الربط العكسي Team.players (foreignField: team) — بس للاعبين المربوطين فعلاً بفريق
playerSchema.index({ team: 1 }, { sparse: true });
// Stage 2 — الفرع التاني من سكوب proScout: { team: null, createdBy: <userId> }.
// الـindex اللي فوقه (team_1 الـsparse) **مايقدرش** يخدم الفرع ده: الـsparse بيستبعد
// المستندات اللي team فيها null، ودي بالظبط المجموعة اللي الفرع بيختارها. فمحتاجين
// index غير sparse على الاتنين مع بعض.
playerSchema.index({ team: 1, createdBy: 1 });



playerSchema.pre('findOneAndUpdate', async function () {

    const update = this.getUpdate() ?? {};

    // ⚠️ قراءة الـupdate — النقطة دي كانت مصدر باگ صامت:
    //
    // الكود القديم كان `const data = update.$set || update`. المشكلة إن
    // timestamps: true بيخلي مونجوس يضيف $set: { updatedAt } لكل تعديل، يعني
    // update.$set موجود **دايماً** — فالتعبير ده كان بيختاره ويرجّع أوبجكت فيه
    // updatedAt وبس. الحقول اللي العميل بعتها top-level (والمسار الوحيد في
    // المشروع هو services.updating → findByIdAndUpdate(id, req.body) فكلها
    // بتيجي top-level) مكانتش بتوصل خالص.
    //
    // النتيجة كانت إن بلوك dateOfBirth تحت **عمره ما اشتغل على التعديل**:
    //   • ageGroup مكانش بيتعاد اشتقاقه → اللاعب يفضل في فئته القديمة بعد
    //     تصحيح تاريخ ميلاده
    //   • فحص MIN/MAX birth year كان بيتخطّى بالكامل → تعديل بتاريخ برة المدى
    //     كان بيعدّي
    //
    // القراءة الصح: دمج الاتنين. الكتابة بتروح لـ$set لو موجود، ومونجوس بينقل
    // الحقول الـtop-level لنفس المكان وقت الـcasting (بعد الهوك ده).
    const incoming = { ...update, ...(update.$set ?? {}) };
    const setDerived = (field, value) => {
        if (update.$set) update.$set[field] = value;
        else update[field] = value;
    };

    if (incoming.dateOfBirth) {

        const birthYear = getBirthYear(incoming.dateOfBirth);

        if(birthYear < MIN_BIRTH_YEAR || birthYear > MAX_BIRTH_YEAR){
            throw new AppError(`Player birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR} (got: ${birthYear})`, 400);
        }

        const ageGroup = await AgeGroup.findOne({birthYear});

        if(!ageGroup){
            throw new AppError(`No age group is configured for birth year ${birthYear}. Please ask the admin to add it.`, 400);
        }

        setDerived('ageGroup', ageGroup._id);
    }

    // §11 — تحديث كلمات البحث.
    //
    // searchTokens حقل مشتق سيرفر-سايد: أي قيمة جاية من العميل بتترمي. من غير
    // السطر ده أي حد يقدر يبعت searchTokens في الـbody ويتحكم في نتايج البحث.
    delete update.searchTokens;
    if (update.$set) delete update.$set.searchTokens;

    if (incoming.name !== undefined || incoming.city !== undefined) {
        // الحقلين مترابطين في مصفوفة واحدة، فلو واحد بس اتغيّر لازم نجيب التاني
        // من المستند الحالي — من غير كده تعديل الاسم كان هيمسح كلمة المدينة
        const current = await this.model
            .findOne(this.getQuery())
            .select("name city")
            .lean();

        setDerived('searchTokens', buildSearchTokens(
            incoming.name ?? current?.name,
            incoming.city ?? current?.city
        ));
    }
});

// C4/F4: profileImg بيتحوّل لـ URL موقّع (Bunny) أو passthrough (legacy) أو null
playerSchema.set("toJSON", {
    transform: (doc, ret) => {
        if (ret.profileImg) ret.profileImg = resolveImageUrl(ret.profileImg);
        return ret;
    },
});

const Player = mongoose.model('Player', playerSchema);

export default Player;