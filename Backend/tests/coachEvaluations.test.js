import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../app.js';
import Player from '../models/playedModel.js';
import ScoutingReport from '../models/scoutingReportModel.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import PlayerMedia from '../models/playerMediaModel.js';
import {
  createAdmin,
  createCoach,
  createObserver,
  createPlayer,
  createTeam,
  coachEvaluationPayload,
  seedAgeGroups,
} from './helpers/factory.js';
import { currentYearMonthUTC, isCurrentMonthUTC } from '../utils/time.js';

const BASE = '/api/v1/coachEvaluations';

const createEval = (token, coachId, overrides = {}) =>
  request(app)
    .post(BASE)
    .set('Authorization', `Bearer ${token}`)
    .send(coachEvaluationPayload({ coach: coachId, ...overrides }));

describe('Coach evaluations — create & validation', () => {
  beforeEach(seedAgeGroups);

  it('admin creates a draft — evaluator stamped, overallRating auto-averaged, status draft', async () => {
    const { token: adminToken, user: admin } = await createAdmin();
    const { user: coach } = await createCoach();

    const res = await createEval(adminToken, coach._id);
    expect(res.status).toBe(201);
    const doc = res.body.data.document;
    expect(doc.status).toBe('draft');
    expect(doc.evaluator._id ?? doc.evaluator).toBe(admin._id.toString());
    // avg of all 11 metrics in the default payload
    expect(doc.overallRating).toBeGreaterThan(0);
    expect(doc.publishedAt == null).toBe(true);
  });

  it('coach cannot create an evaluation (403)', async () => {
    const { token: coachToken, user: coach } = await createCoach();
    const res = await createEval(coachToken, coach._id);
    expect(res.status).toBe(403);
  });

  it('same admin cannot create two evaluations for the same coach/month (400)', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();

    expect((await createEval(adminToken, coach._id)).status).toBe(201);
    const dup = await createEval(adminToken, coach._id);
    expect(dup.status).toBe(400);
  });

  it('rejects invalid rating, bad month, and non-coach target', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();
    const { user: observer } = await createObserver();

    const badRating = await createEval(adminToken, coach._id, {
      scouting: { talentIdentification: 11, matchAnalysis: 7, reportAccuracy: 9 },
    });
    expect(badRating.status).toBe(400);

    const badMonth = await createEval(adminToken, coach._id, { month: 13 });
    expect(badMonth.status).toBe(400);

    const notCoach = await createEval(adminToken, observer._id);
    expect(notCoach.status).toBe(400);
  });

  it('ignores/rejects client-set status, evaluator, overallRating, stats', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();
    const res = await createEval(adminToken, coach._id, {
      status: 'published',
      overallRating: 10,
    });
    expect(res.status).toBe(400);
  });
});

describe('Coach evaluations — per-admin independence & edit-own-only', () => {
  beforeEach(seedAgeGroups);

  it('two different admins can each evaluate the same coach/month', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    expect((await createEval(a1, coach._id)).status).toBe(201);
    expect((await createEval(a2, coach._id)).status).toBe(201);
  });

  it('an admin cannot edit/publish/delete another admin\'s evaluation, and cannot view it until their own for the same coach/month is published', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const created = await createEval(a1, coach._id);
    const id = created.body.data.document._id;

    const blockedView = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(blockedView.status).toBe(403);

    const { year, month } = created.body.data.document;
    const own = await createEval(a2, coach._id, { year, month });
    await request(app).patch(`${BASE}/${own.body.data.document._id}/publish`).set('Authorization', `Bearer ${a2}`);

    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(200);

    const edit = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${a2}`)
      .send({ notes: 'hijack' });
    expect(edit.status).toBe(403);

    const pub = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a2}`);
    expect(pub.status).toBe(403);

    const del = await request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(del.status).toBe(403);
  });
});

describe('Coach evaluations — draft/publish/archive lifecycle', () => {
  beforeEach(seedAgeGroups);

  it('draft is invisible to the coach; publish reveals it; archive hides it again', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();

    const created = await createEval(adminToken, coach._id);
    const id = created.body.data.document._id;

    // draft: coach list empty, direct get forbidden
    let coachList = await request(app).get(BASE).set('Authorization', `Bearer ${coachToken}`);
    expect(coachList.body.data.documents.length).toBe(0);
    const draftGet = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${coachToken}`);
    expect(draftGet.status).toBe(403);

    // publish
    const pub = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.document.status).toBe('published');
    expect(pub.body.data.document.publishedAt).toBeTruthy();

    // coach now sees it
    coachList = await request(app).get(BASE).set('Authorization', `Bearer ${coachToken}`);
    expect(coachList.body.data.documents.some((d) => d._id === id)).toBe(true);
    const okGet = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${coachToken}`);
    expect(okGet.status).toBe(200);

    // publish is idempotent
    const pub2 = await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    expect(pub2.status).toBe(200);

    // archive
    const arch = await request(app).patch(`${BASE}/${id}/archive`).set('Authorization', `Bearer ${adminToken}`);
    expect(arch.status).toBe(200);
    coachList = await request(app).get(BASE).set('Authorization', `Bearer ${coachToken}`);
    expect(coachList.body.data.documents.length).toBe(0);
  });
});

