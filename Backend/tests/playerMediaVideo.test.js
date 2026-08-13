import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import crypto from "node:crypto";

// Deterministic 64-hex-char "file hash" stand-ins for createVideo's required fileHash field —
// same seed = "same video" (used to exercise the resume/in-flight path), different seed = distinct video.
const mkHash = (seed) => crypto.createHash("sha256").update(String(seed)).digest("hex");

// Mock ONLY the Bunny network wrappers; keep bunnyConfig (signing/config) real.
vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createStreamVideo: vi.fn(async () => ({
            guid: `guid_${Math.random().toString(36).slice(2, 10)}`,
        })),
        getStreamVideo: vi.fn(),
        deleteStreamVideo: vi.fn(async () => true),
        deleteStorageObject: vi.fn(async () => true),
        putStorageObject: vi.fn(async () => true),
        getStorageObject: vi.fn(async () => null),
        purgeUrl: vi.fn(async () => true),
    };
});

import app from "../app.js";
import Player from "../models/playedModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import VideoUploadCounter from "../models/videoUploadCounterModel.js";
import { syncVideoStatus } from "../services/videoSync.js";
import { createStreamVideo, getStreamVideo, deleteStreamVideo } from "../config/bunny.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import {
    createCoach,
    createObserver,
    createPlayer,
    defaultTeamIds,
    setupPlayerMatchDay,
    seedAgeGroups,
} from "./helpers/factory.js";

const mediaBase = (playerId) => `/api/v1/players/${playerId}/media`;

// coach + player on match day + a linked season match
async function matchDayScenario() {
    const { token, user } = await createCoach();
    const player = await createPlayer(token);
    const p = await Player.findById(player._id).select("ageGroup");
    const teamIds = await defaultTeamIds(p.ageGroup);
    const seasonMatch = await setupPlayerMatchDay(player._id, teamIds, undefined, { attendedBy: user._id });
    return { token, coach: user, player, seasonMatch };
}

beforeEach(() => {
    vi.clearAllMocks();
    createStreamVideo.mockImplementation(async () => ({
        guid: `guid_${Math.random().toString(36).slice(2, 10)}`,
    }));
    deleteStreamVideo.mockResolvedValue(true);
});

describe("Video create — direct-to-Bunny envelope", () => {
    beforeEach(seedAgeGroups);

    it("mints a Bunny video + returns a presigned TUS envelope (status processing)", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "First half", seasonMatch: seasonMatch._id, fileHash: mkHash("mint-envelope") });

        expect(res.status).toBe(201);
        expect(createStreamVideo).toHaveBeenCalledTimes(1);
        expect(res.body.data.document.status).toBe("processing");
        expect(res.body.data.document.type).toBe("video");

        const env = res.body.data.upload;
        expect(env.tusEndpoint).toBe("https://video.bunnycdn.com/tusupload");
        expect(env.videoId).toBeTruthy();
        expect(env.signature).toMatch(/^[0-9a-f]{64}$/);
        expect(env.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));

        // the raw Bunny video id is NOT leaked in the decorated document
        expect(res.body.data.document.bunnyVideoId).toBeUndefined();
    });

    it("a coach with no team on the player (freeform) needs both title and description", async () => {
        const { token } = await createCoach();
        const player = await createPlayer(token); // no team → freeform

        const missingDescription = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", fileHash: mkHash("freeform-1") });
        expect(missingDescription.status).toBe(400);

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: mkHash("freeform-1") });
        expect(res.status).toBe(201);
        expect(createStreamVideo).toHaveBeenCalledTimes(1);
        expect(res.body.data.document.status).toBe("processing");
        expect(res.body.data.document.seasonMatch).toBeFalsy();
    });
});

describe("A1/F6 — one in-flight processing video per (player, match)", () => {
    beforeEach(seedAgeGroups);

    it("second create while processing re-issues the envelope (no second Bunny video); a create after ready is allowed", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("inflight-resume") });
        expect(first.status).toBe(201);

        const second = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("inflight-resume") });
        expect(second.status).toBe(200); // re-issued, not created
        expect(createStreamVideo).toHaveBeenCalledTimes(1);
        expect(second.body.data.upload.videoId).toBe(first.body.data.upload.videoId);

        // finish the first, then a new create IS allowed (multiple clips) — a different video (hash)
        await PlayerMedia.updateMany({ player: player._id }, { status: "ready" });
        const third = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("second-clip") });
        expect(third.status).toBe(201);
        expect(createStreamVideo).toHaveBeenCalledTimes(2);
    });
});

