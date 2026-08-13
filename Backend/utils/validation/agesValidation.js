import { check, body } from "express-validator";
import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import AgeGroup from "../../models/ageGroupModel.js";

export const getAgeValidator = [
    check('id').isMongoId().withMessage(`The id Not valid`),
    validatorMiddleware
];

export const createValidator = [
    check('name')
        .notEmpty().withMessage('Name Is Required')
        .custom(async (val) => {
            const age = await AgeGroup.findOne({ name: val });

            if (age) {
                throw new Error("name already exists");
            }

            return true;
        }),
    check('birthYear')
        .notEmpty().withMessage("Birth year is required")
        .isInt({ min: 2007, max: 2019 }).withMessage("Birth year must be between 2007 and 2019")
        .custom(async (val) => {
            const exists = await AgeGroup.findOne({ birthYear: val });

            if (exists) {
                throw new Error("birth year already exists");
            }

            return true;
        }),

    validatorMiddleware
];

export const deleteValidator = [
    check('id').isMongoId().withMessage(`The id  Not valid`),

    validatorMiddleware
];

export const updateValidator = [
    check('id').isMongoId().withMessage(`The id  Not valid`),
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
    validatorMiddleware
];