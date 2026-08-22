import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { createProScout } from '../helpers/factory.js';
import Player from '../../models/playedModel.js';

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
  // Phase 3 (docs/scout-pro-plan-v2.md, navigation) — US4/FR-012/FR-014: this
  // 403 is also what backs the frontend's Observers area. observer-list.component.ts
  // injects the same UserService as the Coaches/Users page and has no endpoint of
  // its own (contracts/navigation-matrix.md §4 in specs/004-role-based-navigation/),
  // so one test covers both menu entries' server-side refusal.
  it('GET /users (admin-only) → 403', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // ── Stage 1 deferral: RESOLVED in Stage 2 ──────────────────────────────────
  // Stage 1 kept /players/counts, /players/reports/average-ratings and
  // GET /seasonMatches at 403 because none of them scoped through the central
  // layer — each branched per-role in an if/else and fell through for any role it
  // did not name. Stage 2 moved all three onto services/scope.js, so the gates are
  // now open and the results are scoped; see specs/003-proscout-data-scope/.
  //
  // Correction to Stage 1's stated reason: only TWO of the three fell through to a
  // genuinely UNFILTERED query ({} — every document). getCountsByAgeGroup and
  // seasonMatchBaseFilterFor did; getAverageRatingsForPlayers did NOT — it already
  // restricted every non-admin to their own authored reports, so it was scoped, just
  // on the wrong axis (report authorship, not player league). The ordering rule
  // (scope first, then open the gate) was load-bearing for two and belt-and-braces
  // for the third. See research.md R6.
  //
  // Scoped behavior itself is covered in tests/roles/proScoutDataScope.test.js;
  // these two only assert the gate is no longer closed.
  it('GET /players/counts → reachable and scoped (Stage-2 gate opened)', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players/counts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0); // no professional-league data seeded here
  });

  it('GET /players/reports/average-ratings → reachable and scoped (Stage-2 gate opened)', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.averages).toEqual({});
  });

  it('GET /seasonMatches → reachable and scoped (Stage-2 gate opened)', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0); // no professional-league matches seeded here
  });

  it('POST /players → reachable, no longer role-gated (Stage-4 gate opened)', async () => {
    // المرحلة 1 كانت بتأكد 403 هنا لأن الحد كان allowedTo("coach") بس. المرحلة 4
    // فتحته للـproScout بعد ما اتظبطت التلات طبقات: teamExistsInScope في
    // createValidate، وdelete req.body.coach في الكنترولر، وlockField على الباقي.
    // الـ400 دي من الـvalidation (الـbody ناقص) — المهم إنها **مش 403**، يعني
    // البوابة اتفتحت. السلوك الكامل في tests/roles/proScoutPlayersWrite.test.js.
    const { token } = await createProScout();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Incomplete Payload' });

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(400);
    expect(await Player.countDocuments()).toBe(0);
  });

  it('POST /players/:playerId/reports → reachable, guarded per-document (Stage-4 gate opened)', async () => {
    // نفس القصة: المرحلة 4 فتحت الحد، وcheckPlayerOwnership بقى هو اللي بيحكم.
    // لاعب مش موجود → 404 من الحارس، مش 403 من البوابة.
    const { token } = await createProScout();

    const res = await request(app)
      .post('/api/v1/players/000000000000000000000000/reports')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).not.toBe(403);
    expect(res.status).toBe(404);
  });
});

// Stage-1 contract C6 — CLOSED by Stage 2.
// (Note the two numbering schemes: "C6" here is a Stage-1 spec contract item, not
// a Constitution constraint — those run C-1…C-5.)
//
// Stage 1 recorded GET /teams as a known exception: it carries protect but no
// allowedTo, so any authenticated role saw every team, unscoped. Stage 2 adds a
// league base filter to gettingAll(Team, …) and a checkTeamScope guard on
// /teams/:id, so the role now sees professional-league teams only.
// Scoped behavior is covered in tests/roles/proScoutDataScope.test.js.
describe('proScout — GET /teams is now league-scoped (US3, FR-005, Stage-1 contract C6 closed)', () => {
  it('returns 200, and the list is scoped rather than the full team table', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // no professional-league teams seeded here → scoped list is empty, whereas
    // before Stage 2 this returned every team in the database
    expect(res.body.data.documents).toEqual([]);
  });
});

// Phase 3 (docs/scout-pro-plan-v2.md, navigation) — US4/FR-014, Constitution C-3 /
// TODO(AGES_UNAUTHENTICATED_READ). Unlike every other area behind the sidebar, the
// age-groups area's GET /ages and GET /ages/:id (Backend/routes/ageGroupRouter.js:113,116)
// carry NO `protect` at all, so there is no req.user for allowedTo to reject.
// This is a KNOWN, ACCEPTED gap tracked as tech debt outside this plan's scope by
// owner decision (docs/scout-pro-plan-v2.md, "Tech debt مسجّل", item 1) — it is
// recorded here, not fixed, so the removal of the Age Groups menu entry for
// proScout is never mistaken for a locked door. If a future change adds `protect`
// here, this test will fail loudly and the tech-debt item should be closed
// deliberately at that point, not silently.
describe('proScout — GET /ages is NOT refused (documented gap, Constitution C-3)', () => {
  it('returns 200 for a proScout token — ageGroupRouter has no protect/allowedTo to deny it', async () => {
    const { token } = await createProScout();

    const res = await request(app)
      .get('/api/v1/ages')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('returns 200 with NO token at all — the route has no protect, for any caller', async () => {
    const res = await request(app).get('/api/v1/ages');

    expect(res.status).toBe(200);
  });
});
