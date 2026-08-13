import mongoose from "mongoose";
import dotenv from "dotenv";
import AgeGroup from "../models/ageGroupModel.js";

dotenv.config({ path: "./config.env" });

async function run() {
  await mongoose.connect(process.env.CONNECTION_STRING);
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
