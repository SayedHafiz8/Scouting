import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import Player from '../../models/playedModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import PlayerMedia from '../../models/playerMediaModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createPlayer,
  createReport,
  defaultTeamIds,
  setupPlayerMatchDay,
  reportPayload,
  playerPayload,
  dobForAge,
} from '../helpers/factory.js';

// observer-matches-and-players, stage 5 — locks requirement 4 in place: two
// observers assigned to the same player never see each other's reports or
// media. This was already true before this feature (report/media listing has
// always been per-author for every non-admin role — see
// scoutingReportController.getAll:146-147 and
// playerMediaController.getAll:166-167, neither of which this feature touched)
// — this file exists to *prove* it, not to change anything, now that observer
// is a write-capable role and the isolation claim is load-bearing for it.

const auth = (token) => ['Authorization', `Bearer ${token}`];

let admin, coach, obsA, obsB;

beforeEach(async () => {
  await seedAgeGroups();
  admin = await createAdmin();
  coach = await createCoach();
  obsA = await createObserver({ email: `obsA_${Date.now()}@test.com` });
  obsB = await createObserver({ email: `obsB_${Date.now()}@test.com` });
});

async function assignBoth(playerId) {
  await Player.findByIdAndUpdate(playerId, { status: 'observed', observers: [obsA.user._id, obsB.user._id] });
}

describe("Two observers assigned to the same player never see each other's reports or media", () => {
  it('each observer sees exactly their own report on GET /players/:id/reports', async () => {
    const player = await createPlayer(coach.token);
    await assignBoth(player._id);

    const reportA = await createReport(obsA.token, player._id, { notes: 'A wrote this' });
    const reportB = await createReport(obsB.token, player._id, { notes: 'B wrote this' });

    const listAsA = await request(app).get(`/api/v1/players/${player._id}/reports`).set(...auth(obsA.token));
    expect(listAsA.status).toBe(200);
    expect(listAsA.body.data.documents.map((d) => d._id)).toEqual([reportA._id]);

    const listAsB = await request(app).get(`/api/v1/players/${player._id}/reports`).set(...auth(obsB.token));
    expect(listAsB.status).toBe(200);
    expect(listAsB.body.data.documents.map((d) => d._id)).toEqual([reportB._id]);
  });

  it("GET /players/:playerId/reports/:id on the other observer's report is 403, not empty", async () => {
    const player = await createPlayer(coach.token);
    await assignBoth(player._id);

    const reportA = await createReport(obsA.token, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports/${reportA._id}`)
      .set(...auth(obsB.token));
    expect(res.status).toBe(403);
  });

  it('each observer sees exactly their own media on GET /players/:id/media, including GET /media/:id', async () => {
    const player = await createPlayer(coach.token);
    await assignBoth(player._id);

    const mediaA = await PlayerMedia.create({
      player: player._id, uploadedBy: obsA.user._id, type: 'image',
      storage: 'bunny', storageKey: 'player-media/a.webp', status: 'ready', title: 'A image',
    });
    const mediaB = await PlayerMedia.create({
      player: player._id, uploadedBy: obsB.user._id, type: 'image',
      storage: 'bunny', storageKey: 'player-media/b.webp', status: 'ready', title: 'B image',
    });

    const listAsA = await request(app).get(`/api/v1/players/${player._id}/media`).set(...auth(obsA.token));
    expect(listAsA.status).toBe(200);
    expect(listAsA.body.data.documents.map((d) => d._id)).toEqual([mediaA._id.toString()]);

    const listAsB = await request(app).get(`/api/v1/players/${player._id}/media`).set(...auth(obsB.token));
    expect(listAsB.status).toBe(200);
    expect(listAsB.body.data.documents.map((d) => d._id)).toEqual([mediaB._id.toString()]);

    const getOtherById = await request(app)
      .get(`/api/v1/players/${player._id}/media/${mediaA._id}`)
      .set(...auth(obsB.token));
    expect(getOtherById.status).toBe(403);
  });

  it('admin sees both, and ?authorRole=observer returns both reports', async () => {
    const player = await createPlayer(coach.token);
    await assignBoth(player._id);

    await createReport(obsA.token, player._id);
    await createReport(obsB.token, player._id);

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports?authorRole=observer`)
      .set(...auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.documents.length).toBe(2);
  });
});

