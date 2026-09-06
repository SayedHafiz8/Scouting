/**
 * @swagger
 * /players:
 *   get:
 *     summary: List players (coaches see only their own; observers see assigned; proScout sees the professional league plus its own team-less players; admins see all)
 *     tags: [Players]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Full-text search on name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, selected, rejected]
 *       - in: query
 *         name: position
 *         schema:
 *           type: string
 *           enum: [GK, CB, LB, RB, CM, AM, LW, RW, ST]
 *       - in: query
 *         name: preferredFoot
 *         schema:
 *           type: string
 *           enum: [right, left, both]
 *       - in: query
 *         name: ageGroup
 *         schema:
 *           type: string
 *       - in: query
 *         name: isProfessional
 *         schema:
 *           type: boolean
 *         description: Admin-facing lens for professional-league players (Stage 4c). Available to every role but narrows only within that role's existing scope — it grants no new access.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paginated list of players
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 count:
 *                   type: integer
 *                 pagination:
 *                   $ref: '#/components/schemas/Pagination'
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Player'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 *   post:
 *     summary: Create a player (coach, observer, proScout, or admin — admin may assign the player to a coach/observers/proScout in the same request)
 *     tags: [Players]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, dateOfBirth, city, address, nationality, team, phoneNumber]
 *             properties:
 *               name:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               nationality:
 *                 type: string
 *               team:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               position:
 *                 type: string
 *                 enum: [GK, CB, LB, RB, CM, AM, LW, RW, ST]
 *               preferredFoot:
 *                 type: string
 *                 enum: [right, left, both]
 *               height:
 *                 type: number
 *               weight:
 *                 type: number
 *               notes:
 *                 type: string
 *               coach:
 *                 type: string
 *                 description: Admin only. Id of an existing active user whose role is `coach`.
 *               observers:
 *                 type: array
 *                 items: { type: string }
 *                 description: Admin only. Ids of existing active users whose role is `observer`.
 *               proScout:
 *                 type: string
 *                 description: >
 *                   Admin only. Id of an existing active user whose role is `proScout` —
 *                   sets `createdBy` to this id, the axis proScout scope is keyed on.
 *     responses:
 *       201:
 *         description: Player created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /players/{id}:
 *   get:
 *     summary: Get a specific player by ID
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Player found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a player's details (coach, observer, proScout, or admin — each within its own data scope; ownership fields stay locked here for every role, admin included, see /players/{id}/coach, /observers and /proScout)
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *               city:
 *                 type: string
 *               position:
 *                 type: string
 *                 enum: [GK, CB, LB, RB, CM, AM, LW, RW, ST]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Player updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Permanently delete a player (admin only)
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         $ref: '#/components/responses/NoContent'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{id}/status:
 *   patch:
 *     summary: Update a player's recruitment status (admin only)
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, selected, rejected]
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{id}/coach:
 *   patch:
 *     summary: Assign or re-assign the coach who owns a player (admin only)
 *     description: >
 *       The only way to give a player an owner. Needed above all for players
 *       whose coach account was permanently deleted — those keep their data but
 *       lose the `coach` field, and stay visible to admins (and any assigned
 *       observers) until they are handed to a new coach here.
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [coach]
 *             properties:
 *               coach:
 *                 type: string
 *                 description: Id of an existing active user whose role is `coach`
 *     responses:
 *       200:
 *         description: Coach assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{id}/proScout:
 *   patch:
 *     summary: Assign (or re-assign) the proScout a player is scoped to (admin only)
 *     description: >
 *       Sets `createdBy` to the given proScout's id — the axis proScout read/write
 *       scope is keyed on (services/scope.js playerScopeFor). Mirrors
 *       PATCH /players/{id}/coach for the proScout ownership axis.
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [proScout]
 *             properties:
 *               proScout:
 *                 type: string
 *                 description: Id of an existing active user whose role is `proScout`
 *     responses:
 *       200:
 *         description: proScout assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       $ref: '#/components/schemas/Player'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/counts:
 *   get:
 *     summary: Player counts grouped by age group (coach sees own; admin sees all, or a specific coach/observer via query)
 *     tags: [Players]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, selected, rejected, observed] }
 *       - in: query
 *         name: coach
 *         schema: { type: string }
 *         description: Admin only — count a specific coach's players
 *       - in: query
 *         name: observer
 *         schema: { type: string }
 *         description: Admin only — count a specific observer's players
 *     responses:
 *       200:
 *         description: Counts grouped by age group id
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     counts:
 *                       type: object
 *                       additionalProperties: { type: integer }
 *                     total: { type: integer }
 *                     professional: { type: integer, description: "Stage 4c — count of isProfessional:true players within the caller's scope, honouring the same status/coach/observer conditions as `counts`. Derived from the flag, never from total minus the sum of counts." }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /players/reports/average-ratings:
 *   get:
 *     summary: Average overall rating across scouting reports for a set of players
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Map of player id to average rating
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   additionalProperties: { type: number }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 * /players/{id}/observers:
 *   patch:
 *     summary: Add/remove assigned observers for a player without touching status (admin only)
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [observers]
 *             properties:
 *               observers:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Observers updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Player' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /players/{id}/profileImg:
 *   patch:
 *     summary: Upload/replace a player's profile image (coach, admin, or proScout — each within its own data scope)
 *     tags: [Players]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [profileImg]
 *             properties:
 *               profileImg:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile image updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Player' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
import express from "express";
import { getAll, create, getSpecific, deleting, update, setUserIdToBody, updatePlayerStatus, updatePlayerObservers, assignPlayerCoach, assignPlayerProScout, uploadProfileImg, getCountsByAgeGroup } from "../controllers/playerController.js";
import { createValidate, getAllValidate, deleteValidate, getSpecificValidate, updateValidate, updatePlayerStatusValidator, updatePlayerObserversValidator, assignPlayerCoachValidator, assignPlayerProScoutValidator } from "../utils/validation/playerValidation.js";
import { allowedTo, protect } from "../controllers/authController.js";
import { checkPlayerOwnership } from "../middlewares/ownership.js";
import upload from "../middlewares/uploadMiddleware.js";
import scoutingRouter from "./scoutingReportRouter.js";
import mediaRouter from "./playerMediaRouter.js";
import { getAverageRatingsForPlayers } from "../controllers/scoutingReportController.js";
import { ROLES } from "../constants/roles.js";

// (mergeParams) using for access parameters on other routers
const playerRouter = express.Router({mergeParams: true});

// لازم يتحط قبل '/:playerId/reports' عشان "reports" متتاخدش كـ playerId
playerRouter.route('/reports/average-ratings')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), getAverageRatingsForPlayers);

playerRouter.use('/:playerId/reports', scoutingRouter);
playerRouter.use('/:playerId/media', mediaRouter)

// Stage 2 — تأجيل المرحلة 1 اتحلّ. الوضع القديم: proScout كان مضاف لـgetAll بس،
// لأنها الوحيدة اللي بتعدّي على ApiFeature/ownerFields فبترجّع MATCH_NOTHING فعلاً؛
// counts وaverage-ratings وseasonMatches كانوا 403 لأن فروعهم بترجع {} (بدون فلتر)
// لأي رول مش معدود، يعني فتحهم كان هيسرّب مش يرجّع صفر.
//
// اللي اتعمل: النطاق اتنقل لطبقة مركزية واحدة (services/scope.js) بيقرا منها
// getAll (base filter) وgetCountsByAgeGroup ($match) وgetAverageRatingsForPlayers
// (تضييق الـids) وcheckPlayerOwnership (نفس الفلتر على مستند واحد). دلوقتي بس
// اتفتحت الحدود دي — الترتيب ده شرط أمني: فتح الحد قبل السكوب كان بيكشف الكولكشن
// كله. تصحيح: average-ratings مكانتش غير مفلترة أصلاً، كانت مسكوبة على محور
// ملكية التقرير (محور غلط) — راجع specs/003-proscout-data-scope/research.md R6.
// Stage 4 — POST اتفتح للـproScout. تلات طبقات بتحكمه، وكلها كانت جاهزة قبل فتح الحد:
//   1) createValidate → teamExistsInScope: فريق برّه دوري المحترفين بيترفض بنفس
//      رسالة "فريق مش موجود" بالظبط (anti-oracle، research R4).
//   2) create: بيمسح req.body.coach لأي رول مش كوتش (research R14 — الراوتر ده
//      متمركّب كمان على /users/:id/players وsetUserIdToBody بينسخ الـuser id من
//      الـURL في coach).
//   3) lockField على status/coach/observers/profileImg/ageGroup/createdBy.
// observer-matches-and-players — POST/PATCH اتفتحوا للأوبزيرفر بنفس الطبقات
// الثلاث بالضبط. اللاعب بيتحط في observers بتاعه من الأول (create)، فـ
// ownerFields.observer الموجودة أصلاً بتشمله من غير أي تعديل في طبقة السكوب —
// راجع playerController.create وownerFields تحت.
//
// admin-assign-players-reports-media — الأدمن بقى يقدر يعمل POST/PATCH كمان،
// عشان يعمل create للاعب ويسنده لكوتش/أوبزيرفرز/proScout بنفسه. الفرق عن كل
// رول تاني: الأدمن هو الوحيد اللي lockField بتاعة coach/observers/proScout
// بتفكّ له (lockFieldExceptAdmin في playerValidation.js) — القيمة اللي بيبعتها
// بتتحقق في الكنترولر (لازم يوزر فعلي بنفس الرول)، مش هنا. createdBy/status/
// ageGroup/isProfessional فاضلين مقفولين لكل الرولات بما فيها الأدمن — الإسناد
// بيحصل عن طريق حقل proScout/observers في الـbody، مش createdBy مباشرة.
playerRouter.route('/')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT),getAllValidate ,getAll)
            .post(protect,allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT),setUserIdToBody, createValidate,create)

// Counts per age group — must be declared before '/:id' so "counts" isn't treated as an id
playerRouter.route('/counts')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), getCountsByAgeGroup)


playerRouter.route('/:id')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkPlayerOwnership, getSpecificValidate, getSpecific)
            // Stage 4 — checkPlayerOwnership عنده فرع proScout صريح من المرحلة 2،
            // وupdateValidate فيه teamExistsInScope، فإعادة الإسناد لفريق برّه
            // الدوري بترفض زي الإنشاء بالظبط. observer-matches-and-players —
            // checkPlayerOwnership عنده فرع observer صريح من الأول (مصفوفة
            // observers، بلا اعتماد على مين أنشأ المستند)، وupdateValidate فيه
            // كمان فحص جديد بيمنع الأوبزيرفر يعدّي حدود التصنيف (محترف↔ناشئ) عن
            // طريق تغيير team — راجع teamMatchesExistingClassification.
            // admin-assign-players-reports-media — checkPlayerOwnership بيعمل short-circuit
            // للأدمن (بلا فحوصات)، فمفيش تعديل مطلوب هنا. الحقول القابلة للإسناد (coach/
            // observers/proScout) لسه مقفولة في updateValidate لكل الرولات بما فيها الأدمن —
            // إعادة الإسناد بتعدّي على /:id/coach و/:id/observers و/:id/proScout المخصصين، مش
            // PATCH العام (findByIdAndUpdate خام، مش نقطة كتابة ملكية آمنة).
            .patch(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkPlayerOwnership, updateValidate, update)
            .delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, deleting)

playerRouter.route('/:id/status')
            .patch(protect,allowedTo(ROLES.ADMIN), updatePlayerStatusValidator, updatePlayerStatus)

// إضافة/إلغاء أوبزيرفرز من غير ما نلمس الـ status — بيسمح للأدمن يلغي أوبزيرفر معين بس
playerRouter.route('/:id/observers')
            .patch(protect, allowedTo(ROLES.ADMIN), updatePlayerObserversValidator, updatePlayerObservers)

// §9 — تعيين/نقل الكوتش المالك. المخرج الوحيد للاعب اللي كوتشه اتمسح نهائياً،
// وأدمن-فقط لأنه نقل ملكية لبيانات لاعب قاصر
playerRouter.route('/:id/coach')
            .patch(protect, allowedTo(ROLES.ADMIN), assignPlayerCoachValidator, assignPlayerCoach)

// admin-assign-players-reports-media — نفس فكرة /:id/coach بالظبط لكن للـcreatedBy
// (المحور اللي الـproScout بيتسكوب بيه، services/scope.js:playerScopeFor). أدمن-فقط،
// لأنه بيغيّر مين شايف اللاعب على محور كامل، مش تفصيل عرض.
playerRouter.route('/:id/proScout')
            .patch(protect, allowedTo(ROLES.ADMIN), assignPlayerProScoutValidator, assignPlayerProScout)

// Stage 4 (research R7) — الحارس اتنقل لطبقته الصح.
//
// المسار ده كان الوحيد اللي بيعمل فحص ملكية **بإيده جوه الكنترولر**
// (uploadProfileImg: مقارنة existing.coach بـreq.user._id) بدل ما يعدّي على
// middlewares/ownership.js — مخالفة لـPrinciple IV. إضافة checkPlayerOwnership
// هنا بتدي الـproScout فرعه الصحيح مجاناً وبتدي كمان تسجيل الرفض
// (logScopeDenial) اللي كل مسار محروس تاني بيعمله.
//
// المكان بعد upload.single عن قصد: الحفاظ على أسبقية الأخطاء القائمة للكوتش
// والأدمن (Principle III) — التستات في proScoutPlayersWrite.test.js بتقفل ده.
// الفحص القديم جوه الكنترولر اتساب مكانه كما هو (بقى زيادة للكوتش، بس شيله
// تغيير سلوك لرول قائم برّه نطاق المرحلة).
playerRouter.route('/:id/profileImg')
            .patch(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), upload.single('profileImg'), checkPlayerOwnership, uploadProfileImg)

export default playerRouter;
