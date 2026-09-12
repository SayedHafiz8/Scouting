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
import { ROLES } from "../constants/roles.js";
import { isCurrentMonthUTC as isCurrentMonth, currentYearMonthUTC } from "../utils/time.js";

// audit-database I2 — وايت ليست الترتيب. الكونترولر بيفرض "-year,-month"
// كافتراضي فوق، والاتنين آخر حقلين في {coach: 1, status: 1, year: -1, month: -1}
// وفي {evaluator: 1, year: -1, month: -1} — فكل مسارات القايمة (الكشاف بيشوف
// بتاعه، الأدمن بيشوف تقييماته) مغطّاة. overallRating **مش** هنا عن قصد: مفيش
// index عليه، وقايمة التقييمات مسكوبة بس مش صغيرة بالضرورة.
const EVALUATION_SORT_FIELDS = ["year", "month", "createdAt"];

// الترتيب لما العميل مايبعتش ?sort.
//
// ⚠️ ماينفعش يتطبّق بـ`req.query.sort = "..."`: في Express 5 الـquery عبارة عن
// getter بيعيد الـparse في كل قراءة من غير memoization — مقيس:
// `req.query === req.query` بترجع false. فالكتابة بتروح على أوبجكت مؤقت وبتضيع
// أول ما ApiFeature يقرا الـquery تاني، والاستعلام بيتنفّذ **بلا أي ترتيب**.
// (نفس الفخ الموثّق في middlewares/rejectOperatorKeys.js.)
//
// مفيش `,-_id` هنا: فاصل التعادل بقى مسؤولية ApiFeature.sort() وبيتحط لكل ترتيب.
// ومهم هنا بالذات — (year, month) أسوأ حالة تعادل في المشروع (كل تقييمات نفس
// الشهر متساوية تماماً)، و?sort=-year اللي بيبعته العميل كان لسه بيسيبهم عشوائيين
// حتى بعد إصلاح الافتراضي. راجع الشرح في ApiFeature.sort().
const DEFAULT_SORT = "-year,-month";

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

// القفل بيتطبق بس على الشهر الحالي — تقييمات الشهور اللي فاتت تفضل ظاهرة عادي زي ما كانت.
//
// audit-backend C3 — المقارنة بتيجي من utils/time.js و**لازم** تفضل UTC. كانت
// متكتبة هنا بـ getFullYear/getMonth (توقيت السيرفر المحلي) بينما year/month
// الجايين من العميل متولّدين UTC، فكان فيه نافذة عند حدود الشهر عرضها = فرق
// المنطقة الزمنية، القفل فيها بيتخطّى بالكامل. التفاصيل والحادثة المقيسة في
// utils/time.js — متترجعش تكتب المقارنة محلياً هنا تاني.

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

