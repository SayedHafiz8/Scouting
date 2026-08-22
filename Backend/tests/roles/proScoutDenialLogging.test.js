import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import {
  seedAgeGroups,
  createAdmin,
  createProScout,
  createTeam,
  createPlayerDoc,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';

// Stage 7 (hardening) — FR-016, SC-007: every denied proScout access attempt,
// at both layers (role gate and ownership/scope), is logged with the four
// required fields, proven by automated assertion — not manual log review.
//
// Deliberately spies on console.warn (the real sink) rather than mocking the
// accessLog module: Express restores req.params/req.baseUrl on the shared req
// object once a router layer finishes, so inspecting a captured `req`
// reference *after* the response completes reads stale, reset values — the
// entry object accessLog.js already serializes synchronously at call time
// does not have this problem, so asserting on the printed JSON is the
// faithful way to check what was actually logged.

const auth = (token) => ['Authorization', `Bearer ${token}`];

let scout, admin;
let warnSpy;

beforeEach(async () => {
  await seedAgeGroups();
  scout = await createProScout();
  admin = await createAdmin();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

function loggedEntries() {
  return warnSpy.mock.calls.map(([line]) => JSON.parse(line));
}

describe('role-gate denial logging (FR-016)', () => {
  it('logs exactly once with userId, role, path, and null resourceId for a collection-route denial', async () => {
    const res = await request(app).get('/api/v1/users').set(...auth(scout.token));
    expect(res.status).toBe(403);

    const entries = loggedEntries().filter((e) => e.event === 'role_denied');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: String(scout.user._id),
      role: 'proScout',
      resource: '/users',
      resourceId: null,
    });
    expect(entries[0].path).toContain('/api/v1/users');
  });

  it('logs exactly once with the resource id populated for a /:id-route denial', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${admin.user._id}`)
      .set(...auth(scout.token))
      .send({ name: 'x' });
    expect(res.status).toBe(403);

    const entries = loggedEntries().filter((e) => e.event === 'role_denied');
    expect(entries).toHaveLength(1);
    expect(entries[0].resourceId).toBe(String(admin.user._id));
  });

  it('does not log a role_denied entry on a request that is allowed', async () => {
    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(res.status).toBe(200);
    expect(loggedEntries().filter((e) => e.event === 'role_denied')).toHaveLength(0);
  });
});

describe('ownership/scope-layer denial logging (FR-016, unchanged Stage 2 path)', () => {
  it('logs exactly once via logScopeDenial for an out-of-scope player direct access', async () => {
    const ageGroup = await AgeGroup.findOne();
    const premierTeam = await createTeam(ageGroup._id, { league: 'premier' });
    const outOfScope = await createPlayerDoc({ team: premierTeam._id });

    const res = await request(app)
      .get(`/api/v1/players/${outOfScope._id}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);

    const entries = loggedEntries().filter((e) => e.event === 'scope_denied');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: String(scout.user._id),
      role: 'proScout',
      resource: 'player',
      resourceId: String(outOfScope._id),
    });
  });
});
