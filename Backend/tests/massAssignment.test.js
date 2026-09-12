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

  // ── audit-backend — نفس الفحوص بالظبط على مسار **الإنشاء** ────────────────
  //
  // الباب كان مقفول من ناحيتين ومفتوح من التالتة: التستين فوق بيغطّوا
  // updateLoggedUser و update، وPOST /users كان `creating(User)` = req.body
  // الخام لـUser.create(). createValidate بيتحقق من الحقول المعروفة بس
  // مابيشيلش اللي غيرها.
  const newUserPayload = (extra = {}) => ({
    name: 'Created Coach',
    email: `mass_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.com`,
    password: 'Passw0rd',
    passwordConfirm: 'Passw0rd',
    phoneNumber: '01012345678',
    role: 'coach',
    ...extra,
  });

  it('admin cannot set profileImg via POST /users', async () => {
    const { token: adminToken } = await createAdmin();
    const payload = newUserPayload({ profileImg: 'players/attacker-guessed-uuid.webp' });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    // مش موقّع في الرد...
    expect(res.body.data.document.profileImg).toBeFalsy();
    // ...ولا متخزّن
    const fresh = await User.findOne({ email: payload.email });
    expect(fresh.profileImg).toBeFalsy();
  });

  it('POST /users ignores every field outside the create whitelist', async () => {
    const { token: adminToken } = await createAdmin();
    const payload = newUserPayload({
      profileImg: 'players/oracle.webp',
      idCardFrontImg: 'vault/front.webp',
      idCardBackImg: 'vault/back.webp',
      active: false,
      passwordChangedAt: new Date('2030-01-01'),
      refreshToken: 'attacker-supplied-refresh-token',
      vaultFailedAttempts: 99,
      vaultLockedUntil: new Date('2030-01-01'),
    });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);

    const fresh = await User.findOne({ email: payload.email })
      .setOptions({ bypassFilter: true })
      .select('+refreshToken +vaultFailedAttempts +vaultLockedUntil');

    expect(fresh).toBeTruthy();
    expect(fresh.profileImg).toBeFalsy();
    expect(fresh.idCardFrontImg).toBeFalsy();
    expect(fresh.idCardBackImg).toBeFalsy();
    // active:false كان معناه يوزر بيتولد متخفي من hook الحذف الناعم
    expect(fresh.active).not.toBe(false);
    expect(fresh.refreshToken).toBeFalsy();
    // passwordChangedAt في المستقبل بتبطّل توكنات صالحة عند protect
    expect(fresh.passwordChangedAt == null || fresh.passwordChangedAt < new Date('2029-01-01')).toBe(true);
    expect(fresh.vaultFailedAttempts ?? 0).toBe(0);
    expect(fresh.vaultLockedUntil).toBeFalsy();
  });

  it('the legitimate create fields still land', async () => {
    const { token: adminToken } = await createAdmin();
    const payload = newUserPayload({ address: 'Cairo', birthDate: '1995-04-02' });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    const fresh = await User.findOne({ email: payload.email });
    expect(fresh.name).toBe('Created Coach');
    expect(fresh.role).toBe('coach');
    expect(fresh.phoneNumber).toBe('01012345678');
    expect(fresh.address).toBe('Cairo');
    expect(fresh.birthDate).toBeTruthy();
    // والباسورد اتهشّ فعلاً، مش اتخزّن نص صريح
    const withPassword = await User.findById(fresh._id).select('+password');
    expect(withPassword.password).not.toBe('Passw0rd');
  });

  it('a created user can actually log in — the whitelist did not break auth', async () => {
    const { token: adminToken } = await createAdmin();
    const payload = newUserPayload();

    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(payload);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: payload.email, password: 'Passw0rd' });

    expect(login.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  الفاكتوري نفسه: `allowed` إجبارية، فأي creating() جديد مايفتحش الباب بصمت
// ══════════════════════════════════════════════════════════════════════════════
describe('creating() refuses to build a route without a field whitelist', () => {
  it('throws when `allowed` is missing, empty, or not an array', async () => {
    const { creating } = await import('../services/services.js');

    expect(() => creating(User)).toThrow(/requires a non-empty `allowed` field whitelist/);
    expect(() => creating(User, {})).toThrow(/allowed/);
    expect(() => creating(User, { allowed: [] })).toThrow(/allowed/);
    expect(() => creating(User, { allowed: 'name' })).toThrow(/allowed/);
    // والاسم بيبان في الرسالة عشان يوصّل المطوّر للموديل الصح
    expect(() => creating(User)).toThrow(/creating\(User\)/);
  });

  it('builds normally once a whitelist is declared', async () => {
    const { creating } = await import('../services/services.js');
    expect(typeof creating(User, { allowed: ['name'] })).toBe('function');
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
