import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import CoachEvaluation from "../models/coachEvaluationModel.js";
import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import ApiFeature from "../utils/apiFeatures.js";
import AppError from "../utils/appError.js";
import { sendNotificationToUser } from "../socket/handlers/notification.js";
import { EVALUATION_CRITERIA } from "../utils/coachEvaluationCriteria.js";

const populate = [
    { path: "coach", select: "name email" },
    { path: "evaluator", select: "name" },
];

// "edit own only" — الأدمن يقدر يشوف تقييمات أي أدمن لكن يعدّل بتاعه هو بس
const assertOwnEvaluation = (doc, req) => {
    if (!doc.evaluator.equals(req.user._id)) {
        throw new AppError("You can only modify your own evaluations", 403);
    }
};

// القفل بيتطبق بس على الشهر الحالي — تقييمات الشهور اللي فاتت تفضل ظاهرة عادي زي ما كانت
const isCurrentMonth = (year, month) => {
    const now = new Date();
    return Number(year) === now.getFullYear() && Number(month) === now.getMonth() + 1;
};

// تقييمات الأدمنز التانيين (درافت أو منشورة) مقفولة لحد ما الأدمن الحالي ينشر تقييمه هو
// لنفس المدرب ونفس الشهر — نوع من الـ "blind review" بيمنع التحيّز بتقييمات التانيين
// (بس للشهر الحالي بس — الشهور اللي فاتت متاحة عادي)
const hasOwnPublished = async (evaluatorId, coachId, year, month) => {
    const own = await CoachEvaluation.findOne({
        coach: coachId,
        evaluator: evaluatorId,
        year,
        month,
        status: "published",
    }).select("_id");
    return !!own;
};

// بيصفّي ليستة تقييمات: تقييمي أنا يفضل زي ما هو، تقييم أدمن تاني بيتشال لحد ما يبقى
// عندي أنا تقييم منشور لنفس (المدرب، السنة، الشهر)
const filterBlindReviewList = async (documents, adminId) => {
    const others = documents.filter(
        (d) => !d.evaluator._id.equals(adminId) && isCurrentMonth(d.year, d.month)
    );
    if (!others.length) return documents;

    const keys = [...new Set(others.map((d) => `${d.coach._id}|${d.year}|${d.month}`))];
    const unlockedKeys = new Set();
    await Promise.all(
        keys.map(async (key) => {
            const [coachId, year, month] = key.split("|");
            if (await hasOwnPublished(adminId, coachId, Number(year), Number(month))) {
                unlockedKeys.add(key);
            }
        })
    );

    return documents.filter((d) => {
        if (d.evaluator._id.equals(adminId)) return true;
        return unlockedKeys.has(`${d.coach._id}|${d.year}|${d.month}`);
    });
};

// ============================================================================
// captureCoachStats — بياخد snapshot للبيانات الموجودة أصلًا عن الكشاف (مش الأدمن بيكتبها)
// النشاط (تقارير/ماتشات/ميديا) مسكوب على شهر التقييم، وعدد اللاعبين المسجلين تحته لقطة تراكمية
// ============================================================================
export const captureCoachStats = async (coachId, year, month) => {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));

    const [reportsCount, matchesAttended, mediaCount, playersManaged] = await Promise.all([
        ScoutingReport.countDocuments({
            coach: coachId,
            createdAt: { $gte: start, $lt: end },
        }),
        SeasonMatch.countDocuments({
            attendees: coachId,
            matchDate: { $gte: start, $lt: end },
        }),
        PlayerMedia.countDocuments({
            uploadedBy: coachId,
            createdAt: { $gte: start, $lt: end },
        }),
        Player.countDocuments({ coach: coachId }),
    ]);

    return {
        reportsCount,
        matchesAttended,
        mediaCount,
        playersManaged,
        capturedAt: new Date(),
    };
};

