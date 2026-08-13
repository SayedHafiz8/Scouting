/**
 * @swagger
 * tags:
 *   name: ObserverEvaluations
 *   description: Monthly admin evaluations of observers/scouts (draft → publish → archive)
 *
 * /observerEvaluations:
 *   get:
 *     summary: List observer evaluations (observer sees own published; admin sees all, filterable)
 *     tags: [ObserverEvaluations]
 *     parameters:
 *       - in: query
 *         name: observer
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
 *     summary: Create an observer evaluation (draft) — admin only; stats auto-captured
 *     tags: [ObserverEvaluations]
 *     responses:
 *       201: { description: Evaluation created as draft }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *
 * /observerEvaluations/summary:
 *   get:
 *     summary: Published trend + category averages + latest for an observer
 *     tags: [ObserverEvaluations]
 *     parameters:
 *       - in: query
 *         name: observer
 *         schema: { type: string }
 *     responses:
 *       200: { description: Summary data }
 *
 * /observerEvaluations/{id}/publish:
 *   patch:
 *     summary: Publish an evaluation — notifies the observer (admin owner only)
 *     tags: [ObserverEvaluations]
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
 * /observerEvaluations/{id}/archive:
 *   patch:
 *     summary: Archive an evaluation — hides it from the observer (admin owner only)
 *     tags: [ObserverEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Archived }
 *
 * /observerEvaluations/{id}/refresh-stats:
 *   patch:
 *     summary: Re-capture the auto stats for a draft (admin owner only)
 *     tags: [ObserverEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Stats refreshed }
 *
 * /observerEvaluations/{id}:
 *   get:
 *     summary: Get a specific evaluation
 *     tags: [ObserverEvaluations]
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
 *     tags: [ObserverEvaluations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Updated }
 *   delete:
 *     summary: Delete evaluation (admin owner only)
 *     tags: [ObserverEvaluations]
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
} from "../controllers/observerEvaluationController.js";
import { protect, allowedTo } from "../controllers/authController.js";
import {
    createValidate,
    updateValidate,
    getAllValidate,
    getSpecificValidate,
    deleteValidate,
    idParamValidate,
    summaryValidate,
} from "../utils/validation/observerEvaluationValidation.js";

const router = express.Router();

router.use(protect);

router
    .route("/")
    .get(allowedTo("admin", "observer"), getAllValidate, getAll)
    .post(allowedTo("admin"), createValidate, create);

// لازم قبل /:id
router.get("/summary", allowedTo("admin", "observer"), summaryValidate, getSummary);

router.patch("/:id/publish", allowedTo("admin"), idParamValidate, publish);
router.patch("/:id/archive", allowedTo("admin"), idParamValidate, archive);
router.patch("/:id/refresh-stats", allowedTo("admin"), idParamValidate, refreshStats);

router
    .route("/:id")
    .get(allowedTo("admin", "observer"), getSpecificValidate, getSpecific)
    .patch(allowedTo("admin"), updateValidate, update)
    .delete(allowedTo("admin"), deleteValidate, deleting);

export default router;
