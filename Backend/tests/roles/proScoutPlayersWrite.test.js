import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// نفس نمط المرحلة 2 — spy على طبقة تسجيل الرفض عشان نثبت إن كل رفض بيسجّل
// (Principle IV)، بنفس أسلوب الـI/O الخارجي الموكوك في tests/setup.js.
vi.mock('../../utils/accessLog.js', () => {
  const fn = vi.fn();
  // Stage 7 — accessLog.js gained a logRoleDenial export (role-gate denial
  // logging). The mock must declare every export the real module has, or an
  // unrelated 403-producing call chain that happens to pass through
  // allowedTo() throws "logRoleDenial is not a function" and surfaces as a
  // 500 instead of the expected 403 in tests that never intended to touch
  // logging at all.
  return { logScopeDenial: fn, logRoleDenial: fn, default: fn };
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
  playerPayload,
  reportPayload,
} from '../helpers/factory.js';
import AgeGroup from '../../models/ageGroupModel.js';
import Player from '../../models/playedModel.js';
import ScoutingReport from '../../models/scoutingReportModel.js';
import PlayerMedia from '../../models/playerMediaModel.js';
import Team from '../../models/teamModel.js';

// ملفات الاختبارات بتحتفظ بأسماء الرولات كنصوص حرفية عن قصد — أوراكل مستقل عن
// constants/roles.js (نفس قرار المرحلة 2).

const auth = (token) => ['Authorization', `Bearer ${token}`];

let ageGroup;
let scout, otherScout, coach, admin, observer;
let proTeam, premierTeam;

beforeEach(async () => {
  vi.clearAllMocks();
  await seedAgeGroups();
  ageGroup = await AgeGroup.findOne();

  proTeam = await createTeam(ageGroup._id, { league: 'professional' });
  premierTeam = await createTeam(ageGroup._id, { league: 'premier' });

  scout = await createProScout({ email: `scout_a_${Date.now()}@test.com` });
  otherScout = await createProScout({ email: `scout_b_${Date.now()}@test.com` });
  coach = await createCoach();
  admin = await createAdmin();
  observer = await createObserver();
});

// ⚠️ ageGroup **مشتق** من dateOfBirth في pre('save') (playedModel.js:165) —
// تمريره صراحةً بيتكتب فوقه بصمت. فالتستات بتقراه من اللاعب بعد الإنشاء بدل ما
// تفترض إنه الـageGroup اللي seedAgeGroups رجّعته.
const inScopePlayer = (overrides = {}) =>
  createPlayerDoc({ team: proTeam._id, ...overrides });

const outOfScopePlayer = (overrides = {}) =>
  createPlayerDoc({ team: premierTeam._id, ...overrides });

// ═══════════════════════════════════════════════════════════════════════════
// US1 — قايمة اللاعبين مسكوبة (تحقّق من عمل المرحلة 2، مش تنفيذ جديد)
// FR-001, FR-004, FR-005
// ═══════════════════════════════════════════════════════════════════════════
describe('US1 — GET /players is scoped for proScout (FR-001)', () => {
  it('returns exactly the professional-league players plus its own team-less players', async () => {
    const pro = await inScopePlayer({ name: 'Pro Player' });
    const mine = await createPlayerDoc({ name: 'My Orphan', team: null, createdBy: scout.user._id });
    await outOfScopePlayer({ name: 'Premier Player' });
    await createPlayerDoc({ name: 'Other Scout Orphan', team: null, createdBy: otherScout.user._id });

    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));

    expect(res.status).toBe(200);
    const ids = res.body.data.documents.map((d) => d._id).sort();
    expect(ids).toEqual([pro._id.toString(), mine._id.toString()].sort());
    // العدد = المحسوب يدوياً، مش مجرد 200 (Principle VI)
    expect(res.body.count).toBe(2);
  });

  it('another user\'s team-less player is invisible (edge case)', async () => {
    await createPlayerDoc({ team: null, createdBy: otherScout.user._id });
    await createPlayerDoc({ team: null, createdBy: coach.user._id });

    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(res.body.count).toBe(0);
  });

  it('a free-text teamName confers no scope — invariant I-3 (documented tech debt)', async () => {
    // Player.teamName نص حر بديل عن team (playedModel.js:50). الفرع التاني من
    // النطاق بيقرا createdBy بس، فلاعب حر بمنشئ تاني بيفضل برّه. التست ده بيوثّق
    // السلوك القائم — مش بيصلّح بند الـtech debt.
    await createPlayerDoc({ team: null, teamName: 'Some Pro Club', createdBy: otherScout.user._id });
    const res = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(res.body.count).toBe(0);
  });
});

