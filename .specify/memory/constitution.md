<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.1 → 1.0.2
Bump rationale: PATCH, by owner decision. Constraint C-4 gains an explicit, bounded
exception: players flagged `isProfessional: true` carry no `ageGroup`. No principle was
added, removed, or redefined; no governance rule changed meaning; no existing role's
behavior is altered by the text.

  ⚠️ Honest note for reviewers: a reasonable reader could argue this is MINOR rather
  than PATCH, since it carves out an exception that did not previously exist rather than
  merely clarifying wording. The PATCH classification rests on the reading that C-4's
  original sentence was authored to mean "do not delete the field from the schema, and
  do not let the new role read age-group data" — a scenario in which adult players with
  no age group at all were never contemplated. The owner made this call explicitly. It
  is recorded here rather than silently assumed, so a future reviewer can revisit the
  classification without having to reconstruct the reasoning.

  This is NOT a weakening of Principles I–IV, so the "documented security review" clause
  in Governance is not triggered: the exception touches a derived descriptive field, not
  authentication, authorization, ownership, or data scoping. The proScout scope shape in
  C-4 is unchanged.

Modified principles: none (I–VII unchanged in title, wording, and force)

Modified sections:
  - Constraint C-4 — added "الاستثناء الوحيد المسموح" (the `isProfessional` carve-out)
    plus four binding implementation constraints on that exception: server-only
    assignment with `lockField` on create AND update; the exception is limited to the
    birth-year range and the `ageGroup` derivation and MUST NOT be read as a general
    exemption; the youth path stays byte-identical and must be proven by a coach
    regression test; and `SeasonMatch.ageGroup` stays `required: true` with no exception.

Added sections: none
Removed sections: none

Motivating context: professional players are adults, and the youth birth-year window
(2007→2019) made them impossible to register. Implemented in Stage 4b — see
`specs/005-proscout-players-write/` (data-model.md invariant I-4, PR-DESCRIPTION.md).
Age groups for 1996→2006 were deliberately NOT created: doing so would have added eleven
new cards to the age-group grid for coach and admin, which the owner ruled out.

Deferred items / TODOs (carried forward, unchanged):
  - TODO(AGES_UNAUTHENTICATED_READ): `GET /ages` and `GET /ages/:id` carry no `protect`
    at all. Logged as tech debt outside the plan's scope by owner decision; see C-3.
    Confirmed still open as of Stage 4.
  - TODO(PLAYER_OWNER_FIELD): CLOSED by Stage 2 — `Player.createdBy` now exists with a
    backfill script. Listed here only to close the loop from v1.0.1.

Templates read at runtime (plan/spec/tasks/checklist) are unmodified by design — the
Scope Guard limits this command to the constitution itself.
-->

# Talent Radar Constitution

## Core Principles

### I. Server-Side Enforcement First (الأمان على السيرفر أولاً)

إخفاء عنصر من الواجهة **ليس** صلاحية. كل تقييد وصول MUST يُفرَض على مستوى الـ API
والاستعلام في `Backend/`، والواجهة في `frontend/` هي انعكاس لذلك القرار لا مصدره.

القواعد الملزمة:

- أي قدرة جديدة MUST تُمنَع من السيرفر أولاً، ثم تُخفى من الواجهة ثانياً — وليس العكس.
- إخفاء رابط أو زر أو تبويب MUST NOT يُقدَّم كدليل على أن الوصول ممنوع، في أي spec أو
  plan أو مراجعة PR.
- إثبات المنع MUST يكون استجابة HTTP فعلية (403/404) من اختبار على مستوى الـ API، وليس
  لقطة شاشة أو snapshot للواجهة.
- الرد على محاولة وصول ممنوعة MUST يكون رفضاً صريحاً (403، أو 404 عند حاجة عدم كشف
  الوجود) — وليس 200 بجسم فارغ. قائمة فارغة تعني "لا توجد بيانات"، لا "ممنوع".

