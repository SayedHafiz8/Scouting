# مراجعة شاملة للفرونت إند — Talent Radar

**التاريخ:** 2026-08-24
**النطاق:** `frontend/` بالكامل (50 كومبوننت، 16 سيرفس، ~23.5k سطر TS/HTML/SCSS) — الأمان، الأداء، جودة الكود، الخوارزميات وبنى البيانات
**الفرع:** `fix-critical-audit-findings` (متفرّع من `main`)
**طبيعة المستند:** مراجعة فقط — لم يُعدَّل أي سطر من كود المشروع.

**كيف اتقاست الأرقام:** أرقام الـbundle كلها متقاسة فعليًا من `ng build --configuration=production` على نفس الكوميت. البناء اتنفّذ على **نسخة من الشجرة في مجلد مؤقت** (مع junction لـ`node_modules`) لأن `src/styles.scss:5` بيعمل `@import url('https://fonts.googleapis.com/...')` والبيلد بيفشل من غير إنترنت — وده بند بحد ذاته (**P4**). التعديل الوحيد في النسخة المؤقتة كان شيل سطر الخط ده؛ ملفات المشروع نفسها ماتلمستش.

> **ملاحظة على القياس:** أرقام `provideAnimations` (P1) اتقاست بمقارنة بيلدين كاملين — مش تقدير. الأرقام اللي مش متقاسة (زي عدد الريكوستات في مسار الأوبزيرفر) مشتقّة من قراءة الكود مباشرة ومكتوب معاها الاشتقاق.

> ## ✅ تحديث 2026-08-24 — ستة بنود اتقفلوا في نفس اليوم
>
> بعد المراجعة دي مباشرة، الست بنود الأخطر (S1, B1, B2, P1, P2, P4) اتصلحوا في كوميت واحد على نفس الفرع، كل واحد بتست/قياس بيثبت الإصلاح (بنفس أسلوب مراجعة الباك إند):
>
> | البند | الإصلاح | الدليل |
> |---|---|---|
> | **S1** | `decorateMedia(mediaDoc, viewerRole)` — `url`/`embedUrl`/`download` أدمن-فقط دلوقتي من الـAPI نفسه، مش من الـtemplate بس | تست جديد `Backend/tests/mediaPlaybackScope.test.js` فشل على الكود القديم (رجّع رابط HLS موقّع حقيقي لكوتش) ونجح على الجديد؛ 762/762 تست باك إند فضلوا شغّالين |
> | **B1** | الأيقونات الأربعة اتحوّلت من `[innerHTML]` لـ`@switch` بـSVG حقيقي في الـtemplate | 8 سبيكات جديدة: 7/8 فشلوا على الكود القديم (والكونسول طبع تحذير الـsanitizer نفسه)، 8/8 نجحوا بعد الإصلاح |
> | **B2** | `SocketService.disconnect()` مابقاش بيعمل `.complete()` على الـSubjects | 3 سبيكات جديدة فشلوا على الكود القديم ونجحوا بعد الإصلاح |
> | **P1** | `provideAnimations()` اتشالت (صفر استخدام لـAngular animations في المشروع) | قياس معزول: **571.72 → 508.95 kB raw** (−62.77 kB)، **145.41 → 128.82 kB transfer** (−16.59 kB) |
> | **P2** | `PreloadAllModules` استُبدلت بـ`RolePreloadStrategy` (حسب الدور، مؤجّل لـidle) | جدول preload حسب الدور: admin −5%، كوتش −30%، أوبزيرفر −31%، proScout −35% من الـ668.4 kB اللي كل دور كان بيحمّلها قبل كده؛ 6 سبيكات جديدة |
> | **P4** | استضافة الخطوط محليًا (`src/assets/fonts/`) بدل `@import` لـGoogle Fonts | بناء بشبكة معطوبة (proxy غير قابل للوصول) فشل على الكود القديم (`ECONNREFUSED`) ونجح على الجديد؛ الـbundle النهائي **485.03 kB raw / 128.34 kB transfer** — **تحت الـbudget بلا تحذير** |
>
> **إجمالي النتيجة:** الـinitial bundle نزل من 572.21 kB (خط مباشر من Google) لـ485.03 kB — **−87.18 kB (−15.2%)** — والبناء بقى ما يعتمدش على شبكة خارجية. الباك إند 37/37 ملف تست (762/762 تست) والفرونت 195/195 سبيك، الاتنين بلا رجعة.

---

## Executive Summary

**الحالة العامة: بنية معمارية سليمة ومتّسقة، وعليها طبقة تنفيذ فيها ست مشاكل حقيقية — تلاتة منهم بيكسروا وظايف ظاهرة للمستخدم النهاردة، مش مخاطر نظرية.**

