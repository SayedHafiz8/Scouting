# خطة إضافة رول كشّاف المحترفين — النسخة 2

> **مبنية على فحص الكود الفعلي، وبتلغي النسخة الأولى.**
> الأوامر في النسخة المنصّبة عندك بشرطة: `/speckit-specify` مش `/speckit.specify`.

---

## القرارات المحسومة

| البند | القرار |
|---|---|
| اسم الرول | `proScout` (بديل: `scout` — متاح لأنه مفيش رول بالاسم ده أصلاً) |
| "القسم الثاني" | `league: "professional"` على `Team` و `SeasonMatch` |
| الصلاحيات | قراءة + كتابة تقارير وميديا + إنشاء/تعديل لاعبين + تسجيل حضور المباريات |
| لاعبين `team: null` | يشوفهم لو هو اللي أضافهم |
| حقل الملكية | `createdBy` جديد على `Player` (موصى به) |
| "الرول القديم للكشافين" | مش موجود — البند يتحوّل لـ regression على `coach` و `observer` |

## قرارات لسه مفتوحة (احسمها في `/speckit-clarify`)

1. **حقل الملكية**: `createdBy` جديد ولا إعادة استخدام `coach`؟
2. **`maskObservedForCoach`**: الرول الجديد يشوف حالة `observed` وحقل `observers` ولا يتخفوا عنه زي الكوتش؟
3. **`PATCH /seasonMatches/{id}/status`**: تسجيل الحضور مسموح — بس هل يدخّل نتيجة المباراة كمان؟ (توصية: **لأ**، حضور بس)
4. **`GET /ages`**: مفتوحة بدون `protect` — ثغرة قايمة. توصية: **سجّلها tech debt منفصل** ومتصلحهاش هنا (تصليحها يخالف مبدأ عدم المساس بالسلوك القائم).

---

## السكوب المطلوب (المرجع الفني لكل المراحل)

**اللاعبون:**
```js
{ $or: [
  { team: { $in: <ids فرق league=professional> } },
  { team: null, createdBy: <userId> }
]}
```

**المباريات:** `{ league: "professional" }` — عبر `baseFilterFn` بنفس باترن الأوبزيرفر في `seasonMatchController.js:24-31`

**الفرق:** `{ league: "professional" }` — `GET /teams` حالياً بدون `allowedTo`

**الفئات العمرية:** خارج النطاق تماماً. الرول مش بيفلتر بيها، فمش محتاج `GET /ages` أصلاً.

---

## المرحلة 0 — تمهيدية (بدون أي سلوك جديد)

**ليه موجودة:** أربع مشاكل بنيوية هتفجّر المراحل اللي بعدها لو ماتحلتش الأول.

```
/speckit-specify

مرحلة تمهيدية لإصلاح أساسات تقنية قبل إضافة رول جديد. ممنوع أي تغيير
في سلوك أي رول قائم (coach / observer / admin).

1. تحديث openapi.json: شغّل npm run dump-spec. الملف الحالي ناقص حوالي
   22 operation (Teams بالكامل، dashboard/observer، players/counts،
   players/{id}/observers، مجموعة users، auth/vaultPassword، وغيرها).
   أي جرد endpoints لاحق لازم يتبني على الملف المحدّث.

2. استخراج الرولات لمصدر حقيقة واحد: دلوقتي 'coach'/'admin'/'observer'
   مكتوبين كـ string literals متناثرة، والـ enum في userModel.js:21-25 هو
   الوحيد. أنشئ constant/enum مُصدَّر واستبدل كل الاستخدامات النصية بيه
   في الباك إند. أضف تحقق من role في utils/validation/userValidation.js
   (حالياً userController.js:157 بياخد req.body.role كما هو).

3. إصلاح حلقة الـ redirect: role.guard.ts:16-19 بيعمل fallback على
   /dashboard/coach لأي رول مش admin/observer، والداشبورد دي محمية بـ
   roleGuard(['coach']) → حلقة لا نهائية لأي رول جديد.
   - أنشئ route /unauthorized (مش موجود).
   - غيّر الـ fallback لـ deny-by-default: أي رول غير معروف → /unauthorized.
   - المنطق مكرر في 3 أماكن (role.guard.ts، dashboard.routes.ts:37-41،
     وثالث) — وحّده في مكان واحد.

4. Refactor لـ middlewares/ownership.js من fall-through لـ explicit deny:
   - checkPlayerOwnership دلوقتي: admin → observer → وبعدين "يفترض الباقي
     كوتش" ويقارن player.coach. أي رول جديد بيترفض بالصدفة مش بالتصميم.
   - checkMediaOwnership بيقارن uploadedBy بدون تحقق من الرول — يعني رول
     جديد يشوف الميديا اللي رفعها من غير أي تعريف صريح.
   - حوّل الأربعة (Player/Report/Media/SeasonMatchAttendee) لـ switch صريح
     على الرول مع default: deny.

معايير القبول:
- tests/isolation.test.js يعدي بالكامل بدون تعديل.
- كل اختبارات الانحدار لـ coach و observer و admin تعدي.
- رول وهمي غير معرّف في الاختبارات يترفض بـ 403 من ownership.js صراحةً.
- openapi.json فيه العدد الفعلي للـ operations.
- لا يوجد أي تغيير مرئي في الواجهة.
```

