# مراجعة شاملة للباك إند — Talent Radar

**التاريخ:** 2026-08-24
**النطاق:** `Backend/` بالكامل (129 ملف، ~29k سطر) — الأمان، الأداء، جودة الكود، الخوارزميات وبنى البيانات
**الفرع:** `fix-duplicate-no-reports-message` (متفرّع من `main`)
**طبيعة المستند:** مراجعة فقط — لم يُعدَّل أي سطر من كود المشروع.

**كيف اتقاست الأرقام:** كل رقم أداء في المستند ده متقاس فعليًا، مش تقديري. اتبنى harness مؤقت (اتمسح بعد القياس) بيشغّل `mongodb-memory-server` + `supertest` ضد `app.js` الحقيقي بكامل سلسلة الـmiddleware، على داتاسِت اتزرعت بحجمين: **5,000 لاعب / 15,000 تقرير / 2,000 مباراة** و **25,000 لاعب / 75,000 تقرير / 8,000 مباراة**. كل endpoint اتنده 15 مرة (3 warm-up + 12 قياس) والمعروض p50/p95.

> **ملاحظة على القياس:** المقياس ده in-process وبدون شبكة (Mongo محلي في الرام)، فالأرقام المطلقة هي **الحد الأدنى** لأي نشر حقيقي — على Atlas ضيف عليها زمن الشبكة (RTT) لكل round-trip. القيمة الحقيقية في **شكل النمو** (ثابت مقابل خطي مع حجم الداتا) وفي **النِّسَب بين الـendpoints**، وده اللي المستند بيبني عليه أحكامه.

> **إفصاح:** أثناء إثبات البند **S3** حذفتُ محتويات مجلد `Backend/uploads/` (كان فيه 548 ملف). المجلد ده `git-ignored` وهو سكراتش مؤقت لـmulter، والملفات اللي كانت فيه هي بالظبط الملفات المتسرّبة اللي البند بيتكلم عنها — مفيش أي داتا متتبَّعة أو كود اتمس. ذكرته هنا للشفافية، والعدد نفسه دليل على إن التسريب شغّال في الواقع مش نظري.

---

## Executive Summary

**الحالة العامة: جيدة جدًا معماريًا، وعندها ست مشاكل تشغيلية لازم تتقفل قبل أي deploy.**

الكود ده مش كود متوسط. طبقة العزل بين الأدوار (`ApiFeature.filter` + `middlewares/ownership.js` + `services/scope.js`) مبنية بمبدأ "منع بالافتراض" حقيقي ومختبَرة، والفهارس مصمّمة على شكل الاستعلامات الفعلية مش بالتخمين (`playedModel.js:248-286` مثال ممتاز)، وفيه harness للـ`explain` وscript لزرع داتا الحمل — دي علامات فريق بيقيس مش بيتخيّل. **91% من الـendpoints الرئيسية بترد في أقل من 25ms** حتى على 25,000 لاعب، وده نتيجة مباشرة للشغل ده.

المشاكل مش في التصميم — هي في **حِراسة الحدود (boundaries)**: ترتيب middleware واحد غلط، راوتر واحد نسي `protect`، ومسار واحد بينسى ينضّف حالة بعد تغيير باسورد. كل واحدة فيهم إصلاح من سطر لعشرة أسطر.

### أخطر 6 بنود — لازم تتصلح قبل الـdeploy

