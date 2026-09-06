import mongoose from "mongoose";
import { check, body, query, param } from "express-validator";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import Team from "../../models/teamModel.js";
import Player from "../../models/playedModel.js";
import { teamScopeFor } from "../../services/scope.js";
import { logScopeDenial } from "../accessLog.js";
import { ROLES } from "../../constants/roles.js";

// Stage 2 — نفس نقطة الحقيقة اللي checkTeamScope (middlewares/ownership.js)
// بيستخدمها. من غيره كان فيه تحقق تاني (Team.findById خام) بيرجع "الفريق موجود"
// لأي team id — بما فيها فريق برّه نطاق proScout — يعني ?team=<premier id> على
// GET /players كان بيرجع 200 (فارغة) بينما ?team=<id وهمي> بيرجع 400. الفرق ده
// كان oracle: بيسرّب وجود/عدم وجود team id برّه النطاق حتى لو proScout مايقدرش
// يفتح /teams/<premier id> مباشرة (403 من checkTeamScope). دلوقتي نفس فحص
// teamScopeFor بيتطبّق هنا، فأي فريق برّه النطاق بيترفض بنفس الرسالة زي أي id
// وهمي — مفيش تفرقة قابلة للملاحظة.
//
// لغير proScout: teamScopeFor بترجع {} فالسلوك زي ما هو بالظبط (Principle III).
// Stage 4 (analysis finding D2) — تسجيل الرفض.
//
// Principle IV بيطلب إن **كل** محاولة وصول مرفوضة تتسجّل. الرفض ده بقى مسار
// قابل للوصول في الكتابة أول مرة في المرحلة دي (POST/PATCH /players اتفتحوا
// للـproScout)، وكان الوحيد اللي بيرفض من غير لوج.
//
// ⚠️ اللوج بيفرّق بين "فريق موجود بس برّه النطاق" و"فريق مش موجود"، لكن
// **الرد بيفضل مطابق بالحرف في الحالتين**. التفرقة دليل على السيرفر بس، ومش
// قابلة للملاحظة من العميل إطلاقاً — لو ظهرت في الرد (status أو رسالة مختلفة)
// بترجّع بالظبط الـoracle اللي المرحلة 2 قفلته: عدّ فرق الدوري التاني بالتخمين.
// راجع research R4 والتعليق فوق.
//
// الاستعلام التاني بيتنفّذ بس لما يكون فيه نطاق فعلاً (proScout) — لغير
// proScout الـscope بيبقى {} فبنخرج من غير أي تكلفة زيادة (Principle III).
const teamExistsInScope = (val, { req }) =>
    teamScopeFor(req).then((scope) =>
        Team.exists({ _id: val, ...scope }).then(async (exists) => {
            if (exists) return;

            if (Object.keys(scope).length) {
                const existsOutOfScope = await Team.exists({ _id: val });
                if (existsOutOfScope) {
                    logScopeDenial({ req, resource: "team", resourceId: val });
                }
            }

            return Promise.reject(new Error(`No team for this id: ${val}`));
        })
    );




// observer-matches-and-players — isProfessional بيتشتق من دوري الفريق وقت
// الإنشاء بس (playerController.resolveIsProfessionalFromTeam)، وlockField
// تحت بيمنع تعديله مباشرة زي كل الرولات. لكن lockField لوحدها ماكانتش كافية:
// عيد إسناد team لفريق دوري مختلف عن تصنيف اللاعب الحالي كان هيغيّر نفس الأثر
// بالتفاف — يرفع "محترف" عن لاعب أو يحطه على واحد ناشئ من غير ما يلمس
// isProfessional خالص. الفحص ده بيقفل الالتفاف ده للأوبزيرفر تحديداً؛ باقي
// الرولات زي ما هي بالظبط (Principle III — الكوتش وproScout ماكانش عندهم
// اعتماد بين team وisProfessional من الأساس).
const teamMatchesExistingClassification = async (teamId, { req }) => {
    if (req.user.role !== ROLES.OBSERVER) return true;
    if (!teamId) return true; // بيتشال team (تعيين teamName بدله) — مفيش تصادم يتفحص هنا

    const [player, team] = await Promise.all([
        Player.findById(req.params.id).select("isProfessional"),
        Team.findById(teamId).select("league"),
    ]);
    if (!player || !team) return true; // فحوصات تانية (الوجود، teamExistsInScope) بتتكفل بالحالة دي

    const teamIsProfessional = team.league === "professional";
    if (Boolean(player.isProfessional) !== teamIsProfessional) {
        throw new Error("Cannot reassign this player's team across the professional/youth boundary");
    }
    return true;
};

