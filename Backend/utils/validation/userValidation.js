import mongoose from "mongoose";
import { check, body } from "express-validator";
import bcrypt from "bcryptjs";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import User from "../../models/userModel.js";


export const getSpecificValidate = [
    check('id').isMongoId().withMessage("Invalid User Id"),
    validatorMiddleware
];


export const createValidate = [
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
    check('phoneNumber').notEmpty().withMessage('please Enter the player phone number')
        .matches(/^01[0125][0-9]{8}$/)
        .withMessage('Invalid Egyptian phone number'),

    check('address').optional()
        .isLength({ min: 3 }).withMessage("The address is too short"),
    check('birthDate').optional()
        .isISO8601().withMessage("Invalid birth date"),

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

export const changeUserPassword = [
    body("currentPassword").notEmpty().withMessage("Enter Your Cuurent Password"),
    body("confirmPassword").notEmpty().withMessage("Confirm Password is required"),
    body("password").notEmpty().withMessage("Enter the new password")
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage("Password must be at least 8 characters and include uppercase, lowercase and number")
        .custom(async(val, {req})=> {
            const id = req.params.id || req.user._id
            const user = await User.findById(id);
            if(!user){
                throw new Error("There is no user for this id");
            }
            const isCorrectPassword = await bcrypt.compare(req.body.currentPassword, user.password);
            if(!isCorrectPassword){
                throw new Error("Incorrect Current password");
            }
            if(val != req.body.confirmPassword){
                throw new Error("Password confirmation incorrect");
            }
        }),

        validatorMiddleware
];

export const updateValidate = [
    check('id').isMongoId().withMessage("Invalid user Id"),
    check('name').optional()
        .isLength({ min: 3 }).withMessage("The name is too short"),
    check('phoneNumber').optional()
        .matches(/^01[0125][0-9]{8}$/)
        .withMessage('Invalid Egyptian phone number'),
    check('address').optional()
        .isLength({ min: 3 }).withMessage("The address is too short"),
    check('birthDate').optional()
        .isISO8601().withMessage("Invalid birth date"),
    validatorMiddleware
];

export const deleteValidate = [
    check('id').isMongoId().withMessage("Invalid user Id"),
    validatorMiddleware
];
