import { body, param, query, validationResult } from "express-validator";
import AppError from "../appError.js";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import Player from "../../models/playedModel.js";
import Team from "../../models/teamModel.js";
import SeasonMatch from "../../models/seasonMatchModel.js";
import { ROLES } from "../../constants/roles.js";

const technicalFields = ["passing", "dribbling", "shooting", "ballControl"];
const physicalFields = ["speed", "stamina", "strength", "agility"];
const mentalFields = ["positioning", "decisionMaking", "teamwork", "attitude"];

// rating field (1 -> 10) - مطلوبة (للـ create)
const requiredRating = (path) =>
    body(path)
        .notEmpty()
        .withMessage(`${path} is required`)
        .bail()
        .isFloat({ min: 1, max: 10 })
        .withMessage(`${path} must be a number between 1 and 10`);

// rating field (1 -> 10) - اختيارية (للـ update)
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

// admin-assign-players-reports-media — نفس فكرة lockFieldExceptAdmin في
// playerValidation.js: مقفول لكل رول ما عدا الأدمن. القيمة (لازم تكون أوبزيرفر
// معيَّن فعلاً على اللاعب) بتتحقق في الكنترولر، هنا الشكل بس.
const lockFieldExceptAdmin = (field) =>
    body(field)
        .if((v, { req }) => req.user?.role !== ROLES.ADMIN)
        .not()
        .exists()
        .withMessage(`${field} cannot be set manually`);

// لو التقرير مربوط بمباراة موسم، لازم المباراة دي تتبع نفس الفئة العمرية بتاعة اللاعب
const seasonMatchBelongsToPlayerAgeGroup = body("seasonMatch")
    .optional()
    .isMongoId()
    .withMessage("Invalid seasonMatch id")
    .custom(async (val, { req }) => {
        const match = await SeasonMatch.findById(val).setOptions({ skipPopulate: true });
        if (!match) {
            throw new Error(`No season match for this id: ${val}`);
        }

        const playerId = req.params.playerId;
        if (playerId) {
            const player = await Player.findById(playerId).select("ageGroup");
            // audit fix B1 — نفس الحراسة المطبَّقة في seasonMatchValidation.js
            // (teamBelongsToMatchAgeGroup) لنفس سبب Stage 13/C-4 بالظبط: لاعب محترف
            // (isProfessional) أو مباراة دوري محترفين مالهمش ageGroup خالص —
            // بيبقى undefined بحكم التصميم (playedModel.js pre-save hook،
            // seasonMatchModel.js pre-save hook). من غير الحراسة دي، أي proScout
            // بيحاول يربط تقرير بمباراة كان بيكسر بـTypeError على .toString() لقيمة
            // undefined بدل قرار نطاق واضح — يعني الرول ده كان عاجز عن كتابة أي
            // تقرير على لاعبه المحترف. مسار اللاعب الناشئ يفضل مطابق حرفياً
            // (Principle III): لو الاتنين عندهم ageGroup، المقارنة بتحصل زي ما كانت.
            if (player?.ageGroup && match.ageGroup && player.ageGroup.toString() !== match.ageGroup.toString()) {
                throw new Error("seasonMatch must belong to the player's age group");
            }
        }
        return true;
    });

// حسب matchType بيختلف المطلوب:
// - official: لازم seasonMatch (بيتحدد تلقائي في الكنترولر لو الفريق متسجل) أو homeTeam/awayTeam
//   (ref أو اسم حر) لو اللاعب مش تابع لفريق متسجل
// - friendly: لازم فريق منافس بس (ref أو اسم حر) — فريق اللاعب بيتحط تلقائي لو متسجل
// - training: مفيش فرق مطلوبة خالص
// ملاحظة: قيد "التقرير يوم المباراة بس لو فريق اللاعب متسجل ونوعه official" بيتفرض في
// الكنترولر (resolveMatchTypeFields في scoutingReportController.js) قبل الـ validators دي —
// بيدور على مباراة النهارده بتاعت فريق اللاعب وبيحط seasonMatch في الـ body تلقائي، فبيقفل
// ثغرة رفع تقرير رسمي لمباراة خلصت من كذا يوم.
const teamFieldsRequiredByMatchType = body().custom(async (_, { req }) => {
    const matchType = req.body.matchType || "official";
    if (matchType === "training") return true;

    const hasHome = req.body.homeTeam || req.body.homeTeamName;
    const hasAway = req.body.awayTeam || req.body.awayTeamName;

    if (matchType === "friendly") {
        if (!hasAway) {
            throw new Error("You must provide the opposing team (pick it or type its name) for a friendly match");
        }
        if (!hasHome) {
            const player = await Player.findById(req.params.playerId).select("team");
            if (!player?.team) {
                throw new Error("You must provide your player's team (pick it or type its name) for a friendly match");
            }
        }
        return true;
    }

    // official
    if (!req.body.seasonMatch && !(hasHome && hasAway)) {
        throw new Error("homeTeam and awayTeam are required unless a seasonMatch is provided");
    }
    return true;
});

