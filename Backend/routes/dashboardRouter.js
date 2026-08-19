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
 *
 * /dashboard/observer:
 *   get:
 *     summary: Get the logged-in observer's dashboard statistics
 *     tags: [Dashboard]
 *     responses:
 *       200:
 *         description: Observer dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/ObserverDashboard'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /dashboard/admin/observer/{observerId}:
 *   get:
 *     summary: Get dashboard statistics for a specific observer (admin only)
 *     tags: [Dashboard]
 *     parameters:
 *       - in: path
 *         name: observerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Observer dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/ObserverDashboard'
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
import { ROLES } from "../constants/roles.js";

const dashboardRouter = express.Router();

dashboardRouter.use(protect);

// ✅ الكوتش يشوف داشبورد بتاعه
dashboardRouter.get(
    "/coach",
    allowedTo(ROLES.COACH),
    getCoachDashboard
);

// ✅ الأدمن يشوف الداشبورد العام
dashboardRouter.get(
    "/admin",
    allowedTo(ROLES.ADMIN),
    adminDashboard
);

// ✅ الأدمن يشوف إحصائيات كل الكباتن مرة واحدة (بدل ريكويست لكل كوتش) — لازم قبل /admin/:coachId
dashboardRouter.get(
    "/admin/coaches-stats",
    allowedTo(ROLES.ADMIN),
    getAllCoachesStats
);

// ✅ الأدمن يشوف داشبورد كوتش معين
dashboardRouter.get(
    "/admin/:coachId",
    allowedTo(ROLES.ADMIN),
    coachIdValidator,
    getCoachDashboard
);

// ✅ الأوبزيرفر يشوف داشبورد بتاعه
dashboardRouter.get(
    "/observer",
    allowedTo(ROLES.OBSERVER),
    getObserverDashboard
);

// ✅ الأدمن يشوف داشبورد أوبزيرفر معين
dashboardRouter.get(
    "/admin/observer/:observerId",
    allowedTo(ROLES.ADMIN),
    observerIdValidator,
    getObserverDashboard
);

export default dashboardRouter;
