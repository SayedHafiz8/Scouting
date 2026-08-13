import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

// Mock ONLY the Bunny network wrappers; keep bunnyConfig (zones/signing) real.
vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        deleteStorageObject: vi.fn(async () => true),
        purgeUrl: vi.fn(async () => true),
    };
});

import app from "../app.js";
import User from "../models/userModel.js";
import Player from "../models/playedModel.js";
import { bunnyConfig, deleteStorageObject, purgeUrl } from "../config/bunny.js";
import { runCleanupDeactivated } from "../socket/handlers/cleanupDeactivated.js";
import {
    createAdmin,
    createCoach,
    createObserver,
    createPlayer,
    seedAgeGroups,
} from "./helpers/factory.js";

// ============================================================================
// §9 — الحذف النهائي لليوزر لازم يمسح بايتاته من Bunny قبل ما يمسح الدوكيومنت،
// وأي فشل في Bunny لازم يمنع حذف الدوكيومنت (عشان مايفضلش تسريب مش قابل للاكتشاف).
// ============================================================================

const FRONT_KEY = "idcards/front-key.jpg";
const BACK_KEY = "idcards/back-key.jpg";
const AVATAR_KEY = "profiles/avatar-key.jpg";

beforeEach(async () => {
    vi.clearAllMocks();
    deleteStorageObject.mockResolvedValue(true);
    purgeUrl.mockResolvedValue(true);
});

// يوزر معطّل من أكتر من 30 يوم، وعنده الصور التلاتة
async function staleCoachWithImages(overrides = {}) {
    const { user } = await createCoach({
        idCardFrontImg: FRONT_KEY,
        idCardBackImg: BACK_KEY,
        profileImg: AVATAR_KEY,
        ...overrides,
    });
    // بنعدّل مباشرة على الكولكشن عشان نتخطى الـ pre(/^find/) hook بتاع active
    await User.collection.updateOne(
        { _id: user._id },
        { $set: { active: false, deactivatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } }
    );
    return user;
}

// المفاتيح اللي اتبعتت لـ deleteStorageObject بغض النظر عن ترتيب النداءات
const deletedKeys = () => deleteStorageObject.mock.calls.map(([, key]) => key);
const zonesUsedFor = (key) =>
    deleteStorageObject.mock.calls.filter(([, k]) => k === key).map(([zone]) => zone.zone);

describe("§9 — cleanup cron purges Bunny assets before deleting the user", () => {
    it("deletes both ID-card sides from the vault zone and the avatar from the media zone", async () => {
        const user = await staleCoachWithImages();

        const { deleted, skipped } = await runCleanupDeactivated();

        expect(deleted).toBe(1);
        expect(skipped).toBe(0);
        expect(deletedKeys().sort()).toEqual([AVATAR_KEY, BACK_KEY, FRONT_KEY].sort());

        // البطاقات لازم تتمسح من الـvault zone تحديداً، والأفاتار من الـmedia zone
        const { media, vault } = bunnyConfig();
        expect(zonesUsedFor(FRONT_KEY)).toEqual([vault.zone]);
        expect(zonesUsedFor(BACK_KEY)).toEqual([vault.zone]);
        expect(zonesUsedFor(AVATAR_KEY)).toEqual([media.zone]);

        // الأفاتار بس هو اللي بيتعمله purge — الـvault zone مالوش CDN أصلاً (C3)
        expect(purgeUrl).toHaveBeenCalledTimes(1);

        const stillThere = await User.findById(user._id).setOptions({ bypassFilter: true });
        expect(stillThere).toBeNull();
    });

    it("keeps the user document when a vault delete fails", async () => {
        const user = await staleCoachWithImages();
        deleteStorageObject.mockRejectedValueOnce(new Error("Bunny deleteStorageObject failed: 500"));

        const { deleted, skipped } = await runCleanupDeactivated();

        expect(deleted).toBe(0);
        expect(skipped).toBe(1);

        // الدوكيومنت لسه موجود — هو المرجع الوحيد للمفاتيح، فمسحه هنا كان هيخلّي
        // البايتات الفاضلة على Bunny مستحيل نلاقيها تاني
        const stillThere = await User.findById(user._id).setOptions({ bypassFilter: true });
        expect(stillThere).not.toBeNull();
        expect(stillThere.idCardFrontImg).toBe(FRONT_KEY);
    });

    it("a failing user does not block the others in the same run", async () => {
        await staleCoachWithImages({ email: "bad@test.com" });
        await staleCoachWithImages({ email: "good@test.com" });
        // أول نداء بس هو اللي بيفشل → يوزر واحد بيتساب والتاني بيتمسح
        deleteStorageObject.mockRejectedValueOnce(new Error("boom"));

        const { deleted, skipped } = await runCleanupDeactivated();

        expect(deleted).toBe(1);
        expect(skipped).toBe(1);
        expect(await User.countDocuments().setOptions({ bypassFilter: true })).toBe(1);
    });

    it("a user with no images is deleted without touching Bunny", async () => {
        const user = await staleCoachWithImages({
            idCardFrontImg: undefined,
            idCardBackImg: undefined,
            profileImg: undefined,
        });

        const { deleted } = await runCleanupDeactivated();

        expect(deleted).toBe(1);
        expect(deleteStorageObject).not.toHaveBeenCalled();
        expect(await User.findById(user._id).setOptions({ bypassFilter: true })).toBeNull();
    });

    it("users deactivated less than 30 days ago are left alone", async () => {
        const { user } = await createCoach();
        await User.collection.updateOne(
            { _id: user._id },
            { $set: { active: false, deactivatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } }
        );

        const { deleted, skipped } = await runCleanupDeactivated();

        expect(deleted).toBe(0);
        expect(skipped).toBe(0);
        expect(await User.findById(user._id).setOptions({ bypassFilter: true })).not.toBeNull();
    });
});

