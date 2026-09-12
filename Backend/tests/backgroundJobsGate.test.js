// audit-database 2026-09-12 — بوابة الجوبات الخلفية.
//
// الحادثة: server.js كان بيجدول الأربع جوبات بلا أي شرط، فأي تشغيل للسيرفر —
// بما فيه nodemon على لابتوب مطوّر مصوّب على Atlas الإنتاج — كان بيجدولهم على
// الإنتاج، واتنين منهم بيمسحوا داتا نهائياً (يوزرز + ميديا + بايتات Bunny).
//
// التستات دي بتقفل **اتجاه الفشل**: الافتراضي OFF، والعلم لازم يكون "true"
// بالحرف. علم ناقص = الداتا بتتراكم (قابل للإصلاح). العكس = حذف نهائي.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { shouldRunJobs, startBackgroundJobs } from "../socket/handlers/index.js";

describe("startBackgroundJobs — RUN_JOBS افتراضه OFF", () => {
    let jobs;

    beforeEach(() => {
        jobs = {
            startDailySummary: vi.fn(),
            startCleanupJob: vi.fn(),
            startVideoReconcile: vi.fn(),
            startMediaRetention: vi.fn(),
        };
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const noneScheduled = () =>
        Object.values(jobs).every((fn) => fn.mock.calls.length === 0);

    it.each([undefined, "", "false", "1", "yes", "TRUE", "True", " true "])(
        "مابيجدولش حاجة لما RUN_JOBS=%o",
        (runJobs) => {
            const res = startBackgroundJobs({ runJobs, jobs });
            expect(res.scheduled).toBe(false);
            expect(noneScheduled()).toBe(true);
        }
    );

    it("بيجدول الأربعة لما RUN_JOBS=true بالحرف", () => {
        const res = startBackgroundJobs({ runJobs: "true", jobs });
        expect(res.scheduled).toBe(true);
        expect(jobs.startDailySummary).toHaveBeenCalledTimes(1);
        expect(jobs.startCleanupJob).toHaveBeenCalledTimes(1);
        expect(jobs.startVideoReconcile).toHaveBeenCalledTimes(1);
        expect(jobs.startMediaRetention).toHaveBeenCalledTimes(1);
    });

    // اتجاه الفشل مقصود: علم ناقص في الإنتاج = الداتا بتتراكم (قابل للإصلاح).
    // العكس = حذف نهائي. فالافتراضي OFF والغياب لازم يبان في اللوج فوراً.
    it("بيسجّل بصوت عالي إن الجوبات اتخطّت — علم ناقص في الإنتاج لازم يبان", () => {
        startBackgroundJobs({ runJobs: undefined, jobs });
        const printed = [...console.log.mock.calls, ...console.warn.mock.calls]
            .flat()
            .join("\n");
        expect(printed).toMatch(/RUN_JOBS/);
        expect(printed).toMatch(/not scheduled|skipped/i);
    });

    it("بيسجّل إن الجوبات اتجدولت لما العلم موجود", () => {
        startBackgroundJobs({ runJobs: "true", jobs });
        const printed = [...console.log.mock.calls, ...console.warn.mock.calls].flat().join("\n");
        expect(printed).toMatch(/scheduled/i);
    });

    it("shouldRunJobs بيقرا من البيئة وبيطابق المقارنة الصارمة", () => {
        const previous = process.env.RUN_JOBS;
        try {
            process.env.RUN_JOBS = "true";
            expect(shouldRunJobs()).toBe(true);
            process.env.RUN_JOBS = "TRUE";
            expect(shouldRunJobs()).toBe(false);
            delete process.env.RUN_JOBS;
            expect(shouldRunJobs()).toBe(false);
        } finally {
            if (previous === undefined) delete process.env.RUN_JOBS;
            else process.env.RUN_JOBS = previous;
        }
    });
});
