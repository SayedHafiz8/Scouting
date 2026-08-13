import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getStreamVideo: vi.fn(),
        deleteStreamVideo: vi.fn(async () => true),
        deleteStorageObject: vi.fn(async () => true),
        purgeUrl: vi.fn(async () => true),
    };
});

import Player from "../models/playedModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import { getStreamVideo, deleteStreamVideo, deleteStorageObject } from "../config/bunny.js";
import { reconcileProcessingVideos } from "../socket/handlers/videoReconcile.js";
import { cleanupOrphanedVideos, runMediaRetention } from "../socket/handlers/mediaRetention.js";
import { createCoach, createPlayer, seedAgeGroups } from "./helpers/factory.js";

// force a doc's timestamps into the past without tripping mongoose auto-bump
const backdate = (id, fields) => PlayerMedia.collection.updateOne({ _id: id }, { $set: fields });

let coachId;
beforeEach(async () => {
    vi.clearAllMocks();
    deleteStreamVideo.mockResolvedValue(true);
    await seedAgeGroups();
});

async function coachAndPlayer() {
    const { token, user } = await createCoach();
    coachId = user._id;
    const player = await createPlayer(token);
    return { token, coachId: user._id, player };
}

describe("C2 — reconcile recovers a video whose webhook was lost", () => {
    it("a >10-min processing doc gets its real status pulled from the Bunny API", async () => {
        const { coachId, player } = await coachAndPlayer();
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: coachId,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "recon-1",
            status: "processing",
        });
        await backdate(media._id, { updatedAt: new Date(Date.now() - 20 * 60 * 1000) });

        getStreamVideo.mockResolvedValue({ status: 4, storageSize: 20 * 1024 * 1024, length: 60 });

        const n = await reconcileProcessingVideos();
        expect(n).toBe(1);
        expect((await PlayerMedia.findById(media._id)).status).toBe("ready");
    });

    it("a fresh processing doc (<10 min) is left alone", async () => {
        const { coachId, player } = await coachAndPlayer();
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: coachId,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "recon-2",
            status: "processing",
        });
        const n = await reconcileProcessingVideos();
        expect(n).toBe(0);
        expect(getStreamVideo).not.toHaveBeenCalled();
        expect((await PlayerMedia.findById(media._id)).status).toBe("processing");
    });
});

describe("A2 — zero-byte abandoned uploads cleaned after 24h", () => {
    it("deletes the Bunny video + doc when nothing was ever uploaded", async () => {
        const { coachId, player } = await coachAndPlayer();
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: coachId,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "orphan-1",
            status: "processing",
        });
        await backdate(media._id, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });

        getStreamVideo.mockResolvedValue({ status: 0, storageSize: 0 }); // never uploaded

        const removed = await cleanupOrphanedVideos();
        expect(removed).toBe(1);
        expect(deleteStreamVideo).toHaveBeenCalledWith("orphan-1");
        expect(await PlayerMedia.findById(media._id)).toBeNull();
    });

    it("keeps a processing doc that DID upload bytes (Bunny still transcoding)", async () => {
        const { coachId, player } = await coachAndPlayer();
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: coachId,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "orphan-2",
            status: "processing",
        });
        await backdate(media._id, { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });

        getStreamVideo.mockResolvedValue({ status: 3, storageSize: 5 * 1024 * 1024 });
        const removed = await cleanupOrphanedVideos();
        expect(removed).toBe(0);
        expect(await PlayerMedia.findById(media._id)).not.toBeNull();
    });
});

describe("§8 — retention purges only cold non-selected media", () => {
    it("deletes cold media for a rejected player, keeps a selected player's", async () => {
        const { token, coachId } = await coachAndPlayer();

        const rejected = await createPlayer(token);
        await Player.findByIdAndUpdate(rejected._id, { status: "rejected" });
        const cold = await PlayerMedia.create({
            player: rejected._id,
            uploadedBy: coachId,
            type: "image",
            storage: "bunny",
            storageKey: "player-media/cold.jpg",
            status: "ready",
        });
        await backdate(cold._id, { createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) });

        const selected = await createPlayer(token);
        await Player.findByIdAndUpdate(selected._id, { status: "selected" });
        const keep = await PlayerMedia.create({
            player: selected._id,
            uploadedBy: coachId,
            type: "image",
            storage: "bunny",
            storageKey: "player-media/keep.jpg",
            status: "ready",
        });
        await backdate(keep._id, { createdAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) });

        const { deleted } = await runMediaRetention();
        expect(deleted).toBe(1);
        expect(await PlayerMedia.findById(cold._id)).toBeNull();
        expect(await PlayerMedia.findById(keep._id)).not.toBeNull();
        expect(deleteStorageObject).toHaveBeenCalledTimes(1); // only the cold one's bytes
    });
});

// ============================================================================
// §11 — إعادة هيكلة حلقة الـretention: index + cursor + توازي محدود + strict.
// الشكل القديم كان COLLSCAN + تحميل كل النتايج في مصفوفة + نداءات Bunny متسلسلة.
// ============================================================================

const OLD = () => new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);

// بيولّد n عنصر ميديا "بارد" للاعب معين
async function coldMediaFor(playerId, uploaderId, n, prefix = "cold") {
    const made = [];
    for (let i = 0; i < n; i++) {
        const m = await PlayerMedia.create({
            player: playerId,
            uploadedBy: uploaderId,
            type: "image",
            storage: "bunny",
            storageKey: `player-media/${prefix}-${i}.jpg`,
            status: "ready",
        });
        await backdate(m._id, { createdAt: OLD() });
        made.push(m);
    }
    return made;
}

