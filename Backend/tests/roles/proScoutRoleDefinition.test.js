import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { createProScout } from '../helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  Stage 1 (docs/scout-pro-plan-v2.md) — ProScout Role Definition
//  spec: specs/002-proscout-role-definition/spec.md
//
//  This stage is definitional only: proScout exists as a role, can authenticate,
//  and — because it is deliberately absent from every ownerFields map, allowedTo
//  allowlist, and ownership.js branch — sees zero data. No scope logic is added
//  here; these tests prove the *absence* of access, not any new grant.
// ══════════════════════════════════════════════════════════════════════════════

describe('proScout — login (US2, FR-003)', () => {
  it('logs in successfully and receives a valid access token + refresh cookie', async () => {
    const { token, cookie } = await createProScout();

    expect(token).toBeDefined();
    expect(cookie).toBeDefined();
    expect(cookie.some((c) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('the issued token authenticates on a subsequent request (protect accepts it)', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${token}`);

    // Authorization (empty result / 403 elsewhere) is a separate concern from
    // authentication — a 401 here would mean protect rejected the token itself.
    expect(res.status).not.toBe(401);
  });
});

describe('proScout — deny by default on GET /players (US3, FR-004, SC-002)', () => {
  it('GET /players returns 200 with an empty array, not an error', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data.documents).toEqual([]);
  });
});

describe('proScout — 403 on role-gated routes it is not listed for (US3, FR-004, SC-003)', () => {
  it('GET /users (admin-only) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // /players/counts, /players/reports/average-ratings, and GET /seasonMatches are
  // deliberately NOT added to allowedTo for proScout in this stage — unlike GET
  // /players, they scope access via ad-hoc per-role if/else branches rather than the
  // central ApiFeature/ownerFields layer, and fall through to an UNFILTERED query
  // ({} — all documents) for any role they don't explicitly branch on. Granting
  // proScout access here before that scoping is centralized would leak all players'
  // counts / all season matches, not return an empty result. They stay 403 until a
  // stage does that scoping work properly (Stage 2, or a dedicated fix).
  it('GET /players/counts (not yet centrally scoped) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players/counts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('GET /players/reports/average-ratings (not yet centrally scoped) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('GET /seasonMatches (not yet centrally scoped) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('POST /players (coach-only) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should Not Be Created' });

    expect(res.status).toBe(403);
  });

  it('POST /players/:playerId/reports (coach/observer-only) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .post('/api/v1/players/000000000000000000000000/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(403);
  });
});

describe('proScout — GET /teams accepted known exception (US3, FR-009, contract C6)', () => {
  it('returns 200 with the (unscoped) team list — documented pre-existing gap, closed in Stage 2', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