**الأساس المنطقي:** الواجهة كود يعمل على جهاز المستخدم؛ أي شرط فيها قابل للتجاوز عبر
`curl` أو devtools. الطبقة الوحيدة التي لا يتحكم بها المستخدم هي الاستعلام في الباك إند.

### II. Deny by Default (المنع هو الأصل)

أي رول جديد MUST يبدأ بصفر صلاحيات، وكل صلاحية تُمنَح صراحةً ومكتوبة.

القواعد الملزمة:

- إضافة رول إلى `enum` الرولات MUST NOT تمنحه أي وصول ضمني.
- في `ApiFeature.filter()` — أي رول غير مذكور في `ownerFields` MUST يسقط على
  `MATCH_NOTHING`. هذا السلوك قائم في `Backend/utils/apiFeatures.js` ويُمنع إضعافه.
- في `middlewares/ownership.js` — أي رول جديد MUST يُضاف كفرع صريح. الاعتماد على
  الـ fall-through الحالي (الذي يعامل "أي شيء ليس admin وليس observer" كـ coach)
  MUST NOT يُعتبر منعاً مقصوداً؛ راجع القيد C-2.
- كل endpoint MUST يحمل `allowedTo(...)` صريحاً. غياب `allowedTo` يعني "كل رول مسجّل"،
  وهو انتهاك لهذا المبدأ ما لم يُوثَّق كاستثناء معتمد (راجع C-3).
- endpoint جديد يُضاف مستقبلاً MUST يكون مرفوضاً للرول الجديد افتراضياً، ويُثبَت ذلك في
  جرد الـ endpoints المطلوب في Principle VI.

**الأساس المنطقي:** allowlist تفشل مغلقة عند النسيان؛ denylist تفشل مفتوحة. البيانات
المعنية بيانات لاعبين قاصرين، وتكلفة الفشل المفتوح غير مقبولة.

### III. No Behavior Change for Existing Roles (NON-NEGOTIABLE)

سلوك `admin` و `coach` و `observer` MUST يبقى مطابقاً تماماً قبل وبعد أي تغيير.

القواعد الملزمة:

- `Backend/tests/isolation.test.js` هو العقد الملزم لعزل البيانات. اختباراته MUST تمر
  دون تعديل. تعديل أي توقُّع فيه MUST يُعامَل كتغيير كاسر ويستلزم مراجعة أمنية موثَّقة
  في الـ PR، ولا يُدمَج بمراجعة عادية.
- كل مرحلة MUST ترفق اختبارات انحدار تثبت — لكل رول قائم — أن **عدد** النتائج المرجعة
  و**محتواها** لم يتغيرا على: `GET /players`, `GET /players/counts`,
  `GET /players/reports/average-ratings`, `GET /seasonMatches`, `GET /dashboard/*`.
- أقنعة العرض القائمة MUST تبقى سليمة: `maskObservedForCoach` (الكوتش يرى `observed`
  كـ `pending` ولا يرى `observers`) و `maskCoachForObserver` (الأوبزيرفر لا يرى
  `player.coach`).
- سكوب الأوبزيرفر على المباريات (`seasonMatchBaseFilterFor` في
  `controllers/seasonMatchController.js`) MUST يبقى كما هو ما لم يكن التغيير هو موضوع
  المرحلة صراحةً.
- "لم يتأثر سلوكه" MUST يُثبَت باختبار يفشل لو تغيّر السلوك — لا بمراجعة بصرية للكود.

**الأساس المنطقي:** إضافة رول تلمس طبقات مشتركة (`ApiFeature`, `ownership.js`,
`role.guard.ts`). الانحدار الصامت في هذه الطبقات يظهر كتسريب بيانات، لا كخطأ ظاهر.

### IV. Single Central Scope Layer (طبقة نطاق واحدة)

منطق تحديد نطاق البيانات MUST يُعرَّف مرة واحدة في طبقة مركزية، وكل الاستعلامات تمر
من خلالها.

القواعد الملزمة:

- أي سكوب جديد MUST يُنفَّذ عبر الآليات القائمة حصراً: `ownerFields` في
  `ApiFeature.filter()` للحالات البسيطة، أو `baseFilterFn(req)` في
  `services/gettingAll` للحالات المركّبة (النموذج المرجعي: `seasonMatchBaseFilterFor`).
- كتابة شرط فلترة يدوي داخل controller أو route handler MUST NOT تحدث. لو الحالة لا
  تُعبَّر عنها بالطبقة المركزية، الطبقة المركزية هي التي تُوسَّع.
- أسبقية الدمج MUST تبقى: `query العميل` < `param المسار` < `سكوب الملكية`. سكوب الملكية
  يُطبَّق **آخراً** دائماً، فلا يستطيع أي مدخل من العميل توسيعه أو استبداله.
- فلاتر العميل MUST تُدمَج مع النطاق بـ AND، ولا تستبدله أبداً.
- `baseFilterFn` MUST ترجع plain object، لا Mongoose Query.
- المفاتيح غير المدرجة في `allowed: [...]` MUST تُسقَط لا تُدمَج.
- الوصول المباشر بـ ID خارج النطاق MUST يُرفَض من طبقة `ownership.js`، لأن `ApiFeature`
  تحكم القوائم فقط ولا تحمي مسارات `/:id`.
- كل محاولة وصول مرفوضة MUST تُسجَّل بما يكفي للتحقيق: معرّف المستخدم، الرول، المسار،
  ومعرّف المورد المطلوب.

**الأساس المنطقي:** تكرار منطق الفلترة يعني أن endpoint واحداً منسياً يهدم العزل كله.
نقطة تعديل واحدة تعني نقطة مراجعة واحدة ونقطة فشل واحدة.

### V. Independently Deployable Phases (كل مرحلة قابلة للنشر بمفردها)

كل مرحلة MUST تكون قابلة للدمج والنشر إلى الإنتاج بمفردها دون كسر الموجود ودون انتظار
المرحلة التالية.

القواعد الملزمة:

- مرحلة تترك النظام في حالة وسيطة مكسورة MUST NOT تُدمَج. تُقسَّم أو تُؤجَّل.
- كل مرحلة MUST تمر على كامل بوابات CI (`Backend` vitest، `frontend` build + karma،
  Playwright) قبل الدمج — الثلاثة حاجزة.
- تغيير شكل أي route MUST يصحبه `npm run dump-spec` في `Backend/` ثم `npm run gen:types`
  في `frontend/` في نفس الـ PR، لأن `UserRole` مشتق من `openapi.json`.
- أي migration أو seeder MUST يكون له مسار تراجع (rollback) موثَّق ومجرَّب.
- خطوة تمهيدية يحتاجها أكثر من مرحلة (مثل توحيد ثوابت الرولات، أو إصلاح
  `role.guard.ts`) MUST تُنجَز في أبكر مرحلة تعتمد عليها، لا أن تُترك ضمنية.

**الأساس المنطقي:** المراحل القابلة للتراجع منفردة تحصر أثر أي خطأ في مرحلة واحدة،
وتسمح بإيقاف العمل عند أي حد دون ترك النظام نصف مبني.

### VI. Positive and Negative Test per Permission

كل صلاحية جديدة MUST يقابلها اختباران على الأقل: إيجابي وسلبي.

القواعد الملزمة:

- **الاختبار الإيجابي:** المسموح له يحصل على البيانات المتوقعة بالضبط — العدد والمحتوى،
  لا مجرد 200.
- **الاختبار السلبي:** الممنوع يُرفَض بـ **403 (أو 404 حيث يجب عدم كشف الوجود)** —
  و MUST NOT يُقبَل 200 بجسم فارغ كدليل على المنع.
- كل مرحلة تمس الصلاحيات MUST ترفق جرداً لكل endpoints المشروع وقرار كل واحد منها
  للرول المعني (`مسموح` / `مرفوض`)، بحيث يكون الافتراضي هو الرفض. الجرد MUST يُبنى على
  ملفات `Backend/routes/*.js` بعد تحديث `openapi.json`، لا على `openapi.json` وحده —
  الملف كان ناقصاً تاريخياً بما يقارب 22 عملية (Teams كاملاً، `/dashboard/observer`،
  `/players/counts`، مسارات الـ vault، وغيرها).
