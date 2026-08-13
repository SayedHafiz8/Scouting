import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../app.js";
import AgeGroup from "../models/ageGroupModel.js";
import Team from "../models/teamModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import { createCoach, createPlayer, createReport, seedAgeGroups } from "./helpers/factory.js";

// ============================================================================
// §10 — تصلّب إعدادات البرودكشن.
//
// الجزء اللي في server.js (التحقق من NODE_ENV و CLIENT_URL) بيعمل process.exit
// قبل ما app.js يتحمّل أصلاً، فمش قابل للاختبار من هنا — اتأكد منه يدوياً بتشغيل
// السيرفر بقيم غلط. اللي قابل للاختبار هو تركيب /api-docs، والسويت دي بتشتغل
// بـ NODE_ENV=test يعني بالظبط البيئة "المش production والمش development" اللي
// كانت بتسرّب الـdocs قبل التغيير.
// ============================================================================

describe("§10 — API docs exposure", () => {
    it("is not mounted outside development", async () => {
        expect(process.env.NODE_ENV).toBe("test");

        const res = await request(app).get("/api-docs/");

        // بيقع على الـcatch-all 404 بتاع app.js، مش على swagger-ui
        expect(res.status).toBe(404);
        expect(res.text).not.toMatch(/swagger/i);
    });

    it("does not serve the swagger spec either", async () => {
        const res = await request(app).get("/api-docs/swagger-ui-init.js");
        expect(res.status).toBe(404);
    });
});

// §10 — سقف الـpagination. قبله ?limit=1000000 كان بيسحب الكولكشن كله في ريكوست
// واحد. Team اتختارت للتست لأنها أرخص كولكشن نعمل فيها 250 مستند.
describe("§10 — pagination limit ceiling", () => {
    const OVER = ApiFeature.MAX_LIMIT + 50;
    let token;

    beforeEach(async () => {
        await seedAgeGroups();
        token = (await createCoach()).token;
        const ageGroup = await AgeGroup.findOne({ birthYear: 2010 });
        await Team.insertMany(
            Array.from({ length: OVER }, (_, i) => ({
                name: `team-${String(i).padStart(4, "0")}`,
                ageGroup: ageGroup._id,
                clubName: "Test Club",
            }))
        );
    });

    it("caps an absurd ?limit at MAX_LIMIT instead of returning everything", async () => {
        const res = await request(app)
            .get("/api/v1/teams?limit=1000000")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents.length).toBe(ApiFeature.MAX_LIMIT);
        expect(res.body.pagination.limit).toBe(ApiFeature.MAX_LIMIT);
        // الباقي لسه موصول له بالصفحات — السقف على حجم الصفحة مش على الاستعلام.
        // (count في المظروف = عدد مستندات الصفحة، مش الإجمالي)
        expect(res.body.count).toBe(ApiFeature.MAX_LIMIT);
        expect(res.body.pagination.numberOfPages).toBe(Math.ceil(OVER / ApiFeature.MAX_LIMIT));
        expect(res.body.pagination.next).toBe(2);
    });

    it("a limit just over the ceiling is clamped, not rejected", async () => {
        const res = await request(app)
            .get(`/api/v1/teams?limit=${OVER}`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents.length).toBe(ApiFeature.MAX_LIMIT);
    });

    it("a legitimate limit under the ceiling is untouched", async () => {
        const res = await request(app)
            .get("/api/v1/teams?limit=100")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents.length).toBe(100);
        expect(res.body.pagination.limit).toBe(100);
    });

    it("no ?limit still means the default page size", async () => {
        const res = await request(app)
            .get("/api/v1/teams")
            .set("Authorization", `Bearer ${token}`);

        expect(res.body.data.documents.length).toBe(ApiFeature.DEFAULT_LIMIT);
        expect(res.body.pagination.limit).toBe(ApiFeature.DEFAULT_LIMIT);
    });

    it("paging still works with the capped size", async () => {
        const first = await request(app)
            .get("/api/v1/teams?limit=1000000&page=1")
            .set("Authorization", `Bearer ${token}`);
        const second = await request(app)
            .get("/api/v1/teams?limit=1000000&page=2")
            .set("Authorization", `Bearer ${token}`);

        expect(second.body.data.documents.length).toBe(OVER - ApiFeature.MAX_LIMIT);
        const firstIds = first.body.data.documents.map((d) => d._id);
        const secondIds = second.body.data.documents.map((d) => d._id);
        expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]);
    });

    it("a junk or negative ?limit cannot produce a broken query", async () => {
        for (const bad of ["-5", "0", "abc"]) {
            const res = await request(app)
                .get(`/api/v1/teams?limit=${bad}`)
                .set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.data.documents.length).toBeGreaterThan(0);
            expect(res.body.data.documents.length).toBeLessThanOrEqual(ApiFeature.MAX_LIMIT);
        }
    });
});

