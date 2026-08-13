import mongoose from "mongoose";

// ============================================================================
// F8-store — persistent, monotonic per-(player, seasonMatch) counter of
// CAP-VIOLATION video uploads (oversize/over-duration rejected by F2).
//
// Why a dedicated collection: we have no player↔match junction doc — (player,
// seasonMatch) is just two fields on PlayerMedia. Counting status:"failed" docs
// would self-reset (A2/retention delete them), so the lockout would silently
// release. This counter is NEVER decremented and NEVER touched by the media
// crons — that's the whole point. Match-scoped ⇒ a new match starts at 0.
// ============================================================================
const videoUploadCounterSchema = new mongoose.Schema(
    {
        player: {
            type: mongoose.Schema.ObjectId,
            ref: "Player",
            required: true,
        },
        seasonMatch: {
            type: mongoose.Schema.ObjectId,
            ref: "SeasonMatch",
            required: true,
        },
        // بيزيد بس لما فيديو يتخالف سقف الحجم/المدة (F2). مبيزيدش مع الرفع المقطوع.
        failedVideoAttempts: {
            type: Number,
            default: 0,
        },
    },
    { timestamps: true }
);

videoUploadCounterSchema.index({ player: 1, seasonMatch: 1 }, { unique: true });

const VideoUploadCounter = mongoose.model(
    "VideoUploadCounter",
    videoUploadCounterSchema
);

export default VideoUploadCounter;
