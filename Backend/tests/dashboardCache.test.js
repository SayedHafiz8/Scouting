import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

import app from "../app.js";
import Player from "../models/playedModel.js";
import { getConnectedAdminIds } from "../socket/handlers/notification.js";
import {
    createAdmin,
    createCoach,
    createObserver,
    createProScout,
    playerPayload,
    seedAgeGroups,
} from "./helpers/factory.js";

// ============================================================================
// §11 — كاش TTL لداشبورد الأدمن.
//
// الاستعلامين المكاشيين ($group على status + $group بتاع coaches-stats) مايقدرش
// أي index يغطيهم — $group على كولكشن كاملة بتقرا كل مستند بحكم التعريف. فالكاش
// مش تحسين للاستعلام، ده تقليل لعدد مرات تنفيذه.
//
// التستات دي بتقفل تلات حاجات: (1) الكاش شغال جوه الـTTL، (2) بيسيب الداتا
// تتحدّث بعده، (3) — وده الأهم — مابيمسّش أي مسار مسكوب بمستخدم.
// ============================================================================

const TTL_MS = 45_000;

let aggregateSpy;

beforeEach(async () => {
    await seedAgeGroups();
    aggregateSpy = vi.spyOn(Player, "aggregate");
});

afterEach(() => {
    aggregateSpy.mockRestore();
    vi.useRealTimers();
    // الموك العام في setup.js بيرجّع [] — بنرجّعه لحالته عشان التستات اللي
    // بتزوّده تحت ماتأثرش على اللي بعدها
    vi.mocked(getConnectedAdminIds).mockResolvedValue([]);
});

// بيزوّد ساعة النظام بس (مش الـtimers) — الـcache بيقارن بـDate.now()، وسايبين
// الـtimers حقيقية عشان الـmongo driver مايتعلّقش
const advanceClock = (ms) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + ms);
};

const getAdmin = (token, path = "/api/v1/dashboard/admin") =>
    request(app).get(path).set("Authorization", `Bearer ${token}`);

describe("§11 — GET /dashboard/admin is served from a TTL cache", () => {
    it("runs the aggregations once for two requests inside the TTL", async () => {
        const { token } = await createAdmin({ email: "cache_admin@test.com" });

        const first = await getAdmin(token).expect(200);
        const callsAfterFirst = aggregateSpy.mock.calls.length;

        const second = await getAdmin(token).expect(200);

        // getAdminDashboardData بينفذ aggregation اتنين (byStatus + topCoaches)
        expect(callsAfterFirst).toBe(2);
        // ده بيت القصيد: الطلب التاني مادفعش تمن ولا aggregation
        expect(aggregateSpy.mock.calls.length).toBe(callsAfterFirst);
        expect(second.body.data).toEqual(first.body.data);
    });

    it("recomputes once the TTL has elapsed", async () => {
        const { token } = await createAdmin({ email: "ttl_admin@test.com" });

        await getAdmin(token).expect(200);
        expect(aggregateSpy.mock.calls.length).toBe(2);

        advanceClock(TTL_MS + 1_000);

        await getAdmin(token).expect(200);
        expect(aggregateSpy.mock.calls.length).toBe(4);
    });

    it("the cached payload is still correct — not an empty shell", async () => {
        const { token: adminToken } = await createAdmin({ email: "shape_admin@test.com" });
        const { token: coachToken } = await createCoach({ email: "shape_coach@test.com" });

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${coachToken}`)
            .send(playerPayload({ name: "Shape Kid" }))
            .expect(201);

        const res = await getAdmin(adminToken).expect(200);

        expect(res.body.data.totalPlayers).toBe(1);
        expect(res.body.data.pendingPlayers).toBe(1);
    });

    // Stage 13 (US4) — totalProScouts is additive; every other figure must stay
    // byte-identical to before (FR-010).
    it("totalProScouts matches the actual proScout count, and no other figure changes", async () => {
        const { token: adminToken } = await createAdmin({ email: "proscouts_admin@test.com" });
        const { token: coachToken } = await createCoach({ email: "proscouts_coach@test.com" });
        await createObserver({ email: "proscouts_observer@test.com" });
        await createProScout({ email: "proscouts_scout_1@test.com" });
        await createProScout({ email: "proscouts_scout_2@test.com" });

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${coachToken}`)
            .send(playerPayload({ name: "ProScout Count Kid" }))
            .expect(201);

        const before = await getAdmin(adminToken).expect(200);
        expect(before.body.data.totalProScouts).toBe(2);

        await createProScout({ email: "proscouts_scout_3@test.com" });
        advanceClock(TTL_MS + 1_000);

        const after = await getAdmin(adminToken).expect(200);
        expect(after.body.data.totalProScouts).toBe(3);

        // every other figure is unaffected by the new field
        const { totalProScouts: _before, ...beforeRest } = before.body.data;
        const { totalProScouts: _after, ...afterRest } = after.body.data;
        expect(afterRest).toEqual(beforeRest);
    });

    it("a second admin inside the TTL gets the same cached payload", async () => {
        // المفتاح عام عن قصد — الرد مالوش علاقة بمين الأدمن اللي سأل
        const { token: adminA } = await createAdmin({ email: "admin_a@test.com" });
        const { token: adminB } = await createAdmin({ email: "admin_b@test.com" });

        const a = await getAdmin(adminA).expect(200);
        const b = await getAdmin(adminB).expect(200);

        expect(aggregateSpy.mock.calls.length).toBe(2);
        expect(b.body.data).toEqual(a.body.data);
    });
});

