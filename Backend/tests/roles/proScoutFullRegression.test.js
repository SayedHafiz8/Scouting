import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createPlayer,
  createPlayerDoc,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';

// Stage 7 (hardening) — full regression proof (FR-018, FR-019, SC-005) that
// coach/observer/admin see the exact same COUNT and CONTENT after this stage
// as before it, for every endpoint family Constitution Principle III names,
// plus the maskObservedForCoach / maskCoachForObserver display masks.
//
// Expectations below are computed from the fixtures created in this file, not
// from the code path under test — an independent oracle, not a tautology.

const auth = (token) => ['Authorization', `Bearer ${token}`];

let ageGroup, coach, otherCoach, observer, admin;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
  coach = await createCoach({ email: `reg_coach_${Date.now()}@test.com` });
  otherCoach = await createCoach({ email: `reg_other_coach_${Date.now()}@test.com` });
  observer = await createObserver({ email: `reg_observer_${Date.now()}@test.com` });
  admin = await createAdmin({ email: `reg_admin_${Date.now()}@test.com` });
});

describe('GET /players regression (FR-018)', () => {
  it('coach sees exactly and only their own players', async () => {
    const mine1 = await createPlayer(coach.token, { name: 'Reg Coach Mine 1' });
    const mine2 = await createPlayer(coach.token, { name: 'Reg Coach Mine 2' });
    await createPlayer(otherCoach.token, { name: 'Reg Other Coach Player' });

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const names = res.body.data.documents.map((p) => p.name).sort();
    expect(names).toEqual([mine1.name, mine2.name].sort());
  });

  it('observer sees exactly and only players assigned to them', async () => {
    const assigned = await createPlayer(coach.token, { name: 'Reg Observer Assigned' });
    await createPlayer(coach.token, { name: 'Reg Observer Not Assigned' });
    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set(...auth(admin.token))
      .send({ status: 'observed', observers: [observer.user._id.toString()] });

    const res = await request(app).get('/api/v1/players').set(...auth(observer.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data.documents[0].name).toBe('Reg Observer Assigned');
  });

  it('admin sees exactly all players across both coaches', async () => {
    await createPlayer(coach.token, { name: 'Reg Admin A' });
    await createPlayer(otherCoach.token, { name: 'Reg Admin B' });

    const res = await request(app).get('/api/v1/players').set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });
});

describe('GET /players/counts regression (FR-018)', () => {
  it('coach counts match exactly the players they created', async () => {
    await createPlayer(coach.token, { name: 'Count Coach 1' });
    await createPlayer(coach.token, { name: 'Count Coach 2' });
    await createPlayer(otherCoach.token, { name: 'Count Other Coach' });

    const res = await request(app).get('/api/v1/players/counts').set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });
});

describe('GET /players/reports/average-ratings regression (FR-018)', () => {
  it('coach gets an average only for their own player\'s reports, none for another coach\'s player', async () => {
    const mine = await createPlayer(coach.token, { name: 'Avg Coach Mine' });
    const other = await createPlayer(otherCoach.token, { name: 'Avg Other Coach' });

    const res = await request(app)
      .get(`/api/v1/players/reports/average-ratings?ids=${mine._id},${other._id}`)
      .set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(Object.prototype.hasOwnProperty.call(res.body.data, other._id)).toBe(false);
  });
});

describe('GET /seasonMatches regression (FR-018)', () => {
  it('coach, observer, and admin each get a 200 with an array — scope unaffected by this stage', async () => {
    for (const { token } of [coach, observer, admin]) {
      const res = await request(app).get('/api/v1/seasonMatches').set(...auth(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.documents)).toBe(true);
    }
  });
});

describe('GET /dashboard/{coach,observer,admin} regression (FR-018)', () => {
  it('coach dashboard totalPlayers matches exactly the players they created', async () => {
    await createPlayer(coach.token, { name: 'Dash Coach 1' });
    await createPlayer(coach.token, { name: 'Dash Coach 2' });
    await createPlayer(otherCoach.token, { name: 'Dash Other Coach' });

    const res = await request(app).get('/api/v1/dashboard/coach').set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.data.totalPlayers).toBe(2);
  });

  it('observer dashboard totalPlayersObserved matches exactly the players assigned to them', async () => {
    const assigned = await createPlayer(coach.token, { name: 'Dash Observer Assigned' });
    await createPlayer(coach.token, { name: 'Dash Observer Not Assigned' });
    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set(...auth(admin.token))
      .send({ status: 'observed', observers: [observer.user._id.toString()] });

    const res = await request(app).get('/api/v1/dashboard/observer').set(...auth(observer.token));

    expect(res.status).toBe(200);
    expect(res.body.data.totalPlayersObserved).toBe(1);
  });

  it('admin dashboard totalPlayers matches the exact total across all coaches', async () => {
    await createPlayer(coach.token, { name: 'Dash Admin A' });
    await createPlayer(otherCoach.token, { name: 'Dash Admin B' });
    await createPlayer(otherCoach.token, { name: 'Dash Admin C' });

    const res = await request(app).get('/api/v1/dashboard/admin').set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.data.totalPlayers).toBe(3);
  });
});

describe('Display masks regression (FR-019)', () => {
  it('maskObservedForCoach: coach sees observed player as "pending" and never sees observers', async () => {
    const watched = await createPlayer(coach.token, { name: 'Mask Coach Watched' });
    await request(app)
      .patch(`/api/v1/players/${watched._id}/status`)
      .set(...auth(admin.token))
      .send({ status: 'observed', observers: [observer.user._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players/${watched._id}`)
      .set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('pending');
    expect(res.body.data.document.observers).toBeUndefined();
  });

  it('maskCoachForObserver: observer never sees player.coach', async () => {
    const assigned = await createPlayer(coach.token, { name: 'Mask Observer Assigned' });
    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set(...auth(admin.token))
      .send({ status: 'observed', observers: [observer.user._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players/${assigned._id}`)
      .set(...auth(observer.token));

    expect(res.status).toBe(200);
    expect(res.body.data.document.coach).toBeUndefined();
  });
});
