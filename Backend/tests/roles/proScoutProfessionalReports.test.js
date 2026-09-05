import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';

import app from '../../app.js';
import Team from '../../models/teamModel.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import {
  seedAgeGroups,
  createProScout,
  reportPayload,
  playerPayload,
  dobForAge,
} from '../helpers/factory.js';

// ============================================================================
// proScout بيكتب تقرير على لاعبه المحترف.
//
// الشكوى كانت "الـproScout مش عارف يرفع تقارير للاعب بتاعه". الباك إند طلع
// سليم — الملف ده بيثبت ده — والعطل كان كله في الفرونت إند: دالة تحميل
// الاختيارات في report-form كانت مبنية على الفئة العمرية وحدها، واللاعب
// المحترف مالوش فئة عمرية، فكانت بتعمل return قبل ما تحمّل أي فرق أو أي
// مباريات. النتيجة إن التقرير الرسمي مكانش بيلاقي مباراة يترتبط بيها أبداً.
//
// التستات دي بتقفل السلوك المتوقع من ناحية السيرفر عشان أي تغيير جاي في
// resolveMatchTypeFields ما يكسرش الدور ده من غير ما حد ياخد باله:
// المباراة المحترفين مباراة عادية بالنسبة للقاعدة دي — الفلتر بالفريق
// والتاريخ، بلا أي قيد على الدوري أو الفئة العمرية.
// ============================================================================

const auth = (t) => ['Authorization', `Bearer ${t}`];

let scout, proTeam, awayTeam;

beforeEach(async () => {
  await seedAgeGroups();
  scout = await createProScout({ email: `scout_reports_${Date.now()}@test.com` });
  proTeam = await Team.create({ name: 'Pro Home Club', clubName: 'Pro Home Club', league: 'professional' });
  awayTeam = await Team.create({ name: 'Pro Away Club', clubName: 'Pro Away Club', league: 'professional' });
});

async function professionalPlayerWithTeam() {
  const res = await request(app)
    .post('/api/v1/players')
    .set(...auth(scout.token))
    .send(playerPayload({ dateOfBirth: dobForAge(25), team: proTeam._id.toString() }));

  expect(res.status).toBe(201);
  expect(res.body.data.document.isProfessional).toBe(true);
  // المحترف مالوش فئة عمرية — ده بالظبط اللي كان بيكسر الفرونت إند
  expect(res.body.data.document.ageGroup).toBeFalsy();
  return res.body.data.document;
}

async function scheduleProfessionalMatchToday() {
  const now = new Date();
  return SeasonMatch.create({
    season: '2026/2027',
    league: 'professional',
    homeTeam: proTeam._id,
    awayTeam: awayTeam._id,
    matchDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
    createdBy: scout.user._id,
  });
}

describe('proScout files a report on its own professional player', () => {
  it('links an official report to a professional fixture scheduled today', async () => {
    const player = await professionalPlayerWithTeam();
    const match = await scheduleProfessionalMatchToday();

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'official' });

    expect(res.status).toBe(201);

    const saved = await ScoutingReport.findById(res.body.data.document._id);
    expect(saved.coach.toString()).toBe(scout.user._id.toString());
    // المباراة اتربطت تلقائياً، والتاريخ بتاع المباراة نفسها مش تاريخ الإنشاء
    expect(saved.seasonMatch.toString()).toBe(match._id.toString());
    expect(saved.matchDate.getTime()).toBe(match.matchDate.getTime());
  });

  it('a training report needs no fixture at all', async () => {
    const player = await professionalPlayerWithTeam();

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'training' });

    expect(res.status).toBe(201);
  });

  it('a friendly report names the opponent and needs no fixture', async () => {
    const player = await professionalPlayerWithTeam();

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'friendly', awayTeam: awayTeam._id.toString() });

    expect(res.status).toBe(201);
    const saved = await ScoutingReport.findById(res.body.data.document._id);
    // فريق اللاعب بيتحط تلقائي كصاحب أرض
    expect(saved.homeTeam.toString()).toBe(proTeam._id.toString());
    expect(saved.awayTeam.toString()).toBe(awayTeam._id.toString());
  });

  it('⚠️ still refuses an official report on a day with no fixture — the anti-backdating rule holds', async () => {
    const player = await professionalPlayerWithTeam();
    // مفيش مباراة النهارده عن قصد

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'official' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/scheduled match/i);
  });

  it("⚠️ a fixture belonging to another club does not unlock today's official report", async () => {
    const player = await professionalPlayerWithTeam();
    const otherA = await Team.create({ name: 'Unrelated A', clubName: 'Unrelated A', league: 'professional' });
    const otherB = await Team.create({ name: 'Unrelated B', clubName: 'Unrelated B', league: 'professional' });
    const now = new Date();
    await SeasonMatch.create({
      season: '2026/2027', league: 'professional',
      homeTeam: otherA._id, awayTeam: otherB._id,
      matchDate: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      createdBy: scout.user._id,
    });

    const res = await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'official' });

    expect(res.status).toBe(400);
  });

  it('reads its own professional report back', async () => {
    const player = await professionalPlayerWithTeam();
    await scheduleProfessionalMatchToday();
    await request(app)
      .post(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token))
      .send({ ...reportPayload(), matchType: 'official' });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});