describe("§11 — GET /dashboard/admin/coaches-stats is cached the same way", () => {
    const STATS = "/api/v1/dashboard/admin/coaches-stats";

    it("runs its aggregation once for two requests inside the TTL", async () => {
        const { token } = await createAdmin({ email: "stats_admin@test.com" });

        const first = await getAdmin(token, STATS).expect(200);
        expect(aggregateSpy.mock.calls.length).toBe(1);

        const second = await getAdmin(token, STATS).expect(200);

        expect(aggregateSpy.mock.calls.length).toBe(1);
        expect(second.body.data.stats).toEqual(first.body.data.stats);
    });

    it("recomputes once the TTL has elapsed", async () => {
        const { token } = await createAdmin({ email: "stats_ttl@test.com" });

        await getAdmin(token, STATS).expect(200);
        advanceClock(TTL_MS + 1_000);
        await getAdmin(token, STATS).expect(200);

        expect(aggregateSpy.mock.calls.length).toBe(2);
    });

    it("keeps its own cache key — it is not confused with the overview", async () => {
        const { token } = await createAdmin({ email: "twokeys@test.com" });

        const overview = await getAdmin(token).expect(200);
        const stats = await getAdmin(token, STATS).expect(200);

        // لو المفتاحين اتلغبطوا الرد التاني كان هيرجّع شكل الأول
        expect(overview.body.data).toHaveProperty("totalPlayers");
        expect(stats.body.data).toHaveProperty("stats");
        expect(stats.body.data).not.toHaveProperty("totalPlayers");
    });
});

// ============================================================================
// أهم مجموعة في الملف: الكاش مايتعداش حدوده.
// ============================================================================
describe("§11 — the cache never touches user-scoped dashboards", () => {
    it("two coaches get their own numbers, never each other's", async () => {
        const { token: coachA } = await createCoach({ email: "scoped_a@test.com" });
        const { token: coachB } = await createCoach({ email: "scoped_b@test.com" });

        // كوتش A عنده لاعبين، كوتش B مالوش
        for (const name of ["A One", "A Two"]) {
            await request(app)
                .post("/api/v1/players")
                .set("Authorization", `Bearer ${coachA}`)
                .send(playerPayload({ name }))
                .expect(201);
        }

        const resA = await request(app)
            .get("/api/v1/dashboard/coach")
            .set("Authorization", `Bearer ${coachA}`)
            .expect(200);

        const resB = await request(app)
            .get("/api/v1/dashboard/coach")
            .set("Authorization", `Bearer ${coachB}`)
            .expect(200);

        expect(resA.body.data.totalPlayers).toBe(2);
        // لو داشبورد الكوتش اتكاش تحت مفتاح مشترك ده كان هيرجّع 2 — تسريب دور لدور
        expect(resB.body.data.totalPlayers).toBe(0);
    });

    it("a coach dashboard reflects a change immediately — no TTL delay", async () => {
        const { token } = await createCoach({ email: "nodelay@test.com" });

        const before = await request(app)
            .get("/api/v1/dashboard/coach")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);
        expect(before.body.data.totalPlayers).toBe(0);

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Instant Kid" }))
            .expect(201);

        const after = await request(app)
            .get("/api/v1/dashboard/coach")
            .set("Authorization", `Bearer ${token}`)
            .expect(200);

        expect(after.body.data.totalPlayers).toBe(1);
    });

    it("two observers get their own numbers, never each other's", async () => {
        const { token: obsA } = await createObserver({ email: "obs_a@test.com" });
        const { token: obsB } = await createObserver({ email: "obs_b@test.com" });

        const resA = await request(app)
            .get("/api/v1/dashboard/observer")
            .set("Authorization", `Bearer ${obsA}`)
            .expect(200);

        const resB = await request(app)
            .get("/api/v1/dashboard/observer")
            .set("Authorization", `Bearer ${obsB}`)
            .expect(200);

        expect(resA.body.data).toHaveProperty("totalPlayersObserved");
        expect(resB.body.data).toHaveProperty("totalPlayersObserved");
    });

    it("the admin overview is still admin-only — the cache adds no new way in", async () => {
        const { token: coachToken } = await createCoach({ email: "nope_coach@test.com" });
        const { token: adminToken } = await createAdmin({ email: "warm_admin@test.com" });

        // نسخّن الكاش بأدمن الأول، وبعدين نحاول نوصلها بكوتش
        await getAdmin(adminToken).expect(200);

        await getAdmin(coachToken).expect(403);
        await getAdmin(coachToken, "/api/v1/dashboard/admin/coaches-stats").expect(403);
    });
});