---

## المرحلة 1 — تعريف الرول (بدون أي وصول)

```
/speckit-specify

أضف رول proScout للنظام. في نهاية المرحلة يقدر يعمل login بس مايشوفش
أي بيانات إطلاقاً.

1. أضف proScout لـ enum الرولات في userModel.js وللـ constant المُصدَّر
   من المرحلة 0، وللتحقق في userValidation.js.
2. شغّل npm run dump-spec ثم npm run gen:types عشان UserRole في
   user.model.ts:5 يتحدّث عبر api.generated.ts.
3. تأكد إن buildOwnerScope في apiFeatures.js:82-91 بيرجع MATCH_NOTHING
   للرول الجديد (deny-by-default) — من غير ما تضيفه لـ ownerFields لسه.
4. الأدمن يقدر يسند الرول لمستخدم عبر آلية إسناد الرولات القائمة.

معايير القبول:
- مستخدم بالرول يعمل login بنجاح ويستقبل توكن صالح.
- GET /players يرجع مصفوفة فاضية (MATCH_NOTHING) مش خطأ.
- كل route عليه allowedTo يرجع 403 للرول ده.
- teamRouter.js:18 (GET /teams بدون allowedTo) موثّق كاستثناء معروف
  هيتعالج في المرحلة 2.
- الفرونت: تسجيل الدخول يوجّه لـ /unauthorized (السلوك المتوقع دلوقتي).
- regression كامل على coach و observer و admin.
```

**ملاحظة تنفيذية (اكتُشفت أثناء التنفيذ الفعلي، `/speckit-implement`):**
`GET /players` هي endpoint الوحيدة من بين الأربعة المرشحة (`GET /players`, `GET /players/counts`,
`GET /players/reports/average-ratings`, `GET /seasonMatches`) اللي انضاف لها `proScout` في
`allowedTo`، لأنها الوحيدة اللي بتعدّي فعلياً على `ApiFeature.filter`/`ownerFields` (طبقة النطاق
المركزية) — غيابه من `ownerFields` بيرجّعله `MATCH_NOTHING` فعلاً. التلاتة التانية
(`getCountsByAgeGroup`, `getAverageRatingsForPlayers`, `seasonMatchBaseFilterFor`) عندها منطق
`if/else` مخصص لكل رول بيرجع فلتر فاضي (`{}` = كل البيانات) لأي رول مش معدود فيه صراحةً — لو
اتضاف `proScout` لـ `allowedTo` بتاعهم من غير ما تتصلح، كان هيسرّب كل بيانات المباريات/العداد،
مش يرجّع صفر. اتسابوا 403 لحد ما ينتقلوا لطبقة النطاق المركزية (مرشّحين لتصليح في المرحلة 2 أو
تصليح منفصل، مش الأربعة كتلة واحدة زي ما كان مفترَض هنا).

كمان اتوسّعت قايمة الاستثناء المعروفة (البند 3 فوق) لتشمل التلاتة دول جنب `GET /teams`: كل
واحدة فيهم endpoint موجودة بالفعل وبترجع نتيجة غير مسكوبة (`{}`/فلتر مش شامل proScout) لأي رول
غير معروف — بس لأن `proScout` نفسه اترفض من بوابة `allowedTo` قبل ما يوصلها، مفيش تسريب فعلي
حصل. التسريب كان هيحصل بس لو الحد ده اتفتح من غير تصليح المنطق الداخلي.

---

## المرحلة 2 — طبقة السكوب

**أخطر مرحلة. راجعها سطر بسطر.**

