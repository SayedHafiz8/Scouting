import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import AgeGroup from '../models/ageGroupModel.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import Player from '../models/playedModel.js';
import ScoutingReport from '../models/scoutingReportModel.js';
import PlayerMedia from '../models/playerMediaModel.js';
import {
  createAdmin,
  createCoach,
  createObserver,
  createPlayer,
  createTeam,
  defaultTeamIds,
  setupPlayerMatchDay,
  reportPayload,
  seedAgeGroups,
} from './helpers/factory.js';

// بيرجع فئتين عمريتين مختلفتين + فريقين تابعين للفئة الأولى (وللدوري المطلوب، الممتاز افتراضيًا)
async function setupFixtures(league = 'premier') {
  const groups = await AgeGroup.find().sort({ birthYear: 1 }).limit(2);
  const [ageGroupA, ageGroupB] = groups;
  const home = await createTeam(ageGroupA._id, { name: `home_team_${league}`, league });
  const away = await createTeam(ageGroupA._id, { name: `away_team_${league}`, league });
  return { ageGroupA, ageGroupB, home, away };
}

// دايما فى المستقبل عشان مايتقفلش بقاعدة "منع تعديل المباريات اللي فاتت"
function futureMatchDate(monthsAhead = 6) {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d;
}

function matchPayload(overrides = {}) {
  const year = new Date().getFullYear();
  return {
    season: `${year}/${year + 1}`,
    league: 'premier',
    matchDate: futureMatchDate().toISOString(),
    ...overrides,
  };
}

async function createMatch(adminToken, payload) {
  return request(app)
    .post('/api/v1/seasonMatches')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(payload);
}

// الكشاف بيسجّل حضوره بنفسه (self-service)
async function attend(token, id) {
  return request(app)
    .post(`/api/v1/seasonMatches/${id}/attend`)
    .set('Authorization', `Bearer ${token}`);
}

