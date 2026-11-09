import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import AgeGroup from "../models/ageGroupModel.js";
import Team from "../models/teamModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import { deleteOne, gettingSpecific, updating } from "../services/services.js";
import { emitCoachDashboardUpdate, emitObserverDashboardUpdate } from "./dashboardController.js";
import AppError from "../utils/appError.js";
import { utcDayRange, utcRecentDaysRange } from "../utils/time.js";
import { ROLES } from "../constants/roles.js";
import { playerScopeFor } from "../services/scope.js";

// audit-database I2 — وايت ليست الترتيب. matchDate هو الترتيب الوحيد اللي الفرونت
// بيبعته (report-list.component.ts: sort: "-matchDate")، ومغطّى بـ
// player_1_matchDate_-1 — وقايمة التقارير دايماً مسكوبة على لاعب واحد فالـprefix
// موجود. قبل الإصلاح ?sort=overallRating كان COLLSCAN بيفحص 75,400 مستند لـ50.
const REPORT_SORT_FIELDS = ["matchDate", "createdAt"];

const reportPopulate = [
    { path: "coach", select: "name email role" },
    { path: "homeTeam", select: "name clubName" },
    { path: "awayTeam", select: "name clubName" },
    {
        path: "seasonMatch",
        select: "season matchDate homeTeam awayTeam",
        populate: [
            { path: "homeTeam", select: "name" },
            { path: "awayTeam", select: "name" },
        ],
    },
];

export const setPlayerToBody = (req, res, next) => {
    req.body.player = req.params.playerId;
    // التاريخ = تاريخ إنشاء الريبورت (من السيرفر) — مش بيتحدد من العميل ولا بيتغير
    req.body.matchDate = new Date();
    next();
};

