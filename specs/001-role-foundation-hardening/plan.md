# Implementation Plan: Role Foundation Hardening (المرحلة 0)

**Branch**: `001-role-foundation-hardening` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-role-foundation-hardening/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

مرحلة تمهيدية بدون أي وصول جديد أو سلوك مرئي جديد. تغلق ثلاث ثغرات بنيوية تحجب أي رول
مستقبلي: (1) حرّاس الملكية الأربعة في `middlewares/ownership.js` يرفضون رولاً غير معروف
بالمصادفة (fall-through) لا بالتصميم، و`checkMediaOwnership` يمنح الوصول بناءً على من رفع
الملف فقط دون فحص الرول إطلاقاً؛ (2) حارسا التوجيه في الواجهة الأمامية
(`role.guard.ts`, `dashboard.routes.ts`) يعيدان أي رول بلا وجهة معرّفة إلى داشبورد الكوتش
المحروسة، وهي ترفضه فتنشأ حلقة توجيه لا نهائية، ولا توجد صفحة "غير مصرّح" أصلاً؛
(3) اسم الرول مكتوب كنص حرفي متناثر عبر الباك إند بلا مصدر حقيقة واحد، ولا يوجد أي تحقق
من قيمته عند إنشاء مستخدم. تضيف المرحلة أيضاً إعادة توليد `openapi.json` (ناقص ~22 عملية
اليوم) لأن الجرد الكامل في المرحلة 7 يُبنى عليه.

النهج التقني: كل تعديل إضافة تعداد صريح أو ثابت واحد أو مسار جديد — لا إعادة هيكلة لمنطق
قائم. مجموعة `tests/isolation.test.js` تمر دون تعديل عليها كعقد إثبات؛ اختبارات جديدة
تُضاف بجانبها لتغطية الفروع الافتراضية الجديدة (الرفض الصريح، ووجهة الرول غير المعروف).

## Technical Context

**Language/Version**: JavaScript ESM (Node 22, `"type": "module"`) للباك إند؛ TypeScript
(Angular 21، standalone components + signals) للواجهة الأمامية.

**Primary Dependencies**: Express 5، Mongoose 9، express-validator، express-async-handler
(باك إند). Angular Router، ngx-translate (واجهة أمامية).

**Storage**: MongoDB عبر Mongoose. لا migration بيانات في هذه المرحلة — تعديل تعداد
(`enum`) على مخطط قائم فقط، بلا حقول جديدة ولا backfill.

**Testing**: vitest + mongodb-memory-server (باك إند، تسلسلي `fileParallelism: false`)؛
Karma/Jasmine (واجهة أمامية)؛ Playwright (e2e) — غير مطلوب لمس e2e في هذه المرحلة لأن لا
تغيير مرئي.

**Target Platform**: خدمة ويب (Express API + Angular SPA خلف nginx/dev-server).

**Project Type**: Web application — `Backend/` + `frontend/` منفصلان بـ `package.json`
مستقل لكل منهما (زي ما موثّق في `CLAUDE.md`).

**Performance Goals**: N/A — تغييرات منطقية بحتة (فروع شرطية، تعداد، توجيه)، بلا تأثير
على أداء الاستعلامات أو الفهرسة.

**Constraints**: صفر تغيير سلوك مرئي لأي رول قائم (admin/coach/observer) — هذا هو القيد
المحوري لكل بند في هذه المرحلة، مفروض دستورياً بمبدأ III (NON-NEGOTIABLE).

**Scale/Scope**: 4 حرّاس ملكية، صفحة واجهة واحدة جديدة، ثابت رولات واحد + نقاط استيراد
متعددة في الباك إند، ملف `openapi.json` واحد يُعاد توليده.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| المبدأ | التقييم | كيف تحققه هذه المرحلة |
|---|---|---|
| I — Server-Side Enforcement First | ✅ يمر | التعديلات كلها في `middlewares/ownership.js` (سيرفر). صفحة "غير مصرّح" في الواجهة **انعكاس** لرفض سيرفري قائم بالفعل (`allowedTo`/`ownership.js` يرفضان أصلاً بـ 403) — لا تُقدَّم كدليل منع بديل. |
| II — Deny by Default | ✅ يمر (هدف المرحلة) | US1 يحوّل الرفض من fall-through ضمني إلى تعداد صريح + فرع `default: deny` في الحرّاس الأربعة. لا صلاحية تُمنَح لأي رول — هذا تشديد منع، لا منح. |
| III — No Behavior Change (NON-NEGOTIABLE) | ✅ يمر، مشروط باختبارات الانحدار | FR-003/FR-004/FR-010/FR-014/FR-019 كلها قيود "يبقى كما هو". `tests/isolation.test.js` MUST يمر دون تعديل (FR-019) — هذا هو معيار القبول الحاسم، وسيُتحقق منه فعلياً في نهاية `/speckit-implement`، لا افتراضاً هنا. |
| IV — Single Central Scope Layer | N/A لهذه المرحلة | لا سكوب بيانات جديد يُضاف (ده موضوع المرحلة 2). الحرّاس الأربعة هم الطبقة القائمة المشار لها في الدستور — تُشدَّد لا تُستنسَخ. |
| V — Independently Deployable Phases | ✅ يمر | صفر migration، صفر حقل جديد، صفر رول جديد. كل التغييرات قابلة للـ merge والنشر منفردة. `dump-spec`+`gen:types` مطلوبان في نفس الـ PR بحكم US4. |
| VI — Positive/Negative Test per Permission | ⚠️ يتطلب انتباهاً — انظر أدناه | هذه المرحلة **لا تمنح صلاحية جديدة**؛ المبدأ هنا يُطبَّق بصيغته المعكوسة: كل رفض جديد (الفرع الافتراضي في كل حارس) يحتاج اختباراً يثبته، وكل سلوك قائم يحتاج اختبار انحدار سلبي/إيجابي يثبت بقاءه. الفجوة القائمة في الجرد (69 مقابل ~91) تُغلَق بـ US4 كتمهيد لازم للمرحلة 7، لا كجرد صلاحيات كامل هنا (لا صلاحيات جديدة لتُجرَد). |
| VII — Single Source of Truth for Role Names | ✅ يمر (هدف المرحلة) | US3 هو التطبيق المباشر. القيد الدستوري الإضافي (توحيد منطق الوجهة قبل أي رول رابع) هو US2 بالضبط. |

