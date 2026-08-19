// ============================================================================
// Load-test seeder — fills a THROWAWAY cluster with realistically-shaped data so
// explainQueries.js can prove which queries collection-scan at scale.
//
// ── SAFETY: this script reads SEED_TARGET_URI and nothing else ───────────────
// config.env points at whichever cluster you last worked on, and a seeder that
// silently follows it can write tens of thousands of fake players into
// production. There is no fallback: no SEED_TARGET_URI → immediate exit.
//
// The gate lives in ./seedGuard.js, imported BEFORE the models on purpose:
// config/bunny.js runs dotenv.config() at import time, so config.env is merged
// into process.env as a side effect of loading any model. seedGuard snapshots
// SEED_TARGET_URI ahead of that, so a stray line in config.env can never
// satisfy the gate. It also refuses when SEED_TARGET_URI equals the app's own
// CONNECTION_STRING. The target host + db are printed and confirmed before a
// single write.
//
// ── Why the native driver instead of Model.insertMany ───────────────────────
// Every generated document carries a `__seed: "loadtest"` marker so --clean can
// delete exactly what this script created and nothing else. Mongoose strips
// unknown paths under strict mode, so the marker would vanish through the model
// layer. Instead we build complete documents by hand and insert them through
// Model.collection — and to make sure the hand-built shape is actually valid,
// one probe document per collection is validated through the real Mongoose
// model first (see validateShape below). Derived fields that live in save hooks
// are recomputed here on purpose:
//   • Player.ageGroup      ← pre('save') in playedModel.js:117
//   • ScoutingReport.overallRating ← pre('save') in scoutingReportModel.js:180
// insertMany/driver inserts do not run save hooks, so skipping this would leave
// null ageGroups and break every ageGroup-filtered query we want to measure.
//
// Usage:
//   SEED_TARGET_URI="mongodb+srv://..." node scripts/seedLoadTest.js
//   SEED_TARGET_URI="..." node scripts/seedLoadTest.js --players=20000
//   SEED_TARGET_URI="..." node scripts/seedLoadTest.js --clean
//   SEED_TARGET_URI="..." node scripts/seedLoadTest.js --players=5000 --yes
// ============================================================================
// ⚠️ يفضل أول import — بيلتقط SEED_TARGET_URI قبل ما تحميل الموديلز يشغّل
//    dotenv.config() جوه config/bunny.js. متحركهوش من هنا.
import { SEED_TARGET_URI, assertSafeTarget, describeTarget } from "./seedGuard.js";

import mongoose from "mongoose";
import crypto from "crypto";
import readline from "readline";

import AgeGroup from "../models/ageGroupModel.js";
import Team from "../models/teamModel.js";
import User from "../models/userModel.js";
import Player, { buildSearchTokens } from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import CoachEvaluation from "../models/coachEvaluationModel.js";
import ObserverEvaluation from "../models/observerEvaluationModel.js";
import { ROLES } from "../constants/roles.js";

