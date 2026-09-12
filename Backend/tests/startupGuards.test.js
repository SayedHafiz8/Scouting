// audit-database 2026-09-12 — حرّاس بدء التشغيل اللي بيقفلوا مسارات الكتابة
// التلقائية على الإنتاج.
//
// الحادثة: nodemon بـNODE_ENV=development مصوّب على Atlas الإنتاج. الحفظ على أي
// ملف مخطط كان بيعمل restart، والـrestart كان بينده syncIndexes() على الإنتاج
// (5 حذف + 7 إنشاء في تانية، بلا --apply)، وبيجدول كرونين بيمسحوا داتا نهائياً.
//
// التستات دي بتقفل القرار نفسه — مين مسموح يوصل لأنهي قاعدة — مش شكل الرسالة.
import { describe, it, expect } from "vitest";

import { assertDbTarget } from "../config/database.js";

const OVERRIDE = "i-understand-this-writes-to-production";

describe("assertDbTarget — الهدف معلن مش مستنتَج", () => {
    it("بيقبل التطابق الطبيعي: production/production", () => {
        expect(assertDbTarget({ nodeEnv: "production", dbTarget: "production" }))
            .toEqual({ target: "production", overridden: false });
    });

    it.each(["local", "staging"])("بيقبل development على %s", (dbTarget) => {
        expect(assertDbTarget({ nodeEnv: "development", dbTarget }))
            .toEqual({ target: dbTarget, overridden: false });
    });

    // ── الحالة اللي الحادثة بتاعتها حصلت فعلاً ────────────────────────────
    it("بيرفض development على قاعدة الإنتاج", () => {
        expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: "production" }))
            .toThrow(/Refusing to start: NODE_ENV='development' with DB_TARGET='production'/);
    });

    // النطاق أوسع من development عن قصد: تست على الإنتاج بيمسح كولكشنز في
    // beforeEach، فهو أخطر من الديف مش أقل.
    it("بيرفض test على قاعدة الإنتاج كمان", () => {
        expect(() => assertDbTarget({ nodeEnv: "test", dbTarget: "production" }))
            .toThrow(/Refusing to start/);
    });

    // ── مفيش افتراضي: الإعلان الناقص بيوقف البروسيس ───────────────────────
    it("بيرفض DB_TARGET الغايب", () => {
        expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: undefined }))
            .toThrow(/DB_TARGET must be one of local \| staging \| production — got \(unset\)/);
    });

    it("بيرفض DB_TARGET الفاضي", () => {
        expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: "" }))
            .toThrow(/DB_TARGET must be one of/);
    });

    it.each(["prod", "PRODUCTION", "dev", "staging ", "live"])(
        "بيرفض القيمة غير المعروفة %o — مفيش تصحيح تلقائي ولا تخمين",
        (dbTarget) => {
            expect(() => assertDbTarget({ nodeEnv: "development", dbTarget }))
                .toThrow(/DB_TARGET must be one of/);
        }
    );

    // الإعلان الناقص بيتفحص **قبل** تعارض البيئة: مفيش قيمة نقارن بيها أصلاً.
    it("الإعلان الناقص بيتفحص قبل تعارض البيئة", () => {
        expect(() => assertDbTarget({ nodeEnv: "production", dbTarget: undefined }))
            .toThrow(/DB_TARGET must be one of/);
    });

    // ── التجاوز الصريح ────────────────────────────────────────────────────
    it("الجملة الصريحة بتسمح بالمرور وبتترفع كـoverridden", () => {
        expect(assertDbTarget({ nodeEnv: "development", dbTarget: "production", override: OVERRIDE }))
            .toEqual({ target: "production", overridden: true });
    });

    it.each(["true", "1", "yes", "TRUE", OVERRIDE.toUpperCase(), ` ${OVERRIDE} `])(
        "بيرفض التجاوز %o — لازم الجملة بالحرف",
        (override) => {
            expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: "production", override }))
                .toThrow(/Refusing to start/);
        }
    );

    it("التجاوز مالوش أي تأثير على الإعلان الناقص", () => {
        expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: undefined, override: OVERRIDE }))
            .toThrow(/DB_TARGET must be one of/);
    });

    it("التجاوز مش محتاج ولا مؤثر لما مفيش تعارض", () => {
        expect(assertDbTarget({ nodeEnv: "development", dbTarget: "local", override: OVERRIDE }))
            .toEqual({ target: "local", overridden: false });
    });
});
