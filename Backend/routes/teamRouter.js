import express from "express";
import { getAll, create, getSpecific, deleting, update, setAgeIdToBody } from "../controllers/teamsController.js";
import { createValidate, deleteValidate, getAllValidate, getSpecificValidate, updateValidate } from "../utils/validation/teamValidation.js";
import { protect, allowedTo } from "../controllers/authController.js";
import { ROLES } from "../constants/roles.js";
// (mergeParams) using for access parameters on other routers
const teamRouter = express.Router({mergeParams: true});

// ملحوظة: /teams/:id/players اتشال — mount ميت (Team id مالوش أي معنى كـcoach id)،
// مفيش استخدام في الفرونت ولا في أي تست ولا موثّق في openapi.json. راجع خطة B1+B2.

// §10 — القراءة بقت وراء protect. الداتا نفسها مش سرّية، بس مكانش فيه أي سبب
// تتعرض لغير المسجّلين: الفرونت بيناديها من صفحات محمية بس، والـvirtual بتاع
// players لو اتعمله populate يوم من الأيام كان هيسرّب أسامي لاعبين قاصرين من غير
// أي فحص. مفيش allowedTo — التلات أدوار بيحتاجوا الفرق (dropdowns + عرض).
// ملحوظة: ده بيغطي كمان الـmount المتداخل /ages/:id/teams. راوتات /ages نفسها
// بتفضل عامة عن قصد (security: [] موثّقة في الـswagger بتاعها).

/**
 * @swagger
 * /teams:
 *   get:
 *     summary: List teams (optionally scoped to an age group via the nested /ages/{id}/teams mount)
 *     tags: [Teams]
 *     parameters:
 *       - in: query
 *         name: ageGroup
 *         schema: { type: string }
 *         description: Filter by age group id (implicit when called via /ages/{id}/teams)
 *       - in: query
 *         name: league
 *         schema: { type: string, enum: [premier, professional] }
 *     responses:
 *       200:
 *         description: List of teams
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 count: { type: integer }
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Team' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *
 *   post:
 *     summary: Create a team (admin only)
 *     tags: [Teams]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, clubName]
 *             properties:
 *               name:     { type: string }
 *               clubName: { type: string }
 *               league:   { type: string, enum: [premier, professional], default: premier }
 *     responses:
 *       201:
 *         description: Team created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Team' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       422: { $ref: '#/components/responses/ValidationError' }
 */
teamRouter.route('/')
            .get(protect, getAll)
            .post(protect, allowedTo(ROLES.ADMIN), setAgeIdToBody, createValidate, create)


/**
 * @swagger
 * /teams/{id}:
 *   get:
 *     summary: Get a specific team by id
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Team found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Team' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 *   patch:
 *     summary: Update a team (admin only)
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:     { type: string }
 *               clubName: { type: string }
 *               league:   { type: string, enum: [premier, professional] }
 *               active:   { type: boolean }
 *     responses:
 *       200:
 *         description: Team updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/Team' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 *   delete:
 *     summary: Delete a team (admin only)
 *     tags: [Teams]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Team deleted
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
teamRouter.route('/:id')
            .get(protect, getSpecificValidate, getSpecific)
            .patch(protect, allowedTo(ROLES.ADMIN), updateValidate, update)
            .delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, deleting)


export default teamRouter;