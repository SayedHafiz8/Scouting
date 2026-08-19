import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import AppError from "../utils/appError.js";
import User from "../models/userModel.js";
import sendEmail from "../utils/sendEmail.js";
import { ROLES } from "../constants/roles.js";

// ============================
// helpers
// ============================

const generateAccessToken = (userId) =>
    jwt.sign(
        { userId },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.JWT_EXPIRE_TIME } // 15m
    );

const generateRefreshToken = (userId) =>
    jwt.sign(
        { userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRE_TIME } // 7d
    );

const sendRefreshTokenCookie = (res, refreshToken) => {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,  // مش ممكن يتوصله بـ JS
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 أيام
    });
};

const sendTokenResponse = async (res, user, statusCode) => {
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // احفظ الـ refresh token في الـ DB
    user.refreshToken = refreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    // ابعت الـ refresh token في cookie
    sendRefreshTokenCookie(res, refreshToken);

    res.status(statusCode).json({
        status: "success",
        data: {
            user,
            accessToken,
        },
    });
};

// ============================
// signup
// ============================
export const signup = asyncHandler(async (req, res, next) => {
    const user = await User.create({
        name: req.body.name,
        email: req.body.email,
        password: req.body.password,
        role: ROLES.COACH,
    });

    await sendTokenResponse(res, user, 201);
});

// ============================
// login
// ============================
export const login = asyncHandler(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
        return next(new AppError("Incorrect email or password", 401));
    }

    const isMatch = await bcrypt.compare(req.body.password, user.password);

    if (!isMatch) {
        return next(new AppError("Incorrect email or password", 401));
    }

    await sendTokenResponse(res, user, 200);
});

// ============================
// refresh token
// ============================
export const refreshToken = asyncHandler(async (req, res, next) => {
    const token = req.cookies.refreshToken;

    if (!token) {
        return next(new AppError("No refresh token, please login again", 401));
    }
    
    // تحقق من الـ token
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    // جيب الـ user وتحقق إن الـ token في الـ DB
    const user = await User.findById(decoded.userId).select("+refreshToken +refreshTokenExpires");

    if (!user || user.refreshToken !== token) {
        return next(new AppError("Invalid refresh token, please login again", 401));
    }

    if (user.refreshTokenExpires < Date.now()) {
        return next(new AppError("Refresh token expired, please login again", 401));
    }
    
    // ✅ جنرت access token جديد وبرجع بيانات اليوزر عشان الـ frontend يستعيد الـ session
    const newAccessToken = generateAccessToken(user._id);

    // rotate the refresh token
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken = newRefreshToken;
    user.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();
    sendRefreshTokenCookie(res, newRefreshToken);

    res.status(200).json({
        status: "success",
        data: {
            accessToken: newAccessToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phoneNumber: user.phoneNumber,
                profileImg: user.profileImg,
                active: user.active,
            },
        }
    });
});

// ============================
// logout
// ============================
export const logout = asyncHandler(async (req, res, next) => {
    // الـ logout بيعتمد على الـ refresh cookie مش على access token — عشان يشتغل
    // حتى لو الـ access token خلص، وبالتالي دايماً بينضّف الجلسة فعلياً.
    const token = req.cookies?.refreshToken;

    // ملاحظة: لازم null مش undefined — لأن Mongoose بيتجاهل الـ undefined في التحديث
    // فمكانش بيمسح التوكن فعلياً (ده كان سبب إن الـ session بتفضل شغّالة بعد الـ logout).
    const clearTokens = { $set: { refreshToken: null, refreshTokenExpires: null } };

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
            await User.findByIdAndUpdate(decoded.userId, clearTokens);
        } catch {
            // التوكن ممكن يكون منتهي/غير صالح — نكمل وننضّف الكوكي عادي
        }
    } else if (req.user) {
        // fallback: لو مفيش كوكي بس فيه يوزر متحقق منه
        await User.findByIdAndUpdate(req.user._id, clearTokens);
    }

    // امسح الـ cookie
    res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });

    res.status(200).json({
        status: "success",
        message: "Logged out successfully",
    });
});

