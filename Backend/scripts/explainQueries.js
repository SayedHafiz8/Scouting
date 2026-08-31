// ============================================================================
// explain() harness — runs the REAL query shapes the API issues against the
// seeded cluster and reports what the planner actually did.
//
// ── What this reports, and what it deliberately ignores ─────────────────────
// Verdicts come from two facts only:
//   • stage       — IXSCAN (index used) vs COLLSCAN (whole collection read)
//   • examine ratio — totalDocsExamined ÷ nReturned
// Wall-clock time is NOT reported and must not be used. The measurement target
// is a shared free-tier (M0) cluster whose CPU and IOPS are throttled and shared
// with other tenants, so the same query can take 2s here and 80ms on a dedicated
// tier — or the reverse. Scan type and examine ratio are properties of the query
// planner and are identical on any cluster with the same indexes and data shape,
// which is exactly why they are the only things trusted here.
//
// ── SAFETY ──────────────────────────────────────────────────────────────────
// Reads SEED_TARGET_URI only, same as seedLoadTest.js. It never touches
// config.env, so it cannot accidentally profile production. Every query here is
// read-only, but the same gate is kept so both scripts behave identically.
//
// Usage:
//   SEED_TARGET_URI="mongodb+srv://..." node scripts/explainQueries.js
//   SEED_TARGET_URI="..." node scripts/explainQueries.js --json > explain.json
// ============================================================================
// ⚠️ يفضل أول import — نفس سبب seedLoadTest.js (config/bunny.js بيحمّل
//    config.env كأثر جانبي لتحميل أي موديل)
import { SEED_TARGET_URI, assertSafeTarget } from "./seedGuard.js";

import mongoose from "mongoose";

import AgeGroup from "../models/ageGroupModel.js";
import User from "../models/userModel.js";
import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import Team from "../models/teamModel.js";
import CoachEvaluation from "../models/coachEvaluationModel.js";
import { ROLES } from "../constants/roles.js";

assertSafeTarget({ scriptName: "explainQueries.js" });
const URI = SEED_TARGET_URI;

const AS_JSON = process.argv.includes("--json");
const results = [];

// ── explain plumbing ────────────────────────────────────────────────────────

// بيلف على شجرة الـexecutionStages ويطلّع كل مراحل الـscan
function collectStages(stage, acc = []) {
    if (!stage) return acc;
    acc.push(stage.stage);
    if (stage.inputStage) collectStages(stage.inputStage, acc);
    (stage.inputStages ?? []).forEach((s) => collectStages(s, acc));
    return acc;
}

function collectIndexNames(stage, acc = []) {
    if (!stage) return acc;
    if (stage.indexName) acc.push(stage.indexName);
    if (stage.inputStage) collectIndexNames(stage.inputStage, acc);
    (stage.inputStages ?? []).forEach((s) => collectIndexNames(s, acc));
    return acc;
}

// MongoDB 7+ runs most aggregations through the slot-based engine (SBE), whose
// execution stages are lowercase and named differently from the classic engine:
//   classic: COLLSCAN / IXSCAN        SBE: scan / ixseek / ixscan
// Matching only the uppercase names silently reports an SBE collection scan as
// "IXSCAN", which is the exact opposite of the truth — so both spellings are
// checked here.
const SCAN_STAGES = new Set(["COLLSCAN", "scan"]);
const INDEX_STAGES = new Set(["IXSCAN", "ixseek", "ixscan", "COUNT_SCAN", "DISTINCT_SCAN"]);

