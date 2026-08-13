import { describe, it, expect, beforeEach, vi } from "vitest";

// §11 — الوحدة اللي بيتبني عليها حارس المسار الساخن. tests/setup.js بيعمل mock
// عام للموديول ده، فبنلغيه هنا عشان نختبر التنفيذ الحقيقي.
vi.unmock("../socket/handlers/notification.js");

// خريطة المتصلين قابلة للتعديل من كل تست — var عشان vi.mock بيتـhoist فوق.
// بنعمل override لـsocket/index.js (اللي setup.js مثبّته على Map فاضية) بدل
// vi.resetModules، لأن إعادة تحميل الموديولز بتحاول تسجّل موديلز mongoose تاني
// وبترمي OverwriteModelError.
var connectedMap = new Map();

vi.mock("../socket/index.js", () => ({
    getIO: () => ({ to: () => ({ emit: vi.fn() }) }),
    getConnectedUsers: () => connectedMap,
}));

import User from "../models/userModel.js";
import { getConnectedAdminIds } from "../socket/handlers/notification.js";
import { createAdmin, createCoach } from "./helpers/factory.js";

const socketsFor = (...ids) =>
    new Map(ids.map((id, i) => [id.toString(), new Set([`sock-${i}`])]));

beforeEach(() => {
    connectedMap = new Map();
});

describe("§11 — getConnectedAdminIds intersects live sockets with the admin role", () => {
    it("returns [] when nobody is connected", async () => {
        await createAdmin({ email: "offline_admin@test.com" });
        expect(await getConnectedAdminIds()).toEqual([]);
    });

    it("returns [] when only a coach is connected", async () => {
        await createAdmin({ email: "admin_a@test.com" });
        const { user: coach } = await createCoach({ email: "coach_a@test.com" });
        connectedMap = socketsFor(coach._id);

        // ده السيناريو اللي كان بيكلّف مسحين كاملين على Player لكل كتابة
        expect(await getConnectedAdminIds()).toEqual([]);
    });

    it("returns the admin id when an admin is connected", async () => {
        const { user: admin } = await createAdmin({ email: "admin_b@test.com" });
        const { user: coach } = await createCoach({ email: "coach_b@test.com" });
        connectedMap = socketsFor(coach._id, admin._id);

        expect(await getConnectedAdminIds()).toEqual([admin._id.toString()]);
    });

    it("returns every connected admin, not just the first", async () => {
        const { user: a1 } = await createAdmin({ email: "admin_c1@test.com" });
        const { user: a2 } = await createAdmin({ email: "admin_c2@test.com" });
        connectedMap = socketsFor(a1._id, a2._id);

        const ids = await getConnectedAdminIds();
        expect(ids.sort()).toEqual([a1._id.toString(), a2._id.toString()].sort());
    });

    it("ignores an admin who exists but is offline", async () => {
        await createAdmin({ email: "admin_d1@test.com" });
        const { user: online } = await createAdmin({ email: "admin_d2@test.com" });
        connectedMap = socketsFor(online._id);

        expect(await getConnectedAdminIds()).toEqual([online._id.toString()]);
    });

    it("ignores a connected id that is no longer an admin", async () => {
        const { user: demoted } = await createAdmin({ email: "demoted@test.com" });
        await User.findByIdAndUpdate(demoted._id, { role: "coach" });
        connectedMap = socketsFor(demoted._id);

        // الدور بيتقرا من الداتابيز كل مرة — وده بالظبط سبب إن الـJWT مافيهوش
        // role: توكن بيحمل صلاحية مابتتحققش كان هيفضل صالح بعد تغيير الدور
        expect(await getConnectedAdminIds()).toEqual([]);
    });

    it("skips the role query entirely when the socket map is empty", async () => {
        await createAdmin({ email: "admin_e@test.com" });
        const spy = vi.spyOn(User, "find");

        expect(await getConnectedAdminIds()).toEqual([]);
        expect(spy).not.toHaveBeenCalled();

        spy.mockRestore();
    });
});
