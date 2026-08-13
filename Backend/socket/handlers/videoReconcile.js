import cron from "node-cron";

import PlayerMedia from "../../models/playerMediaModel.js";
import { syncVideoStatus } from "../../services/videoSync.js";

// ============================================================================
// C2 — reconciliation. Recovers any video whose Bunny webhook was lost
// (deploy/restart/network) so nothing sits in "processing" forever. Re-derives
// the real status via the Bunny API through the shared syncVideoStatus.
//
// The webhook can't reach a local dev server at all (Bunny is external and has
// no route to localhost), so THIS cron is the only thing that ever resolves
// "processing" in local development. Both knobs are env-overridable so local
// testing isn't stuck waiting out the production-tuned defaults.
// ============================================================================
const STUCK_MINUTES = Number(process.env.VIDEO_RECONCILE_STUCK_MINUTES) || 10;
const CRON_SCHEDULE = process.env.VIDEO_RECONCILE_CRON || "*/5 * * * *";

export const reconcileProcessingVideos = async () => {
    const cutoff = new Date(Date.now() - STUCK_MINUTES * 60 * 1000);
    const stuck = await PlayerMedia.find({
        type: "video",
        status: "processing",
        updatedAt: { $lte: cutoff },
    }).select("bunnyVideoId");

    let synced = 0;
    for (const m of stuck) {
        try {
            await syncVideoStatus(m.bunnyVideoId);
            synced++;
        } catch (err) {
            console.error(`Reconcile failed for ${m.bunnyVideoId}:`, err.message);
        }
    }
    return synced;
};

export const startVideoReconcile = () => {
    cron.schedule(CRON_SCHEDULE, async () => {
        try {
            const n = await reconcileProcessingVideos();
            if (n > 0) console.log(`🔄 Reconciled ${n} processing video(s)`);
        } catch (err) {
            console.error("Video reconcile job error:", err.message);
        }
    });
    console.log(`✅ Video reconcile job scheduled ("${CRON_SCHEDULE}", stuck threshold ${STUCK_MINUTES}min)`);
};
