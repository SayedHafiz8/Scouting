import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import ObserverEvaluation from "../models/observerEvaluationModel.js";
import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import AppError from "../utils/appError.js";
import { sendNotificationToUser } from "../socket/handlers/notification.js";
import { EVALUATION_CRITERIA } from "../utils/observerEvaluationCriteria.js";
import { ROLES } from "../constants/roles.js";

const populate = [
    { path: "observer", select: "name email" },
    { path: "evaluator", select: "name" },
];

// "edit own only" — الأدمن يقدر يشوف تقييمات أي أدمن لكن يعدّل بتاعه هو بس
const assertOwnEvaluation = (doc, req) => {
    if (!doc.evaluator.equals(req.user._id)) {
        throw new AppError("You can only modify your own evaluations", 403);
    }
};

// ============================================================================
// captureObserverStats — بياخد snapshot للبيانات الموجودة أصلًا عن الكشاف (مش الأدمن بيكتبها)
// النشاط (تقارير/ماتشات/ميديا) مسكوب على شهر التقييم، وعدد اللاعبين المتابَعين لقطة تراكمية
// ============================================================================
export const captureObserverStats = async (observerId, year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const [reportsCount, matchesAttended, mediaCount, playersObserved] = await Promise.all([
        ScoutingReport.countDocuments({
            coach: observerId, // حقل الكاتب في موديل التقرير اسمه coach بغض النظر عن الدور
            createdAt: { $gte: start, $lt: end },
        }),
        SeasonMatch.countDocuments({
            attendees: observerId,
            matchDate: { $gte: start, $lt: end },
        }),
        PlayerMedia.countDocuments({
            uploadedBy: observerId,
            createdAt: { $gte: start, $lt: end },
        }),
        Player.countDocuments({ observers: observerId }),
    ]);

    return {
        reportsCount,
        matchesAttended,
        mediaCount,
        playersObserved,
        capturedAt: new Date(),
    };
};

// @desc    Create an observer evaluation (draft) — any admin
// @route   POST /api/v1/observerEvaluations
// @access  Private - admin
export const create = asyncHandler(async (req, res, next) => {
    req.body.evaluator = req.user._id;
    req.body.stats = await captureObserverStats(
        req.body.observer,
        Number(req.body.year),
        Number(req.body.month)
    );

    const created = await ObserverEvaluation.create(req.body);
    const document = await ObserverEvaluation.findById(created._id).populate(populate);

    res.status(201).json({ status: "success", data: { document } });
});

// @desc    List evaluations — observer sees own+published; admin sees all (filterable)
// @route   GET /api/v1/observerEvaluations
// @access  Private - admin & observer
export const getAll = asyncHandler(async (req, res, next) => {
    const baseFilter = {};

    if (req.user.role !== ROLES.ADMIN) {
        // الكشاف يشوف تقييماته المنشورة بس
        baseFilter.observer = req.user._id;
        baseFilter.status = "published";
    } else {
        // الأدمن يشوف كل تقييمات كل الأدمنز — مع فلاتر اختيارية
        if (req.query.observer) baseFilter.observer = req.query.observer;
        if (req.query.evaluator) baseFilter.evaluator = req.query.evaluator;
        if (req.query.year) baseFilter.year = Number(req.query.year);
        if (req.query.month) baseFilter.month = Number(req.query.month);
        if (req.query.status) baseFilter.status = req.query.status;
    }

    if (!req.query.sort) req.query.sort = "-year,-month";

    const features = new ApiFeature(
        ObserverEvaluation.find(baseFilter),
        req.query,
        req.params,
        req.user
    );

    const documentCount = await ObserverEvaluation.countDocuments(
        features.query.getFilter()
    );
    features.sort().limitFields().paginate(documentCount);

    const documents = await features.query.populate(populate);

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents },
    });
});

// @desc    Get a specific evaluation
// @route   GET /api/v1/observerEvaluations/:id
// @access  Private - admin (any) & observer (own published only)
export const getSpecific = asyncHandler(async (req, res, next) => {
    const document = await ObserverEvaluation.findById(req.params.id).populate(populate);
    if (!document) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }

    if (req.user.role !== ROLES.ADMIN) {
        const ownPublished =
            document.observer._id.equals(req.user._id) && document.status === "published";
        if (!ownPublished) {
            return next(new AppError("Not authorized to view this evaluation", 403));
        }
    }

    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Update evaluation content (own only, status untouched)
// @route   PATCH /api/v1/observerEvaluations/:id
// @access  Private - admin (owner)
export const update = asyncHandler(async (req, res, next) => {
    const doc = await ObserverEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);
    // بعد النشر التقييم بيتقفل نهائيًا — مفيش تعديل حتى لو الأدمن صاحبه
    if (doc.status !== "draft") {
        return next(new AppError("Published evaluations can no longer be edited", 400));
    }

    // findByIdAndUpdate علشان الـ pre(findOneAndUpdate) hook يعيد حساب overallRating
    const document = await ObserverEvaluation.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    }).populate(populate);

    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Publish evaluation — observer starts seeing it + gets notified