// فيلد ممنوع يتبعت من العميل خالص (بيتحدد من السيرفر بس) — نفس الـhelper المستخدم
// في scoutingValidation/coachEvaluationValidation/observerEvaluationValidation
const lockField = (field) =>
    body(field)
        .not()
        .exists()
        .withMessage(`${field} cannot be set manually`);

// admin-assign-players-reports-media — نفس lockField لكل رول ما عدا الأدمن. القيمة
// نفسها بتتحقق في الكنترولر (لازم يوزر فعلي بنفس الرول المطلوب) — هنا الشكل بس
// (mongoId مفرد أو مصفوفة). الاسم متعمد يبان مختلف عن lockField العادي عشان أي
// حقل جديد حساس (زي createdBy) يفضل على القفل الصارم بالافتراض، مش ده.
const lockFieldExceptAdmin = (field) =>
    body(field)
        .if((v, { req }) => req.user?.role !== ROLES.ADMIN)
        .not()
        .exists()
        .withMessage(`${field} cannot be set manually`);

export const getSpecificValidate = [
    check('id').isMongoId().withMessage("Invalid Player Id"),
    validatorMiddleware
];

export const getAllValidate = [
    check('team')
        .optional()
        .isMongoId().withMessage('Invalid Team Id')
        .custom(teamExistsInScope),
        query("keyword")
        .optional()
        .isString()
        .withMessage("keyword must be a string")
        .isLength({ max: 50 })
        .withMessage("keyword too long"),

    query("position")
        .optional()
        .isString()
        .withMessage("Invalid position"),

    query("preferredFoot")
        .optional()
        .isIn(["right", "left", "both"])
        .withMessage("preferredFoot must be: right, left, or both"),

    query("nationality")
        .optional()
        .isString()
        .withMessage("Invalid nationality"),

    query("ageGroup")
        .optional()
        .isMongoId()
        .withMessage("Invalid ageGroup id"),
    validatorMiddleware
];

export const createValidate = [
    check('name').notEmpty().withMessage('Name Is Required')
        .isLength({min: 3}).withMessage("The name is too short"),
    

    check('dateOfBirth').notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Invalid date format'),

    
    
    check('city').notEmpty().withMessage("The city of the player is required"),
    check('address').notEmpty().withMessage('Address is required'),
    check('phoneNumber').notEmpty().withMessage('please Enter the player phone number')
        .matches(/^01[0125][0-9]{8}$/)
        .withMessage('Invalid Egyptian phone number'),

    check('preferredFoot').notEmpty().withMessage("Eneter the preferd foot of the player (Reight - Left)"),
    check('height').optional({ nullable: true }).isNumeric().withMessage("Height must be a number"),
    check('weight').optional({ nullable: true }).isNumeric().withMessage("Weight must be a number"),
    check('team')
        .optional({ nullable: true })
        .isMongoId().withMessage('Invalid Team Id')
        .custom(teamExistsInScope),
    check('teamName')
        .optional({ nullable: true })
        .isString().withMessage('teamName must be text')
        .isLength({ max: 100 }).withMessage('teamName is too long'),
    body().custom((_, { req }) => {
        if (req.body.team && req.body.teamName) {
            throw new Error('Choose either an existing team or a free-text team name, not both');
        }
        return true;
    }),
    check('position').notEmpty().withMessage("Enter the position of the player"),
    // الملكية والإشراف والفئة العمرية قرارات سيرفر/أدمن — مش بتتبعت من العميل:
    // coach بيتحط من التوكن (setUserIdToBody/req.user._id)، ageGroup بيتشتق من
    // dateOfBirth في الـpre-save hook، observers وstatus بيتحطوا بس من الأدمن
    // عن طريق /players/:id/status و/players/:id/observers.
    lockField("status"),
    // admin-assign-players-reports-media — الأدمن وحده يقدر يبعت coach/observers/
    // proScout وقت الإنشاء (الشكل هنا، الدور الفعلي بيتحقق في playerController.create).
    // لكل رول تاني القفل زي ما كان بالظبط. القفل والفحص الشكلي فرعين منفصلين —
    // express-validator بيخلي .if() "لاصقة" على باقي نفس السلسلة، فدمجهم في سلسلة
    // واحدة كان هيخلي فحص isMongoId نفسه مشروط بنفس شرط القفل بالغلط.
    lockFieldExceptAdmin("coach"),
    check('coach').optional().isMongoId().withMessage('Invalid coach id'),
    lockFieldExceptAdmin("observers"),
    check('observers').optional().isArray().withMessage('observers must be an array'),
    check('observers.*').optional().isMongoId().withMessage('Invalid observer id'),
    lockFieldExceptAdmin("proScout"),
    check('proScout').optional().isMongoId().withMessage('Invalid proScout id'),
    lockField("profileImg"),
    lockField("ageGroup"),
    // Stage 2 — createdBy بيتحط من التوكن في playerController.create زي coach.
    // فاضل مقفول لكل الرولات بما فيها الأدمن — الإسناد لـproScout بيحصل عن طريق
    // حقل proScout فوق، مش createdBy مباشرة (راجع C-4 وملاحظة "الكلفة" في الخطة).
    lockField("createdBy"),
    // Stage 4b — isProfessional بيتحدد من رول المنشئ (أو فريق اللاعب المختار)
    // في الكنترولر. من غير القفل ده أي رول يبعتها true ويرفع قيد الفئة العمرية
    // (2007→2019) عن لاعبه.
    lockField("isProfessional"),
    validatorMiddleware

];