الأساس كويس فعلًا: standalone components من غير استثناء، كل feature ليها سيرفس مخصوص، الـlazy loading متطبّق على كل مسار (62 lazy chunk)، الـinterceptor بيطابور الـ401 على refresh واحد صح، والتوكن عايش في الذاكرة بس. الـsidebar مبني بـdeny-by-default حقيقي ([`sidebar.component.ts:331-335`](../frontend/src/app/layout/sidebar/sidebar.component.ts#L331))، و`RoleLandingService` بيمنع حلقات إعادة التوجيه. **ومفيش أي سطح XSS**: كل الداتا الجاية من الـAPI بتتعرض بـinterpolation، ومفيش `bypassSecurityTrustHtml` ولا واحد في المشروع.

المشاكل مش في التصميم — هي في **إن التنفيذ بيخالف نيّة التصميم في نقط محددة**: الأيقونات كلها متكتوبة بطريقة Angular بيمسحها، الـSocket subjects بتتقفل نهائيًا عند أول logout، وبوابة "تشغيل الفيديو للأدمن بس" مبنية في الـtemplate بينما الـAPI بيبعت الرابط الموقّع للكل.

### أخطر 6 بنود — لازم تتصلح قبل الـdeploy

| # | البند | الخطورة | الملف |
|---|---|---|---|
| **B1** | كل أيقونات SVG المعروضة بـ`[innerHTML]` **بتتمسح** من الـsanitizer — أيقونة كل toast وكل empty-state وكل نوتيفيكيشن مش ظاهرة في الـproduction | Critical (وظيفي) | [empty-state.component.ts:10](../frontend/src/app/shared/components/empty-state/empty-state.component.ts#L10) + 3 مواضع |
| **B2** | `SocketService.disconnect()` بيعمل `.complete()` للـSubjects — بعد أول logout، **الريل-تايم كله بيموت** لباقي عمر التاب | Critical (وظيفي) | [socket.service.ts:74-80](../frontend/src/app/core/services/socket.service.ts#L74) |
| **S1** | تشغيل الفيديو "أدمن-فقط" محروس في الـtemplate بس — الـAPI بيرجّع `embedUrl` موقّع لكل الأدوار | High | [playerMediaController.js:47](../Backend/controllers/playerMediaController.js#L47) ← → [media-gallery.component.ts:356](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L356) |
| **P1** | `provideAnimations()` متسجّل والمشروع **مش بيستخدم Angular animations خالص** — **63.5 kB** زيادة في الـinitial bundle، ومعاها تحذير الـbudget | High | [app.config.ts:21](../frontend/src/app/app.config.ts#L21) |
| **P2** | `PreloadAllModules` بيحمّل **كل الـ62 lazy chunk** بعد أول تنقّل — بما فيها صفحات الأدمن للكوتش | High | [app.config.ts:16](../frontend/src/app/app.config.ts#L16) |
| **P6** | البحث في اللاعبين بيبعت **ريكوستين مع كل ضغطة زرار** بلا debounce ولا switchMap | High | [player-list.component.ts:277](../frontend/src/app/features/players/player-list/player-list.component.ts#L277) |

B1 وB2 وP1 إصلاحهم مجتمعين أقل من 20 سطر. P1 لوحده بيرجّع الـbundle تحت الـbudget المكتوب في `angular.json`.

---

## Security

### S1 — High: بوابة تشغيل الفيديو مبنية على إخفاء الواجهة، والـAPI بيبعت الرابط للكل

**الملفات:** [`Backend/controllers/playerMediaController.js:44-49`](../Backend/controllers/playerMediaController.js#L44) ← → [`media-gallery.component.ts:78, 211, 352-359`](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L352)

`decorateMedia` بيزوّد كل مستند ميديا بروابط موقّعة **من غير أي شرط على الدور**:

```js
// playerMediaController.js:45
if (obj.status === "ready" && obj.bunnyVideoId) {
    obj.url       = streamHlsUrl(obj.bunnyVideoId);
    obj.embedUrl  = streamEmbedUrl(obj.bunnyVideoId);   // ← رابط تشغيل موقّع جاهز
    obj.thumbnail = streamThumbnailUrl(obj.bunnyVideoId);
```

والراوت مفتوح للأدوار الأربعة:
```js
// playerMediaRouter.js:410
.get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkPlayerOwnership, getAll)
```

وعلى الناحية التانية، القيد كله عايش في الفرونت:
```ts
// media-gallery.component.ts:352
openModal(item: PlayerMedia): void {
  if (item.type === 'video') {
    // Playback is admin-only (bandwidth control) ...
    if (!this.auth.isAdmin() || item.status !== 'ready') return;
  }
```

**الخطر الفعلي:** أي كوتش أو أوبزيرفر مصادَق عليه يفتح DevTools → Network على `GET /players/:id/media` ويلاقي `embedUrl` و`url` (HLS) موقّعين وجاهزين. النية المكتوبة في التعليق ("bandwidth control") **مش متطبّقة أصلًا** — الإخفاء في الـtemplate بيمنع الضغطة، مابيمنعش الوصول. والرابط قابل للمشاركة بره النظام طول مدة صلاحية التوكن.

**الدليل إن ده انحراف مش قرار:** نفس الميزة بالظبط، في نفس الملف، **متطبّقة صح** على مسار التحميل — [`playerMediaRouter.js:429`](../Backend/routes/playerMediaRouter.js#L429):
```js
.route("/:id/download").get(protect, allowedTo(ROLES.ADMIN), ...)
```
فالفريق عارف إزاي يقفل الحاجة دي؛ اتقفلت على `download` واتنسيت على `embedUrl`.

**الحل:** في `decorateMedia`، خُد `req.user.role` وامنع `embedUrl`/`url` عن غير الأدمن (سيب `thumbnail` عشان الكارت). بعد كده الحراسة في الـtemplate بتبقى **تحسين تجربة** فوق قيد حقيقي، مش القيد نفسه.

---

### S2 — Medium-High: بيانات المستخدم الكاملة متخزّنة في `sessionStorage` بلا داعي

**الملفات:** [`auth.service.ts:89, 153, 174`](../frontend/src/app/core/auth/auth.service.ts#L174) ← → [`auth.interceptor.ts:40`](../frontend/src/app/core/interceptors/auth.interceptor.ts#L40)

```ts
// auth.service.ts:174
sessionStorage.setItem('tr_user', JSON.stringify(user));
```

الـobject ده بيحتوي `_id`, `name`, `email`, `phoneNumber`, `address`, `birthDate`, `role`, `profileImg` (رابط موقّع).

**الملاحظة الحاسمة:** بحثت في كل الـcodebase عن أي قارئ لـ`tr_user`. فيه **قارئ واحد بس**:
```ts
// auth.interceptor.ts:40
if (!sessionStorage.getItem('tr_user') && !auth.accessToken()) {
```
يعني القيمة **مابتتقريش أبدًا** — بيتشاف وجودها فقط. المشروع بيخزّن بروفايل كامل عشان يجاوب على سؤال boolean.

**الخطر الفعلي:** مش تصعيد صلاحيات. لكنه بيوسّع سطح التسريب: أي سكريبت طرف تالت أو امتداد متصفح أو أي XSS مستقبلي (النهاردة مفيش، بس ده بيتغيّر) بيقرا PII كامل بدل ما يقرا `"1"`. والقاعدة الأساسية إن `sessionStorage` مش مكان للـPII لما مفيش سبب.

**الحل:** `sessionStorage.setItem('tr_session', '1')`. سطر واحد في كل موضع، وصفر تغيير في السلوك — لأن القارئ الوحيد بيفحص الوجود بس.

---

### S3 — Medium: `bypassSecurityTrustResourceUrl` على رابط جاي من الـAPI بلا فحص أصل

**الملف:** [`media-gallery.component.ts:362-369`](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L362)

```ts
safeEmbed(url: string): SafeResourceUrl {
  let safe = this.embedCache.get(url);
  if (!safe) {
    safe = this.sanitizer.bypassSecurityTrustResourceUrl(url);   // ← ثقة كاملة
```

`url` جاي من `item.embedUrl` — يعني من الـAPI. الـ`bypass` ده بيلغي **كل** فحوصات Angular على الـURL قبل ما يتحط في `<iframe src>`.

**الخطر الفعلي:** النهاردة الباك إند بيبني الرابط من `bunnyConfig` فالقيمة مضمونة، **فالتصنيف Medium مش High**. لكن ده بالظبط نمط "ثقة عمياء في بيانات الـAPI": أي مسار مستقبلي يخلّي `embedUrl` مشتق من داتا يتحكم فيها المستخدم (اسم ملف، حقل ميتاداتا، تكامل مع مزوّد تاني) بيتحوّل فورًا لـiframe injection أو `javascript:` — بلا أي تحذير من الكومبايلر لأن الـbypass موجود.

**الحل:** فحص أصل صريح قبل الثقة:
```ts
const u = new URL(url);
if (u.protocol !== 'https:' || !u.hostname.endsWith('.mediadelivery.net')) return null;
```
ده بيحوّل الافتراض الضمني ("الباك إند دايمًا هيبعت رابط Bunny") لشرط مكتوب بيفشل بصوت عالي لو اتكسر.

---

### S4 — Medium: مسار تسجيل ذاتي كامل وميت في الكود

**الملفات:** [`signup.component.ts`](../frontend/src/app/features/auth/signup/signup.component.ts) (118 سطر) + [`auth.service.ts:50-59`](../frontend/src/app/core/auth/auth.service.ts#L50)

```ts
// auth.service.ts:50
async signup(payload: SignupPayload): Promise<void> {
  const res = await firstValueFrom(this.http.post<...>(`${this.baseUrl}/signup`, ...));
  if (res.data) this.setSession(res.data.user, res.data.accessToken);
}
```

الكومبوننت **مش مركّب في أي راوت** — [`auth.routes.ts`](../frontend/src/app/features/auth/auth.routes.ts) فيه `login` و`forgot-password` بس. و`CLAUDE.md` بيقول صراحة إن التسجيل الذاتي معطّل عمدًا، والباك إند مش بيركّب الراوت.

**الخطر الفعلي:** ده **بالظبط** توأم البند **B3** في مراجعة الباك إند (`signup` مُصدَّرة وغير مركّبة). دلوقتي عندنا الطرفين الميتين موجودين وشغالين: دالة كليَنت جاهزة، وكومبوننت جاهز، ودالة سيرفر جاهزة. **سطرين** — واحد في `authRouter.js` وواحد في `auth.routes.ts` — بيفتحوا التسجيل للعالم، ومحدش هيلاحظ في الـcode review لأن الشغل كله موجود ومكتوب وشكله متعمّد. وكمان كل نصوص الكومبوننت ده إنجليزي متشدّد بلا i18n، فهو حتى مش صالح للاستخدام لو اتقرر تفعيله.

**الحل:** احذف الكومبوننت و`AuthService.signup()` و`SignupPayload`. لو التسجيل الذاتي مطلوب مستقبلًا، يتكتب وقتها بقرار واعي.

---

### S5 — Medium: معرّفات داخلية (ObjectId) بتتسرّب للواجهة

**الملف:** [`player-detail.component.ts:637-641`](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L637)

```ts
teamLabel(): string {
  const team = this.player()?.team;
  if (team) return typeof team === 'string' ? team : team.name;   // ← بيرجّع الـid نفسه
  return this.player()?.teamName ?? '';
}
```

التعليق فوق الدالة بيقول "guard against a plain id string too" — لكن الكود **بيعرض** الـid بدل ما يحرس منه.

**الدليل إن ده غلط مش قرار:** نفس المنطق في [`player-list.component.ts:925-929`](../frontend/src/app/features/players/player-list/player-list.component.ts#L925) معمول صح:
```ts
teamName(player: Player): string {
  const team = player.team;
  if (team && typeof team !== 'string') return team.name;   // ← بيرفض الـid
  return player.teamName ?? '';
}
```
والتعليق هناك صريح: *"never show the raw id, only a real team name"*. نفس القاعدة، تطبيقان متعاكسان، على نفس الحقل.

**الخطر الفعلي:** منخفض (الـObjectId مش سر)، لكنه تسريب لبنية داخلية في واجهة المستخدم، وبيدي مهاجم خريطة معرّفات مجانية، وبيبان للمستخدم كـbug. **الحل:** انسخ نسخة `player-list` — وأحسن، استخرجهم لدالة واحدة (شوف **C2**).

---

### S6 — Medium: باسورد الأدمن الخام بيفضل في الذاكرة بعد فتح الخزنة

**الملف:** [`user-detail.component.ts:377, 473-536`](../frontend/src/app/features/users/user-detail/user-detail.component.ts#L507)

```ts
vaultPasswordInput = '';                    // :377  — مربوط بـ[(ngModel)]
...
async submitVaultPassword(): Promise<void> {
  const { vaultToken } = await this.auth.verifyVaultPassword(this.vaultPasswordInput);
  ...
  this.showVaultModal.set(false);           // ← الحقل مااتمسحش
}
```

الحقل بيتصفّر في `openVaultModal()` بس — يعني بعد فتح ناجح، **باسورد تسجيل الدخول بتاع الأدمن** بيفضل نص خام على الـinstance طول ما الصفحة مفتوحة (ومتاح في أي heap snapshot أو من devtools).

وكمان الـinput نفسه ([`:338`](../frontend/src/app/features/users/user-detail/user-detail.component.ts#L338)) مالوش `autocomplete="current-password"`، فالمتصفح ممكن يعرض "احفظ الباسورد الجديد ده" على باسورد قديم.

**الخطر الفعلي:** ده أخطر باسورد في النظام (بيفتح صور البطاقات الشخصية — أخطر داتا في المشروع حسب مراجعة الباك إند). والاحتفاظ بيه بعد استهلاكه مافيهوش أي فايدة وظيفية.

**الحل:** `this.vaultPasswordInput = '';` في `finally` جوه `submitVaultPassword`، و`autocomplete="current-password"` على الـinput.

---

### S7 — Low-Medium: حراسة الأدوار على مستوى الراوت غير متّسقة

`coach-evaluations.routes.ts` بيحط `roleGuard` على **كل** child route (4 من 4). في المقابل [`players.routes.ts`](../frontend/src/app/features/players/players.routes.ts) و[`users.routes.ts`](../frontend/src/app/features/users/users.routes.ts) **مالهمش أي guard داخلي** — `/players/new` و`/players/:id/edit` مفتوحين لأي دور مسجّل دخول (بما فيهم الأوبزيرفر والأدمن اللي مايقدروش ينشئوا لاعبين).

**الخطر الفعلي:** **مش ثغرة** — الباك إند بيرفض بـ403 وده الحد الصحيح. البند مسجّل هنا لسببين:
1. **تجربة مكسورة:** المستخدم بيوصل لفورم كامل، يملاه، وبعدين ياخد 403 عند الحفظ. الحارس المفقود ده كان هيوفّر عليه الشغل ده.
2. **تناقض في النموذج:** لو الفريق أضاف guard على feature وسابه على تانية، الـcode review الجاي مش هيعرف إيه القاعدة. حدّد القاعدة صراحة — "الـguards للتجربة بس، الباك إند هو الحد" — وطبّقها في كل مكان أو في ولا مكان.

---

### S8 — Low: سياسة CSP مستحيلة التطبيق بالشكل الحالي

الباك إند بيستخدم `helmet()` بإعداداته الافتراضية ([`app.js:39`](../Backend/app.js#L39))، اللي فيها CSP افتراضية. لكن الفرونت فيه:
- **878 خاصية `style="..."` inline** في الـtemplates (متقاسة) → محتاجة `style-src 'unsafe-inline'`.
- **معالج حدث inline حقيقي** في [`player-list.component.ts:284`](../frontend/src/app/features/players/player-list/player-list.component.ts#L284):
```html
onmouseenter="this.style.color='var(--text-primary)'" onmouseleave="..."
```
ده مش binding بتاع Angular — ده `onmouseenter` HTML خام بيتنفّذ كـinline script، ومحظور تحت أي `script-src` معقولة.

**الحل:** السطر ده يتحوّل لـCSS class (سطرين في `styles`). و`style=` الـ878 موضوع مشروع منفصل (شوف **C4**) لكنه شرط مسبق لأي CSP جدّية.

---

### ✅ ما هو **صحيح** في طبقة الأمان (لا تُضعِفه)

- **مفيش سطح XSS.** كل داتا الـAPI بتتعرض بـ`{{ }}` (auto-escaped). مفيش `bypassSecurityTrustHtml` ولا `innerHTML` بقيمة ديناميكية — الأربعة الموجودين كلهم strings ثابتة مكتوبة في الكود.
- **التوكن في الذاكرة بس** ([`auth.service.ts:19`](../frontend/src/app/core/auth/auth.service.ts#L19)) — مش في `localStorage`. ده القرار الصح وناس كتير بتغلط فيه.
- **طابور الـrefresh** في [`auth.interceptor.ts:44-67`](../frontend/src/app/core/interceptors/auth.interceptor.ts#L44) مطبَّق صح: `isRefreshing` + `BehaviorSubject` + `filter(t => t !== null)` + `take(1)`. عشرة طلبات بتاخد 401 مع بعض بتنتج refresh واحد.
- **`AUTH_SKIP_URLS`** بيمنع حلقة الـrefresh اللانهائية على `/auth/*`.
- **`sidebar` deny-by-default** ([`:331`](../frontend/src/app/layout/sidebar/sidebar.component.ts#L331)) — دور غايب أو غير معروف بيرجّع `[]`، مش قايمة كاملة.
- **بايتات البطاقة الشخصية عمرها ما بتبقى URL** — بتتجاب كـblob بـ`X-Vault-Token` وتتحوّل لـobject URL، و`revokeIdCardUrls()` بيتنده في `ngOnDestroy` ([`user-detail.component.ts:538`](../frontend/src/app/features/users/user-detail/user-detail.component.ts#L538)). ده تنفيذ نضيف جدًا لقيد صعب.
- **`isOrphaned()`** ([`player-list.component.ts:951`](../frontend/src/app/features/players/player-list/player-list.component.ts#L951)) مشروط بالأدمن مع تعليق بيشرح **ليه** غياب الحقل مش دليل لباقي الأدوار — وعي دقيق بشكل الـAPI.

---

## Performance

### القياسات (production build، نفس الكوميت)

| المقياس | القيمة |
|---|---:|
| **Initial bundle (raw)** | **546.89 kB** |
| **Initial bundle (transfer)** | **144.53 kB** |
| الـbudget المعرَّف في `angular.json` | 500 kB (⚠️ **متجاوز بـ46.89 kB**) |
| أكبر initial chunk (Angular core/router/forms/http/animations) | 293.08 kB |
| `styles.css` | 47.79 kB raw / 8.46 kB transfer |
| `polyfills` (zone.js) | 34.59 kB raw / 11.33 kB transfer |
| **إجمالي كل الـJS المشحون** | **1,140 kB raw / 313 kB gzip** |
| عدد الـchunks | 74 (62 منهم lazy) |
| أصول الصور (`logo.png` + `player-bg.jpg`) | 84 kB + 85 kB |
| ملفات الترجمة (تتحمّل runtime) | 31.8 kB (en) + 40.9 kB (ar) |

**الخلاصة الكمّية:** الـbundle مش ضخم بالمعايير المطلقة، لكنه **فوق الحد اللي المشروع حدده لنفسه**، و**63.5 kB من الزيادة دي مالهاش أي استخدام** (P1). والمشكلة الأكبر مش الحجم — هي إن `PreloadAllModules` بيخلّي كل مستخدم يحمّل الـ1,140 kB كاملة مهما كان دوره (P2).

---

### P1 — High: `provideAnimations()` بيضيف 63.5 kB لمكتبة المشروع مابيستخدمهاش

**الملف:** [`app.config.ts:4, 21`](../frontend/src/app/app.config.ts#L21)

بحث شامل في `frontend/src`:
- استيرادات من `@angular/animations`: **صفر**
- استخدامات `trigger(` / `animate(` / `transition(` / `state(`: **صفر**

كل الحركة في التطبيق CSS keyframes خالص (`slideUp`, `lightboxZoomIn`, `ageGroupPulse`, `shimmer`, `indeterminate`, `bounce`…). ومع ذلك `provideAnimations()` بيسحب `@angular/animations/browser` كامل (الـAnimationEngine + BrowserAnimationsModule) جوه الـ**initial** bundle.

**مقيس ببيلدين كاملين:**

| | Raw | Transfer | حالة الـbudget |
|---|---:|---:|---|
| كما هو | 546.89 kB | 144.53 kB | ⚠️ متجاوز |
| بعد شيل `provideAnimations()` | **483.40 kB** | **127.69 kB** | ✅ **تحت الحد** |
| **الفرق** | **−63.49 kB (−11.6%)** | **−16.84 kB (−11.7%)** | — |

**الحل:** احذف السطر. لو حد خايف من حاجة معتمدة عليه بشكل غير مباشر، استخدم `provideAnimationsAsync()` — بيأجّل نفس الكود لـlazy chunk بدل الـinitial. **سطر واحد، وبيرجّع المشروع تحت الـbudget بتاعه.**

---

### P2 — High: `PreloadAllModules` بيلغي فايدة الـlazy loading كلها

**الملف:** [`app.config.ts:16`](../frontend/src/app/app.config.ts#L16)

```ts
provideRouter(routes, withPreloading(PreloadAllModules), withEnabledBlockingInitialNavigation())
```

المشروع عمل شغل ممتاز في التقسيم: كل feature route `loadChildren`، وكل صفحة `loadComponent` → **62 lazy chunk**. وبعدين السطر ده بيقول للراوتر: نزّلهم كلهم فورًا بعد أول تنقّل.

**الحساب:** إجمالي الـJS = 1,140 kB raw / 313 kB gz. الـinitial = 546.89 kB / 144.53 kB. يعني كل مستخدم بيحمّل **زيادة ~593 kB raw / ~169 kB gz** بعد أول صفحة مباشرة.

**الخطر الفعلي:** الكوتش بيحمّل `age-group-detail-component` (36.93 kB) و`professional-league-page-component` (23.95 kB) و`user-form-component` و`user-detail-component` — صفحات الـ`roleGuard` مش هيسمحله يفتحها أبدًا. على 3G أو داتا موبايل في يوم ماتش، ده بيتنافس مباشرة مع الريكوستات اللي المستخدم مستنيها فعلًا، وبيأخّر الـTime to Interactive.

**الحل:** `withPreloading(PreloadAllModules)` → استراتيجية مخصصة تحمّل حسب دور المستخدم، أو الأبسط والأنضف: **شيلها خالص**. الـchunks صغيرة (أكبرها 61 kB) والتحميل عند التنقّل مش محسوس، خصوصًا مع الـskeleton loaders الموجودة أصلًا.

---

### P3 — High: أول رسم للصفحة = شاشة بيضا لحد ما الـJS كله يشتغل

**الملفات:** [`index.html`](../frontend/src/index.html) + [`app.component.ts:11-22`](../frontend/src/app/app.component.ts#L11) + [`app.config.ts:16, 24-29`](../frontend/src/app/app.config.ts#L24)

`index.html` كامل هو 14 سطر: `<app-root></app-root>` وبس. **مفيش critical CSS، مفيش splash، مفيش skeleton، مفيش `preconnect`.**

شاشة الـsplash موجودة — بس **جوه `AppComponent`** ([`app.component.ts:13`](../frontend/src/app/app.component.ts#L13))، يعني مابتظهرش غير بعد ما: الـHTML يتحمّل → 144.53 kB جافاسكريبت يتنزّلوا ويتفكّوا → Angular يعمل bootstrap. الوقت ده كله المستخدم شايف **أبيض**.

وفوق ده، تلات حاجات بتتراكم على أول تنقّل:
1. `withEnabledBlockingInitialNavigation()` — الراوتر مستني.
2. `APP_INITIALIZER` بيعمل `await auth.loadUserFromToken()` ([`app.config.ts:26`](../frontend/src/app/app.config.ts#L26)) → **round-trip كامل لـ`POST /auth/refreshToken`** قبل أي رسم. ومراجعة الباك إند وثّقت إن الـendpoint ده بيعمل `user.save()` لمستند كامل في كل نداء ([`authController.js:46`](../Backend/controllers/authController.js#L46)).
3. `authGuard` بيعمل `await auth.whenReady` قبل ما يقرر.

**الحل (مرتّب بالعائد):**
1. **انقل الـsplash لـ`index.html`** كـHTML + `<style>` inline. الـFCP بيبقى وقت الـHTML بدل وقت الـbootstrap — أكبر مكسب مفرد في الإحساس بالسرعة، وبصفر تغيير معماري.
2. سكريبت inline صغير في `<head>` يقرا `localStorage['tr_theme']` و`tr_lang` ويحط `data-theme` و`dir` على `<html>` **قبل** أي رسم. دلوقتي `ThemeService` بيعمل ده في effect بعد الـbootstrap ([`theme.service.ts:10-15`](../frontend/src/app/core/services/theme.service.ts#L10)) — يعني أول فريم بيترسم بالثيم الغلط وبعدين بيقفز.
3. `<link rel="preload" as="fetch" href="/assets/i18n/en.json" crossorigin>` — شوف **P12**.

---

### P4 — Medium-High: الخطوط بتعتمد على شبكة وقت البناء ووقت التشغيل

**الملف:** [`styles.scss:5`](../frontend/src/styles.scss#L5)

```scss
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Cairo:wght@300;400;500;600;700;800;900&display=swap');
```

**مُثبَت بالتنفيذ:** `ng build --configuration=production` **فشل** عندي بالخطأ:
```
X [ERROR] Failed to inline external stylesheet 'https://fonts.googleapis.com/css2?...'
  Error: Inlining of fonts failed ... connect ETIMEDOUT 192.178.202.95:443
```

**الخطر الفعلي (تلات مستويات):**
1. **البناء نفسه هش.** أي بيئة CI بلا وصول لـ`fonts.googleapis.com` (أو انقطاع مؤقت، أو حجب جغرافي) = **بناء فاشل**. الـdeploy بيعتمد على خدمة طرف تالت.
2. **14 وزن خط** (7 لـInter + 7 لـCairo). التطبيق فعليًا بيستخدم عدد أقل بكتير — كل وزن غير مستخدم ده بايتات وطلبات.
3. **خصوصية:** استدعاء Google Fonts من متصفح المستخدم بيسرّب الـIP لطرف تالت في كل تحميل صفحة (نقطة معروفة في GDPR).

**الحل:** حمّل ملفات `.woff2` للأوزان المستخدمة فعلًا وحطها في `src/assets/fonts/` مع `@font-face` محلي + `font-display: swap`. ده بيقفل التلاتة مع بعض، وبيخلي البناء deterministic.

---

### P5 — High: صفر كومبوننت بيستخدم OnPush، وسط 878 استدعاء دالة في الـtemplates

**مقيس:** `ChangeDetectionStrategy` مذكورة في **0** من الـ50 كومبوننت. و`main.ts` بيسجّل `provideZoneChangeDetection()` بلا `eventCoalescing`.

يعني: كل حدث في التطبيق (كل ضغطة زرار، كل `mouseenter`، كل رد HTTP، كل tick من `setTimeout`) بيشغّل دورة change detection على **كل** كومبوننت في الشجرة. ومع كثافة استدعاء الدوال في الـtemplates (التفاصيل في **A1**)، الدورة الواحدة بتعيد حساب مئات القيم.

مثال حي — كارت اللاعب في [`player-list.component.ts:352-521`](../frontend/src/app/features/players/player-list/player-list.component.ts#L352): مربوط بيه `(mouseenter)` و`(mouseleave)` بيعدّلوا الـstyle مباشرة. **كل حركة ماوس فوق أي كارت بتشغّل tick كامل للتطبيق**، وفي كل tick بتتنده `calcAge()` (بتعمل كائنين `Date`) و`teamName()` و`coachName()` و`creatorName()` و`avgRating()` و`ratingColor()` لكل واحد من الـ20 كارت.

**الحل — بالترتيب، من الأرخص للأغلى:**
1. `provideZoneChangeDetection({ eventCoalescing: true })` — **سطر واحد** في `main.ts`، بيدمج أحداث الـDOM المتتالية في tick واحد.
2. `changeDetection: ChangeDetectionStrategy.OnPush` على الكومبوننتات. المشروع كله مبني على signals أصلًا، وده معناه إن OnPush **آمن تقريبًا بالمجان** — الـsignals بتعلّم الـview للتحديث لوحدها. الأولوية: `player-list`, `player-detail`, `age-group-detail`, `my-matches`, `report-form`.
3. حوّل استدعاءات الـtemplate لـ`computed()` (شوف **A1**).
4. أزل الـstyle mutation من `(mouseenter)` واستبدله بـ`:hover` في CSS — الحركة بتبقى في الـcompositor بدل ما تعدّي على جافاسكريبت.

---

### P6 — High: البحث بيبعت ريكوستين لكل ضغطة زرار، وبلا حماية من السباق

**الملف:** [`player-list.component.ts:277`](../frontend/src/app/features/players/player-list/player-list.component.ts#L277)

```html
<input [(ngModel)]="keyword" (ngModelChange)="resetAndLoad()" type="text" ... />
```

و`resetAndLoad()` → `load()` → `GET /players` وبعدين في `next` → `loadAvgRatings()` → `GET /players/reports/average-ratings`.

**الحساب:** كتابة "mohamed" = 7 ضغطات × **2 ريكوست** = **14 ريكوست HTTP**، منهم 13 نتيجتهم بتترمي.

ومفيش أي `switchMap` ولا إلغاء — الـsubscriptions بتتراكم و**آخر رد بيوصل هو اللي بيتعرض**، مش آخر بحث. الشبكات البطيئة بترجّع الردود بترتيب مختلط، فالمستخدم ممكن يكتب "mohamed" ويشوف نتايج "moh".

وده مش مشكلة كليَنت بس: `authLimiter` في الباك إند 300 طلب/15 دقيقة لكل مستخدم ([`app.js:77`](../Backend/app.js#L77)). **حوالي 21 عملية بحث بحد أقصى قبل ما المستخدم يتحظر.**

**الحل:**
```ts
private readonly keyword$ = new Subject<string>();
// في constructor:
this.keyword$.pipe(debounceTime(300), distinctUntilChanged(), switchMap(...))
```
`debounceTime` بيقلّل الـ14 لـ2، و`switchMap` بيلغي القديم فبيقفل السباق. نفس النمط ناقص في فلتر الموسم بـ`(ngModelChange)` في [`age-group-detail`](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L693) (أخف، لأنه select).

---

### P7 — Medium: صفحة اللاعبين بتعمل الريكوست الأول مرتين

**الملف:** [`player-list.component.ts:664-678`](../frontend/src/app/features/players/player-list/player-list.component.ts#L664)

```ts
ngOnInit(): void {
  this.route.queryParamMap.subscribe(qp => {
    ...
    this.resolveView();          // ← بيتنفّذ فورًا (queryParamMap بيبعت أول قيمة sync)
  });
  this.loadGroups();             // ← وده بيندَه resolveView() تاني في الـcallback
}
```

`queryParamMap` بيبعت القيمة الحالية فورًا → `resolveView()` بيشتغل و`this.ageGroups()` لسه فاضية → بيروح لفرع `load()` → **`GET /players` #1** + **`GET .../average-ratings` #1**. بعدين `loadGroups()` بيرجّع → [`:780`](../frontend/src/app/features/players/player-list/player-list.component.ts#L780) بيندَه `resolveView()` تاني → **ريكوستين تانيين**.

يعني الصفحة الرئيسية للاعبين بتعمل **4 ريكوستات بدل 2** عند كل فتح، والصفحة بتترسم مرتين (وميض في الشبكة).

**الحل:** أجّل الاشتراك في `queryParamMap` لحد ما `loadGroups()` تخلص، أو خلّي `resolveView()` تتجاهل النداء لو الفئات لسه مش محمّلة والـ`pendingGroupId` موجود.

---

### P8 — Medium: صفحة "مبارياتي" للأوبزيرفر = شلال من 3 موجات ريكوستات

**الملف:** [`my-matches.component.ts:430-489`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L430)

`loadObservedRows()` بيعمل تلات مراحل **متسلسلة**، كل واحدة مستنية اللي قبلها:

```
① GET /players?status=observed&limit=100
      ↓ (مستني الرد كامل)
② Promise.all( teamService.getOne(id) )        ← ريكوست لكل فريق مميز
      ↓ (مستني كلهم)
③ Promise.all( seasonMatchService.getAll(...) ) ← ريكوست لكل (ageGroup, league) مميز
```

**الحساب لأوبزيرفر عنده 40 لاعب متابَع موزّعين على 25 فريق و4 فئات:**
`1 + 25 + 4 = 30 ريكوست HTTP` في 3 موجات متسلسلة — قبل ما الجدول يعرف يرسم صف واحد صح.

وأسوأ: `visibleMatches()` ([`:345-359`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L345)) بيعتمد على `observedRows()` لفلترة صفوف الأوبزيرفر. فلحد ما الـ30 ريكوست يخلصوا، `allowedUpcomingIds` فاضية والجدول **بيعرض الماتشات السابقة بس** — المستخدم بيشوف صفحة تبان ناقصة وبعدين بتمتلي فجأة.

وكل ريكوست في الموجة ③ بيدفع الـpopulate الرباعي الإجباري اللي مراجعة الباك إند وثّقته في **P3** — يعني الـ4 ريكوستات دول = 16 round-trip إضافي على الداتابيز.

**الحل:** endpoint واحد في الباك إند — `GET /seasonMatches/observed-summary` بيرجّع الصفوف جاهزة (لاعب + اسم فريقه + الماتش القادم) في aggregation واحدة. **30 ريكوست في 3 موجات → 1 ريكوست.** ده أكبر مكسب أداء مفرد في التطبيق كله وهو محتاج شغل باك إند، فلازم يتخطّط في sprint.

---

### P9 — Medium: تحميل كل المباريات عشان نستخرج 3 نصوص

**الملفات:** [`age-group-detail.component.ts:704-709`](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L704) و[`my-matches.component.ts:393-398`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L393)

```ts
private loadAllSeasons(): void {
  this.seasonMatchService.getAll({ ageGroup: this.ageGroupId, league: this.selectedLeague() })
    .subscribe(res => {
      const set = new Set((res.data?.documents ?? []).map(m => m.season));
      this.allSeasons.set(Array.from(set));      // ← النتيجة: ~3 strings
    });
}
```

الريكوست ده بلا `limit`، فبيرجّع لحد **200 مستند** (سقف `MAX_LIMIT` في الباك إند) — وكل واحد منهم معموله populate لـ`ageGroup` و`homeTeam` و`awayTeam` و`attendees` بحكم الـhook الإجباري. كل ده عشان نحسب `Set` فيه قيم زي `"2025/2026"`.

وبيتنده **4 مرات** في `age-group-detail`: عند `ngOnInit`، وكل تبديل دوري (`selectLeague`)، وبعد كل `saveMatch`، وبعد كل `doDeleteMatch`.

**الحل:** `GET /seasonMatches/seasons?ageGroup=&league=` بيرجّع `distinct('season')` — استجابة بحجم ~50 بايت بدل مئات الكيلوبايتات. ولو التغيير ده مش متاح دلوقتي، ضيف `?fields=season&limit=200` على الأقل — بيمنع الـpopulate وبيقلّل الـpayload بأكتر من 95%.

---

### P10 — Medium: هاش الفيديو بيتحسب على الـmain thread بالملف كامل في الرام

**الملف:** [`media-upload.component.ts:427-431`](../frontend/src/app/features/media/media-upload/media-upload.component.ts#L427)

```ts
private async computeFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();                       // ← الملف كامل في الهيب
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map(...).join('');
}
```

عند السقف الافتراضي (`BUNNY_MAX_VIDEO_MB` = 50MB، وقابل للرفع في `config.env`):
- **50MB `ArrayBuffer`** بيتحجز دفعة واحدة على الهيب — على موبايل متوسط ده ضغط GC حقيقي وممكن يرمي out-of-memory.
- `crypto.subtle.digest` بيشتغل على الـmain thread → **الواجهة بتتجمّد** تمامًا لحد ما يخلص (مليش قياس دقيق، لكنه بيتقاس بالثواني على 50MB في موبايل).
- وبعدين `Array.from(...).map(...).join('')` بيعمل **مصفوفة 32 عنصر + 32 string** — تافه نسبيًا بس عبثي جنب `toHex`.

وده بيحصل **قبل** أي مؤشّر تقدّم — `uploading.set(true)` بيتنده قبله ([`:439`](../frontend/src/app/features/media/media-upload/media-upload.component.ts#L439)) فالمستخدم شايف "0%" وشاشة مجمّدة، ومش عارف لو الحاجة اتعلّقت.

**الحل:** Web Worker + قراءة الملف على شرايح بـ`file.slice()`. الرام بتفضل ثابتة والـUI بيفضل شغّال. الحل الأبسط لو ده كتير: على الأقل اعرض حالة "بنجهّز الملف…" صريحة قبل الاستدعاء.

---

### P11 — Medium: صور غير محسّنة وبتتحمّل بحجمها الكامل

| الأصل | الحجم | بيتعرض في | المشكلة |
|---|---:|---|---|
| `logo.png` | **84 kB** | header (32px) · sidebar (68px) · splash (260px) · login (52px) | PNG واحد لكل المقاسات، أكبر عرض 260px |
| `player-bg.jpg` | **85 kB** | خلفية كارت اللوجين | بيتحمّل على صفحة اللوجين — أول صفحة يشوفها أي مستخدم |

- **مفيش `width`/`height` على أي `<img>`** في التطبيق → الـbrowser مش عارف يحجز المكان → **Cumulative Layout Shift** في الهيدر والسايدبار وكل كارت لاعب.
- **مفيش WebP/AVIF.** نفس اللوجو بـWebP على 3 مقاسات (`srcset`) عادةً 15-20 kB إجمالًا بدل 84 kB × 4 مواضع.
- `player-bg.jpg` مربوطة عن طريق `background-image` جوه `style=` inline ([`login.component.ts:35`](../frontend/src/app/features/auth/login/login.component.ts#L35)) — يعني المتصفح مايقدرش يكتشفها بالـpreload scanner، فبتتأخّر لحد ما الـCSS يتحسب.
- الجانب الإيجابي: `loading="lazy"` موجودة على صور اللاعبين في الشبكة ([`player-list.component.ts:379`](../frontend/src/app/features/players/player-list/player-list.component.ts#L379)) — القرار ده صح، طبّقه على الباقي.

---

### P12 — Medium: ومضة مفاتيح الترجمة قبل ما الترجمة توصل

`app.config.ts:23` بيسجّل `provideTranslateHttpLoader({ prefix: '/assets/i18n/' })`، فالترجمة بتتجاب كـHTTP **بعد** الـbootstrap. و`APP_INITIALIZER` التاني ([`:31-35`](../frontend/src/app/app.config.ts#L31)) بيندَه `lang.current()` — اللي هو مجرد قراءة signal، **مش انتظار لتحميل الترجمة**.

النتيجة: بين الـbootstrap ووصول `en.json` (31.8 kB) أو `ar.json` (40.9 kB)، الواجهة بترسم المفاتيح الخام (`NAV.DASHBOARD`, `PLAYERS.TITLE`) أو فراغات. و**775 استخدام لـ`| translate`** يعني ده تقريبًا كل نص في التطبيق.

**الحل:** `<link rel="preload" as="fetch" crossorigin href="/assets/i18n/en.json">` في `index.html` (بيبدأ التحميل مع الـHTML بدل بعد الـJS)، وخلّي الـ`APP_INITIALIZER` يرجّع الـpromise الحقيقية بتاعة `translate.use(lang)` بدل قراءة الـsignal.

---

### P13 — Low: تبعيات مدفوعة ومش مستخدمة

بحث في كل `frontend/src`:

| التبعية | الاستخدامات | ملاحظة |
|---|---:|---|
| `@angular/cdk` | **0** | في `dependencies` |
| `date-fns` | **0** | في `dependencies` — والتواريخ متعاملة بـ`Date` خام في 12 موضع |
| `@angular/platform-browser-dynamic` | **0** | مش محتاجة مع standalone bootstrap |
| `allowedCommonJsDependencies: ["url-parse"]` | **0** | إعداد متبقي في [`angular.json:42`](../frontend/angular.json#L42) |

مش تكلفة bundle (الـtree-shaking بيشيلهم)، لكن تكلفة **سلسلة توريد وصيانة**: 3 حزم بتتنزّل وتتفحص وتتحدّث وتظهر في تقارير `npm audit` بلا مقابل. والأهم — `date-fns` موجودة كأنها القرار المتّبع للتواريخ، بينما الكود الفعلي بيستخدم `new Date()` يدوي في كل مكان (شوف **A3**).

---

### P14 — Low: مستمع resize بلا throttle ومابيتشالش أبدًا

**الملف:** [`shell.component.ts:68-74`](../frontend/src/app/layout/shell/shell.component.ts#L68)

```ts
ngOnInit(): void {
  window.addEventListener('resize', () => {      // ← مفيش removeEventListener
    const mobile = window.innerWidth < 1024;
    this.isMobile.set(mobile);
    ...
  });
}
```

**مشكلتان:**
1. **بلا throttle:** سحب حافة النافذة بيطلق عشرات الأحداث في الثانية، وكل واحد بيقرا `window.innerWidth` (يسبب **layout reflow**) وبيكتب signal → tick كامل للتطبيق.
2. **مابيتشالش:** مفيش `ngOnDestroy`. `ShellComponent` عايش طول الجلسة فمش تسريب حقيقي في التشغيل، لكنه بيسرّب في كل test و**هيبقى تسريب حقيقي** أول ما حد يعمل shell تاني.

**الحل:** `takeUntilDestroyed()` مع `fromEvent(window, 'resize').pipe(debounceTime(100))` — أو `matchMedia('(min-width: 1024px)')` وهو الأصح للسؤال ده أصلًا (بيطلق عند تخطّي الحد بس، مش عند كل بكسل).

---

## Code Quality

### C1 — أخطاء تشغيلية حقيقية (مش أسلوب)

**B1 — 🔴 كل أيقونات SVG المعروضة بـ`[innerHTML]` مش ظاهرة.**

أربع مواضع بتعرض SVG كـstring عبر `[innerHTML]`:
- [`empty-state.component.ts:10`](../frontend/src/app/shared/components/empty-state/empty-state.component.ts#L10) — أيقونة كل حالة فاضية في التطبيق
- [`toast-container.component.ts:14`](../frontend/src/app/shared/components/toast-container/toast-container.component.ts#L14) — أيقونة كل toast (نجاح/خطأ/تحذير/معلومة)
- [`notification-panel.component.ts:44, 89`](../frontend/src/app/layout/notification-panel/notification-panel.component.ts#L44) — أيقونة كل نوتيفيكيشن

`[innerHTML]` بيعدّي على الـHTML sanitizer بتاع Angular. وقايمة العناصر المسموحة عنده مقفولة — من `@angular/core` نفسه:

```js
const VALID_ELEMENTS = merge(VOID_ELEMENTS, BLOCK_ELEMENTS, INLINE_ELEMENTS, OPTIONAL_END_TAG_ELEMENTS);
// VOID:   area,br,col,hr,img,wbr
// BLOCK:  address,article,aside,blockquote,...,table,ul
// INLINE: a,abbr,acronym,audio,b,...,span,strike,strong,sub,sup,time,track,tt,u,var,video
```

**`svg` و`path` و`circle` و`polyline` مش في القايمة ولا واحد فيهم.** الـsanitizer بيشيل العنصر غير المعروف ويسيب محتواه — والـSVG دي مالهاش محتوى نصي. **النتيجة: `<span>` فاضي.**

**الخطر الفعلي:** ده مش تحسين — دي ميزة مكسورة في الـproduction دلوقتي. كل توست بيظهر بلا أيقونة، كل empty state بلا رسمة، كل نوتيفيكيشن بلا مؤشّر نوع. والأسوأ إنها **بتفشل بصمت** في الـproduction (في الـdev بس بيظهر `WARNING: sanitizing HTML stripped some content` في الكونسول — سهل جدًا إنه يتفوّت).

**الحل:** حوّلهم لـSVG حقيقي في الـtemplate. `EmptyStateComponent` تاخد `icon` كاسم (union type) و`@switch` عليه — بالظبط نفس النمط اللي `SidebarComponent` مطبّقه صح فعلًا في [`sidebar.component.ts:63-111`](../frontend/src/app/layout/sidebar/sidebar.component.ts#L63). النمط الصح موجود في المشروع؛ التلات مواضع دي فاتتها.

---

**B2 — 🔴 الريل-تايم بيموت نهائيًا بعد أول تسجيل خروج.**

**الملف:** [`socket.service.ts:70-81`](../frontend/src/app/core/services/socket.service.ts#L70)

```ts
disconnect(): void {
  this.socket?.disconnect();
  this.socket = null;
  this.connectionState.set('disconnected');
  this.notification$.complete();              // ← نهائي، مالوش رجعة
  this.adminDashboardUpdate$.complete();
  this.coachDashboardUpdate$.complete();
  ...
}
```

`Subject.complete()` **حالة نهائية**. بعدها أي `next()` بيتجاهل بصمت، وأي `subscribe()` جديد بيستقبل `complete` فورًا.

و`SocketService` مسجّل `providedIn: 'root'` — يعني **instance واحد لعمر التاب كله**.

**السيناريو (خطوتين، مسار عادي تمامًا):**
```
1. المستخدم يعمل logout        → clearSession() → socketService.disconnect() → كل الـSubjects خلاص
2. المستخدم يسجّل دخول تاني     → setSession() → socketService.connect(token) → السوكِت بيتوصّل ✓
3. السيرفر بيبعت أي notification → الـhandler بيندَه .next() على subject مقفول → لا شيء
```

**النتيجة:** بعد أي logout ثم login في نفس التاب، **كل** الميزات اللايف بتموت: النوتيفيكيشنز، تحديثات الداشبورد، `PLAYER_STATUS_UPDATED`، إشعارات نشر التقييمات. مفيش رسالة خطأ، مفيش مؤشّر — الأيقونة بتقول "connected" وهي فعلًا connected. المستخدم مش هيبلّغ عن ده كـbug، هو هيفتكر إن النظام مافيهوش نوتيفيكيشنز.

**الحل:** شيل الـ`.complete()` الستة. الـSubjects دي بتعيش مع السيرفس (وعمرها عمر التطبيق)، فمالهاش حاجة تتقفل — الـsocket نفسه بيتقفل وده كفاية. المشتركين بيفكّوا اشتراكهم بـ`takeUntilDestroyed()` صح أصلًا في [`shell.component.ts:51`](../frontend/src/app/layout/shell/shell.component.ts#L51).

---

**B3 — 🟠 مفتاح `track` مكرّر في لوحة النوتيفيكيشنز.**

[`notification-panel.component.ts:36`](../frontend/src/app/layout/notification-panel/notification-panel.component.ts#L36): `@for (n of notifService.notifications(); track n.createdAt)`

لكن `createdAt` **اختياري** ([`notification.model.ts:46`](../frontend/src/app/core/models/notification.model.ts#L46))، و`ShellComponent` بيضيف نوتيفيكيشنز **بدونه** خالص:
```ts
// shell.component.ts:64
this.notificationService.add({ type: 'PLAYER_STATUS_UPDATED', message: msg, playerId, status });
```

تغيير حالة لاعبين اتنين = عنصرين مفتاح الـtrack بتاعهم `undefined` = مفاتيح مكرّرة. Angular بيرمي `NG0955` وقت التشغيل. **الحل:** ولّد `id` في `NotificationService.add()` (بـ`crypto.randomUUID()` — نفس اللي `ToastService` بيعمله صح في [`toast.service.ts:29`](../frontend/src/app/core/services/toast.service.ts#L29)) واعمل `track` عليه.

---

**B4 — 🟠 نفس المشكلة في الرادار تشارت، وباحتمال أعلى.**

[`radar-chart.component.ts:42`](../frontend/src/app/shared/components/radar-chart/radar-chart.component.ts#L42): `@for (pt of dataPointCoords(); track pt.x)`

الإحداثي `x = center + (value/10) · radius · cos(θᵢ)`. ومع 12 محور، الزوايا متماثلة حول المحور الرأسي — `cos(θ₁) = cos(θ₅)`، `cos(θ₂) = cos(θ₄)` وهكذا. فأي **مهارتين متقابلتين ليهم نفس التقييم** بينتجوا نفس الـ`x` بالظبط.

التقييمات أعداد صحيحة من 1 لـ10 على 12 مهارة — يعني التكرار **مش حالة نادرة، هو الحالة الشايعة** (مثلًا `dribbling` = `stamina` = 7). والقيمة الافتراضية في فورم التقرير هي **5 لكل المهارات الاتناشر** ([`report-form.component.ts:522-537`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L522)) — يعني الـradar في الفورم بيبدأ حياته بـ12 نقطة، منهم أزواج بنفس الـ`x`، من أول رسمة.

**الحل:** `track $index` (المصفوفة موقعية بحتة، الـindex هو المفتاح الصحيح دلاليًا هنا).

---

**B5 — 🟠 عدّاد "الإجمالي" في صفحة اللاعبين بيعرض حجم الصفحة مش الإجمالي.**

[`player-list.component.ts:855`](../frontend/src/app/features/players/player-list/player-list.component.ts#L855): `this.total.set(res.count ?? 0);`

و`count` في غلاف الرد بتاع الباك إند هو **طول الصفحة**، مش عدد النتايج الكلي:
```js
// Backend/services/services.js:74 و playerController.js:348
count: documents.length,
```

يعني في أي عرض flat (أوبزيرفر، proScout، عدسة اليتامى، عدسة المحترفين) أو بعد اختيار فئة عمرية، الهيدر بيقول "**20** لاعب" مهما كان العدد الحقيقي 20 ولا 2000 — لأن `limit: 20` ([`:841`](../frontend/src/app/features/players/player-list/player-list.component.ts#L841)).

الطريق الصح موجود ومستخدَم في نفس الملف: `loadGroupCounts()` بيقرا `res.data.total` من `/players/counts` ([`:807`](../frontend/src/app/features/players/player-list/player-list.component.ts#L807)) — بس بشرط `if (!this.selectedGroup())`، فبمجرد ما المستخدم يختار فئة، `load()` بيكتب فوقه بالرقم الغلط.

**الحل:** الباك إند يبعت `documentCount` (هو محسوب أصلًا في [`playerController.js:333`](../Backend/controllers/playerController.js#L333) وبيتحط في الـpagination بس)، والفرونت يقراه. لو غير متاح: اشتق الإجمالي من `pagination.numberOfPages × limit` كتقريب، أو سيب `total()` مربوط بـ`/counts` وحده.

---

**B6 — 🟠 تحديث السوكِت بيدهس داشبورد الكوتش المحدد ببيانات المنظمة كلها.**

[`admin-dashboard.component.ts:145-149`](../frontend/src/app/features/dashboard/admin-dashboard/admin-dashboard.component.ts#L145):
```ts
constructor() {
  this.socketService.getAdminUpdates()
    .pipe(takeUntilDestroyed())
    .subscribe(update => this.data.set(update));    // ← بلا أي شرط
}
```

نفس الكومبوننت بيخدم مسارين: `/dashboard/admin` و`/dashboard/admin/:coachId`. في الحالة التانية `ngOnInit` بيحمّل داشبورد **كوتش واحد**. لكن الاشتراك فوق مافيهوش أي فحص لـ`coachId()`، فأول ما أي أدمن يعدّل أي لاعب في النظام، `emitAdminDashboardUpdate` بيوصل و**بيستبدل أرقام الكوتش بأرقام المنظمة** — والهيدر فوقها لسه مكتوب فيه اسم الكوتش وإيميله ([`:24-34`](../frontend/src/app/features/dashboard/admin-dashboard/admin-dashboard.component.ts#L24)).

الأدمن بيبص على شاشة بتقول "أحمد حسن — 1,240 لاعب" وهي أرقام النظام كله.

**نفس الباگ بالظبط في** [`observer-dashboard.component.ts:130-133`](../frontend/src/app/features/dashboard/observer-dashboard/observer-dashboard.component.ts#L130) — وبشكل لافت، نفس الكومبوننت **بيعمل الفحص الصح** في الاشتراك اللي تحته مباشرة:
```ts
.subscribe(() => {
  if (this.observerId()) return;      // ← الحارس الصح، موجود هنا وناقص فوق
```

**الحل:** `if (this.coachId()) return;` في الاشتراكين. سطر واحد في كل ملف — والنمط الصح مكتوب على بُعد 6 أسطر.

---

**B7 — 🟠 `returnUrl` بيتحفظ وعمره ما بيتستخدم.**

[`auth.guard.ts:16-18`](../frontend/src/app/core/auth/auth.guard.ts#L16) بيحفظ الوجهة بعناية:
```ts
return router.createUrlTree(['/auth/login'], {
  queryParams: state.url && state.url !== '/' ? { returnUrl: state.url } : {},
});
```

و[`login.component.ts:119`](../frontend/src/app/features/auth/login/login.component.ts#L119) بيتجاهله تمامًا:
```ts
this.router.navigateByUrl('/dashboard');
```

فأي deep link (لينك لاعب متبعوت في واتساب، إشعار بريد) بيرمي المستخدم على الداشبورد ولازم يدوّر بنفسه. التعليق فوق السطر بيقول "دايمًا يفتح على الداش بورد بعد تسجيل الدخول" — فالنية ممكن تكون مقصودة، بس ساعتها `returnUrl` في الـguard كود ميت ولازم يتشال. **قرار واحد من الاتنين، مش الاتنين مع بعض.**

---

**B8 — 🟠 كارت الاتجاه الشهري بيخلط تقييمات كباتن مختلفين.**

[`coach-evaluation-list.component.ts:120-136`](../frontend/src/app/features/coach-evaluations/coach-evaluation-list/coach-evaluation-list.component.ts#L120):
```ts
const key = `${e.year}-${e.month}`;                                    // ← مفيش coachId في المفتاح
const g = groups.get(key) ?? { coachId: e.coach._id, ... };            // ← بياخد أول واحد صادفه
```

و`load()` ([`:139-150`](../frontend/src/app/features/coach-evaluations/coach-evaluation-list/coach-evaluation-list.component.ts#L139)) بيبعت فلتر `coach` **بس لو** الـquery param موجود. أدمن بيفتح `/coach-evaluations` من غير `?coach=` بياخد تقييمات كل الكباتن → الكارت بيحسب متوسط **مخلوط** لكل الكباتن في الشهر ده، وبينسبه لـ`coachId` عشوائي (أول واحد في الليست) — والضغط عليه بيفتح لوحة كوتش تاني خالص.

**الحل:** `const key = \`${e.coach._id}-${e.year}-${e.month}\``.

---

**B9 — `player-list.navigate()` بيعمل إعادة تحميل كاملة للصفحة.**
[`player-list.component.ts:964-967`](../frontend/src/app/features/players/player-list/player-list.component.ts#L964):
```ts
navigate(path: string[]): void {
  window.location.href = '/' + path.join('/');
}
```
مش متندهة من أي مكان (كود ميت)، والتعليق نفسه بيقول "fallback". لكن وجودها كارثي لو حد استخدمها يومًا: `window.location.href` بيدمّر الـSPA — إعادة bootstrap كاملة، إعادة تحميل الـ144.53 kB، وrefresh token جديد. **احذفها.**

**B10 — `index.html` بيعلن لغة واتجاه غلط.**
[`index.html:2`](../frontend/src/index.html#L2): `<html lang="ar" dir="ltr">` — بينما اللغة الافتراضية `'en'` ([`app.config.ts:22`](../frontend/src/app/app.config.ts#L22) و[`language.service.ts:27`](../frontend/src/app/core/services/language.service.ts#L27)). فقارئ الشاشة بيتعامل مع نص إنجليزي كأنه عربي لحد ما `LanguageService` يصحح الخاصيتين بعد الـbootstrap، والعربي بيترسم LTR في أول فريم. **الحل:** شوف السكريبت الـinline في **P3** — بيقفل ده والثيم مع بعض.

**B11 — `revokeObjectURL` فورًا بعد `click()`.**
[`media-gallery.component.ts:376-381`](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L376): الـobject URL بيتلغى في نفس الـtick اللي بعد `a.click()`. المتصفحات بتبدأ التحميل بشكل غير متزامن، فالإلغاء الفوري ممكن يجهض التحميل (سلوك موثّق في Firefox). **الحل:** `setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)`.

---

### C2 — ازدواج يحتاج استخراج

| الازدواج | عدد النسخ | المواضع |
|---|---:|---|
| `teamName(team)` — نفس الجسم `typeof === 'string' ? … : team.name` | **5** | [age-group-detail:716](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L716) · [professional-league:409](../frontend/src/app/features/professional-league/professional-league-page/professional-league-page.component.ts#L409) · [report-detail:155](../frontend/src/app/features/scouting-reports/report-detail/report-detail.component.ts#L155) · [report-form:708](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L708) · [report-list:416](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L416) · [my-matches:496](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L496) |
| `ratingColor()` — نفس العتبات `8 / 5` ونفس الألوان | **4** | [player-detail:714](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L714) · [player-list:881](../frontend/src/app/features/players/player-list/player-list.component.ts#L881) · [report-form:608](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L608) · [report-list:433](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L433) |
| `reviewBadgeClass(status)` — متطابقة حرفيًا | **3** | [age-group-detail:771](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L771) · [media-gallery:403](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L403) · [my-matches:591](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L591) |
| `currentSeason()` — دالة module-level مكررة | **3** | [age-group-detail:57](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L57) · [professional-league:38](../frontend/src/app/features/professional-league/professional-league-page/professional-league-page.component.ts#L38) · [my-matches:20](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L20) |
| `extractFieldErrors(err)` — 11 سطر متطابقين | **2** | [age-group-detail:881](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L881) · [professional-league:511](../frontend/src/app/features/professional-league/professional-league-page/professional-league-page.component.ts#L511) |
| `initials(name)` | **3** | [player-detail:863](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L863) · [player-list:918](../frontend/src/app/features/players/player-list/player-list.component.ts#L918) · [sidebar:363](../frontend/src/app/layout/sidebar/sidebar.component.ts#L363) · [header:140](../frontend/src/app/layout/header/header.component.ts#L140) (بأربع صيغ مختلفة قليلًا!) |
| بناء `HttpParams` يدويًا بدل `QueryBuilderService` | **2** | [coach-evaluation.service:17-22](../frontend/src/app/features/coach-evaluations/services/coach-evaluation.service.ts#L17) · observer-evaluation.service — والسيرفس ده موجود ومستخدَم في 4 سيرفسات تانية |

**ملاحظة مهمة على `initials`:** الأربع نسخ **مش متطابقة** — `header.component.ts:142` بيعمل `name.split(' ')` (بيكسر مع المسافات المتعددة ويرمي `undefined`)، بينما `player-list.component.ts:920` بيعمل `name.trim().split(/\s+/)` مع حارس على الاسم الفاضي. يعني الازدواج مش تجميلي — هو **انحراف سلوكي فعلي** بين شاشة وشاشة.

**الحل:** `core/utils/` فيها `entityName.ts` (teamName/coachName/playerName) و`rating.ts` (ratingColor/overallBand) و`initials.ts` و`season.ts`. المشروع عنده `core/services/` منظمة كويس؛ ناقصه بس مكان للدوال النقية.

---

### C3 — كومبوننتات أكبر من اللازم بكتير

| الملف | الأسطر | ملاحظة |
|---|---:|---|
| [`player-list.component.ts`](../frontend/src/app/features/players/player-list/player-list.component.ts) | **968** | template ~545 سطر جوه الـTS |
| [`player-detail.component.ts`](../frontend/src/app/features/players/player-detail/player-detail.component.ts) | **925** | 3 لوحات اختيار + مودالين + راوتر آوتلت |
| [`age-group-detail.component.ts`](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts) | **907** | فرق + جدول مباريات + تفاصيل مباراة (تقارير + ميديا) |
| [`report-form.component.ts`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts) | **806** | ثلاث كتل تقييم متطابقة البنية |
| [`player-form.component.ts`](../frontend/src/app/features/players/player-form/player-form.component.ts) | **657** | |
| [`my-matches.component.ts`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts) | **596** | |

الحدود واضحة وجاهزة للاستخراج تقريبًا كما هي:
- `player-list` → `<app-age-group-grid>` + `<app-player-card>` + `<app-status-chips>`
- `player-detail` → `<app-observer-picker>` + `<app-coach-picker>` (اللوحتين شبه متطابقتين — نفس البنية ونفس الـCSS classes، فرقهم اختيار واحد مقابل متعدد)
- `age-group-detail` → `<app-team-panel>` + `<app-match-schedule>` + `<app-match-detail>`
- `report-form` → `<app-rating-category [fields]="…" [group]="…">` — التلات كتل (technical/physical/mental) **متطابقة حرفيًا** ما عدا اللون واسم الـformGroup ([`:246-360`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L246)). كومبوننت واحد بيشيل ~115 سطر.

الاستخراج هنا مش تجميل — هو **الشرط العملي لـOnPush** (P5): كومبوننت بـ545 سطر template بيعيد تقييم كل حاجة مع بعض، والتقسيم بيخلّي كل جزء يتحدّث لوحده.

---

### C4 — 878 خاصية `style=` inline في مشروع عنده Tailwind ونظام tokens

**مقيس:** 878 موضع `style="` في الـtemplates، مقابل 775 استخدام لـ`| translate`. يعني في التطبيق ده **الأنماط الـinline أكتر من النصوص المترجَمة**.

والمشروع فيه أصلًا: Tailwind مضبوط (`tailwind.config.js`)، و`styles.scss` فيه **835 سطر** من الـdesign tokens والـcomponent classes (`.card`, `.btn`, `.form-input`, `.status-chip`, `.badge-*`).

**التكلفة الفعلية (مش أسلوب):**
1. **حجم:** كل `style="background:linear-gradient(145deg,rgba(34,197,94,0.20)...)"` بيتكرر حرفيًا في الـbundle لكل موضع. كارت اللاعب لوحده فيه 4 تدرّجات مكتوبة inline بأربع صيغ متشعبة ([`player-list.component.ts:360-377`](../frontend/src/app/features/players/player-list/player-list.component.ts#L360)).
2. **الثيم:** الأنماط الـinline مش بتشارك في cascade الثيم بشكل طبيعي — والمشروع اضطر يستخدم `var(--…)` جوه `style=` عشان يعوّض، وده شغّال بس بيخلي كل قيمة سلسلة نصية بتتحلّل وقت التشغيل بدل قاعدة CSS متكاشة.
3. **CSP:** شوف **S8** — أي `style-src` بلا `'unsafe-inline'` بتكسر التطبيق كله.
4. **الاتساق:** ألوان الحالات (`#22c55e` للمختار، `#f43f5e` للمرفوض…) مكتوبة يدويًا في **عشرات** المواضع. تغيير لون واحد في الـbrand = بحث واستبدال في كل الـcodebase.

**الحل:** مش ريفاكتور شامل. ابدأ بالمتكرر: `.player-card--selected`, `.player-card--rejected`, `.player-card--pending`, `.player-card--observed` في `styles.scss` (فيه بالفعل `.badge-selected` وإخواتها — نفس النمط، امتداد طبيعي). ده لوحده بيشيل التدرّجات المتكررة من `player-list` و`player-detail`.

---

### C5 — الأنواع: 41 `as any` بينما فيه ملف أنواع مولَّد من الـOpenAPI

المشروع بيولّد `api.generated.ts` (4,216 سطر) من `openapi.json` بـ`npm run gen:types`. ومع ذلك:

```ts
this.observers.set((res.data as any)?.documents ?? []);          // player-detail:724
this.users.set((res.data as any)?.documents ?? []);              // user-list
this.coaches.set((res.data as any)?.documents ?? []);            // player-detail:742
const p = (res.data as any)?.player ?? (res.data as any)?.document;   // player-form:557
if ((res as any).authorCounts) this.authorCounts.set((res as any).authorCounts);  // report-list:377
form: any = this.emptyForm();                                    // coach-evaluation-form:158
```

**النمط المتكرر:** `UserService.getAll()` بيرجّع `PaginatedResponse<{ documents: User[] }>` — نوع صحيح تمامًا. وكل مستدعييه بيعملوا `as any` عليه، فبيلغوا الفايدة كلها بلا سبب.

و`player-form.component.ts:557` أوضح دليل: `(res.data as any)?.player ?? (res.data as any)?.document` — الكود مش متأكد من شكل الرد فبيجرّب اتنين. الشكل موثّق في `CLAUDE.md` (`{ status, data: { document } }`) وموجود في `api-response.model.ts`. والـ`as any` هي اللي منعت الكومبايلر من إنه يقول ده.

`report-list.component.ts:377` أخطر: `(res as any).authorCounts` — الحقل ده **موجود فعلًا** في رد الباك إند ([`scoutingReportController.js:160`](../Backend/controllers/scoutingReportController.js#L160)) لكنه مش في `PaginatedResponse`. الحل مش `as any`، الحل نوع `ScoutingReportListResponse extends PaginatedResponse<…> { authorCounts: … }`.

**الحل:** شيل الـ`as any` وسيب الكومبايلر يشتكي. أغلبهم هيتصلح بحذف الكاست وبس؛ الباقي هيكشف أنواع ناقصة حقيقية.

---

### C6 — كومبوننتات بتتخطّى طبقة السيرفس بتاعتها

أربع كومبوننتات بتحقن `HttpClient` مباشرة وبتبني الـURL بإيدها:

- [`player-list.component.ts:593, 772`](../frontend/src/app/features/players/player-list/player-list.component.ts#L772) — `GET ${environment.apiUrl}/ages`
- [`player-form.component.ts:546`](../frontend/src/app/features/players/player-form/player-form.component.ts#L546) — نفسه
- [`age-group-detail.component.ts:586, 641`](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L641) — `GET ${agesBase}/${id}`
- `age-group-list.component.ts` — نفسه

`CLAUDE.md` بيقول صراحة: *"New API surface goes in the feature's own service, not a shared god-service."* — والمشروع محترم القاعدة دي في 12 سيرفس. بس `AgeGroup` **مالهاش سيرفس أصلًا**، فالأربعة اضطروا يتصرفوا.

والتكلفة ظهرت فعلًا: `player-list.component.ts:774` مكتوب فيه
```ts
((res.data as any)?.documents ?? (res.data as any)?.ageGroups ?? [])
```
احتمالان لنفس الحقل، لأن مفيش سيرفس واحد بيعرّف الشكل مرة واحدة. **الحل:** `features/age-groups/services/age-group.service.ts` — 20 سطر، وبيقفل الأربعة.

---

### C7 — تغطية الاختبارات

**16 ملف spec لـ50 كومبوننت و16 سيرفس.** والموجود منهم مركّز على الطبقة الصح (`auth.guard`, `role.guard`, `auth.service`, `error.interceptor`, `role-landing.service`) — ده اختيار سليم للأولويات.

اللي ناقص وحرِج:
- **مفيش تست لـ`auth.interceptor`** — منطق طابور الـrefresh (`isRefreshing` + `BehaviorSubject`) هو أعقد كود متزامن في التطبيق، وأخطر حاجة لو اتكسرت.
- **مفيش تست لـ`SocketService`** — وده بالظبط مكان **B2**. تست بسيط "connect → disconnect → connect → هل الـnotification بتوصل؟" كان هيمسكه.
- الكومبوننتات الستة الكبار (968-596 سطر) عندهم 4 specs بينهم.

---

## Algorithms & Data Structures

### A1 — استدعاءات الدوال في الـtemplates: أكبر مصدر حِمل حسابي في التطبيق

في Angular، أي `{{ f() }}` أو `[x]="f()"` بيتنفّذ في **كل** دورة change detection. ومع صفر OnPush وzone.js (**P5**)، الدورات دي بتحصل مع كل حدث DOM.

**الحالات الأثقل، بالعد:**

**① `report-form` — ~156 عملية بحث بمسار نصي في الفورم لكل دورة.**
[`report-form.component.ts:264-281`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L264) (وتتكرر لـphysical وmental):
```html
[style.color]="ratingColor(form.get('technical.' + field.key)?.value)"
{{ form.get('technical.' + field.key)?.value ?? 5 }}
@for (n of pipRange; track n) {
  [class.pip-on]="(form.get('technical.' + field.key)?.value ?? 0) >= n"
```
**الحساب:** 12 حقل × (3 استدعاءات مباشرة + 10 pips) = **156 نداء لـ`form.get()` لكل دورة**. وكل نداء بيعمل `split('.')` للمسار وبيمشي على شجرة الـFormGroup. والـform ده مربوط بـ`toSignal(form.valueChanges)` أصلًا ([`:543`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L543)) — يعني القيم متاحة في signal، والـ156 نداء دول كلهم زايدين.

**② `report-list` — 12 ترجمة + مصفوفة جديدة لكل دورة.**
[`report-list.component.ts:472-495`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L472): `skillAverages()` بيتنده من `@for` في الـtemplate، وفي كل نداء بيبني مصفوفة 12 عنصر **و بينده `translate.instant()` 12 مرة**. ونفس الملف عامل `filteredReports` كـ`computed()` صح ([`:334`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L334)) — فالنمط الصح موجود على بعد 140 سطر.

و`radarData()` ([`:443`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L443)) بيرجّع **object literal جديد** كل دورة، ومربوط بـ`[data]` على `RadarChartComponent`. مرجع جديد = الـinput بيتعتبر متغيّر = كل الـ`computed`s جوه الرادار (`axes`, `axisEndPoints`, `labelPoints`, `dataPointCoords`, `dataPoints`) بتتحسب من الأول وبترسم SVG جديد. **الرادار بيعيد رسم نفسه مع كل حركة ماوس.** ونفس الحقل في `report-form.component.ts:568` معمول `computed()` صح — نفس الفرق، نفس الميزة.

**③ `player-detail` — بناء `Map` كامل لكل دورة.**
[`player-detail.component.ts:840-848`](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L840):
```ts
assignedObserverNames(): string {
  const byId = new Map(this.observers().map(o => [o._id, o.name]));   // ← Map جديدة كل دورة
```
`this.observers()` هي **كل** الأوبزيرفرز في النظام. بناء الـMap دي (O(n) تخصيص) بيحصل لمجرد عرض سطر نصي.
و`playerFields()` ([`:907`](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L907)) و`get tabs()` ([`:643`](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L643)) الاتنين مصفوفات جديدة + `translate.instant()` × 8 لكل دورة.

**④ `user-detail` — `[routerLink]` بمرجع جديد كل دورة.**
[`user-detail.component.ts:400-408`](../frontend/src/app/features/users/user-detail/user-detail.component.ts#L400): `playersQueryParams()` و`dashboardLink()` بيرجّعوا object/array جديد ومربوطين بـ`[queryParams]`/`[routerLink]`. الـ`RouterLink` directive بيقارن بالمرجع → بيشوف تغيير كل دورة → بيعيد بناء الـURL tree ويكتب `href`.

**⑤ `age-group-detail` — 120 كائن `Date` لكل دورة.**
`isPastMatch(m)` مستدعاة **4 مرات لكل صف** ([`:340, 341, 348, 372`](../frontend/src/app/features/age-groups/age-group-detail/age-group-detail.component.ts#L340))، وكل نداء بيعمل `new Date(m.matchDate)` + `Date.now()`. مع 20 صف = **80 كائن Date + 80 نداء `Date.now()`**. وزيادة عليهم `matchAttendees(m)` مرتين لكل صف، وكل نداء بيعمل `.filter()` بمصفوفة جديدة.

**الحل الموحّد:** حوّل الاستدعاءات دي لـ`computed()` أو احسبها **مرة واحدة** عند وصول الداتا واحفظها في شكل جاهز للعرض:
```ts
readonly matchRows = computed(() =>
  this.matches().map(m => ({
    ...m,
    isPast: new Date(m.matchDate).getTime() < Date.now(),
    attendees: (m.attendees ?? []).filter(a => typeof a !== 'string'),
  }))
);
```
الـtemplate بعدها بيقرا `row.isPast` بدل ما ينده دالة. **من O(صفوف × دورات) لـO(صفوف).**

---

### A2 — `Array.includes()` في مسار ساخن حيث المطلوب `Set`

**الملف:** [`my-matches.component.ts:400-407`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L400)

```ts
attendeeIds(m: SeasonMatch): string[] {
  return (m.attendees ?? []).map(a => (typeof a === 'string' ? a : a._id));   // ← مصفوفة جديدة
}

isAttending(m: SeasonMatch): boolean {
  return this.attendeeIds(m).includes(this.currentUserId);                    // ← O(n) خطي
}
```

`isAttending()` بيتنده من:
- `visibleMatches()` computed ([`:348, 356`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L348)) — لكل ماتش
- `canEnterResult()` ([`:412`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L412)) — من الـtemplate لكل صف
- `toggleAttend()` ([`:416`](../frontend/src/app/features/season-matches/my-matches/my-matches.component.ts#L416))
- ومن الـtemplate مباشرة عدة مرات لكل صف

فكل نداء = **تخصيص مصفوفة جديدة** + مسح خطي. مع 50 ماتش × 3 نداءات لكل صف × كل دورة CD = 150 مصفوفة مؤقتة في الدورة الواحدة.

**النمط الصح موجود في نفس المشروع** — [`media-gallery.component.ts:288-298`](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L288):
```ts
// الصور اللي اترفعت مع فيديو معين — Map مبنية مرة واحدة على تغيير media()،
// بدل ما نعمل filter لكل فيديو في كل render
readonly linkedImagesByVideo = computed(() => {
  const map = new Map<string, PlayerMedia[]>();
  ...
});
```
التعليق ده بيوصف بالظبط المشكلة اللي `my-matches` واقع فيها. المطور اللي كتب `media-gallery` فهم النقطة؛ ماوصلتش لـ`my-matches`.

**الحل:**
```ts
private readonly attendingIds = computed(() => {
  const me = this.currentUserId;
  const s = new Set<string>();
  for (const m of this.matches())
    if ((m.attendees ?? []).some(a => (typeof a === 'string' ? a : a._id) === me)) s.add(m._id);
  return s;
});
isAttending(m: SeasonMatch): boolean { return this.attendingIds().has(m._id); }
```
مرة واحدة عند تغيّر `matches()`، وبحث O(1) بعدها.

**نفس الشكل بدرجة أخف** في [`user-list.component.ts:100-119`](../frontend/src/app/features/users/user-list/user-list.component.ts#L100): `statsMap()[user._id]` مستدعى **6 مرات لكل صف** (تلات إحصائيات، وكل واحدة بتفحص الوجود وبعدين تقرا). الحل: `computed()` بيدمج `users()` مع `statsMap()` في مصفوفة صفوف جاهزة.

---

### A3 — ثلاث تطبيقات مختلفة لحدود اليوم، وكلها بتتحسب لكل صف

`my-matches.component.ts` فيه تلات دوال تواريخ متجاورة بتلات اتفاقيات:
```ts
isPastMatch(m)      → new Date(m.matchDate).getTime() < Date.now()        // :505 — لحظي
isMatchDay(m)       → setHours(0,0,0,0) … +1 يوم                          // :510 — يوم محلي
canToggleAttend(m)  → setHours(0,0,0,0) … Date.now() < dayStart           // :520 — يوم محلي
```

**مشكلتان:**
1. **صحة:** `matchDate` مخزّن في الباك إند كـ**UTC midnight** (موثّق في `CLAUDE.md`: *"matchDate is stored as UTC midnight from `<input type="date">`"*). و`setHours(0,0,0,0)` بيشتغل بالتوقيت **المحلي**. لمستخدم في UTC+2 (مصر)، `new Date("2026-08-24T00:00:00Z")` هو `2026-08-24 02:00` محليًا، و`setHours(0,0,0,0)` بيرجّعه لـ`2026-08-24 00:00` محلي = `2026-08-23 22:00Z`. فالنافذة متزحلقة ساعتين عن حساب الباك إند. ده بالظبط توأم البند **C3** في مراجعة الباك إند ("ثلاث اتفاقيات مختلفة لحدود اليوم في نفس المشروع") — والفرونت بيضيف اتفاقية رابعة.
2. **أداء:** التلاتة بيتندهوا من الـtemplate لكل صف، وكل نداء بيخصّص كائن `Date` أو اتنين.

و`date-fns` **موجودة في `package.json` ومش مستخدمة** (P13) — يعني الأداة اللي كانت هتقفل ده مدفوعة بالفعل.

**الحل:** `core/utils/matchDay.ts` فيها دالة واحدة `matchDayBoundsUtc(matchDate)` بتشتغل بـUTC صراحةً (مطابقة للباك إند)، والنتايج تتحسب مرة واحدة في `computed()` مع باقي حقول الصف (شوف **A1**).

---

### A4 — فلترة وترتيب على جانب العميل فوق نتيجة مقسّمة لصفحات

**الملف:** [`report-list.component.ts:334-346`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L334)

```ts
readonly filteredReports = computed(() => {
  let list = [...this.reports()];
  if (minR)  list = list.filter(r => r.overallRating >= minR);
  if (from)  list = list.filter(r => r.matchDate >= from);
  if (to)    list = list.filter(r => r.matchDate <= to + 'T23:59:59');
  if (sort === 'desc') list.sort((a, b) => b.overallRating - a.overallRating);
  ...
});
```

الـ`computed` نفسه مكتوب صح (بيرد على الـsignals، وبينسخ قبل الـ`sort` عشان مايعدّلش المصدر). المشكلة في **نطاقه**: `load()` ([`:370-382`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L370)) بيبعت `{ sort: '-matchDate' }` **بلا `limit`**، فبياخد الصفحة الأولى بالحد الافتراضي بتاع الباك إند وبس.

**النتيجة:** الفلاتر بتشتغل على الصفحة الأولى فقط. لاعب عنده 80 تقرير: المستخدم بيفلتر "التقييم ≥ 9" وبيشوف اللي في أول 50 بس. والعدّاد فوق الصفحة ([`:33`](../frontend/src/app/features/scouting-reports/report-list/report-list.component.ts#L33)) بيقول `filteredReports().length / reports().length` — **رقمين الاتنين محدودين بالصفحة**، فمفيش أي مؤشّر للمستخدم إن فيه داتا مخفية. الفلتر بيكدب بثقة.

**بند فرعي — مقارنة تواريخ نصية:** `r.matchDate >= from` بتقارن ISO datetime (`"2026-08-24T00:00:00.000Z"`) بـ`"2026-08-24"` من `<input type="date">`. بتشتغل معجميًا مع ISO، والـ`to + 'T23:59:59'` اختراق واعي للمشكلة. شغّال، لكنه هش: أول ما الباك إند يغيّر صيغة السيريلايزيشن، الفلتر بيفشل بصمت بلا خطأ.

**الحل:** انقل الفلاتر للسيرفر (`?overallRating[gte]=`, `?matchDate[gte]=`, `?sort=`). الباك إند بيدعم الصيغة دي أصلًا (`ApiFeature.filter` بيتعامل مع `[gte]`/`[lte]`، ومستخدَمة فعلًا في [`report-form.component.ts:686`](../frontend/src/app/features/scouting-reports/report-form/report-form.component.ts#L686)). **الآلية موجودة ومجرّبة؛ الصفحة دي بس مش بتستخدمها.**

---

### A5 — تحميل O(n) لاشتقاق نتيجة O(k)

مغطى في **P9** من زاوية الأداء؛ من زاوية الخوارزمية: `loadAllSeasons()` بينقل **كل** المباريات عبر الشبكة عشان يحسب `distinct(season)` — عملية الـcardinality بتاعها ~3. التعقيد المطلوب `O(k)` (k = عدد المواسم)؛ المطبَّق `O(n)` في الشبكة و`O(n)` في الـparsing وفي الرام. النسبة على 200 مباراة مع populate رباعي: **عشرات آلاف البايتات مقابل 50 بايت**.

القاعدة العامة اللي البند ده مثال عليها: **أي `new Set(list.map(...))` على نتيجة ريكوست HTTP هو `DISTINCT` كان لازم يحصل في الداتابيز.** فيه ٣ حالات من الشكل ده في التطبيق (`age-group-detail:706`, `my-matches:395`, و`teamIds` في `my-matches:441`).

---

### A6 — ملاحظات إيجابية (اتركها كما هي)

- **`linkedImagesByVideo`** ([`media-gallery.component.ts:288`](../frontend/src/app/features/media/media-gallery/media-gallery.component.ts#L288)) — `Map` مبنية في `computed()` مرة واحدة، بتحوّل O(فيديوهات × صور) لـO(صور) + بحث O(1). ده المرجع الصح للمشروع كله.
- **`selectedObservers` كـ`Set<string>`** ([`player-detail.component.ts:623`](../frontend/src/app/features/players/player-detail/player-detail.component.ts#L623)) مع تحديث immutable في `toggleObserver` — بنية بيانات صح ونمط تحديث signals صح.
- **`monthlyTrend`** ([`coach-evaluation-list.component.ts:120`](../frontend/src/app/features/coach-evaluations/coach-evaluation-list/coach-evaluation-list.component.ts#L120)) — تجميع بـ`Map` في تمريرة واحدة (المفتاح ناقص `coachId` — **B8** — لكن الخوارزمية نفسها صح).
- **`getAverageRatings(playerIds)`** ([`scouting-report.service.ts:28`](../frontend/src/app/features/scouting-reports/services/scouting-report.service.ts#L28)) — ريكوست واحد مجمّع بدل N. نفس القرار في `getAllCoachesStats()` مع تعليق بيشرح ليه ("كان بيعمل burst كبير على الـrate limit"). دي بالظبط طريقة التفكير الصح.
- **`getMediaLimits()` بـ`shareReplay(1)`** ([`media.service.ts:34`](../frontend/src/app/features/media/services/media.service.ts#L34)) — كاش نظيف على مستوى الجلسة لقيمة شبه ثابتة.
- **`tus-js-client` بـdynamic import** ([`media.service.ts:106`](../frontend/src/app/features/media/services/media.service.ts#L106)) مع تعليق بيشرح السبب — الوعي بالـbundle موجود، محتاج بس يتوسّع للـ`provideAnimations` (P1).
- **الـTUS المباشر لـBunny** — البايتات عمرها ما بتعدّي على الـVPS. أهم قرار معماري في مسار الميديا، ومطبّق صح على الطرفين.

---

## Prioritized Recommendations

### 🔴 مانع للـdeploy — لازم يتصلح الأول

| # | الإجراء | الملف | الحجم |
|---|---|---|---|
| 1 | **حوّل الـSVG المعروضة بـ`[innerHTML]` لـtemplate حقيقي** — أيقونات التوست والـempty states والنوتيفيكيشنز كلها غير مرئية دلوقتي (**B1**) | empty-state · toast-container · notification-panel | ~40 سطر |
| 2 | **شيل الـ`.complete()` الستة من `SocketService.disconnect()`** — الريل-تايم بيموت بعد أول logout (**B2**) | [socket.service.ts:74](../frontend/src/app/core/services/socket.service.ts#L74) | 6 أسطر تتحذف |
| 3 | **امنع `embedUrl`/`url` عن غير الأدمن في `decorateMedia`** — البوابة دلوقتي في الـtemplate بس (**S1**) | [playerMediaController.js:47](../Backend/controllers/playerMediaController.js#L47) | ~5 أسطر |
| 4 | **احذف `provideAnimations()`** — 63.5 kB بلا استخدام، وبيرجّع الـbundle تحت الـbudget (**P1**) | [app.config.ts:21](../frontend/src/app/app.config.ts#L21) | سطرين |
| 5 | **`track $index` في الرادار، و`track n.id` في النوتيفيكيشنز** — `NG0955` وقت التشغيل (**B3**, **B4**) | radar-chart:42 · notification-panel:36 | 4 أسطر |
| 6 | **debounce + switchMap على بحث اللاعبين** — 14 ريكوست لكل بحث + سباق ردود (**P6**) | [player-list.component.ts:277](../frontend/src/app/features/players/player-list/player-list.component.ts#L277) | ~10 أسطر |
| 7 | **`if (this.coachId()) return;` في اشتراكي السوكِت بالداشبورد** — أرقام المنظمة بتظهر تحت اسم كوتش واحد (**B6**) | admin-dashboard:148 · observer-dashboard:132 | سطرين |

**إجمالي الطبقة دي: أقل من 70 سطر.**

---

### 🟠 قبل الإطلاق الواسع (2-4 أسابيع)

| # | الإجراء | البند |
|---|---|---|
| 8 | **انقل الـsplash + سكريبت الثيم/الاتجاه لـ`index.html`** — أكبر مكسب مفرد في الإحساس بالسرعة | P3, B10 |
| 9 | **شيل `PreloadAllModules`** (أو خلّيها استراتيجية حسب الدور) — ~593 kB بتتحمّل بلا داعي | P2 |
| 10 | **استضف الخطوط محليًا** — البيلد دلوقتي بيفشل من غير إنترنت، ومعاه تسريب IP للمستخدمين | P4 |
| 11 | **`eventCoalescing: true` + `OnPush` على الست صفحات الكبيرة** | P5 |
| 12 | **حوّل استدعاءات الـtemplates لـ`computed()`** — ابدأ بـ`report-form` (156 نداء/دورة) و`report-list` (`radarData`, `skillAverages`) | A1 |
| 13 | **صلّح عدّاد "الإجمالي"** في صفحة اللاعبين — بيعرض 20 دايمًا | B5 |
| 14 | **`sessionStorage` تحفظ علامة بدل البروفايل الكامل** — القارئ الوحيد بيفحص الوجود بس | S2 |
| 15 | **امسح `vaultPasswordInput` بعد الاستخدام** + `autocomplete="current-password"` | S6 |
| 16 | **احذف مسار الـsignup الميت** (كومبوننت + `AuthService.signup` + `SignupPayload`) | S4 |
| 17 | **صلّح ازدواج الريكوست الأول** في `player-list.ngOnInit` | P7 |
| 18 | **انقل فلاتر التقارير للسيرفر** — الفلاتر دلوقتي بتكدب على الصفحة الأولى | A4 |
| 19 | **حسّن الصور:** WebP + `srcset` للوجو، `width`/`height` على كل `<img>` | P11 |
| 20 | **`preload` لملف الترجمة** + `APP_INITIALIZER` يستنى `translate.use()` فعلًا | P12 |

---

### 🟡 صيانة (بعد الإطلاق، حسب المتاح)

| # | الإجراء | البند |
|---|---|---|
| 21 | استخرج `core/utils/`: `teamName`, `initials`, `ratingColor`, `reviewBadgeClass`, `currentSeason`, `extractFieldErrors` | C2 |
| 22 | `AgeGroupService` — يقفل الأربع كومبوننتات اللي بتحقن `HttpClient` | C6 |
| 23 | `Set` بدل `Array.includes` في `my-matches.isAttending` وصفوف `user-list` | A2 |
| 24 | دالة تواريخ واحدة بـUTC مطابقة للباك إند | A3 |
| 25 | قسّم الست كومبوننتات الكبيرة — ابدأ بـ`<app-rating-category>` (بيشيل 115 سطر مكرر) | C3 |
| 26 | شيل الـ41 `as any` وسيب الكومبايلر يتكلم | C5 |
| 27 | فحص أصل صريح قبل `bypassSecurityTrustResourceUrl` | S3 |
| 28 | صلّح `teamLabel()` في `player-detail` (بيعرض ObjectId) | S5 |
| 29 | `matchMedia` + `takeUntilDestroyed` بدل `addEventListener('resize')` | P14 |
| 30 | احذف `@angular/cdk`, `date-fns`, `platform-browser-dynamic`, و`allowedCommonJsDependencies` | P13 |
| 31 | تستات لـ`auth.interceptor` و`SocketService` — أخطر منطقتين وأقلهم تغطية | C7 |
| 32 | i18n للنصوص الإنجليزية المتبقية (`BORN`, `FOOT`, `Player Details`, `confirmLabel="Delete"`, `title="Edit"`…) | C6 |
| 33 | Web Worker لهاش الفيديو (رفع 50MB بيجمّد الواجهة) | P10 |
| 34 | `setTimeout` قبل `revokeObjectURL` في تحميل الفيديو | B11 |
| 35 | احذف `player-list.navigate()` الميتة | B9 |
| 36 | صلّح مفتاح `monthlyTrend` بإضافة `coachId` | B8 |
| 37 | قرار واحد في `returnUrl`: تستخدمه أو تحذفه من الـguard | B7 |

---

### 🔵 قرارات معمارية (تتخطّط لوحدها، مش شغل sprint)

| # | القرار | السبب |
|---|---|---|
| 38 | **endpoint واحد لصفوف الأوبزيرفر في "مبارياتي"** — 30 ريكوست في 3 موجات → 1 | P8 — أكبر مكسب أداء في التطبيق، بس محتاج شغل باك إند |
| 39 | **`GET /seasonMatches/seasons` (distinct)** — يقفل التلات مواضع اللي بتحمّل كل المباريات لتستخرج 3 نصوص | P9, A5 |
| 40 | **حملة الـ878 `style=` inline** — شرط مسبق لأي CSP جدّية، وبيوحّد الثيم | C4, S8 |
| 41 | **قرار صريح: هل الـroute guards للتجربة ولا للأمان؟** — وثّقه وطبّقه على كل الـfeatures بنفس الشكل | S7 |
| 42 | **`provideZonelessChangeDetection()`** — المشروع signals-first أصلًا فهو المرشّح الطبيعي؛ بيشيل zone.js (34.6 kB raw) ويلغي دورات الـCD الشاملة تمامًا. يتعمل **بعد** OnPush (بند 11) لأنه بيكشف أي كود معتمد على zone بشكل ضمني | P5 |

---

## ملحق: طريقة إعادة إنتاج قياسات الـbundle

```bash
# ملاحظة: البيلد الإنتاجي محتاج إنترنت بسبب @import للخطوط في styles.scss:5 (P4).
cd frontend
npx ng build --configuration=production

# الأرقام في التقرير:
#   Initial total: 546.89 kB raw / 144.53 kB transfer  (⚠️ budget 500 kB)
#   74 chunk إجمالًا (62 lazy)

# إجمالي الـJS المشحون (يوضّح تكلفة PreloadAllModules — P2):
cd dist/frontend/browser
cat *.js | wc -c                  # 1,167,632 بايت raw
cat *.js | gzip -9 -c | wc -c     #   320,926 بايت gzip

# مقارنة provideAnimations (P1): علّق السطر في app.config.ts وأعد البناء
#   546.89 kB → 483.40 kB raw   (−63.49 kB)
#   144.53 kB → 127.69 kB transfer (−16.84 kB) — وتحذير الـbudget بيختفي
```

قايمة العناصر المسموحة في الـsanitizer (دليل **B1**) — من `@angular/core` المثبَّت في المشروع:
```bash
grep -n "const VALID_ELEMENTS" frontend/node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs
# VOID_ELEMENTS: area,br,col,hr,img,wbr
# لا svg، ولا path، ولا circle، ولا polyline
```
