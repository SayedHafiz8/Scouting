import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import CoachEvaluation from "../models/coachEvaluationModel.js";
import ObserverEvaluation from "../models/observerEvaluationModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import { deleteMediaImage, deleteVaultImage } from "./imageStorage.js";
import { ROLES } from "../constants/roles.js";

// ============================================================================
// §9 — retention عند الحذف النهائي لليوزر.
//
// المشكلة اللي بيقفلها الملف ده: قبل كده الحذف النهائي (كرون الـ30 يوم + الحذف
// اليدوي من الأدمن) كان بيمسح الدوكيومنت بس، وبيسيب صور بطاقة الرقم القومي في
// الـvault وصورة البروفايل على media zone موجودين على Bunny للأبد — يعني بيانات
// شخصية حسّاسة بتفضل مخزّنة بعد ما السجل نفسه اتمسح ومبقاش فيه ولا حتى مفتاح
// يوصّلنا ليها عشان نمسحها لاحقاً.
//
// القرار الآمن للـretention: لو أي نداء حذف على Bunny فشل، مانمسحش الدوكيومنت.
// الدوكيومنت هو المرجع الوحيد للمفاتيح، فلو مسحناه والبايتات لسه موجودة بيبقى
// التسريب دائم ومش قابل للاكتشاف. سيبه — الكرون هيعدي عليه تاني الدورة الجاية.
// عشان كده بننادي الـhelpers بـ{ strict: true } (شوف imageStorage.js).
// ============================================================================

// بيمسح كل بايتات الصور بتاعة اليوزر من Bunny. بيرمي لو أي واحدة فشلت — المستدعي
// هو اللي بيقرر يعمل إيه (بيوقف حذف الدوكيومنت في الحالتين).
export const purgeUserImages = async (user) => {
    // البطاقة الوطنية الأول — أخطر حاجة في النظام
    await deleteVaultImage(user.idCardFrontImg, { strict: true });
    await deleteVaultImage(user.idCardBackImg, { strict: true });
    // صورة البروفايل على media zone (بتتمسح مع purge للـedge جوه الـhelper)
    await deleteMediaImage(user.profileImg, { strict: true });
};

// بيفكّ ارتباط اليوزر باللاعبين قبل ما دوكيومنته يتمسح.
//
// **مافيش cascade delete هنا عن قصد**: اللاعبين دول قاصرين وبياناتهم أهم من
// حساب الكوتش. الكوتش بيتشال من الحقل coach (اللاعب بيبقى يتيم لحد ما الأدمن
// يعيّنله واحد جديد من PATCH /players/:id/coach)، والأوبزيرفر بيتشال من مصفوفة
// observers بتاعة أي لاعب متابعه.
//
// العزل بعد كده: اللاعب اليتيم مش بيظهر لأي كوتش — فلتر ApiFeature للكوتش هو
// {coach: <id>} وده مش بيطابق مستند بلا coach، وcheckPlayerOwnership بيرجّع 403
// على أي لاعب بلا كوتش. يفضل مرئي للأدمن والأوبزيرفرز المعيَّنين بس.
export const detachUserFromPlayers = async (userId) => {
    const [owned, observed] = await Promise.all([
        Player.updateMany({ coach: userId }, { $unset: { coach: 1 } }),
        Player.updateMany({ observers: userId }, { $pull: { observers: userId } }),
    ]);
    return {
        orphaned: owned.modifiedCount ?? 0,
        unobserved: observed.modifiedCount ?? 0,
    };
};

