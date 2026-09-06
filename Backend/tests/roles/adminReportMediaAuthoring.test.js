import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import crypto from 'node:crypto';

const mkHash = (seed) => crypto.createHash('sha256').update(String(seed)).digest('hex');

vi.mock('../../config/bunny.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        createStreamVideo: vi.fn(async () => ({ guid: `guid_${Math.random().toString(36).slice(2, 10)}` })),
        getStreamVideo: vi.fn(),
        deleteStreamVideo: vi.fn(async () => true),
        deleteStorageObject: vi.fn(async () => true),
        putStorageObject: vi.fn(async () => true),
        getStorageObject: vi.fn(async () => null),
        purgeUrl: vi.fn(async () => true),
    };
});

import app from '../../app.js';
import Player from '../../models/playedModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import PlayerMedia from '../../models/playerMediaModel.js';
import {
    createAdmin, createCoach, createObserver,
    defaultTeamIds, setupPlayerMatchDay, reportPayload, playerPayload,
    seedAgeGroups,
} from '../helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  admin-assign-players-reports-media — Stage 2
//
//  The admin can now file reports and upload media for a player. When it names
//  an admin-only `assignedObserver`, the effective author becomes that observer
//  (ScoutingReport.coach / PlayerMedia.uploadedBy) — per the owner's explicit
//  choice, "assigning a report/media to an observer" means recording the
//  observer as its author. No new schema field, no scope.js change: the
//  existing per-author filters (getAll baseFilter) and ownership guards
//  (checkReportOwnership/checkMediaOwnership) do the entire job once the right
//  id is stamped at create time.
// ══════════════════════════════════════════════════════════════════════════════

async function playerAssignedToObserver(adminToken, observerId, overrides = {}) {
    const res = await request(app)
        .post('/api/v1/players')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(playerPayload({ observers: [observerId], ...overrides }));
    return res.body.data.document;
}

async function reportSetup(playerId) {
    const p = await Player.findById(playerId).select('ageGroup');
    const teamIds = await defaultTeamIds(p.ageGroup);
    await setupPlayerMatchDay(playerId, teamIds);
    return teamIds;
}

