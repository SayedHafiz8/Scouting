import PlayerMedia from "../models/playerMediaModel.js";
import User from "../models/userModel.js";
import VideoUploadCounter from "../models/videoUploadCounterModel.js";
import { bunnyConfig, getStreamVideo, deleteStreamVideo } from "../config/bunny.js";
import {
    emitCoachDashboardUpdate,
    emitObserverDashboardUpdate,
} from "../controllers/dashboardController.js";
import { ROLES } from "../constants/roles.js";

// Bunny Stream numeric status codes
// 0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished · 5 Error · 6 UploadFailed
const BUNNY_FINISHED = 4;
const BUNNY_ERROR = new Set([5, 6]);

const emitUploaderDashboard = async (uploadedBy) => {
    const uploader = await User.findById(uploadedBy).select("role");
    if (uploader?.role === ROLES.OBSERVER) emitObserverDashboardUpdate(uploadedBy);
    else emitCoachDashboardUpdate(uploadedBy);
};

// ============================================================================
// syncVideoStatus — the ONE authoritative status resolver (C2). Shared by the
// webhook (trigger only) and the reconciliation cron. It NEVER trusts a webhook
// payload: it re-fetches the video from the Bunny Stream API and derives status
// from THAT. It also enforces the F2 size/duration cap before marking ready,
// and $inc's the persistent F8 counter on a cap-violation only.
//
// Returns a small result object describing what happened (handy for tests/logs).
// ============================================================================
export const syncVideoStatus = async (bunnyVideoId) => {
    if (!bunnyVideoId) return { result: "no-id" };

    const media = await PlayerMedia.findOne({ bunnyVideoId });
    if (!media) return { result: "unknown" }; // guid we don't own — ignore
    if (media.status !== "processing") return { result: "already-settled" };

    const video = await getStreamVideo(bunnyVideoId);
    if (!video) return { result: "not-found-yet" }; // leave processing for the cron/A2

    const status = video.status;

    // ── still transcoding — nothing to do yet ──
    if (status < BUNNY_FINISHED) return { result: "still-processing" };

    // ── Bunny reported an error/upload failure ──
    if (BUNNY_ERROR.has(status)) {
        await deleteStreamVideo(bunnyVideoId).catch(() => {});
        media.status = "failed";
        media.failureReason = "transcode_failed";
        await media.save();
        await emitUploaderDashboard(media.uploadedBy);
        return { result: "failed", reason: "transcode_failed" };
    }

    // ── finished — enforce the F2 caps BEFORE marking ready ──
    const { limits } = bunnyConfig();
    const sizeBytes = video.storageSize || 0;
    const durationSec = video.length || 0;
    const overSize = sizeBytes > limits.maxVideoMB * 1024 * 1024;
    const overDuration = limits.maxVideoSeconds > 0 && durationSec > limits.maxVideoSeconds;

    if (overSize || overDuration) {
        await deleteStreamVideo(bunnyVideoId).catch(() => {});
        media.status = "failed";
        media.failureReason = overSize ? "too_large" : "too_long";
        await media.save();

        // F8: cap-violation → bump the persistent per-(player, match) counter.
        // Only when linked to a match (that's the match-day abuse scenario).
        if (media.seasonMatch) {
            await VideoUploadCounter.findOneAndUpdate(
                { player: media.player, seasonMatch: media.seasonMatch },
                { $inc: { failedVideoAttempts: 1 } },
                { upsert: true }
            );
        }

        await emitUploaderDashboard(media.uploadedBy);
        return { result: "failed", reason: media.failureReason };
    }

    // ── within limits → ready ──
    media.status = "ready";
    media.failureReason = undefined;
    await media.save();
    await emitUploaderDashboard(media.uploadedBy);
    return { result: "ready" };
};