// ============================
// protect
// ============================
export const protect = asyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return next(new AppError("You are not logged in, please login first", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const currentUser = await User.findById(decoded.userId);
    if (!currentUser) {
        return next(new AppError("The user that belong to this token no longer exists", 401));
    }

    if (currentUser.passwordChangedAt) {
        const passChangedTimestamp = parseInt(currentUser.passwordChangedAt.getTime() / 1000);
        if (passChangedTimestamp > decoded.iat) {
            return next(new AppError("User recently changed his password, please login again", 401));
        }
    }

    req.user = currentUser;
    next();
});

// ============================
// allowedTo
// ============================
export const allowedTo = (...roles) => {
    return asyncHandler(async (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(new AppError("You are not allowed to access this route", 403));
        }
        next();
    });
};

// ============================
// forgotPassword
// ============================
export const forgotPassword = asyncHandler(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });

    // رد موحّد سواء الإيميل موجود ولا لأ — مايبقاش أوراكل لوجود الحسابات (enumeration).
    // توليد الكود وإرسال الإيميل بيحصلوا جوه فرع اليوزر الموجود بس؛ لو مش موجود
    // بنرجّع نفس رسالة النجاح من غير ما نعمل أي حاجة تانية. ده تصرف مقصود ومايترجعش.
    if (!user) {
        return res.status(200).json({
            status: "success",
            message: "Reset code sent to email",
        });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    const hashedResetCode = crypto
        .createHash("sha256")
        .update(resetCode)
        .digest("hex");

    user.passwordResetCode = hashedResetCode;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    user.passwordResetVerified = false;

    await user.save();

    try {
        await sendEmail({
            email: user.email,
            subject: "Your reset password",
            message: `
                <h2>TalentRadar</h2>
                <p>Hi ${user.name}</p>
                <p>Your reset password code is:</p>
                <h1>${resetCode}</h1>
                <p>This code is valid for 10 minutes.</p>
            `,
        });
    } catch (error) {
        user.passwordResetCode = undefined;
        user.passwordResetExpires = undefined;
        user.passwordResetVerified = undefined;
        await user.save();

        return next(new AppError("There is an error in sending email", 500));
    }

    res.status(200).json({
        status: "success",
        message: "Reset code sent to email",
    });
});

