// middlewares/ownership.js
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import AppError from "../utils/appError.js";
import { ROLES } from "../constants/roles.js";

export const checkPlayerOwnership = asyncHandler(async (req, res, next) => {
    const id = req.params.playerId ?? req.params.id;
    const player = await Player.findById(id).select("coach observers");

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.OBSERVER) {
        // الأوبزيرفر يوصل بس للاعب المخصص له (يعني موجود في مصفوفة observers بتاعته)
        const isAssigned = (player.observers ?? []).some(
            (o) => o.toString() === req.user._id.toString()
        );
        if (!isAssigned) {
            return next(new AppError("You are not allowed to access this player's data", 403));
        }
        return next();
    }

    if (req.user.role === ROLES.COACH) {
        // §9 — لاعب يتيم (كوتشه اتمسح) مالوش مالك، فمحدش من الكوتشيز يوصله. الفحص ده
        // بيشدّ العزل مش بيرخّيه: من غيره الـ.toString() على null كان هيرمي 500 بدل 403.
        // الأدمن بس هو اللي بيشوفه (بيرجع من فوق) لحد ما يعيّنله كوتش جديد.
        if (!player.coach || player.coach.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this player's data", 403));
        }
        return next();
    }

    // Deny by default (Constitution Principle II / Constraint C-2) — أي رول غير
    // معدود صراحةً أعلاه يُرفَض هنا، لا يُفترَض ضمنياً كأنه كوتش.
    return next(new AppError("You are not allowed to access this player's data", 403));
});

export const checkReportOwnership = asyncHandler(async (req, res, next) => {
    const report = await ScoutingReport.findById(req.params.id).select("coach player");

    if (!report) {
        return next(new AppError("Scouting report not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        if (report.coach.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this report", 403));
        }
        if (report.player.toString() !== req.params.playerId) {
            return next(new AppError("This report does not belong to this player", 403));
        }
        return next();
    }

    // Deny by default — رول غير معدود صراحةً.
    return next(new AppError("You are not allowed to access this report", 403));
});

export const checkMediaOwnership = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id).select("uploadedBy player").lean();

    if (!media) {
        return next(new AppError("Media not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        // الوسائط بتخص من رفعها بس (كوتش أو أوبزيرفر) + الأدمن — غيرهم متشافش
        if (media.uploadedBy.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this media", 403));
        }
        if (media.player.toString() !== req.params.playerId) {
            return next(new AppError("This media does not belong to this player", 403));
        }
        return next();
    }

    // Deny by default (FR-002) — رول غير معدود صراحةً يُرفَض هنا حتى لو كانت قيمة
    // uploadedBy تطابق هويته بالمصادفة؛ فحص الرول بوابة أولى قبل فحص uploadedBy.
    return next(new AppError("You are not allowed to access this media", 403));
});

// بيسمح للأدمن دايمًا، وللكوتش/الأوبزيرفر بس لو موجودين فى مصفوفة attendees بتاعت المباراة
export const checkSeasonMatchAttendee = asyncHandler(async (req, res, next) => {
    const match = await SeasonMatch.findById(req.params.id).select("attendees").setOptions({ skipPopulate: true });

    if (!match) {
        return next(new AppError("Season match not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        const isAttendee = (match.attendees ?? []).some(
            (a) => a.toString() === req.user._id.toString()
        );
        if (!isAttendee) {
            return next(new AppError("You are not assigned to attend this match", 403));
        }
        return next();
    }

    // Deny by default — رول غير معدود صراحةً.
    return next(new AppError("You are not assigned to attend this match", 403));
});