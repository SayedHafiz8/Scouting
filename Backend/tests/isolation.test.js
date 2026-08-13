import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import {
  createAdmin, createCoach, createObserver, createPlayer, seedAgeGroups,
} from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  Cross-tenant isolation contract for ApiFeature.filter()
//  Every case here is a proven leak (B1/B2). Do not weaken without a security review.
// ══════════════════════════════════════════════════════════════════════════════
describe('Data isolation — GET /api/v1/players', () => {
  beforeEach(seedAgeGroups);

  // helper: coach A (1 player), coach B (1 player)
  async function twoCoaches() {
    const { token: adminToken } = await createAdmin({ email: 'iso_admin@test.com' });
    const a = await createCoach({ email: 'iso_a@test.com' });
    const b = await createCoach({ email: 'iso_b@test.com' });
    const alpha = await createPlayer(a.token, { name: 'Alpha Own' });
    const bravo = await createPlayer(b.token, { name: 'Bravo Secret' });
    return { adminToken, a, b, alpha, bravo };
  }

  it('B1: coach A filtering by ?coach=<coachB> gets their OWN players, never B\'s', async () => {
    const { a, b } = await twoCoaches();

    const res = await request(app)
      .get(`/api/v1/players?coach=${b.user._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toContain('Alpha Own');        // own data still returned
    expect(names).not.toContain('Bravo Secret'); // the leak
    expect(res.body.data.documents.every((p) => String(p.coach?._id ?? p.coach) === String(a.user._id))).toBe(true);
  });

  it('B1: observer filtering by ?coach=<coachB> only ever sees players assigned to them', async () => {
    const { adminToken, b, bravo } = await twoCoaches();
    const obs = await createObserver({ email: 'iso_obs@test.com' });
    await createPlayer(b.token, { name: 'Bravo Unassigned' });

    await request(app)
      .patch(`/api/v1/players/${bravo._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obs.user._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players?coach=${b.user._id}`)
      .set('Authorization', `Bearer ${obs.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(['Bravo Secret']);          // only the assigned one
    expect(names).not.toContain('Bravo Unassigned');
  });

  it('coach cannot probe the observers array via ?observers= (maskObservedForCoach oracle)', async () => {
    const { adminToken, a } = await twoCoaches();
    const obs = await createObserver({ email: 'iso_obs2@test.com' });
    const watched = await createPlayer(a.token, { name: 'Watched' });
    await createPlayer(a.token, { name: 'Unwatched' });

    await request(app)
      .patch(`/api/v1/players/${watched._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obs.user._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players?observers=${obs.user._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    // the param must be ignored — the coach still sees ALL their players, not just the watched one
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Watched', 'Unwatched', 'Alpha Own']));
    expect(res.body.data.documents.every((p) => p.observers === undefined)).toBe(true);
  });

  // ── §9 — سنتينل ?coach=none (اللاعبين اليتامى) ──────────────────────────────
  // الفلتر ده أدمن-فقط بحكم PLAYER_ADMIN_ONLY_LENSES. التستات دي بتثبت إنه
  // مابيوسّعش رؤية أي دور تاني، لا ناحية اليتامى ولا ناحية لاعبين كوتش تاني.
  async function orphanFixture() {
    const { adminToken, a, b } = await twoCoaches();
    // كوتش تالت بيتمسح نهائياً → لاعبه بيبقى يتيم
    const gone = await createCoach({ email: 'iso_gone@test.com' });
    await createPlayer(gone.token, { name: 'Orphan Kid' });
    await request(app)
      .delete(`/api/v1/users/${gone.user._id}/force`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    return { adminToken, a, b };
  }

  it('coach sending ?coach=none still gets exactly their own players', async () => {
    const { a } = await orphanFixture();

    const res = await request(app)
      .get('/api/v1/players?coach=none')
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    // السنتينل اتلغى بالكامل: لا اليتيم ظهر، ولا لاعب الكوتش التاني، ولا
    // القايمة رجعت فاضية (يعني الفلتر ماتطبقش على سكوب الملكية)
    expect(names).toEqual(['Alpha Own']);
    expect(names).not.toContain('Orphan Kid');
    expect(names).not.toContain('Bravo Secret');
  });

  it('observer sending ?coach=none only ever sees players assigned to them', async () => {
    const { adminToken, b } = await orphanFixture();
    const obs = await createObserver({ email: 'iso_obs3@test.com' });
    const mine = await createPlayer(b.token, { name: 'Assigned To Obs' });
    await request(app)
      .patch(`/api/v1/players/${mine._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obs.user._id.toString()] });

    const res = await request(app)
      .get('/api/v1/players?coach=none')
      .set('Authorization', `Bearer ${obs.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['Assigned To Obs']);
  });

  it('the sentinel cannot be smuggled past the lens with a different casing or type', async () => {
    const { a } = await orphanFixture();

    for (const attempt of ['none', 'NONE', 'null', '']) {
      const res = await request(app)
        .get(`/api/v1/players?coach=${attempt}`)
        .set('Authorization', `Bearer ${a.token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.documents.map((p) => p.name)).toEqual(['Alpha Own']);
    }
  });

  it('admin — and only admin — can list the orphaned players', async () => {
    const { adminToken } = await orphanFixture();

    const res = await request(app)
      .get('/api/v1/players?coach=none')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(['Orphan Kid']);
    expect(res.body.data.documents.every((p) => !p.coach)).toBe(true);
  });

  // ── §11 — البحث بالبادئة بيتراكب فوق سكوب الملكية، مابيستبدلوش ────────────
  it('a coach searching still only ever sees their own players', async () => {
    const { a, b } = await twoCoaches();
    // نفس البادئة عند الكوتشين — لو الـsearch حل محل سكوب الملكية بدل ما
    // يتراكب فوقه، لاعب الكوتش التاني هيظهر هنا
    await createPlayer(a.token, { name: 'Kareem Own' });
    await createPlayer(b.token, { name: 'Kareem Secret' });

    const res = await request(app)
      .get('/api/v1/players?keyword=kareem')
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(['Kareem Own']);
    expect(names).not.toContain('Kareem Secret');
  });

  it('search combined with ?coach=<other> still cannot widen the scope', async () => {
    const { a, b } = await twoCoaches();
    await createPlayer(b.token, { name: 'Kareem Secret' });

    const res = await request(app)
      .get(`/api/v1/players?keyword=kareem&coach=${b.user._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    // عدسة الـcoach أدمن-فقط بتتشال، والملكية بتتحط آخر حاجة → صفر نتايج
    expect(res.body.data.documents).toEqual([]);
  });

  it('an observer searching only sees players assigned to them', async () => {
    const { adminToken, b, bravo } = await twoCoaches();
    const obs = await createObserver({ email: 'iso_obs_search@test.com' });
    await createPlayer(b.token, { name: 'Bravo Unassigned' });

    await request(app)
      .patch(`/api/v1/players/${bravo._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obs.user._id.toString()] });

    const res = await request(app)
      .get('/api/v1/players?keyword=bravo')
      .set('Authorization', `Bearer ${obs.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['Bravo Secret']);
  });

  it('a non-whitelisted query key cannot inject a filter', async () => {
    const { a } = await twoCoaches();
    await createPlayer(a.token, { name: 'Cairo Kid', city: 'Cairo' });
    await createPlayer(a.token, { name: 'Giza Kid', city: 'Giza' });

    const res = await request(app)
      .get('/api/v1/players?city=Cairo')
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(['Cairo Kid', 'Giza Kid'])); // key dropped, not applied
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Nested mount: /users/:id/players  (zero coverage before this change)
// ══════════════════════════════════════════════════════════════════════════════
describe('Data isolation — GET /api/v1/users/:id/players (nested mount)', () => {
  beforeEach(seedAgeGroups);

  it('B2: coach A hitting /users/<coachB>/players gets their own players, never B\'s', async () => {
    const a = await createCoach({ email: 'nest_a@test.com' });
    const b = await createCoach({ email: 'nest_b@test.com' });
    await createPlayer(a.token, { name: 'AlphaNested' });
    await createPlayer(b.token, { name: 'BravoNested' });

    const res = await request(app)
      .get(`/api/v1/users/${b.user._id}/players`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).not.toContain('BravoNested');
    expect(names).toEqual(['AlphaNested']);
  });

  it('B2: observer hitting /users/<coachB>/players sees only players assigned to them', async () => {
    const { token: adminToken } = await createAdmin({ email: 'nest_admin@test.com' });
    const b = await createCoach({ email: 'nest_b2@test.com' });
    const obs = await createObserver({ email: 'nest_obs@test.com' });

    const assigned = await createPlayer(b.token, { name: 'BravoObsAssigned' });
    await createPlayer(b.token, { name: 'BravoObsHidden' });

    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obs.user._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/users/${b.user._id}/players`)
      .set('Authorization', `Bearer ${obs.token}`);

    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((p) => p.name);
    expect(names).toEqual(['BravoObsAssigned']);
    expect(names).not.toContain('BravoObsHidden');
  });

  it('admin hitting /users/<coachB>/players still gets exactly B\'s players', async () => {
    const { token: adminToken } = await createAdmin({ email: 'nest_admin2@test.com' });
    const a = await createCoach({ email: 'nest_a3@test.com' });
    const b = await createCoach({ email: 'nest_b3@test.com' });
    await createPlayer(a.token, { name: 'NotBravos' });
    await createPlayer(b.token, { name: 'BravosOwn' });

    const res = await request(app)
      .get(`/api/v1/users/${b.user._id}/players`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['BravosOwn']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  /teams/:id/players — dead mount, deleted as part of this fix. Must 404.
// ══════════════════════════════════════════════════════════════════════════════
describe('/api/v1/teams/:id/players — dead mount removed', () => {
  it('no longer exists as a route', async () => {
    const { token } = await createCoach({ email: 'dead_mount@test.com' });

    const res = await request(app)
      .get('/api/v1/teams/507f1f77bcf86cd799439011/players')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});
