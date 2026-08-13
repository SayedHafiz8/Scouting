import Player from "../models/playedModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import AppError from "../utils/appError.js";

const DAY = 86_400_000;

// نافذة 3 أيام (يوم قبل الماتش + يوم الماتش + يوم بعده) بتوقيت UTC —
// matchDate بيتخزن كـ منتصف ليل UTC (جاي من <input type="date">)، فلازم نقارن بحدود UTC
// مش بتوقيت السيرفر المحلي (وإلا ممكن نتزحلق يوم كامل حسب توقيت السيرفر).
// لازم تتحسب في كل طلب مش تتلقّط مرة واحدة وقت تحميل الملف.
const utcWindow = () => {
    const now = new Date();
    const startOfTodayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return {
        $gte: new Date(startOfTodayUTC - DAY),      // الماتش كان امبارح → "يوم بعد الماتش" ✓
        $lt: new Date(startOfTodayUTC + 2 * DAY),   // الماتش بكرة → "يوم قبل الماتش" ✓ (وبعد كده برة)
    };
};

/**
 * بيحدد هل رفع الفيديو للاعب ده هيترابط بماتش تلقائي، ولا لأ.
 * - gated: فيه ماتش في النافذة (امبارح/النهاردة/بكرة) اللي بيرفع الفيديو حضّره فعلاً (attendees)
 *   ودخل نتيجته (status: completed + result كامل) — بيترابط بيه تلقائي.
 * - freeform: أي حالة تانية (مفيش فريق، مفيش ماتش خالص، فيه ماتش بس لسه ماتلعبش أو ماتأكدش
 *   حضوره/نتيجته) — الرفع مسموح دايماً لأي دور (كوتش أو أوبزيرفر)، لكن لازم عنوان ووصف.
 *   لا يوجد "blocked" — اتلغى، الكوتش بقى زي الأوبزيرفر تمامًا في الحالة دي.
 */
export async function resolveVideoUploadGate(playerId, userRole, userId) {
    const player = await Player.findById(playerId).select("team");
    if (!player) {
        throw new AppError("Player not found", 404);
    }
    if (!player.team) {
        return { mode: "freeform" };
    }

    const teamFilter = { $or: [{ homeTeam: player.team }, { awayTeam: player.team }] };

    // مش كفاية إن الماتش في النافذة — لازم كمان يكون اللي بيرفع الفيديو ده حضّر
    // الماتش فعلاً (attendees) ودخل نتيجته (status: completed + result كامل)، عشان نتأكد
    // إنه اتلعب قبل ما نربطه تلقائي بالفيديو. النافذة نفسها فاضلة زي ما هي كشرط إضافي.
    const match = await SeasonMatch.findOne({
        ...teamFilter,
        matchDate: utcWindow(),
        attendees: userId,
        status: "completed",
        "result.homeScore": { $ne: null },
        "result.awayScore": { $ne: null },
    })
        .setOptions({ skipPopulate: true })
        .sort({ matchDate: -1 }); // الأحدث الأول — لو فيه ماتشين واقعين في النافذة بيترابط بالأحدث

    return match ? { mode: "gated", seasonMatch: match._id } : { mode: "freeform" };
}
