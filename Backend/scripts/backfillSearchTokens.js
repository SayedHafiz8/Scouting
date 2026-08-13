// ============================================================================
// §11 — backfill لـPlayer.searchTokens.
//
// الحقل مشتق من name + city وبيتحسب في pre('save') و pre('findOneAndUpdate')،
// فاللاعبين اللي اتعملوا قبل التغيير ده مالهمش tokens — يعني **مش هيظهروا في أي
// نتيجة بحث** لحد ما السكريبت ده يشتغل. لازم يتنفّذ مرة واحدة مع النشر.
//
// آمن للتكرار: بيعالج اللي مالهمش tokens بس، وبيكتب بالـbulkWrite على دفعات.
// بيستخدم نفس دالة buildSearchTokens بتاعة الموديل بدل ما يعيد كتابة المنطق —
// لو قاعدة التقسيم اتغيّرت يوم، الاتنين بيتغيّروا مع بعض.
//
// Usage:
//   node scripts/backfillSearchTokens.js            # dry run — بيعد بس
//   node scripts/backfillSearchTokens.js --apply
//   npm run backfill-search-tokens -- --apply
// ============================================================================
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

import Player, { buildSearchTokens } from "../models/playedModel.js";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

async function run() {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

    await mongoose.connect(process.env.CONNECTION_STRING);
    console.log(`✅ Connected to ${mongoose.connection.name}\n`);

    const total = await Player.countDocuments();
    // اللي محتاج backfill: الحقل غايب أو مصفوفة فاضية
    const pending = await Player.countDocuments({
        $or: [{ searchTokens: { $exists: false } }, { searchTokens: { $size: 0 } }],
    });

    console.log(`   players total          : ${total}`);
    console.log(`   missing search tokens  : ${pending}\n`);

    if (pending === 0) {
        console.log("🎉 Nothing to do — every player already has search tokens.\n");
        await mongoose.disconnect();
        return;
    }

    if (!APPLY) {
        console.log("Dry run complete — pass --apply to write the tokens.\n");
        await mongoose.disconnect();
        return;
    }

    // cursor عشان الذاكرة تفضل محدودة مهما كبرت الكولكشن (نفس مبدأ §11 في
    // كرون الـretention)
    const cursor = Player.find({
        $or: [{ searchTokens: { $exists: false } }, { searchTokens: { $size: 0 } }],
    })
        .select("name city")
        .batchSize(BATCH)
        .cursor();

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
                update: { $set: { searchTokens: buildSearchTokens(p.name, p.city) } },
            },
        });
        if (ops.length >= BATCH) await flush();
    }
    await flush();

    console.log(`\n\n🎉 Backfilled ${written} player(s).`);
    console.log("   Reminder: run `npm run sync-indexes -- --apply` so the");
    console.log("   { searchTokens: 1 } index exists on this database.\n");

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
