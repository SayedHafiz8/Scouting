import mongoose from "mongoose";
import dotenv from "dotenv";
import AgeGroup from "../models/ageGroupModel.js";

dotenv.config({ path: "./config.env" });

async function run() {
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
  console.log("✅ Connected\n");

  const coll = AgeGroup.collection;

  const indexes = await coll.indexes();
  console.log("📌 Indexes:");
  indexes.forEach(i => console.log("   ", i.name, JSON.stringify(i.key), i.unique ? "(unique)" : ""));

  const docs = await coll.find().toArray();
  console.log(`\n📄 Documents (${docs.length}):`);
  docs.forEach(d => console.log("   ", JSON.stringify(d)));

  const nullBirthYear = await coll.countDocuments({ $or: [{ birthYear: null }, { birthYear: { $exists: false } }] });
  console.log(`\n⚠️  Docs with null/missing birthYear: ${nullBirthYear}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error("❌", err.message); process.exit(1); });
