// ============================================================================
// Stage 13 — clears the accidental ageGroup value on pre-existing
// professional-league teams.
//
// Team.ageGroup used to be required:true unconditionally, so every
// league: "professional" team created before this stage got whatever
// ageGroup happened to be in scope on the page that created it (an
// age-group's own detail page — the only place team creation existed).
// That value never meant anything for a professional team; the owner's
// decision (Stage 13) is to clear it entirely (undefined), the same
// pattern already used for Player.isProfessional (Stage 4b).
//
// Safe to re-run: only touches professional teams that still carry an
// ageGroup, and writes via batched bulkWrite.
//
// Usage:
//   node scripts/unsetProfessionalTeamAgeGroup.js            # dry run — counts only
//   node scripts/unsetProfessionalTeamAgeGroup.js --apply
//   npm run unset-professional-team-agegroup -- --apply
//
// Rollback:
//   Not meaningful — the pre-migration value was itself an accident of
//   creation context (whichever age group's page the team happened to be
//   created from), not a value worth restoring.
// ============================================================================
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

import Team from "../models/teamModel.js";

const APPLY = process.argv.includes("--apply");
const BATCH = 500;

const PENDING = { league: "professional", ageGroup: { $exists: true, $ne: null } };

async function run() {
    console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);

    await mongoose.connect(process.env.CONNECTION_STRING);
    console.log(`✅ Connected to ${mongoose.connection.name}\n`);

    const pending = await Team.countDocuments(PENDING).setOptions({ bypassFilter: true });

    console.log(`   professional teams with an ageGroup to clear: ${pending}\n`);

    if (pending === 0) {
        console.log("🎉 Nothing to do — no professional team currently carries an ageGroup.\n");
        await mongoose.disconnect();
        return;
    }

    if (!APPLY) {
        console.log("Dry run complete — pass --apply to write the change.\n");
        await mongoose.disconnect();
        return;
    }

    const cursor = Team.find(PENDING).setOptions({ bypassFilter: true }).select("_id").batchSize(BATCH).cursor();

    let ops = [];
    let written = 0;

    const flush = async () => {
        if (!ops.length) return;
        await Team.collection.bulkWrite(ops, { ordered: false });
        written += ops.length;
        process.stdout.write(`\r   updated ${written}/${pending}`);
        ops = [];
    };

    for await (const t of cursor) {
        ops.push({
            updateOne: {
                filter: { _id: t._id },
                update: { $unset: { ageGroup: "" } },
            },
        });
        if (ops.length >= BATCH) await flush();
    }
    await flush();

    console.log(`\n\n🎉 Cleared ageGroup on ${written} professional team(s).\n`);

    await mongoose.disconnect();
}

run().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