**ملاحظة صريحة (وارثة من المرحلة 1):** `GET /players/counts` و
`GET /players/reports/average-ratings` و `GET /seasonMatches` اتسابوا **403** عمداً
في المرحلة 1 — مش `MATCH_NOTHING` زي `GET /players`. السبب: فروعهم الحالية
(`getCountsByAgeGroup`, `getAverageRatingsForPlayers`, `seasonMatchBaseFilterFor`)
بترجع استعلام **غير مفلتر** (`{}` = كل البيانات) لأي رول مش معدود فيهم صراحةً،
مش `MATCH_NOTHING`. فتحهم لـ `proScout` عبر `allowedTo` من غير سكوب فعلي كان
هيسرّب كل بيانات العدّادات/المباريات، مش يرجّع صفر. **المرحلة 2 لازم تضيف
الثلاثة دول لطبقة السكوب المركزية (`ownerFields` لو أمكن، أو `baseFilterFn` زي
`seasonMatchBaseFilterFor` تحت) قبل ما تفتحهم من `allowedTo` لـ `proScout` — فتح
الـ`allowedTo` من غير السكوب أولاً هو بالظبط الثغرة اللي المرحلة 1 تجنّبتها
عمداً.**

```
/speckit-specify

أضف سكوب البيانات لرول proScout بحيث يستحيل تقنياً وصوله لبيانات خارج
دوري المحترفين.

1. حقل الملكية: أضف createdBy (ObjectId → User) لـ Player مع migration
   تعمل backfill بقيمة coach لكل اللاعبين القائمين. يتعبّى تلقائياً
   بالمستخدم الحالي عند POST /players.

2. سكوب اللاعبين في apiFeatures.js buildOwnerScope:
   { $or: [
       { team: { $in: <ids فرق league=professional> } },
       { team: null, createdBy: <userId> }
   ]}
   استخرج ids فرق المحترفين مرة واحدة لكل طلب مع cache، مش استعلام لكل لاعب.

3. سكوب المباريات: أضف baseFilterFn ترجع { league: "professional" } بنفس
   باترن الأوبزيرفر في seasonMatchController.js:24-31، وعدّل
   seasonMatchBaseFilterFor بحيث ماترجعش {} للرول ده.

4. سكوب الفرق: teamRouter.js:18 عليه protect بس بدون allowedTo — أي رول
   مسجّل بيشوف كل الفرق. أضف سكوب league للرول الجديد على GET /teams
   و GET /teams/:id من غير ما تغيّر سلوك أي رول قائم.

5. ownership.js: أضف فرع proScout صريح في الأربع دوال (من الـ switch
   المعمول في المرحلة 0)، بنفس منطق السكوب فوق.

6. سجّل (log) كل محاولة وصول مرفوضة.

معايير القبول (اختبارات إلزامية):
- طلب لاعب بـ ID تابع لفريق premier → 403/404 مش 200.
- طلب مباراة league=premier بـ ID مباشر → مرفوض.
- تمرير ageGroup أو league في query params → يُدمج مع السكوب ولا يستبدله؛
  النتيجة تفضل professional فقط.
- لاعب team:null أنشأه مستخدم تاني → مش ظاهر.
- لاعب team:null أنشأه هو → ظاهر.
- عدّ النتائج = العدد المحسوب يدوياً من الداتابيز.
- tests/isolation.test.js يعدي، وعدد ومحتوى نتائج coach/observer/admin
  لم يتغير.
```

**ملاحظة تنفيذية (اكتُشفت أثناء التنفيذ الفعلي، `/speckit-implement`):**

المرحلة اتنفّذت بالكامل. المواصفة والخطة والمهام في `specs/003-proscout-data-scope/`.
النتيجة: **492 تست باك إند بيعدّوا (24 ملف)**، `tests/isolation.test.js` **من غير أي تعديل**،
و84 تست فرونت إند. ستة انحرافات عن نص المرحلة فوق، بترتيب الأهمية:

1. **⚠️ الأهم للمراحل الجاية — كل فلتر نطاق لازم يتلفّ في `$and`.** شروط mongoose
   المتسلسلة بتتدمج بـ**آخر واحد يكسب عند تصادم المفتاح، مش بـAND**. و`league` هو مفتاح
   النطاق **و** فلتر مسموح للعميل في `SEASON_MATCH_FILTERS` و`TEAM_FILTERS`. يعني
   `GET /seasonMatches?league=premier` كان بيرجّع الدوري الممتاز كامل للـproScout. مقيس على
   mongoose 9.7.2:
   `find({league:"professional"}).find({league:"premier"})` → `{"league":"premier"}`.
   الحل: `{ $and: [ { league: "professional" } ] }` — `$and` مش في أي وايت ليست فمفيش مفتاح
   من العميل يقدر يتصادم معاه. **أي مرحلة جاية بتضيف نطاق بمفتاح مُدرج في وايت ليست هتقع في
   نفس الفخ.** سكوب الأوبزيرفر القائم نجا بالصدفة لأنه بيفلتر على `$or`/`homeTeam`/`awayTeam`.
   التفاصيل في `research.md` R12، والتستات اللي بتقفله في `proScoutDataScope.test.js`.

