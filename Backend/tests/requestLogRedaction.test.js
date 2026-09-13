// audit-backend — سر الويبهوك في لوجز الوصول.
//
// `POST /webhooks/bunny/:secret` (app.js) بيحط BUNNY_STREAM_WEBHOOK_SECRET في
// مسار الـURL، وmorgan('combined') بيسجّل الـURL كامل — فالسر بيتكتب بالنص
// الصريح في لوج العملية ولوج أي reverse proxy قدّامها. السر ده مابينتهيش
// لوحده، فقراءة اللوج = تزوير نداءات ويبهوك لأجل غير مسمى.
//
// العقد اللي التستات دي بتقفله:
//   • مسار الويبهوك بيتسجّل مطموس، والسر مايظهرش حرفياً في المخرجات.
//   • السر **الغلط** بيتطمس كمان — تخمينات المهاجم مش بتتسجّل حرفياً.
//   • الطمس على النمط مش على القيمة: بيشتغل والسر متغيّر أو مش متظبط أصلاً.
//   • أي مسار تاني بيتسجّل زي ما هو بالظبط.
//   • الهاندلر لسه بياخد السر الحقيقي وبيتحقق منه صح — الطمس في طبقة اللوج بس.
//
// morgan متوقّف في NODE_ENV=test (app.js)، فبنبني هنا أپ صغيرة بنفس الميدلوير
// ونفس الهاندلر الحقيقي، والستريم محقون عشان نمسك السطر المكتوب.

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";

// نفس نمط باقي تستات الميديا: بنموّك رحلات الشبكة لباني بس، وbunnyConfig
// (اللي منه بيتقرا webhookSecret) بيفضل حقيقي.
vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        getStreamVideo: vi.fn(async () => null),
        createStreamVideo: vi.fn(),
        deleteStreamVideo: vi.fn(async () => true),
    };
});

import {
    redactSensitiveUrl,
    createRequestLogger,
    REDACTION_PLACEHOLDER,
} from "../middlewares/requestLogger.js";
import { bunnyWebhook } from "../controllers/playerMediaController.js";

// globalSetup.js بيظبطها على القيمة دي
const SECRET = process.env.BUNNY_STREAM_WEBHOOK_SECRET;

// ════════════════════════════════════════════════════════════════════════════
//  الدالة نفسها — من غير Express ولا morgan
// ════════════════════════════════════════════════════════════════════════════
describe("redactSensitiveUrl", () => {
    it("redacts the secret segment of the Bunny webhook path", () => {
        expect(redactSensitiveUrl("/webhooks/bunny/s3cr3t")).toBe(
            `/webhooks/bunny/${REDACTION_PLACEHOLDER}`
        );
    });

    it("redacts by pattern, so any value is covered — rotated, wrong, or encoded", () => {
        for (const value of [
            "a", // سر قصير
            "x".repeat(200), // سر طويل
            "wrong-secret-guess", // تخمين مهاجم
            "%73ecret", // مرمّز — Express بيفكّه، فبيوصل الهاندلر صالح
            "sec.ret_with-chars~", // رموز مسموحة في المقطع
        ]) {
            const out = redactSensitiveUrl(`/webhooks/bunny/${value}`);
            expect(out).toBe(`/webhooks/bunny/${REDACTION_PLACEHOLDER}`);
            expect(out).not.toContain(value);
        }
    });

    it("redacts regardless of case — Express routing is case-insensitive by default", () => {
        // من غير ده، /WEBHOOKS/BUNNY/<secret> بتوصل الهاندلر وبتتسجّل بالنص
        expect(redactSensitiveUrl("/WEBHOOKS/BUNNY/s3cr3t")).toBe(
            `/WEBHOOKS/BUNNY/${REDACTION_PLACEHOLDER}`
        );
    });

    it("keeps everything after the secret segment intact", () => {
        expect(redactSensitiveUrl("/webhooks/bunny/s3cr3t/extra?a=1")).toBe(
            `/webhooks/bunny/${REDACTION_PLACEHOLDER}/extra?a=1`
        );
        expect(redactSensitiveUrl("/webhooks/bunny/s3cr3t/")).toBe(
            `/webhooks/bunny/${REDACTION_PLACEHOLDER}/`
        );
    });

    it("leaves every other URL byte-identical", () => {
        for (const url of [
            "/api/v1/players?limit=20&sort=-createdAt",
            "/api/v1/auth/login",
            "/api/v1/players/507f1f77bcf86cd799439011/media",
            "/webhooks/bunny/", // مقطع فاضي — مابيوصلش الهاندلر، ومفيش سر فيه
            "/webhooks/other/value",
            "/health",
            "/",
        ]) {
            expect(redactSensitiveUrl(url)).toBe(url);
        }
    });

    it("never reads the configured secret — redaction survives rotation and unset", () => {
        const original = process.env.BUNNY_STREAM_WEBHOOK_SECRET;
        try {
            process.env.BUNNY_STREAM_WEBHOOK_SECRET = "rotated-to-something-else";
            expect(redactSensitiveUrl(`/webhooks/bunny/${original}`)).toBe(
                `/webhooks/bunny/${REDACTION_PLACEHOLDER}`
            );

            delete process.env.BUNNY_STREAM_WEBHOOK_SECRET;
            expect(redactSensitiveUrl("/webhooks/bunny/anything")).toBe(
                `/webhooks/bunny/${REDACTION_PLACEHOLDER}`
            );
        } finally {
            process.env.BUNNY_STREAM_WEBHOOK_SECRET = original;
        }
    });
});

