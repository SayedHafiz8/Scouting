import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

// نفس نمط userRetention.test.js: بنعمل موك لغلاف شبكة Bunny بس، وسايبين
// bunnyConfig حقيقي. الحذف بيعدي على Bunny قبل ما يوصل للتنظيف اللي بنختبره.
vi.mock("../config/bunny.js", async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        deleteStorageObject: vi.fn(async () => true),
        purgeUrl: vi.fn(async () => true),
    };
});

import app from "../app.js";
import User from "../models/userModel.js";
import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import CoachEvaluation from "../models/coachEvaluationModel.js";
import ObserverEvaluation from "../models/observerEvaluationModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import { deleteStorageObject, purgeUrl } from "../config/bunny.js";
import { runCleanupDeactivated } from "../socket/handlers/cleanupDeactivated.js";
import {
    createAdmin,
    createCoach,
    createObserver,
    createPlayer,
    createTeam,
    defaultTeamIds,
    setupPlayerMatchDay,
    coachEvaluationPayload,
    observerEvaluationPayload,
    seedAgeGroups,
} from "./helpers/factory.js";

// ============================================================================
// §12 — الـreferences المعلّقة بعد الحذف النهائي لليوزر.
//
// §9 قفل بايتات Bunny واللاعبين. الملف ده بيقفل الباقي: التقارير، الميديا،
// المباريات، والتقييمات — وكل واحد ليه قرار مختلف حسب طبيعة البيانات ودور
// اليوزر المحذوف. المبدأ: البيانات الكشفية بتفضل (بـref مصفّر)، والحكم الشخصي
// على الشخص المحذوف بيمشي معاه.
// ============================================================================

beforeEach(async () => {
    vi.clearAllMocks();
    deleteStorageObject.mockResolvedValue(true);
    purgeUrl.mockResolvedValue(true);
    await seedAgeGroups();
});

// بيمسح اليوزر نهائياً عن طريق راوت الأدمن — نفس مسار الإنتاج بالظبط
const forceDelete = async (adminToken, userId, expected = 204) => {
    const res = await request(app)
        .delete(`/api/v1/users/${userId}/force`)
        .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(expected);
    return res;
};

// ماتش بسيط بحضور اليوزر
const matchWithAttendees = async (attendees) => {
    const groupId = (await Player.db.collection("agegroups").findOne({}))._id;
    const { homeTeam, awayTeam } = await defaultTeamIds(groupId);
    const creator = await User.create({
        name: "Match Creator",
        email: `creator_${Math.random().toString(36).slice(2, 8)}@test.com`,
        password: "TestPass1234",
        role: "admin",
    });
    return SeasonMatch.create({
        ageGroup: groupId,
        season: "2026/2027",
        league: "premier",
        matchDate: new Date(),
        homeTeam,
        awayTeam,
        createdBy: creator._id,
        attendees,
    });
};

const mediaFor = (playerId, uploaderId) =>
    PlayerMedia.create({
        player: playerId,
        uploadedBy: uploaderId,
        type: "image",
        storage: "bunny",
        status: "ready",
        imageKey: "players/some-image.webp",
        title: "Training shot",
        description: "A photo from training",
    });

// ============================================================================
describe("§12 — deleting a coach", () => {
    it("keeps their scouting reports but clears the author ref", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin1@test.com" });
        const { token: coachToken, user: coach } = await createCoach({ email: "ref_coach1@test.com" });
        const player = await createPlayer(coachToken, { name: "Report Kid" });

        const teams = await defaultTeamIds(player.ageGroup);
        await ScoutingReport.create({
            player: player._id,
            coach: coach._id,
            matchDate: new Date(),
            matchType: "friendly",
            homeTeam: teams.homeTeam,
            awayTeam: teams.awayTeam,
            notes: "Good game",
            technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
            physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
            mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
        });

        await forceDelete(adminToken, coach._id);

        const reports = await ScoutingReport.find({ player: player._id });
        expect(reports).toHaveLength(1);          // التاريخ الكشفي فضل
        expect(reports[0].coach).toBeNull();      // والـref اتقفل
    });

    it("deletes the evaluations written ABOUT them", async () => {
        const { token: adminToken, user: admin } = await createAdmin({ email: "ref_admin2@test.com" });
        const { user: coach } = await createCoach({ email: "ref_coach2@test.com" });

        await CoachEvaluation.create(
            coachEvaluationPayload({ coach: coach._id, evaluator: admin._id })
        );
        expect(await CoachEvaluation.countDocuments()).toBe(1);

        await forceDelete(adminToken, coach._id);

        // تقييم أداء شخص محذوف سجل شخصي عنه — بيمشي معاه
        expect(await CoachEvaluation.countDocuments()).toBe(0);
    });

    it("still orphans their players (the §9 behaviour is intact)", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin3@test.com" });
        const { token: coachToken, user: coach } = await createCoach({ email: "ref_coach3@test.com" });
        const player = await createPlayer(coachToken, { name: "Orphan Check Kid" });

        await forceDelete(adminToken, coach._id);

        const after = await Player.findById(player._id);
        expect(after).not.toBeNull();
        expect(after.coach ?? null).toBeNull();
    });
});

