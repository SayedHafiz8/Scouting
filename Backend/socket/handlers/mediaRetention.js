import cron from "node-cron";

import PlayerMedia from "../../models/playerMediaModel.js";
import User from "../../models/userModel.js";
import { getStreamVideo, deleteStreamVideo } from "../../config/bunny.js";
import { deleteMediaBytes } from "../../controllers/playerMediaController.js";
import {
    emitCoachDashboardUpdate,
    emitObserverDashboardUpdate,
} from "../../controllers/dashboardController.js";
import { ROLES } from "../../constants/roles.js";

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
        if (u.role === ROLES.OBSERVER) emitObserverDashboardUpdate(u._id);
        else emitCoachDashboardUpdate(u._id);
    }
};

// A2 — abandoned processing videos (zero bytes) older than 24h
//
// audit-database 2026-09-12 — الشكل القديم كان بيمسح فيديوهات حقيقية:
//
//     const video = await getStreamVideo(m.bunnyVideoId).catch(() => null);
//     const zeroBytes = !video || !video.storageSize;
//
// getStreamVideo بترجّع null على 404 بالتحديد، وبترمي على أي فشل تاني
// (config/bunny.js:84-87). الـ`.catch(() => null)` كان بيلمّ الحالتين في نفس
// القيمة — يعني **"باني قال إن الفيديو مش موجود"** و**"مقدرتش أسأل باني"** بقوا
// نفس الشيء. أي عطل شبكة أو 5xx أو rate limit لحظة تشغيل الكرون بيخلي فيديو
// مرفوع بالكامل (واقف في processing لأن الـwebhook ماوصلش) يتقرا كأنه صفر بايت
// ويتمسح هو ومستنده نهائياً.
//
// القاعدة دلوقتي: الغياب لازم **يتأكّد**. مفيش استنتاج غياب من فشل السؤال.
//
// والحذف بقى بايتات-الأول-وبعدين-المستند، زي purgeBatch و purgeUserImages
// بالظبط. الشكل القديم كان `deleteStreamVideo(...).catch(() => {})` وبعده
// `m.deleteOne()` — يعني فشل الحذف على باني كان بيتبلع والمستند بيتمسح بردو،
// وده بالظبط "المستند مشي والبايتات فضلت للأبد" اللي الملف ده كله مكتوب
// عشان يمنعه: المستند هو المرجع الوحيد لـbunnyVideoId، فبعد ما يمشي مفيش
// حتى مفتاح نوصل بيه للبايتات عشان نمسحها بعدين.
export const cleanupOrphanedVideos = async () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = await PlayerMedia.find({
        type: "video",
        status: "processing",
        createdAt: { $lte: cutoff },
    });

    let removed = 0;
    let skipped = 0;

    for (const m of stale) {
        let video;
        try {
            video = await getStreamVideo(m.bunnyVideoId);
        } catch (err) {
            // مقدرتش أسأل باني — ده مش دليل على إن الفيديو مش موجود.
            // سيبه، الدورة الجاية هتحاول تاني.
            skipped++;
            console.error(
                `Retention: keeping media ${m._id} — could not query Bunny: ${err.message}`
            );
            continue;
        }

        // الحالتين الوحيدتين اللي بتبرّر الحذف، والاتنين مؤكّدين من باني:
        const confirmedAbsent = video === null;                 // 404 صريح
        const confirmedEmpty = video !== null && !video.storageSize; // موجود وفاضي

        if (!confirmedAbsent && !confirmedEmpty) continue; // فيديو حقيقي — ما نلمسوش

        // البايتات الأول. لو موجود وفاضي بنمسحه من باني ونتأكد؛ لو باني أصلاً
        // بيقول 404 مفيش بايتات نمسحها فبنعدّي النداء.
        if (confirmedEmpty) {
            try {
                await deleteStreamVideo(m.bunnyVideoId);
            } catch (err) {
                skipped++;
                console.error(
                    `Retention: keeping media ${m._id} — Bunny video delete failed: ${err.message}`
                );
                continue;
            }
        }

        // المستند بعد ما البايتات تتأكد إنها مشيت بس
        await m.deleteOne();
        removed++;
    }

    return { removed, skipped };
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

    const { removed: orphans, skipped: orphansSkipped } = await cleanupOrphanedVideos();
    return { deleted, kept, orphans, orphansSkipped };
};

export const startMediaRetention = () => {
    // daily at 3:30 AM (after the coach-cleanup job at 3:00)
    cron.schedule("30 3 * * *", async () => {
        try {
            const { deleted, kept, orphans, orphansSkipped } = await runMediaRetention();
            if (deleted > 0 || orphans > 0) {
                console.log(`🗑️  Media retention: purged ${deleted} cold item(s), ${orphans} orphaned video(s)`);
            }
            if (kept > 0) {
                console.error(`⚠️  Media retention: ${kept} item(s) kept — their Bunny bytes could not be deleted`);
            }
            // مستندات اتساب لأن باني مارضيش يجاوب — مش نفس kept (اللي فشل عليه
            // الحذف). لازم تبان لوحدها: لو الرقم ده بيتكرر كل ليلة، فده عطل
            // مستمر في الوصول لباني مش عناصر عصية على الحذف.
            if (orphansSkipped > 0) {
                console.error(`⚠️  Media retention: ${orphansSkipped} processing video(s) skipped — Bunny could not be queried`);
            }
        } catch (err) {
            console.error("Media retention job error:", err.message);
        }
    });
    console.log("✅ Media retention job scheduled (daily at 3:30 AM)");
};
