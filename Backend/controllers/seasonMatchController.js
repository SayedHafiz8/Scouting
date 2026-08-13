import asyncHandler from "express-async-handler";

import SeasonMatch from "../models/seasonMatchModel.js";
import Player from "../models/playedModel.js";
import AppError from "../utils/appError.js";
import { creating, gettingAll, updating, deleteOne } from "../services/services.js";
import { decorateMedia } from "./playerMediaController.js";

// createdBy بيتحط من السيرفر (creating بيعمل req.body[field] = req.user._id)
export const create = creating(SeasonMatch, "createdBy");

// updatedBy بيتحط قبل التعديل — نفس فكرة setUserIdToBody/setAgeIdToBody
export const setUpdatedBy = (req, res, next) => {
    req.body.updatedBy = req.user._id;
    next();
};

// matchDate لازم يفضل هنا — matchDate[gte] استخدام إنتاجي حقيقي في شاشة "ماتشاتي" (my-matches).
// attendees مطلوب لـ ?attendees=<id> (الكشاف بيفلتر الماتشات اللي حضّرها بس).
const SEASON_MATCH_FILTERS = ["ageGroup", "season", "league", "status", "attendees", "matchDate"];

// أوبزيرفر بيشوف بس مباريات فرق اللاعبين اللي الأدمن حطّه يتابعهم (Player.observers) —
// مش كل جدول المباريات زي الكوتش/الأدمن. لو مفيش لاعب متحدد ليه فريق أصلاً، يشوف صفر مباريات.
async function seasonMatchBaseFilterFor(req) {
    if (req.user.role !== "observer") return {};

    const teamIds = (await Player.find({ observers: req.user._id }).distinct("team")).filter(Boolean);
    return teamIds.length
        ? { $or: [{ homeTeam: { $in: teamIds } }, { awayTeam: { $in: teamIds } }] }
        : { _id: { $in: [] } };
}

// @desc    Get all season matches (filter by ageGroup/season/status)
// @route   GET api/v1/seasonMatches
// @access  private
export const getAll = (req, res, next) => {
    if (!req.query.sort) req.query.sort = "matchDate";
    // §11 — البحث في venue اتشال (مفيش UI بيبعت keyword للمباريات)، فالباراميتر
    // searchFields اتشال من gettingAll والترتيب اتزحلق
    return gettingAll(SeasonMatch, { allowed: SEASON_MATCH_FILTERS }, null, seasonMatchBaseFilterFor)(req, res, next);
};

// @desc    Get specific season match (with linked reports, media + audit users)
// @route   GET api/v1/seasonMatches/:id
// @access  private
export const getSpecific = asyncHandler(async (req, res, next) => {
    // كل كشاف (كوتش أو أوبزيرفر) بيشوف تقاريره وميديته هو بس على الماتش ده — الأدمن بيشوف الكل.
    // نفس نمط الـ ownership المستخدم في scoutingReportController.getAll (coach = الكاتب)
    // و playerMediaController.getAll (uploadedBy = الرافع). الفلترة جوه الكويري نفسها
    // (populate match) عشان بيانات غيره متخرجش من الداتابيز أصلاً.
    const isAdmin = req.user.role === "admin";
    const reportsMatch = isAdmin ? undefined : { coach: req.user._id };
    const mediaMatch = isAdmin ? undefined : { uploadedBy: req.user._id };

    const document = await SeasonMatch.findById(req.params.id)
        .populate({
            path: "reports",
            match: reportsMatch,
            select: "player coach overallRating matchDate",
            populate: [
                { path: "player", select: "name position" },
                { path: "coach", select: "name" },
            ],
        })
        .populate({
            path: "media",
            match: mediaMatch,
            select: "player uploadedBy type url title reviewStatus createdAt storage bunnyVideoId storageKey status",
            populate: [
                { path: "player", select: "name position" },
                { path: "uploadedBy", select: "name role" },
            ],
        })
        .populate({ path: "createdBy", select: "name role" })
        .populate({ path: "updatedBy", select: "name role" });

    if (!document) {
        return next(new AppError(`No document for this Id '${req.params.id}'`, 404));
    }

    // §7 — sign media URLs on read; strip internal storage keys
    const out = document.toObject();
    out.media = (out.media || []).map(decorateMedia);

    res.status(200).json({
        status: "success",
        data: { document: out },
    });
});

