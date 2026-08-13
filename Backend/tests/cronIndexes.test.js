import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";

import PlayerMedia from "../models/playerMediaModel.js";
import Player, { buildSearchTokens } from "../models/playedModel.js";

// ============================================================================
// §11 — تغطية الـindex للكرونز اللي بتشتغل لوحدها.
//
// videoReconcile بيشتغل كل 5 دقايق وmediaRetention يومياً، والاتنين بيدوّروا على
// فيديوهات status:"processing". قبل الـindex الجزئي الاتنين كانوا بيعملوا COLLSCAN
// على PlayerMedia كاملة — على 10,000 مستند كان exam 10,000 → ret 0.
//
// التستات دي بتفحص خطة الـquery نفسها (explain) مش الوقت: الوقت متغيّر حسب
// الجهاز، أما نوع الـscan فحقيقة عن الـplanner بتتصرف بنفس المنطق على أي كلاستر.
// ============================================================================

// بيمشي على شجرة المراحل ويجمعها. لازم يشمل الأسماء بحروف صغيرة كمان لأن
// MongoDB 7 بيشغّل جزء من الخطط على محرك SBE (scan/ixseek بدل COLLSCAN/IXSCAN).
function stagesOf(stage, acc = []) {
    if (!stage) return acc;
    acc.push(stage.stage);
    if (stage.inputStage) stagesOf(stage.inputStage, acc);
    (stage.inputStages ?? []).forEach((s) => stagesOf(s, acc));
    return acc;
}
function indexesOf(stage, acc = []) {
    if (!stage) return acc;
    if (stage.indexName) acc.push(stage.indexName);
    if (stage.inputStage) indexesOf(stage.inputStage, acc);
    (stage.inputStages ?? []).forEach((s) => indexesOf(s, acc));
    return acc;
}
const isCollscan = (stages) => stages.some((s) => s === "COLLSCAN" || s === "scan");

async function plan(filter) {
    const ex = await PlayerMedia.find(filter).explain("executionStats");
    const stats = ex.executionStats;
    return {
        stages: stagesOf(stats.executionStages),
        indexes: indexesOf(stats.executionStages),
        nReturned: stats.nReturned,
        docsExamined: stats.totalDocsExamined,
    };
}

const oid = () => new mongoose.Types.ObjectId();

// كولكشن فيها ضوضاء كتير (ready) وقليل من الـprocessing — نفس نسبة الإنتاج
async function seedMedia({ ready = 400, processing = 3 } = {}) {
    const playerId = oid();
    const uploader = oid();
    const docs = [];
    for (let i = 0; i < ready; i++) {
        docs.push({
            player: playerId, uploadedBy: uploader,
            type: i % 2 ? "video" : "image",
            storage: "bunny", status: "ready",
            bunnyVideoId: `ready-${i}`,
            createdAt: new Date(Date.now() - 60 * 86400000),
            updatedAt: new Date(Date.now() - 60 * 86400000),
        });
    }
    for (let i = 0; i < processing; i++) {
        docs.push({
            player: playerId, uploadedBy: uploader,
            type: "video", storage: "bunny", status: "processing",
            bunnyVideoId: `stuck-${i}`,
            createdAt: new Date(Date.now() - 60 * 86400000),
            updatedAt: new Date(Date.now() - 60 * 86400000),
        });
    }
    await PlayerMedia.insertMany(docs);
    // autoIndex شغال في بيئة التست، بس بنتأكد إن الـindexes اتبنت قبل الـexplain
    await PlayerMedia.syncIndexes();
    return { playerId, uploader };
}

const CUTOFF = new Date(Date.now() - 24 * 60 * 60 * 1000);

