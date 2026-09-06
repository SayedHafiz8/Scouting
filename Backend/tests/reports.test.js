import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import { createAdmin, createCoach, createObserver, createPlayer, createReport, createTeam, defaultTeamIds, reportPayload, seedAgeGroups, setupPlayerMatchDay } from './helpers/factory.js';

// reportPayload() plus fresh Team ids matching the player's age group — also sets up the player's
// team + today's SeasonMatch (the report links to it)
async function payloadFor(player, overrides = {}) {
  const teamIds = overrides.homeTeam && overrides.awayTeam
    ? { homeTeam: overrides.homeTeam, awayTeam: overrides.awayTeam }
    : await defaultTeamIds(player.ageGroup);
  await setupPlayerMatchDay(player._id, teamIds);
  return reportPayload({ ...teamIds, ...overrides });
}

// ══════════════════════════════════════════════════════════════════════════════
//  Observer reports — authored by an observer, visible only to that observer + admin
// ══════════════════════════════════════════════════════════════════════════════
describe('Observer reports isolation', () => {
  beforeEach(seedAgeGroups);

  async function assignObserved(adminToken, playerId, observerId) {
    return request(app)
      .patch(`/api/v1/players/${playerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observerId] });
  }

  it('observer can create a report for an assigned player, hidden from the coach', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);
    await assignObserved(adminToken, player._id, observer._id);

    // observer creates a report
    const created = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send(await payloadFor(player));
    expect(created.status).toBe(201);
    const reportId = created.body.data.document._id;

    // observer sees their own report
    const obsList = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(obsList.body.data.documents.some(r => r._id === reportId)).toBe(true);

    // coach does NOT see the observer's report
    const coachList = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(coachList.body.data.documents.some(r => r._id === reportId)).toBe(false);

    // admin sees it
    const adminList = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body.data.documents.some(r => r._id === reportId)).toBe(true);

    // coach cannot open it directly
    const coachGet = await request(app)
      .get(`/api/v1/players/${player._id}/reports/${reportId}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(coachGet.status).toBe(403);
  });

  it('a coach report is hidden from the observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);
    await assignObserved(adminToken, player._id, observer._id);

    const report = await createReport(coachToken, player._id);

    const obsList = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(obsList.body.data.documents.some(r => r._id === report._id)).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/players/:playerId/reports  — create scouting report
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/players/:playerId/reports', () => {
  beforeEach(seedAgeGroups);

  it('coach creates a report for own player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(await payloadFor(player));

    expect(res.status).toBe(201);
    expect(res.body.data.document.player).toBeDefined();
    expect(res.body.data.document.overallRating).toBeDefined();
  });

  it('auto-calculates overallRating as average of all 12 metrics', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const payload = await payloadFor(player, {
      technical: { passing: 8, dribbling: 6, shooting: 7, ballControl: 9 },
      physical:  { speed: 8, stamina: 7, strength: 6, agility: 9 },
      mental:    { positioning: 7, decisionMaking: 8, teamwork: 6, attitude: 9 },
    });

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(res.status).toBe(201);
    const allScores = [8,6,7,9, 8,7,6,9, 7,8,6,9];
    const expected = parseFloat((allScores.reduce((a,b)=>a+b,0) / 12).toFixed(2));
    expect(res.body.data.document.overallRating).toBe(expected);
  });

  it('coach cannot create a report for another coach\'s player', async () => {
    const { token: coach1 } = await createCoach();
    const { token: coach2 } = await createCoach();
    const player = await createPlayer(coach1);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${coach2}`)
      .send(await payloadFor(player));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a client-supplied matchDate (date is server-controlled)', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(await payloadFor(player, { matchDate: '2024-05-10' }));

    expect(res.status).toBe(400);
  });

  it('sets matchDate to the report creation date automatically', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const before = Date.now();
    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(await payloadFor(player));
    const after = Date.now();

    expect(res.status).toBe(201);
    const created = new Date(res.body.data.document.matchDate).getTime();
    expect(created).toBeGreaterThanOrEqual(before - 1000);
    expect(created).toBeLessThanOrEqual(after + 1000);
  });

  it('returns 400 for rating below minimum (0)', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(await payloadFor(player, {
        technical: { passing: 0, dribbling: 7, shooting: 6, ballControl: 8 },
      }));

    expect(res.status).toBe(400);
  });

  it('returns 400 for rating above maximum (11)', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(await payloadFor(player, {
        technical: { passing: 11, dribbling: 7, shooting: 6, ballControl: 8 },
      }));

    expect(res.status).toBe(400);
  });

  // admin-assign-players-reports-media — deliberate behavior change: the admin
  // can now file a report on any player it can already read (checkPlayerOwnership
  // short-circuits admin the same way it always has for GET). Full positive/
  // negative coverage — including that an admin still cannot PATCH someone
  // else's report — lives in tests/roles/adminReportMediaAuthoring.test.js.
  it('admin can create a report — author is the admin itself', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken, user: admin } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(await payloadFor(player));

    expect(res.status).toBe(201);
    expect(res.body.data.document.coach._id).toBe(admin._id.toString());
  });

  it('returns 400 when technical fields are missing', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const { technical: _, ...rest } = await payloadFor(player);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(rest);

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/:playerId/reports  — list reports
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/:playerId/reports', () => {
  beforeEach(seedAgeGroups);

  it('coach can get reports for their own player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    await createReport(token, player._id);
    await createReport(token, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
  });

  it('admin can get reports for any player', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);
    await createReport(coachToken, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
  });

  it('coach cannot get reports for another coach\'s player', async () => {
    const { token: coach1 } = await createCoach();
    const { token: coach2 } = await createCoach();
    const player = await createPlayer(coach1);
    await createReport(coach1, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${coach2}`);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/:playerId/reports/:id  — get single report
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/:playerId/reports/:id', () => {
  beforeEach(seedAgeGroups);

  it('coach can get specific report for their player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const report = await createReport(token, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.document._id).toBe(report._id);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/players/:playerId/reports/:id  — update report
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/players/:playerId/reports/:id', () => {
  beforeEach(seedAgeGroups);

  it('coach can update their own report', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const report = await createReport(token, player._id);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Updated notes' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.notes).toBe('Updated notes');
  });

  it('recalculates overallRating when ratings are updated', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const report = await createReport(token, player._id);

    const originalRating = report.overallRating;

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ technical: { passing: 10, dribbling: 10, shooting: 10, ballControl: 10 } });

    expect(res.status).toBe(200);
    expect(res.body.data.document.overallRating).not.toBe(originalRating);
  });

  it('coach cannot update another coach\'s report', async () => {
    const { token: coach1 } = await createCoach();
    const { token: coach2 } = await createCoach();
    const player = await createPlayer(coach1);
    const report = await createReport(coach1, player._id);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${coach2}`)
      .send({ notes: 'Hacked' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  DELETE /api/v1/players/:playerId/reports/:id  — admin-only delete
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/v1/players/:playerId/reports/:id', () => {
  beforeEach(seedAgeGroups);

  it('admin can delete a report', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);
    const report = await createReport(coachToken, player._id);

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204); // deleteOne returns 204 No Content
  });

  it('coach cannot delete a report', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const report = await createReport(token, player._id);

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/:playerId/reports/statistics
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/:playerId/reports/statistics', () => {
  beforeEach(seedAgeGroups);

  it('returns player statistics for coach', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    await createReport(token, player._id);
    await createReport(token, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports/statistics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  // لاعب جديد لسه ملوش تقارير — حالة طبيعية، مش خطأ. لازم ترجع 200 بإحصائيات
  // فاضية بدل 404 (كانت قبل كده بترجع 404 وبتطلّع toast خطأ في الفرونت)
  it('returns 200 with zeroed statistics for a player with no reports yet', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports/statistics`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statistics).toMatchObject({
      totalReports: 0,
      lastReport: null,
      overallRating: 0,
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Linking a report to a SeasonMatch
// ══════════════════════════════════════════════════════════════════════════════
describe('Report linked to a SeasonMatch', () => {
  beforeEach(seedAgeGroups);

  it('auto-fills homeTeam/awayTeam/matchDate from the linked seasonMatch (today, player\'s own team)', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const home = await createTeam(player.ageGroup, { name: 'home_team' });
    const away = await createTeam(player.ageGroup, { name: 'away_team' });
    // إحنا هنا بنستخدم seasonMatch متبعت من العميل يدوي — لكن enforceMatchDayForRegisteredTeam
    // بيتجاهله ويحط مباراة النهارده الحقيقية بتاعت فريق اللاعب لوحده، فمفيش فرق في النتيجة
    // لأن المباراة اللي هيلاقيها هي نفسها دي بالظبط
    const match = await setupPlayerMatchDay(player._id, { homeTeam: home._id.toString(), awayTeam: away._id.toString() });

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...reportPayload(), seasonMatch: match._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.document.homeTeam.name).toBe('home_team');
    expect(res.body.data.document.awayTeam.name).toBe('away_team');
    expect(new Date(res.body.data.document.matchDate).getTime()).toBe(match.matchDate.getTime());
  });

  // اللاعب هنا من غير فريق مسجل — عشان enforceMatchDayForRegisteredTeam ميستبدلش
  // الـ seasonMatch اللي بعتناه يدوي بمباراة تانية، وده اللي بيسمحلنا نختبر
  // seasonMatchBelongsToPlayerAgeGroup الأصلية
  it('rejects a seasonMatch from a different age group (400)', async () => {
    const { token } = await createCoach();
    const { user: admin } = await createAdmin();
    const player = await createPlayer(token);

    const AgeGroup = (await import('../models/ageGroupModel.js')).default;
    const otherAgeGroup = await AgeGroup.findOne({ _id: { $ne: player.ageGroup } });
    const home = await createTeam(otherAgeGroup._id);
    const away = await createTeam(otherAgeGroup._id);
    const match = await SeasonMatch.create({
      ageGroup: otherAgeGroup._id,
      season: '2026/2027',
      matchDate: new Date(),
      homeTeam: home._id,
      awayTeam: away._id,
      createdBy: admin._id,
    });

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...reportPayload(), seasonMatch: match._id.toString() });

    expect(res.status).toBe(400);
  });

  // برضه من غير فريق مسجل — عشان القيد يفضل: لازم homeTeam/awayTeam أو seasonMatch
  it('still requires homeTeam/awayTeam when no seasonMatch is given', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload());

    expect(res.status).toBe(400);
  });

  // اللاعب متسجل في فريق لكن مفيش مباراة النهارده بتاعته — لازم يترفض
  it('rejects report creation for a player with a registered team when the team has no match today', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const teamIds = await defaultTeamIds(player.ageGroup);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await setupPlayerMatchDay(player._id, teamIds, yesterday);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload(teamIds));

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  matchType: training / friendly / free-text team names
// ══════════════════════════════════════════════════════════════════════════════
describe('Report matchType (training / friendly) and free-text teams', () => {
  beforeEach(seedAgeGroups);

  it('training report needs no team info at all, even when the team has no match today', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const teamIds = await defaultTeamIds(player.ageGroup);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await setupPlayerMatchDay(player._id, teamIds, yesterday);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload({ matchType: 'training' }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.matchType).toBe('training');
    expect(res.body.data.document.homeTeam).toBeFalsy();
    expect(res.body.data.document.awayTeam).toBeFalsy();
  });

  it('friendly report auto-fills the player\'s own registered team as homeTeam and accepts a free-text opponent', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const teamIds = await defaultTeamIds(player.ageGroup);
    await setupPlayerMatchDay(player._id, teamIds); // registers the player's team, no bearing on friendly's date

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload({ matchType: 'friendly', awayTeamName: 'Unregistered Youth FC' }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.matchType).toBe('friendly');
    expect(res.body.data.document.homeTeam._id).toBe(teamIds.homeTeam);
    expect(res.body.data.document.awayTeamName).toBe('Unregistered Youth FC');
  });

  it('friendly report requires an opponent (team or free-text name)', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const teamIds = await defaultTeamIds(player.ageGroup);
    await setupPlayerMatchDay(player._id, teamIds);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload({ matchType: 'friendly' }));

    expect(res.status).toBe(400);
  });

  it('a player with no registered team can submit a report with free-text team names', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${token}`)
      .send(reportPayload({ homeTeam: undefined, awayTeam: undefined, homeTeamName: 'Local Club A', awayTeamName: 'Local Club B' }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.homeTeamName).toBe('Local Club A');
    expect(res.body.data.document.awayTeamName).toBe('Local Club B');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Admin filters reports by author role (coach vs observer)
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/:playerId/reports?authorRole=', () => {
  beforeEach(seedAgeGroups);

  async function assignObserved(adminToken, playerId, observerId) {
    return request(app)
      .patch(`/api/v1/players/${playerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observerId] });
  }

  it('admin sees only coach reports with authorRole=coach', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);
    await assignObserved(adminToken, player._id, observer._id);

    const coachReport = await createReport(coachToken, player._id);
    const obsReport = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send(await payloadFor(player));

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports?authorRole=coach`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.documents.map((r) => r._id);
    expect(ids).toContain(coachReport._id);
    expect(ids).not.toContain(obsReport.body.data.document._id);
  });

  it('admin sees only observer reports with authorRole=observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);
    await assignObserved(adminToken, player._id, observer._id);

    const coachReport = await createReport(coachToken, player._id);
    const obsReport = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set('Authorization', `Bearer ${observerToken}`)
      .send(await payloadFor(player));

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports?authorRole=observer`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.documents.map((r) => r._id);
    expect(ids).toContain(obsReport.body.data.document._id);
    expect(ids).not.toContain(coachReport._id);
  });

  it('rejects an invalid authorRole (400)', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports?authorRole=admin`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/reports/average-ratings — batched averages for player-list cards
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/reports/average-ratings', () => {
  beforeEach(seedAgeGroups);

  it('returns the average overallRating per player id', async () => {
    const { token } = await createCoach();
    const playerA = await createPlayer(token);
    const playerB = await createPlayer(token);

    await createReport(token, playerA._id, { technical: { passing: 10, dribbling: 10, shooting: 10, ballControl: 10 } });
    await createReport(token, playerA._id, { technical: { passing: 6, dribbling: 6, shooting: 6, ballControl: 6 } });
    await createReport(token, playerB._id);

    const res = await request(app)
      .get(`/api/v1/players/reports/average-ratings?ids=${playerA._id},${playerB._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.averages[playerA._id].totalReports).toBe(2);
    expect(res.body.data.averages[playerB._id].totalReports).toBe(1);
  });

  it('omits players with no reports at all', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .get(`/api/v1/players/reports/average-ratings?ids=${player._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.averages[player._id]).toBeUndefined();
  });

  it('non-admin only averages their own authored reports', async () => {
    const { token: coachToken } = await createCoach();
    const { token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);

    await createReport(coachToken, player._id);

    const res = await request(app)
      .get(`/api/v1/players/reports/average-ratings?ids=${player._id}`)
      .set('Authorization', `Bearer ${observerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.averages[player._id]).toBeUndefined();
  });

  it('returns an empty object when no ids are given', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.averages).toEqual({});
  });
});