describe("F3 — re-issue envelope (resume) + guard", () => {
    beforeEach(seedAgeGroups);

    it("re-issues for a processing doc, rejects once ready, and 403 for a non-owner", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const created = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("f3-reissue") });
        const mediaId = created.body.data.document._id;

        const reissue = await request(app)
            .post(`${mediaBase(player._id)}/video/${mediaId}/upload-envelope`)
            .set("Authorization", `Bearer ${token}`)
            .send({});
        expect(reissue.status).toBe(200);
        expect(reissue.body.data.upload.videoId).toBe(created.body.data.upload.videoId);
        expect(reissue.body.data.upload.signature).toMatch(/^[0-9a-f]{64}$/);

        // a different coach cannot re-issue (403), even on their own match day path
        const { token: otherToken } = await createCoach();
        const forbidden = await request(app)
            .post(`${mediaBase(player._id)}/video/${mediaId}/upload-envelope`)
            .set("Authorization", `Bearer ${otherToken}`)
            .send({});
        expect([403, 404]).toContain(forbidden.status);

        // once ready → no more envelopes (would be an overwrite path)
        await PlayerMedia.findByIdAndUpdate(mediaId, { status: "ready" });
        const afterReady = await request(app)
            .post(`${mediaBase(player._id)}/video/${mediaId}/upload-envelope`)
            .set("Authorization", `Bearer ${token}`)
            .send({});
        expect(afterReady.status).toBe(400);
    });
});

describe("F2 — size cap enforced in syncVideoStatus (rejection after the fact)", () => {
    beforeEach(seedAgeGroups);

    it("oversize finished video → deleted from Bunny, marked failed, F8 counter incremented", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const created = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("f2-oversize") });
        const media = await PlayerMedia.findById(created.body.data.document._id);

        // Bunny reports finished (status 4) but way over the 1500 MB cap
        getStreamVideo.mockResolvedValue({
            status: 4,
            storageSize: 3000 * 1024 * 1024,
            length: 120,
        });

        const result = await syncVideoStatus(media.bunnyVideoId);
        expect(result.result).toBe("failed");
        expect(result.reason).toBe("too_large");
        expect(deleteStreamVideo).toHaveBeenCalledWith(media.bunnyVideoId);

        const after = await PlayerMedia.findById(media._id);
        expect(after.status).toBe("failed");

        const counter = await VideoUploadCounter.findOne({
            player: player._id,
            seasonMatch: seasonMatch._id,
        });
        expect(counter.failedVideoAttempts).toBe(1);
    });

    it("within-limit finished video → ready", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const created = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("f2-within-limit") });
        const media = await PlayerMedia.findById(created.body.data.document._id);

        getStreamVideo.mockResolvedValue({ status: 4, storageSize: 50 * 1024 * 1024, length: 90 });
        const result = await syncVideoStatus(media.bunnyVideoId);
        expect(result.result).toBe("ready");
        expect((await PlayerMedia.findById(media._id)).status).toBe("ready");
    });
});

describe("C1 — webhook is an untrusted trigger", () => {
    beforeEach(seedAgeGroups);

    async function processingVideo() {
        const { token, player, seasonMatch } = await matchDayScenario();
        createStreamVideo.mockResolvedValueOnce({ guid: "known-guid-123" });
        await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("c1-webhook") });
        return { player };
    }

    it("wrong secret path → 404 and no status change", async () => {
        await processingVideo();
        const res = await request(app)
            .post("/webhooks/bunny/wrong-secret")
            .send({ VideoLibraryId: "12345", VideoGuid: "known-guid-123", Status: 4 });
        expect(res.status).toBe(404);
        expect((await PlayerMedia.findOne({ bunnyVideoId: "known-guid-123" })).status).toBe("processing");
    });

    it("wrong library → 200 but no status change (ignored)", async () => {
        await processingVideo();
        getStreamVideo.mockResolvedValue({ status: 4, storageSize: 10, length: 10 });
        const res = await request(app)
            .post("/webhooks/bunny/test-webhook-secret")
            .send({ VideoLibraryId: "99999", VideoGuid: "known-guid-123", Status: 4 });
        expect(res.status).toBe(200);
        expect((await PlayerMedia.findOne({ bunnyVideoId: "known-guid-123" })).status).toBe("processing");
    });

    it("forged Status:4 does NOT flip status — only the Bunny API GET decides", async () => {
        await processingVideo();
        // attacker claims finished, but the authoritative API still says processing (status 2)
        getStreamVideo.mockResolvedValue({ status: 2 });
        const res = await request(app)
            .post("/webhooks/bunny/test-webhook-secret")
            .send({ VideoLibraryId: "12345", VideoGuid: "known-guid-123", Status: 4 });
        expect(res.status).toBe(200);
        expect((await PlayerMedia.findOne({ bunnyVideoId: "known-guid-123" })).status).toBe("processing");

        // now the API genuinely reports finished → the SAME webhook flips it
        getStreamVideo.mockResolvedValue({ status: 4, storageSize: 20 * 1024 * 1024, length: 60 });
        await request(app)
            .post("/webhooks/bunny/test-webhook-secret")
            .send({ VideoLibraryId: "12345", VideoGuid: "known-guid-123", Status: 4 });
        expect((await PlayerMedia.findOne({ bunnyVideoId: "known-guid-123" })).status).toBe("ready");
    });
});

