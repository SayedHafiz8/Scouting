import AppError from "../utils/appError.js";

// بيرفض أي مفتاح بيبدأ بـ$ في الـbody (NoSQL operator injection — زي
// {"email": {"$ne": null}} اللي كان بيدّي findOne أول يوزر في الكولكشن).
// الـbody بس — مش req.query: في Express 5 الـquery بقى getter ومينفعش يتعدّل،
// وده بالظبط اللي بيكسر express-mongo-sanitize (بتحاول تكتب على req.query).
// والـquery أصلاً محمي بالـsimple query parser بتاع Express 5 — ?a[$ne]=x بيدي
// المفتاح الحرفي "a[$ne]" اللي بيتشال في الـallowlist بتاع ApiFeature.buildQueryScope.
const MAX_DEPTH = 10;

const hasOperatorKey = (value, depth = 0) => {
    if (depth > MAX_DEPTH || !value || typeof value !== "object") return false;

    if (Array.isArray(value)) {
        return value.some((item) => hasOperatorKey(item, depth + 1));
    }

    return Object.keys(value).some((key) => {
        if (key.startsWith("$")) return true;
        return hasOperatorKey(value[key], depth + 1);
    });
};

const rejectOperatorKeys = (req, res, next) => {
    if (hasOperatorKey(req.body)) {
        return next(new AppError("Invalid request payload", 400));
    }
    next();
};

export default rejectOperatorKeys;