// ============================================================================
// §12 — الـreferences المعلّقة في باقي الكولكشنز.
//
// المشكلة: detachUserFromPlayers فوق بيغطي Player بس. باقي الكولكشنز كانت
// بتفضل شايلة ObjectId ليوزر مش موجود — populate بيرجّع null، والواجهة بتلاقي
// حقول فاضية من غير سبب واضح، والداتا نفسها مش قابلة للتتبّع.
//
// المبدأ الحاكم في القرارات تحت: **البيانات الكشفية بتفضل، الحكم الشخصي بيتمسح.**
// التقرير عن لاعب حقيقة تاريخية عن اللاعب — بتفضل حتى لو كاتبها مشي. لكن تقييم
// أداء الكوتش/الأوبزيرفر ده سجل شخصي عن الشخص نفسه — بيمشي معاه.
//
// ملحوظة عن النموذج: الأدمنز بس هم اللي بيقيّموا. في CoachEvaluation الـcoach
// كوتش والـevaluator أدمن؛ في ObserverEvaluation الـobserver أوبزيرفر والـ
// evaluator أدمن. مفيش كوتش بيقيّم كوتش.
//
// كل العمليات هنا updateMany/deleteMany بفلتر على الـid — يعني idempotent
// بطبيعتها: لو الكرون وقع في النص وأعاد المحاولة، الجولة التانية بتلاقي صفر
// مطابقات وبتعدّي من غير أثر جانبي.
// ============================================================================
export const detachUserReferences = async (user) => {
    const userId = user._id;

    // ── مستقل عن الدور ────────────────────────────────────────────────────
    // الميديا بتاعة اللاعب مش بتاعة الرافع: الفيديو/الصورة أصل من أصول ملف
    // اللاعب، والرافع مجرد بيانات وصفية. بنصفّر الرافع والميديا تفضل.
    //
    // وحقل coach في ScoutingReport هو **الكاتب أياً كان دوره** — الراوت
    // POST /players/:id/reports مفتوح لـallowedTo("coach","observer") و
    // scoutingReportController بيحط req.user._id فيه. فالتصفير هنا مبني على
    // الحقل مش على الدور، وإلا تقارير الأوبزيرفر المحذوف كانت هتفضل معلّقة.
    const [reports, media, matches] = await Promise.all([
        ScoutingReport.updateMany({ coach: userId }, { $set: { coach: null } }),
        PlayerMedia.updateMany({ uploadedBy: userId }, { $set: { uploadedBy: null } }),
        SeasonMatch.updateMany({ attendees: userId }, { $pull: { attendees: userId } }),
    ]);

    // ── حسب الدور ─────────────────────────────────────────────────────────
    // تقييماته كـmُقيَّم (الشخص اللي الأدمن كتب عنه) بتتمسح معاه، وتقييماته
    // كـمُقيِّم (لو أدمن) بتفضل بـevaluator: null عشان تاريخ تقييم الكشافين
    // التانيين مايضيعش بحذف أدمن واحد.
    let evaluationsDeleted = 0;
    let evaluationsOrphaned = 0;

    if (user.role === ROLES.COACH) {
        const res = await CoachEvaluation.deleteMany({ coach: userId });
        evaluationsDeleted = res.deletedCount ?? 0;
    }

    if (user.role === ROLES.OBSERVER) {
        const res = await ObserverEvaluation.deleteMany({ observer: userId });
        evaluationsDeleted = res.deletedCount ?? 0;
    }

    if (user.role === ROLES.ADMIN) {
        // الـunique indexes على الاتنين بقت partial على evaluator عشان أدمنين
        // قيّموا نفس الشخص في نفس الشهر مايتصادموش بعد التصفير — التفاصيل في
        // التعليق فوق الـindex في كل موديل
        const [c, o] = await Promise.all([
            CoachEvaluation.updateMany({ evaluator: userId }, { $set: { evaluator: null } }),
            ObserverEvaluation.updateMany({ evaluator: userId }, { $set: { evaluator: null } }),
        ]);
        evaluationsOrphaned = (c.modifiedCount ?? 0) + (o.modifiedCount ?? 0);
    }

    return {
        reportsOrphaned: reports.modifiedCount ?? 0,
        mediaOrphaned: media.modifiedCount ?? 0,
        matchesLeft: matches.modifiedCount ?? 0,
        evaluationsDeleted,
        evaluationsOrphaned,
    };
};
