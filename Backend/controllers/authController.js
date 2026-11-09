import asyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import AppError from "../utils/appError.js";
import User from "../models/userModel.js";
import sendEmail from "../utils/sendEmail.js";
import { ROLES } from "../constants/roles.js";
import { logRoleDenial } from "../utils/accessLog.js";
import { BCRYPT_SALT_ROUNDS, TOKEN_TYPES } from "../constants/security.js";
import { disconnectUserSockets } from "../socket/index.js";

// ============================
// helpers
// ============================

// أنواع التوكنات في constants/security.js — شوف التعليق هناك للسبب الكامل.

// الـrefresh token بيتخزّن مهشَّم، مش خام. سبب: العمود ده كان `String` عادي من
// غير `select: false` (رغم إن الكود بيكتب `.select("+refreshToken")` كأنه
// موجود)، فأي نسخة من قاعدة البيانات — باك أب، حساب أوبس، حقن مستقبلي — كانت
// بتدّي **جلسات صالحة 7 أيام جاهزة للاستخدام فورًا**.
//
// sha256 من غير ملح مقصود هنا (مش زي الباسوردات): المدخل توكن عشوائي 256-bit
// مش كلمة سر بشرية، فمفيش مساحة بحث يستفيد منها المهاجم، والمقارنة لازم تفضل
// مجرد بحث بالمساواة. ونفس السبب اللي بيخلي كود إعادة التعيين (6 أرقام) محتاج
// معاملة مختلفة تمامًا.
const hashRefreshToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

const generateAccessToken = (userId) =>
    jwt.sign(
        { userId, typ: TOKEN_TYPES.ACCESS },
        process.env.JWT_SECRET_KEY,
        { expiresIn: process.env.JWT_EXPIRE_TIME } // 15m
    );

