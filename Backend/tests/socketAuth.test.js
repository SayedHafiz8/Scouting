// audit-backend — توثيق الـSocket.IO.
//
// كان فيه مشكلتين:
//   (أ) توكن في الـquery string: `auth.token || query.token`. الـquery بينزل
//       في لوجز morgan('combined') (app.js:36) ولوجز الـreverse proxy وهيدر
//       الـReferer — يعني توكنات وصول صالحة بتتكتب على الديسك بالنص الصريح.
//   (ب) التحقق على التوقيع بس: مفيش فحص لوجود اليوزر ولا لـpasswordChangedAt.
//       فتغيير باسورد الحساب المخترق — أول إجراء في أي حادثة — مكانش بيفصل
//       سوكيت المهاجم.
//
// الميدلوير بيتنده هنا مباشرةً بـsocket مزيّف: tests/setup.js بيعمل vi.mock
// على socket/index.js كله، وقياسه من برّه كان بيحتاج socket.io-client (مش
// متسطّب) وسيرفر HTTP حقيقي.
import { describe, it, expect, beforeEach, vi } from "vitest";
import jwt from "jsonwebtoken";

import { authenticateSocket } from "../socket/authenticateSocket.js";
import User from "../models/userModel.js";
import { createAdmin, createCoach, seedAgeGroups } from "./helpers/factory.js";

const sign = (userId, overrides = {}) =>
    jwt.sign({ userId, ...overrides }, process.env.JWT_SECRET_KEY, { expiresIn: "15m" });

// socket مزيّف بالشكل اللي الميدلوير بيقراه بس
const fakeSocket = ({ auth = {}, query = {} } = {}) => ({
    handshake: { auth, query },
});

const run = async (socket) => {
    const next = vi.fn();
    await authenticateSocket(socket, next);
    return next;
};

const rejected = (next) => {
    expect(next).toHaveBeenCalledTimes(1);
    const [err] = next.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("Unauthorized");
};

const accepted = (next) => {
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
};

describe("authenticateSocket", () => {
    beforeEach(seedAgeGroups);

    it("accepts a valid token in the auth payload and attaches userId", async () => {
        const { user } = await createAdmin();
        const socket = fakeSocket({ auth: { token: sign(user._id) } });

        const next = await run(socket);

        accepted(next);
        expect(socket.userId.toString()).toBe(user._id.toString());
    });

    // ── (أ) الـquery fallback اتشال ───────────────────────────────────────────
    it("REJECTS a token supplied via the query string", async () => {
        const { user } = await createCoach();
        // نفس التوكن اللي بينجح في auth — الفرق مكان إرساله بس
        const token = sign(user._id);

        const viaQuery = await run(fakeSocket({ auth: {}, query: { token } }));
        rejected(viaQuery);

        // وللتأكيد إن التوكن نفسه سليم، مش المشكلة فيه
        const viaAuth = await run(fakeSocket({ auth: { token } }));
        accepted(viaAuth);
    });

    it("REJECTS even when the query token is present alongside an empty auth", async () => {
        const { user } = await createAdmin();
        const socket = fakeSocket({ auth: { token: undefined }, query: { token: sign(user._id) } });

        rejected(await run(socket));
        expect(socket.userId).toBeUndefined();
    });

    // ── التوكن نفسه ──────────────────────────────────────────────────────────
    it("rejects a missing token", async () => {
        rejected(await run(fakeSocket()));
    });

    it("rejects a malformed token", async () => {
        rejected(await run(fakeSocket({ auth: { token: "not-a-jwt" } })));
    });

    it("rejects a token signed with the wrong secret", async () => {
        const { user } = await createAdmin();
        const forged = jwt.sign({ userId: user._id }, "wrong-secret", { expiresIn: "15m" });
        rejected(await run(fakeSocket({ auth: { token: forged } })));
    });

    it("rejects an expired token", async () => {
        const { user } = await createAdmin();
        const expired = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, { expiresIn: "-1s" });
        rejected(await run(fakeSocket({ auth: { token: expired } })));
    });

    // ── (ب) الإبطال — الجزء اللي مكانش موجود خالص ────────────────────────────
    it("REJECTS a token issued before a password change (the incident-response case)", async () => {
        const { user } = await createAdmin();
        const token = sign(user._id);

        // التوكن ده بينفع دلوقتي
        accepted(await run(fakeSocket({ auth: { token } })));

        // الأدمن غيّر الباسورد بعد إصدار التوكن (ثانيتين بعده عشان الـiat
        // بالثواني، ففرق أقل من ثانية ممكن ميبانش)
        await User.findByIdAndUpdate(user._id, {
            passwordChangedAt: new Date(Date.now() + 2000),
        });

        // نفس التوكن، توقيعه لسه صالح — ولازم يترفض
        rejected(await run(fakeSocket({ auth: { token } })));
    });

    it("still accepts a token issued AFTER the password change", async () => {
        const { user } = await createAdmin();
        await User.findByIdAndUpdate(user._id, {
            passwordChangedAt: new Date(Date.now() - 60_000),
        });

        accepted(await run(fakeSocket({ auth: { token: sign(user._id) } })));
    });

    it("REJECTS a token for a user that no longer exists", async () => {
        const { user } = await createCoach();
        const token = sign(user._id);

        accepted(await run(fakeSocket({ auth: { token } })));

        await User.deleteOne({ _id: user._id });

        rejected(await run(fakeSocket({ auth: { token } })));
    });

    it("REJECTS a token for a soft-deleted (deactivated) user", async () => {
        const { user } = await createCoach();
        const token = sign(user._id);

        // hook الحذف الناعم على User بيخلي findById يرجّع null للمعطَّل،
        // فالسوكيت بتترفض زي protect بالظبط.
        await User.findByIdAndUpdate(user._id, { active: false, deactivatedAt: new Date() });

        rejected(await run(fakeSocket({ auth: { token } })));
    });
});
