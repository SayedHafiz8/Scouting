// specs/006-admin-professional-lens — Stage 4c: an admin's own gap-fix, not
// part of the original scout-pro plan. Stage 4b left professional players
// (isProfessional: true) with no ageGroup at all, so they belong to no
// age-group card and the admin had no intentional route to them. This file
// tests the one thing this stage adds: `isProfessional` as an ordinary,
// whitelisted list filter — never a new permission, never a scope change.
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import {
  seedAgeGroups,
  dobForAge,
  createAdmin,
  createCoach,
  createObserver,
  createProScout,
  createTeam,
  createPlayerDoc,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';
import Player from '../../models/playedModel.js';
import User from '../../models/userModel.js';

const auth = (token) => ['Authorization', `Bearer ${token}`];

let ageGroup;
let admin, coach, observer, scout;
let proTeam;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
  proTeam = await createTeam(ageGroup._id, { league: 'professional' });

  admin = await createAdmin();
  coach = await createCoach();
  observer = await createObserver();
  scout = await createProScout({ email: `lens_scout_${Date.now()}@test.com` });
});

// createPlayerDoc bypasses the create-controller's role-derivation of
// isProfessional (Stage 4's setUserIdToBody/create path) — same pattern
// proScoutPlayersWrite.test.js already uses for direct-DB fixtures. The
// professional birth-year floor (1996) is enforced by the model regardless
// of how the document reaches the DB, so dobForAge(28) must stay inside
// the professional window (1996-2019) as the "current year" moves.
const professionalPlayer = (overrides = {}) =>
  createPlayerDoc({
    isProfessional: true,
    dateOfBirth: dobForAge(28),
    team: proTeam._id,
    ...overrides,
  });

const youthPlayer = (overrides = {}) =>
  createPlayerDoc({ isProfessional: false, ...overrides });

