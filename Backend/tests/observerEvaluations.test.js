import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import Player from '../models/playedModel.js';
import ScoutingReport from '../models/scoutingReportModel.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import PlayerMedia from '../models/playerMediaModel.js';
import {
  createAdmin,
  createCoach,
  createObserver,
  createPlayer,
  createTeam,
  observerEvaluationPayload,
  seedAgeGroups,
} from './helpers/factory.js';

const BASE = '/api/v1/observerEvaluations';

const createEval = (token, observerId, overrides = {}) =>
  request(app)
    .post(BASE)
    .set('Authorization', `Bearer ${token}`)
    .send(observerEvaluationPayload({ observer: observerId, ...overrides }));

describe('Observer evaluations — create & validation', () => {
  beforeEach(seedAgeGroups);

  it('admin creates a draft — evaluator stamped, overallRating auto-averaged, status draft', async () => {
    const { token: adminToken, user: admin } = await createAdmin();
    const { user: observer } = await createObserver();

    const res = await createEval(adminToken, observer._id);
    expect(res.status).toBe(201);
    const doc = res.body.data.document;
    expect(doc.status).toBe('draft');
    expect(doc.evaluator._id ?? doc.evaluator).toBe(admin._id.toString());
    // avg of all 11 metrics in the default payload (87 / 11 = 7.91)
    expect(doc.overallRating).toBeCloseTo(7.91, 1);
    expect(doc.publishedAt == null).toBe(true);
  });

  it('observer cannot create an evaluation (403)', async () => {
    const { token: observerToken, user: observer } = await createObserver();
    const res = await createEval(observerToken, observer._id);
    expect(res.status).toBe(403);
  });

  it('same admin cannot create two evaluations for the same observer/month (400)', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();

    expect((await createEval(adminToken, observer._id)).status).toBe(201);
    const dup = await createEval(adminToken, observer._id);
    expect(dup.status).toBe(400);
  });

  it('rejects invalid rating, bad month, and non-observer target', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const { user: coach } = await createCoach();

    const badRating = await createEval(adminToken, observer._id, {
      scouting: { talentIdentification: 11, matchAnalysis: 7, reportAccuracy: 9 },
    });
    expect(badRating.status).toBe(400);

    const badMonth = await createEval(adminToken, observer._id, { month: 13 });
    expect(badMonth.status).toBe(400);

    const notObserver = await createEval(adminToken, coach._id);
    expect(notObserver.status).toBe(400);
  });

  it('ignores/rejects client-set status, evaluator, overallRating, stats', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const res = await createEval(adminToken, observer._id, {
      status: 'published',
      overallRating: 10,
    });
    expect(res.status).toBe(400);
  });
});

describe('Observer evaluations — per-admin independence & edit-own-only', () => {
  beforeEach(seedAgeGroups);

  it('two different admins can each evaluate the same observer/month', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: observer } = await createObserver();

    expect((await createEval(a1, observer._id)).status).toBe(201);
    expect((await createEval(a2, observer._id)).status).toBe(201);
  });

  it('an admin cannot edit/publish/delete another admin\'s evaluation but can view it', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: observer } = await createObserver();

    const created = await createEval(a1, observer._id);
    const id = created.body.data.document._id;

    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(200);

    const edit = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${a2}`)
      .send({ notes: 'hijack' });
    expect(edit.status).toBe(403);

    const pub = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a2}`);
    expect(pub.status).toBe(403);

    const del = await request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(del.status).toBe(403);
  });
});