function summarize(label, collection, shape, explain) {
    // find() و aggregate() بيرجّعوا الـexecutionStats في مكانين مختلفين
    const stats =
        explain.executionStats ??
        explain.stages?.[0]?.$cursor?.executionStats ??
        null;

    if (!stats) {
        return { label, collection, shape, error: "no executionStats in explain output" };
    }

    const exec = stats.executionStages;
    const stages = collectStages(exec);
    const indexes = [...new Set(collectIndexNames(exec))];
    const nReturned = stats.nReturned ?? 0;
    const docsExamined = stats.totalDocsExamined ?? 0;
    const keysExamined = stats.totalKeysExamined ?? 0;

    const isCollscan = stages.some((s) => SCAN_STAGES.has(s));
    const isAgg = shape === "aggregate";

    // نسبة التضخيم: كام مستند اتقرا لكل مستند رجع. 1 = مثالي، >10 = هدر واضح.
    //
    // مهم: النسبة دي معناها صحيح للـfind بس. في الـaggregation اللي فيها $group،
    // قراءة 5000 مستند عشان تطلّع 4 مجموعات مش "هدر" — ده شغل أصيل. فالحكم على
    // الـaggregations بيتبني على نوع مرحلة الإدخال (scan مقابل ixseek) وعلى نسبة
    // المقروء من حجم الكولكشن، مش على docsExamined/nReturned.
    const ratio = nReturned === 0
        ? (docsExamined === 0 ? 0 : Infinity)
        : Number((docsExamined / nReturned).toFixed(1));

    let verdict;
    if (isCollscan) verdict = "COLLSCAN";
    else if (isAgg) verdict = "COVERED";           // index-seek driven aggregation
    else if (ratio === 0 || ratio <= 1.5) verdict = "COVERED";
    else if (ratio <= 10) verdict = "PARTIAL";
    else verdict = "PARTIAL(bad)";

    return {
        label, collection, shape, verdict, isAgg,
        scan: isCollscan ? "COLLSCAN" : "IXSCAN",
        index: indexes.length ? indexes.join(", ") : "—",
        nReturned, docsExamined, keysExamined,
        // بنخفي النسبة للـaggregations عشان ماتتقريش غلط
        ratio: isAgg ? "n/a" : ratio,
        stages: [...new Set(stages)].join(" ← "),
    };
}

async function explainFind(label, Model, filter, { sort, limit = 20, skipPopulate = true } = {}) {
    let q = Model.find(filter);
    if (sort) q = q.sort(sort);
    if (limit) q = q.limit(limit);
    // SeasonMatch بيعمل auto-populate في pre(/^find/) — بنطفيه هنا عشان نقيس
    // الـquery الأساسي لوحده. تكلفة الـpopulate نفسها بتتقاس منفصلة تحت.
    if (skipPopulate) q = q.setOptions({ skipPopulate: true });
    const explain = await q.explain("executionStats");
    const row = summarize(label, Model.modelName, JSON.stringify(filter), Array.isArray(explain) ? explain[0] : explain);
    row.sort = sort ? JSON.stringify(sort) : "—";
    results.push(row);
    return row;
}

async function explainAgg(label, Model, pipeline) {
    const explain = await Model.aggregate(pipeline).explain("executionStats");
    const row = summarize(label, Model.modelName, "aggregate", Array.isArray(explain) ? explain[0] : explain);
    row.sort = "—";
    results.push(row);
    return row;
}

