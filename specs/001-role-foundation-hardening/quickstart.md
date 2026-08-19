# Quickstart: التحقق من المرحلة 0 — Role Foundation Hardening

دليل تشغيل للتحقق اليدوي والآلي من أن المرحلة تحقق `spec.md` دون أي أثر جانبي على
الرولات القائمة. لا يحتوي كوداً كاملاً للتنفيذ — فقط أوامر التشغيل والنتائج المتوقعة.
تفاصيل القرار خلف كل خطوة في `research.md`، وتفاصيل السلوك الدقيق في `contracts/`.

## المتطلبات المسبقة

- Node 22 (مثبَّت حسب `.nvmrc`).
- `Backend/config.env` موجود (أو الاعتماد على `NODE_ENV=test` الذي يشغّل
  mongodb-memory-server تلقائياً — لا حاجة لقاعدة بيانات حقيقية للاختبارات).
- `Backend/` و `frontend/` كل منهما بـ `node_modules` مثبَّتة (`npm install` في كل
  مجلد إن لم تكن مثبَّتة).

## 1. التحقق الآلي — البوابة الأساسية

```bash
cd Backend
npm test
```

**النتيجة المتوقعة**: كل الاختبارات القائمة تمر **دون أي تعديل عليها**، وتحديداً:

```bash
npm test -- tests/isolation.test.js
```

MUST يمر بالكامل بلا استثناء واحد فاشل — هذا هو معيار القبول الحاسم لكامل المرحلة
(FR-019، SC-001).

```bash
npm test -- tests/ownership.test.js
```

(ملف جديد من هذه المرحلة) — يُثبت الفرع الافتراضي الجديد في الحرّاس الأربعة
(FR-020؛ التفاصيل الكاملة في `contracts/ownership-guards.md`).

```bash
cd ../frontend
npx ng test --watch=false --browsers=ChromeHeadless
```

**النتيجة المتوقعة**: يمر بالكامل، وتحديداً `role.guard.spec.ts` القائم بلا أي تعديل
على توقعاته — يثبت SC-002/SC-007 من جهة الواجهة.

## 2. التحقق اليدوي — سيناريو US1 (الرفض الصريح)

عبر أي عميل HTTP (curl/Postman) بعد تسجيل دخول بمستخدم `coach` حقيقي، للتأكد أن لا شيء
تغيّر من منظور المستخدم النهائي:

```bash
# لاعب يملكه الكوتش — يجب أن يمر (200) بلا أي فرق عن قبل التعديل
curl -H "Authorization: Bearer <coach-token>" http://localhost:8000/api/v1/players/<ownedPlayerId>

# لاعب لا يملكه — يجب أن يُرفَض (403) بنفس الرسالة القائمة
curl -H "Authorization: Bearer <coach-token>" http://localhost:8000/api/v1/players/<otherCoachPlayerId>
```

اختبار الفرع الجديد نفسه (رول غير معروف) **لا يُختبَر عبر HTTP** — التحقق منه في اختبار
الوحدة `tests/ownership.test.js` فقط، للسبب الموثَّق في `research.md` §4 (الفاليديشن
الجديدة من US3 تمنع وجود مستخدم حقيقي برول غير صالح أصلاً).

## 3. التحقق اليدوي — سيناريو US2 (المخرج من حلقة إعادة التوجيه)

**قبل التعديل**: مستخدم افتراضي (لا وجود له فعلياً بعد قفل US3، لكن للتوثيق) كان سيدخل
حلقة `/dashboard → /dashboard/coach → (roleGuard يرفض) → /dashboard/coach → ...`.

**بعد التعديل**، بالتشغيل الفعلي:

```bash
cd frontend
npm start
```

1. سجّل الدخول بمستخدم `coach` — يجب أن يصل لـ `/dashboard/coach` بلا أي تغيير عن السلوك
   الحالي (نفس الأمر لـ `admin` → `/dashboard/admin` و `observer` → `/dashboard/observer`).
2. افتح أدوات المطوّر → Network tab، وتأكد أن عدد طلبات التنقّل عند تسجيل الدخول لم يزد.
3. جرّب فتح `http://localhost:4200/age-groups` بمستخدم `coach` (ممنوع عليه أصلاً) — يجب
   أن يُعاد توجيهه لوجهته المعتادة **كما هو الحال اليوم بلا تغيير** (السلوك القائم لرول
   معروف يبقى كما هو، الفرع الجديد لا يمسّه).
4. **للتحقق من الفرع الجديد فعلياً**: يتطلب مستخدماً برول غير معروف — غير ممكن إنشاؤه عبر
   الواجهة بعد قفل US3. التحقق منه في `role.guard.spec.ts` (اختبار جديد يمرر رولاً غير
   معروف مباشرة لدالة `roleGuard` — نفس نمط الاختبارات القائمة في هذا الملف) وفي اختبار
   وحدة لـ `role-landing.service.ts` مباشرة.

## 4. التحقق اليدوي — سيناريو US3 (مصدر حقيقة الرولات)

```bash
# محاولة إنشاء مستخدم برول غير صالح (تسجل دخول كـ admin أولاً)
curl -X POST http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"TestPass1234","passwordConfirm":"TestPass1234","phoneNumber":"01012345678","role":"proScout"}'
```

**النتيجة المتوقعة**: 400 برسالة فاليديشن تذكر الحقل `role` والقيم المقبولة — **ليس** 500
ولا خطأ Mongoose عام. أعد نفس الطلب بـ `"role":"coach"` (أو بلا حقل `role` إطلاقاً) للتأكد
أن السلوك القائم (النجاح، والافتراضي `coach` عند الغياب) لم يتغير.

```bash
# فحص عدم وجود نصوص حرفية متبقية خارج المصدر الواحد (يُشغَّل من جذر Backend/)
grep -rn "'admin'\|\"admin\"\|'coach'\|\"coach\"\|'observer'\|\"observer\"" \
  --include="*.js" . \
  | grep -v "^\./tests/" \
  | grep -v "^\./constants/roles.js"
```

**النتيجة المتوقعة**: صفر أسطر (SC-005). أي سطر يظهر هنا لم يُهاجَر بعد.

## 5. التحقق اليدوي — سيناريو US4 (اكتمال جرد الـ API)

```bash
cd Backend
npm run dump-spec
cd ../frontend
npm run gen:types
npm run build
```

**النتيجة المتوقعة**:
- `npm run dump-spec` ينجز بلا أخطاء، والملف الناتج `openapi.json` (جذر المشروع) يحتوي
  عدداً من العمليات يطابق عدد التعريفات الفعلية في `Backend/routes/*.js` (SC-006 — عدّ
  فعلي، لا تقديري، مطلوب في التحقق).
- `npm run gen:types` ينجز بلا أخطاء، و `npm run build` (الواجهة الأمامية) ينجح بلا
  أخطاء أنواع — يثبت أن التغيير لا يكسر أي استهلاك قائم لـ `api.generated.ts`.

## 6. البوابة النهائية قبل الدمج

المعادل الآلي لبوابات CI الثلاث (`.github/workflows/ci.yml`):

```bash
# Backend
cd Backend && npm test

# Frontend
cd ../frontend && npm run build && npx ng test --watch=false --browsers=ChromeHeadless

# E2E — غير متوقع أي فرق (FR-017: لا تغيير مرئي)، لكن يُشغَّل للتأكيد
cd ../e2e && npm test
```

جميعها MUST تمر لاعتبار المرحلة جاهزة للدمج (SC-008، Principle V).
