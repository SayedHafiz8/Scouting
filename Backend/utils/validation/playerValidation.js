import mongoose from "mongoose";
import { check, body, query, param } from "express-validator";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import Team from "../../models/teamModel.js";
import Player from "../../models/playedModel.js";




// فيلد ممنوع يتبعت من العميل خالص (بيتحدد من السيرفر بس) — نفس الـhelper المستخدم
// في scoutingValidation/coachEvaluationValidation/observerEvaluationValidation
const lockField = (field) =>
    body(field)
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
        .custom((val) =>
            Team.findById(val).then((team) => {
                if(!team){
                    return Promise.reject(new Error(`No team for this id: ${val}`))
                }
            })
        ),
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
        .custom((val) =>
            Team.findById(val).then((team) => {
                if (!team) {
                    return Promise.reject(new Error(`No team for this id: ${val}`));
                }
            })
        ),
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
    lockField("coach"),
    lockField("observers"),
    lockField("profileImg"),
    lockField("ageGroup"),
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
        .custom((val) =>
            Team.findById(val).then((team) => {
                if (!team) {
                    return Promise.reject(new Error(`No team for this id: ${val}`));
                }
            })
        ),
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
