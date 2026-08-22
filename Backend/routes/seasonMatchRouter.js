import express from "express";

import {
    create,
    getAll,
    getSpecific,
    update,
    deleting,
    setUpdatedBy,
    updateMatchStatus,
    attendMatch,
    unattendMatch,
} from "../controllers/seasonMatchController.js";
import {
    createValidate,
    updateValidate,
    getAllValidate,
    getSpecificValidate,
    deleteValidate,
    updateStatusValidate,
} from "../utils/validation/seasonMatchValidation.js";
import { protect, allowedTo } from "../controllers/authController.js";
import { checkSeasonMatchAttendee, checkSeasonMatchScope } from "../middlewares/ownership.js";
import { ROLES } from "../constants/roles.js";

/**
 * @swagger
 * tags:
 *   name: SeasonMatches
 *   description: Per-age-group season match schedule
 *
 * components:
 *   schemas:
 *     SeasonMatch:
 *       type: object
 *       properties:
 *         _id: { type: string }
 *         ageGroup: { type: string, description: AgeGroup id (populated on read) }
 *         season: { type: string, example: "2025/2026" }
 *         league:
 *           type: string
 *           enum: [premier, professional]
 *           description: Premier or Professionals league — separate schedule per age group
 *         matchDate: { type: string, format: date-time }
 *         homeTeam: { type: string, description: Team id (populated on read) }
 *         awayTeam: { type: string, description: Team id (populated on read) }
 *         venue: { type: string }
 *         status:
 *           type: string
 *           enum: [scheduled, completed, cancelled, postponed]
 *         result:
 *           type: object
 *           properties:
 *             homeScore: { type: integer, minimum: 0 }
 *             awayScore: { type: integer, minimum: 0 }
 *         attendees:
 *           type: array
 *           readOnly: true
 *           description: Scouts who self-enrolled via the attend endpoint (not settable on create/update)
 *           items: { type: string, description: User id (coach/observer) }
 *         createdBy: { type: string, description: User id (server-set) }
 *         updatedBy: { type: string, description: User id (server-set) }
 *
 * /seasonMatches:
 *   get:
 *     summary: List season matches (filter by ageGroup, season, status)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: ageGroup
 *         schema: { type: string }
 *       - in: query
 *         name: season
 *         schema: { type: string, example: "2025/2026" }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [scheduled, completed, cancelled, postponed] }
 *       - in: query
 *         name: league
 *         schema: { type: string, enum: [premier, professional] }
 *     responses:
 *       200: { description: List of season matches }
 *   post:
 *     summary: Create a season match (admin only)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SeasonMatch' }
 *     responses:
 *       201: { description: Created }
 *       403: { description: Admin only }
 *
 * /seasonMatches/{id}:
 *   get:
 *     summary: Get a season match with linked reports
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Season match }
 *       404: { description: Not found }
 *   patch:
 *     summary: Update a season match (admin only)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *   delete:
 *     summary: Delete a season match (admin only)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *
 * /seasonMatches/{id}/status:
 *   patch:
 *     summary: Update a match's status/result (the assigned attendee coach/observer/proScout, or an admin)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [scheduled, completed, cancelled, postponed]
 *               result:
 *                 type: object
 *                 properties:
 *                   homeScore: { type: integer, minimum: 0 }
 *                   awayScore: { type: integer, minimum: 0 }
 *     responses:
 *       200: { description: Updated }
 *       403: { description: Not the assigned attendee }
 *       404: { description: Not found }
 *
 * /seasonMatches/{id}/attend:
 *   post:
 *     summary: Scout self-enrolls to attend this match (coach/observer/proScout)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Attending }
 *       400: { description: Match is cancelled }
 *       403: { description: Match is outside the caller's scope (proScout) }
 *       404: { description: Not found }
 *   delete:
 *     summary: Scout removes self from this match's attendees (coach/observer/proScout)
 *     tags: [SeasonMatches]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: No longer attending }
 *       404: { description: Not found }
 */
const seasonMatchRouter = express.Router();

// Stage 2 — proScout اتفتحله الحدّان دول بعد ما seasonMatchBaseFilterFor بقى
// switch صريح بيرجّع { league: "professional" } ملفوف في $and من الطبقة المركزية.
// قبل كده كان بيرجع {} لأي رول مش معدود، يعني فتح الحد كان بيسرّب الجدول كله.
// مسار /:id محتاج checkSeasonMatchScope كمان لأن الـbaseFilterFn بيحكم القوايم بس.
seasonMatchRouter.route('/')
    .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), getAllValidate, getAll)
    .post(protect, allowedTo(ROLES.ADMIN), createValidate, create);

seasonMatchRouter.route('/:id')
    .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), getSpecificValidate, checkSeasonMatchScope, getSpecific)
    .patch(protect, allowedTo(ROLES.ADMIN), updateValidate, setUpdatedBy, update)
    .delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, deleting);

// الكوتش أو الأوبزيرفر أو الـproScout الحاضر (attendee) أو الأدمن بس — منفصلة عن
// التعديل العام، بتغيّر status/result بس. proScout بيخضع لنفس قيد يوم المباراة
// (updateMatchStatus مبني على role !== ADMIN، مش قايمة أدوار — بيتفعّل تلقائي)
// وفرع النطاق+العضوية المصحّح في checkSeasonMatchAttendee (Stage 6).
seasonMatchRouter.route('/:id/status')
    .patch(protect, allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT, ROLES.ADMIN), checkSeasonMatchAttendee, updateStatusValidate, updateMatchStatus);

// self-service — الكشاف نفسه بيسجّل/يلغي حضوره للمباراة. proScout اتضاف في
// المرحلة 6 مع checkSeasonMatchScope — نفس حارس GET /:id بالظبط، مش نسخة
// تانية منه — عشان يمنعه من الحضور على مباراة برّة نطاقه (كان مفيش أي حارس
// نطاق على المسارين دول قبل كده، Principle IV).
seasonMatchRouter.route('/:id/attend')
    .post(protect, allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkSeasonMatchScope, attendMatch)
    .delete(protect, allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkSeasonMatchScope, unattendMatch);

export default seasonMatchRouter;