describe('US1 — query params cannot widen the scope (FR-004)', () => {
  it('?ageGroup= does not widen — result stays in scope', async () => {
    const inside = await inScopePlayer();
    await outOfScopePlayer();

    const res = await request(app)
      .get(`/api/v1/players?ageGroup=${inside.ageGroup}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('?team=<premier id> is rejected, not silently answered with 200', async () => {
    await outOfScopePlayer();
    const res = await request(app)
      .get(`/api/v1/players?team=${premierTeam._id}`)
      .set(...auth(scout.token));
    // teamExistsInScope بيرفضه في الـvalidation — نفس رسالة الـid المجهول بالظبط
    expect(res.status).toBe(400);
  });

  it('search stays inside scope', async () => {
    await inScopePlayer({ name: 'Zayed Hassan' });
    await outOfScopePlayer({ name: 'Zayed Mostafa' });

    const res = await request(app).get('/api/v1/players?keyword=zayed').set(...auth(scout.token));
    expect(res.body.count).toBe(1);
    expect(res.body.data.documents[0].name).toBe('Zayed Hassan');
  });

  it('pagination stays inside scope across pages', async () => {
    await inScopePlayer({ name: 'A' });
    await inScopePlayer({ name: 'B' });
    await outOfScopePlayer({ name: 'C' });

    const p1 = await request(app).get('/api/v1/players?page=1&limit=1').set(...auth(scout.token));
    const p2 = await request(app).get('/api/v1/players?page=2&limit=1').set(...auth(scout.token));
    const p3 = await request(app).get('/api/v1/players?page=3&limit=1').set(...auth(scout.token));

    expect(p1.body.count).toBe(1);
    expect(p2.body.count).toBe(1);
    expect(p3.body.count).toBe(0); // مفيش صفحة تالتة — الـpremier مش معدود
  });

  it('sorting stays inside scope', async () => {
    await inScopePlayer({ name: 'B Player' });
    await inScopePlayer({ name: 'A Player' });
    await outOfScopePlayer({ name: 'A Premier' });

    const res = await request(app).get('/api/v1/players?sort=name').set(...auth(scout.token));
    expect(res.body.count).toBe(2);
    expect(res.body.data.documents[0].name).toBe('A Player');
  });
});

describe('US1 — counts and average-ratings are scoped (FR-005)', () => {
  it('GET /players/counts equals the hand-computed in-scope total', async () => {
    const a = await inScopePlayer();
    await inScopePlayer();
    await outOfScopePlayer();

    const res = await request(app).get('/api/v1/players/counts').set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.counts[a.ageGroup.toString()]).toBe(2);
  });

  it('GET /players/reports/average-ratings excludes out-of-scope players', async () => {
    const outside = await outOfScopePlayer();
    await ScoutingReport.create({
      ...reportPayload(), player: outside._id, coach: scout.user._id, matchType: 'training', matchDate: new Date(),
    });

    const res = await request(app)
      .get(`/api/v1/players/reports/average-ratings?ids=${outside._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.data[outside._id.toString()]).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US2 — تفاصيل اللاعب والقناع
// FR-006, US2.1–US2.3
// ═══════════════════════════════════════════════════════════════════════════
describe('US2 — player detail masking and direct-ID denial', () => {
  it('an in-scope player is readable, with observers masked and observed→pending (FR-006)', async () => {
    const player = await inScopePlayer({ status: 'observed', observers: [observer.user._id] });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.data.document.status).toBe('pending');
    expect(res.body.data.document.observers).toBeUndefined();
  });

  it('an out-of-scope player is 403 by direct id — never 200 with an empty body', async () => {
    const player = await outOfScopePlayer();

    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalledTimes(1);
  });

  it('another user\'s team-less player is 403 by direct id', async () => {
    const player = await createPlayerDoc({ team: null, createdBy: otherScout.user._id });
    const res = await request(app)
      .get(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('?status=observed is dropped, not executed — the mask is not bypassable by filter', async () => {
    await inScopePlayer({ status: 'observed' });
    await inScopePlayer({ status: 'selected' });

    const res = await request(app)
      .get('/api/v1/players?status=observed')
      .set(...auth(scout.token));

    // الفلتر اتجاهل تماماً، فبيرجع الاتنين — لو كان اتنفّذ كان هيكشف مين المتابَع
    expect(res.body.count).toBe(2);
  });

  it('?status=pending includes observed players, matching what the mask displays', async () => {
    await inScopePlayer({ status: 'observed' });
    await inScopePlayer({ status: 'pending' });
    await inScopePlayer({ status: 'rejected' });

    const res = await request(app)
      .get('/api/v1/players?status=pending')
      .set(...auth(scout.token));

    expect(res.body.count).toBe(2);
  });

  it('the admin-only lenses (?coach=, ?observer=, ?observers=) are stripped', async () => {
    await inScopePlayer({ coach: coach.user._id });

    const res = await request(app)
      .get(`/api/v1/players?coach=${coach.user._id}`)
      .set(...auth(scout.token));

    // العدسة اتشالت، فالنتيجة هي النطاق كامل مش المفلترة بالكوتش
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US3 — إنشاء وتعديل اللاعبين
// FR-007, FR-008, FR-009, FR-013, FR-016 + research R14
// ═══════════════════════════════════════════════════════════════════════════
describe('US3 — POST /players (FR-007, FR-016)', () => {
  it('creates a player with createdBy set and coach UNSET (invariant I-1)', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: proTeam._id.toString() }));

    expect(res.status).toBe(201);

    const saved = await Player.findById(res.body.data.document._id);
    expect(saved.createdBy.toString()).toBe(scout.user._id.toString());
    // الـproScout مش كوتش — assignPlayerCoach نفسه بيرفض أي يوزر مش role: coach
    expect(saved.coach).toBeFalsy();
  });

  it('⚠️ R14 — the NESTED mount cannot be used to pick the player\'s coach', async () => {
    // playerRouter متمركّب كمان على /users/:id/players (userRouter.js:482)، و
    // setUserIdToBody بينسخ الـuser id من الـURL في req.body.coach. الخوف كان إن
    // الـproScout يقدر يخلق لاعب مملوك لكوتش من اختياره.
    //
    // القياس الفعلي: **الطلب بيترفض 400**. setUserIdToBody بيشتغل *قبل*
    // createValidate في السلسلة، فlockField("coach") بيشوف القيمة المحقونة
    // ويرفضها. الثغرة مش قابلة للوصول — ادعاء research R14 الأصلي إن الـlock
    // مابيمسكهاش كان غلط واتصحّح هناك.
    //
    // الـdelete في create اتساب كدفاع في العمق: بيخلي الكنترولر صح بمعزل عن
    // ترتيب الـvalidator، فأي إعادة ترتيب مستقبلية مش هتحيي الخطر.
    const res = await request(app)
      .post(`/api/v1/users/${coach.user._id}/players`)
      .set(...auth(scout.token))
      .send(playerPayload({ team: proTeam._id.toString() }));

    expect(res.status).toBe(400);
    expect(await Player.countDocuments()).toBe(0);
  });

  it('the nested create route is dead for a coach too — TODO(NESTED_PLAYER_CREATE_DEAD)', async () => {
    // مش مشكلة proScout: الراوت ده بيرجع 400 لكل الرولات، لأن setUserIdToBody
    // وlockField("coach") بيتناقضوا. بيتوثّق هنا كسلوك قائم — إصلاحه تغيير في
    // سلوك رول قائم وبرّه نطاق المرحلة (Principle III).
    const res = await request(app)
      .post(`/api/v1/users/${admin.user._id}/players`)
      .set(...auth(coach.token))
      .send(playerPayload({ team: proTeam._id.toString() }));

    expect(res.status).toBe(400);
  });

  it('a team-less player is allowed and attributed to its creator (edge case)', async () => {
    const payload = playerPayload();
    delete payload.team;

    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(payload);

    expect(res.status).toBe(201);
    const saved = await Player.findById(res.body.data.document._id);
    expect(saved.team).toBeNull();
    expect(saved.createdBy.toString()).toBe(scout.user._id.toString());

    // وبيظهر في قايمته فوراً — ده سبب وجود الفرع التاني من النطاق أصلاً
    const list = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(list.body.count).toBe(1);
  });

  it('a birth year outside the professional range fails (invariant I-4, amended by Stage 4b)', async () => {
    // ⚠️ التست ده كان بيبعت 2001 ويتوقع 400، لأن المدى وقتها كان 2007→2019 لكل
    // الرولات. المرحلة 4b وسّعته للـproScout لـ1996→2019 (لاعبين محترفين بالغين)،
    // فـ2001 بقت **صالحة**. الحد اتنقل، ما اتشالش — 1995 لسه بتترفض.
    // التغطية الكاملة في describe بتاع "Stage 4b" تحت.
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: proTeam._id.toString(), dateOfBirth: '1995-05-05' }));

    expect(res.status).toBe(400);
  });

  it('a client-supplied createdBy is rejected (invariant I-2)', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: proTeam._id.toString(), createdBy: otherScout.user._id.toString() }));

    expect(res.status).toBe(400);
  });
});

