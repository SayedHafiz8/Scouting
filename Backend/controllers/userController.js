import asyncHandler from "express-async-handler";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import fs from "fs";

import User from "../models/userModel.js";
import IdCardAccessLog from "../models/idCardAccessLogModel.js";
import { ROLES } from "../constants/roles.js";
import { creating, deleteOne, gettingAll, restoring, softDelete, updating } from "../services/services.js";
import {
    buildKey,
    uploadMediaImage,
    deleteMediaImage,
    uploadVaultImage,
    getVaultImage,
    deleteVaultImage,
} from "../services/imageStorage.js";
import {
    purgeUserImages,
    detachUserFromPlayers,
    detachUserReferences,
} from "../services/userDeletion.js";
import { resolveImageUrl } from "../utils/mediaUrl.js";
import AppError from "../utils/appError.js";
import { BCRYPT_SALT_ROUNDS } from "../constants/security.js";



export const setTeamIdToBody = (req, res, next) => {
    // Nested Router
    if(!req.body.team) req.body.team = req.params.id;
    next();
}

// @desc    Create new User
// @route   POST api/v1/users
// @access  private
export const create = creating(User); 

const USER_FILTERS = ["role"];

// audit-database I2 — وايت ليست الترتيب. "name" مش مفهرس على User، وده الاستثناء
// الوحيد المقبول في المشروع: الفرونت بيبعت ?sort=name في أربع قوايم منسدلة كلها
// مفلترة بـrole (role_1 بيغطي الفلتر)، وكولكشن المستخدمين عشرات لكل رول — يعني
// الفرز في الذاكرة محدود بحجم الرول مش بحجم الكولكشن. لو عدد المستخدمين تخطّى
// الآلاف، الحل index { role: 1, name: 1 } مش شيل الحقل من هنا.
const USER_SORT_FIELDS = ["name", "createdAt"];

// @desc    Get all Users
// @route   POST api/v1/users
// @access  private
export const getAll = gettingAll(User, { allowed: USER_FILTERS, sortable: USER_SORT_FIELDS });