// ════════════════════════════════════════════════════════════════════════════
//  مركّبة على Express + morgan حقيقيين، بنفس الهاندلر الحقيقي
// ════════════════════════════════════════════════════════════════════════════
describe("the access log never contains the webhook secret", () => {
    let lines;
    let agent;

    beforeEach(() => {
        lines = [];
        const stream = { write: (line) => lines.push(line) };

        const testApp = express();
        // 'combined' صراحةً: ده فورمات البرودكشن، وهو اللي بيسجّل :url
        testApp.use(createRequestLogger({ format: "combined", stream }));
        testApp.use(express.json());
        // نفس تركيب app.js بالظبط
        testApp.post("/webhooks/bunny/:secret", bunnyWebhook);
        testApp.get("/api/v1/players", (req, res) => res.status(200).json({ ok: true }));
        testApp.use((req, res) => res.status(404).json({ status: "fail" }));

        agent = request(testApp);
    });

    const logged = () => {
        expect(lines).toHaveLength(1);
        return lines[0];
    };

    it("logs the correct-secret request redacted", async () => {
        const res = await agent
            .post(`/webhooks/bunny/${SECRET}`)
            .send({ VideoLibraryId: "12345", VideoGuid: "guid-1" });

        // الهاندلر قبل السر ⇒ وصله بالقيمة الحقيقية
        expect(res.status).toBe(200);

        const line = logged();
        expect(line).toContain(`/webhooks/bunny/${REDACTION_PLACEHOLDER}`);
        expect(line).not.toContain(SECRET);
    });

    it("logs a WRONG-secret probe redacted too — the attempt is not recorded verbatim", async () => {
        const guess = "attacker-guess-0001";
        const res = await agent.post(`/webhooks/bunny/${guess}`).send({});

        expect(res.status).toBe(404);

        const line = logged();
        expect(line).toContain(`/webhooks/bunny/${REDACTION_PLACEHOLDER}`);
        expect(line).not.toContain(guess);
        expect(line).not.toContain(SECRET);
    });

    it("redacts even when the request never reaches the handler (wrong method → 404)", async () => {
        const res = await agent.get(`/webhooks/bunny/${SECRET}`);

        expect(res.status).toBe(404);
        const line = logged();
        expect(line).toContain(REDACTION_PLACEHOLDER);
        expect(line).not.toContain(SECRET);
    });

    it("still logs method, status and the rest of the line normally", async () => {
        await agent.post(`/webhooks/bunny/${SECRET}`).send({ VideoLibraryId: "12345" });

        const line = logged();
        expect(line).toContain("POST");
        expect(line).toContain("200");
        expect(line).toContain("HTTP/1.1");
    });

    it("leaves a normal route's log line unchanged", async () => {
        await agent.get("/api/v1/players?limit=20&sort=-createdAt");

        const line = logged();
        expect(line).toContain("GET /api/v1/players?limit=20&sort=-createdAt HTTP/1.1");
        expect(line).not.toContain(REDACTION_PLACEHOLDER);
    });

    it("the handler still verifies the secret — right one passes, wrong one 404s", async () => {
        const ok = await agent
            .post(`/webhooks/bunny/${SECRET}`)
            .send({ VideoLibraryId: "12345", VideoGuid: "guid-1" });
        expect(ok.status).toBe(200);

        lines.length = 0;

        // نفس السر بحرف مقلوب — الطول واحد، فبيوصل لـtimingSafeEqual فعلاً
        const flipped = SECRET.slice(0, -1) + (SECRET.endsWith("t") ? "T" : "t");
        const bad = await agent.post(`/webhooks/bunny/${flipped}`).send({});
        expect(bad.status).toBe(404);
        expect(logged()).not.toContain(flipped);
    });
});