describe('US3 — team assignment is confined to the professional league (FR-008)', () => {
  it('a premier-league team is rejected', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: premierTeam._id.toString() }));

    expect(res.status).toBe(400);
    expect(await Player.countDocuments()).toBe(0);
  });

  it('⚠️ anti-oracle — an out-of-scope team is INDISTINGUISHABLE from an unknown id', async () => {
    // research R4: لو الرد اتفرّق (403 مقابل 400، أو رسالة مختلفة) الـproScout
    // يقدر يعدّ فرق الدوري التاني بالتخمين، وده بيهدم checkTeamScope.
    const unknownId = '507f1f77bcf86cd799439011';

    const outOfScope = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: premierTeam._id.toString() }));

    const unknown = await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: unknownId }));

    expect(outOfScope.status).toBe(unknown.status);
    // ⚠️ /g مطلوب: الـid بيظهر مرتين في الرد (value وmsg)، و.replace بنص عادي
    // بيبدّل أول واحدة بس — من غيره التست بيقارن ids مختلفة ويفشل غلط.
    const msg = (r) =>
      JSON.stringify(r.body)
        .replace(new RegExp(premierTeam._id.toString(), 'g'), 'ID')
        .replace(new RegExp(unknownId, 'g'), 'ID');
    expect(msg(outOfScope)).toBe(msg(unknown));
  });

  it('the out-of-scope attempt IS logged, while the unknown id is not (finding D2)', async () => {
    // الفرق بيعيش في اللوج على السيرفر بس — مش في الرد.
    await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: premierTeam._id.toString() }));

    expect(logScopeDenial).toHaveBeenCalledTimes(1);
    expect(logScopeDenial.mock.calls[0][0]).toMatchObject({ resource: 'team' });

    vi.clearAllMocks();

    await request(app)
      .post('/api/v1/players')
      .set(...auth(scout.token))
      .send(playerPayload({ team: '507f1f77bcf86cd799439011' }));

    expect(logScopeDenial).not.toHaveBeenCalled();
  });

  it('reassigning an in-scope player to a premier team is rejected', async () => {
    const player = await inScopePlayer();

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token))
      .send({ team: premierTeam._id.toString() });

    expect(res.status).toBe(400);
    const after = await Player.findById(player._id);
    expect(after.team.toString()).toBe(proTeam._id.toString());
  });
});