describe("§11 — retention query plan", () => {
    it("filters by createdAt through an index, not a collection scan", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        await coldMediaFor(p._id, coachId, 30);
        // ضوضاء حديثة عشان الكولكشن مايبقاش كله مؤهّل
        for (let i = 0; i < 60; i++) {
            await PlayerMedia.create({
                player: p._id, uploadedBy: coachId, type: "image",
                storage: "bunny", storageKey: `player-media/fresh-${i}.jpg`, status: "ready",
            });
        }
        await PlayerMedia.syncIndexes();

        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const ex = await PlayerMedia.find({ createdAt: { $lte: cutoff } }).explain("executionStats");
        const stats = ex.executionStats;

        const stages = [];
        const names = [];
        (function walk(s) {
            if (!s) return;
            stages.push(s.stage);
            if (s.indexName) names.push(s.indexName);
            if (s.inputStage) walk(s.inputStage);
            (s.inputStages ?? []).forEach(walk);
        })(stats.executionStages);

        // MongoDB 7 ممكن يستخدم أسماء SBE بحروف صغيرة كمان
        expect(stages.some((s) => s === "COLLSCAN" || s === "scan")).toBe(false);
        expect(names.join(",")).toMatch(/createdAt_1/);
        // بيقرا الـ30 المؤهلين بس، مش الـ90 كلهم
        expect(stats.nReturned).toBe(30);
        expect(stats.totalDocsExamined).toBeLessThan(90);
    });
});

describe("§11 — retention is strict about Bunny confirming the delete", () => {
    it("keeps the document when its Bunny delete throws, and purges the rest", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        await Player.findByIdAndUpdate(p._id, { status: "rejected" });
        const items = await coldMediaFor(p._id, coachId, 4);

        // أول نداء بس هو اللي بيفشل
        deleteStorageObject.mockRejectedValueOnce(new Error("Bunny deleteStorageObject failed: 500"));

        const { deleted, kept } = await runMediaRetention();

        expect(deleted).toBe(3);
        expect(kept).toBe(1);
        // العنصر الفاشل لسه في الداتابيز — هو المرجع الوحيد لمفتاح البايتات
        const survivors = await PlayerMedia.find({ _id: { $in: items.map((i) => i._id) } });
        expect(survivors.length).toBe(1);
    });

    it("a failure does not abort the run", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        await Player.findByIdAndUpdate(p._id, { status: "rejected" });
        await coldMediaFor(p._id, coachId, 12);

        deleteStorageObject.mockRejectedValueOnce(new Error("boom"));
        deleteStorageObject.mockRejectedValueOnce(new Error("boom"));

        const { deleted, kept } = await runMediaRetention();

        expect(deleted).toBe(10);
        expect(kept).toBe(2);
        expect(await PlayerMedia.countDocuments()).toBe(2);
    });

    it("the retention rule itself is unchanged — selected players are untouched", async () => {
        const { token, coachId } = await coachAndPlayer();

        const selected = await createPlayer(token);
        await Player.findByIdAndUpdate(selected._id, { status: "selected" });
        const kept = await coldMediaFor(selected._id, coachId, 6, "keep");

        const pending = await createPlayer(token);
        const gone = await coldMediaFor(pending._id, coachId, 6, "gone");

        const res = await runMediaRetention();

        expect(res.deleted).toBe(6);
        expect(await PlayerMedia.countDocuments({ _id: { $in: kept.map((k) => k._id) } })).toBe(6);
        expect(await PlayerMedia.countDocuments({ _id: { $in: gone.map((g) => g._id) } })).toBe(0);
    });

    it("media whose player was deleted is still purged (dangling ref)", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        const orphaned = await coldMediaFor(p._id, coachId, 3, "orphan");
        await Player.findByIdAndDelete(p._id);

        const { deleted } = await runMediaRetention();

        // populate بيرجّع null → undefined !== "selected" → بتتمسح. السلوك ده
        // متحافظ عليه عن قصد: من غيره الميديا دي كانت هتفضل على Bunny للأبد
        expect(deleted).toBe(3);
        expect(await PlayerMedia.countDocuments({ _id: { $in: orphaned.map((o) => o._id) } })).toBe(0);
    });
});

describe("§11 — retention bounds memory and Bunny concurrency", () => {
    it("never has more than BUNNY_DELETE_CONCURRENCY deletes in flight", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        await Player.findByIdAndUpdate(p._id, { status: "rejected" });
        await coldMediaFor(p._id, coachId, 23);

        let inFlight = 0;
        let peak = 0;
        deleteStorageObject.mockImplementation(async () => {
            inFlight++;
            peak = Math.max(peak, inFlight);
            await new Promise((r) => setTimeout(r, 5));
            inFlight--;
            return true;
        });

        const { deleted } = await runMediaRetention();

        expect(deleted).toBe(23);
        // الثابت في mediaRetention.js = 5
        expect(peak).toBeLessThanOrEqual(5);
        // وفعلاً بيتوازى — مش بيرجع للتسلسل (اللي هيخلي الذروة 1)
        expect(peak).toBeGreaterThan(1);
    });

    it("processes far more documents than a single batch holds", async () => {
        const { token, coachId } = await coachAndPlayer();
        const p = await createPlayer(token);
        await Player.findByIdAndUpdate(p._id, { status: "rejected" });
        await coldMediaFor(p._id, coachId, 47);

        const { deleted, kept } = await runMediaRetention();

        // 47 مش من مضاعفات 5 — بيثبت إن آخر دفعة ناقصة بتتعالج كمان
        expect(deleted).toBe(47);
        expect(kept).toBe(0);
        expect(await PlayerMedia.countDocuments()).toBe(0);
    });
});
