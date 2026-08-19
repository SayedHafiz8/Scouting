# Contract: Role Landing Destination & Role Source of Truth (US2, US3)

عقدان مستقلان مُجمَّعان في ملف واحد لأنهما صغيران ومترابطان: كلاهما "نقطة تعريف واحدة"
يستدعيها استهلاكون متعددون.

---

## عقد 1: اشتقاق وجهة الرول (US2)

**الموقع**: `frontend/src/app/core/services/role-landing.service.ts` (تفصيل الموضع في
`research.md` §5).

**الواجهة**: دالة واحدة، بلا حالة داخلية (pure):

```
landingFor(role: UserRole | undefined): string[]
```

**جدول القرار الكامل (لا حالات خارج هذا الجدول)**:

| المدخل (`role`) | المخرج |
|---|---|
| `'admin'` | `['/dashboard/admin']` |
| `'coach'` | `['/dashboard/coach']` |
| `'observer'` | `['/dashboard/observer']` |
| أي شيء آخر (`undefined`، نص فارغ، قيمة غير معروفة) | `['/unauthorized']` |

**المستهلكون الملزَمون باستدعاء هذه الدالة — لا بتكرار المنطق**:

1. `core/auth/role.guard.ts` — عند رفض الوصول لمسار محروس بـ `roleGuard([...])`.
2. `features/dashboard/dashboard.routes.ts` — فرع `path: ''` (إعادة التوجيه من
   `/dashboard` العام إلى داشبورد الرول).

**قاعدة الانتهاء (FR-008)**: الوصول لـ `/unauthorized` MUST NOT يُطلق أي إعادة توجيه
أخرى تلقائياً — لا `roleGuard` ولا أي `canActivate` يعيد توجيه المستخدم بعيداً عنها.
المسار مُعرَّف خارج `path: ''` المحروس بـ `authGuard` + `ShellComponent` (تفصيل في
`research.md` §6)، فهو غير خاضع أصلاً لأي حارس رول.

### معايير التحقق (يُختبَر آلياً)

- لكل من القيم الثلاث المعروفة: `landingFor(role)` يُرجع نفس المسار الذي كانت السلسلة
  الثلاثية القديمة تُرجعه — **بلا أي فرق**، بمقارنة مباشرة مع سلوك ما قبل التعديل
  (`role.guard.spec.ts` القائم يوثّق هذا السلوك: كوتش مرفوض من مسار admin-only يُعاد
  توجيهه لـ `/dashboard/coach`، إلخ — هذه الاختبارات القائمة MUST تستمر بالنجاح بلا
  تعديل عليها).
- لأي قيمة خارج الثلاث: `['/unauthorized']`.
- `role.guard.ts` و `dashboard.routes.ts` كلاهما يستدعيان `landingFor` — لا نسخة محلية
  من المنطق في أي منهما بعد التعديل.

---

## عقد 2: مصدر الحقيقة لأسماء الرولات (US3)

**الموقع**: `Backend/constants/roles.js`.

**الواجهة**:

```
ROLES: { ADMIN: 'admin', COACH: 'coach', OBSERVER: 'observer' }
ROLE_VALUES: string[]   // = Object.values(ROLES)، بنفس الترتيب القائم في userModel.js اليوم
```

**المستهلكون الملزَمون**:

1. `models/userModel.js` — حقل `role.enum` MUST يُبنى من `ROLE_VALUES`، لا يُكتب حرفياً.
2. `utils/validation/userValidation.js` — `createValidate` و `updateValidate` MUST
   تتحقق من أن `role` (إن أُرسِل) ضمن `ROLE_VALUES`.
3. `middlewares/ownership.js` — الفروع الصريحة الأربعة (تفصيلها في
   `contracts/ownership-guards.md`) MUST تقارن بـ `ROLES.ADMIN` / `ROLES.COACH` /
   `ROLES.OBSERVER`، لا بنصوص حرفية.
4. أي موضع إنتاجي آخر في `Backend/` يقارن أو يفحص قيمة `role` حرفياً (`controllers/*.js`,
   `services/*.js`, `socket/handlers/*.js` — القائمة الكاملة تُحدَّد وقت التنفيذ ببحث
   شامل) MUST يستورد من هذا الملف بدل تكرار النص الحرفي.

**استثناء موثَّق (قرار `/speckit-clarify` Q1)**: ملفات الاختبارات (`Backend/tests/**`)
**مستثناة عمداً** — تحتفظ بأسماء الرولات كنصوص حرفية لتبقى أوراكل مستقل عن الثابت الذي
تختبره. البذور والسكربتات (`Backend/seeds/**`, `Backend/scripts/**`) تُعامَل معاملة
الإنتاج (تستورد من `constants/roles.js`) لأنها كود تشغيل فعلي لا أوراكل اختبار.

### معايير التحقق (يُختبَر آلياً)

- `User.schema.path('role').enumValues` (أو ما يعادلها) يطابق `ROLE_VALUES` تماماً —
  بلا فرق في العدد أو الترتيب أو القيم.
- طلب إنشاء/تعديل مستخدم بقيمة `role` خارج `ROLE_VALUES` يُرفَض بخطأ فاليديشن (لا خطأ
  Mongoose عام).
- بحث نصي عن الأنماط الحرفية `'admin'` / `'coach'` / `'observer'` (وما يعادلها من علامات
  اقتباس) في مصدر `Backend/` الإنتاجي (مستثنى: `Backend/tests/**`) لا يُنتج أي نتيجة خارج
  `Backend/constants/roles.js` نفسه.
