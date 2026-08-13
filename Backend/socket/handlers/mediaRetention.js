import cron from "node-cron";

import PlayerMedia from "../../models/playerMediaModel.js";
import User from "../../models/userModel.js";
import { getStreamVideo, deleteStreamVideo } from "../../config/bunny.js";
import { deleteMediaBytes } from "../../controllers/playerMediaController.js";
import {
    emitCoachDashboardUpdate,
    emitObserverDashboardUpdate,
} from "../../controllers/dashboardController.js";

// ============================================================================
// §8 — media retention + A2 orphan cleanup. Runs daily.
//
// Retention: keep everything for `selected` players; after the window, delete
// media belonging to `rejected` players and stale never-selected ones.
// A2: delete Bunny videos whose PlayerMedia is still `processing` after 24h with
//     zero bytes uploaded (abandoned uploads), and remove the doc.
// ============================================================================

// §11 — عدد نداءات حذف Bunny المتوازية في نفس اللحظة. التسلسل الكامل (واحد ورا
// التاني) بياخد ساعات على عشرات الآلاف من العناصر، والتوازي غير المحدود بيضرب
// الـrate limit بتاع Bunny ويخلّي الحذف يفشل بالجملة. 5 رقم محافظ آمن مع أي خطة
// — زوّده لو حدودك بتسمح.
const BUNNY_DELETE_CONCURRENCY = 5;

// §11 — كام مستند نسحب من الـcursor في المرة. بيحدّد سقف الذاكرة: مهما كبرت
// الكولكشن، اللي في الرام هو الدفعة دي بس.
const RETENTION_BATCH_SIZE = 200;

const emitUploader = async (uploaderIds) => {
    const ids = [...uploaderIds];
    if (ids.length === 0) return;
    const users = await User.find({ _id: { $in: ids } }).select("role");
    for (const u of users) {
        if (u.role === "observer") emitObserverDashboardUpdate(u._id);
        else emitCoachDashboardUpdate(u._id);
    }
};

// A2 — abandoned processing videos (zero bytes) older than 24h
export const cleanupOrphanedVideos = async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await PlayerMedia.find({
        type: "video",
        status: "processing",
        createdAt: { $lte: cutoff },
    });

    let removed = 0;
    for (const m of stale) {
        // "zero bytes" = the upload never actually landed on Bunny
        const video = await getStreamVideo(m.bunnyVideoId).catch(() => null);
        const zeroBytes = !video || !video.storageSize;
        if (zeroBytes) {
            await deleteStreamVideo(m.bunnyVideoId).catch(() => {});
            await m.deleteOne();
            removed++;
        }
    }
    return removed;
};

// §11 — بيمسح دفعة واحدة على التوازي. كل عنصر مستقل: فشل واحد مابيوقفش الباقيين.
// بيرجّع كام اتمسح وكام اتساب.
const purgeBatch = async (batch, affectedUploaders) => {
    const outcomes = await Promise.all(
        batch.map(async (m) => {
            try {
                // strict: لازم Bunny يأكّد الحذف الأول. لو فشل بنرمي ونسيب
                // الدوكيومنت مكانه — هو المرجع الوحيد لمفتاح البايتات، فمسحه
                // والبايتات لسه موجودة = تسريب تخزين دائم مش قابل للاكتشاف.
                // الدورة الجاية هتعدّي على العنصر ده تاني.
                await deleteMediaBytes(m, { strict: true });
            } catch (err) {
                console.error(`Retention: keeping media ${m._id} — Bunny delete failed: ${err.message}`);
                return "kept";
            }
            await m.deleteOne();
            if (m.uploadedBy) affectedUploaders.add(m.uploadedBy.toString());
            return "deleted";
        })
    );

    return {
        deleted: outcomes.filter((o) => o === "deleted").length,
        kept: outcomes.filter((o) => o === "kept").length,
    };
};

export const runMediaRetention = async () => {
    const windowDays = Number(process.env.MEDIA_RETENTION_DAYS) || 90;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const affectedUploaders = new Set();
    let deleted = 0;
    let kept = 0;

    // §11 — cursor بدل ما نحمّل النتيجة كلها في مصفوفة. الشكل القديم كان
    // .find().populate() وبيرجّع كل المستندات الأقدم من الـcutoff دفعة واحدة —
    // على مليون مستند ده OOM مش بطء.
    //
    // الأمان مع الحذف أثناء القراءة: إحنا بنمسح المستندات اللي الـcursor رجّعها
    // بالفعل بس، والـcursor بيمشي للأمام في ترتيب الـindex ({createdAt: 1}) —
    // فعمره ما بيرجع لمستند اتمسح. اللي ممنوع هو حذف مستندات لسه قدام المؤشر،
    // وده مش بيحصل هنا.
    const cursor = PlayerMedia.find({ createdAt: { $lte: cutoff } })
        .populate({ path: "player", select: "status" })
        .batchSize(RETENTION_BATCH_SIZE)
        .cursor();

    let batch = [];
    for await (const m of cursor) {
        // keep media for selected players
        // (الـ?. مقصود: لاعب متمسوح → undefined → الميديا بتتمسح. الكرون ده
        //  بينضّف ميديا اللاعبين المحذوفين كمان، والسلوك ده متحافظ عليه.)
        if (m.player?.status === "selected") continue;

        batch.push(m);
        if (batch.length >= BUNNY_DELETE_CONCURRENCY) {
            const r = await purgeBatch(batch, affectedUploaders);
            deleted += r.deleted;
            kept += r.kept;
            batch = [];
        }
    }
    // آخر دفعة ناقصة
    if (batch.length) {
        const r = await purgeBatch(batch, affectedUploaders);
        deleted += r.deleted;
        kept += r.kept;
    }

    await emitUploader(affectedUploaders);

    const orphans = await cleanupOrphanedVideos();
    return { deleted, kept, orphans };
};

export const startMediaRetention = () => {
    // daily at 3:30 AM (after the coach-cleanup job at 3:00)
    cron.schedule("30 3 * * *", async () => {
        try {
            const { deleted, kept, orphans } = await runMediaRetention();
            if (deleted > 0 || orphans > 0) {
                console.log(`🗑️  Media retention: purged ${deleted} cold item(s), ${orphans} orphaned video(s)`);
            }
            if (kept > 0) {
                console.error(`⚠️  Media retention: ${kept} item(s) kept — their Bunny bytes could not be deleted`);
            }
        } catch (err) {
            console.error("Media retention job error:", err.message);
        }
    });
    console.log("✅ Media retention job scheduled (daily at 3:30 AM)");
};
