import asyncHandler from "express-async-handler";
import sharp from "sharp";
import fs from "fs";
import crypto from "crypto";

import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import User from "../models/userModel.js";
import VideoUploadCounter from "../models/videoUploadCounterModel.js";
import { bunnyConfig, createStreamVideo, deleteStreamVideo } from "../config/bunny.js";
import AppError from "../utils/appError.js";
import ApiFeature from "../utils/apiFeatures.js";
import { ROLES } from "../constants/roles.js";
import {
    tusUploadEnvelope,
    streamHlsUrl,
    streamEmbedUrl,
    streamMp4Url,
    streamThumbnailUrl,
    signMediaUrl,
} from "../utils/mediaUrl.js";
import {
    buildKey,
    uploadMediaImage,
    deleteMediaImage,
} from "../services/imageStorage.js";
import { syncVideoStatus } from "../services/videoSync.js";
import { emitCoachDashboardUpdate, emitObserverDashboardUpdate } from "./dashboardController.js";
import { sendNotificationToUser } from "../socket/handlers/notification.js";
import Player from "../models/playedModel.js";
import { resolveVideoUploadGate } from "../services/mediaMatchGate.js";

// ============================
// Read-path decoration — never trust the stored `url`; generate a signed URL on
// read (§7). Videos → Bunny Stream token URLs; images → media-zone token URL
// (or legacy Cloudinary passthrough). Internal storage keys are stripped.
//
// Frontend audit fix S1 — video playback (`url`/`embedUrl`/`download`) is
// admin-only by product decision (bandwidth control). That was previously
// enforced only in the Angular template (media-gallery, my-matches,
// age-group-detail all gate on auth.isAdmin() before rendering a play
// affordance) while the API signed and shipped the playable URLs to every
// role regardless — a coach or observer could read them straight out of the
// Network tab. `url` is not a lesser leak than `embedUrl`: streamHlsUrl()
// returns a directly playable signed HLS manifest (3h TTL), not just an
// iframe embed. Both are now withheld for anyone but the admin; `thumbnail`
// stays for everyone (the grid card needs it) and image URLs are untouched
// (images were never gated in the UI).
export const decorateMedia = (mediaDoc, viewerRole) => {
    const obj = typeof mediaDoc.toObject === "function" ? mediaDoc.toObject() : { ...mediaDoc };

    // player may be a raw id or a populated doc (season-match detail)
    const playerId = obj.player && obj.player._id ? obj.player._id : obj.player;

    if (obj.type === "video") {
        if (obj.status === "ready" && obj.bunnyVideoId) {
            obj.thumbnail = streamThumbnailUrl(obj.bunnyVideoId);
            if (viewerRole === ROLES.ADMIN) {
                obj.url = streamHlsUrl(obj.bunnyVideoId);
                obj.embedUrl = streamEmbedUrl(obj.bunnyVideoId);
                obj.download = `/api/v1/players/${playerId}/media/${obj._id}/download`;
            } else {
                obj.url = null;
            }
        } else {
            // processing / failed → no playable URL yet
            obj.url = null;
        }
    } else if (obj.storage === "bunny" && obj.storageKey) {
        obj.url = signMediaUrl(obj.storageKey);
    }
    // legacy Cloudinary docs keep their stored `url` as-is

    delete obj.storageKey;
    delete obj.publicId;
    delete obj.bunnyVideoId;
    return obj;
};


const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

// ============================
// compress image → buffer (for Bunny Storage PUT)
// ============================
const compressImageToBuffer = async (inputPath) =>
    sharp(inputPath)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

export const setPlayerToBody = (req, res, next) => {
    req.body.player = req.params.playerId;
    next();
};

