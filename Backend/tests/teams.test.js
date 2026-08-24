import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import AgeGroup from '../models/ageGroupModel.js';
import { createCoach, createTeam, seedAgeGroups } from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/teams — behind protect since §10 (كانت عامة قبل كده). Covers the
//  ApiFeature.filter() rewrite: legitimate filtering must survive, and the one
//  live nested-params path (/ages/:id/teams) must keep working.
//
//  مفيش ownerFields على Team — دي داتا مرجعية مشتركة، فالتلات أدوار بيشوفوا نفس
//  القايمة. الـprotect هنا سطح تعرّض مش عزل.
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/teams (authenticated)', () => {
  beforeEach(seedAgeGroups);

  it('filters by ageGroup', async () => {
    const { token } = await createCoach();
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    const b = await AgeGroup.findOne({ birthYear: 2011 });
    await createTeam(a._id, { name: 'alpha team' });
    await createTeam(b._id, { name: 'bravo team' });

    const res = await request(app)
      .get(`/api/v1/teams?ageGroup=${a._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((t) => t.name)).toEqual(['alpha team']);
  });

  it('filters by league', async () => {
    const { token } = await createCoach();
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    await createTeam(a._id, { name: 'prem team', league: 'premier' });
    await createTeam(a._id, { name: 'pro team', league: 'professional' });

    const res = await request(app)
      .get('/api/v1/teams?league=professional')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((t) => t.name)).toEqual(['pro team']);
  });

  it('an authenticated listing returns every active team', async () => {
    const { token } = await createCoach();
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    await createTeam(a._id, { name: 'team one' });
    await createTeam(a._id, { name: 'team two' });

    const res = await request(app)
      .get('/api/v1/teams')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
  });
});

// §10 — الراوتات دي كانت مفتوحة لأي حد على الإنترنت
describe('GET /api/v1/teams requires authentication', () => {
  beforeEach(seedAgeGroups);

  it('401s the anonymous listing', async () => {
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    await createTeam(a._id, { name: 'secret team' });

    const res = await request(app).get('/api/v1/teams');

    expect(res.status).toBe(401);
    expect(res.text).not.toMatch(/secret team/);
  });

  it('401s a single team by id', async () => {
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    const team = await createTeam(a._id, { name: 'secret team' });

    const res = await request(app).get(`/api/v1/teams/${team._id}`);

    expect(res.status).toBe(401);
    expect(res.text).not.toMatch(/secret team/);
  });

  it('401s the nested /ages/:id/teams mount too', async () => {
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    await createTeam(a._id, { name: 'secret team' });

    const res = await request(app).get(`/api/v1/ages/${a._id}/teams`);

    expect(res.status).toBe(401);
  });

  // audit fix S2 — /ages closed TODO(AGES_UNAUTHENTICATED_READ) (constitution v1.3.0,
  // C-3). It no longer stays public; it now requires the same authentication as
  // every other endpoint. See tests/teams.test.js's own 'GET /api/v1/ages' describe
  // block below for the full behavior, and proScoutHardeningNegative.test.js for the
  // explicit-deny assertion this closes for the new role.
  it('401s the anonymous /ages listing too, now that TODO(AGES_UNAUTHENTICATED_READ) is closed', async () => {
    const res = await request(app).get('/api/v1/ages');
    expect(res.status).toBe(401);
  });
});

// The ONLY legitimate use of the nested-param branch in ApiFeature — must never regress.
describe('GET /api/v1/ages/:id/teams (nested mount)', () => {
  beforeEach(seedAgeGroups);

  it('scopes teams to the age group in the URL', async () => {
    const { token } = await createCoach();
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    const b = await AgeGroup.findOne({ birthYear: 2011 });
    await createTeam(a._id, { name: 'a-group team' });
    await createTeam(b._id, { name: 'b-group team' });

    const res = await request(app)
      .get(`/api/v1/ages/${a._id}/teams`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((t) => t.name)).toEqual(['a-group team']);
  });

  it('a conflicting ?ageGroup= query param cannot override the URL segment', async () => {
    const { token } = await createCoach();
    const a = await AgeGroup.findOne({ birthYear: 2010 });
    const b = await AgeGroup.findOne({ birthYear: 2011 });
    await createTeam(a._id, { name: 'a-group team' });
    await createTeam(b._id, { name: 'b-group team' });

    const res = await request(app)
      .get(`/api/v1/ages/${a._id}/teams?ageGroup=${b._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((t) => t.name)).toEqual(['a-group team']);
  });
});

// audit fix S2 — TODO(AGES_UNAUTHENTICATED_READ) closed (constitution v1.3.0, C-3).
// GET /ages and GET /ages/:id now require protect + allowedTo(admin, coach, observer),
// same as every other read in the project. Existing roles keep the exact same
// response for the exact same request — only "no token at all" and "proScout"
// behavior changed, and both changes were the point (Principle II: the new role
// was always supposed to be denied here; it just couldn't be, mechanically,
// without `protect` first).
describe('GET /api/v1/ages (authenticated — S2/C-3)', () => {
  beforeEach(seedAgeGroups);

  it('returns all age groups sorted by birthYear, for an authenticated coach', async () => {
    const { token } = await createCoach();
    const res = await request(app)
      .get('/api/v1/ages')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(11);
    const years = res.body.data.documents.map((g) => g.birthYear);
    expect(years).toEqual([...years].sort((x, y) => x - y));
  });

  it('401s with no token at all', async () => {
    const res = await request(app).get('/api/v1/ages');
    expect(res.status).toBe(401);
  });
});
