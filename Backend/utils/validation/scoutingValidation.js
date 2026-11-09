import { body, param, query, validationResult } from "express-validator";
import AppError from "../appError.js";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import Player from "../../models/playedModel.js";
import Team from "../../models/teamModel.js";
import SeasonMatch from "../../models/seasonMatchModel.js";
import { ROLES } from "../../constants/roles.js";

// طلب مالك 2026-09 — استبدال كامل لمجموعة الفيلدز (راجع scoutingReportModel.js
// لتفاصيل القرار). القوائم دي مصدر الحقيقة اللي createValidate/updateValidate تحتها بترجع منه.
const technicalFields = ["turning", "dribbling", "tackling", "twoFooted", "longPassing", "shortPassing", "heading"];
const physicalFields = ["shortSprints", "longSprints", "agility", "aerialDuels", "groundDuels"];
const mentalFields = ["vision", "personality", "movement"];

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
        const match = await SeasonMatch.findById(val);
        if (!match) {
            throw new Error(`No season match for this id: ${val}`);
        }

        // اللاعب لعب مع فئة تانية والتقرير اترتبط بمباراة الفئة دي —
        // resolveMatchTypeFields تحقق منها بالفعل (نفس الفئة + نفس النادي +
        // النافذة الزمنية). مقارنتها بفئة اللاعب هنا كانت هترفض الحالة دي بالظبط.
        if (req.body.playedWithAgeGroup) return true;

        const playerId = req.params.playerId;
        if (playerId) {
            // perf — نفس مستند checkPlayerOwnership لو الحارس اشتغل قبله على الراوت
            const player = req.playerDoc ?? (await Player.findById(playerId).select("ageGroup"));
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

// طلب مالك 2026-09 — "التدريب" و"المباراة الودية" اتلغوا. فضل مسارين بس:
// - التقرير مربوط بمباراة من الجدول (seasonMatch) → الفرق والتاريخ بيتاخدوا منها.
// - مفيش مباراة → الكشاف بيحدد الفئة العمرية اللي اللاعب لعب معاها النهاردة
//   (playedWithAgeGroup، ممكن تكون غير فئته هو) + الفريق المنافس: اختيار من فرق
//   الفئة دي لو ليها فرق مسجلة، أو اسم حر لو مالهاش.
// فريق اللاعب نفسه بيتحط تلقائي كـhomeTeam في الكنترولر لو متسجل، وغير كده لازم يتكتب.
const teamFieldsRequired = body().custom(async (_, { req }) => {
    if (req.body.seasonMatch) return true;

    const hasHome = req.body.homeTeam || req.body.homeTeamName;
    const hasAway = req.body.awayTeam || req.body.awayTeamName;

    if (!hasAway) {
        throw new Error("You must provide the opposing team (pick it or type its name)");
    }
    if (!hasHome) {
        // فريق اللاعب بيتحط من السيرفر في resolveMatchTypeFields لو متسجل، فالفرع
        // ده بيتوصله بس لو اللاعب مالوش فريق أصلاً — ساعتها الاسم لازم يتكتب.
        // perf — نفس مستند checkPlayerOwnership (team ضمن الـselect بتاعه)
        const player =
            req.playerDoc ?? (await Player.findById(req.params.playerId).select("team"));
        if (!player?.team) {
            throw new Error("You must provide your player's team (pick it or type its name)");
        }
    }
    return true;
});

// homeTeam/awayTeam بقوا Team ObjectId refs — لازم يكونوا موجودين وتابعين لفئة
// عمرية معينة. طلب مالك 2026-09: لاعب بيلعب مع فئة أكبر منه، فالمنافس (awayTeam)
// بيتقاس على الفئة اللي لعب معاها (playedWithAgeGroup)، أما فريق اللاعب نفسه
// (homeTeam) فبيفضل متقاس على فئة اللاعب هو.
const teamBelongsToReportAgeGroup = (fieldName) =>
    body(fieldName)
        .optional()
        .isMongoId()
        .withMessage(`Invalid ${fieldName} id`)
        .custom(async (val, { req }) => {
            const team = await Team.findById(val);
            if (!team) {
                throw new Error(`No team for this id: ${val}`);
            }

            // ⚠️ الفئة المرجعية مختلفة للطرفين، وده جوهر الفيتشر:
            // فريق اللاعب نفسه (homeTeam، اللي resolveMatchTypeFields بيحطه من
            // player.team) تابع **لفئة اللاعب هو** حتى لما يلعب مع فئة أكبر.
            // اللي بيتقارن بالفئة اللي لعب معاها هو **المنافس وحده**.
            // من غير التفرقة دي، سيناريو الطلب نفسه كان بيترفض: لاعب فريقه تحت 13
            // لعب مع تحت 15 → homeTeam فئته 13 ≠ playedWithAgeGroup 15 → 400.
            let referenceAgeGroup =
                (fieldName === "awayTeam" ? req.body.playedWithAgeGroup : null) || null;
            const playerId = req.params.playerId;
            if (!referenceAgeGroup && playerId) {
                // perf — الشين ده بيتنده مرتين في نفس الطلب (homeTeam وawayTeam).
                // checkPlayerOwnership قبله جاب اللاعب بـageGroup ضمن الـselect،
                // فبنعيد استخدامه؛ وغير كده بنجيبه مرة واحدة ونخزّنها على الطلب.
                if (req.playerDoc) {
                    referenceAgeGroup = req.playerDoc.ageGroup ?? null;
                } else {
                    if (req._reportRefAgeGroup === undefined) {
                        const player = await Player.findById(playerId).select("ageGroup");
                        req._reportRefAgeGroup = player?.ageGroup ?? null;
                    }
                    referenceAgeGroup = req._reportRefAgeGroup;
                }
            }
            // audit fix B1 — نفس الحراسة فوق بالظبط: لاعب محترف أو فريق دوري
            // محترفين (team.ageGroup === undefined، teamModel.js pre-save hook)
            // مالهمش ageGroup، فمقارنة .toString() كانت بترمي TypeError بدل ما
            // ترفض أو تعدّي بقرار واضح.
            if (referenceAgeGroup && team.ageGroup && referenceAgeGroup.toString() !== team.ageGroup.toString()) {
                throw new Error(
                    fieldName === "awayTeam" && req.body.playedWithAgeGroup
                        ? "awayTeam must belong to the age group the player played with"
                        : `${fieldName} must belong to the player's age group`
                );
            }
            return true;
        });

// @desc    Validate create scouting report
// @route   POST /api/v1/players/:id/scouting-reports
export const createValidate = [
    lockField('player'),

    // matchDate بيتحدد من السيرفر (تاريخ الإنشاء، أو تاريخ المباراة لو متربط بـ seasonMatch) — ممنوع من العميل
    lockField("matchDate"),

    // طلب مالك 2026-09 — "friendly"/"training" ماعادش بيتقبلوا من العميل (باقيين
    // في المخطط للتقارير القديمة بس). كل تقرير جديد official.
    body("matchType").optional().isIn(["official"]).withMessage("Invalid matchType"),

    // الفئة العمرية اللي اللاعب لعب معاها لما مايكونش فيه مباراة من الجدول
    body("playedWithAgeGroup").optional({ nullable: true }).isMongoId().withMessage("Invalid playedWithAgeGroup id"),

    seasonMatchBelongsToPlayerAgeGroup,

    // لو التقرير متربط بـ seasonMatch، homeTeam/awayTeam بيتحددوا تلقائي من المباراة (مش لازم تتبعتوا)
    teamBelongsToReportAgeGroup("homeTeam"),
    teamBelongsToReportAgeGroup("awayTeam"),
    body("homeTeamName").optional().trim().isLength({ max: 100 }).withMessage("homeTeamName must be less than 100 characters"),
    body("awayTeamName").optional().trim().isLength({ max: 100 }).withMessage("awayTeamName must be less than 100 characters"),

    teamFieldsRequired,

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
    lockFieldExceptAdmin("assignedProScout"),
    body("assignedProScout").optional().isMongoId().withMessage("Invalid assignedProScout id"),

    validatorMiddleware,
];

// @desc    Validate update scouting report
// @route   PATCH /api/v1/scouting/:id
export const updateValidate = [
    param("id").isMongoId().withMessage("Invalid player id"),

    seasonMatchBelongsToPlayerAgeGroup,

    body("playedWithAgeGroup").optional({ nullable: true }).isMongoId().withMessage("Invalid playedWithAgeGroup id"),

    teamBelongsToReportAgeGroup("homeTeam"),
    teamBelongsToReportAgeGroup("awayTeam"),
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
    query("authorRole").optional().isIn([ROLES.COACH, ROLES.OBSERVER, ROLES.PRO_SCOUT]).withMessage("Invalid authorRole"),
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