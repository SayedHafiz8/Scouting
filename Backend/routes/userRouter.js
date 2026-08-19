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
 *
 * /users/{id}/changePassword:
 *   patch:
 *     summary: Change a user's password (admin only)
 *     tags: [Users]
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
 *             required: [password]
 *             properties:
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: Password changed
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/force:
 *   delete:
 *     summary: Permanently delete a (previously deactivated) user (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User permanently deleted
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/profileImg:
 *   patch:
 *     summary: Upload/replace a user's profile image (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [profileImg]
 *             properties:
 *               profileImg: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Profile image updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     document: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/idCardImg/front:
 *   patch:
 *     summary: Upload/replace the front side of a user's national ID card (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [idCardFrontImg]
 *             properties:
 *               idCardFrontImg: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Front ID-card image uploaded (no URL/path is ever returned — C3)
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/idCardImg/back:
 *   patch:
 *     summary: Upload/replace the back side of a user's national ID card (admin only)
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [idCardBackImg]
 *             properties:
 *               idCardBackImg: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Back ID-card image uploaded (no URL/path is ever returned — C3)
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/idCardImg:
 *   get:
 *     summary: Report which ID-card sides exist (admin + vault token — never returns a URL or path, C3)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *         vaultToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Presence flags for each ID-card side
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     front: { type: boolean }
 *                     back: { type: boolean }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *
 * /users/{id}/idcard/{side}:
 *   get:
 *     summary: Stream a national ID-card side's raw bytes through the backend (admin + vault token — vault Storage zone has no CDN, no URL is ever exposed, C3)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *         vaultToken: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: side
 *         required: true
 *         schema: { type: string, enum: [front, back] }
 *     responses:
 *       200:
 *         description: Raw image bytes (Cache-Control - no-store, access is audit-logged)
 *         content:
 *           image/*:
 *             schema: { type: string, format: binary }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
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
import { ROLES } from "../constants/roles.js";

const userRouter = express.Router({ mergeParams: true });

// mount متداخل — نفس عمليات /players الموثّقة في playerRouter.js، مطبّقة هنا تحت
// /users/:id/players. مش موثّق بكتلة @swagger منفصلة لأن الشكل مطابق تماماً
// (نفس نمط /ages/:id/teams في ageGroupRouter.js).
userRouter.use("/:id/players", playerRouter);

userRouter.get("/deactivated", protect, allowedTo(ROLES.ADMIN), getDeactivated);

userRouter
  .route("/")
  .get(protect, allowedTo(ROLES.ADMIN), getAll)
  .post(protect, allowedTo(ROLES.ADMIN), createValidate, create);

userRouter
  .route("/:id")
  .get(protect, allowedTo(ROLES.ADMIN), getSpecificValidate, getSpecific)
  .patch(protect, allowedTo(ROLES.ADMIN), updateValidate, update)
  .delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, softDele);

userRouter.patch(
  "/:id/changePassword",
  protect,
  allowedTo(ROLES.ADMIN),
  changeUserPassword,
  changePassword,
);

userRouter
  .route("/:id/force")
  .delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, deleting);

userRouter.route("/:id/restore").patch(protect, allowedTo(ROLES.ADMIN), restore);

userRouter.patch(
  "/:id/profileImg",
  protect,
  allowedTo(ROLES.ADMIN),
  upload.single("profileImg"),
  uploadProfileImg
);

userRouter.patch(
  "/:id/idCardImg/front",
  protect,
  allowedTo(ROLES.ADMIN),
  upload.single("idCardFrontImg"),
  uploadIdCardFrontImg
);

userRouter.patch(
  "/:id/idCardImg/back",
  protect,
  allowedTo(ROLES.ADMIN),
  upload.single("idCardBackImg"),
  uploadIdCardBackImg
);

userRouter.get(
  "/:id/idCardImg",
  protect,
  allowedTo(ROLES.ADMIN),
  requireVaultToken,
  getIdCardImages
);

// C3 — stream the ID-card bytes through the backend (vault zone, no CDN, no URL)
userRouter.get(
  "/:id/idcard/:side",
  protect,
  allowedTo(ROLES.ADMIN),
  requireVaultToken,
  streamIdCardSide
);

export default userRouter;
