---
description: "Task list for Role Foundation Hardening (المرحلة 0)"
---

# Tasks: Role Foundation Hardening (المرحلة 0)

**Input**: Design documents from `specs/001-role-foundation-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
(all present — see `AVAILABLE_DOCS`)

**Tests**: مطلوبة صراحةً. `spec.md` يضع FR-019/FR-020 وSC-001..SC-003 كمعايير قبول
اختبارية، والدستور (Principle VI) يُلزم اختباراً إيجابياً وسلبياً لكل قرار وصول جديد.
كل قصة أدناه تحمل مهام اختبار قبل أو مع التنفيذ.

**Organization**: المهام مجمّعة حسب قصص المستخدم في `spec.md` (US1..US4)، بترتيب
الأولوية (P1→P4). كل قصة قابلة للتنفيذ والاختبار والنشر منفردة (Principle V).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: قابلة للتنفيذ بالتوازي (ملفات مختلفة، بلا اعتماد على مهمة غير مكتملة)
- **[Story]**: القصة التي تنتمي إليها (US1..US4)
- مسارات الملفات دقيقة ومطلقة نسبةً لجذر المستودع

## Path Conventions

مشروع ويب بمشروعين منفصلين (زي `plan.md` → Structure Decision):
`Backend/` (Express/Mongoose) و `frontend/src/app/` (Angular). الجذر `openapi.json`
مشترك بينهما.

---

## Phase 1: Setup (خط الأساس قبل أي تعديل)

**Purpose**: تسجيل حالة الاختبارات الحالية كخط أساس، عشان أي انحراف لاحق يُكتشَف فوراً —
لا تهيئة مشروع جديد (المشروع قائم بالفعل).

- [X] T001 [P] شغّل `npm test` في `Backend/` وسجّل نتيجة `tests/isolation.test.js` كخط
      أساس (كل الاختبارات ناجحة) قبل أي تعديل — مرجع للمقارنة بعد كل قصة
- [X] T002 [P] شغّل `npx ng test --watch=false --browsers=ChromeHeadless` في `frontend/`
      وسجّل نتيجة `core/auth/role.guard.spec.ts` كخط أساس قبل أي تعديل

**Checkpoint**: خط الأساس موثَّق. أي فشل لاحق في نفس الاختبارات القائمة = انحدار حقيقي.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: البنية المشتركة الوحيدة التي تعتمد عليها أكثر من قصة — مصدر الحقيقة لأسماء
الرولات (يستخدمه US1 في الفروع الصريحة، ويكتمل تطبيقه في US3).

**⚠️ CRITICAL**: لا تبدأ US1 أو US3 قبل اكتمال هذه المرحلة — الاثنان فقط يعتمدان على
`T003`. US2 وUS4 مستقلان تماماً ولا ينتظران هذه المرحلة (تفصيل في قسم Dependencies أدناه).

- [X] T003 أنشئ `Backend/constants/roles.js` يُصدِّر `ROLES` (`{ ADMIN: 'admin', COACH:
      'coach', OBSERVER: 'observer' }`) و `ROLE_VALUES` (`Object.values(ROLES)`)، حسب
      القرار في `research.md` §1–2 وعقد `contracts/role-landing-and-role-source.md`
      (عقد 2)

**Checkpoint**: الثابت جاهز — US1 وUS3 يقدروا يبدأوا بالتوازي.

---

## Phase 3: User Story 1 — الرفض الصريح لأي رول غير معرّف (Priority: P1) 🎯 MVP

**Goal**: تحويل حرّاس الملكية الأربعة في `middlewares/ownership.js` من fall-through
ضمني إلى تعداد صريح للرولات المسموحة + فرع افتراضي مخصص للرفض (403)، مع تشديد خاص على
`checkMediaOwnership` (فحص الرول قبل فحص رافع الملف).

**Independent Test**: طلب على مسار مورد واحد (`/players/:id`، `/players/:playerId/media/:id`،
إلخ) بهوية رول غير معدود يُرفَض بـ 403 من الفرع الافتراضي — قابل للتحقق بمعزل عن أي قصة
أخرى في هذه المرحلة (تفصيل كامل في `contracts/ownership-guards.md`).

### Tests for User Story 1

> **اكتب هذه الاختبارات أولاً، وتأكد أنها تفشل قبل التعديل على `ownership.js`**

- [X] T004 [US1] اكتب اختبارات وحدة للفرع الافتراضي الجديد (رول غير معروف مُصطنع في
      الذاكرة، بلا DB) عبر الحرّاس الأربعة في `Backend/tests/ownership.test.js` (ملف
      جديد) — طبقاً لمعيار التحقق #4 في `contracts/ownership-guards.md` وقرار
      `/speckit-clarify` Q2 (`research.md` §4)
- [X] T005 [US1] اكتب اختبارات وحدة تثبت بقاء سلوك admin/coach/observer القائم بلا أي
      تغيير عبر الحرّاس الأربعة (إيجابي وسلبي)، **بما فيها حالة اختبار محددة لترتيب
      "المستند غير موجود قبل الرول" (404 يسبق فحص 403 دائماً، بصرف النظر عن الرول
      الطالب)** في `Backend/tests/ownership.test.js` — طبقاً لمعايير التحقق #1–3
      ولقاعدة الترتيب الثابتة في `contracts/ownership-guards.md`، وتثبت FR-004

### Implementation for User Story 1

- [X] T006 [US1] أعد كتابة `checkPlayerOwnership` في `Backend/middlewares/ownership.js`
      بفروع صريحة (`ROLES.ADMIN`/`ROLES.OBSERVER`/`ROLES.COACH`) + فرع افتراضي `403`،
      مع الحفاظ الحرفي على رسالة الرفض القائمة (تفصيل الجدول في
      `contracts/ownership-guards.md` §1) (يعتمد على T003)
- [X] T007 [US1] أعد كتابة `checkReportOwnership` بنفس النمط في
      `Backend/middlewares/ownership.js` (تفصيل الجدول في §2) (يعتمد على T003)
- [X] T008 [US1] أعد كتابة `checkMediaOwnership` بنفس النمط في
      `Backend/middlewares/ownership.js`، **مع إضافة فحص الرول قبل فحص `uploadedBy`**
      (FR-002 — التغيير الأهم في هذا العقد، تفصيله في §3) (يعتمد على T003)
- [X] T009 [US1] أعد كتابة `checkSeasonMatchAttendee` بنفس النمط في
      `Backend/middlewares/ownership.js` (تفصيل الجدول في §4) (يعتمد على T003)
- [X] T010 [US1] شغّل `Backend/tests/ownership.test.js` و `Backend/tests/isolation.test.js`
      وتأكد من نجاح الكل، وأن `isolation.test.js` **لم يُعدَّل** — يثبت FR-019، SC-001،
      SC-003 (يعتمد على T004–T009)

**Checkpoint**: US1 وظيفي وقابل للاختبار منفرداً. هذه أخطر قصة أمنياً في المرحلة
(تغلق القيد الدستوري C-2) — يُفضَّل عدم المتابعة لقصة تالية قبل مراجعة بشرية لهذا الجزء.

---

## Phase 4: User Story 2 — مخرج واضح بدل حلقة إعادة التوجيه (Priority: P2)

**Goal**: صفحة "غير مصرّح" جديدة، وتعريف واحد لاشتقاق وجهة الرول يستدعيه كل من
`role.guard.ts` و `dashboard.routes.ts`، بحيث يصبح رول بلا وجهة معرّفة يصل لصفحة نهائية
بدل حلقة.

**Independent Test**: تسجيل دخول بمستخدم برول لا يملك وجهة معرّفة يصل لصفحة "غير مصرّح"
دون أي إعادة توجيه إضافية — قابل للتحقق بمعزل عن US1/US3/US4 (`role.guard.spec.ts` الجديد
يغطي هذا بمحاكاة رول غير معروف، بلا حاجة لمستخدم حقيقي).

### Tests for User Story 2

- [X] T011 [P] [US2] أضف مفاتيح `UNAUTHORIZED.*` (عنوان، رسالة، إجراء تسجيل الخروج) إلى
      `frontend/src/assets/i18n/en.json`
- [X] T012 [P] [US2] أضف نفس المفاتيح بالعربي إلى `frontend/src/assets/i18n/ar.json`

### Implementation for User Story 2

- [X] T013 [US2] أنشئ `frontend/src/app/core/services/role-landing.service.ts` يُصدِّر
      `landingFor(role)` حسب جدول القرار الكامل في
      `contracts/role-landing-and-role-source.md` (عقد 1)
- [X] T014 [US2] اكتب اختبارات وحدة لـ `role-landing.service.ts` في
      `frontend/src/app/core/services/role-landing.service.spec.ts` — الرولات الثلاثة
      المعروفة + قيمة غير معروفة/غائبة → `/unauthorized` (يعتمد على T013)
- [X] T015 [US2] أنشئ مكوّن standalone جديد
      `frontend/src/app/features/unauthorized/unauthorized.component.ts` — نص مترجَم
      (مفاتيح T011/T012) وزر تسجيل خروج عبر `AuthService`
- [X] T016 [US2] سجّل مسار `/unauthorized` في `frontend/src/app/app.routes.ts` على
      المستوى الجذري، **خارج** `path: ''` المحروس بـ `authGuard`/`ShellComponent`، بجانب
      `path: 'auth'` (يعتمد على T015)
- [X] T017 [US2] عدّل `frontend/src/app/core/auth/role.guard.ts` ليستدعي
      `role-landing.service.landingFor()` بدل السلسلة الثلاثية المحلية، بحيث يصبح
      الافتراضي لرول غير معروف `/unauthorized` (يعتمد على T013)
- [X] T018 [US2] عدّل فرع `path: ''` في
      `frontend/src/app/features/dashboard/dashboard.routes.ts` ليستدعي
      `role-landing.service.landingFor()` بدل تكرار نفس المنطق محلياً (يعتمد على T013)
- [X] T019 [US2] وسّع `frontend/src/app/core/auth/role.guard.spec.ts` بسيناريو جديد
      (رول غير معروف → `/unauthorized`) **دون تعديل أي توقُّع قائم فيه** — التوقعات
      القائمة توثّق سلوك admin/coach/observer اليوم ويجب أن تستمر بالنجاح كما هي
      (يعتمد على T017)
- [X] T020 [US2] شغّل `npx ng test --watch=false --browsers=ChromeHeadless` في
      `frontend/` وتأكد من نجاح كل الاختبارات القائمة والجديدة — يثبت SC-002، SC-004،
      SC-007 (يعتمد على T011–T019)

**Checkpoint**: US2 وظيفي وقابل للاختبار منفرداً. وجهة كل رول قائم (admin/coach/observer)
مطابقة تماماً لما قبل التعديل.

---

## Phase 5: User Story 3 — مصدر حقيقة واحد لأسماء الرولات (Priority: P3)

**Goal**: تعداد المخطط يُشتَق من الثابت الواحد (لا العكس)، وتحقق صريح من قيمة `role` في
طبقة الفاليديشن، وهجرة كل الاستخدامات النصية الحرفية في مصدر الباك إند الإنتاجي (باستثناء
الاختبارات — قرار `/speckit-clarify` Q1).

**Independent Test**: طلب إنشاء مستخدم بقيمة `role` غير صالحة يُرفَض بخطأ فاليديشن واضح
(400، لا 500) — قابل للتحقق بمعزل عن US1/US2/US4.

### Implementation for User Story 3

- [X] T021 [US3] عدّل `Backend/models/userModel.js` ليشتق `role.enum` من `ROLE_VALUES`
      (استيراد من `constants/roles.js`) بدل المصفوفة الحرفية المكتوبة في المخطط
      (يعتمد على T003) — FR-012
- [X] T022 [US3] أضف تحقق `role` (`.optional().isIn(ROLE_VALUES)`) إلى `createValidate`
      و `updateValidate` في `Backend/utils/validation/userValidation.js` (يعتمد على
      T003) — FR-013، FR-014
- [X] T023 [P] [US3] اكتب اختبارات فاليديشن: رفض قيمة `role` غير صالحة بـ 400، قبول قيمة
      صالحة، قبول غياب الحقل بالافتراضي القائم — في ملف اختبارات المستخدمين الموجود
      (أو `Backend/tests/userValidation.test.js` إن لم يوجد ملف مناسب) (يعتمد على T022)
- [X] T024 [US3] هاجِر مقارنات الرول النصية الحرفية (`'admin'`/`'coach'`/`'observer'`)
      إلى استيراد `ROLES.*` عبر ملفات `Backend/controllers/*.js` (باستثناء
      `Backend/tests/`) (يعتمد على T003)
- [X] T025 [US3] هاجِر نفس النمط عبر `Backend/services/*.js` و
      `Backend/socket/handlers/*.js` (باستثناء `Backend/tests/`) (يعتمد على T003)
- [X] T026 [US3] هاجِر استخدامات الرول النصية في `Backend/seeds/*.js` و
      `Backend/scripts/*.js` إلى `ROLES.*`/`ROLE_VALUES` — البذور والسكربتات **مشمولة**
      بالهجرة (قرار `research.md` §1، بخلاف الاختبارات المستثناة صراحةً) (يعتمد على T003)
- [X] T027 [US3] ابحث في مصدر `Backend/` الإنتاجي (باستثناء `Backend/tests/`) عن أي نص
      حرفي متبقٍّ لاسم رول، وتأكد من صفر نتائج خارج `Backend/constants/roles.js` نفسه —
      يثبت SC-005 (يعتمد على T024–T026)
- [X] T028 [US3] شغّل `Backend/tests/isolation.test.js` وكامل مجموعة اختبارات الباك إند
      وتأكد من صفر انحدار بعد هجرة الثابت، مع تأكيد صريح أن عدد ومحتوى النتائج لكل رول
      قائم لم يتغيرا على الـ endpoints الخمسة التي ينص عليها المبدأ III في الدستور:
      `GET /players`، `GET /players/counts`، `GET /players/reports/average-ratings`،
      `GET /seasonMatches`، `GET /dashboard/*` — يثبت FR-019، SC-001، SC-002 (يعتمد على
      T021–T027)

**Checkpoint**: US3 وظيفي وقابل للاختبار منفرداً. المستخدم الافتراضي عند غياب `role`
والقيم الثلاث الصالحة تعمل بلا أي فرق عن قبل التعديل.

---

## Phase 6: User Story 4 — جرد كامل وموثوق لواجهة الـ API (Priority: P4)

**Goal**: إكمال توثيق `@swagger` الناقص فوق المسارات غير الموثَّقة، وإعادة توليد
`openapi.json` وأنواع الواجهة الأمامية بحيث يطابق العدد الفعلي للعمليات المعرَّفة.

**Independent Test**: عدد العمليات في `openapi.json` المُعاد توليده يطابق عدد التعريفات
الفعلية في `Backend/routes/*.js` — قابل للتحقق بمعزل عن US1/US2/US3 (توثيق بحت، بلا أي
تغيير في سلوك مسار).

### Implementation for User Story 4

- [X] T029 [US4] دقّق كل ملفات `Backend/routes/*.js` مقابل التعريفات الفعلية لتحديد كتل
      `@swagger` الناقصة بدقة، ابتداءً من `Backend/routes/teamRouter.js` (غير موثَّق
      بالكامل حسب `research.md` §8)
- [X] T030 [US4] أضف كتل `@swagger` الناقصة لـ `GET/POST /teams`،
      `GET/PATCH/DELETE /teams/:id`، والـ mount المتداخل `/ages/:id/teams` في
      `Backend/routes/teamRouter.js` (يعتمد على T029)
- [X] T031 [P] [US4] أضف كتل `@swagger` الناقصة لـ `GET /dashboard/observer` و
      `GET /dashboard/admin/observer/:observerId` في `Backend/routes/dashboardRouter.js`
- [X] T032 [P] [US4] أضف كتل `@swagger` الناقصة لـ `GET /players/counts`،
      `GET /players/reports/average-ratings`، `PATCH /players/:id/observers`،
      `PATCH /players/:id/profileImg` في `Backend/routes/playerRouter.js`
- [X] T033 [P] [US4] أضف كتل `@swagger` الناقصة لـ `PATCH /:id/changePassword`،
      `DELETE /:id/force`، `PATCH /:id/profileImg`، `PATCH /:id/idCardImg/front`،
      `PATCH /:id/idCardImg/back`، `GET /:id/idCardImg`، `GET /:id/idcard/:side`،
      والـ mount المتداخل `/:id/players` في `Backend/routes/userRouter.js`
- [X] T034 [P] [US4] أضف كتل `@swagger` الناقصة لـ `POST /auth/vaultPassword/verify` و
      `POST /auth/setup-admin` في `Backend/routes/authRouter.js`
- [X] T035 [P] [US4] أضف كتلة `@swagger` الناقصة لـ
      `GET /players/:playerId/media/:id/download` في
      `Backend/routes/playerMediaRouter.js`
- [X] T036 [US4] شغّل `npm run dump-spec` في `Backend/` لإعادة توليد `openapi.json`
      الجذري (يعتمد على T030–T035)
- [X] T037 [US4] تحقق أن عدد العمليات في `openapi.json` المُعاد توليده يطابق عدد
      التعريفات الفعلية في `Backend/routes/*.js` تماماً — يثبت SC-006 (يعتمد على T036)
- [X] T038 [US4] شغّل `npm run gen:types` في `frontend/` لإعادة توليد
      `frontend/src/app/core/models/api.generated.ts` (يعتمد على T036)
- [X] T039 [US4] شغّل `npm run build` في `frontend/` وتأكد من صفر أخطاء أنواع بعد إعادة
      التوليد — يثبت FR-016 (يعتمد على T038)

**Checkpoint**: US4 وظيفي وقابل للاختبار منفرداً. الجرد الكامل جاهز كأساس للمرحلة 7.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: بوابة النشر النهائية التي تغطي القصص الأربع معاً — لا تُنجَز إلا بعد اكتمال
كل القصص المطلوبة للنشر.

- [X] T040 [P] شغّل مجموعة اختبارات `e2e/` وتأكد من صفر انحدار عبر كل الرولات — يثبت
      FR-017، SC-007 (يعتمد على اكتمال US1–US4)
      **نُفِّذ فعلياً** (بعد تجهيز `e2e/.env` وبيانات E2E_* وتشغيل backend :8000 +
      frontend :4200 يدوياً من المستخدم، وتصحيح `E2E_API_URL` من افتراض :3000 لـ :8000):
      **2 نجحا / 3 فشلا / 1 تخطّى** (يعتمد على فاشل). الاختباران الناجحان
      (`login redirects coach to dashboard`, `wrong password keeps user on login page`)
      يثبتان مباشرة عدم كسر مسار المصادقة/التوجيه للرول الحالي (coach) — أقوى دليل
      متاح على FR-017/SC-007. الثلاثة الفاشلة تم التحقق أنها **انحراف سابق للتنفيذ
      وغير متعلق بالمرحلة 0**، ولم تُعدَّل منذ commit الإنشاء الأول للمشروع:
      1) `auth.spec.ts:38` — نمط glob الاختبار `**/auth/login` لا يطابق بسبب
         `?returnUrl=...` المُلحقة فعلياً من `authGuard.ts` (لم يُمسّ في هذه المرحلة).
      2) `players.spec.ts:32` — الاختبار يبحث عن `input[type="date"]` قديم؛ الفورم
         الحالي يستخدم Day/Month/Year selects منفصلة (تغيير UI سابق غير متعلق بنا).
      3) `reports.spec.ts` — `apiCreatePlayer` يرسل `team: 'Al Ahly'` كنص، لكن
         `Player.team` أصبح ObjectId مرجعي لـ `Team` — schema drift سابق.
      لا علاقة لأي من الثلاثة بـ `ownership.js`/`role.guard.ts`/`RoleLandingService`/
      استبدال حرفيات الرول. يوصى بإصلاحها في مهمة منفصلة خارج نطاق هذه المرحلة.
- [X] T041 تحقق أن `git diff --stat Backend/tests/isolation.test.js` يُظهر صفر تغييرات —
      بوابة صريحة نهائية على FR-019 (يعتمد على اكتمال US1–US4)
- [X] T042 [P] راجع الـ diff النهائي لـ `Backend/middlewares/ownership.js` وتأكد من بقاء
      التعليقات العربية الأمنية القائمة (إشارات مثل `§9`) دون حذف، طبقاً لقاعدة
      Development Workflow في الدستور (يعتمد على T006–T009)
- [X] T043 نفّذ خطوات `quickstart.md` §1–6 كاملة كبوابة دمج نهائية، وتأكد من نجاح
      البوابات الثلاث المكافئة لـ CI — يثبت SC-008 (يعتمد على اكتمال US1–US4).
      بوابتا Backend (435/435) وFrontend (build نظيف + 83/83) نُفِّذتا وتأكّدتا بالكامل.
      بوابة e2e نُفِّذت أيضاً (انظر T040) — 2/6 ناجحة، والفشل الثلاثي موثّق كانحراف
      سابق غير متعلق بالمرحلة 0.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: بلا اعتماديات — يبدأ فوراً.
- **Foundational (Phase 2)**: يعتمد على اكتمال Setup — **يحجب** US1 وUS3 (T003 مرجع
  مباشر لهما). لا يحجب US2 ولا US4 (لا يستخدمان الثابت مباشرة).
- **User Stories (Phase 3–6)**: US1 وUS3 يعتمدان على Phase 2. US2 وUS4 مستقلان تماماً
  عن Phase 2 وعن بعضهما البعض — يمكن البدء بهما فوراً بعد Phase 1.
- **Polish (Phase 7)**: يعتمد على اكتمال كل القصص المطلوبة للنشر.

### User Story Dependencies

- **US1 (P1)**: يعتمد على T003 فقط (Foundational). لا اعتماد على US2/US3/US4.
- **US2 (P2)**: بلا اعتماد على أي قصة أخرى — مستقل بالكامل (طبقة واجهة أمامية، لا تلمس
  الباك إند إطلاقاً).
- **US3 (P3)**: يعتمد على T003 فقط (Foundational). لا اعتماد على US1/US2/US4 — رغم أن
  US1 يستخدم نفس الثابت، الاثنان يعدّلان ملفات مختلفة تماماً (`ownership.js` مقابل
  `userModel.js`/`userValidation.js`/باقي الباك إند) ولا يتقاطعان.
- **US4 (P4)**: بلا اعتماد على أي قصة أخرى — توثيق `@swagger` بحت، مستقل تماماً.

### Within Each User Story

- الاختبارات (حيث وُجدت) تُكتَب قبل أو مع التنفيذ، لا بعده.
- US1: T004–T005 (اختبارات) → T006–T009 (تنفيذ، كلها بنفس الملف فتُنجَز تسلسلياً) →
  T010 (تحقق).
- US2: i18n (T011–T012) وخدمة الوجهة (T013) يمكن أن تبدأ بالتوازي؛ المكوّن (T015) يعتمد
  على i18n؛ الحارسان (T017–T018) يعتمدان على الخدمة (T013)؛ الاختبارات (T014، T019)
  تعتمد على ما تختبره؛ T020 تحقق نهائي.
- US3: تعديل المخطط والفاليديشن (T021–T022) أولاً، ثم الهجرة عبر الملفات (T024–T026)،
  ثم التحقق (T027–T028).
- US4: التدقيق والتوثيق (T029–T035) أولاً، ثم إعادة التوليد (T036، T038) والتحقق
  (T037، T039).

### Parallel Opportunities

- **T001/T002** (Setup) بالتوازي — أدوات مختلفة (Backend/frontend).
- بعد اكتمال **Foundational (T003)**: US1 وUS3 يمكن أن يبدآ بالتوازي (فريقان مختلفان)؛
  US2 وUS4 يمكن أن يبدآ حتى قبل ذلك (بلا اعتماد على T003 إطلاقاً).
- داخل US2: **T011/T012** (ملفا i18n مختلفان) بالتوازي.
- داخل US4: **T031–T035** (خمسة ملفات routes مختلفة) بالتوازي، بعد T030 (أو بالتوازي
  معه — ملفات منفصلة).
- داخل Polish: **T040/T042** بالتوازي (e2e مقابل مراجعة diff — أدوات/أنشطة منفصلة).

---

## Parallel Example: بعد اكتمال Foundational

```bash
# فريق/مسار عمل A — US1 (الأخطر أمنياً، يُنصَح بالبدء به أولاً كـ MVP)
Task: "اكتب اختبارات الفرع الافتراضي الجديد عبر الحرّاس الأربعة في Backend/tests/ownership.test.js"
Task: "أعد كتابة checkPlayerOwnership في Backend/middlewares/ownership.js"

