// Creates/updates every model's MongoDB indexes on a database where autoIndex is
// off (production — see config/database.js: `autoIndex: !isProduction`). Without
// this, a fresh production DB has NO indexes at all — not the performance ones,
// and not the uniqueness ones (e.g. User.email), which would let duplicate
// emails slip in silently.
//
// Safe by default: runs as a DRY RUN unless --apply is passed. The dry run uses
// Mongoose's own Model.diffIndexes() — the exact same diff syncIndexes() uses
// internally — so what you see here is exactly what --apply would do, without
// touching the database.
//
// Usage:
//   node scripts/syncAllIndexes.js              # dry run — prints the plan only
//   node scripts/syncAllIndexes.js --apply       # actually creates/drops indexes
//   npm run sync-indexes [-- --apply]
//
// IMPORTANT: syncIndexes() DROPS any index that exists on the collection but is
// no longer declared in the schema. Always review the dry-run output before
// passing --apply, especially against a database that predates a schema change.
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

// Explicit imports — ESM has no auto-discovery, and a model only registers
// itself into mongoose.models once its file has been imported somewhere.
import "../models/userModel.js";
import "../models/playedModel.js";
import "../models/playerMediaModel.js";
import "../models/scoutingReportModel.js";
import "../models/seasonMatchModel.js";
import "../models/teamModel.js";
import "../models/ageGroupModel.js";
import "../models/coachEvaluationModel.js";
import "../models/observerEvaluationModel.js";
import "../models/videoUploadCounterModel.js";
import "../models/idCardAccessLogModel.js";
import "../models/configModel.js";

const APPLY = process.argv.includes("--apply");

// User.email is unique but has never had an index built on production (autoIndex
// was always off there) — if duplicate emails already exist, building the unique
// index will fail outright. Check for that up front with a clear message instead
// of letting the driver error out mid-run.
async function checkDuplicateEmails() {
    const User = mongoose.model("User");
    const dupes = await User.aggregate([
        { $group: { _id: { $toLower: "$email" }, count: { $sum: 1 }, ids: { $push: "$_id" } } },
        { $match: { count: { $gt: 1 } } },
    ]);

    if (dupes.length > 0) {
        console.error(`\n❌ Found ${dupes.length} duplicate email(s) — the unique index on User.email will fail to build:`);
        dupes.forEach((d) => console.error(`   ${d._id}  →  ${d.ids.join(", ")}`));
        console.error("\nResolve these duplicates before running with --apply.\n");
        return false;
    }
    return true;
}

async function run() {
    console.log(`Mode: ${APPLY ? "APPLY (will create/drop indexes)" : "DRY RUN (no changes — pass --apply to execute)"}\n`);

    await mongoose.connect(process.env.CONNECTION_STRING);
    console.log("✅ Connected\n");

    const emailsOk = await checkDuplicateEmails();
    if (!emailsOk && APPLY) {
        await mongoose.disconnect();
        process.exit(1);
    }

    const modelEntries = Object.entries(mongoose.models);
    console.log(`📋 ${modelEntries.length} model(s) registered: ${modelEntries.map(([name]) => name).join(", ")}\n`);

    let anyFailed = false;

    for (const [name, Model] of modelEntries) {
        console.log(`── ${name} ${"─".repeat(Math.max(1, 60 - name.length))}`);
        try {
            if (APPLY) {
                const result = await Model.syncIndexes();
                if (result.length) {
                    console.log(`   dropped/rebuilt: ${result.join(", ")}`);
                } else {
                    console.log("   no changes");
                }
            } else {
                const { toDrop, toCreate } = await Model.diffIndexes();
                if (toDrop.length === 0 && toCreate.length === 0) {
                    console.log("   up to date — nothing to do");
                } else {
                    toCreate.forEach((spec) => console.log(`   + create: ${JSON.stringify(spec)}`));
                    toDrop.forEach((spec) => console.log(`   - drop:   ${JSON.stringify(spec)}`));
                }
            }

            // على DB فاضية تماماً (زي أول تشغيل على production جديد) الكولكشن نفسه
            // لسه مش موجود لحد ما أول document يتحفظ — listIndexes بترمي "ns does not
            // exist" في الحالة دي، وده مش فشل حقيقي، بس معناه "0 index لسه".
            let indexes = [];
            try {
                indexes = await Model.collection.indexes();
            } catch (err) {
                if (!/ns does not exist/i.test(err.message)) throw err;
            }
            console.log(`   current indexes (${indexes.length}):`);
            indexes.forEach((i) => console.log(`     ${i.name}  ${JSON.stringify(i.key)}${i.unique ? " [unique]" : ""}${i.sparse ? " [sparse]" : ""}`));
        } catch (err) {
            anyFailed = true;
            console.error(`   ❌ ${err.message}`);
        }
        console.log("");
    }

    await mongoose.disconnect();

    if (anyFailed) {
        console.error("🛑 One or more models failed — see errors above.");
        process.exit(1);
    }

    console.log(APPLY ? "🎉 Indexes synced." : "🎉 Dry run complete — pass --apply to execute this plan.");
}

run().catch((err) => {
    console.error("❌", err.message);
    process.exit(1);
});