// @route   PATCH /api/v1/observerEvaluations/:id/publish
// @access  Private - admin (owner)
export const publish = asyncHandler(async (req, res, next) => {
    const doc = await ObserverEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    if (doc.status !== "published") {
        // نعيد التقاط الإحصائيات علشان اللقطة المنشورة تبقى محدّثة
        doc.stats = await captureObserverStats(doc.observer, doc.year, doc.month);
        doc.status = "published";
        doc.publishedAt = doc.publishedAt || new Date();
        await doc.save();

        sendNotificationToUser(doc.observer.toString(), {
            type: "OBSERVER_EVALUATION_PUBLISHED",
            data: {
                evaluationId: doc._id,
                overallRating: doc.overallRating,
                year: doc.year,
                month: doc.month,
            },
        });
    }

    const document = await ObserverEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Archive evaluation — removes it from the observer's view
// @route   PATCH /api/v1/observerEvaluations/:id/archive
// @access  Private - admin (owner)
export const archive = asyncHandler(async (req, res, next) => {
    const doc = await ObserverEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    doc.status = "archived";
    await doc.save();

    const document = await ObserverEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Re-capture the auto stats for a draft before publishing
// @route   PATCH /api/v1/observerEvaluations/:id/refresh-stats
// @access  Private - admin (owner)
export const refreshStats = asyncHandler(async (req, res, next) => {
    const doc = await ObserverEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    doc.stats = await captureObserverStats(doc.observer, doc.year, doc.month);
    await doc.save();

    const document = await ObserverEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Delete evaluation (own only)
// @route   DELETE /api/v1/observerEvaluations/:id
// @access  Private - admin (owner)
export const deleting = asyncHandler(async (req, res, next) => {
    const doc = await ObserverEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    await doc.deleteOne();
    res.status(204).json({ status: "success" });
});

// @desc    Per-observer published trend + category averages + latest
// @route   GET /api/v1/observerEvaluations/summary
// @access  Private - admin (?observer=) & observer (own)
export const getSummary = asyncHandler(async (req, res, next) => {
    const observerId = req.user.role === ROLES.ADMIN ? req.query.observer : req.user._id;
    if (!observerId) {
        return next(new AppError("observer query param is required", 400));
    }

    const match = {
        observer: new mongoose.Types.ObjectId(observerId),
        status: "published",
    };

    // متوسط كل معيار عشان نجمّعهم لمتوسطات الفئات
    const avgProject = { count: { $sum: 1 }, overallRating: { $avg: "$overallRating" } };
    Object.entries(EVALUATION_CRITERIA).forEach(([category, keys]) => {
        keys.forEach((key) => {
            avgProject[`${category}_${key}`] = { $avg: `$${category}.${key}` };
        });
    });

    const [trend, aggRows] = await Promise.all([
        ObserverEvaluation.aggregate([
            { $match: match },
            { $sort: { year: 1, month: 1 } },
            { $project: { _id: 0, year: 1, month: 1, overallRating: 1 } },
        ]),
        ObserverEvaluation.aggregate([
            { $match: match },
            { $group: { _id: null, ...avgProject } },
        ]),
    ]);

    const agg = aggRows[0];
    const round = (n) => (n == null ? 0 : parseFloat(n.toFixed(2)));

    const categoryAverages = {};
    for (const [category, keys] of Object.entries(EVALUATION_CRITERIA)) {
        const vals = keys.map((k) => agg?.[`${category}_${k}`]).filter((v) => v != null);
        categoryAverages[category] = vals.length
            ? round(vals.reduce((a, v) => a + v, 0) / vals.length)
            : 0;
    }

    const latest = await ObserverEvaluation.findOne(match)
        .sort({ year: -1, month: -1 })
        .populate(populate);

    res.status(200).json({
        status: "success",
        data: {
            count: agg?.count ?? 0,
            averageOverall: round(agg?.overallRating),
            categoryAverages,
            trend,
            latest,
        },
    });
});