// ============================================================================
describe("§12 — deleting an observer", () => {
    it("deletes the evaluations written ABOUT them", async () => {
        const { token: adminToken, user: admin } = await createAdmin({ email: "ref_admin4@test.com" });
        const { user: observer } = await createObserver({ email: "ref_obs1@test.com" });

        await ObserverEvaluation.create(
            observerEvaluationPayload({ observer: observer._id, evaluator: admin._id })
        );
        expect(await ObserverEvaluation.countDocuments()).toBe(1);

        await forceDelete(adminToken, observer._id);

        expect(await ObserverEvaluation.countDocuments()).toBe(0);
    });

    it("is pulled out of every season match's attendees array", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin5@test.com" });
        const { user: observer } = await createObserver({ email: "ref_obs2@test.com" });
        const { user: keeper } = await createCoach({ email: "ref_keeper@test.com" });

        const match = await matchWithAttendees([observer._id, keeper._id]);

        await forceDelete(adminToken, observer._id);

        const after = await SeasonMatch.findById(match._id);
        expect(after).not.toBeNull();                       // المباراة نفسها فضلت
        expect(after.attendees).toHaveLength(1);
        // الموديل بيعمل populate تلقائي لـattendees، فالعنصر دوكيومنت مش ObjectId
        expect(after.attendees[0]._id.toString()).toBe(keeper._id.toString());
    });

    it("is removed from the observers array of every player they watched", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin6@test.com" });
        const { token: coachToken } = await createCoach({ email: "ref_coach6@test.com" });
        const { user: observer } = await createObserver({ email: "ref_obs3@test.com" });
        const player = await createPlayer(coachToken, { name: "Watched Kid" });

        await Player.findByIdAndUpdate(player._id, { observers: [observer._id] });

        await forceDelete(adminToken, observer._id);

        const after = await Player.findById(player._id);
        expect(after.observers).toHaveLength(0);
    });

    it("keeps the reports they authored, with the author ref cleared", async () => {
        // ScoutingReport.coach هو الكاتب أياً كان دوره — الراوت مفتوح للأوبزيرفر
        // كمان. القاعدة مبنية على الحقل مش على الدور.
        const { token: adminToken } = await createAdmin({ email: "ref_admin7@test.com" });
        const { token: coachToken } = await createCoach({ email: "ref_coach7@test.com" });
        const { user: observer } = await createObserver({ email: "ref_obs4@test.com" });
        const player = await createPlayer(coachToken, { name: "Observed Report Kid" });

        const teams = await defaultTeamIds(player.ageGroup);
        await ScoutingReport.create({
            player: player._id,
            coach: observer._id,
            matchDate: new Date(),
            matchType: "friendly",
            homeTeam: teams.homeTeam,
            awayTeam: teams.awayTeam,
            notes: "Observer's view",
            technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
            physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
            mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
        });

        await forceDelete(adminToken, observer._id);

        const reports = await ScoutingReport.find({ player: player._id });
        expect(reports).toHaveLength(1);
        expect(reports[0].coach).toBeNull();
    });
});

