import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import AgeGroup from '../../models/ageGroupModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import {
  seedAgeGroups,
  createAdmin,
  createProScout,
  createTeam,
} from '../helpers/factory.js';

// Stage 6 — HTTP-level contract for attend/status opened to proScout.
// specs/008-proscout-matches-attendance/contracts/season-match-attend-status.md, G-1...G-13.
//
// This file exercises the full route chain (allowedTo + checkSeasonMatchScope /
// checkSeasonMatchAttendee + controller), unlike proScoutDataScope.test.js's T042
// block, which calls the guard function directly. The guard-level scope+attendee
// logic is proven there; this file proves the route wiring and the controller's
// actual state changes (attendees array, status/result) on top of it.

let ageGroup;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
});

async function proMatchFixtures(matchDateOverride) {
  const admin = await createAdmin();
  const proTeams = [
    await createTeam(ageGroup._id, { league: 'professional' }),
    await createTeam(ageGroup._id, { league: 'professional' }),
  ];
  const premierTeams = [
    await createTeam(ageGroup._id, { league: 'premier' }),
    await createTeam(ageGroup._id, { league: 'premier' }),
  ];

  const proMatch = await SeasonMatch.create({
    ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
    matchDate: matchDateOverride ?? new Date('2026-03-01T00:00:00.000Z'),
    homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id, createdBy: admin.user._id,
  });
  const premierMatch = await SeasonMatch.create({
    ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
    matchDate: matchDateOverride ?? new Date('2026-03-02T00:00:00.000Z'),
    homeTeam: premierTeams[0]._id, awayTeam: premierTeams[1]._id, createdBy: admin.user._id,
  });

  return { admin, proMatch, premierMatch };
}

const attend = (token, id) =>
  request(app).post(`/api/v1/seasonMatches/${id}/attend`).set('Authorization', `Bearer ${token}`);

const unattend = (token, id) =>
  request(app).delete(`/api/v1/seasonMatches/${id}/attend`).set('Authorization', `Bearer ${token}`);

const enterStatus = (token, id, body) =>
  request(app).patch(`/api/v1/seasonMatches/${id}/status`).set('Authorization', `Bearer ${token}`).send(body);

