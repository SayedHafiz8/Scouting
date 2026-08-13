import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import Player from '../models/playedModel.js';
import { createAdmin, createCoach, createObserver, createPlayer, playerPayload, seedAgeGroups, dobForAge } from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/players  — create player
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/players', () => {
  beforeEach(seedAgeGroups);

  it('coach creates player with valid data', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload());

    expect(res.status).toBe(201);
    expect(res.body.data.document.name).toBe('Ahmed Ali');
    expect(res.body.data.document.coach).toBeDefined();
    expect(res.body.data.document.ageGroup).toBeDefined();
  });

  it('auto-assigns ageGroup from dateOfBirth', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ dateOfBirth: dobForAge(12) }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.ageGroup).toBeTruthy();
  });

  it('default status is pending', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload());

    expect(res.body.data.document.status).toBe('pending');
  });

  it('admin cannot create a player (coach-only route)', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload());

    expect(res.status).toBe(403);
  });

  it('returns 4xx for player younger than 8', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ dateOfBirth: dobForAge(6) }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 4xx for player older than 18', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ dateOfBirth: dobForAge(20) }));

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 400 for invalid position', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ position: 'INVALID_POSITION' }));

    expect(res.status).toBe(400);
  });

  it('returns 400 when required field name is missing', async () => {
    const { token } = await createCoach();
    const { name: _, ...rest } = playerPayload();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(rest);

    expect(res.status).toBe(400);
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .send(playerPayload());

    expect(res.status).toBe(401);
  });

  it('accepts a free-text teamName when the team is not in the registered teams list', async () => {
    const { token } = await createCoach();

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ teamName: 'Street FC' }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.teamName).toBe('Street FC');
    expect(res.body.data.document.team).toBeFalsy();
  });

  it('rejects sending both team and teamName together', async () => {
    const { token } = await createCoach();
    const ageGroup = await request(app).get('/api/v1/ages').set('Authorization', `Bearer ${token}`);
    const group = ageGroup.body.data.documents.find(g => g.birthYear === new Date(dobForAge(14)).getFullYear());
    const team = await request(app)
      .post('/api/v1/teams')
      .set('Authorization', `Bearer ${(await createAdmin()).token}`)
      .send({ name: 'Real Team', ageGroup: group._id, clubName: 'Real Club', league: 'premier' });

    const res = await request(app)
      .post('/api/v1/players')
      .set('Authorization', `Bearer ${token}`)
      .send(playerPayload({ team: team.body.data.document._id, teamName: 'Street FC' }));

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players  — list players
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players', () => {
  beforeEach(seedAgeGroups);

  it('coach only sees own players', async () => {
    const { token: coach1Token } = await createCoach();
    const { token: coach2Token } = await createCoach();

    await createPlayer(coach1Token);
    await createPlayer(coach1Token);
    await createPlayer(coach2Token);

    const res = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${coach1Token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
  });

  // §9 — ?coach=none بيلمّ اللاعبين اللي كوتشهم اتمسح نهائياً. من غيره الأدمن
  // مالوش أي طريقة يلاقيهم عشان يعيّنلهم كوتش من PATCH /players/:id/coach.
  describe('?coach=none — orphaned players lens', () => {
    async function fixture() {
      const { token: adminToken } = await createAdmin({ email: 'orphan_admin@test.com' });
      const kept = await createCoach({ email: 'orphan_kept@test.com' });
      const gone = await createCoach({ email: 'orphan_gone@test.com' });
      await createPlayer(kept.token, { name: 'Has Coach' });
      await createPlayer(gone.token, { name: 'Orphan One' });
      await createPlayer(gone.token, { name: 'Orphan Two' });
      await request(app)
        .delete(`/api/v1/users/${gone.user._id}/force`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
      return { adminToken, kept };
    }

    it('returns only the players whose coach field is empty', async () => {
      const { adminToken } = await fixture();

      const res = await request(app)
        .get('/api/v1/players?coach=none')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents.map((p) => p.name).sort()).toEqual(['Orphan One', 'Orphan Two']);
    });

    it('excludes them from a normal unfiltered listing check', async () => {
      const { adminToken } = await fixture();

      const all = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`);

      // الافتراضي لسه بيرجّع الكل — الفلتر اختياري مش سلوك جديد افتراضي
      expect(all.body.data.documents.map((p) => p.name).sort())
        .toEqual(['Has Coach', 'Orphan One', 'Orphan Two']);
    });

    it('filtering by a real coach id still excludes the orphans', async () => {
      const { adminToken, kept } = await fixture();

      const res = await request(app)
        .get(`/api/v1/players?coach=${kept.user._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.data.documents.map((p) => p.name)).toEqual(['Has Coach']);
    });

    it('combines with other filters instead of replacing them', async () => {
      const { adminToken } = await fixture();

      const res = await request(app)
        .get('/api/v1/players?coach=none&status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents.map((p) => p.name).sort()).toEqual(['Orphan One', 'Orphan Two']);

      const none = await request(app)
        .get('/api/v1/players?coach=none&status=selected')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(none.body.data.documents).toEqual([]);
    });

    it('an assigned coach removes the player from the orphan list', async () => {
      const { adminToken, kept } = await fixture();
      const orphan = (await request(app)
        .get('/api/v1/players?coach=none')
        .set('Authorization', `Bearer ${adminToken}`)).body.data.documents[0];

      await request(app)
        .patch(`/api/v1/players/${orphan._id}/coach`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ coach: kept.user._id.toString() })
        .expect(200);

      const res = await request(app)
        .get('/api/v1/players?coach=none')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.documents.map((p) => p.name)).not.toContain(orphan.name);
      expect(res.body.data.documents.length).toBe(1);
    });
  });

  it('admin sees all players', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();

    await createPlayer(coachToken);
    await createPlayer(coachToken);

    const res = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
  });

  it('admin can filter players by observer id (Observers page → View Assigned Players)', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { user: observer } = await createObserver();
    const other = await createPlayer(coachToken, { name: 'Not Assigned' });
    const assigned = await createPlayer(coachToken, { name: 'Assigned' });

    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players?observer=${observer._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
    expect(res.body.data.documents[0].name).toBe('Assigned');
  });

  it('supports filtering by status', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();

    const player = await createPlayer(coachToken);

    // Update one player status to selected via admin
    await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'selected' });

    const res = await request(app)
      .get('/api/v1/players?status=selected')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.every(p => p.status === 'selected')).toBe(true);
  });

  // §11 — البحث بقى بالبادئة على كلمات الاسم/المدينة المطبّعة بدل substring
  // غير مفهرس. التستات دي بتوثّق السلوك الجديد بالكامل.
  describe('prefix search', () => {
    it('supports search by name', async () => {
      const { token: coachToken } = await createCoach();
      await createPlayer(coachToken, { name: 'Zlatan Ibrahimovic' });
      await createPlayer(coachToken, { name: 'Lionel Messi' });

      const res = await request(app)
        .get('/api/v1/players?keyword=Zlatan')
        .set('Authorization', `Bearer ${coachToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents.map((p) => p.name)).toEqual(['Zlatan Ibrahimovic']);
    });

    it('matches a prefix of any word — including the surname', async () => {
      const { token } = await createCoach();
      await createPlayer(token, { name: 'Mohamed Salah' });
      await createPlayer(token, { name: 'Ahmed Hegazy' });

      // الاسم الأول
      const first = await request(app)
        .get('/api/v1/players?keyword=Moh')
        .set('Authorization', `Bearer ${token}`);
      expect(first.body.data.documents.map((p) => p.name)).toEqual(['Mohamed Salah']);

      // الاسم الأخير — ده اللي المصفوفة الـmultikey بتحله
      const last = await request(app)
        .get('/api/v1/players?keyword=Sal')
        .set('Authorization', `Bearer ${token}`);
      expect(last.body.data.documents.map((p) => p.name)).toEqual(['Mohamed Salah']);
    });

    it('is case-insensitive from the caller\'s point of view', async () => {
      const { token } = await createCoach();
      await createPlayer(token, { name: 'Mohamed Salah' });

      for (const kw of ['moh', 'MOH', 'MoH']) {
        const res = await request(app)
          .get(`/api/v1/players?keyword=${kw}`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.body.data.documents.length).toBe(1);
      }
    });

    it('no longer matches a mid-word fragment (deliberate behaviour change)', async () => {
      const { token } = await createCoach();
      await createPlayer(token, { name: 'Mohamed Salah' });

      // "hamed" جوه "Mohamed" — كانت بتلاقيه بالـsubstring القديم
      const res = await request(app)
        .get('/api/v1/players?keyword=hamed')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toEqual([]);
    });

    it('searches the city as well as the name', async () => {
      const { token } = await createCoach();
      await createPlayer(token, { name: 'Player One', city: 'Alexandria' });
      await createPlayer(token, { name: 'Player Two', city: 'Cairo' });

      const res = await request(app)
        .get('/api/v1/players?keyword=alex')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.documents.map((p) => p.name)).toEqual(['Player One']);
    });

    it('keeps the tokens in sync when the name is edited', async () => {
      const { token } = await createCoach();
      const player = await createPlayer(token, { name: 'Old Name', city: 'Cairo' });

      await request(app)
        .patch(`/api/v1/players/${player._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed Player' })
        .expect(200);

      const byNew = await request(app)
        .get('/api/v1/players?keyword=Renamed')
        .set('Authorization', `Bearer ${token}`);
      expect(byNew.body.data.documents.length).toBe(1);

      const byOld = await request(app)
        .get('/api/v1/players?keyword=Old')
        .set('Authorization', `Bearer ${token}`);
      expect(byOld.body.data.documents).toEqual([]);

      // المدينة مااتمسحتش من الـtokens وإحنا بنعدّل الاسم بس
      const byCity = await request(app)
        .get('/api/v1/players?keyword=cairo')
        .set('Authorization', `Bearer ${token}`);
      expect(byCity.body.data.documents.length).toBe(1);
    });

    it('the derived field is never exposed in the API response', async () => {
      const { token } = await createCoach();
      await createPlayer(token, { name: 'Hidden Tokens' });

      const res = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${token}`);

      expect(res.body.data.documents[0].searchTokens).toBeUndefined();
    });

    it('a client cannot inject searchTokens through create or update', async () => {
      const { token } = await createCoach();
      const player = await createPlayer(token, { name: 'Real Name' });

      await request(app)
        .patch(`/api/v1/players/${player._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ searchTokens: ['injected'] });

      const res = await request(app)
        .get('/api/v1/players?keyword=injected')
        .set('Authorization', `Bearer ${token}`);
      expect(res.body.data.documents).toEqual([]);
    });
  });

  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/players');
    expect(res.status).toBe(401);
  });

  // ── ApiFeature.filter() rewrite — legitimate filtering must survive the isolation fix ──
  it('admin can filter players by coach id (Coaches page → View Players)', async () => {
    const { token: adminToken } = await createAdmin({ email: 'lens_admin@test.com' });
    const a = await createCoach({ email: 'lens_a@test.com' });
    const b = await createCoach({ email: 'lens_b@test.com' });
    await createPlayer(a.token, { name: 'Coach A Player' });
    await createPlayer(b.token, { name: 'Coach B Player' });

    const res = await request(app)
      .get(`/api/v1/players?coach=${b.user._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['Coach B Player']);
  });

  it('coach can still filter their OWN players by ageGroup', async () => {
    const { token } = await createCoach({ email: 'filt_age@test.com' });
    const younger = await createPlayer(token, { name: 'U12', dateOfBirth: dobForAge(12) });
    await createPlayer(token, { name: 'U14', dateOfBirth: dobForAge(14) });

    const res = await request(app)
      .get(`/api/v1/players?ageGroup=${younger.ageGroup}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['U12']);
  });

  it('coach can still filter their OWN players by position', async () => {
    const { token } = await createCoach({ email: 'filt_pos@test.com' });
    await createPlayer(token, { name: 'Keeper', position: 'GK' });
    await createPlayer(token, { name: 'Striker', position: 'ST' });

    const res = await request(app)
      .get('/api/v1/players?position=GK')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((p) => p.name)).toEqual(['Keeper']);
  });

  it('coach status + keyword filtering still narrows within their own roster', async () => {
    const { token: adminToken } = await createAdmin({ email: 'filt_admin@test.com' });
    const { token } = await createCoach({ email: 'filt_status@test.com' });
    const picked = await createPlayer(token, { name: 'Zlatan Selected' });
    await createPlayer(token, { name: 'Lionel Pending' });

    await request(app)
      .patch(`/api/v1/players/${picked._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'selected' });

    const byStatus = await request(app)
      .get('/api/v1/players?status=selected')
      .set('Authorization', `Bearer ${token}`);
    expect(byStatus.status).toBe(200);
    expect(byStatus.body.data.documents.map((p) => p.name)).toEqual(['Zlatan Selected']);

    const byKeyword = await request(app)
      .get('/api/v1/players?keyword=Lionel')
      .set('Authorization', `Bearer ${token}`);
    expect(byKeyword.status).toBe(200);
    expect(byKeyword.body.data.documents.map((p) => p.name)).toEqual(['Lionel Pending']);
  });

  it('pagination still works alongside the ownership scope', async () => {
    const { token } = await createCoach({ email: 'filt_page@test.com' });
    for (const n of ['Player One', 'Player Two', 'Player Three']) await createPlayer(token, { name: n });
    const other = await createCoach({ email: 'filt_page_other@test.com' });
    await createPlayer(other.token, { name: 'Foreign' });

    const page1 = await request(app)
      .get('/api/v1/players?page=1&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(page1.status).toBe(200);
    expect(page1.body.count).toBe(2);
    // numberOfPages محسوب من العدد المعزول (3 لاعبين للكوتش ده) مش العدد الكلي (4)
    expect(page1.body.pagination.numberOfPages).toBe(2);

    const page2 = await request(app)
      .get('/api/v1/players?page=2&limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(page2.status).toBe(200);
    expect(page2.body.count).toBe(1);
    expect(page2.body.data.documents.map((p) => p.name)).not.toContain('Foreign');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/:id
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/:id', () => {
  beforeEach(seedAgeGroups);

  it('coach gets their own player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.document._id).toBe(player._id);
  });

  it('coach cannot read another coach\'s player — expects 403', async () => {
    const { token: coach1Token } = await createCoach();
    const { token: coach2Token } = await createCoach();
    const player = await createPlayer(coach1Token);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${coach2Token}`);

    expect(res.status).toBe(403);
  });

  it('admin can see any player', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  it('admin sees the coach info, but the observer does not', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);

    await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });

    const adminRes = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.body.data.document.coach).toBeTruthy();

    const observerRes = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${observerToken}`);
    expect(observerRes.status).toBe(200);
    expect(observerRes.body.data.document.coach).toBeUndefined();
  });

  it('returns 404 for non-existent player', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .get('/api/v1/players/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid player ID', async () => {
    const { token } = await createAdmin();

    const res = await request(app)
      .get('/api/v1/players/invalid-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/players/:id  — update player
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/players/:id', () => {
  beforeEach(seedAgeGroups);

  it('coach updates their own player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', city: 'Alexandria' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.name).toBe('Updated Name');
  });

  it('coach cannot update another coach\'s player — expects 403', async () => {
    const { token: coach1 } = await createCoach();
    const { token: coach2 } = await createCoach();
    const player = await createPlayer(coach1);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${coach2}`)
      .send({ name: 'Hack' });

    expect(res.status).toBe(403);
  });

  // §11 — البلوك ده كان مكسور بصمت: pre('findOneAndUpdate') كان بيقرا
  // (update.$set || update)، وtimestamps بيخلي $set موجود دايماً، فحقول العميل
  // الـtop-level مكانتش بتوصل والبلوك كله مكانش بيشتغل. التست القديم كان بيفحص
  // إن ageGroup "موجود" بس (وهو موجود من الإنشاء)، فكان بيعدّي على الباگ.
  it('re-derives ageGroup when dateOfBirth changes', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token, { dateOfBirth: dobForAge(14) });
    const before = (await Player.findById(player._id).populate('ageGroup')).ageGroup;

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: dobForAge(10) });

    expect(res.status).toBe(200);

    const after = (await Player.findById(player._id).populate('ageGroup')).ageGroup;
    // الفئة اتغيّرت فعلاً، ومطابقة لسنة الميلاد الجديدة
    expect(String(after._id)).not.toBe(String(before._id));
    expect(after.birthYear).toBe(new Date(dobForAge(10)).getFullYear());
  });

  it('rejects a dateOfBirth outside the supported range on update', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token, { dateOfBirth: dobForAge(14) });

    // فحص MIN/MAX كان بيتخطّى بالكامل على التعديل — ثغرة فاليديشن مش بطء
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: '1990-05-01' });

    expect(res.status).toBe(400);

    // والمستند مااتغيّرش
    const unchanged = await Player.findById(player._id);
    expect(new Date(unchanged.dateOfBirth).getFullYear())
      .toBe(new Date(dobForAge(14)).getFullYear());
  });

  it('rejects a birth year that has no configured age group', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token, { dateOfBirth: dobForAge(14) });
    // الفاكتوري بيزرع 2009→2019 بس، فـ2008 داخل المدى المسموح (2007→2019)
    // لكن مفيش AgeGroup مظبوط ليها
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dateOfBirth: '2008-05-01' });

    expect(res.status).toBe(400);
  });

  it('leaves ageGroup alone when dateOfBirth is not part of the update', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token, { dateOfBirth: dobForAge(14) });
    const before = (await Player.findById(player._id)).ageGroup;

    await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Just A Rename' })
      .expect(200);

    const after = (await Player.findById(player._id)).ageGroup;
    expect(String(after)).toBe(String(before));
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/players/:id/status  — update player status
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/players/:id/status', () => {
  beforeEach(seedAgeGroups);

  it('admin can set player status to selected', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'selected' });

    expect(res.status).toBe(200);
    // updatePlayerStatus controller returns { data: { player } } (not { data: { document } })
    expect(res.body.data.document.status).toBe('selected');
  });

  it('admin can set player status to rejected', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('rejected');
  });

  it('coach cannot change player status', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'selected' });

    expect(res.status).toBe(403);
  });

  it('returns 400 for invalid status value', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  it('admin can set status to observed and assign an observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('observed');
    expect(res.body.data.document.observers).toEqual([observer._id.toString()]);
  });

  it('admin can assign a player to multiple observers at once', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: obsA } = await createObserver();
    const { user: obsB } = await createObserver();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obsA._id.toString(), obsB._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.data.document.observers.sort()).toEqual(
      [obsA._id.toString(), obsB._id.toString()].sort()
    );
  });

  it('admin can revoke a single observer via PATCH /players/:id/observers, keeping the rest', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: obsA, token: obsAToken } = await createObserver();
    const { user: obsB, token: obsBToken } = await createObserver();
    const player = await createPlayer(coachToken);

    await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [obsA._id.toString(), obsB._id.toString()] });

    // remove obsA, keep obsB
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/observers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ observers: [obsB._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('observed'); // status untouched
    // response comes back populated with observer names
    const observerIds = res.body.data.document.observers.map(o => (typeof o === 'object' ? o._id : o));
    expect(observerIds).toEqual([obsB._id.toString()]);
    expect(res.body.data.document.observers[0].name).toBeTruthy();

    // obsA lost access
    const obsAGet = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${obsAToken}`);
    expect(obsAGet.status).toBe(403);

    // obsB still has access
    const obsBGet = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${obsBToken}`);
    expect(obsBGet.status).toBe(200);
  });

  it('a coach/non-admin cannot manage observers directly', async () => {
    const { token: coachToken } = await createCoach();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/observers`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ observers: [] });

    expect(res.status).toBe(403);
  });

  it('rejects observed status without an observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed' });

    expect(res.status).toBe(400);
  });

  it('rejects observed status when the id is not an observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach({ email: `notobs_${Date.now()}@test.com` });
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [coach._id.toString()] });

    expect(res.status).toBe(400);
  });

  it('keeps the observer link when status changes away from observed', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer, token: observerToken } = await createObserver();
    const player = await createPlayer(coachToken);

    await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'selected' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('selected');
    expect(res.body.data.document.observers).toEqual([observer._id.toString()]);

    // observer still sees the player and its new status
    const list = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${observerToken}`);
    const seen = list.body.data.documents.find(p => p._id === player._id);
    expect(seen).toBeTruthy();
    expect(seen.status).toBe('selected');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Observer data scoping — observers only see players assigned to them
// ══════════════════════════════════════════════════════════════════════════════
describe('Observer data scoping', () => {
  beforeEach(seedAgeGroups);

  async function assignObserved(adminToken, playerId, observerId) {
    return request(app)
      .patch(`/api/v1/players/${playerId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observerId] });
  }

  it('observer sees only players assigned to them', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: obsA, token: obsAToken } = await createObserver();
    const { user: obsB } = await createObserver();

    const p1 = await createPlayer(coachToken, { name: 'Assigned A' });
    const p2 = await createPlayer(coachToken, { name: 'Assigned B' });
    await createPlayer(coachToken, { name: 'Unassigned' });

    await assignObserved(adminToken, p1._id, obsA._id);
    await assignObserved(adminToken, p2._id, obsB._id);

    const res = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${obsAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
    expect(res.body.data.documents[0].name).toBe('Assigned A');
  });

  it('coach sees an observed player as pending (observer hidden)', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const player = await createPlayer(coachToken);

    await assignObserved(adminToken, player._id, observer._id);

    // list
    const list = await request(app)
      .get('/api/v1/players')
      .set('Authorization', `Bearer ${coachToken}`);
    const masked = list.body.data.documents.find(p => p._id === player._id);
    expect(masked.status).toBe('pending');
    expect(masked.observers).toBeUndefined();

    // detail
    const detail = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${coachToken}`);
    expect(detail.body.data.document.status).toBe('pending');
    expect(detail.body.data.document.observers).toBeUndefined();

    // filtering by pending includes the observed player
    const pending = await request(app)
      .get('/api/v1/players?status=pending')
      .set('Authorization', `Bearer ${coachToken}`);
    expect(pending.body.data.documents.some(p => p._id === player._id)).toBe(true);
  });

  it('admin still sees the real observed status', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { user: observer } = await createObserver();
    const player = await createPlayer(coachToken);

    await assignObserved(adminToken, player._id, observer._id);

    const detail = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.data.document.status).toBe('observed');
  });

  it('observer cannot access a player assigned to a different observer', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const { token: obsAToken } = await createObserver();
    const { user: obsB } = await createObserver();

    const player = await createPlayer(coachToken);
    await assignObserved(adminToken, player._id, obsB._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${obsAToken}`);

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  DELETE /api/v1/players/:id  — only admin can delete
// ══════════════════════════════════════════════════════════════════════════════
describe('DELETE /api/v1/players/:id', () => {
  beforeEach(seedAgeGroups);

  it('admin can delete a player', async () => {
    const { token: coachToken } = await createCoach();
    const { token: adminToken } = await createAdmin();
    const player = await createPlayer(coachToken);

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204); // deleteOne returns 204 No Content
  });

  it('coach cannot delete a player', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/players/counts — per-age-group counts used by the groups view
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/players/counts', () => {
  beforeEach(seedAgeGroups);

  it('admin browsing a specific coach only gets that coach\'s counts', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coach1Token, user: coach1 } = await createCoach();
    const { token: coach2Token } = await createCoach();

    await createPlayer(coach1Token);
    await createPlayer(coach2Token);
    await createPlayer(coach2Token);

    const res = await request(app)
      .get(`/api/v1/players/counts?coach=${coach1._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('admin with no coach filter gets the global total', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coach1Token } = await createCoach();
    const { token: coach2Token } = await createCoach();

    await createPlayer(coach1Token);
    await createPlayer(coach2Token);
    await createPlayer(coach2Token);

    const res = await request(app)
      .get('/api/v1/players/counts')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(3);
  });

  it('admin browsing a specific observer only gets that observer\'s counts', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { user: observer } = await createObserver();

    const assigned = await createPlayer(coachToken);
    await createPlayer(coachToken);

    await request(app)
      .patch(`/api/v1/players/${assigned._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'observed', observers: [observer._id.toString()] });

    const res = await request(app)
      .get(`/api/v1/players/counts?observer=${observer._id.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  PATCH /api/v1/players/:id/profileImg
// ══════════════════════════════════════════════════════════════════════════════
describe('PATCH /api/v1/players/:id/profileImg', () => {
  beforeEach(seedAgeGroups);

  it('rejects an image over 4MB (400) before it ever reaches storage', async () => {
    const { token } = await createCoach();
    const player = await createPlayer(token);
    const oversized = Buffer.alloc(5 * 1024 * 1024, 1);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set('Authorization', `Bearer ${token}`)
      .attach('profileImg', oversized, 'photo.jpg');

    expect(res.status).toBe(400);
  });
});