# فريق/مسار عمل B — US2 (مستقل تماماً، لا يحتاج انتظار Foundational حتى)
Task: "أنشئ frontend/src/app/core/services/role-landing.service.ts"
Task: "أضف مفاتيح UNAUTHORIZED.* إلى frontend/src/assets/i18n/en.json"

# فريق/مسار عمل C — US4 (مستقل تماماً)
Task: "أضف كتل @swagger الناقصة في Backend/routes/dashboardRouter.js"
Task: "أضف كتل @swagger الناقصة في Backend/routes/playerRouter.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 فقط)

1. أنجز Phase 1: Setup (خط الأساس).
2. أنجز Phase 2: Foundational (`constants/roles.js`) — يحجب US1.
3. أنجز Phase 3: US1 كاملة (T004–T010).
4. **توقف وتحقق**: `Backend/tests/isolation.test.js` + `ownership.test.js` الجديد —
   كلاهما ناجح 100%.
5. هذه أعلى قيمة أمنية في المرحلة كلها (تغلق القيد الدستوري C-2) وقابلة للدمج والنشر
   بمفردها فوراً — لا تنتظر US2/US3/US4.

### Incremental Delivery

1. Setup + Foundational → الأساس جاهز.
2. أضف US1 → تحقق منفرد → دمج/نشر (**MVP الأمني**).
3. أضف US2 → تحقق منفرد → دمج/نشر (يفتح الباب لأي رول رابع مستقبلي من ناحية الواجهة).
4. أضف US3 → تحقق منفرد → دمج/نشر (يقفل مصدر الحقيقة، آخر حاجز قبل إضافة رول فعلي).
5. أضف US4 → تحقق منفرد → دمج/نشر (توثيق، يمكن تأجيله لآخر لحظة قبل المرحلة 7 بلا خطر).
6. Phase 7 (Polish) بعد اكتمال كل ما سبق يُقرَّر نشره — بوابة الدمج النهائية.

