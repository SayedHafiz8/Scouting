// ============================================================================
// audit-database — التغطية الانحدارية للبنود الخمسة في docs/audit-database-2026-08.md
//
// كل بند هنا معاه تست بيفشل على الكود القديم وبينجح على الجديد. البنود اللي
// أثرها أداء بحت (I1, I3) بتتحقق بـ**شكل الـindex والـplanner** مش بالزمن:
// الزمن مقياس صاخب في CI، أما "أنهي index اتاختار وكام مستند اتفحص" فهي خاصية
// حتمية للـquery planner بتتكرر بنفس النتيجة على أي جهاز.
// ============================================================================
import { describe, it, expect, beforeEach } from "vitest";
import mongoose from "mongoose";
import request from "supertest";

import app from "../app.js";
import Player from "../models/playedModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import {
    createAdmin,
    createCoach,
    createProScout,
    createPlayer,
    createPlayerDoc,
    createTeam,
    defaultTeamIds,
    setupPlayerMatchDay,
    seedAgeGroups,
} from "./helpers/factory.js";

// بيلف شجرة executionStages ويطلّع أسماء المراحل والفهارس
const walk = (stage, out = { stages: [], indexes: [] }) => {
    if (!stage) return out;
    out.stages.push(stage.stage);
    if (stage.indexName) out.indexes.push(stage.indexName);
    if (stage.inputStage) walk(stage.inputStage, out);
    (stage.inputStages ?? []).forEach((s) => walk(s, out));
    return out;
};

const planOf = (explain) => {
    const e = Array.isArray(explain) ? explain[0] : explain;
    const stats = e.executionStats ?? e.stages?.[0]?.$cursor?.executionStats;
    const tree = walk(stats.executionStages);
    return {
        stages: tree.stages,
        indexes: [...new Set(tree.indexes)],
        // الـSBE بيسمي مراحل المسح بحروف صغيرة — لازم الاتنين يتفحصوا
        isCollscan: tree.stages.some((s) => s === "COLLSCAN" || s === "scan"),
        docsExamined: stats.totalDocsExamined ?? 0,
        nReturned: stats.nReturned ?? 0,
    };
};