// بيحدد شكل الفرق حسب matchType:
// - "training": مفيش فرق خالص — تدريب مش ضد حد.
// - "friendly": فريق اللاعب (لو متسجل) بيتحط تلقائي كـ homeTeam، والمنافس بيجي من العميل
//   (ref أو اسم حر) — مفيش قيد على التاريخ لأن الودية مش في جدول الموسم.
// - "official" (الافتراضي): لو فريق اللاعب متسجل، التقرير لازم يتربط بمباراة حقيقية بتاعت
//   الفريق ده حصلت النهارده بالظبط — مش homeTeam/awayTeam مكتوبين يدوي (اللي كان بيدّي
//   matchDate = تاريخ الإنشاء مش تاريخ المباراة الحقيقي، وده اللي كان بيسمح برفع تقرير
//   لمباراة خلصت من كذا يوم). بندور على مباراة النهارده ونحط الـ id بتاعها في seasonMatch
//   تلقائي، فـ resolveSeasonMatchToBody بعد كده بيملأ البيانات الحقيقية. لو اللاعب لسه مش
//   متسجل في أي فريق، مفيش جدول مباريات نربطه بيه أصلاً، فالإدخال اليدوي (ref أو اسم حر)
//   بيفضل زي ما هو من غير قيد على التاريخ.
export const resolveMatchTypeFields = asyncHandler(async (req, res, next) => {
    // ⚠️ كان هنا `req.body.matchType = "official"` — والميدلوير ده بيشتغل **قبل**
    // createValidate على الراوت، فالإسناد ده كان بيمسح قيمة العميل قبل ما التحقق
    // يشوفها: `isIn(["official"])` في scoutingValidation كان كود ميت، وتقرير
    // matchType=friendly كان بيتقبل بـ201 وبيتخزّن official في صمت.
    // دلوقتي القيمة بتوصل للتحقق زي ما هي فبترفض بـ400، والقيمة الافتراضية لما
    // العميل مايبعتش حاجة جاية من المخطط نفسه (default: "official").
    // perf — checkPlayerOwnership قبله على نفس الراوت جاب المستند ده بالفعل
    // (team وisProfessional ضمن الـselect بتاعه). الـfallback باقي لأن الدالة دي
    // متندهة في تستات من غير الحارس.
    const player =
        req.playerDoc ??
        (await Player.findById(req.params.playerId).select("team isProfessional"));

    // الكشاف قال صراحةً إن اللاعب لعب مع فئة عمرية معينة النهاردة (ممكن تكون غير
    // فئته هو — لاعب 2011 بيلعب مع 2010). بيتقدّم على البحث عن ماتش النهاردة تحت
    // عن قصد: لو قال لعب مع فئة تانية، مينفعش نربط تقريره غصب بماتش فريقه الأصلي.
    //
    // مفيش مضيف وضيف في المسار ده (طلب مالك 2026-09): فريق اللاعب هو الطرف
    // الأول دايماً وبيتحط من السيرفر — أي homeTeam/homeTeamName جاي من العميل
    // بيتشال، فمش ممكن يتسجّل تقرير بفريق مش فريق اللاعب. اللي العميل بيبعته هو
    // المنافس بس: إما ref لفريق من نفس الفئة اللي لعب معاها (التحقق بيفرض ده في
    // teamBelongsToReportAgeGroup) أو اسم حر لو الفئة مالهاش فرق مسجلة.
    //
    // .optional() في express-validator بيتخطى الفيلد بس لو undefined خالص (مش null) —
    // فبنستخدم delete هنا مش null، عشان ميقعش في isMongoId()/الطول بتاع الفيلدات دي
    if (req.body.playedWithAgeGroup) {
        // exists() بيرجع {_id} بس من الـindex بدل المستند كامل — الفحص هنا وجود لا أكتر
        const group = await AgeGroup.exists({ _id: req.body.playedWithAgeGroup });
        if (!group) {
            return next(new AppError(`No age group for this id: ${req.body.playedWithAgeGroup}`, 404));
        }

        // لاعب مواليد 2009 بيلعب مع فئة 2007 بتاعة **نفس النادي**: الفئة دي ليها
        // جدول مباريات حقيقي، فالتقرير المفروض يترتبط بالمباراة نفسها مش باسم
        // منافس مكتوب. لو العميل بعت المباراة، بنقبلها بدل الإدخال اليدوي —
        // وresolveSeasonMatchToBody بعد كده بياخد منها الفرق وmatchDate الحقيقي.
        //
        // الحراسة هنا لازمة لأن المباراة دي **برّه** فئة اللاعب، يعني القاعدة
        // القديمة ("مباراة فريقه هو") مابتنطبقش عليها. البديل تلات شروط:
        //   1) المباراة من نفس الفئة اللي قال إنه لعب معاها.
        //   2) طرف فيها فريق من **نفس نادي** اللاعب (المقارنة بـclubName — ده
        //      الرابط الوحيد بين الأهلي 2009 والأهلي 2007، فرقين مختلفين تماماً).
        //   3) اتلعبت فعلاً وجوه نافذة زمنية: النهاردة أو امبارح لغير
        //      الـproScout/الأدمن، وأي مباراة فاتت ليهم (نفس الرخصة الموجودة تحت).
        if (req.body.seasonMatch) {
            if (!player?.team) {
                return next(new AppError("This player has no registered team to match a fixture against", 400));
            }

            const chosen = await SeasonMatch.findById(req.body.seasonMatch);
            if (!chosen) {
                return next(new AppError("Season match not found", 404));
            }

            if (chosen.ageGroup?.toString() !== req.body.playedWithAgeGroup.toString()) {
                return next(new AppError("That match does not belong to the age group you selected", 400));
            }

            // استعلام واحد للتلات فرق (فريق اللاعب + طرفي المباراة) بدل تلاتة
            const teams = await Team.find({
                _id: { $in: [player.team, chosen.homeTeam, chosen.awayTeam] },
            }).select("clubName");
            const playerClub = teams.find((t) => t._id.equals(player.team))?.clubName;
            const sameClub =
                playerClub &&
                teams.some((t) => !t._id.equals(player.team) && t.clubName === playerClub);

            if (!sameClub) {
                return next(new AppError("That match does not involve a team from this player's club", 400));
            }

            const unrestricted =
                req.user.role === ROLES.PRO_SCOUT || req.user.role === ROLES.ADMIN;
            const { start, end } = unrestricted
                ? { start: null, end: utcDayRange(new Date()).end }
                : utcRecentDaysRange(1);

            if (chosen.matchDate >= end) {
                return next(new AppError("You cannot report on a match that has not been played yet", 400));
            }
            if (start && chosen.matchDate < start) {
                return next(new AppError("That match is too old — you can only report on today's or yesterday's match", 400));
            }

            delete req.body.homeTeam;
            delete req.body.homeTeamName;
            delete req.body.awayTeam;
            delete req.body.awayTeamName;
            return next();
        }

        if (player?.team) {
            req.body.homeTeam = player.team.toString();
            delete req.body.homeTeamName;
        }
        return next();
    }

    // official
    if (!player?.team) return next();

    // اللاعب المحترف مالوش فئة عمرية يختارها (playedModel بيتخطى اشتقاق ageGroup
    // للمحترفين)، فالمسار اليدوي بتاعه هو المنافس وحده من غير playedWithAgeGroup.
    // من غير الفرع ده كان بيقع في بحث ماتش النهاردة تحت ويترفض بـ400 رغم إن
    // الكشاف حدد المنافس صح — وهي الحالة اللي كانت متغطّاة بـ"ودية" قبل ما تتلغي.
    // فريق اللاعب هو الطرف الأول دايماً، زي فرع الفئة العمرية بالظبط.
    // شرط !seasonMatch مقصود: لو اختار مباراة من الجدول، الفرع اللي تحت هو اللي
    // بيتولاها (وبياخد منها matchDate الحقيقي) — الاختيار اليدوي مابيتقدّمش عليها.
    if (player.isProfessional && !req.body.seasonMatch && (req.body.awayTeam || req.body.awayTeamName)) {
        req.body.homeTeam = player.team.toString();
        delete req.body.homeTeamName;
        delete req.body.seasonMatch;
        return next();
    }

    // الـproScout مش مقيّد بيوم المباراة: بيكتب تقاريره وقت ما يقدر، مش لازم
    // في نفس يوم اللعب. القيد ده كان محسوس بشكل خاص عليه لأن مباريات دوري
    // المحترفين قليلة ومتباعدة، فكان معناه عملياً إن التقرير الرسمي شبه مقفول.
    //
    // اللي **ما اتغيّرش** هو الضمانة اللي القيد أصلاً موجود عشانها: التقرير
    // لازم يترتبط بمباراة **حقيقية من الجدول**، وmatchDate بيتاخد من المباراة
    // نفسها (في resolveSeasonMatchToBody تحت) مش من تاريخ الإنشاء. يعني تقرير
    // على مباراة الأسبوع اللي فات بيتسجّل بتاريخ المباراة الصح، مش النهاردة.
    // ده بالظبط اللي كان بيتكسر قبل ما القاعدة دي تتكتب.
    //
    // والمباراة لازم تكون بتاعت فريق اللاعب نفسه — مينفعش يربط تقريره بأي
    // مباراة في الجدول.
    // admin-assign-players-reports-media — الأدمن كمان مش مقيّد بيوم المباراة، لنفس
    // سبب الـproScout بالظبط: بيكتب تقارير وقت ما يقدر (على نفسه أو بالنيابة عن
    // أوبزيرفر معيَّن)، مش لازم في يوم اللعب. "مايتغيرش" هنا نفسها بالظبط.
    //
    // طلب مالك 2026-09 — الفرع ده بقى مفتوح لكل الرولات، مش للـproScout/الأدمن بس.
    // السبب إن الفورم ماعادش فيه قايمة اختيار للناشئ: بيلاقي مباراة فريقه في
    // الجدول (النهاردة أو امبارح) وبيبعتها **صريحة**. من غير كده كان الطلب
    // هيعدّي على البحث التلقائي تحت — اللي بيدوّر على النهاردة بس — فمباراة
    // امبارح كانت هتترفض بـ400 رغم إنها مباراة فريقه فعلاً.
    // الفرق بين الرولات بقى في **النافذة الزمنية** مش في الحق نفسه.
    if (req.body.seasonMatch) {
        const chosen = await SeasonMatch.findById(req.body.seasonMatch);

        if (!chosen) {
            return next(new AppError("Season match not found", 404));
        }

        const playerTeamId = player.team.toString();
        const involvesPlayerTeam =
            chosen.homeTeam?.toString() === playerTeamId ||
            chosen.awayTeam?.toString() === playerTeamId;

        if (!involvesPlayerTeam) {
            return next(new AppError("That match does not involve this player's team", 400));
        }

        // مباراة لسه ماتلعبتش مرفوضة لكل الرولات — مفيش حاجة اتشافت عشان تتقيّم.
        // المقارنة بنهاية يوم المباراة بالـUTC عشان ماتش النهاردة (متخزّن منتصف
        // ليل UTC) يفضل مسموح طول اليوم.
        if (chosen.matchDate >= utcDayRange(new Date()).end) {
            return next(new AppError("You cannot report on a match that has not been played yet", 400));
        }

        // الكوتش/الأوبزيرفر: النهاردة أو امبارح بس — نفس النافذة اللي الفورم
        // بيدوّر بيها. الـproScout والأدمن مش مقيّدين بيوم المباراة (رخصة قائمة:
        // مباريات المحترفين متباعدة، والأدمن بيكتب بالنيابة وقت ما يقدر).
        const unrestricted =
            req.user.role === ROLES.PRO_SCOUT || req.user.role === ROLES.ADMIN;
        if (!unrestricted && chosen.matchDate < utcRecentDaysRange(1).start) {
            return next(
                new AppError("That match is too old — you can only report on today's or yesterday's match", 400)
            );
        }

        delete req.body.homeTeam;
        delete req.body.homeTeamName;
        delete req.body.awayTeam;
        delete req.body.awayTeamName;
        return next();
    }

    // audit-backend C3 — "النهاردة" بيوم UTC كامل، مش يوم بتوقيت السيرفر.
    // matchDate متخزّن منتصف ليل UTC، فيوم محلي كان بيزح النافذة بفرق التوقيت
    // ويخلي ماتش النهاردة يقع برّه النافذة في آخر/أول ساعات اليوم.
    const { start: dayStart, end: dayEnd } = utcDayRange(new Date());

    const todaysMatch = await SeasonMatch.findOne({
        $or: [{ homeTeam: player.team }, { awayTeam: player.team }],
        matchDate: { $gte: dayStart, $lt: dayEnd },
    });

    if (!todaysMatch) {
        return next(new AppError("No scheduled match for this player's team today — choose the age group he played with and the opposing team", 400));
    }

    req.body.seasonMatch = todaysMatch._id.toString();
    delete req.body.homeTeam;
    delete req.body.homeTeamName;
    delete req.body.awayTeam;
    delete req.body.awayTeamName;
    next();
});