2. **`ApiFeature.buildOwnerScope` اتعدّلت** — الخطة كانت بتقول متتلمسش. الافتراض كان إن
   غياب `proScout` من `ownerFields` بيرجّع `MATCH_NOTHING` "كطبقة حماية إضافية" فوق الفلتر
   الأساسي. ده كان **غلط منطقي**: `MATCH_NOTHING ∧ أي حاجة = صفر دايماً`، يعني مش دفاع في
   العمق — منع كامل للـendpoint. الحل: التفرقة بين "الرول غايب من الماب" (→ `MATCH_NOTHING`،
   المنع-بالافتراض محفوظ كما هو) و"موجود بقيمة `null`" (→ `{}`، معناها متسكوب من طبقة تانية).

3. **`average-ratings` مكانتش غير مفلترة.** ملاحظة المرحلة 1 قالت إن التلات endpoints
   بيرجعوا `{}` لأي رول مش معدود. ده صح في `counts` و`seasonMatches` بس. الـthird كانت
   مسكوبة بالفعل على `match.coach = req.user._id` — بس على المحور الغلط (ملكية التقرير مش
   دوري اللاعب). التصليح: تضييق `?ids=` للاعبين داخل النطاق **مع الإبقاء** على قيد الملكية.

4. **ستة حرّاس في `ownership.js` مش أربعة** — `checkSeasonMatchScope` و`checkTeamScope`
   جداد، لأن `GET /seasonMatches/:id` و`GET /teams/:id` مكانش عليهم أي حارس أصلاً.

5. **`GET /players/:id` اتفتح** مع تطبيق `maskObservedForCoach` على الرول (المنع-بالافتراض):
   `observers` مخفي و`observed` بتظهر `pending`. السؤال مفتوح صراحةً للمرحلة 4.

6. **⚠️ القيد C-3 غير قابل للتنفيذ كما هو مكتوب.** الدستور بيطلب منع الرول من `/ages` و
   `/ages/:id` "صراحةً عبر `allowedTo`" — لكن `ageGroupRouter.js:113,116` فيها `.get(getAll)`
   **من غير `protect` إطلاقاً**، فمفيش `req.user` أصلاً عشان `allowedTo` تشتغل عليه.
   المسارات دي متاحة لغير المسجّلين، وده بند الـtech debt رقم 1 تحت
   (`TODO(AGES_UNAUTHENTICATED_READ)`) المستثنى بقرار المالك. **إضافة `protect` مااتعملتش**
   لأنها تغيير سلوك برّه النطاق. التست بيوثّق الوضع الفعلي (200 بتوكن و200 من غيره) عشان
   محدش يفتكر إن المنع موجود وهو مش موجود. **قفل C-3 فعلياً محتاج حل بند الـtech debt الأول.**

كمان: `scripts/syncAllIndexes.js` مااتلمستش — بيعدّي على `Object.entries(mongoose.models)`
فالـindex الجديد اتسجّل تلقائياً.

---

## المرحلة 3 — التنقّل والراوتنج

```
/speckit-specify

فعّل التنقّل المبني على الرولات لـ sidebar.component.ts.

الوضع الحالي: interface NavItem { roles: UserRole[] } معرّف في سطر 10-15
لكنه غير مستخدم إطلاقاً — القائمة HTML مكتوبة بإيد بـ @if. النتيجة إن أي
رول جديد بيشوف Dashboard و Players و Profile تلقائياً (deny-by-default
غير محقق في الفرونت).

المطلوب:
1. حوّل القائمة لمصفوفة NavItem[] تُبنى من الداتا، وفعّل حقل roles.
2. أي عنصر بدون تطابق رول صريح = مخفي (deny-by-default).
3. أعد إنتاج القائمة الحالية لكل رول قائم بدقة 1:1 — ممنوع أي فرق:
   - Dashboard: الكل
   - Players: الكل (+ فروع status للأدمن فقط، سطر 138)
   - Users / Observers / Age Groups: admin فقط
   - My Matches: coach أو observer
   - Profile: الكل
4. أضف proScout لـ: Dashboard, Players, My Matches, Profile.
   لا يُضاف لـ Age Groups إطلاقاً.
5. Route guards: proScout ممنوع من /age-groups و /users و /observers →
   إعادة توجيه لـ /unauthorized.

معايير القبول:
- سنابشوت للقائمة لكل رول قائم مطابق للسلوك قبل التعديل حرفياً.
- سنابشوت لـ proScout يظهر 4 عناصر بالضبط.
- فتح /age-groups مباشرة بالرول الجديد → /unauthorized، والـ API ترفض كمان.
```

