import mongoose from "mongoose";

const playerMediaSchema = new mongoose.Schema(
    {
        player: {
            type: mongoose.Schema.ObjectId,
            ref: "Player",
            required: true,
        },
        // §12 — مش required عمداً: لما يتمسح الرافع نهائياً بنصفّر الحقل
        // والميديا تفضل. الفيديو/الصورة أصل من أصول ملف اللاعب مش ملكية
        // للرافع. الرفع لسه بيحطّه دايماً سيرفر-سايد.
        uploadedBy: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
        },
        type: {
            type: String,
            enum: ["image", "video"],
            required: true,
        },
        // مصدر التخزين. "cloudinary" = دوكس قديمة (pre-cutover) — url/publicId بتاعتها.
        storage: {
            type: String,
            enum: ["bunny", "cloudinary"],
            default: "bunny",
        },
        // فيديو Bunny Stream — الـ guid
        bunnyVideoId: {
            type: String,
        },
        // صورة على Bunny Storage (media zone) — المسار (object key)، مش URL
        storageKey: {
            type: String,
        },
        // الفيديو بيبدأ processing لحد ما Bunny يخلّص transcode؛ الصور ready على طول
        status: {
            type: String,
            enum: ["processing", "ready", "failed"],
            default: "ready",
        },
        // سبب الفشل (مثلاً تجاوز حد الحجم/المدة — F2) لعرضه في الـ UI
        failureReason: {
            type: String,
        },
        // SHA-256 hex digest للفيديو، محسوب من المتصفح قبل الرفع — بيمنع رفع نفس الفيديو مرتين لنفس اللاعب
        fileHash: {
            type: String,
        },
        // legacy فقط — مش موثوق. الـ URL دايمًا بيتولّد بالـ helper وقت القراءة.
        url: {
            type: String,
        },
        publicId: {
            type: String,
        },
        title: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        // لو الميديا مرتبطة بمباراة موسم — اعتماد الفيديو ده (بعد مراجعة الأدمن) هو اللي بيسجل الرافع كحاضر للمباراة
        seasonMatch: {
            type: mongoose.Schema.ObjectId,
            ref: "SeasonMatch",
            default: null,
        },
        // لو الصورة دي اترفعت مع فيديو في نفس العملية — بتشاور على الفيديو ده (صور بس، مش فيديوهات)
        linkedVideo: {
            type: mongoose.Schema.ObjectId,
            ref: "PlayerMedia",
            default: null,
        },
        // null = مش مربوطة بمباراة أصلاً (مفيش داعي لمراجعة). لو مربوطة، بتبدأ "pending" لحد ما الأدمن يراجعها
        reviewStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: null,
        },
        // أسباب رفض الأدمن (ممكن أكتر من سبب) — مطلوبة لما reviewStatus يتحط "rejected"، بتتبعت للكوتش في نوتيفيكيشن
        rejectionReason: {
            type: [String],
            enum: [
                "unclear_footage",
                "scout_name_missing",
                "match_date_missing",
                "teams_not_specified",
            ],
            default: [],
        },
    },
    {
        timestamps: true,
    }
);

playerMediaSchema.index({ player: 1, createdAt: -1 }); // كل ميديا اللاعب مرتبة بالأحدث
playerMediaSchema.index({ player: 1, type: 1 });        // فلترة صور أو فيديوهات
// F8/A1: العدّ الحيّ للفيديوهات الجاهزة + البحث عن فيديو processing لنفس (لاعب، ماتش)
playerMediaSchema.index({ player: 1, seasonMatch: 1, type: 1, status: 1 });
// كشف تكرار رفع نفس الفيديو لنفس اللاعب
playerMediaSchema.index({ player: 1, type: 1, fileHash: 1 }, { sparse: true });
// webhook/reconcile: البحث بالـ guid بتاع Bunny
playerMediaSchema.index({ bunnyVideoId: 1 }, { sparse: true });
// الربط العكسي SeasonMatch.media (foreignField: seasonMatch) — بس للميديا المربوطة فعلاً بماتش
playerMediaSchema.index({ seasonMatch: 1 }, { sparse: true });
// الصور المرتبطة بفيديو معين (رفعوا مع بعض) — بس للصور اللي فعلاً مربوطة
playerMediaSchema.index({ linkedVideo: 1 }, { sparse: true });
// ميديا الأوبزيرفر/الكوتش اللي رفعها بنفسه، مرتبة بالأحدث
playerMediaSchema.index({ uploadedBy: 1, createdAt: -1 });
// مراجعة الأدمن للميديا المعلقة (pending review)
playerMediaSchema.index({ reviewStatus: 1 }, { sparse: true });

// §11 — الكرونز اللي بتدوّر على الفيديوهات المعلّقة:
//   videoReconcile.js:21  → { type:"video", status:"processing", updatedAt: {$lte} }  كل 5 دقايق
//   mediaRetention.js:34  → { type:"video", status:"processing", createdAt: {$lte} }  يومياً
// الاتنين كانوا COLLSCAN — أقرب index موجود {player, seasonMatch, type, status}
// محتاج player كـprefix، ومفيش استعلام منهم بيعرف اللاعب. الدليل من explain على
// 10,000 مستند ميديا: exam 10,000 → ret 0 في الحالتين.
//
// partialFilterExpression على status:"processing" هو المفتاح: الحالة دي عابرة
// (الفيديو بيخرج منها أول ما Bunny يخلّص، والصور بتتولد "ready" على طول)، فالـ
// index بيفضل بحجم عشرات المستندات مهما كبرت الكولكشن — يعني تكلفة كتابة شبه
// معدومة على كولكشن بيتكتب فيه. الـplanner بيستخدمه لأن الاستعلامين بيحطوا
// status:"processing" حرفياً فبيحققوا شرط الـpartial.
playerMediaSchema.index(
    { type: 1, updatedAt: 1 },
    { partialFilterExpression: { status: "processing" } }
);

// §11 — كرون الـretention: runMediaRetention بيدوّر على { createdAt: {$lte} }
// (mediaRetention.js) وكان بيعمل COLLSCAN — دليل explain على 10,000 مستند:
// exam 10,000 → ret 7,106.
//
// تكلفة الكتابة هنا قليلة بشكل غير معتاد لأن createdAt تصاعدي (monotonic):
// كل مستند جديد مفتاحه أكبر من اللي قبله، فالإدخال بيبقى append في أقصى يمين
// الـB-tree — صفحة واحدة ساخنة في الذاكرة، من غير انقسام صفحات عشوائي ولا
// قراءات عشوائية من الديسك زي ما بيحصل مع index على حقل عشوائي.
// وبيخدم كمان أي فرز أو مدى زمني على تاريخ الإنشاء.
playerMediaSchema.index({ createdAt: 1 });
// §11 — الـtext index على title/description اتشال: نفس سبب notes في التقارير —
// $text عمره ما اتنده، والبحث في الميديا اتشال لعدم وجود مستهلك في الفرونت.

const PlayerMedia = mongoose.model("PlayerMedia", playerMediaSchema);

export default PlayerMedia;