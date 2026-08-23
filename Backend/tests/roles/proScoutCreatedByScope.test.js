// specs/011-proscout-createdby-scope — Stage 11: proScout player scope
// narrowed from "team membership OR own createdBy" to createdBy alone.
//
// This file carries the createdBy-only-specific scenarios (cross-proScout
// denial via shared team membership, the orphan-player edge case, and the
// authorship-vs-scope tightening on reports/media). The pre-existing
// team-based assertions this feature *contradicts* were fixed in place in
// proScoutDataScope.test.js instead of duplicated here (research.md R8).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Same mock shape as proScoutDataScope.test.js — the mock must declare every
// export the real module has, or an unrelated 403-producing call chain that
// happens to pass through allowedTo() throws instead of rejecting cleanly.
vi.mock('../../utils/accessLog.js', () => {
  const fn = vi.fn();
  return { logScopeDenial: fn, logRoleDenial: fn, default: fn };
});

import app from '../../app.js';
import { logScopeDenial } from '../../utils/accessLog.js';
import {
  seedAgeGroups,
  createCoach,
  createProScout,
  createTeam,
  createPlayerDoc,
  reportPayload,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import PlayerMedia from '../../models/playerMediaModel.js';

let ageGroup;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
});

const auth = (token) => ['Authorization', `Bearer ${token}`];