// ⚠️ `jti` عشوائي مش زينة — من غيره الحمولة بتبقى {userId, typ, iat, exp} وكلها
// محدَّدة بدقة **الثانية**، يعني تجديدين في نفس الثانية بيطلّعوا توكن **متطابق
// بايت ببايت**. النتيجتين الخطيرتين:
//   1. التدوير بيبقى بلا معنى في النافذة دي — التوكن "القديم" لسه صالح.
//   2. كشف إعادة الاستخدام (تحت) مش قادر يفرّق بين السارق والضحية أصلاً.
// وكمان تسجيلي دخول لنفس اليوزر في نفس الثانية كانا بياخدوا نفس التوكن.
// اكتُشفت وقت كتابة تست إعادة الاستخدام — التست كان بيرجع 200 بدل 401.
const generateRefreshToken = (userId) =>
    jwt.sign(
        { userId, typ: TOKEN_TYPES.REFRESH, jti: crypto.randomUUID() },
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

    // احفظ الـ refresh token **مهشَّم** في الـ DB (شوف hashRefreshToken فوق)
    user.refreshToken = hashRefreshToken(refreshToken);
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

    if (decoded.typ !== TOKEN_TYPES.REFRESH) {
        return next(new AppError("Invalid refresh token, please login again", 401));
    }

    // جيب الـ user وتحقق إن الـ token في الـ DB
    const user = await User.findById(decoded.userId).select("+refreshToken +refreshTokenExpires");

    // ⚠️ كشف إعادة الاستخدام. التدوير كان متعمل صح من الأول، لكن التوكن القديم
    // كان بيرجّع 401 وخلاص — من غير أي إشارة إن فيه سرقة حصلت.
    //
    // السيناريو: مهاجم سرق الكوكي. لو جدّد قبل الضحية، بيمسك التوكن المدوَّر
    // والضحية بتاخد 401 وبتسجّل دخول تاني (وده بيقتل المهاجم). لكن لو الضحية
    // ماترجعتش بدري، المهاجم بيفضل ماسك جلسة بتتدوّر 7 أيام والنظام ساكت.
    //
    // دلوقتي: توكن توقيعه سليم وبتاع يوزر موجود، لكنه مش مطابق للمخزَّن = دليل
    // على إن فيه نسختين شغالين. بنلغي **العائلة كلها** — تصفير التوكن ورفع
    // passwordChangedAt (اللي protect و refreshToken الاتنين بيطبّقوه) — فالسارق
    // والضحية الاتنين بيتقفلوا برّه، والضحية بتسجّل دخول تاني بينما الجلسة
    // المسروقة بتموت. الفشل في الاتجاه الآمن.
    if (user && user.refreshToken !== hashRefreshToken(token)) {
        user.refreshToken = undefined;
        user.refreshTokenExpires = undefined;
        user.passwordChangedAt = Date.now();
        await user.save({ validateBeforeSave: false });
        return next(new AppError("Invalid refresh token, please login again", 401));
    }

    if (!user) {
        return next(new AppError("Invalid refresh token, please login again", 401));
    }

    if (user.refreshTokenExpires < Date.now()) {
        return next(new AppError("Refresh token expired, please login again", 401));
    }

    // audit fix S1 — دفاع في العمق. changePassword بيصفّر refreshToken صراحة
    // دلوقتي (userController.js)، فالفحص فوق (`user.refreshToken !== token`) بيقفل
    // المسار ده لوحده. الفحص ده بيقفل *أي مسار تاني مستقبلي* بيغيّر الباسورد
    // وينسى يصفّر التوكن — نفس الحارس اللي protect() بيعمله بالظبط على access
    // token (authController.js:201)، منقول هنا لـrefresh token.
    if (user.passwordChangedAt) {
        const passChangedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000);
        if (passChangedTimestamp > decoded.iat) {
            return next(new AppError("Password changed recently, please login again", 401));
        }
    }

    // ✅ جنرت access token جديد وبرجع بيانات اليوزر عشان الـ frontend يستعيد الـ session
    const newAccessToken = generateAccessToken(user._id);

    // rotate the refresh token
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken = hashRefreshToken(newRefreshToken);
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
    //
    // ⚠️ passwordChangedAt كمان: من غيرها الـlogout كان بيبطّل الـrefresh token
    // بس، والـ**access token** بيفضل صالح لآخر عمره (15 دقيقة). يعني حد سجّل
    // خروج على جهاز مشترك، ومهاجم واخد التوكن من الذاكرة، بيفضل داخل. protect
    // و refreshToken الاتنين بيقارنوا بـpasswordChangedAt أصلاً، فرفعها بيقفل
    // الجلسة كلها فورًا — نفس الآلية اللي بيستخدمها تغيير الباسورد بالظبط.
    const clearTokens = {
        $set: { refreshToken: null, refreshTokenExpires: null, passwordChangedAt: new Date() },
    };

    let loggedOutUserId = null;
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
            await User.findByIdAndUpdate(decoded.userId, clearTokens);
            loggedOutUserId = decoded.userId;
        } catch {
            // التوكن ممكن يكون منتهي/غير صالح — نكمل وننضّف الكوكي عادي
        }
    } else if (req.user) {
        // fallback: لو مفيش كوكي بس فيه يوزر متحقق منه
        await User.findByIdAndUpdate(req.user._id, clearTokens);
        loggedOutUserId = req.user._id.toString();
    }

    // السوكيت بتتحقق مرة واحدة بس وقت المصافحة وبعد كده مابتتراجعش — فمن غير
    // الفصل ده كانت بتفضل تبث إشعارات ودashboard updates بعد الخروج.
    if (loggedOutUserId) disconnectUserSockets(loggedOutUserId);

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
// ============================================================================
// resolveTokenUser — فحص الإبطال المشترك بين protect وميدلوير الـSocket.IO.
//
// audit-backend — ميدلوير السوكيت كان بيتحقق من **التوقيع بس**، ومابيعملش أي
// حاجة من الفحصين اللي تحت. يعني لما أدمن يغيّر باسورد حساب مخترق — أول حاجة
// بتتعمل في أي حادثة — السوكيت بتاع المهاجم بيفضل متصل وبيستقبل الإشعارات لحد
// ما التوكن يخلص لوحده. التوقيع بيفضل صالح، فالتحقق بينجح.
//
// الفحص متحرّك هنا بدل ما يتنسخ عشان نسختين من فحص أمني بيفترقوا مع الوقت —
// واحدة تتصلّح والتانية تُنسى. protect مينفعش ينده من السوكيت أصلاً: هو
// middleware بـ(req,res,next) وبيرمي AppError، والسوكيت عندها signature ونموذج
// أخطاء مختلفين تماماً. فالمشترك هو **القرار**، مش الميدلوير.
//
// ملاحظة: User.findById بيمر على hook الحذف الناعم ({active: {$ne: false}})،
// فاليوزر المعطَّل بيرجع null وبيترفض — وده مقصود، نفس سلوك protect.
export const resolveTokenUser = async (decoded) => {
    // فحص النوع هنا مقصود: ده المكان المشترك بين protect والسوكيت، فالقرار
    // بيتاخد مرة واحدة. توكن الڤولت بيعدّي على jwt.verify بنجاح (نفس المفتاح)،
    // والحاجة الوحيدة اللي بتفرّقه هي `typ` — شوف TOKEN_TYPES فوق.
    if (decoded.typ !== TOKEN_TYPES.ACCESS) {
        return { user: null, reason: "Invalid token, please login again" };
    }

    // ⚠️ .select().lean() — ده أكتر استعلام بيتنفّذ في النظام كله (كل نداء
    // لـ/api/v1/*). قبل كده كان بيحمّل المستند كامل: الـbcrypt hash، الـrefresh
    // token، ومفاتيح تخزين البطاقة — كلها في req.user على كل ريكوست. محدش محتاج
    // منه غير _id وrole (اتفحص عبر الباك إند كله)، وpasswordChangedAt للفحص تحت.
    // فايدة أمنية: هاش الباسورد بيبطل يدخل ذاكرة الطلب أصلاً.
    // (الـlean مابيتخطّاش هوك الحذف الناعم — اليوزر المعطَّل لسه بيرجع null.)
    const currentUser = await User.findById(decoded.userId)
        .select("role passwordChangedAt")
        .lean();
    if (!currentUser) {
        return { user: null, reason: "The user that belong to this token no longer exists" };
    }

    if (currentUser.passwordChangedAt) {
        const passChangedTimestamp = parseInt(currentUser.passwordChangedAt.getTime() / 1000);
        if (passChangedTimestamp > decoded.iat) {
            return { user: null, reason: "User recently changed his password, please login again" };
        }
    }

    return { user: currentUser, reason: null };
};