describe('Coach evaluations — update & delete', () => {
  beforeEach(seedAgeGroups);

  it('update recomputes overallRating; delete removes it', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();
    const created = await createEval(adminToken, coach._id);
    const id = created.body.data.document._id;

    const upd = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ 'scouting.talentIdentification': 10 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.document.overallRating).not.toBe(created.body.data.document.overallRating);

    const del = await request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    const gone = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(gone.status).toBe(404);
  });

  it('a published evaluation can no longer be edited, even by its own admin', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();
    const created = await createEval(adminToken, coach._id);
    const id = created.body.data.document._id;

    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);

    const edit = await request(app)
      .patch(`${BASE}/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'too late' });
    expect(edit.status).toBe(400);
  });
});

describe('Coach evaluations — auto-captured stats', () => {
  beforeEach(seedAgeGroups);

  it('captures the coach\'s existing reports/matches/media/players-managed for the month', async () => {
    const { token: adminToken } = await createAdmin();
    const { token: coachToken, user: coach } = await createCoach();

    const p1 = await createPlayer(coachToken);

    const player = await Player.findById(p1._id).select('ageGroup');
    const home = await createTeam(player.ageGroup);
    const away = await createTeam(player.ageGroup);

    // one report this month by the coach
    await ScoutingReport.create({
      player: p1._id,
      coach: coach._id,
      matchDate: new Date(),
      homeTeam: home._id,
      awayTeam: away._id,
      technical: { passing: 8, dribbling: 7, shooting: 6, ballControl: 8 },
      physical: { speed: 9, stamina: 7, strength: 6, agility: 8 },
      mental: { positioning: 7, decisionMaking: 6, teamwork: 8, attitude: 9 },
    });

    // one attended match this month
    await SeasonMatch.create({
      ageGroup: player.ageGroup,
      season: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`,
      matchDate: new Date(),
      homeTeam: home._id,
      awayTeam: away._id,
      attendees: [coach._id],
      createdBy: coach._id,
    });

    // one media uploaded this month
    await PlayerMedia.create({
      player: p1._id,
      uploadedBy: coach._id,
      type: 'image',
      storage: 'bunny',
      storageKey: 'player-media/y.webp',
      status: 'ready',
    });

    const res = await createEval(adminToken, coach._id);
    expect(res.status).toBe(201);
    const stats = res.body.data.document.stats;
    expect(stats.reportsCount).toBe(1);
    expect(stats.matchesAttended).toBe(1);
    expect(stats.mediaCount).toBe(1);
    expect(stats.playersManaged).toBe(1);
    expect(stats.capturedAt).toBeTruthy();
  });
});