describe('US3 — PATCH /players/:id (FR-009, FR-013)', () => {
  it('updates an in-scope player', async () => {
    const player = await inScopePlayer();

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token))
      .send({ notes: 'Strong left foot' });

    expect(res.status).toBe(200);
  });

  it('refuses an out-of-scope player with 403', async () => {
    const player = await outOfScopePlayer();

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token))
      .send({ notes: 'nope' });

    expect(res.status).toBe(403);
    expect(logScopeDenial).toHaveBeenCalled();
  });

  it('refuses another user\'s team-less player with 403', async () => {
    const player = await createPlayerDoc({ team: null, createdBy: otherScout.user._id });
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token))
      .send({ notes: 'nope' });

    expect(res.status).toBe(403);
  });

  it('cannot modify observers, even on an in-scope player (FR-013)', async () => {
    const player = await inScopePlayer();

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/observers`)
      .set(...auth(scout.token))
      .send({ observers: [observer.user._id.toString()] });

    expect(res.status).toBe(403);
  });

  it('cannot smuggle coach through the update body', async () => {
    const player = await inScopePlayer();
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(scout.token))
      .send({ coach: coach.user._id.toString() });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// US4 — التقارير والميديا وصورة البروفايل
// FR-010, FR-011, FR-011a, FR-012 + research R2, R3, R6
// ═══════════════════════════════════════════════════════════════════════════
describe('US4 — scouting reports (FR-010, FR-011a)', () => {
  const createReportAs = (playerId, token) =>
    request(app)
      .post(`/api/v1/players/${playerId}/reports`)
      .set(...auth(token))
      .send({ ...reportPayload(), matchType: 'training' });

  it('creates a report on an in-scope player, authored by the proScout', async () => {
    const player = await inScopePlayer();
    const res = await createReportAs(player._id, scout.token);

    expect(res.status).toBe(201);
    const saved = await ScoutingReport.findById(res.body.data.document._id);
    expect(saved.coach.toString()).toBe(scout.user._id.toString());
  });

  it('reads back its own reports, and only its own (FR-011a)', async () => {
    const player = await inScopePlayer();
    await createReportAs(player._id, scout.token);
    await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: otherScout.user._id, matchType: 'training', matchDate: new Date(),
    });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it('updates its own report', async () => {
    const player = await inScopePlayer();
    const created = await createReportAs(player._id, scout.token);

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${created.body.data.document._id}`)
      .set(...auth(scout.token))
      .send({ notes: 'Revised' });

    expect(res.status).toBe(200);
  });

  it('⚠️ CANNOT delete a report — admin-only for every non-admin role (research R2)', async () => {
    const player = await inScopePlayer();
    const created = await createReportAs(player._id, scout.token);

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}/reports/${created.body.data.document._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
    expect(await ScoutingReport.countDocuments()).toBe(1);
  });

  it('cannot create a report on an out-of-scope player', async () => {
    const player = await outOfScopePlayer();
    const res = await createReportAs(player._id, scout.token);
    expect(res.status).toBe(403);
  });

  it('cannot read another author\'s report by direct id', async () => {
    const player = await inScopePlayer();
    const foreign = await ScoutingReport.create({
      ...reportPayload(), player: player._id, coach: coach.user._id, matchType: 'training', matchDate: new Date(),
    });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/reports/${foreign._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
  });

  it('⚠️ the SCOPE axis is load-bearing: a player leaving the league locks its own report', async () => {
    // research R6 — /reports/:id مافيهوش checkPlayerOwnership في السلسلة، فلو
    // الحارس فحص الملكية بس، التقرير كان هيفضل قابل للتعديل بعد ما اللاعب يخرج
    // من دوري المحترفين. ده التست اللي بيفرق بين حارس بمحور واحد واتنين.
    const player = await inScopePlayer();
    const created = await createReportAs(player._id, scout.token);
    const reportId = created.body.data.document._id;

    // قبل النقل: مسموح
    const before = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${reportId}`)
      .set(...auth(scout.token))
      .send({ notes: 'still mine' });
    expect(before.status).toBe(200);

    // الأدمن ينقل اللاعب لدوري تاني
    await Player.findByIdAndUpdate(player._id, { team: premierTeam._id });

    const after = await request(app)
      .patch(`/api/v1/players/${player._id}/reports/${reportId}`)
      .set(...auth(scout.token))
      .send({ notes: 'no longer mine' });

    expect(after.status).toBe(403);
  });
});

describe('US4 — media (FR-011)', () => {
  it('lists media for an in-scope player', async () => {
    const player = await inScopePlayer();
    const res = await request(app)
      .get(`/api/v1/players/${player._id}/media`)
      .set(...auth(scout.token));
    expect(res.status).toBe(200);
  });

  it('refuses to list media for an out-of-scope player', async () => {
    const player = await outOfScopePlayer();
    const res = await request(app)
      .get(`/api/v1/players/${player._id}/media`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('reads back its own media by id', async () => {
    const player = await inScopePlayer();
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: scout.user._id, type: 'image',
      url: 'players/x.webp', title: 'shot', description: 'a shot',
    });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/media/${media._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(200);
  });

  it('cannot read media uploaded by someone else', async () => {
    const player = await inScopePlayer();
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: coach.user._id, type: 'image',
      url: 'players/y.webp', title: 'shot', description: 'a shot',
    });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/media/${media._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
  });

  it('⚠️ CANNOT download media — admin-only under security item F7d (research R3)', async () => {
    const player = await inScopePlayer();
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: scout.user._id, type: 'video',
      url: 'v1', title: 'clip', description: 'a clip',
    });

    const res = await request(app)
      .get(`/api/v1/players/${player._id}/media/${media._id}/download`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
  });

  it('⚠️ CANNOT delete media — admin-only (F5/F7d)', async () => {
    const player = await inScopePlayer();
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: scout.user._id, type: 'image',
      url: 'players/z.webp', title: 'shot', description: 'a shot',
    });

    const res = await request(app)
      .delete(`/api/v1/players/${player._id}/media/${media._id}`)
      .set(...auth(scout.token));

    expect(res.status).toBe(403);
    expect(await PlayerMedia.countDocuments()).toBe(1);
  });

  it('cannot review media — admin-only', async () => {
    const player = await inScopePlayer();
    const media = await PlayerMedia.create({
      player: player._id, uploadedBy: scout.user._id, type: 'video',
      url: 'v2', title: 'clip', description: 'a clip',
    });

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/media/${media._id}/review`)
      .set(...auth(scout.token))
      .send({ reviewStatus: 'approved' });

    expect(res.status).toBe(403);
  });
});

