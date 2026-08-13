import jwt from "jsonwebtoken";
import asyncHandler from "express-async-handler";
import AppError from "../utils/appError.js";

// بيتأكد إن فيه vault token صالح اتبعت في X-Vault-Token — لازم يبقى نفس الأدمن
// اللي عمل verifyVaultPassword، ومتخصص بس لفتح صور البطاقة الشخصية (مش access token عادي)
export const requireVaultToken = asyncHandler(async (req, res, next) => {
    const token = req.headers["x-vault-token"];
    if (!token) {
        return next(new AppError("Vault unlock required to view ID card images", 403));
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
    } catch {
        return next(new AppError("Vault session expired, please unlock again", 403));
    }

    if (!decoded.vault || decoded.userId !== req.user._id.toString()) {
        return next(new AppError("Invalid vault token", 403));
    }

    next();
});
