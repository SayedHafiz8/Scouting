/**
 * @swagger
 * tags:
 *   name: CoachEvaluations
 *   description: Monthly admin evaluations of coaches/scouts (draft → publish → archive)
 *
 * /coachEvaluations:
 *   get:
 *     summary: List coach evaluations (coach sees own published; admin sees all, filterable)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: query
 *         name: coach
 *         schema: { type: string }
 *       - in: query
 *         name: evaluator
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *     responses:
 *       200: { description: Paginated list of evaluations }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *   post:
 *     summary: Create a coach evaluation (draft) — admin only; stats auto-captured
 *     tags: [CoachEvaluations]
 *     responses:
 *       201: { description: Evaluation created as draft }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 * /coachEvaluations/summary:
 *   get:
 *     summary: Published trend + category averages + latest for a coach
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: query
 *         name: coach
 *         schema: { type: string }
 *     responses:
 *       200: { description: Summary data }
 *
 * /coachEvaluations/monthly:
 *   get:
 *     summary: Combined "overall" card for a coach/month across all admins — average + drill-down list. Locked until the requesting admin has published their own evaluation for the same coach/month.
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: query
 *         name: coach
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Combined evaluation data }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 * /coachEvaluations/{id}/publish:
 *   patch:
 *     summary: Publish an evaluation — notifies the coach (admin owner only)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Published }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /coachEvaluations/{id}/archive:
 *   patch:
 *     summary: Archive an evaluation — hides it from the coach (admin owner only)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Archived }
 *
 * /coachEvaluations/{id}/refresh-stats:
 *   patch:
 *     summary: Re-capture the auto stats for a draft (admin owner only)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Stats refreshed }
 *
 * /coachEvaluations/{id}:
 *   get:
 *     summary: Get a specific evaluation
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Evaluation found }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   patch:
 *     summary: Update evaluation content (admin owner only)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *   delete:
 *     summary: Delete evaluation (admin owner only)
 *     tags: [CoachEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { $ref: '#/components/responses/NoContent' }
 */
import express from "express";

import {
    create,
    getAll,
    getSpecific,
    update,
    deleting,
    publish,
    archive,
    refreshStats,
    getSummary,
    getMonthlyPanel,
} from "../controllers/coachEvaluationController.js";
import { protect, allowedTo } from "../controllers/authController.js";
import {
    createValidate,
    updateValidate,
    getAllValidate,
    getSpecificValidate,
    deleteValidate,
    idParamValidate,
    summaryValidate,
    monthlyPanelValidate,
} from "../utils/validation/coachEvaluationValidation.js";

const router = express.Router();

router.use(protect);

router
    .route("/")
    .get(allowedTo("admin", "coach"), getAllValidate, getAll)
    .post(allowedTo("admin"), createValidate, create);

// لازم قبل /:id
router.get("/summary", allowedTo("admin", "coach"), summaryValidate, getSummary);
router.get("/monthly", allowedTo("admin"), monthlyPanelValidate, getMonthlyPanel);

router.patch("/:id/publish", allowedTo("admin"), idParamValidate, publish);
router.patch("/:id/archive", allowedTo("admin"), idParamValidate, archive);
router.patch("/:id/refresh-stats", allowedTo("admin"), idParamValidate, refreshStats);

router
    .route("/:id")
    .get(allowedTo("admin", "coach"), getSpecificValidate, getSpecific)
    .patch(allowedTo("admin"), updateValidate, update)
    .delete(allowedTo("admin"), deleteValidate, deleting);

export default router;