**ملاحظة تنفيذية (اكتُشفت أثناء التنفيذ الفعلي، `/speckit-implement`):**
المرحلة اتنفّذت. المواصفة والخطة والمهام في `specs/004-role-based-navigation/`. خمسة انحرافات عن نص المرحلة فوق:

1. **معيار "4 عناصر بالضبط" اتقلّل لـ2 بقرار المالك.** proScout في نهاية المرحلة دي شايف Players وProfile بس، مش الأربعة. السبب: Dashboard وMy Matches وجهتين لسه مرفوضتين له فعلياً — `/dashboard` بيعدّي على `RoleLandingService.landingFor('proScout')` اللي بيرجع `/unauthorized` (مفيش proScout dashboard لسه)، و`/my-matches` محروسة بـ`roleGuard(['coach','observer','admin'])` وendpoints الحضور لسه `allowedTo(coach, observer)` بس. إضافتهم دلوقتي كانت هتنتج لينكات ميتة. اتسجّلوا كـ`DF-001` (Dashboard ← المرحلة 5) و`DF-002` (My Matches ← المرحلة 6) كـfollow-ups ملزمة، كل واحد سمّى بالظبط التعديل المطلوب في مرحلته.
   **تحديث بعد المرحلة 4:** وقوع proScout في الـdefault كان معناه إن تسجيل دخول **ناجح** بينتهي على `/unauthorized`، وصفحة اللاعبين اللي المرحلة 4 خلّصتها تبقى مش قابلة للوصول من الواجهة. اتضاف `case 'proScout'` صريح في `RoleLandingService` بيرجع `['/players']` — **مؤقت**. المرحلة 5 **تعدّل الـcase ده** لـ`['/dashboard/proScout']`، متضيفش case تاني لنفس الرول (فرعين متناقضين في نفس الـswitch، وأولهم بس اللي بيشتغل). التست اللي بيقفل ده في `role-landing.service.spec.ts`.
2. **"فروع status للأدمن، سطر 138" ده وصف غلط لحالة الكود.** سطر 138 هو شرط الـmini-pitch (ملعب الفورميشن)، مش فروع status. `const STATUS_CHILDREN` والـproperty `statusChildren` معرّفين فعلاً بس الـtemplate ماكانش بيقراهم إطلاقاً — القائمة الحالية مفيهاش أي فروع status من الأساس. اتسابوا كما هم (كود ميت، مش جزء من المهمة).
3. **الأدمن مايشوفش My Matches اليوم**، رغم إن الراوت `/my-matches` مسموح له (`roleGuard(['coach','observer','admin'])`). القائمة القديمة كانت بتشرطها بـ`auth.isCoach() || auth.isObserver()` بس. ده تضارب قائم بين القائمة والراوت اتسابناه زي ما هو (مبدأ III) — مش "تصليح" حصل هنا.
4. **الجرد الشامل لـendpoints (بند المبدأ VI) اتعمله استثناء موثَّق مش تنفيذ.** المرحلة دي مابتلمسش أي `allowedTo` ولا مصدر باك إند إنتاجي، فمفيش قرار endpoint اتغيّر لأي رول. الجرد الكامل فاضل مسؤولية المرحلة 7 (`/speckit-checklist`).
5. **`GET /ages` اتثبت إنه **مش مرفوض** لـproScout ولا لأي زائر بلا توكن** — القيد C-3 (`ageGroupRouter.js:113,116` بدون `protect` إطلاقاً). اتسجّل بتست يوثّق السلوك الفعلي (200 في الحالتين) بدل ما يدّعي رفض مش موجود، عشان اختفاء عنصر Age Groups من القائمة محدش يفهمه إنه قفل الباب فعلياً.

---

## المرحلة 4 — صفحة اللاعبين + الكتابة

