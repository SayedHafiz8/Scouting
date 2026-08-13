import asyncHandler from "express-async-handler";
import sharp from "sharp";
import fs from "fs";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import User from "../models/userModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import AppError from "../utils/appError.js";
import ApiFeature from "../utils/apiFeatures.js";
import { updating } from "../services/services.js";
import { buildKey, uploadMediaImage, deleteMediaImage } from "../services/imageStorage.js";
import { deleteMediaBytes } from "./playerMediaController.js";
import { resolveImageUrl } from "../utils/mediaUrl.js";
import { sendNotificationToUser, sendNotificationToAdmins } from "../socket/handlers/notification.js";
import {
    emitAdminDashboardUpdate,
    emitCoachDashboardUpdate,
    emitObserverDashboardUpdate,
} from "./dashboardController.js";



export const setUserIdToBody = (req, res, next) => {
    // Nested Router
    if(!req.body.coach) req.body.coach = req.params.id;
    next();
}

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
export const create = asyncHandler(async (req, res, next) => {
    req.body.coach = req.user._id;

    const player = await Player.create(req.body);

    // fire-and-forget — الـ response لا ينتظر الـ dashboard update
    emitAdminDashboardUpdate();
    res.status(201).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Player counts grouped by ageGroup (single aggregation instead of N requests)
// @route   GET api/v1/players/counts?status=selected&coach=<id>
// @access  private (coach sees own; admin sees all, or a specific coach/observer via query)
export const getCountsByAgeGroup = asyncHandler(async (req, res, next) => {
    const match = {};

    // coach-scoping: coaches only count their own players
    if (req.user.role === "coach") {
        match.coach = new mongoose.Types.ObjectId(req.user._id);
    }

    // observer-scoping: observers only count players assigned to them
    if (req.user.role === "observer") {
        match.observers = new mongoose.Types.ObjectId(req.user._id);
    }

    // admin browsing a specific coach's or observer's players (?coach=id / ?observer=id) —
    // بدون ده كان بيرجع عدّ كل اللاعبين مش بتوع الكوتش/الأوبزيرفر المطلوب بس
    if (req.user.role === "admin") {
        const { coach, observer } = req.query;
        if (coach && mongoose.isValidObjectId(coach)) {
            match.coach = new mongoose.Types.ObjectId(coach);
        }
        if (observer && mongoose.isValidObjectId(observer)) {
            match.observers = new mongoose.Types.ObjectId(observer);
        }
    }

    // optional status filter (GET → comes as a query param)
    const status = req.query?.status ?? req.body?.status;
    if (status) {
        // للكوتش: اللاعب "observed" بيظهرله كأنه "pending"، فالعدّ بالـ pending يشمل الاتنين
        if (req.user.role === "coach" && status === "pending") {
            match.status = { $in: ["pending", "observed"] };
        } else {
            match.status = status;
        }
    }

    const rows = await Player.aggregate([
        { $match: match },
        { $group: { _id: "$ageGroup", count: { $sum: 1 } } },
    ]);

    const counts = {};
    let total = 0;
    rows.forEach((r) => {
        if (r._id) counts[r._id.toString()] = r.count;
        total += r.count;
    });

    res.status(200).json({
        status: "success",
        data: { counts, total },
    });
});

// الكوتش مبيعرفش مفهوم "المتابعة" — اللاعب المتابَع بيظهرله كأنه "pending"
// وبنخفي عنه حقل الأوبزيرفرز خالص.
const maskObservedForCoach = (doc) => {
    const o = doc.toObject ? doc.toObject() : doc;
    if (o.status === "observed") o.status = "pending";
    delete o.observers;
    return o;
};

// الأوبزيرفر مبيشوفش مين الكوتش بتاع اللاعب — الأدمن بس اللي يقدر يشوف ده.
const maskCoachForObserver = (doc) => {
    const o = doc.toObject ? doc.toObject() : doc;
    delete o.coach;
    return o;
};

// coach/observer/observers عدسة أدمن-أونلي — نفس القاعدة اللي getCountsByAgeGroup مطبقاها.
// لغير الأدمن دول أوراكل: ?coach= بيكشف كوتش لاعب الأوبزيرفر (ضد maskCoachForObserver)،
// و?observers= بيكشف مين بيتابع لاعب الكوتش (ضد maskObservedForCoach). مفتاحين مختلفين
// فعكس ترتيب الدمج في ApiFeature لوحده مش بيقفلهم — لازم يتشالوا هنا قبل ما يوصلوا للفلتر.
const PLAYER_ADMIN_ONLY_LENSES = ["coach", "observer", "observers"];

const PLAYER_FILTERS = [
    "status", "position", "preferredFoot", "ageGroup", "team", "nationality",
    "coach", "observers",
];

// @desc    Get all players (coach sees own with "observed" masked to "pending")
// @route   GET api/v1/players
// @access  private
export const getAll = asyncHandler(async (req, res, next) => {
    const isCoach = req.user.role === "coach";

    const queryParams = { ...req.query };
    if (req.user.role !== "admin") {
        PLAYER_ADMIN_ONLY_LENSES.forEach((k) => delete queryParams[k]);
    }

    // للكوتش: فلترة بالـ pending لازم تشمل اللاعبين المتابَعين (observed) كمان
    let coachPendingOverride = false;
    if (isCoach && queryParams.status === "pending") {
        coachPendingOverride = true;
        delete queryParams.status;
    }

    // ?observer=id بيفلتر على مصفوفة الـ observers (اسم الحقل مختلف عن اسم الـ query param)
    if (queryParams.observer) {
        queryParams.observers = queryParams.observer;
        delete queryParams.observer;
    }

    // §9 — سنتينل "اللاعبين اليتامى": اللي كوتشهم اتمسح نهائياً فالحقل اتفضّى
    // (detachUserFromPlayers بتعمل $unset). من غير الفلتر ده الأدمن مالوش طريقة
    // يلمّهم عشان يعيّنلهم كوتش، وبيفضلوا مبعترين في القايمة.
    //
    // مركوب على عدسة الـcoach الموجودة عن قصد: "coach" أصلاً في
    // PLAYER_ADMIN_ONLY_LENSES فوق، يعني اتشال بالفعل من queryParams لأي حد مش
    // أدمن قبل ما نوصل هنا — الكوتش اللي يبعت ?coach=none بيتلغى السنتينل بتاعه
    // وبيقع على سكوب ملكيته العادي. مفيش مفتاح جديد ولا تغيير في ApiFeature.
    //
    // null (مش $exists:false) عشان يطابق الحقل الغايب والـnull الصريح مع بعض.
    if (queryParams.coach === "none") {
        queryParams.coach = null;
    }

    const features = new ApiFeature(
        Player.find()
            .populate({ path: "coach", select: "name email" })
            .populate({ path: "team", select: "name clubName" }),
        queryParams,
        req.params,
        req.user
    )
        .filter({
            parentField: "coach",
            ownerFields: { coach: "coach", observer: "observers" },
            allowed: PLAYER_FILTERS,
        })
        // §11 — البحث اتضيّق من 5 حقول لحقل الكلمات المطبّع المشتق من name+city.
        // position/preferredFoot/nationality اتشالوا لأنهم موجودين أصلاً كفلاتر
        // مخصصة في PLAYER_FILTERS فوق، والـ$or عليهم كان بيمنع أي استخدام للـindex
        // (حقل واحد مفهرس وسط حقول مش مفهرسة = COLLSCAN برضه).
        .searchPrefix("searchTokens");

    if (coachPendingOverride) {
        features.query = features.query.find({ status: { $in: ["pending", "observed"] } });
    }

    const documentCount = await Player.countDocuments(features.query.getFilter());
    features.sort().limitFields().paginate(documentCount);

    let documents = await features.query;
    if (isCoach) documents = documents.map(maskObservedForCoach);
    else if (req.user.role === "observer") documents = documents.map(maskCoachForObserver);

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents },
    });
});