// ── the actual query shapes, traced to their source ─────────────────────────
async function run() {
    const oid = (v) => new mongoose.Types.ObjectId(v);

    // نجيب معرّفات حقيقية من الداتا المزروعة عشان الفلاتر تبقى انتقائية بجد
    const coach = await User.findOne({ role: ROLES.COACH }).select("_id").lean();
    const observer = await User.findOne({ role: ROLES.OBSERVER }).select("_id").lean();
    // audit-database (توصية 6) — الرول ده كان غايب تماماً عن الـharness، وده
    // السبب المباشر إن البند I1 عاش من المرحلة 11 لحد مراجعة الداتابيز.
    const proScout = await User.findOne({ role: ROLES.PRO_SCOUT }).select("_id").lean();
    const group = await AgeGroup.findOne({}).select("_id").lean();
    const player = await Player.findOne({}).select("_id").lean();
    const observedPlayer = await Player.findOne({ status: "observed" }).select("_id observers").lean();

    if (!coach || !player) {
        throw new Error("No seeded data found — run scripts/seedLoadTest.js first.");
    }
    if (!proScout) {
        console.warn(
            "\n⚠️  No proScout user in this dataset — the Stage 2/11 scope shapes below will be skipped.\n" +
            "   Re-seed with a current seedLoadTest.js (it creates them by default).\n"
        );
    }

    const today = new Date(new Date().setHours(23, 59, 59, 999));

    // ── 1. GET /players — playerController.js:169-187 ───────────────────────
    await explainFind(
        "players • coach's own list (default)",
        Player, { coach: coach._id }, { sort: { createdAt: -1 } }
    );
    await explainFind(
        "players • coach + status filter",
        Player, { coach: coach._id, status: "selected" }
    );
    await explainFind(
        "players • coach + ageGroup + status",
        Player, { coach: coach._id, ageGroup: group._id, status: "pending" }
    );
    await explainFind(
        "players • admin, ageGroup + status",
        Player, { ageGroup: group._id, status: "selected" }
    );
    await explainFind(
        "players • admin, unfiltered listing",
        Player, {}
    );
    await explainFind(
        "players • observer scope (observers array)",
        Player, { observers: observer._id }
    );
    await explainFind(
        "players • §9 orphan lens (?coach=none)",
        Player, { coach: null }
    );
    await explainFind(
        "players • position filter (coach lens)",
        Player, { coach: coach._id, position: "ST" }
    );

    // ── 2. search — apiFeatures.js:110-133 (unanchored $regex) ──────────────
    // ⚠️ الصفّان دول شكل قديم مابقاش يتنفّذ — متسابين كمرجع تاريخي يوضّح ليه
    // التحويل لبحث البادئة كان لازم. اقرأهم كـ"before"، مش كمشكلة قائمة.
    await explainFind(
        "[legacy, not issued] SEARCH regex, admin",
        Player,
        { $or: [
            { name: { $regex: "ahmed", $options: "i" } },
            { position: { $regex: "ahmed", $options: "i" } },
            { preferredFoot: { $regex: "ahmed", $options: "i" } },
            { nationality: { $regex: "ahmed", $options: "i" } },
            { city: { $regex: "ahmed", $options: "i" } },
        ] }
    );
    await explainFind(
        "[legacy, not issued] SEARCH regex, coach scope",
        Player,
        { coach: coach._id, $or: [
            { name: { $regex: "ahmed", $options: "i" } },
            { position: { $regex: "ahmed", $options: "i" } },
            { preferredFoot: { $regex: "ahmed", $options: "i" } },
            { nationality: { $regex: "ahmed", $options: "i" } },
            { city: { $regex: "ahmed", $options: "i" } },
        ] }
    );
    // §11 — الشكل اللي ApiFeature.searchPrefix بيبنيه فعلاً دلوقتي: بادئة
    // case-sensitive على حقل الكلمات المطبّع. الصفّين اللي فوق اتسابوا عن قصد
    // كمقارنة — بيوثّقوا ليه التحويل كان لازم.
    await explainFind(
        "players • SEARCH prefix on tokens, admin",
        Player, { searchTokens: { $regex: "^ahmed" } }
    );
    await explainFind(
        "players • SEARCH prefix on tokens, coach scope",
        Player, { coach: coach._id, searchTokens: { $regex: "^ahmed" } }
    );

    // ── 3. reports — scoutingReportController.js:136-149 ────────────────────
    await explainFind(
        "reports • non-admin {player, coach}",
        ScoutingReport, { player: player._id, coach: coach._id }
    );
    await explainFind(
        "reports • admin {player} sorted -matchDate",
        ScoutingReport, { player: player._id }, { sort: { matchDate: -1 } }
    );
    await explainFind(
        "reports • search regex on notes",
        ScoutingReport,
        { player: player._id, $or: [{ notes: { $regex: "solid", $options: "i" } }] }
    );
    // getPlayerStatistics — scoutingReportController.js:204
    await explainAgg("reports • player statistics aggregation", ScoutingReport, [
        { $match: { player: oid(player._id) } },
        { $group: { _id: "$player", totalReports: { $sum: 1 }, overallRating: { $avg: "$overallRating" } } },
    ]);
    // authorCounts — scoutingReportController.js:156
    await explainAgg("reports • admin authorCounts ($lookup users)", ScoutingReport, [
        { $match: { player: oid(player._id) } },
        { $lookup: { from: "users", localField: "coach", foreignField: "_id", as: "author" } },
        { $unwind: "$author" },
        { $group: { _id: "$author.role", count: { $sum: 1 } } },
    ]);

    // ── 4. media — playerMediaController.js:145-156 ─────────────────────────
    await explainFind(
        "media • non-admin {player, uploadedBy}",
        PlayerMedia, { player: player._id, uploadedBy: coach._id }
    );
    await explainFind(
        "media • admin {player}",
        PlayerMedia, { player: player._id }
    );
    await explainFind(
        "media • uploader dashboard count {uploadedBy}",
        PlayerMedia, { uploadedBy: coach._id }
    );

    // ── 4b. proScout scope — services/scope.js + Stage 11 ───────────────────
    //
    // audit-database (توصية 6). النطاق بيتلفّ في $and جوه services/scope.js
    // (wrap())، فالشكل المقاس هنا هو اللي بيتنفّذ حرفياً — مش صيغة مبسّطة.
    // الـ$and مالوش أثر على اختيار الـplanner، لكن الاتساق مع المصدر مقصود.
    if (proScout) {
        const scope = { $and: [{ createdBy: proScout._id }] };

        await explainFind(
            "proScout • players list (default sort)  [playerController.js:309]",
            Player, scope, { sort: { createdAt: -1 }, limit: 50 }
        );
        await explainFind(
            "proScout • countDocuments for that page [playerController.js:333]",
            Player, scope, { limit: 0 }
        );
        await explainFind(
            "proScout • players + status filter",
            Player, { ...scope, status: "selected" }, { sort: { createdAt: -1 }, limit: 50 }
        );
        await explainFind(
            "proScout • prefix search inside scope",
            Player, { ...scope, searchTokens: { $regex: "^ahmed" } }, { limit: 50 }
        );
        await explainAgg("proScout • dashboard $facet          [dashboardController.js:283]", Player, [
            { $match: { $and: [{ createdBy: oid(proScout._id) }] } },
            { $facet: {
                byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                ids: [{ $project: { _id: 1 } }],
            } },
        ]);
        await explainAgg("proScout • counts byAgeGroup         [playerController.js:162]", Player, [
            { $match: { $and: [{ createdBy: oid(proScout._id) }, {}] } },
            { $group: { _id: "$ageGroup", count: { $sum: 1 },
                professional: { $sum: { $cond: ["$isProfessional", 1, 0] } } } },
        ]);

        // محور التقارير في الداشبورد: $in على كل ids اللاعبين في النطاق
        const scopedIds = await Player.find(scope).distinct("_id");
        await explainFind(
            `proScout • reports count {coach, player:$in[${scopedIds.length}]} [dashboardController.js:314]`,
            ScoutingReport, { coach: proScout._id, player: { $in: scopedIds } }, { limit: 0 }
        );
        await explainFind(
            "proScout • recentReports sort -matchDate limit 5 [dashboardController.js:334]",
            ScoutingReport, { coach: proScout._id, player: { $in: scopedIds } },
            { sort: { matchDate: -1 }, limit: 5 }
        );

        // سكوب المباريات والفرق — league لوحده، من services/scope.js
        const endOfToday = new Date(new Date().setHours(23, 59, 59, 999));
        await explainFind(
            "proScout • upcoming matches {league, matchDate>today}",
            SeasonMatch, { $and: [{ league: "professional" }, { matchDate: { $gt: endOfToday } }] },
            { sort: { matchDate: 1 }, limit: 5 }
        );
        await explainFind(
            "proScout • teams scope {league:professional}",
            Team, { $and: [{ league: "professional" }] }, { limit: 50 }
        );

        // الفرع اليتيم — لاعب محترف بلا فريق، عدسة الأدمن ?coach=none
        await explainFind(
            "players • §9 orphan lens with pro players seeded",
            Player, { coach: null }, { sort: { createdAt: -1 }, limit: 50 }
        );
    }

    // ── 5. crons — the shapes that run unattended ───────────────────────────
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    await explainFind(
        "cron • mediaRetention {createdAt<=cutoff}   [mediaRetention.js:58]",
        PlayerMedia, { createdAt: { $lte: cutoff } }, { limit: 0 }
    );
    await explainFind(
        "cron • videoReconcile {type,status,updatedAt} [videoReconcile.js:21]",
        PlayerMedia,
        { type: "video", status: "processing", updatedAt: { $lte: cutoff } },
        { limit: 0 }
    );
    await explainFind(
        "cron • cleanupOrphanedVideos {type,status,createdAt} [mediaRetention.js:34]",
        PlayerMedia,
        { type: "video", status: "processing", createdAt: { $lte: cutoff } },
        { limit: 0 }
    );
    await explainFind(
        "cron • cleanupDeactivated {active,deactivatedAt} [cleanupDeactivated.js:14]",
        User, { active: false, deactivatedAt: { $lte: cutoff } }, { limit: 0 }
    );

    // ── 6. season matches — seasonMatchController.js:36-38 ──────────────────
    await explainFind(
        "matches • ageGroup+season+league sorted matchDate",
        SeasonMatch,
        { ageGroup: group._id, season: "2025/2026", league: "premier" },
        { sort: { matchDate: 1 } }
    );
    await explainFind(
        "matches • my-matches {attendees, matchDate[gte]}",
        SeasonMatch,
        { attendees: coach._id, matchDate: { $gte: new Date("2025-01-01") } },
        { sort: { matchDate: 1 } }
    );
    await explainFind(
        "matches • dashboard count {attendees, matchDate<=today}",
        SeasonMatch, { attendees: coach._id, matchDate: { $lte: today } }, { limit: 0 }
    );
    await explainFind(
        "matches • search regex on venue",
        SeasonMatch,
        { season: "2025/2026", $or: [{ venue: { $regex: "Stadium 3", $options: "i" } }] }
    );
    // observer scope — seasonMatchController.js:27
    await explainFind(
        "matches • observer base filter (distinct team ids)",
        Player, { observers: observer?._id ?? oid("000000000000000000000000") }, { limit: 0 }
    );

    // ── 7. dashboards — dashboardController.js ──────────────────────────────
    await explainAgg("dashboard • admin byStatus group        [dashboardController.js:31]", Player, [
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    await explainAgg("dashboard • admin topCoaches            [dashboardController.js:42]", Player, [
        { $match: { status: "selected" } },
        { $group: { _id: "$coach", selectedPlayers: { $sum: 1 } } },
        { $sort: { selectedPlayers: -1 } },
        { $limit: 10 },
    ]);
    await explainAgg("dashboard • coach $facet                [dashboardController.js:94]", Player, [
        { $match: { coach: oid(coach._id) } },
        { $facet: { byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }], total: [{ $count: "count" }] } },
    ]);
    await explainAgg("dashboard • getAllCoachesStats          [dashboardController.js:207]", Player, [
        { $group: { _id: "$coach", totalPlayers: { $sum: 1 },
            selectedPlayers: { $sum: { $cond: [{ $eq: ["$status", "selected"] }, 1, 0] } } } },
    ]);
    await explainFind(
        "dashboard • observer player count {observers}",
        Player, { observers: observer?._id ?? oid("000000000000000000000000") }, { limit: 0 }
    );

    // ── 8. counts endpoint — playerController.js:86 ─────────────────────────
    await explainAgg("counts • byAgeGroup, coach scope        [playerController.js:86]", Player, [
        { $match: { coach: oid(coach._id) } },
        { $group: { _id: "$ageGroup", count: { $sum: 1 } } },
    ]);

    // ── 9. evaluations — coachEvaluationController.js:124-152 ───────────────
    await explainFind(
        "evaluations • coach's own published, sorted -year -month",
        CoachEvaluation,
        { coach: coach._id, status: "published" },
        { sort: { year: -1, month: -1 } }
    );

    // ── 10. unbounded endpoint — userController.js:223 ──────────────────────
    await explainFind(
        "users • getDeactivated (NO pagination)  [userController.js:223]",
        User, { active: false, role: ROLES.COACH }, { sort: { deactivatedAt: 1 }, limit: 0 }
    );

    if (observedPlayer) {
        await explainFind(
            "players • single observed player lookup",
            Player, { _id: observedPlayer._id }
        );
    }
}