- الحالات الملزمة في كل مجموعة اختبارات صلاحية:
  - وصول مباشر بـ ID خارج النطاق ← مرفوض.
  - تمرير query param يحاول توسيع النطاق ← يُتجاهَل، والنتيجة تبقى داخل النطاق.
  - البحث والترتيب والـ pagination ← تعمل داخل النطاق فقط.
- الاختبارات MUST تُبنى بـ `Backend/tests/helpers/factory.js` لا باستدعاءات `create`
  مباشرة، والـ I/O الخارجي يبقى mocked كما في `tests/setup.js`.

**الأساس المنطقي:** الاختبار الإيجابي وحده يثبت أن الميزة تعمل، ولا يثبت أن العزل قائم.
قائمة فارغة تبدو كمنع وهي في الحقيقة قد تكون بيانات غائبة — التمييز بينهما يتطلب رمز
حالة صريحاً.

### VII. Single Source of Truth for Role Names

أسماء الرولات MUST تُعرَّف في ثابت واحد ويُشار إليها منه، ولا تُكتب كنصوص متناثرة.

القواعد الملزمة:

- الباك إند: ثابت مُصدَّر واحد MUST يكون مصدر الحقيقة، و
  `Backend/models/userModel.js` (`role.enum`) يشتق منه — لا العكس ولا تعريفان متوازيان.
- الفرونت إند: `UserRole` MUST يبقى مشتقاً من `openapi.json` عبر
  `core/models/api.generated.ts`، كما هو الحال في `core/models/user.model.ts`.
- string literal لاسم رول (`'coach'`, `"admin"`, `'observer'`) MUST NOT يُضاف في أي كود
  جديد. الكود القائم يُهاجَر عند لمسه.
- منطق تحديد الوجهة حسب الرول MUST يُعرَّف مرة واحدة. التكرار الحالي بين
  `core/auth/role.guard.ts` و `features/dashboard/dashboard.routes.ts` MUST يُوحَّد قبل
  إضافة أي رول رابع؛ راجع القيد C-1.
- التنقّل في الواجهة MUST يُبنى من الصلاحيات لا من شرط مكتوب يدوياً على اسم الرول.

**الأساس المنطقي:** التعريفات المتناثرة تنجرف. رول يُضاف في مكان ويُنسى في آخر ينتج عنه
وصول غير مقصود أو حلقة إعادة توجيه لا نهائية — وكلاهما تسبَّب فيه تكرار موجود اليوم.

## Security & Access Control Constraints

### الطبقات الثلاث الملزمة

العزل مفروض في ثلاث طبقات مستقلة، وكل واحدة MUST تُعالَج صراحةً عند إضافة أي رول:

| الطبقة | الموضع | الدور |
|---|---|---|
| بوابة الرول | `controllers/authController.js` → `protect` + `allowedTo(...roles)` | مصادقة + بوابة رول خشنة على كل route |
| سكوب القوائم | `utils/apiFeatures.js` → `ApiFeature.filter()` / `buildOwnerScope` | نطاق endpoints القوائم؛ نقطة الـ deny-by-default الفعلية |
| ملكية المستند | `middlewares/ownership.js` | حرّاس مسارات `/:id` لكل مورد |

الثلاثة MUST تُركَّب معاً على كل route حسّاس، بالنمط القائم:
`protect, allowedTo("coach"), checkPlayerOwnership, updateValidate, update`.

### القرارات المحسومة (Resolved Decisions)

هذه قرارات نهائية من مالك المشروع. MUST تُتَّبع كما هي، و MUST NOT يُعاد فتحها في أي
spec أو plan دون تعديل دستوري:

- **C-3 — القراءات المفتوحة: تبقى مفتوحة.** `GET /ages` و `GET /ages/:id` و
  `GET /teams` و `GET /teams/:id` MUST يبقى سلوكها كما هو تماماً لـ `admin` و `coach`
  و `observer`. **Principle III له الأسبقية على Principle II هنا**، لأن إغلاقها يكسر
  الفلاتر والـ dropdowns في صفحات قائمة ويُعد تغيير سلوك لرول قائم.
  - الرول الجديد MUST يُمنَع من `/ages` و `/ages/:id` صراحةً عبر `allowedTo` — المنع
    صريح لا ضمني، تطبيقاً لـ Principle II.
  - `GET /teams` و `GET /teams/:id` MUST تُسكَب للرول الجديد بـ `league` عبر
    `baseFilterFn` في الطبقة المركزية (Principle IV). ملاحظة تنفيذية: `Team` لا تملك
    `ownerFields` عمداً (داتا مرجعية مشتركة) و `TEAM_FILTERS` تسمح بـ `league` بالفعل،
    فالسكوب إضافة على `gettingAll(Team, …)` لا تعديل في سلوك قائم.
  - غياب `protect` كلياً عن `/ages` (قراءة متاحة لغير المسجّلين) MUST يُسجَّل كـ tech
    debt منفصل خارج نطاق هذه الخطة، ولا يُعالَج ضمن مراحلها —
    TODO(AGES_UNAUTHENTICATED_READ).

- **C-4 — تعريف "القسم الثاني": `league: "professional"`.** هذا هو التعريف الوحيد
  المعتمد، و MUST يُطبَّق بالأشكال التالية حصراً من الطبقة المركزية:

  **سكوب اللاعبين** (مركّب — الفرق الاحترافية، بالإضافة إلى لاعبي الرول الجديد الذين
  لم يُربطوا بفريق بعد):

  ```js
  { $or: [
      { team: { $in: <ids فرق professional> } },
      { team: null, createdBy: <userId> }
  ] }
  ```

  **سكوب المباريات:**

  ```js
  { league: "professional" }
  ```

  قيود تنفيذية ملزمة:

  - الفرع الثاني موجود لأن `Player.team` قيمته `default: null` (البديل `teamName` نص
    حر)، فلاعب جديد قد لا ينتمي لأي فريق ومن ثَم لأي دوري. بدونه يفقد الرول لاعبيه
    لحظة إنشائهم.
  - **`createdBy` ليس حقلاً على مخطط `Player` اليوم** — هو موجود على `SeasonMatch`
    فقط، وحقل الملكية القائم على `Player` هو `coach`. المرحلة التي تنفّذ هذا السكوب
    MUST إما تُنشئ الحقل صراحةً مع backfill، أو تربطه بحقل ملكية قائم بقرار موثَّق.
    استخدامه قبل وجوده MUST NOT يحدث: `strictQuery` غير مضبوط في المشروع، فالافتراضي
    يمرّر المسار المجهول إلى MongoDB ويطابق صفر مستندات **بصمت** — يفشل مغلقاً، لكنه
    يكسر فرع اللاعبين اليتامى دون أي خطأ ظاهر. TODO(PLAYER_OWNER_FIELD).
  - `<ids فرق professional>` MUST تُشتَق داخل الطبقة المركزية، ولا تُمرَّر من العميل.
  - هذا السكوب MUST يُنفَّذ عبر `baseFilterFn` (Principle IV)، لأن شكله `$or` مركّب لا
    يُعبَّر عنه بـ `ownerFields`. النموذج المرجعي هو `seasonMatchBaseFilterFor`.
  - `ageGroup` يبقى `required: true` على `SeasonMatch` ومشتقاً إجبارياً على `Player`.
    التعريف أعلاه MUST NOT يُفهَم كإذن بإزالته أو تجاوزه — الرول الجديد يُمنَع من
    *قراءة* بيانات الفئات العمرية، والحقل نفسه يبقى قائماً في المخطط.

    **الاستثناء الوحيد المسموح:** لاعبون بعلامة `isProfessional: true` (لاعبو دوري
    المحترفين اللي رول `proScout` بيكتشفهم) لا يحملون `ageGroup` إطلاقاً، لأن مفهوم
    الفئة العمرية خاص بالناشئين حصراً وليس جزءاً من نطاق عملهم. هذا لا يُعتبر إزالة
    أو تجاوزاً للحقل — الحقل يبقى مشتقاً إجبارياً لكل لاعب ناشئ كما هو، والاستثناء
    محصور في هذا النوع الوحيد من اللاعبين.

    قيود تنفيذية على الاستثناء (ملزمة، وتُقرأ كجزء منه لا كتعليق عليه):

    - `isProfessional` MUST يُحدَّد من السيرفر وحده، من رول المُنشئ وقت الإنشاء.
      MUST يحمل `lockField` في **الإنشاء والتعديل معاً** — بدون قفل التعديل يستطيع
      أي كوتش رفع قيد سنة الميلاد (2007→2019) عن لاعبه وتفريغ فئته العمرية بطلب
      `PATCH` عادي.
    - الاستثناء يشمل **بندين فقط**: مدى سنة الميلاد المسموح، واشتقاق `ageGroup`.
      MUST NOT يُوسَّع ليشمل أي قيد آخر (الملكية، النطاق، الأقنعة، أو حراس
      `ownership.js`) — علامة "محترف" ليست إعفاءً عاماً.
    - مسار اللاعب الناشئ MUST يبقى مطابقاً حرفياً: نفس المدى، نفس الاشتقاق، ونفس
      رسالة `No age group is configured` (Principle III). يُثبَت باختبار انحدار على
      `coach`، لا بمراجعة بصرية.
    - `ageGroup` يبقى `required: true` على `SeasonMatch` **بلا استثناء** — هذا
      الاستثناء يخص `Player` وحده.