// @desc    Get specific player (coach sees "observed" masked to "pending")
// @route   GET api/v1/players/:id
// @access  private
export const getSpecific = asyncHandler(async (req, res, next) => {
    const document = await Player.findById(req.params.id)
        .populate({ path: "coach", select: "name email" })
        .populate({ path: "observers", select: "name" })
        .populate({ path: "team", select: "name clubName" });

    if (!document) {
        return next(new AppError(`No document for this Id '${req.params.id}'`, 404));
    }

    let out = document;
    if (req.user.role === "coach") out = maskObservedForCoach(document);
    else if (req.user.role === "observer") out = maskCoachForObserver(document);

    res.status(200).json({
        status: "success",
        data: { document: out },
    });
});

// @desc    Delete a player and cascade-delete everything scoped to them
//          (scouting reports + media, including the Cloudinary assets) — players are hard-deleted, no "active" flag
// @route   DELETE api/v1/players/:id
// @access  private (admin only)
export const deleting = asyncHandler(async (req, res, next) => {
    const { id } = req.params;

    const player = await Player.findById(id);
    if (!player) {
        return next(new AppError(`No document for This Id: ${id}`, 404));
    }

    const media = await PlayerMedia.find({ player: id });
    // امسح بايتات كل ميديا من مصدرها (Bunny Stream/Storage أو legacy Cloudinary) — best-effort
    await Promise.all(media.map((m) => deleteMediaBytes(m)));
    await PlayerMedia.deleteMany({ player: id });

    await ScoutingReport.deleteMany({ player: id });

    // امسح صورة البروفايل بتاعت اللاعب كمان (orphan fix)
    await deleteMediaImage(player.profileImg);

    await player.deleteOne();

    res.status(204).json({
        status: "success",
    });
});