describe('US4 — profile image (FR-012)', () => {
  it('refuses an out-of-scope player with 403', async () => {
    const player = await outOfScopePlayer();
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(scout.token))
      .attach('profileImg', Buffer.from('not-a-real-image'), 'a.png');

    expect(res.status).toBe(403);
  });

  it('refuses another user\'s team-less player with 403', async () => {
    const player = await createPlayerDoc({ team: null, createdBy: otherScout.user._id });
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(scout.token))
      .attach('profileImg', Buffer.from('not-a-real-image'), 'a.png');

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Principle III — الرولات القائمة ما اتغيّرش سلوكها
// أخطر نقطة: إضافة checkPlayerOwnership لسلسلة profileImg (research R7)
// ═══════════════════════════════════════════════════════════════════════════
describe('Regression — profileImg chain still behaves identically for existing roles (R7)', () => {
  it('a coach is still refused on another coach\'s player', async () => {
    const otherCoach = await createCoach({ email: `coach2_${Date.now()}@test.com` });
    const player = await createPlayerDoc({ coach: otherCoach.user._id });

    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(coach.token))
      .attach('profileImg', Buffer.from('x'), 'a.png');

    expect(res.status).toBe(403);
  });

  it('an unknown player id is still 404, not 403', async () => {
    const res = await request(app)
      .patch('/api/v1/players/507f1f77bcf86cd799439011/profileImg')
      .set(...auth(coach.token))
      .attach('profileImg', Buffer.from('x'), 'a.png');

    expect(res.status).toBe(404);
  });

  it('an admin still reaches the controller for any player', async () => {
    const player = await createPlayerDoc({ coach: coach.user._id });
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/profileImg`)
      .set(...auth(admin.token))
      .attach('profileImg', Buffer.from('x'), 'a.png');

    // 400 من معالجة الصورة نفسها (البايتات مش صورة) — المهم إنه عدّى الحارس
    expect(res.status).not.toBe(403);
  });
});

describe('Regression — coach and observer are untouched by this stage (FR-014)', () => {
  it('a coach still sees exactly its own players, premier league included', async () => {
    await createPlayerDoc({ coach: coach.user._id, team: premierTeam._id });
    await createPlayerDoc({ coach: coach.user._id, team: proTeam._id });
    await inScopePlayer();

    const res = await request(app).get('/api/v1/players').set(...auth(coach.token));
    expect(res.body.count).toBe(2);
  });

  it('an observer still sees only assigned players', async () => {
    await createPlayerDoc({ observers: [observer.user._id], team: premierTeam._id });
    await inScopePlayer();

    const res = await request(app).get('/api/v1/players').set(...auth(observer.token));
    expect(res.body.count).toBe(1);
  });

  it('a coach can still create a player on a premier-league team', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: premierTeam._id.toString() }));

    expect(res.status).toBe(201);
    const saved = await Player.findById(res.body.data.document._id);
    expect(saved.coach.toString()).toBe(coach.user._id.toString());
  });

  it('an admin still sees every player', async () => {
    await inScopePlayer();
    await outOfScopePlayer();
    const res = await request(app).get('/api/v1/players').set(...auth(admin.token));
    expect(res.body.count).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T051 / T058 — جرد الرفض (Principle VI، contracts/endpoint-inventory.md)
// ═══════════════════════════════════════════════════════════════════════════
describe('Denial sweep — admin-only routes adjacent to a granted capability (T051)', () => {
  it('DELETE /players/:id → 403', async () => {
    const player = await inScopePlayer();
    const res = await request(app).delete(`/api/v1/players/${player._id}`).set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('PATCH /players/:id/status → 403', async () => {
    const player = await inScopePlayer();
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/status`)
      .set(...auth(scout.token))
      .send({ status: 'selected' });
    expect(res.status).toBe(403);
  });

  it('PATCH /players/:id/coach → 403', async () => {
    const player = await inScopePlayer();
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}/coach`)
      .set(...auth(scout.token))
      .send({ coach: coach.user._id.toString() });
    expect(res.status).toBe(403);
  });
});

describe('Denial sweep — whole domains this stage grants nothing in (T058)', () => {
  // Principle VI item 4 — على مستوى الراوتر مش لكل route، عشان أي endpoint
  // يتضاف للراوترات دي مستقبلاً يبقى مرفوض بالافتراض ومُثبَت.
  const denied = [
    ['get', '/api/v1/users'],
    ['post', '/api/v1/users'],
    ['get', '/api/v1/users/deactivated'],
    ['get', '/api/v1/coachEvaluations'],
    ['post', '/api/v1/coachEvaluations'],
    ['get', '/api/v1/coachEvaluations/summary'],
    ['get', '/api/v1/observerEvaluations'],
    ['post', '/api/v1/observerEvaluations'],
    ['get', '/api/v1/dashboard/coach'],
    ['get', '/api/v1/dashboard/admin'],
    ['get', '/api/v1/dashboard/observer'],
    ['post', '/api/v1/auth/vaultPassword/verify'],
  ];

  it.each(denied)('%s %s → 403 for proScout', async (method, url) => {
    const res = await request(app)[method](url).set(...auth(scout.token)).send({});
    expect(res.status).toBe(403);
  });
});

describe('C-3 — /ages is NOT denied to anyone, including proScout (T052)', () => {
  // ⚠️ ageGroupRouter مافيهوش protect إطلاقاً، فallowedTo مالهاش req.user تشتغل
  // عليها. اختفاء عنصر Age Groups من القائمة (المرحلة 3) وإيقاف طلب /ages من
  // صفحة اللاعبين (المرحلة 4) الاتنين تغيير **نية** مش قفل باب.
  // TODO(AGES_UNAUTHENTICATED_READ) — بند tech debt خارج نطاق الخطة بقرار المالك.
  it('answers 200 to a proScout token', async () => {
    const res = await request(app).get('/api/v1/ages').set(...auth(scout.token));
    expect(res.status).toBe(200);
  });

  it('answers 200 with no token at all', async () => {
    const res = await request(app).get('/api/v1/ages');
    expect(res.status).toBe(200);
  });
});

describe('Teams stay scoped for proScout (Stage 2 regression)', () => {
  it('GET /teams shows professional teams only', async () => {
    const res = await request(app).get('/api/v1/teams').set(...auth(scout.token));
    expect(res.status).toBe(200);
    const leagues = [...new Set(res.body.data.documents.map((t) => t.league))];
    expect(leagues).toEqual(['professional']);
  });

  it('GET /teams/:id on a premier team → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/teams/${premierTeam._id}`)
      .set(...auth(scout.token));
    expect(res.status).toBe(403);
  });

  it('a coach still sees every team (C-3 — open reads stay open)', async () => {
    const res = await request(app).get('/api/v1/teams').set(...auth(coach.token));
    expect(res.body.data.documents.length).toBe(await Team.countDocuments());
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Stage 4b — سن اللاعب المحترف (1996→2019) وغياب الفئة العمرية
//
// لاعبو الـproScout محترفون بالغون: مدى سنة ميلاد أوسع، وبدون فئة عمرية
// إطلاقاً. الكوتش يفضل 2007→2019 مع فئة عمرية إجبارية — من غير أي تغيير.
// ═══════════════════════════════════════════════════════════════════════════
describe('Stage 4b — proScout registers professional adults', () => {
  const dobIn = (year) => `${year}-05-05`;

  const createAs = (token, overrides = {}) =>
    request(app)
      .post('/api/v1/players')
      .set(...auth(token))
      .send(playerPayload({ team: proTeam._id.toString(), ...overrides }));

  it('accepts a 30-year-old (born 1996) — the new floor', async () => {
    const res = await createAs(scout.token, { dateOfBirth: dobIn(1996) });
    expect(res.status).toBe(201);
  });

  it('accepts every year across the widened range', async () => {
    for (const y of [1996, 2000, 2006, 2007, 2019]) {
      const res = await createAs(scout.token, { dateOfBirth: dobIn(y), name: `Player ${y}` });
      expect(res.status).toBe(201);
    }
  });

  it('still rejects 1995 — the floor is a real bound, not "anything older"', async () => {
    const res = await createAs(scout.token, { dateOfBirth: dobIn(1995) });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('1996');
  });

  it('still rejects 2020 — the upper bound is unchanged for every role', async () => {
    const res = await createAs(scout.token, { dateOfBirth: dobIn(2020) });
    expect(res.status).toBe(400);
  });

  it('leaves ageGroup unset — a professional adult has no age group', async () => {
    const res = await createAs(scout.token, { dateOfBirth: dobIn(1996) });
    const saved = await Player.findById(res.body.data.document._id);
    expect(saved.isProfessional).toBe(true);
    expect(saved.ageGroup).toBeFalsy();
  });

  it('does NOT require an AgeGroup doc to exist for the birth year', async () => {
    // ده بيت القصيد: مفيش AgeGroup لسنة 1996 وعمره ما هيبقى فيه. لو الاشتقاق
    // اتنفّذ كان هيرمي "No age group is configured for birth year 1996".
    expect(await AgeGroup.findOne({ birthYear: 1996 })).toBeNull();
    const res = await createAs(scout.token, { dateOfBirth: dobIn(1996) });
    expect(res.status).toBe(201);
  });

  it('an adult player still appears in the proScout list and counts', async () => {
    await createAs(scout.token, { dateOfBirth: dobIn(1996) });

    const list = await request(app).get('/api/v1/players').set(...auth(scout.token));
    expect(list.body.count).toBe(1);

    // ageGroup فاضية → مش في counts، لكن في total. السلوك ده موجود أصلاً في
    // getCountsByAgeGroup ومش محتاج أي تغيير.
    const counts = await request(app).get('/api/v1/players/counts').set(...auth(scout.token));
    expect(counts.body.data.total).toBe(1);
    expect(Object.keys(counts.body.data.counts)).toEqual([]);
  });

  it('an adult player can be edited without tripping the age-group derivation', async () => {
    const created = await createAs(scout.token, { dateOfBirth: dobIn(1996) });

    const res = await request(app)
      .patch(`/api/v1/players/${created.body.data.document._id}`)
      .set(...auth(scout.token))
      .send({ dateOfBirth: dobIn(1998) });

    expect(res.status).toBe(200);
    const saved = await Player.findById(created.body.data.document._id);
    expect(saved.ageGroup).toBeFalsy();
  });

  it('a client cannot set isProfessional on create', async () => {
    const res = await createAs(coach.token, { isProfessional: true });
    expect(res.status).toBe(400);
  });

  it('a coach cannot flip an existing player to professional via update', async () => {
    // من غير القفل ده الكوتش كان يقدر يرفع قيد 2007→2019 عن لاعبه ويفضّي فئته.
    const player = await createPlayerDoc({ coach: coach.user._id });
    const res = await request(app)
      .patch(`/api/v1/players/${player._id}`)
      .set(...auth(coach.token))
      .send({ isProfessional: true });

    expect(res.status).toBe(400);
  });
});

describe('Stage 4b — the youth range is untouched for coach and admin (Principle III)', () => {
  const dobIn = (year) => `${year}-05-05`;

  it('a coach still cannot register a 1996 player', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: premierTeam._id.toString(), dateOfBirth: dobIn(1996) }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('2007');
  });

  it('a coach still cannot register a 2006 player — the floor stays 2007 for youth', async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: premierTeam._id.toString(), dateOfBirth: dobIn(2006) }));

    expect(res.status).toBe(400);
  });

  it("a coach's player still gets an ageGroup derived from its birth year", async () => {
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: premierTeam._id.toString(), dateOfBirth: dobIn(2012) }));

    expect(res.status).toBe(201);
    const saved = await Player.findById(res.body.data.document._id);
    expect(saved.isProfessional).toBe(false);
    expect(saved.ageGroup).toBeTruthy();

    const group = await AgeGroup.findById(saved.ageGroup);
    expect(group.birthYear).toBe(2012);
  });

  it("a coach's player still fails when no AgeGroup exists for its birth year", async () => {
    // seedAgeGroups() بيزرع 2009→2019 بس، فـ2008 داخل المدى المسموح لكن مفيش
    // فئة ليه — السلوك ده قائم ولازم يفضل كما هو.
    const res = await request(app)
      .post('/api/v1/players')
      .set(...auth(coach.token))
      .send(playerPayload({ team: premierTeam._id.toString(), dateOfBirth: dobIn(2008) }));

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('No age group is configured');
  });
});