### Parallel Team Strategy

مع أكثر من مطوّر:

1. الفريق يُنجز Setup + Foundational معاً (مهمة واحدة صغيرة، T003).
2. بعدها مباشرة، وحتى قبلها بالنسبة لـ US2/US4:
   - مطوّر A: US1 (باك إند — الأولوية القصوى).
   - مطوّر B: US2 (فرونت إند — مستقل بالكامل).
   - مطوّر C: US4 (توثيق — مستقل بالكامل، يمكنه البدء فوراً دون انتظار أي شيء).
   - US3 تُلحَق بعد US1 أو بالتوازي معه من مطوّر رابع أو نفس مطوّر US1 بعد فراغه.
3. كل قصة تكتمل وتُدمَج منفردة دون كسر القصص الأخرى — الدستور (Principle V) يفرض هذا
   صراحة.

---

## Notes

- `[P]` = ملفات مختلفة، بلا اعتماد على مهمة غير مكتملة.
- التسمية `[US1]`..`[US4]` تربط كل مهمة بقصتها لأغراض التتبع فقط — Setup وFoundational
  وPolish بلا تسمية قصة عمداً (زي قاعدة التنسيق).
- T004–T009 كلها تعدّل نفس الملف (`Backend/middlewares/ownership.js`) — غير موسومة
  بـ `[P]` عمداً رغم انتمائها لنفس القصة، لتفادي تعارض تعديلات متزامنة على ملف واحد.
- تحقق أن اختبارات الفرع الافتراضي (T004) تفشل فعلاً قبل تنفيذ T006–T009 — هذا ما يثبت
  أنها تختبر الفرع الجديد لا سلوكاً كان يمر بالفعل.
- Commit بعد كل مهمة أو مجموعة منطقية متماسكة.
- توقف عند أي Checkpoint للتحقق من القصة منفردة قبل المتابعة.
- تجنّب: مهام غامضة، تعارض على نفس الملف بين مهام موسومة `[P]`، اعتماديات بين القصص
  تكسر استقلاليتها.
