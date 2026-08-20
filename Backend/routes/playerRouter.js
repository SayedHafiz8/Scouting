/**
 * @swagger
 * /players:
 *   get:
 *     summary: List players (coaches see only their own; admins see all)
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
 *     summary: Create a player (coach only)
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
 *     summary: Update a player's details (coach only)
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
 *     summary: Upload/replace a player's profile image (coach or admin)
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
import { getAll, create, getSpecific, deleting, update, setUserIdToBody, updatePlayerStatus, updatePlayerObservers, assignPlayerCoach, uploadProfileImg, getCountsByAgeGroup } from "../controllers/playerController.js";
import { createValidate, getAllValidate, deleteValidate, getSpecificValidate, updateValidate, updatePlayerStatusValidator, updatePlayerObserversValidator, assignPlayerCoachValidator } from "../utils/validation/playerValidation.js";
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
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER), getAverageRatingsForPlayers);

playerRouter.use('/:playerId/reports', scoutingRouter);
playerRouter.use('/:playerId/media', mediaRouter)

// proScout المضاف هنا فقط من الأربعة list endpoints المرشحة — لأن getAll هي الوحيدة
// اللي بتعدّي على ApiFeature.filter/ownerFields (طبقة النطاق المركزية)، فغيابه من
// ownerFields بيرجّعله MATCH_NOTHING فعلاً بدل ما يترفض من بوابة الرول. counts/
// average-ratings/seasonMatches عندهم منطق if/else لكل رول بيرجع {} (بدون فلتر) لأي
// رول مش معدود صراحةً — إضافة proScout هناك كانت هتسرّب بيانات، فاتسابوا 403 لحد
// ما ينتقلوا لطبقة النطاق المركزية (Stage 2 أو تصليح منفصل).
playerRouter.route('/')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT),getAllValidate ,getAll)
            .post(protect,allowedTo(ROLES.COACH),setUserIdToBody, createValidate,create)

// Counts per age group — must be declared before '/:id' so "counts" isn't treated as an id
playerRouter.route('/counts')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER), getCountsByAgeGroup)


playerRouter.route('/:id')
            .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER), checkPlayerOwnership, getSpecificValidate, getSpecific)
            .patch(protect, allowedTo(ROLES.COACH), checkPlayerOwnership, updateValidate, update)
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

playerRouter.route('/:id/profileImg')
            .patch(protect, allowedTo(ROLES.COACH, ROLES.ADMIN), upload.single('profileImg'), uploadProfileImg)

export default playerRouter;