// @desc    Get specific User (ID card images excluded — need the vault endpoint below)
// @route   GET api/v1/users/:id
// @access  private
export const getSpecific = asyncHandler(async (req, res, next) => {
    const document = await User.findById(req.params.id);
    if (!document) {
        return next(new AppError(`No document for this Id '${req.params.id}'`, 404));
    }
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Report which ID-card sides exist — NEVER returns a URL or path (C3).
//          The bytes are fetched separately via the vault-gated stream endpoint.
// @route   GET api/v1/users/:id/idCardImg
// @access  admin + vault token
export const getIdCardImages = asyncHandler(async (req, res, next) => {
    const user = await User.findById(req.params.id).select("idCardFrontImg idCardBackImg");
    if (!user) {
        return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
    }
    res.status(200).json({
        status: "success",
        data: { front: Boolean(user.idCardFrontImg), back: Boolean(user.idCardBackImg) },
    });
});

// @desc    Stream a national ID-card side's bytes through the backend (C3). The
//          vault Storage zone has no CDN, so the bytes are never edge-cached and
//          no URL is ever exposed. Cache-Control: no-store + audit log per read.
// @route   GET api/v1/users/:id/idcard/:side
// @access  admin + vault token
export const streamIdCardSide = asyncHandler(async (req, res, next) => {
    const side = req.params.side;
    if (side !== "front" && side !== "back") {
        return next(new AppError("side must be 'front' or 'back'", 400));
    }
    const field = side === "front" ? "idCardFrontImg" : "idCardBackImg";

    const user = await User.findById(req.params.id).select(field);
    if (!user) {
        return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
    }
    const key = user[field];
    if (!key) {
        return next(new AppError(`No ${side} ID card image for this user`, 404));
    }

    const object = await getVaultImage(key);
    if (!object) {
        return next(new AppError("ID card image not found in storage", 404));
    }

    // F7c — audit trail (best-effort; never blocks the response)
    IdCardAccessLog.create({
        viewer: req.user._id,
        targetUser: req.params.id,
        side,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
    }).catch((err) => console.error("ID card audit log failed:", err.message));

    res.setHeader("Content-Type", object.contentType || "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Disposition", `attachment; filename="idcard-${side}.jpg"`);
    res.status(200).send(object.buffer);
});

// @desc    Force delete (bypasses active filter so deactivated users can be deleted)
// @route   DELETE api/v1/users/:id/force
// @access  admin
export const deleting = asyncHandler(async (req, res, next) => {
    const document = await User.findById(req.params.id)
        .setOptions({ bypassFilter: true });
    if (!document) return next(new AppError(`No user found with ID: ${req.params.id}`, 404));

    // §9 — بايتات Bunny الأول (بطاقة الرقم القومي + صورة البروفايل)، وبعدين الدوكيومنت.
    // لو الحذف من Bunny فشل بنوقف العملية كلها ونرجّع 502: الدوكيومنت هو المرجع
    // الوحيد للمفاتيح، فمسحه والبايتات لسه موجودة = تسريب دائم مش قابل للاكتشاف.
    // الأدمن يعيد المحاولة، والكرون كمان بيعدي على الحالة دي تاني.
    try {
        await purgeUserImages(document);
    } catch (err) {
        return next(
            new AppError(
                `Could not delete this user's stored images, so the account was kept. Try again later. (${err.message})`,
                502
            )
        );
    }

    // لاعبينه بيفضلوا موجودين ويبقوا بلا كوتش — مافيش cascade على بيانات القاصرين
    await detachUserFromPlayers(document._id);

    // §12 — باقي الـreferences في الكولكشنز التانية (تقارير، ميديا، مباريات،
    // تقييمات) — التفاصيل والقرارات حسب الدور في services/userDeletion.js
    await detachUserReferences(document);

    await User.deleteOne({ _id: document._id }).setOptions({ bypassFilter: true });
    res.status(204).json({ status: "success" });
});

// @desc    Update specific User 
// @route   POST api/v1/users/:id
// @access  private
export const update = asyncHandler(async (req, res ,next) => {
    const id = req.params.id;
    // profileImg اتشال من هنا عمداً — نفس الحماية المطبّقة في authController.updateLoggedUser:
    // كتابته حرة كانت بتخلي أي أدمن يوقّع URL لأي مسار في media zone من غير رفع فعلي.
    // الحقل بيتكتب بس من راوت الرفع المخصص (PATCH /users/:id/profileImg).
    const document = await User.findByIdAndUpdate(id,
        {
            name: req.body.name,
            role: req.body.role,
            phoneNumber: req.body.phoneNumber,
            address: req.body.address,
            birthDate: req.body.birthDate
        },
        {returnDocument :"after", runValidators: true}
    )
    
    if(!document){
        return next(new AppError(`No model for This Id: ${id}`,404))
    }
    res.status(200).json({
        status: "Success",
        data: {
            document
        }
    })
});

// @desc    Change password specific User
// @route   DELTE api/v1/users/:id/changePassword
// @access  private
//
// audit fix S1 — لازم يقفل جلسة الضحية القديمة، مش يغيّر الباسورد بس.
//
// المشكلة اللي كانت هنا: الـupdate كان بيحط password و passwordChangedAt بس،
// ومفيش أي مكان تاني بيفحص passwordChangedAt عند الـrefresh (راجع التعديل في
// authController.refreshToken تحت). يعني refreshToken القديم يفضل صالح في
// الداتابيز، وبيعرف يجدّد access token جديد لمدة 7 أيام كاملة بعد ما الأدمن
// "غيّر" الباسورد — أول إجراء في أي حادثة أمنية كان مابيعملش حاجة فعلياً.
//
// null مش undefined (زي logout بالظبط في authController.js) — Mongoose بيتجاهل
// undefined في $set، فمكانش بيمسح التوكن فعلياً.
export const changePassword = asyncHandler(async (req, res ,next) => {
    const id = req.params.id;
    const document = await User.findByIdAndUpdate(id,
        {
            password: await bcrypt.hash(req.body.password, BCRYPT_SALT_ROUNDS),
            passwordChangedAt: Date.now(),
            refreshToken: null,
            refreshTokenExpires: null,
        },
        {returnDocument :"after", runValidators: true}
    )
    
    if(!document){
        return next(new AppError(`No model for This Id: ${id}`, 404));
    }
    res.status(200).json({
        status: "Success",
        data: {
            document
        }
    })
});


// @desc    Soft Delete (sets deactivatedAt timestamp)
// @route   DELETE api/v1/users/:id
// @access  admin
export const softDele = asyncHandler(async (req, res, next) => {
    const document = await User.findByIdAndUpdate(
        req.params.id,
        { active: false, deactivatedAt: new Date() },
        { returnDocument: "after", runValidators: true }
    );
    if (!document) return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
    res.status(204).json({ status: "success" });
});

// @desc    Restore user (clears deactivatedAt)
// @route   PATCH api/v1/users/:id/restore
// @access  admin
export const restore = asyncHandler(async (req, res, next) => {
    const document = await User.findByIdAndUpdate(
        req.params.id,
        { active: true, deactivatedAt: null },
        { returnDocument: "after", runValidators: true }
    ).setOptions({ bypassFilter: true });
    if (!document) return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
    res.status(200).json({ status: "success", data: { document } });
});

// @desc    Get all deactivated coaches
// @route   GET api/v1/users/deactivated
// @access  admin
export const getDeactivated = asyncHandler(async (req, res, next) => {
    const coaches = await User.find({ active: false, role: ROLES.COACH })
        .setOptions({ bypassFilter: true })
        .select("name email phoneNumber profileImg deactivatedAt")
        .sort({ deactivatedAt: 1 });

    res.status(200).json({
        status: "success",
        count: coaches.length,
        data: { documents: coaches },
    });
});

// @desc    Upload / replace profile image
// @route   PATCH api/v1/users/:id/profileImg
// @access  admin
export const uploadProfileImg = asyncHandler(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError("Please provide an image file", 400));
    }

    const existing = await User.findById(req.params.id).select("profileImg");
    if (!existing) {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
        return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
    }

    try {
        const buffer = await sharp(req.file.path)
            .resize({ width: 400, height: 400, fit: "cover" })
            .webp({ quality: 85 })
            .toBuffer();

        const key = buildKey("profiles", "webp");
        await uploadMediaImage(buffer, key, "image/webp");

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { profileImg: key },
            { returnDocument: "after", runValidators: true }
        );

        // orphan fix: امسح الصورة القديمة (بيتجاهل روابط Cloudinary القديمة)
        await deleteMediaImage(existing.profileImg);

        res.status(200).json({
            status: "success",
            data: { profileImg: resolveImageUrl(key), user },
        });
    } finally {
        if (req.file?.path) fs.unlink(req.file.path, () => {});
    }
});

