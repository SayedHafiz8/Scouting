import fs from "fs";

import AppError from "../utils/appError.js";

// audit fix S3 — أي ملف رفعه multer على الديسك (uploads/) لازم يتمسح لو الطلب
// انتهى بخطأ، بصرف النظر مين رفض الطلب أو فين في السلسلة. من غيره: multer بيكتب
// الملف على الديسك **قبل** ما أي middleware بعده (فحص صلاحية، فحص حجم، فاليديشن)
// يشتغل، وكل واحد فيهم بيرمي بـnext(err) لغير الـcontroller نفسه — يعني الـ
// `finally { unlink }` اللي جوه الـcontroller (playerController.uploadProfileImg
// مثلاً) عمره ما بيوصله الدور. النتيجة كانت ملف متسرّب على كل رفض (403/400/...).
//
// نقطة واحدة هنا بتغطي كل route رفع حالي ومستقبلي — بدل ما كل مطوّر يفتكر يرتب
// middleware الرفع بعد فحص الصلاحية، أو يحط finally في كل controller.
// best-effort: فشل المسح (الملف مش موجود أصلاً، صلاحيات...) ما يوقفش الرد بالخطأ.
const cleanupUploadedFile = (req) => {
    const path = req.file?.path;
    if (!path) return;
    fs.unlink(path, () => {});
};

// Error Handeler in development mode
const devErrors = (res, error) => {
    res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
        error: error,
        stackTrace: error.stack
    });
}

// Handelling mongoose error
// 1- Cast Errors
const handelCastError = (error) => {
    return new AppError(`👉 Invalid value '${error.value}'  for property '${error.path}'`, 400);
}

// 2- Dublicate Errors
const dublicateKeyHandler = (error) => {
    const field = Object.keys(error.keyValue)[0];
    const value = error.keyValue[field];
    return new AppError(`👉 A document with field '${field}' and value '${value}' already exist.`, 400);
}

// 3- Valiation Errors
const handleValidationError = (error) => {
    const errors = Object.values(error.errors).map(val => val.message);
    const message = errors.join(', ')
    return new AppError(`👉 Invalid input data '${message}'`, 400);
}

// 4- Invalid JWT expired
const jwtExpired = () => {
    return new AppError('👉 Your session has expired, please login again..', 401);
}

// 5- Invalid json web token
const jwtInvalidSignture = () => {
    return new AppError('👉 Invalid token, please login again..', 401);
}

// Error handeler in production mode
const prodErrors = (res, error) => {
    if(error.isOperational) {
        res.status(error.statusCode).json({
            status: error.status,
            message: error.message
        })
    }else {
        console.error("Unhandled error:", error.name, error.statusCode);
        console.error(error.stack ?? error.message);
        res.status(error.statusCode).json({
            status: 'error',
            message: 'Something went wrong, please try again later'
        })
    }
}

export default (error, req, res, next) => {
    cleanupUploadedFile(req);

    error.statusCode = error.statusCode || 500;
    error.status = error.status || 'error';

    // JWT errors must always return 401 regardless of environment
    if (error.name === 'TokenExpiredError') return prodErrors(res, jwtExpired());
    if (error.name === 'JsonWebTokenError') return prodErrors(res, jwtInvalidSignture());

    if(process.env.NODE_ENV === 'development'){
        devErrors(res, error);
    }else {
        let appError = error;
        if(error.name === 'CastError'){
            appError = handelCastError(error);
        }
        if(error.code === 11000){
            appError = dublicateKeyHandler(error);
        }
        if(error.name === 'ValidationError'){
            appError = handleValidationError(error);
        }
        prodErrors(res, appError);
    }
}