// @desc  Upload a scouting IMAGE (multipart). Video no longer goes through here —
//        it uploads directly to Bunny via POST /media/video (VPS-free).
export const uploadMedia = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("يجب رفع صورة صحيحة (jpg / png / webp)", 400));
    }
    // الفيديو دلوقتي بيترفع مباشرة على Bunny — مش عن طريق السيرفر
    if (req.file.mimetype.startsWith("video")) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(
            new AppError("رفع الفيديو بقى مباشر — استخدم زر رفع الفيديو", 400)
        );
    }
    if (!allowedImageTypes.includes(req.file.mimetype)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("نوع الملف غير مسموح (jpg, png, webp فقط)", 400));
    }
    if (req.file.size > MAX_IMAGE_SIZE) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("حجم الصورة كبير جداً الحد 10MB", 400));
    }

    try {
        const buffer = await compressImageToBuffer(req.file.path);
        const key = buildKey("player-media", "webp");
        await uploadMediaImage(buffer, key, "image/webp");

        const media = await PlayerMedia.create({
            player: req.params.playerId,
            uploadedBy: req.user._id,
            type: "image",
            storage: "bunny",
            storageKey: key,
            status: "ready",
            title: req.body.title,
            description: req.body.description,
            // الصورة نفسها مبتترابطش بماتش/مراجعة — الربط ده بيحصل على الفيديو اللي هي مرفقة بيه بس
            seasonMatch: null,
            reviewStatus: null,
            linkedVideo: req.body.linkedVideo,
        });

        // عدد الميديا فى الداشبورد بتاع الرافع (كوتش أو أوبزيرفر) بيتحدث لايف
        if (req.user.role === ROLES.OBSERVER) {
            emitObserverDashboardUpdate(req.user._id);
        } else {
            emitCoachDashboardUpdate(req.user._id);
        }

        res.status(201).json({
            status: "success",
            data: { document: decorateMedia(media, req.user.role) },
        });
    } finally {
        await fs.promises.unlink(req.file.path).catch(() => {});
    }
});

// audit-database I2 — وايت ليست الترتيب. createdAt هو الوحيد اللي الفرونت بيبعته
// (media-gallery.component.ts: sort: "-createdAt")، ومغطّى بـplayer_1_createdAt_-1
// (القايمة دايماً مسكوبة على لاعب واحد فالـprefix موجود) وبـcreatedAt_1.
// قبل الإصلاح ?sort=title كان COLLSCAN بيفحص 50,000 مستند لـ50.
const MEDIA_SORT_FIELDS = ["createdAt"];

// @desc    List media for a player — coach & observer see only what THEY uploaded; admin sees all
export const getAll = asyncHandler(async (req, res, next) => {
    const baseFilter = { player: req.params.playerId };
    if (req.user.role !== ROLES.ADMIN) {
        baseFilter.uploadedBy = req.user._id;
    }

    // §11 — البحث في title/description اتشال: مفيش مستهلك في الفرونت، وdescription
    // نص طويل مالوش معنى في الـprefix. (نفس قرار notes في التقارير.)
    const features = new ApiFeature(PlayerMedia.find(baseFilter), req.query, req.params, req.user);

    // perf audit — العدّ والجلب مستقلين، فبيتنفذوا مع بعض. نفس الفلتر للاتنين.
    const countFilter = features.query.getFilter();
    features.sort(MEDIA_SORT_FIELDS).limitFields().applyPagination();

    const [documentCount, documents] = await Promise.all([
        PlayerMedia.countDocuments(countFilter),
        features.query,
    ]);
    features.buildPagination(documentCount);

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents: documents.map((d) => decorateMedia(d, req.user.role)) },
    });
});

// @desc    Get one media item — hand-written so the URL is signed on read (§7)
export const getSpecific = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id);
    if (!media) {
        return next(new AppError(`No document for this Id '${req.params.id}'`, 404));
    }
    res.status(200).json({
        status: "success",
        data: { document: decorateMedia(media, req.user.role) },
    });
});

// @desc    Admin approves/rejects a video linked to a season match — controls whether the
//          uploader counts as having attended that match
export const reviewMedia = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id);
    if (!media) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }
    if (!media.seasonMatch) {
        return next(new AppError("This media isn't linked to a season match and has nothing to review", 400));
    }

    media.reviewStatus = req.body.reviewStatus;
    media.rejectionReason = req.body.reviewStatus === "rejected" ? req.body.rejectionReason : [];
    await media.save();

    if (req.body.reviewStatus === "approved") {
        await SeasonMatch.updateOne(
            { _id: media.seasonMatch, attendees: { $ne: media.uploadedBy } },
            { $push: { attendees: media.uploadedBy } }
        );
    } else {
        // مرفوض — الرافع مايتحسبش حاضر للمباراة دي (إلا لو الأدمن ضايفه يدوي بره الفيديو ده)
        await SeasonMatch.updateOne(
            { _id: media.seasonMatch },
            { $pull: { attendees: media.uploadedBy } }
        );
    }

    // عشان "عدد المباريات الى تم حضورها" في الداش بورد يتحدث لحظيًا من غير ما اليوزر يعمل ريفريش
    const uploader = await User.findById(media.uploadedBy).select("role");
    if (uploader?.role === ROLES.OBSERVER) {
        emitObserverDashboardUpdate(media.uploadedBy);
    } else {
        emitCoachDashboardUpdate(media.uploadedBy);
    }

    // النوتيفيكيشن بترسل بس لما الأدمن يرفض — تبلّغ الرافع إن الماتش ماتحسبش حضور والسبب
    if (req.body.reviewStatus === "rejected") {
        const player = await Player.findById(media.player).select("name");
        sendNotificationToUser(media.uploadedBy.toString(), {
            type: "MEDIA_REJECTED",
            playerId: media.player.toString(),
            playerName: player?.name,
            mediaId: media._id.toString(),
            reasonCodes: media.rejectionReason,
            createdAt: new Date(),
        });
    }

    res.status(200).json({
        status: "success",
        data: { document: media },
    });
});

