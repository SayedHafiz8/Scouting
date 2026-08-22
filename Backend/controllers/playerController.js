import asyncHandler from "express-async-handler";
import sharp from "sharp";
import fs from "fs";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import AppError from "../utils/appError.js";
import ApiFeature from "../utils/apiFeatures.js";
import { updating } from "../services/services.js";
import { buildKey, uploadMediaImage, deleteMediaImage } from "../services/imageStorage.js";
import { deleteMediaBytes } from "./playerMediaController.js";
import { resolveImageUrl } from "../utils/mediaUrl.js";
import { ROLES } from "../constants/roles.js";
import { playerScopeFor, MATCH_NOTHING } from "../services/scope.js";
import { sendNotificationToUser, sendNotificationToAdmins } from "../socket/handlers/notification.js";
import {
    emitAdminDashboardUpdate,
    emitCoachDashboardUpdate,
    emitObserverDashboardUpdate,
} from "./dashboardController.js";



export const setUserIdToBody = (req, res, next) => {
    // Nested Router
    if(!req.body.coach) req.body.coach = req.params.id;
    next();
}

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
export const create = asyncHandler(async (req, res, next) => {
    // Stage 4 (R14) — ⚠️ الـdelete مش زيادة، هو التصليح نفسه.
    //
    // playerRouter متمركّب **مرتين**: على /players وكمان على /users/:id/players
    // (userRouter.js: userRouter.use("/:id/players", playerRouter)). في المسار
    // التاني req.params.id بيبقى **user id** مش player id، وsetUserIdToBody بينسخه
    // في req.body.coach قبل ما نوصل هنا. الحاجة الوحيدة اللي بتبطّله النهارده هي
    // الإسناد اللي تحت.
    //
    // فلو سيبنا coach "من غير ما نحطه" للـproScout بدل ما نمسحه، كان يقدر يبعت
    // POST /users/<أي coach id>/players ويخلق لاعب مملوك لكوتش من اختياره —
    // تخطّي كامل لـPATCH /players/:id/coach (أدمن-أونلي، والمخرج الشرعي الوحيد
    // للحقل ده). lockField("coach") مابيقفلهاش: هو بيرفض coach في الـbody،
    // والقيمة دي جاية من الـpath عن طريق middleware.
    //
    // else مش else if (proScout) — منع بالافتراض (Principle II): أي رول خامس
    // ياخد POST /players مستقبلاً بيرث الفرع الآمن، مش القابل للاستغلال.
    //
    // ليه الـproScout مالوش coach أصلاً: الحقل معناه "الكوتش المالك للاعب"،
    // وassignPlayerCoach بيرفض أي يوزر مش role: coach. اللاعب بيبقى "يتيم" (§9)
    // والأدمن بيلمّه من عدسة ?coach=none ويعيّنله كوتش حقيقي.
    if (req.user.role === ROLES.COACH) {
        req.body.coach = req.user._id;
    } else {
        delete req.body.coach;
    }
    // Stage 2 — نسبة الإنشاء. الإسناد بيحصل بعد استلام الـbody، فأي قيمة بعتها
    // العميل بتتكتب فوقها هنا (وlockField("createdBy") بيرفضها قبل كده أصلاً).
    req.body.createdBy = req.user._id;

    // Stage 4b — لاعبو الـproScout محترفون: مدى سنة ميلاد أوسع (1996→2019) وبدون
    // فئة عمرية. الفرعين في playedModel pre-save hooks بيقرأوا العلم ده.
    //
    // الإسناد صريح للقيمتين مش `= (role === PRO_SCOUT)` بس، عشان الكوتش ياخد
    // false صراحةً وميعتمدش على default المخطط — ولإن أي قيمة جاية من العميل
    // بتتكتب فوقها هنا (وlockField بيرفضها قبل كده أصلاً).
    req.body.isProfessional = req.user.role === ROLES.PRO_SCOUT;

    const player = await Player.create(req.body);

    // fire-and-forget — الـ response لا ينتظر الـ dashboard update
    emitAdminDashboardUpdate();
    res.status(201).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Player counts grouped by ageGroup (single aggregation instead of N requests)
// @route   GET api/v1/players/counts?status=selected&coach=<id>
// @access  private (coach sees own; admin sees all, or a specific coach/observer via query)
export const getCountsByAgeGroup = asyncHandler(async (req, res, next) => {
    const match = {};

    // Stage 2 — منع-بالافتراض صريح (code-review high، نفس تصليح
    // seasonMatchBaseFilterFor). لو الرول مش من الأربعة المعدودين هنا، match
    // تفضل {} ونطاق proScout برضه {} لغير proScout — يعني endpoint جديد لرول
    // خامس مستقبلي كان هيعدّ كل لاعبين الداتابيز بالصدفة، مش صفر. الـswitch ده
    // بيحوّل السكوت الضمني لرفض صريح.
    switch (req.user.role) {
        case ROLES.COACH:
            // coach-scoping: coaches only count their own players
            match.coach = new mongoose.Types.ObjectId(req.user._id);
            break;

        case ROLES.OBSERVER:
            // observer-scoping: observers only count players assigned to them
            match.observers = new mongoose.Types.ObjectId(req.user._id);
            break;

        case ROLES.ADMIN: {
            // admin browsing a specific coach's or observer's players (?coach=id / ?observer=id) —
            // بدون ده كان بيرجع عدّ كل اللاعبين مش بتوع الكوتش/الأوبزيرفر المطلوب بس
            const { coach, observer } = req.query;
            if (coach && mongoose.isValidObjectId(coach)) {
                match.coach = new mongoose.Types.ObjectId(coach);
            }
            if (observer && mongoose.isValidObjectId(observer)) {
                match.observers = new mongoose.Types.ObjectId(observer);
            }
            break;
        }

        case ROLES.PRO_SCOUT:
            // النطاق بيتحط تحت من playerScopeFor — مفيش حاجة تتحط في match هنا.
            break;

        default:
            // code-review high fix #3 — {...MATCH_NOTHING} مش Object.assign(match,
            // MATCH_NOTHING): التاني بينسخ *مرجع* لنفس أوبجكت الـsentinel المشترك
            // (match._id يبقى نفس أوبجكت MATCH_NOTHING._id)، فأي تعديل مستقبلي في
            // مكان تاني بيلمس match._id بصمت بيسمّم الـsentinel لكل الطلبات
            // الجاية. الـspread بيطابق نفس القاعدة المتبعة في apiFeatures.js.
            Object.assign(match, { ...MATCH_NOTHING });
    }

    // للكوتش وproScout: اللاعب "observed" بيظهرله كأنه "pending" (FR-014).
    const masksObservedAsPending = req.user.role === ROLES.COACH || req.user.role === ROLES.PRO_SCOUT;

    // optional status filter (GET → comes as a query param)
    const status = req.query?.status ?? req.body?.status;
    if (status) {
        // code-review high fix #1 — status=observed مايتنفّذش حرفياً لرول مقنّع.
        // القناع بيقول "محدش شايف إن اللاعب ده observed"؛ لو سمحنا للفلتر يعدّي
        // كان بيكشف بالظبط مين هما اللاعبين المتابَعين فعلياً حتى لو العرض نفسه
        // بيقول "pending" — تسريب عن طريق الفلتر مش العرض. بنتجاهل القيمة (زي
        // معاملة PLAYER_ADMIN_ONLY_LENSES فوق) بدل ما تتنفّذ أو نرجّع خطأ.
        if (masksObservedAsPending && status === "observed") {
            // تجاهل — لا يوجد فلتر status يتطبّق أصلاً
        } else if (masksObservedAsPending && status === "pending") {
            // فالعدّ بالـpending يشمل الاتنين — نفس التوسيع اللي في getAll فوق.
            match.status = { $in: ["pending", "observed"] };
        } else {
            match.status = status;
        }
    }

    // Stage 2 — proScout: النطاق من الطبقة المركزية.
    //
    // الدمج بـ$and مش spread: الـspread ممكن يتصادم بصمت لو فلتر مستقبلي جاب
    // مفتاح team أو $or على المستوى الأعلى. $and مايقدرش يتصادم.
    // ملاحظة: $match مابيعملش cast زي find، فالنطاق لازم يحمل ObjectId حقيقي —
    // مضمون من scope.js ومُختبَر في proScoutDataScope.test.js.
    const scope = await playerScopeFor(req);
    const finalMatch = Object.keys(scope).length ? { $and: [scope, match] } : match;

    const rows = await Player.aggregate([
        { $match: finalMatch },
        {
            $group: {
                _id: "$ageGroup",
                count: { $sum: 1 },
                // Stage 4c — عدّاد صريح للاعبين المحترفين، مشتق من الفلاج مش
                // من الطرح (total - Σ counts). الطرح كان هيلزّق "محترف" على أي
                // لاعب فئته العمرية ناقصة لسبب تاني (داتا قديمة/تالفة) ويخبّيه
                // مرة تانية. بيركب على نفس finalMatch اللي بيبني buckets الفئات
                // فبيفضل مطابق لنفس شروط status/coach/observer تلقائياً
                // (FR-006)، مش استعلام متوازي لازم يتزبط يدوي.
                professional: { $sum: { $cond: ["$isProfessional", 1, 0] } },
            },
        },
    ]);

    const counts = {};
    let total = 0;
    let professional = 0;
    rows.forEach((r) => {
        if (r._id) counts[r._id.toString()] = r.count;
        total += r.count;
        professional += r.professional;
    });

    res.status(200).json({
        status: "success",
        data: { counts, total, professional },
    });
});

// /code-review high، fix #3 — toJSON مش toObject.
//
// playedModel.js عامل playerSchema.set("toJSON", { transform: ... }) عشان
// يوقّع profileImg (Bunny CDN) — الترانسفورم ده بيتشغّل تلقائياً لو الاستجابة
// فيها مستند mongoose حقيقي (res.json() بينده JSON.stringify اللي بيستدعي
// toJSON() بنفسه). المشكلة إن toObject() **مابيشغّلش** hook الـtoJSON خالص —
// الاتنين مستقلين في mongoose إلا لو اتظبطوا صراحةً مع بعض. يعني أي مستند
// اتعدّى على القناع ده كان بيرجع profileImg كـkey تخزين خام (زي
// "players/abc.webp") بدل URL موقّع، لغير الأدمن (اللي مابيعديش على القناع).
const maskObservedForCoach = (doc) => {
    const o = doc.toJSON ? doc.toJSON() : doc;
    if (o.status === "observed") o.status = "pending";
    delete o.observers;
    return o;
};

// الأوبزيرفر مبيشوفش مين الكوتش بتاع اللاعب — الأدمن بس اللي يقدر يشوف ده.
const maskCoachForObserver = (doc) => {
    const o = doc.toJSON ? doc.toJSON() : doc;
    delete o.coach;
    return o;
};

// coach/observer/observers عدسة أدمن-أونلي — نفس القاعدة اللي getCountsByAgeGroup مطبقاها.
// لغير الأدمن دول أوراكل: ?coach= بيكشف كوتش لاعب الأوبزيرفر (ضد maskCoachForObserver)،
// و?observers= بيكشف مين بيتابع لاعب الكوتش (ضد maskObservedForCoach). مفتاحين مختلفين
// فعكس ترتيب الدمج في ApiFeature لوحده مش بيقفلهم — لازم يتشالوا هنا قبل ما يوصلوا للفلتر.
const PLAYER_ADMIN_ONLY_LENSES = ["coach", "observer", "observers"];

// Stage 4c — isProfessional هنا وليس في PLAYER_ADMIN_ONLY_LENSES فوق: القايمة
// دي فلترة عادية مش عدسة أوراكل. الفرق: coach/observer/observers بيكشفوا
// *هوية* مستخدم تاني ضد بيانات الرول نفسه (زي ما التعليق فوق شارح)، أما
// isProfessional مبيسمّيش حد — أي رول يبعتها بيتقاطع مع سكوب ملكيته هو زي
// ما هو (AND عادي في ApiFeature.filter()، سكوب الملكية بيتطبق آخراً دايماً).
// كوتش يبعت ?isProfessional=true هيرجّعله تقاطع لاعبينه هو مع الفلاج ده —
// مفيش أي كشف مش موجود أصلاً. (specs/006-admin-professional-lens D-1)
const PLAYER_FILTERS = [
    "status", "position", "preferredFoot", "ageGroup", "team", "nationality",
    "coach", "observers", "isProfessional",
];

// @desc    Get all players (coach sees own with "observed" masked to "pending")
// @route   GET api/v1/players
// @access  private
export const getAll = asyncHandler(async (req, res, next) => {
    const isCoach = req.user.role === ROLES.COACH;
    // /code-review high، fix #2 — proScout عنده نفس قناع maskObservedForCoach
    // (FR-014: observed → pending، observers مخفي)، فلازم ياخد نفس توسيع
    // "pending" اللي بيشمل observed برضه — من غيره ?status=pending كان بيرجع
    // صفر لأي proScout واللاعب المتابَع لسه بيتعرض له كـ"pending" في القايمة
    // من غير فلتر (تناقض بين ما بيتعرض وما بيتفلتر بيه).
    const masksObservedAsPending = isCoach || req.user.role === ROLES.PRO_SCOUT;

    const queryParams = { ...req.query };
    if (req.user.role !== ROLES.ADMIN) {
        PLAYER_ADMIN_ONLY_LENSES.forEach((k) => delete queryParams[k]);
    }

    // code-review high fix #1 — status=observed مايتنفّذش حرفياً لرول مقنّع
    // (نفس السبب في getCountsByAgeGroup فوق): القناع بيقول محدش شايف إن اللاعب
    // observed، فلو الفلتر ده عدّى كان بيكشف بالظبط مين هما اللاعبين المتابَعين
    // عن طريق النتيجة نفسها، حتى لو كل عنصر فيها بيتعرض كـ"pending". بنتجاهل
    // القيمة بدل ما تتنفّذ حرفياً.
    if (masksObservedAsPending && queryParams.status === "observed") {
        delete queryParams.status;
    }

    // للكوتش وproScout: فلترة بالـ pending لازم تشمل اللاعبين المتابَعين (observed) كمان
    let pendingIncludesObserved = false;
    if (masksObservedAsPending && queryParams.status === "pending") {
        pendingIncludesObserved = true;
        delete queryParams.status;
    }

    // ?observer=id بيفلتر على مصفوفة الـ observers (اسم الحقل مختلف عن اسم الـ query param)
    if (queryParams.observer) {
        queryParams.observers = queryParams.observer;
        delete queryParams.observer;
    }

    // §9 — سنتينل "اللاعبين اليتامى": اللي كوتشهم اتمسح نهائياً فالحقل اتفضّى
    // (detachUserFromPlayers بتعمل $unset). من غير الفلتر ده الأدمن مالوش طريقة
    // يلمّهم عشان يعيّنلهم كوتش، وبيفضلوا مبعترين في القايمة.
    //
    // مركوب على عدسة الـcoach الموجودة عن قصد: "coach" أصلاً في
    // PLAYER_ADMIN_ONLY_LENSES فوق، يعني اتشال بالفعل من queryParams لأي حد مش
    // أدمن قبل ما نوصل هنا — الكوتش اللي يبعت ?coach=none بيتلغى السنتينل بتاعه
    // وبيقع على سكوب ملكيته العادي. مفيش مفتاح جديد ولا تغيير في ApiFeature.
    //
    // null (مش $exists:false) عشان يطابق الحقل الغايب والـnull الصريح مع بعض.
    if (queryParams.coach === "none") {
        queryParams.coach = null;
    }

    // Stage 2 — سكوب proScout بيتحط في الموضع الأساسي (base position)، وApiFeature
    // بيسلسل .find() فوقه. مهم تعرف **ليه** ده آمن: الشروط المتسلسلة بتتدمج
    // بـ"آخر واحد يكسب عند تصادم المفتاح"، **مش** بـAND. التركيب بيبقى AND هنا
    // فقط لأن النطاق ملفوف في $and جوه services/scope.js. ماتعيدش صياغة ده كـ
    // "الموضع الأساسي بيتدمج بـAND" — التعميم ده غلط (research R12).
    // بيرجع {} لأي رول قائم، و{} في .find() لا-عملية، فاستعلاماتهم مطابقة بايت
    // ببايت لما كانت عليه (Principle III).
    const scope = await playerScopeFor(req);

    const playerQuery = Player.find(scope)
        .populate({ path: "coach", select: "name email" })
        .populate({ path: "team", select: "name clubName" });

    // specs/010-professional-lens-creator — عرض proScout المسؤول عن اللاعب،
    // للأدمن بس. Player.createdBy موجود من المرحلة 2 لكل الرولات، لكن ده أول
    // استهلاك ليه. مربوط هنا (مش فلترة بعد الرجوع) عشان غير الأدمن ميعملش
    // الـpopulate ده أصلاً، لا يوصله ولا يتحسب لطلبه.
    if (req.user.role === ROLES.ADMIN) {
        playerQuery.populate({ path: "createdBy", select: "name" });
    }

    const features = new ApiFeature(
        playerQuery,
        queryParams,
        req.params,
        req.user
    )
        .filter({
            parentField: "coach",
            // proScout: null = "متسكوب من الفلتر الأساسي فوق، مش من هنا". لازم
            // يكون معلن صراحةً — لو سيبناه غايب، buildOwnerScope بترجّع
            // MATCH_NOTHING وبتتدمج بـAND مع السكوب فتلغيه بالكامل.
            ownerFields: { coach: "coach", observer: "observers", proScout: null },
            allowed: PLAYER_FILTERS,
        })
        // §11 — البحث اتضيّق من 5 حقول لحقل الكلمات المطبّع المشتق من name+city.
        // position/preferredFoot/nationality اتشالوا لأنهم موجودين أصلاً كفلاتر
        // مخصصة في PLAYER_FILTERS فوق، والـ$or عليهم كان بيمنع أي استخدام للـindex
        // (حقل واحد مفهرس وسط حقول مش مفهرسة = COLLSCAN برضه).
        .searchPrefix("searchTokens");

    if (pendingIncludesObserved) {
        features.query = features.query.find({ status: { $in: ["pending", "observed"] } });
    }

    const documentCount = await Player.countDocuments(features.query.getFilter());
    features.sort().limitFields().paginate(documentCount);

    let documents = await features.query;
    // FR-014 — الـproScout بياخد نفس قناع الكوتش: مايشوفش مصفوفة observers
    // و"observed" بتتعرضله "pending". القراءة دي هي المنع-بالافتراض
    // (Principle II): فتح صفحة تفاصيل اللاعب للرول ده معناه رد مالوش فرع قناع
    // أصلاً، فكان هيرجّع تخصيصات الأوبزيرفرز. الاختيار الأضيق دلوقتي، والسؤال
    // مفتوح صراحةً للمرحلة 4 — تخفيف القناع بعدين إضافة، لكن سحب بيانات
    // اتعرضت مش ممكن. maskCoachForObserver **مش** بتتطبّق: كوتش اللاعب بيفضل ظاهر.
    if (isCoach || req.user.role === ROLES.PRO_SCOUT) documents = documents.map(maskObservedForCoach);
    else if (req.user.role === ROLES.OBSERVER) documents = documents.map(maskCoachForObserver);

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents },
    });
});

