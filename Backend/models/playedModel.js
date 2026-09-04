import mongoose from "mongoose";
import AgeGroup from "./ageGroupModel.js";
import AppError from "../utils/appError.js";
import { resolveImageUrl } from "../utils/mediaUrl.js";
import { yearOfUTC } from "../utils/time.js";

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
    // Stage 4b — لاعب محترف (بالغ) بدل لاعب ناشئ.
    //
    // بيغيّر حاجتين في الـpre-save hooks تحت، وبس:
    //   1) مدى سنة الميلاد المسموح: 1996→2019 بدل 2007→2019.
    //   2) اشتقاق ageGroup: **بيتخطّى تماماً**، فالحقل بيفضل فاضي.
    //
    // ليه علم صريح مش استنتاج من الرول أو من دوري الفريق:
    //   • الرول — الموديل مالوش وصول لـreq.user، وربطه بالرولات بيخلط طبقتين.
    //   • دوري الفريق — Player.team قيمته default: null، ولاعب الـproScout اللي
    //     لسه متربطش بفريق هو بالظبط الحالة اللي الفرع التاني من سكوب المرحلة 2
    //     موجود عشانها. الاستنتاج من الفريق بيفشل هناك.
    // العلم بيتقرا synchronously في الـhook من غير أي استعلام إضافي.
    //
    // بيتحط من السيرفر بس (playerController.create من رول المنشئ)، و
    // lockField("isProfessional") في playerValidation بيرفض أي قيمة من العميل
    // في الإنشاء والتعديل — يعني كوتش مايقدرش يرفع القيد عن لاعبه بإنه يبعتها.
    //
    // ⚠️ تعارض مسجّل مع القيد C-4 في الدستور، اللي بيقول ageGroup يفضل "مشتقاً
    // إجبارياً على Player". القيد اتكتب في سياق "متشيلش الحقل من المخطط"، مش في
    // سياق لاعبين بالغين مالهمش فئة عمرية أصلاً. الحقل باقٍ كما هو للناشئين.
    isProfessional: {
        type: Boolean,
        default: false,
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

// Valid birth-year range for age groups (2007 → 2019) — لاعبي الناشئين
const MIN_BIRTH_YEAR = 2007;
const MAX_BIRTH_YEAR = 2019;

// Stage 4b — الحد الأدنى للاعب المحترف: 1996 (= 30 سنة في 2026).
//
// رقم **ثابت** بقرار المالك، مش محسوب من السنة الحالية. المتحرك
// (currentYear - 30) كان بيعمل فخ: لاعب مواليد 1996 مسجّل النهارده يبقى تعديل
// تاريخ ميلاده مرفوض في 2027، لأن pre('findOneAndUpdate') بيعيد الفحص بنفس
// الحدود. الثابت بيزحف ببطء (31 سنة في 2027) لكنه مابيبطّلش بيانات قائمة،
// وهو نفس أسلوب MAX_BIRTH_YEAR الموجود أصلاً.
const PRO_MIN_BIRTH_YEAR = 1996;

// audit-backend C3 — UTC، مش توقيت السيرفر. dateOfBirth بيتخزن منتصف ليل UTC،
// والسبب الكامل في utils/time.js:yearOfUTC.
function getBirthYear(dateOfBirth) {
    return yearOfUTC(dateOfBirth);
}

// Stage 4b — نقطة واحدة لقرار "إيه المسموح لسنة الميلاد دي".
// بترجع { min, max } وبس؛ قرار اشتقاق ageGroup منفصل عنها في الـhooks.
function birthYearBoundsFor(isProfessional) {
    return {
        min: isProfessional ? PRO_MIN_BIRTH_YEAR : MIN_BIRTH_YEAR,
        max: MAX_BIRTH_YEAR,
    };
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
    const { min, max } = birthYearBoundsFor(this.isProfessional);

    if (birthYear < min || birthYear > max) {
        throw new AppError(`Player birth year must be between ${min} and ${max} (got: ${birthYear})`, 400);
    }

    // Stage 4b — اللاعب المحترف مالوش فئة عمرية.
    //
    // مش "الفئة مش موجودة فبنتخطاها" — الفئات العمرية مفهوم خاص بالناشئين
    // (فرق الأكاديمية بتتقسم بسنة الميلاد)، ولاعب محترف بالغ مالوش مكان فيها
    // أصلاً. إنشاء فئات 1996→2006 عشان نملا الخانة كان هيحطّ 11 كارت جديد في
    // شبكة الفئات عند الكوتش والأدمن — ودي بالظبط الحاجة اللي المالك قال إنها
    // تفضل زي ما هي (2007→2019).
    //
    // ageGroup بيفضل فاضي، وده متعامَل معاه أصلاً في getCountsByAgeGroup
    // (بيتخطّى الـbucket الفاضي في counts وبيعدّه في total).
    if (this.isProfessional) {
        this.ageGroup = undefined;
        return;
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
// audit-database I1 — سكوب الـproScout. **الترتيب هنا هو البند نفسه، مش تفصيلة.**
//
// المرحلة 2 كانت بتسكوب الرول ده بفرعين، والتاني منهم { team: null, createdBy }،
// فكان فيه index بالشكل { team: 1, createdBy: 1 } مبني للفرع ده بالظبط. المرحلة 11
// (specs/011-proscout-createdby-scope) **ألغت الفرع** وخلّت النطاق createdBy لوحده
// (services/scope.js:94)، والـindex فضل ورا. و`createdBy` مش الـprefix فيه، فهو
// مايقدرش يخدم الشكل الجديد أبداً — يعني كان index بيتكتب على كل إدخال لاعب لصفر
// قارئ، والشكل الفعلي اللي بيتنفّذ مالوش أي index.
//
// النتيجة كانت تلات مسارات بتعمل COLLSCAN على الكولكشن كله (مقيس على 25,800 لاعب
// منهم 400 للكشاف، mongodb-memory-server + explain):
//   • countDocuments بتاع كل صفحة قايمة  (playerController.js:333) → فحص 25,800
//   • $facet بتاع الداشبورد               (dashboardController.js:283) → فحص 25,800
//   • counts بالفئة العمرية               (playerController.js:162)  → فحص 25,800
// وبعد الـindex ده: فحص 400 في التلاتة. زمن الداشبورد 21.5ms → 2.1ms، وعدّاد
// القايمة 14.4ms → 1.0ms.
//
// ليه createdAt: -1 تانية مش createdBy لوحده: الترتيب الافتراضي للقايمة هو
// -createdAt. من غير الجزء ده الـplanner بيسيب الفلتر ويقع على createdAt_1 عشان
// يتجنّب الـblocking sort، فبيمشي على الفهرس كله ويرمي اللي مش بتاع الكشاف —
// مقيس: فحص 25,040 مفتاح عشان يرجّع 50 لما مستندات الكشاف مش الأحدث. مع الجزء
// ده الاستعلام بيبقى مغطّى بالكامل: فحص 50 لـ50.
playerSchema.index({ createdBy: 1, createdAt: -1 });

// observer-matches-and-players — نفس منطق الـindex فوق بالظبط، لنفس السبب:
// أوبزيرفرز بقوا يملكوا لاعبين (observers[] بتحتوي على معرّفهم) والترتيب
// الافتراضي للقايمة -createdAt، والـindex الوحيد اللي فيه observers
// ({observers:1, ageGroup:1} فوق) مش بيغطي الترتيب ده. مقيس بـ.explain() على
// mongodb-memory-server، 6,000 لاعب (200 لأوبزيرفر واحد)، limit(50): قبل
// الإضافة docsExamined 6,000 (COLLSCAN)؛ بعدها 50 لـ50 (FETCH مغطّى بالكامل
// على الفهرس). الفهرس ده معلن في المخطط بس — تطبيقه على قاعدة بيانات حقيقية
// عن طريق scripts/syncAllIndexes.js قرارك، مش شيء بينفّذ هنا (CLAUDE.md).
playerSchema.index({ observers: 1, createdAt: -1 });



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

        // Stage 4b — isProfessional بيتقرا من **المستند المخزّن**، مش من الـupdate.
        // lockField("isProfessional") بيمنع العميل يبعتها أصلاً، فالقيمة الوحيدة
        // الموثوقة هي اللي في الداتابيز. الاستعلام ده بيحصل بس لما تاريخ الميلاد
        // نفسه بيتعدّل — مش على كل تحديث.
        const current = await this.model
            .findOne(this.getQuery())
            .select("isProfessional")
            .lean();
        const isProfessional = Boolean(current?.isProfessional);
        const { min, max } = birthYearBoundsFor(isProfessional);

        if(birthYear < min || birthYear > max){
            throw new AppError(`Player birth year must be between ${min} and ${max} (got: ${birthYear})`, 400);
        }

        // اللاعب المحترف مالوش فئة عمرية — نفس منطق pre('save') فوق. بنفضّيها
        // صراحةً بدل ما نسيبها، عشان لاعب اتحوّل لمحترف مايفضلش شايل فئة قديمة.
        if (isProfessional) {
            setDerived('ageGroup', undefined);
        } else {
            const ageGroup = await AgeGroup.findOne({birthYear});

            if(!ageGroup){
                throw new AppError(`No age group is configured for birth year ${birthYear}. Please ask the admin to add it.`, 400);
            }

            setDerived('ageGroup', ageGroup._id);
        }
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