### القيود المعروفة (Known Enforcement Gaps)

هذه ثغرات قائمة في الكود اليوم. MUST تُعالَج صراحةً في أول مرحلة تعتمد عليها، و
MUST NOT يُفترَض أنها آمنة:

- **C-1 — حلقة إعادة توجيه في `role.guard.ts`:** الـ fallback يعيد أي رول ليس
  `admin`/`observer` إلى `/dashboard/coach`، وهو محروس بـ `roleGuard(['coach'])`.
  أي رول رابع يقع في حلقة لا نهائية. المنطق مكرر في `features/dashboard/dashboard.routes.ts`.
  لا يوجد مسار `/unauthorized`.
- **C-2 — fall-through في `ownership.js`:** `checkPlayerOwnership` يفحص `admin` ثم
  `observer` ثم يفترض أن الباقي كوتش ويقارن بـ `player.coach`. الرفض هنا مصادفة لا
  تصميم. و `checkMediaOwnership` يقارن `uploadedBy` فقط، فأي رول جديد يرى الميديا التي
  رفعها هو دون تعريف صريح.
- **C-5 — لا يوجد نظام permissions:** النظام القائم RBAC خام مبني على حقل `role` نصّي
  واحد. لا يوجد permission model ولا جدول صلاحيات ولا seeder للرولات، و
  `utils/validation/userValidation.js` لا يتحقق من `role` إطلاقاً — الـ mongoose enum هو
  خط الدفاع الوحيد. أي spec يفترض وجود نظام صلاحيات جاهز MUST يُصحَّح أو يُرفَق ببناء
  الطبقة صراحةً.

### قواعد البيانات الحساسة

- الحقول السرّية MUST تُزال في `toJSON` transform للموديل، لا في projection الـ route
  فقط.
- الحذف الناعم على `User` MUST يبقى محكوماً بـ hook الـ `pre(/^find/)`، والتجاوز صريح
  عبر `.setOptions({ bypassFilter: true })` فقط.
- بيانات الـ vault (بطاقات الهوية) MUST تبقى admin-only خلف `requireVaultToken`، ولا
  تُمنَح لأي رول جديد.

## Development Workflow & Quality Gates

### دورة كل مرحلة