// homeTeam/awayTeam بقوا Team ObjectId refs — لازم يكونوا موجودين وتابعين لنفس فئة اللاعب العمرية
const teamBelongsToPlayerAgeGroup = (fieldName) =>
    body(fieldName)
        .optional()
        .isMongoId()
        .withMessage(`Invalid ${fieldName} id`)
        .custom(async (val, { req }) => {
            const team = await Team.findById(val);
            if (!team) {
                throw new Error(`No team for this id: ${val}`);
            }

            const playerId = req.params.playerId;
            if (playerId) {
                const player = await Player.findById(playerId).select("ageGroup");
                // audit fix B1 — نفس الحراسة فوق بالظبط: لاعب محترف أو فريق دوري
                // محترفين (team.ageGroup === undefined، teamModel.js pre-save hook)
                // مالهمش ageGroup، فمقارنة .toString() كانت بترمي TypeError بدل ما
                // ترفض أو تعدّي بقرار واضح.
                if (player?.ageGroup && team.ageGroup && player.ageGroup.toString() !== team.ageGroup.toString()) {
                    throw new Error(`${fieldName} must belong to the player's age group`);
                }
            }
            return true;
        });

// @desc    Validate create scouting report
// @route   POST /api/v1/players/:id/scouting-reports
export const createValidate = [
    lockField('player'),

    // matchDate بيتحدد من السيرفر (تاريخ الإنشاء، أو تاريخ المباراة لو متربط بـ seasonMatch) — ممنوع من العميل
    lockField("matchDate"),

    body("matchType").optional().isIn(["official", "friendly", "training"]).withMessage("Invalid matchType"),

    seasonMatchBelongsToPlayerAgeGroup,

    // لو التقرير متربط بـ seasonMatch، homeTeam/awayTeam بيتحددوا تلقائي من المباراة (مش لازم تتبعتوا)
    teamBelongsToPlayerAgeGroup("homeTeam"),
    teamBelongsToPlayerAgeGroup("awayTeam"),
    body("homeTeamName").optional().trim().isLength({ max: 100 }).withMessage("homeTeamName must be less than 100 characters"),
    body("awayTeamName").optional().trim().isLength({ max: 100 }).withMessage("awayTeamName must be less than 100 characters"),

    teamFieldsRequiredByMatchType,

    ...technicalFields.map((field) => requiredRating(`technical.${field}`)),
    ...physicalFields.map((field) => requiredRating(`physical.${field}`)),
    ...mentalFields.map((field) => requiredRating(`mental.${field}`)),

    body("notes")
        .optional()
        .isString()
        .withMessage("notes must be text")
        .isLength({ max: 1000 })
        .withMessage("notes must be less than 1000 characters"),

    // الـ coach والـ overallRating بيتحددوا من السيرفر (middleware) مش من العميل
    lockField("coach"),
    lockField("overallRating"),

    // admin-assign-players-reports-media — الأدمن وحده يقدر يبعت assignedObserver
    // (المؤلف الفعلي بيبقى هو، مش الأدمن — راجع scoutingReportController.create).
    lockFieldExceptAdmin("assignedObserver"),
    body("assignedObserver").optional().isMongoId().withMessage("Invalid assignedObserver id"),

    validatorMiddleware,
];

// @desc    Validate update scouting report
// @route   PATCH /api/v1/scouting/:id
export const updateValidate = [
    param("id").isMongoId().withMessage("Invalid player id"),

    seasonMatchBelongsToPlayerAgeGroup,

    teamBelongsToPlayerAgeGroup("homeTeam"),
    teamBelongsToPlayerAgeGroup("awayTeam"),
    body("homeTeamName").optional().trim().isLength({ max: 100 }).withMessage("homeTeamName must be less than 100 characters"),
    body("awayTeamName").optional().trim().isLength({ max: 100 }).withMessage("awayTeamName must be less than 100 characters"),

    ...technicalFields.map((field) => optionalRating(`technical.${field}`)),
    ...physicalFields.map((field) => optionalRating(`physical.${field}`)),
    ...mentalFields.map((field) => optionalRating(`mental.${field}`)),

    body("notes")
        .optional()
        .isString()
        .withMessage("notes must be text")
        .isLength({ max: 1000 })
        .withMessage("notes must be less than 1000 characters"),

    // ممنوع تتغير ملكية التقرير، التاريخ، أو الـ overallRating بعد إنشاءه
    lockField("matchDate"),
    lockField("coach"),
    lockField("player"),
    lockField("overallRating"),

    validatorMiddleware,
];

// @desc    Validate list scouting reports for a player
// @route   GET /api/v1/players/:playerId/reports
export const getAllValidate = [
    // بس الأدمن هو اللي بيستخدم الفلتر ده (يشوف تقارير الكشافين أو الأوبزيرفرز بس)
    query("authorRole").optional().isIn([ROLES.COACH, ROLES.OBSERVER]).withMessage("Invalid authorRole"),
    validatorMiddleware,
];

// @desc    Validate get specific scouting report
// @route   GET /api/v1/scouting/:id
export const getSpecificValidate = [
    param("id").isMongoId().withMessage("Invalid player id"),
    validatorMiddleware,
];

// @desc    Validate delete scouting report
// @route   DELETE /api/v1/scouting/:id
export const deleteValidate = [
    param("id").isMongoId().withMessage("Invalid player id"),
    validatorMiddleware,
];

export const statisticsValidate = [
    param("playerId").isMongoId().withMessage("Invalid player id"),
    validatorMiddleware,
];