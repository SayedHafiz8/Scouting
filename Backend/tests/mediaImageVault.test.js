import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import crypto from "node:crypto";

// Mock ONLY the Bunny network wrappers; keep bunnyConfig (signing/config) real.
vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createStreamVideo: vi.fn(async () => ({ guid: "vid" })),
        getStreamVideo: vi.fn(),
        deleteStreamVideo: vi.fn(async () => true),
        putStorageObject: vi.fn(async () => true),
        getStorageObject: vi.fn(async () => null),
        deleteStorageObject: vi.fn(async () => true),
        purgeUrl: vi.fn(async () => true),
    };
});

import app from "../app.js";
import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import IdCardAccessLog from "../models/idCardAccessLogModel.js";
import { putStorageObject, getStorageObject, deleteStorageObject, purgeUrl } from "../config/bunny.js";
import {
    createAdmin,
    createCoach,
    createPlayer,
    defaultTeamIds,
    setupPlayerMatchDay,
    seedAgeGroups,
} from "./helpers/factory.js";

let jpeg;
beforeEach(async () => {
    vi.clearAllMocks();
    putStorageObject.mockResolvedValue(true);
    deleteStorageObject.mockResolvedValue(true);
    purgeUrl.mockResolvedValue(true);
    jpeg = await sharp({ create: { width: 12, height: 12, channels: 3, background: "red" } })
        .jpeg()
        .toBuffer();
});

const vaultToken = (adminId) =>
    jwt.sign({ userId: adminId.toString(), vault: true }, process.env.JWT_SECRET_KEY, {
        expiresIn: "5m",
    });

