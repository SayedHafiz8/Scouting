import mongoose from "mongoose";
import dotenv from "dotenv";
import Player from "../models/playedModel.js";

dotenv.config({ path: "./config.env" });

async function run() {
  await mongoose.connect(process.env.CONNECTION_STRING);
  console.log("✅ Connected\n");

  console.log("⏳ Syncing Player indexes (drops obsolete, builds new)...");
  await Player.syncIndexes();

  const indexes = await Player.collection.indexes();
  console.log("\n📌 Player indexes now:");
  indexes.forEach(i => console.log("   ", i.name, JSON.stringify(i.key)));

  // Quick explain on the coach counts aggregation shape
  const sample = await Player.aggregate([
    { $group: { _id: "$ageGroup", count: { $sum: 1 } } },
  ]);
  console.log(`\n📊 counts group-by ageGroup returned ${sample.length} group(s)`);

  await mongoose.disconnect();
  console.log("\n🎉 Done!");
}

run().catch(err => { console.error("❌", err.message); process.exit(1); });