// @desc    Resolve homeTeam/awayTeam/matchDate from the linked seasonMatch (if provided)
export const resolveSeasonMatchToBody = asyncHandler(async (req, res, next) => {
    if (!req.body.seasonMatch) return next();

    const match = await SeasonMatch.findById(req.body.seasonMatch);

    if (!match) {
        return next(new AppError("Season match not found", 404));
    }

    req.body.homeTeam = match.homeTeam;
    req.body.awayTeam = match.awayTeam;
    req.body.matchDate = match.matchDate;
    next();
});

// @desc    Create scouting report (author = the logged-in coach/observer/proScout,
//          or — admin only — an observer assigned to this player on the admin's behalf)
// @route   POST /api/v1/scouting
// @access  Private - coach, observer, proScout & admin
export const create = asyncHandler(async (req, res, next) => {
    // admin-assign-players-reports-media — effectiveAuthor هو مين هيتسجل كـcoach
    // (اسم الحقل تاريخي، هو حقل "المؤلف" الفعلي). افتراضياً صاحب التوكن نفسه —
    // بيتغير بس لو الأدمن بعت assignedObserver (lockFieldExceptAdmin في
    // scoutingValidation.js بيمنع أي رول تاني من إرساله أصلاً).
    let effectiveAuthor = req.user._id;
    let authorIsObserver = req.user.role === ROLES.OBSERVER;

    if (req.user.role === ROLES.ADMIN && req.body.assignedObserver) {
        // لازم يبقى أوبزيرفر معيَّن فعلاً على اللاعب ده — من غير الفحص ده التقرير
        // بيتسجل بمؤلف هيترفض بعد كده بـ403 من checkPlayerOwnership/checkReportOwnership
        // على نفس اللاعب (بيانات ميتة، مالهاش صاحب يقدر يوصلها).
        // perf — نفس مستند checkPlayerOwnership (observers ضمن الـselect بتاعه)
        const player =
            req.playerDoc ?? (await Player.findById(req.params.playerId).select("observers"));
        const isAssigned = (player?.observers ?? []).some(
            (o) => o.toString() === req.body.assignedObserver.toString()
        );
        if (!isAssigned) {
            return next(new AppError("The selected observer is not assigned to this player", 400));
        }

        const observerUser = await User.findOne({ _id: req.body.assignedObserver, role: ROLES.OBSERVER }).select("_id");
        if (!observerUser) {
            return next(new AppError("The selected observer is not a valid active observer", 400));
        }

        effectiveAuthor = observerUser._id;
        authorIsObserver = true;
    }

    // نفس الفكرة للاعب المحترف: مالكه هو الـproScout اللي في createdBy، فالأدمن
    // يقدر يكتب التقرير باسمه عشان يظهر في تقاريره هو (getAll بيفلتر غير الأدمن على coach = me).
    if (req.user.role === ROLES.ADMIN && req.body.assignedProScout) {
        if (req.body.assignedObserver) {
            return next(new AppError("Choose either an observer or a proScout, not both", 400));
        }
        // perf — نفس مستند checkPlayerOwnership (createdBy ضمن الـselect بتاعه)
        const player =
            req.playerDoc ?? (await Player.findById(req.params.playerId).select("createdBy"));
        if (player?.createdBy?.toString() !== req.body.assignedProScout.toString()) {
            return next(new AppError("The selected proScout does not own this player", 400));
        }

        const scoutUser = await User.findOne({ _id: req.body.assignedProScout, role: ROLES.PRO_SCOUT }).select("_id");
        if (!scoutUser) {
            return next(new AppError("The selected proScout is not a valid active proScout", 400));
        }

        effectiveAuthor = scoutUser._id;
    }
    delete req.body.assignedObserver;
    delete req.body.assignedProScout;

    // منع تكرار (player, coach, seasonMatch) — المؤشر الفريد في الموديل بيرفضه
    // برسالة واضحة بس في production (errorMiddleware.dublicateKeyHandler)؛ في
    // development كان هيطلع 500. الفحص الصريح ده بيقفل الفجوة دي في كل بيئة.
    if (req.body.seasonMatch) {
        const duplicate = await ScoutingReport.exists({
            player: req.params.playerId,
            coach: effectiveAuthor,
            seasonMatch: req.body.seasonMatch,
        });
        if (duplicate) {
            return next(new AppError("A report for this match by this author already exists", 400));
        }
    }

    req.body.coach = effectiveAuthor;
    const created = await ScoutingReport.create(req.body);
    const document = await ScoutingReport.findById(created._id).populate(reportPopulate);

    // عدد التقارير فى الداشبورد بتاع الكاتب (كوتش أو أوبزيرفر) بيتحدث لايف.
    // admin-assign-players-reports-media — الأدمن اللي بيؤلف لنفسه (من غير
    // assignedObserver) مالوش داشبورد كوتش/أوبزيرفر يتحدث، فمفيش emit في الحالة دي.
    if (authorIsObserver) {
        emitObserverDashboardUpdate(effectiveAuthor);
    } else if (req.user.role !== ROLES.ADMIN || effectiveAuthor !== req.user._id) {
        emitCoachDashboardUpdate(effectiveAuthor);
    }

    res.status(201).json({
        status: "success",
        data: { document },
    });
});

