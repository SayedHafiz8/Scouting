import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Player from '../models/playedModel.js';
import ScoutingReport from '../models/scoutingReportModel.js';
import PlayerMedia from '../models/playerMediaModel.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import Team from '../models/teamModel.js';
import AgeGroup from '../models/ageGroupModel.js';
import {
    checkPlayerOwnership,
    checkReportOwnership,
    checkMediaOwnership,
    checkSeasonMatchAttendee,
} from '../middlewares/ownership.js';
import { seedAgeGroups, dobForAge } from './helpers/factory.js';

// ══════════════════════════════════════════════════════════════════════════════
//  Unit contract for middlewares/ownership.js (US1 — Role Foundation Hardening).
//
//  These tests call the guard functions directly with in-memory req/user objects —
//  no HTTP, no real User documents. This is deliberate (research.md §4, /speckit-clarify
//  Q2): once US3's role validation lands, no real user with an unknown role can exist in
//  the database, so the default-deny branch can only be exercised this way.
//
//  Do not weaken without a security review — this closes constitutional Constraint C-2.
// ══════════════════════════════════════════════════════════════════════════════

const UNKNOWN_ROLE = 'not-a-real-role';

function mockReq(overrides = {}) {
    return { params: {}, user: {}, ...overrides };
}

function mockRes() {
    return {};
}

async function callGuard(guard, req) {
    let called;
    const next = (arg) => { called = arg; };
    await guard(req, mockRes(), next);
    return called;
}

async function makeCoachAndObserver() {
    const coachId = new mongoose.Types.ObjectId();
    const observerId = new mongoose.Types.ObjectId();
    return { coachId, observerId };
}

describe('ownership guards — default-deny for an unknown role', () => {
    beforeEach(seedAgeGroups);

    it('checkPlayerOwnership rejects an unknown role with 403, regardless of document field values', async () => {
        const { coachId } = await makeCoachAndObserver();
        const ageGroup = await AgeGroup.findOne();
        // Player.coach happens to equal the requester's id — must still be rejected,
        // because the guard should never reach the coach-comparison branch for this role.
        const player = await Player.create({
            name: 'Unknown Role Target',
            city: 'Cairo',
            address: '1 Test St',
            dateOfBirth: dobForAge(14),
            nationality: 'Egyptian',
            phoneNumber: '01098765432',
            ageGroup: ageGroup._id,
            coach: coachId,
        });

        const req = mockReq({ params: { id: player._id.toString() }, user: { _id: coachId, role: UNKNOWN_ROLE } });
        const result = await callGuard(checkPlayerOwnership, req);

        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });

    it('checkReportOwnership rejects an unknown role with 403, regardless of document field values', async () => {
        const { coachId } = await makeCoachAndObserver();
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Report Target',
            city: 'Cairo',
            address: '1 Test St',
            dateOfBirth: dobForAge(14),
            nationality: 'Egyptian',
            phoneNumber: '01098765432',
            ageGroup: ageGroup._id,
            coach: coachId,
        });
        const report = await ScoutingReport.create({
            player: player._id,
            coach: coachId,
            matchDate: new Date(),
            technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
            physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
            mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
        });

        const req = mockReq({
            params: { id: report._id.toString(), playerId: player._id.toString() },
            user: { _id: coachId, role: UNKNOWN_ROLE },
        });
        const result = await callGuard(checkReportOwnership, req);

        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });

    it('checkMediaOwnership rejects an unknown role with 403 even when uploadedBy matches the requester (FR-002)', async () => {
        const { coachId } = await makeCoachAndObserver();
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Media Target',
            city: 'Cairo',
            address: '1 Test St',
            dateOfBirth: dobForAge(14),
            nationality: 'Egyptian',
            phoneNumber: '01098765432',
            ageGroup: ageGroup._id,
            coach: coachId,
        });
        const media = await PlayerMedia.create({
            player: player._id,
            uploadedBy: coachId,
            type: 'image',
        });

        const req = mockReq({
            params: { id: media._id.toString(), playerId: player._id.toString() },
            user: { _id: coachId, role: UNKNOWN_ROLE },
        });
        const result = await callGuard(checkMediaOwnership, req);

        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });

    it('checkSeasonMatchAttendee rejects an unknown role with 403, regardless of document field values', async () => {
        const { coachId } = await makeCoachAndObserver();
        const ageGroup = await AgeGroup.findOne();
        const home = await Team.create({ name: 'home team', ageGroup: ageGroup._id, clubName: 'Home Club' });
        const away = await Team.create({ name: 'away team', ageGroup: ageGroup._id, clubName: 'Away Club' });
        const match = await SeasonMatch.create({
            ageGroup: ageGroup._id,
            season: '2025/2026',
            matchDate: new Date(),
            homeTeam: home._id,
            awayTeam: away._id,
            attendees: [coachId],
            createdBy: coachId,
        });

        const req = mockReq({ params: { id: match._id.toString() }, user: { _id: coachId, role: UNKNOWN_ROLE } });
        const result = await callGuard(checkSeasonMatchAttendee, req);

        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });
});

