import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import {
  seedAgeGroups,
  createAdmin,
  createProScout,
} from '../helpers/factory.js';

// Stage 7 (hardening) — negative-access proof for the four domains proScout has
// no mandate in at all: age-groups, users, the observer-assignment endpoint,
// and both evaluation routers. Every assertion here asserts a specific status
// code from a real HTTP request — never a 200-with-empty-body stand-in for denial
// (Constitution Principle I/VI). See specs/009-proscout-hardening/spec.md FR-005..011.
//
// userRouter.js / coachEvaluationRouter.js / observerEvaluationRouter.js are
// swept with it.each rather than one `it` per operation — same convention Stage
// 4/5's inventory used for "whole domains this stage grants nothing in"
// (specs/005-proscout-players-write/contracts/endpoint-inventory.md, "Negative-
// test obligations" §2), since testing 33 individually-admin-only routes one by
// one adds no signal beyond the router-level sweep.

const auth = (token) => ['Authorization', `Bearer ${token}`];

let scout, admin;

beforeEach(async () => {
  await seedAgeGroups();
  scout = await createProScout();
  admin = await createAdmin();
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-005 — the one protect-bearing age-groups route
// ═══════════════════════════════════════════════════════════════════════════
describe('age-groups domain (FR-005)', () => {
  it('POST /ages is denied to proScout (the only protect-bearing route in ageGroupRouter.js)', async () => {
    const res = await request(app)
      .post('/api/v1/ages')
      .set(...auth(scout.token))
      .send({ name: '2015', birthYear: 2015 });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-006, revised by audit fix S2 — GET /ages, GET /ages/:id now carry
// protect + allowedTo(admin, coach, observer) (constitution v1.3.0, C-3,
// TODO(AGES_UNAUTHENTICATED_READ) closed). proScout is explicitly denied —
// this is FR-006's original intent finally enforceable, not a new restriction
// invented here. Existing roles (admin here) see the exact same 200 as before,
// just now requiring the auth they already send on every other endpoint.
// ═══════════════════════════════════════════════════════════════════════════
describe('age-groups reads now require authentication (FR-006 / S2 — TODO(AGES_UNAUTHENTICATED_READ) closed)', () => {
  it('GET /ages: 200 for admin (unchanged), 403 for proScout, 401 for no token at all', async () => {
    const withScout = await request(app).get('/api/v1/ages').set(...auth(scout.token));
    const withAdmin = await request(app).get('/api/v1/ages').set(...auth(admin.token));
    const withNoToken = await request(app).get('/api/v1/ages');

    expect(withScout.status).toBe(403);
    expect(withAdmin.status).toBe(200);
    expect(withNoToken.status).toBe(401);
  });

  it('GET /ages/:id: 403 for proScout, 401 for no token at all', async () => {
    const ageGroup = (await request(app).get('/api/v1/ages').set(...auth(admin.token)))
      .body.data.documents[0];

    const withScout = await request(app).get(`/api/v1/ages/${ageGroup._id}`).set(...auth(scout.token));
    const withNoToken = await request(app).get(`/api/v1/ages/${ageGroup._id}`);

    expect(withScout.status).toBe(403);
    expect(withNoToken.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-007 — full userRouter.js surface, 14 operations, DENY for all
// ═══════════════════════════════════════════════════════════════════════════
describe('users domain (FR-007) — all 14 operations denied to proScout', () => {
  const userRouterOperations = [
    ['get', '/api/v1/users/deactivated'],
    ['get', '/api/v1/users'],
    ['post', '/api/v1/users'],
    ['get', () => `/api/v1/users/${admin.user._id}`],
    ['patch', () => `/api/v1/users/${admin.user._id}`],
    ['delete', () => `/api/v1/users/${admin.user._id}`],
    ['patch', () => `/api/v1/users/${admin.user._id}/changePassword`],
    ['delete', () => `/api/v1/users/${admin.user._id}/force`],
    ['patch', () => `/api/v1/users/${admin.user._id}/restore`],
    ['patch', () => `/api/v1/users/${admin.user._id}/profileImg`],
    ['patch', () => `/api/v1/users/${admin.user._id}/idCardImg/front`],
    ['patch', () => `/api/v1/users/${admin.user._id}/idCardImg/back`],
    ['get', () => `/api/v1/users/${admin.user._id}/idCardImg`],
    ['get', () => `/api/v1/users/${admin.user._id}/idcard/front`],
  ];

  it.each(userRouterOperations)('%s %s -> 403', async (method, pathOrFn) => {
    const path = typeof pathOrFn === 'function' ? pathOrFn() : pathOrFn;
    const res = await request(app)[method](path).set(...auth(scout.token));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-008 — the one observer-specific route outside the general user surface
// ═══════════════════════════════════════════════════════════════════════════
describe('observer-assignment endpoint (FR-008)', () => {
  it('PATCH /players/:id/observers is denied to proScout (admin-only)', async () => {
    // Nonexistent id is fine — allowedTo runs before ownership/existence checks,
    // so the 403 must occur before the id is ever resolved.
    const res = await request(app)
      .patch('/api/v1/players/000000000000000000000000/observers')
      .set(...auth(scout.token))
      .send({ observers: [] });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-009 — coachEvaluations (10 ops) and observerEvaluations (9 ops)
// ═══════════════════════════════════════════════════════════════════════════
describe('coachEvaluations domain (FR-009) — all 10 operations denied to proScout', () => {
  const fakeId = '000000000000000000000000';
  const coachEvaluationOperations = [
    ['get', '/api/v1/coachEvaluations'],
    ['post', '/api/v1/coachEvaluations'],
    ['get', '/api/v1/coachEvaluations/summary'],
    ['get', '/api/v1/coachEvaluations/monthly'],
    ['patch', `/api/v1/coachEvaluations/${fakeId}/publish`],
    ['patch', `/api/v1/coachEvaluations/${fakeId}/archive`],
    ['patch', `/api/v1/coachEvaluations/${fakeId}/refresh-stats`],
    ['get', `/api/v1/coachEvaluations/${fakeId}`],
    ['patch', `/api/v1/coachEvaluations/${fakeId}`],
    ['delete', `/api/v1/coachEvaluations/${fakeId}`],
  ];

  it.each(coachEvaluationOperations)('%s %s -> 403', async (method, path) => {
    const res = await request(app)[method](path).set(...auth(scout.token));
    expect(res.status).toBe(403);
  });
});

describe('observerEvaluations domain (FR-009) — all 9 operations denied to proScout', () => {
  const fakeId = '000000000000000000000000';
  const observerEvaluationOperations = [
    ['get', '/api/v1/observerEvaluations'],
    ['post', '/api/v1/observerEvaluations'],
    ['get', '/api/v1/observerEvaluations/summary'],
    ['patch', `/api/v1/observerEvaluations/${fakeId}/publish`],
    ['patch', `/api/v1/observerEvaluations/${fakeId}/archive`],
    ['patch', `/api/v1/observerEvaluations/${fakeId}/refresh-stats`],
    ['get', `/api/v1/observerEvaluations/${fakeId}`],
    ['patch', `/api/v1/observerEvaluations/${fakeId}`],
    ['delete', `/api/v1/observerEvaluations/${fakeId}`],
  ];

  it.each(observerEvaluationOperations)('%s %s -> 403', async (method, path) => {
    const res = await request(app)[method](path).set(...auth(scout.token));
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FR-011 — scope-relevant query params cannot bypass the role gate itself.
// These four domains are entirely DENY (not SCOPED) for proScout, so there is
// no scope to widen — the query param must not even reach the role check.
// ═══════════════════════════════════════════════════════════════════════════
describe('query-param widening does not bypass the role gate (FR-011)', () => {
  it('GET /users?keyword=<self> is still denied', async () => {
    const res = await request(app)
      .get(`/api/v1/users?keyword=${encodeURIComponent(scout.user.name)}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('GET /coachEvaluations?coach=<self id> is still denied', async () => {
    const res = await request(app)
      .get(`/api/v1/coachEvaluations?coach=${scout.user._id}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('GET /observerEvaluations?observer=<self id> is still denied', async () => {
    const res = await request(app)
      .get(`/api/v1/observerEvaluations?observer=${scout.user._id}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('POST /ages with a body impersonating an existing age group is still denied', async () => {
    const res = await request(app)
      .post('/api/v1/ages?force=true')
      .set(...auth(scout.token))
      .send({ name: '2016', birthYear: 2016 });
    expect(res.status).toBe(403);
  });
});