// @desc    Get all scouting reports for a player
// @route   GET /api/v1/players/:playerId/reports
// @access  Private - coach & observer see only their OWN reports; admin sees all (optionally filtered by authorRole)
export const getAll = asyncHandler(async (req, res, next) => {
    // نطاق التقارير = تقارير اللاعب ده — وغير الأدمن يشوف تقاريره هو بس (coach = الكاتب)
    const baseFilter = { player: req.params.playerId };
    if (req.user.role !== ROLES.ADMIN) {
        baseFilter.coach = req.user._id;
    } else if (req.query.authorRole) {
        // الأدمن بس يقدر يفلتر يشوف تقارير الكشافين بس أو الأوبزيرفرز بس
        const authors = await User.find({ role: req.query.authorRole }).select("_id");
        baseFilter.coach = { $in: authors.map((a) => a._id) };
    }

    // §11 — البحث في notes اتشال: مفيش أي مستهلك في الفرونت (ولا service بيبعت
    // keyword للمسار ده)، والـprefix مالوش معنى على نص طويل. كان COLLSCAN مقنّع
    // داخل سكوب اللاعب. لو احتجناه بعدين، $text على notes هو الشكل الصح.
    const features = new ApiFeature(ScoutingReport.find(baseFilter), req.query, req.params, req.user);

    // perf audit — العدّ والجلب مستقلين، فبيتنفذوا مع بعض. نفس الفلتر للاتنين.
    const countFilter = features.query.getFilter();
    features.sort(REPORT_SORT_FIELDS).limitFields().applyPagination();

    const [documentCount, documents] = await Promise.all([
        ScoutingReport.countDocuments(countFilter),
        features.query.populate(reportPopulate),
    ]);
    features.buildPagination(documentCount);

    // للأدمن بس: عدد ريبورتات الكوتشات مقابل الأوبزيرفرز على اللاعب ده (مستقل عن فلتر authorRole الحالي، عشان يبان في شكل الأيقونتين مع بعض)
    let authorCounts;
    if (req.user.role === ROLES.ADMIN) {
        const roleAgg = await ScoutingReport.aggregate([
            { $match: { player: new mongoose.Types.ObjectId(req.params.playerId) } },
            { $lookup: { from: "users", localField: "coach", foreignField: "_id", as: "author" } },
            { $unwind: "$author" },
            { $group: { _id: "$author.role", count: { $sum: 1 } } },
        ]);
        authorCounts = { [ROLES.COACH]: 0, [ROLES.OBSERVER]: 0, [ROLES.PRO_SCOUT]: 0 };
        roleAgg.forEach((r) => {
            if (r._id in authorCounts) authorCounts[r._id] = r.count;
        });
    }

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        ...(authorCounts && { authorCounts }),
        data: { documents },
    });
});

