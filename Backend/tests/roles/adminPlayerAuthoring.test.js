import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import {
  createAdmin, createCoach, createObserver, createProScout,
  seedAgeGroups, playerPayload,
} from '../helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  admin-assign-players-reports-media — Stage 1
//
//  The admin can now POST/PATCH players and assign coach/observers/proScout in
//  the same request (playerController.create, admin branch). This is a
//  deliberate capability grant (Constitution Principle I/II): every assignment
//  field is locked for every non-admin role exactly as before
//  (lockFieldExceptAdmin), and each assigned id is re-validated against the
//  User collection for the right role — never trusted as a bare ObjectId.
//
//  Nothing here touches services/scope.js or ApiFeature.buildOwnerScope: the
//  existing ownerFields map (coach/observers) and playerScopeFor (createdBy)
//  do the entire job once the right values are stamped at create time.
// ══════════════════════════════════════════════════════════════════════════════

describe('Admin authors and assigns players', () => {
  beforeEach(seedAgeGroups);

  describe('positive — admin creates and assigns', () => {
    it('creates an unassigned player, visible to admin only', async () => {
      const { token: adminToken } = await createAdmin();
      const { token: coachToken } = await createCoach();
      const observer = await createObserver();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload());

      expect(res.status).toBe(201);
      expect(res.body.data.document.coach).toBeFalsy();
      expect(res.body.data.document.createdBy).toBeTruthy();

      const asCoach = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${coachToken}`);
      expect(asCoach.body.data.documents.map((p) => p._id)).not.toContain(res.body.data.document._id);

      const asObserver = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${observer.token}`);
      expect(asObserver.body.data.documents.map((p) => p._id)).not.toContain(res.body.data.document._id);
    });

    it('creates a player assigned to a coach — that coach sees it, another coach does not', async () => {
      const { token: adminToken } = await createAdmin();
      const coachA = await createCoach();
      const coachB = await createCoach();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ name: 'Admin Assigned', coach: coachA.user._id.toString() }));

      expect(res.status).toBe(201);
      expect(res.body.data.document.coach).toBe(coachA.user._id.toString());

      const asCoachA = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${coachA.token}`);
      expect(asCoachA.body.data.documents.map((p) => p.name)).toContain('Admin Assigned');

      const asCoachB = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${coachB.token}`);
      expect(asCoachB.body.data.documents.map((p) => p.name)).not.toContain('Admin Assigned');
    });

    it('creates a player assigned to two observers — both see it and can open it', async () => {
      const { token: adminToken } = await createAdmin();
      const obsA = await createObserver();
      const obsB = await createObserver();
      const obsC = await createObserver();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({
          name: 'Shared Observed',
          observers: [obsA.user._id.toString(), obsB.user._id.toString()],
        }));

      expect(res.status).toBe(201);
      const id = res.body.data.document._id;
      expect(res.body.data.document.status).toBe('observed');

      for (const obs of [obsA, obsB]) {
        const list = await request(app)
          .get('/api/v1/players')
          .set('Authorization', `Bearer ${obs.token}`);
        expect(list.body.data.documents.map((p) => p.name)).toContain('Shared Observed');

        const one = await request(app)
          .get(`/api/v1/players/${id}`)
          .set('Authorization', `Bearer ${obs.token}`);
        expect(one.status).toBe(200);
      }

      const listC = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${obsC.token}`);
      expect(listC.body.data.documents.map((p) => p.name)).not.toContain('Shared Observed');
    });

    it('creates a player assigned to a proScout — createdBy is the scout, and the scout sees it', async () => {
      const { token: adminToken } = await createAdmin();
      const scout = await createProScout();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ name: 'Scout Assigned', proScout: scout.user._id.toString() }));

      expect(res.status).toBe(201);
      expect(res.body.data.document.createdBy).toBe(scout.user._id.toString());

      const asScout = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${scout.token}`);
      expect(asScout.body.data.documents.map((p) => p.name)).toContain('Scout Assigned');
    });

    it('admin can PATCH any player', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();

      const created = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ coach: coach.user._id.toString() }));

      const patched = await request(app)
        .patch(`/api/v1/players/${created.body.data.document._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'admin edit' });

      expect(patched.status).toBe(200);
      expect(patched.body.data.document.notes).toBe('admin edit');
    });

    it('PATCH /:id/proScout reassigns createdBy to a different proScout', async () => {
      const { token: adminToken } = await createAdmin();
      const scoutA = await createProScout();
      const scoutB = await createProScout();

      const created = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ proScout: scoutA.user._id.toString() }));

      const res = await request(app)
        .patch(`/api/v1/players/${created.body.data.document._id}/proScout`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ proScout: scoutB.user._id.toString() });

      expect(res.status).toBe(200);
      expect(res.body.data.document.createdBy).toBe(scoutB.user._id.toString());

      const asScoutA = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${scoutA.token}`);
      expect(asScoutA.body.data.documents.map((p) => p._id)).not.toContain(created.body.data.document._id);
    });
  });

  describe('negative — locks and role re-validation hold', () => {
    it('coach sending coach/observers/proScout on create → 400', async () => {
      const coach = await createCoach();
      const other = await createCoach();

      for (const field of ['coach', 'observers', 'proScout']) {
        const value = field === 'observers' ? [other.user._id.toString()] : other.user._id.toString();
        const res = await request(app)
          .post('/api/v1/players')
          .set('Authorization', `Bearer ${coach.token}`)
          .send(playerPayload({ [field]: value }));
        expect(res.status).toBe(400);
      }
    });

    it('observer sending coach/observers/proScout on create → 400', async () => {
      const observer = await createObserver();
      const other = await createObserver();

      for (const field of ['coach', 'observers', 'proScout']) {
        const value = field === 'observers' ? [other.user._id.toString()] : other.user._id.toString();
        const res = await request(app)
          .post('/api/v1/players')
          .set('Authorization', `Bearer ${observer.token}`)
          .send(playerPayload({ [field]: value }));
        expect(res.status).toBe(400);
      }
    });

    it('proScout sending coach/observers/proScout on create → 400', async () => {
      const scout = await createProScout();
      const other = await createProScout();

      for (const field of ['coach', 'observers', 'proScout']) {
        const value = field === 'observers' ? [other.user._id.toString()] : other.user._id.toString();
        const res = await request(app)
          .post('/api/v1/players')
          .set('Authorization', `Bearer ${scout.token}`)
          .send(playerPayload({ [field]: value }));
        expect(res.status).toBe(400);
      }
    });

    it('admin sending an observer id as coach → 400 (role re-validation)', async () => {
      const { token: adminToken } = await createAdmin();
      const observer = await createObserver();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ coach: observer.user._id.toString() }));

      expect(res.status).toBe(400);
    });

    it('admin sending a coach id as proScout → 400 (role re-validation)', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ proScout: coach.user._id.toString() }));

      expect(res.status).toBe(400);
    });

    it('admin sending a coach id as observers → 400 (role re-validation)', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();

      const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ observers: [coach.user._id.toString()] }));

      expect(res.status).toBe(400);
    });

    it('admin sending isProfessional, createdBy, ageGroup or status on create → 400', async () => {
      const { token: adminToken } = await createAdmin();

      for (const field of ['isProfessional', 'createdBy', 'ageGroup', 'status']) {
        const value = field === 'isProfessional' ? true : field === 'status' ? 'selected' : '507f1f77bcf86cd799439011';
        const res = await request(app)
          .post('/api/v1/players')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(playerPayload({ [field]: value }));
        expect(res.status).toBe(400);
      }
    });

    it('admin sending coach on PATCH /players/:id → 400 (the lock holds — reassignment goes through /:id/coach)', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();

      const created = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload());

      const res = await request(app)
        .patch(`/api/v1/players/${created.body.data.document._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ coach: coach.user._id.toString() });

      expect(res.status).toBe(400);
    });

    it('non-admin on PATCH /:id/proScout → 403', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();
      const scout = await createProScout();

      const created = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload());

      const res = await request(app)
        .patch(`/api/v1/players/${created.body.data.document._id}/proScout`)
        .set('Authorization', `Bearer ${coach.token}`)
        .send({ proScout: scout.user._id.toString() });

      expect(res.status).toBe(403);
    });

    // R14 — playerRouter is mounted twice, at /players and at /users/:id/players.
    // setUserIdToBody copies the URL user id into req.body.coach on the nested
    // mount. For an admin this becomes a would-be silent assignment; the role
    // re-validation in the admin branch must still catch a wrong-role id.
    it('admin POSTing to the nested /users/<observerId>/players → 400, not a silent assignment', async () => {
      const { token: adminToken } = await createAdmin();
      const observer = await createObserver();

      const res = await request(app)
        .post(`/api/v1/users/${observer.user._id}/players`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload());

      expect(res.status).toBe(400);
    });
  });

  describe('regression — Principle III: other roles unchanged', () => {
    it('coach GET /players, /players/counts, /reports/average-ratings unaffected by admin authoring', async () => {
      const { token: adminToken } = await createAdmin();
      const coach = await createCoach();

      // admin creates noise the coach must never see
      await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ name: 'Admin Noise' }));

      const ownPlayer = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${coach.token}`)
        .send(playerPayload({ name: 'Coach Own' }));
      expect(ownPlayer.status).toBe(201);

      const list = await request(app)
        .get('/api/v1/players')
        .set('Authorization', `Bearer ${coach.token}`);
      expect(list.body.data.documents.map((p) => p.name)).toEqual(['Coach Own']);

      const counts = await request(app)
        .get('/api/v1/players/counts')
        .set('Authorization', `Bearer ${coach.token}`);
      expect(counts.status).toBe(200);
      expect(counts.body.data.total).toBe(1);

      const avg = await request(app)
        .get('/api/v1/players/reports/average-ratings')
        .set('Authorization', `Bearer ${coach.token}`);
      expect(avg.status).toBe(200);
    });
  });
});
