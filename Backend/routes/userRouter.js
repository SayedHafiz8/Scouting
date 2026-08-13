/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all active coaches (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search by name
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of users
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
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 *   post:
 *     summary: Create a new coach account (admin only)
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password, passwordConfirm]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               passwordConfirm:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: User created
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
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /users/deactivated:
 *   get:
 *     summary: List deactivated (soft-deleted) users (admin only)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: List of deactivated users
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
 *                         $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /users/{id}:
 *   get:
 *     summary: Get a specific user by ID (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User found
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
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   patch:
 *     summary: Update a user's name or phone (admin only)
 *     tags: [Users]
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
 *               phoneNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               birthDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: User updated
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
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Soft-delete (deactivate) a user (admin only)
 *     tags: [Users]
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
 * /users/{id}/restore:
 *   patch:
 *     summary: Restore a deactivated user (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User restored
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
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
import express from "express";
import {
  getAll,
  create,
  getSpecific,
  deleting,
  update,
  setTeamIdToBody,
  restore,
  softDele,
  changePassword,
  uploadProfileImg,
  uploadIdCardFrontImg,
  uploadIdCardBackImg,
  getIdCardImages,
  streamIdCardSide,
  getDeactivated,
} from "../controllers/userController.js";
import upload from "../middlewares/uploadMiddleware.js";
import { requireVaultToken } from "../middlewares/vaultAccess.js";
import {
  createValidate,
  deleteValidate,
  getSpecificValidate,
  updateValidate,
  changeUserPassword,
} from "../utils/validation/userValidation.js";
import playerRouter from "./playerRouter.js";
import { allowedTo, protect } from "../controllers/authController.js";

const userRouter = express.Router({ mergeParams: true });

userRouter.use("/:id/players", playerRouter);

userRouter.get("/deactivated", protect, allowedTo("admin"), getDeactivated);

userRouter
  .route("/")
  .get(protect, allowedTo("admin"), getAll)
  .post(protect, allowedTo("admin"), createValidate, create);

userRouter
  .route("/:id")
  .get(protect, allowedTo("admin"), getSpecificValidate, getSpecific)
  .patch(protect, allowedTo("admin"), updateValidate, update)
  .delete(protect, allowedTo("admin"), deleteValidate, softDele);

userRouter.patch(
  "/:id/changePassword",
  protect,
  allowedTo("admin"),
  changeUserPassword,
  changePassword,
);

userRouter
  .route("/:id/force")
  .delete(protect, allowedTo("admin"), deleteValidate, deleting);

userRouter.route("/:id/restore").patch(protect, allowedTo("admin"), restore);

userRouter.patch(
  "/:id/profileImg",
  protect,
  allowedTo("admin"),
  upload.single("profileImg"),
  uploadProfileImg
);

userRouter.patch(
  "/:id/idCardImg/front",
  protect,
  allowedTo("admin"),
  upload.single("idCardFrontImg"),
  uploadIdCardFrontImg
);

userRouter.patch(
  "/:id/idCardImg/back",
  protect,
  allowedTo("admin"),
  upload.single("idCardBackImg"),
  uploadIdCardBackImg
);

userRouter.get(
  "/:id/idCardImg",
  protect,
  allowedTo("admin"),
  requireVaultToken,
  getIdCardImages
);

// C3 — stream the ID-card bytes through the backend (vault zone, no CDN, no URL)
userRouter.get(
  "/:id/idcard/:side",
  protect,
  allowedTo("admin"),
  requireVaultToken,
  streamIdCardSide
);

export default userRouter;
