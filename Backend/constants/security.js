// Backend/constants/security.js
//
// audit fix P1 — نقطة حقيقة واحدة لتكلفة bcrypt (نفس نمط constants/roles.js).
//
// القياس: `bcryptjs` (تطبيق JS نقي، لا binding أصلي) عند cost 12 بياخد ~266ms
// لكل hash/compare — قِيس فعلياً بـharness ضد الـcodebase (مش تقدير). ده بيخلي
// POST /auth/login وحده يكسر هدف 200-300ms بمفرده (~91% من زمن الطلب bcrypt)،
// وبيحدد سقف عملي ~3.7 تسجيل دخول/ثانية على نواة واحدة — أي حمل حقيقي (يوم
// مباراة، كذا كشاف بيسجّلوا دخول مع بعض) بيبقى طابور ثواني.
//
// الحل المُختار هنا: تقليل الـcost لا استبدال الحزمة. استبدال bcryptjs بـbcrypt
// الأصلي كان هيدّي سرعة أعلى (native binding)، لكنه بيضيف تبعية native (node-gyp
// + prebuilt binaries) لتغيير المفروض يبقى محصور وقليل الخطر — مش مناسب لإصلاح
// production مجمّع. cost 10 لسه داخل التوصية المقبولة من OWASP (>=10)، وبيقلّل
// الزمن المقيس لحوالي ربع القيمة الحالية (تخفيض أسّي: كل نقطة cost = ضعف الجولات).
//
// نقطة واحدة بدل تكرار الرقم 10 في 3 مواضع مستقلة (userModel pre-save hook،
// authController.changeLoggedUserPass، userController.changePassword) — تكرار
// كان بالظبط سبب الانحراف المسجّل في تقرير المراجعة (audit-backend-2026-08.md، C2).
export const BCRYPT_SALT_ROUNDS = 10;
