// ══════════════════════════════════════════════════════════════════════════════
// Regression tests for the six production-critical fixes in
// docs/audit-backend-2026-08.md (S1, S3, B1, S5, P1). Each block proves the
// specific failure mode the audit found by real HTTP request — the same style
// of proof the audit report used (an actual status code / stored value / mocked
// call, never a code-review assertion) — and fails if the fix regresses.
//
// S2 (unauthenticated /ages) has no dedicated block here — it is covered in
// the existing suites it touches: tests/teams.test.js, and
// tests/roles/proScoutDataScope.test.js, proScoutHardeningNegative.test.js,
// proScoutPlayersWrite.test.js, proScoutRoleDefinition.test.js (all updated in
// this same change, since they previously asserted the OPPOSITE — public,
// undeniable reads — as intended behavior).
// ══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';

// S3's "normal, accepted upload" regression test exercises the real
// profileImg-upload path, which calls out to Bunny Storage. Mock ONLY the
// network wrappers (same convention as tests/mediaImageVault.test.js) so that
// path succeeds without a real Bunny account; bunnyConfig (signing/config)
// stays real.
vi.mock('../config/bunny.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createStreamVideo: vi.fn(async () => ({ guid: 'vid' })),
    getStreamVideo: vi.fn(),
    deleteStreamVideo: vi.fn(async () => true),
    putStorageObject: vi.fn(async () => true),
    getStorageObject: vi.fn(async () => null),
    deleteStorageObject: vi.fn(async () => true),
    purgeUrl: vi.fn(async () => true),
  };
});

import app from '../app.js';
import User from '../models/userModel.js';
import Player from '../models/playedModel.js';
import Team from '../models/teamModel.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import AgeGroup from '../models/ageGroupModel.js';
import sendEmail from '../utils/sendEmail.js';
import {
  createAdmin,
  createCoach,
  createProScout,
  seedAgeGroups,
  playerPayload,
  reportPayload,
  TEST_PASSWORD,
} from './helpers/factory.js';

const auth = (token) => ['Authorization', `Bearer ${token}`];