describe('Coach evaluations — blind review lock between admins', () => {
  beforeEach(seedAgeGroups);

  it('an admin cannot view another admin\'s evaluation until publishing their own for the same coach/month', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const e1 = await createEval(a1, coach._id);
    const id1 = e1.body.data.document._id;
    await request(app).patch(`${BASE}/${id1}/publish`).set('Authorization', `Bearer ${a1}`);

    // a2 has no evaluation yet for this coach/month → blocked from viewing a1's
    const blockedGet = await request(app).get(`${BASE}/${id1}`).set('Authorization', `Bearer ${a2}`);
    expect(blockedGet.status).toBe(403);

    const blockedList = await request(app).get(`${BASE}?coach=${coach._id}`).set('Authorization', `Bearer ${a2}`);
    expect(blockedList.body.data.documents.length).toBe(0);

    // a2 publishes their own for the same coach/month → now unlocked
    const e2 = await createEval(a2, coach._id);
    const id2 = e2.body.data.document._id;
    await request(app).patch(`${BASE}/${id2}/publish`).set('Authorization', `Bearer ${a2}`);

    const unlockedGet = await request(app).get(`${BASE}/${id1}`).set('Authorization', `Bearer ${a2}`);
    expect(unlockedGet.status).toBe(200);

    const unlockedList = await request(app).get(`${BASE}?coach=${coach._id}`).set('Authorization', `Bearer ${a2}`);
    expect(unlockedList.body.data.documents.length).toBe(2);
  });

  it('past-month evaluations are never locked, even without an own published evaluation', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    // الشهر اللي فات — مشتق من نفس مصدر "الشهر الحالي" اللي الكونترولر بيقفل بيه،
    // مش من حساب محلي موازي.
    const current = currentYearMonthUTC();
    let year = current.year;
    let month = current.month - 1;
    if (month === 0) { month = 12; year -= 1; }

    const created = await createEval(a1, coach._id, { year, month });
    const id = created.body.data.document._id;
    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a1}`);

    // a2 has no evaluation at all, but the month is in the past — should be visible
    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(200);

    const list = await request(app).get(`${BASE}?coach=${coach._id}&year=${year}&month=${month}`).set('Authorization', `Bearer ${a2}`);
    expect(list.body.data.documents.length).toBe(1);

    const panel = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${a2}`);
    expect(panel.status).toBe(200);
    expect(panel.body.data.count).toBe(1);
  });

  it('monthly panel returns the combined average + per-admin breakdown once unlocked', async () => {
    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const e1 = await createEval(a1, coach._id);
    const id1 = e1.body.data.document._id;
    await request(app).patch(`${BASE}/${id1}/publish`).set('Authorization', `Bearer ${a1}`);
    const { year, month } = e1.body.data.document;

    // a2 not unlocked yet
    const blocked = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${a2}`);
    expect(blocked.status).toBe(403);

    const e2 = await createEval(a2, coach._id);
    const id2 = e2.body.data.document._id;
    await request(app).patch(`${BASE}/${id2}/publish`).set('Authorization', `Bearer ${a2}`);

    const panel = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${a2}`);
    expect(panel.status).toBe(200);
    expect(panel.body.data.count).toBe(2);
    expect(panel.body.data.evaluations.length).toBe(2);
    expect(panel.body.data.averageOverall).toBeGreaterThan(0);
  });
});

describe('Coach evaluations — summary', () => {
  beforeEach(seedAgeGroups);

  it('summary counts published evaluations only', async () => {
    const { token: adminToken } = await createAdmin();
    const { user: coach } = await createCoach();

    const id = (await createEval(adminToken, coach._id)).body.data.document._id;

    // draft → summary empty
    let sum = await request(app).get(`${BASE}/summary?coach=${coach._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(sum.status).toBe(200);
    expect(sum.body.data.count).toBe(0);

    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${adminToken}`);
    sum = await request(app).get(`${BASE}/summary?coach=${coach._id}`).set('Authorization', `Bearer ${adminToken}`);
    expect(sum.body.data.count).toBe(1);
    expect(sum.body.data.averageOverall).toBeGreaterThan(0);
  });
});

