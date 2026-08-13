// ============================================================================
// Target guard for the load-test scripts. Imported FIRST — before any model —
// for a reason that is not cosmetic:
//
// models/playedModel.js → utils/mediaUrl.js → config/bunny.js:3 calls
// dotenv.config({ path: "./config.env" }) at module load. So by the time a
// script's own body runs, config.env has already been merged into process.env.
// If SEED_TARGET_URI were only read after that, a stray SEED_TARGET_URI line in
// config.env would silently satisfy the gate — exactly the "I pointed it at the
// wrong cluster" accident these scripts exist to prevent.
//
// ESM evaluates imports in source order, so importing this module before the
// model imports snapshots process.env as the *shell* provided it, pre-dotenv.
// ============================================================================
export const SEED_TARGET_URI = process.env.SEED_TARGET_URI;

// لقطة قبل dotenv — لو CONNECTION_STRING كان موجود في البيئة أصلاً (مش من
// config.env) بنسجّله عشان المقارنة تحت تفضل صح
const PRE_DOTENV_CONNECTION_STRING = process.env.CONNECTION_STRING;

export function assertSafeTarget({ scriptName }) {
    if (!SEED_TARGET_URI) {
        console.error(`
❌  SEED_TARGET_URI is not set — ${scriptName} refuses to run.

    This script reads its connection string ONLY from the SEED_TARGET_URI
    environment variable, never from config.env. config.env points at whichever
    cluster you last worked on, so following it could hit production.

    Pass the throwaway cluster explicitly:

      SEED_TARGET_URI="mongodb+srv://user:pass@free-cluster.xxxx.mongodb.net/talentradar" \\
        node scripts/${scriptName}
`);
        process.exit(1);
    }

    // config.env اتحمّل ضمناً عن طريق config/bunny.js. لو الـURI اللي اتبعت هو
    // نفسه CONNECTION_STRING بتاع config.env، فغالباً المستخدم نسخ سلسلة
    // البرودكشن بالغلط — ده بالظبط السيناريو الخطر مع كلاسترين.
    const configEnvConnection = process.env.CONNECTION_STRING;
    const cameFromConfigEnv =
        configEnvConnection && configEnvConnection !== PRE_DOTENV_CONNECTION_STRING;

    if (configEnvConnection && SEED_TARGET_URI.trim() === configEnvConnection.trim()) {
        console.error(`
❌  SEED_TARGET_URI is identical to CONNECTION_STRING${cameFromConfigEnv ? " in config.env" : ""}.

    That is the cluster the app itself connects to. ${scriptName} will not write
    load-test data into it. Point SEED_TARGET_URI at a separate throwaway
    cluster, or clear CONNECTION_STRING if this really is the scratch database.
`);
        process.exit(1);
    }
}

// عرض الوجهة من غير طباعة اليوزر/الباسورد
export function describeTarget(uri) {
    try {
        const u = new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://"));
        return { host: u.host, db: u.pathname.replace(/^\//, "") || "(default)" };
    } catch {
        return { host: "(unparseable URI)", db: "(unknown)" };
    }
}