// @desc    Create a coach evaluation (draft) — any admin
// @route   POST /api/v1/coachEvaluations
// @access  Private - admin
export const create = asyncHandler(async (req, res, next) => {
    req.body.evaluator = req.user._id;
    req.body.stats = await captureCoachStats(
        req.body.coach,
        Number(req.body.year),
        Number(req.body.month)
    );

    const created = await CoachEvaluation.create(req.body);
    const document = await CoachEvaluation.findById(created._id).populate(populate);

    res.status(201).json({ status: "success", data: { document } });
});

// @desc    List evaluations — coach sees own+published; admin sees all (filterable)
// @route   GET /api/v1/coachEvaluations
// @access  Private - admin & coach
export const getAll = asyncHandler(async (req, res, next) => {
    const baseFilter = {};

    if (req.user.role !== "admin") {
        // الكشاف يشوف تقييماته المنشورة بس
        baseFilter.coach = req.user._id;
        baseFilter.status = "published";
    } else {
        // الأدمن يشوف كل تقييمات كل الأدمنز — مع فلاتر اختيارية
        if (req.query.coach) baseFilter.coach = req.query.coach;
        if (req.query.evaluator) baseFilter.evaluator = req.query.evaluator;
        if (req.query.year) baseFilter.year = Number(req.query.year);
        if (req.query.month) baseFilter.month = Number(req.query.month);
        if (req.query.status) baseFilter.status = req.query.status;
    }

    if (!req.query.sort) req.query.sort = "-year,-month";

    const features = new ApiFeature(
        CoachEvaluation.find(baseFilter),
        req.query,
        req.params,
        req.user
    );

    const documentCount = await CoachEvaluation.countDocuments(
        features.query.getFilter()
    );
    features.sort().limitFields().paginate(documentCount);

    let documents = await features.query.populate(populate);

    if (req.user.role === "admin") {
        documents = await filterBlindReviewList(documents, req.user._id);
    }

    res.status(200).json({
        status: "success",
        count: documents.length,
        pagination: features.pagination,
        data: { documents },
    });
});

// @desc    Get a specific evaluation
// @route   GET /api/v1/coachEvaluations/:id
// @access  Private - admin (any) & coach (own published only)
export const getSpecific = asyncHandler(async (req, res, next) => {
    const document = await CoachEvaluation.findById(req.params.id).populate(populate);
    if (!document) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }

    if (req.user.role !== "admin") {
        const ownPublished =
            document.coach._id.equals(req.user._id) && document.status === "published";
        if (!ownPublished) {
            return next(new AppError("Not authorized to view this evaluation", 403));
        }
    } else if (
        !document.evaluator._id.equals(req.user._id) &&
        isCurrentMonth(document.year, document.month)
    ) {
        const unlocked = await hasOwnPublished(
            req.user._id,
            document.coach._id,
            document.year,
            document.month
        );
        if (!unlocked) {
            return next(
                new AppError(
                    "Publish your own evaluation for this coach and month to view other admins' evaluations",
                    403
                )
            );
        }
    }

    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Update evaluation content (own only, status untouched)
// @route   PATCH /api/v1/coachEvaluations/:id
// @access  Private - admin (owner)
export const update = asyncHandler(async (req, res, next) => {
    const doc = await CoachEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);
    // بعد النشر التقييم بيتقفل نهائيًا — مفيش تعديل حتى لو الأدمن صاحبه
    if (doc.status !== "draft") {
        return next(new AppError("Published evaluations can no longer be edited", 400));
    }

    // findByIdAndUpdate علشان الـ pre(findOneAndUpdate) hook يعيد حساب overallRating
    const document = await CoachEvaluation.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
    }).populate(populate);

    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Publish evaluation — coach starts seeing it + gets notified
