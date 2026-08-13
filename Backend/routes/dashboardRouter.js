/**
 * @swagger
 * /dashboard/coach:
 *   get:
 *     summary: Get the logged-in coach's dashboard statistics
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Coach dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/CoachDashboard'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /dashboard/admin:
 *   get:
 *     summary: Get the global admin dashboard statistics
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Admin dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/AdminDashboard'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /dashboard/admin/coaches-stats:
 *   get:
 *     summary: Get total/selected player counts for every coach in one call (admin only)
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Map of coach id to stats
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
 *                     stats:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           totalPlayers:
 *                             type: integer
 *                           selectedPlayers:
 *                             type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /dashboard/admin/{coachId}:
 *   get:
 *     summary: Get dashboard statistics for a specific coach (admin only)
 *     tags: [Dashboard]
 *     parameters:
 *       - in: path
 *         name: coachId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Coach dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/CoachDashboard'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
import express from "express";
import {
    getCoachDashboard,
    getObserverDashboard,
    adminDashboard,
    getAllCoachesStats,
} from "../controllers/dashboardController.js";
import { protect, allowedTo } from "../controllers/authController.js";
import { coachIdValidator, observerIdValidator } from "../utils/validation/dashboardvalidation.js";

const dashboardRouter = express.Router();

dashboardRouter.use(protect);

// ✅ الكوتش يشوف داشبورد بتاعه
dashboardRouter.get(
    "/coach",
    allowedTo("coach"),
    getCoachDashboard
);

// ✅ الأدمن يشوف الداشبورد العام
dashboardRouter.get(
    "/admin",
    allowedTo("admin"),
    adminDashboard
);

// ✅ الأدمن يشوف إحصائيات كل الكباتن مرة واحدة (بدل ريكويست لكل كوتش) — لازم قبل /admin/:coachId
dashboardRouter.get(
    "/admin/coaches-stats",
    allowedTo("admin"),
    getAllCoachesStats
);

// ✅ الأدمن يشوف داشبورد كوتش معين
dashboardRouter.get(
    "/admin/:coachId",
    allowedTo("admin"),
    coachIdValidator,
    getCoachDashboard
);

// ✅ الأوبزيرفر يشوف داشبورد بتاعه
dashboardRouter.get(
    "/observer",
    allowedTo("observer"),
    getObserverDashboard
);

// ✅ الأدمن يشوف داشبورد أوبزيرفر معين
dashboardRouter.get(
    "/admin/observer/:observerId",
    allowedTo("admin"),
    observerIdValidator,
    getObserverDashboard
);

export default dashboardRouter;