export const updateValidate = [
    check('id').isMongoId().withMessage("Invalid Player Id"),
    body()
        .custom((value, { req }) => {
            if (Object.keys(req.body).length === 0) {
                throw new Error("Please provide at least one field to update");
            }
            return true;
        }),
    body()
        .custom((value, { req }) => {

            const validFields = Object.values(req.body).filter(
                val => val !== "" && val !== null
            );

            if (validFields.length === 0) {
                throw new Error("Please provide valid data to update");
            }

            return true;
        }),
    check('team')
        .optional({ nullable: true })
        .isMongoId().withMessage('Invalid Team Id')
        .custom(teamExistsInScope)
        .custom(teamMatchesExistingClassification),
    check('teamName')
        .optional({ nullable: true })
        .isString().withMessage('teamName must be text')
        .isLength({ max: 100 }).withMessage('teamName is too long'),
    body().custom((_, { req }) => {
        if (req.body.team && req.body.teamName) {
            throw new Error('Choose either an existing team or a free-text team name, not both');
        }
        return true;
    }),
    // الملكية والإشراف والفئة العمرية قرارات سيرفر/أدمن — مش بتتعدّل من هنا:
    // الأدمن بيغيّرهم من /players/:id/status و/players/:id/observers بس (B4/mass-assignment fix).
    lockField("status"),
    lockField("coach"),
    lockField("observers"),
    lockField("profileImg"),
    lockField("ageGroup"),
    // Stage 2 — من غير القفل ده أي كوتش يقدر يعيد كتابة نسبة إنشاء أي لاعب
    // يملكه عن طريق PATCH /players/:id (services.updating بيمرّر req.body كما هو).
    lockField("createdBy"),
    // Stage 4b — ومن غيره كمان يقدر يحوّل لاعب ناشئ لـ"محترف" بتعديل عادي،
    // فيتخطّى قيد سنة الميلاد ويفضّي فئته العمرية.
    lockField("isProfessional"),
    validatorMiddleware
];

export const deleteValidate = [
    check('id').isMongoId().withMessage("Invalid player Id"),
    validatorMiddleware
];

export const updatePlayerStatusValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid player id"),

    body("status")
        .notEmpty()
        .withMessage("status is required")
        .isIn([
            "pending",
            "selected",
            "rejected",
            "observed"
        ])
        .withMessage("Invalid status"),

    // لما الحالة تبقى "observed" لازم يتبعت observers (array من IDs بتوع أوبزيرفرز)
    body("observers")
        .if(body("status").equals("observed"))
        .isArray({ min: 1 })
        .withMessage("Please choose at least one observer for this player"),

    body("observers.*")
        .if(body("status").equals("observed"))
        .isMongoId()
        .withMessage("Invalid observer id"),

    validatorMiddleware
];

// §9 — تعيين كوتش للاعب (أهمها: اللاعب اليتيم اللي كوتشه اتمسح). صلاحية الـid
// نفسه بتتفحص في الكنترولر (لازم يكون يوزر نشط بدور coach) — هنا الشكل بس.
export const assignPlayerCoachValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid player id"),

    body("coach")
        .notEmpty()
        .withMessage("coach is required")
        .bail()
        .isMongoId()
        .withMessage("Invalid coach id"),

    validatorMiddleware
];

// admin-assign-players-reports-media — نفس شكل assignPlayerCoachValidator بالظبط،
// لمحور proScout (createdBy). صلاحية الـid نفسها (لازم يوزر فعلي بدور proScout)
// بتتفحص في الكنترولر.
export const assignPlayerProScoutValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid player id"),

    body("proScout")
        .notEmpty()
        .withMessage("proScout is required")
        .bail()
        .isMongoId()
        .withMessage("Invalid proScout id"),

    validatorMiddleware
];

export const updatePlayerObserversValidator = [
    param("id")
        .isMongoId()
        .withMessage("Invalid player id"),

    body("observers")
        .isArray()
        .withMessage("observers must be an array (can be empty to remove all)"),

    body("observers.*")
        .isMongoId()
        .withMessage("Invalid observer id"),

    validatorMiddleware
];