// ============================================================================
describe("§12 — deleting an admin", () => {
    it("keeps the evaluations they WROTE, with the evaluator ref cleared", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin8@test.com" });
        const { user: leaving } = await createAdmin({ email: "ref_leaving@test.com" });
        const { user: coach } = await createCoach({ email: "ref_coach8@test.com" });
        const { user: observer } = await createObserver({ email: "ref_obs5@test.com" });

        await CoachEvaluation.create(
            coachEvaluationPayload({ coach: coach._id, evaluator: leaving._id })
        );
        await ObserverEvaluation.create(
            observerEvaluationPayload({ observer: observer._id, evaluator: leaving._id })
        );

        await forceDelete(adminToken, leaving._id);

        // تاريخ تقييم الكشافين مايضيعش لأن الأدمن اللي كتبه مشي
        const ce = await CoachEvaluation.find({});
        const oe = await ObserverEvaluation.find({});
        expect(ce).toHaveLength(1);
        expect(oe).toHaveLength(1);
        expect(ce[0].evaluator).toBeNull();
        expect(oe[0].evaluator).toBeNull();
        // والمُقيَّم نفسه لسه مربوط
        expect(ce[0].coach.toString()).toBe(coach._id.toString());
        expect(oe[0].observer.toString()).toBe(observer._id.toString());
    });
});

// ============================================================================
describe("§12 — deleting a media uploader", () => {
    it("keeps the media and clears uploadedBy", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin9@test.com" });
        const { token: coachToken, user: coach } = await createCoach({ email: "ref_coach9@test.com" });
        const player = await createPlayer(coachToken, { name: "Media Kid" });

        const media = await mediaFor(player._id, coach._id);

        await forceDelete(adminToken, coach._id);

        const after = await PlayerMedia.findById(media._id);
        expect(after).not.toBeNull();          // الميديا بتاعت اللاعب مش بتاعت الرافع
        expect(after.uploadedBy).toBeNull();
    });
});

// ============================================================================
// النقطة التقنية الحرجة: الـunique index.
// ============================================================================
describe("§12 — clearing refs cannot collide on the unique indexes", () => {
    it("two reports for the same player/date by two deleted authors both survive", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin10@test.com" });
        const { token: coachAToken, user: coachA } = await createCoach({ email: "ref_dupA@test.com" });
        const { user: coachB } = await createCoach({ email: "ref_dupB@test.com" });
        const player = await createPlayer(coachAToken, { name: "Dup Date Kid" });

        // نفس اللاعب، نفس تاريخ المباراة بالظبط، كاتبين مختلفين — ده مسموح
        // بالـunique index الأصلي {player, coach, matchDate}
        const matchDate = new Date("2026-03-15T00:00:00.000Z");
        const teams = await defaultTeamIds(player.ageGroup);
        const base = {
            player: player._id,
            matchDate,
            matchType: "friendly",
            homeTeam: teams.homeTeam,
            awayTeam: teams.awayTeam,
            notes: "Same match, two scouts",
            technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
            physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
            mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
        };
        await ScoutingReport.create({ ...base, coach: coachA._id });
        await ScoutingReport.create({ ...base, coach: coachB._id });

        // من غير الـpartial index التاني ده كان بيرمي duplicate key ويوقف الحذف
        await forceDelete(adminToken, coachA._id);
        await forceDelete(adminToken, coachB._id);

        const reports = await ScoutingReport.find({ player: player._id });
        expect(reports).toHaveLength(2);
        expect(reports.every((r) => r.coach === null)).toBe(true);
        expect(await User.countDocuments({ _id: coachA._id })).toBe(0);
        expect(await User.countDocuments({ _id: coachB._id })).toBe(0);
    });

    it("the unique rule still applies while the author exists", async () => {
        // audit-database D1 — المفتاح بقى {player, coach, seasonMatch} بدل
        // {player, coach, matchDate}، فالتست ده اتحدّث ليربط بمباراة حقيقية.
        // نيّته لم تتغيّر: الاستثناء الـpartial بتاع الكاتب المحذوف **مايلغيش**
        // الفرادة على التقارير اللي ليها كاتب موجود.
        const { token: coachToken, user: coach } = await createCoach({ email: "ref_still@test.com" });
        const player = await createPlayer(coachToken, { name: "Still Unique Kid" });

        const teams = await defaultTeamIds(player.ageGroup);
        const match = await setupPlayerMatchDay(player._id, teams, new Date("2026-04-20T00:00:00.000Z"));

        const doc = {
            player: player._id,
            coach: coach._id,
            matchDate: match.matchDate,
            matchType: "official",
            seasonMatch: match._id,
            homeTeam: teams.homeTeam,
            awayTeam: teams.awayTeam,
            notes: "First",
            technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
            physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
            mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
        };
        await ScoutingReport.create(doc);

        await expect(ScoutingReport.create(doc)).rejects.toThrow(/duplicate key|E11000/i);
    });

    it("two admins' evaluations of the same coach in the same month both survive", async () => {
        const { token: adminToken } = await createAdmin({ email: "ref_admin11@test.com" });
        const { user: adminA } = await createAdmin({ email: "ref_evalA@test.com" });
        const { user: adminB } = await createAdmin({ email: "ref_evalB@test.com" });
        const { user: coach } = await createCoach({ email: "ref_evaled@test.com" });

        // الموديل بيسمح بده صراحة: "كل أدمن له تقييم مستقل لنفس الكشاف في نفس الشهر"
        await CoachEvaluation.create(
            coachEvaluationPayload({ coach: coach._id, evaluator: adminA._id, year: 2026, month: 5 })
        );
        await CoachEvaluation.create(
            coachEvaluationPayload({ coach: coach._id, evaluator: adminB._id, year: 2026, month: 5 })
        );

        await forceDelete(adminToken, adminA._id);
        await forceDelete(adminToken, adminB._id);

        const evals = await CoachEvaluation.find({ coach: coach._id });
        expect(evals).toHaveLength(2);
        expect(evals.every((e) => e.evaluator === null)).toBe(true);
    });
});