describe("§5 — scouting image upload goes to Bunny media zone", () => {
    beforeEach(seedAgeGroups);

    async function matchDayPlayer() {
        const { token, user } = await createCoach();
        const player = await createPlayer(token);
        const p = await Player.findById(player._id).select("ageGroup");
        const teamIds = await defaultTeamIds(p.ageGroup);
        await setupPlayerMatchDay(player._id, teamIds, undefined, { attendedBy: user._id });
        return { token, player };
    }

    // مفيش رفع صورة منفردة بقى — كل صورة لازم تترفع مع فيديو (linkedVideo مطلوب)
    async function createVideoDoc(token, playerId) {
        const res = await request(app)
            .post(`/api/v1/players/${playerId}/media/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "clip", fileHash: crypto.randomBytes(32).toString("hex") });
        expect(res.status).toBe(201);
        return res.body.data.document._id;
    }

    it("stores a media-zone key and returns a signed URL (no key leaked)", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot.jpg");

        expect(res.status).toBe(201);
        expect(putStorageObject).toHaveBeenCalledTimes(1);
        const doc = res.body.data.document;
        expect(doc.type).toBe("image");
        expect(doc.url).toContain("test-media.b-cdn.net"); // media CDN host from globalSetup
        expect(doc.url).toMatch(/[?&]token=/);
        expect(doc.storageKey).toBeUndefined(); // internal key not exposed

        // stored value in DB is the object key, not a URL
        const saved = await PlayerMedia.findById(doc._id);
        expect(saved.storageKey).toMatch(/^player-media\//);
        expect(saved.url).toBeFalsy();
    });

    it("rejects video through the multipart route (must use direct-to-Bunny)", async () => {
        const { token, player } = await matchDayPlayer();
        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .attach("file", Buffer.from("fake mp4"), "clip.mp4");
        expect(res.status).toBe(400);
        expect(putStorageObject).not.toHaveBeenCalled();
    });

    it("delete and download are admin-only — the uploading coach gets 403 on both", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);
        const created = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot.jpg");
        const id = created.body.data.document._id;

        const deleteDenied = await request(app)
            .delete(`/api/v1/players/${player._id}/media/${id}`)
            .set("Authorization", `Bearer ${token}`);
        expect(deleteDenied.status).toBe(403);

        const downloadDenied = await request(app)
            .get(`/api/v1/players/${player._id}/media/${videoId}/download`)
            .set("Authorization", `Bearer ${token}`);
        expect(downloadDenied.status).toBe(403);
    });

    it("F5 — deleting a media-zone image purges the CDN edge", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);
        const created = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot.jpg");
        const id = created.body.data.document._id;

        // Delete is admin-only — the uploading coach can no longer delete their own media
        const { token: adminToken } = await createAdmin();
        const del = await request(app)
            .delete(`/api/v1/players/${player._id}/media/${id}`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(del.status).toBe(204);
        expect(deleteStorageObject).toHaveBeenCalledTimes(1);
        expect(purgeUrl).toHaveBeenCalledTimes(1); // edge purge
    });
});

describe("linkedVideo — companion images attached to a video upload", () => {
    beforeEach(seedAgeGroups);

    async function matchDayPlayer() {
        const { token, user } = await createCoach();
        const player = await createPlayer(token);
        const p = await Player.findById(player._id).select("ageGroup");
        const teamIds = await defaultTeamIds(p.ageGroup);
        await setupPlayerMatchDay(player._id, teamIds, undefined, { attendedBy: user._id });
        return { token, player };
    }

    async function createVideoDoc(token, playerId) {
        const res = await request(app)
            .post(`/api/v1/players/${playerId}/media/video`)
            .set("Authorization", `Bearer ${token}`)
            .send({ title: "clip", fileHash: crypto.randomBytes(32).toString("hex") });
        expect(res.status).toBe(201);
        return res.body.data.document._id;
    }

    it("rejects an image upload with no linkedVideo (standalone image upload is no longer supported)", async () => {
        const { token, player } = await matchDayPlayer();
        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .attach("file", jpeg, "shot.jpg");
        expect(res.status).toBe(400);
    });

    it("uploads an image with a valid linkedVideo", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot.jpg");

        expect(res.status).toBe(201);
        const saved = await PlayerMedia.findById(res.body.data.document._id);
        expect(saved.linkedVideo.toString()).toBe(videoId);
    });

    it("rejects a linkedVideo pointing at an image (not a video)", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);
        const image = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "first.jpg");
        const imageId = image.body.data.document._id;

        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", imageId)
            .attach("file", jpeg, "second.jpg");
        expect(res.status).toBe(400);
    });

    it("rejects a linkedVideo belonging to another uploader", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        // another coach doesn't own this player, so ownership middleware blocks the request
        // before the linkedVideo validator even runs (403, not 400) — still correctly rejected
        const { token: otherToken } = await createCoach();
        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${otherToken}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot.jpg");
        expect(res.status).toBe(403);
    });

    it("rejects a 3rd image linked to the same video (cap of 2)", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        for (let i = 0; i < 2; i++) {
            const ok = await request(app)
                .post(`/api/v1/players/${player._id}/media`)
                .set("Authorization", `Bearer ${token}`)
                .field("linkedVideo", videoId)
                .attach("file", jpeg, `shot${i}.jpg`);
            expect(ok.status).toBe(201);
        }

        const third = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "shot3.jpg");
        expect(third.status).toBe(400);
    });

    it("rejects linkedVideo sent on a video-mimetype upload", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", Buffer.from("fake mp4"), "clip.mp4");
        expect(res.status).toBe(400);
    });

    it("deleting a video cascades to its linked images; deleting one linked image alone doesn't touch the rest", async () => {
        const { token, player } = await matchDayPlayer();
        const videoId = await createVideoDoc(token, player._id);

        const imgA = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "a.jpg");
        const imgB = await request(app)
            .post(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`)
            .field("linkedVideo", videoId)
            .attach("file", jpeg, "b.jpg");

        // Delete is admin-only — the uploading coach can no longer delete their own media
        const { token: adminToken } = await createAdmin();

        // deleting one linked image alone leaves the video and the other image untouched
        const delOne = await request(app)
            .delete(`/api/v1/players/${player._id}/media/${imgA.body.data.document._id}`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(delOne.status).toBe(204);
        expect(await PlayerMedia.findById(videoId)).not.toBeNull();
        expect(await PlayerMedia.findById(imgB.body.data.document._id)).not.toBeNull();

        // deleting the video cascades to the remaining linked image
        const delVideo = await request(app)
            .delete(`/api/v1/players/${player._id}/media/${videoId}`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(delVideo.status).toBe(204);
        expect(await PlayerMedia.findById(imgB.body.data.document._id)).toBeNull();
    });
});

describe("C3 — ID cards live in the vault zone, streamed through the backend", () => {
    beforeEach(seedAgeGroups);

    it("upload stores a vault key (no URL exposed); presence endpoint returns booleans", async () => {
        const { token, user: admin } = await createAdmin();
        const { user: coach } = await createCoach();

        const up = await request(app)
            .patch(`/api/v1/users/${coach._id}/idCardImg/front`)
            .set("Authorization", `Bearer ${token}`)
            .attach("idCardFrontImg", jpeg, "front.jpg");

        expect(up.status).toBe(200);
        expect(putStorageObject).toHaveBeenCalledTimes(1);
        // response never contains a path or URL
        expect(JSON.stringify(up.body)).not.toMatch(/idcards\//);
        expect(up.body.data.user.idCardFrontImg).toBeUndefined(); // stripped by toJSON

        const stored = await User.findById(coach._id).select("idCardFrontImg");
        expect(stored.idCardFrontImg).toMatch(/^idcards\/front\//);

        const presence = await request(app)
            .get(`/api/v1/users/${coach._id}/idCardImg`)
            .set("Authorization", `Bearer ${token}`)
            .set("X-Vault-Token", vaultToken(admin._id));
        expect(presence.status).toBe(200);
        expect(presence.body.data).toEqual({ front: true, back: false });
    });

    it("streams the bytes with no-store + writes an audit row; rejects without a vault token", async () => {
        const { token, user: admin } = await createAdmin();
        const { user: coach } = await createCoach();

        await request(app)
            .patch(`/api/v1/users/${coach._id}/idCardImg/front`)
            .set("Authorization", `Bearer ${token}`)
            .attach("idCardFrontImg", jpeg, "front.jpg");

        // vault returns the bytes
        getStorageObject.mockResolvedValue({ buffer: jpeg, contentType: "image/jpeg" });

        // no vault token → 403
        const noToken = await request(app)
            .get(`/api/v1/users/${coach._id}/idcard/front`)
            .set("Authorization", `Bearer ${token}`);
        expect(noToken.status).toBe(403);

        const res = await request(app)
            .get(`/api/v1/users/${coach._id}/idcard/front`)
            .set("Authorization", `Bearer ${token}`)
            .set("X-Vault-Token", vaultToken(admin._id))
            .buffer(true)
            .parse((r, cb) => {
                const chunks = [];
                r.on("data", (c) => chunks.push(c));
                r.on("end", () => cb(null, Buffer.concat(chunks)));
            });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toContain("image/jpeg");
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body.length).toBe(jpeg.length); // real bytes, never a URL

        const logs = await IdCardAccessLog.find({ targetUser: coach._id });
        expect(logs.length).toBe(1);
        expect(logs[0].side).toBe("front");
        expect(logs[0].viewer.toString()).toBe(admin._id.toString());
    });
});

describe("C4 — avatar toJSON resolves stored key → signed URL", () => {
    beforeEach(seedAgeGroups);

    it("bunny key → signed URL; legacy http → passthrough", async () => {
        const { token } = await createAdmin();
        const { user: bunnyUser } = await createCoach({ profileImg: "profiles/abc.jpg" });
        const { user: legacyUser } = await createCoach({
            profileImg: "https://res.cloudinary.com/x/y.jpg",
        });

        const a = await request(app)
            .get(`/api/v1/users/${bunnyUser._id}`)
            .set("Authorization", `Bearer ${token}`);
        expect(a.body.data.document.profileImg).toContain("test-media.b-cdn.net");
        expect(a.body.data.document.profileImg).toMatch(/[?&]token=/);

        const b = await request(app)
            .get(`/api/v1/users/${legacyUser._id}`)
            .set("Authorization", `Bearer ${token}`);
        expect(b.body.data.document.profileImg).toBe("https://res.cloudinary.com/x/y.jpg");
    });
});