`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` →
`/speckit.analyze` → `/speckit.implement` → مراجعة بشرية → merge.

- أي `[NEEDS CLARIFICATION]` MUST يُحسَم في `/speckit.clarify` قبل `/speckit.plan`.
  الافتراضات الضمنية ممنوعة في مسائل الصلاحيات والنطاق.
- المراحل ذات الخطورة العالية (طبقة النطاق تحديداً) MUST تحصل على مراجعة بشرية مركّزة
  على العزل، لا مراجعة عامة.

### بوابات الجودة

- CI (`.github/workflows/ci.yml`) MUST يمر بالكامل: `Backend` vitest، `frontend`
  build + karma، ثم Playwright. الثلاثة حاجزة.
- اختبارات الباك إند تعمل تسلسلياً (`fileParallelism: false`) على mongo في الذاكرة مع
  تنظيف الكولكشنات في `beforeEach`. الفكسترز MUST تُبنى من
  `tests/helpers/factory.js`.
- الفاليديشن MUST يعيش في `Backend/utils/validation/*.js` كسلاسل express-validator
  تُطبَّق كـ route middleware قبل الـ controller.
- الأخطاء MUST تمر عبر `AppError` + `middlewares/errorMiddleware.js` — المنسّق الوحيد.
- الترتيب في Express 5 MUST يُحترَم: المقاطع الحرفية (`/counts`,
  `/reports/average-ratings`) تُعلَن قبل `/:id`.
- النصوص الظاهرة للمستخدم MUST تُضاف بالإنجليزية والعربية معاً في
  `frontend/src/assets/i18n/*.json`.
- التعليقات العربية في `Backend/` التي توثّق قرارات أمنية (المراجع `B1`, `C3`, `F4`,
  `§9`, `§11` …) MUST تُحفَظ عند تعديل الكود المجاور — هي توثيق *لماذا* وُجد القيد.

## Governance

هذا الدستور يعلو على أي ممارسة أو عرف آخر في المشروع. عند التعارض بين الدستور وأي وثيقة
أخرى (بما فيها `CLAUDE.md` و `docs/scout-pro-plan-v2.md`)، الدستور هو المرجع، وتُصحَّح
الوثيقة الأخرى.

**إجراءات التعديل:**

- أي تعديل MUST يُقدَّم كـ PR يعدّل `.specify/memory/constitution.md` وحده، ويحمل تبريراً
  مكتوباً وتقييماً لأثره على المراحل المخطَّطة.
- إضعاف أي مبدأ من I أو II أو III أو IV MUST يستلزم مراجعة أمنية موثَّقة وموافقة صريحة
  من مالك المشروع. "احتياجات الجدول الزمني" ليست تبريراً كافياً.
- المبدأ III غير قابل للتفاوض: تعديله يستلزم إصداراً MAJOR ومراجعة مستقلة.

**سياسة الإصدار (semantic versioning):**

- **MAJOR** — حذف مبدأ أو إعادة تعريفه بشكل غير متوافق مع ما سبق.
- **MINOR** — إضافة مبدأ أو قسم جديد، أو توسيع جوهري في الإرشاد.
- **PATCH** — توضيحات وصياغة وتصحيحات لا تغيّر المعنى.

**مراجعة الامتثال:**

- كل PR MUST يُراجَع مقابل المبادئ السبعة. المراجع يرفض الدمج عند مخالفة أي منها.
- كل PR يمس الصلاحيات أو النطاق MUST يُصرّح في وصفه: أي طبقة من الطبقات الثلاث لمسها،
  وأي قيد من C-1…C-5 عالجه أو اعتمد عليه.
- التعقيد MUST يُبرَّر. الحل الأبسط الذي يحقق المبادئ هو الحل المطلوب.
- `CLAUDE.md` هو مرجع التوجيه أثناء التطوير اليومي، ويظل تابعاً لهذا الدستور.

**Version**: 1.0.2 | **Ratified**: 2026-08-19 | **Last Amended**: 2026-08-22