describe("§9 — deleting a user orphans their players instead of cascading", () => {
    beforeEach(async () => {
        await seedAgeGroups();
    });

    it("force-deleting a coach leaves the player, with coach cleared", async () => {
        const { token: adminToken } = await createAdmin();
        const { token: coachToken, user: coach } = await createCoach({ email: "owner@test.com" });
        const player = await createPlayer(coachToken);

        const res = await request(app)
            .delete(`/api/v1/users/${coach._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(204);

        // بيانات اللاعب (قاصر) لازم تفضل موجودة — مافيش cascade
        const after = await Player.findById(player._id);
        expect(after).not.toBeNull();
        expect(after.name).toBe(player.name);
        expect(after.coach).toBeUndefined();
    });

    it("the cron does the same for a 30-day-stale coach", async () => {
        const { token: coachToken, user: coach } = await createCoach({ email: "stale@test.com" });
        const player = await createPlayer(coachToken);
        await User.collection.updateOne(
            { _id: coach._id },
            { $set: { active: false, deactivatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } }
        );

        const { deleted } = await runCleanupDeactivated();

        expect(deleted).toBe(1);
        const after = await Player.findById(player._id);
        expect(after).not.toBeNull();
        expect(after.coach).toBeUndefined();
    });

    it("deleting an observer only pulls them out of the observers array", async () => {
        const { token: adminToken } = await createAdmin();
        const { token: coachToken, user: coach } = await createCoach({ email: "keeper@test.com" });
        const { user: observer } = await createObserver({ email: "watcher@test.com" });
        const player = await createPlayer(coachToken);
        await Player.findByIdAndUpdate(player._id, {
            status: "observed",
            observers: [observer._id],
        });

        const res = await request(app)
            .delete(`/api/v1/users/${observer._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(204);

        const after = await Player.findById(player._id);
        expect(after.observers).toEqual([]);
        // الكوتش مالوش دعوة — بيفضل مالك اللاعب زي ما هو
        expect(after.coach.toString()).toBe(coach._id.toString());
    });

    it("an orphaned player is invisible to every coach but still visible to admin", async () => {
        const { token: adminToken } = await createAdmin();
        const { token: coachToken, user: coach } = await createCoach({ email: "gone@test.com" });
        const { token: otherCoachToken } = await createCoach({ email: "other@test.com" });
        const player = await createPlayer(coachToken);

        await request(app)
            .delete(`/api/v1/users/${coach._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`)
            .expect(204);

        // كوتش تاني: لا في القايمة ولا بالـid المباشر — 403 مش 500
        const list = await request(app)
            .get("/api/v1/players")
            .set("Authorization", `Bearer ${otherCoachToken}`);
        expect(list.status).toBe(200);
        expect(list.body.data.documents.map((d) => d._id)).not.toContain(player._id.toString());

        const direct = await request(app)
            .get(`/api/v1/players/${player._id}`)
            .set("Authorization", `Bearer ${otherCoachToken}`);
        expect(direct.status).toBe(403);

        // الأدمن لسه شايفه عشان يقدر يعيّنله كوتش جديد
        const asAdmin = await request(app)
            .get(`/api/v1/players/${player._id}`)
            .set("Authorization", `Bearer ${adminToken}`);
        expect(asAdmin.status).toBe(200);
    });

    it("an orphaned player stays readable by its assigned observer", async () => {
        const { token: adminToken } = await createAdmin();
        const { token: coachToken, user: coach } = await createCoach({ email: "leaving@test.com" });
        const { token: observerToken, user: observer } = await createObserver({
            email: "stays@test.com",
        });
        const player = await createPlayer(coachToken);
        await Player.findByIdAndUpdate(player._id, {
            status: "observed",
            observers: [observer._id],
        });

        await request(app)
            .delete(`/api/v1/users/${coach._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`)
            .expect(204);

        const res = await request(app)
            .get(`/api/v1/players/${player._id}`)
            .set("Authorization", `Bearer ${observerToken}`);
        expect(res.status).toBe(200);
    });
});

describe("§9 — PATCH /players/:id/coach re-homes an orphaned player", () => {
    beforeEach(async () => {
        await seedAgeGroups();
    });

    // كوتش اتمسح نهائياً → لاعبه بقى يتيم
    async function orphanedPlayer() {
        const { token: adminToken } = await createAdmin();
        const { token: coachToken, user: coach } = await createCoach({ email: "removed@test.com" });
        const player = await createPlayer(coachToken);
        await request(app)
            .delete(`/api/v1/users/${coach._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`)
            .expect(204);
        return { adminToken, playerId: player._id };
    }

    it("an admin can hand the player to a new coach, who then sees it", async () => {
        const { adminToken, playerId } = await orphanedPlayer();
        const { token: newCoachToken, user: newCoach } = await createCoach({ email: "new@test.com" });

        const res = await request(app)
            .patch(`/api/v1/players/${playerId}/coach`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ coach: newCoach._id.toString() });

        expect(res.status).toBe(200);
        expect(res.body.data.document.coach).toBe(newCoach._id.toString());

        const asNewCoach = await request(app)
            .get(`/api/v1/players/${playerId}`)
            .set("Authorization", `Bearer ${newCoachToken}`);
        expect(asNewCoach.status).toBe(200);
    });

    it("rejects an id that is not an active coach", async () => {
        const { adminToken, playerId } = await orphanedPlayer();
        const { user: observer } = await createObserver({ email: "notacoach@test.com" });

        const res = await request(app)
            .patch(`/api/v1/players/${playerId}/coach`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ coach: observer._id.toString() });

        expect(res.status).toBe(400);
        expect((await Player.findById(playerId)).coach).toBeUndefined();
    });

    it("rejects a malformed coach id", async () => {
        const { adminToken, playerId } = await orphanedPlayer();
        const res = await request(app)
            .patch(`/api/v1/players/${playerId}/coach`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ coach: "not-an-id" });
        expect(res.status).toBe(400);
    });

    it("a coach cannot assign a player to themselves", async () => {
        const { playerId } = await orphanedPlayer();
        const { token: greedyToken, user: greedy } = await createCoach({ email: "greedy@test.com" });

        const res = await request(app)
            .patch(`/api/v1/players/${playerId}/coach`)
            .set("Authorization", `Bearer ${greedyToken}`)
            .send({ coach: greedy._id.toString() });

        expect(res.status).toBe(403);
        expect((await Player.findById(playerId)).coach).toBeUndefined();
    });

    it("a coach still cannot smuggle a coach change through PATCH /players/:id", async () => {
        const { token: coachToken, user: coach } = await createCoach({ email: "owner2@test.com" });
        const { user: target } = await createCoach({ email: "target2@test.com" });
        const player = await createPlayer(coachToken);

        const res = await request(app)
            .patch(`/api/v1/players/${player._id}`)
            .set("Authorization", `Bearer ${coachToken}`)
            .send({ coach: target._id.toString() });

        expect(res.status).toBe(400);
        expect((await Player.findById(player._id)).coach.toString()).toBe(coach._id.toString());
    });

    it("re-assigning from one live coach to another moves visibility", async () => {
        const { token: adminToken } = await createAdmin();
        const { token: fromToken, user: from } = await createCoach({ email: "from@test.com" });
        const { token: toToken, user: to } = await createCoach({ email: "to@test.com" });
        const player = await createPlayer(fromToken);

        await request(app)
            .patch(`/api/v1/players/${player._id}/coach`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ coach: to._id.toString() })
            .expect(200);

        expect(
            (await request(app)
                .get(`/api/v1/players/${player._id}`)
                .set("Authorization", `Bearer ${toToken}`)).status
        ).toBe(200);
        // الكوتش القديم فقد الوصول فوراً
        expect(
            (await request(app)
                .get(`/api/v1/players/${player._id}`)
                .set("Authorization", `Bearer ${fromToken}`)).status
        ).toBe(403);
        expect((await Player.findById(player._id)).coach.toString()).toBe(to._id.toString());
        expect(from._id.toString()).not.toBe(to._id.toString());
    });

    it("404s for an unknown player", async () => {
        const { token: adminToken } = await createAdmin();
        const { user: coach } = await createCoach({ email: "spare@test.com" });
        const res = await request(app)
            .patch("/api/v1/players/507f1f77bcf86cd799439011/coach")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ coach: coach._id.toString() });
        expect(res.status).toBe(404);
    });

    it("an admin can still set the status of an orphaned player without a 500", async () => {
        const { adminToken, playerId } = await orphanedPlayer();

        const res = await request(app)
            .patch(`/api/v1/players/${playerId}/status`)
            .set("Authorization", `Bearer ${adminToken}`)
            .send({ status: "selected" });

        expect(res.status).toBe(200);
        expect(res.body.data.document.status).toBe("selected");
    });
});