// ═══════════════════════════════════════════════════════════════════════════
// T004 — US1 positive: admin sees exactly the professional players
// FR-001, FR-004
// ═══════════════════════════════════════════════════════════════════════════
describe('US1 — GET /players?isProfessional=true (admin) — FR-001', () => {
  it('returns exactly the professional players and none of the youth players', async () => {
    const pro = await professionalPlayer({ name: 'Pro Player' });
    await youthPlayer({ name: 'Youth Player' });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data.documents.map((d) => d._id)).toEqual([pro._id.toString()]);
  });

  it('?isProfessional=false returns exactly the youth players', async () => {
    await professionalPlayer({ name: 'Pro Player' });
    const youth = await youthPlayer({ name: 'Youth Player' });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=false')
      .set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data.documents.map((d) => d._id)).toEqual([youth._id.toString()]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T005 — US1 negative: a coach cannot widen scope with the filter, and
// FR-016's masks still apply on this direct-API path (the chip is
// admin-only per FR-010, so this is the only place FR-016 is observable)
// ═══════════════════════════════════════════════════════════════════════════
describe('US1 — a coach sending ?isProfessional=true stays inside their own scope — FR-003, SC-006', () => {
  it('receives an empty list when none of their own players are professional', async () => {
    await createPlayerDoc({ coach: coach.user._id, isProfessional: false, name: 'Coach Youth Player' });
    await professionalPlayer({ name: 'Someone Elses Pro Player' }); // no coach — not this coach's

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.data.documents).toEqual([]);
  });

  it('a coach with an own professional-flagged player sees only that player, with masks still applied (FR-016)', async () => {
    const mine = await createPlayerDoc({
      coach: coach.user._id,
      isProfessional: true,
      dateOfBirth: dobForAge(28),
      team: proTeam._id,
      status: 'observed',
      observers: [observer.user._id],
      name: 'Coach Pro Player',
    });
    await createPlayerDoc({ coach: coach.user._id, isProfessional: false, name: 'Coach Youth Player' });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(coach.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const doc = res.body.data.documents[0];
    expect(doc._id).toBe(mine._id.toString());
    // FR-016 — the coach mask (observed → pending, observers hidden) is not
    // bypassed by this filter. It is the same maskObservedForCoach() path
    // every other coach list response goes through.
    expect(doc.status).toBe('pending');
    expect(doc.observers).toBeUndefined();
  });

  it('an observer sending the filter is likewise confined to their own assigned players', async () => {
    const assigned = await createPlayerDoc({
      observers: [observer.user._id],
      isProfessional: true,
      dateOfBirth: dobForAge(28),
      team: proTeam._id,
      name: 'Assigned Pro Player',
    });
    await professionalPlayer({ name: 'Unassigned Pro Player' });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(observer.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.data.documents[0]._id).toBe(assigned._id.toString());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T006 — US1 no-op for proScout: their scope is already all-professional
// FR-010, FR-015
// ═══════════════════════════════════════════════════════════════════════════
describe('US1 — the filter is a no-op for proScout — FR-010, FR-015', () => {
  it('?isProfessional=true returns the same result as no filter — every player in scope already carries the flag', async () => {
    // Stage 11 — proScout scope is createdBy-only now (team membership alone
    // no longer grants visibility), so this fixture must be created by
    // `scout` to actually land in their scope; see the identical note in
    // proScoutDataScope.test.js.
    await professionalPlayer({ name: 'League Player', team: proTeam._id, createdBy: scout.user._id });
    await createPlayerDoc({ name: 'Scouts Own Orphan', team: null, createdBy: scout.user._id, isProfessional: true });

    const noFilter = await request(app).get('/api/v1/players').set(...auth(scout.token));
    const withTrue = await request(app).get('/api/v1/players?isProfessional=true').set(...auth(scout.token));

    const idsOf = (res) => res.body.data.documents.map((d) => d._id).sort();
    expect(idsOf(withTrue)).toEqual(idsOf(noFilter));
    expect(noFilter.body.count).toBe(2);
  });

  it('?isProfessional=false correctly narrows to nothing, without becoming an oracle for players outside scope', async () => {
    // Measured, not assumed: every player a proScout can create is flagged
    // isProfessional:true by the create controller (Stage 4b), so there is
    // no non-professional player *in this scope* for the filter to find.
    // This asserts the filter still applies as a real condition (empty, not
    // an error, not a silent fallback to the unfiltered set) rather than
    // being special-cased away for this role.
    await professionalPlayer({ name: 'League Player', team: proTeam._id });
    await createPlayerDoc({ name: 'Scouts Own Orphan', team: null, createdBy: scout.user._id, isProfessional: true });

    const res = await request(app).get('/api/v1/players?isProfessional=false').set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T007 — cast safety: an invalid value must not silently widen the result
// ═══════════════════════════════════════════════════════════════════════════
describe('US1 — cast safety for isProfessional — plan.md risk: "a silent cast failure fails open"', () => {
  it('a value that cannot cast to Boolean is rejected (400), never silently widened to the unfiltered set', async () => {
    await professionalPlayer({ name: 'Pro Player' });
    await youthPlayer({ name: 'Youth Player' });

    const unfiltered = await request(app).get('/api/v1/players').set(...auth(admin.token));
    const invalid = await request(app)
      .get('/api/v1/players?isProfessional=notabool')
      .set(...auth(admin.token));

    expect(unfiltered.body.count).toBe(2);
    // Measured: mongoose's Boolean cast throws a CastError for a string that
    // isn't one of its recognised true/false forms, and the project's global
    // error middleware (middlewares/errorMiddleware.js `handelCastError`)
    // turns that into 400 — the same mechanism every other Boolean/ObjectId
    // filter in this codebase already relies on, not something Stage 4c
    // introduces. This is the safe direction: a rejection, never a silent
    // fallback to the wider, unfiltered result.
    expect(invalid.status).toBe(400);
  });

  it('recognised boolean-like strings ("true"/"false") both cast correctly', async () => {
    const pro = await professionalPlayer({ name: 'Pro Player' });
    const youth = await youthPlayer({ name: 'Youth Player' });

    const withTrue = await request(app).get('/api/v1/players?isProfessional=true').set(...auth(admin.token));
    const withFalse = await request(app).get('/api/v1/players?isProfessional=false').set(...auth(admin.token));

    expect(withTrue.body.data.documents.map((d) => d._id)).toEqual([pro._id.toString()]);
    expect(withFalse.body.data.documents.map((d) => d._id)).toEqual([youth._id.toString()]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T008 — GET /players/counts carries an explicit `professional` value
// FR-005, FR-006
// ═══════════════════════════════════════════════════════════════════════════
describe('GET /players/counts — professional count — FR-005, FR-006', () => {
  it('reports the professional count within scope, derived from the flag', async () => {
    await professionalPlayer();
    await professionalPlayer();
    await youthPlayer();

    const res = await request(app).get('/api/v1/players/counts').set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.data.professional).toBe(2);
    expect(res.body.data.total).toBe(3);
  });

  it('a player whose ageGroup is missing for an unrelated reason is NOT counted as professional', async () => {
    // Regression guard for the rejected "total - Σ counts" approach (plan.md
    // D-2). ageGroup is always derived for a non-professional player on save
    // (playedModel.js pre('save')), so to simulate legacy/malformed data with
    // no ageGroup we go around the hook entirely: Player.updateOne() runs the
    // 'updateOne' query middleware, not 'findOneAndUpdate' — this model only
    // defines the latter, so the $unset below is never re-derived.
    await professionalPlayer();
    const legacy = await youthPlayer();
    await Player.updateOne({ _id: legacy._id }, { $unset: { ageGroup: 1 } });

    const res = await request(app).get('/api/v1/players/counts').set(...auth(admin.token));

    expect(res.body.data.professional).toBe(1);
    expect(res.body.data.total).toBe(2);
  });

  it('honours the same status filter as the age-group counts (FR-006)', async () => {
    await professionalPlayer({ status: 'selected' });
    await professionalPlayer({ status: 'pending' });

    const selectedOnly = await request(app)
      .get('/api/v1/players/counts?status=selected')
      .set(...auth(admin.token));

    expect(selectedOnly.body.data.professional).toBe(1);
    expect(selectedOnly.body.data.total).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T009 — non-regression: filter absent → byte-identical to pre-change
// behavior, for admin, coach and observer. FR-014, SC-005.
// ═══════════════════════════════════════════════════════════════════════════
describe('Non-regression — the filter absent leaves every existing role unchanged — FR-014, SC-005', () => {
  it('admin GET /players is unaffected', async () => {
    await professionalPlayer();
    await youthPlayer();

    const res = await request(app).get('/api/v1/players').set(...auth(admin.token));
    expect(res.body.count).toBe(2);
  });

  it('coach GET /players is unaffected', async () => {
    await createPlayerDoc({ coach: coach.user._id });
    await professionalPlayer(); // not this coach's — must not appear regardless

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));
    expect(res.body.count).toBe(1);
  });

  it('observer GET /players is unaffected', async () => {
    await createPlayerDoc({ observers: [observer.user._id] });
    await professionalPlayer();

    const res = await request(app).get('/api/v1/players').set(...auth(observer.token));
    expect(res.body.count).toBe(1);
  });

  it('admin GET /players/counts total is unaffected by the new professional field being present', async () => {
    await professionalPlayer();
    await youthPlayer();

    const res = await request(app).get('/api/v1/players/counts').set(...auth(admin.token));
    expect(res.body.data.total).toBe(2);
    expect(Object.values(res.body.data.counts).reduce((a, b) => a + b, 0)).toBe(1); // only the youth player buckets
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T019 — US2: isProfessional composes with keyword/pagination/sort through
// the same code path — no parallel query builder. FR-004.
// ═══════════════════════════════════════════════════════════════════════════
describe('US2 — isProfessional composes with search, sort and pagination — FR-004', () => {
  it('narrows by keyword within the professional-only result', async () => {
    await professionalPlayer({ name: 'Mo Salah' });
    await professionalPlayer({ name: 'Someone Else' });
    await youthPlayer({ name: 'Mo Youth' }); // matches keyword but not professional

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true&keyword=Mo')
      .set(...auth(admin.token));

    expect(res.body.count).toBe(1);
    expect(res.body.data.documents[0].name).toBe('Mo Salah');
  });

  it('paginates within the professional-only result without leaking a youth player onto any page', async () => {
    for (let i = 0; i < 3; i++) await professionalPlayer({ name: `Pro ${i}` });
    await youthPlayer({ name: 'Youth Filler' });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true&limit=2&page=1')
      .set(...auth(admin.token));

    expect(res.body.data.documents).toHaveLength(2);
    expect(res.body.data.documents.every((d) => d.name.startsWith('Pro'))).toBe(true);
    expect(res.body.pagination.next).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T035 / SC-004 — the decisive test. Before this stage, the admin's only
// route to professional players was the "No coach" lens, working purely as
// a side effect of Stage 4's R5 decision to leave `Player.coach` unset for
// proScout-created players (spec.md failure #3). This test removes that
// accident — assigns a coach to every professional player, exactly as a
// future coach-assignment feature would — and proves the new lens does not
// depend on it. If this fails, the gap this stage exists to close is not
// actually closed.
// ═══════════════════════════════════════════════════════════════════════════
describe('SC-004 — the professional lens does not depend on the "No coach" accident', () => {
  it('professional players stay reachable via ?isProfessional=true after a coach is assigned to every one of them', async () => {
    const pro1 = await professionalPlayer({ name: 'Pro One' });
    const pro2 = await professionalPlayer({ name: 'Pro Two' });
    // Coached, so it never appears in the "No coach" lens — isolates the
    // assertions below to the two professional (team-less) players.
    await youthPlayer({ name: 'Youth Player', coach: coach.user._id });

    // Today, before any coach is assigned, they show up in the "No coach" lens —
    // confirming the accidental route this stage must stop depending on.
    const beforeAssignment = await request(app)
      .get('/api/v1/players?coach=none')
      .set(...auth(admin.token));
    expect(beforeAssignment.body.data.documents.map((d) => d._id).sort())
      .toEqual([pro1._id.toString(), pro2._id.toString()].sort());

    // Simulate a future feature assigning a coach to every professional player —
    // exactly the regression spec.md warns about. Direct DB write, bypassing the
    // admin-only assignCoach workflow: this test only needs the resulting state,
    // not the assignment mechanism.
    await Player.updateOne({ _id: pro1._id }, { coach: coach.user._id });
    await Player.updateOne({ _id: pro2._id }, { coach: coach.user._id });

    // The accidental route is now gone.
    const afterAssignment = await request(app)
      .get('/api/v1/players?coach=none')
      .set(...auth(admin.token));
    expect(afterAssignment.body.count).toBe(0);

    // But the new, intentional lens still finds both of them — proving the
    // admin no longer silently depends on the "No coach" side effect.
    const viaLens = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(admin.token));
    expect(viaLens.body.data.documents.map((d) => d._id).sort())
      .toEqual([pro1._id.toString(), pro2._id.toString()].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// specs/010-professional-lens-creator (backlog 4d) — the responsible
// proScout's name on the Professional League lens, admin only.
// Player.createdBy has existed since Stage 2 but no endpoint populated it
// before this feature. T007-T012, T017-T018.
// ═══════════════════════════════════════════════════════════════════════════

// T007 — US1 positive: two distinct creators, correct name per player, FR-001
describe('specs/010 — GET /players exposes createdBy.name to admin only — FR-001, FR-002', () => {
  it('returns the correct creator name per player for two distinct proScout creators', async () => {
    const scoutA = await createProScout({ name: 'Scout Alpha', email: `scout_alpha_${Date.now()}@test.com` });
    const scoutB = await createProScout({ name: 'Scout Beta', email: `scout_beta_${Date.now()}@test.com` });
    const playerA = await professionalPlayer({ name: 'Player A', createdBy: scoutA.user._id });
    const playerB = await professionalPlayer({ name: 'Player B', createdBy: scoutB.user._id });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(admin.token));

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.documents.map((d) => [d._id, d]));
    expect(byId[playerA._id.toString()].createdBy.name).toBe('Scout Alpha');
    expect(byId[playerB._id.toString()].createdBy.name).toBe('Scout Beta');
  });

  it('exposes the name only — no email or other User field (FR-002)', async () => {
    const player = await professionalPlayer({ name: 'Solo Player', createdBy: scout.user._id });

    const res = await request(app)
      .get('/api/v1/players?isProfessional=true')
      .set(...auth(admin.token));

    const doc = res.body.data.documents.find((d) => d._id === player._id.toString());
    expect(doc.createdBy).toEqual({ _id: scout.user._id.toString(), name: 'Test Pro Scout' });
  });
});

// T008 — US1 negative: byte-identical for every non-admin role, FR-004, SC-003
//
// ⚠️ Corrected during implementation (see spec.md "Implementation note"):
// `createdBy` was never excluded by a `.select()` anywhere in this controller,
// so it was already present in every JSON response as a **raw ObjectId
// string** — for every role — since Stage 2, long before this feature. This
// feature's `.populate()` only resolves that string to `{ _id, name }`, and
// only when `req.user.role === ADMIN`. "Unaffected" for every other role
// therefore means the field stays a bare id string exactly as before, not
// that the key disappears — these tests assert that, using a player each
// role can actually see with `createdBy` genuinely set (the original
// assertions accidentally exercised only players lacking the field at all).
describe('specs/010 — createdBy stays an unpopulated raw id for every non-admin role — FR-004, SC-003', () => {
  it('coach: createdBy remains the bare id string, never resolved to a name', async () => {
    const player = await createPlayerDoc({
      coach: coach.user._id, createdBy: scout.user._id, name: 'Coach Player',
    });

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));
    expect(res.status).toBe(200);
    const doc = res.body.data.documents.find((d) => d._id === player._id.toString());
    expect(doc.createdBy).toBe(scout.user._id.toString());
  });

  it('observer: createdBy remains the bare id string, never resolved to a name', async () => {
    const player = await createPlayerDoc({
      observers: [observer.user._id], createdBy: scout.user._id, name: 'Observed Player',
    });

    const res = await request(app).get('/api/v1/players').set(...auth(observer.token));
    expect(res.status).toBe(200);
    const doc = res.body.data.documents.find((d) => d._id === player._id.toString());
    expect(doc.createdBy).toBe(scout.user._id.toString());
  });

  it('proScout: createdBy remains the bare id string, even on their own player', async () => {
    const player = await professionalPlayer({ name: 'Own Player', createdBy: scout.user._id, team: proTeam._id });

    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(res.status).toBe(200);
    const doc = res.body.data.documents.find((d) => d._id === player._id.toString());
    expect(doc.createdBy).toBe(scout.user._id.toString());
  });
});

// T009 — US1 boundary: GET /players/:id untouched for every role, FR-005
describe('specs/010 — GET /players/:id is unaffected for every role, including admin — FR-005', () => {
  it('admin GET /players/:id still returns the bare id string, never resolved to a name', async () => {
    const player = await professionalPlayer({ name: 'Detail Player', createdBy: scout.user._id });

    const res = await request(app).get(`/api/v1/players/${player._id}`).set(...auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.document.createdBy).toBe(scout.user._id.toString());
  });
});

// T011 — closes /speckit-analyze finding C1 (FR-006): the populate is
// role-gated, not lens-gated, so every other admin view of this endpoint
// must be unaffected beyond the additive field.
describe('specs/010 — other admin views of GET /players are unaffected beyond the additive field — FR-006', () => {
  it('the ordinary (non-lens) admin list returns the same players and same pre-existing field values', async () => {
    const pro = await professionalPlayer({ name: 'Pro Player', createdBy: scout.user._id });
    const youth = await youthPlayer({ name: 'Youth Player', coach: coach.user._id });

    const res = await request(app).get('/api/v1/players').set(...auth(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const byId = Object.fromEntries(res.body.data.documents.map((d) => [d._id, d]));
    expect(byId[pro._id.toString()].name).toBe('Pro Player');
    expect(byId[pro._id.toString()].status).toBe('pending');
    expect(byId[youth._id.toString()].name).toBe('Youth Player');
    expect(byId[youth._id.toString()].coach).toBeTruthy();
    // Additive only — createdBy is present for admin, nothing else changed shape.
    expect(byId[pro._id.toString()].createdBy.name).toBe('Test Pro Scout');
  });

  it('an existing filter (?status=) composes unaffected, with createdBy still attached', async () => {
    const selected = await professionalPlayer({ name: 'Selected Pro', status: 'selected', createdBy: scout.user._id });
    await professionalPlayer({ name: 'Pending Pro', status: 'pending', createdBy: scout.user._id });

    const res = await request(app).get('/api/v1/players?status=selected').set(...auth(admin.token));

    expect(res.body.count).toBe(1);
    expect(res.body.data.documents[0]._id).toBe(selected._id.toString());
    expect(res.body.data.documents[0].createdBy.name).toBe('Test Pro Scout');
  });
});

// T012 — closes /speckit-analyze finding C2 (FR-008): createdBy must not be
// a client-suppliable filter, guarding against a future PLAYER_FILTERS edit.
describe('specs/010 — createdBy is not a client-suppliable filter — FR-008', () => {
  it('?createdBy=<id> has no effect on the result set', async () => {
    await professionalPlayer({ name: 'Pro Player', createdBy: scout.user._id });
    await youthPlayer({ name: 'Youth Player' });

    const withoutParam = await request(app).get('/api/v1/players').set(...auth(admin.token));
    const withParam = await request(app)
      .get(`/api/v1/players?createdBy=${scout.user._id}`)
      .set(...auth(admin.token));

    const idsOf = (res) => res.body.data.documents.map((d) => d._id).sort();
    expect(idsOf(withParam)).toEqual(idsOf(withoutParam));
    expect(withParam.body.count).toBe(withoutParam.body.count);
  });
});

// T017/T018 — US2: a missing or deactivated creator degrades gracefully, FR-003
describe('specs/010 — a missing or deactivated creator degrades gracefully — FR-003', () => {
  it('a professional player with no createdBy has createdBy absent, no error, siblings unaffected', async () => {
    const orphan = await professionalPlayer({ name: 'No Creator Player' });
    const sibling = await professionalPlayer({ name: 'Sibling Player', createdBy: scout.user._id });

    const res = await request(app).get('/api/v1/players?isProfessional=true').set(...auth(admin.token));

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.documents.map((d) => [d._id, d]));
    expect(byId[orphan._id.toString()].createdBy).toBeFalsy();
    expect(byId[sibling._id.toString()].createdBy.name).toBe('Test Pro Scout');
  });

  it('a professional player whose creator was deactivated resolves createdBy to absent/null, not an error or leaked data', async () => {
    const player = await professionalPlayer({ name: 'Deactivated Creator Player', createdBy: scout.user._id });
    await User.findByIdAndUpdate(scout.user._id, { active: false }).setOptions({ bypassFilter: true });

    const res = await request(app).get('/api/v1/players?isProfessional=true').set(...auth(admin.token));

    expect(res.status).toBe(200);
    const doc = res.body.data.documents.find((d) => d._id === player._id.toString());
    expect(doc.createdBy).toBeFalsy();
  });
});
