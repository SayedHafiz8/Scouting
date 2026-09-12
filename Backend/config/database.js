import mongoose from "mongoose";

// ─────────────────────────────────────────────────────────────────────────────
// audit-database 2026-09-12 — الاتصال ده **مابيغيّرش فهارس**، لا بيبنيها ولا
// بيمسحها. المبرر مكتوب بالتفصيل تحت عند autoIndex.
//
// وقبل أي اتصال: DB_TARGET لازم يكون معلن. السبب في assertDbTarget().
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DB_TARGETS = ["local", "staging", "production"];

// الكلمة الصريحة للتجاوز. مش `=true` عن قصد: `true` سهل تتحط بالعادة وتُنسى
// متحطوطة، والجملة الطويلة دي لازم تتكتب بوعي ومش بتتلخبط مع أي فلاج تاني.
const OVERRIDE_ENV = "ALLOW_DEV_AGAINST_PROD";
const OVERRIDE_PHRASE = "i-understand-this-writes-to-production";

// ─────────────────────────────────────────────────────────────────────────────
// DB_TARGET — الهدف **معلن**، مش مستنتَج.
//
// اللي حصل بالظبط في 2026-09-12: nodemon شغّال بـNODE_ENV=development على
// Atlas الإنتاج. الحفظ على أي *Model.js كان بيعمل restart، والـrestart كان
// بينده syncIndexes() على الإنتاج — 5 حذف و7 إنشاء في تانية، بلا --apply وبلا
// أي موافقة. ونفس الـrestart بيجدول كرونين بيمسحوا داتا نهائياً.
//
// ليه مش كشف الهوست (زي "لو العنوان فيه mongodb.net يبقى إنتاج"):
//   • false positive: كلاستر Atlas مخصص للتطوير بيبقى ممنوع بالغلط.
//   • false negative: إنتاج مستضاف ذاتياً على IP عادي بيعدّي.
// الاستنتاج من شكل العنوان تخمين. الإعلان الصريح مش تخمين، وبيتفحص بـgrep.
//
// النطاق أوسع من الحالة اللي اتفقنا عليها عن قصد: الشرط هنا
// `NODE_ENV !== "production"` مش `=== "development"` بس — يعني NODE_ENV=test
// على قاعدة إنتاج بيتوقف كمان. تست شغّال على الإنتاج بيمسح كولكشنز في
// beforeEach، فهو أخطر من الديف مش أقل.
// ─────────────────────────────────────────────────────────────────────────────
export const assertDbTarget = ({
    nodeEnv = process.env.NODE_ENV,
    dbTarget = process.env.DB_TARGET,
    override = process.env[OVERRIDE_ENV],
} = {}) => {
    if (!VALID_DB_TARGETS.includes(dbTarget)) {
        throw new Error(
            `DB_TARGET must be one of ${VALID_DB_TARGETS.join(" | ")} — got ${
                dbTarget ? `'${dbTarget}'` : "(unset)"
            }.\n` +
            "    This value declares which database the connection string points at. It is\n" +
            "    required and never defaulted: guessing it is what allowed a development\n" +
            "    server to run against production Atlas on 2026-09-12.\n" +
            "    Add DB_TARGET to config.env (see config.env.example)."
        );
    }

    if (dbTarget === "production" && nodeEnv !== "production") {
        if (override === OVERRIDE_PHRASE) {
            return { target: dbTarget, overridden: true };
        }
        throw new Error(
            `Refusing to start: NODE_ENV='${nodeEnv}' with DB_TARGET='production'.\n` +
            "    A non-production server against the production database writes to it on its\n" +
            "    own: index changes on restart, the admin seed, and two cron jobs that\n" +
            "    permanently delete users and media (and their Bunny CDN bytes).\n" +
            "    Point CONNECTION_STRING at a local or staging database and set DB_TARGET to\n" +
            `    match, or — if this is genuinely intended — set ${OVERRIDE_ENV}='${OVERRIDE_PHRASE}'.`
        );
    }

    return { target: dbTarget, overridden: false };
};