describe("§11 — the processing-video crons are index-backed, not collection scans", () => {
    beforeEach(async () => {
        await seedMedia();
    });

    it("videoReconcile's filter uses an index instead of scanning [videoReconcile.js:21]", async () => {
        const p = await plan({ type: "video", status: "processing", updatedAt: { $lte: CUTOFF } });

        expect(isCollscan(p.stages)).toBe(false);
        expect(p.indexes.join(",")).toMatch(/type_1_updatedAt_1/);
        expect(p.nReturned).toBe(3);
    });

    it("cleanupOrphanedVideos' filter uses an index too [mediaRetention.js:34]", async () => {
        const p = await plan({ type: "video", status: "processing", createdAt: { $lte: CUTOFF } });

        expect(isCollscan(p.stages)).toBe(false);
        expect(p.nReturned).toBe(3);
    });

    it("reads only the processing docs, not the whole collection", async () => {
        const total = await PlayerMedia.countDocuments();
        const p = await plan({ type: "video", status: "processing", updatedAt: { $lte: CUTOFF } });

        expect(total).toBe(403);
        // ده جوهر الإصلاح: الفحص بيتناسب مع عدد الـprocessing (3) مش مع حجم
        // الكولكشن (403). قبل الـindex كان docsExamined == total.
        expect(p.docsExamined).toBeLessThanOrEqual(10);
        expect(p.docsExamined).toBeLessThan(total);
    });

    it("the partial index stays tiny — it only holds processing docs", async () => {
        const idx = (await PlayerMedia.collection.indexes())
            .find((i) => i.name === "type_1_updatedAt_1");

        expect(idx).toBeDefined();
        // ده اللي بيخلي تكلفة الكتابة شبه صفر: الفيديو بيدخل الـindex وهو
        // processing وبيخرج منه أول ما يبقى ready
        expect(idx.partialFilterExpression).toEqual({ status: "processing" });
    });

    it("a ready video is not in the partial index's scope (documented limit)", async () => {
        // فلتر من غير status مايقدرش يستخدم الـpartial index — الـplanner لازم
        // يتأكد إن الاستعلام كله جوه شرط الـpartial. التست ده بيوثّق الحد ده.
        const p = await plan({ type: "video", status: "ready" });
        expect(p.indexes.join(",")).not.toMatch(/type_1_updatedAt_1/);
    });
});

// ============================================================================
// §11 — بحث اللاعبين بالبادئة. ده معيار القبول للتحويل: لو الخطة لسه COLLSCAN
// يبقى الطريقة غلط مهما كانت النتايج صح.
// ============================================================================
describe("§11 — player prefix search is index-backed", () => {
    async function seedPlayers(n = 300) {
        const coachId = oid();
        const groupId = oid();
        const docs = [];
        for (let i = 0; i < n; i++) {
            const name = `Player${String(i).padStart(4, "0")} Surname${i % 7}`;
            docs.push({
                name,
                city: "Cairo",
                address: "x",
                dateOfBirth: new Date("2012-05-01"),
                nationality: "Egyptian",
                phoneNumber: "01012345678",
                status: "pending",
                observers: [],
                coach: coachId,
                ageGroup: groupId,
                searchTokens: buildSearchTokens(name, "Cairo"),
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
        await Player.collection.insertMany(docs);
        await Player.syncIndexes();
        return { coachId };
    }

    async function planPlayers(filter) {
        const ex = await Player.find(filter).limit(20).explain("executionStats");
        const s = ex.executionStats;
        const stages = [];
        const names = [];
        (function walk(st) {
            if (!st) return;
            stages.push(st.stage);
            if (st.indexName) names.push(st.indexName);
            if (st.inputStage) walk(st.inputStage);
            (st.inputStages ?? []).forEach(walk);
        })(s.executionStages);
        return { stages, names, nReturned: s.nReturned, docsExamined: s.totalDocsExamined };
    }

    it("uses the searchTokens index instead of scanning the collection", async () => {
        await seedPlayers();

        const p = await planPlayers({ searchTokens: { $regex: "^player001" } });

        expect(isCollscan(p.stages)).toBe(false);
        expect(p.names.join(",")).toMatch(/searchTokens_1/);
        // docsExamined ≈ nReturned — ده معيار النجاح
        expect(p.docsExamined).toBeLessThanOrEqual(p.nReturned + 1);
    });

    it("stays index-backed when combined with the ownership scope", async () => {
        const { coachId } = await seedPlayers();

        // ده الشكل الحقيقي: سكوب الملكية AND البحث
        const p = await planPlayers({
            coach: coachId,
            searchTokens: { $regex: "^player001" },
        });

        expect(isCollscan(p.stages)).toBe(false);
        expect(p.docsExamined).toBeLessThanOrEqual(p.nReturned + 1);
    });

    it("the old unanchored case-insensitive shape would have scanned", async () => {
        await seedPlayers();

        // نفس البحث بالشكل القديم — بيوثّق ليه التحويل كان لازم
        const before = await planPlayers({
            $or: [
                { name: { $regex: "player001", $options: "i" } },
                { city: { $regex: "player001", $options: "i" } },
            ],
        });

        expect(isCollscan(before.stages)).toBe(true);
    });
});
