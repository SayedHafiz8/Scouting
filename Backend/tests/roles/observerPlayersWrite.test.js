import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// نفس نمط proScoutPlayersWrite.test.js — spy على طبقة تسجيل الرفض (Principle IV).
vi.mock('../../utils/accessLog.js', () => {
  const fn = vi.fn();
  return { logScopeDenial: fn, logRoleDenial: fn, default: fn };
});

import app from '../../app.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createProScout,
  createTeam,
  createPlayerDoc,
  playerPayload,
  dobForAge,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';

// ملفات الاختبارات بتحتفظ بأسماء الرولات كنصوص حرفية عن قصد — نفس قرار proScoutPlayersWrite.test.js.

const auth = (token) => ['Authorization', `Bearer ${token}`];

let ageGroup;
let admin, coach, observer, otherObserver, scout;
let proTeam, premierTeam;

beforeEach(async () => {
  vi.clearAllMocks();
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();

  proTeam = await createTeam(ageGroup._id, { league: 'professional' });
  premierTeam = await createTeam(ageGroup._id, { league: 'premier' });

  admin = await createAdmin();
  coach = await createCoach();
  observer = await createObserver({ email: `obs_a_${Date.now()}@test.com` });
  otherObserver = await createObserver({ email: `obs_b_${Date.now()}@test.com` });
  scout = await createProScout();
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /players — creation, ownership stamping, isProfessional derivation
// ═══════════════════════════════════════════════════════════════════════════
describe('POST /players — observer creation', () => {
  it('creates a youth player: no coach, createdBy + observers stamped, ageGroup derived, isProfessional false', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    expect(res.status).toBe(201);
    const doc = res.body.data.document;
    expect(doc.coach).toBeFalsy();
    expect(String(doc.createdBy)).toBe(String(observer.user._id));
    expect(doc.observers.map(String)).toEqual([String(observer.user._id)]);
    expect(doc.isProfessional).toBe(false);
    expect(doc.ageGroup).toBeTruthy();
  });

  it('creates a professional player when given a professional-league team: no ageGroup, isProfessional true, adult birth year accepted', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(25), team: proTeam._id.toString() }));

    expect(res.status).toBe(201);
    const doc = res.body.data.document;
    expect(doc.isProfessional).toBe(true);
    expect(doc.ageGroup).toBeFalsy();
    expect(String(doc.team)).toBe(String(proTeam._id));
  });

  it('stays a youth player when given a premier-league team', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14), team: premierTeam._id.toString() }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.isProfessional).toBe(false);
    expect(res.body.data.document.ageGroup).toBeTruthy();
  });

  it('stays a youth player with a free-text teamName — professional requires a registered team', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14), teamName: 'Street FC' }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.isProfessional).toBe(false);
  });

  it('rejects a professional-scoped birth year (25) with no team at all — youth range still applies without a team', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(25) }));

    expect(res.status).toBe(400);
  });

  it('rejects isProfessional sent directly by the client (still locked for every role)', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14), isProfessional: true }));

    expect(res.status).toBe(400);
  });

  it('rejects coach, observers, createdBy, status, ageGroup sent directly on create', async () => {
    const attempts = [
      { coach: coach.user._id.toString() },
      { observers: [observer.user._id.toString()] },
      { createdBy: admin.user._id.toString() },
      { status: 'selected' },
      { ageGroup: ageGroup._id.toString() },
    ];
    for (const extra of attempts) {
      const res = await request(app)
        .post('/api/v1/players')
        .set(...auth(observer.token))
        .send(playerPayload({ dateOfBirth: dobForAge(14), ...extra }));
      expect(res.status).toBe(400);
    }
  });

  // Regression — coach/proScout isProfessional lock is untouched by this stage
  it('regression: coach and proScout still cannot set isProfessional directly on create', async () => {
    const asCoach = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ isProfessional: true }));
    expect(asCoach.status).toBe(400);

    const asScout = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ dateOfBirth: dobForAge(25), isProfessional: false }));
    expect(asScout.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Visibility — ownerFields.observer already covers this; these tests prove it
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /players — observer-created players stay observer/admin-only', () => {
  it('the creating observer sees their own player', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app).get('/api/v1/players').set(...auth(observer.token));
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d._id)).toEqual([created.body.data.document._id]);
  });

  it('a coach does not see it (no coach field on the document)', async () => {
    await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));
    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(0);
  });

  it('a second, unassigned observer does not see it — 403 by direct id', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));
    const id = created.body.data.document._id;

    const list = await request(app).get('/api/v1/players').set(...auth(otherObserver.token));
    expect(list.status).toBe(200);
    expect(list.body.data.documents.length).toBe(0);

    const byId = await request(app).get(`/api/v1/players/${id}`).set(...auth(otherObserver.token));
    expect(byId.status).toBe(403);
  });

  it('once admin assigns a second observer, they see the player — 200 by direct id', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));
    const id = created.body.data.document._id;

    const assign = await request(app)
      .patch(`/api/v1/players/${id}/observers`)
      .set(...auth(admin.token))
      .send({ observers: [observer.user._id.toString(), otherObserver.user._id.toString()] });
    expect(assign.status).toBe(200);

    const byId = await request(app).get(`/api/v1/players/${id}`).set(...auth(otherObserver.token));
    expect(byId.status).toBe(200);
  });

  it('?coach=<id> and ?observers=<otherId> cannot widen an observer\'s view', async () => {
    await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));
    const otherPlayer = await createPlayerDoc({ observers: [otherObserver.user._id] });

    const byCoach = await request(app)
      .get(`/api/v1/players?coach=${coach.user._id}`)
      .set(...auth(observer.token));
    expect(byCoach.status).toBe(200);
    expect(byCoach.body.data.documents.every((d) => d._id !== otherPlayer._id.toString())).toBe(true);

    const byObservers = await request(app)
      .get(`/api/v1/players?observers=${otherObserver.user._id}`)
      .set(...auth(observer.token));
    expect(byObservers.status).toBe(200);
    expect(byObservers.body.data.documents.every((d) => d._id !== otherPlayer._id.toString())).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH — ownership, isProfessional lock, cross-league reassignment
// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /players/:id — observer editing', () => {
  it('edits their own player', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token))
      .send({ city: 'Alexandria' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.city).toBe('Alexandria');
  });

  it('cannot edit another observer\'s player (403)', async () => {
    const otherPlayer = await createPlayerDoc({ observers: [otherObserver.user._id] });
    const res = await request(app)
      .patch(`/api/v1/players/${otherPlayer._id}`)
      .set(...auth(observer.token))
      .send({ city: 'Alexandria' });

    expect(res.status).toBe(403);
  });

  it('rejects isProfessional sent directly on update (still locked)', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token))
      .send({ isProfessional: true });

    expect(res.status).toBe(400);
  });

  it('rejects reassigning a youth player\'s team across the professional boundary', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token))
      .send({ team: proTeam._id.toString() });

    expect(res.status).toBe(400);
  });

  it('rejects reassigning a professional player\'s team to a premier-league team', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(25), team: proTeam._id.toString() }));

    const otherProTeam = await createTeam(ageGroup._id, { league: 'professional' });
    // reassigning within the same classification (professional -> professional) still works
    const ok = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token))
      .send({ team: otherProTeam._id.toString() });
    expect(ok.status).toBe(200);

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token))
      .send({ team: premierTeam._id.toString() });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE — admin-only, unchanged
// ═══════════════════════════════════════════════════════════════════════════
describe('DELETE /players/:id — still admin-only for observer-created players', () => {
  it('an observer cannot delete their own player (403)', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app)
      .delete(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(observer.token));

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// profileImg — role gate + ownership guard
// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /players/:id/profileImg — observer', () => {
  it('an unassigned observer is refused with 403 (guard runs before image processing)', async () => {
    const otherPlayer = await createPlayerDoc({ observers: [otherObserver.user._id] });
    const res = await request(app)
      .patch(`/api/v1/players/${otherPlayer._id}/profileImg`)
      .set(...auth(observer.token))
      .attach('profileImg', Buffer.from('not-a-real-image'), 'a.png');

    expect(res.status).toBe(403);
  });

  it('the assigned observer reaches the controller for their own player', async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(observer.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}/profileImg`)
      .set(...auth(observer.token))
      .attach('profileImg', Buffer.from('x'), 'a.png');

    // 400 from image processing (not a real image) — the point is it isn't 403
    expect(res.status).not.toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Principle III — coach, admin and proScout are unaffected by this stage
// ═══════════════════════════════════════════════════════════════════════════
describe('Regression — coach, admin and proScout player scope unaffected by observer write access', () => {
  it('a coach still only sees their own players', async () => {
    const mine = await createPlayerDoc({ coach: coach.user._id, createdBy: coach.user._id });
    await createPlayerDoc({ observers: [observer.user._id] });
    await createPlayerDoc({ team: proTeam._id, createdBy: scout.user._id, isProfessional: true });

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d._id)).toEqual([mine._id.toString()]);
  });

  it('an admin still sees everything, including observer-created players', async () => {
    const coachPlayer = await createPlayerDoc({ coach: coach.user._id, createdBy: coach.user._id });
    const observerPlayer = await createPlayerDoc({ observers: [observer.user._id], createdBy: observer.user._id });

    const res = await request(app).get('/api/v1/players').set(...auth(admin.token));
    expect(res.status).toBe(200);
    const ids = res.body.data.documents.map((d) => d._id).sort();
    expect(ids).toEqual([coachPlayer._id.toString(), observerPlayer._id.toString()].sort());
  });

  it('a proScout still only sees their own createdBy-owned players', async () => {
    const mine = await createPlayerDoc({ team: proTeam._id, createdBy: scout.user._id, isProfessional: true });
    await createPlayerDoc({ observers: [observer.user._id] });

    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d._id)).toEqual([mine._id.toString()]);
  });
});