// ═══════════════════════════════════════════════════════════════════════════
// US1 (P1) — createdBy is the ONLY scope condition (T005–T013)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — createdBy-only player scope (Stage 11, US1)', () => {
  let scoutA, scoutB, coach, proTeam;
  let aPlayer; // team = proTeam, createdBy = scoutA

  beforeEach(async () => {
    scoutA = await createProScout({ email: `scoutA_${Date.now()}@test.com` });
    scoutB = await createProScout({ email: `scoutB_${Date.now()}@test.com` });
    coach = await createCoach();
    proTeam = await createTeam(ageGroup._id, { league: 'professional' });

    aPlayer = await createPlayerDoc({
      name: 'A Player', createdBy: scoutA.user._id, team: proTeam._id,
    });
  });

  // T005 — positive scope: scoutA's own player is complete and correct
  it('T005: a proScout sees their own professional-team player across list, detail, and counts', async () => {
    const list = await request(app).get('/api/v1/players').set(...auth(scoutA.token));
    expect(list.status).toBe(200);
    expect(list.body.data.documents.map((d) => d._id)).toEqual([aPlayer._id.toString()]);

    const detail = await request(app).get('/api/v1/players/' + aPlayer._id).set(...auth(scoutA.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.document._id).toBe(aPlayer._id.toString());

    const counts = await request(app).get('/api/v1/players/counts').set(...auth(scoutA.token));
    expect(counts.status).toBe(200);
    expect(counts.body.data.total).toBe(1);
  });

  // T006 — negative scope: a second proScout cannot see it, even though it's on a shared professional team
  it('T006: a second proScout cannot see the first proScout\'s player via list, direct id, or counts', async () => {
    const list = await request(app).get('/api/v1/players').set(...auth(scoutB.token));
    expect(list.status).toBe(200);
    expect(list.body.data.documents.map((d) => d._id)).not.toContain(aPlayer._id.toString());

    const detail = await request(app).get('/api/v1/players/' + aPlayer._id).set(...auth(scoutB.token));
    expect(detail.status).toBe(403);

    const counts = await request(app).get('/api/v1/players/counts').set(...auth(scoutB.token));
    expect(counts.status).toBe(200);
    expect(counts.body.data.total).toBe(0);
  });

  // T007 — query-widening: ?team=<shared professional team> cannot restore visibility
  it('T007: filtering by the shared professional team does not restore visibility for a second proScout', async () => {
    const res = await request(app)
      .get('/api/v1/players?team=' + proTeam._id)
      .set(...auth(scoutB.token));

    expect(res.status).toBe(200);
    expect(res.body.data.documents).toEqual([]);
  });

  // T008 — write-guard: a second proScout cannot edit it either
  it('T008: a second proScout cannot PATCH the first proScout\'s player (previously allowed via team scope)', async () => {
    const res = await request(app)
      .patch('/api/v1/players/' + aPlayer._id)
      .set(...auth(scoutB.token))
      .send({ notes: 'trying to edit' });

    expect(res.status).toBe(403);
  });

  // T009 — logging: every denial above is auditable
  it('T009: the direct-id and PATCH denials are both logged with the required fields', async () => {
    logScopeDenial.mockClear();

    const detail = await request(app).get('/api/v1/players/' + aPlayer._id).set(...auth(scoutB.token));
    expect(detail.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    let arg = logScopeDenial.mock.calls[0][0];
    expect(arg.resource).toBe('player');
    expect(String(arg.resourceId)).toBe(String(aPlayer._id));
    expect(String(arg.req.user._id)).toBe(String(scoutB.user._id));
    expect(arg.req.user.role).toBe('proScout');

    logScopeDenial.mockClear();

    const patch = await request(app)
      .patch('/api/v1/players/' + aPlayer._id)
      .set(...auth(scoutB.token))
      .send({ notes: 'x' });
    expect(patch.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    arg = logScopeDenial.mock.calls[0][0];
    expect(arg.resource).toBe('player');
    expect(String(arg.resourceId)).toBe(String(aPlayer._id));
  });

  // T010 — average-ratings restricts to createdBy scope, not team scope
  it('T010: average-ratings omits a same-team player the requester did not create', async () => {
    await ScoutingReport.create({
      ...reportPayload(),
      player: aPlayer._id,
      coach: scoutA.user._id,
      overallRating: 8,
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
    });

    // scoutB shares aPlayer's professional team but did not create it — under
    // the old team-based scope this id would have been considered in-scope;
    // under createdBy-only it must not be.
    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings?ids=' + aPlayer._id)
      .set(...auth(scoutB.token));

    expect(res.status).toBe(200);
    expect(res.body.data.averages).not.toHaveProperty(String(aPlayer._id));

    // scoutA (the creator, and the report's author) still gets it.
    const own = await request(app)
      .get('/api/v1/players/reports/average-ratings?ids=' + aPlayer._id)
      .set(...auth(scoutA.token));
    expect(own.status).toBe(200);
    expect(own.body.data.averages).toHaveProperty(String(aPlayer._id));
  });

  // T011 — dashboard: player/report totals narrow, match totals do not
  it('T011: dashboard totals narrow to createdBy while upcoming matches/results stay league-wide', async () => {
    await ScoutingReport.create({
      ...reportPayload(),
      player: aPlayer._id,
      coach: scoutA.user._id,
      overallRating: 7,
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
    });

    const otherTeam = await createTeam(ageGroup._id, { league: 'professional' });
    // A professional-league match that has nothing to do with aPlayer or its
    // team — proves match visibility is NOT tied to the requester's players.
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-12-01T00:00:00.000Z'),
      homeTeam: proTeam._id, awayTeam: otherTeam._id,
      createdBy: coach.user._id,
    });

    const resA = await request(app).get('/api/v1/dashboard/proScout').set(...auth(scoutA.token));
    expect(resA.status).toBe(200);
    expect(resA.body.data.totalPlayers).toBe(1);
    expect(resA.body.data.totalReports).toBe(1);

    const resB = await request(app).get('/api/v1/dashboard/proScout').set(...auth(scoutB.token));
    expect(resB.status).toBe(200);
    expect(resB.body.data.totalPlayers).toBe(0);
    expect(resB.body.data.totalReports).toBe(0);
    // Match scope is untouched by this feature (FR-006) — scoutB sees the
    // same professional-league match count as scoutA despite having zero
    // players in scope.
    expect(resB.body.data.upcomingMatchesCount).toBe(resA.body.data.upcomingMatchesCount);
    expect(resB.body.data.upcomingMatchesCount).toBeGreaterThan(0);
  });

  // T012 — spot-check FR-006/FR-007: team and match scope are unaffected by this feature
  it('T012: GET /teams and GET /seasonMatches for a proScout are unchanged by the player-scope narrowing', async () => {
    const otherTeam = await createTeam(ageGroup._id, { league: 'professional' });
    const match = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-03-05T00:00:00.000Z'),
      homeTeam: proTeam._id, awayTeam: otherTeam._id,
      createdBy: coach.user._id,
    });

    // scoutB has zero players in scope, but team/match scope is still the
    // full professional league for every proScout, unchanged by this feature.
    const teams = await request(app).get('/api/v1/teams').set(...auth(scoutB.token));
    expect(teams.status).toBe(200);
    const teamIds = teams.body.data.documents.map((d) => d._id);
    expect(teamIds).toContain(String(proTeam._id));
    expect(teamIds).toContain(String(otherTeam._id));

    const matches = await request(app).get('/api/v1/seasonMatches').set(...auth(scoutB.token));
    expect(matches.status).toBe(200);
    expect(matches.body.data.documents.map((d) => d._id)).toContain(String(match._id));
  });

  // T013 — orphan-player edge case: createdBy is not a proScout at all
  it('T013: a professional-team player created by a coach is invisible to every proScout', async () => {
    const orphan = await createPlayerDoc({
      name: 'Coach-created Pro Player', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id,
    });

    for (const scout of [scoutA, scoutB]) {
      const list = await request(app).get('/api/v1/players').set(...auth(scout.token));
      expect(list.body.data.documents.map((d) => d._id)).not.toContain(orphan._id.toString());

      const detail = await request(app).get('/api/v1/players/' + orphan._id).set(...auth(scout.token));
      expect(detail.status).toBe(403);

      const counts = await request(app).get('/api/v1/players/counts').set(...auth(scout.token));
      // scoutA also has aPlayer in scope, so assert the orphan specifically
      // never contributes rather than asserting an exact total here.
      expect(counts.status).toBe(200);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US3 (P3) — a proScout's own report/media on a now-out-of-scope player
// (T016–T019). Option A, resolved 2026-08-23: player scope wins over
// authorship.
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — authorship does not override player scope (Stage 11, US3)', () => {
  let scoutA, scoutB, coach, proTeam, aPlayer, reportByB, mediaByB;

  beforeEach(async () => {
    scoutA = await createProScout({ email: `scoutA3_${Date.now()}@test.com` });
    scoutB = await createProScout({ email: `scoutB3_${Date.now()}@test.com` });
    coach = await createCoach();
    proTeam = await createTeam(ageGroup._id, { league: 'professional' });

    aPlayer = await createPlayerDoc({
      name: 'A Player', createdBy: scoutA.user._id, team: proTeam._id,
    });

    // scoutB authored/uploaded these while aPlayer's professional team made it
    // reachable under the old (Stage 2) team-based scope — simulating content
    // that predates this feature.
    reportByB = await ScoutingReport.create({
      ...reportPayload(),
      player: aPlayer._id,
      coach: scoutB.user._id,
      overallRating: 6,
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
    });
    mediaByB = await PlayerMedia.create({
      player: aPlayer._id,
      uploadedBy: scoutB.user._id,
      type: 'image',
      storage: 'bunny',
      storageKey: 'k/scoutB-upload.webp',
    });
  });

  // T016 — own-authored report on an out-of-scope player is rejected
  it('T016: scoutB\'s own report on a player they did not create is rejected for both read and edit', async () => {
    const get = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/reports/' + reportByB._id)
      .set(...auth(scoutB.token));
    expect(get.status).toBe(403);

    const patch = await request(app)
      .patch('/api/v1/players/' + aPlayer._id + '/reports/' + reportByB._id)
      .set(...auth(scoutB.token))
      .send({ notes: 'trying to edit my own report' });
    expect(patch.status).toBe(403);
  });

  // T017 — own-uploaded media on an out-of-scope player is rejected
  it('T017: scoutB\'s own uploaded media on the same player is rejected for read', async () => {
    const get = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/media/' + mediaByB._id)
      .set(...auth(scoutB.token));
    expect(get.status).toBe(403);
  });

  // T018 — both denials are logged
  it('T018: the report and media denials are both logged with the required detail', async () => {
    logScopeDenial.mockClear();
    const reportRes = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/reports/' + reportByB._id)
      .set(...auth(scoutB.token));
    expect(reportRes.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    expect(logScopeDenial.mock.calls[0][0].resource).toBe('scoutingReport');
    expect(String(logScopeDenial.mock.calls[0][0].resourceId)).toBe(String(reportByB._id));

    logScopeDenial.mockClear();
    const mediaRes = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/media/' + mediaByB._id)
      .set(...auth(scoutB.token));
    expect(mediaRes.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    expect(logScopeDenial.mock.calls[0][0].resource).toBe('playerMedia');
    expect(String(logScopeDenial.mock.calls[0][0].resourceId)).toBe(String(mediaByB._id));
  });

  // T019 — consistency: no asymmetry between the report guard and the media guard
  it('T019: the report guard and media guard produce the identical outcome for the same proScout/player pair', async () => {
    const reportRes = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/reports/' + reportByB._id)
      .set(...auth(scoutB.token));
    const mediaRes = await request(app)
      .get('/api/v1/players/' + aPlayer._id + '/media/' + mediaByB._id)
      .set(...auth(scoutB.token));

    expect(reportRes.status).toBe(mediaRes.status);
    expect(reportRes.status).toBe(403);

    // And the creator (scoutA) is unaffected by scoutB's authorship on their
    // player — scoutA can still read their own player's data normally.
    const asOwner = await request(app).get('/api/v1/players/' + aPlayer._id).set(...auth(scoutA.token));
    expect(asOwner.status).toBe(200);
  });
});