describe('Admin authors and assigns reports', () => {
    beforeEach(seedAgeGroups);

    describe('positive', () => {
        it('admin files a report on its own player — author is the admin', async () => {
            const { token: adminToken, user: admin } = await createAdmin();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload());
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload(teamIds));

            expect(res.status).toBe(201);
            expect(res.body.data.document.coach._id).toBe(admin._id.toString());
        });

        it('admin files attributed to an assigned observer — that observer sees and can edit it; a second observer does not', async () => {
            const { token: adminToken } = await createAdmin();
            const obsA = await createObserver();
            const obsB = await createObserver();

            const assigned = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload({ observers: [obsA.user._id.toString(), obsB.user._id.toString()] }));
            const player = assigned.body.data.document;
            const teamIds = await reportSetup(player._id);

            const created = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ ...teamIds, assignedObserver: obsA.user._id.toString() }));

            expect(created.status).toBe(201);
            const reportId = created.body.data.document._id;
            expect(created.body.data.document.coach._id).toBe(obsA.user._id.toString());

            const listA = await request(app)
                .get(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${obsA.token}`);
            expect(listA.body.data.documents.map((r) => r._id)).toContain(reportId);

            const editByA = await request(app)
                .patch(`/api/v1/players/${player._id}/reports/${reportId}`)
                .set('Authorization', `Bearer ${obsA.token}`)
                .send({ notes: 'edited by A' });
            expect(editByA.status).toBe(200);

            const listB = await request(app)
                .get(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${obsB.token}`);
            expect(listB.body.data.documents.map((r) => r._id)).not.toContain(reportId);

            const getByB = await request(app)
                .get(`/api/v1/players/${player._id}/reports/${reportId}`)
                .set('Authorization', `Bearer ${obsB.token}`);
            expect(getByB.status).toBe(403);
        });

        it("admin's own report is PATCHable by the admin", async () => {
            const { token: adminToken } = await createAdmin();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload());
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const report = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload(teamIds));

            const patched = await request(app)
                .patch(`/api/v1/players/${player._id}/reports/${report.body.data.document._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ notes: 'admin edit' });

            expect(patched.status).toBe(200);
            expect(patched.body.data.document.notes).toBe('admin edit');
        });

        it('admin files an official report for a fixture already played (not restricted to match day)', async () => {
            const { token: adminToken } = await createAdmin();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload());
            const player = created.body.data.document;

            const p = await Player.findById(player._id).select('ageGroup');
            const teamIds = await defaultTeamIds(p.ageGroup);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const pastMatch = await setupPlayerMatchDay(player._id, teamIds, yesterday);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ seasonMatch: pastMatch._id.toString() }));

            expect(res.status).toBe(201);
            expect(res.body.data.document.seasonMatch?._id ?? res.body.data.document.seasonMatch).toBe(pastMatch._id.toString());
        });
    });

    describe('negative', () => {
        it('coach/observer/proScout sending assignedObserver → 400', async () => {
            const coach = await createCoach();
            const obs = await createObserver();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${coach.token}`)
                .send(playerPayload());
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${coach.token}`)
                .send(reportPayload({ ...teamIds, assignedObserver: obs.user._id.toString() }));

            expect(res.status).toBe(400);
        });

        it('admin naming an observer NOT in player.observers → 400', async () => {
            const { token: adminToken } = await createAdmin();
            const obsAssigned = await createObserver();
            const obsOutside = await createObserver();

            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload({ observers: [obsAssigned.user._id.toString()] }));
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ ...teamIds, assignedObserver: obsOutside.user._id.toString() }));

            expect(res.status).toBe(400);
        });

        it('admin naming a coach id as assignedObserver → 400 (not assigned, and not an observer either way)', async () => {
            const { token: adminToken } = await createAdmin();
            const coach = await createCoach();

            // Stage 1 already blocks putting a coach id into a player's `observers`
            // array, so there is no reachable state where a coach id sits inside
            // player.observers — this 400 comes from the "not assigned" branch, which
            // is itself sufficient: whichever branch fires, a coach id is never accepted.
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload());
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ ...teamIds, assignedObserver: coach.user._id.toString() }));

            expect(res.status).toBe(400);
        });

        it("admin PATCHing a coach's report → 403", async () => {
            const { token: adminToken } = await createAdmin();
            const coach = await createCoach();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${coach.token}`)
                .send(playerPayload());
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const report = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${coach.token}`)
                .send(reportPayload(teamIds));

            const res = await request(app)
                .patch(`/api/v1/players/${player._id}/reports/${report.body.data.document._id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ notes: 'admin overreach' });

            expect(res.status).toBe(403);
        });

        it('coach still gets 400 filing an official report on a past fixture (no assignedObserver, no admin bypass)', async () => {
            const coach = await createCoach();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${coach.token}`)
                .send(playerPayload());
            const player = created.body.data.document;

            const p = await Player.findById(player._id).select('ageGroup');
            const teamIds = await defaultTeamIds(p.ageGroup);
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const pastMatch = await setupPlayerMatchDay(player._id, teamIds, yesterday);

            const res = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${coach.token}`)
                .send(reportPayload({ seasonMatch: pastMatch._id.toString() }));

            expect(res.status).toBe(400);
        });

        it('duplicate (player, observer, seasonMatch) → 400 with a readable message', async () => {
            const { token: adminToken } = await createAdmin();
            const obs = await createObserver();
            const created = await request(app)
                .post('/api/v1/players')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(playerPayload({ observers: [obs.user._id.toString()] }));
            const player = created.body.data.document;
            const teamIds = await reportSetup(player._id);

            const first = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ ...teamIds, assignedObserver: obs.user._id.toString() }));
            expect(first.status).toBe(201);

            const seasonMatch = first.body.data.document.seasonMatch?._id ?? first.body.data.document.seasonMatch;
            const second = await request(app)
                .post(`/api/v1/players/${player._id}/reports`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(reportPayload({ seasonMatch, assignedObserver: obs.user._id.toString() }));

            expect(second.status).toBe(400);
            expect(second.body.message).toMatch(/already exists/i);
        });
    });
});