describe('A player created by one observer and later assigned to a second — same isolation applies', () => {
  it("the second observer sees the player but neither the first observer's report nor media", async () => {
    const created = await request(app)
      .post('/api/v1/players')
      .set(...auth(obsA.token))
      .send(playerPayload({ dateOfBirth: dobForAge(14) }));
    expect(created.status).toBe(201);
    const playerId = created.body.data.document._id;

    const reportA = await createReport(obsA.token, playerId);
    const mediaA = await PlayerMedia.create({
      player: playerId, uploadedBy: obsA.user._id, type: 'image',
      storage: 'bunny', storageKey: 'player-media/a2.webp', status: 'ready', title: 'A image',
    });

    const assign = await request(app)
      .patch(`/api/v1/players/${playerId}/observers`)
      .set(...auth(admin.token))
      .send({ observers: [obsA.user._id.toString(), obsB.user._id.toString()] });
    expect(assign.status).toBe(200);

    // B sees the player itself
    const byId = await request(app).get(`/api/v1/players/${playerId}`).set(...auth(obsB.token));
    expect(byId.status).toBe(200);

    // ...but neither A's report...
    const reportsAsB = await request(app).get(`/api/v1/players/${playerId}/reports`).set(...auth(obsB.token));
    expect(reportsAsB.status).toBe(200);
    expect(reportsAsB.body.data.documents.length).toBe(0);

    const reportByIdAsB = await request(app)
      .get(`/api/v1/players/${playerId}/reports/${reportA._id}`)
      .set(...auth(obsB.token));
    expect(reportByIdAsB.status).toBe(403);

    // ...nor A's media
    const mediaAsB = await request(app).get(`/api/v1/players/${playerId}/media`).set(...auth(obsB.token));
    expect(mediaAsB.status).toBe(200);
    expect(mediaAsB.body.data.documents.length).toBe(0);

    const mediaByIdAsB = await request(app)
      .get(`/api/v1/players/${playerId}/media/${mediaA._id}`)
      .set(...auth(obsB.token));
    expect(mediaByIdAsB.status).toBe(403);
  });
});

describe('GET /seasonMatches/:id expansion — each observer sees only their own reports/media', () => {
  it('two observers attending the same match each see only their own scouting output on it', async () => {
    const player = await createPlayer(coach.token);
    await assignBoth(player._id);

    const p = await Player.findById(player._id).select('ageGroup');
    const teamIds = await defaultTeamIds(p.ageGroup);
    const match = await setupPlayerMatchDay(player._id, teamIds, undefined, { attendedBy: obsA.user._id });
    await SeasonMatch.findByIdAndUpdate(match._id, { $addToSet: { attendees: obsB.user._id } });

    await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: obsA.user._id,
      matchDate: match.matchDate, homeTeam: teamIds.homeTeam, awayTeam: teamIds.awayTeam, seasonMatch: match._id,
    });
    await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: obsB.user._id,
      matchDate: match.matchDate, homeTeam: teamIds.homeTeam, awayTeam: teamIds.awayTeam, seasonMatch: match._id,
    });
    await PlayerMedia.create({
      player: player._id, uploadedBy: obsA.user._id, type: 'image', storage: 'bunny',
      storageKey: 'player-media/matchA.webp', status: 'ready', title: 'A media', seasonMatch: match._id,
    });
    await PlayerMedia.create({
      player: player._id, uploadedBy: obsB.user._id, type: 'image', storage: 'bunny',
      storageKey: 'player-media/matchB.webp', status: 'ready', title: 'B media', seasonMatch: match._id,
    });

    const asA = await request(app).get(`/api/v1/seasonMatches/${match._id}`).set(...auth(obsA.token));
    expect(asA.status).toBe(200);
    expect(asA.body.data.document.reports.length).toBe(1);
    expect(asA.body.data.document.media.length).toBe(1);
    expect(asA.body.data.document.media[0].title).toBe('A media');

    const asB = await request(app).get(`/api/v1/seasonMatches/${match._id}`).set(...auth(obsB.token));
    expect(asB.status).toBe(200);
    expect(asB.body.data.document.reports.length).toBe(1);
    expect(asB.body.data.document.media.length).toBe(1);
    expect(asB.body.data.document.media[0].title).toBe('B media');
  });
});