const SEED_MARKER = "loadtest";
const MARK = { __seed: SEED_MARKER };
const BATCH_SIZE = 1000;

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const num = (name, fallback) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`));
    if (!hit) return fallback;
    const v = Number(hit.split("=")[1]);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

const CLEAN = flag("clean");
const ASSUME_YES = flag("yes");
// 5000 هو الافتراضي عن قصد: الكلاستر المجاني (M0) مساحته 512MB، والرقم ده كفاية
// تماماً إن explain() يفرّق بين IXSCAN وCOLLSCAN. زوّده بحذر لو المساحة سمحت.
const PLAYERS = num("players", 5000);
const COACHES = num("coaches", 40);
const OBSERVERS = num("observers", 15);
const REPORTS_PER_PLAYER = num("reportsPerPlayer", 3);
const MEDIA_PER_PLAYER = num("mediaPerPlayer", 2);
const MATCHES = num("matches", 600);

// ── safety gate ─────────────────────────────────────────────────────────────
assertSafeTarget({ scriptName: "seedLoadTest.js" });
const URI = SEED_TARGET_URI;

function confirm(question) {
    if (ASSUME_YES) return Promise.resolve(true);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(/^y(es)?$/i.test(answer.trim()));
        });
    });
}

// ── deterministic-ish random helpers (no external deps) ─────────────────────
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const rating = () => randInt(4, 10);

const POSITIONS = ["GK", "CB", "LB", "RB", "CM", "DM", "AM", "LW", "RW", "ST"];
const FEET = ["right", "left", "both"];
// التوزيع مقصود يبقى غير متساوي — status وposition بيتفلتر عليهم كتير، والـ
// selectivity المتفاوتة هي اللي بتخلي فرق الـindex يبان في explain
const STATUSES = ["pending", "pending", "pending", "selected", "rejected", "observed"];
const CITIES = ["Cairo", "Giza", "Alexandria", "Mansoura", "Tanta", "Aswan", "Suez", "Ismailia"];
const NATIONALITIES = ["Egyptian", "Egyptian", "Egyptian", "Sudanese", "Libyan"];
const FIRST = ["Ahmed", "Mohamed", "Mahmoud", "Youssef", "Omar", "Ali", "Hassan", "Karim", "Tarek", "Amr", "Ziad", "Seif"];
const LAST = ["Hassan", "Ibrahim", "Farouk", "Nasser", "Salah", "Zaki", "Fathy", "Mansour", "Adel", "Sobhy"];
const LEAGUES = ["premier", "professional"];
const SEASONS = ["2024/2025", "2025/2026"];

const playerName = () => `${pick(FIRST)} ${pick(LAST)}`;
const phone = () => `01${randInt(0, 2)}${String(randInt(0, 99999999)).padStart(8, "0")}`;

// نفس المعادلة اللي في pre('save') بتاعة ScoutingReport — متوسط الـ12 تقييم
function calcOverall(technical, physical, mental) {
    const all = [...Object.values(technical), ...Object.values(physical), ...Object.values(mental)];
    return Number((all.reduce((a, v) => a + v, 0) / all.length).toFixed(2));
}

// بيتأكد إن الشكل اللي بنبنيه بإيدينا يعدّي فاليديشن الموديل الحقيقي قبل ما نـ
// bulk-insert آلاف منه عن طريق الدرايفر (اللي بيتخطى الفاليديشن)
async function validateShape(Model, doc, label) {
    const { __seed, ...withoutMarker } = doc;
    try {
        await new Model(withoutMarker).validate();
    } catch (err) {
        throw new Error(`${label} shape failed model validation: ${err.message}`);
    }
}

async function insertBatched(Model, docs, label) {
    if (docs.length === 0) return 0;
    await validateShape(Model, docs[0], label);
    let done = 0;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const slice = docs.slice(i, i + BATCH_SIZE);
        await Model.collection.insertMany(slice, { ordered: false });
        done += slice.length;
        process.stdout.write(`\r   ${label}: ${done}/${docs.length}`);
    }
    process.stdout.write(`\r   ${label}: ${done}/${docs.length}\n`);
    return done;
}

// ── clean ───────────────────────────────────────────────────────────────────
const SEEDED_MODELS = [
    ["ObserverEvaluation", ObserverEvaluation],
    ["CoachEvaluation", CoachEvaluation],
    ["PlayerMedia", PlayerMedia],
    ["ScoutingReport", ScoutingReport],
    ["SeasonMatch", SeasonMatch],
    ["Player", Player],
    ["Team", Team],
    ["User", User],
    ["AgeGroup", AgeGroup],
];

async function clean() {
    let total = 0;
    for (const [name, Model] of SEEDED_MODELS) {
        // الفلتر على الماركر بس — أي داتا حقيقية على الكلاستر ده مالهاش الحقل ده
        // فمستحيل تتمسح، حتى لو الكلاستر فيه بيانات تانية
        const res = await Model.collection.deleteMany({ __seed: SEED_MARKER });
        if (res.deletedCount) console.log(`   ${name}: deleted ${res.deletedCount}`);
        total += res.deletedCount;
    }
    console.log(`\n🧹 Removed ${total} seeded document(s). Nothing without the "${SEED_MARKER}" marker was touched.`);
}

// ── seed ────────────────────────────────────────────────────────────────────
async function seed() {
    const oid = () => new mongoose.Types.ObjectId();

    // 1) age groups — بننشئ الناقص بس، وبنعلّم اللي إحنا عملناه عشان --clean
    //    مايمسحش فئات حقيقية موجودة على الكلاستر
    console.log("\n▸ Age groups");
    const existingGroups = await AgeGroup.find({}).lean();
    const haveYears = new Set(existingGroups.map((g) => g.birthYear));
    const newGroups = [];
    for (let y = 2007; y <= 2019; y++) {
        if (!haveYears.has(y)) newGroups.push({ _id: oid(), name: String(y), birthYear: y, ...MARK });
    }
    if (newGroups.length) await AgeGroup.collection.insertMany(newGroups, { ordered: false });
    console.log(`   ${existingGroups.length} existing, ${newGroups.length} created`);
    const groups = await AgeGroup.find({}).lean();
    const groupByYear = new Map(groups.map((g) => [g.birthYear, g._id]));

    // 2) users — باسورد واحد مهشّم مسبقاً لكل الحسابات المزروعة (bcrypt لكل واحد
    //    كان هياخد دقايق، والحسابات دي مش للاستخدام أصلاً)
    console.log("\n▸ Users");
    const fakeHash = "$2b$12$" + crypto.randomBytes(16).toString("hex").slice(0, 53);
    const now = new Date();
    const coaches = Array.from({ length: COACHES }, (_, i) => ({
        _id: oid(),
        name: `LoadTest Coach ${i + 1}`,
        email: `lt_coach_${i + 1}@loadtest.local`,
        password: fakeHash,
        phoneNumber: phone(),
        role: ROLES.COACH,
        active: true,
        createdAt: now,
        updatedAt: now,
        ...MARK,
    }));
    const observers = Array.from({ length: OBSERVERS }, (_, i) => ({
        _id: oid(),
        name: `LoadTest Observer ${i + 1}`,
        email: `lt_observer_${i + 1}@loadtest.local`,
        password: fakeHash,
        phoneNumber: phone(),
        role: ROLES.OBSERVER,
        active: true,
        createdAt: now,
        updatedAt: now,
        ...MARK,
    }));
    const admin = {
        _id: oid(),
        name: "LoadTest Admin",
        email: "lt_admin@loadtest.local",
        password: fakeHash,
        phoneNumber: phone(),
        role: ROLES.ADMIN,
        active: true,
        createdAt: now,
        updatedAt: now,
        ...MARK,
    };
    await insertBatched(User, [...coaches, ...observers, admin], "users");

    // 3) teams — فريقين لكل (فئة × دوري) عشان جدول المباريات يبقى واقعي
    console.log("\n▸ Teams");
    const teams = [];
    for (const g of groups) {
        for (const league of LEAGUES) {
            for (let i = 1; i <= 3; i++) {
                teams.push({
                    _id: oid(),
                    name: `LT ${g.birthYear} ${league} Club ${i}`,
                    clubName: `LoadTest Club ${i}`,
                    ageGroup: g._id,
                    league,
                    active: true,
                    createdAt: now,
                    updatedAt: now,
                    ...MARK,
                });
            }
        }
    }
    await insertBatched(Team, teams, "teams");
    const teamsByGroup = new Map();
    for (const t of teams) {
        const key = String(t.ageGroup);
        if (!teamsByGroup.has(key)) teamsByGroup.set(key, []);
        teamsByGroup.get(key).push(t);
    }

    // 4) players — موزّعين على الفئات، وageGroup بتتشتق من سنة الميلاد زي الـhook
    console.log("\n▸ Players");
    const players = [];
    for (let i = 0; i < PLAYERS; i++) {
        const birthYear = randInt(2007, 2019);
        const dateOfBirth = new Date(Date.UTC(birthYear, randInt(0, 11), randInt(1, 28)));
        const coach = coaches[i % coaches.length];
        const status = pick(STATUSES);
        const groupId = groupByYear.get(birthYear);
        const groupTeams = teamsByGroup.get(String(groupId)) ?? [];
        const name = playerName();
        const city = pick(CITIES);
        // الأوبزيرفرز بيتحطوا على اللاعبين "observed" بس — زي المنطق الحقيقي
        const assigned = status === "observed"
            ? [observers[randInt(0, observers.length - 1)]._id]
            : [];
        players.push({
            _id: oid(),
            name,
            city,
            // §11 — الإدراج بالدرايفر بيتخطى pre('save')، فالحقل المشتق بيتحسب
            // هنا بنفس دالة الموديل (زي ageGroup فوق)
            searchTokens: buildSearchTokens(name, city),
            address: `${randInt(1, 200)} LoadTest St`,
            dateOfBirth,
            position: pick(POSITIONS),
            ageGroup: groupId,
            team: groupTeams.length ? pick(groupTeams)._id : null,
            teamName: null,
            height: randInt(140, 190),
            weight: randInt(35, 85),
            preferredFoot: pick(FEET),
            nationality: pick(NATIONALITIES),
            phoneNumber: phone(),
            status,
            observers: assigned,
            notes: "seeded for load testing",
            coach: coach._id,
            createdAt: new Date(now - randInt(0, 400) * 86400000),
            updatedAt: now,
            ...MARK,
        });
    }
    await insertBatched(Player, players, "players");

    // 5) season matches
    console.log("\n▸ Season matches");
    const matches = [];
    for (let i = 0; i < MATCHES; i++) {
        const g = pick(groups);
        const pool = teamsByGroup.get(String(g._id)) ?? [];
        if (pool.length < 2) continue;
        const league = pick(LEAGUES);
        const inLeague = pool.filter((t) => t.league === league);
        if (inLeague.length < 2) continue;
        const home = inLeague[0];
        const away = inLeague[inLeague.length - 1];
        const matchDate = new Date(Date.UTC(2025, randInt(0, 11), randInt(1, 28)));
        // الحاضرين: خليط كوتشات وأوبزيرفرز — الحقل ده multikey وبيتفلتر عليه في
        // "ماتشاتي" وفي عدّادات الداشبورد
        const attendees = [
            coaches[randInt(0, coaches.length - 1)]._id,
            observers[randInt(0, observers.length - 1)]._id,
        ];
        matches.push({
            _id: oid(),
            ageGroup: g._id,
            season: pick(SEASONS),
            league,
            matchDate,
            homeTeam: home._id,
            awayTeam: away._id,
            venue: `LoadTest Stadium ${randInt(1, 20)}`,
            status: matchDate < now ? "completed" : "scheduled",
            result: matchDate < now ? { homeScore: randInt(0, 4), awayScore: randInt(0, 4) } : undefined,
            attendees,
            createdBy: admin._id,
            createdAt: now,
            updatedAt: now,
            ...MARK,
        });
    }
    await insertBatched(SeasonMatch, matches, "matches");

    // 6) scouting reports — matchDate بيتغيّر لكل تقرير عشان الـunique index
    //    {player, coach, matchDate} مايتكسرش
    console.log("\n▸ Scouting reports");
    const reports = [];
    for (const p of players) {
        for (let r = 0; r < REPORTS_PER_PLAYER; r++) {
            // معظم التقارير من كوتش اللاعب، وجزء من أوبزيرفر — عشان فلتر
            // authorRole بتاع الأدمن يبقى ليه معنى
            const author = r === REPORTS_PER_PLAYER - 1 && p.observers.length
                ? p.observers[0]
                : p.coach;
            const technical = { passing: rating(), dribbling: rating(), shooting: rating(), ballControl: rating() };
            const physical = { speed: rating(), stamina: rating(), strength: rating(), agility: rating() };
            const mental = { positioning: rating(), decisionMaking: rating(), teamwork: rating(), attitude: rating() };
            reports.push({
                _id: oid(),
                player: p._id,
                coach: author,
                matchDate: new Date(Date.UTC(2025, r, 1 + r)),
                matchType: "training",
                homeTeam: null,
                homeTeamName: null,
                awayTeam: null,
                awayTeamName: null,
                seasonMatch: null,
                technical,
                physical,
                mental,
                overallRating: calcOverall(technical, physical, mental),
                notes: `LoadTest report ${r + 1} — solid performance across the pitch`,
                createdAt: new Date(now - randInt(0, 300) * 86400000),
                updatedAt: now,
                ...MARK,
            });
        }
    }
    await insertBatched(ScoutingReport, reports, "reports");

    // 7) player media
    console.log("\n▸ Player media");
    const media = [];
    for (const p of players) {
        for (let m = 0; m < MEDIA_PER_PLAYER; m++) {
            const isVideo = m % 2 === 1;
            const uploader = p.observers.length && m === 0 ? p.observers[0] : p.coach;
            media.push({
                _id: oid(),
                player: p._id,
                uploadedBy: uploader,
                type: isVideo ? "video" : "image",
                storage: "bunny",
                ...(isVideo
                    ? { bunnyVideoId: crypto.randomUUID(), status: "ready" }
                    : { storageKey: `players/${crypto.randomUUID()}.webp`, status: "ready" }),
                title: `LoadTest ${isVideo ? "clip" : "photo"} ${m + 1}`,
                description: "Seeded media item for load testing",
                seasonMatch: null,
                createdAt: new Date(now - randInt(0, 300) * 86400000),
                updatedAt: now,
                ...MARK,
            });
        }
    }
    await insertBatched(PlayerMedia, media, "media");

    // 8) monthly evaluations — 6 شهور لكل كوتش/أوبزيرفر
    console.log("\n▸ Evaluations");
    const coachEvals = [];
    for (const c of coaches) {
        for (let m = 1; m <= 6; m++) {
            coachEvals.push({
                _id: oid(),
                coach: c._id,
                evaluator: admin._id,
                year: 2025,
                month: m,
                scouting: { talentIdentification: rating(), matchAnalysis: rating(), reportAccuracy: rating() },
                videoWork: { videoRecordingQuality: rating(), videoUploadTimeliness: rating(), videoCoverage: rating() },
                rosterManagement: { playerProfileQuality: rating(), squadOrganization: rating() },
                professionalism: { punctuality: rating(), commitment: rating(), matchAttendance: rating() },
                notes: "LoadTest evaluation",
                status: "published",
                createdAt: now,
                updatedAt: now,
                ...MARK,
            });
        }
    }
    const observerEvals = [];
    for (const o of observers) {
        for (let m = 1; m <= 6; m++) {
            observerEvals.push({
                _id: oid(),
                observer: o._id,
                evaluator: admin._id,
                year: 2025,
                month: m,
                scouting: { talentIdentification: rating(), matchAnalysis: rating(), reportAccuracy: rating() },
                videoWork: { videoRecordingQuality: rating(), videoUploadTimeliness: rating(), videoCoverage: rating() },
                professionalism: { punctuality: rating(), commitment: rating(), attitude: rating() },
                collaboration: { communication: rating(), reportTimeliness: rating() },
                notes: "LoadTest evaluation",
                status: "published",
                createdAt: now,
                updatedAt: now,
                ...MARK,
            });
        }
    }
    await insertBatched(CoachEvaluation, coachEvals, "coach evaluations");
    await insertBatched(ObserverEvaluation, observerEvals, "observer evaluations");

    console.log(`
🎉 Seed complete.
   players   ${players.length}
   reports   ${reports.length}
   media     ${media.length}
   matches   ${matches.length}
   users     ${coaches.length + observers.length + 1}
   teams     ${teams.length}

   Next:  SEED_TARGET_URI="..." node scripts/explainQueries.js
`);
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
    const { host, db } = describeTarget(URI);
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ${CLEAN ? "CLEAN" : "SEED"} — target confirmation${" ".repeat(CLEAN ? 33 : 34)}║
╚════════════════════════════════════════════════════════════════╝
   host : ${host}
   db   : ${db}
   mode : ${CLEAN ? `delete documents marked __seed="${SEED_MARKER}"` : `insert ~${PLAYERS} players + related data`}
`);

    const ok = await confirm("   Is this the THROWAWAY cluster? [y/N] ");
    if (!ok) {
        console.log("\n   Aborted — nothing was written.\n");
        process.exit(0);
    }

    await mongoose.connect(URI);
    console.log(`\n✅ Connected to ${mongoose.connection.name}`);

    if (CLEAN) {
        console.log("\n▸ Removing seeded documents");
        await clean();
    } else {
        await seed();
    }

    await mongoose.disconnect();
}

main().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
