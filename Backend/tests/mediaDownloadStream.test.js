// audit-backend — downloadVideo بيـstream، مابيحمّلش الملف في الذاكرة.
//
// الشكل القديم: `Buffer.from(await upstream.arrayBuffer())` — الملف كله في
// allocation واحد قبل ما أول بايت يوصل العميل. الحجم مقيّد بـ
// BUNNY_MAX_VIDEO_MB وهو متغيّر بيئة، فرفعه لـ1500 كان بيحوّل تعديل كونفيج
// لـOOM بيقتل البروسيس. والبفرة كانت بتخفي حالتين: رد باني غير 2xx (جسم الخطأ
// كان بيتبلع)، وقطع العميل في نص التحميل.
//
// التستات دي بتقفل السلوك المرئي: البايتات بتوصل صح، جسم الخطأ عمره ما يتبعت
// كأنه فيديو، والذاكرة مابتتناسبش مع حجم الملف.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import app from "../app.js";
import PlayerMedia from "../models/playerMediaModel.js";
import { createAdmin, createCoach, createPlayer, seedAgeGroups } from "./helpers/factory.js";

const readyVideo = async (playerId, uploaderId, overrides = {}) =>
    PlayerMedia.create({
        player: playerId,
        uploadedBy: uploaderId,
        type: "video",
        storage: "bunny",
        bunnyVideoId: "dl-vid-1",
        status: "ready",
        title: "Match clip",
        description: "a clip",
        ...overrides,
    });

// جسم web-stream بيطلّع الشرائح دي بالترتيب
const webStreamOf = (chunks) =>
    new ReadableStream({
        start(controller) {
            for (const c of chunks) controller.enqueue(new Uint8Array(c));
            controller.close();
        },
    });

const upstreamOk = (chunks, headers = {}) => ({
    ok: true,
    status: 200,
    headers: new Headers(headers),
    body: webStreamOf(chunks),
});

describe("downloadVideo — streamed, not buffered", () => {
    let admin;
    let player;

    beforeEach(async () => {
        await seedAgeGroups();
        admin = await createAdmin();
        const coach = await createCoach();
        player = await createPlayer(coach.token);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("streams the bytes through with the forced attachment header", async () => {
        const media = await readyVideo(player._id, admin.user._id);
        const payload = [[1, 2, 3], [4, 5, 6], [7, 8, 9, 10]];

        vi.stubGlobal("fetch", vi.fn(async () => upstreamOk(payload, { "content-length": "10" })));

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toMatch(/video\/mp4/);
        expect(res.headers["content-disposition"]).toBe('attachment; filename="Match_clip.mp4"');
        // الطول بيتمرّر من باني لما يكون موجود
        expect(res.headers["content-length"]).toBe("10");
        // والبايتات كاملة وبالترتيب — الشرائح اتلمّت زي ما هي
        expect([...res.body]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it("omits Content-Length when upstream does not provide it", async () => {
        const media = await readyVideo(player._id, admin.user._id);
        vi.stubGlobal("fetch", vi.fn(async () => upstreamOk([[1, 2]])));

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(200);
        expect(res.headers["content-length"]).toBeUndefined();
    });

    // ── الحالة اللي البفرة كانت بتخفيها ──────────────────────────────────────
    it("upstream non-2xx becomes 502 — the error body is never sent as video", async () => {
        const media = await readyVideo(player._id, admin.user._id);
        const cancel = vi.fn(async () => {});

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({
                ok: false,
                status: 404,
                headers: new Headers(),
                body: { cancel },
            }))
        );

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(502);
        // مش فيديو — لا نوع المحتوى ولا هيدر التنزيل اتحطوا
        expect(res.headers["content-type"]).not.toMatch(/video\/mp4/);
        expect(res.headers["content-disposition"]).toBeUndefined();
        // والجسم اتقفل بدل ما يفضل نص مقروء على الـsocket
        expect(cancel).toHaveBeenCalled();
    });

    it("a fetch rejection becomes 502, not an unhandled crash", async () => {
        const media = await readyVideo(player._id, admin.user._id);
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(502);
    });

    it("passes an AbortSignal so a client disconnect can tear down the upstream", async () => {
        const media = await readyVideo(player._id, admin.user._id);
        const fetchMock = vi.fn(async () => upstreamOk([[1]]));
        vi.stubGlobal("fetch", fetchMock);

        await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        const [, opts] = fetchMock.mock.calls[0];
        expect(opts?.signal).toBeDefined();
        expect(typeof opts.signal.aborted).toBe("boolean");
    });

    // ── الذاكنة مابتتناسبش مع الحجم ──────────────────────────────────────────
    //
    // القياس المباشر للـheap مش موثوق في تست (الـGC توقيته مش محدد)، فالتست ده
    // بيقفل السبب البنيوي بدل النتيجة: الـbody بيتقرا **بالتدريج** كـstream،
    // ومحصلش أي نداء يقرا الملف كله في allocation واحد. لو حد رجّع
    // arrayBuffer()/text() تاني، ده بيفشل.
    it("never reads the whole body into one allocation", async () => {
        const media = await readyVideo(player._id, admin.user._id);

        const arrayBuffer = vi.fn();
        const text = vi.fn();
        const blob = vi.fn();
        let pulls = 0;

        const body = new ReadableStream({
            pull(controller) {
                pulls++;
                if (pulls <= 4) {
                    controller.enqueue(new Uint8Array([pulls]));
                } else {
                    controller.close();
                }
            },
        });

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), body, arrayBuffer, text, blob }))
        );

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(200);
        expect(arrayBuffer).not.toHaveBeenCalled();
        expect(text).not.toHaveBeenCalled();
        expect(blob).not.toHaveBeenCalled();
        // اتقرا على أكتر من دفعة — يعني فعلاً تدريجي
        expect(pulls).toBeGreaterThan(1);
        expect([...res.body]).toEqual([1, 2, 3, 4]);
    });

    // ── الفحوص اللي كانت موجودة قبل الـbody لازم تفضل قبله ──────────────────
    it("a non-ready video is rejected before any fetch happens", async () => {
        const media = await readyVideo(player._id, admin.user._id, { status: "processing" });
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("a title with unsafe characters is sanitised in the filename", async () => {
        const media = await readyVideo(player._id, admin.user._id, {
            title: 'a/b\\c "quote" ;rm -rf',
        });
        vi.stubGlobal("fetch", vi.fn(async () => upstreamOk([[1]])));

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
            .set("Authorization", `Bearer ${admin.token}`);

        expect(res.status).toBe(200);
        expect(res.headers["content-disposition"]).toBe('attachment; filename="a_b_c_quote_rm_-rf.mp4"');
    });
});
