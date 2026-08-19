// Backend/constants/roles.js
//
// مصدر الحقيقة الوحيد لأسماء الرولات (Constitution Principle VII). كل موضع آخر في
// مصدر الباك إند الإنتاجي MUST يستورد من هنا بدل تكرار النص الحرفي — models/userModel.js
// يشتق enum الحقل من ROLE_VALUES، middlewares/ownership.js يقارن بـ ROLES.*، وطبقة
// الفاليديشن تتحقق من role عبر ROLE_VALUES.
//
// ملفات الاختبارات (Backend/tests/**) مستثناة عمداً من الاستيراد من هنا — تحتفظ بأسماء
// الرولات كنصوص حرفية لتبقى أوراكل مستقل عن هذا الثابت (قرار /speckit-clarify Q1).

export const ROLES = {
    ADMIN: 'admin',
    COACH: 'coach',
    OBSERVER: 'observer',
};

export const ROLE_VALUES = Object.values(ROLES);