describe('ownership guards — existing behavior for admin/coach/observer is unchanged', () => {
    beforeEach(seedAgeGroups);

    it('checkPlayerOwnership: admin always passes', async () => {
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Admin Sees All', city: 'Cairo', address: '1 Test St', dateOfBirth: dobForAge(14),
            nationality: 'Egyptian', phoneNumber: '01098765432', ageGroup: ageGroup._id,
            coach: new mongoose.Types.ObjectId(),
        });
        const req = mockReq({ params: { id: player._id.toString() }, user: { _id: new mongoose.Types.ObjectId(), role: 'admin' } });
        const result = await callGuard(checkPlayerOwnership, req);
        expect(result).toBeUndefined();
    });

    it('checkPlayerOwnership: owning coach passes, non-owning coach is rejected with 403', async () => {
        const { coachId } = await makeCoachAndObserver();
        const otherCoachId = new mongoose.Types.ObjectId();
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Owned Player', city: 'Cairo', address: '1 Test St', dateOfBirth: dobForAge(14),
            nationality: 'Egyptian', phoneNumber: '01098765432', ageGroup: ageGroup._id, coach: coachId,
        });

        const okReq = mockReq({ params: { id: player._id.toString() }, user: { _id: coachId, role: 'coach' } });
        expect(await callGuard(checkPlayerOwnership, okReq)).toBeUndefined();

        const rejectReq = mockReq({ params: { id: player._id.toString() }, user: { _id: otherCoachId, role: 'coach' } });
        const result = await callGuard(checkPlayerOwnership, rejectReq);
        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
        expect(result.message).toBe("You are not allowed to access this player's data");
    });

    it('checkPlayerOwnership: assigned observer passes, unassigned observer is rejected with 403', async () => {
        const { observerId } = await makeCoachAndObserver();
        const otherObserverId = new mongoose.Types.ObjectId();
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Observed Player', city: 'Cairo', address: '1 Test St', dateOfBirth: dobForAge(14),
            nationality: 'Egyptian', phoneNumber: '01098765432', ageGroup: ageGroup._id,
            coach: new mongoose.Types.ObjectId(), observers: [observerId],
        });

        const okReq = mockReq({ params: { id: player._id.toString() }, user: { _id: observerId, role: 'observer' } });
        expect(await callGuard(checkPlayerOwnership, okReq)).toBeUndefined();

        const rejectReq = mockReq({ params: { id: player._id.toString() }, user: { _id: otherObserverId, role: 'observer' } });
        const result = await callGuard(checkPlayerOwnership, rejectReq);
        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });

    it('checkPlayerOwnership: 404 for a missing player takes precedence over any role check (FR-004 ordering)', async () => {
        const missingId = new mongoose.Types.ObjectId().toString();

        // Even an unknown role must see 404 before any 403 — "not found" is decided first,
        // regardless of the requester's role (contracts/ownership-guards.md "قاعدة الترتيب الثابتة").
        const req = mockReq({ params: { id: missingId }, user: { _id: new mongoose.Types.ObjectId(), role: UNKNOWN_ROLE } });
        const result = await callGuard(checkPlayerOwnership, req);

        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(404);
    });

    it('checkMediaOwnership: uploader coach passes, a different coach is rejected with 403', async () => {
        const { coachId } = await makeCoachAndObserver();
        const otherCoachId = new mongoose.Types.ObjectId();
        const ageGroup = await AgeGroup.findOne();
        const player = await Player.create({
            name: 'Media Owner Target', city: 'Cairo', address: '1 Test St', dateOfBirth: dobForAge(14),
            nationality: 'Egyptian', phoneNumber: '01098765432', ageGroup: ageGroup._id, coach: coachId,
        });
        const media = await PlayerMedia.create({ player: player._id, uploadedBy: coachId, type: 'image' });

        const okReq = mockReq({ params: { id: media._id.toString(), playerId: player._id.toString() }, user: { _id: coachId, role: 'coach' } });
        expect(await callGuard(checkMediaOwnership, okReq)).toBeUndefined();

        const rejectReq = mockReq({ params: { id: media._id.toString(), playerId: player._id.toString() }, user: { _id: otherCoachId, role: 'coach' } });
        const result = await callGuard(checkMediaOwnership, rejectReq);
        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });

    it('checkSeasonMatchAttendee: attendee passes, non-attendee is rejected with 403', async () => {
        const { coachId } = await makeCoachAndObserver();
        const otherCoachId = new mongoose.Types.ObjectId();
        const ageGroup = await AgeGroup.findOne();
        const home = await Team.create({ name: 'home team 2', ageGroup: ageGroup._id, clubName: 'Home Club' });
        const away = await Team.create({ name: 'away team 2', ageGroup: ageGroup._id, clubName: 'Away Club' });
        const match = await SeasonMatch.create({
            ageGroup: ageGroup._id, season: '2025/2026', matchDate: new Date(),
            homeTeam: home._id, awayTeam: away._id, attendees: [coachId], createdBy: coachId,
        });

        const okReq = mockReq({ params: { id: match._id.toString() }, user: { _id: coachId, role: 'coach' } });
        expect(await callGuard(checkSeasonMatchAttendee, okReq)).toBeUndefined();

        const rejectReq = mockReq({ params: { id: match._id.toString() }, user: { _id: otherCoachId, role: 'coach' } });
        const result = await callGuard(checkSeasonMatchAttendee, rejectReq);
        expect(result).toBeInstanceOf(Error);
        expect(result.statusCode).toBe(403);
    });
});
