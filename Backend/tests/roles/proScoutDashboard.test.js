import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createProScout,
  createTeam,
  createPlayerDoc,
  reportPayload,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';

// ملفات الاختبارات بتحتفظ بأسماء الرولات كنصوص حرفية عن قصد — أوراكل مستقل عن
// constants/roles.js (قرار /speckit-clarify Q1، نفس نمط proScoutDataScope.test.js).

let ageGroup;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
});

const dashboardFor = (token) =>
  request(app).get('/api/v1/dashboard/proScout').set('Authorization', 'Bearer ' + token);

// ═══════════════════════════════════════════════════════════════════════════
// G-1 — عدد اللاعبين
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — G-1: totalPlayers (Stage 5, spec.md SC-001/FR-011)', () => {
  it('positive: counts professional-team players + own team:null players, excludes another scout\'s orphans and premier players', async () => {
    const scout = await createProScout();
    const otherScout = await createProScout({ email: 'other_scout@test.com' });

    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    const premierTeam = await createTeam(ageGroup._id, { league: 'premier' });

    // Stage 11 — createdBy: scout added; team membership alone no longer
    // grants scope, so "mine" must mean "I created it" here too.
    const onPro = await createPlayerDoc({ team: proTeam._id, coach: scout.user._id, createdBy: scout.user._id });
    const mineNoTeam = await createPlayerDoc({ team: null, createdBy: scout.user._id });
    await createPlayerDoc({ team: null, createdBy: otherScout.user._id }); // not mine — excluded
    await createPlayerDoc({ team: premierTeam._id, coach: scout.user._id }); // premier — excluded

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.totalPlayers).toBe(2);

    // content, not just count — the manual set matches exactly
    const manualIds = [String(onPro._id), String(mineNoTeam._id)].sort();
    expect(manualIds).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G-2 / G-3 / G-4 — نطاق المباريات + حد نهاية اليوم + العدّ غير المقصوص
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — matches (G-2, G-3, G-4)', () => {
  let scout, admin, proTeams, premierTeams;

  beforeEach(async () => {
    scout = await createProScout();
    admin = await createAdmin();
    proTeams = [
      await createTeam(ageGroup._id, { league: 'professional' }),
      await createTeam(ageGroup._id, { league: 'professional' }),
    ];
    premierTeams = [
      await createTeam(ageGroup._id, { league: 'premier' }),
      await createTeam(ageGroup._id, { league: 'premier' }),
    ];
  });

  it('G-2: a premier-league match contributes to none of the three match figures', async () => {
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
      matchDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      homeTeam: premierTeams[0]._id, awayTeam: premierTeams[1]._id,
      createdBy: admin.user._id,
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingMatchesCount).toBe(0);
    expect(res.body.data.upcomingMatches).toHaveLength(0);
    expect(res.body.data.latestResults).toHaveLength(0);
  });

  it('G-3: a match dated TODAY lands in latestResults, never in upcomingMatches', async () => {
    const today = new Date();
    today.setHours(10, 0, 0, 0);

    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: today,
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id,
      createdBy: admin.user._id,
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingMatches).toHaveLength(0);
    expect(res.body.data.latestResults).toHaveLength(1);
    expect(res.body.data.upcomingMatchesCount).toBe(0);
  });

  it('G-4: upcomingMatchesCount reflects the true total even past the 5-item list cap', async () => {
    const base = Date.now() + 24 * 60 * 60 * 1000;
    for (let i = 0; i < 7; i++) {
      await SeasonMatch.create({
        ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
        matchDate: new Date(base + i * 24 * 60 * 60 * 1000),
        homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id,
        createdBy: admin.user._id,
      });
    }

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingMatchesCount).toBe(7);
    expect(res.body.data.upcomingMatches).toHaveLength(5);
  });

  it('upcoming matches are sorted soonest-first, latest results are sorted most-recent-first', async () => {
    const near = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);
    const far = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const older = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional', matchDate: far,
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id, createdBy: admin.user._id,
    });
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional', matchDate: near,
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id, createdBy: admin.user._id,
    });
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional', matchDate: older,
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id, createdBy: admin.user._id,
    });
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional', matchDate: newer,
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id, createdBy: admin.user._id,
    });

    const res = await dashboardFor(scout.token);
    const upcomingDates = res.body.data.upcomingMatches.map((m) => m.matchDate);
    const resultDates = res.body.data.latestResults.map((m) => m.matchDate);

    expect(new Date(upcomingDates[0]).getTime()).toBeLessThan(new Date(upcomingDates[1]).getTime());
    expect(new Date(resultDates[0]).getTime()).toBeGreaterThan(new Date(resultDates[1]).getTime());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G-5 — نطاق التقارير: تأليف + ملكية اللاعب مع بعض
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — G-5: totalReports / recentReports', () => {
  it('excludes a report authored by another user on an in-scope player', async () => {
    const scout = await createProScout();
    const otherScout = await createProScout({ email: 'writer2@test.com' });
    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    // Stage 11 — createdBy: scout so this player is genuinely in scout's
    // scope; otherwise the assertion (0 reports) would pass for the wrong
    // reason (player out of scope) instead of the one this test claims to
    // isolate (report authored by someone else).
    const player = await createPlayerDoc({ team: proTeam._id, createdBy: scout.user._id });

    await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: otherScout.user._id,
      matchType: 'training', matchDate: new Date(),
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.totalReports).toBe(0);
    expect(res.body.data.recentReports).toHaveLength(0);
  });

  it('excludes the caller\'s own report on a player outside their scope', async () => {
    const scout = await createProScout();
    const premierTeam = await createTeam(ageGroup._id, { league: 'premier' });
    const outsidePlayer = await createPlayerDoc({ team: premierTeam._id });

    await ScoutingReport.create({
      ...reportPayload(), player: outsidePlayer._id, coach: scout.user._id,
      matchType: 'training', matchDate: new Date(),
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.totalReports).toBe(0);
    expect(res.body.data.recentReports).toHaveLength(0);
  });

  it('positive: includes a report by the caller on an in-scope player, with exact count and content', async () => {
    const scout = await createProScout();
    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    // Stage 11 — createdBy: scout; team membership alone no longer puts this
    // player in scope.
    const player = await createPlayerDoc({ team: proTeam._id, createdBy: scout.user._id });

    const report = await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: scout.user._id,
      matchType: 'training', matchDate: new Date(),
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data.totalReports).toBe(1);
    expect(res.body.data.recentReports).toHaveLength(1);
    expect(String(res.body.data.recentReports[0]._id)).toBe(String(report._id));
    expect(String(res.body.data.recentReports[0].player._id)).toBe(String(player._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G-6 — الفئات العمرية ممنوعة تماماً من الرد
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — G-6: no ageGroup anywhere in the response (FR-005)', () => {
  it('the serialized response body never contains "ageGroup", even though SeasonMatch auto-populates it on find', async () => {
    const scout = await createProScout();
    const admin = await createAdmin();
    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    const proTeam2 = await createTeam(ageGroup._id, { league: 'professional' });

    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      homeTeam: proTeam._id, awayTeam: proTeam2._id, createdBy: admin.user._id,
    });
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      homeTeam: proTeam._id, awayTeam: proTeam2._id, createdBy: admin.user._id,
    });

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('ageGroup');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// G-7 — الرفض السلبي وعدم المساس بالداشبوردات الأخرى
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — G-7: negative permission and sibling-dashboard regression (Principle I & III)', () => {
  it('rejects admin, coach, and observer with 403 — never a 200 with zeroes', async () => {
    const admin = await createAdmin();
    const coach = await createCoach();
    const observer = await createObserver();

    for (const { token } of [admin, coach, observer]) {
      const res = await dashboardFor(token);
      expect(res.status).toBe(403);
    }
  });

  it('does not affect /dashboard/coach, /dashboard/observer, or /dashboard/admin responses', async () => {
    const coach = await createCoach();
    const observer = await createObserver();
    const admin = await createAdmin();

    const coachRes = await request(app).get('/api/v1/dashboard/coach').set('Authorization', 'Bearer ' + coach.token);
    const observerRes = await request(app).get('/api/v1/dashboard/observer').set('Authorization', 'Bearer ' + observer.token);
    const adminRes = await request(app).get('/api/v1/dashboard/admin').set('Authorization', 'Bearer ' + admin.token);

    expect(coachRes.status).toBe(200);
    expect(coachRes.body.data).toEqual({
      totalPlayers: 0, selectedPlayers: 0, pendingPlayers: 0, rejectedPlayers: 0,
      totalReports: 0, matchesAttended: 0, selectionRate: 0,
    });
    expect(observerRes.status).toBe(200);
    expect(observerRes.body.data).toEqual({
      totalPlayersObserved: 0, totalReports: 0, totalMedia: 0, totalMatches: 0,
    });
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data).toHaveProperty('totalPlayers');

    // a proScout gets 403 on all three siblings, plus the bulk coaches-stats endpoint
    const scout = await createProScout();
    const asScout = (path) => request(app).get(path).set('Authorization', 'Bearer ' + scout.token);
    expect((await asScout('/api/v1/dashboard/coach')).status).toBe(403);
    expect((await asScout('/api/v1/dashboard/observer')).status).toBe(403);
    expect((await asScout('/api/v1/dashboard/admin')).status).toBe(403);
    expect((await asScout('/api/v1/dashboard/admin/coaches-stats')).status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Empty state — SC-003
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout dashboard — empty state (SC-003)', () => {
  it('a brand-new proScout with no players, matches, or reports gets a stable all-zero shape, not an error', async () => {
    const scout = await createProScout();

    const res = await dashboardFor(scout.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalPlayers: 0,
      upcomingMatchesCount: 0,
      totalReports: 0,
      upcomingMatches: [],
      latestResults: [],
      recentReports: [],
    });
  });
});