// @desc    Get specific scouting report
// @route   GET /api/v1/scouting/:id
// @access  Private - coach & admin
export const getSpecific = gettingSpecific(ScoutingReport, reportPopulate);

// @desc    Update scouting report
// @route   PATCH /api/v1/scouting/:id
// @access  Private - coach only
export const update = updating(ScoutingReport, reportPopulate);

// @desc    Delete scouting report
// @route   DELETE /api/v1/scouting/:id
// @access  Private - admin only
export const deleting = deleteOne(ScoutingReport);

// @desc    Get player statistics
// @route   GET /api/v1/players/:playerId/reports/statistics
// @access  Private - coach & admin
export const getPlayerStatistics = asyncHandler(async (req, res, next) => {
    const { playerId } = req.params;

    // نفس منطق النطاق: غير الأدمن يشوف إحصائيات تقاريره هو بس
    const match = { player: new mongoose.Types.ObjectId(playerId) };
    if (req.user.role !== ROLES.ADMIN) {
        match.coach = new mongoose.Types.ObjectId(req.user._id);
    }

    const stats = await ScoutingReport.aggregate([
        // فلتر التقارير بتاعة اللاعب ده بس
        { $match: match },

        // احسب المتوسطات
        {
            $group: {
                _id: "$player",
                totalReports: { $sum: 1 },
                overallRating: { $avg: "$overallRating" },

                // Technical
                turning:      { $avg: "$technical.turning" },
                dribbling:    { $avg: "$technical.dribbling" },
                tackling:     { $avg: "$technical.tackling" },
                twoFooted:    { $avg: "$technical.twoFooted" },
                longPassing:  { $avg: "$technical.longPassing" },
                shortPassing: { $avg: "$technical.shortPassing" },
                heading:      { $avg: "$technical.heading" },

                // Physical
                shortSprints: { $avg: "$physical.shortSprints" },
                longSprints:  { $avg: "$physical.longSprints" },
                agility:      { $avg: "$physical.agility" },
                aerialDuels:  { $avg: "$physical.aerialDuels" },
                groundDuels:  { $avg: "$physical.groundDuels" },

                // Mental
                vision:      { $avg: "$mental.vision" },
                personality: { $avg: "$mental.personality" },
                movement:    { $avg: "$mental.movement" },

                // اخر تقرير
                lastReport: { $max: "$matchDate" },
            },
        },

        // رتب الـ output — فلات زي ما موثّق في swagger (ReportStatistics schema)، مش متداخل
        // تحت technical/physical/mental
        {
            $project: {
                _id: 0,
                totalReports: 1,
                lastReport: 1,
                overallRating: { $round: ["$overallRating", 2] },
                turning:      { $round: ["$turning", 2] },
                dribbling:    { $round: ["$dribbling", 2] },
                tackling:     { $round: ["$tackling", 2] },
                twoFooted:    { $round: ["$twoFooted", 2] },
                longPassing:  { $round: ["$longPassing", 2] },
                shortPassing: { $round: ["$shortPassing", 2] },
                heading:      { $round: ["$heading", 2] },
                shortSprints: { $round: ["$shortSprints", 2] },
                longSprints:  { $round: ["$longSprints", 2] },
                agility:      { $round: ["$agility", 2] },
                aerialDuels:  { $round: ["$aerialDuels", 2] },
                groundDuels:  { $round: ["$groundDuels", 2] },
                vision:       { $round: ["$vision", 2] },
                personality:  { $round: ["$personality", 2] },
                movement:     { $round: ["$movement", 2] },
            },
        },
    ]);

    // مفيش تقارير للاعب ده لسه — دي حالة طبيعية (لاعب جديد)، مش خطأ صلاحيات
    // ولا بيانات ناقصة، فبترجع 200 بإحصائيات فاضية بدل 404. نفس المبدأ المتبع
    // في proScout: "مفيش بيانات" = 200 بجسم فارغ، مش رفض
    const empty = {
        totalReports: 0,
        lastReport: null,
        overallRating: 0,
        turning: 0, dribbling: 0, tackling: 0, twoFooted: 0, longPassing: 0, shortPassing: 0, heading: 0,
        shortSprints: 0, longSprints: 0, agility: 0, aerialDuels: 0, groundDuels: 0,
        vision: 0, personality: 0, movement: 0,
    };

    res.status(200).json({
        status: "success",
        data: {
            statistics: stats.length ? stats[0] : empty,
        },
    });
});

