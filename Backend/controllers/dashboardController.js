import mongoose from "mongoose";
import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import User from "../models/userModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import asyncHandler from "express-async-handler";
import {
    sendNotificationToAdmins,
    sendNotificationToUser,
    getConnectedAdminIds,
} from "../socket/handlers/notification.js";
import { getConnectedUsers } from "../socket/index.js";

// ============================
// §11 — كاش TTL في الذاكرة لداشبورد الأدمن
// ============================
//
// ليه كاش أصلاً: الاستعلامين دول هما الوحيدين في المشروع اللي مايقدرش أي index
// يغطيهم — $group على كل الكولكشن لازم يقرا كل مستند بحكم التعريف. مقيس بـexplain
// على 5000 لاعب: byStatus بيفحص 5000، وtopCoaches بيفحص 5000 كمان ($group ثم
// $sort ثم $lookup)، وgetAllCoachesStats نفس الحكاية. يعني فتح صفحة الأدمن
// بيقرا الكولكشن تلات مرات. ده مش عيب في الاستعلام — ده طبيعة الـaggregation،
// فالحل الوحيد هو تقليل عدد المرات اللي بتتنفذ فيها، مش تسريعها.
//
// ليه مفتاح عام (global) آمن هنا: الدالتين allowedTo("admin") وبيرجّعوا إحصائيات
// على مستوى الموقع كله — مافيش ولا قراءة لـreq.user ولا req.params ولا req.query
// في أي منهم. فمفيش "نسخة لكل مستخدم" أصلاً عشان تتخلط.
//
// ⛔ داشبورد الكوتش والأوبزيرفر **مش** متكاشيين ولا هيتكاشوا تحت المفتاح ده:
// getCoachDashboardData/getObserverDashboardData بياخدوا id ونتيجتهم مسكوبة
// بالملكية. كاش بمفتاح مشترك عليهم = تسريب بيانات من دور لدور. أي كاش ليهم
// مستقبلاً لازم يكون المفتاح فيه الـuserId، وده قرار منفصل.
//
// ليه TTL مش invalidate-on-write: الإبطال عند الكتابة معناه إن كل مسار بيلمس
// Player (create/update/status/observers/coach + الكرونز) يفتكر يبطّل الكاش —
// سطر واحد منسي = أرقام غلط للأبد. الـTTL بيغلط في الاتجاه الآمن: أسوأ حالة
// تأخير محدود بـ45 ثانية، والصح بيرجع لوحده من غير ما حد يفتكر حاجة.
//
// ⚠️ الكاش لكل بروسيس (in-memory): مع أكتر من instance كل واحد ليه نسخته، يعني
// أدمنين على instance-ين مختلفين ممكن يشوفوا أرقام مختلفة لحد 45 ثانية. مقبول
// لإحصائيات عرض؛ لو المشروع اتوسّع لأكتر من instance وده بقى مزعج، المكان
// الصح ساعتها Redis مش تكبير الـTTL.
const DASHBOARD_CACHE_TTL_MS = 45_000;

const ADMIN_OVERVIEW_KEY = "admin:overview";
const COACHES_STATS_KEY = "admin:coachesStats";

const dashboardCache = new Map();

const readCache = (key) => {
    const hit = dashboardCache.get(key);
    if (!hit) return null;

    if (hit.expiresAt <= Date.now()) {
        dashboardCache.delete(key);
        return null;
    }

    return hit.data;
};

// بترجّع الداتا عشان تنفع تتكتب وتترجّع في سطر واحد
const writeCache = (key, data) => {
    dashboardCache.set(key, { expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS, data });
    return data;
};

// للتستات بس — الكاش بيعيش في الذاكرة فمابيتمسحش مع مسح الكولكشنز في beforeEach.
// من غير النداء ده تست كان هياخد أرقام تست قبله. متنادى من tests/setup.js.
export const __resetDashboardCache = () => dashboardCache.clear();