// ============================================================================
describe("§12 — the cleanup cron is resilient and idempotent", () => {
    // بيعطّل يوزر ويرجّع تاريخ التعطيل لـ40 يوم عشان الكرون يشوفه
    const stage = async (userId) => {
        await User.findByIdAndUpdate(
            userId,
            { active: false, deactivatedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
            { setOptions: { bypassFilter: true } }
        ).setOptions({ bypassFilter: true });
    };

    it("cleans references through the cron path too, not just the admin route", async () => {
        const { token: coachToken, user: coach } = await createCoach({ email: "cron_coach@test.com" });
        const player = await createPlayer(coachToken, { name: "Cron Kid" });
        const media = await mediaFor(player._id, coach._id);
        const match = await matchWithAttendees([coach._id]);

        await stage(coach._id);
        const { deleted } = await runCleanupDeactivated();

        expect(deleted).toBe(1);
        expect((await PlayerMedia.findById(media._id)).uploadedBy).toBeNull();
        expect((await SeasonMatch.findById(match._id)).attendees).toHaveLength(0);
    });

    it("one failing user does not stop the others in the same run", async () => {
        const { user: bad } = await createCoach({ email: "cron_bad@test.com" });
        const { user: good } = await createCoach({ email: "cron_good@test.com" });

        // اليوزر الأول عنده صورة بطاقة، وBunny هيفشل عليها هي بس
        await User.findByIdAndUpdate(bad._id, { idCardFrontImg: "idcards/boom.jpg" });
        deleteStorageObject.mockImplementation(async (zone, key) => {
            if (key === "idcards/boom.jpg") throw new Error("Bunny is down");
            return true;
        });

        await stage(bad._id);
        await stage(good._id);

        const { deleted, skipped } = await runCleanupDeactivated();

        expect(skipped).toBe(1);
        expect(deleted).toBe(1);
        // اللي فشل لسه موجود (بايتاته لسه على Bunny فمش هنمسح مرجعها)
        expect(await User.countDocuments({ _id: bad._id }).setOptions({ bypassFilter: true })).toBe(1);
        expect(await User.countDocuments({ _id: good._id }).setOptions({ bypassFilter: true })).toBe(0);
    });

    it("re-running the cleanup on an already-cleaned user is a no-op", async () => {
        const { token: coachToken, user: coach } = await createCoach({ email: "cron_idem@test.com" });
        const player = await createPlayer(coachToken, { name: "Idem Kid" });
        const media = await mediaFor(player._id, coach._id);

        await stage(coach._id);
        await runCleanupDeactivated();

        // الدورة التانية مالقيتش حاجة، ومامسحتش حاجة بالغلط
        const second = await runCleanupDeactivated();
        expect(second.deleted).toBe(0);
        expect(second.skipped).toBe(0);
        expect(await PlayerMedia.countDocuments({ _id: media._id })).toBe(1);
        expect(await Player.countDocuments({ _id: player._id })).toBe(1);
    });
});