describe("§9 — DELETE /users/:id/force purges Bunny assets before deleting", () => {
    it("removes the vault + media objects, then the document", async () => {
        const { token: adminToken } = await createAdmin();
        const { user } = await createCoach({
            idCardFrontImg: FRONT_KEY,
            idCardBackImg: BACK_KEY,
            profileImg: AVATAR_KEY,
        });

        const res = await request(app)
            .delete(`/api/v1/users/${user._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(204);
        expect(deletedKeys().sort()).toEqual([AVATAR_KEY, BACK_KEY, FRONT_KEY].sort());
        expect(await User.findById(user._id).setOptions({ bypassFilter: true })).toBeNull();
    });

    it("returns 502 and keeps the account when Bunny refuses the delete", async () => {
        const { token: adminToken } = await createAdmin();
        const { user } = await createCoach({ idCardFrontImg: FRONT_KEY });
        deleteStorageObject.mockRejectedValue(new Error("Bunny deleteStorageObject failed: 500"));

        const res = await request(app)
            .delete(`/api/v1/users/${user._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(502);
        const stillThere = await User.findById(user._id).setOptions({ bypassFilter: true });
        expect(stillThere).not.toBeNull();
        expect(stillThere.idCardFrontImg).toBe(FRONT_KEY);
    });

    it("still 404s for an unknown id", async () => {
        const { token: adminToken } = await createAdmin();
        const res = await request(app)
            .delete("/api/v1/users/507f1f77bcf86cd799439011/force")
            .set("Authorization", `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
        expect(deleteStorageObject).not.toHaveBeenCalled();
    });

    it("a deactivated user can still be force-deleted (bypassFilter preserved)", async () => {
        const { token: adminToken } = await createAdmin();
        const { user } = await createCoach({ profileImg: AVATAR_KEY });
        await User.collection.updateOne({ _id: user._id }, { $set: { active: false } });

        const res = await request(app)
            .delete(`/api/v1/users/${user._id}/force`)
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(204);
        expect(deletedKeys()).toEqual([AVATAR_KEY]);
        expect(await User.findById(user._id).setOptions({ bypassFilter: true })).toBeNull();
    });

    it("a coach cannot force-delete anyone", async () => {
        const { token: coachToken } = await createCoach({ email: "attacker@test.com" });
        const { user } = await createCoach({ email: "victim@test.com", profileImg: AVATAR_KEY });

        const res = await request(app)
            .delete(`/api/v1/users/${user._id}/force`)
            .set("Authorization", `Bearer ${coachToken}`);

        expect(res.status).toBe(403);
        expect(deleteStorageObject).not.toHaveBeenCalled();
        expect(await User.findById(user._id)).not.toBeNull();
    });
});