// حذف بايتات الميديا من مصدر تخزينها (Bunny Stream / Bunny Storage / legacy Cloudinary).
// ملحوظة: مابتلمسش الـvault zone عن قصد — الزون ده فيه صور البطاقات الوطنية
// بتاعة الـUsers بس، وتنظيفه في services/userDeletion.js. مفيش PlayerMedia
// بيتخزّن هناك أبداً.
//
// best-effort افتراضياً — بنسجّل الفشل (تكلفة + GDPR erasure) بس مبنوقفش الحذف
// من الداتابيز. المستدعيين: حذف ميديا يدوي، وحذف لاعب.
//
// strict: true بيخلّيها ترمي بدل ما تبلع — نفس نمط deleteMediaImage/
// deleteVaultImage في services/imageStorage.js. بيتستخدم في كرون الـretention
// (§11) اللي محتاج يعرف إن الحذف فشل عشان يسيب الدوكيومنت مكانه بدل ما يمسحه
// ويسيب البايتات على Bunny من غير أي مفتاح يوصّلنا ليها.
export const deleteMediaBytes = async (media, { strict = false } = {}) => {
    try {
        if (media.type === "video" && media.bunnyVideoId) {
            await deleteStreamVideo(media.bunnyVideoId);
        } else if (media.storageKey) {
            // F5: delete + purge the edge handled inside deleteMediaImage
            await deleteMediaImage(media.storageKey, { strict });
        }
    } catch (err) {
        if (strict) throw err;
        console.error(`Failed to delete media bytes for ${media._id}:`, err.message);
    }
};

export const deleteMedia = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id);

    if (!media) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }

    // حذف الفيديو بيسحب معاه الصور المرتبطة بيه (رفعوا مع بعض) — عكسها مش بيحصل لو اتحذفت صورة واحدة بس
    if (media.type === "video") {
        const linkedImages = await PlayerMedia.find({ linkedVideo: media._id });
        for (const image of linkedImages) {
            await deleteMediaBytes(image);
            await image.deleteOne();
        }
    }

    await deleteMediaBytes(media);
    await media.deleteOne();

    res.status(204).json({
        status: "success",
    });
});

// ============================
// Video pipeline — direct browser→Bunny upload (VPS never sees the bytes)
// ============================

// @desc  Start a video upload: mint a Bunny Stream video + return a presigned TUS envelope
// @route POST /players/:playerId/media/video
export const createVideo = asyncHandler(async (req, res, next) => {
    const playerId = req.params.playerId;
    // req.mediaGate اتحط في createVideoValidator (mediaMatchGate) — بيحدد لو الرفع مسموح
    // دلوقتي وهل بيترابط بماتش تلقائي أو لأ
    const seasonMatch = req.mediaGate.mode === "gated" ? req.mediaGate.seasonMatch : null;
    const { limits } = bunnyConfig();

    // A1/F6 — one in-flight (processing) video per (player, seasonMatch) for this uploader.
    // If one exists, re-issue its envelope instead of minting a second Bunny video.
    const inFlight = await PlayerMedia.findOne({
        player: playerId,
        seasonMatch,
        type: "video",
        status: "processing",
        uploadedBy: req.user._id,
    });
    if (inFlight) {
        return res.status(200).json({
            status: "success",
            data: {
                document: decorateMedia(inFlight, req.user.role),
                upload: tusUploadEnvelope(inFlight.bunnyVideoId, { mediaId: inFlight._id }),
            },
        });
    }

    // F8 — ready-count cap (live count; deleting a clip frees a slot)
    const readyCount = await PlayerMedia.countDocuments({
        player: playerId,
        seasonMatch,
        type: "video",
        status: "ready",
    });
    if (readyCount >= limits.maxVideosPerPlayerMatch) {
        return next(
            new AppError("لقد وصلت للحد الأقصى لعدد الفيديوهات لهذه المباراة", 400)
        );
    }

    // F8 — failed-attempt lockout (persistent counter, per match)
    if (seasonMatch) {
        const counter = await VideoUploadCounter.findOne({ player: playerId, seasonMatch });
        if (counter && counter.failedVideoAttempts >= limits.maxFailedAttemptsPerPlayerMatch) {
            return next(
                new AppError(
                    "تم إيقاف رفع الفيديو لهذه المباراة بسبب تكرار رفع ملفات أكبر من الحد المسموح",
                    400
                )
            );
        }
    }

    const bunnyVideo = await createStreamVideo(req.body.title);
    const media = await PlayerMedia.create({
        player: playerId,
        uploadedBy: req.user._id,
        type: "video",
        storage: "bunny",
        bunnyVideoId: bunnyVideo.guid,
        status: "processing",
        title: req.body.title,
        description: req.body.description,
        seasonMatch,
        fileHash: req.body.fileHash,
        // الفيديو المربوط بمباراة بيستنى موافقة الأدمن — نفس قاعدة النظام القديم
        reviewStatus: seasonMatch ? "pending" : null,
    });

    res.status(201).json({
        status: "success",
        data: {
            document: decorateMedia(media, req.user.role),
            upload: tusUploadEnvelope(bunnyVideo.guid, { mediaId: media._id }),
        },
    });
});

