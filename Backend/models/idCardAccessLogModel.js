import mongoose from "mongoose";

// ============================================================================
// F7c — audit trail for national ID-card reads (C3). One row per successful
// stream of an ID-card side through the vault-gated endpoint. Kept as its own
// collection (not the app logger) so "who viewed this person's ID, when" is
// queryable and retained.
// ============================================================================
const idCardAccessLogSchema = new mongoose.Schema(
    {
        viewer: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
            required: true,
        },
        targetUser: {
            type: mongoose.Schema.ObjectId,
            ref: "User",
            required: true,
        },
        side: {
            type: String,
            enum: ["front", "back"],
            required: true,
        },
        ip: { type: String },
        userAgent: { type: String },
    },
    { timestamps: true }
);

// "مين بصّ على بطاقة الشخص ده" — مرتّب بالأحدث
idCardAccessLogSchema.index({ targetUser: 1, createdAt: -1 });

const IdCardAccessLog = mongoose.model("IdCardAccessLog", idCardAccessLogSchema);

export default IdCardAccessLog;