describe('Observer evaluations — draft/publish/archive lifecycle', () => {
  beforeEach(seedAgeGroups);

  it('draft is invisible to the observer; publish reveals it; archive hides it again', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: observerToken, user: observer } = await createObserver();

    const created = await createEval(adminToken, observer._id);
    const id = created.body.data.document._id;

    // draft: observer list empty, direct get forbidden
    let obsList = await request(app).get(BASE).set('Authorization', `Bearer ${observerToken}`);
    expect(obsList.body.data.documents.length).toBe(0);
    const draftGet = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${observerToken}`);
    expect(draftGet.status).toBe(403);

    // publish
    const pub = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.document.status).toBe('published');
    expect(pub.body.data.document.publishedAt).toBeTruthy();

    // observer now sees it
    obsList = await request(app).get(BASE).set('Authorization', `Bearer ${observerToken}`);
    expect(obsList.body.data.documents.some((d) => d._id === id)).toBe(true);
    const okGet = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${observerToken}`);
    expect(okGet.status).toBe(200);

    // publish is idempotent
    const pub2 = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    expect(pub2.status).toBe(200);

    // archive
    const arch = await request(app).patch(`${BASE}/${id}/archive`).set('Authorization', `Bearer ${adminToken}`);
    expect(arch.status).toBe(200);
    obsList = await request(app).get(BASE).set('Authorization', `Bearer ${observerToken}`);
    expect(obsList.body.data.documents.length).toBe(0);
  });

  it('observer sees published evaluations from two different admins', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { token: observerToken, user: observer } = await createObserver();

    const e1 = (await createEval(a1, observer._id)).body.data.document._id;
    const e2 = (await createEval(a2, observer._id)).body.data.document._id;
    await request(app).patch(`${BASE}/${e1}/publish`).set('Authorization', `Bearer ${a1}`);
    await request(app).patch(`${BASE}/${e2}/publish`).set('Authorization', `Bearer ${a2}`);

    const list = await request(app).get(BASE).set('Authorization', `Bearer ${observerToken}`);
    expect(list.body.data.documents.length).toBe(2);
  });
});

describe('Observer evaluations — update & delete', () => {
  beforeEach(seedAgeGroups);

  it('update recomputes overallRating; delete removes it', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const created = await createEval(adminToken, observer._id);
    const id = created.body.data.document._id;

    const upd = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ 'scouting.talentIdentification': 10 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.document.overallRating).not.toBe(created.body.data.document.overallRating);

    const del = await request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const gone = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(gone.status).toBe(404);
  });

  it('a published evaluation can no longer be edited, even by its own admin', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const created = await createEval(adminToken, observer._id);
    const id = created.body.data.document._id;

    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);

    const edit = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'too late' });
    expect(edit.status).toBe(400);
  });
});

describe('Observer evaluations — auto-captured stats', () => {
  beforeEach(seedAgeGroups);

  it('captures the observer\'s existing reports/matches/media/players-observed for the month', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { token: observerToken, user: observer } = await createObserver();

    const p1 = await createPlayer(coachToken);
    await Player.findByIdAndUpdate(p1._id, { observers: [observer._id] });

    const player = await Player.findById(p1._id).select('ageGroup');
    const home = await createTeam(player.ageGroup);
    const away = await createTeam(player.ageGroup);

    // one report this month by the observer
    await ScoutingReport.create({
      player: p1._id,
      coach: observer._id,
      matchDate: new Date(),
      homeTeam: home._id,
      awayTeam: away._id,
      technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
      physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
      mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
    });

    // one attended match this month
    await SeasonMatch.create({
      ageGroup: player.ageGroup,
      season: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      matchDate: new Date(),
      homeTeam: home._id,
      awayTeam: away._id,
      attendees: [observer._id],
      createdBy: observer._id,
    });

    // one media uploaded this month
    await PlayerMedia.create({
      player: p1._id,
      uploadedBy: observer._id,
      type: 'image',
      storage: 'bunny',
      storageKey: 'player-media/y.jpg',
      status: 'ready',
    });

    const res = await createEval(adminToken, observer._id);
    expect(res.status).toBe(201);
    const stats = res.body.data.document.stats;
    expect(stats.reportsCount).toBe(1);
    expect(stats.matchesAttended).toBe(1);
    expect(stats.mediaCount).toBe(1);
    expect(stats.playersObserved).toBe(1);
    expect(stats.capturedAt).toBeTruthy();
  });
});

describe('Observer evaluations — summary', () => {
  beforeEach(seedAgeGroups);

  it('summary counts published evaluations only', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();

    const id = (await createEval(adminToken, observer._id)).body.data.document._id;

    // draft → summary empty
    let sum = await request(app).get(`${BASE}/summary?observer=${observer._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(sum.status).toBe(200);
    expect(sum.body.data.count).toBe(0);

    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    sum = await request(app).get(`${BASE}/summary?observer=${observer._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(sum.body.data.count).toBe(1);
    expect(sum.body.data.averageOverall).toBeGreaterThan(0);
  });
});
