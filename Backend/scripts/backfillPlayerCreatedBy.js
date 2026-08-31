// ============================================================================
// Stage 2 — backfill لـPlayer.createdBy.
//
// الحقل بيتحط سيرفر-سايد في playerController.create من التوكن، فاللاعبين اللي
// اتعملوا قبل التغيير ده مالهمش قيمة. الحقل بيتقري في فرع واحد بس من سكوب
// proScout — اللاعب اللي team فيه null — فمن غير الـbackfill اللاعبين القدام
// اللي بلا فريق مش هيظهروا لأي proScout حتى لو هو اللي أضافهم.
//
// المصدر: coach. مفيش سجل تاريخي لمين أنشأ اللاعب، والكوتش المالك هو أقرب
// بديل أمين (موثّق في spec FR-002 وresearch R3).
//
// اللاعب اليتيم (coach مفضّي بعد ما الكوتش اتمسح نهائياً — §9) بيتعدّ
// وبيتساب من غير قيمة عن قصد: مالوش منشئ حقيقي نقدر ندّعيه، والحقل الغايب
// بيتصرف زي null بالظبط في استعلام النطاق.
//
// آمن للتكرار: بيعالج اللي مالهمش createdBy بس، وبيكتب بالـbulkWrite على دفعات.
//
// Usage:
//   node scripts/backfillPlayerCreatedBy.js            # dry run — بيعد بس
//   node scripts/backfillPlayerCreatedBy.js --apply
//   npm run backfill-player-createdby -- --apply
//
// Rollback:
//   الحقل إضافي وبيتقري من مسار واحد، فالتراجع بيرجّع السلوك القديم بالظبط
//   من غير أي تغيير في المخطط:
//     await Player.updateMany({}, { $unset: { createdBy: "" } })
//   (وبعدها npm run sync-indexes -- --apply لو حبيت تشيل الـindex كمان.)
// ============================================================================
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

import Player from "../models/playedModel.js";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

// اللي محتاج backfill: مالوش createdBy وليه كوتش نقدر ننسبه ليه
const PENDING = { createdBy: { $exists: false }, coach: { $exists: true, $ne: null } };
// اليتامى: مالهمش createdBy ومالهمش كوتش — بيتعدّوا وبيتساب زي ما هم
const ORPHANS = { createdBy: { $exists: false }, $or: [{ coach: { $exists: false } }, { coach: null }] };

async function run() {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

    // audit-database — autoIndex/autoCreate: false إجباري على أي اتصال (CLAUDE.md).
    //
    // mongoose افتراضه autoIndex: true، وده بيخلي مجرد فتح الاتصال ينده
    // Model.init() → createIndexes() ويبني كل فهرس معلن في المخطط كأثر جانبي.
    // السكريبت اللي غرضه يقرا أو يعدّل بيانات مايصحّش يعيد تشكيل الفهارس.
    // حصل فعلاً على الإنتاج (2026-08-26) من tool موصوف بإنه "dry run".
    // مسار تغيير الفهارس الوحيد هو scripts/syncAllIndexes.js بالـdry-run بتاعه.
    await mongoose.connect(process.env.CONNECTION_STRING, {
        autoIndex: false,
        autoCreate: false,
    });
    console.log(`✅ Connected to ${mongoose.connection.name}\n`);

    const total = await Player.countDocuments();
    const pending = await Player.countDocuments(PENDING);
    const orphans = await Player.countDocuments(ORPHANS);

    console.log(`   players total            : ${total}`);
    console.log(`   missing createdBy        : ${pending + orphans}`);
    console.log(`     ↳ backfillable (coach) : ${pending}`);
    console.log(`     ↳ orphans (no coach)   : ${orphans}  → skipped by design\n`);

    if (pending === 0) {
        console.log("🎉 Nothing to do — every player with a coach already has createdBy.\n");
        await mongoose.disconnect();
        return;
    }

    if (!APPLY) {
        console.log("Dry run complete — pass --apply to write the attributions.\n");
        await mongoose.disconnect();
        return;
    }

    // cursor عشان الذاكرة تفضل محدودة مهما كبرت الكولكشن (نفس مبدأ backfillSearchTokens)
    const cursor = Player.find(PENDING).select("coach").batchSize(BATCH).cursor();

    let ops = [];
    let written = 0;

    const flush = async () => {
        if (!ops.length) return;
        await Player.bulkWrite(ops, { ordered: false });
        written += ops.length;
        process.stdout.write(`\r   updated ${written}/${pending}`);
        ops = [];
    };

    for await (const p of cursor) {
        ops.push({
            updateOne: {
                filter: { _id: p._id },
                update: { $set: { createdBy: p.coach } },
            },
        });
        if (ops.length >= BATCH) await flush();
    }
    await flush();

    console.log(`\n\n🎉 Backfilled ${written} player(s).`);
    if (orphans) {
        console.log(`   ${orphans} orphaned player(s) left without createdBy — expected, see header.`);
    }
    console.log("   Reminder: run `npm run sync-indexes -- --apply` so the");
    console.log("   { team: 1, createdBy: 1 } index exists on this database.\n");

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