export const update = updating(SeasonMatch);

export const deleting = deleteOne(SeasonMatch);

// @desc    Update a match's status/result — the coach/observer assigned to attend it (or an admin), not general edit
// @route   PATCH api/v1/seasonMatches/:id/status
// @access  private - attendee coach/observer or admin
export const updateMatchStatus = asyncHandler(async (req, res, next) => {
    const { status, result } = req.body;

    // نتيجة المباراة (status: completed) لازم تتسجل يوم المباراة نفسه بس — مش قبله ولا بعده
    // بأيام، عشان النتيجة تتسجل وهي لسه فريش من الحاضرين فعلاً، مش بأثر رجعي. الأدمن مستثنى
    // (تصحيح/إدارة، مش الكشاف/الأوبزيرفر اللي المفروض حاضر المباراة فعليًا).
    if (status === "completed" && req.user.role !== "admin") {
        const match = await SeasonMatch.findById(req.params.id).select("matchDate").setOptions({ skipPopulate: true });
        if (!match) {
            return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
        }
        const dayStart = new Date(match.matchDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const now = Date.now();
        if (now < dayStart.getTime() || now >= dayEnd.getTime()) {
            return next(new AppError("You can only enter the match result on the day of the match", 400));
        }
    }

    const update = { status, updatedBy: req.user._id };
    if (result) update.result = result;

    const document = await SeasonMatch.findByIdAndUpdate(req.params.id, update, {
        returnDocument: "after",
        runValidators: true,
    });

    if (!document) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }

    res.status(200).json({
        status: "success",
        data: { document },
    });
});

// الحضور/الإلغاء متاح لحد آخر اليوم اللي قبل يوم الماتش بس — بعد ما يوم الماتش يبدأ بيتقفل خالص
// (نفس نمط مقارنة start-of-day المستخدم في matchDateNotPast للاتساق)
const isBeforeMatchDay = (matchDate) => {
    const dayStart = new Date(matchDate);
    dayStart.setHours(0, 0, 0, 0);
    return Date.now() < dayStart.getTime();
};

// @desc    Scout self-enrolls to attend a match (adds self to attendees)
// @route   POST api/v1/seasonMatches/:id/attend
// @access  private - coach/observer
export const attendMatch = asyncHandler(async (req, res, next) => {
    const match = await SeasonMatch.findById(req.params.id).setOptions({ skipPopulate: true });
    if (!match) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }
    if (match.status === "cancelled") {
        return next(new AppError("You cannot attend a cancelled match", 400));
    }
    if (!isBeforeMatchDay(match.matchDate)) {
        return next(new AppError("Attendance can only be registered before the match day", 400));
    }

    const document = await SeasonMatch.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { attendees: req.user._id } },
        { returnDocument: "after" }
    );

    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Scout removes self from a match's attendees
// @route   DELETE api/v1/seasonMatches/:id/attend
// @access  private - coach/observer
export const unattendMatch = asyncHandler(async (req, res, next) => {
    const match = await SeasonMatch.findById(req.params.id).setOptions({ skipPopulate: true });
    if (!match) {
        return next(new AppError(`No document for this Id: ${req.params.id}`, 404));
    }
    if (!isBeforeMatchDay(match.matchDate)) {
        return next(new AppError("Attendance can only be cancelled before the match day", 400));
    }

    const document = await SeasonMatch.findByIdAndUpdate(
        req.params.id,
        { $pull: { attendees: req.user._id } },
        { returnDocument: "after" }
    );

    res.status(200).json({ status: "success", data: { document } });
});
