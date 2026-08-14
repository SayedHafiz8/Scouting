import mongoose from "mongoose";
import dotenv from "dotenv";
import AgeGroup from "../models/ageGroupModel.js";
import Team from "../models/teamModel.js";

dotenv.config({ path: "./config.env" });

// Safe by default: runs as a DRY RUN unless --apply is passed.
//
//   node scripts/cloneTeamsToAgeGroup.js                          # dry run
//   node scripts/cloneTeamsToAgeGroup.js --apply                  # actually creates teams
//   node scripts/cloneTeamsToAgeGroup.js --from 2007 --to 2009 --apply   # override the default years
const APPLY = process.argv.includes("--apply");

const argValue = (flag, fallback) => {
    const i = process.argv.indexOf(flag);
    return i !== -1 ? Number(process.argv[i + 1]) : fallback;
};
const FROM_YEAR = argValue("--from", 2007);
const TO_YEAR = argValue("--to", 2009);

async function run() {
    await mongoose.connect(process.env.CONNECTION_STRING);
    console.log("✅ Connected");
    console.log(`Mode: ${APPLY ? "APPLY (will create teams)" : "DRY RUN (no changes — pass --apply to execute)"}`);
    console.log(`Cloning teams: birth year ${FROM_YEAR} → birth year ${TO_YEAR}\n`);

    const [fromGroup, toGroup] = await Promise.all([
        AgeGroup.findOne({ birthYear: FROM_YEAR }),
        AgeGroup.findOne({ birthYear: TO_YEAR }),
    ]);

    if (!fromGroup) throw new Error(`No age group configured for birth year ${FROM_YEAR}`);
    if (!toGroup) throw new Error(`No age group configured for birth year ${TO_YEAR}`);

    console.log(`Source: ${fromGroup.name} (${fromGroup._id})`);
    console.log(`Target: ${toGroup.name} (${toGroup._id})\n`);

    // active بس — نفس الفلتر اللي الـpre(/^find/) hook بيطبقه تلقائي على أي
    // استعلام عادي، بس بنكتبه صريح هنا عشان واضح إننا مش بنستنسخ فرق متلغية
    const sourceTeams = await Team.find({ ageGroup: fromGroup._id });

    if (sourceTeams.length === 0) {
        console.log(`No active teams found under ${fromGroup.name}. Nothing to do.`);
        await mongoose.disconnect();
        return;
    }

    console.log(`Found ${sourceTeams.length} team(s) under ${fromGroup.name}:\n`);

    let toCreate = 0;
    let toSkip = 0;

    for (const team of sourceTeams) {
        // نفس الـunique index بتاع الموديل: {name, ageGroup, league} — بنفحصه هنا
        // مقدماً عشان نطبع تقرير واضح، مش عشان نعتمد عليه بس وقت الكتابة
        const existing = await Team.findOne({
            name: team.name,
            ageGroup: toGroup._id,
            league: team.league,
        });

        if (existing) {
            console.log(`⏭️  "${team.name}" (${team.league}) — already exists under ${toGroup.name}, skipping`);
            toSkip++;
            continue;
        }

        console.log(`${APPLY ? "✅ Created" : "➕ Would create"}: "${team.name}" (${team.league}, club: "${team.clubName}")`);
        toCreate++;

        if (APPLY) {
            await Team.create({
                name: team.name,
                ageGroup: toGroup._id,
                league: team.league,
                clubName: team.clubName,
                active: true,
            });
        }
    }

    console.log(`\n${APPLY ? "🎉 Done." : "🎉 Dry run complete — pass --apply to execute this plan."}`);
    console.log(`   ${toCreate} team(s) ${APPLY ? "created" : "would be created"}, ${toSkip} already existed and were skipped.`);

    await mongoose.disconnect();
}

run().catch(err => {
    console.error("❌", err.message);
    process.exit(1);
});