// ============================================================================
// قفل المراجعة العمياء **كـpredicate جوه الاستعلام**، مش تصفية بعد الجلب.
//
// audit-backend P1 — الشكل القديم (filterBlindReviewList) كان بيشيل المستندات
// من المصفوفة **بعد** ما الاستعلام يرجع، والعدّ كان اتحسب قبل كده. فالرد كان
// بيطلع بـcount مصفّى وpagination مش مصفّى:
//
//     count: 0,  pagination: { numberOfPages: 1, next: null }
//
// يعني الأدمن A كان يقدر يعرف إن الأدمن B كتب تقييم للمدرب ده الشهر ده — من
// الميتاداتا، من غير ما يقرا حرف. وده بالظبط اللي القفل موجود عشانه: القفل
// مش بيخفي **كلام** B، هو بيخفي **إن B قيّم أصلاً**، عشان A ما يتأثرش قبل ما
// يكتب تقييمه هو. معرفة الوجود لوحدها كافية للتحيّز.
//
// وكان فيه باج تاني في نفس الدالة في الاتجاه العكسي (تقييد زيادة): `others`
// كانت بتجمع تقييمات الشهر الحالي بس، وunlockedKeys منها، بس الفلتر الأخير كان
// بيختبر **كل** مستند مش بتاعي على unlockedKeys — فتقييم شهر فات لأدمن تاني
// مفتاحه مش موجود وبيتشال، رغم إن GET /:id بيرجّعه عادي. الـearly return
// (`if (!others.length)`) كان بيخفي الباج ده لما الصفحة مافيهاش تقييم شهر حالي
// لأدمن تاني.
//
// الشكل الجديد بيحط القاعدة في الفلتر نفسه، فالعدّ والجلب بيمشوا على نفس
// الشرط بالتعريف — **مستحيل تركيبياً** إن العدّ يوصف مستندات المستدعي مش
// قادر يجيبها. ونفس شكل باقي الكنترولرز: النطاق في baseFilter.
//
// القاعدة (نفس getSpecific بالحرف، منفية): المستند بيتخفى لو **كل** دول صح:
//   1. evaluator مش أنا
//   2. الشهر هو الشهر الحالي (UTC)
//   3. ومانشرتش أنا تقييم لنفس (المدرب، السنة، الشهر)
//
// ليه الشرط التالت ينفع يبقى predicate: القفل على الشهر الحالي بس، فالسؤال
// "نشرت لنفس (المدرب، السنة، الشهر)؟" بيتحول لسؤال واحد محدود — "أنهي مدربين
// نشرت لهم الشهر الحالي؟" — استعلام واحد مستقل عن محتوى الصفحة. مفيش $lookup
// ولا شغل async لكل مستند.
//
// ملاحظة على evaluator: null (§12 بيصفّره لما أدمن يتمسح): الشكل القديم كان
// بيعمل `d.evaluator._id.equals(...)` على null → TypeError. الـpredicate
// بيتعامل معاه كـ"مش بتاعي" فبيتقفل لو شهر حالي وغير مفتوح — من غير كراش.
const blindReviewFilter = async (adminId) => {
    const { year, month } = currentYearMonthUTC();

    const unlockedCoachIds = await CoachEvaluation.distinct("coach", {
        evaluator: adminId,
        year,
        month,
        status: "published",
    });

    return {
        $nor: [
            {
                evaluator: { $ne: adminId },
                year,
                month,
                coach: { $nin: unlockedCoachIds },
            },
        ],
    };
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

    if (req.user.role !== ROLES.ADMIN) {
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

        // قفل المراجعة العمياء جوه الفلتر — قبل بناء ApiFeature، فالعدّ والجلب
        // الاتنين بيورثوه. بيستخدم مفتاح $nor لوحده فمفيش تصادم مع أي فلتر فوق.
        Object.assign(baseFilter, await blindReviewFilter(req.user._id));
    }

    const queryParams = { ...req.query, sort: req.query.sort || DEFAULT_SORT };

    const features = new ApiFeature(
        CoachEvaluation.find(baseFilter),
        queryParams,
        req.params,
        req.user
    );

    // perf audit — العدّ والجلب مستقلين، فبيتنفذوا مع بعض. نفس الفلتر للاتنين.
    //
    // audit-backend P1 — قفل المراجعة العمياء بقى جوه baseFilter فوق، يعني
    // countFilter شايله بالفعل. العدّ والجلب بيمشوا على نفس الشرط بالتعريف،
    // فالـpagination مابيقدرش يوصف مستندات المستدعي مش شايفها.
    const countFilter = features.query.getFilter();
    features.sort(EVALUATION_SORT_FIELDS).limitFields().applyPagination();

    const [documentCount, documents] = await Promise.all([
        CoachEvaluation.countDocuments(countFilter),
        features.query.populate(populate),
    ]);
    features.buildPagination(documentCount);

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

    if (req.user.role !== ROLES.ADMIN) {
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
    const coachId = req.user.role === ROLES.ADMIN ? req.query.coach : req.user._id;
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
