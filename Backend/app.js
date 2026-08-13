import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";

import ageRouter from "./routes/ageGroupRouter.js";
import AppError from "./utils/appError.js";
import globalError from "./middlewares/errorMiddleware.js";
import teamRouter from "./routes/teamRouter.js";
import playerRouter from "./routes/playerRouter.js";
import userRouter from "./routes/userRouter.js";
import authRouter from "./routes/authRouter.js";
import dashboardRouter from "./routes/dashboardRouter.js";
import seasonMatchRouter from "./routes/seasonMatchRouter.js";
import observerEvaluationRouter from "./routes/observerEvaluationRouter.js";
import coachEvaluationRouter from "./routes/coachEvaluationRouter.js";
import { bunnyWebhook } from "./controllers/playerMediaController.js";
import { bunnyWebhookLimiter } from "./middlewares/rateLimiters.js";
import { bunnyConfig } from "./config/bunny.js";
import rejectOperatorKeys from "./middlewares/rejectOperatorKeys.js";
import swaggerUi from "swagger-ui-express";
import specs from "./utils/swagger.js";




// Express Meddilware
const app = express();

// Request logging — skipped in test to keep vitest output clean
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true,          // مطلوب لإرسال refreshToken cookie من Angular
    optionsSuccessStatus: 200,  // لـ legacy browsers
}));

const isTest = process.env.NODE_ENV === 'test';

// لو الباك اند شغال وراء reverse proxy/PaaS (Render, Heroku, Nginx...) في البرودكشن،
// من غير ده req.ip بيرجع IP بتاع الـ proxy لكل الناس فيبقى الكل شايك في نفس الحد
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

const rateLimitWindowMs = (Number(process.env.RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000;

// بيحاول ياخد هوية اليوزر المسجل دخوله (من الـ access token) عشان كل يوزر ياخد الحد بتاعه لوحده
// بدل ما كل اليوزرز اللي عاملين شير لنفس الـ IP (شبكة مكتب/مدرسة واحدة) ياخدوا حد واحد مشترك.
// لو مفيش توكن صالح (طلبات مش متسجل دخولها زي login) بيرجع للـ IP العادي.
const userOrIpKeyGenerator = (req) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer")) {
        try {
            const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET_KEY);
            return `user:${decoded.userId}`;
        } catch {
            // توكن غير صالح/منتهي — استخدم الـ IP
        }
    }
    // ipKeyGenerator() بتعمل normalize لعنوان الـ IPv6 (بتاخد أول 64 بت بس) عشان لا يتهرب اليوزر
    // من الحد بسبب تغيّر آخر جزء من عنوانه تلقائيًا (privacy extensions)
    return ipKeyGenerator(req.ip);
};

// General limiter — لكل يوزر مسجل دخوله لوحده (مش IP مشترك)
const limiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: isTest ? 10000 : (Number(process.env.RATE_LIMIT_MAX) || 300),
    keyGenerator: userOrIpKeyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many requests, please try again later"
    }
});
app.use("/api", limiter);

// Auth limiter — بيمنع brute force على login/signup، فضل IP-based لأن ده قبل تسجيل الدخول
// مستثنى منه /refreshToken لأنه بيتكال عند كل refresh للصفحة
// skipSuccessfulRequests: الطلبات الناجحة (لوجين صح، تغيير باسورد صح، إلخ) متتحسبش على الحد —
// الحد بيتاكل بس من المحاولات الغلط (401/400...)، فاليوزر اللي بيسجل دخول صح مايتأثرش خالص
const authLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: isTest ? 10000 : (Number(process.env.AUTH_RATE_LIMIT_MAX) || 15),
    skip: (req) => req.path === "/refreshToken",
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many auth requests, please try again later"
    }
});
app.use("/api/v1/auth", authLimiter);

// Refresh token limiter
const refreshLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: isTest ? 10000 : (Number(process.env.REFRESH_RATE_LIMIT_MAX) || 60),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many refresh requests, please try again later"
    }
});
app.use("/api/v1/auth/refreshToken", refreshLimiter);

// forgotPassword limiter — بيمنع account enumeration
const forgotPasswordLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: isTest ? 10000 : (Number(process.env.FORGOT_PASSWORD_RATE_LIMIT_MAX) || 5),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many password reset requests, please try again later"
    }
});
app.use("/api/v1/auth/forgotPassword", forgotPasswordLimiter);

// Body parser
app.use(express.json({ limit: '10kb' }))
app.use(cookieParser());

// NoSQL operator injection guard — يغطي كل الـAPI مرة واحدة (مش راوتات الـauth بس).
// انظر middlewares/rejectOperatorKeys.js للتفاصيل وليه مش بنستخدم express-mongo-sanitize.
app.use(rejectOperatorKeys);

// Health check
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public, non-sensitive upload limits — the frontend reads these instead of
// hardcoding a number that can drift from BUNNY_MAX_VIDEO_MB (env-driven).
app.get('/api/v1/media-limits', (req, res) => {
    const { limits } = bunnyConfig();
    res.status(200).json({
        status: 'success',
        data: { maxVideoMB: limits.maxVideoMB, maxImageMB: 10 },
    });
});

// ADDING ROUTES FOR APP
app.use('/api/v1/ages', ageRouter);
app.use('/api/v1/teams', teamRouter);
app.use('/api/v1/players', playerRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/seasonMatches', seasonMatchRouter);
app.use('/api/v1/observerEvaluations', observerEvaluationRouter);
app.use('/api/v1/coachEvaluations', coachEvaluationRouter);

// Bunny Stream webhook — untrusted trigger, mounted at an unguessable secret path
// (C1/F7a). Outside /api so it isn't behind the user/IP limiter; has its own.
app.post('/webhooks/bunny/:secret', bunnyWebhookLimiter, bunnyWebhook);

// §10 — allowlist مش denylist: الـdocs بتتعرض في development بس. قبل كده كان
// الشرط !== "production"، يعني أي قيمة مش متوقعة (فاضية / 'test' / 'staging')
// كانت بتنشر خريطة الـAPI كاملة للعالم.
if (process.env.NODE_ENV === "development") {
    app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
}
// DEFULT ROUTE
app.use((req, res, next) => {
    next(new AppError(`Cannot find the resource '${req.originalUrl}' `, 404));
});

// Global Error Handeling
app.use(globalError);


export default app;