// §10 — ReDoS في ApiFeature.search(). بنستخدم /players لأنها أحد الـ3 endpoints
// اللي فعلاً بتمرّر searchFields (players / reports / media) — Team مش منهم.
describe("§10 — search keyword is treated as literal text", () => {
    let token;

    beforeEach(async () => {
        await seedAgeGroups();
        token = (await createCoach()).token;
    });

    it("regex metacharacters match literally instead of being compiled", async () => {
        await createPlayer(token, { name: "a+b Player" });
        await createPlayer(token, { name: "aab Player" });

        // لو الـ+ اتفسّرت كـregex كانت "aab" هتطابق كمان
        const res = await request(app)
            .get("/api/v1/players?keyword=a%2Bb")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        const names = res.body.data.documents.map((d) => d.name);
        expect(names).toContain("a+b Player");
        expect(names).not.toContain("aab Player");
    });

    it("a catastrophic-backtracking keyword returns promptly instead of hanging", async () => {
        // النمط الكلاسيكي للـReDoS. قبل الـescape ده كان بيتحوّل لـregex حقيقي
        // ويعلّق الـevent loop بتاع Node (single-threaded) — يعني السيرفر كله يقف.
        await createPlayer(token, { name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" });
        const started = Date.now();

        const res = await request(app)
            .get(`/api/v1/players?keyword=${encodeURIComponent("(a+)+$")}`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        // مافيش لاعب اسمه فيه النص "(a+)+$" حرفياً
        expect(res.body.data.documents).toEqual([]);
        expect(Date.now() - started).toBeLessThan(5000);
    });

    it("a plain keyword still searches normally", async () => {
        await createPlayer(token, { name: "Zebra Player" });
        await createPlayer(token, { name: "Lion Player" });

        const res = await request(app)
            .get("/api/v1/players?keyword=zebra")
            .set("Authorization", `Bearer ${token}`);

        expect(res.body.data.documents.map((d) => d.name)).toEqual(["Zebra Player"]);
    });

    it("an over-long keyword is rejected before any regex is built", async () => {
        // §11 — الاختبار ده كان بيستخدم بحث التقارير، اللي اتشال (مفيش مستهلك
        // في الفرونت). دلوقتي البحث في players بس، وله validation chain بيقفل
        // الطول عند 50 — فالرفض بيحصل قبل ApiFeature أصلاً.
        const long = "x".repeat(ApiFeature.MAX_KEYWORD_LENGTH + 500);
        const res = await request(app)
            .get(`/api/v1/players?keyword=${long}`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(400);
    });

    it("the length cap inside searchPrefix stays as defence in depth", async () => {
        // الـvalidator فوق هو خط الدفاع الأول، بس السقف جوه ApiFeature بيفضل
        // موجود عشان أي مسار مستقبلي مايبنيش regex بطول عشوائي من مدخل العميل
        await createPlayer(token, { name: "Boundary Player" });

        const atCap = "b".repeat(ApiFeature.MAX_KEYWORD_LENGTH);
        const res = await request(app)
            .get(`/api/v1/players?keyword=${atCap}`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents).toEqual([]);
    });

    it("search is no longer wired into reports or media", async () => {
        // القدرة اتشالت عن قصد — الـkeyword بيتجاهل بدل ما يعمل COLLSCAN مقنّع
        const player = await createPlayer(token);
        await createReport(token, player._id, { notes: "unique-note-marker" });

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/reports?keyword=nothing-matches-this`)
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.documents.length).toBe(1);
    });
});
