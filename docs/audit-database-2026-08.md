# مراجعة شاملة لطبقة الداتابيز — Talent Radar

**التاريخ:** 2026-08-25
**النطاق:** طبقة MongoDB/Mongoose بالكامل — 12 موديل، 61 index، سكوبات القراءة في الكونترولرز والكرونز، وسكريبتات الميجريشن
**الفرع:** `fix-critical-audit-findings`
**طبيعة المستند:** مراجعة فقط — لم يُعدَّل أي سطر من كود المشروع، ولم تُنفَّذ أي ميجريشن على أي داتابيز فيها بيانات حقيقية.

> ### حالة التنفيذ — تحديث 2026-08-25
>
> البنود الخمسة الأولى **اتصلحت** في فرع `fix-database-audit-findings`، وكل بند معاه تغطية انحدارية في [`tests/databaseAuditFixes.test.js`](../Backend/tests/databaseAuditFixes.test.js) (20 تست، اتحقق إن **9 منهم بيفشلوا على الكود القديم**).
>
> | البند | الحالة | التغيير |
> |---|---|---|
> | **I1** | ✅ اتصلح | `{createdBy: 1, createdAt: -1}` بدل `{team: 1, createdBy: 1}` الميت |
> | **I2** | ✅ اتصلح | `ApiFeature.sort(allowedSortFields)` + وايت ليست في كل مستدعي |
> | **D1** | ✅ اتصلح | الفرادة بقت `{player, coach, seasonMatch}` — **قرار مالك: خيار A** |
> | **M1** | ✅ اتصلح | `normalizeBooleanFalse` → `$ne: true` + [`backfillIsProfessional.js`](../Backend/scripts/backfillIsProfessional.js) |
> | **I3** | ✅ اتصلح | `reviewStatus_1` و`player_1_type_1` اتشالوا |
> | **توصية 6** | ✅ اتعملت | `proScout` اتزرع في `seedLoadTest.js` واتغطّى بـ11 شكل استعلام في `explainQueries.js` |
>
> **قرار المالك على D1 (خيار A):** الفرادة على مرجع المباراة بس. التقارير اللي مالهاش `seasonMatch` — الودّي، التدريب، والرسمي على لاعب بلا فريق مسجّل — **بتفضل بلا قيد فرادة بقرار صريح**، لأن السيرفر مالوش مفهوم لهوية المباراة فيها وأي مفتاح نختاره بيبقى من العميل وقابل للتخطّي. الأثر المقبول: عدّاد `reportsCount` في التقييم الشهري لسه قابل للتضخيم من المسارات دي.
>
> **قرار المالك على المكررات:** [`findDuplicateReports.js`](../Backend/scripts/findDuplicateReports.js) بيبلّغ ويقف — **مفيهوش مسار كتابة خالص**. لازم يتنفّذ ويتراجع قبل `npm run sync-indexes -- --apply`.
>
> **الميجريشن لسه ماتنفّذتش على أي بيانات حقيقية** — اتفحصت على `mongodb-memory-server` معزولة بس (7 خطوات: dry-run، apply، idempotency، rollback، والكشف عن المكررات). التنفيذ على الإنتاج مستني موافقة صريحة.
>
> #### التحقق بعد الإصلاح — `npm run explain` على نفس الداتاسِت (25,000 لاعب، منهم 1,924 لـproScout)
>
> | الاستعلام | قبل | بعد |
> |---|---|---|
> | `proScout` قايمة اللاعبين | `createdAt_1` — مشي على **25,040** مفتاح لـ50 | `createdBy_1_createdAt_-1` — **فحص 50 لـ50 (نسبة 1)** |
> | `proScout` `countDocuments` | 🔴 COLLSCAN **25,800** | 🟢 IXSCAN — **فحص 385 لـ385** |
> | `proScout` `$facet` الداشبورد | 🔴 COLLSCAN **25,800** | 🟢 IXSCAN — **فحص 385** |
> | `proScout` `counts` بالفئة | 🔴 COLLSCAN **25,800** | 🟢 IXSCAN — **فحص 385** |
>
> الـharness كمان بقى بيغطي الرول ده بـ**11 شكل استعلام** بعد ما كان صفر، والـ`unique index` الجديد اتبنى نظيف على 75,000 تقرير مزروع.
>
> **بندان اتكشفوا لأول مرة** بفضل التغطية الجديدة، وهما **مش** ضمن الخمسة ولسه مفتوحين:
> - `proScout • prefix search inside scope` — نسبة **16×** (فحص 385 لـ24): `createdBy_1_createdAt_-1` مابيغطّيش `searchTokens`. المعادل بالظبط لـ`coach_1_searchTokens_1` الموجود لمسار الكوتش.
> - `proScout • players + status filter` — نسبة **6×**. نفس السبب.
>
> البنود الباقية (S1، I4، M2، M3، P1، I5…) **لسه مفتوحة** وزي ما هي موصوفة تحت. لاحظ إن `I4` و`I5` لسه ظاهرين في مخرجات `explain` بعد الإصلاح (نسبة 217× على آخر التقارير، وCOLLSCAN على 78 فريق) — ده متوقع، هما خارج نطاق الخمسة عن قصد.

**كيف اتقاست الأرقام:** كل رقم هنا متقاس فعليًا. اتبنى harness مؤقت (اتمسح بعد القياس) بيشغّل `mongodb-memory-server` كـ**replica set** معزول تمامًا، واتزرع بـ`scripts/seedLoadTest.js` نفسه على **25,000 لاعب / 75,000 تقرير / 50,000 ميديا / 8,000 مباراة**، وبعدين `scripts/syncAllIndexes.js --apply` عشان الفهارس تبقى مطابقة للمخطط بالظبط. الأحكام مبنية على `.explain("executionStats")` — نوع الـscan و`totalDocsExamined/nReturned` — ومعاها قياسات زمن حائط حيث الزمن هو الدليل المقصود (تكلفة الكتابة، تكلفة الـpopulate).

> **الوجهة:** كل شيء اتنفّذ على `mongodb-memory-server` محلي. **الـAtlas cluster الحي مالمساش خالص** — لا قراءة ولا كتابة ولا ميجريشن. سكريبتات المشروع نفسها (`seedGuard.js`) بترفض الاشتغال من غير `SEED_TARGET_URI` صريح، والقيمة اللي اتبعتت كانت دايمًا الـURI المحلي بتاع الـmemory server. الأرقام المطلقة أقل من أي نشر حقيقي (Mongo في الرام، بلا شبكة) — القيمة في **شكل النمو** وفي **النِّسَب**.

> **ملاحظة على البيانات المزروعة:** `seedLoadTest.js` بيكتب بالـdriver مباشرة (`Model.collection.insertMany`)، فبيتخطّى الـhooks. ده مقصود في السكريبت، لكن معناه إن أي "عدم اتساق" في الكلاستر ده هو صناعة السكريبت مش انعكاس للبرودكشن. فرّقت بين الاتنين بوضوح في قسم الـMigrations، واستخدمت الظاهرة دي كدليل على نقطة منفصلة (§M3).

---

## Executive Summary

**الحالة العامة: التصميم ممتاز، والصيانة اتأخرت خلف الكود.**

طبقة الداتابيز دي مش شغل هاوي. الفهارس متعلَّق عليها **بأسباب مقيسة** (`playedModel.js:255-261` بيقتبس نتايج explain حرفيًا)، والـ`partialFilterExpression` على `type_1_updatedAt_1` قرار متقن — 4 KB بيخدم كرونين كانوا COLLSCAN. الفرادة على `{player, coach, matchDate}` و`{coach, evaluator, year, month}` متعمّلة `partial` عشان الحذف الناعم ماينتجش تصادمات، والسبب مكتوب في التعليق. **32 من 38 استعلام في الـharness الرسمي بتاع المشروع راجعين COVERED** على 25,000 لاعب. ده فريق بيقيس مش بيتخيّل.

المشكلة إن **المرحلة 11 غيّرت سكوب الـproScout ونسيت الفهرس ورا**. النطاق بقى `{ createdBy }` لوحده، والـindex الوحيد اللي بيذكر `createdBy` هو `{team: 1, createdBy: 1}` — و`createdBy` مش الـprefix فيه، فمايقدرش يخدم الشكل الجديد. النتيجة: **كل** استعلام proScout بيمرّ على تجميع بيعمل COLLSCAN على الكولكشن كله.

الباقي نفس النمط: حراسة ناقصة على حدود اتحرّكت. `sort()` هي الطريقة الوحيدة في `ApiFeature` اللي مالهاش وايت ليست وسط تلاتة. الفرادة على التقارير بتتعطّل بصمت لنوعين من التلاتة. وفيه فهارس اتبنت لقُرّاء اتشالوا بعدين وفضلت بتتكتب.

### أخطر 5 بنود — لازم تتقفل قبل أي deploy

