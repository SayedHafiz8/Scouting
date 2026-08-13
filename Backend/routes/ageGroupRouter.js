/**
 * @swagger
 * /ages:
 *   get:
 *     summary: List all age groups (public)
 *     tags: [AgeGroups]
 *     security: []
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
 *     summary: Get a specific age group by ID (public)
 *     tags: [AgeGroups]
 *     security: []
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
import express from "express";
import { create, getAll, getSpecific } from "../controllers/agesController.js";
import { getAgeValidator, createValidator, deleteValidator, updateValidator } from "../utils/validation/agesValidation.js";
import { protect, allowedTo } from "../controllers/authController.js";
import teamRouter from "./teamRouter.js";

const ageRouter = express.Router();

// Using nested routes
ageRouter.use('/:id/teams', teamRouter);

ageRouter.route('/')
            .post(protect, allowedTo("admin"), createValidator, create)
            .get(getAll)


ageRouter.route('/:id')
            .get(getSpecific)




export default ageRouter;
