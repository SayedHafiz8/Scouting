import mongoose from "mongoose";
import dotenv from "dotenv";
import AgeGroup from "../models/ageGroupModel.js";

dotenv.config({ path: "./config.env" });

// Birth-year based groups (2009 → 2019)
const AGE_GROUPS = Array.from({ length: 11 }, (_, i) => {
  const birthYear = 2009 + i;
  return { name: String(birthYear), birthYear };
});

async function run() {
  await mongoose.connect(process.env.CONNECTION_STRING);
  console.log("✅ Connected to MongoDB");

  // 1) Remove old age-based groups (documents that have no birthYear field)
  const del = await AgeGroup.deleteMany({ birthYear: { $exists: false } });
  console.log(`🗑️  Removed ${del.deletedCount} old age-based group(s)`);

  // 2) Ensure the new birth-year groups exist
  for (const group of AGE_GROUPS) {
    const exists = await AgeGroup.findOne({ birthYear: group.birthYear });
    if (exists) {
      console.log(`⏭️  Birth year ${group.birthYear} already exists (${exists.name}), skipping`);
      continue;
    }
    await AgeGroup.create(group);
    console.log(`✅ Created: ${group.name} (birth year ${group.birthYear})`);
  }

  const remaining = await AgeGroup.find().sort({ birthYear: 1 }).select("name birthYear -_id").lean();
  console.log("\n📋 Current age groups:", remaining.map(g => g.name).join(", "));

  console.log("\n🎉 Done!");
  await mongoose.disconnect();
}

run().catch(err => {
  console.error("❌ Cleanup failed:", err.message);
  process.exit(1);
});