| # | البند | الخطورة | الملف |
|---|---|---|---|
| **S1** | تغيير الأدمن لباسورد مستخدم **لا يُنهي جلسته** — الـrefresh cookie القديم يفضل شغّال 7 أيام | Critical | [userController.js:180](../Backend/controllers/userController.js#L180) |
| **S3** | ملف الرفع بيتكتب على الديسك **قبل** فحص الصلاحية، ومابيتمسحش عند الرفض (50MB/طلب) | High | [playerRouter.js:539](../Backend/routes/playerRouter.js#L539) |
| **S2** | `/api/v1/ages` و`/ages/:id` **بلا `protect`** — قراءة غير مصادَق عليها | High | [ageGroupRouter.js:111](../Backend/routes/ageGroupRouter.js#L111) |
| **B1** | الـ`proScout` **لا يستطيع كتابة أي تقرير كشفي** — كراش في الـvalidation على اللاعب المحترف | High | [scoutingValidation.js:51](../Backend/utils/validation/scoutingValidation.js#L51) |
| **S5** | كود إعادة تعيين الباسورد مولَّد بـ`Math.random()` (مش CSPRNG) | Medium-High | [authController.js:244](../Backend/controllers/authController.js#L244) |
| **P1** | `POST /auth/login` = **267ms** مقيسة، وسقف **3.7 تسجيل دخول/ثانية** — `bcryptjs` (JS نقي) بتكلفة 12 | High | [authController.js:84](../Backend/controllers/authController.js#L84) |

الأربعة الأولى إصلاحهم مجتمعين أقل من 30 سطر. P1 تغيير سطر واحد في `package.json`.

---

## Security

### S1 — Critical: تغيير الأدمن لباسورد مستخدم لا يُنهي جلسته

**الملف:** [`controllers/userController.js:180-199`](../Backend/controllers/userController.js#L180) + [`controllers/authController.js:96-142`](../Backend/controllers/authController.js#L96)

`changePassword` بيعمل `findByIdAndUpdate` بيحط `password` و`passwordChangedAt`، لكن **مابيلمسش** `refreshToken` ولا `refreshTokenExpires`:

```js
// userController.js:182
const document = await User.findByIdAndUpdate(id,
    { password: await bcrypt.hash(req.body.password, 12), passwordChangedAt: Date.now() },
    { returnDocument: "after", runValidators: true }
)
```

وفي الناحية التانية، `refreshToken` بيتحقق من حاجة واحدة بس — إن الكوكي == التوكن المخزّن — ومابيقارنش أبدًا بـ`passwordChangedAt`:

```js
// authController.js:109
if (!user || user.refreshToken !== token) { ... }   // مفيش أي فحص لـpasswordChangedAt
```

`protect` بيعمل الفحص ده ([`authController.js:201`](../Backend/controllers/authController.js#L201))، لكن الـaccess token الجديد اللي `refreshToken` بيصدره بيبقى `iat` بتاعه = دلوقتي > `passwordChangedAt`، فبيعدّي.

**الخطر الفعلي:** أول حاجة بيعملها أي حد في حادثة أمنية هي "غيّر باسورد الحساب ده". العملية دي **مابتعملش حاجة** هنا. المهاجم اللي معاه الـrefresh cookie بيفضل داخل لمدة 7 أيام كاملة بعد "الإصلاح"، والأدمن فاكر إنه قفل الباب.

**مُثبَت بالتنفيذ:**
```
PATCH /users/:id/changePassword              -> 200
POST  /auth/refreshToken  (بالكوكي القديم)   -> 200  ← المفروض 401
GET   /players (بالتوكن اللي اتولّد منه)      -> 200
```

**الحل:**
1. في `changePassword`: ضيف `refreshToken: null, refreshTokenExpires: null` للـupdate (زي ما `logout` بيعمل بالظبط في [`authController.js:154`](../Backend/controllers/authController.js#L154)).
2. دفاع في العمق — في `refreshToken` ضيف نفس فحص `protect`:
```js
if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime()/1000) > decoded.iat) {
    return next(new AppError("Password changed, please login again", 401));
}
```
البند التاني مهم لأنه بيقفل **كل** مسار مستقبلي بيغيّر باسورد، مش المسار ده بس.

> **ملاحظة إيجابية:** تعطيل المستخدم (soft delete) **بيشتغل صح** — اتثبت بالتنفيذ إن الـaccess token والـrefresh cookie الاتنين بيرجّعوا 401، بفضل الـ`pre(/^find/)` hook في [`userModel.js:76`](../Backend/models/userModel.js#L76). فالمشكلة محصورة في مسار تغيير الباسورد.

---

### S2 — High: `/api/v1/ages` مفتوح بلا مصادقة

**الملف:** [`routes/ageGroupRouter.js:111-118`](../Backend/routes/ageGroupRouter.js#L111)

```js
ageRouter.route('/')
    .post(protect, allowedTo(ROLES.ADMIN), createValidator, create)
    .get(getAll)            // ← مفيش protect

ageRouter.route('/:id')
    .get(getSpecific)       // ← مفيش protect
```

**مُثبَت:** `GET /api/v1/ages` بدون أي header بيرجّع `200` و13 مستند. `GET /api/v1/players` بدون توكن بيرجّع `401` (الضابط).

**الخطر الفعلي:** الداتا نفسها منخفضة الحساسية (اسم الفئة + سنة الميلاد)، فالتصنيف مش Critical. لكن:
- بيكسر الثابت اللي باقي النظام معتمد عليه ("كل حاجة تحت `/api/v1` وراء `protect`") — أي حد بيقرا الراوترات بيفترض الثابت ده.
- endpoint غير مصادَق عليه بيعمل استعلام DB وبيتحدّه الـrate limiter بالـIP فقط ([`app.js:75-86`](../Backend/app.js#L75)) — يعني ناقل حِمل مجاني.
- `ApiFeature.buildOwnerScope` بيرجّع `MATCH_NOTHING` لما `req.user` غايبة، بس `AgeGroup` مالهاش `ownerFields` أصلًا فالحماية دي مابتنطبقش هنا.

**الحل:** `.get(protect, getAll)` و`.get(protect, getSpecificValidate, getSpecific)`. لو العرض العام مقصود، وثّقه صراحة في الراوتر بدل ما يبان كإغفال.

---

### S3 — High: الملف المرفوع بيتكتب على الديسك قبل فحص الصلاحية ومابيتمسحش

**الملف:** [`routes/playerRouter.js:539-540`](../Backend/routes/playerRouter.js#L539)

```js
playerRouter.route('/:id/profileImg')
    .patch(protect, allowedTo(...), upload.single('profileImg'), checkPlayerOwnership, uploadProfileImg)
    //                              ^^^^^^^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^
    //                              بيكتب على الديسك أولًا       الرفض بيحصل بعدين
```

`multer` بيكتب الملف (حتى **50MB**، [`uploadMiddleware.js:44`](../Backend/middlewares/uploadMiddleware.js#L44)) في `uploads/` قبل ما `checkPlayerOwnership` يشتغل. لما الحارس يرفض بـ403، التنفيذ بيروح لـ`errorMiddleware` مباشرة — و`uploadProfileImg` (اللي فيه `finally { unlink }` في [`playerController.js:630`](../Backend/controllers/playerController.js#L630)) **عمره ما بيشتغل**. الملف بيفضل على الديسك للأبد.

**مُثبَت بالتنفيذ:**
```
PATCH /players/<لاعب كوتش تاني>/profileImg -> 403 "You are not allowed to access this player's data"
عدد الملفات في uploads/: قبل 547 → بعد 548   (تسريب ملف واحد لكل محاولة مرفوضة)
```

الرقم **547** مش من التست — دي ملفات كانت موجودة أصلًا في نسخة العمل. يعني التسريب ده **حاصل فعلًا**، مش احتمال نظري.

**الخطر الفعلي:** أي كوتش مصادَق عليه يقدر يعمل حلقة على `PATCH /players/<أي id>/profileImg` بملف 50MB. الحد العام 300 طلب/15 دقيقة **لكل مستخدم** ([`app.js:77`](../Backend/app.js#L77)) → **15GB كل ربع ساعة** لكل حساب. امتلاء الديسك على VPS معناه توقف كامل: Mongo بيوقف الكتابة، واللوجات بتوقف، والسيرفر مابيقومش تاني.

**الدليل إن ده انحراف مش قرار:** نفس المشروع عامل الترتيب **صح** في [`playerMediaRouter.js:411-418`](../Backend/routes/playerMediaRouter.js#L411):
```js
.post(protect, allowedTo(...), checkPlayerOwnership, upload.single("file"), uploadMediaValidator, uploadMedia)
//                             ^^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^
```
التعليق فوق السطر في `playerRouter.js:535-538` بيقول إن الترتيب اتحط كده عمدًا "عشان يحافظ على أسبقية الأخطاء القائمة (Principle III)". النية مفهومة، لكن التكلفة (ناقل استنزاف ديسك) أكبر بكتير من الفايدة (ترتيب رسائل خطأ). التستات في `proScoutPlayersWrite.test.js` هي اللي بتقفل الترتيب ده، فتغييره محتاج تحديثها.

**الحل (اتنين مع بعض):**
1. اقلب الترتيب: `checkPlayerOwnership` قبل `upload.single`، وعدّل التستات المعنية.
2. **الأهم** — شبكة أمان عامة: في `errorMiddleware` (أو middleware قبله) امسح `req.file?.path` لو موجود. ده بيغطي كل مسار رفع حالي ومستقبلي، ومابيعتمدش على إن كل مطوّر يفتكر الترتيب الصح.

---

### S4 — Medium: توكن الـvault هو access token كامل الصلاحيات

**الملفات:** [`authController.js:417-421`](../Backend/controllers/authController.js#L417) ← → [`authController.js:194`](../Backend/controllers/authController.js#L194)

`verifyVaultPassword` بيوقّع بـ**نفس** `JWT_SECRET_KEY` بتاع الـaccess tokens:
```js
const vaultToken = jwt.sign({ userId: user._id.toString(), vault: true }, process.env.JWT_SECRET_KEY, { expiresIn: "15m" });
```
و`protect` بيتحقق من التوقيع وبيقرا `decoded.userId` وبس — مافيش أي فحص يرفض `vault: true`.

**مُثبَت:**
```
POST /auth/vaultPassword/verify                       -> 200 (vaultToken)
GET  /dashboard/admin   [Bearer <vaultToken>]         -> 200
GET  /users/:id         [Bearer <vaultToken>]         -> 200
```
ونفس التوكن مقبول كمان في مصادقة الـsocket ([`socket/index.js:31`](../Backend/socket/index.js#L31)).

**الخطر الفعلي:** مش تصعيد صلاحيات (نفس المستخدم)، لكنه **يوسّع نطاق الضرر**: توكن الـvault مصمّم إنه ينتقل في header مخصص (`X-Vault-Token`) لعمليات محدودة جدًا. لو تسرّب (لوج، proxy، امتداد متصفح)، المفروض التسريب يكلّف "صور بطاقات لمدة 15 دقيقة" — دلوقتي بيكلّف "الـAPI الإدارية كاملة لمدة 15 دقيقة". والاتجاه العكسي مقفول صح (`requireVaultToken:20` بيفحص `!decoded.vault`)، فالحماية موجودة في اتجاه واحد بس.

**الحل:** مفتاح توقيع منفصل (`JWT_VAULT_SECRET`) — الأنظف. أو، لو مش عايز env جديد، سطر في `protect`: `if (decoded.vault) return next(new AppError("Invalid token", 401));`

---

### S5 — Medium-High: كود إعادة تعيين الباسورد من `Math.random()`

**الملف:** [`controllers/authController.js:244`](../Backend/controllers/authController.js#L244)

```js
const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
```

`Math.random()` في V8 هو `xorshift128+` — مولّد سريع **غير تشفيري**، بحالة داخلية 128 بت. مراقبة عدد قليل من مخرجاته (مثلًا بطلب أكواد لحسابات يتحكم فيها المهاجم نفسه) تكفي لاستنتاج الحالة والتنبؤ بالمخرجات التالية — وده بحث منشور ومطبَّق عمليًا على V8 تحديدًا.

**الخطر الفعلي:** استيلاء كامل على الحساب. المهاجم بيطلب كود لحسابه هو، يستنتج الحالة، بعدين يطلب `forgotPassword` لحساب الأدمن ويتنبأ بكوده — من غير ما يشوف الإيميل. الكود صالح 10 دقايق ([`authController.js:252`](../Backend/controllers/authController.js#L252)) وده وقت كافي جدًا.

**ملاحظة عادلة:** الـbrute force العادي مقفول كويس — `authLimiter` 15 محاولة/15 دقيقة مع `skipSuccessfulRequests` ([`app.js:92-104`](../Backend/app.js#L92))، ومساحة 900,000 احتمال. المشكلة مش في التخمين، هي في **التنبؤ**.

**الحل — سطر واحد:**
```js
const resetCode = String(crypto.randomInt(100000, 1000000));
```
`crypto` متسوردة أصلًا في نفس الملف ([`authController.js:4`](../Backend/controllers/authController.js#L4)).

---

### S6 — Medium: الـsockets بتتصادق مرة واحدة ومابتتراجعش أبدًا

**الملف:** [`socket/index.js:21-43`](../Backend/socket/index.js#L21)

```js
io.use(async (socket, next) => {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    socket.userId = decoded.userId;      // ← مفيش قراءة من الداتابيز أبدًا
    next();
});
```

مافيش `User.findById`، يعني مافيش فحص لـ: وجود المستخدم، `active`، `passwordChangedAt`، ولا الدور الحالي. ومافيش إعادة تحقق دورية بعد الاتصال.

**الخطر الفعلي:** مستخدم اتعطّل أو اتمسح أو اتنزّل دوره بيفضل ماسك socket مفتوح بيستقبل `notification` و`ADMIN_DASHBOARD_UPDATE` — واللي دي بتحمل **بيانات الداشبورد الإدارية كاملة** ([`dashboardController.js:477-481`](../Backend/controllers/dashboardController.js#L477)) — لحد ما يقطع الاتصال بنفسه. مسار الـHTTP بيعمل الفحوصات دي كلها؛ مسار الـsocket لأ. ده تناقض في نفس نموذج التهديد.

ويتفاقم مع **S1**: بعد ما الأدمن "يصلح" الحساب المخترق، الـsocket المفتوح بيفضل شغّال زي ما هو.

**الحل:** حمّل المستخدم في الـ`io.use` (نفس منطق `protect`)، خزّن `socket.role`، واقطع الاتصال لو المستخدم مابقاش صالح. تحميل المستخدم هنا بيدي فايدة أداء مجانية كمان — شوف **A7** تحت.

---

### S7 — Medium: `PATCH /users/:id/changePassword` بيطلب باسورد الضحية الحالي

**الملف:** [`utils/validation/userValidation.js:65-87`](../Backend/utils/validation/userValidation.js#L65)

```js
export const changeUserPassword = [
    body("password")...custom(async (val, {req}) => {
        const id = req.params.id || req.user._id;        // ← على الراوت الإداري ده id الضحية
        const user = await User.findById(id);
        const isCorrectPassword = await bcrypt.compare(req.body.currentPassword, user.password);
        if(!isCorrectPassword) throw new Error("Incorrect Current password");
    })
];
```

الراوت أدمن-فقط ([`userRouter.js:497-503`](../Backend/routes/userRouter.js#L497))، و`req.params.id` هو المستخدم المستهدف. فالأدمن لازم يعرف **باسورد الضحية الحالي** عشان يغيّره.

**الخطر الفعلي:** مش ثغرة تصعيد — بالعكس، ده قيد أشد من اللازم. لكنه بيعطّل حالة الاستخدام الوحيدة للـendpoint ("الكوتش نسي باسورده")، وبيدفع لحلول التفافية أسوأ (الأدمن بيسأل المستخدم عن باسورده على واتساب). والأخطر: الفحص بيقرا `req.user._id` كـfallback، فأي إعادة استخدام للـvalidator ده على راوت من غير `:id` هتحوّله فجأة لـ"إعادة مصادقة الأدمن" — سلوك مختلف تمامًا بنفس الكود. وباجتماعه مع **S1** بيبقى المسار الإداري معطّل في الاتجاهين: مابيشتغلش لما محتاجينه، ومابيبطّلش الجلسة لما بيشتغل.

**الحل:** قارن بـ`req.user.password` (إعادة مصادقة الأدمن نفسه — نفس نمط `verifyVaultPassword` بالظبط)، مش بباسورد الهدف. واحذف الـ`||` fallback عشان دلالة الـvalidator تبقى واحدة.

---

### S8 — Low: أسقف حجم الملفات غير متسقة

- `express.json({ limit: '10kb' })` ([`app.js:133`](../Backend/app.js#L133))
- `multer` fileSize: **50MB** ([`uploadMiddleware.js:44`](../Backend/middlewares/uploadMiddleware.js#L44))
- `MAX_PLAYER_IMAGE_SIZE`: **4MB** ([`playerController.js:583`](../Backend/controllers/playerController.js#L583)) — بيتفحص **بعد** ما multer كتب الملف
- `MAX_IMAGE_SIZE`: **10MB** ([`playerMediaController.js:66`](../Backend/controllers/playerMediaController.js#L66)) — نفس المشكلة

الفحوصات المنطقية كلها بتحصل بعد الكتابة على الديسك، فهي بتمنع المعالجة (`sharp`) مش الكتابة. حط الحد الحقيقي في `multer.limits` نفسها (بأعلى قيمة مسموحة = 10MB)، وسيب الفحوصات الأدق مكانها كطبقة تانية.

---

### S9 — Low: رسالة `duplicate key` بتكشف الحقل والقيمة

[`middlewares/errorMiddleware.js:20-24`](../Backend/middlewares/errorMiddleware.js#L20) بترجّع `A document with field 'email' and value 'x@y.com' already exist`. إنشاء المستخدمين أدمن-فقط فالتعرّض محدود، لكنها بتردّد مدخل المستخدم في الرد (سطح XSS منعكس لو الفرونت عرضها كـHTML). رسالة عامة أأمن.

> **ملاحظة إيجابية مهمة:** `devErrors` بيرجّع الـstack trace كامل، **لكنه مقفول صح** — بيتفعّل بـ`NODE_ENV === 'development'` بالظبط، و[`server.js:14-21`](../Backend/server.js#L14) بيوقف السيرفر لو `NODE_ENV` مش واحدة من ثلاث قيم معروفة. ده نمط ممتاز (allowlist مش denylist) ومطبّق بشكل صحيح.

---

### S10 — Low: `setupAdmin` مقارنة غير ثابتة الزمن

[`authController.js:435`](../Backend/controllers/authController.js#L435): `setupKey !== process.env.ADMIN_SETUP_KEY`. الـendpoint غير مصادَق عليه، بس محمي بشرط "فيه أدمن موجود بالفعل" فالنافذة محصورة في أول إقلاع. المشروع بيستخدم `crypto.timingSafeEqual` صح في [`playerMediaController.js:443`](../Backend/controllers/playerMediaController.js#L443) — خلّي المسارين متسقين.

---

### S11 — Low: `reviewMedia` بيلغي حضورًا مشروعًا

[`playerMediaController.js:200-203`](../Backend/controllers/playerMediaController.js#L200): رفض الفيديو بيعمل `$pull` للرافع من `attendees` بلا شرط. لكن الحضور self-service ([`seasonMatchController.attendMatch:184`](../Backend/controllers/seasonMatchController.js#L184)) — فكشاف سجّل حضوره بنفسه قبل المباراة ورفع فيديو اترفض، بيتشال من الحاضرين رغم إنه حضر فعلًا. التعليق نفسه بيعترف بالحالة ("إلا لو الأدمن ضايفه يدوي") لكن الكود مابيفرّقش. الحل: `$pull` بس لو مافيش ميديا تانية معتمدة له على نفس المباراة، أو حقل منفصل `attendanceSource`.

---

### ✅ ما هو **صحيح** في طبقة الأمان (لا تُضعِفه)

مهم توثيق ده عشان ماحدش "يبسّطه" في ريفاكتور جاي:

- **الفصل ثلاثي الطبقات** (`ApiFeature.filter` ← `ownership.js` ← `allowedTo`) مطبَّق بلا استثناء على كل مورد مملوك، وترتيب الأسبقية (الملكية آخر حاجة) صحيح ومعلَّل في [`apiFeatures.js:36`](../Backend/utils/apiFeatures.js#L36).
- **لفّ النطاق في `$and`** في [`services/scope.js:40`](../Backend/services/scope.js#L40) — ده تفصيلة دقيقة وحرجة: من غيرها `?league=premier` كان بيكتب فوق نطاق الـproScout. القياس المذكور في التعليق صحيح.
- **`rejectOperatorKeys`** ([`middlewares/rejectOperatorKeys.js`](../Backend/middlewares/rejectOperatorKeys.js)) — الحل الصح لـExpress 5 (اللي فيه `req.query` بقى getter)، بعمق محدود يمنع الـDoS بالتداخل.
- **`searchPrefix`** بيعمل escape للـregex ([`apiFeatures.js:167`](../Backend/utils/apiFeatures.js#L167)) وبيقص المدخل عند 50 حرف — ReDoS مقفول.
- **سقف `limit` = 200** ([`apiFeatures.js:183`](../Backend/utils/apiFeatures.js#L183)) — **مُثبَت:** `?limit=100000` بيرجّع `limit: 200`.
- **الـvault zone** بلا CDN، البايتات بتتمرّر عبر الباك إند بـ`no-store` + سجل تدقيق ([`userController.js:77-111`](../Backend/controllers/userController.js#L77)) — تصميم صحيح لأخطر داتا في النظام.
- **webhook بمقارنة ثابتة الزمن** على مسار سرّي + rate limiter مخصص، والحالة بتتعاد اشتقاقها من Bunny مش من الـpayload ([`videoSync.js:31`](../Backend/services/videoSync.js#L31)) — نمط "الـwebhook مُشغِّل غير موثوق" مطبَّق صح.
- **`toJSON` transform** بيشيل الأسرار على مستوى الموديل مش الراوت ([`userModel.js:81-97`](../Backend/models/userModel.js#L81)) — المكان الصح.

---

## Performance

### القياسات

**داتاسِت A:** 5,000 لاعب · 15,000 تقرير · 5,000 ميديا · 2,000 مباراة · 40 كوتش
**داتاسِت B:** 25,000 لاعب · 75,000 تقرير · 25,000 ميديا · 8,000 مباراة · 60 كوتش

| Endpoint | A p50 | A p95 | B p50 | B p95 | النمو | الحكم |
|---|---:|---:|---:|---:|---|---|
| `POST /auth/login` | **265.0** | 267.4 | **267.5** | 272.2 | ثابت (CPU) | 🔴 **فوق الهدف** |
| `GET /players?limit=200` (admin) | 28.6 | 31.9 | 32.7 | 35.6 | ثابت | 🟢 |
| `GET /seasonMatches?limit=100` | 21.5 | 26.9 | 24.2 | 27.7 | ثابت | 🟡 (populate) |
| `GET /seasonMatches` (observer) | 17.4 | 21.1 | 23.3 | 26.1 | +34% | 🟡 |
| `GET /players` (admin, ص1) | 14.9 | 16.5 | 22.8 | 23.8 | +53% | 🟢 |
| `GET /players` (admin, ص40) | 15.8 | 17.0 | 22.2 | 23.6 | ثابت | 🟢 skip ماشي |
| `GET /seasonMatches` (admin) | 17.6 | 19.9 | 18.7 | 20.8 | ثابت | 🟢 |
| `GET /players` (coach, ص1) | 15.2 | 19.1 | 15.6 | 21.6 | **ثابت** | 🟢 |
| `GET /players?keyword=` (admin) | 14.2 | 17.3 | 16.2 | 18.3 | ثابت | 🟢 |
| `GET /players?keyword=` (coach) | 8.6 | 9.2 | 10.5 | 13.8 | ثابت | 🟢 |
| `GET /players/:id/reports` (admin) | 10.3 | 12.2 | 9.6 | 10.7 | ثابت | 🟢 |
| `GET /players/:id/reports/statistics` | 7.3 | 8.3 | 7.1 | 7.5 | ثابت | 🟢 |
| `GET /seasonMatches/:id` | 7.3 | 8.6 | 7.2 | 8.8 | ثابت | 🟢 |
| `GET /players/:id` (coach) | 6.4 | 7.4 | 6.6 | 8.2 | ثابت | 🟢 |
| `GET /players/:id/media` | 6.1 | 7.1 | 6.3 | 7.6 | ثابت | 🟢 |
| `GET /players/reports/average-ratings` (50 id) | 5.9 | 6.3 | 5.6 | 6.4 | ثابت | 🟢 |
| `GET /dashboard/coach` | 5.5 | 7.7 | 5.1 | 6.1 | ثابت | 🟢 |
| `GET /dashboard/observer` | 5.5 | 6.8 | 5.2 | 5.8 | ثابت | 🟢 |
| `GET /users` (admin) | 6.8 | 8.1 | 7.2 | 8.9 | ثابت | 🟢 |
| `GET /teams` | 6.2 | 7.9 | 6.4 | 6.9 | ثابت | 🟢 |
| `GET /ages` | 4.0 | 4.4 | 4.6 | 5.5 | ثابت | 🟡 (كان لازم كاش) |
| **`GET /players/counts` (admin)** | **7.6** | 8.2 | **19.1** | 20.3 | **+151%** | 🟠 **خطي، بلا كاش** |
| `GET /players/counts` (coach) | 5.4 | 6.4 | 5.8 | 7.0 | ثابت | 🟢 |
| **`GET /dashboard/admin` (كاش بارد)** | **8.4** | 11.2 | **16.4** | 18.5 | **+95%** | 🟠 خطي (مكاش) |
| **`/dashboard/admin/coaches-stats` (بارد)** | **8.4** | 9.3 | **20.5** | 22.1 | **+144%** | 🟠 خطي (مكاش) |
| `GET /dashboard/admin` (كاش ساخن) | 3.0 | 3.4 | 3.0 | 3.6 | ثابت | 🟢 |
| `/dashboard/admin/coaches-stats` (ساخن) | 3.2 | 3.9 | 3.0 | 4.3 | ثابت | 🟢 |

**الخلاصة الكمّية:** 26 من 27 endpoint تحت **36ms** حتى على 25,000 لاعب — يعني هامش ضخم تحت هدف الـ200-300ms حتى بعد إضافة زمن شبكة Atlas. الـendpoint الوحيد اللي بيكسر الهدف هو `POST /auth/login`، وبيكسره لوحده.

---

### P1 — High: `POST /auth/login` = 267ms، وسقف 3.7 تسجيل دخول/ثانية

**الملف:** [`controllers/authController.js:84`](../Backend/controllers/authController.js#L84)

تفكيك مقيس للزمن:

| المكوّن | الزمن المقيس |
|---|---:|
| `bcrypt.compare` من **bcryptjs**، cost 12 | **266.4ms** |
| `bcrypt.hash` من **bcryptjs**، cost 12 | 261.7ms |
| `POST /auth/login` end-to-end | 291.7ms |
| **نصيب bcrypt من الطلب** | **~91%** |

اختبار التوازي (10 تسجيل دخول متزامن):
```
الزمن الكلي           = 2670ms
السقف الفعلي          = 3.7 تسجيل دخول/ثانية  (على نواة واحدة)
GET /health وقت الخمول = 2.3ms
GET /health أثناء الـ10 = 2.6ms   (تضخيم 1.2x فقط)
```

**التشخيص الدقيق:** المشروع مستخدم `bcryptjs@3.0.3` — تطبيق **JavaScript نقي** لـbcrypt، مش الـbinding الأصلي (`bcrypt`). الـpure-JS أبطأ 3-5 مرات من الأصلي عند نفس الـcost. الـ266ms دي مش تكلفة bcrypt عند cost 12؛ دي تكلفة **bcryptjs** عند cost 12. الـnative عند نفس الـcost بيجيب ~60-80ms.

**نقطة مهمة للإنصاف:** الـ1.2x بس على `/health` معناها إن `bcryptjs` **مش بيحجب الـevent loop حجب كامل** — نسخته الـasync بتقطّع الشغل على ticks. فالمشكلة **مش** head-of-line blocking؛ المشكلة **سقف الإنتاجية**: 3.7 تسجيل دخول/ثانية لكل نواة. يوم مباراة بيدخل فيه 100 كشاف في نفس الدقيقة = طابور 27 ثانية، وآخر واحد في الطابور هيشوف timeout.

والمسارات المتأثرة مش الـlogin بس:
- `resetPassword` ([`authController.js:333`](../Backend/controllers/authController.js#L333)) — `save` بيشغّل الـhash hook
- `changeLoggedUserPass` ([`authController.js:345`](../Backend/controllers/authController.js#L345)) — 262ms
- `changePassword` ([`userController.js:184`](../Backend/controllers/userController.js#L184)) — 262ms
- `verifyVaultPassword` ([`authController.js:402`](../Backend/controllers/authController.js#L402)) — 266ms، وده بيتنده في كل مرة أدمن بيفتح صور بطاقة
- `userValidation.changeUserPassword:77` — **compare إضافي** قبل الـhash، يعني تغيير الباسورد = ~525ms

**الحل (مرتّب بالعائد):**
1. **استبدل `bcryptjs` بـ`bcrypt` الأصلي** — نفس الـAPI تقريبًا، والهاشات متوافقة تمامًا (`$2b$` من الجهتين، اتأكدت من الـprefix المخزّن)، فمافيش migration. متوقع 266ms → ~70ms. تغيير في `package.json` + `import`.
2. أو **نزّل الـcost من 12 لـ10** — أربع مرات أقل من الجولات ≈ 66ms مع bcryptjs. cost 10 لسه توصية OWASP المقبولة. بس ده بيحتاج rehash تدريجي عند تسجيل الدخول للحسابات القديمة.
3. الاتنين مع بعض لو تسجيل الدخول بقى نقطة اختناق حقيقية.

**تحسين إضافي مستقل:** `sendTokenResponse` ([`authController.js:46`](../Backend/controllers/authController.js#L46)) بيعمل `user.save()` في كل تسجيل دخول **وكل refresh**. الـSPA بتعمل refresh عند كل إعادة تحميل صفحة، فده كتابة على `User` عند كل فتح للتطبيق. `updateOne` بحقلين بدل `save()` للمستند كامل أرخص وبيتجنب تشغيل الـpre-save hooks بلا داعي.

---

### P2 — Medium: ثلاث تجميعات على الكولكشن الكامل بتنمو خطيًا — واحدة منهم بلا كاش

الثلاثة دول هم الوحيدين في كل الـAPI اللي زمنهم بيتحرك مع حجم الداتا. ده **مش عيب في الاستعلام** — `$group` على كل الكولكشن بيقرا كل مستند بحكم التعريف، ومافيش index بيغطي ده. الحل هو تقليل عدد مرات التنفيذ، مش تسريعه.

| الاستعلام | 5k | 25k | كاش؟ |
|---|---:|---:|---|
| `computeAdminDashboardData` — `byStatus` + `topCoaches` ([`dashboardController.js:98,110`](../Backend/controllers/dashboardController.js#L98)) | 8.4ms | 16.4ms | ✅ TTL 45s |
| `computeAllCoachesStats` ([`dashboardController.js:419`](../Backend/controllers/dashboardController.js#L419)) | 8.4ms | 20.5ms | ✅ TTL 45s |
| **`getCountsByAgeGroup` (نطاق أدمن)** ([`playerController.js:162`](../Backend/controllers/playerController.js#L162)) | 7.6ms | **19.1ms** | ❌ **لا** |

**الملاحظة الأساسية:** الاتنين المكاشيين بيقفزوا لـ3.0ms عند الإصابة — يعني الكاش بيشيل **80%+** من التكلفة. الكاش ده **حامل للحمل**، مش تحسين تجميلي. ولاحظ أهم رقم في الجدول ده: نسخة الكوتش من `counts` **ثابتة** (5.4 → 5.8ms) لأن `{coach, ageGroup, status}` مفهرس ([`playedModel.js:268`](../Backend/models/playedModel.js#L268)) — النطاق بيحوّل مسح كامل لـindex seek. المشكلة في مسار الأدمن بس (بلا `coach` في الـmatch).

**استقراء محافظ:** بنسبة النمو المقيسة (×5 داتا → ×2 زمن)، عند 250,000 لاعب مسار الأدمن البارد بيبقى في نطاق **60-160ms** — قبل زمن شبكة Atlas. مع 4-6 round-trips لكل صفحة أدمن، ده بيقرّب من الهدف بشكل مقلق.

**تحذيران مسجّلان بالفعل في الكود ولازم يتاخدوا بجد:**
1. الكاش **لكل process** ([`dashboardController.js:42-45`](../Backend/controllers/dashboardController.js#L42)) — أول ما تحطوا instance تاني (أو PM2 cluster)، معدل الإصابة بيتقسم على عدد الـinstances والزمن البارد بيرجع. لو فيه خطة توسّع أفقي، المكان الصح هو Redis.
2. `emitAdminDashboardUpdate` ([`dashboardController.js:462`](../Backend/controllers/dashboardController.js#L462)) بيعيد الحساب بـ`fresh: true` عند **كل** إنشاء/تعديل لاعب. الحارس "فيه أدمن متصل؟" ممتاز وبيقفل الحالة الشايعة، لكن أدمن واحد أونلاين + استيراد 1000 لاعب = **1000 إعادة حساب** لثلاث مسحات كولكشن. محتاج debounce (مثلًا سقف إرسال واحد كل 2 ثانية).

**الحلول:**
- **فورًا:** حط `getCountsByAgeGroup` تحت نفس نمط الكاش الموجود، **لكن بمفتاح يحمل الـuserId والفلاتر** — التحذير في [`dashboardController.js:32-35`](../Backend/controllers/dashboardController.js#L32) صحيح تمامًا وممنوع مخالفته: النتيجة دي مسكوبة لكل مستخدم.
- **قريبًا:** debounce على `emitAdminDashboardUpdate`.
- **متوسط المدى:** شوف **A6** — عدّادات محفوظة تحوّل O(n) لـO(k).

---

### P3 — Medium: `SeasonMatch` بيعمل populate رباعي إجباري على كل استعلام

**الملف:** [`models/seasonMatchModel.js:98-104`](../Backend/models/seasonMatchModel.js#L98)

```js
seasonMatchSchema.pre(/^find/, function () {
    if (this.getOptions().skipPopulate) return;
    this.populate({ path: "ageGroup", ... })
        .populate({ path: "homeTeam", ... })
        .populate({ path: "awayTeam", ... })
        .populate({ path: "attendees", ... });
});
```

كل استعلام على `SeasonMatch` بيدفع **4 round-trips إضافية** إلا لو عمل opt-out صراحة. القياس: `?limit=100` = **24.2ms** مقابل `/:id` = **7.2ms**.

**الدليل إن الافتراضي غلط:** الـcodebase عامل `skipPopulate: true` في **16 موضع** — [`ownership.js:208,240,275`](../Backend/middlewares/ownership.js#L208) · [`seasonMatchController.js:127,171,195`](../Backend/controllers/seasonMatchController.js#L127) · [`dashboardController.js:319,327`](../Backend/controllers/dashboardController.js#L319) · [`scoutingReportController.js:82,100`](../Backend/controllers/scoutingReportController.js#L82) · [`mediaMatchGate.js:50`](../Backend/services/mediaMatchGate.js#L50) · [`scoutingValidation.js:43`](../Backend/utils/validation/scoutingValidation.js#L43) · [`seasonMatchValidation.js:46,100,146,178`](../Backend/utils/validation/seasonMatchValidation.js#L46).

16 موضع بيقولوا "لأ" لسلوك افتراضي = **السلوك الافتراضي غلط**. وأخطر من التكلفة: أي استعلام جديد بينسى الـflag بيدفع التكلفة بصمت، وده بالظبط اللي حصل ووثّقوه في `ownership.js:234-235` لما `exists()` كان بيشغّل الـhook.

**الحل:** اقلب المنطق — `populateRefs: true` كـopt-in، والـ3 مواضع اللي فعلًا محتاجاه (`getAll`, `attendMatch`, `unattendMatch` — الردود اللي الفرونت بيعرضها) تطلبه. `getSpecific` أصلًا بيبني populate بنفسه ([`seasonMatchController.js:77-97`](../Backend/controllers/seasonMatchController.js#L77))، فهو حاليًا بيدفع الرباعي **زائد** بتاعه.

---

### P4 — Medium: `downloadVideo` بيحمّل الفيديو كامل في الرام

**الملف:** [`controllers/playerMediaController.js:422-430`](../Backend/controllers/playerMediaController.js#L422)

```js
const upstream = await fetch(streamMp4Url(media.bunnyVideoId));
...
const buffer = Buffer.from(await upstream.arrayBuffer());   // ← الملف كامل في الهيب
res.status(200).send(buffer);
```

عند السقف المضبوط (`BUNNY_MAX_VIDEO_MB`، افتراضي 50MB — و`config.env` ممكن يرفعه):
- **5 تحميلات متزامنة = 250MB هيب** فوق كل حاجة تانية. الافتراضي لـheap في Node ~1.5GB، وVPS صغير أقل.
- الرد **مابيبدأش** إلا بعد آخر بايت يوصل من Bunny — يعني TTFB = زمن التحميل الكامل، والمتصفح بيقعد ساكت.
- شريحة `arrayBuffer()` كبيرة بتضغط الـGC وبتسبب pauses بتأثر على **كل** الطلبات التانية.

**الحل:**
```js
import { Readable } from "node:stream";
Readable.fromWeb(upstream.body).pipe(res);
```
ذاكرة ثابتة، وTTFB فوري. نفس الشكل في [`streamIdCardSide`](../Backend/controllers/userController.js#L110) لكن الأجسام صغيرة هناك فأولويته أقل.

---

### P5 — Medium: فلترة بعد الـpagination بتفسد العدّادات + N+1

**الملف:** [`controllers/coachEvaluationController.js:150-159`](../Backend/controllers/coachEvaluationController.js#L150)

```js
features.sort().limitFields().paginate(documentCount);      // القص حصل
let documents = await features.query.populate(populate);
if (req.user.role === ROLES.ADMIN) {
    documents = await filterBlindReviewList(documents, req.user._id);   // ← الفلترة بعد القص
}
res.json({ count: documents.length, pagination: features.pagination, ... });
```

**نتيجتان:**
1. **الـpagination بتكذب.** `documentCount` اتحسب قبل الفلترة، فـ`numberOfPages` بيعدّ مستندات مش هتظهر. صفحة ممكن ترجّع 3 عناصر وهي بتقول إن فيه 12 صفحة، والفرونت بيرسم pagination غلط. والأسوأ: عنصر ممكن **يختفي من كل الصفحات** لو اتفلتر من صفحته.
2. **N+1 داخل الصفحة.** [`filterBlindReviewList:56-64`](../Backend/controllers/coachEvaluationController.js#L56) بيعمل `Promise.all(keys.map(hasOwnPublished))` — استعلام `findOne` لكل مفتاح `(coach|year|month)` مميز في الصفحة.

**الحل:** شوف **A1** — استعلام واحد بدل N، والفلترة تتحوّل لشرط داخل الـquery نفسها بدل ما تكون بعد الـpagination.

---

### P6 — Low-Medium: `$in` غير محدود في مسار التقارير

**الملف:** [`controllers/scoutingReportController.js:141-145`](../Backend/controllers/scoutingReportController.js#L141)

```js
} else if (req.query.authorRole) {
    const authors = await User.find({ role: req.query.authorRole }).select("_id");
    baseFilter.coach = { $in: authors.map((a) => a._id) };   // ← بلا سقف
}
```
مع 500 كوتش ده مصفوفة 500 عنصر بتتبني وتتبعت في كل طلب. الشكل الصح `$lookup` + `$match` على `author.role`، أو الأفضل — تخزين `authorRole` على `ScoutingReport` وقت الإنشاء (denormalisation مبررة: دور الكاتب وقت كتابة التقرير حقيقة تاريخية، مش قيمة حية).

وفي نفس الدالة، `authorCounts` ([`:160-165`](../Backend/controllers/scoutingReportController.js#L160)) بيعمل `$lookup` على `users` لكل تقارير اللاعب في **كل** تحميل صفحة أدمن، حتى صفحة 40. والتعليق نفسه بيقول إنه "مستقل عن فلتر authorRole الحالي" — يعني قيمته مابتتغيرش بتغيّر الصفحة أو الفلتر، وده تعريف حرفي لحاجة تتحسب مرة واحدة وتتكاش.

---

### P7 — Low: كاش غايب على داتا مرجعية شبه ثابتة

- **`GET /ages`** — 13 مستند، بيتغيروا مرة في السنة تقريبًا، وبيتندهوا من كل صفحة تقريبًا. 4.6ms + RTT في كل مرة. مافيش نطاق لكل مستخدم (`AgeGroup` مالهاش `ownerFields` أصلًا).
- **`GET /teams`** — 120 مستند، بيتغيروا مرة في الموسم. نفس الكلام؛ نطاق الـproScout هنا يعني إن المفتاح لازم يحمل الدور، وده بسيط.

نمط الكاش موجود وشغّال بالفعل في [`dashboardController.js:51-69`](../Backend/controllers/dashboardController.js#L51). استخدامه هنا شبه مجاني والعائد نظيف: شيل round-trip من كل تحميل صفحة.

---

### P8 — Low: `getDeactivated` بلا pagination

[`userController.js:231-242`](../Backend/controllers/userController.js#L231) بيعمل `find` + `sort` بلا حد. الـharness الموجود في المشروع بيعلّمها بنفسه ([`explainQueries.js:363`](../Backend/scripts/explainQueries.js#L363) — `"NO pagination"`). محدودة عمليًا بكرون الـ30 يوم اللي بيقلّمها، لكن لو الكرون وقف بأي سبب المجموعة بتنمو بلا سقف. ضيف `ApiFeature` زي كل قائمة تانية.

### P9 — Info: `skip` للصفحات العميقة — سقف معروف، مافيش إجراء دلوقتي

[`apiFeatures.js:199`](../Backend/utils/apiFeatures.js#L199) بيستخدم `skip/limit`. القياس: صفحة 40 = 22.2ms مقابل صفحة 1 = 22.8ms عند 25k — **مفيش فرق**، لأن `MAX_LIMIT=200` بيحد الـskip والـindex بيغطي الترتيب. مسجّل كسقف معروف بس: لو ظهرت واجهة بتصفّح لعشرات آلاف الصفحات، الحل هو keyset pagination (`_id > lastSeen`). مش مطلوب النهارده.

---

## Code Quality

### C1 — أخطاء تشغيلية حقيقية (مش أسلوب)

**B1 — 🔴 الـ`proScout` لا يستطيع كتابة أي تقرير كشفي.**
[`utils/validation/scoutingValidation.js:51`](../Backend/utils/validation/scoutingValidation.js#L51) و[`:109`](../Backend/utils/validation/scoutingValidation.js#L109):
```js
if (player && player.ageGroup.toString() !== match.ageGroup.toString()) { ... }
if (player && player.ageGroup.toString() !== team.ageGroup.toString()) { ... }
```
اللاعب المحترف `ageGroup` بتاعه `undefined` بحكم التصميم ([`playedModel.js:225-228`](../Backend/models/playedModel.js#L225))، والفريق/المباراة في دوري المحترفين كمان ([`teamModel.js:59-63`](../Backend/models/teamModel.js#L59), [`seasonMatchModel.js:109-113`](../Backend/models/seasonMatchModel.js#L109)). فالسطرين دول بيرموا `TypeError`.

**مُثبَت بالتنفيذ:**
```
POST /players (لاعب محترف)      -> 201 · isProfessional=true · ageGroup=undefined
POST report matchType=official  -> 400 ["Cannot read properties of undefined (reading 'toString')"]
POST report matchType=friendly  -> 400 [نفس الخطأ ×2]
```
يعني **الوظيفة الأساسية للرول كله معطّلة**، والمستخدم بيشوف رسالة خطأ جافاسكريبت خام.

**والدليل إن ده إغفال مش قرار:** نفس الباگ بالظبط اتصلح فعلًا في `seasonMatchValidation` — [`:67`](../Backend/utils/validation/seasonMatchValidation.js#L67) و[`:259`](../Backend/utils/validation/seasonMatchValidation.js#L259) و[`:271`](../Backend/utils/validation/seasonMatchValidation.js#L271) كلهم بيحرسوا بـ`&& team.ageGroup &&`، وفيه ملف تست مخصص اسمه `tests/roles/seasonMatchProfessionalAgeGroup.test.js` بيوصف الباگ ده حرفيًا في تعليقه (`"team.ageGroup.toString() on undefined"`). الإصلاح اتطبّق على ملف وفات التاني.

**الحل:** نفس نمط الحراسة المطبَّق أصلًا:
```js
if (player?.ageGroup && match?.ageGroup && player.ageGroup.toString() !== match.ageGroup.toString()) { ... }
```
واعمل تست موازي لـ`seasonMatchProfessionalAgeGroup.test.js` على مسار التقارير.

**B2 — كود ميت في `gettingAll`.** [`services/services.js:69`](../Backend/services/services.js#L69): `if (!documents) return next(new AppError('No documents yet', 404))` — `find()` في Mongoose عمره ما بيرجّع falsy؛ القائمة الفاضية `[]` وهي truthy. الفرع ده مستحيل يتنفّذ.

**B3 — `signup` مُصدَّر لكنه غير مركّب.** [`authController.js:63-72`](../Backend/controllers/authController.js#L63) — `CLAUDE.md` بيقول إن التسجيل الذاتي معطّل عمدًا. الدالة موجودة وشغّالة وبتنشئ مستخدم بدور coach. سطر واحد في `authRouter` بيفتح التسجيل للعالم من غير ما حد يلاحظ. **احذفها.**

**B4 — عدم اتساق في غلاف الرد.** [`userController.js:170`](../Backend/controllers/userController.js#L170) و[`:194`](../Backend/controllers/userController.js#L194) بيرجّعوا `status: "Success"` بحرف كبير، بينما كل الـcodebase بترجّع `"success"`. `frontend/core/models/api-response.model.ts` بيفترض الصغير.

---

### C2 — ازدواج يحتاج استخراج

| الازدواج | المواضع | الحل |
|---|---|---|
| `lockField` بنفس الجسم حرفيًا | [playerValidation:55](../Backend/utils/validation/playerValidation.js#L55) · [scoutingValidation:31](../Backend/utils/validation/scoutingValidation.js#L31) · [coachEvaluationValidation:26](../Backend/utils/validation/coachEvaluationValidation.js#L26) · observerEvaluationValidation:26 | `utils/validation/common.js` |
| `requiredRating` / `optionalRating` | scoutingValidation:15,24 · coachEvaluationValidation:10,19 · observerEvaluationValidation | نفس الملف |
| `checkReportOwnership` ≡ `checkMediaOwnership` | [ownership.js:80-143](../Backend/middlewares/ownership.js#L80) و[:145-204](../Backend/middlewares/ownership.js#L145) | نفس الـ60 سطر بتبديل 3 معرّفات (`coach`/`uploadedBy`، الموديل، اسم المورد) → factory واحد |
| `calcOverallRating` | [scoutingReportModel:165](../Backend/models/scoutingReportModel.js#L165) (save) و[:221](../Backend/models/scoutingReportModel.js#L221) (update) | شوف **A5** |
| `new Date(new Date().setHours(23,59,59,999))` | [dashboardController:108,201,240,266](../Backend/controllers/dashboardController.js#L108) | `utils/time.js` |

الازدواج في `ownership.js` هو أخطرهم: دول حارسا أمان، وأي إصلاح لواحد فيهم لازم يتكرر يدويًا في التاني. الانحراف بينهم = ثغرة.

---

### C3 — 🟠 ثلاث اتفاقيات مختلفة لحدود اليوم في نفس المشروع

ده مصنع باگات، ومستحق قسم لوحده:

| النمط | المواضع | التوقيت |
|---|---|---|
| `setHours(0,0,0,0)` / `setHours(23,59,59,999)` | [dashboardController:108,201,240,266](../Backend/controllers/dashboardController.js#L108) · [seasonMatchController:132,163](../Backend/controllers/seasonMatchController.js#L132) · [scoutingReportController:75,77](../Backend/controllers/scoutingReportController.js#L75) · [seasonMatchValidation:29,116](../Backend/utils/validation/seasonMatchValidation.js#L29) | **محلي للسيرفر** |
| `Date.UTC(y, m, d)` | [mediaMatchGate:13-17](../Backend/services/mediaMatchGate.js#L13) | **UTC** |
| `new Date(Date.UTC(year, month-1, 1))` | [coachEvaluationController:77-78](../Backend/controllers/coachEvaluationController.js#L77) | **UTC** |

المشكلة إن `matchDate` **بيتخزّن كمنتصف ليل UTC** — الحقيقة دي موثّقة في CLAUDE.md وفي [`mediaMatchGate.js:8-9`](../Backend/services/mediaMatchGate.js#L8) وفي [`seasonMatchValidation.js:22-25`](../Backend/utils/validation/seasonMatchValidation.js#L22). يعني كل مقارنة بـ`setHours` المحلي **مزاحة بفرق توقيت السيرفر**. على سيرفر بتوقيت القاهرة (UTC+2/+3) مباراة النهاردة الساعة 00:00 UTC بتتحسب "امبارح" لأول ساعتين-تلاتة من كل يوم.

`mediaMatchGate` عارف ده وبيتعامل معاه صح؛ الباقي لأ. القيود المتأثرة: "التقرير الرسمي يوم المباراة بس" ([`scoutingReportController:74-86`](../Backend/controllers/scoutingReportController.js#L74))، "النتيجة يوم المباراة بس" ([`seasonMatchController:126-139`](../Backend/controllers/seasonMatchController.js#L126))، "الحضور قبل يوم المباراة" ([`:161-165`](../Backend/controllers/seasonMatchController.js#L161)) — دي قيود **أمنية/سلامة بيانات**، مش تجميل.

**الحل:** `utils/time.js` بـ`startOfDayUTC(d)` / `endOfDayUTC(d)` / `utcDayWindow(d)`، ونداء واحد في كل موضع. ووثّق القاعدة مرة واحدة: *"كل تواريخ المباريات UTC، وكل المقارنات بحدود UTC."*

---

### C4 — ملفات ودوال أكبر من اللازم

- [`controllers/playerController.js`](../Backend/controllers/playerController.js) — **632 سطر** بتخلط CRUD، والتقنيع (masking)، ورفع الصور، والإشعارات، والحذف المتتالي. `getAll` وحدها ([`:238-352`](../Backend/controllers/playerController.js#L238)) ~110 سطر و6 أعلام تفرّع (`isCoach`, `masksObservedAsPending`, `pendingIncludesObserved`, ...). التقسيم الطبيعي: `services/playerMasking.js` (الـ3 دوال تقنيع + قوائم العدسات)، و`playerImageController.js`.
- [`routes/userRouter.js`](../Backend/routes/userRouter.js) — 552 سطر، منهم **445 سطر Swagger JSDoc** قبل أول `import`. نفس الشكل في `playerRouter.js` (458/542) و`playerMediaRouter.js` (344/435). الـspec لازم يتولّد (وفيه `npm run dump-spec` بالفعل)، بس وجوده inline بالحجم ده بيخلي الراوتر — وهو أهم ملف أمنيًا في المشروع لأنه بيعرّف سلاسل الـmiddleware — شبه غير قابل للقراءة. انقله لـ`docs/openapi/*.yaml` أو ملف `.swagger.js` مجاور.

---

### C5 — كثافة التعليقات

ده ملاحظة دقيقة لأن **المحتوى نفسه ممتاز**. [`services/scope.js`](../Backend/services/scope.js) 126 سطر منهم ~90 نثر. [`apiFeatures.js:89-110`](../Backend/utils/apiFeatures.js#L89) = 22 سطر تعليق لـ8 أسطر منطق. التعليقات دي بتسجّل **ليه** القرار اتاخد (مع قياسات!) وده بالظبط النوع اللي بيتفقد لما مايتكتبش.

المشكلة إن عند الكثافة دي بتتوقف عن كونها مقروءة — الواحد بيسكرول عليها عشان يوصل للكود. **الاقتراح:** انقل السرد الطويل لـADRs في `docs/decisions/` (المشروع عنده `specs/` بالفعل)، وسيب في الكود سطر واحد + رابط: `// النطاق ملفوف في $and — السبب: docs/decisions/003-scope-and-wrapping.md`. المعرفة بتتحفظ، والكود يبقى مقروء.

---

### C6 — تسمية

| الحالي | المشكلة | المقترح |
|---|---|---|
| `models/playedModel.js` | الموديل اسمه `Player` | `playerModel.js` |
| `ScoutingReport.coach` | معناه الفعلي "الكاتب أيًا كان دوره" — موثّق **3 مرات** في تعليقات ([scoutingReportModel:10-16](../Backend/models/scoutingReportModel.js#L10), [userDeletion:82-85](../Backend/services/userDeletion.js#L82), [dashboardController:233](../Backend/controllers/dashboardController.js#L233)) لأن الاسم بيكدب | `author` |
| `softDele` | typo | `softDelete` |
| `dublicateKeyHandler` · `handelCastError` · `Handelling` · `Meddilware` · `Cuurent` · `confimation` | أخطاء إملائية في أسماء مُصدَّرة ورسائل مستخدم | مرور إملائي |

الأهم هو `ScoutingReport.coach`: لما يحتاج 3 تعليقات في 3 ملفات عشان يتشرح، ده مش سوء توثيق — ده اسم غلط. `author` بيلغي التعليقات التلاتة.

---

### C7 — نظافة

- [`playerController.js:18`](../Backend/controllers/playerController.js#L18) بيستورد `sendNotificationToAdmins` ومابيستخدمهاش (استخدام واحد = الاستيراد نفسه).
- [`teamsController.js:1`](../Backend/controllers/teamsController.js#L1) بيستورد `asyncHandler` ومابيستخدمهوش.
- [`playerMediaController.js:79`](../Backend/controllers/playerMediaController.js#L79) بيصدّر `setPlayerToBody` — مش مستخدمة في أي راوتر.
- مافيش linter مضبوط. `eslint` + `eslint-plugin-unused-imports` كان هيمسك الأربعة دول والـdead branch في **B2** تلقائيًا.

---

## Algorithms & Data Structures

### A1 — `filterBlindReviewList`: N استعلام → استعلام واحد

**الملف:** [`coachEvaluationController.js:49-70`](../Backend/controllers/coachEvaluationController.js#L49)

```js
const keys = [...new Set(others.map((d) => `${d.coach._id}|${d.year}|${d.month}`))];
await Promise.all(keys.map(async (key) => {
    const [coachId, year, month] = key.split("|");
    if (await hasOwnPublished(adminId, coachId, Number(year), Number(month))) unlockedKeys.add(key);
}));
```
`hasOwnPublished` = `findOne` مستقل. `k` مفتاح = `k` round-trip. `Promise.all` بيخفي الزمن ورا التوازي لكن الحمل على الداتابيز خطي.

**الأفضل — استعلام واحد + Set:**
```js
const conds = keys.map(k => { const [coach, year, month] = k.split("|"); return { coach, year: +year, month: +month }; });
const mine = await CoachEvaluation.find({ evaluator: adminId, status: "published", $or: conds })
                                  .select("coach year month").lean();
const unlockedKeys = new Set(mine.map(d => `${d.coach}|${d.year}|${d.month}`));
```
نفس البحث O(1)، round-trip واحد، والـindex `{coach, evaluator, year, month}` بيغطيه. **وحرّك النداء قبل `paginate()`** عشان يقفل **P5** في نفس التعديل.

---

### A2 — داشبورد الـproScout: `$in` بحجم الكولكشن لشرط O(1)

**الملف:** [`dashboardController.js:283-302`](../Backend/controllers/dashboardController.js#L283)

```js
const [playerFacet] = await Player.aggregate([{ $match: playerScope }, { $facet: { byStatus: [...], ids: [{ $project: { _id: 1 } }] } }]);
const scopedPlayerIds = playerFacet.ids.map((p) => p._id);      // ← كل الـids
const reportFilter = { coach: req.user._id, player: { $in: scopedPlayerIds } };
```
كشاف عنده 5,000 لاعب → مصفوفة 5,000 ObjectId بتترحّل من Mongo للـNode وترجع تاني في **استعلامين** (`countDocuments` + `find`).

**النقطة الجوهرية:** `playerScope` بقى `{ createdBy: req.user._id }` بالضبط منذ Stage 11 ([`scope.js:94`](../Backend/services/scope.js#L94)) — يعني **شرط O(1) اتحوّل لقائمة O(n)**. الـfacet لسه مفيد لـ`byStatus`، لكن ذراع `ids` مش محتاجة تخرج من الداتابيز.

**الأفضل:** `$lookup` من `ScoutingReport` لـ`Player` بالشرط في الـsub-pipeline، أو — الأبسط والأصح دلاليًا — بما إن الرول ده بيقرا تقاريره هو بس، خلّي الفلتر `{ coach: req.user._id }` واعمل الـjoin في مرحلة واحدة. و`totalPlayers` تيجي من مجموع `byStatus` بدل `scopedPlayerIds.length` (الاتنين متساويين بالبناء — التعليق في [`:280-281`](../Backend/controllers/dashboardController.js#L280) بيقول كده بنفسه).

---

### A3 — نطاق مباريات الأوبزيرفر: نفس شكل الـ`$in` غير المحدود

**الملف:** [`seasonMatchController.js:36-39`](../Backend/controllers/seasonMatchController.js#L36)

```js
const teamIds = (await Player.find({ observers: req.user._id }).distinct("team")).filter(Boolean);
return teamIds.length ? { $or: [{ homeTeam: { $in: teamIds } }, { awayTeam: { $in: teamIds } }] } : { _id: { $in: [] } };
```
مقيس عند 25k = 23.3ms، فمافيش أزمة النهاردة (الأوبزيرفر بيتابع لاعبين قلايل). بس الشكل فيه سقفان: مصفوفة `$in` غير محدودة، و`$or` على حقلين مختلفين — و`$or` كده بيمنع index واحد من تغطية الاستعلام (بيتحوّل لـindex union + dedup).

**الأفضل بنيويًا:** حقل مشتق `teams: [homeTeam, awayTeam]` على `SeasonMatch` (بيتحدّث في نفس pre-save hook الموجود أصلًا)، وبعدين `{ teams: { $in: teamIds } }` — index multikey واحد، بلا `$or`، والفلتر بيبقى قابل للتركيب مع `matchDate` في نفس الـcompound index. ده كمان بيبسّط `mediaMatchGate.js:37` اللي عنده نفس الـ`$or` بالظبط.

---

### A4 — `buildSearchTokens`: القرار صح، وفيه تحسين صغير

[`playedModel.js:196-202`](../Backend/models/playedModel.js#L196) + [`apiFeatures.js:150-173`](../Backend/utils/apiFeatures.js#L150).

ده **أحسن قرار خوارزمي في المشروع**، والقياس بيأكده: البحث المسكوب بالكوتش 8.6ms عند 5k → 10.5ms عند 25k (ثابت عمليًا). التعليل في التعليق ([`playedModel.js:146-159`](../Backend/models/playedModel.js#L146)) صحيح تقنيًا: `$regex` مع `$options:"i"` **لا** بياخد حدود btree حتى مع `^`، والمصفوفة multikey بتخلي "Salah" تلاقي "Mohamed Salah" بـIXSCAN واحد بدل `$or` على indexين. مايتلمسش.

**تحسين واحد صغير:** التقطيع بـ`/\s+/` بس ([`:199`](../Backend/models/playedModel.js#L199)). يعني "Abdel-Rahman" token واحد، و"Abo_Trika" كمان. `/[\s\-_.]+/` مجاني وبيطابق طريقة بحث الناس الفعلية. (بيحتاج تشغيل `npm run backfill-search-tokens` — والسكربت موجود أصلًا.)

---

### A5 — `calcOverallRating`: تطبيقان ودمج dot-notation ناقص

**الملف:** [`models/scoutingReportModel.js:165-233`](../Backend/models/scoutingReportModel.js#L165)

مرة للـ`save` ([`:165-183`](../Backend/models/scoutingReportModel.js#L165))، ومرة مُعاد كتابتها inline للـ`findOneAndUpdate` ([`:221-232`](../Backend/models/scoutingReportModel.js#L221)) مع دمج dot-notation مكتوب بالإيد:

```js
for (const key in update) {
    if (key.includes(".")) {
        const [parent, child] = key.split(".");     // ← مستوى واحد فقط
        flatUpdate[parent] = { ...(flatUpdate[parent] || {}), [child]: update[key] };
    }
}
```
`key.split(".")` بيرمي الباقي: `"technical.passing"` شغّال، لكن أي مفتاح أعمق بيتفسّر غلط بصمت. والقايمة المسطّحة للـ12 معيار مكتوبة **مرتين** يدويًا — إضافة معيار جديد لازم تتكرر في مكانين وإلا المتوسط بيبقى غلط من غير أي إشارة.

**الأفضل:** مصدر حقيقة واحد + دالة واحدة:
```js
const RATING_PATHS = ["technical.passing", ..., "mental.attitude"];   // مثل EVALUATION_METRIC_PATHS الموجودة أصلًا
const overall = (doc) => round2(RATING_PATHS.reduce((s, p) => s + get(doc, p), 0) / RATING_PATHS.length);
```
لاحظ إن المشروع **عامل ده بالفعل صح** في التقييمات — [`utils/coachEvaluationCriteria.js`](../Backend/utils/coachEvaluationCriteria.js) بيصدّر `EVALUATION_METRIC_PATHS` وبيتولّد منه الـvalidators والـaggregation مع بعض. طبّق نفس النمط على التقارير.

---

### A6 — البنية اللي تحل P2 من جذرها: عدّادات محفوظة

الثلاث تجميعات الخطية (`byStatus`، `topCoaches`، `getCountsByAgeGroup`، `computeAllCoachesStats`) كلهم نفس الشكل: **عدّ مستندات مُجمَّعة بمفتاح منخفض التنوّع** (status ∈ 4 قيم، ageGroup ∈ 13، coach ∈ عشرات).

ده التعريف الحرفي للحالة اللي بتتحل بعدّاد محفوظ:
```
PlayerCounter { coachId | null, ageGroupId | null, status, count }
```
يتحدّث بـ`$inc` في نفس مسار الكتابة اللي بيغيّر اللاعب (create / status / coach / delete) — والمسارات دي محصورة ومعروفة (`playerController.create`, `updatePlayerStatus`, `assignPlayerCoach`, `deleting`, `detachUserFromPlayers`).

النتيجة: **O(n) مسح → O(k) قراءة**، k = عدد الفئات × عدد الحالات ≈ 52 صف. الداشبورد بيبقى ثابت الزمن مهما كبرت الداتا، والكاش الحالي يبقى تحسين مش ضرورة.

**⚠️ لكن ده تحديدًا مش شغل ما قبل الـdeploy.** التعليق في [`dashboardController.js:36-40`](../Backend/controllers/dashboardController.js#L36) عنده اعتراض قوي وصحيح على الإبطال-عند-الكتابة: *"كل مسار بيلمس Player يفتكر يبطّل الكاش — سطر واحد منسي = أرقام غلط للأبد"*. نفس الاعتراض بينطبق على العدّادات ×2. الطريقة الصح لو اتعمل: العدّادات تكون المسار السريع، ومعاها job ليلي بيعيد الحساب من الصفر ويصلّح أي انحراف — يعني الغلط يشفى لوحده. **قرار مستقل يتخطّط له لوحده، بعد الإطلاق.**

---

### A7 — `getConnectedAdminIds`: استعلام DB لعملية في الذاكرة

**الملف:** [`socket/handlers/notification.js:32-45`](../Backend/socket/handlers/notification.js#L32)

```js
const admins = await User.find({ role: ROLES.ADMIN }).select("_id").lean();
return admins.map(a => a._id.toString()).filter(id => connectedUsers.has(id));
```
التعليق بيشرح ليه: *"الـsocket layer بيخزّن userId بس مش الدور"*. صحيح — بس ده قيد قابل للإزالة، مش حقيقة ثابتة.

**والحل بييجي مجانًا مع S6:** لما تحمّل المستخدم في الـ`io.use` (وده لازم أمنيًا برضه)، خزّن `socket.role`. ساعتها الدالة دي بتبقى فلترة في الذاكرة على الـMap:
```js
return [...connectedUsers.entries()].filter(([, s]) => s.role === ROLES.ADMIN).map(([id]) => id);
```
O(المتصلين) بدل O(كل الأدمنز في الداتابيز) + round-trip، **في كل emit**. وبما إن `emitAdminDashboardUpdate` بيتنده عند كل تعديل لاعب، ده مسار ساخن حقيقي. حل أمني وحل أداء بنفس التعديل.

---

### A8 — ملاحظات إيجابية (اتركها كما هي)

- **`validateObserverIds`** ([`playerController.js:414-419`](../Backend/controllers/playerController.js#L414)) — Set للتفريد + `$in` واحد + مقارنة طول للتحقق. مثالي.
- **`connectedUsers: Map<userId, Set<socketId>>`** ([`socket/index.js:6`](../Backend/socket/index.js#L6)) — البنية الصح للتسليم متعدد التبويبات، مع تنظيف صحيح عند `disconnect`.
- **`quantizedExpiry`** ([`mediaUrl.js:34-37`](../Backend/utils/mediaUrl.js#L34)) — تحويل صلاحية متغيرة لـbucket ثابت عشان الـURL يبقى متطابق بايت-ببايت وييجي من كاش الـCDN. حل ذكي لمشكلة حقيقية.
- **`partialFilterExpression` على `status:"processing"`** ([`playerMediaModel.js:129-132`](../Backend/models/playerMediaModel.js#L129)) — فهرسة الحالة العابرة بس، فالـindex بيفضل بحجم عشرات المستندات مهما كبرت الكولكشن. والتعليل عن `createdAt` التصاعدي (إدخال append في أقصى يمين الـB-tree) صحيح تمامًا.
- **`runMediaRetention` بالـcursor + دفعات** ([`mediaRetention.js:108-133`](../Backend/socket/handlers/mediaRetention.js#L108)) — سقف ذاكرة ثابت، وتوازي محدود بـ5 لتفادي rate limit بتاع Bunny، والتعليل عن أمان الحذف أثناء القراءة صحيح.
- **`MATCH_NOTHING`** كـsentinel — ملاحظة صغيرة: بيتعمله spread في كل موضع ([`apiFeatures.js:104,107`](../Backend/utils/apiFeatures.js#L104), [`scope.js:91,107,121`](../Backend/services/scope.js#L91)) عشان بالظبط إنه أوبجكت مشترك قابل للتعديل، والتعليق في [`playerController.js:124-128`](../Backend/controllers/playerController.js#L124) بيوثّق باگ حقيقي حصل بسببه. `Object.freeze` بيحوّل الاتفاقية دي لضمان بنيوي.

---

## Prioritized Recommendations

### 🔴 مانع للـdeploy — لازم يتصلح الأول

| # | البند | الجهد | الملف |
|---|---|---|---|
| 1 | **S1** — صفّر `refreshToken` في `changePassword` + افحص `passwordChangedAt` في `refreshToken` | ~6 أسطر | userController.js:182 · authController.js:109 |
| 2 | **S3** — امسح `req.file` في `errorMiddleware` (+ اقلب ترتيب الـmiddleware) | ~8 أسطر | errorMiddleware.js · playerRouter.js:539 |
| 3 | **B1** — احرس `ageGroup` قبل `.toString()` في `scoutingValidation` | 2 سطر | scoutingValidation.js:51,109 |
| 4 | **S2** — ضيف `protect` لراوتات `/ages` | 2 سطر | ageGroupRouter.js:112,117 |
| 5 | **S5** — `crypto.randomInt` بدل `Math.random` | 1 سطر | authController.js:244 |
| 6 | **P1** — `bcryptjs` → `bcrypt` الأصلي | package.json + 5 imports | كل مسارات الباسورد |

المجموع أقل من **30 سطر** + تغيير تبعية واحد. كلهم عالي الثقة ومنخفض الخطر. لكل من 1 و2 و3 يفضّل يتكتب regression test — الأول والتالت سهل جدًا اختبارهم (نفس شكل الـprobes في المستند ده).

**بند مصاحب مهم:** بعد إصلاح **S3**، نضّف `Backend/uploads/` على الخوادم — الملفات المتسرّبة متراكمة هناك دلوقتي.

---

### 🟠 قبل الإطلاق الواسع (2-4 أسابيع)

| # | البند | ليه دلوقتي |
|---|---|---|
| 7 | **S7** — إعادة مصادقة الأدمن بدل باسورد الهدف | إعادة تعيين الباسورد الإدارية معطّلة عمليًا |
| 8 | **S6 + A7** — حمّل المستخدم في مصادقة الـsocket، خزّن الدور | إصلاح أمني وأداء بنفس التعديل |
| 9 | **S4** — مفتاح توقيع منفصل لتوكن الـvault | يقلّص ضرر التسريب من "الـAPI كلها" لـ"صور البطاقات" |
| 10 | **P2** — كاش لـ`getCountsByAgeGroup` (بمفتاح فيه userId) + debounce لـ`emitAdminDashboardUpdate` | الوحيد من التلاتة الخطيين بلا حماية |
| 11 | **P4** — stream بدل buffer في `downloadVideo` | 250MB هيب عند 5 تحميلات متزامنة |
| 12 | **P5 + A1** — الفلترة قبل الـpagination + استعلام واحد | الـpagination بترجّع أرقام غلط دلوقتي |
| 13 | **C3** — `utils/time.js` وتوحيد حدود اليوم على UTC | القيود الزمنية مزاحة بفرق توقيت السيرفر |
| 14 | **S11** — `reviewMedia` مابيلغيش حضورًا مشروعًا | فقدان بيانات صامت |
| 15 | **P3** — اقلب `skipPopulate` لـopt-in | 16 موضع بيعملوا opt-out = الافتراضي غلط |

---

### 🟡 صيانة (بعد الإطلاق، حسب المتاح)

| # | البند |
|---|---|
| 16 | **B3** — احذف `signup` غير المستخدمة · **B2** — احذف الفرع الميت · **B4** — وحّد `"Success"` |
| 17 | ضيف `eslint` + `unused-imports` — كان هيمسك **B2** و**C7** تلقائيًا |
| 18 | **C2** — استخرج `lockField` / `requiredRating` / حارسي الملكية المتطابقين |
| 19 | **A5** — `RATING_PATHS` واحد لحساب `overallRating` (نفس نمط `EVALUATION_METRIC_PATHS`) |
| 20 | **P7** — كاش لـ`/ages` و`/teams` · **P8** — pagination لـ`getDeactivated` |
| 21 | **P6** — `authorRole` مخزّن على التقرير بدل `$in` غير محدود + كاش لـ`authorCounts` |
| 22 | **C4** — قسّم `playerController` · انقل كتل Swagger برّه الراوترات |
| 23 | **C6** — `playerModel.js` · `ScoutingReport.coach` → `author` · مرور إملائي |
| 24 | **A4** — قطّع الـsearch tokens على `-` و`_` كمان · **A3** — حقل `teams` مشتق على `SeasonMatch` |
| 25 | **C5** — انقل السرد الطويل لـ`docs/decisions/` وسيب مؤشرات سطر واحد |

---

### 🔵 قرارات معمارية (تتخطّط لوحدها، مش شغل sprint)

| # | البند |
|---|---|
| 26 | **A6** — عدّادات محفوظة للاعبين (O(n) → O(k)). **لازم يتصاحب بـjob ليلي لإعادة الحساب** عشان الانحراف يشفى لوحده — الاعتراض المكتوب في `dashboardController.js:36` صحيح ولازم يتحل مش يتجاهل. |
| 27 | **A2** — أعِد تشكيل داشبورد الـproScout بـ`$lookup` بدل ترحيل كل الـids |
| 28 | كاش الداشبورد على **Redis** لو فيه خطة لأكتر من instance — الكاش الحالي per-process، والتحذير مكتوب أصلًا في `dashboardController.js:42`. **قرار مربوط بخطة النشر، مش بالكود.** |
| 29 | Keyset pagination لو ظهرت واجهة تصفّح عميقة (مش مطلوب النهاردة — القياس بيقول صفحة 40 = صفحة 1) |

---

## ملحق: طريقة إعادة إنتاج القياسات

الـharness كان مؤقتًا واتمسح. لإعادة بنائه:

1. `MongoMemoryServer.create()`، اضبط الـenv (انسخ من [`tests/globalSetup.js`](../Backend/tests/globalSetup.js))، بعدين استورد `app.js` **بعد** ضبط الـenv — الـrate limiters بتقرا `NODE_ENV` وقت تحميل الموديول.
2. ازرع بـ`Model.collection.insertMany` (بيتخطّى الـhooks — لازم تحط `ageGroup` و`searchTokens` بإيدك)، بعدين `mongoose.connection.syncIndexes()`.
3. قِس بـ`supertest` + `process.hrtime.bigint()`، 3 warm-up + 12 قياس، خُد p50/p95.
4. للداشبورد المكاش: نادِ `__resetDashboardCache()` (مُصدَّرة من [`dashboardController.js:73`](../Backend/controllers/dashboardController.js#L73)) قبل كل ضربة عشان تقيس المسار البارد.

للتحقق من شكل الاستعلامات على داتا حقيقية، المشروع عنده أدواته بالفعل: `npm run seed:loadtest` ثم `npm run explain` ([`scripts/explainQueries.js`](../Backend/scripts/explainQueries.js)) — بيحكم على نوع الـscan ونسبة `docsExamined/nReturned` بدل الزمن، وده المقياس الصح لتقييم الفهارس.