// ============================================================================
// audit-backend C3 — قفل الـblind review عند حدود الشهر.
//
// الثغرة اللي التستات دي بتحرسها: `isCurrentMonth` كان بيقارن بتوقيت السيرفر
// المحلي (getFullYear/getMonth) بينما year/month الجايين من العميل متولّدين UTC.
// النتيجة: نافذة عرضها = فرق المنطقة الزمنية، كل نهاية شهر، القفل فيها بيتخطّى
// بالكامل — أدمن يشوف تقييم أدمن تاني من غير ما ينشر بتاعه. تسريب صلاحيات، مش
// مسألة عرض. (اتقاس فعلاً: 2026-08-31 21:53Z على سيرفر GMT+0300.)
//
// التستات دي بتفشل حتمياً على الكود القديم لأنها بتثبّت اللحظة **و**المنطقة
// الزمنية بدل ما تستنى الحدود تيجي لوحدها مرة كل شهر.
//
// ملاحظة على toFake: ['Date'] — بنزيّف الـDate بس، مش المؤقتات. لو زيّفنا
// setTimeout/setInterval كان درايفر مونجو وsupertest هيعلّقوا.
// ============================================================================
describe('Coach evaluations — blind-review lock at the month boundary', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(seedAgeGroups);
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  const freezeAt = (iso, tz) => {
    process.env.TZ = tz;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  };

  it('isCurrentMonthUTC ignores the server timezone entirely', () => {
    // آخر ملي ثانية في أغسطس بتوقيت UTC
    const lastMs = new Date('2026-08-31T23:59:59.999Z');
    // أول ملي ثانية في سبتمبر بتوقيت UTC
    const firstMs = new Date('2026-09-01T00:00:00.000Z');

    // زونات متقدمة ومتأخرة عن UTC — عند اللحظتين دول التوقيت المحلي بيقول شهر
    // مختلف عن UTC في واحدة منهم على الأقل.
    for (const tz of ['UTC', 'Asia/Riyadh', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;

      expect(isCurrentMonthUTC(2026, 8, lastMs), `Aug@lastMs in ${tz}`).toBe(true);
      expect(isCurrentMonthUTC(2026, 9, lastMs), `Sep@lastMs in ${tz}`).toBe(false);

      expect(isCurrentMonthUTC(2026, 9, firstMs), `Sep@firstMs in ${tz}`).toBe(true);
      expect(isCurrentMonthUTC(2026, 8, firstMs), `Aug@firstMs in ${tz}`).toBe(false);
    }

    // وحدود السنة كمان — نفس المنطق، بس هنا الفرق بيغيّر السنة مش الشهر بس
    process.env.TZ = 'Asia/Riyadh';
    const newYearEve = new Date('2026-12-31T23:59:59.999Z'); // محلياً: 2027-01-01
    expect(isCurrentMonthUTC(2026, 12, newYearEve)).toBe(true);
    expect(isCurrentMonthUTC(2027, 1, newYearEve)).toBe(false);
  });

  // الاتجاه الأول: السيرفر **متقدم** على UTC (GMT+3). محلياً بقى سبتمبر، UTC لسه
  // أغسطس. الكود القديم كان بيقول "شهر 8 مش الشهر الحالي" → بيفك القفل.
  it('locks a current-month evaluation on a server ahead of UTC (23:59:59.999Z, GMT+3)', async () => {
    // الساعة بتتجمّد **قبل** إنشاء المستخدمين: التوكن بيتوقّع عند نفس اللحظة
    // المجمّدة، وإلا `protect` بيرفضه كمنتهي الصلاحية.
    freezeAt('2026-08-31T23:59:59.999Z', 'Asia/Riyadh');

    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const created = await createEval(a1, coach._id, { year: 2026, month: 8 });
    expect(created.status).toBe(201);
    const id = created.body.data.document._id;
    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a1}`);

    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(403);

    const list = await request(app)
      .get(`${BASE}?coach=${coach._id}&year=2026&month=8`)
      .set('Authorization', `Bearer ${a2}`);
    expect(list.body.data.documents.length).toBe(0);

    const panel = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=2026&month=8`)
      .set('Authorization', `Bearer ${a2}`);
    expect(panel.status).toBe(403);
  });

  // الاتجاه التاني: السيرفر **متأخر** عن UTC (GMT-4). UTC بقى سبتمبر، محلياً لسه
  // أغسطس. الكود القديم كان بيقول "شهر 9 مش الشهر الحالي" → بيفك القفل برضه.
  it('locks a current-month evaluation on a server behind UTC (00:00:00.000Z, GMT-4)', async () => {
    // الساعة بتتجمّد **قبل** إنشاء المستخدمين: التوكن بيتوقّع عند نفس اللحظة
    // المجمّدة، وإلا `protect` بيرفضه كمنتهي الصلاحية.
    freezeAt('2026-09-01T00:00:00.000Z', 'America/New_York');

    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const created = await createEval(a1, coach._id, { year: 2026, month: 9 });
    expect(created.status).toBe(201);
    const id = created.body.data.document._id;
    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a1}`);

    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(403);

    const panel = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=2026&month=9`)
      .set('Authorization', `Bearer ${a2}`);
    expect(panel.status).toBe(403);
  });

  // الاتجاه المضاد — مش كل حاجة بقت 403: أغسطس بقى شهر ماضي بتوقيت UTC عند نفس
  // اللحظة، فلازم يفضل مفتوح. من غير التست ده، "خلّي كل حاجة تتقفل" كان هيعدّي.
  it('a month that just became past by UTC is unlocked at the same instant', async () => {
    // الساعة بتتجمّد **قبل** إنشاء المستخدمين: التوكن بيتوقّع عند نفس اللحظة
    // المجمّدة، وإلا `protect` بيرفضه كمنتهي الصلاحية.
    freezeAt('2026-09-01T00:00:00.000Z', 'America/New_York');

    const { token: a1 } = await createAdmin();
    const { token: a2 } = await createAdmin();
    const { user: coach } = await createCoach();

    const created = await createEval(a1, coach._id, { year: 2026, month: 8 });
    const id = created.body.data.document._id;
    await request(app).patch(`${BASE}/${id}/publish`).set('Authorization', `Bearer ${a1}`);

    const view = await request(app).get(`${BASE}/${id}`).set('Authorization', `Bearer ${a2}`);
    expect(view.status).toBe(200);

    const panel = await request(app)
      .get(`${BASE}/monthly?coach=${coach._id}&year=2026&month=8`)
      .set('Authorization', `Bearer ${a2}`);
    expect(panel.status).toBe(200);
  });
});
