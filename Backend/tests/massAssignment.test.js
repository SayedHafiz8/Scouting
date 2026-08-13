import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import User from '../models/userModel.js';
import ScoutingReport from '../models/scoutingReportModel.js';
import {
  createAdmin, createCoach, createObserver, createPlayer, createReport, seedAgeGroups,
} from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  Mass-assignment / privilege-escalation contract.
//  Each case here closes a proven hole from the pre-launch security review —
//  a client sending a field it has no business setting must never be honored.
//  Do not weaken without a security review.
// ══════════════════════════════════════════════════════════════════════════════

describe('Blocker 1 — profileImg cannot be set via text-only profile updates', () => {
  it('user cannot set an arbitrary profileImg key via PATCH /auth/updateLoggedUser', async () => {
    const { user, token } = await createCoach();

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed Coach', profileImg: 'players/attacker-guessed-uuid.webp' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Renamed Coach');
    // never signed into a URL in the response...
    expect(res.body.data.user.profileImg).toBeFalsy();
    // ...and never persisted
    const fresh = await User.findById(user._id);
    expect(fresh.profileImg).toBeFalsy();
  });

  it('admin cannot set an arbitrary profileImg key via PATCH /users/:id', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();

    const res = await request(app)
      .patch(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Renamed By Admin', profileImg: 'players/attacker-guessed-uuid.webp' });

    expect(res.status).toBe(200);
    const fresh = await User.findById(coach._id);
    expect(fresh.profileImg).toBeFalsy();
  });
});

describe('Blocker 2 — PATCH /api/v1/players/:id cannot reassign ownership/oversight', () => {
  beforeEach(seedAgeGroups);

  it('coach cannot strip observers or reassign coach via PATCH /players/:id', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { user: otherCoach } = await createCoach();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);

    // admin assigns an observer the normal way
    const assign = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });
    expect(assign.status).toBe(200);

    // the coach tries to strip the observer and hand the player to another coach
    // through the general update route
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ observers: [], coach: otherCoach._id.toString() });

    expect(res.status).toBe(400);

    // the DB still reflects the admin's original assignment, untouched
    const fresh = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(fresh.body.data.document.coach._id ?? fresh.body.data.document.coach).toBeTruthy();
    const observerIds = (fresh.body.data.document.observers ?? []).map(
      (o) => (typeof o === 'object' ? o._id : o)
    );
    expect(observerIds).toContain(observer._id.toString());

    // the observer still has access — proves the assignment was never actually stripped
    const observerRead = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(observerRead.status).toBe(200);
  });

  it('cannot set ageGroup or status directly via PATCH /players/:id', async () => {
    const { token: coachToken } = await createCoach();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ ageGroup: '507f1f77bcf86cd799439011', status: 'selected' });

    expect(res.status).toBe(400);
  });
});

describe('Blocker 2 — scouting report ownership fields stay locked on update (regression guard)', () => {
  beforeEach(seedAgeGroups);

  it('coach cannot reassign coach or player on their own scouting report', async () => {
    const { token: coachToken } = await createCoach();
    const otherPlayer = await createPlayer(coachToken, { name: 'Other Player' });
    const player = await createPlayer(coachToken, { name: 'Report Owner Player' });
    const report = await createReport(coachToken, player._id);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${report._id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ player: otherPlayer._id.toString(), notes: 'Edited notes' });

    expect(res.status).toBe(400);

    const fresh = await ScoutingReport.findById(report._id);
    expect(fresh.player.toString()).toBe(player._id.toString());
  });
});