describe("F8 — blast-radius caps", () => {
    beforeEach(seedAgeGroups);

    it("rejects creation past the ready-video cap for a (player, match)", async () => {
        const { token, coach, player, seasonMatch } = await matchDayScenario();
        // seed 5 ready videos (BUNNY_MAX_VIDEOS_PER_PLAYER_MATCH=5 in globalSetup)
        for (let i = 0; i < 5; i++) {
            await PlayerMedia.create({
                player: player._id,
                uploadedBy: coach._id,
                type: "video",
                storage: "bunny",
                bunnyVideoId: `ready_${i}`,
                status: "ready",
                seasonMatch: seasonMatch._id,
            });
        }
        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("f8-ready-cap") });
        expect(res.status).toBe(400);
        expect(createStreamVideo).not.toHaveBeenCalled();
    });

    it("locks the (player, match) after the failed-attempt threshold, and the lock survives deletion of the failed docs", async () => {
        const { token, coach, player, seasonMatch } = await matchDayScenario();

        // simulate 3 cap-violations (BUNNY_MAX_FAILED_ATTEMPTS_PER_PLAYER_MATCH=3)
        await VideoUploadCounter.create({
            player: player._id,
            seasonMatch: seasonMatch._id,
            failedVideoAttempts: 3,
        });
        // and their PlayerMedia docs already swept away (A2/retention)
        await PlayerMedia.deleteMany({ player: player._id, status: "failed" });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: mkHash("f8-lockout") });
        expect(res.status).toBe(400);
        expect(createStreamVideo).not.toHaveBeenCalled();

        // a DIFFERENT match for the same player starts at zero (new counter)
        const teamIds = await defaultTeamIds((await Player.findById(player._id)).ageGroup);
        const otherMatch = await setupPlayerMatchDay(player._id, teamIds, undefined, { attendedBy: coach._id });
        const ok = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: otherMatch._id, fileHash: mkHash("f8-other-match") });
        expect(ok.status).toBe(201);
    });
});

describe("duplicate video hash detection", () => {
    beforeEach(seedAgeGroups);

    it("blocks a duplicate upload of an existing READY video's hash", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const dupHash = mkHash("dup-ready");

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        expect(first.status).toBe(201);
        await PlayerMedia.findByIdAndUpdate(first.body.data.document._id, { status: "ready" });

        const dup = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        expect(dup.status).toBe(400);
        expect(dup.body.errors?.[0]?.msg ?? dup.body.message).toMatch(/already been uploaded/);
    });

    it("blocks a duplicate upload of the same hash by the SAME uploader too (global per player, not per uploader)", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const dupHash = mkHash("dup-same-uploader");

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        await PlayerMedia.findByIdAndUpdate(first.body.data.document._id, { status: "ready" });

        const dup = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        expect(dup.status).toBe(400);
    });

    it("does NOT block the same hash for a DIFFERENT player (scope is per-player)", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const sameHash = mkHash("cross-player");

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: sameHash });
        await PlayerMedia.findByIdAndUpdate(first.body.data.document._id, { status: "ready" });

        const otherPlayer = await createPlayer(token); // no team → freeform, no seasonMatch involved

        const res = await request(app)
            .post(`${mediaBase(otherPlayer._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: sameHash });
        expect(res.status).toBe(201);
    });

    it("does NOT block a hash matching a FAILED video (failed uploads don't count as already-uploaded)", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const dupHash = mkHash("dup-failed");

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        await PlayerMedia.findByIdAndUpdate(first.body.data.document._id, { status: "failed" });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: dupHash });
        expect(res.status).toBe(201);
    });

    it("the same uploader's own in-flight PROCESSING video for the same hash is NOT a duplicate — it re-issues the envelope as before", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();
        const sameHash = mkHash("dup-inflight-self");

        const first = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: sameHash });
        expect(first.status).toBe(201); // still processing

        const second = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: sameHash });
        expect(second.status).toBe(200); // re-issued, not rejected as a duplicate
        expect(second.body.data.upload.videoId).toBe(first.body.data.upload.videoId);
    });

    it("a DIFFERENT uploader's in-flight PROCESSING video for the same hash IS blocked as a duplicate", async () => {
        const { token, coach, player, seasonMatch } = await matchDayScenario();
        const sameHash = mkHash("dup-inflight-other");

        await PlayerMedia.create({
            player: player._id,
            uploadedBy: coach._id,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "guid_other_inflight",
            status: "processing",
            seasonMatch: seasonMatch._id,
            fileHash: sameHash,
        });

        const { token: otherToken, user: observer } = await createObserver();
        await Player.findByIdAndUpdate(player._id, { $addToSet: { observers: observer._id } });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${otherToken}`)
            .send({ title: "x", description: "y", fileHash: sameHash });
        expect(res.status).toBe(400);
    });

    it("rejects a missing or malformed fileHash", async () => {
        const { token, player, seasonMatch } = await matchDayScenario();

        const missing = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id });
        expect(missing.status).toBe(400);

        const malformed = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ seasonMatch: seasonMatch._id, fileHash: "not-a-valid-hash" });
        expect(malformed.status).toBe(400);
    });
});

