// الترتيب الافتراضي للقوايم — انحدار على فخ `req.query` في Express 5.
//
// الخلفية: `req.query` في Express 5 عبارة عن **getter بيعيد الـparse في كل قراءة**
// من غير أي memoization (`req.query === req.query` بترجع false). يعني الشكل
// `if (!req.query.sort) req.query.sort = "..."` بيكتب على أوبجكت مؤقت وبيضيع قبل
// ما ApiFeature يقرا الـquery، والاستعلام بيتنفّذ **بلا أي ترتيب**.
//
// ومع skip/limit ده مش عيب عرض: MongoDB مابتضمنش أي ترتيب لاستعلام بلا sort،
// فالمستند الواحد يقدر يظهر في صفحتين وواحد تاني يختفي خالص — فقدان بيانات صامت.
//
// التستات دي بتقفل تلات حاجات لكل endpoint:
//   1) الترتيب الافتراضي بيتطبّق فعلاً لما العميل مايبعتش ?sort
//   2) `_id` مقبول في وايت ليست الترتيب — ApiFeature.sort() بتسقط المرفوض
//      **بصمت**، فمن غير الفحص ده فاصل التعادل بيتشال والإصلاح يبان شغّال وهو
//      مش عامل حاجة
//   3) الترقيم مستقر مع تعادل متعمّد: مفيش _id بيتكرر بين الصفحات، واتحاد
//      الصفحات = المجموعة الكاملة

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

import app from '../app.js';
import SeasonMatch from '../models/seasonMatchModel.js';
import CoachEvaluation from '../models/coachEvaluationModel.js';
import ObserverEvaluation from '../models/observerEvaluationModel.js';
import {
  seedAgeGroups,
  createAdmin,
  createCoach,
  createObserver,
  createTeam,
  coachEvaluationPayload,
  observerEvaluationPayload,
} from './helpers/factory.js';
import AgeGroup from '../models/ageGroupModel.js';

// سنة في الماضي عن قصد: قفل المراجعة العمياء (filterBlindReviewList) بيتطبّق على
// **الشهر الحالي** بس، فأي شهر قديم بيخلي التستات دي تقيس الترتيب لوحده من غير
// ما تتشابك مع قفل مالوش علاقة بالموضوع.
const PAST_YEAR = 2024;

const idsOf = (res) => res.body.data.documents.map((d) => d._id);

// ترتيب تنازلي صارم على ObjectId — الـObjectId بيبدأ بـtimestamp بالثواني، لكن
// المقارنة النصية على الـhex بتفضل صحيحة للمستندات اللي اتعملت بالتتابع في نفس
// البروسيس (counter تصاعدي جوه نفس الثانية).
const isStrictlyDescending = (ids) => ids.every((id, i) => i === 0 || ids[i - 1] > id);
const isStrictlyAscending = (ids) => ids.every((id, i) => i === 0 || ids[i - 1] < id);

