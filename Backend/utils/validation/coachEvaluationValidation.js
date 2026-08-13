import { body, param, query } from "express-validator";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import User from "../../models/userModel.js";
import CoachEvaluation from "../../models/coachEvaluationModel.js";
import { EVALUATION_METRIC_PATHS } from "../coachEvaluationCriteria.js";

// معيار مطلوب (للـ create) — من 1 لـ 10
const requiredRating = (path) =>
    body(path)
        .notEmpty()
        .withMessage(`${path} is required`)
        .bail()
        .isFloat({ min: 1, max: 10 })
        .withMessage(`${path} must be a number between 1 and 10`);

// معيار اختياري (للـ update)
const optionalRating = (path) =>
    body(path)
        .optional()
        .isFloat({ min: 1, max: 10 })
        .withMessage(`${path} must be a number between 1 and 10`);

// فيلد ممنوع يتبعت من العميل خالص (بيتحدد من السيرفر بس)
const lockField = (field) =>
    body(field)
        .not()
        .exists()
        .withMessage(`${field} cannot be set manually`);

const textField = (name) =>
    body(name)
        .optional()
        .isString()
        .withMessage(`${name} must be text`)
        .isLength({ max: 1000 })
        .withMessage(`${name} must be less than 1000 characters`);

// الكشاف لازم يكون موجود ودوره coach
const coachExists = body("coach")
    .notEmpty()
    .withMessage("coach is required")
    .bail()
    .isMongoId()
    .withMessage("Invalid coach id")
    .custom(async (val) => {
        const user = await User.findById(val);
        if (!user) throw new Error("Coach not found");
        if (user.role !== "coach") throw new Error("This user is not a coach");
        return true;
    });

const yearValid = body("year")
    .notEmpty()
    .withMessage("year is required")
    .bail()
    .isInt({ min: 2020, max: 2100 })
    .withMessage("year must be a valid year");

const monthValid = body("month")
    .notEmpty()
    .withMessage("month is required")
    .bail()
    .isInt({ min: 1, max: 12 })
    .withMessage("month must be between 1 and 12");

// كل أدمن له تقييم مستقل — الحد بيبقى على الأدمن الحالي بس (مش على كل الأدمنز)
const noDuplicateForThisAdmin = body().custom(async (_, { req }) => {
    const { coach, year, month } = req.body;
    if (!coach || !year || !month) return true; // فاليديشن تانية بتتكفل بالناقص
    const existing = await CoachEvaluation.findOne({
        coach,
        evaluator: req.user._id,
        year: Number(year),
        month: Number(month),
    });
    if (existing) {
        throw new Error("You already have an evaluation for this coach in this month");
    }
    return true;
});

// @route POST /api/v1/coachEvaluations
export const createValidate = [
    lockField("evaluator"),
    lockField("overallRating"),
    lockField("status"),
    lockField("publishedAt"),
    lockField("stats"),

    coachExists,
    yearValid,
    monthValid,

    ...EVALUATION_METRIC_PATHS.map(requiredRating),

    textField("strengths"),
    textField("areasForImprovement"),
    textField("notes"),

    noDuplicateForThisAdmin,

    validatorMiddleware,
];

// @route PATCH /api/v1/coachEvaluations/:id
export const updateValidate = [
    param("id").isMongoId().withMessage("Invalid evaluation id"),

    // الهوية والفترة والحالة ثابتين بعد الإنشاء — الحالة بتتغير عن طريق publish/archive بس
    lockField("coach"),
    lockField("evaluator"),
    lockField("year"),
    lockField("month"),
    lockField("overallRating"),
    lockField("status"),
    lockField("publishedAt"),
    lockField("stats"),

    ...EVALUATION_METRIC_PATHS.map(optionalRating),

    textField("strengths"),
    textField("areasForImprovement"),
    textField("notes"),

    validatorMiddleware,
];

// @route PATCH /:id/publish | /:id/archive | /:id/refresh-stats — و get/delete واحد
export const idParamValidate = [
    param("id").isMongoId().withMessage("Invalid evaluation id"),
    validatorMiddleware,
];

export const getSpecificValidate = idParamValidate;
export const deleteValidate = idParamValidate;

// @route GET /api/v1/coachEvaluations
export const getAllValidate = [
    query("coach").optional().isMongoId().withMessage("Invalid coach id"),
    query("evaluator").optional().isMongoId().withMessage("Invalid evaluator id"),
    query("year").optional().isInt().withMessage("year must be a number"),
    query("month").optional().isInt({ min: 1, max: 12 }).withMessage("month must be between 1 and 12"),
    query("status").optional().isIn(["draft", "published", "archived"]).withMessage("Invalid status"),
    validatorMiddleware,
];

// @route GET /api/v1/coachEvaluations/summary
export const summaryValidate = [
    query("coach").optional().isMongoId().withMessage("Invalid coach id"),
    validatorMiddleware,
];

// @route GET /api/v1/coachEvaluations/monthly
export const monthlyPanelValidate = [
    query("coach").notEmpty().withMessage("coach is required").bail().isMongoId().withMessage("Invalid coach id"),
    query("year").notEmpty().withMessage("year is required").bail().isInt({ min: 2020, max: 2100 }).withMessage("year must be a valid year"),
    query("month").notEmpty().withMessage("month is required").bail().isInt({ min: 1, max: 12 }).withMessage("month must be between 1 and 12"),
    validatorMiddleware,
];
