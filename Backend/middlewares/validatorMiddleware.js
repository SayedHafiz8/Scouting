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

// ⚠️ الفورماتر الافتراضي في express-validator هو `error => error`، يعني كل عنصر
// في result.array() جواه حقل `value` فيه **المدخل الخام زي ما اتبعت**.
//
// على مسارات زي PATCH /auth/changeMyPassword ده معناه إن رد الـ400 بيرجّع
// الباسورد الجديد **نصًا صريحًا**: المستخدم بيغلط في الباسورد الحالي، الڤاليداتور
// المخصص بيفشل، والرد بيشيل الباسورد اللي نواه — فبيروح لسجل الشبكة في المتصفح،
// وأي أداة تتبّع أخطاء، وأي بروكسي بيسجّل أجسام الردود. نفس الشيء على
// resetPassword و verifyResetCode (كود إعادة التعيين) و POST /users.
//
// بنشيل `value` من كل الأخطاء مش من اللي على حقول الباسورد بس: الوايت ليست
// بتتنسى لما يتضاف حقل حسّاس جديد، والعميل عارف أصلاً إيه اللي بعته.
const stripSubmittedValues = (errors) =>
    errors.map(({ value, ...rest }) => rest);

const validatorMiddleware = (req, res, next) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        cleanupUploadedFile(req);
        return res.status(400).json({ status: "fail", errors: stripSubmittedValues(result.array()) });
    }
    next();
}

export default validatorMiddleware;