async function unattend(token, id) {
  return request(app)
    .delete(`/api/v1/seasonMatches/${id}/attend`)
    .set('Authorization', `Bearer ${token}`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  POST /api/v1/seasonMatches
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/v1/seasonMatches', () => {
  beforeEach(seedAgeGroups);

  it('admin creates a season match (201) and stamps createdBy', async () => {
    const { token, user } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(201);
    expect(res.body.data.document.season).toBe(matchPayload().season);
    expect(res.body.data.document.status).toBe('scheduled');
    expect(String(res.body.data.document.createdBy)).toBe(String(user._id));
  });

  it('coach cannot create a season match (403)', async () => {
    await createAdmin(); // seed nothing special
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(coachToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(403);
  });

  it('rejects a team from a different age group (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, ageGroupB, home } = await setupFixtures();
    const otherTeam = await createTeam(ageGroupB._id, { name: 'other_group_team' });

    const res = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: otherTeam._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('rejects when homeTeam equals awayTeam (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home } = await setupFixtures();

    const res = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: home._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('rejects an invalid season format (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(token, matchPayload({
      season: '2025-2026',
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('rejects a non-consecutive season (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(token, matchPayload({
      season: '2025/2028',
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('rejects a missing matchDate (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(token, {
      season: '2025/2026',
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    });

    expect(res.status).toBe(400);
  });

  it('rejects a return match that repeats the same home team the two teams already played this season (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const first = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      matchDate: futureMatchDate(6).toISOString(),
    }));
    expect(first.status).toBe(201);

    // same two teams, same home/away order, different day — still rejected
    const rematch = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      matchDate: futureMatchDate(8).toISOString(),
    }));
    expect(rematch.status).toBe(400);
  });

  it('allows the return match once home and away are swapped (201)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const first = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      matchDate: futureMatchDate(6).toISOString(),
    }));
    expect(first.status).toBe(201);

    const returnLeg = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: away._id.toString(),
      awayTeam: home._id.toString(),
      matchDate: futureMatchDate(8).toISOString(),
    }));
    expect(returnLeg.status).toBe(201);
  });

  it('allows the same home/away pairing again in a DIFFERENT season (201)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();
    const year = new Date().getFullYear();

    const first = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      season: `${year}/${year + 1}`,
      matchDate: futureMatchDate(6).toISOString(),
    }));
    expect(first.status).toBe(201);

    const nextSeason = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      season: `${year + 1}/${year + 2}`,
      matchDate: futureMatchDate(18).toISOString(),
    }));
    expect(nextSeason.status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/seasonMatches
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/seasonMatches', () => {
  beforeEach(seedAgeGroups);

  it('lists matches filtered by ageGroup, sorted by matchDate', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    await createMatch(token, matchPayload({
      matchDate: futureMatchDate(8).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    await createMatch(token, matchPayload({
      matchDate: futureMatchDate(3).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: away._id.toString(), // return leg — home/away must swap
      awayTeam: home._id.toString(),
    }));

    const res = await request(app)
      .get(`/api/v1/seasonMatches?ageGroup=${ageGroupA._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
    const dates = res.body.data.documents.map((m) => new Date(m.matchDate).getTime());
    expect(dates[0]).toBeLessThan(dates[1]); // ascending by matchDate
  });

  it('filters by matchDate[gte] — the bracket operator survives the whitelist', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    await createMatch(token, matchPayload({
      matchDate: futureMatchDate(3).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    await createMatch(token, matchPayload({
      matchDate: futureMatchDate(20).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: away._id.toString(), // return leg — home/away must swap
      awayTeam: home._id.toString(),
    }));

    const cutoff = futureMatchDate(10).toISOString();
    const res = await request(app)
      .get(`/api/v1/seasonMatches?matchDate[gte]=${encodeURIComponent(cutoff)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
    expect(new Date(res.body.data.documents[0].matchDate).getTime())
      .toBeGreaterThanOrEqual(new Date(cutoff).getTime());
  });

  it('returns the full schedule when no query params are sent', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();
    await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
  });

  it('coach can read the schedule', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${coachToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
  });

  it('an observer only sees matches for the team(s) of the player(s) they were assigned to observe', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { token: observerToken, user: observer } = await createObserver();
    const { ageGroupA, home: teamA, away: teamB } = await setupFixtures();
    const teamC = await createTeam(ageGroupA._id, { name: 'unrelated_team' });

    const player = await createPlayer(coachToken);
    await Player.findByIdAndUpdate(player._id, { team: teamA._id, observers: [observer._id] });

    // visible: teamA (the observed player's team) is involved
    const visible = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: teamA._id.toString(),
      awayTeam: teamB._id.toString(),
    }));
    // not visible: neither team has anything to do with the observed player
    await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: teamB._id.toString(),
      awayTeam: teamC._id.toString(),
    }));

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${observerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
    expect(res.body.data.documents[0]._id).toBe(visible.body.data.document._id);
  });

  it('an observer with no assigned players (or an assigned player with no team) sees zero matches', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: observerToken } = await createObserver();
    const { ageGroupA, home, away } = await setupFixtures();

    await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', `Bearer ${observerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(0);
  });

  it('filters by attendees — a coach can fetch only matches they self-enrolled in', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();
    const { token: otherToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const mine = await createMatch(adminToken, matchPayload({
      matchDate: futureMatchDate(4).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const other = await createMatch(adminToken, matchPayload({
      matchDate: futureMatchDate(5).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: away._id.toString(), // return leg — home/away must swap
      awayTeam: home._id.toString(),
    }));

    // each coach self-enrolls to a different match
    await attend(coachToken, mine.body.data.document._id);
    await attend(otherToken, other.body.data.document._id);

    const res = await request(app)
      .get(`/api/v1/seasonMatches?attendees=${coach._id}`)
      .set('Authorization', `Bearer ${coachToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(1);
    expect(res.body.data.documents[0]._id).toBe(mine.body.data.document._id);
  });

  it('filters by league — premier and professional are separate schedules', async () => {
    const { token: adminToken } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures('premier');
    const proTeams = await setupFixtures('professional');

    await createMatch(adminToken, matchPayload({
      league: 'premier',
      matchDate: futureMatchDate(4).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    await createMatch(adminToken, matchPayload({
      league: 'professional',
      matchDate: futureMatchDate(4).toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: proTeams.home._id.toString(),
      awayTeam: proTeams.away._id.toString(),
    }));

    const premier = await request(app)
      .get(`/api/v1/seasonMatches?league=premier`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(premier.status).toBe(200);
    expect(premier.body.data.documents.length).toBe(1);
    expect(premier.body.data.documents[0].league).toBe('premier');
  });

  it('rejects a homeTeam/awayTeam whose league differs from the match league (400)', async () => {
    const { token: adminToken } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures('premier');

    const res = await createMatch(adminToken, matchPayload({
      league: 'professional',
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET / PATCH / DELETE /api/v1/seasonMatches/:id
// ══════════════════════════════════════════════════════════════════════════════
describe('GET/PATCH/DELETE /api/v1/seasonMatches/:id', () => {
  beforeEach(seedAgeGroups);

  it('get one returns populated teams', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .get(`/api/v1/seasonMatches/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.document.homeTeam.name).toBe('home_team_premier');
    expect(res.body.data.document.awayTeam.name).toBe('away_team_premier');
  });

  it('admin edits a match (venue); stamps updatedBy', async () => {
    const { token, user } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ venue: 'Cairo Stadium' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.venue).toBe('Cairo Stadium');
    expect(String(res.body.data.document.updatedBy)).toBe(String(user._id));
  });

  it('rejects sending attendees on create or update — attendance is self-service (400)', async () => {
    const { token } = await createAdmin();
    const { user: coach } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const onCreate = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
      attendees: [coach._id.toString()],
    }));
    expect(onCreate.status).toBe(400);

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const onUpdate = await request(app)
      .patch(`/api/v1/seasonMatches/${created.body.data.document._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ attendees: [coach._id.toString()] });
    expect(onUpdate.status).toBe(400);
  });

  it('rejects creating a match without a league (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const { league, ...noLeague } = matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    });

    const res = await createMatch(token, noLeague);
    expect(res.status).toBe(400);
  });

  it('rejects status/result on the general update endpoint (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(400);
  });

  it('rejects registering the same two teams on the same date/age group again (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    // same fixture, teams swapped, same day — still a duplicate
    const res = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: away._id.toString(),
      awayTeam: home._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('a self-enrolled attendee coach can update status/result via the status endpoint on match day', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    // الحضور بيتسجل قبل يوم المباراة، لكن النتيجة بتتسجل يوم المباراة نفسه — بنستخدم فيك تايمرز
    // عشان نتحكم فى "دلوقتى" ونتنقل من "قبل الماتش" (للتسجيل) لـ "يوم الماتش" (للنتيجة)
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 9, 0, 0));
    const matchDate = new Date(2026, 5, 16, 0, 0, 0);

    try {
      const created = await createMatch(adminToken, matchPayload({
        ageGroup: ageGroupA._id.toString(),
        homeTeam: home._id.toString(),
        awayTeam: away._id.toString(),
        matchDate: matchDate.toISOString(),
      }));
      const id = created.body.data.document._id;

      // self-enroll while it's still before the match day
      await attend(coachToken, id);

      // move the clock to the match day itself
      vi.setSystemTime(new Date(2026, 5, 16, 15, 0, 0));

      const res = await request(app)
        .patch(`/api/v1/seasonMatches/${id}/status`)
        .set('Authorization', `Bearer ${coachToken}`)
        .send({ status: 'completed', result: { homeScore: 2, awayScore: 1 } });

      expect(res.status).toBe(200);
      expect(res.body.data.document.status).toBe('completed');
      expect(res.body.data.document.result.homeScore).toBe(2);
      expect(String(res.body.data.document.updatedBy)).toBe(String(coach._id));
    } finally {
      vi.useRealTimers();
    }
  });

  it('an attendee coach cannot enter the match result before match day (400)', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    // matchPayload بيستخدم matchDate في المستقبل افتراضيًا (6 شهور قدام)
    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    await attend(coachToken, id);

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}/status`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ status: 'completed', result: { homeScore: 2, awayScore: 1 } });

    expect(res.status).toBe(400);
  });

  it('changing status to something other than completed (e.g. cancelled) is not restricted to match day', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    await attend(coachToken, id);

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}/status`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ status: 'postponed' });

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('postponed');
  });

  it('a coach who is not an attendee cannot update status (403)', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}/status`)
      .set('Authorization', `Bearer ${coachToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(403);
  });

  it('admin deletes a match (204)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .delete(`/api/v1/seasonMatches/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('rejects updating a match whose date has already passed (400)', async () => {
    const { token, user } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    // مباريات فاتت بيوم متاريخها ميتسجلش عن طريق الـ API (matchDateNotPast) —
    // بتتسجل غالبا وهي فى المستقبل وبعدين ميعادها بيعدي، فبنحاكي ده بإدخالها مباشرة فى الداتابيز
    const past = await SeasonMatch.create({
      ageGroup: ageGroupA._id,
      season: matchPayload().season,
      matchDate: new Date('2020-01-01'),
      homeTeam: home._id,
      awayTeam: away._id,
      createdBy: user._id,
    });

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${past._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ venue: 'New venue' });

    expect(res.status).toBe(400);
  });

  it('rejects deleting a match whose date has already passed (400)', async () => {
    const { token, user } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const past = await SeasonMatch.create({
      ageGroup: ageGroupA._id,
      season: matchPayload().season,
      matchDate: new Date('2020-01-01'),
      homeTeam: home._id,
      awayTeam: away._id,
      createdBy: user._id,
    });

    const res = await request(app)
      .delete(`/api/v1/seasonMatches/${past._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  it('rejects creating a match with a matchDate in the past (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const res = await createMatch(token, matchPayload({
      matchDate: new Date('2020-01-01').toISOString(),
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    expect(res.status).toBe(400);
  });

  it('rejects updating a (future) match to a matchDate in the past (400)', async () => {
    const { token } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(token, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const res = await request(app)
      .patch(`/api/v1/seasonMatches/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ matchDate: new Date('2020-01-01').toISOString() });

    expect(res.status).toBe(400);
  });

  // Regression: a <input type="date"> value serializes to UTC midnight (e.g. "today" →
  // "...T00:00:00.000Z"), which is always "earlier today" than the current instant.
  // Comparing against Date.now() instead of start-of-day rejected every "today" match.
  it('accepts creating a match dated today, even as a UTC-midnight timestamp (400 regression)', async () => {
    // Pin the clock to a fixed local noon so this test is deterministic regardless
    // of when it actually runs — real wall-clock time in the 00:00–03:00 local
    // window (server ahead of UTC) makes "today at UTC midnight" resolve to a
    // moment before local start-of-day, flaking this exact scenario otherwise.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));

    try {
      const { token } = await createAdmin();
      const { ageGroupA, home, away } = await setupFixtures();

      const todayMidnightUTC = new Date();
      todayMidnightUTC.setUTCHours(0, 0, 0, 0);

      const res = await createMatch(token, matchPayload({
        matchDate: todayMidnightUTC.toISOString(),
        ageGroup: ageGroupA._id.toString(),
        homeTeam: home._id.toString(),
        awayTeam: away._id.toString(),
      }));

      expect(res.status).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  POST / DELETE /api/v1/seasonMatches/:id/attend  — self-service attendance
// ══════════════════════════════════════════════════════════════════════════════
describe('POST/DELETE /api/v1/seasonMatches/:id/attend', () => {
  beforeEach(seedAgeGroups);

  it('a coach can self-enroll and un-enroll', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));
    const id = created.body.data.document._id;

    const joined = await attend(coachToken, id);
    expect(joined.status).toBe(200);
    expect(joined.body.data.document.attendees.map((a) => String(a._id ?? a))).toContain(String(coach._id));

    // idempotent — attending twice keeps a single entry
    await attend(coachToken, id);
    const refetch = await request(app).get(`/api/v1/seasonMatches/${id}`).set('Authorization', `Bearer ${coachToken}`);
    const count = refetch.body.data.document.attendees.filter((a) => String(a._id ?? a) === String(coach._id)).length;
    expect(count).toBe(1);

    const left = await unattend(coachToken, id);
    expect(left.status).toBe(200);
    expect(left.body.data.document.attendees.map((a) => String(a._id ?? a))).not.toContain(String(coach._id));
  });

  it('an observer can self-enroll too', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: observerToken } = await createObserver();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    const res = await attend(observerToken, created.body.data.document._id);
    expect(res.status).toBe(200);
  });

  it('cannot attend a cancelled match (400)', async () => {
    const { token: adminToken, user: admin } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    const cancelled = await SeasonMatch.create({
      ageGroup: ageGroupA._id,
      season: matchPayload().season,
      league: 'premier',
      matchDate: futureMatchDate(3),
      homeTeam: home._id,
      awayTeam: away._id,
      status: 'cancelled',
      createdBy: admin._id,
    });

    const res = await attend(coachToken, cancelled._id.toString());
    expect(res.status).toBe(400);
  });

  it('an admin cannot self-enroll (403)', async () => {
    const { token: adminToken } = await createAdmin();
    const { ageGroupA, home, away } = await setupFixtures();

    const created = await createMatch(adminToken, matchPayload({
      ageGroup: ageGroupA._id.toString(),
      homeTeam: home._id.toString(),
      awayTeam: away._id.toString(),
    }));

    const res = await attend(adminToken, created.body.data.document._id);
    expect(res.status).toBe(403);
  });

  it('cannot self-enroll once the match day has arrived (400)', async () => {
    const { user: admin } = await createAdmin();
    const { token: coachToken } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    // matchDate = today → the attendance cutoff (start of match day) has already passed
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysMatch = await SeasonMatch.create({
      ageGroup: ageGroupA._id,
      season: matchPayload().season,
      league: 'premier',
      matchDate: today,
      homeTeam: home._id,
      awayTeam: away._id,
      createdBy: admin._id,
    });

    const res = await attend(coachToken, todaysMatch._id.toString());
    expect(res.status).toBe(400);
  });

  it('cannot cancel attendance once the match day has arrived, even if already attending (400)', async () => {
    const { user: admin } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();
    const { ageGroupA, home, away } = await setupFixtures();

    // enroll while it's still the day before, then simulate match day arriving
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const upcoming = await SeasonMatch.create({
      ageGroup: ageGroupA._id,
      season: matchPayload().season,
      league: 'premier',
      matchDate: tomorrow,
      homeTeam: home._id,
      awayTeam: away._id,
      attendees: [coach._id],
      createdBy: admin._id,
    });

    // push matchDate back to today directly in the DB to simulate the day arriving
    await SeasonMatch.findByIdAndUpdate(upcoming._id, {
      matchDate: new Date(new Date().setHours(0, 0, 0, 0)),
    });

    const res = await unattend(coachToken, upcoming._id.toString());
    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
//  GET /api/v1/seasonMatches/:id — تسريب بيانات الكشافين التانيين (reports/media)
//  كل كشاف بيشوف اللي هو كاتبه/رافعه بس؛ الأدمن بيشوف الكل
// ══════════════════════════════════════════════════════════════════════════════
describe('GET /api/v1/seasonMatches/:id — per-scout scoping of reports & media', () => {
  beforeEach(seedAgeGroups);

  const getMatch = (token, id) =>
    request(app).get(`/api/v1/seasonMatches/${id}`).set('Authorization', `Bearer ${token}`);

  // ماتش عليه تقرير + فيديو للكوتش B، وصورة للأوبزيرفر — ولا حاجة للكوتش A
  async function seedForeignScoutingData() {
    const coachB = await createCoach();
    const observer = await createObserver();

    const playerB = await createPlayer(coachB.token);
    const p = await Player.findById(playerB._id).select('ageGroup');
    const teamIds = await defaultTeamIds(p.ageGroup);
    const seasonMatch = await setupPlayerMatchDay(playerB._id, teamIds);

    await ScoutingReport.create({
      ...reportPayload(),
      player: playerB._id,
      coach: coachB.user._id,
      matchDate: seasonMatch.matchDate,
      homeTeam: teamIds.homeTeam,
      awayTeam: teamIds.awayTeam,
      seasonMatch: seasonMatch._id,
    });

    await PlayerMedia.create({
      player: playerB._id,
      uploadedBy: coachB.user._id,
      type: 'video',
      storage: 'bunny',
      bunnyVideoId: 'ready_b',
      status: 'ready',
      title: 'B PRIVATE VIDEO',
      seasonMatch: seasonMatch._id,
    });

    await PlayerMedia.create({
      player: playerB._id,
      uploadedBy: observer.user._id,
      type: 'image',
      storage: 'bunny',
      storageKey: 'player-media/observer-private.webp',
      status: 'ready',
      title: 'OBSERVER PRIVATE IMAGE',
      seasonMatch: seasonMatch._id,
    });

    return { coachB, observer, seasonMatch, playerB };
  }

  it('a coach with no data on the match gets 200 with empty reports/media (no cross-scout leak)', async () => {
    const { seasonMatch } = await seedForeignScoutingData();
    const { token: coachAToken } = await createCoach();

    const res = await getMatch(coachAToken, seasonMatch._id.toString());

    // 200 مش 403 — الصفحة لازم تفضل تفتح، بس فاضية من بيانات غيره
    expect(res.status).toBe(200);
    expect(res.body.data.document.reports).toEqual([]);
    expect(res.body.data.document.media).toEqual([]);
    // ولا حتى اسم اللاعب بتاع الكوتش التاني بيتسرب من الـ nested populate
    expect(JSON.stringify(res.body)).not.toContain('B PRIVATE VIDEO');
    expect(JSON.stringify(res.body)).not.toContain('OBSERVER PRIVATE IMAGE');
  });

  it('the owning coach still sees their OWN report and media on the same match', async () => {
    const { coachB, seasonMatch } = await seedForeignScoutingData();

    const res = await getMatch(coachB.token, seasonMatch._id.toString());

    expect(res.status).toBe(200);
    const doc = res.body.data.document;
    expect(doc.reports).toHaveLength(1);
    expect(String(doc.reports[0].coach._id)).toBe(String(coachB.user._id));
    expect(doc.reports[0].overallRating).toBeGreaterThan(0);
    // بيشوف اللي هو رفعه بس — صورة الأوبزيرفر على نفس الماتش مش بتبان له
    expect(doc.media).toHaveLength(1);
    expect(doc.media[0].title).toBe('B PRIVATE VIDEO');
    expect(doc.media[0].url).toBeTruthy(); // الـ signed URL لسه بيتولد لصاحبها
  });

  it("an observer sees only the media they uploaded, not the coach's", async () => {
    const { observer, seasonMatch } = await seedForeignScoutingData();

    const res = await getMatch(observer.token, seasonMatch._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.document.reports).toEqual([]); // التقرير مكتوب بالكوتش B
    expect(res.body.data.document.media).toHaveLength(1);
    expect(res.body.data.document.media[0].title).toBe('OBSERVER PRIVATE IMAGE');
  });

  it('an admin still sees every report and media on the match', async () => {
    const { seasonMatch } = await seedForeignScoutingData();
    const { token: adminToken } = await createAdmin();

    const res = await getMatch(adminToken, seasonMatch._id.toString());

    expect(res.status).toBe(200);
    expect(res.body.data.document.reports).toHaveLength(1);
    expect(res.body.data.document.media).toHaveLength(2); // كوتش + أوبزيرفر
  });
});