// 1x1 transparent PNG — enough for multer's fileFilter (mimetype) and sharp to
// process as a real image.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// ══════════════════════════════════════════════════════════════════════════════
//  S1 — changePassword must kill the target's existing session, not just
//  change the stored password.
// ══════════════════════════════════════════════════════════════════════════════
describe('audit fix S1 — admin changePassword revokes the victim session', () => {
  it('PATCH /users/:id/changePassword nulls refreshToken; the old refresh cookie is refused', async () => {
    const admin = await createAdmin();
    const coach = await createCoach();

    // capture the coach's live session BEFORE the admin touches the password
    const oldCookie = coach.cookie;
    expect(oldCookie).toBeDefined();

    const chg = await request(app)
      .patch(`/api/v1/users/${coach.user._id}/changePassword`)
      .set(...auth(admin.token))
      .send({ currentPassword: TEST_PASSWORD, password: 'NewPass12345', confirmPassword: 'NewPass12345' });

    expect(chg.status).toBe(200);

    // the DB record itself is nulled — this is the direct fix
    const stored = await User.findById(coach.user._id).select('+refreshToken +refreshTokenExpires');
    expect(stored.refreshToken).toBeNull();
    expect(stored.refreshTokenExpires).toBeNull();

    // and the cookie the coach was still holding is now refused end to end —
    // this was the exact gap the audit proved: this used to be 200
    const refreshed = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', oldCookie);
    expect(refreshed.status).toBe(401);

    // the change itself must still have actually worked — the fix must not
    // break the feature it's protecting
    const loginWithNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: coach.user.email, password: 'NewPass12345' });
    expect(loginWithNew.status).toBe(200);
  });

  it('refreshToken rejects a still-stored token once passwordChangedAt moves past its issue time (defense in depth)', async () => {
    // This isolates the SECOND half of the fix — the passwordChangedAt guard in
    // authController.refreshToken — from the first (changePassword nulling the
    // token directly). We simulate exactly the failure mode the audit found: a
    // password-change code path that updates passwordChangedAt but, for
    // whatever reason, leaves the stored refreshToken untouched. Without the
    // guard this test proves, that old cookie would still work.
    const coach = await createCoach();
    const oldCookie = coach.cookie;

    await User.findByIdAndUpdate(coach.user._id, {
      // refreshToken is deliberately left as-is — only passwordChangedAt moves
      passwordChangedAt: new Date(Date.now() + 2000),
    });

    const refreshed = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', oldCookie);

    expect(refreshed.status).toBe(401);
  });

  it('a coach who was never touched keeps refreshing normally (no regression for existing behavior)', async () => {
    const coach = await createCoach();
    const refreshed = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', coach.cookie);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  S3 — an uploaded temp file must not survive a rejected request (ownership
//  403 or validation 400), on any route that runs multer.
// ══════════════════════════════════════════════════════════════════════════════
describe('audit fix S3 — rejected uploads do not leak temp files on disk', () => {
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const countFiles = () => (fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0);

  it('PATCH /players/:id/profileImg — 403 from checkPlayerOwnership does not leak the file (errorMiddleware cleanup)', async () => {
    await seedAgeGroups();
    const owner = await createCoach();
    const intruder = await createCoach();
    const player = await Player.create({ ...playerPayload(), coach: owner.user._id, createdBy: owner.user._id });

    const before = countFiles();
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(intruder.token))
      .attach('profileImg', ONE_PX_PNG, 'a.png');

    expect(res.status).toBe(403);
    expect(countFiles()).toBe(before); // was `before + 1` — this is the exact leak the audit measured
  });

  it('POST /players/:playerId/media — 400 from uploadMediaValidator does not leak the file (validatorMiddleware cleanup)', async () => {
    await seedAgeGroups();
    const coach = await createCoach();
    const player = await Player.create({ ...playerPayload(), coach: coach.user._id, createdBy: coach.user._id });

    const before = countFiles();
    const res = await request(app)
      .post(`/api/v1/players/${player._id}/media`)
      .set(...auth(coach.token))
      .field('title', 'x'.repeat(200)) // exceeds the 100-char cap → validator rejects
      .attach('file', ONE_PX_PNG, 'a.png');

    expect(res.status).toBe(400);
    expect(countFiles()).toBe(before);
  });

  it('a normal, accepted upload is unaffected by the cleanup middleware (no regression)', async () => {
    await seedAgeGroups();
    const coach = await createCoach();
    const player = await Player.create({ ...playerPayload(), coach: coach.user._id, createdBy: coach.user._id });

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(coach.token))
      .attach('profileImg', ONE_PX_PNG, 'a.png');

    expect(res.status).toBe(200);
    expect(res.body.data.profileImg).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  B1 — a proScout must be able to write a scouting report on its own
//  (ageGroup-less) professional player, both matchType: official and friendly.
// ══════════════════════════════════════════════════════════════════════════════
describe('audit fix B1 — proScout can write reports on a professional (ageGroup-less) player', () => {
  it('matchType: official no longer crashes with TypeError — 201 with the report created', async () => {
    await seedAgeGroups();
    const scout = await createProScout();
    const proTeam = await Team.create({ name: 'pro-club-b1', clubName: 'Pro Club B1', league: 'professional' });
    const otherTeam = await Team.create({ name: 'pro-club-b1-away', clubName: 'Pro Club B1 Away', league: 'professional' });

    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: String(proTeam._id) }));
    expect(created.status).toBe(201);
    const player = created.body.data.document;
    expect(player.isProfessional).toBe(true);
    expect(player.ageGroup).toBeFalsy();

    await SeasonMatch.create({
      season: '2025/2026',
      league: 'professional',
      matchDate: new Date(),
      homeTeam: proTeam._id,
      awayTeam: otherTeam._id,
      createdBy: scout.user._id,
    });

    const rep = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send(reportPayload({ matchType: 'official' }));

    expect(rep.status).toBe(201);
    expect(rep.body.data.document.overallRating).toBeGreaterThan(0);
  });

  it('matchType: friendly no longer crashes with TypeError — 201 with the report created', async () => {
    await seedAgeGroups();
    const scout = await createProScout();
    const proTeam = await Team.create({ name: 'pro-club-b1-f', clubName: 'Pro Club B1 F', league: 'professional' });
    const otherTeam = await Team.create({ name: 'pro-club-b1-f-away', clubName: 'Pro Club B1 F Away', league: 'professional' });

    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: String(proTeam._id) }));
    const player = created.body.data.document;

    const rep = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send(reportPayload({ matchType: 'friendly', awayTeam: String(otherTeam._id) }));

    expect(rep.status).toBe(201);
  });

  it('a youth (ageGroup-bearing) player and match are unaffected — the guard only skips when one side has none (no regression)', async () => {
    await seedAgeGroups();
    const coach = await createCoach();
    const group = await AgeGroup.findOne();
    const team = await Team.create({ name: 'youth-team-b1', clubName: 'Youth Club', league: 'premier', ageGroup: group._id });
    const otherYouthTeam = await Team.create({ name: 'youth-team-b1-2', clubName: 'Youth Club 2', league: 'premier', ageGroup: group._id });
    const mismatchedGroup = await AgeGroup.findOne({ birthYear: { $ne: group.birthYear } });
    const mismatchedTeam = await Team.create({ name: 'youth-team-mismatch', clubName: 'Other Age Club', league: 'premier', ageGroup: mismatchedGroup._id });

    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: String(team._id), dateOfBirth: `${group.birthYear}-05-10` }));
    expect(created.status).toBe(201);
    const player = created.body.data.document;

    // still rejects a genuinely mismatched age group for two youth teams — the
    // guard change did not weaken this check, only skip it when a side is
    // professional (undefined ageGroup)
    const badRep = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(coach.token))
      .send(reportPayload({ matchType: 'friendly', awayTeam: String(mismatchedTeam._id) }));
    expect(badRep.status).toBe(400);

    const goodRep = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(coach.token))
      .send(reportPayload({ matchType: 'friendly', awayTeam: String(otherYouthTeam._id) }));
    expect(goodRep.status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  S5 — the password-reset code must come from a CSPRNG, not Math.random().
// ══════════════════════════════════════════════════════════════════════════════
describe('audit fix S5 — forgotPassword uses a cryptographic RNG for the reset code', () => {
  afterEach(() => vi.restoreAllMocks());

  it('Math.random is never called while generating the reset code', async () => {
    const coach = await createCoach();
    const spy = vi.spyOn(Math, 'random');

    const res = await request(app)
      .post('/api/v1/auth/forgotPassword')
      .send({ email: coach.user.email });

    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
  });

  it('the generated code is still a well-formed 6-digit code that verifies correctly end to end (no regression)', async () => {
    const coach = await createCoach();
    sendEmail.mockClear();

    const res = await request(app)
      .post('/api/v1/auth/forgotPassword')
      .send({ email: coach.user.email });
    expect(res.status).toBe(200);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const message = sendEmail.mock.calls[0][0].message;
    const match = message.match(/<h1>(\d+)<\/h1>/);
    expect(match).not.toBeNull();
    const code = match[1];
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(app)
      .post('/api/v1/auth/verifyResetCode')
      .send({ resetCode: code });
    expect(verify.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  P1 — bcrypt cost factor lowered from 12 to 10, centralized in one constant,
//  applied everywhere a password is hashed.
// ══════════════════════════════════════════════════════════════════════════════
describe('audit fix P1 — bcrypt cost factor reduced to 10 everywhere', () => {
  const assertCost10 = (hash) => {
    // bcrypt hash shape: $2a$10$... / $2b$10$... — the cost is embedded in the string
    expect(hash).toMatch(/^\$2[aby]\$10\$/);
  };

  it('a freshly created user (pre-save hook, models/userModel.js) is hashed at cost 10', async () => {
    const { user } = await createCoach();
    const stored = await User.findById(user._id);
    assertCost10(stored.password);
  });

  it('changeLoggedUserPass (self-service, PATCH /auth/changeMyPassword) hashes the new password at cost 10', async () => {
    const coach = await createCoach();
    const res = await request(app)
      .patch('/api/v1/auth/changeMyPassword')
      .set(...auth(coach.token))
      .send({ currentPassword: TEST_PASSWORD, password: 'AnotherPass12345', confirmPassword: 'AnotherPass12345' });

    expect(res.status).toBe(200);
    const stored = await User.findById(coach.user._id).select('+password');
    assertCost10(stored.password);
  });

  it('admin changePassword (userController) hashes the new password at cost 10', async () => {
    const admin = await createAdmin();
    const coach = await createCoach();

    await request(app)
      .patch(`/api/v1/users/${coach.user._id}/changePassword`)
      .set(...auth(admin.token))
      .send({ currentPassword: TEST_PASSWORD, password: 'YetAnotherPass12345', confirmPassword: 'YetAnotherPass12345' });

    const stored = await User.findById(coach.user._id).select('+password');
    assertCost10(stored.password);
  });

  it('login still authenticates correctly against a cost-10 hash (no regression)', async () => {
    const coach = await createCoach();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: coach.user.email, password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });
});