// ── reporting ───────────────────────────────────────────────────────────────
const COLOR = { COLLSCAN: "🔴", "PARTIAL(bad)": "🟠", PARTIAL: "🟡", COVERED: "🟢", ERROR: "⚫" };

function print() {
    console.log("\n" + "═".repeat(112));
    console.log("  EXPLAIN RESULTS — judged on scan type + docsExamined/nReturned only. Timings intentionally omitted.");
    console.log("═".repeat(112));

    const pad = (s, n) => String(s).padEnd(n).slice(0, n);
    console.log(
        `  ${pad("query", 52)} ${pad("scan", 9)} ${pad("ret", 6)} ${pad("exam", 8)} ${pad("ratio", 7)} index`
    );
    console.log("  " + "─".repeat(108));

    for (const r of results) {
        if (r.error) {
            console.log(`  ${COLOR.ERROR} ${pad(r.label, 50)} ERROR: ${r.error}`);
            continue;
        }
        const icon = COLOR[r.verdict] ?? " ";
        console.log(
            `  ${icon} ${pad(r.label, 50)} ${pad(r.scan, 9)} ${pad(r.nReturned, 6)} ${pad(r.docsExamined, 8)} ${pad(r.ratio, 7)} ${r.index}`
        );
    }

    // ── priority list ───────────────────────────────────────────────────────
    const collscans = results.filter((r) => r.verdict === "COLLSCAN");
    const amplified = results.filter(
        (r) => !r.isAgg && (r.verdict === "PARTIAL(bad)" || (r.verdict === "PARTIAL" && r.ratio > 3))
    );

    console.log("\n" + "═".repeat(112));
    console.log("  PRIORITY LIST");
    console.log("═".repeat(112));

    console.log(`\n  🔴 COLLSCAN — reads the whole collection, cost grows linearly with data (${collscans.length}):`);
    if (collscans.length === 0) console.log("     (none)");
    collscans.forEach((r) =>
        console.log(
            `     • ${r.label}\n       ${r.collection}: examined ${r.docsExamined} to return ${r.nReturned}` +
            `${r.isAgg ? "  (aggregation — input stage is a full scan)" : ""}`
        )
    );

    console.log(`\n  🟠 AMPLIFIED find() — index used but reads far more docs than it returns (${amplified.length}):`);
    if (amplified.length === 0) console.log("     (none)");
    amplified.forEach((r) => console.log(`     • ${r.label}\n       ratio ${r.ratio}× (examined ${r.docsExamined} → returned ${r.nReturned}) via ${r.index}`));

    const clean = results.filter((r) => r.verdict === "COVERED").length;
    console.log(`\n  🟢 ${clean} quer${clean === 1 ? "y" : "ies"} fully covered — leave these alone.\n`);
}

async function main() {
    // audit-database — autoIndex/autoCreate: false إجباري (CLAUDE.md). الـharness
    // ده بيقيس الفهارس الموجودة فعلاً؛ لو بناها بنفسه وقت الاتصال كان هيقيس حالة
    // من صنعه هو مش حالة الكلاستر. البناء مسؤولية seedLoadTest.js.
    await mongoose.connect(URI, { autoIndex: false, autoCreate: false });
    console.log(`✅ Connected to ${mongoose.connection.name}`);

    const counts = {};
    for (const M of [Player, ScoutingReport, PlayerMedia, SeasonMatch, User]) {
        counts[M.modelName] = await M.collection.countDocuments();
    }
    console.log(`   dataset: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join("  ")}`);

    await run();

    if (AS_JSON) console.log(JSON.stringify({ counts, results }, null, 2));
    else print();

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
