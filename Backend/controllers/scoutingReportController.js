import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import { deleteOne, gettingSpecific, updating } from "../services/services.js";
import { emitCoachDashboardUpdate, emitObserverDashboardUpdate } from "./dashboardController.js";
import AppError from "../utils/appError.js";
import { utcDayRange } from "../utils/time.js";
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
    const matchType = req.body.matchType || "official";
    const player = await Player.findById(req.params.playerId).select("team");

    // .optional() في express-validator بيتخطى الفيلد بس لو undefined خالص (مش null) —
    // فبنستخدم delete هنا مش null، عشان ميقعش في isMongoId()/الطول بتاع الفيلدات دي
    if (matchType === "training") {
        delete req.body.homeTeam;
        delete req.body.homeTeamName;
        delete req.body.awayTeam;
        delete req.body.awayTeamName;
        delete req.body.seasonMatch;
        return next();
    }

    if (matchType === "friendly") {
        if (player?.team) {
            req.body.homeTeam = player.team.toString();
            delete req.body.homeTeamName;
        }
        delete req.body.seasonMatch;
        return next();
    }

    // official
    if (!player?.team) return next();

    // audit-backend C3 — "النهاردة" بيوم UTC كامل، مش يوم بتوقيت السيرفر.
    // matchDate متخزّن منتصف ليل UTC، فيوم محلي كان بيزح النافذة بفرق التوقيت
    // ويخلي ماتش النهاردة يقع برّه النافذة في آخر/أول ساعات اليوم.
    const { start: dayStart, end: dayEnd } = utcDayRange(new Date());

    const todaysMatch = await SeasonMatch.findOne({
        $or: [{ homeTeam: player.team }, { awayTeam: player.team }],
        matchDate: { $gte: dayStart, $lt: dayEnd },
    }).setOptions({ skipPopulate: true });

    if (!todaysMatch) {
        return next(new AppError("You can only submit an official match report on a day your team has a scheduled match — use 'friendly' or 'training' instead", 400));
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

    const match = await SeasonMatch.findById(req.body.seasonMatch).setOptions({ skipPopulate: true });

    if (!match) {
        return next(new AppError("Season match not found", 404));
    }

    req.body.homeTeam = match.homeTeam;
    req.body.awayTeam = match.awayTeam;
    req.body.matchDate = match.matchDate;
    next();
});

// @desc    Create scouting report (author = the logged-in coach OR observer)
// @route   POST /api/v1/scouting
// @access  Private - coach & observer
export const create = asyncHandler(async (req, res, next) => {
    req.body.coach = req.user._id;
    const created = await ScoutingReport.create(req.body);
    const document = await ScoutingReport.findById(created._id).populate(reportPopulate);

    // عدد التقارير فى الداشبورد بتاع الكاتب (كوتش أو أوبزيرفر) بيتحدث لايف
    if (req.user.role === ROLES.OBSERVER) {
        emitObserverDashboardUpdate(req.user._id);
    } else {
        emitCoachDashboardUpdate(req.user._id);
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

    const documentCount = await ScoutingReport.countDocuments(features.query.getFilter());
    features.sort(REPORT_SORT_FIELDS).limitFields().paginate(documentCount);

    const documents = await features.query.populate(reportPopulate);

    // للأدمن بس: عدد ريبورتات الكوتشات مقابل الأوبزيرفرز على اللاعب ده (مستقل عن فلتر authorRole الحالي، عشان يبان في شكل الأيقونتين مع بعض)
    let authorCounts;
    if (req.user.role === ROLES.ADMIN) {
        const roleAgg = await ScoutingReport.aggregate([
            { $match: { player: new mongoose.Types.ObjectId(req.params.playerId) } },
            { $lookup: { from: "users", localField: "coach", foreignField: "_id", as: "author" } },
            { $unwind: "$author" },
            { $group: { _id: "$author.role", count: { $sum: 1 } } },
        ]);
        authorCounts = { [ROLES.COACH]: 0, [ROLES.OBSERVER]: 0 };
        roleAgg.forEach((r) => {
            if (r._id === ROLES.COACH || r._id === ROLES.OBSERVER) authorCounts[r._id] = r.count;
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
                passing:     { $avg: "$technical.passing" },
                dribbling:   { $avg: "$technical.dribbling" },
                shooting:    { $avg: "$technical.shooting" },
                ballControl: { $avg: "$technical.ballControl" },

                // Physical
                speed:    { $avg: "$physical.speed" },
                stamina:  { $avg: "$physical.stamina" },
                strength: { $avg: "$physical.strength" },
                agility:  { $avg: "$physical.agility" },

                // Mental
                positioning:    { $avg: "$mental.positioning" },
                decisionMaking: { $avg: "$mental.decisionMaking" },
                teamwork:       { $avg: "$mental.teamwork" },
                attitude:       { $avg: "$mental.attitude" },

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
                passing:        { $round: ["$passing", 2] },
                dribbling:      { $round: ["$dribbling", 2] },
                shooting:       { $round: ["$shooting", 2] },
                ballControl:    { $round: ["$ballControl", 2] },
                speed:          { $round: ["$speed", 2] },
                stamina:        { $round: ["$stamina", 2] },
                strength:       { $round: ["$strength", 2] },
                agility:        { $round: ["$agility", 2] },
                positioning:    { $round: ["$positioning", 2] },
                decisionMaking: { $round: ["$decisionMaking", 2] },
                teamwork:       { $round: ["$teamwork", 2] },
                attitude:       { $round: ["$attitude", 2] },
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
        passing: 0, dribbling: 0, shooting: 0, ballControl: 0,
        speed: 0, stamina: 0, strength: 0, agility: 0,
        positioning: 0, decisionMaking: 0, teamwork: 0, attitude: 0,
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
    const ids = idsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));

    if (!ids.length) {
        return res.status(200).json({ status: "success", data: { averages: {} } });
    }

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