// @desc  Read-only preview of createVideo's gate — lets the upload form know upfront
//        whether upload is freeform or will auto-link to a match
// @route GET /players/:playerId/media/upload-eligibility
export const getUploadEligibility = asyncHandler(async (req, res, next) => {
    const gate = await resolveVideoUploadGate(req.params.playerId, req.user.role, req.user._id);

    if (gate.mode !== "gated") {
        return res.status(200).json({ status: "success", data: { mode: gate.mode } });
    }

    // نفس الـpopulate اللي بيحصل تلقائي على SeasonMatch.find، بس هنا بنجيبه بنفسنا لأننا
    // مسكناه بـ .setOptions({skipPopulate:true}) جوه resolveVideoUploadGate
    const seasonMatch = await SeasonMatch.findById(gate.seasonMatch);

    res.status(200).json({
        status: "success",
        data: { mode: "gated", seasonMatch },
    });
});

// @desc  Re-issue a fresh TUS envelope for a still-processing video (F3 resume)
// @route POST /players/:playerId/media/video/:mediaId/upload-envelope
export const reissueEnvelope = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.mediaId);

    if (!media || media.player.toString() !== req.params.playerId) {
        return next(new AppError(`No document for this Id: ${req.params.mediaId}`, 404));
    }
    // ملكية الرافع (الأدمن مش بيرفع فيديوهات)
    if (media.uploadedBy.toString() !== req.user._id.toString()) {
        return next(new AppError("You are not allowed to access this media", 403));
    }
    // F3-guard: envelope جديد بس لفيديو لسه processing — مش overwrite لفيديو جاهز
    if (media.type !== "video" || media.status !== "processing") {
        return next(new AppError("This video is not awaiting upload", 400));
    }

    res.status(200).json({
        status: "success",
        data: {
            upload: tusUploadEnvelope(media.bunnyVideoId, { mediaId: media._id }),
        },
    });
});

// @desc  Download the 720p MP4 with a forced attachment header (F7d — backend proxy)
// @route GET /players/:playerId/media/:id/download
export const downloadVideo = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id);
    if (!media || media.player.toString() !== req.params.playerId) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }
    if (media.type !== "video" || media.status !== "ready" || !media.bunnyVideoId) {
        return next(new AppError("This video is not available for download", 400));
    }

    const upstream = await fetch(streamMp4Url(media.bunnyVideoId));
    if (!upstream.ok) {
        return next(new AppError("Download failed", 502));
    }
    const safeName = (media.title || "video").replace(/[^\w.-]+/g, "_");
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.mp4"`);
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buffer);
});

// @desc  Bunny Stream webhook — UNTRUSTED trigger only (C1). Never writes status
//        from the payload; verifies the secret path + library, then re-derives
//        the real status via the Bunny API inside syncVideoStatus.
// @route POST /webhooks/bunny/:secret
export const bunnyWebhook = asyncHandler(async (req, res) => {
    const { stream } = bunnyConfig();
    const provided = req.params.secret || "";
    const expected = stream.webhookSecret || "";

    const secretOk =
        provided.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

    if (!secretOk) {
        // مش بنسجّل الـ secret ولا بنلمّح إنه اتقارن — مجرد 404
        return res.status(404).json({ status: "fail" });
    }

    const { VideoLibraryId, VideoGuid } = req.body || {};
    // بنتحقق إن الحدث بتاع مكتبتنا، وبعدين نعامل الـ body كـ trigger بس
    if (String(VideoLibraryId) === String(stream.libraryId) && VideoGuid) {
        try {
            await syncVideoStatus(VideoGuid);
        } catch {
            // untrusted trigger — مبنفشلش الرد عشان Bunny ميعملش retries
        }
    }

    return res.status(200).json({ status: "success" });
});