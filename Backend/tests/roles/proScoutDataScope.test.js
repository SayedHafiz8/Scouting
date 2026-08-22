import { describe, it, expect, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';

// US4 — بنعمل spy على طبقة تسجيل الرفض عشان نثبت إن كل رفض بيسجّل مرة واحدة
// بالحقول الأربعة اللي Principle IV بيطلبها. نفس نمط الـI/O الخارجي الموكوك
// في tests/setup.js.
vi.mock('../../utils/accessLog.js', () => {
  const fn = vi.fn();
  return { logScopeDenial: fn, default: fn };
});

import app from '../../app.js';
import { logScopeDenial } from '../../utils/accessLog.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createProScout,
  createTeam,
  createPlayerDoc,
  reportPayload,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';
import Player from '../../models/playedModel.js';
import { getCountsByAgeGroup } from '../../controllers/playerController.js';
import SeasonMatch from '../../models/seasonMatchModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import PlayerMedia from '../../models/playerMediaModel.js';
import AppError from '../../utils/appError.js';
import {
  checkSeasonMatchAttendee,
  checkReportOwnership,
  checkMediaOwnership,
} from '../../middlewares/ownership.js';
import {
  professionalTeamIds,
  playerScopeFor,
  seasonMatchScopeFor,
  teamScopeFor,
} from '../../services/scope.js';

// ملفات الاختبارات بتحتفظ بأسماء الرولات كنصوص حرفية عن قصد — أوراكل مستقل عن
// constants/roles.js (قرار /speckit-clarify Q1، موثّق في هيدر الملف ده).
const asReq = (user) => ({ user });

// seedAgeGroups() بتـinsert بس ومابترجعش حاجة — بنجيب واحدة بعدها للفرق
let ageGroup;

beforeEach(async () => {
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();
});

// ═══════════════════════════════════════════════════════════════════════════
// Scenario 1 — شكل ما بترجعه طبقة النطاق نفسها.
//
// بيثبّت الثابت عند المصدر: أي تعديل مستقبلي بيفكّ الـ$and بيفشل هنا بدل ما
// يفشل بصمت جوه endpoint. راجع research R12.
// ═══════════════════════════════════════════════════════════════════════════
describe('scope module — return shape (scenario 1, FR-007, SC-002a)', () => {
  it('proScout scopes are $and-wrapped, so no client key can overwrite them', async () => {
    const { user } = await createProScout();
    const req = asReq(user);

    const player = await playerScopeFor(req);
    const match = await seasonMatchScopeFor(req);
    const team = await teamScopeFor(req);

    for (const [name, scope] of Object.entries({ player, match, team })) {
      expect(scope, `${name} scope must be $and-wrapped`).toHaveProperty('$and');
      expect(Array.isArray(scope.$and), `${name}.$and must be an array`).toBe(true);
      expect(scope.$and.length, `${name}.$and must be non-empty`).toBeGreaterThan(0);
    }

    expect(match.$and[0]).toEqual({ league: 'professional' });
    expect(team.$and[0]).toEqual({ league: 'professional' });
    expect(player.$and[0]).toHaveProperty('$or');
  });

  it('every existing role gets a bare {} — not { $and: [] }, which Mongo rejects', async () => {
    for (const make of [createAdmin, createCoach, createObserver]) {
      const { user } = await make();
      const req = asReq(user);

      expect(await playerScopeFor(req)).toEqual({});
      expect(await seasonMatchScopeFor(req)).toEqual({});
      expect(await teamScopeFor(req)).toEqual({});
    }
  });

  it('/code-review high fix #2 — every scope helper fails CLOSED (MATCH_NOTHING), not open, when req.user is missing', async () => {
    // نفس معيار ApiFeature.buildOwnerScope بالظبط: غياب req.user لازم يرجّع
    // فلتر مقفول لا {} مفتوحة. مفيش نقطة استدعاء حالية بتوصل هنا من غير
    // protect، لكن الطبقة دي بتوثّق نفسها كمصدر الحقيقة الوحيد (Principle IV)،
    // فلازم تحمي نفسها من نفس الغياب اللي buildOwnerScope بيحميه.
    const req = { user: undefined };

    expect(await playerScopeFor(req)).toEqual({ _id: { $in: [] } });
    expect(await seasonMatchScopeFor(req)).toEqual({ _id: { $in: [] } });
    expect(await teamScopeFor(req)).toEqual({ _id: { $in: [] } });
  });

  it('player scope carries real ObjectIds, never strings (aggregate $match does not cast)', async () => {
    const { user } = await createProScout();
    const pro = await createTeam(ageGroup._id, { league: 'professional' });

    const scope = await playerScopeFor(asReq(user));
    const [byTeam] = scope.$and[0].$or;

    expect(byTeam.team.$in.length).toBeGreaterThan(0);
    byTeam.team.$in.forEach((id) => {
      expect(id).toBeInstanceOf(mongoose.Types.ObjectId);
    });
    expect(byTeam.team.$in.map(String)).toContain(String(pro._id));
  });

  it('professionalTeamIds INCLUDES a deactivated professional team', async () => {
    // ده الفحص الحقيقي الوحيد للمتطلب ده. مفيش صيغة .distinct() بتفرضه —
    // كلهم بيتخطّوا hook الحذف الناعم — والـbypassFilter في scope.js توثيق نية
    // ومالوش أثر فعلي (research R2، مقيس). لو حد أعاد كتابة الدالة لصيغة
    // بتفضل find، الفرق المعطّلة هتختفي من النطاق ولاعبينها هيختفوا معاها،
    // والتست ده هو اللي هيمسك ده.
    const { user } = await createProScout();
    const live = await createTeam(ageGroup._id, { league: 'professional' });
    const retired = await createTeam(ageGroup._id, { league: 'professional', active: false });

    const ids = (await professionalTeamIds(asReq(user))).map(String);

    expect(ids).toContain(String(live._id));
    expect(ids).toContain(String(retired._id));
  });

  it('memoises the team lookup per request', async () => {
    const { user } = await createProScout();
    const req = asReq(user);

    const first = await professionalTeamIds(req);
    await createTeam(ageGroup._id, { league: 'professional' });
    const second = await professionalTeamIds(req);

    // نفس المرجع بالظبط — الاستعلام اتنفّذ مرة واحدة لكل طلب، مش لكل لاعب
    expect(second).toBe(first);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US1 — نطاق اللاعبين (scenarios 2-12)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — player scope (US1, FR-003)', () => {
  let scout, coach, proTeam, premierTeam;
  let onPro, onPremier, mineNoTeam, theirsNoTeam;

  beforeEach(async () => {
    scout = await createProScout();
    coach = await createCoach();

    proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    premierTeam = await createTeam(ageGroup._id, { league: 'premier' });

    onPro = await createPlayerDoc({ name: 'Pro Player', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id });
    onPremier = await createPlayerDoc({ name: 'Premier Player', coach: coach.user._id, createdBy: coach.user._id, team: premierTeam._id });
    mineNoTeam = await createPlayerDoc({ name: 'Mine Unassigned', coach: coach.user._id, createdBy: scout.user._id, team: null });
    theirsNoTeam = await createPlayerDoc({ name: 'Theirs Unassigned', coach: coach.user._id, createdBy: coach.user._id, team: null });
  });

  const list = (scoutRef, qs = '') =>
    request(app).get('/api/v1/players' + qs).set('Authorization', 'Bearer ' + scoutRef.token);

  it('scenario 2: a player on a professional team is visible', async () => {
    const res = await list(scout);
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d.name)).toContain('Pro Player');
  });

  it('scenario 3: a premier-team player is absent from the list AND 403 by direct id', async () => {
    const res = await list(scout);
    expect(res.body.data.documents.map((d) => d.name)).not.toContain('Premier Player');

    const direct = await request(app)
      .get('/api/v1/players/' + onPremier._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(403);
  });

  it('scenario 4: a team-less player this proScout created is visible', async () => {
    const res = await list(scout);
    expect(res.body.data.documents.map((d) => d.name)).toContain('Mine Unassigned');
  });

  it('scenario 5: a team-less player someone else created is absent, and 403 by id', async () => {
    const res = await list(scout);
    expect(res.body.data.documents.map((d) => d.name)).not.toContain('Theirs Unassigned');

    const direct = await request(app)
      .get('/api/v1/players/' + theirsNoTeam._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(403);
  });

  it('/code-review high fix #4 — checkPlayerOwnership compares in memory, no second Player.exists round-trip', async () => {
    // قبل التصليح: checkPlayerOwnership كانت بتجيب المستند بـfindById (سطر 17)
    // وبعدين تعمل Player.exists({...}) تاني لنفس المستند بعينه لفرع proScout —
    // round-trip زيادة لكل GET /players/:id. دلوقتي المقارنة بتحصل في الذاكرة
    // ضد professionalTeamIds(req) (اللي أصلاً متكاشة على req)، فPlayer.exists
    // مايتستدعاش خالص من الحارس ده.
    const existsSpy = vi.spyOn(Player, 'exists');

    const inScope = await request(app)
      .get('/api/v1/players/' + onPro._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(inScope.status).toBe(200);

    const outOfScope = await request(app)
      .get('/api/v1/players/' + onPremier._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(outOfScope.status).toBe(403);

    expect(existsSpy).not.toHaveBeenCalled();
    existsSpy.mockRestore();
  });

  it('scenario 6: ?team=<premier id> is whitelisted, but the scoped validator rejects it before the merge', async () => {
    // /code-review high (fix #4) — كان الفحص القديم Team.findById خام، فأي premier
    // team id حقيقي كان بيعدّي الفاليديشن ويوصل للـmerge، وscope الـApiFeature هو
    // اللي كان بيصفّره لـ200 فاضية. teamExistsInScope دلوقتي بيرفض الـid برّه
    // النطاق **قبل** ما يوصل للـcontroller خالص — دفاع في العمق مبكّر، مش نتيجة
    // فاضية. `team` لسه موجود في PLAYER_FILTERS، فده لسه ناقل التصعيد اللي
    // بيتفحص، بس دلوقتي بيترفض بـ400 مش بيرجع 200.
    const res = await list(scout, '?team=' + premierTeam._id);
    expect(res.status).toBe(400);
  });

  it('scenario 6b: the ?team= validator no longer leaks team existence across the league boundary', async () => {
    // /code-review high — كان oracle بيلف حوالين checkTeamScope: premier team id
    // حقيقي كان بيعدّي الفاليديشن (200) بينما id وهمي كان بيترفض (400) —
    // بيفرّق. دلوقتي الاتنين بيترفضوا **بنفس الطريقة بالظبط**: نفس الحالة (400)
    // ونفس شكل الرسالة (id وهمي وid برّه النطاق مش قابلين للتفرقة).
    const bogusId = new mongoose.Types.ObjectId().toString();

    const withPremierId = await list(scout, '?team=' + premierTeam._id);
    const withBogusId = await list(scout, '?team=' + bogusId);

    expect(withPremierId.status).toBe(400);
    expect(withBogusId.status).toBe(400);
    const msgTemplate = (body, id) => body.errors?.[0]?.msg?.replace(id, '<id>');
    expect(msgTemplate(withPremierId.body, String(premierTeam._id)))
      .toBe(msgTemplate(withBogusId.body, bogusId));
  });

  it('scenario 6c: ?team=<in-scope id> still validates and scopes correctly', async () => {
    const res = await list(scout, '?team=' + proTeam._id);
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d.name)).toContain('Pro Player');
  });

  it('scenario 7: ?league=premier is NOT whitelisted here — dropped before the filter', async () => {
    // آلية مختلفة عن سيناريو 6: `league` مش في PLAYER_FILTERS فبيتشال خالص
    // ومابيوصلش للدمج أصلاً. نفس النتيجة، سبب مختلف.
    const res = await list(scout, '?league=premier');
    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((d) => d.name);
    expect(names).toContain('Pro Player');
    expect(names).not.toContain('Premier Player');
  });

  it('scenario 8: search only ever returns in-scope matches', async () => {
    await createPlayerDoc({ name: 'Zed Premier', coach: coach.user._id, createdBy: coach.user._id, team: premierTeam._id });
    await createPlayerDoc({ name: 'Zed Pro', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id });

    const res = await list(scout, '?keyword=zed');
    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((d) => d.name);
    expect(names).toContain('Zed Pro');
    expect(names).not.toContain('Zed Premier');
  });

  it('scenario 9: search combined with ?team=<premier id> is rejected at validation (fix #4), not just scoped to empty', async () => {
    const res = await list(scout, '?keyword=premier&team=' + premierTeam._id);
    expect(res.status).toBe(400);
  });

  it('scenario 9b: search combined with an in-scope ?team= still cannot widen beyond that team', async () => {
    const res = await list(scout, '?keyword=pro&team=' + proTeam._id);
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => d.name)).toEqual(['Pro Player']);
  });

  it('scenario 10: sort and pagination operate strictly inside scope', async () => {
    const sorted = await list(scout, '?sort=name');
    expect(sorted.status).toBe(200);
    const names = sorted.body.data.documents.map((d) => d.name);
    expect(names).toEqual([...names].sort());
    expect(names).not.toContain('Premier Player');

    // in-scope = Pro Player + Mine Unassigned = 2
    const paged = await list(scout, '?limit=1&page=1');
    expect(paged.body.data.documents).toHaveLength(1);
    expect(paged.body.pagination.numberOfPages).toBe(2);
    expect(paged.body.pagination.next).toBe(2);
  });

  it('scenario 11: count equals the manually computed professional subset', async () => {
    const res = await list(scout);
    expect(res.body.count).toBe(2);
    expect(res.body.pagination.numberOfPages).toBe(1);
  });

  it('scenario 12: observers hidden, observed shown as pending, coach still visible (FR-014)', async () => {
    const observer = await createObserver();
    await Player.findByIdAndUpdate(onPro._id, {
      status: 'observed',
      observers: [observer.user._id],
    });

    const res = await request(app)
      .get('/api/v1/players/' + onPro._id)
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    expect(res.body.data.document.observers).toBeUndefined();
    expect(res.body.data.document.status).toBe('pending');
    expect(res.body.data.document.coach).toBeDefined();
  });

  it('scenario 12b: /code-review high fix #2 — ?status=pending includes observed players, matching the mask', async () => {
    // من غير التصليح: اللاعب ده بيتعرض للـproScout كـ"pending" (القناع فوق) بس
    // ?status=pending كان بيرجّعه صفر — القايمة اللي بتتفلتر بيها كانت بتناقض
    // القايمة اللي بتتعرض من غير فلتر.
    await Player.findByIdAndUpdate(onPro._id, {
      status: 'observed',
      observers: [(await createObserver()).user._id],
    });

    const res = await list(scout, '?status=pending');
    expect(res.status).toBe(200);
    const names = res.body.data.documents.map((d) => d.name);
    expect(names).toContain('Pro Player'); // status: observed, لكن بيتفلتر كـpending
    expect(names).toContain('Mine Unassigned'); // status: pending فعلاً
    expect(names).not.toContain('Premier Player'); // برّه النطاق أصلاً
  });

  it('scenario 12c: /players/counts?status=pending also includes observed players (same fix, aggregation path)', async () => {
    await Player.findByIdAndUpdate(onPro._id, {
      status: 'observed',
      observers: [(await createObserver()).user._id],
    });

    const res = await request(app)
      .get('/api/v1/players/counts?status=pending')
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    // Pro Player (observed→pending) + Mine Unassigned (pending فعلاً) = 2
    expect(res.body.data.total).toBe(2);
  });

  it('/code-review high fix #1 — ?status=observed is ignored for proScout, not executed literally', async () => {
    // القناع (scenario 12) بيقول "observed بيتعرض كـpending وobservers مخفي".
    // من غير التصليح، ?status=observed كان بيتنفّذ حرفياً على الاستعلام —
    // فيرجّع بالظبط اللاعبين المتابَعين حتى لو كل واحد فيهم اتعرض بعدين
    // كـ"pending" في الـresponse. الفلتر نفسه كان الأوراكل، مش العرض.
    await Player.findByIdAndUpdate(onPro._id, {
      status: 'observed',
      observers: [(await createObserver()).user._id],
    });

    const filtered = await list(scout, '?status=observed');
    const unfiltered = await list(scout, '');

    expect(filtered.status).toBe(200);
    // الفلتر اتجاهل بالكامل: نفس نتيجة الاستعلام من غير أي ?status=
    expect(filtered.body.data.documents.map((d) => d.name).sort())
      .toEqual(unfiltered.body.data.documents.map((d) => d.name).sort());
  });

  it('/code-review high fix #1 — ?status=observed is ignored for coach too (same masksObservedAsPending path)', async () => {
    const own = await createPlayerDoc({
      name: 'Coach Observed', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id,
      status: 'observed', observers: [(await createObserver()).user._id],
    });

    const filtered = await request(app)
      .get('/api/v1/players?status=observed')
      .set('Authorization', 'Bearer ' + coach.token);
    const unfiltered = await request(app)
      .get('/api/v1/players')
      .set('Authorization', 'Bearer ' + coach.token);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.documents.map((d) => d.name).sort())
      .toEqual(unfiltered.body.data.documents.map((d) => d.name).sort());
    // تأكيد إضافي: اللاعب موجود في نتيجة الكوتش (كـpending) رغم ?status=observed
    expect(filtered.body.data.documents.map((d) => d.name)).toContain(own.name);
  });

  it('/code-review high fix #1 — GET /players/counts?status=observed is ignored (aggregation path)', async () => {
    await Player.findByIdAndUpdate(onPro._id, {
      status: 'observed',
      observers: [(await createObserver()).user._id],
    });

    const filtered = await request(app)
      .get('/api/v1/players/counts?status=observed')
      .set('Authorization', 'Bearer ' + scout.token);
    const unfiltered = await request(app)
      .get('/api/v1/players/counts')
      .set('Authorization', 'Bearer ' + scout.token);

    expect(filtered.status).toBe(200);
    expect(filtered.body.data.total).toBe(unfiltered.body.data.total);
  });

  it('scenario 12d: /code-review high fix #3 — masked profileImg is signed, not a raw storage key', async () => {
    // maskObservedForCoach كان بيستخدم doc.toObject() اللي **مابيشغّلش** hook
    // الـtoJSON بتاع playedModel.js (اللي بيوقّع profileImg). النتيجة: مسار
    // تخزين خام بدل URL موقّع لأي حد بيعدّي على القناع — مش خاص بـproScout
    // بس، كان موجود للكوتش من الأول.
    await Player.findByIdAndUpdate(onPro._id, { profileImg: 'players/raw-key.webp' });

    const listRes = await list(scout);
    const listed = listRes.body.data.documents.find((d) => d.name === 'Pro Player');
    expect(listed.profileImg).not.toBe('players/raw-key.webp');
    expect(listed.profileImg).toContain('?token=');

    const detailRes = await request(app)
      .get('/api/v1/players/' + onPro._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(detailRes.body.data.document.profileImg).not.toBe('players/raw-key.webp');
    expect(detailRes.body.data.document.profileImg).toContain('?token=');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US1 — المجاميع (scenarios 13-15)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — scoped aggregates (US1, FR-012, FR-013)', () => {
  let scout, coach, proTeam, premierTeam, onPro, onPremier;

  beforeEach(async () => {
    scout = await createProScout();
    coach = await createCoach();
    proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    premierTeam = await createTeam(ageGroup._id, { league: 'premier' });
    onPro = await createPlayerDoc({ name: 'Pro P', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id });
    onPremier = await createPlayerDoc({ name: 'Premier P', coach: coach.user._id, createdBy: coach.user._id, team: premierTeam._id });
  });

  it('scenario 13: /players/counts totals only in-scope players', async () => {
    const res = await request(app)
      .get('/api/v1/players/counts')
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
  });

  it('scenario 14: /players/reports/average-ratings omits out-of-scope ids', async () => {
    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings?ids=' + onPro._id + ',' + onPremier._id)
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    expect(res.body.data.averages).not.toHaveProperty(String(onPremier._id));
  });

  it('scenario 14b: /code-review high fix #5 — averages ARE computed when the caller has in-scope reports', async () => {
    // proScout مايقدرش يكتب تقارير من الـAPI لحد المرحلة 4، فسيناريو 14 لوحده
    // بيثبت الغياب بس — ده مايكفيش يثبت إن منطق التضييق شغال فعلاً، لأن {}
    // كانت هترجع برضه لو التضييق مكسور. بننشئ تقرير مباشرة في الداتابيز
    // (coach: scout.user._id، محاكاة اللي المرحلة 4 هتفتحه) عشان نتأكد إن
    // الـpipeline بيحسب المتوسط لما فعلاً يبقى فيه تقرير في النطاق.
    await ScoutingReport.create({
      ...reportPayload(),
      player: onPro._id,
      coach: scout.user._id,
      overallRating: 8,
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
    });

    const res = await request(app)
      .get('/api/v1/players/reports/average-ratings?ids=' + onPro._id + ',' + onPremier._id)
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    expect(res.body.data.averages).toHaveProperty(String(onPro._id));
    expect(res.body.data.averages[String(onPro._id)].totalReports).toBe(1);
    expect(res.body.data.averages).not.toHaveProperty(String(onPremier._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US2 — نطاق المباريات (scenarios 16-20)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — season match scope (US2, FR-004, FR-006)', () => {
  let scout, admin, proTeams, premierTeams, proMatch, premierMatch;

  beforeEach(async () => {
    scout = await createProScout();
    admin = await createAdmin();

    proTeams = [
      await createTeam(ageGroup._id, { league: 'professional' }),
      await createTeam(ageGroup._id, { league: 'professional' }),
    ];
    premierTeams = [
      await createTeam(ageGroup._id, { league: 'premier' }),
      await createTeam(ageGroup._id, { league: 'premier' }),
    ];

    proMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
      homeTeam: proTeams[0]._id, awayTeam: proTeams[1]._id,
      createdBy: admin.user._id,
    });
    premierMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
      matchDate: new Date('2026-03-02T00:00:00.000Z'),
      homeTeam: premierTeams[0]._id, awayTeam: premierTeams[1]._id,
      createdBy: admin.user._id,
    });
  });

  const matches = (qs = '') =>
    request(app).get('/api/v1/seasonMatches' + qs).set('Authorization', 'Bearer ' + scout.token);

  it('scenario 16: a professional-league match is visible', async () => {
    const res = await matches();
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => String(d._id))).toContain(String(proMatch._id));
  });

  it('scenario 17: a premier match is absent from the list AND 403 by direct id', async () => {
    const res = await matches();
    expect(res.body.data.documents.map((d) => String(d._id))).not.toContain(String(premierMatch._id));
    expect(res.body.count).toBe(1);

    const direct = await request(app)
      .get('/api/v1/seasonMatches/' + premierMatch._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(403);
  });

  it('scenario 17b: an in-scope match IS reachable by direct id', async () => {
    const direct = await request(app)
      .get('/api/v1/seasonMatches/' + proMatch._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(200);
    expect(String(direct.body.data.document._id)).toBe(String(proMatch._id));
  });

  it('scenario 18: ?league=premier returns ZERO rows — the escalation the $and wrapper blocks', async () => {
    // `league` مُدرج في SEASON_MATCH_FILTERS، فمن غير لفّ النطاق في $and قيمة
    // العميل كانت **هتستبدل** النطاق وترجّع الدوري الممتاز كامل (research R12).
    const res = await matches('?league=premier');
    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(0);
    expect(res.body.count).toBe(0);
  });

  it('scenario 19: attendance on an out-of-scope match is refused', async () => {
    const res = await request(app)
      .post('/api/v1/seasonMatches/' + premierMatch._id + '/attend')
      .set('Authorization', 'Bearer ' + scout.token);
    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// scenario 20 — انحدار: سكوب الأوبزيرفر على المباريات لم يتغير (Principle III)
// ═══════════════════════════════════════════════════════════════════════════
describe('observer match scope unchanged by Stage 2 (scenario 20, FR-009)', () => {
  it('an observer still sees exactly the matches of their assigned players teams', async () => {
    const admin = await createAdmin();
    const coach = await createCoach();
    const observer = await createObserver();

    const teamA = await createTeam(ageGroup._id, { league: 'premier' });
    const teamB = await createTeam(ageGroup._id, { league: 'premier' });
    const teamC = await createTeam(ageGroup._id, { league: 'professional' });

    // اللاعب المتابَع من الأوبزيرفر في teamA
    await createPlayerDoc({
      name: 'Watched', coach: coach.user._id, createdBy: coach.user._id,
      team: teamA._id, status: 'observed', observers: [observer.user._id],
    });

    const mine = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
      homeTeam: teamA._id, awayTeam: teamB._id, createdBy: admin.user._id,
    });
    // مباراة مالهاش علاقة بلاعبيه — ومحترفين كمان، عشان نتأكد إن سكوب proScout
    // الجديد ما اتسربش لفرع الأوبزيرفر
    await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-03-02T00:00:00.000Z'),
      homeTeam: teamC._id, awayTeam: teamB._id, createdBy: admin.user._id,
    });

    const res = await request(app)
      .get('/api/v1/seasonMatches')
      .set('Authorization', 'Bearer ' + observer.token);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(String(res.body.data.documents[0]._id)).toBe(String(mine._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US3 — نطاق الفرق (scenarios 21-24)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — team scope (US3, FR-005)', () => {
  let scout, proTeam, premierTeam;

  beforeEach(async () => {
    scout = await createProScout();
    proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    premierTeam = await createTeam(ageGroup._id, { league: 'premier' });
  });

  const teams = (qs = '') =>
    request(app).get('/api/v1/teams' + qs).set('Authorization', 'Bearer ' + scout.token);

  it('scenario 21: a professional team is visible', async () => {
    const res = await teams();
    expect(res.status).toBe(200);
    expect(res.body.data.documents.map((d) => String(d._id))).toContain(String(proTeam._id));
  });

  it('scenario 22: a premier team is absent from the list AND 403 by direct id', async () => {
    const res = await teams();
    expect(res.body.data.documents.map((d) => String(d._id))).not.toContain(String(premierTeam._id));
    expect(res.body.count).toBe(1);

    const direct = await request(app)
      .get('/api/v1/teams/' + premierTeam._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(403);
  });

  it('scenario 22b: an in-scope team IS reachable by direct id', async () => {
    const direct = await request(app)
      .get('/api/v1/teams/' + proTeam._id)
      .set('Authorization', 'Bearer ' + scout.token);
    expect(direct.status).toBe(200);
    expect(String(direct.body.data.document._id)).toBe(String(proTeam._id));
  });

  it('scenario 23: ?league=premier returns ZERO rows — second endpoint the $and wrapper protects', async () => {
    // نفس ناقل التصعيد بتاع المباريات: `league` مُدرج في TEAM_FILTERS.
    const res = await teams('?league=premier');
    expect(res.status).toBe(200);
    expect(res.body.data.documents).toHaveLength(0);
  });

  it('scenario 24: admin, coach and observer still see ALL teams (Constraint C-3)', async () => {
    for (const make of [createAdmin, createCoach, createObserver]) {
      const actor = await make();
      const res = await request(app)
        .get('/api/v1/teams')
        .set('Authorization', 'Bearer ' + actor.token);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      const ids = res.body.data.documents.map((d) => String(d._id));
      expect(ids).toContain(String(proTeam._id));
      expect(ids).toContain(String(premierTeam._id));

      // والوصول المباشر بالـID برضه لم يتغير
      const direct = await request(app)
        .get('/api/v1/teams/' + premierTeam._id)
        .set('Authorization', 'Bearer ' + actor.token);
      expect(direct.status).toBe(200);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US4 — تسجيل محاولات الوصول المرفوضة (scenario 25)
// ═══════════════════════════════════════════════════════════════════════════
describe('proScout — denied access is auditable (US4, FR-010, SC-004)', () => {
  let scout, coach, admin, premierTeam, premierPlayer, premierMatch;

  beforeEach(async () => {
    vi.clearAllMocks();
    scout = await createProScout();
    coach = await createCoach();
    admin = await createAdmin();

    premierTeam = await createTeam(ageGroup._id, { league: 'premier' });
    const other = await createTeam(ageGroup._id, { league: 'premier' });

    premierPlayer = await createPlayerDoc({
      name: 'Out Of Scope', coach: coach.user._id, createdBy: coach.user._id, team: premierTeam._id,
    });
    premierMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
      homeTeam: premierTeam._id, awayTeam: other._id, createdBy: admin.user._id,
    });
  });

  const cases = [
    ['player', () => '/api/v1/players/' + premierPlayer._id, () => String(premierPlayer._id)],
    ['seasonMatch', () => '/api/v1/seasonMatches/' + premierMatch._id, () => String(premierMatch._id)],
    ['team', () => '/api/v1/teams/' + premierTeam._id, () => String(premierTeam._id)],
  ];

  it.each(cases)('logs exactly one denial for %s with the four required fields', async (resource, url, id) => {
    logScopeDenial.mockClear();

    const res = await request(app)
      .get(url())
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);

    const arg = logScopeDenial.mock.calls[0][0];
    expect(arg.resource).toBe(resource);
    expect(String(arg.resourceId)).toBe(id());
    // الأربعة اللي Principle IV بيطلبهم: المستخدم، الرول، المسار، معرّف المورد
    expect(String(arg.req.user._id)).toBe(String(scout.user._id));
    expect(arg.req.user.role).toBe('proScout');
    expect(arg.req.originalUrl).toContain(id());
  });

  it('does not log anything when the request is inside scope', async () => {
    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    logScopeDenial.mockClear();

    const res = await request(app)
      .get('/api/v1/teams/' + proTeam._id)
      .set('Authorization', 'Bearer ' + scout.token);

    expect(res.status).toBe(200);
    expect(logScopeDenial).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T042 — يونيت تست مباشر لـcheckSeasonMatchAttendee (بيتخطى HTTP، بينادي الحارس
// مباشرة). checkReportOwnership/checkMediaOwnership لسه فروعهم مش مفتوحة عبر
// allowedTo، فتستاتهم فضلوا كما هي.
//
// حتى المرحلة 6، فرع proScout في checkSeasonMatchAttendee كان بيحسب فحص النطاق
// وبعدين بيرفض دايماً بغض النظر عن النتيجة — عمداً، لأن /attend و/status كانوا
// لسه مقفولين من allowedTo (research.md R2). المرحلة 6 فتحت الحدين وصلّحت
// الفرع: بقى بيمنح فقط لو النطاق **و** عضوية attendees الاتنين صح معاً.
// ═══════════════════════════════════════════════════════════════════════════
describe('T042 — checkSeasonMatchAttendee: scope + attendee-membership (Stage 6)', () => {
  let scout, admin, proMatch, premierMatch;

  const runGuard = async (guard, req) => {
    const next = vi.fn();
    await guard(req, {}, next);
    return next;
  };

  const reqFor = (user, id) => ({
    user,
    params: { id: String(id) },
    method: 'POST',
    originalUrl: '/api/v1/seasonMatches/' + id + '/attend',
  });

  beforeEach(async () => {
    scout = await createProScout();
    admin = await createAdmin();

    const pro = [
      await createTeam(ageGroup._id, { league: 'professional' }),
      await createTeam(ageGroup._id, { league: 'professional' }),
    ];
    const prem = [
      await createTeam(ageGroup._id, { league: 'premier' }),
      await createTeam(ageGroup._id, { league: 'premier' }),
    ];

    proMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
      homeTeam: pro[0]._id, awayTeam: pro[1]._id, createdBy: admin.user._id,
      attendees: [scout.user._id],
    });
    premierMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'premier',
      matchDate: new Date('2026-03-02T00:00:00.000Z'),
      homeTeam: prem[0]._id, awayTeam: prem[1]._id, createdBy: admin.user._id,
      attendees: [scout.user._id],
    });
  });

  it('checkSeasonMatchAttendee: proScout is granted when in-scope AND a registered attendee (Stage 6)', async () => {
    const next = await runGuard(checkSeasonMatchAttendee, reqFor(scout.user, proMatch._id));

    // next() called with no argument = grant, per the coach/observer branches' shape.
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('checkSeasonMatchAttendee: proScout is denied when in-scope but NOT a registered attendee', async () => {
    // proMatch is in scope but built with no attendees array — attendee-membership leg alone must deny.
    const noAttendeeMatch = await SeasonMatch.create({
      ageGroup: ageGroup._id, season: '2025/2026', league: 'professional',
      matchDate: new Date('2026-03-03T00:00:00.000Z'),
      homeTeam: proMatch.homeTeam, awayTeam: proMatch.awayTeam, createdBy: admin.user._id,
    });

    const next = await runGuard(checkSeasonMatchAttendee, reqFor(scout.user, noAttendeeMatch._id));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('checkSeasonMatchAttendee: the SCOPE check runs — an out-of-scope match logs a denial', async () => {
    // ده الجزء اللي بيتحقق من إن فحص النطاق موجود فعلاً مش مجرد فحص عضوية.
    // الـproScout عضو في attendees في المباراتين، فالفرق الوحيد هو الدوري.
    logScopeDenial.mockClear();
    await runGuard(checkSeasonMatchAttendee, reqFor(scout.user, premierMatch._id));
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    expect(logScopeDenial.mock.calls[0][0].resource).toBe('seasonMatch');

    // وفي المباراة داخل النطاق (وهو attendee فيها كمان): بيتمنح، ومن غير أي
    // تسجيل خرق نطاق — مفيش خرق أصلاً.
    logScopeDenial.mockClear();
    const next = await runGuard(checkSeasonMatchAttendee, reqFor(scout.user, proMatch._id));
    expect(logScopeDenial).not.toHaveBeenCalled();
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('checkReportOwnership and checkMediaOwnership deny proScout explicitly (Constraint C-2)', async () => {
    const coach = await createCoach();
    const player = await createPlayerDoc({
      name: 'Any', coach: coach.user._id, createdBy: coach.user._id, team: null,
    });

    const report = await ScoutingReport.create({
      ...reportPayload(),
      player: player._id, coach: coach.user._id,
      matchDate: new Date('2026-03-01T00:00:00.000Z'),
    });
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: scout.user._id, type: 'image',
      storage: 'bunny', storageKey: 'k/x.webp',
    });

    for (const [guard, doc, label] of [
      [checkReportOwnership, report, 'report'],
      [checkMediaOwnership, media, 'media'],
    ]) {
      const next = await runGuard(guard, {
        user: scout.user,
        params: { id: String(doc._id), playerId: String(player._id) },
        method: 'GET',
        originalUrl: '/api/v1/players/' + player._id + '/' + label + '/' + doc._id,
      });

      expect(next.mock.calls[0][0], label).toBeInstanceOf(AppError);
      expect(next.mock.calls[0][0].statusCode, label).toBe(403);
    }

    // الميديا اترفعت بواسطة الـproScout نفسه — من غير فرع صريح، المقارنة على
    // uploadedBy كانت هتمرّره (ده بالظبط القيد C-2).
    expect(String(media.uploadedBy)).toBe(String(scout.user._id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T043 — كنس المنع-بالافتراض (scenario 26، Principle I + II).
// بنتأكد من **رمز الحالة** مش من جسم فاضي: قائمة فاضية معناها "مفيش بيانات"،
// مش "ممنوع".
// ═══════════════════════════════════════════════════════════════════════════
describe('T043 — deny-by-default sweep across the endpoint matrix (scenario 26)', () => {
  let scout;

  beforeEach(async () => {
    scout = await createProScout();
  });

  const forbidden = [
    ['GET', '/api/v1/users'],
    // ⚠️ POST /api/v1/players اتشال من الكنس ده في المرحلة 4 — الحد اتفتح
    // للـproScout عن قصد (إنشاء لاعبين هو نص المرحلة). المنع اتحوّل من بوابة
    // الرول لطبقة النطاق: teamExistsInScope بيمنع فرق برّه دوري المحترفين،
    // وcheckPlayerOwnership بيمنع أي لاعب برّه النطاق. التغطية في
    // tests/roles/proScoutPlayersWrite.test.js.
    ['POST', '/api/v1/teams'],
    ['POST', '/api/v1/seasonMatches'],
    ['GET', '/api/v1/dashboard/admin'],
    ['GET', '/api/v1/dashboard/coach'],
    ['GET', '/api/v1/dashboard/observer'],
    ['GET', '/api/v1/coachEvaluations'],
    ['GET', '/api/v1/observerEvaluations'],
  ];

  it.each(forbidden)('%s %s → 403 for proScout', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url)
      .set('Authorization', 'Bearer ' + scout.token)
      .send({});

    expect(res.status).toBe(403);
  });

  // ⚠️ /ages مستثناة من الكنس فوق عن قصد، والسبب مهم يتسجّل:
  //
  // الدستور (C-3) بيطلب إن الرول الجديد "يُمنَع من /ages و /ages/:id صراحةً عبر
  // allowedTo". ده **غير قابل للتنفيذ** كما هو: ageGroupRouter بيعرّف
  // `.get(getAll)` من غير `protect` إطلاقاً — مفيش req.user أصلاً عشان allowedTo
  // تشتغل عليه. المسارات دي متاحة لغير المسجّلين، وده بند tech debt مسجّل
  // ومستثنى صراحةً من نطاق الخطة بقرار المالك — TODO(AGES_UNAUTHENTICATED_READ).
  //
  // إضافة protect هنا كانت هتغيّر سلوك قائم برّه نطاق المرحلة دي، فاتسابت كما هي.
  // التست ده بيوثّق الوضع الفعلي عشان ماحدش يفتكر إن المنع موجود وهو مش موجود.
  it('GET /ages is PUBLIC — not denied to proScout, because it has no protect at all', async () => {
    const withToken = await request(app)
      .get('/api/v1/ages')
      .set('Authorization', 'Bearer ' + scout.token);
    expect(withToken.status).toBe(200);

    // ومن غير أي توكن كمان — ده جوهر بند الـtech debt
    const anonymous = await request(app).get('/api/v1/ages');
    expect(anonymous.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// /code-review high, fix #1 — getCountsByAgeGroup: منع-بالافتراض صريح.
//
// نفس نمط tests/ownership.test.js: مفيش user حقيقي معاه role غير معروف —
// enum الرولات بيمنعه (research.md، /speckit-clarify Q2) — فبنستدعي الكنترولر
// مباشرة بـreq/res مصطنعين. قبل التصليح، أي رول رابع مش من الأربعة المعدودين
// كان بيرجّع match فاضي ({}) وscope فاضي ({} — proScout بس بيرجع نطاق حقيقي)،
// يعني عدّاد كل لاعبين الداتابيز بالصدفة.
// ═══════════════════════════════════════════════════════════════════════════
describe('getCountsByAgeGroup — default-deny for an unknown role (fix #1)', () => {
  const mockRes = () => {
    const res = {};
    res.status = () => res;
    res.json = (body) => { res.body = body; return res; };
    return res;
  };

  it('returns zero for a role absent from every explicit branch, not a count of all players', async () => {
    const coach = await createCoach();
    const proTeam = await createTeam(ageGroup._id, { league: 'professional' });
    await createPlayerDoc({ name: 'A', coach: coach.user._id, createdBy: coach.user._id, team: proTeam._id });
    await createPlayerDoc({ name: 'B', coach: coach.user._id, createdBy: coach.user._id, team: null });

    const req = { user: { _id: new mongoose.Types.ObjectId(), role: 'not-a-real-role' }, query: {} };
    const res = mockRes();
    let calledNext;
    await getCountsByAgeGroup(req, res, (err) => { calledNext = err; });

    expect(calledNext).toBeUndefined();
    expect(res.body.data.total).toBe(0);
  });
});