const clientOptions = { serverApi: { version: '1', strict: false, deprecationErrors: true } };
export const dbConnection = async function run() {

    const { target, overridden } = assertDbTarget();

    if (overridden) {
        // صاخب عن قصد: لو حد تجاوز الحارس، ده لازم يبان في أول 5 أسطر من اللوج.
        console.warn("");
        console.warn("  ╔══════════════════════════════════════════════════════════════════╗");
        console.warn("  ║  ⚠️   NON-PRODUCTION SERVER CONNECTED TO PRODUCTION DATABASE      ║");
        console.warn("  ║                                                                  ║");
        console.warn(`  ║  NODE_ENV=${String(process.env.NODE_ENV).padEnd(54)}║`);
        console.warn("  ║  DB_TARGET=production                                            ║");
        console.warn(`  ║  ${OVERRIDE_ENV} is set.${" ".repeat(38)}║`);
        console.warn("  ║                                                                  ║");
        console.warn("  ║  Writes reaching production from here are YOUR responsibility.   ║");
        console.warn("  ║  Unset the override as soon as you are done.                     ║");
        console.warn("  ╚══════════════════════════════════════════════════════════════════╝");
        console.warn("");
    }

    const uli = process.env.CONNECTION_STRING;

    await mongoose.connect(uli, {
        ...clientOptions,

        // ⚠️ audit-database — autoIndex/autoCreate: false **مهما كانت البيئة**.
        //
        // كان `autoIndex: !isProduction`، يعني الديف بيبني كل فهرس معلن في المخطط
        // كأثر جانبي لمجرد فتح الاتصال. مع سيرفر ديف مصوّب على الإنتاج ده بيعني
        // إن تعديل مخطط بيوصل الإنتاج من غير ما حد يطلب.
        //
        // و2026-08-26 نفس الآلية: تشغيلة sync-indexes **بدون** --apply أنشأت
        // Player.createdBy_1_createdAt_-1 و ScoutingReport.player_1_coach_1_
        // seasonMatch_1 (unique) على الإنتاج. autoIndex بيبني اللي المخطط بيعلنه —
        // فالإعلان كان موجود، اللي اتخطّى هو الترتيب: findDuplicateReports.js
        // (فحص مسبق) → قرار المالك → تطبيق يدوي.
        //
        // المسار الوحيد المسموح لتغيير الفهارس بقى scripts/syncAllIndexes.js في
        // **كل** البيئات. تكلفة المطوّر: بعد ما يعمل pull لتغيير في مخطط، يشغّل
        // `npm run sync-indexes -- --apply` مرة على قاعدته المحلية. التستات
        // مالهاش دعوة — بتوصل لوحدها في tests/setup.js.
        autoIndex: false,
        autoCreate: false,

        // perf audit 2026-09-04 — المجمّع كان بيبدأ فاضي (افتراضي minPoolSize: 0).
        // أي endpoint بيبعت استعلامات متوازية (مثلاً داشبورد الأوبزيرفر: 4 عدّات
        // في Promise.all) كان بيضطر يفتح اتصالات جديدة وقتها، وكل اتصال جديد =
        // TCP + TLS + مصادقة SCRAM ≈ 3-4 رحلات شبكة إضافية قبل أول بايت بيانات.
        //
        // مقيس على قاعدة الإنتاج الحقيقية، نفس الأربع عدّات، أربع تشغيلات متتالية:
        //   minPoolSize: 0  → 1139ms, 1134ms, 133ms, 149ms   (أول تشغيلتين بتدفعا الاتصالات)
        //   minPoolSize: 10 → 137ms, 100ms, 122ms, 135ms     (ثابتة عند رحلة واحدة)
        //
        // maxIdleTimeMS مطوّل عن الافتراضي عشان المجمّع ما يفضاش تاني أول ما
        // الترافيك يهدى — وده كان بيخلّي الحالة "الباردة" هي القاعدة مش الاستثناء
        // على موقع بترافيك متقطّع، فنفس الصفحة تطلع مرة 150ms ومرة 1.2 ثانية.
        minPoolSize: 10,
        maxIdleTimeMS: 300000,
    });

    await mongoose.connection.db.admin().command({ ping: 1 });

    // ⚠️ مافيش syncIndexes() هنا. كان `if (!isProduction) await
    // mongoose.connection.syncIndexes()` — وهو اللي طبّق تغييرات الفهارس على
    // إنتاج Atlas في 2026-09-12 لمجرد إن nodemon عمل restart بعد حفظ ملف مخطط.
    // syncIndexes() **بتمسح** كمان، مش بتضيف بس. تغيير الفهارس بقى صريح ويدوي:
    //   npm run sync-indexes            # dry run — بيطبع الخطة
    //   npm run sync-indexes -- --apply # بينفّذ

    console.log(`Pinged your deployment. Connected to MongoDB (DB_TARGET=${target}) ✅`);
}