// @desc    Get specific player (coach sees "observed" masked to "pending")
// @route   GET api/v1/players/:id
// @access  private
export const getSpecific = asyncHandler(async (req, res, next) => {
    const document = await Player.findById(req.params.id)
        .populate({ path: "coach", select: "name email" })
        .populate({ path: "observers", select: "name" })
        .populate({ path: "team", select: "name clubName" });

    if (!document) {
        return next(new AppError(`No document for this Id '${req.params.id}'`, 404));
    }

    let out = document;
    // FR-014 — نفس قناع الكوتش للـproScout؛ الشرح في getAll فوق.
    if (req.user.role === ROLES.COACH || req.user.role === ROLES.PRO_SCOUT) {
        out = maskObservedForCoach(document);
    } else if (req.user.role === ROLES.OBSERVER) out = maskCoachForObserver(document);

    res.status(200).json({
        status: "success",
        data: { document: out },
    });
});

// @desc    Delete a player and cascade-delete everything scoped to them
//          (scouting reports + media, including the Cloudinary assets) — players are hard-deleted, no "active" flag
// @route   DELETE api/v1/players/:id
// @access  private (admin only)
export const deleting = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const player = await Player.findById(id);
    if (!player) {
        return next(new AppError(`No document for This Id: ${id}`, 404));
    }

    const media = await PlayerMedia.find({ player: id });
    // امسح بايتات كل ميديا من مصدرها (Bunny Stream/Storage أو legacy Cloudinary) — best-effort
    await Promise.all(media.map((m) => deleteMediaBytes(m)));
    await PlayerMedia.deleteMany({ player: id });

    await ScoutingReport.deleteMany({ player: id });

    // امسح صورة البروفايل بتاعت اللاعب كمان (orphan fix)
    await deleteMediaImage(player.profileImg);

    await player.deleteOne();

    res.status(204).json({
        status: "success",
    });
});

