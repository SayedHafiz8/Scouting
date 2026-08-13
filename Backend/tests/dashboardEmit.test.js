import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

// ============================================================================
// §11 — الشغل التقيل في المسار الساخن.
//
// emitAdminDashboardUpdate بيشغّل getAdminDashboardData: 8 استعلامات، منهم
// مسحين كاملين على Player ($group على status، و$group بتاع getAllCoachesStats).
// الشرط القديم كان getConnectedUsers().size === 0 — أي مستخدم متصل، مش أدمن —
// يعني كوتش واحد أونلاين كان بيخلي كل إنشاء لاعب يدفع التكلفة دي ويبعت لصفر
// أدمن. التستات دي بتقفل الفرعين: مافيش أدمن = مافيش aggregation.
// ============================================================================

// قابل للتحكم من كل تست — لازم يبقى var عشان vi.mock بيتـhoist فوق
var connectedAdmins = [];

vi.mock("../socket/handlers/notification.js", () => ({
    sendNotificationToUser: vi.fn().mockResolvedValue(undefined),
    sendNotificationToAdmins: vi.fn().mockResolvedValue(undefined),
    getConnectedAdminIds: vi.fn(async () => connectedAdmins),
}));

import app from "../app.js";
import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import { sendNotificationToAdmins, getConnectedAdminIds } from "../socket/handlers/notification.js";
import { createAdmin, createCoach, playerPayload, seedAgeGroups } from "./helpers/factory.js";

let aggregateSpy;

beforeEach(async () => {
    connectedAdmins = [];
    vi.clearAllMocks();
    await seedAgeGroups();
    aggregateSpy = vi.spyOn(Player, "aggregate");
});

afterEach(() => {
    aggregateSpy.mockRestore();
});

// الـemit اتصمم fire-and-forget (الرد مابيستناهوش)، فبنسيب الـmicrotask queue
// تخلص قبل ما نفحص
const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

describe("§11 — admin dashboard aggregation only runs when an admin is online", () => {
    it("creating a player runs NO Player.aggregate when no admin is connected", async () => {
        const { token } = await createCoach({ email: "hot_path@test.com" });

        const res = await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Hot Path Kid" }));

        expect(res.status).toBe(201);
        await settle();

        // ده بيت القصيد: صفر aggregation على المسار الساخن
        expect(aggregateSpy).not.toHaveBeenCalled();
        expect(sendNotificationToAdmins).not.toHaveBeenCalled();
    });

    it("the guard is consulted on every create", async () => {
        const { token } = await createCoach({ email: "consulted@test.com" });

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Consulted Kid" }))
            .expect(201);

        await settle();
        expect(getConnectedAdminIds).toHaveBeenCalled();
    });

    it("with an admin connected the aggregation DOES run and the payload is delivered", async () => {
        const { user: adminUser } = await createAdmin({ email: "online_admin@test.com" });
        const { token } = await createCoach({ email: "with_admin@test.com" });
        connectedAdmins = [adminUser._id.toString()];

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Watched Kid" }))
            .expect(201);

        await settle();

        expect(aggregateSpy).toHaveBeenCalled();
        expect(sendNotificationToAdmins).toHaveBeenCalled();
    });

    it("the resolved admin ids are handed to the notifier so the role query is not repeated", async () => {
        const { user: adminUser } = await createAdmin({ email: "reuse_admin@test.com" });
        const { token } = await createCoach({ email: "reuse_coach@test.com" });
        const ids = [adminUser._id.toString()];
        connectedAdmins = ids;

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Reuse Kid" }))
            .expect(201);

        await settle();

        const [notification, passedIds] = sendNotificationToAdmins.mock.calls[0];
        expect(notification.type).toBe("ADMIN_DASHBOARD_UPDATE");
        expect(passedIds).toEqual(ids);
    });

    it("the player is created either way — the guard never affects the response", async () => {
        const { token } = await createCoach({ email: "unaffected@test.com" });

        await request(app)
            .post("/api/v1/players")
            .set("Authorization", `Bearer ${token}`)
            .send(playerPayload({ name: "Unaffected Kid" }))
            .expect(201);

        await settle();
        expect(await Player.countDocuments({ name: "Unaffected Kid" })).toBe(1);
    });
});

// الدالة getConnectedAdminIds نفسها متختبرة في tests/notificationTargets.test.js
// — محتاجة النسخة الحقيقية من الموديول، والملف ده بيعمله mock فوق.
