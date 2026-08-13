import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import User from '../models/userModel.js';
import { createAdmin, createCoach, createObserver, TEST_PASSWORD } from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/users  — list all coaches
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users', () => {
  it('admin gets list of coaches', async () => {
    const { token } = await createAdmin();
    await createCoach();
    await createCoach();

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data.documents)).toBe(true);
  });

  it('coach gets 403 (forbidden)', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('unauthenticated request gets 401', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });

  it('supports search by name', async () => {
    const { token } = await createAdmin();
    await createCoach({ name: 'Ali Hassan' });
    await createCoach({ name: 'Mohamed Salah' });

    const res = await request(app)
      .get('/api/v1/users?keyword=Ali')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('admin can still filter users by role', async () => {
    const { token } = await createAdmin({ email: 'role_admin@test.com' });
    await createCoach({ email: 'role_coach@test.com' });
    await createObserver({ email: 'role_obs@test.com' });

    const res = await request(app)
      .get('/api/v1/users?role=coach')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.documents.every((u) => u.role === 'coach')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/users  — admin creates a coach
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/users', () => {
  it('admin creates a coach successfully', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Coach',
        email: 'newcoach@test.com',
        password: TEST_PASSWORD,
        passwordConfirm: TEST_PASSWORD,
        phoneNumber: '01033334444',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.document.role).toBe('coach');
    expect(res.body.data.document.password).toBeUndefined();
  });

  it('coach cannot create another user', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', email: 'x@test.com', password: TEST_PASSWORD, passwordConfirm: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('returns 400 for missing required fields', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'partial@test.com' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Coach', email: 'not-email', password: TEST_PASSWORD, passwordConfirm: TEST_PASSWORD });

    expect(res.status).toBe(400);
  });

  it('returns 400 when passwords do not match', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Coach', email: 'x@test.com', password: TEST_PASSWORD, passwordConfirm: 'Different!1' });

    expect(res.status).toBe(400);
  });

  it('returns 4xx for duplicate email', async () => {
    const { token } = await createAdmin();
    await User.create({ name: 'Existing', email: 'dup@test.com', password: TEST_PASSWORD, role: 'coach' });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New', email: 'dup@test.com', password: TEST_PASSWORD, passwordConfirm: TEST_PASSWORD });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/users/:id
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users/:id', () => {
  it('admin can fetch a specific coach', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach();

    const res = await request(app)
      .get(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.document._id.toString()).toBe(coach._id.toString());
  });

  it('returns 404 for non-existent user ID', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .get('/api/v1/users/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid MongoDB ID', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .get('/api/v1/users/not-an-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/users/:id  — admin updates a coach
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/users/:id', () => {
  it('admin can update coach name', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach();

    const res = await request(app)
      .patch(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Coach Name' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.name).toBe('Updated Coach Name');
  });

  it('coach cannot update another user', async () => {
    const { token: coachToken } = await createCoach();
    const { user: otherCoach } = await createCoach();

    const res = await request(app)
      .patch(`/api/v1/users/${otherCoach._id}`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ name: 'Hack' });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  DELETE /api/v1/users/:id  — soft delete (deactivate)
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/v1/users/:id  (soft delete)', () => {
  it('admin can deactivate a coach', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach();

    const res = await request(app)
      .delete(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204); // softDelete returns 204 No Content

    const deactivated = await User.findById(coach._id).setOptions({ bypassFilter: true });
    expect(deactivated?.active).toBe(false);
  });

  it('deactivated coach cannot log in', async () => {
    const { token, user } = await createAdmin();
    const { user: coach } = await createCoach({ email: 'fired@test.com' });

    await request(app)
      .delete(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'fired@test.com', password: TEST_PASSWORD });

    expect(loginRes.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/users/:id/restore
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/users/:id/restore', () => {
  it('admin can restore a deactivated coach', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach({ email: 'restore@test.com' });

    // Deactivate first
    await request(app)
      .delete(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`);

    // Restore
    const res = await request(app)
      .patch(`/api/v1/users/${coach._id}/restore`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const restored = await User.findById(coach._id);
    expect(restored?.active).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/users/deactivated
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/users/deactivated', () => {
  it('admin can list deactivated users', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach();

    // Deactivate
    await request(app)
      .delete(`/api/v1/users/${coach._id}`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get('/api/v1/users/deactivated')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