// ============================
// verifyResetPassword
// ============================
export const verifyResetPassword = asyncHandler(async (req, res, next) => {
    const hashedResetCode = crypto
        .createHash("sha256")
        .update(req.body.resetCode)
        .digest("hex");

    const user = await User.findOne({
        passwordResetCode: hashedResetCode,
        passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
        return next(new AppError("Reset code invalid or expired", 400));
    }

    user.passwordResetVerified = true;
    await user.save();

    res.status(200).json({ status: "success" });
});

// ============================
// resetPassword
// ============================
export const resetPassword = asyncHandler(async (req, res, next) => {
    const user = await User.findOne({ email: req.body.email });

    // رد موحّد لكل حالات الفشل (إيميل مش موجود / مش متحقّق / الصلاحية انتهت) —
    // نفس مبدأ forgotPassword: مايبقاش أوراكل لوجود الحسابات. وبيقفل كمان ثغرة
    // إن passwordResetVerified كان بيفضل true للأبد لو اليوزر عمل verify وساب
    // الفلو من غير ما يكمّل — قبل كده الحقل ده مكانش بيتفحص هنا خالص.
    if (
        !user ||
        !user.passwordResetVerified ||
        !user.passwordResetExpires ||
        user.passwordResetExpires.getTime() < Date.now()
    ) {
        return next(new AppError("Reset session is invalid or has expired, please start again", 400));
    }

    user.password = req.body.newPassword;
    user.passwordChangedAt = Date.now(); // بيبطّل كل الـaccess tokens اللي اتصدرت قبل الريست
    user.passwordResetVerified = undefined;
    user.passwordResetCode = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    await sendTokenResponse(res, user, 200);
});

// ============================
// changeLoggedUserPass
// ============================
export const changeLoggedUserPass = asyncHandler(async (req, res, next) => {
    const user = await User.findByIdAndUpdate(
        req.user._id,
        {
            password: await bcrypt.hash(req.body.password, 12),
            passwordChangedAt: Date.now(),
        },
        { returnDocument: "after", runValidators: true }
    );

    await sendTokenResponse(res, user, 200);
});
// ============================
// updateLoggedUser
// ============================
export const updateLoggedUser = asyncHandler(async (req, res, next) => {
    // profileImg اتشال من هنا عمداً — كتابته حرة من غير رفع فعلي كانت بتفتح signing
    // oracle: أي مسار (حتى تخمين) بيتوقّع تلقائي عن طريق resolveImageUrl ويرجع URL
    // صالح على media zone. الحقل ده بيتكتب بس من راوت الرفع المخصص
    // (PATCH /users/:id/profileImg) اللي بيرفع الملف فعلياً ويولّد مفتاح UUID عشوائي.
    const updates = {
        name: req.body.name,
        phoneNumber: req.body.phoneNumber,
    };
    // الإيميل والعنوان مقفولين على غير الأدمن — بيتغيروا بس عن طريق الأدمن من صفحات
    // إدارة اليوزرز، مش من صفحة "الملف الشخصي" الذاتية. رقم الموبايل يقدر أي حد يعدله عادي.
    if (req.user.role === ROLES.ADMIN) {
        updates.email = req.body.email;
        updates.address = req.body.address;
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { returnDocument: "after", runValidators: true }
    );

    res.status(200).json({
        status: "success",
        data: { user },
    });
});

// ============================
// vault access (protects ID card image viewing) — re-checks the admin's own login password
// ============================
const VAULT_TOKEN_EXPIRES_IN = "15m";
const VAULT_TOKEN_EXPIRES_SECONDS = 15 * 60;
const MAX_VAULT_ATTEMPTS = 5;
const VAULT_LOCK_MS = 15 * 60 * 1000;

// @desc    Re-verify the logged-in admin's own login password and issue a short-lived vault token
// @route   POST api/v1/auth/vaultPassword/verify
// @access  admin
export const verifyVaultPassword = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.user._id);

    if (user.vaultLockedUntil && user.vaultLockedUntil.getTime() > Date.now()) {
        return next(new AppError("Too many failed attempts. Try again later.", 423));
    }

    const isCorrect = await bcrypt.compare(req.body.password || "", user.password);
    if (!isCorrect) {
        user.vaultFailedAttempts = (user.vaultFailedAttempts || 0) + 1;
        if (user.vaultFailedAttempts >= MAX_VAULT_ATTEMPTS) {
            user.vaultLockedUntil = new Date(Date.now() + VAULT_LOCK_MS);
            user.vaultFailedAttempts = 0;
        }
        await user.save();
        return next(new AppError("Incorrect password", 401));
    }

    user.vaultFailedAttempts = 0;
    user.vaultLockedUntil = null;
    await user.save();

    const vaultToken = jwt.sign(
        { userId: user._id.toString(), vault: true },
        process.env.JWT_SECRET_KEY,
        { expiresIn: VAULT_TOKEN_EXPIRES_IN }
    );

    res.status(200).json({
        status: "success",
        data: { vaultToken, expiresIn: VAULT_TOKEN_EXPIRES_SECONDS },
    });
});

// ============================
// setupAdmin — first-time only, no auth required
// ============================
export const setupAdmin = asyncHandler(async (req, res, next) => {
    const { email, setupKey } = req.body;

    if (!setupKey || setupKey !== process.env.ADMIN_SETUP_KEY) {
        return next(new AppError("Invalid setup key.", 403));
    }

    // منع التنفيذ لو في أدمن موجود بالفعل (نشط أو متوقف)
    const existingAdmin = await User.findOne({ role: ROLES.ADMIN }).setOptions({ bypassFilter: true });
    if (existingAdmin) {
        return next(new AppError("An admin account already exists.", 403));
    }

    if (!email) {
        return next(new AppError("Please provide the account email.", 400));
    }

    const user = await User.findOneAndUpdate(
        { email },
        { role: ROLES.ADMIN },
        { returnDocument: "after", runValidators: true }
    ).setOptions({ bypassFilter: true });

    if (!user) {
        return next(new AppError(`No account found with email: ${email}`, 404));
    }

    res.status(200).json({
        status: "success",
        message: "Admin setup complete. Please log out and log in again.",
        data: { user },
    });
});