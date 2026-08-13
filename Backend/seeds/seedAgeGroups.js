import mongoose from "mongoose";
import dotenv from "dotenv";
import AgeGroup from "../models/ageGroupModel.js";

dotenv.config({ path: "./config.env" });

// Birth-year based groups (2007 → 2019)
const AGE_GROUPS = Array.from({ length: 13 }, (_, i) => {
  const birthYear = 2007 + i;
  return { name: String(birthYear), birthYear };
});

async function seed() {
  await mongoose.connect(process.env.CONNECTION_STRING);
  console.log("✅ Connected to MongoDB");

  for (const group of AGE_GROUPS) {
    const exists = await AgeGroup.findOne({ birthYear: group.birthYear });
    if (exists) {
      console.log(`⏭️  Birth year ${group.birthYear} already exists (${exists.name}), skipping`);
      continue;
    }
    await AgeGroup.create(group);
    console.log(`✅ Created: ${group.name} (birth year ${group.birthYear})`);
  }

  console.log("\n🎉 Done! All age groups are ready.");
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
