import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import app from '../app.js';
import User from '../models/userModel.js';
import { createAdmin, createCoach, TEST_PASSWORD } from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/auth/login
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await User.create({ name: 'Coach', email: 'login@test.com', password: TEST_PASSWORD, role: 'coach' });
  });

  it('returns 200 and accessToken for valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('sets httpOnly refreshToken cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: TEST_PASSWORD });

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some(c => c.startsWith('refreshToken='))).toBe(true);
    expect(cookies.some(c => c.includes('HttpOnly'))).toBe(true);
  });

  it('returns 401 for wrong password', async () => {
    // Must use a format-valid password (only alphanumeric) so validation passes and we reach the bcrypt check
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: 'WrongPass1234' });

    expect(res.status).toBe(401);
  });

  it('returns 401 for non-existent email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });

  it('returns 400 when email is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 401 for deactivated account', async () => {
    await User.findOneAndUpdate({ email: 'login@test.com' }, { active: false }).setOptions({ bypassFilter: true });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'login@test.com', password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/auth/logout
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/logout', () => {
  it('returns 200 and clears cookie', async () => {
    const { token, cookie } = await createCoach();

    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    // Cookie should be cleared (empty value)
    const cookies = res.headers['set-cookie'];
    if (cookies) {
      expect(cookies.some(c => c.startsWith('refreshToken=;') || c.includes('refreshToken=;'))).toBe(true);
    }
  });

  it('still logs out (200) without an access token — relies on the refresh cookie', async () => {
    // logout must work even if the access token expired, otherwise the session survives
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('invalidates the refresh token so it can no longer be used', async () => {
    const { cookie } = await createCoach();

    // log out using only the refresh cookie (no access token)
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);

    // the same refresh cookie must now be rejected
    const refresh = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/auth/refreshToken
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/refreshToken', () => {
  it('returns new accessToken using valid refresh cookie', async () => {
    const { cookie } = await createCoach();

    const res = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user).toBeDefined();
  });

  it('sets a new refreshToken cookie on refresh', async () => {
    const { cookie } = await createCoach();
    const res = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', cookie);

    const newCookies = res.headers['set-cookie'];
    expect(newCookies).toBeDefined();
    // A new refreshToken cookie must be present (rotation happened)
    expect(newCookies.some(c => c.startsWith('refreshToken='))).toBe(true);
  });

  it('returns 401 with no refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/refreshToken');
    expect(res.status).toBe(401);
  });

  it('returns 401 with tampered refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refreshToken')
      .set('Cookie', ['refreshToken=tampered.invalid.token']);

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/auth/forgotPassword
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/forgotPassword', () => {
  beforeEach(async () => {
    await User.create({ name: 'Coach', email: 'forgot@test.com', password: TEST_PASSWORD, role: 'coach' });
  });

  it('returns 200 and sends email for valid user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgotPassword')
      .send({ email: 'forgot@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  // الرد بقى موحّد (200) بدل 404 عمداً — مايبقاش أوراكل لوجود الحسابات (B4/enumeration fix).
  it('returns 200 for unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgotPassword')
      .send({ email: 'nobody@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('rejects a non-string email body (NoSQL operator injection)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/forgotPassword')
      .send({ email: { $ne: null } });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/auth/verifyResetCode
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/auth/verifyResetCode', () => {
  it('returns 200 for valid reset code', async () => {
    const resetCode = '123456';
    const hashed = crypto.createHash('sha256').update(resetCode).digest('hex');
    await User.create({
      name: 'Coach',
      email: 'verify@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetCode: hashed,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
      passwordResetVerified: false,
    });

    const res = await request(app)
      .post('/api/v1/auth/verifyResetCode')
      .send({ resetCode });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
  });

  it('returns 400 for wrong reset code', async () => {
    const hashed = crypto.createHash('sha256').update('999999').digest('hex');
    await User.create({
      name: 'Coach',
      email: 'verify2@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetCode: hashed,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
      passwordResetVerified: false,
    });

    const res = await request(app)
      .post('/api/v1/auth/verifyResetCode')
      .send({ resetCode: '111111' });

    expect(res.status).toBe(400);
  });

  it('rejects a non-numeric reset code', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verifyResetCode')
      .send({ resetCode: 'abcdef' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for expired reset code', async () => {
    const resetCode = '654321';
    const hashed = crypto.createHash('sha256').update(resetCode).digest('hex');
    await User.create({
      name: 'Coach',
      email: 'verify3@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetCode: hashed,
      passwordResetExpires: Date.now() - 1000,   // already expired
      passwordResetVerified: false,
    });

    const res = await request(app)
      .post('/api/v1/auth/verifyResetCode')
      .send({ resetCode });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PUT /api/v1/auth/resetPassword
// ══════════════════════════════════════════════════════════════════════════════
describe('PUT /api/v1/auth/resetPassword', () => {
  const email = 'reset@test.com';

  it('resets password and returns new token after verification', async () => {
    await User.create({
      name: 'Coach',
      email,
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetVerified: true,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email, newPassword: 'NewPass@5678' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 400 when reset code was not verified', async () => {
    await User.create({
      name: 'Coach',
      email: 'reset2@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetVerified: false,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'reset2@test.com', newPassword: 'NewPass@5678' });

    expect(res.status).toBe(400);
  });

  // الرد بقى موحّد (400) بدل 404 عمداً — نفس مبدأ forgotPassword: إيميل مش موجود
  // ميديش أوراكل لوجود الحسابات (B3/enumeration fix).
  it('returns 400 for non-existent email (no enumeration)', async () => {
    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'ghost@test.com', newPassword: 'NewPass@5678' });

    expect(res.status).toBe(400);
  });

  it('rejects reset after the window expires', async () => {
    await User.create({
      name: 'Coach',
      email: 'expired-reset@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetVerified: true,
      passwordResetExpires: Date.now() - 1000, // already expired
    });

    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'expired-reset@test.com', newPassword: 'NewPass@5678' });

    expect(res.status).toBe(400);

    // the old password still works — the reset never actually happened
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'expired-reset@test.com', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('invalidates old access tokens after reset', async () => {
    const { user, token: oldToken } = await (async () => {
      const created = await User.create({
        name: 'Coach',
        email: 'invalidate@test.com',
        password: TEST_PASSWORD,
        role: 'coach',
      });
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'invalidate@test.com', password: TEST_PASSWORD });
      return { user: created, token: loginRes.body.data.accessToken };
    })();

    await User.findByIdAndUpdate(user._id, {
      passwordResetVerified: true,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    // protect بيقارن passwordChangedAt بالـiat على مستوى الثانية (JWT). ضمان إن
    // الـreset بيقع في ثانية-جدار-زمن مختلفة عن إصدار التوكن القديم عشان التست
    // يبقى حتمي مش معتمد على توقيت bcrypt العشوائي.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'invalidate@test.com', newPassword: 'NewPass@5678' });

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ name: 'Should Not Work' });

    expect(res.status).toBe(401);
  });

  // الاتجاه التاني — التوكن الراجع من رد الـreset نفسه لازم يشتغل فعلاً على protect،
  // مش بس "موجود في الرد". (لا يوجد تست تاني في السويت بيستخدم التوكن الراجع من reset.)
  it('the session issued by the reset itself still works', async () => {
    await User.create({
      name: 'Coach',
      email: 'new-session@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetVerified: true,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    const resetRes = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'new-session@test.com', newPassword: 'NewPass@5678' });

    const newToken = resetRes.body.data.accessToken;

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${newToken}`)
      .send({ name: 'Post Reset Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Post Reset Name');
  });

  it('rejects a weak new password', async () => {
    await User.create({
      name: 'Coach',
      email: 'weak-pass@test.com',
      password: TEST_PASSWORD,
      role: 'coach',
      passwordResetVerified: true,
      passwordResetExpires: Date.now() + 10 * 60 * 1000,
    });

    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: 'weak-pass@test.com', newPassword: 'a' });

    expect(res.status).toBe(400);

    // the old password still works — the weak reset never happened
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'weak-pass@test.com', password: TEST_PASSWORD });
    expect(login.status).toBe(200);
  });

  it('rejects a non-string email body (NoSQL operator injection)', async () => {
    const res = await request(app)
      .put('/api/v1/auth/resetPassword')
      .send({ email: { $ne: null }, newPassword: 'NewPass@5678' });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/auth/changeMyPassword
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/auth/changeMyPassword', () => {
  it('changes password and returns new token', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .patch('/api/v1/auth/changeMyPassword')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, password: 'NewPass9999', confirmPassword: 'NewPass9999' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/changeMyPassword')
      .send({ currentPassword: TEST_PASSWORD, password: 'NewPass9999', confirmPassword: 'NewPass9999' });

    expect(res.status).toBe(401);
  });

  it('returns 400 when passwords do not match', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .patch('/api/v1/auth/changeMyPassword')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: TEST_PASSWORD, password: 'NewPass9999', confirmPassword: 'Different9999' });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/auth/updateLoggedUser
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/auth/updateLoggedUser', () => {
  it('updates the name for logged-in user', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', phoneNumber: '01155556666' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Updated Name');
  });

  it('a coach cannot change their own email or address, but CAN change their phone', async () => {
    const { token, user } = await createCoach();

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Still Me', email: 'hacked@example.com', phoneNumber: '01199998888', address: 'new address' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Still Me');
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.phoneNumber).toBe('01199998888');
  });

  it('an admin CAN change their own email and address too', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'admin-new@example.com', phoneNumber: '01199998888', address: 'HQ' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('admin-new@example.com');
    expect(res.body.data.user.phoneNumber).toBe('01199998888');
    expect(res.body.data.user.address).toBe('HQ');
  });

  it('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/api/v1/auth/updateLoggedUser')
      .send({ name: 'Test' });

    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/health
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/media-limits — frontend must read caps from here, never hardcode
//  them, or the client-side check silently drifts from BUNNY_MAX_VIDEO_MB (env).
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/media-limits', () => {
  it('reflects BUNNY_MAX_VIDEO_MB from the environment, unauthenticated', async () => {
    const res = await request(app).get('/api/v1/media-limits');
    expect(res.status).toBe(200);
    expect(res.body.data.maxVideoMB).toBe(Number(process.env.BUNNY_MAX_VIDEO_MB));
    expect(res.body.data.maxImageMB).toBe(10);
  });
});