// ملحوظة: النسخة المكاشية بترجع بالـreference لكل المستدعيين. ده آمن لأن ولا
// مستدعي بيعدّل فيها: adminDashboard بيعملها serialize في الرد، و
// sendNotificationToAdmins بيعملها emit بس (اتراجعت — مافيهاش أي كتابة ولا حفظ
// في الداتابيز). أي مستدعي جديد بيعدّل في الناتج لازم ياخد نسخة الأول.

// ============================
// helpers
// ============================
const computeAdminDashboardData = async () => {
    // كل الكاونتس اللي من غير فلتر بتستخدم estimatedDocumentCount() (metadata، مش full scan)
    // عشان صفحة الأدمن داشبورد متتباطأش مع كبر الكولكشنز
    const [
        byStatusRows,
        totalPlayers,
        totalReports,
        totalMedia,
        totalCoaches,
        totalObservers,
        totalMatchesPlayed,
        topCoaches,
    ] = await Promise.all([
        // byStatus بيتعمله index scan على status:1 (مغطى بالإندكس) — سريع حتى لو الكولكشن كبرت
        Player.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
        // بدون فلتر — estimatedDocumentCount() بتستخدم metadata الكولكشن بدل full scan، فبتفضل سريعة مهما كبر الكولكشن
        Player.estimatedDocumentCount(),
        ScoutingReport.estimatedDocumentCount(),
        PlayerMedia.estimatedDocumentCount(),
        User.countDocuments({ role: "coach" }),
        User.countDocuments({ role: "observer" }),
        // عدد كل المباريات اللي اتلعبت فعلاً (تاريخها النهاردة أو قبل كده) على مستوى الموقع كله
        SeasonMatch.countDocuments({
            matchDate: { $lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        }),
        Player.aggregate([
            { $match: { status: "selected" } },
            { $group: { _id: "$coach", selectedPlayers: { $sum: 1 } } },
            { $sort: { selectedPlayers: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "coach",
                },
            },
            { $unwind: "$coach" },
            {
                $project: {
                    _id: 0,
                    coachName: "$coach.name",
                    selectedPlayers: 1,
                },
            },
        ]),
    ]);

    const statusMap = {};
    byStatusRows.forEach((s) => { statusMap[s._id] = s.count; });

    const selectedPlayers = statusMap["selected"]    ?? 0;
    const pendingPlayers  = statusMap["pending"]     ?? 0;
    const rejectedPlayers = statusMap["rejected"]    ?? 0;

    return {
        totalPlayers,
        selectedPlayers,
        pendingPlayers,
        rejectedPlayers,
        totalReports,
        totalMedia,
        totalCoaches,
        totalObservers,
        totalMatchesPlayed,
        topCoaches,
        selectionRate:
            totalPlayers === 0
                ? 0
                : Number((selectedPlayers / totalPlayers) * 100).toFixed(2),
    };
};

// §11 — الغلاف المكاشي. fresh: true بيتخطّى **القراءة** بس وبيفضل بيكتب.
//
// ليه المسارين مش متساويين: emitAdminDashboardUpdate بيشتغل بعد كل تعديل على
// لاعب، والفرونت (socket.service.ts:51) بيستقبل الـpayload ويستبدل بيه بيانات
// الداشبورد بالكامل — مش بيدمجه. يعني payload قديم مش بيقعد ساكت، ده بيمسح
// أرقام صح من على شاشة أدمن قاعد بيتفرج دلوقتي. فالـpush لازم يبقى محسوب
// لحظتها، وده اللي fresh: true بيعمله.
//
// وبيكتب برضه (مش bypass كامل) عشان الـemit يسخّن الكاش: التعديل اللي بوّظ
// الأرقام هو نفسه اللي بيحدّثها، فقراءة GET /dashboard/admin بعديها بتلاقي
// نسخة طازة بدل ما تدفع تمن aggregation تاني.
//
// المسار الساخن نفسه محمي فوق بفحص "فيه أدمن متصل؟" (بند 6) — من غير أدمن
// أونلاين الدالة دي عمرها ما بتتنادى من الـemit أصلاً.
const getAdminDashboardData = async ({ fresh = false } = {}) => {
    if (!fresh) {
        const cached = readCache(ADMIN_OVERVIEW_KEY);
        if (cached) return cached;
    }

    return writeCache(ADMIN_OVERVIEW_KEY, await computeAdminDashboardData());
};

const getCoachDashboardData = async (coachId) => {
    // 4 countDocuments دُمجت في aggregate واحد (4 round-trips → 1)
    const [playerStats, totalReports, matchesAttended] = await Promise.all([
        Player.aggregate([
            { $match: { coach: new mongoose.Types.ObjectId(coachId) } },
            {
                $facet: {
                    byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                    total:    [{ $count: "count" }],
                },
            },
        ]),
        ScoutingReport.countDocuments({ coach: coachId }),
        // عدد المباريات الى الكوتش اتحدد كحاضر فيها وفعلاً اتلعبت (تاريخها النهاردة أو قبل كده)
        // بنقارن بآخر لحظة فى اليوم النهاردة (مش لحظة "دلوقتي" بالظبط) عشان مباراة النهاردة
        // اللي لسه في أول اليوم (فرق التوقيت UTC) تتحسب "حاضرة" على طول من غير race condition
        SeasonMatch.countDocuments({
            attendees: coachId,
            matchDate: { $lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        }),
    ]);

    const facet = playerStats[0];
    const statusMap = {};
    facet.byStatus.forEach((s) => { statusMap[s._id] = s.count; });

    const totalPlayers    = facet.total[0]?.count    ?? 0;
    const selectedPlayers = statusMap["selected"]    ?? 0;
    // الكوتش مبيشوفش "observed" — بتتحسب معاه كأنها "pending"
    const pendingPlayers  = (statusMap["pending"] ?? 0) + (statusMap["observed"] ?? 0);
    const rejectedPlayers = statusMap["rejected"]    ?? 0;

    return {
        totalPlayers,
        selectedPlayers,
        pendingPlayers,
        rejectedPlayers,
        totalReports,
        matchesAttended,
        selectionRate:
            totalPlayers === 0
                ? 0
                : Number((selectedPlayers / totalPlayers) * 100).toFixed(2),
    };
};

const getObserverDashboardData = async (observerId) => {
    const [totalPlayersObserved, totalReports, totalMedia, totalMatches] = await Promise.all([
        // عدد اللاعبين المتابَعين من الأوبزيرفر ده (موجود فى مصفوفة observers بتاعتهم)
        Player.countDocuments({ observers: observerId }),
        // التقارير الى كتبها — حقل coach فى الموديل هو الكاتب بغض النظر عن الدور
        ScoutingReport.countDocuments({ coach: observerId }),
        // الميديا الى رفعها
        PlayerMedia.countDocuments({ uploadedBy: observerId }),
        // عدد المباريات الى اتحدد كحاضر فيها وفعلاً اتلعبت (تاريخها النهاردة أو قبل كده)
        SeasonMatch.countDocuments({
            attendees: observerId,
            matchDate: { $lte: new Date(new Date().setHours(23, 59, 59, 999)) },
        }),
    ]);

    return { totalPlayersObserved, totalReports, totalMedia, totalMatches };
};

// ============================
// Coach Dashboard
// ✅ الكوتش يشوف بتاعه — الأدمن يشوف كوتش معين
// ============================
export const getCoachDashboard = asyncHandler(async (req, res, next) => {
    const coachId =
        req.user.role === "admin"
            ? req.params.coachId  // ✅ الأدمن بيمرر coachId في الـ params
            : req.user._id;       // ✅ الكوتش بياخد id بتاعه تلقائي

    const data = await getCoachDashboardData(coachId);

    res.status(200).json({
        status: "success",
        data,
    });
});

// ============================
// Observer Dashboard
// ✅ الأوبزيرفر يشوف بتاعه — الأدمن يشوف أوبزيرفر معين
// ============================
export const getObserverDashboard = asyncHandler(async (req, res, next) => {
    const observerId =
        req.user.role === "admin"
            ? req.params.observerId
            : req.user._id;

    const data = await getObserverDashboardData(observerId);

    res.status(200).json({
        status: "success",
        data,
    });
});

// ============================
// Admin Dashboard العام
// ============================
export const adminDashboard = asyncHandler(async (req, res) => {
    const data = await getAdminDashboardData();

    res.status(200).json({
        status: "success",
        data,
    });
});

// ============================
// Bulk per-coach stats — لتفادي إن صفحة الكباتن تعمل ريكويست لكل كوتش لوحده (N+1)
// ============================
const computeAllCoachesStats = async () => {
    const rows = await Player.aggregate([
        {
            $group: {
                _id: "$coach",
                totalPlayers: { $sum: 1 },
                selectedPlayers: {
                    $sum: { $cond: [{ $eq: ["$status", "selected"] }, 1, 0] },
                },
            },
        },
    ]);

    const stats = {};
    rows.forEach((r) => {
        // §9 — اللاعب اليتيم (coach = null) بيدخل في مجموعة _id: null وبيتشال هنا:
        // مالوش كوتش يتحسبله. الأدمن بيلاقيه من فلتر ?coach=none بدل كده.
        if (r._id) {
            stats[r._id.toString()] = {
                totalPlayers: r.totalPlayers,
                selectedPlayers: r.selectedPlayers,
            };
        }
    });

    return stats;
};

export const getAllCoachesStats = asyncHandler(async (req, res) => {
    // §11 — مالهاش غير مستدعي واحد (الراوت ده)، فمافيش مسار بيحتاج fresh هنا
    let stats = readCache(COACHES_STATS_KEY);
    if (!stats) {
        stats = writeCache(COACHES_STATS_KEY, await computeAllCoachesStats());
    }

    res.status(200).json({
        status: "success",
        data: { stats },
    });
});

// ============================
// Socket Emitters
// ============================
export const emitAdminDashboardUpdate = async () => {
    try {
        // §11 — الفحص لازم يكون "هل فيه أدمن متصل"، مش "هل فيه أي حد متصل".
        // الشرط القديم كان getConnectedUsers().size === 0، يعني كوتش واحد أونلاين
        // كان بيخلي كل إنشاء/تعديل لاعب يشغّل getAdminDashboardData بالكامل — 8
        // استعلامات، منهم مسحين كاملين على Player (byStatus group وtopCoaches) —
        // وبعدين يبعت لصفر أدمن. الفرق مقيس بـexplain: 5000 مستند بيتقروا مرتين
        // لكل كتابة مقابل استعلام واحد على index الـrole.
        //
        // الـids بتترحّل لـsendNotificationToAdmins عشان الاستعلام مايتكررش.
        const adminIds = await getConnectedAdminIds();
        if (adminIds.length === 0) return;

        // fresh: true — الـpush بيستبدل بيانات الداشبورد على الشاشة بالكامل،
        // فنسخة مكاشية هنا معناها مسح أرقام صح بأرقام أقدم منها
        const data = await getAdminDashboardData({ fresh: true });
        await sendNotificationToAdmins({
            type: "ADMIN_DASHBOARD_UPDATE",
            data,
        }, adminIds);
    } catch (error) {
        console.error("Admin dashboard update error:", error);
    }
};

export const emitCoachDashboardUpdate = async (coachId) => {
    try {
        // تجنب الـ aggregation لو الـ coach أوفلاين
        if (!getConnectedUsers().get(coachId.toString())) return;
        const data = await getCoachDashboardData(coachId);
        sendNotificationToUser(coachId.toString(), {
            type: "COACH_DASHBOARD_UPDATE",
            data,
        });
    } catch (error) {
        console.error("Coach dashboard update error:", error);
    }
};

export const emitObserverDashboardUpdate = async (observerId) => {
    try {
        // تجنب الـ aggregation لو الأوبزيرفر أوفلاين
        if (!getConnectedUsers().get(observerId.toString())) return;
        const data = await getObserverDashboardData(observerId);
        sendNotificationToUser(observerId.toString(), {
            type: "OBSERVER_DASHBOARD_UPDATE",
            data,
        });
    } catch (error) {
        console.error("Observer dashboard update error:", error);
    }
};