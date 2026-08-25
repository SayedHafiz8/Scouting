// ============================================================================
// audit-database M1 — backfill لـPlayer.isProfessional.
//
// الحقل اتضاف في المرحلة 4b بـ`default: false`. الـdefault ده بيتكتب على
// المستندات **الجديدة** بس (وقت .create()/.save())، فاللاعبين اللي اتسجلوا قبل
// المرحلة دي الحقل **غايب** عندهم تماماً — مش false، غايب.
//
// وMongoDB بيفرّق بين الاتنين: `{ isProfessional: false }` بيطابق القيمة الصريحة
// بس. يعني الأدمن اللي بيفلتر "الناشئين بس" (?isProfessional=false، اتفتح في
// المرحلة 4c) كان بياخد قايمة ناقصة **بصمت** — من غير خطأ، ومن غير أي عرَض في
// الواجهة، لأن العدّاد نفسه بيستخدم $cond اللي بتعامل الغايب كـfalsy صح فبيقول
// رقم متّسق مع القايمة الناقصة.
//
// ⚠️ السكريبت ده **نص الإصلاح مش كله**. النص التاني في
// utils/apiFeatures.js (normalizeBooleanFalse) اللي بيحوّل أي فلتر بولياني
// بقيمة false لـ{ $ne: true } — وده اللي بيغطي أي حقل بولياني جديد يتضاف بعدين،
// وكمان بيحمي أي مستند بيتكتب بالـdriver مباشرةً (سكريبتات الميجريشن بتتخطّى
// الـhooks والـdefaults). الاتنين مطلوبين: ده بيصلّح النهاردة، والتاني بيصلّح بكرة.
//
// آمن للتكرار: بيعالج اللي الحقل غايب عنده بس ($exists: false)، ومابيلمسش أي
// مستند عنده قيمة صريحة — لا true ولا false.
//
// Usage:
//   node scripts/backfillIsProfessional.js            # dry run — بيعد بس
//   node scripts/backfillIsProfessional.js --apply
//   npm run backfill-is-professional -- --apply
//
// Rollback:
//   الميجريشن دي بتكتب قيمة **مساوية للسلوك الافتراضي** (false = ناشئ)، فالتراجع
//   مالوش أثر على أي منطق — لكنه ممكن ومباشر لو احتجته:
//     await Player.updateMany(
//       { isProfessional: false },
//       { $unset: { isProfessional: "" } }
//     )
//   ⚠️ التراجع ده بيشيل الحقل من **كل** لاعب ناشئ، بما فيهم اللي اتعملوا بعد
//   المرحلة 4b (اللي الـdefault كتبها ليهم) — مش بس اللي السكريبت ده لمسهم.
//   لو ده مش المطلوب، قيّده بـ{ updatedAt: { $lte: <وقت تشغيل الميجريشن> } }.
//   بعد التراجع، فلتر ?isProfessional=false بيفضل صحيحاً بفضل normalizeBooleanFalse.
// ============================================================================
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

import Player from "../models/playedModel.js";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

// اللي محتاج backfill: الحقل غايب تماماً. القيمة الصريحة (true أو false) مابتتلمسش.
const PENDING = { isProfessional: { $exists: false } };

async function run() {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

    await mongoose.connect(process.env.CONNECTION_STRING);
    console.log(`✅ Connected to ${mongoose.connection.name}\n`);

    const total = await Player.countDocuments();
    const pending = await Player.countDocuments(PENDING);
    const explicitTrue = await Player.countDocuments({ isProfessional: true });
    const explicitFalse = await Player.countDocuments({ isProfessional: false });

    console.log(`   players total                 : ${total}`);
    console.log(`   isProfessional: true          : ${explicitTrue}   → untouched`);
    console.log(`   isProfessional: false         : ${explicitFalse}   → untouched`);
    console.log(`   field missing (needs backfill): ${pending}\n`);

    if (pending > 0) {
        // الرقم ده هو بالظبط عدد اللاعبين اللي كانوا بيختفوا من فلتر
        // ?isProfessional=false قبل الإصلاح — بيتطبع عشان الأثر يبقى ملموس.
        console.log(`   ⚠️  ${pending} player(s) were invisible to the "?isProfessional=false" admin filter.\n`);
    }

    if (pending === 0) {
        console.log("🎉 Nothing to do — every player already has an explicit isProfessional value.\n");
        await mongoose.disconnect();
        return;
    }

    if (!APPLY) {
        console.log("Dry run complete — pass --apply to write the values.\n");
        await mongoose.disconnect();
        return;
    }

    // cursor + bulkWrite على دفعات — نفس مبدأ backfillPlayerCreatedBy/
    // backfillSearchTokens: الذاكرة بتفضل محدودة مهما كبرت الكولكشن.
    //
    // ملاحظة: updateMany سطر واحد كان هيكفي هنا (القيمة ثابتة مش مشتقة من كل
    // مستند)، لكن الشكل ده متبع عشان يفضل متسق مع باقي سكريبتات الميجريشن،
    // وعشان التقدّم يبان على كولكشن كبيرة بدل ما العملية تقعد صامتة.
    const cursor = Player.find(PENDING).select("_id").batchSize(BATCH).cursor();

    let ops = [];
    let written = 0;

    const flush = async () => {
        if (!ops.length) return;
        await Player.collection.bulkWrite(ops, { ordered: false });
        written += ops.length;
        process.stdout.write(`\r   updated ${written}/${pending}`);
        ops = [];
    };

    for await (const p of cursor) {
        ops.push({
            updateOne: {
                filter: { _id: p._id },
                update: { $set: { isProfessional: false } },
            },
        });
        if (ops.length >= BATCH) await flush();
    }
    await flush();

    const remaining = await Player.countDocuments(PENDING);

    console.log(`\n\n🎉 Backfilled ${written} player(s) with isProfessional: false.`);
    console.log(`   remaining without the field: ${remaining}${remaining ? "  ⚠️ re-run" : "  ✅"}\n`);

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
