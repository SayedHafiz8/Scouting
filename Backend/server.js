import dotenv from "dotenv";
dotenv.config({path: './config.env'});

// ─────────────────────────────────────────────────────────────────────────────
// §10 — startup guards. تلات سلوكيات أمنية معلّقة على NODE_ENV === "production"
// بالظبط: تركيب /api-docs، الفلاج secure على كوكي الـrefreshToken، وحدود الـrate
// limiting. لو المتغيّر اتساب فاضي أو 'test' على السيرفر كلهم بيفشلوا **بصمت**
// وبالسالب — الكوكي بتتبعت على HTTP، والـdocs بتتعرض، والحد بيبقى 10000.
// عشان كده أي قيمة مش معروفة = وقوف فوري، مش تحذير.
// ─────────────────────────────────────────────────────────────────────────────
const VALID_ENVS = ['production', 'development', 'test'];
const NODE_ENV = process.env.NODE_ENV;

if (!VALID_ENVS.includes(NODE_ENV)) {
    console.error(
        `❌  NODE_ENV must be one of ${VALID_ENVS.join(' | ')} — got ${NODE_ENV ? `'${NODE_ENV}'` : '(unset)'}.\n` +
        '    Security behaviour (secure cookies, /api-docs, rate limits) is keyed off this value,\n' +
        '    so an unrecognised env would silently run the server in its least safe configuration.'
    );
    process.exit(1);
}

if (!process.env.CLIENT_URL) {
    console.error('❌  CLIENT_URL is not set. Add it to config.env before starting the server.');
    process.exit(1);
}

if (NODE_ENV === 'production') {
    // كوكي الـrefreshToken بتتحط بـ Secure في البرودكشن (authController.js:31)،
    // والمتصفح بيرميها لو الصفحة على http — يعني الجلسة بتتكسر بصمت. وorigin='*'
    // مع credentials:true مرفوض من المتصفح أصلاً فبيبطّل الـCORS كله.
    if (process.env.CLIENT_URL === '*' || !/^https:\/\//i.test(process.env.CLIENT_URL)) {
        console.error(
            `❌  CLIENT_URL must be an https:// origin in production — got '${process.env.CLIENT_URL}'.\n` +
            '    The refreshToken cookie is Secure in production, so a non-HTTPS origin silently breaks\n' +
            '    session refresh, and a wildcard origin cannot be used with credentialed CORS.'
        );
        process.exit(1);
    }
}

// Handlling Syncronus Errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception — shutting down...');
    console.error(error.stack ?? `${error.name}: ${error.message}`);
    process.exit(1);
});

import app from "./app.js";
import { dbConnection } from "./config/database.js";
import { createServer } from "http";
import { initSocket } from "./socket/index.js";
import { startDailySummary } from "./socket/handlers/dailySummary.js";
import { startCleanupJob } from "./socket/handlers/cleanupDeactivated.js";
import { startVideoReconcile } from "./socket/handlers/videoReconcile.js";
import { startMediaRetention } from "./socket/handlers/mediaRetention.js";
import User from "./models/userModel.js";
import { ROLES } from "./constants/roles.js";


const port = process.env.PORT;

const seedAdmin = async () => {
    const exists = await User.findOne({ role: ROLES.ADMIN }).setOptions({ bypassFilter: true });
    if (exists) return;

    await User.create({
        name:     process.env.ADMIN_NAME,
        email:    process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
        role:     ROLES.ADMIN,
    });
    console.log(`✅ Default admin created → ${process.env.ADMIN_EMAIL}`);
};

await dbConnection();
await seedAdmin();

const server = createServer(app);
server.timeout = 120000;

initSocket(server);
startDailySummary();
startCleanupJob();
startVideoReconcile();
startMediaRetention();

server.listen(port, () => {
    console.log("Server running 🚀");
});

// Handlling Rejected Promises
process.on('unhandledRejection', (error) => {
    console.error('Unhandled Rejection — shutting down...');
    console.error(error.stack ?? `${error.name}: ${error.message}`);

    server.close(() => {
        process.exit(1);
    })
})