// بتبني الـ handler الخاص برفع وش/ضهر البطاقة الشخصية (نفس المنطق، فرق بس الحقل والفولدر)
const makeUploadIdCardSide = (side) => {
    const field = side === "front" ? "idCardFrontImg" : "idCardBackImg";
    return asyncHandler(async (req, res, next) => {
        if (!req.file) {
            return next(new AppError("Please provide an image file", 400));
        }

        const existing = await User.findById(req.params.id).select(field);
        if (!existing) {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
            return next(new AppError(`No user found with ID: ${req.params.id}`, 404));
        }

        try {
            const buffer = await sharp(req.file.path)
                .resize({ width: 1000, withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();

            // بطاقة الرقم القومي بتتخزن في زون الـ vault (من غير CDN) — C3
            const key = buildKey(`idcards/${side}`);
            await uploadVaultImage(buffer, key);

            const user = await User.findByIdAndUpdate(
                req.params.id,
                { [field]: key },
                { returnDocument: "after", runValidators: true }
            );

            // orphan fix: امسح النسخة القديمة من الـ vault
            await deleteVaultImage(existing[field]);

            // الـ toJSON بيشيل حقول البطاقة أصلاً — مبنرجّعش المسار ولا URL (C3)
            res.status(200).json({
                status: "success",
                data: { side, uploaded: true, user },
            });
        } finally {
            if (req.file?.path) fs.unlink(req.file.path, () => {});
        }
    });
};

// @desc    Upload / replace the national ID card's front-side image
// @route   PATCH api/v1/users/:id/idCardImg/front
// @access  admin
export const uploadIdCardFrontImg = makeUploadIdCardSide("front");

// @desc    Upload / replace the national ID card's back-side image
// @route   PATCH api/v1/users/:id/idCardImg/back
// @access  admin
export const uploadIdCardBackImg = makeUploadIdCardSide("back");