// @route   PATCH /api/v1/coachEvaluations/:id/publish
// @access  Private - admin (owner)
export const publish = asyncHandler(async (req, res, next) => {
    const doc = await CoachEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    if (doc.status !== "published") {
        // نعيد التقاط الإحصائيات علشان اللقطة المنشورة تبقى محدّثة
        doc.stats = await captureCoachStats(doc.coach, doc.year, doc.month);
        doc.status = "published";
        doc.publishedAt = doc.publishedAt || new Date();
        await doc.save();

        sendNotificationToUser(doc.coach.toString(), {
            type: "COACH_EVALUATION_PUBLISHED",
            data: {
                evaluationId: doc._id,
                overallRating: doc.overallRating,
                year: doc.year,
                month: doc.month,
            },
        });
    }

    const document = await CoachEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Archive evaluation — removes it from the coach's view
// @route   PATCH /api/v1/coachEvaluations/:id/archive
// @access  Private - admin (owner)
export const archive = asyncHandler(async (req, res, next) => {
    const doc = await CoachEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    doc.status = "archived";
    await doc.save();

    const document = await CoachEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Re-capture the auto stats for a draft before publishing
// @route   PATCH /api/v1/coachEvaluations/:id/refresh-stats
// @access  Private - admin (owner)
export const refreshStats = asyncHandler(async (req, res, next) => {
    const doc = await CoachEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    doc.stats = await captureCoachStats(doc.coach, doc.year, doc.month);
    await doc.save();

    const document = await CoachEvaluation.findById(doc._id).populate(populate);
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Delete evaluation (own only)
// @route   DELETE /api/v1/coachEvaluations/:id
// @access  Private - admin (owner)
export const deleting = asyncHandler(async (req, res, next) => {
    const doc = await CoachEvaluation.findById(req.params.id);
    if (!doc) {
        return next(new AppError(`No evaluation for this id: ${req.params.id}`, 404));
    }
    assertOwnEvaluation(doc, req);

    await doc.deleteOne();
    res.status(204).json({ status: "success" });
});

// @desc    Per-coach published trend + category averages + latest
// @route   GET /api/v1/coachEvaluations/summary
// @access  Private - admin (?coach=) & coach (own)
export const getSummary = asyncHandler(async (req, res, next) => {
    const coachId = req.user.role === "admin" ? req.query.coach : req.user._id;
    if (!coachId) {
        return next(new AppError("coach query param is required", 400));
    }

    const match = {
        coach: new mongoose.Types.ObjectId(coachId),
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
        CoachEvaluation.aggregate([
            { $match: match },
            { $sort: { year: 1, month: 1 } },
            { $project: { _id: 0, year: 1, month: 1, overallRating: 1 } },
        ]),
        CoachEvaluation.aggregate([
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

    const latest = await CoachEvaluation.findOne(match)
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

// @desc    Aggregate "overall" card for a coach/month across all admins — average +
//          drill-down list of every admin's evaluation. Locked until the requesting
//          admin has published their own evaluation for the same coach/month.
// @route   GET /api/v1/coachEvaluations/monthly?coach=&year=&month=
// @access  Private - admin
export const getMonthlyPanel = asyncHandler(async (req, res, next) => {
    const { coach, year, month } = req.query;
    const y = Number(year);
    const m = Number(month);

    if (isCurrentMonth(y, m)) {
        const unlocked = await hasOwnPublished(req.user._id, coach, y, m);
        if (!unlocked) {
            return next(
                new AppError(
                    "Publish your own evaluation for this coach and month to view the combined evaluation",
                    403
                )
            );
        }
    }

    const evaluations = await CoachEvaluation.find({
        coach,
        year: y,
        month: m,
        status: "published",
    })
        .sort({ overallRating: -1 })
        .populate(populate);

    const averageOverall = evaluations.length
        ? parseFloat(
              (evaluations.reduce((sum, e) => sum + e.overallRating, 0) / evaluations.length).toFixed(2)
          )
        : 0;

    res.status(200).json({
        status: "success",
        data: {
            count: evaluations.length,
            averageOverall,
            evaluations,
        },
    });
});