describe('الترتيب الافتراضي للقوايم (Express 5 — req.query مينفعش يتعدّل)', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/seasonMatches — الافتراضي "matchDate,_id"
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/seasonMatches', () => {
    let token;
    let ageGroup;
    let teamIds;

    // بيعمل n مباريات بنفس ageGroup/season، وبتواريخ من المصفوفة المبعوتة.
    const seedMatches = async (dates, adminId) => {
      const created = [];
      for (const d of dates) {
        created.push(
          await SeasonMatch.create({
            ageGroup: ageGroup._id,
            season: '2026/2027',
            league: 'premier',
            matchDate: d,
            homeTeam: teamIds.home,
            awayTeam: teamIds.away,
            createdBy: adminId,
          })
        );
      }
      return created;
    };

    beforeEach(async () => {
      await seedAgeGroups();
      const admin = await createAdmin();
      token = admin.token;
      ageGroup = await AgeGroup.findOne({ birthYear: 2012 });
      const home = await createTeam(ageGroup._id);
      const away = await createTeam(ageGroup._id);
      teamIds = { home: home._id, away: away._id };
      // نخزّن الأدمن عشان seedMatches تستخدمه
      teamIds.adminId = admin.user._id;
    });

    it('من غير ?sort بيرجّع تصاعدي بـ matchDate', async () => {
      // اتعملوا **بترتيب عكسي** عن المطلوب عن قصد: لو الترتيب مش بيتطبّق،
      // الرد بيرجع بترتيب الإدخال وبيفشل.
      await seedMatches(
        [
          new Date(Date.UTC(2026, 5, 20)),
          new Date(Date.UTC(2026, 5, 5)),
          new Date(Date.UTC(2026, 5, 12)),
        ],
        teamIds.adminId
      );

      const res = await request(app)
        .get('/api/v1/seasonMatches')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const dates = res.body.data.documents.map((m) => new Date(m.matchDate).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => a - b));
      expect(new Date(res.body.data.documents[0].matchDate).getUTCDate()).toBe(5);
    });

    it('`_id` مش قابل للطلب من العميل — بيتشال، والفاصل الداخلي بيتطبّق تصاعدي', async () => {
      // العقد الجديد: `_id` **مش** في أي وايت ليست — هو تفصيل داخلي في
      // ApiFeature.sort() مش جزء من سطح الـAPI. فـ?sort=-_id بيتشال زي أي حقل
      // مرفوض، ومفيش مفتاح باقي، فبيقع على الفاصل تصاعدي.
      // لو `_id` رجع للوايت ليست، الرد هيبقى تنازلي والتست ده بيفشل.
      await seedMatches(
        [
          new Date(Date.UTC(2026, 5, 1)),
          new Date(Date.UTC(2026, 5, 2)),
          new Date(Date.UTC(2026, 5, 3)),
        ],
        teamIds.adminId
      );

      const res = await request(app)
        .get('/api/v1/seasonMatches?sort=-_id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(3);
      expect(isStrictlyAscending(idsOf(res))).toBe(true);
    });

    it('الترقيم مستقر مع تعادل كامل في matchDate', async () => {
      // ست مباريات بـ**نفس التاريخ بالظبط** — matchDate لوحده مابيرتّبش أي حاجة
      // بينهم، ففاصل التعادل (_id) هو اللي بيخلي الترقيم مستقر.
      const sameDate = new Date(Date.UTC(2026, 5, 15));
      await seedMatches(Array(6).fill(sameDate), teamIds.adminId);

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/seasonMatches?limit=2&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/seasonMatches?limit=2&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/seasonMatches?limit=2&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];

      expect(paged).toHaveLength(6);
      expect(new Set(paged).size).toBe(6);          // مفيش تكرار بين الصفحات
      expect(isStrictlyAscending(paged)).toBe(true); // التعادل متكسّر تصاعدي بـ_id

      const all = await request(app)
        .get('/api/v1/seasonMatches?limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect([...paged].sort()).toEqual([...idsOf(all)].sort()); // الاتحاد = المجموعة الكاملة
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/coachEvaluations — الافتراضي "-year,-month,-_id"
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/coachEvaluations', () => {
    let token;
    let evaluatorId;

    // الفرادة على (coach, evaluator, year, month)، فالتعادل المتعمّد بيتعمل
    // بـ**كوتشات مختلفين** في نفس الشهر — نفس المقيّم، نفس (year, month).
    const seedEvaluations = async (specs) => {
      for (const { year, month } of specs) {
        const { user: coach } = await createCoach();
        await CoachEvaluation.create({
          ...coachEvaluationPayload({ year, month }),
          coach: coach._id,
          evaluator: evaluatorId,
          status: 'published',
        });
      }
    };

    beforeEach(async () => {
      await seedAgeGroups();
      const admin = await createAdmin();
      token = admin.token;
      evaluatorId = admin.user._id;
    });

    it('من غير ?sort بيرجّع تنازلي بـ (year, month)', async () => {
      await seedEvaluations([
        { year: PAST_YEAR, month: 3 },
        { year: PAST_YEAR + 1, month: 1 },
        { year: PAST_YEAR, month: 11 },
      ]);

      const res = await request(app)
        .get('/api/v1/coachEvaluations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const keys = res.body.data.documents.map((d) => d.year * 100 + d.month);
      expect(keys).toEqual([...keys].sort((a, b) => b - a));
      expect(keys[0]).toBe((PAST_YEAR + 1) * 100 + 1);
    });

    it('`_id` مش قابل للطلب من العميل — بيتشال، والفاصل الداخلي بيتطبّق تصاعدي', async () => {
      await seedEvaluations([
        { year: PAST_YEAR, month: 1 },
        { year: PAST_YEAR, month: 2 },
        { year: PAST_YEAR, month: 3 },
      ]);

      const res = await request(app)
        .get('/api/v1/coachEvaluations?sort=-_id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(3);
      expect(isStrictlyAscending(idsOf(res))).toBe(true);
    });

    it('ترتيب العميل الجزئي (?sort=-year) بياخد فاصل تعادل تلقائي', async () => {
      // ست تقييمات في **نفس السنة ونفس الشهر**: ?sort=-year بيتعادل على كلهم.
      // ده المسار اللي الفرونت بيستخدمه فعلاً (ترتيب صريح)، واللي إصلاح
      // الافتراضي لوحده ماكانش بيغطّيه.
      await seedEvaluations(Array.from({ length: 6 }, () => ({ year: PAST_YEAR, month: 4 })));

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/coachEvaluations?sort=-year&limit=2&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/coachEvaluations?sort=-year&limit=2&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/coachEvaluations?sort=-year&limit=2&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];

      expect(paged).toHaveLength(6);
      expect(new Set(paged).size).toBe(6);
      // آخر مفتاح باقي تنازلي (-year) فالفاصل بياخد نفس الاتجاه
      expect(isStrictlyDescending(paged)).toBe(true);

      const all = await request(app)
        .get('/api/v1/coachEvaluations?sort=-year&limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect([...paged].sort()).toEqual([...idsOf(all)].sort());
    });

    it('الترقيم مستقر مع تعادل كامل في (year, month)', async () => {
      // ستة تقييمات في **نفس السنة ونفس الشهر** — أسوأ حالة تعادل في المشروع:
      // "-year,-month" لوحده بيسيبهم بترتيب عشوائي تماماً.
      await seedEvaluations(Array.from({ length: 6 }, () => ({ year: PAST_YEAR, month: 7 })));

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/coachEvaluations?limit=2&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/coachEvaluations?limit=2&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/coachEvaluations?limit=2&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];

      expect(paged).toHaveLength(6);
      expect(new Set(paged).size).toBe(6);
      expect(isStrictlyDescending(paged)).toBe(true); // "-_id"

      const all = await request(app)
        .get('/api/v1/coachEvaluations?limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect([...paged].sort()).toEqual([...idsOf(all)].sort());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/observerEvaluations — الافتراضي "-year,-month,-_id"
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/observerEvaluations', () => {
    let token;
    let evaluatorId;

    const seedEvaluations = async (specs) => {
      for (const { year, month } of specs) {
        const { user: observer } = await createObserver();
        await ObserverEvaluation.create({
          ...observerEvaluationPayload({ year, month }),
          observer: observer._id,
          evaluator: evaluatorId,
          status: 'published',
        });
      }
    };

    beforeEach(async () => {
      await seedAgeGroups();
      const admin = await createAdmin();
      token = admin.token;
      evaluatorId = admin.user._id;
    });

    it('من غير ?sort بيرجّع تنازلي بـ (year, month)', async () => {
      await seedEvaluations([
        { year: PAST_YEAR, month: 3 },
        { year: PAST_YEAR + 1, month: 1 },
        { year: PAST_YEAR, month: 11 },
      ]);

      const res = await request(app)
        .get('/api/v1/observerEvaluations')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const keys = res.body.data.documents.map((d) => d.year * 100 + d.month);
      expect(keys).toEqual([...keys].sort((a, b) => b - a));
      expect(keys[0]).toBe((PAST_YEAR + 1) * 100 + 1);
    });

    it('`_id` مش قابل للطلب من العميل — بيتشال، والفاصل الداخلي بيتطبّق تصاعدي', async () => {
      await seedEvaluations([
        { year: PAST_YEAR, month: 1 },
        { year: PAST_YEAR, month: 2 },
        { year: PAST_YEAR, month: 3 },
      ]);

      const res = await request(app)
        .get('/api/v1/observerEvaluations?sort=-_id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents).toHaveLength(3);
      expect(isStrictlyAscending(idsOf(res))).toBe(true);
    });

    it('ترتيب العميل الجزئي (?sort=-year) بياخد فاصل تعادل تلقائي', async () => {
      await seedEvaluations(Array.from({ length: 6 }, () => ({ year: PAST_YEAR, month: 4 })));

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/observerEvaluations?sort=-year&limit=2&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/observerEvaluations?sort=-year&limit=2&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/observerEvaluations?sort=-year&limit=2&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];

      expect(paged).toHaveLength(6);
      expect(new Set(paged).size).toBe(6);
      expect(isStrictlyDescending(paged)).toBe(true);

      const all = await request(app)
        .get('/api/v1/observerEvaluations?sort=-year&limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect([...paged].sort()).toEqual([...idsOf(all)].sort());
    });

    it('الترقيم مستقر مع تعادل كامل في (year, month)', async () => {
      await seedEvaluations(Array.from({ length: 6 }, () => ({ year: PAST_YEAR, month: 7 })));

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/observerEvaluations?limit=2&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/observerEvaluations?limit=2&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/observerEvaluations?limit=2&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];

      expect(paged).toHaveLength(6);
      expect(new Set(paged).size).toBe(6);
      expect(isStrictlyDescending(paged)).toBe(true);

      const all = await request(app)
        .get('/api/v1/observerEvaluations?limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect([...paged].sort()).toEqual([...idsOf(all)].sort());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GET /api/v1/ages — الافتراضي "birthYear" (بلا فاصل تعادل، عن قصد)
  // ───────────────────────────────────────────────────────────────────────────
  describe('GET /api/v1/ages', () => {
    it('من غير ?sort بيرجّع تصاعدي بـ birthYear', async () => {
      // الفئات بتتعمل بترتيب تصاعدي في seedAgeGroups، فالإدخال لوحده مابيميّزش.
      // بندخّل فئة سنتها أصغر **بعد** الباقي: لو الترتيب مش بيتطبّق بتفضل آخر
      // عنصر في الرد بدل ما تبقى أول واحد.
      await seedAgeGroups();
      await AgeGroup.create({ name: '2007', birthYear: 2007 });

      const { token } = await createAdmin();
      const res = await request(app)
        .get('/api/v1/ages')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const years = res.body.data.documents.map((d) => d.birthYear);
      expect(years).toEqual([...years].sort((a, b) => a - b));
      expect(years[0]).toBe(2007);
    });

    it('?sort=name بيدّي ترتيب كلّي وترقيم مستقر', async () => {
      // ⚠️ ملاحظة أمانة: مايقدرش يتعمل هنا تعادل **كامل** زي باقي الكولكشنز —
      // name معلَن `unique: true` في ageGroupModel زي birthYear بالظبط، فمفيش
      // مستندين يتعادلوا فيه. اللي بيتأكد هنا هو إن الترتيب كلّي ومستقر عبر
      // الصفحات؛ إثبات الفاصل نفسه على مسار مافيهوش مفتاح باقي موجود في
      // التست اللي بعده (?sort=bogusField).
      await seedAgeGroups();
      const { token } = await createAdmin();

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/ages?sort=name&limit=4&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/ages?sort=name&limit=4&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/ages?sort=name&limit=4&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];
      expect(paged).toHaveLength(11);              // seedAgeGroups بيعمل 11
      expect(new Set(paged).size).toBe(11);        // مفيش تكرار بين الصفحات

      const all = await request(app)
        .get('/api/v1/ages?sort=name&limit=100')
        .set('Authorization', `Bearer ${token}`);
      expect(paged).toEqual(idsOf(all));           // نفس الترتيب بالظبط، مش بس نفس المجموعة
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // الاحتياطي لما مفيش مفتاح ترتيب باقي بعد الوايت ليست
  // ───────────────────────────────────────────────────────────────────────────
  describe('الاحتياطي: مفيش مفتاح باقي بعد الوايت ليست', () => {
    it('?sort=bogusField بيدّي ترتيب حتمي (_id تصاعدي) مش sort فاضي', async () => {
      // الحقل المرفوض بيتشال، ومايتبقاش أي مفتاح — الحالة دي كانت بتخرج بلا أي
      // ترتيب خالص (القديم: `if (fields.length)`)، وهي بالظبط اللي بتخلي الترقيم
      // غير مستقر. دلوقتي بتقع على الفاصل لوحده.
      await seedAgeGroups();
      const { token } = await createAdmin();

      const res = await request(app)
        .get('/api/v1/ages?sort=bogusField')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.documents.length).toBeGreaterThan(1);
      expect(isStrictlyAscending(idsOf(res))).toBe(true);
    });

    it('الترقيم يفضل مستقر حتى مع حقل ترتيب مرفوض', async () => {
      await seedAgeGroups();
      const { token } = await createAdmin();

      const [p1, p2, p3] = await Promise.all([
        request(app).get('/api/v1/ages?sort=bogusField&limit=4&page=1').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/ages?sort=bogusField&limit=4&page=2').set('Authorization', `Bearer ${token}`),
        request(app).get('/api/v1/ages?sort=bogusField&limit=4&page=3').set('Authorization', `Bearer ${token}`),
      ]);

      const paged = [...idsOf(p1), ...idsOf(p2), ...idsOf(p3)];
      expect(paged).toHaveLength(11);
      expect(new Set(paged).size).toBe(11);
      expect(isStrictlyAscending(paged)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // حارس على الشكل اللي سبّب الباج — عشان محدش يرجّعه تاني
  // ───────────────────────────────────────────────────────────────────────────
  describe('الشكل اللي سبّب الباج', () => {
    it('`req.query` بيتعاد بناؤه في كل قراءة، فالكتابة عليه بتضيع', async () => {
      const probe = await import('express');
      const express = probe.default;
      const probeApp = express();

      probeApp.get('/probe', (req, res) => {
        // ده بالظبط الشكل اللي كان في الكونترولرات التلاتة
        if (!req.query.sort) req.query.sort = 'matchDate';
        res.json({
          sortAfterWrite: req.query.sort ?? null,
          sameObjectAcrossReads: req.query === req.query,
        });
      });

      const res = await request(probeApp).get('/probe?a=1');

      // لو أي من التوقعين اتغير، يبقى Express غيّر سلوكه والتعليقات في
      // الكونترولرات محتاجة مراجعة — مش إن الإصلاح بقى مش لازم.
      expect(res.body.sameObjectAcrossReads).toBe(false);
      expect(res.body.sortAfterWrite).toBeNull();
    });
  });
});