describe('Admin authors and assigns media', () => {
    beforeEach(seedAgeGroups);

    async function playerWithTeamAndObserver(adminToken, observerId) {
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(playerPayload({ observers: [observerId] }));
        const player = created.body.data.document;
        const p = await Player.findById(player._id).select('ageGroup');
        const teamIds = await defaultTeamIds(p.ageGroup);
        await Player.findByIdAndUpdate(player._id, { team: teamIds.homeTeam });
        return player;
    }

    it('admin uploads a video for its own player — uploadedBy is the admin', async () => {
        const { token: adminToken, user: admin } = await createAdmin();
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(playerPayload()); // no team → freeform, needs title+description

        const res = await request(app)
            .post(`/api/v1/players/${created.body.data.document._id}/media/video`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ title: 'x', description: 'y', fileHash: mkHash('admin-own-video') });

        expect(res.status).toBe(201);

        const list = await request(app)
            .get(`/api/v1/players/${created.body.data.document._id}/media`)
            .set('Authorization', `Bearer ${adminToken}`);
        const doc = list.body.data.documents.find((d) => d._id === res.body.data.document._id);
        expect(doc.uploadedBy._id ?? doc.uploadedBy).toBe(admin._id.toString());
    });

    it('admin uploads attributed to an assigned observer — that observer sees it in the gallery', async () => {
        const { token: adminToken } = await createAdmin();
        const obs = await createObserver();
        const player = await playerWithTeamAndObserver(adminToken, obs.user._id.toString());

        const res = await request(app)
            .post(`/api/v1/players/${player._id}/media/video`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ title: 'x', description: 'y', fileHash: mkHash('admin-assigned-video'), assignedObserver: obs.user._id.toString() });

        expect(res.status).toBe(201);

        const listObs = await request(app)
            .get(`/api/v1/players/${player._id}/media`)
            .set('Authorization', `Bearer ${obs.token}`);
        expect(listObs.body.data.documents.map((d) => d._id)).toContain(res.body.data.document._id);
    });

    it('admin naming an observer NOT assigned to the player → 400', async () => {
        const { token: adminToken } = await createAdmin();
        const outsider = await createObserver();
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(playerPayload());

        const res = await request(app)
            .post(`/api/v1/players/${created.body.data.document._id}/media/video`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ title: 'x', description: 'y', fileHash: mkHash('admin-bad-assign'), assignedObserver: outsider.user._id.toString() });

        expect(res.status).toBe(400);
    });

    it('coach/observer/proScout sending assignedObserver on a video upload → 400', async () => {
        const coach = await createCoach();
        const obs = await createObserver();
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${coach.token}`)
            .send(playerPayload());

        const res = await request(app)
            .post(`/api/v1/players/${created.body.data.document._id}/media/video`)
            .set('Authorization', `Bearer ${coach.token}`)
            .send({ title: 'x', description: 'y', fileHash: mkHash('coach-cant-assign'), assignedObserver: obs.user._id.toString() });

        expect(res.status).toBe(400);
    });
});

// ══════════════════════════════════════════════════════════════════════════════
//  Pre-existing bug this stage makes reachable: checkReportOwnership:92 and
//  checkMediaOwnership:158 called .toString() on report.coach / media.uploadedBy
//  without a null guard, even though §12 (userDeletion.js) explicitly nulls both
//  fields on a permanently-deleted author. The proScout branches were already
//  guarded (`report.coach && ...`); the coach/observer branches were not — a
//  500 instead of a 403. Fixed alongside this stage since ADMIN gained access to
//  the same PATCH path that would trip it.
// ══════════════════════════════════════════════════════════════════════════════
describe('Orphaned report/media (author permanently deleted) — 403, not 500', () => {
    beforeEach(seedAgeGroups);

    it('a coach gets 403, not 500, opening a report whose author field was nulled', async () => {
        const coach = await createCoach();
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${coach.token}`)
            .send(playerPayload());
        const player = created.body.data.document;
        const teamIds = await reportSetup(player._id);

        const report = await request(app)
            .post(`/api/v1/players/${player._id}/reports`)
            .set('Authorization', `Bearer ${coach.token}`)
            .send(reportPayload(teamIds));

        await ScoutingReport.updateOne({ _id: report.body.data.document._id }, { $set: { coach: null } });

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/reports/${report.body.data.document._id}`)
            .set('Authorization', `Bearer ${coach.token}`);

        expect(res.status).toBe(403);
    });

    it('an observer gets 403, not 500, opening media whose uploader field was nulled', async () => {
        const { token: adminToken } = await createAdmin();
        const obs = await createObserver();
        const created = await request(app)
            .post('/api/v1/players')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(playerPayload({ observers: [obs.user._id.toString()] }));
        const player = created.body.data.document;

        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: obs.user._id,
            type: 'image',
            storage: 'bunny',
            storageKey: 'players/orphan-test.webp',
            status: 'ready',
        });
        await PlayerMedia.updateOne({ _id: media._id }, { $set: { uploadedBy: null } });

        const res = await request(app)
            .get(`/api/v1/players/${player._id}/media/${media._id}`)
            .set('Authorization', `Bearer ${obs.token}`);

        expect(res.status).toBe(403);
    });
});