//@desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const update = updating(Player);

// بتتأكد إن كل الـ ids المبعوتة فعلاً ليوزرز دورهم "observer"
const validateObserverIds = async (ids) => {
    const uniqueIds = [...new Set(ids.map(String))];
    const observerUsers = await User.find({ _id: { $in: uniqueIds }, role: "observer" }).select("_id");
    if (observerUsers.length !== uniqueIds.length) return null;
    return uniqueIds;
};

export const updatePlayerStatus = asyncHandler(async (req, res, next) => {
    const { status, observers } = req.body;

    const update = { status };
    let newlyAssignedObservers = [];
    let beforeIds = new Set();

    if (status === "observed") {
        const validIds = await validateObserverIds(observers ?? []);
        if (!validIds) {
            return next(new AppError("One or more selected observers are not valid", 400));
        }

        const before = await Player.findById(req.params.id).select("observers");
        beforeIds = new Set((before?.observers ?? []).map(String));
        newlyAssignedObservers = validIds.filter((id) => !beforeIds.has(id));

        update.observers = validIds;
    }
    // ملاحظة: الربط بالأوبزيرفرز بيفضل ثابت — لو الحالة اتغيرت لأي حاجة تانية
    // (selected/rejected/pending) الأوبزيرفرز بيفضلوا شايفين اللاعب وبيشوفوا التغيير.

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true, runValidators: true }
    ).populate({ path: "team", select: "name clubName" });

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    // fire-and-forget — الـ response لا ينتظر الـ dashboard updates
    emitAdminDashboardUpdate();
    // §9 — اللاعب اليتيم مالوش كوتش يتبلّغ
    if (player.coach) emitCoachDashboardUpdate(player.coach);

    // عدد اللاعبين المتابَعين بيتغير للأوبزيرفرز الجداد والقدامى (لو اتشالوا) — كلهم محتاجين تحديث لايف
    const affectedObserverIds = new Set([
        ...beforeIds,
        ...(player.observers ?? []).map((id) => id.toString()),
    ]);
    affectedObserverIds.forEach((id) => emitObserverDashboardUpdate(id));

    // الكوتش بيتبلغ بس لما الحالة تبقى "selected" أو "rejected" — مش لما الأدمن يحط اللاعب "observed"
    // (ده مجرد تخصيص أوبزيرفر مؤقت، مش قرار نهائي يستاهل تنبيه)
    if (player.coach && (status === "selected" || status === "rejected")) {
        sendNotificationToUser(player.coach.toString(), {
            type: "PLAYER_STATUS_UPDATED",
            message: `The status of the player '${player.name}' changed to "${status}"`,
            playerId: player._id.toString(),
            status: player.status,
            createdAt: new Date(),
        });
    }

    // بلّغ الأوبزيرفرز الجداد إنهم اتخصصلهم لاعب، والباقيين إن الحالة اتغيرت
    (player.observers ?? []).forEach((observerId) => {
        const isNew = newlyAssignedObservers.includes(observerId.toString());
        sendNotificationToUser(observerId.toString(), {
            type: isNew ? "PLAYER_ASSIGNED_TO_OBSERVER" : "PLAYER_STATUS_UPDATED",
            message: isNew
                ? `A new player '${player.name}' has been assigned to you`
                : `The status of the player '${player.name}' changed to "${status}"`,
            playerId: player._id.toString(),
            status: player.status,
            createdAt: new Date(),
        });
    });

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Add/remove observers for a player without touching its status
//          (e.g. revoke one specific observer's access while keeping the rest)
// @route   PATCH api/v1/players/:id/observers
// @access  private - admin only
export const updatePlayerObservers = asyncHandler(async (req, res, next) => {
    const { observers } = req.body;

    const validIds = await validateObserverIds(observers ?? []);
    if (!validIds && (observers ?? []).length > 0) {
        return next(new AppError("One or more selected observers are not valid", 400));
    }

    const before = await Player.findById(req.params.id).select("observers");
    const beforeIds = new Set((before?.observers ?? []).map(String));

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        { observers: validIds ?? [] },
        { new: true, runValidators: true }
    ).populate({ path: "observers", select: "name" });

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    // عدد اللاعبين المتابَعين بيتغير للأوبزيرفرز الجداد والقدامى (لو اتشالوا) — كلهم محتاجين تحديث لايف
    const affectedObserverIds = new Set([
        ...beforeIds,
        ...(player.observers ?? []).map((o) => (o._id ?? o).toString()),
    ]);
    affectedObserverIds.forEach((id) => emitObserverDashboardUpdate(id));

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

// @desc    Assign (or re-assign) the coach who owns a player.
//          §9 — ده المخرج الوحيد للاعب "اليتيم" اللي كوتشه اتمسح نهائياً: من غيره
//          بيفضل مرئي للأدمن بس للأبد. الأدمن بس اللي بيقدر ينادي الراوت ده،
//          لأنه بيحوّل ملكية بيانات لاعب قاصر من حساب لحساب.
// @route   PATCH api/v1/players/:id/coach
// @access  private - admin only
export const assignPlayerCoach = asyncHandler(async (req, res, next) => {
    const { coach: coachId } = req.body;

    // لازم يكون يوزر نشط بدور coach — مش أي ObjectId
    const coachUser = await User.findOne({ _id: coachId, role: "coach" }).select("_id");
    if (!coachUser) {
        return next(new AppError("The selected coach is not a valid active coach", 400));
    }

    const before = await Player.findById(req.params.id).select("coach");
    if (!before) {
        return next(new AppError("Player not found", 404));
    }
    const previousCoachId = before.coach?.toString();

    const player = await Player.findByIdAndUpdate(
        req.params.id,
        { coach: coachUser._id },
        { new: true, runValidators: true }
    ).populate({ path: "team", select: "name clubName" });

    // fire-and-forget — الكوتش الجديد كسب لاعب، والقديم (لو موجود) خسر واحد
    emitAdminDashboardUpdate();
    emitCoachDashboardUpdate(coachUser._id);
    if (previousCoachId && previousCoachId !== coachUser._id.toString()) {
        emitCoachDashboardUpdate(previousCoachId);
    }

    sendNotificationToUser(coachUser._id.toString(), {
        type: "PLAYER_ASSIGNED_TO_COACH",
        message: `The player '${player.name}' has been assigned to you`,
        playerId: player._id.toString(),
        status: player.status,
        createdAt: new Date(),
    });

    res.status(200).json({
        status: "success",
        data: { document: player },
    });
});

const MAX_PLAYER_IMAGE_SIZE = 4 * 1024 * 1024;

export const uploadProfileImg = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("Please provide an image file", 400));
    }
    if (req.file.size > MAX_PLAYER_IMAGE_SIZE) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("حجم الصورة كبير جداً، الحد الأقصى 4 ميجا", 400));
    }

    const existing = await Player.findById(req.params.id).select("coach profileImg");
    if (!existing) {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("Player not found", 404));
    }
    // §9 — لاعب يتيم (بلا كوتش) مالوش مالك: 403 للكوتش، مش 500 من .toString() على null
    if (
        req.user.role === "coach" &&
        (!existing.coach || existing.coach.toString() !== req.user._id.toString())
    ) {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
        return next(new AppError("You are not allowed to update this player's image", 403));
    }

    try {
        const buffer = await sharp(req.file.path)
            .resize({ width: 400, height: 500, fit: "cover" })
            .webp({ quality: 85 })
            .toBuffer();

        const key = buildKey("players", "webp");
        await uploadMediaImage(buffer, key, "image/webp");

        const player = await Player.findByIdAndUpdate(
            req.params.id,
            { profileImg: key },
            { new: true, runValidators: true }
        );

        // orphan fix: امسح الصورة القديمة (بيتجاهل روابط Cloudinary القديمة)
        await deleteMediaImage(existing.profileImg);

        res.status(200).json({
            status: "success",
            data: { profileImg: resolveImageUrl(key), player },
        });
    } finally {
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
    }
});