//@desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const update = updating(Player);

// بتتأكد إن كل الـ ids المبعوتة فعلاً ليوزرز دورهم "observer"
const validateObserverIds = async (ids) => {
    const uniqueIds = [...new Set(ids.map(String))];
    const observerUsers = await User.find({ _id: { $in: uniqueIds }, role: ROLES.OBSERVER }).select("_id");
    if (observerUsers.length !== uniqueIds.length) return null;
    return uniqueIds;
};

export const updatePlayerStatus = asyncHandler(async (req, res, next) => {
    const { status, observers } = req.body;

    const update = { status };
    let newlyAssignedObservers = [];
    let beforeIds = new Set();

    if (status === "observed") {
        const validIds = await validateObserverIds(observers ?? []);
        if (!validIds) {
            return next(new AppError("One or more selected observers are not valid", 400));
        }

        const before = await Player.findById(req.params.id).select("observers");
        beforeIds = new Set((before?.observers ?? []).map(String));
        newlyAssignedObservers = validIds.filter((id) => !beforeIds.has(id));

        update.observers = validIds;
    }
    // ملاحظة: الربط بالأوبزيرفرز بيفضل ثابت — لو الحالة اتغيرت لأي حاجة تانية
    // (selected/rejected/pending) الأوبزيرفرز بيفضلوا شايفين اللاعب وبيشوفوا التغيير.

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true, runValidators: true }
    ).populate({ path: "team", select: "name clubName" });

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    // fire-and-forget — الـ response لا ينتظر الـ dashboard updates
    emitAdminDashboardUpdate();
    // §9 — اللاعب اليتيم مالوش كوتش يتبلّغ
    if (player.coach) emitCoachDashboardUpdate(player.coach);

    // عدد اللاعبين المتابَعين بيتغير للأوبزيرفرز الجداد والقدامى (لو اتشالوا) — كلهم محتاجين تحديث لايف
    const affectedObserverIds = new Set([
        ...beforeIds,
        ...(player.observers ?? []).map((id) => id.toString()),
    ]);
    affectedObserverIds.forEach((id) => emitObserverDashboardUpdate(id));

    // الكوتش بيتبلغ بس لما الحالة تبقى "selected" أو "rejected" — مش لما الأدمن يحط اللاعب "observed"
    // (ده مجرد تخصيص أوبزيرفر مؤقت، مش قرار نهائي يستاهل تنبيه)
    if (player.coach && (status === "selected" || status === "rejected")) {
        sendNotificationToUser(player.coach.toString(), {
            type: "PLAYER_STATUS_UPDATED",
            message: `The status of the player '${player.name}' changed to "${status}"`,
            playerId: player._id.toString(),
            status: player.status,
            createdAt: new Date(),
        });
    }

    // بلّغ الأوبزيرفرز الجداد إنهم اتخصصلهم لاعب، والباقيين إن الحالة اتغيرت
    (player.observers ?? []).forEach((observerId) => {
        const isNew = newlyAssignedObservers.includes(observerId.toString());
        sendNotificationToUser(observerId.toString(), {
            type: isNew ? "PLAYER_ASSIGNED_TO_OBSERVER" : "PLAYER_STATUS_UPDATED",
            message: isNew
                ? `A new player '${player.name}' has been assigned to you`
                : `The status of the player '${player.name}' changed to "${status}"`,
            playerId: player._id.toString(),
            status: player.status,
            createdAt: new Date(),
        });
    });

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Add/remove observers for a player without touching its status
//          (e.g. revoke one specific observer's access while keeping the rest)
// @route   PATCH api/v1/players/:id/observers
// @access  private - admin only
export const updatePlayerObservers = asyncHandler(async (req, res, next) => {
    const { observers } = req.body;

    const validIds = await validateObserverIds(observers ?? []);
    if (!validIds && (observers ?? []).length > 0) {
        return next(new AppError("One or more selected observers are not valid", 400));
    }

    const before = await Player.findById(req.params.id).select("observers");
    const beforeIds = new Set((before?.observers ?? []).map(String));

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        { observers: validIds ?? [] },
        { new: true, runValidators: true }
    ).populate({ path: "observers", select: "name" });

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    // عدد اللاعبين المتابَعين بيتغير للأوبزيرفرز الجداد والقدامى (لو اتشالوا) — كلهم محتاجين تحديث لايف
    const affectedObserverIds = new Set([
        ...beforeIds,
        ...(player.observers ?? []).map((o) => (o._id ?? o).toString()),
    ]);
    affectedObserverIds.forEach((id) => emitObserverDashboardUpdate(id));

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Assign (or re-assign) the coach who owns a player.
//          §9 — ده المخرج الوحيد للاعب "اليتيم" اللي كوتشه اتمسح نهائياً: من غيره
//          بيفضل مرئي للأدمن بس للأبد. الأدمن بس اللي بيقدر ينادي الراوت ده،
//          لأنه بيحوّل ملكية بيانات لاعب قاصر من حساب لحساب.
// @route   PATCH api/v1/players/:id/coach
// @access  private - admin only
export const assignPlayerCoach = asyncHandler(async (req, res, next) => {
    const { coach: coachId } = req.body;

    // لازم يكون يوزر نشط بدور coach — مش أي ObjectId
    const coachUser = await User.findOne({ _id: coachId, role: ROLES.COACH }).select("_id");
    if (!coachUser) {
        return next(new AppError("The selected coach is not a valid active coach", 400));
    }

    const before = await Player.findById(req.params.id).select("coach");
    if (!before) {
        return next(new AppError("Player not found", 404));
    }
    const previousCoachId = before.coach?.toString();

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        { coach: coachUser._id },
        { new: true, runValidators: true }
    ).populate({ path: "team", select: "name clubName" });

    // fire-and-forget — الكوتش الجديد كسب لاعب، والقديم (لو موجود) خسر واحد
    emitAdminDashboardUpdate();
    emitCoachDashboardUpdate(coachUser._id);
    if (previousCoachId && previousCoachId !== coachUser._id.toString()) {
        emitCoachDashboardUpdate(previousCoachId);
    }

    sendNotificationToUser(coachUser._id.toString(), {
        type: "PLAYER_ASSIGNED_TO_COACH",
        message: `The player '${player.name}' has been assigned to you`,
        playerId: player._id.toString(),
        status: player.status,
        createdAt: new Date(),
    });

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

const MAX_PLAYER_IMAGE_SIZE = 4 * 1024 * 1024;

export const uploadProfileImg = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("Please provide an image file", 400));
    }
    if (req.file.size > MAX_PLAYER_IMAGE_SIZE) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("حجم الصورة كبير جداً، الحد الأقصى 4 ميجا", 400));
    }

    const existing = await Player.findById(req.params.id).select("coach profileImg");
    if (!existing) {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("Player not found", 404));
    }
    // §9 — لاعب يتيم (بلا كوتش) مالوش مالك: 403 للكوتش، مش 500 من .toString() على null
    if (
        req.user.role === ROLES.COACH &&
        (!existing.coach || existing.coach.toString() !== req.user._id.toString())
    ) {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("You are not allowed to update this player's image", 403));
    }

    try {
        const buffer = await sharp(req.file.path)
            .resize({ width: 400, height: 500, fit: "cover" })
            .webp({ quality: 85 })
            .toBuffer();

        const key = buildKey("players", "webp");
        await uploadMediaImage(buffer, key, "image/webp");

        const player = await Player.findByIdAndUpdate(
            req.params.id,
            { profileImg: key },
            { new: true, runValidators: true }
        );

        // orphan fix: امسح الصورة القديمة (بيتجاهل روابط Cloudinary القديمة)
        await deleteMediaImage(existing.profileImg);

        res.status(200).json({
            status: "success",
            data: { profileImg: resolveImageUrl(key), player },
        });
    } finally {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    }
});