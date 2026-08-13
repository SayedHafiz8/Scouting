import mongoose from "mongoose";
import { check, body } from "express-validator";
import bcrypt from "bcryptjs";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import User from "../../models/userModel.js";




export const singupValidate = [
    check('name').notEmpty().withMessage('Name Is Required')
        .isLength({min: 3}).withMessage("The name is too short")
        ,
    

    check('email').notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid Email format')
    .custom(async (val) => {
        const user = await User.findOne({ email: val });

        if (user) {
            throw new Error("email already exists");
        }

        return true;
    }),

    check('password').notEmpty().withMessage('Password is required')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage("Password must be at least 8 characters and include uppercase, lowercase and number"),


    check('passwordConfirm').notEmpty().withMessage("Password confimation is required")
        .custom((password, {req}) => {
            if (password != req.body.password){
                throw new Error('Password Confirmation incorrect')
            }
            return true;
        }),



    validatorMiddleware
    
];

export const loginValidate = [
    
    check('email').notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid Email format'),

    check('password').notEmpty().withMessage('Password is required'),

    validatorMiddleware

];

export const verifyVaultPasswordValidate = [
    check('password').notEmpty().withMessage('Password is required'),
    validatorMiddleware
];

// الراوت ده كان من غير أي validator خالص — الـbody كان بيقبل objects
// ({"email":{"$ne":null}} كان بيرجّع 200 ويولّد reset code لأول يوزر في الكولكشن).
export const forgotPasswordValidate = [
    check('email').notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid Email format'),
    validatorMiddleware
];

export const verifyResetCodeValidate = [
    check('resetCode').notEmpty().withMessage('Reset code is required')
        .isString().withMessage('Invalid reset code')
        .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
        .isNumeric().withMessage('Reset code must be 6 digits'),
    validatorMiddleware
];

export const resetPasswordValidate = [
    check('email').notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid Email format'),
    check('newPassword').notEmpty().withMessage('Password is required')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage("Password must be at least 8 characters and include uppercase, lowercase and number"),
    validatorMiddleware
];

// setup-admin بدون auth أصلاً — نفس شكل findOne({email}) فمحتاج نفس الحماية
export const setupAdminValidate = [
    check('email').notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid Email format'),
    validatorMiddleware
];

export const updateLoggedUserVal = [
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
    check('name').optional()
        .isLength({min: 3}).withMessage("The name is too short")
        ,
    

    check('email').optional()
    .isEmail().withMessage('Invalid Email format')
    .custom(async (val) => {
        const user = await User.findOne({ email: val });

        if (user) {
            throw new Error("email already exists");
        }

        return true;
    }),
    check('phoneNumber').optional()
        .matches(/^01[0125][0-9]{8}$/)
        .withMessage('Invalid Egyptian phone number'),
    validatorMiddleware
];