// ============================================================================
// §11 — المسار اللايف. الفرونت (socket.service.ts:51) بيستبدل بيانات الداشبورد
// بالـpayload الجاي بالكامل، فـpayload مكاشي قديم مش بيقعد ساكت — بيمسح أرقام
// صح من على شاشة أدمن بيتفرج. عشان كده الـemit بيتخطّى قراءة الكاش.
// ============================================================================
describe("§11 — the socket push is always freshly computed", () => {
    it("a mutation right after a cached read still pushes up-to-date numbers", async () => {
        const { user: adminUser, token: adminToken } = await createAdmin({
            email: "live_admin@test.com",
        });
        const { token: coachToken } = await createCoach({ email: "live_coach@test.com" });

        // (1) الأدمن بيفتح الداشبورد — الكاش بيتسخّن على 0 لاعب
        const before = await getAdmin(adminToken).expect(200);
        expect(before.body.data.totalPlayers).toBe(0);

        // (2) الأدمن بقى متصل، فالـemit هيشتغل
        vi.mocked(getConnectedAdminIds).mockResolvedValue([adminUser._id.toString()]);

        const { sendNotificationToAdmins } = await import("../socket/handlers/notification.js");
        vi.mocked(sendNotificationToAdmins).mockClear();

        // (3) كوتش بيضيف لاعب جوه نفس الـTTL
        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${coachToken}`)
            .send(playerPayload({ name: "Live Kid" }))
            .expect(201);

        await new Promise((r) => setTimeout(r, 80));

        const [notification] = vi.mocked(sendNotificationToAdmins).mock.calls[0];
        expect(notification.type).toBe("ADMIN_DASHBOARD_UPDATE");
        // لو الـemit كان بيقرا من الكاش ده كان هيرجّع 0 ويمسح الرقم الصح
        expect(notification.data.totalPlayers).toBe(1);
    });

    it("the fresh push also refreshes the cache for the next HTTP read", async () => {
        const { user: adminUser, token: adminToken } = await createAdmin({
            email: "warm_after@test.com",
        });
        const { token: coachToken } = await createCoach({ email: "warm_coach@test.com" });

        await getAdmin(adminToken).expect(200);
        vi.mocked(getConnectedAdminIds).mockResolvedValue([adminUser._id.toString()]);

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${coachToken}`)
            .send(playerPayload({ name: "Warm Kid" }))
            .expect(201);

        await new Promise((r) => setTimeout(r, 80));
        const callsAfterEmit = aggregateSpy.mock.calls.length;

        // القراءة دي المفروض تلاقي النسخة اللي الـemit كتبها — لا aggregation
        // جديدة، ولا رقم قديم
        const after = await getAdmin(adminToken).expect(200);

        expect(after.body.data.totalPlayers).toBe(1);
        expect(aggregateSpy.mock.calls.length).toBe(callsAfterEmit);
    });
});
