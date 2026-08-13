import cron from "node-cron";
import User from "../../models/userModel.js";
import {
    purgeUserImages,
    detachUserFromPlayers,
    detachUserReferences,
} from "../../services/userDeletion.js";

// §9 — الحذف النهائي بعد 30 يوم من التعطيل.
//
// اتحوّل من deleteMany مُجمَّع لحلقة على كل يوزر عشان كل واحد لازم تتمسح بايتاته
// من Bunny (بطاقة الرقم القومي في الـvault + صورة البروفايل) قبل ما نمسح
// الدوكيومنت. لو الحذف من Bunny فشل بنسيب اليوزر كما هو ونعدّي — الدورة الجاية
// هتحاول تاني — عشان مايبقاش عندنا سجل متمسح وبايتات حسّاسة لسه موجودة.
export const runCleanupDeactivated = async () => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const stale = await User.find({
        active: false,
        deactivatedAt: { $lte: cutoff },
    }).setOptions({ bypassFilter: true });

    let deleted = 0;
    let skipped = 0;

    for (const user of stale) {
        try {
            await purgeUserImages(user);
        } catch (err) {
            skipped++;
            console.error(
                `Cleanup: keeping user ${user._id} — Bunny delete failed: ${err.message}`
            );
            continue;
        }
        // الترتيب مهم: البايتات → فكّ الارتباط باللاعبين → باقي الـreferences →
        // الدوكيومنت. لو الترتيب اتعكس وفشل حاجة في النص هنفضل قادرين نعيد
        // المحاولة، لأن اليوزر لسه موجود.
        //
        // §12 — الحلقة دي جوه try/catch خاص بيها: أي فشل في التنظيف (مش في Bunny)
        // كان بيطلع بره runCleanupDeactivated ويوقف الدورة كلها، يعني يوزر واحد
        // باظ كان بيمنع كل اللي بعده في نفس الليلة. دلوقتي بيتسجّل، اليوزر بيتساب
        // كما هو، والحلقة بتكمّل. آمن إن التنظيف يكون اتنفّذ جزئياً قبل الفشل —
        // كل عملياته updateMany/deleteMany بفلتر على الـid، فالدورة الجاية
        // بتعيدها من غير أثر جانبي.
        try {
            await detachUserFromPlayers(user._id);
            await detachUserReferences(user);
            await User.deleteOne({ _id: user._id }).setOptions({ bypassFilter: true });
            deleted++;
        } catch (err) {
            skipped++;
            console.error(
                `Cleanup: keeping user ${user._id} — reference cleanup failed: ${err.message}`
            );
        }
    }

    return { deleted, skipped };
};

// بيشتغل كل يوم الساعة 3 الصبح
export const startCleanupJob = () => {
    cron.schedule("0 3 * * *", async () => {
        try {
            const { deleted, skipped } = await runCleanupDeactivated();

            if (deleted > 0) {
                console.log(`🗑️  Cleanup: deleted ${deleted} user(s) deactivated for 30+ days`);
            }
            if (skipped > 0) {
                console.error(`⚠️  Cleanup: ${skipped} user(s) kept — their Bunny assets could not be deleted`);
            }
        } catch (err) {
            console.error("Cleanup job error:", err.message);
        }
    });

    console.log("✅ Deactivated coaches cleanup job scheduled (daily at 3:00 AM)");
};