| # | البند | الخطورة | الملف |
|---|---|---|---|
| **I1** | سكوب `proScout` (`{createdBy}`) **بلا أي index** — COLLSCAN 25,800 مستند على كل داشبورد/عدّاد/قايمة | Critical | [scope.js:94](../Backend/services/scope.js#L94) · [playedModel.js:286](../Backend/models/playedModel.js#L286) |
| **I2** | `?sort=<أي حقل>` بلا وايت ليست → COLLSCAN + blocking sort على 75,400 تقرير | High | [apiFeatures.js:112](../Backend/utils/apiFeatures.js#L112) |
| **D1** | فرادة "تقرير واحد لكل كاتب/لاعب/يوم" **مش بتتطبّق** على الودّي والتدريب — `matchDate` شايل الميلي ثانية | High | [scoutingReportController.js:32](../Backend/controllers/scoutingReportController.js#L32) |
| **M1** | `isProfessional` عمره ما اتعمله backfill → `?isProfessional=false` بيسقط **كل** لاعب قبل المرحلة 4b | High | [playedModel.js:142](../Backend/models/playedModel.js#L142) |
| **I3** | فهارس بلا أي قارئ: فهارس `PlayerMedia` = **133% من حجم الداتا**، وشيل اتنين منها = **+26% سرعة إدخال** | Medium-High | [playerMediaModel.js:101,115](../Backend/models/playerMediaModel.js#L101) |

I1 و I3 إصلاحهم **سطرين** في `playedModel.js` + سطرين حذف في `playerMediaModel.js`. I2 حوالي 10 أسطر. D1 و M1 محتاجين قرار تصميم صغير قبل الكود.

---

## Indexes

### الجرد الكامل (61 index على 12 كولكشن)

المقاسات من `$collStats` على الداتاسِت المزروع (25,000 لاعب / 50,000 ميديا):

**Player — 25,000 مستند، داتا 10,383 KB، فهارس 7,964 KB (77% من الداتا)**

| الحجم | الاسم | القارئ الفعلي | الحكم |
|---|---|---|---|
| 636 KB | `_id_` | — | ✅ |
| 736 KB | `coach_1_createdAt_-1` | قايمة الكوتش الافتراضية | ✅ مقيس exam=ret |
| 1,420 KB | `searchTokens_1` | بحث الأدمن | ✅ |
| **1,848 KB** | `coach_1_searchTokens_1` | بحث الكوتش | ✅ لكن **أغلى index في الكولكشن** — راجع أدناه |
| 612 KB | `coach_1_position_1` | `?position=` في سكوب الكوتش | ✅ |
| **636 KB** | `coach_1_preferredFoot_1` | لا يُختار من الـplanner عمليًا | 🟠 راجع I3 |
| 388 KB | `coach_1_ageGroup_1_status_1` | قايمة + عدّادات الكوتش | ✅ |
| 308 KB | `ageGroup_1_status_1` | مسار الأدمن | ✅ |
| 372 KB | `status_1_ageGroup_1` | داشبورد الأدمن byStatus | ✅ |
| 204 KB | `coach_1_status_1_ageGroup_1` | داشبورد الكوتش | ✅ |
| 184 KB | `observers_1_ageGroup_1` | سكوب الأوبزيرفر (multikey) | ✅ مقيس exam=ret |
| 288 KB | `createdAt_1` | كرون الملخص اليومي + ترتيب الأدمن | ✅ |
| 132 KB | `team_1` (sparse) | الربط العكسي `Team.players` | ✅ مقيس exam=ret |
| **200 KB** | `team_1_createdBy_1` | **صفر — الشكل اللي اتبنى له اتلغى** | 🔴 راجع I1 |

**PlayerMedia — 50,000 مستند، داتا 13,519 KB، فهارس 17,916 KB (133% من الداتا)**

| الحجم | الاسم | القارئ الفعلي | الحكم |
|---|---|---|---|
| 1,108 KB | `_id_` | — | ✅ |
| 3,060 KB | `player_1_createdAt_-1` | قايمة ميديا اللاعب | ✅ |
| **2,844 KB** | `player_1_type_1` | **صفر** — راجع I3 | 🔴 |
| 1,820 KB | `player_1_seasonMatch_1_type_1_status_1` | `readyCount` + الـin-flight | ✅ |
| 3,092 KB | `player_1_type_1_fileHash_1` (sparse) | كشف التكرار | ✅ |
| 1,008 KB | `bunnyVideoId_1` (sparse) | الويبهوك + reconcile | ✅ |
| 936 KB | `seasonMatch_1` (sparse) | الربط العكسي `SeasonMatch.media` | ✅ |
| 4 KB | `linkedVideo_1` (sparse) | `playerMediaController.js:283` | ✅ |
| 1,948 KB | `uploadedBy_1_createdAt_-1` | داشبورد الرافع + لقطة التقييم | ✅ |
| **904 KB** | `reviewStatus_1` (sparse) | **صفر** — راجع I3 | 🔴 |
| **4 KB** | `type_1_updatedAt_1` partial `{status:"processing"}` | كرونين | ✅ **أفضل index في المشروع** |
| 1,188 KB | `createdAt_1` | كرون الـretention | ✅ مقيس exam=ret على 35,037 |

باقي الكولكشنز (ScoutingReport 6، SeasonMatch 8، Team 3، AgeGroup 3، التقييمات 4+4، User 4، وباقيهم 2) كلها بحجم مهمل ومربوطة بقُرّاء حقيقيين، ما عدا اللي مذكور تحت.

---

### I1 — Critical: سكوب الـproScout بلا index، والـindex الموجود بيخدم شكل اتلغى

**الملفات:** [`services/scope.js:94`](../Backend/services/scope.js#L94) · [`models/playedModel.js:282-286`](../Backend/models/playedModel.js#L282)

المرحلة 2 عرّفت سكوب الـproScout على فرعين، والتاني منهم `{ team: null, createdBy: <id> }`. الـindex اتبنى للشكل ده بالظبط، والتعليق فوقه بيشرح ليه `team_1` الـsparse مايكفيش:

```js
// playedModel.js:282
// Stage 2 — الفرع التاني من سكوب proScout: { team: null, createdBy: <userId> }.
playerSchema.index({ team: 1, createdBy: 1 });
```

بعدين **المرحلة 11 ألغت الفرع ده بالكامل** (`specs/011-proscout-createdby-scope`) وخلّت النطاق `createdBy` لوحده:

```js
// services/scope.js:94
return wrap({ createdBy: req.user._id });   // → { $and: [{ createdBy }] }
```

`createdBy` **مش الـprefix** في `{team: 1, createdBy: 1}`، فالـindex ده مايقدرش يخدم الشكل الجديد أبدًا. ومفيش أي index تاني بيذكر `createdBy`.

**مُقاس** — proScout بيملك 400 لاعب من 25,800 (1.6%):

| الاستعلام | الحالة الحالية | مع `{createdBy:1, createdAt:-1}` |
|---|---|---|
| `countDocuments` بتاع كل صفحة قايمة ([playerController.js:333](../Backend/controllers/playerController.js#L333)) | 🔴 **COLLSCAN — فحص 25,800 لـ400** · p50 **14.4ms** | IXSCAN — فحص 400 · p50 **1.0ms** |
| `$facet` بتاع الداشبورد ([dashboardController.js:283](../Backend/controllers/dashboardController.js#L283)) | 🔴 **COLLSCAN — فحص 25,800** · p50 **21.5ms** | IXSCAN — فحص 400 · p50 **2.1ms** |
| `counts` بالفئة العمرية ([playerController.js:162](../Backend/controllers/playerController.js#L162)) | 🔴 **COLLSCAN — فحص 25,800** | IXSCAN — فحص 400 |
| القايمة نفسها `sort -createdAt` أول صفحة | IXSCAN عبر `createdAt_1` — فحص 159 | فحص **50** بالظبط |
| القايمة نفسها لو مستندات الكشاف **مش** الأحدث | IXSCAN عبر `createdAt_1` — فحص **25,040** لـ50 | فحص **50** بالظبط |

الصفّان الأخيران مهمين: القايمة نفسها **مش بتعمل COLLSCAN** لأن الـplanner بيقع على `createdAt_1` عشان الترتيب. بس ده بيخفي المشكلة مش بيحلّها — الـindex ده مالهوش أي علاقة بالفلتر، فهو بيمشي على الفهرس كله وبيرمي اللي مش بتاع الكشاف. لو مستندات الكشاف الأحدث، بيقف بدري (159). لو مش الأحدث — كشاف قديم، أو صفحة متأخرة، أو `sort` تصاعدي — **بيمشي على 25,040 مفتاح عشان يرجّع 50**.

الـ`$facet` والـ`counts` مالهمش المخرج ده أصلًا: الـ`$match` مالوش index يخدمه، فالـinput stage بيبقى `scan` صريح.

**التكلفة الحقيقية:** فتح صفحة اللاعبين لأي proScout = قراءة الكولكشن كله مرة (`countDocuments`). فتح داشبورده = قراءة تانية. `counts` = تالتة. والتلاتة بتكبر خطيًا مع كل لاعب بيتضاف للنظام كله، مش بلاعبين الكشاف.

**الحل:**

```js
// playedModel.js — بديل السطر 286
// Stage 11 — النطاق بقى { createdBy } لوحده (services/scope.js:94). createdBy
// لازم يبقى الـprefix، و createdAt: -1 بيخلي الترتيب الافتراضي للقايمة مغطّى
// من نفس الـindex بدل ما الـplanner يقع على createdAt_1 ويمشي على الفهرس كله.
playerSchema.index({ createdBy: 1, createdAt: -1 });
```

و**احذف** `{team: 1, createdBy: 1}` — 200 KB بتتكتب على كل إدخال لاعب لصفر قارئ منذ المرحلة 11.

> ⚠️ الـharness الرسمي بتاع المشروع (`scripts/explainQueries.js`) **مش بيغطي ولا شكل proScout واحد**، و`seedLoadTest.js` مابيزرعش أي مستخدم بالرول ده — عشان كده البند ده عدّى من مراجعة الباك إند. الإضافة دي (§التوصيات، بند 6) أهم من الإصلاح نفسه على المدى الطويل.

---

### I2 — High: `?sort=` بلا وايت ليست = COLLSCAN مضمون على أي كولكشن

**الملف:** [`utils/apiFeatures.js:112-119`](../Backend/utils/apiFeatures.js#L112)

`ApiFeature` فيها تلات نقاط بتاخد مدخل من العميل. اتنين منهم محروسين:

- `filter()` → `allowed: [...]` وايت ليست، والمفتاح المرفوض **بيتشال** مش بيتدمج ([apiFeatures.js:55](../Backend/utils/apiFeatures.js#L55))
- `searchPrefix()` → سقف طول + escape للـregex + حقل مطبّع واحد ([apiFeatures.js:150](../Backend/utils/apiFeatures.js#L150))
- `sort()` → **بيعدّي القيمة كما هي**

```js
// apiFeatures.js:112
sort(){
    if(this.queryParams.sort){
        const sortBy = this.queryParams.sort.split(',').join(" ");
        this.query = this.query.sort(sortBy)
    }
    return this;
}
```

**مُقاس** (limit=50 في كل الحالات):

| الطلب | scan | فُحص | زمن |
|---|---|---|---|
| `GET /players?sort=name` (أدمن، بلا فلتر) | 🔴 COLLSCAN | **25,800** | 19ms |
| `GET /players?sort=height` | 🔴 COLLSCAN | **25,800** | 20ms |
| `GET /players?sort=notes` | 🔴 COLLSCAN | **25,800** | 22ms |
| `GET /scouting?sort=overallRating` | 🔴 COLLSCAN | **75,400** | 52ms |
| `GET /media?sort=title` | 🔴 COLLSCAN | **50,000** | 34ms |
| `?sort=name` جوه سكوب كوتش | IXSCAN + SORT | 625 | 9ms |

الـblocking sort نفسه مش بيقع في حد الـ100MB (المحرك بيستخدم top-k مع الـlimit، والذاكرة المستهلكة اتقاست 25KB) — **التكلفة هي المسح**، مش الفرز.

**الخطر الفعلي:** أي مستخدم مسجّل دخول يقدر يجبر مسحًا كاملًا على أكبر كولكشن في النظام بـquery param واحد، ويكرّره بمعدل الـrate limiter. الأدمن أسوأ حالة (بلا سكوب)، لكن حتى الكوتش بيدفع فرز في الذاكرة على كل لاعبينه.

**الحل** — نفس نمط `allowed` الموجود أصلًا، ونفس سلوك "المرفوض بيتشال بصمت":

```js
sort(allowedSortFields = []){
    if (!this.queryParams.sort) return this;
    const allow = new Set(allowedSortFields);
    const fields = String(this.queryParams.sort)
        .split(',')
        .map((f) => f.trim())
        .filter((f) => allow.has(f.replace(/^-/, '')));
    if (fields.length) this.query = this.query.sort(fields.join(' '));
    return this;
}
```

والوايت ليست لكل مورد تبقى **الحقول المفهرسة بس**: `Player` → `createdAt, name?`، `ScoutingReport` → `matchDate, createdAt`، `SeasonMatch` → `matchDate`. (`name` يتحط بس لو اتقرر يتعمله index — من غير index هو نفس المشكلة باسم مسموح.)

---

### I3 — Medium-High: فهارس بلا قارئ، وتكلفتها مقيسة

الاتنين دول اتفحصوا بـgrep على `controllers/` و`services/` و`socket/` و`utils/` — **مفيش ولا استعلام بيفلتر عليهم**:

**`playerMediaModel.js:115` — `reviewStatus_1` (904 KB)**
```js
playerMediaSchema.index({ reviewStatus: 1 }, { sparse: true });  // "مراجعة الأدمن للميديا المعلقة"
```
`reviewStatus` بيتكتب في 3 أماكن وبيتقرا في صفر استعلامات. مراجعة الأدمن بتحصل من صفحة تفاصيل المباراة عن طريق `populate` على الـvirtual `media` (`seasonMatchController.js:90`)، اللي بيمشي على `seasonMatch_1`. مفيش قايمة "معلّق للمراجعة" في الفرونت.

**`playerMediaModel.js:101` — `player_1_type_1` (2,844 KB)**
```js
playerMediaSchema.index({ player: 1, type: 1 });   // "فلترة صور أو فيديوهات"
```
الفلترة دي مش موجودة: [`playerMediaController.js:166`](../Backend/controllers/playerMediaController.js#L166) بيعمل `new ApiFeature(...)` **من غير ما ينده `.filter()` خالص**، فـ`?type=` عمره ما بيتحوّل لشرط. والاستعلامات اللي فعلًا بتحط `type` (السطور 316/334/360 والكرونز) كلها بتحط `seasonMatch` و`status` معاها → بتتخدم من `player_1_seasonMatch_1_type_1_status_1` أو من `type_1_updatedAt_1`.

**`playedModel.js:265` — `coach_1_preferredFoot_1` (636 KB)**
`preferredFoot` مسموح في `PLAYER_FILTERS`، بس القايمة دايمًا مرتّبة `-createdAt`، والـplanner بيفضّل `coach_1_createdAt_-1` عشان يتجنّب الـblocking sort. الـindex بيتكتب ومابيتقراش عمليًا. (نفس المنطق ينطبق جزئيًا على `coach_1_position_1` — الفرق إن المركز أكتر انتقائية بكتير، فسيبه.)

**تكلفة الكتابة — مقيسة، 2000 إدخال دفعة واحدة، وسيط 6 جولات:**

| | مع كل الفهارس | بعد الشيل | الفرق |
|---|---|---|---|
| `Player` (شيل `coach_1_preferredFoot_1`) | 95ms / 21,141 مستند-ث | 85ms / 23,652 مستند-ث | **+10.6%** |
| `PlayerMedia` (شيل `reviewStatus_1` + `player_1_type_1`) | 60ms / 33,504 مستند-ث | 44ms / 45,393 مستند-ث | **+26.2%** |

وفهارس `PlayerMedia` دلوقتي **17,916 KB مقابل 13,519 KB داتا — 133%**. شيل الاتنين بيرجّعها لـ~104% ويوفّر 3.7 MB لكل 50,000 مستند ميديا.

`PlayerMedia` هي الكولكشن اللي **بيتكتب فيها أكتر حاجة** (كل رفع صورة/فيديو + كل تحديث حالة من الويبهوك + الـreconcile كل 5 دقايق)، فالـ26% دي على المسار الساخن مش على مسار نادر.

> **ملاحظة منهجية:** جرّبت `$indexStats` كدليل مستقل على الاستخدام، ورميته: `explain()` مابيسجّلش وصول للفهرس، فالأرقام كانت أصفار للكل ومالهاش معنى. الحكم فوق مبني على **grep ثابت على كل مسارات الاستعلام** + تتبّع الـplanner في `explain`. لو حابب دليل من الإنتاج، `$indexStats` على الـAtlas بعد أسبوع تشغيل هو المصدر الصح — بس ده استعلام على الكلاستر الحي فسبته للمالك.

---

### I4 — Medium: `{coach, matchDate}` ناقص على التقارير

**الملف:** [`dashboardController.js:334`](../Backend/controllers/dashboardController.js#L334)

`ScoutingReport` عندها `coach_1_createdAt_-1` و`player_1_matchDate_-1`، بس مفيش `{coach, matchDate}`. وقايمة "آخر التقارير" في داشبورد الـproScout بتفلتر بـ`coach` وترتّب بـ`matchDate`:

```js
ScoutingReport.find({ coach: req.user._id, player: { $in: scopedPlayerIds } })
    .sort({ matchDate: -1 }).limit(5)
```

**مُقاس** (كاتب عنده 400 تقرير):

| | scan | فُحص | مراحل |
|---|---|---|---|
| الحالي | IXSCAN `coach_1_createdAt_-1` | **400 لـ5 (80×)** | `SORT←FETCH←IXSCAN` |
| مع `{coach:1, matchDate:-1}` | IXSCAN | **5 لـ5** | `LIMIT←FETCH←IXSCAN` |

الـblocking `SORT` بيختفي بالكامل. التكلفة بتكبر خطيًا مع عدد تقارير الكاتب — كشاف نشيط سنتين بيبقى بيجيب آلاف المستندات عشان يعرض 5.

نفس الملاحظة بدرجة أخف على `?sort=` الافتراضي بتاع قايمة التقارير: `{player, coach}` مرتّب `-matchDate` بيتخدم من `player_1_matchDate_-1` كويس (فُحص 3 لـ2) — ده سليم، الفرق إن `player` prefix موجود هناك ومش موجود هنا.

---

### I5 — Low: `Team.league` بلا index

**الملف:** [`services/scope.js:63`](../Backend/services/scope.js#L63) · [`teamModel.js:40-49`](../Backend/models/teamModel.js#L40)

`Team` عندها `{name, ageGroup, league}` (unique partial) و`{ageGroup, league}`. `league` **مش prefix في أي منهم**، وسكوب الـproScout بيستعلم بـ`league` لوحده:

```js
Team.find({ league: PROFESSIONAL }).setOptions({ bypassFilter: true }).distinct("_id")
```

**مُقاس:** COLLSCAN. بس الكولكشن **78 مستند**، فالتكلفة الفعلية صفر عمليًا.

بيتحط هنا للتسجيل مش للإصلاح العاجل: `professionalTeamIds()` بتتنادى **مرة لكل طلب** (الكاش على `req` بس، وده مقصود وموثّق)، فلو عدد الفرق كبر لآلاف يبقى `teamSchema.index({ league: 1 })` سطر واحد. النهاردة سيبه.

### ✅ ما هو **صحيح** في طبقة الفهارس (لا تُضعِفه)

- **`type_1_updatedAt_1` بـ`partialFilterExpression: {status: "processing"}`** — 4 KB بيخدم كرونين كانوا COLLSCAN على 10,000 مستند. الحالة عابرة فالـindex بيفضل صغير مهما كبرت الكولكشن. ده أنضف قرار فهرسة في المشروع.
- **الفرادة الـpartial على `{player, coach, matchDate}` و`{coach, evaluator, year, month}`** — بتمنع تصادم الحذف الناعم من غير ما تفقد القاعدة الأصلية. السبب مكتوب بالكامل في التعليق ومختبَر.
- **`observers_1_ageGroup_1` (multikey)** — مقيس exam=ret على 284 مستند. سكوب الأوبزيرفر مغطّى بالكامل.
- **`createdAt_1` على `PlayerMedia`** — التعليق في [`playerMediaModel.js:138-141`](../Backend/models/playerMediaModel.js#L138) بيشرح إن الـkey تصاعدي فالإدخال append في أقصى يمين الـB-tree. الملاحظة دي صح وبتفسّر ليه الـindex ده رخيص بشكل غير معتاد.
- **`searchTokens` كحقل مشتق `select: false` + بحث بادئة case-sensitive** — الشرح في [`playedModel.js:146-165`](../Backend/models/playedModel.js#L146) دقيق: الـ`$regex` الـcase-insensitive فعلًا مابياخدش حدود btree. مقيس: COLLSCAN 271→20 بقى IXSCAN 20→20.

---

## Schema Design

### S1 — High: الأسرار محمية بـ`toJSON` بس، ومفيش `select: false` ولا حتة

**الملف:** [`models/userModel.js:19-68`](../Backend/models/userModel.js#L19)

`User` بيحمل `password` و`refreshToken` و`passwordResetCode` و`idCardFrontImg/BackImg` و`vaultFailedAttempts`. **ولا واحد منهم معلّم `select: false`.** الحماية الوحيدة هي الـ`toJSON` transform:

```js
// userModel.js:82
userSchema.set("toJSON", { transform: (doc, ret) => { delete ret.password; ... } });
```

**ليه ده هش:**

1. `toJSON` بيتشغّل بس لما مستند mongoose حقيقي يعدّي على `JSON.stringify`. أي `.lean()` أو `.toObject()` أو `$lookup` في aggregation **بيتخطّاه بالكامل** — ودي بالظبط الغلطة اللي المشروع مسكها قبل كده في مكان تاني وكتب عنها تعليق طويل ([playerController.js:194-202](../Backend/controllers/playerController.js#L194)).
2. فيه تلات `$lookup` على `users` في الكود ([scoutingReportController.js:160](../Backend/controllers/scoutingReportController.js#L160)، [dashboardController.js:116](../Backend/controllers/dashboardController.js#L116)، `dailySummary.js:36`). التلاتة **دلوقتي** بيعملوا `$project` بيسيب `name`/`role` بس، فمفيش تسريب قايم. لكن الأمان معتمد على إن الـ`$project` ده مايتوسّعش أبدًا — مش على المخطط.
3. **الدليل على إن النية موجودة:** [`authController.js:108`](../Backend/controllers/authController.js#L108) بيكتب `.select("+refreshToken +refreshTokenExpires")`. الـ`+` معناه "ضُم الحقل المستبعَد" — الكاتب كان **فاكر** إن الحقول دي `select: false`. هي مش كده، فالسطر ده no-op بيقرا كأنه حماية.

**الحل:**

```js
password:            { type: String, required: true, select: false },
refreshToken:        { type: String, select: false },
refreshTokenExpires: { type: Date,   select: false },
passwordResetCode:     { type: String,  select: false },
passwordResetExpires:  { type: Date,    select: false },
passwordResetVerified: { type: Boolean, select: false },
idCardFrontImg: { type: String, select: false },
idCardBackImg:  { type: String, select: false },
vaultFailedAttempts: { type: Number, default: 0,    select: false },
vaultLockedUntil:    { type: Date,   default: null, select: false },
```

الـ`toJSON` transform **يفضل زي ما هو** — دفاع في العمق، مش بديل.

⚠️ التغيير ده بيكسر المسارات اللي بتقرا الحقول دي دلوقتي وهي معتمدة على إنها راجعة تلقائيًا. اللي لازم يتعدّل معاه (مسحتهم بالكامل):
- `authController.js:79` (`login`) → `.select("+password")`
- `authController.js:311` (`verifyResetCode`) → `+passwordResetCode +passwordResetExpires`
- `authController.js:414` (`vaultPassword/verify`) → `+password +vaultFailedAttempts +vaultLockedUntil`
- `userController.js:63` و `:85` بيستخدموا `.select("idCardFrontImg ...")` صراحةً — الـselect الصريح بيتغلّب على `select:false` فمايحتاجوش تعديل
- `authController.js:108` الـ`+` الموجود أصلًا بيبقى **صحيح** بدل ما يكون زخرفة

بندٌ لازم يتصاحب: تست يثبت إن `User.find().lean()` مابيرجّعش الحقول دي.

---

### S2 — Medium: `Player` كبرت لـ18 حقل بتلات محاور ملكية متداخلة

`coach` (المالك) + `observers[]` (المعيَّنين) + `createdBy` (المنشئ) — تلاتة بيوصفوا "مين ليه علاقة باللاعب ده"، وكل واحد فيهم بيتقرا من رول مختلف في طبقة مختلفة. مفيش خطأ هنا، والتعليقات بتبرّر كل واحد بشكل مقنع (§9، Stage 2، Stage 11). بس ده المكان اللي **بالظبط** خرجت منه I1: حقل اتضاف لفرع سكوب، الفرع اتلغى، الحقل فضل، والـindex بتاعه فضل مربوط بالفرع الميت.

مافيش توصية بإعادة تشكيل — التوصية إن أي تعديل على `services/scope.js` مستقبلًا يبقى معاه سؤال إجباري: **"أنهي index بيخدم الشكل الجديد؟"** (راجع التوصية 6).

الحاجة التانية: `teamName` (نص حر) و`team` (ref) متبادلين الاستبعاد، والقيد **مفروض في الـvalidation بس** مش في المخطط ولا في الداتابيز. نفس النمط بيتكرر في `ScoutingReport` (`homeTeam`/`homeTeamName`, `awayTeam`/`awayTeamName`). أي كتابة من سكريبت أو migration بتتخطّى الـvalidation تقدر تحط الاتنين. الحل لو اتقرر: `pre('validate')` hook على مستوى المخطط بدل express-validator بس.

---

### S3 — Medium: أنواع الحقول — ملاحظتان حقيقيتان

**`SeasonMatch.season` نص حر (`"2025/2026"`)** — [`seasonMatchModel.js:9-13`](../Backend/models/seasonMatchModel.js#L9). مفيش `enum` ولا `match` regex، والحقل جزء من تلات فهارس ومن الفلترة. `"2025/26"` أو `"2025 / 2026"` بيعملوا موسم شبح بصمت. الحل: `match: /^\d{4}\/\d{4}$/` على المخطط.

**`Team.name` بـ`lowercase: true` و`Team.clubName` من غيرها** — [`teamModel.js:4-23`](../Backend/models/teamModel.js#L4). الفرادة على `{name, ageGroup, league}` فبتشتغل صح للاسم. `clubName` مش في أي index ومش مطبّع، فنفس النادي بيتكتب بصيَغ مختلفة عبر الفئات. أثره على العرض بس، مش على الفرادة.

**`Config.value` نوعه `Mixed`** — [`configModel.js:5`](../Backend/models/configModel.js#L5). مقبول لجدول key/value بمستهلك واحد (`dailySummaryLastSentAt`). بس `Mixed` معناه مفيش تحقق ولا تتبّع تعديل — لو الجدول ده اتوسّع لأكتر من مفتاح، خليه شكل مصرَّح.

---

### S4 — Low: `Team` و`AgeGroup` بلا `timestamps`

كل موديل تاني في المشروع عنده `{ timestamps: true }` ما عدا الاتنين دول. ده معناه إن "الفريق ده اتعمل إمتى / اتعدّل إمتى" مش موجود — والفرق **بتتعمل من الأدمن وبتتنسخ بسكريبت** (`cloneTeamsToAgeGroup.js`)، يعني بالظبط النوع اللي بيحتاج تتبّع. إضافة `timestamps` على الاتنين آمنة تمامًا (المستندات القديمة بتفضل بلا قيم، ومفيش استعلام بيعتمد عليها).

### ✅ ما هو **صحيح** في المخطط

- **`Player.searchTokens` بـ`select: false`** — بيانات مشتقة داخلية، مستبعدة على مستوى المخطط مش على مستوى كل راوت. ده بالظبط النمط اللي `User` محتاجاه في S1.
- **اشتقاق `ageGroup` في `pre('save')` و`pre('findOneAndUpdate')` الاتنين** — والتعليق في [`playedModel.js:294-311`](../Backend/models/playedModel.js#L294) بيوثّق باگ حقيقي اتمسك (`update.$set || update` مع `timestamps: true`). التصليح صح.
- **`VideoUploadCounter` ككولكشن مستقل** — الشرح في [`videoUploadCounterModel.js:3-12`](../Backend/models/videoUploadCounterModel.js#L3) دقيق: عدّ مستندات `status:"failed"` كان هيتصفّر مع الـretention والقفل يفك بصمت. الفصل صح.
- **بناء شكل التقييمات ديناميكيًا من ملف المعايير** — إضافة معيار = تعديل كونفيج واحد، والـ`overallRating` بيتحسب من نفس مصدر الحقيقة في الـsave والـupdate.

---

## Query Performance

### أبطأ الاستعلامات، مرتّبة بالتكلفة المقيسة

| # | الاستعلام | المصدر | scan | فُحص → رجع | الحكم |
|---|---|---|---|---|---|
| 1 | `?sort=overallRating` على التقارير | [apiFeatures.js:112](../Backend/utils/apiFeatures.js#L112) | 🔴 COLLSCAN | **75,400 → 50** | I2 |
| 2 | `?sort=title` على الميديا | نفسه | 🔴 COLLSCAN | **50,000 → 50** | I2 |
| 3 | `proScout` — `$facet` الداشبورد | [dashboardController.js:283](../Backend/controllers/dashboardController.js#L283) | 🔴 COLLSCAN | **25,800 → 400** | I1 |
| 4 | `proScout` — `countDocuments` القايمة | [playerController.js:333](../Backend/controllers/playerController.js#L333) | 🔴 COLLSCAN | **25,800 → 400** | I1 |
| 5 | `proScout` — `counts` بالفئة | [playerController.js:162](../Backend/controllers/playerController.js#L162) | 🔴 COLLSCAN | **25,800 → 1** | I1 |
| 6 | `?sort=name` على اللاعبين (أدمن) | نفسه | 🔴 COLLSCAN | **25,800 → 50** | I2 |
| 7 | داشبورد الأدمن `byStatus` | [dashboardController.js:98](../Backend/controllers/dashboardController.js#L98) | 🔴 COLLSCAN | 25,000 → 4 | ✅ مكاش، راجع تحت |
| 8 | `getAllCoachesStats` | [dashboardController.js:419](../Backend/controllers/dashboardController.js#L419) | 🔴 COLLSCAN | 25,000 → 40 | ✅ مكاش، راجع تحت |
| 9 | `proScout` — آخر 5 تقارير | [dashboardController.js:334](../Backend/controllers/dashboardController.js#L334) | 🟠 IXSCAN+SORT | **400 → 5 (80×)** | I4 |
| 10 | بحث `venue` بـregex على المباريات | [explainQueries.js:314] | 🟠 IXSCAN | 312 → 20 (15.6×) | شكل ميت — راجع تحت |

**البندان 7 و8 مش مشاكل.** التعليق في [`dashboardController.js:21-26`](../Backend/controllers/dashboardController.js#L21) صح تمامًا: `$group` على الكولكشن كله **لازم** يقرا كل مستند بحكم التعريف، ومفيش index بيغيّر ده. الحل المطبَّق (كاش TTL 45 ثانية بمفتاح عام، مع الشرح الصريح ليه ممنوع يتطبّق على داشبورد الكوتش) هو الحل الصح، والتحذير المكتوب عن الـmulti-instance في محله.

**البند 10** — الشكل ده مابقاش يتنفّذ (البحث في `venue` اتشال، `services.js:49`). لسه موجود في الـharness كمرجع تاريخي. مش بند.

---

### P1 — Medium-High: `SeasonMatch` بيعمل 4 populate على **كل** استعلام، والمستهلك عايز اتنين

**الملف:** [`seasonMatchModel.js:98-104`](../Backend/models/seasonMatchModel.js#L98)

```js
seasonMatchSchema.pre(/^find/, function () {
    if (this.getOptions().skipPopulate) return;
    this.populate({ path: "ageGroup", ... }).populate({ path: "homeTeam", ... })
        .populate({ path: "awayTeam", ... }).populate({ path: "attendees", ... });
});
```

**مُقاس** — جلب 50 مباراة، 30 قياس + 3 تسخين:

| | p50 | p95 |
|---|---|---|
| المسار الإنتاجي (4 populate) | **8.7ms** | 13.5ms |
| `skipPopulate: true` | **2.7ms** | 3.5ms |
| الفرق (populate بس) | 3.2× | — |
| بـ`homeTeam` + `awayTeam` بس | 5.3ms | 6.4ms |

يعني `ageGroup` + `attendees` لوحدهم = **3.4ms من 8.7** (39% من زمن الاستعلام)، وهما الحقلين اللي أغلب الشاشات مابتعرضهاش. الرقم ده في الرام بلا شبكة — على Atlas كل `populate` round-trip مستقل، فالفرق بيتضاعف مع الـRTT.

الملاحظة دي مسجّلة أصلًا في تقرير الباك إند (البند P3: "16 موضع بيعملوا opt-out = الافتراضي غلط") والقياس هنا بيحطّ رقم عليها. **نفس التوصية:** اقلب الـhook لـopt-in.

---

### P2 — Medium: الـpagination العميقة بتدفع تمن الـskip كامل

**مُقاس:** `GET /players?page=500` (skip 24,950، limit 50) → `nReturned` 50، `totalDocsExamined` 50، لكن **`totalKeysExamined` = 25,000**.

الـ`MAX_LIMIT = 200` موجود ومحروس ([apiFeatures.js:208](../Backend/utils/apiFeatures.js#L208))، لكن **رقم الصفحة نفسه بلا سقف**. الـFETCH محدود (50 مستند بس بيتقروا من الديسك)، فالتكلفة index-walk مش doc-fetch — أرخص بكتير من COLLSCAN بس لسه خطية في رقم الصفحة.

النهاردة ده **مش مشكلة عملية**: مفيش UI بيوصل لصفحة 500، وتقرير الباك إند قاس إن صفحة 40 = صفحة 1 في الزمن. بيتسجّل عشان لو ظهرت واجهة تصفّح عميق (أو سكريبت بيسحب بالصفحات)، الحل هو keyset pagination (`createdAt < lastSeen`) مش تكبير الحدود.

---

### P3 — Low: `$in` على كل ids اللاعبين في داشبورد الـproScout

**الملف:** [`dashboardController.js:293-302`](../Backend/controllers/dashboardController.js#L293)

الداشبورد بيجيب **كل** ids اللاعبين في النطاق (`ids: [{ $project: { _id: 1 } }]`) وبيرحّلهم كـ`$in` لاستعلامين على التقارير. مقيس على 400 لاعب: `$in` بـ400 عنصر، والاستعلام رجع 400 من 400 (نظيف).

بس ده O(عدد لاعبين الكشاف) في **حجم الاستعلام نفسه**. كشاف عنده 5,000 لاعب بيبعت `$in` بـ5,000 ObjectId (~120 KB) مرتين لكل فتح داشبورد. الشكل الصح لو ده حصل هو `$lookup` من `Player` لـ`ScoutingReport` بدل الترحيل — وده مسجّل أصلًا في تقرير الباك إند (بند A2، قسم القرارات المعمارية). القياس هنا بيأكد إنه **مش عاجل** عند الأحجام الحالية.

---

### P4 — ✅ الـaggregations اللي اتفحصت وطلعت سليمة

- `getPlayerStatistics` — `$match` على `{player, coach}` مغطّى، بيفحص 3 لـ1. الـ12 `$avg` بتتحسب في مرور واحد. مفيش تحسين.
- `getAverageRatingsForPlayers` بـ50 لاعب — IXSCAN، 150 مفحوص لـ50 مجموعة. سليم.
- `authorCounts` (`$lookup` على users) — 3 لـ3. سليم عند حجم تقارير اللاعب الواحد.
- كرون `dailySummary` — `$match` على `createdAt` بيتخدم من `createdAt_1`، فحص 60 لـ32. الـ`$lookup` بعد الـ`$group` (على 40 كوتش مش 25,000 لاعب) — الترتيب ده صح.
- بوابة الفيديو (`mediaMatchGate`) — `$or` على `homeTeam`/`awayTeam` + نافذة تاريخ + `attendees` → IXSCAN عبر `attendees_1_matchDate_1`. سليم.
- سكوب مباريات الأوبزيرفر — `$or` على 76 فريق بيتحوّل لـ`SUBPLAN ← SORT_MERGE ← IXSCAN` على الـindexين `homeTeam_1_matchDate_-1` و`awayTeam_1_matchDate_-1`، فحص 112 مفتاح لـ20 مستند. **ده أنضف مما توقعت** — الـ`SORT_MERGE` بيحافظ على ترتيب `matchDate` عبر الفرعين من غير فرز في الذاكرة. سيبه.
- لقطات التقييم الشهري (`captureCoachStats`) — التلات عدّادات مغطّيين تمامًا (`coach_1_createdAt_-1`، `uploadedBy_1_createdAt_-1`، `attendees_1_matchDate_1`)، exam=ret في التلاتة.

---

## Migrations & Data Integrity

### الميجريشنات المنفَّذة من المرحلة 2 لدلوقتي

| السكريبت | المرحلة | idempotent؟ | dry-run؟ | rollback موثّق؟ | قابل للتنفيذ فعلًا؟ |
|---|---|---|---|---|---|
| [`backfillPlayerCreatedBy.js`](../Backend/scripts/backfillPlayerCreatedBy.js) | 2 | ✅ | ✅ افتراضي | ✅ سطر واحد | ✅ **نعم** |
| [`backfillSearchTokens.js`](../Backend/scripts/backfillSearchTokens.js) | §11 | ✅ | ✅ افتراضي | ❌ **غير موثّق** | ⚠️ راجع M2 |
| [`unsetProfessionalTeamAgeGroup.js`](../Backend/scripts/unsetProfessionalTeamAgeGroup.js) | 13 | ✅ | ✅ افتراضي | ⚠️ "غير ذي معنى" صراحةً | ❌ **لا — بالتصميم** |
| [`cloneTeamsToAgeGroup.js`](../Backend/scripts/cloneTeamsToAgeGroup.js) | — | ✅ (بيتخطّى الموجود) | ✅ افتراضي | ❌ **غير موثّق** | ⚠️ راجع M2 |
| [`syncAllIndexes.js`](../Backend/scripts/syncAllIndexes.js) | مستمر | ✅ | ✅ بـ`diffIndexes()` | n/a | ✅ |
| `isProfessional` (المرحلة 4b) | 4b | — | — | — | 🔴 **مافيش سكريبت أصلًا** — راجع M1 |

**الجودة العامة للسكريبتات ممتازة** ولازم تتقال بوضوح: كلهم dry-run بالافتراضي، كلهم بيستخدموا cursor + `bulkWrite` على دفعات فالذاكرة محدودة مهما كبرت الكولكشن، و`backfillSearchTokens` بيستورد `buildSearchTokens` من الموديل نفسه بدل ما يعيد كتابة المنطق. `syncAllIndexes.js` بيفحص الإيميلات المكررة قبل ما يحاول يبني الـunique index ويطلع رسالة واضحة بدل ما الـdriver يقع في النص. ده مستوى أعلى من المعتاد بكتير.

---

### M1 — High: `isProfessional` عمره ما اتعمله backfill، و`?isProfessional=false` بيكدب

**الملف:** [`playedModel.js:142-145`](../Backend/models/playedModel.js#L142) · [`playerController.js:229-233`](../Backend/controllers/playerController.js#L229)

المرحلة 4b ضافت `isProfessional: { type: Boolean, default: false }`، والمرحلة 4c فتحته كفلتر أدمن في `PLAYER_FILTERS`. `default: false` بيتكتب على المستندات الجديدة بس — اللاعبين اللي اتعملوا **قبل** المرحلة 4b الحقل عندهم **غايب تمامًا**، ومفيش سكريبت backfill في `scripts/`.

ودلالات MongoDB هنا مش متسامحة:

**مُثبَت بالتنفيذ** (لاعبين: واحد قديم بلا الحقل، وواحد اتعمل بالكود الحالي):
```
إجمالي اللاعبين                    : 2
  مستندات قديمة (الحقل غايب)        : 1
  ?isProfessional=true   بيطابق     : 0
  ?isProfessional=false  بيطابق     : 1   ← ❌ بيسقط المستند القديم
  { $ne: true }          بيطابق     : 2   ← اللي المفروض الفلتر يتحوّل له
```

**الخطر الفعلي:** الأدمن بيفلتر "الناشئين بس" (`?isProfessional=false`) وبياخد **قايمة ناقصة بصمت** — كل لاعب اتسجّل قبل المرحلة 4b بيختفي. مفيش رسالة خطأ، والعدّاد نفسه هيقول رقم متّسق مع القايمة الناقصة، فالغلط مش قابل للاكتشاف من الواجهة.

الـaggregation في `getCountsByAgeGroup` **مش** متأثرة: `$cond: ["$isProfessional", 1, 0]` بتعامل الغايب كـfalsy صح ([playerController.js:174](../Backend/controllers/playerController.js#L174)). فالعدّاد صح والقايمة غلط — تناقض بين الرقم واللي بيتعرض.

**الحل — الاتنين مع بعض، مش واحد:**

1. **backfill** بنفس نمط السكريبتات الموجودة:
   ```js
   await Player.updateMany({ isProfessional: { $exists: false } }, { $set: { isProfessional: false } })
   // rollback: updateMany({}, { $unset: { isProfessional: "" } }) — يرجّع السلوك القديم بالظبط
   ```
2. **وحوّل الفلتر لـ`$ne: true`** في `ApiFeature.buildQueryScope` لما القيمة `false` على حقل boolean — عشان أي حقل boolean جديد يتضاف بعدين مايكررش نفس الفخ. البند التاني هو الأهم: الـbackfill بيصلّح النهاردة، والدلالة بتصلّح بكرة.

---

### M2 — Medium: مفيش سجل ميجريشن — مفيش طريقة تعرف إيه اتنفّذ فين

مفيش كولكشن ولا ملف بيسجّل "الميجريشن X اتشغّلت على الداتابيز دي في التاريخ ده". كل سكريبت idempotent (وده كويس جدًا — إعادة التشغيل مش ضارة)، بس ده بيغطي حالة "شغّلتها مرتين" مش حالة **"مشغلتهاش خالص"**.

النتيجة العملية: لو اتنشر النهاردة على بيئة جديدة، الطريقة الوحيدة للتأكد إن `backfillSearchTokens` اتشغّلت هي إنك تشغّلها تاني وتقرا الـdry-run. ولو نُسِيت، الأعراض صامتة تمامًا — **لاعبين موجودين مش بيظهروا في أي نتيجة بحث**، والسكريبت نفسه محذّر من ده في الترويسة ("لازم يتنفّذ مرة واحدة مع النشر").

كولكشن `Config` موجود بالفعل بشكل `{key, value}` ومستخدم لـ`dailySummaryLastSentAt`. هو المكان الطبيعي:

```js
// في نهاية كل سكريبت --apply
await Config.updateOne(
  { key: "migration:backfillSearchTokens" },
  { $set: { value: { appliedAt: new Date(), count: written } } },
  { upsert: true }
);
```
وسكريبت `migrations:status` بيطبع اللي اتطبّق واللي لأ. مجهود ساعة، وبيشيل فئة كاملة من أخطاء النشر.

**بند مصاحب:** `backfillSearchTokens.js` و`cloneTeamsToAgeGroup.js` **مالهمش قسم Rollback** في الترويسة، بينما `backfillPlayerCreatedBy.js` و`unsetProfessionalTeamAgeGroup.js` عندهم. التراجع في الاتنين مباشر (`$unset: { searchTokens: "" }` للأول؛ للتاني حذف الفرق المنسوخة اللي مالهاش لاعبين) — المطلوب توثيقه بس، عشان الاتساق يبقى قاعدة مش صدفة.

---

### M3 — Medium: ثوابت المرحلة 13 محروسة في hooks بس، ومفيش قيد على مستوى الداتابيز

`Team.ageGroup` و`SeasonMatch.ageGroup` و`Player.isProfessional` كلهم بيتبعوا نفس النمط: **مش `required` في المخطط، والإلزام برمجي في `pre('save')` و`pre('findOneAndUpdate')`**. القرار ده مبرَّر بوضوح في التعليقات (`teamModel.js:56-58`, `seasonMatchModel.js:106-108`) — الحقل مطلوب لدوري وممنوع للتاني، وده مش قابل للتعبير بـ`required: true`.

المشكلة إن الـhooks دي **بتتخطّى بالكامل مع أي كتابة على مستوى الـdriver** — وده بالظبط اللي كل سكريبتات الميجريشن في المشروع بتعمله (`Model.collection.bulkWrite`, `insertMany`).

**مُثبَت بالتنفيذ** على الكلاستر المعزول:
```
مستند اتكتب بالـdriver مباشرة:
  عنده ageGroup؟      : لا — الـhooks اتخطّت
  عنده searchTokens؟  : لا — الـhooks اتخطّت
```
ونفس الظاهرة ظهرت في الداتا المزروعة: `seedLoadTest.js` أنتج **39 فريق محترفين شايلين `ageGroup`** و**4,059 مباراة محترفين شايلة `ageGroup`** و**25,000 لاعب بلا `createdBy`** — كلها بتخالف ثوابت المرحلة 13 والمرحلة 2، وولا واحدة اتقابلت بأي اعتراض.

> **مهم جدًا للقراءة الصحيحة:** الأرقام دي **من الكلاستر المزروع، مش من البرودكشن**. `seedLoadTest.js` بيكتب بالـdriver عن قصد وموثّق. مش بقول إن البرودكشن كده. بقول إن **مفيش أي حاجة تمنعه من إنه يبقى كده** — والسكريبتات اللي بتلمس البرودكشن (`backfillPlayerCreatedBy`, `unsetProfessionalTeamAgeGroup`) بتستخدم **نفس** المسار.

**الحل — استعلام تحقّق، مش قيد جديد:** سكريبت `verify-invariants` بيتشغّل بعد أي ميجريشن وفي CI:

```js
const violations = {
  proTeamsWithAgeGroup:    await Team.countDocuments({ league: "professional", ageGroup: { $ne: null, $exists: true } }).setOptions({ bypassFilter: true }),
  proMatchesWithAgeGroup:  await SeasonMatch.countDocuments({ league: "professional", ageGroup: { $ne: null, $exists: true } }),
  premierTeamsNoAgeGroup:  await Team.countDocuments({ league: "premier", $or: [{ ageGroup: null }, { ageGroup: { $exists: false } }] }).setOptions({ bypassFilter: true }),
  proPlayersWithAgeGroup:  await Player.countDocuments({ isProfessional: true, ageGroup: { $ne: null, $exists: true } }),
  playersNoCreatedBy:      await Player.countDocuments({ createdBy: { $exists: false }, coach: { $ne: null } }),
  playersNoSearchTokens:   await Player.countDocuments({ $or: [{ searchTokens: { $exists: false } }, { searchTokens: { $size: 0 } }] }),
};
```
ست استعلامات، كلها رخيصة، وكلها بترجّع صفر على داتابيز سليمة. ده بيحوّل "الثابت موثّق في تعليق" لـ"الثابت متحقَّق منه".

---

### D1 — High: الفرادة على التقارير **مش** بتتطبّق على الودّي والتدريب

**الملفات:** [`scoutingReportModel.js:245-248`](../Backend/models/scoutingReportModel.js#L245) · [`scoutingReportController.js:29-33`](../Backend/controllers/scoutingReportController.js#L29)

القاعدة المعلنة في تعليق الـindex هي **"كاتب واحد = تقرير واحد للاعب في اليوم"**:

```js
scoutingReportSchema.index(
    { player: 1, coach: 1, matchDate: 1 },
    { unique: true, partialFilterExpression: { coach: { $type: "objectId" } } }
);
```

القاعدة دي بتتحقق للتقرير الرسمي بس، بالصدفة: `resolveSeasonMatchToBody` بيكتب `req.body.matchDate = match.matchDate` والقيمة دي **UTC-midnight** (جاية من `<input type="date">`)، فكل تقارير نفس المباراة بتشترك في نفس القيمة بالظبط.

أما الودّي والتدريب، `setPlayerToBody` بيحط:
```js
// scoutingReportController.js:32
req.body.matchDate = new Date();   // ← فيه ساعة ودقيقة وثانية وميلي ثانية
```
واتنين تقارير بينهم ميلي ثانية واحدة بيبقى عندهم `matchDate` مختلف، فالمفتاح المركّب مختلف، فالـunique index **مابيلمسهمش**.

**مُثبَت بالتنفيذ:**
```
تقريرين ودّي بينهم 1 ميلي ثانية، نفس اللاعب ونفس الكاتب  →  2 مستند اتخزنوا
❌ قيد "تقرير واحد في اليوم" ماتطبّقش

تقرير مكرر في نفس اللحظة بالظبط  →  ✅ اتمنع (E11000)
```
الصف التاني بيثبت إن الـindex نفسه شغّال وسليم — المشكلة في **القيمة اللي بتتحط فيه**، مش في الـindex.

**الخطر الفعلي:** أي كاتب يقدر يرفع عدد غير محدود من تقارير الودّي/التدريب على نفس اللاعب في نفس اليوم — بالخطأ (دبل كليك على زرار الحفظ) أو بالقصد. وكل تقرير بيدخل في `getPlayerStatistics` كوزن كامل في المتوسط، وفي `reportsCount` بتاعة لقطة التقييم الشهري ([coachEvaluationController.js:81](../Backend/controllers/coachEvaluationController.js#L81)) — يعني الرقم اللي الأدمن بيقيّم بيه الكشاف قابل للتضخيم. وده أهم أثر: **مقياس أداء بشري مبني على عدّاد مش محمي**.

**الحل — واحد من اتنين، والأول أنضف:**

1. **طبّع `matchDate` لبداية اليوم UTC وقت الكتابة**، فيبقى معناه "اليوم" زي ما القاعدة بتقول:
   ```js
   // scoutingReportController.js:32
   const now = new Date();
   req.body.matchDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
   ```
   ده بيخلي الـindex يشتغل زي ما اتصمم، من غير أي تغيير في المخطط. ⚠️ محتاج تنضيف للمكررات القائمة قبل التطبيق (استعلام `$group` على `{player, coach, يوم}` بيطلّعهم).
2. لو التعدد مقصود للودّي/التدريب، **قصّر الـ`partialFilterExpression` على `matchType: "official"`** وقول كده صراحةً — بس ساعتها لازم حماية تانية على العدّاد بتاع التقييم.

القرار بين الاتنين قرار منتج مش قرار تقني، فمحتاج المالك.

---

### D2 — Low: `Team` بيتمسح ناعم، واللاعبين بيفضلوا مربوطين بيه

`Team.active: false` بيخفي الفريق من كل استعلام، لكن `Player.team` بيفضل شايل الـref. `professionalTeamIds()` بتتعامل مع ده صراحةً وبتضم الفرق المعطّلة (`scope.js:44-56`) — القرار موثّق ومبرّر كويس.

الفجوة المتبقية: مفيش استعلام بيكشف "لاعبين مربوطين بفريق متعطّل". مش خطأ نشط، بس بند مرشّح لـ`verify-invariants` بتاع M3.

---

## Prioritized Recommendations

### 🔴 مانع للـdeploy — لازم يتصلح الأول

| # | البند | التغيير | الأثر المقيس |
|---|---|---|---|
| 1 | **I1** — ضيف `playerSchema.index({ createdBy: 1, createdAt: -1 })` واحذف `{team: 1, createdBy: 1}` | **سطرين** | 3 استعلامات COLLSCAN على 25,800 → IXSCAN على 400. الداشبورد 21.5ms→2.1ms، عدّاد القايمة 14.4ms→1.0ms |
| 2 | **I2** — وايت ليست لحقول الـ`sort` في `ApiFeature.sort()` | ~10 أسطر + سطر لكل كونترولر | يقفل COLLSCAN على 75,400 تقرير / 50,000 ميديا / 25,800 لاعب |
| 3 | **M1** — backfill لـ`isProfessional` + حوّل الفلتر لـ`$ne: true` | سكريبت + ~5 أسطر | `?isProfessional=false` بيرجّع قايمة كاملة بدل ناقصة بصمت |
| 4 | **D1** — طبّع `matchDate` لبداية اليوم UTC في `setPlayerToBody` (+ تنضيف المكررات) | **3 أسطر** + سكريبت تنضيف | يفعّل فرادة موجودة أصلًا؛ يحمي عدّاد تقييم الكشافين |
| 5 | **I3** — احذف `reviewStatus_1` و`player_1_type_1` و`coach_1_preferredFoot_1` | **3 أسطر حذف** | **+26% سرعة إدخال ميديا**، +10.6% لاعبين، −4.4 MB لكل 50k ميديا |

الخمسة مجتمعين **أقل من 25 سطر تعديل فعلي** + سكريبتين. البنود 1 و2 و5 عالية الثقة ومنخفضة الخطر جدًا. البند 3 و4 محتاجين تنضيف بيانات قبل التطبيق، فخططهم أطول من كودهم.

> **بعد أي تعديل على فهرس: `npm run sync-indexes` (dry run) وراجع الخطة قبل `-- --apply`.** الـproduction عنده `autoIndex: false` ([config/database.js:13](../Backend/config/database.js#L13))، يعني تغيير المخطط لوحده **مابيعملش حاجة** على الخادم — لازم السكريبت. و`syncIndexes()` **بيحذف** أي index مش معلن في المخطط، فالـdry-run مش اختياري.

---

### 🟠 قبل الإطلاق الواسع (2-4 أسابيع)

| # | البند | ليه دلوقتي |
|---|---|---|
| 6 | **غطّي رول `proScout` في `seedLoadTest.js` و`explainQueries.js`** | ده السبب الجذري لـI1: الرول موجود من المرحلة 2 وعمره ما اتقاس. من غير ده، البند الجاي هيتكرر |
| 7 | **S1** — `select: false` على كل أسرار `User` (+ تعديل الـ5 مسارات القارئة + تست على `.lean()`) | الحماية دلوقتي `$project` واحد بعيد عن الفشل |
| 8 | **I4** — `scoutingReportSchema.index({ coach: 1, matchDate: -1 })` | يشيل blocking sort بيفحص 400 لـ5، وبيكبر مع نشاط الكاتب |
| 9 | **M3** — سكريبت `verify-invariants` (6 استعلامات) + شغّله في CI وبعد كل ميجريشن | بيحوّل ثوابت المرحلة 13 من "تعليق" لـ"متحقَّق منه" |
| 10 | **M2** — سجل ميجريشن في كولكشن `Config` + `migrations:status` | نسيان `backfillSearchTokens` = لاعبين غير قابلين للبحث، بلا أي عرَض ظاهر |
| 11 | **P1** — اقلب `pre(/^find/)` بتاع `SeasonMatch` لـopt-in | 39% من زمن استعلام المباريات في populate مش مستخدم (مسجّل في تقرير الباك إند كمان) |

---

### 🟡 صيانة (بعد الإطلاق، حسب المتاح)

| # | البند |
|---|---|
| 12 | **M2-b** — ضيف قسم Rollback لـ`backfillSearchTokens.js` و`cloneTeamsToAgeGroup.js` (التراجع مباشر في الاتنين، التوثيق هو الناقص) |
| 13 | **S3** — `match: /^\d{4}\/\d{4}$/` على `SeasonMatch.season` · طبّع `Team.clubName` |
| 14 | **S4** — `{ timestamps: true }` على `Team` و`AgeGroup` (آمن تمامًا، والفرق بتتنسخ بسكريبت فبتحتاج تتبّع) |
| 15 | **S2** — `pre('validate')` على المخطط لقيد `team` ⊕ `teamName` و`homeTeam` ⊕ `homeTeamName` بدل express-validator وحده |
| 16 | **D2** — ضيف "لاعبين على فرق معطّلة" لـ`verify-invariants` |
| 17 | راجع `coach_1_position_1` بعد شهر من `$indexStats` الحقيقي على Atlas — لو زي `preferredFoot`، احذفه (612 KB) |
| 18 | **I5** — `teamSchema.index({ league: 1 })` **لو** عدد الفرق تخطّى الألف (النهاردة 78 — لا تعمله) |

---

### 🔵 قرارات معمارية (تتخطّط لوحدها)

| # | البند |
|---|---|
| 19 | **P3** — أعِد تشكيل داشبورد الـproScout بـ`$lookup` بدل ترحيل كل ids اللاعبين في `$in` (مسجّل في تقرير الباك إند كبند A2؛ القياس هنا بيقول **مش عاجل** عند الأحجام الحالية) |
| 20 | **P2** — keyset pagination لو ظهرت واجهة تصفّح عميق أو سكريبت بيسحب بالصفحات. النهاردة الـ`MAX_LIMIT` كفاية |
| 21 | كاش الداشبورد على Redis لو فيه خطة multi-instance — التحذير مكتوب أصلًا في [`dashboardController.js:42`](../Backend/controllers/dashboardController.js#L42) وصحيح. **قرار مربوط بخطة النشر مش بالكود** |
| 22 | إعادة النظر في تلات محاور الملكية على `Player` (`coach` / `observers` / `createdBy`) — مش خطأ، بس هو المكان اللي خرجت منه I1 |

---

## ملحق: طريقة إعادة إنتاج القياسات

الـharness اتمسح بعد القياس. لإعادة بنائه:

1. **الكلاستر:** `MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } })`. لازم replica set مش `MongoMemoryServer` عادي عشان `$collStats` والـtransactions يتصرفوا زي Atlas.
2. **الزرع:** `SEED_TARGET_URI="<uri المحلي>" node scripts/seedLoadTest.js --players=25000 --matches=8000 --yes`. حارس [`seedGuard.js`](../Backend/scripts/seedGuard.js) بيرفض الاشتغال من غير المتغير ده وبيرفض لو ساوى `CONNECTION_STRING` — **ده الحاجز الوحيد بينك وبين البرودكشن، متتخطّاهوش**.
3. **الفهارس:** `CONNECTION_STRING="<uri المحلي>" node scripts/syncAllIndexes.js --apply`. الزرع بالـdriver مابيبنيش فهارس، فمن غير الخطوة دي كل حاجة بتطلع COLLSCAN بالغلط.
4. **الأساس:** `SEED_TARGET_URI="..." npm run explain` — بيغطي 38 شكل استعلام.
5. **الفجوات:** الأشكال اللي مش مغطّاة في الـharness الرسمي (proScout، سكوب الأوبزيرفر للمباريات، مسارات الـsort، لقطات التقييم) اتقاست بسكريبتات مؤقتة على نفس النمط — `Model.find(filter).explain("executionStats")` مع لفّ شجرة `executionStages` لتجميع `stage` و`indexName`. ⚠️ لازم تطابق أسماء مراحل الـSBE الصغيرة (`scan`/`ixseek`) زي ما [`explainQueries.js:71-72`](../Backend/scripts/explainQueries.js#L71) بيعمل — مطابقة `COLLSCAN` الكبيرة بس بتبلّغ عن مسح كامل كأنه IXSCAN.
6. **مقارنة "قبل/بعد" الفهرس:** `collection.createIndex(spec, { name: "tmp_..." })` → أعِد القياس → `dropIndex`. ده اللي طلّع أرقام I1 و I4.
7. **تكلفة الكتابة:** `insertMany` بـ2000 مستند × 6 جولات، خُد الوسيط، بعدين `dropIndex` للمشكوك فيه وأعِد. الوسيط مش المتوسط — أول جولة دايمًا فيها تسخين WiredTiger.
8. **مقاسات الفهارس:** `collection.aggregate([{ $collStats: { storageStats: {} } }])` → `storageStats.indexSizes`.

> `$indexStats` **مش** دليل صالح هنا: `explain()` مابيسجّلش وصول للفهرس، فكل الأرقام بتطلع أصفار. الحكم على "فهرس بلا قارئ" في المستند ده مبني على grep ثابت على كل مسارات الاستعلام + تتبّع اختيار الـplanner. المصدر الوحيد الحاسم هو `$indexStats` على الإنتاج بعد فترة تشغيل حقيقية.