export const protect = asyncHandler(async (req, res, next) => {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return next(new AppError("You are not logged in, please login first", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

    const { user, reason } = await resolveTokenUser(decoded);
    if (!user) {
        return next(new AppError(reason, 401));
    }

    req.user = user;
    next();
});

// ============================
// allowedTo
// ============================
export const allowedTo = (...roles) => {
    return asyncHandler(async (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            // Stage 7 — تسجيل رفض بوابة الرول (Principle IV). ما بيغيّرش الرد
            // (نفس الحالة، نفس رسالة الخطأ) — أثر تدقيق إضافي بس، قبل الرفض
            // الفعلي عشان لو حصل خطأ لاحق في السلسلة يفضل الرفض مسجّل.
            logRoleDenial({ req, resource: (req.baseUrl || "").replace(/^\/api\/v1/, "") || "/" });
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

    // audit fix S5 — Math.random() في V8 مولّد xorshift128+ غير تشفيري: مراقبة
    // عدد قليل من مخرجاته (زي طلب أكواد لحسابات المهاجم بنفسه) كافية لاستنتاج
    // حالته الداخلية والتنبؤ بمخرجاته الجاية — بحث منشور ومطبَّق عملياً على V8.
    // crypto.randomInt مبني على CSPRNG (نفس مصدر العشوائية المستخدم أصلاً في
    // crypto.randomUUID جوه المشروع)، فمفيش أي مخرج سابق يقدر يتنبأ بالتالي منه.
    const resetCode = String(crypto.randomInt(100000, 1000000));

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
const MAX_RESET_CODE_ATTEMPTS = 5;

export const verifyResetPassword = asyncHandler(async (req, res, next) => {
    // ⚠️ البحث بقى محصور على الحساب بتاع الإيميل، مش عالمي بالكود وحده.
    // قبل كده أي مهاجم كان يرشّ أكواد 6 أرقام عشوائية وأول تطابق مع **أي** كود
    // مفتوح في الكولكشن كان بينجح — مع الليميتر على IP بس، بوت نت كان كفاية.
    // دلوقتي: إيميل مطلوب، والكود بيتقارن لليوزر ده وحده، وعدّاد المحاولات
    // بيصفّر الكود عند الحد فالرش على حساب واحد بيموت بعد 5 محاولات.
    const user = await User.findOne({ email: req.body.email })
        .select("+passwordResetAttempts");

    const hashedResetCode = crypto
        .createHash("sha256")
        .update(req.body.resetCode)
        .digest("hex");

    // رد موحّد لكل حالات الفشل — مايبقاش أوراكل لوجود الحسابات ولا لصلاحية الكود.
    const fail = () => next(new AppError("Reset code invalid or expired", 400));

    if (
        !user ||
        !user.passwordResetCode ||
        !user.passwordResetExpires ||
        user.passwordResetExpires.getTime() < Date.now()
    ) {
        return fail();
    }

    if (user.passwordResetCode !== hashedResetCode) {
        // محاولة غلط — زوّد العدّاد، والغِ الكود خالص عند الحد.
        user.passwordResetAttempts = (user.passwordResetAttempts ?? 0) + 1;
        if (user.passwordResetAttempts >= MAX_RESET_CODE_ATTEMPTS) {
            user.passwordResetCode = undefined;
            user.passwordResetExpires = undefined;
            user.passwordResetVerified = undefined;
            user.passwordResetAttempts = undefined;
        }
        await user.save();
        return fail();
    }

    user.passwordResetVerified = true;
    user.passwordResetAttempts = undefined;
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
            password: await bcrypt.hash(req.body.password, BCRYPT_SALT_ROUNDS),
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
        // `vault: true` متسيب للتوافق مع requireVaultToken القديم؛ `typ` هو اللي
        // بيمنع التوكن ده يعدّي كـaccess token (شوف TOKEN_TYPES فوق).
        { userId: user._id.toString(), vault: true, typ: TOKEN_TYPES.VAULT },
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

    // ⚠️ فحص وجود الأدمن **قبل** فحص المفتاح، وبنفس رسالة الرفض 403 للاتنين.
    // قبل كده فحص المفتاح كان الأول برسالة مختلفة، فالفرق بين الرسالتين كان
    // أوراكل لصلاحية ADMIN_SETUP_KEY حتى على نظام فيه أدمن أصلاً (الراوت غير
    // مستغَل عمليًا لأن seedAdmin بيعمل أدمن في كل إقلاع، بس الأوراكل كان بيتبنى
    // على دا). seedAdmin هو المسار المعتمد — الراوت ده دفاع في العمق بس.
    const existingAdmin = await User.findOne({ role: ROLES.ADMIN }).setOptions({ bypassFilter: true });
    if (existingAdmin) {
        return next(new AppError("Setup is not available.", 403));
    }

    const expected = process.env.ADMIN_SETUP_KEY || "";
    const provided = setupKey || "";
    const keyOk =
        !!expected &&
        provided.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    if (!keyOk) {
        return next(new AppError("Setup is not available.", 403));
    }

    if (!email) {
        return next(new AppError("Please provide the account email.", 400));
    }

    const user = await User.findOneAndUpdate(
        // الأدمن المعطَّل (soft-deleted) مش المفروض يترقّى — bypassFilter بيشيل
        // حارس الحذف الناعم، فبنضيف active صراحةً عشان حساب متوقّف ما يترقّاش.
        { email, active: { $ne: false } },
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