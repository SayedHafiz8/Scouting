/**
 * @swagger
 * /players/{playerId}/reports:
 *   get:
 *     summary: List all scouting reports for a player
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
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
 *         description: Paginated list of scouting reports
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
 *                         $ref: '#/components/schemas/ScoutingReport'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   post:
 *     summary: Create a scouting report for a player (coach only)
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [homeTeam, awayTeam, technical, physical, mental]
 *             properties:
 *               homeTeam:
 *                 type: string
 *                 description: Home team name
 *               awayTeam:
 *                 type: string
 *                 description: Away team name
 *               technical:
 *                 $ref: '#/components/schemas/TechnicalSkills'
 *               physical:
 *                 $ref: '#/components/schemas/PhysicalSkills'
 *               mental:
 *                 $ref: '#/components/schemas/MentalSkills'
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Report created — overallRating auto-calculated as average of 12 metrics
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
 *                       $ref: '#/components/schemas/ScoutingReport'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /players/{playerId}/reports/statistics:
 *   get:
 *     summary: Get aggregated statistics across all reports for a player
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Player statistics
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
 *                     statistics:
 *                       $ref: '#/components/schemas/ReportStatistics'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{playerId}/reports/{id}:
 *   get:
 *     summary: Get a specific scouting report
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report found
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
 *                       $ref: '#/components/schemas/ScoutingReport'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a scouting report (coach only — own reports)
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
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
 *               homeTeam:
 *                 type: string
 *               awayTeam:
 *                 type: string
 *               technical:
 *                 $ref: '#/components/schemas/TechnicalSkills'
 *               physical:
 *                 $ref: '#/components/schemas/PhysicalSkills'
 *               mental:
 *                 $ref: '#/components/schemas/MentalSkills'
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Report updated — overallRating recalculated
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
 *                       $ref: '#/components/schemas/ScoutingReport'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Delete a scouting report (admin only)
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
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
 */
import express from "express";

import { create, deleting, getAll, getSpecific, setPlayerToBody, resolveSeasonMatchToBody, resolveMatchTypeFields, update, getPlayerStatistics } from "../controllers/scoutingReportController.js";
import { protect, allowedTo } from "../controllers/authController.js";
import { checkPlayerOwnership, checkReportOwnership } from "../middlewares/ownership.js";
import { createValidate, deleteValidate, getAllValidate, getSpecificValidate, updateValidate, statisticsValidate } from "../utils/validation/scoutingValidation.js";

// mergeParams علشان يشتغل كـ nested route تحت /players/:id/scouting-reports
const scoutingRouter = express.Router({ mergeParams: true });

scoutingRouter
    .route("/")
    .get(protect, allowedTo("coach", "admin", "observer"), checkPlayerOwnership, getAllValidate, getAll)
    .post(protect, allowedTo("coach", "observer"), checkPlayerOwnership, resolveMatchTypeFields, createValidate, setPlayerToBody, resolveSeasonMatchToBody, create);


scoutingRouter
    .route("/statistics")
    .get(protect, allowedTo("coach", "admin", "observer"), checkPlayerOwnership, statisticsValidate, getPlayerStatistics);


scoutingRouter
    .route("/:id")
    .get(protect, allowedTo("coach", "admin", "observer"),checkReportOwnership, getSpecificValidate,getSpecific)
    .patch(protect, allowedTo("coach", "observer"), checkReportOwnership,updateValidate, resolveSeasonMatchToBody, update)
    .delete(protect, allowedTo("admin"),deleteValidate, deleting);



    export default scoutingRouter;
