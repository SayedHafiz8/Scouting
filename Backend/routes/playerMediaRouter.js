/**
 * @swagger
 * /players/{playerId}/media:
 *   get:
 *     summary: List all media files for a player
 *     tags: [Media]
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
 *     responses:
 *       200:
 *         description: List of media files
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
 *                         $ref: '#/components/schemas/PlayerMedia'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   post:
 *     summary: Upload a companion IMAGE for a video (coach/observer, multipart). Standalone image upload is not supported — every image must accompany a video via linkedVideo. Video uploads go directly to Bunny via POST /media/video.
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, linkedVideo]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               linkedVideo:
 *                 type: string
 *                 description: Required PlayerMedia id of the video (same player, same uploader) this photo accompanies — max 2 images per video
 *     responses:
 *       201:
 *         description: Image uploaded and stored in Bunny Storage
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
 *                       $ref: '#/components/schemas/PlayerMedia'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /players/{playerId}/media/video:
 *   post:
 *     summary: Start a video upload — mints a Bunny Stream video and returns a presigned TUS envelope. seasonMatch is no longer accepted from the client — it is auto-resolved from the player's team fixtures (a 3-day window around the match) and the caller's role.
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Required when no match auto-links (freeform mode)
 *               description:
 *                 type: string
 *                 description: Required when no match auto-links (freeform mode)
 *               fileHash:
 *                 type: string
 *                 description: SHA-256 hex digest of the video file, computed client-side before upload — used to block duplicate uploads of the same video for this player
 *     responses:
 *       201:
 *         description: Video created (processing) with a TUS upload envelope
 *       400:
 *         description: Missing title/description in freeform mode (no match qualified to auto-link), missing/invalid fileHash, or this video (by hash) was already uploaded for this player
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /players/{playerId}/media/video/{mediaId}/upload-envelope:
 *   post:
 *     summary: Re-issue a TUS upload envelope for a still-processing video (resume after an interrupted upload) — coach/observer, uploader only
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: mediaId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: New TUS upload envelope for the same Bunny Stream video
 *       400:
 *         description: The video is not awaiting upload (already ready/failed, or not a video)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{playerId}/media/upload-eligibility:
 *   get:
 *     summary: Preview the video-upload gate for this player without creating anything — lets the UI show whether upload is freeform (title/description required) or will auto-link to a match.
 *     tags: [Media]
 *     parameters:
 *       - in: path
 *         name: playerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current gate mode (same for any role — coach and observer are treated identically)
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
 *                     mode:
 *                       type: string
 *                       enum: [gated, freeform]
 *                     seasonMatch:
 *                       type: object
 *                       nullable: true
 *                       description: Present only when mode is "gated" — the match this upload will auto-link to
 *                       properties:
 *                         _id:       { type: string }
 *                         homeTeam:  { type: object }
 *                         awayTeam:  { type: object }
 *                         matchDate: { type: string, format: date-time }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *
 * /players/{playerId}/media/{id}:
 *   get:
 *     summary: Get a specific media file
 *     tags: [Media]
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
 *         description: Media file found
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
 *                       $ref: '#/components/schemas/PlayerMedia'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 *   delete:
 *     summary: Delete a media file (also removes the bytes from Bunny Stream/Storage) — admin-only
 *     tags: [Media]
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
 *
 * /players/{playerId}/media/{id}/review:
 *   patch:
 *     summary: Approve or reject a video linked to a season match (admin only) — controls whether the uploader counts as having attended that match
 *     tags: [Media]
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
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reviewStatus]
 *             properties:
 *               reviewStatus:
 *                 type: string
 *                 enum: [approved, rejected]
 *     responses:
 *       200:
 *         description: Media reviewed
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
 *                       $ref: '#/components/schemas/PlayerMedia'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *
 * /players/{playerId}/media/{id}/download:
 *   get:
 *     summary: Download the 720p MP4 for a video (admin only)
 *     tags: [Media]
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
 *         description: Video file bytes
 *         content:
 *           video/mp4:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
import express from "express";

import {
    uploadMedia,
    getAll,
    getSpecific,
    deleteMedia,
    reviewMedia,
    setPlayerToBody,
    createVideo,
    reissueEnvelope,
    downloadVideo,
    getUploadEligibility,
} from "../controllers/playerMediaController.js";
import { protect, allowedTo } from "../controllers/authController.js";
import { checkPlayerOwnership, checkMediaOwnership } from "../middlewares/ownership.js";
import { videoCreateLimiter } from "../middlewares/rateLimiters.js";
import upload from "../middlewares/uploadMiddleware.js";
import { ROLES } from "../constants/roles.js";
import {
    mediaIdValidator,
    uploadMediaValidator,
    reviewMediaValidator,
    createVideoValidator,
    getUploadEligibilityValidator,
} from "../utils/validation/playerMediaValidation.js";

const mediaRouter = express.Router({ mergeParams: true });

// ── Bunny video (direct upload) — declared before "/:id" so "video" isn't an id ──
mediaRouter
    .route("/video")
    .post(
        protect,
        allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT),
        checkPlayerOwnership,
        videoCreateLimiter,
        createVideoValidator,
        createVideo
    );

// Read-only preview of the upload gate (used by the upload form before any file is picked)
mediaRouter
    .route("/upload-eligibility")
    .get(
        protect,
        allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT),
        checkPlayerOwnership,
        getUploadEligibilityValidator,
        getUploadEligibility
    );

// F3 — re-issue a TUS envelope for a still-processing video (resume)
mediaRouter
    .route("/video/:mediaId/upload-envelope")
    .post(
        protect,
        allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT),
        checkPlayerOwnership,
        videoCreateLimiter,
        reissueEnvelope
    );

mediaRouter
    .route("/")
    .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), checkPlayerOwnership, getAll)
    .post(
        protect,
        allowedTo(ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT),
        checkPlayerOwnership,
        upload.single("file"),
        uploadMediaValidator,
        uploadMedia
    );

mediaRouter
    .route("/:id")
    .get(protect, allowedTo(ROLES.COACH, ROLES.ADMIN, ROLES.OBSERVER, ROLES.PRO_SCOUT), mediaIdValidator, checkMediaOwnership, getSpecific)
    // Delete is admin-only — coaches/observers can upload but not remove media (F5/F7d restriction)
    .delete(protect, allowedTo(ROLES.ADMIN), mediaIdValidator, checkMediaOwnership, deleteMedia);

// Download the 720p MP4 (backend-proxied attachment — F7d) — admin-only
mediaRouter
    .route("/:id/download")
    .get(protect, allowedTo(ROLES.ADMIN), mediaIdValidator, checkMediaOwnership, downloadVideo);

mediaRouter
    .route("/:id/review")
    .patch(protect, allowedTo(ROLES.ADMIN), reviewMediaValidator, reviewMedia);

export default mediaRouter;