describe("audit-database — regression cover for the five findings", () => {
    beforeEach(async () => {
        await seedAgeGroups();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // I1 — سكوب الـproScout لازم يبقى مفهرس
    // ═══════════════════════════════════════════════════════════════════════
    describe("I1 — proScout scope { createdBy } is index-backed", () => {
        it("declares { createdBy: 1, createdAt: -1 } and no longer declares the dead { team, createdBy }", async () => {
            const declared = Player.schema.indexes().map(([key]) => key);
            const names = declared.map((k) => Object.keys(k).join(","));

            // createdBy لازم يكون الـprefix — ده البند نفسه، مش تفصيلة ترتيب
            const scopeIndex = declared.find((k) => Object.keys(k)[0] === "createdBy");
            expect(scopeIndex, "no index has createdBy as its first key").toBeTruthy();
            expect(Object.keys(scopeIndex)).toEqual(["createdBy", "createdAt"]);

            // الشكل القديم (Stage 2) اتلغى في المرحلة 11 — الـindex بتاعه مايرجعش
            expect(names).not.toContain("team,createdBy");
        });

        it("the list, its countDocuments, and the dashboard facet all avoid a collection scan", async () => {
            const { user: scout } = await createProScout({ email: "audit_i1@test.com" });
            const { user: other } = await createProScout({ email: "audit_i1b@test.com" });

            // ⚠️ شكل الداتا هنا مقصود بالكامل — التست ده اتعدّل مرتين قبل ما يستقر:
            //
            // 1) **الترتيب**: لاعبو الكشاف بتاعنا بيتعملوا الأول (الأقدم). لو كانوا
            //    الأحدث، createdAt_1 بيلاقيهم في أول خطوات المشي وبيقف بدري، فالخطة
            //    بتبان "كويسة" حتى من غير index على createdBy والتست مابيقيسش حاجة.
            //    (ودي نفس الملاحظة اللي التقرير رصدها في القياس الأصلي.)
            //
            // 2) **الحجم**: 5 مقابل 40 مكانش فرق تكلفة كافي — الـplanner كان بيختار
            //    بين الخطتين بشكل غير حتمي (فشل مقيس: مرة من كل 4 تشغيلات). الرقم
            //    الكبير بيخلي الاختيار قاطع: createdAt_1 لازم يمشي على 305 مدخل
            //    عشان يطلّع 5، مقابل 5 بالظبط للـindex الصح.
            //
            // القاعدة العامة: أي تست بيأكد على اختيار الـplanner لازم يبقى فرق
            // التكلفة فيه واضح — وإلا هو تست بيقيس عشوائية.
            for (let i = 0; i < 5; i++) {
                await createPlayerDoc({
                    name: `Mine Pro ${i}`,
                    isProfessional: true,
                    dateOfBirth: new Date(Date.UTC(2000, 1, 1)),
                    coach: null,
                    createdBy: scout._id,
                });
            }

            // إدخال بالدرايفر للكتلة الكبيرة: أسرع بكتير من .create() (اللي بيشغّل
            // الـhooks واستعلام AgeGroup لكل مستند)، والشكل هنا كامل ومكتوب بإيد
            // زي ما scripts/seedLoadTest.js بيعمل بالظبط لنفس السبب.
            const now = Date.now();
            await Player.collection.insertMany(
                Array.from({ length: 300 }, (_, i) => ({
                    name: `Other Pro ${i}`,
                    city: "Cairo",
                    address: "addr",
                    dateOfBirth: new Date(Date.UTC(2000, 1, 1)),
                    nationality: "Egyptian",
                    phoneNumber: "01000000000",
                    status: "pending",
                    isProfessional: true,
                    team: null,
                    observers: [],
                    coach: null,
                    createdBy: other._id,
                    searchTokens: ["other", "pro", "cairo"],
                    createdAt: new Date(now + i * 1000),
                    updatedAt: new Date(now + i * 1000),
                })),
                { ordered: false }
            );

            // autoIndex شغال في بيئة التست لكنه بيبني في الخلفية — نفس الاحتياط
            // اللي tests/cronIndexes.test.js:75 بيعمله قبل أي explain
            await Player.syncIndexes();

            // نفس الشكل اللي services/scope.js بيبنيه بالظبط ($and مش spread)
            const scope = { $and: [{ createdBy: scout._id }] };

            const list = planOf(
                await Player.find(scope).sort({ createdAt: -1 }).limit(50).explain("executionStats")
            );
            expect(list.isCollscan).toBe(false);
            expect(list.indexes).toContain("createdBy_1_createdAt_-1");
            // مغطّى بالكامل: مافيش مستند بيتقرا وبيترمي
            expect(list.docsExamined).toBe(list.nReturned);

            const count = planOf(await Player.find(scope).explain("executionStats"));
            expect(count.isCollscan, "countDocuments still scans the collection").toBe(false);
            expect(count.docsExamined).toBe(5);

            const facet = planOf(
                await Player.aggregate([
                    { $match: { $and: [{ createdBy: new mongoose.Types.ObjectId(scout._id) }] } },
                    { $facet: {
                        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
                        ids: [{ $project: { _id: 1 } }],
                    } },
                ]).explain("executionStats")
            );
            expect(facet.isCollscan, "dashboard facet still scans the collection").toBe(false);
            expect(facet.docsExamined).toBe(5);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // I2 — وايت ليست الترتيب
    // ═══════════════════════════════════════════════════════════════════════
    describe("I2 — sort whitelist", () => {
        const build = (Model, params, allowed) =>
            new ApiFeature(Model.find(), params, {}, null).sort(allowed);

        it("drops a field that is not on the list", () => {
            const f = build(Player, { sort: "name" }, ["createdAt"]);
            expect(f.query.getOptions().sort).toBeUndefined();
        });

        it("keeps an allowed field and honours the descending prefix", () => {
            expect(build(Player, { sort: "createdAt" }, ["createdAt"]).query.getOptions().sort)
                .toEqual({ createdAt: 1 });
            expect(build(Player, { sort: "-createdAt" }, ["createdAt"]).query.getOptions().sort)
                .toEqual({ createdAt: -1 });
        });

        it("keeps only the allowed members of a comma list", () => {
            const f = build(ScoutingReport, { sort: "-matchDate,overallRating" }, ["matchDate"]);
            expect(f.query.getOptions().sort).toEqual({ matchDate: -1 });
        });

        it("defaults to no client sort at all when no whitelist is passed (fails closed)", () => {
            const f = new ApiFeature(Player.find(), { sort: "createdAt" }, {}, null).sort();
            expect(f.query.getOptions().sort).toBeUndefined();
        });

        it("over HTTP: ?sort=name on players does not reach the query planner", async () => {
            const { token: coachToken } = await createCoach({ email: "audit_i2@test.com" });
            await createPlayer(coachToken, { name: "Zed Sorted" });
            await createPlayer(coachToken, { name: "Abe Sorted" });

            const res = await request(app)
                .get("/api/v1/players?sort=name")
                .set("Authorization", `Bearer ${coachToken}`);

            expect(res.status).toBe(200);
            // الطلب بينجح (المفتاح بيتشال بصمت زي الفلاتر) بس الترتيب مابيتطبّقش —
            // الترتيب الافتراضي -createdAt بيخلي آخر لاعب اتعمل هو الأول
            expect(res.body.data.documents[0].name).toBe("Abe Sorted");
        });

        it("over HTTP: an allowed sort still works end to end", async () => {
            const { token: coachToken } = await createCoach({ email: "audit_i2b@test.com" });
            await createPlayer(coachToken, { name: "First In" });
            await createPlayer(coachToken, { name: "Second In" });

            const res = await request(app)
                .get("/api/v1/players?sort=createdAt")
                .set("Authorization", `Bearer ${coachToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.documents[0].name).toBe("First In");
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // D1 — الفرادة على المباراة نفسها
    // ═══════════════════════════════════════════════════════════════════════
    describe("D1 — report uniqueness keys on the match, not the day", () => {
        it("blocks a second report from the same author on the same season match", async () => {
            const { token: coachToken, user: coach } = await createCoach({ email: "audit_d1@test.com" });
            const player = await createPlayer(coachToken, { name: "D1 Kid" });
            const teams = await defaultTeamIds(player.ageGroup);
            const match = await setupPlayerMatchDay(player._id, teams, new Date("2026-05-10T00:00:00.000Z"));

            const doc = {
                player: player._id,
                coach: coach._id,
                matchDate: match.matchDate,
                matchType: "official",
                seasonMatch: match._id,
                homeTeam: teams.homeTeam,
                awayTeam: teams.awayTeam,
                technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
                physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
                mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
            };

            await ScoutingReport.create(doc);
            await expect(ScoutingReport.create(doc)).rejects.toThrow(/duplicate key|E11000/i);
        });

        it("allows two reports on two DIFFERENT matches that fall on the same day", async () => {
            // ده اللي القاعدة القديمة ({player, coach, matchDate}) كانت بتمنعه
            // بالغلط — بطولة فيها ماتشين في يوم واحد
            const { token: coachToken, user: coach } = await createCoach({ email: "audit_d1b@test.com" });
            const player = await createPlayer(coachToken, { name: "Tournament Kid" });
            const teams = await defaultTeamIds(player.ageGroup);
            const sameDay = new Date("2026-05-11T00:00:00.000Z");

            const matchA = await setupPlayerMatchDay(player._id, teams, sameDay);
            const teamsB = await defaultTeamIds(player.ageGroup);
            const matchB = await setupPlayerMatchDay(player._id, teamsB, sameDay);

            const base = {
                player: player._id,
                coach: coach._id,
                matchDate: sameDay,
                matchType: "official",
                technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
                physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
                mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
            };

            await ScoutingReport.create({ ...base, seasonMatch: matchA._id });
            await ScoutingReport.create({ ...base, seasonMatch: matchB._id });

            expect(await ScoutingReport.countDocuments({ player: player._id })).toBe(2);
        });

        it("leaves reports with no season match unconstrained — the documented owner decision", async () => {
            // خيار A: الودّي/التدريب/الرسمي-بلا-فريق مالهمش هوية مباراة سيرفر-سايد،
            // فمفيش قيد فرادة عليهم. التست ده بيقفل القرار ده صراحةً عشان أي حد
            // يضيف قيد عليهم بعدين يشوف الاختيار المكتوب هنا الأول.
            const { token: coachToken, user: coach } = await createCoach({ email: "audit_d1c@test.com" });
            const player = await createPlayer(coachToken, { name: "Friendly Kid" });
            const teams = await defaultTeamIds(player.ageGroup);

            const base = {
                player: player._id,
                coach: coach._id,
                matchType: "friendly",
                seasonMatch: null,
                homeTeam: teams.homeTeam,
                awayTeam: teams.awayTeam,
                technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
                physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
                mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
            };

            const t = new Date("2026-05-12T09:00:00.000Z");
            await ScoutingReport.create({ ...base, matchDate: t });
            await ScoutingReport.create({ ...base, matchDate: new Date(t.getTime() + 1) });

            expect(await ScoutingReport.countDocuments({ player: player._id })).toBe(2);
        });

        it("still lets two DIFFERENT authors report on the same match (§12 partial intact)", async () => {
            const { token: tokenA, user: coachA } = await createCoach({ email: "audit_d1d@test.com" });
            const { user: coachB } = await createCoach({ email: "audit_d1e@test.com" });
            const player = await createPlayer(tokenA, { name: "Two Scouts Kid" });
            const teams = await defaultTeamIds(player.ageGroup);
            const match = await setupPlayerMatchDay(player._id, teams, new Date("2026-05-13T00:00:00.000Z"));

            const base = {
                player: player._id,
                matchDate: match.matchDate,
                matchType: "official",
                seasonMatch: match._id,
                technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
                physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
                mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
            };

            await ScoutingReport.create({ ...base, coach: coachA._id });
            await ScoutingReport.create({ ...base, coach: coachB._id });

            expect(await ScoutingReport.countDocuments({ player: player._id })).toBe(2);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // M1 — الحقل البولياني الغايب
    // ═══════════════════════════════════════════════════════════════════════
    describe("M1 — isProfessional=false must include documents missing the field", () => {
        it("compiles a false boolean filter to { $ne: true }", () => {
            const f = new ApiFeature(Player.find(), { isProfessional: "false" }, {}, null)
                .filter({ allowed: ["isProfessional"] });
            expect(f.query.getFilter().isProfessional).toEqual({ $ne: true });
        });

        it("leaves a true boolean filter alone", () => {
            const f = new ApiFeature(Player.find(), { isProfessional: "true" }, {}, null)
                .filter({ allowed: ["isProfessional"] });
            expect(f.query.getFilter().isProfessional).toBe("true");
        });

        it("does not touch non-boolean fields whose value happens to be 'false'", () => {
            const f = new ApiFeature(Player.find(), { nationality: "false" }, {}, null)
                .filter({ allowed: ["nationality"] });
            expect(f.query.getFilter().nationality).toBe("false");
        });

        it("over HTTP: a legacy player with no isProfessional field appears under ?isProfessional=false", async () => {
            const { token: adminToken } = await createAdmin({ email: "audit_m1@test.com" });
            const { token: coachToken } = await createCoach({ email: "audit_m1c@test.com" });

            const modern = await createPlayer(coachToken, { name: "Modern Youth" });
            const legacy = await createPlayer(coachToken, { name: "Legacy Youth" });

            // نحاكي مستند ما قبل المرحلة 4b: نشيل الحقل بالدرايفر (بيتخطّى الـhooks
            // والـdefaults، زي ما أي كتابة قبل وجود الحقل كانت بالظبط)
            await Player.collection.updateOne(
                { _id: new mongoose.Types.ObjectId(legacy._id) },
                { $unset: { isProfessional: "" } }
            );
            expect(
                await Player.collection.countDocuments({ isProfessional: { $exists: false } })
            ).toBe(1);

            const res = await request(app)
                .get("/api/v1/players?isProfessional=false")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const names = res.body.data.documents.map((d) => d.name);
            expect(names).toContain("Legacy Youth");   // ← كان بيسقط قبل الإصلاح
            expect(names).toContain("Modern Youth");
            expect(res.body.count).toBe(2);

            expect(modern._id).toBeTruthy();
        });

        it("?isProfessional=true is unaffected by the change", async () => {
            const { token: adminToken } = await createAdmin({ email: "audit_m1b@test.com" });
            const { user: scout } = await createProScout({ email: "audit_m1s@test.com" });
            const { token: coachToken } = await createCoach({ email: "audit_m1d@test.com" });

            await createPlayer(coachToken, { name: "A Youth" });
            await createPlayerDoc({
                name: "A Pro",
                isProfessional: true,
                dateOfBirth: new Date(Date.UTC(2000, 1, 1)),
                coach: null,
                createdBy: scout._id,
            });

            const res = await request(app)
                .get("/api/v1/players?isProfessional=true")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.documents.map((d) => d.name)).toEqual(["A Pro"]);
        });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // I3 — الفهارس اللي مالهاش قارئ
    // ═══════════════════════════════════════════════════════════════════════
    describe("I3 — dead PlayerMedia indexes are gone", () => {
        it("no longer declares reviewStatus_1 or player_1_type_1", () => {
            const names = PlayerMedia.schema.indexes()
                .map(([key]) => Object.keys(key).join(","));

            expect(names).not.toContain("reviewStatus");
            expect(names).not.toContain("player,type");
        });

        it("keeps the compound index the live type/status queries actually use", () => {
            const names = PlayerMedia.schema.indexes()
                .map(([key]) => Object.keys(key).join(","));

            // playerMediaController.js:316/334/360 — {player, seasonMatch, type, status}
            expect(names).toContain("player,seasonMatch,type,status");
            // الكرونز — partial على status:"processing"
            expect(names).toContain("type,updatedAt");
            // قايمة ميديا اللاعب + الترتيب الافتراضي
            expect(names).toContain("player,createdAt");
        });

        it("the readyCount query still plans onto an index after the drops", async () => {
            const { token: coachToken } = await createCoach({ email: "audit_i3@test.com" });
            const player = await createPlayer(coachToken, { name: "Media Kid" });

            await PlayerMedia.syncIndexes();

            const plan = planOf(
                await PlayerMedia.find({
                    player: new mongoose.Types.ObjectId(player._id),
                    seasonMatch: null,
                    type: "video",
                    status: "ready",
                }).explain("executionStats")
            );

            expect(plan.isCollscan).toBe(false);
            expect(plan.indexes).toContain("player_1_seasonMatch_1_type_1_status_1");
        });
    });
});
