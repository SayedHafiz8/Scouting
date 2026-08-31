// ============================================================================
// audit-database D1 — بيدوّر على التقارير المكررة اللي هتمنع بناء الـunique index
// الجديد { player, coach, seasonMatch }.
//
// ⚠️ السكريبت ده **بيقرا بس**. مفيهوش --apply ولا أي مسار كتابة، وده مقصود:
// التقرير الكشفي تقييم بشري مش سجل مؤقت، و"سيب الأقدم واحذف الباقي" قرار
// بيضيّع بيانات مالهاش rollback غير من الـbackup. القرار للمالك، والسكريبت
// بيديله القايمة عشان ياخده.
//
// ليه الفحص ده أصلاً: الـindex القديم كان { player, coach, matchDate } — يعني
// تقريرين على **نفس المباراة** كانوا ممنوعين بالفعل طول ما matchDate متطابقة
// (وهي كده للتقرير الرسمي المربوط: بتتنسخ من match.matchDate). فالمتوقع إن
// النتيجة تبقى صفر على داتابيز سليمة. لو طلعت مكررات، فده معناه إما مستندات
// اتكتبت بالـdriver (بتتخطّى الـindex؟ لأ — الـindex بيتطبّق على مستوى التخزين،
// فالأرجح إنها اتكتبت وقت ما الـindex مكانش مبني أصلاً: production عنده
// autoIndex: false، وsyncAllIndexes لازم يتنفّذ يدوي).
//
// Usage:
//   node scripts/findDuplicateReports.js
//   node scripts/findDuplicateReports.js --json > duplicate-reports.json
//
// المخرج: exit code 0 لو نضيف، 1 لو فيه مكررات (عشان ينفع في CI/سلسلة نشر
// قبل ما npm run sync-indexes -- --apply يتنفّذ).
// ============================================================================
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

import ScoutingReport from "../models/scoutingReportModel.js";

const AS_JSON = process.argv.includes("--json");

// ⚠️ autoIndex/autoCreate: false — **مش تحسين، دي شرط سلامة**.
//
// mongoose افتراضه autoIndex: true. يعني مجرد ما الموديل يتجمّع على اتصال مفتوح،
// Model.init() بينده createIndexes() وبيبني **كل** الفهارس المعلنة في المخطط —
// وده بيشمل الـunique index الجديد { player, coach, seasonMatch }.
//
// السكريبت ده الغرض منه إنه يتنفّذ على الإنتاج **قبل** ما الـindex يتبني، عشان
// يقول هل هيتبني نظيف ولا لأ. من غير السطر ده كان هيبني الـindex بنفسه كأثر
// جانبي — يعني السكريبت اللي المفروض "بيقرا بس" كان بيعمل بالظبط التغيير اللي
// إحنا مستنيين موافقة عليه. مُثبَت بالتنفيذ على كلاستر معزول: كولكشن فيها _id_
// بس بقت فيها player_1_coach_1_seasonMatch_1 بعد تشغيل السكريبت.
//
// التطبيق نفسه محمي من ده (config/database.js:13 بيحط autoIndex: !isProduction)،
// لكن السكريبتات المستقلة مابتعديش على المسار ده — بتنده mongoose.connect مباشرةً.
// autoCreate: false كمان بيمنع إنشاء كولكشن مش موجودة.
//
// الأوبشنز مكتوبة inline مش في ثابت مسمّى عن قصد: القاعدة في CLAUDE.md المفروض
// تتفحص آليًا، وفحص نصي على `mongoose.connect(` بيدوّر على autoIndex جنبه —
// الثابت المسمّى كان بيخلي الملف ده يبان مخالف وهو مش مخالف (false negative
// اتقاس فعلاً). الشكل الموحّد أهم من عدم التكرار هنا.
async function run() {
    await mongoose.connect(process.env.CONNECTION_STRING, {
        autoIndex: false,
        autoCreate: false,
    });
    if (!AS_JSON) console.log(`✅ Connected to ${mongoose.connection.name}\n`);

    // نفس مفتاح الـindex الجديد بالظبط، وبنفس شرط الـpartial: التقارير اللي
    // مالهاش كاتب أو مالهاش مباراة مرجعية **مستثناة من الفرادة أصلاً**، فمكررها
    // مش مكرر ومش هيمنع بناء أي حاجة.
    const groups = await ScoutingReport.aggregate([
        {
            $match: {
                coach: { $type: "objectId" },
                seasonMatch: { $type: "objectId" },
            },
        },
        {
            $group: {
                _id: { player: "$player", coach: "$coach", seasonMatch: "$seasonMatch" },
                count: { $sum: 1 },
                reports: {
                    $push: {
                        _id: "$_id",
                        matchDate: "$matchDate",
                        matchType: "$matchType",
                        overallRating: "$overallRating",
                        createdAt: "$createdAt",
                    },
                },
            },
        },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
    ]);

    const totalExtra = groups.reduce((acc, g) => acc + g.count - 1, 0);

    if (AS_JSON) {
        console.log(JSON.stringify({ groups, totalGroups: groups.length, totalExtra }, null, 2));
        await mongoose.disconnect();
        process.exit(groups.length ? 1 : 0);
    }

    if (groups.length === 0) {
        console.log("🎉 No duplicates — the unique index { player, coach, seasonMatch } will build cleanly.");
        console.log("   Next: npm run sync-indexes            (dry run — review the plan)");
        console.log("         npm run sync-indexes -- --apply\n");
        await mongoose.disconnect();
        return;
    }

    console.log(`⚠️  ${groups.length} duplicate group(s), ${totalExtra} report(s) beyond the first.\n`);
    console.log("   The unique index CANNOT be built until these are resolved.\n");

    for (const g of groups) {
        console.log(`   player ${g._id.player}  coach ${g._id.coach}`);
        console.log(`   seasonMatch ${g._id.seasonMatch}   →  ${g.count} reports`);
        g.reports
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .forEach((r, i) => {
                const when = new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 16);
                console.log(
                    `     ${i === 0 ? "oldest" : "      "} ${r._id}  created ${when}` +
                    `  ${String(r.matchType ?? "official").padEnd(8)} rating ${r.overallRating}`
                );
            });
        console.log("");
    }

    console.log("   Nothing was written. Review the list and decide per group;");
    console.log("   deleting a scouting report is not reversible outside a backup restore.\n");

    await mongoose.disconnect();
    process.exit(1);
}

run().catch(async (err) => {
    console.error("\n❌", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