**لا انتهاكات تحتاج تبريراً — لا حاجة لقسم Complexity Tracking.**

**ملاحظة على C-5 (لا يوجد نظام permissions)**: هذه المرحلة **لا تبني** نظام صلاحيات؛
تُصلح الطبقة الوحيدة الموجودة (RBAC بحقل `role` نصّي) لتفشل مغلقاً بدل أن تفشل بالمصادفة.
هذا متسق مع القيد كما هو مسجَّل في الدستور — لا تناقض.

## Project Structure

### Documentation (this feature)

```text
specs/001-role-foundation-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── ownership-guards.md
│   └── role-landing-and-role-source.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created here)
```

### Source Code (repository root)

مشروع ويب قائم بالفعل (Backend + frontend منفصلان). لا هيكل جديد — تعديلات على ملفات
قائمة فقط، زائد ملفين جديدين محدَّدين:

```text
Backend/
├── constants/
│   └── roles.js                         # جديد — US3: مصدر الحقيقة الوحيد لأسماء الرولات
├── models/
│   └── userModel.js                     # تعديل — enum يشتق من constants/roles.js
├── middlewares/
│   └── ownership.js                     # تعديل — US1: fall-through → switch صريح + default:deny (الأربعة)
├── utils/validation/
│   └── userValidation.js                # تعديل — US3: تحقق من role في createValidate/updateValidate
├── scripts/
│   └── dump-spec.js                     # بلا تعديل — يُشغَّل فقط (US4)
└── tests/
    ├── ownership.test.js                # جديد — US1: unit tests على الحرّاس الأربعة (FR-020)
    └── userValidation.test.js أو ما يعادله — تعديل/جديد — US3: رفض role غير صالح

frontend/src/app/
├── core/
│   ├── auth/
│   │   └── role.guard.ts                # تعديل — US2: fallback إلى /unauthorized بدل التخمين
│   └── services/
│       └── role-landing.service.ts       # جديد — US2/US7: تعريف واحد لاشتقاق الوجهة
├── features/
│   ├── dashboard/
│   │   └── dashboard.routes.ts           # تعديل — US2: يستدعي role-landing.service بدل تكرار المنطق
│   └── unauthorized/                     # جديد — US2
│       └── unauthorized.component.ts
├── app.routes.ts                         # تعديل — US2: إضافة مسار /unauthorized خارج الـ shell
└── core/models/
    └── api.generated.ts                  # يُعاد توليده — US4 (لا تعديل يدوي)

frontend/src/assets/i18n/
├── en.json                               # تعديل — مفاتيح صفحة UNAUTHORIZED
└── ar.json                               # تعديل — نفس المفاتيح بالعربي

openapi.json                              # يُعاد توليده بالكامل — US4
```

**Structure Decision**: الالتزام الكامل بالتقسيم القائم في `CLAUDE.md` — لا حزمة جديدة
ولا مجلد ميزة عابر للمشروعين. الإضافة الوحيدة ذات الوزن المعماري هي
`Backend/constants/roles.js` (نقطة تعريف واحدة تُستورَد من كل مكان، بدل ملف تهيئة أو حزمة
مشتركة منفصلة — أبسط حل يحقق FR-011/FR-012 دون طبقة إضافية) و
`frontend/.../role-landing.service.ts` (نفس المبرر لجهة الفرونت: خدمة واحدة قابلة للحقن
بدل داله مصدَّرة حرة، لتتماشى مع نمط الخدمات القائم في `core/services/`).

## Complexity Tracking

*لا يوجد — بوابة الدستور مرّت بلا انتهاكات تحتاج تبريراً.*

## Post-Design Constitution Re-Check

*بعد Phase 0 (research.md) وPhase 1 (data-model.md, contracts/, quickstart.md).*

القرارات التصميمية الثلاثة المضافة في هذه المرحلة (`Backend/constants/roles.js`،
`frontend/.../role-landing.service.ts`، مسار `/unauthorized` الجذري) لا تُدخل أي طبقة
سكوب بيانات جديدة (Principle IV لا ينطبق) ولا تلمس `ApiFeature`/`ownerFields`/
`baseFilterFn`. الجدول الأصلي في قسم "Constitution Check" أعلاه يبقى صحيحاً بلا تعديل:

- كل عقد جديد في `contracts/` يعيد تأكيد "بلا تغيير سلوك قائم" كشرط تحقق صريح، لا كافتراض.
- `data-model.md` يؤكد صراحة: صفر حقول جديدة، صفر migration — يبقي Principle V سليماً.
- الاستثناء الموثَّق لملفات الاختبارات من هجرة النصوص الحرفية (قرار Q1) مُسجَّل في عقد
  `role-landing-and-role-source.md` بنفس الصياغة المحسومة في `spec.md` — لا انحراف بين
  الـ spec والـ plan.

**النتيجة: البوابة تمر بلا تغيير. لا حاجة لتحديث Complexity Tracking.**