```
/speckit-specify

صفحة اللاعبين وصلاحيات الكتابة لرول proScout.

القراءة:
1. عرض لاعبي السكوب من المرحلة 2 (فرق المحترفين + لاعبينه بدون فريق).
2. إزالة فلتر الفئة العمرية وأي عمود أو تبويب مرتبط بيها من الصفحة لهذا
   الرول فقط — الفلاتر تفضل زي ما هي لباقي الرولات.
3. صفحة تفاصيل اللاعب: إخفاء أي قسم يخص الفئة العمرية.
4. البحث والترتيب والـ pagination داخل السكوب فقط.
5. GET /players/counts و GET /players/reports/average-ratings مسكوبة كمان.

الكتابة:
6. POST /players و PATCH /players/{id}: حالياً allowedTo("coach") فقط —
   أضف proScout، مع تعبئة createdBy تلقائياً، ومنع إسناد اللاعب لفريق
   خارج league=professional.
7. POST /players/{playerId}/reports و PATCH/DELETE عليها: أضف proScout
   (حالياً coach + observer).
8. POST /players/{playerId}/media و /media/{id}/download: أضف proScout.
9. PATCH /players/{id}/profileImg: أضف proScout.
10. PATCH /players/{id}/observers يفضل admin فقط — ممنوع عليه.

[NEEDS CLARIFICATION] هل يُطبَّق maskObservedForCoach على proScout؟ يعني
هل يتخفى عنه حقل observers وتتحول حالة "observed" لـ "pending" زي الكوتش؟

معايير القبول:
- محاولة إنشاء لاعب بفريق premier → 403.
- محاولة تعديل لاعب خارج السكوب → 403.
- محاولة كتابة تقرير على لاعب خارج السكوب → 403.
- التصدير (لو موجود) يصدّر السكوب فقط.
- سلوك coach و observer في نفس الصفحة والـ endpoints لم يتغير.
```

**ملاحظة تنفيذية (اكتُشفت أثناء التنفيذ الفعلي، `/speckit-implement`):**
المرحلة اتنفّذت. المواصفة والخطة والمهام في `specs/005-proscout-players-write/`. عشر انحرافات عن نص
المرحلة فوق، بترتيب الأهمية:

