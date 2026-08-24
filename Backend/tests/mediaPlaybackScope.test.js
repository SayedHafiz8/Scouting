import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../app.js";
import Player from "../models/playedModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import {
    createCoach,
    createAdmin,
    createPlayer,
    seedAgeGroups,
} from "./helpers/factory.js";

// Frontend audit fix S1 — video playback (url/embedUrl/download) must be
// admin-only at the API itself, not just hidden by the Angular template.
// decorateMedia() previously signed and shipped playable Bunny URLs to every
// role regardless of who could see a "play" button in the UI — a coach or
// observer could read them straight out of the Network tab. This file
// exercises decorateMedia() through every response shape it feeds, on the
// exact viewer/uploader combination that matters most: the uploader viewing
// their own ready video, which used to be treated as an implicit exception
// and no longer is.
//
// No Bunny mock needed — GET endpoints only sign URLs from a stored
// bunnyVideoId, they never call the network (same technique as
// seasonMatches.test.js's "per-scout scoping" describe block).

describe("Video playback URLs are admin-only", () => {
    beforeEach(seedAgeGroups);

    async function readyVideoForCoach() {
        const { token, user } = await createCoach();
        const player = await createPlayer(token);
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: user._id,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "ready_coach_own",
            status: "ready",
            title: "COACH OWN VIDEO",
        });
        return { token, player, media };
    }

    function assertPlaybackWithheld(doc) {
        expect(doc.url).toBeFalsy();
        expect(doc.embedUrl).toBeUndefined();
        expect(doc.download).toBeUndefined();
        expect(doc.thumbnail).toBeTruthy(); // the grid card still needs this
        expect(doc.bunnyVideoId).toBeUndefined(); // internal id never leaks either way
    }

    function assertPlaybackGranted(doc) {
        expect(doc.url).toBeTruthy();
        expect(doc.embedUrl).toBeTruthy();
        expect(doc.download).toBeTruthy();
        expect(doc.thumbnail).toBeTruthy();
    }

    it("GET /players/:id/media — the uploading coach cannot play their own video", async () => {
        const { token, player } = await readyVideoForCoach();

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents).toHaveLength(1);
        assertPlaybackWithheld(res.body.data.documents[0]);
        expect(res.body.data.documents[0].title).toBe("COACH OWN VIDEO");
    });

    it("GET /players/:id/media/:mediaId — same coach, single-item route", async () => {
        const { token, player, media } = await readyVideoForCoach();

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        assertPlaybackWithheld(res.body.data.document);
    });

    it("GET /players/:id/media — an admin CAN play the same video", async () => {
        const { player } = await readyVideoForCoach();
        const { token: adminToken } = await createAdmin();

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents).toHaveLength(1);
        assertPlaybackGranted(res.body.data.documents[0]);
    });

    it("images are unaffected — a coach still gets a signed image url", async () => {
        const { token, user } = await createCoach();
        const player = await createPlayer(token);
        await PlayerMedia.create({
            player: player._id,
            uploadedBy: user._id,
            type: "image",
            storage: "bunny",
            storageKey: "player-media/coach-shot.webp",
            status: "ready",
            title: "COACH IMAGE",
        });

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents).toHaveLength(1);
        expect(res.body.data.documents[0].url).toBeTruthy();
        expect(res.body.data.documents[0].url).toMatch(/[?&]token=/);
    });

    it("a video still processing shows no url for anyone, admin included", async () => {
        const { token: coachToken, user } = await createCoach();
        const player = await createPlayer(coachToken);
        await PlayerMedia.create({
            player: player._id,
            uploadedBy: user._id,
            type: "video",
            storage: "bunny",
            bunnyVideoId: "still_processing",
            status: "processing",
        });
        const { token: adminToken } = await createAdmin();

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents[0].url).toBeFalsy();
        expect(res.body.data.documents[0].embedUrl).toBeUndefined();
    });
});
