// audit-database 2026-09-12 — بوابة الجوبات الخلفية.
//
// الحادثة: server.js كان بيجدول الأربع جوبات بلا أي شرط، فأي تشغيل للسيرفر —
// بما فيه nodemon على لابتوب مطوّر مصوّب على Atlas الإنتاج — كان بيجدولهم على
// الإنتاج. اتنين منهم بيمسحوا نهائياً:
//   cleanupDeactivated (03:00) — User.deleteOne + مسح أصول Bunny
//   mediaRetention     (03:30) — مسح ميديا باردة + فيديوهات يتيمة + بايتات Bunny
// يعني مطوّر سايب `npm start` شغّال بالليل كان بينفّذ جوبات حذف الإنتاج من
// جهازه — وبالتوازي مع سيرفر الإنتاج اللي بيجدولهم برضه.
//
// الافتراضي OFF عن قصد، واتجاه الفشل هو السبب: لو الإنتاج نسي العلم، الجوبات
// مابتشتغلش والداتا بتتراكم — وده قابل للإصلاح بتشغيلة واحدة. العكس بيمسح، والمسح
// مالوش rollback غير من باكب. فالنسيان لازم يفشل في الاتجاه اللي بيتصلّح.
//
// وعشان النسيان ده يبان: الحالتين بتتسجّل بصراحة في أول اللوج، فعلم ناقص على
// الإنتاج بيتكشف من أول تشغيلة مش بعد أسابيع لما حد يسأل ليه الداتا متراكمة.
//
// ⚠️ RUN_JOBS بيحل حالة اللابتوب، **مش** التنفيذ المزدوج لو الإنتاج اتوسّع لأكتر
// من instance — العلم وقتها بيبقى على أكتر من واحد ويشتغلوا مع بعض على نفس
// الداتا. الحل الدائم قفل على مستوى قاعدة البيانات. مؤجّل بقرار، مش منسي.
import { startDailySummary } from "./dailySummary.js";
import { startCleanupJob } from "./cleanupDeactivated.js";
import { startVideoReconcile } from "./videoReconcile.js";
import { startMediaRetention } from "./mediaRetention.js";

const DEFAULT_JOBS = {
    startDailySummary,
    startCleanupJob,
    startVideoReconcile,
    startMediaRetention,
};

// مقارنة صارمة بالنص "true". أي حاجة تانية (غايب، "1"، "yes", "TRUE") = OFF.
// مفيش تسامح في القراءة عن قصد: العلم ده بيفتح مسار حذف، فالغموض فيه مش مقبول.
export const shouldRunJobs = (runJobs = process.env.RUN_JOBS) => runJobs === "true";

export const startBackgroundJobs = ({
    runJobs = process.env.RUN_JOBS,
    jobs = DEFAULT_JOBS,
} = {}) => {
    if (!shouldRunJobs(runJobs)) {
        console.warn(
            "⏸️  Background jobs NOT scheduled — RUN_JOBS is not 'true'" +
            `${runJobs === undefined ? " (unset)" : ` (got '${runJobs}')`}.\n` +
            "    Skipped: dailySummary, cleanupDeactivated, videoReconcile, mediaRetention.\n" +
            "    This is the safe default. Exactly ONE deployed instance should set\n" +
            "    RUN_JOBS=true; if that is this instance and you are seeing this line in\n" +
            "    production, the flag is missing and retention/cleanup are not running."
        );
        return { scheduled: false };
    }

    jobs.startDailySummary();
    jobs.startCleanupJob();
    jobs.startVideoReconcile();
    jobs.startMediaRetention();

    console.log(
        "▶️  Background jobs scheduled (RUN_JOBS=true) — dailySummary, cleanupDeactivated,\n" +
        "    videoReconcile, mediaRetention. Two of these delete permanently; only one\n" +
        "    instance should carry this flag."
    );
    return { scheduled: true };
};
