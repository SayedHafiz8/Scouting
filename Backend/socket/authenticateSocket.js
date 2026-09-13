import jwt from "jsonwebtoken";

import { resolveTokenUser } from "../controllers/authController.js";

// ============================================================================
// ميدلوير توثيق الـSocket.IO. اتحوّل لملف لوحده عشان يكون قابل للاختبار:
// tests/setup.js بيعمل vi.mock على socket/index.js كله، فالميدلوير لما كان
// جوّاه مكانش فيه أي طريقة توصله من تست، وقياسه من برّه كان بيحتاج
// socket.io-client (مش متسطّب) وسيرفر HTTP حقيقي.
//
// audit-backend — اتصلّح فيه حاجتين:
//
// (أ) الـfallback على query اتشال. الشكل القديم كان:
//         socket.handshake.auth.token || socket.handshake.query.token
//     والـquery string بينزل في اللوجز: app.js:36 بيشغّل morgan('combined')
//     في الإنتاج، وكمان لوجز الـreverse proxy وهيدر الـReferer. يعني توكنات
//     وصول **صالحة** كانت بتتكتب على الديسك بالنص الصريح، وأي حد عنده وصول
//     للوجز يقدر يعيد استخدامها لحد ما تخلص.
//
//     مافيش أي عميل كان بيستخدمه — اتفحص قبل الشيل:
//     frontend/src/app/core/services/socket.service.ts:36-37 بيبعت
//     `auth: { token }`، وهو المسار الصح (بيمشي في الـhandshake payload مش
//     في الـURL). ومفيش استخدام في e2e ولا في التستات.
//
// (ب) التحقق كان على **التوقيع بس** — ولا فحص إن اليوزر لسه موجود ولا إن
//     الباسورد اتغيّر بعد إصدار التوكن. يعني أول إجراء في أي حادثة (تغيير
//     باسورد الحساب المخترق) مكانش بيفصل سوكيت المهاجم: التوقيع بيفضل صالح،
//     فالسوكيت بتفضل متصلة وبتستقبل الإشعارات لحد ما التوكن يخلص لوحده.
//
//     resolveTokenUser هي **نفس** الدالة اللي protect بينده عليها، مش نسخة
//     تانية — نسختين من فحص أمني بيفترقوا: واحدة تتصلّح والتانية تُنسى.
//     protect نفسه مينفعش ينده من هنا: هو middleware بـ(req,res,next)
//     وبيرمي AppError، والسوكيت عندها signature ونموذج أخطاء مختلفين.
//
// استعلام واحد وقت الاتصال بس — مش مع كل رسالة.
// ============================================================================
export const authenticateSocket = async (socket, next) => {
    try {
        // auth بس. مفيش fallback على query — شوف (أ) فوق.
        const token = socket.handshake.auth?.token;

        if (!token) {
            return next(new Error("Unauthorized"));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        const { user } = await resolveTokenUser(decoded);
        if (!user) {
            // رسالة موحّدة عن قصد: السوكيت لسه مش موثّقة، فمابنقولهاش السبب
            // (يوزر مش موجود / باسورد اتغيّر) — نفس منطق رد forgotPassword.
            return next(new Error("Unauthorized"));
        }

        socket.userId = user._id;

        next();
    } catch (err) {
        next(new Error("Unauthorized"));
    }
};
