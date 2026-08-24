import mongoose from "mongoose";
import { check, body } from "express-validator";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import AgeGroup from "../../models/ageGroupModel.js";

// الدوري — الممتاز أو المحترفين
const LEAGUES = ["premier", "professional"];

export const getSpecificValidate = [
    check('id').isMongoId().withMessage("Invalid Hotel Id"),
    validatorMiddleware
];

export const getAllValidate = [
    check('ageGroup')
        .optional()
        .isMongoId().withMessage('Invalid AgeGroup Id')
        .custom((val) =>
            AgeGroup.findById(val).then((ageGroup) => {
                if(!ageGroup){
                    return Promise.reject(new Error(`No Age for this id: ${val}`))
                }
            })
        ),
    check('league').optional().isIn(LEAGUES).withMessage('Invalid league'),
    validatorMiddleware
];

export const createValidate = [
    check('name').notEmpty().withMessage("The name is required")
    .isLength({min: 3}).withMessage("The name is too short")
    .isLength({max: 30}).withMessage("The name is too long"),

    check('league').notEmpty().withMessage("league is required")
        .isIn(LEAGUES).withMessage("league must be either 'premier' or 'professional'"),

    check().custom(async (_, { req }) => {
        // Stage 13 — فرق دوري المحترفين مالهاش فئة عمرية (نفس نمط Player.isProfessional):
        // الفحص ده بالكامل بيتخطّى لـleague: "professional"، وTeam.ageGroup's pre('save')
        // هو المرجع النهائي اللي بيمسح الحقل فعلياً.
        if (req.body.league === 'professional') {
            return true;
        }

        const ageGroupId = req.body.ageGroup || req.params.id;

        if (!ageGroupId) {
            throw new Error("Team must belong to an ageGroup");
        }

        if (!mongoose.Types.ObjectId.isValid(ageGroupId)) {
            throw new Error("Invalid AgeGroup Id");
        }

        const ageGroup = await AgeGroup.findById(ageGroupId);

        if (!ageGroup) {
            throw new Error(`No AgeGroup for this id: ${ageGroupId}`);
        }

        req.body.ageGroup = ageGroupId;

        return true;
        }),
    
    check('clubName').notEmpty().withMessage("The club name is required"),
    validatorMiddleware
    
];

export const updateValidate = [
    check('id').isMongoId().withMessage("Invalid Team Id"),
    validatorMiddleware
];

export const deleteValidate = [
    check('id').isMongoId().withMessage("Invalid Team Id"),
    validatorMiddleware
];