// @desc    Average overall rating across all reports, batched for a list of players (player-list cards)
// @route   GET /api/v1/players/reports/average-ratings?ids=id1,id2,...
// @access  Private - coach, admin, observer
export const getAverageRatingsForPlayers = asyncHandler(async (req, res, next) => {
    const idsParam = (req.query.ids || "").toString();

    // ── audit-backend — ?ids= كان آخر مدخل عميل بلا سقف ─────────────────────
    //
    // الشكل القديم كان بياخد قائمة مفصولة بفاصلة بأي طول ويحطها في $in جوه
    // aggregation. أي مستخدم موثَّق كان يقدر يبعت 50,000 id على سرعة الـrate
    // limiter. ApiFeature قافل limit (200) وkeyword (50 حرف)، وده كان الباقي.
    //
    // السقف = ApiFeature.MAX_LIMIT بالمرجع مش برقم منسوخ — القائمة دي جاية من
    // صفحة لاعبين مسقوفة بنفس الرقم، فلو اتغير هناك يتغير هنا معاه.
    //
    // ⚠️ 400 مش slice(0, 200). المراجعة الأصلية انتقدت إسقاط ApiFeature الصامت
    // لحقل الترتيب بالظبط لنفس السبب: الرد الجزئي الصامت بيخلي المستدعي يفتكر
    // إنه خد كل حاجة. حطّينا حارس بيرمي هناك — فمنرجّعش نفس النمط هنا.
    //
    // الفواصل الفاضية (فاصلة زايدة في الآخر) بتتجاهل: ده تشويه في الشكل مش
    // معرّف غلط. أما id مش فاضي وشكله غلط فبيترفض بـ400 — عمره ما هيطابق
    // لاعب، فقبوله بصمت بيخفي باج في العميل ومايفيد حد. والـendpoint دي
    // بترجّع map مفاتيحه ids، فالصمت هنا كان بيبان زي "اللاعب مالوش تقارير".
    const raw = idsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

    if (!raw.length) {
        return res.status(200).json({ status: "success", data: { averages: {} } });
    }

    // السقف الأول: أرخص فحص، وهو الحماية الأهم
    if (raw.length > ApiFeature.MAX_LIMIT) {
        return next(
            new AppError(
                `Too many player ids: ${raw.length}. The maximum is ${ApiFeature.MAX_LIMIT}.`,
                400
            )
        );
    }

    const malformed = raw.filter((id) => !mongoose.isValidObjectId(id));
    if (malformed.length) {
        const shown = malformed.slice(0, 5).join(", ");
        const more = malformed.length > 5 ? ` (and ${malformed.length - 5} more)` : "";
        return next(
            new AppError(
                `Invalid player id${malformed.length > 1 ? "s" : ""}: ${shown}${more}`,
                400
            )
        );
    }

    const ids = raw.map((id) => new mongoose.Types.ObjectId(id));

    // Stage 2 — تضييق قائمة الـids للاعبين داخل نطاق الـproScout قبل ما الـpipeline
    // تشتغل. الـendpoint دي كانت **مسكوبة بالفعل** لغير الأدمن (السطر تحت) لكن على
    // المحور الغلط: ملكية التقرير، مش دوري اللاعب. يعني كانت بتقبل أي قائمة ids
    // وبترد على أسئلة عن لاعبين ممكن السائل مالوش حق يعرف بوجودهم أصلاً.
    //
    // التضييقين بيتقاطعوا ومابيستبدلوش بعض: التقييد على ملكية التقرير تحت بيفضل
    // شغال كما هو. إسقاطه كان هيبقى **توسيع** — وكان هيخلّي الـproScout الرول
    // الوحيد غير الأدمن اللي بيقرا تقارير غيره (research R7).
    let scopedIds = ids;
    const playerScope = await playerScopeFor(req);
    if (Object.keys(playerScope).length) {
        scopedIds = await Player.find({ $and: [{ _id: { $in: ids } }, playerScope] }).distinct("_id");
        if (!scopedIds.length) {
            return res.status(200).json({ status: "success", data: { averages: {} } });
        }
    }

    // نفس منطق النطاق زي getPlayerStatistics: غير الأدمن يشوف متوسط تقاريره هو بس
    const match = { player: { $in: scopedIds } };
    if (req.user.role !== ROLES.ADMIN) {
        match.coach = new mongoose.Types.ObjectId(req.user._id);
    }

    const agg = await ScoutingReport.aggregate([
        { $match: match },
        {
            $group: {
                _id: "$player",
                overallRating: { $avg: "$overallRating" },
                totalReports: { $sum: 1 },
            },
        },
    ]);

    const averages = {};
    agg.forEach((a) => {
        averages[a._id.toString()] = {
            overallRating: Math.round(a.overallRating * 100) / 100,
            totalReports: a.totalReports,
        };
    });

    res.status(200).json({ status: "success", data: { averages } });
});


