import { body, param } from "express-validator";
import mongoose from "mongoose";
import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import PlayerMedia from "../../models/playerMediaModel.js";
import { resolveVideoUploadGate } from "../../services/mediaMatchGate.js";

const MAX_LINKED_IMAGES_PER_VIDEO = 2;


// ============================
// Upload Media Validator
// ============================

export const uploadMediaValidator = [
    // Player ID
    param("playerId")
        .notEmpty()
        .withMessage("Player ID is required")
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage("Invalid Player ID"),

    // Title
    body("title")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Title must not exceed 100 characters"),

    // Description
    body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description must not exceed 500 characters"),

    // الصورة لازم ترفع مع فيديو في نفس العملية (مفيش رفع صورة منفردة) — لازم الفيديو يكون فعلاً
    // فيديو، ملك لنفس اللاعب ونفس الرافع. الفيديو هو اللي بيحمل الربط بالمباراة، مش الصورة.
    body("linkedVideo")
        .notEmpty()
        .withMessage("linkedVideo is required — images must be uploaded alongside a video")
        .isMongoId()
        .withMessage("Invalid linkedVideo id")
        .custom(async (val, { req }) => {
            if (req.file && req.file.mimetype.startsWith("video")) {
                throw new Error("linkedVideo only applies to image uploads");
            }
            const video = await PlayerMedia.findById(val);
            if (!video || video.type !== "video") {
                throw new Error(`No video for this linkedVideo id: ${val}`);
            }
            if (
                video.player.toString() !== req.params.playerId ||
                video.uploadedBy.toString() !== req.user._id.toString()
            ) {
                throw new Error("linkedVideo must belong to the same player and uploader");
            }
            const linkedCount = await PlayerMedia.countDocuments({ linkedVideo: val });
            if (linkedCount >= MAX_LINKED_IMAGES_PER_VIDEO) {
                throw new Error(`A video can have at most ${MAX_LINKED_IMAGES_PER_VIDEO} linked images`);
            }
            return true;
        }),

    // File validation
    body().custom((_, { req }) => {
        if (!req.file) {
            throw new Error(
                "Media file is required"
            );
        }
        const allowedTypes = [
            "video/mp4",
            "image/jpeg",
            "image/png",
            "image/webp"
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            throw new Error(
                "Unsupported file type"
            );
        }
        return true;

    }),



    validatorMiddleware

];

// ============================
// Create Video Validator (Bunny direct-upload — no file in the request body)
// ============================

export const createVideoValidator = [
    param("playerId")
        .notEmpty()
        .withMessage("Player ID is required")
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage("Invalid Player ID"),

    body("title")
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage("Title must not exceed 100 characters"),

    body("description")
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage("Description must not exceed 500 characters"),

    // SHA-256 hex digest للفيديو، محسوب من المتصفح قبل الرفع — لازم عشان نكشف تكرار نفس الفيديو
    body("fileHash")
        .trim()
        .notEmpty().withMessage("fileHash is required")
        .matches(/^[a-f0-9]{64}$/i).withMessage("fileHash must be a 64-character SHA-256 hex digest"),

    // مفيش seasonMatch من العميل بقى — بيتحدد تلقائي حسب فريق اللاعب وتاريخ النهاردة (mediaMatchGate).
    // النتيجة بتتخزن على req.mediaGate عشان الـcontroller يستخدمها من غير ما يعيد الاستعلام.
    body().custom(async (_, { req }) => {
        const gate = await resolveVideoUploadGate(req.params.playerId, req.user.role, req.user._id);
        req.mediaGate = gate;

        if (gate.mode === "freeform") {
            const title = (req.body.title || "").trim();
            const description = (req.body.description || "").trim();
            if (!title || !description) {
                throw new Error("Video title and description are required when no match is linked");
            }
        }
        return true;
    }),

    // كشف تكرار رفع نفس الفيديو لنفس اللاعب — بيتجاهل فيديو processing لنفس الرافع
    // (ده بيسيب مسار إعادة الرفع لنفس اليوزر شغال زي ما هو عن طريق منطق in-flight في createVideo)
    body().custom(async (_, { req }) => {
        const duplicate = await PlayerMedia.findOne({
            player: req.params.playerId,
            type: "video",
            fileHash: req.body.fileHash,
            $or: [
                { status: "ready" },
                { status: "processing", uploadedBy: { $ne: req.user._id } },
            ],
        });
        if (duplicate) {
            throw new Error("This video has already been uploaded for this player");
        }
        return true;
    }),

    validatorMiddleware,
];

// ============================
// Upload Eligibility Validator (GET .../upload-eligibility)
// ============================

export const getUploadEligibilityValidator = [
    param("playerId")
        .notEmpty()
        .withMessage("Player ID is required")
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage("Invalid Player ID"),

    validatorMiddleware,
];

// ============================
// Get / Delete Media Validator
// ============================

export const mediaIdValidator = [

    param("id")
        .notEmpty()
        .withMessage("Media ID is required")
        .custom((value) =>
            mongoose.Types.ObjectId.isValid(value)
        )
        .withMessage("Invalid Media ID"),

    validatorMiddleware

];

// ============================
// Review Media Validator (admin — approve/reject a video linked to a season match)
// ============================

export const reviewMediaValidator = [

    param("id")
        .notEmpty()
        .withMessage("Media ID is required")
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage("Invalid Media ID"),

    body("reviewStatus")
        .notEmpty()
        .withMessage("reviewStatus is required")
        .isIn(["approved", "rejected"])
        .withMessage("reviewStatus must be either 'approved' or 'rejected'"),

    // أسباب الرفض مطلوبة (مصفوفة، سبب واحد على الأقل) بس لما reviewStatus يبقى "rejected"
    body("rejectionReason").custom((value, { req }) => {
        if (req.body.reviewStatus === "rejected") {
            const allowed = ["unclear_footage", "scout_name_missing", "match_date_missing", "teams_not_specified"];
            if (!Array.isArray(value) || value.length === 0 || !value.every((r) => allowed.includes(r))) {
                throw new Error(`rejectionReason must be a non-empty array of: ${allowed.join(", ")}`);
            }
        }
        return true;
    }),

    validatorMiddleware

];