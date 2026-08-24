import fs from "fs";
import { validationResult } from "express-validator";

// audit fix S3 — نفس الشبكة الأمنية اللي في errorMiddleware.js، لازمة هنا كمان.
// السبب: الفشل هنا بيرجع رد 400 مباشرة (مش next(error))، فمابيمرّش على
// errorMiddleware أصلاً. أي راوت زي POST /players/:playerId/media بترتيبه
// upload.single(...) ثم validator (uploadMediaValidator) بعده — لو الفاليديشن
// رفض الطلب، الملف اللي multer كتبه على الديسك كان بيتسرّب هنا بالظبط.
const cleanupUploadedFile = (req) => {
    const path = req.file?.path;
    if (!path) return;
    fs.unlink(path, () => {});
};

const validatorMiddleware = (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        cleanupUploadedFile(req);
        return res.status(400).json({ status: "fail", errors: result.array() });
    }
    next();
}

export default validatorMiddleware;