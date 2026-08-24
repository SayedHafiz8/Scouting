/**
 * @swagger
 * /ages:
 *   get:
 *     summary: List all age groups (admin, coach, or observer)
 *     tags: [AgeGroups]
 *     responses:
 *       200:
 *         description: List of age groups
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AgeGroup'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 *   post:
 *     summary: Create an age group (admin only)
 *     tags: [AgeGroups]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, birthYear]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "2012"
 *               birthYear:
 *                 type: integer
 *                 example: 2012
 *     responses:
 *       201:
 *         description: Age group created
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
 *                       $ref: '#/components/schemas/AgeGroup'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /ages/{id}:
 *   get:
 *     summary: Get a specific age group by ID (admin, coach, or observer)
 *     tags: [AgeGroups]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Age group found
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
 *                       $ref: '#/components/schemas/AgeGroup'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
import express from "express";
import { create, getAll, getSpecific } from "../controllers/agesController.js";
import { getAgeValidator, createValidator, deleteValidator, updateValidator } from "../utils/validation/agesValidation.js";
import { protect, allowedTo } from "../controllers/authController.js";
import teamRouter from "./teamRouter.js";
import { ROLES } from "../constants/roles.js";

const ageRouter = express.Router();

// Using nested routes
ageRouter.use('/:id/teams', teamRouter);

// ─────────────────────────────────────────────────────────────────────────────
// TODO(AGES_UNAUTHENTICATED_READ) — **مقفول**. الدستور v1.3.0، C-3.
//
// الوضع اللي اتقفل: مسار القايمة (`getAll`) ومسار العنصر الواحد (`getSpecific`)
// كانوا عاريين — من غير `protect` ومن غير `allowedTo`. يعني:
//   1) قراءة متاحة لغير المسجّلين تماماً (البند المؤجَّل الأصلي)، و
//   2) بند C-3 التاني ("الرول الجديد MUST يُمنَع من /ages و/ages/:id صراحةً عبر
//      allowedTo") كان **غير قابل للتنفيذ** أصلاً: من غير protect مفيش req.user
//      عشان allowedTo تشتغل عليه. فالمنع المفروض دستورياً على proScout كان مكتوب
//      ومش مطبَّق.
//
// إضافة protect بتقفل الاتنين بسطر واحد. وallowedTo هنا **مش تضييق جديد** على
// الرولات القائمة (Principle III): admin/coach/observer كانوا شايفين المسارين
// وهيفضلوا شايفينهم بنفس الرد بالظبط — اللي اتغير إنهم دلوقتي لازم يكونوا مسجّلين
// دخول، وهم مسجّلين دخول في كل مسار استخدام حقيقي في الواجهة.
//
// proScout بقى 403 — وده تنفيذ لبند C-3 مش مخالفة له. الواجهة أصلاً مابتنادهاش
// للرول ده (player-list.component.ts / player-form.component.ts، فرع isProScout)،
// فمفيش أي مستهلك بيتكسر.
// ─────────────────────────────────────────────────────────────────────────────
const AGE_GROUP_READERS = [ROLES.ADMIN, ROLES.COACH, ROLES.OBSERVER];

ageRouter.route('/')
            .post(protect, allowedTo(ROLES.ADMIN), createValidator, create)
            .get(protect, allowedTo(...AGE_GROUP_READERS), getAll)


ageRouter.route('/:id')
            .get(protect, allowedTo(...AGE_GROUP_READERS), getSpecific)




export default ageRouter;
