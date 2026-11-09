// audit-database 2026-09-12 — حرّاس بدء التشغيل اللي بيقفلوا مسارات الكتابة
// التلقائية على الإنتاج.
//
// الحادثة: nodemon بـNODE_ENV=development مصوّب على Atlas الإنتاج. الحفظ على أي
// ملف مخطط كان بيعمل restart، والـrestart كان بينده syncIndexes() على الإنتاج
// (5 حذف + 7 إنشاء في تانية، بلا --apply)، وبيجدول كرونين بيمسحوا داتا نهائياً.
//
// التستات دي بتقفل القرار نفسه — مين مسموح يوصل لأنهي قاعدة — مش شكل الرسالة.
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { assertDbTarget } from "../config/database.js";

const OVERRIDE = "i-understand-this-writes-to-production";

// ⚠️ الحارس ده بياخد قيمه الافتراضية من process.env، والتستات كانت بتمرر
// `dbTarget: undefined` عشان تحاكي "الإعلان الغايب" — لكن التمرير بـundefined
// بيفعّل الافتراضي بالظبط، فالتست كان بيقرا config.env بتاع المطوّر بدل ما
// يحاكي الحالة. النتيجة: خمس تستات على حارس أمان كانت نتيجتها بتتقلب حسب
// إعدادات الجهاز — وعلى جهاز فيه DB_TARGET=production مع التجاوز مفعّل، كانت
// بتفشل كلها. بنعزل البيئة هنا عشان التستات تقيس الحارس نفسه لا أكتر.
let savedTarget;
let savedOverride;

beforeEach(() => {
    savedTarget = process.env.DB_TARGET;
    savedOverride = process.env.ALLOW_DEV_AGAINST_PROD;
    delete process.env.DB_TARGET;
    delete process.env.ALLOW_DEV_AGAINST_PROD;
});

afterEach(() => {
    if (savedTarget === undefined) delete process.env.DB_TARGET;
    else process.env.DB_TARGET = savedTarget;
    if (savedOverride === undefined) delete process.env.ALLOW_DEV_AGAINST_PROD;
    else process.env.ALLOW_DEV_AGAINST_PROD = savedOverride;
});

describe("assertDbTarget — الهدف معلن مش مستنتَج", () => {
    it("بيقبل التطابق الطبيعي: production/production", () => {
        expect(assertDbTarget({ nodeEnv: "production", dbTarget: "production" }))
            .toEqual({ target: "production", overridden: false });
    });

    it("بيقبل development على local", () => {
        expect(assertDbTarget({ nodeEnv: "development", dbTarget: "local" }))
            .toEqual({ target: "local", overridden: false });
    });

    // ⚠️ staging كانت مقبولة مع development قبل كده — بس /api-docs وستاك تريس
    // الأخطاء وحدود الـrate limiting كلهم معلّقين على NODE_ENV==='production'
    // بالظبط، مش على DB_TARGET. يعني قاعدة staging (بيانات حقيقية) كانت بتشتغل
    // من غير أي من الحمايات دي. الفحص الجديد بيوسّع نفس منطق production
    // الموثّق فوق ليشمل أي قاعدة بيانات حقيقية، مش production بس.
    it("⚠️ بيرفض development على قاعدة staging كمان — مش production بس", () => {
        expect(() => assertDbTarget({ nodeEnv: "development", dbTarget: "staging" }))
            .toThrow(/Refusing to start: NODE_ENV='development' with DB_TARGET='staging'/);
    });

    it("⚠️ بيرفض test على قاعدة staging برضه", () => {
        expect(() => assertDbTarget({ nodeEnv: "test", dbTarget: "staging" }))
            .toThrow(/Refusing to start/);
    });

    it("الجملة الصريحة بتسمح بمرور staging مع development وبتترفع كـoverridden", () => {
        expect(assertDbTarget({ nodeEnv: "development", dbTarget: "staging", override: OVERRIDE }))
            .toEqual({ target: "staging", overridden: true });
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
