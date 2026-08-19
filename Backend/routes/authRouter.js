/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
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
 *                     accessToken:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/logout:
 *   post:
 *     summary: Logout and clear refresh token cookie
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/refreshToken:
 *   post:
 *     summary: Obtain a new access token using the refresh token cookie
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
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
 *                     accessToken:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/forgotPassword:
 *   post:
 *     summary: Send a password reset code to the user's email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset code sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /auth/verifyResetCode:
 *   post:
 *     summary: Verify the 6-digit reset code from email
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resetCode]
 *             properties:
 *               resetCode:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Code verified
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *
 * /auth/resetPassword:
 *   put:
 *     summary: Reset password after successful code verification
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, newPassword]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset — new access token returned
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
 *                     accessToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /auth/changeMyPassword:
 *   patch:
 *     summary: Change current user's password (requires old password)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, password, confirmPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               password:
 *                 type: string
 *               confirmPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed — new access token returned
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
 *                     accessToken:
 *                       type: string
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/updateLoggedUser:
 *   patch:
 *     summary: Update current user's profile (name, phone)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
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
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *
 * /auth/vaultPassword/verify:
 *   post:
 *     summary: Re-verify the admin's own login password to obtain a short-lived vault token (admin only)
 *     description: >
 *       The vault token (15 minutes) is required as the X-Vault-Token header on
 *       ID-card endpoints (C3). Repeated wrong passwords lock the vault
 *       temporarily via vaultFailedAttempts/vaultLockedUntil on the user document.
 *     tags: [Auth]
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
 *         description: Vault token issued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: success }
 *                 data:
 *                   type: object
 *                   properties:
 *                     vaultToken: { type: string }
 *                     expiresIn: { type: integer, description: Seconds until the token expires }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401:
 *         description: Incorrect password
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       423:
 *         description: Too many failed attempts — temporarily locked
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *
 * /auth/setup-admin:
 *   post:
 *     summary: One-time bootstrap — promote an existing account to admin (no auth required, gated by a setup key)
 *     description: >
 *       Refuses if any admin account already exists (active or deactivated) or
 *       if the setup key doesn't match ADMIN_SETUP_KEY. Intended for initial
 *       deployment only — the normal path is the seedAdmin() bootstrap in
 *       server.js using ADMIN_* env vars.
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, setupKey]
 *             properties:
 *               email:    { type: string, format: email, description: Email of an existing account to promote }
 *               setupKey: { type: string }
 *     responses:
 *       200:
 *         description: Admin setup complete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:  { type: string, example: success }
 *                 message: { type: string }
 *                 data:
 *                   type: object
 *                   properties:
 *                     user: { $ref: '#/components/schemas/User' }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       403:
 *         description: Invalid setup key, or an admin already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
import express from "express";
import { allowedTo, changeLoggedUserPass, forgotPassword, login, logout, protect, refreshToken, resetPassword, setupAdmin, signup, updateLoggedUser, verifyResetPassword, verifyVaultPassword } from "../controllers/authController.js";
import { singupValidate, loginValidate, updateLoggedUserVal, verifyVaultPasswordValidate, forgotPasswordValidate, verifyResetCodeValidate, resetPasswordValidate, setupAdminValidate } from "../utils/validation/authValidation.js";
import { changeUserPassword } from "../utils/validation/userValidation.js";
import { ROLES } from "../constants/roles.js";


const authRouter = express.Router({mergeParams: true});

// Signup disabled — coaches are created by admins only


authRouter.route('/login')
            .post(loginValidate, login);


authRouter.route('/forgotPassword')
            .post(forgotPasswordValidate, forgotPassword);

authRouter.post('/logout', logout);
authRouter.post('/refreshToken', refreshToken);

authRouter.route('/verifyResetCode')
            .post(verifyResetCodeValidate, verifyResetPassword);


authRouter.route('/resetPassword')
            .put(resetPasswordValidate, resetPassword);


authRouter.route('/changeMyPassword')
            .patch(protect, changeUserPassword, changeLoggedUserPass);

authRouter.route('/updateLoggedUser')
            .patch(protect, updateLoggedUserVal, updateLoggedUser);

authRouter.route('/vaultPassword/verify')
            .post(protect, allowedTo(ROLES.ADMIN), verifyVaultPasswordValidate, verifyVaultPassword);

authRouter.post('/setup-admin', setupAdminValidate, setupAdmin);

export default authRouter;