// ═══════════════════════════════════════════════════════════════════════════
// POST/DELETE /:id/attend — G-1, G-2, G-6, G-7 (scope), G-3, G-4, G-8 (day window)
// ═══════════════════════════════════════════════════════════════════════════
describe('POST/DELETE /seasonMatches/:id/attend — proScout', () => {
  it('G-1: attends a professional-league match before match day (200, attendees gains id)', async () => {
    const scout = await createProScout();
    // matchDate far in the future so "before match day" holds regardless of test run date
    const { proMatch } = await proMatchFixtures(new Date('2027-01-01T00:00:00.000Z'));

    const res = await attend(scout.token, proMatch._id);

    expect(res.status).toBe(200);
    expect(res.body.data.document.attendees.map((a) => String(a._id ?? a))).toContain(String(scout.user._id));
  });

  it('G-2: attending a premier-league match is refused (403), attendMatch never runs', async () => {
    const scout = await createProScout();
    const { premierMatch } = await proMatchFixtures(new Date('2027-01-01T00:00:00.000Z'));

    const res = await attend(scout.token, premierMatch._id);

    expect(res.status).toBe(403);
    const refetched = await SeasonMatch.findById(premierMatch._id).setOptions({ skipPopulate: true });
    expect(refetched.attendees ?? []).toHaveLength(0);
  });

  it('G-3: attending on/after match day is refused (400) even for an in-scope match', async () => {
    const scout = await createProScout();
    const { proMatch } = await proMatchFixtures(new Date('2026-03-01T00:00:00.000Z'));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-01T09:00:00.000Z'));
    try {
      const res = await attend(scout.token, proMatch._id);
      expect(res.status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });

  it('G-4: attending a cancelled match is refused (400)', async () => {
    const scout = await createProScout();
    const { proMatch } = await proMatchFixtures(new Date('2027-01-01T00:00:00.000Z'));
    await SeasonMatch.findByIdAndUpdate(proMatch._id, { status: 'cancelled' });

    const res = await attend(scout.token, proMatch._id);
    expect(res.status).toBe(400);
  });

  it('G-6: unattends a professional-league match before match day (200, attendees loses id)', async () => {
    const scout = await createProScout();
    const { proMatch } = await proMatchFixtures(new Date('2027-01-01T00:00:00.000Z'));
    await attend(scout.token, proMatch._id);

    const res = await unattend(scout.token, proMatch._id);

    expect(res.status).toBe(200);
    expect(res.body.data.document.attendees.map((a) => String(a._id ?? a))).not.toContain(String(scout.user._id));
  });

  it('G-7: unattending a premier-league match is refused (403)', async () => {
    const scout = await createProScout();
    const { premierMatch } = await proMatchFixtures(new Date('2027-01-01T00:00:00.000Z'));

    const res = await unattend(scout.token, premierMatch._id);
    expect(res.status).toBe(403);
  });

  it('G-8: unattending on/after match day is refused (400)', async () => {
    const scout = await createProScout();
    const { proMatch } = await proMatchFixtures(new Date('2026-03-01T00:00:00.000Z'));

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-02-28T09:00:00.000Z'));
    try {
      await attend(scout.token, proMatch._id);
      vi.setSystemTime(new Date('2026-03-01T09:00:00.000Z'));
      const res = await unattend(scout.token, proMatch._id);
      expect(res.status).toBe(400);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PATCH /:id/status — G-9...G-12 (scope + attendee + same-day, all three axes)
// ═══════════════════════════════════════════════════════════════════════════
describe('PATCH /seasonMatches/:id/status — proScout', () => {
  it('G-9: attendee, in-scope, on match day — result is saved (200)', async () => {
    const scout = await createProScout();

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-02-28T09:00:00.000Z'));
    const matchDate = new Date('2026-03-01T00:00:00.000Z');

    try {
      const { proMatch } = await proMatchFixtures(matchDate);
      await attend(scout.token, proMatch._id);

      vi.setSystemTime(new Date('2026-03-01T15:00:00.000Z'));
      const res = await enterStatus(scout.token, proMatch._id, {
        status: 'completed', result: { homeScore: 2, awayScore: 1 },
      });

      expect(res.status).toBe(200);
      expect(res.body.data.document.status).toBe('completed');
      expect(res.body.data.document.result.homeScore).toBe(2);
      expect(String(res.body.data.document.updatedBy)).toBe(String(scout.user._id));
    } finally {
      vi.useRealTimers();
    }
  });

  it('G-10: attendee, in-scope, NOT on match day — refused (400)', async () => {
    const scout = await createProScout();
    // matchPayload style: far-future matchDate, "today" is not match day
    const { proMatch } = await proMatchFixtures(new Date('2027-06-15T00:00:00.000Z'));
    await attend(scout.token, proMatch._id);

    const res = await enterStatus(scout.token, proMatch._id, {
      status: 'completed', result: { homeScore: 2, awayScore: 1 },
    });
    expect(res.status).toBe(400);
  });

  it('G-11: in-scope, on match day, but NOT an attendee — refused (403)', async () => {
    const scout = await createProScout();

    vi.useFakeTimers({ toFake: ['Date'] });
    const matchDate = new Date('2026-03-01T00:00:00.000Z');
    vi.setSystemTime(matchDate);

    try {
      const { proMatch } = await proMatchFixtures(matchDate);
      // deliberately not attending

      const res = await enterStatus(scout.token, proMatch._id, { status: 'completed', result: { homeScore: 1, awayScore: 0 } });
      expect(res.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it('G-12: premier-league match, even if somehow an attendee — refused (403)', async () => {
    const scout = await createProScout();
    const { premierMatch } = await proMatchFixtures(new Date('2026-03-02T00:00:00.000Z'));
    // bypass the route to simulate "somehow recorded as an attendee" (edge case from spec.md)
    await SeasonMatch.findByIdAndUpdate(premierMatch._id, { $addToSet: { attendees: scout.user._id } });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-02T12:00:00.000Z'));
    try {
      const res = await enterStatus(scout.token, premierMatch._id, { status: 'completed', result: { homeScore: 1, awayScore: 0 } });
      expect(res.status).toBe(403);
    } finally {
      vi.useRealTimers();
    }
  });

  it('changing status to something other than completed is not restricted to match day (regression parity with coach)', async () => {
    const scout = await createProScout();
    const { proMatch } = await proMatchFixtures(new Date('2027-06-15T00:00:00.000Z'));
    await attend(scout.token, proMatch._id);

    const res = await enterStatus(scout.token, proMatch._id, { status: 'postponed' });
    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('postponed');
  });
});