1. **نص القراءة كله (البنود 1–5) كان متعمول خلاص في المرحلة 2.** `playerScopeFor` في
   `services/scope.js` بتخدم `getAll` و`counts` و`average-ratings` و`checkPlayerOwnership`، و
   `maskObservedForCoach` كانت متطبّقة على `proScout` بالفعل. البنود دي اتنفّذت كـ**تستات تحقّق**
   مش كود جديد — إعادة كتابتها كانت هتخالف المبدأ IV. الـ`[NEEDS CLARIFICATION]` بتاع
   `maskObservedForCoach` كان متجاوب عليه في الكود من المرحلة 2 (انحراف #5 بتاعها)، والمالك أكّد
   نفس الإجابة قبل كتابة المواصفة.
2. **`DELETE /players/{playerId}/reports/{id}` أدمن-أونلي، مش coach+observer** زي ما البند 7 فوق
   بيقول. الكوتش نفسه مايقدرش يمسح تقرير. `proScout` خد `POST` و`PATCH` بس، والرفض اتقفل بتست.
3. **`/media/{id}/download` أدمن-أونلي بقرار من المراجعة الأمنية (`F7d`)** — البند 8 كان بيطلب
   إضافته. إضافته كانت هتدي الرول الجديد صلاحية مالهاش الكوتش ولا الأوبزيرفر وتعكس قرار موثّق.
   **مااتضافش**، وكذلك `DELETE /media/:id` و`PATCH /media/:id/review`.
4. **فريق برّه الدوري بيترفض بـ400 مش 403** (معيار القبول الأول فوق). التفرقة بين "فريق موجود بس
   دوري تاني" و"فريق مش موجود" **oracle** بيخلي الرول يعدّ فرق الدوري التاني بالتخمين، وده اللي
   `checkTeamScope` قفله في المرحلة 2. معيار القبول اتعدّل في المواصفة بدل ما يتساب تضارب صامت،
   وفيه تست بيقارن الردّين حرف بحرف.
5. **`create` كان بيحط `coach = req.user._id` لأي حد** — يعني `proScout` كان هيبقى "الكوتش" بتاع
   اللاعب، وهو حقل `assignPlayerCoach` نفسه بيرفض فيه أي يوزر مش `role: coach`. الحقل بقى بيتمسح
   لأي رول مش كوتش، والنسبة بتروح لـ`createdBy` بس.
6. **مسارات قراءة التقارير والميديا اتفتحت كمان** (مش مذكورة في النص فوق): `players.routes.ts`
   بيخلي `reports` هي الـchild route الافتراضية لصفحة تفاصيل اللاعب، فمن غيرها فتح أي لاعب بالرول
   ده كان بينتهي بصفحة 403.
7. **`AuthService` مكانش فيه `isProScout`** إطلاقاً — المرحلة 3 تجنّبتها بإنها بنت القائمة من مصفوفة
   `NavItem[]`، لكن صفحة اللاعبين بتفلتر على الـcomputeds دي في ~10 مواضع. اتضافت.
8. **بند tech debt رقم 5 (قائمة الرولات في `user-form.component.ts`) دخل النطاق.** من غيره مفيش
   اختبار يدوي ممكن للرول أصلاً. ⚠️ ملاحظة صريحة: `UserRole` **نوع** مشتق من `openapi.json` ومالوش
   قيمة وقت التشغيل، فالقايمة **مفحوصة وقت الترجمة مش مشتقّة تلقائياً** — إضافة رول لـ`openapi.json`
   مش هتملاها لوحدها.
9. **⚠️ `POST /users/:id/players` ميّت لكل الرولات — بند tech debt جديد.** `playerRouter` متمركّب
   مرتين (`userRouter.js:482`)، و`setUserIdToBody` بيحقن `req.body.coach` من الـURL **قبل**
   `createValidate`، فـ`lockField("coach")` بيرفضه بـ400 دايماً. الافتراض الأولي في `research.md`
   R14 إن ده ثغرة تصعيد صلاحيات كان **غلط** واتصحّح هناك بعد القياس: الـ`lock` بيمسكها فعلاً.
   الـ`delete` في `create` اتساب كدفاع في العمق بس. الراوت نفسه مااتصلحش (تغيير سلوك لرول قائم،
   برّه النطاق) — `TODO(NESTED_PLAYER_CREATE_DEAD)`.
10. **جرد الـendpoints الكامل اتعمل هنا مش اتأجّل** (المبدأ VI بيطلبه من أي مرحلة بتمس الصلاحيات).
    83 operation في `specs/005-proscout-players-write/contracts/endpoint-inventory.md`: 24 مسموح/مسكوب،
    57 مرفوض، 2 (`/ages`) لا ده ولا ده. القيد **C-3 لسه مفتوح** — إيقاف طلب `/ages` من صفحة اللاعبين
    تغيير **نية** مش قفل باب، وفيه تست بيوثّق إن الـendpoint بيرجع 200 بتوكن ومن غيره.

---

## المرحلة 5 — الداشبورد

```
/speckit-specify

داشبورد رول proScout.

1. أنشئ GET /dashboard/proScout بنفس باترن /dashboard/coach و
   /dashboard/observer الموجودين.
2. كل الإحصائيات محسوبة عبر طبقة السكوب من المرحلة 2 — ممنوع كتابة
   استعلامات إحصائية جديدة تتجاوزها.
3. المؤشرات: عدد لاعبيه، المباريات القادمة في دوري المحترفين، آخر النتائج،
   تقاريره الأخيرة.
4. ممنوع أي كارت أو رسم بياني يخص الفئات العمرية.
5. سلوك واضح للحالة الفارغة.
6. dashboard.routes.ts: أضف مسار الرول الجديد للـ mapping بعد إصلاح
   الـ fallback في المرحلة 0.

معايير القبول:
- كل رقم يساوي نظيره المحسوب يدوياً من بيانات league=professional.
- أرقام /dashboard/coach و /dashboard/observer و /dashboard/admin لم تتغير.
```

---

## المرحلة 6 — المباريات وتسجيل الحضور

```
/speckit-specify

صفحة المباريات لرول proScout.

1. GET /seasonMatches و GET /seasonMatches/{id}: مباريات league=professional
   فقط عبر baseFilterFn من المرحلة 2.
2. تفاصيل المباراة: التشكيل والأحداث والنتيجة، مع إخفاء أي ربط بالفئة العمرية
   في الواجهة (الحقل نفسه required في seasonMatchModel.js:4-8 فيفضل في
   الداتا، بس مايتعرضش).
3. الفلاتر: التاريخ والبطولة والخصم — بدون فلتر الفئة العمرية.
4. POST و DELETE /seasonMatches/{id}/attend: أضف proScout (حالياً
   coach + observer)، مع تحقق ownership إن المباراة داخل السكوب.
5. PATCH /seasonMatches/{id}/status: توصية بالمنع — إدخال النتيجة يفضل
   للكوتش. [NEEDS CLARIFICATION] أكّد ده.
6. checkSeasonMatchAttendee في ownership.js: أضف فرع proScout صريح.

معايير القبول:
- مباراة league=premier مش ظاهرة ولا قابلة للوصول بـ ID مباشر.
- تسجيل حضور على مباراة خارج السكوب → 403.
- سلوك coach و observer في المباريات لم يتغير (خصوصاً
  seasonMatchController.js:104-117 لإدخال النتيجة يوم المباراة).
```

---

## المرحلة 7 — التصليب

```
/speckit-checklist

أنشئ تشيك ليست أمان لرول proScout تغطي:

1. جرد كامل من openapi.json المحدّث (بعد dump-spec) لكل operation، وتحديد
   استجابة proScout لكل واحدة: مسموح / 403 / مسكوب. الافتراضي لازم يكون رفض.
2. اختبار سلبي لكل route خاص بالفئات العمرية والمستخدمين والأوبزيرفرز
   والتقييمات (coachEvaluations / observerEvaluations).
3. اختبارات e2e في مجلد e2e/: تسجيل دخول بالرول، التأكد إن الفئات العمرية
   مش في القائمة، ومحاولة الوصول المباشر عبر URL مرفوضة.
4. التأكد إن أي endpoint جديد يُضاف مستقبلاً مرفوض افتراضياً لهذا الرول
   (اختبار على مستوى الراوتر مش على مستوى كل route).
5. مراجعة logs محاولات الوصول المرفوضة.
6. tests/isolation.test.js موسّعة لتشمل الرول الجديد.
7. regression كامل على coach و observer و admin.
```

---

## ملاحظات تشغيلية

- **conversation جديدة في Claude Code لكل مرحلة**، تبدأ بـ:
  `اقرا docs/scout-pro-plan-v2.md وهنشتغل على المرحلة X`
- **branch منفصل لكل مرحلة**، و`tests/isolation.test.js` يتشغّل قبل كل merge.
- المرحلة 0 والمرحلة 2 هما الوحيدتان اللي محتاجين مراجعة بشرية سطر بسطر.
- بعد أي تعديل على الرولات أو الـ routes: `npm run dump-spec` ثم `npm run gen:types`.

## Tech debt مسجّل (خارج نطاق الخطة)

1. `ageGroupRouter.js:112-116` — `GET /ages` و `GET /ages/:id` بدون `protect` إطلاقاً، متاحين لغير المسجّلين.
2. `teamRouter.js:18` — `GET /teams` بـ `protect` بدون `allowedTo`.
3. `userValidation.js` — مافيهاش تحقق من `role` (اتحلّت في المرحلة 0).
4. `Player.teamName` كنص حر بديل عن `Player.team` (`playedModel.js:50`) — مصدر تشوّش في السكوب.
5. ~~`user-form.component.ts:170-173` — قائمة اختيار الرول مكتوبة بإيد بثلاث خيارات ثابتة.~~
   **اتحلّت في المرحلة 4.** القائمة بقت مبنية من `const ROLE_OPTIONS: readonly UserRole[]`، فالأدمن
   يقدر يسند `proScout` من الواجهة. باقي قيد: `UserRole` نوع مش قيمة وقت تشغيل، فالفحص وقت الترجمة
   مش اشتقاق تلقائي.
6. **`TODO(NESTED_PLAYER_CREATE_DEAD)`** — `POST /users/:id/players` بيرجع 400 لكل الرولات:
   `setUserIdToBody` بيحقن `req.body.coach` قبل `createValidate`، و`lockField("coach")` بيرفضه.
   يا الـmiddleware غلط يا الـlock. اتقاس في المرحلة 4 واتساب كما هو (إصلاحه تغيير سلوك لرول قائم).

## المرحلة 4c — إصلاح فجوة بعد 4b (خارج نطاق الخطة الأصلية)

**مش من ضمن الخطة دي.** المرحلة 4b سابت لاعبي المحترفين (`isProfessional: true`) بدون `ageGroup`
إطلاقاً (استثناء C-4، الدستور v1.0.2)، فمابقوش تابعين لأي كارد في شبكة الفئات العمرية عند الأدمن،
ومابقاش عند الأدمن طريق مقصود يوصلهم بيه — الطريق الوحيد اللي كان شغال كان بالصدفة (عدسة "بدون كوتش"،
أثر جانبي لقرار R14 في المرحلة 4). التفاصيل والتنفيذ الكامل في `specs/006-admin-professional-lens/`
و`PR-DESCRIPTION.md` بتاعتها.