// ============================
// mediaMatchGate — 3-day window (day before / of / after the match) + confirmed
// attendance + entered result. No "blocked" mode: coach and observer are treated
// identically — a match that doesn't fully qualify just falls back to freeform
// (title/description required), it never hard-blocks the upload.
// ============================
describe("mediaMatchGate — 3-day window + role split", () => {
    beforeEach(seedAgeGroups);

    const DAY = 86_400_000;
    // Fixed "now" so window-boundary fixtures aren't flaky depending on when the suite runs.
    const NOW = new Date("2026-03-15T12:00:00Z");
    const TODAY_UTC = Date.UTC(2026, 2, 15);

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    // coach + player with a team assigned, no match created yet
    async function teamOnlyScenario() {
        const { token, user } = await createCoach();
        const player = await createPlayer(token);
        const p = await Player.findById(player._id).select("ageGroup");
        const teamIds = await defaultTeamIds(p.ageGroup);
        await Player.findByIdAndUpdate(player._id, { team: teamIds.homeTeam });
        return { token, user, player, teamIds };
    }

    // ① every one of these three (yesterday/today/tomorrow) individually re-checked and updated:
    // a match only auto-links now if the uploader also attended it AND its result was entered
    // (status: completed + result set) — not just "falls in the 3-day window".
    it.each([
        ["yesterday", -1],
        ["today", 0],
        ["tomorrow", 1],
    ])("match %s (within window, attended, result entered) → succeeds and auto-links", async (_label, offsetDays) => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC + offsetDays * DAY), {
            attendedBy: user._id,
        });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash(`gate-window-${_label}`) });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBe(match._id.toString());
    });

    // ② the literal reported bug: a match dated tomorrow, still scheduled (no result), must
    // NEVER auto-link — even though it falls in the window and the uploader is an attendee.
    // There's no "blocked" mode anymore — a non-qualifying match just falls back to freeform
    // (title/description required), same as if there were no match at all.
    it("reproduces the reported bug: a scheduled match dated tomorrow must never auto-link, even if the uploader is an attendee", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC + DAY));
        await SeasonMatch.findByIdAndUpdate(match._id, { attendees: [user._id] }); // attended, but status stays "scheduled" — no result

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: mkHash("gate-reported-bug") });
        expect(res.status).toBe(201); // freeform succeeds, but must NOT auto-link to the unplayed match
        expect(res.body.data.document.seasonMatch).toBeFalsy();
    });

    it("match in-window, attended, but result not yet entered (status still scheduled) → freeform, never gated", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC));
        await SeasonMatch.findByIdAndUpdate(match._id, { attendees: [user._id] });

        const missing = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash("gate-no-result-1") });
        expect(missing.status).toBe(400); // freeform requires title+description

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: mkHash("gate-no-result-1") });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBeFalsy();
    });

    it("match in-window with a completed result, but the uploader is NOT an attendee → freeform, never gated", async () => {
        const { token, player, teamIds } = await teamOnlyScenario();
        // completed + result set, but attendedBy left unset (no attendees) — a different coach's fixture
        await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC));

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: mkHash("gate-not-attendee") });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBeFalsy();
    });

    // ④ the realistic follow-through case, standalone: yesterday's match, marked completed
    // with a result entered today (today = the frozen NOW) — still qualifies as gated. This is
    // the scenario that justifies keeping the 3-day window as an *additional* filter.
    it("a match played yesterday, marked completed with a result today, still qualifies (window + attendance + result all satisfied)", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC - DAY), {
            attendedBy: user._id,
        });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash("gate-yesterday-completed") });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBe(match._id.toString());
    });

    it("a match exactly at the inclusive lower boundary (yesterday 00:00Z) is allowed; 1ms earlier is not", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC - DAY - 1), { attendedBy: user._id });

        const outside = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "x", description: "y", fileHash: mkHash("gate-lower-boundary") });
        expect(outside.status).toBe(201); // outside the window → freeform, not gated
        expect(outside.body.data.document.seasonMatch).toBeFalsy();
    });

    it("a match exactly at the exclusive upper boundary (2 days from now) is excluded; 1ms earlier is allowed", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC + 2 * DAY - 1), {
            attendedBy: user._id,
        });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash("gate-upper-boundary") });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBe(match._id.toString());
    });

    it("two matches inside the window, both attended + completed → links the later one", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC - DAY), { attendedBy: user._id });
        const later = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC), { attendedBy: user._id });

        const res = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash("gate-two-matches") });
        expect(res.status).toBe(201);
        expect(res.body.data.document.seasonMatch).toBe(later._id.toString());
    });

    it("registered team with zero matches ever → freeform (title/description required)", async () => {
        const { token, player } = await teamOnlyScenario();

        const missing = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ fileHash: mkHash("gate-zero-matches") });
        expect(missing.status).toBe(400);

        const ok = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "training", description: "session", fileHash: mkHash("gate-zero-matches") });
        expect(ok.status).toBe(201);
        expect(ok.body.data.document.seasonMatch).toBeFalsy();
    });

    it("no role split anymore: outside the window both a coach and an observer may upload freeform", async () => {
        const { token: coachToken, player, teamIds } = await teamOnlyScenario();
        // a fixture exists, but well outside the 3-day window
        await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC - 10 * DAY));

        const missingCoachFields = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${coachToken}`)
            .send({ fileHash: mkHash("gate-role-split-coach") });
        expect(missingCoachFields.status).toBe(400);

        const coachAllowed = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${coachToken}`)
            .send({ title: "x", description: "y", fileHash: mkHash("gate-role-split-coach") });
        expect(coachAllowed.status).toBe(201);
        expect(coachAllowed.body.data.document.seasonMatch).toBeFalsy();

        const { token: observerToken, user: observer } = await createObserver();
        await Player.findByIdAndUpdate(player._id, { $addToSet: { observers: observer._id } });

        const missingFields = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${observerToken}`)
            .send({ fileHash: mkHash("gate-role-split-observer") });
        expect(missingFields.status).toBe(400);

        const allowed = await request(app)
            .post(`${mediaBase(player._id)}/video`)
            .set("Authorization", `Bearer ${observerToken}`)
            .send({ title: "training", description: "session", fileHash: mkHash("gate-role-split-observer") });
        expect(allowed.status).toBe(201);
        expect(allowed.body.data.document.seasonMatch).toBeFalsy();
    });

    it("GET .../upload-eligibility returns freeform for both roles when no match qualifies", async () => {
        const { token: coachToken, player, teamIds } = await teamOnlyScenario();
        await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC - 10 * DAY));

        const { token: observerToken, user: observer } = await createObserver();
        await Player.findByIdAndUpdate(player._id, { $addToSet: { observers: observer._id } });

        const coachRes = await request(app)
            .get(`${mediaBase(player._id)}/upload-eligibility`)
            .set("Authorization", `Bearer ${coachToken}`);
        expect(coachRes.status).toBe(200);
        expect(coachRes.body.data.mode).toBe("freeform");

        const observerRes = await request(app)
            .get(`${mediaBase(player._id)}/upload-eligibility`)
            .set("Authorization", `Bearer ${observerToken}`);
        expect(observerRes.status).toBe(200);
        expect(observerRes.body.data.mode).toBe("freeform");
    });

    it("GET .../upload-eligibility returns mode=gated with the auto-linked match when one falls in the window", async () => {
        const { token, user, player, teamIds } = await teamOnlyScenario();
        const match = await setupPlayerMatchDay(player._id, teamIds, new Date(TODAY_UTC), { attendedBy: user._id });

        const res = await request(app)
            .get(`${mediaBase(player._id)}/upload-eligibility`)
            .set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.mode).toBe("gated");
        expect(res.body.data.seasonMatch._id).toBe(match._id.toString());
    });
});
