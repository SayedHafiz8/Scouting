// middlewares/ownership.js
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";

import Player from "../models/playedModel.js";
import ScoutingReport from "../models/scoutingReportModel.js";
import PlayerMedia from "../models/playerMediaModel.js";
import SeasonMatch from "../models/seasonMatchModel.js";
import Team from "../models/teamModel.js";
import AppError from "../utils/appError.js";
import { ROLES } from "../constants/roles.js";
import { professionalTeamIds, seasonMatchScopeFor, teamScopeFor } from "../services/scope.js";
import { logScopeDenial } from "../utils/accessLog.js";

export const checkPlayerOwnership = asyncHandler(async (req, res, next) => {
    const id = req.params.playerId ?? req.params.id;
    // team وcreatedBy مضافين للـselect عشان فرع proScout تحت يقارن في الذاكرة
    // (code-review high fix #4) بدل ما يعمل استعلام تاني على نفس المستند.
    const player = await Player.findById(id).select("coach observers team createdBy");

    if (!player) {
        return next(new AppError("Player not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.OBSERVER) {
        // الأوبزيرفر يوصل بس للاعب المخصص له (يعني موجود في مصفوفة observers بتاعته)
        const isAssigned = (player.observers ?? []).some(
            (o) => o.toString() === req.user._id.toString()
        );
        if (!isAssigned) {
            return next(new AppError("You are not allowed to access this player's data", 403));
        }
        return next();
    }

    if (req.user.role === ROLES.COACH) {
        // §9 — لاعب يتيم (كوتشه اتمسح) مالوش مالك، فمحدش من الكوتشيز يوصله. الفحص ده
        // بيشدّ العزل مش بيرخّيه: من غيره الـ.toString() على null كان هيرمي 500 بدل 403.
        // الأدمن بس هو اللي بيشوفه (بيرجع من فوق) لحد ما يعيّنله كوتش جديد.
        if (!player.coach || player.coach.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this player's data", 403));
        }
        return next();
    }

    // Stage 2 — proScout: نفس منطق playerScopeFor بالظبط، لكن مقارَن في الذاكرة
    // مش باستعلام تاني. code-review high fix #4: المستند أصلاً اتجاب فوق في
    // findById، فاستدعاء Player.exists({...}) هنا كان round-trip تاني للداتابيز
    // لنفس المستند بعينه — professionalTeamIds(req) بترجع الـids ذات الكاش على
    // req (نفس القيمة اللي playerScopeFor كانت هتحسبها)، فالمقارنة بتبقى محلية.
    if (req.user.role === ROLES.PRO_SCOUT) {
        const teamIds = await professionalTeamIds(req);
        const inScope =
            (player.team && teamIds.some((t) => t.equals(player.team))) ||
            (!player.team && player.createdBy && player.createdBy.equals(req.user._id));

        if (!inScope) {
            logScopeDenial({ req, resource: "player", resourceId: id });
            return next(new AppError("You are not allowed to access this player's data", 403));
        }
        return next();
    }

    // Deny by default (Constitution Principle II / Constraint C-2) — أي رول غير
    // معدود صراحةً أعلاه يُرفَض هنا، لا يُفترَض ضمنياً كأنه كوتش.
    return next(new AppError("You are not allowed to access this player's data", 403));
});

// Stage 4 — فحص "اللاعب ده جوه نطاق الـproScout؟" على مستند لاعب واحد، بنفس منطق
// playerScopeFor بالظبط لكن مقارَن في الذاكرة مش باستعلام تاني (code-review high
// fix #4 المتبع في checkPlayerOwnership). professionalTeamIds(req) عندها كاش على
// الـreq، فلو الحارس اتنده بعد checkPlayerOwnership في نفس الطلب مفيش round-trip
// زيادة أصلاً.
//
// مصدر الحقيقة الوحيد لشكل النطاق هو services/scope.js — الدالة دي بتعيد تقييم
// **نفس** الفرعين ($or) على مستند محمّل، مش بتخترع شرط جديد (Principle IV).
const playerInProScoutScope = async (req, player) => {
    if (!player) return false;
    const teamIds = await professionalTeamIds(req);
    return Boolean(
        (player.team && teamIds.some((t) => t.equals(player.team))) ||
        (!player.team && player.createdBy && player.createdBy.equals(req.user._id))
    );
};

export const checkReportOwnership = asyncHandler(async (req, res, next) => {
    const report = await ScoutingReport.findById(req.params.id).select("coach player");

    if (!report) {
        return next(new AppError("Scouting report not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        if (report.coach.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this report", 403));
        }
        if (report.player.toString() !== req.params.playerId) {
            return next(new AppError("This report does not belong to this player", 403));
        }
        return next();
    }

    // Stage 4 — الفرع اللي المرحلة 2 حجزته بقى حارس حقيقي. المرحلة 2 كانت بترفض
    // رفض ثابت لأن مسارات التقارير كانت مقفولة من allowedTo؛ دلوقتي اتفتحت
    // (scoutingReportRouter) فالفحص الفعلي هنا.
    //
    // **المحورين مطلوبين مع بعض — الملكية لوحدها بتفشل مفتوحة.**
    // مسار /reports/:id مافيهوش checkPlayerOwnership في السلسلة إطلاقاً (بص على
    // scoutingReportRouter: الحارس ده هو الوحيد اللي بيشتغل)، يعني من غير فحص
    // النطاق، تقرير اتكتب وقت ما اللاعب كان في فريق محترفين بيفضل قابل للتعديل
    // بعد ما الأدمن ينقل اللاعب لدوري تاني. النطاق هو الحامل، مش الملكية.
    //
    // نفس الدرس المسجّل حرفياً في checkSeasonMatchAttendee تحت: "عضوية attendees
    // وحدها مش فحص دوري".
    if (req.user.role === ROLES.PRO_SCOUT) {
        const isAuthor = report.coach && report.coach.toString() === req.user._id.toString();
        const belongsToPlayer = report.player.toString() === req.params.playerId;

        // اللاعب بيتجاب مرة واحدة بس، وبس لو المحورين التانيين عدّوا — رفض الملكية
        // مابيستاهلش استعلام زيادة.
        const inScope =
            isAuthor &&
            belongsToPlayer &&
            (await playerInProScoutScope(
                req,
                await Player.findById(report.player).select("team createdBy")
            ));

        if (!inScope) {
            logScopeDenial({ req, resource: "scoutingReport", resourceId: req.params.id });
            return next(
                new AppError(
                    belongsToPlayer
                        ? "You are not allowed to access this report"
                        : "This report does not belong to this player",
                    403
                )
            );
        }
        return next();
    }

    // Deny by default — رول غير معدود صراحةً.
    return next(new AppError("You are not allowed to access this report", 403));
});

export const checkMediaOwnership = asyncHandler(async (req, res, next) => {
    const media = await PlayerMedia.findById(req.params.id).select("uploadedBy player").lean();

    if (!media) {
        return next(new AppError("Media not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        // الوسائط بتخص من رفعها بس (كوتش أو أوبزيرفر) + الأدمن — غيرهم متشافش
        if (media.uploadedBy.toString() !== req.user._id.toString()) {
            return next(new AppError("You are not allowed to access this media", 403));
        }
        if (media.player.toString() !== req.params.playerId) {
            return next(new AppError("This media does not belong to this player", 403));
        }
        return next();
    }

    // Stage 4 — الفرع اللي المرحلة 2 حجزته بقى حارس حقيقي. القيد C-2 بيسمّي الدالة
    // دي بالتحديد: المقارنة فوق على uploadedBy من غير فحص رول، فأي رول غير معدود
    // كان هيشوف الميديا اللي رفعها هو — بالمصادفة مش بالتصميم.
    //
    // تلات شروط، ومحور النطاق هو الحامل: زي checkReportOwnership فوق بالظبط،
    // مسار /media/:id مافيهوش checkPlayerOwnership، فمن غير الفحص التالت الميديا
    // اللي اترفعت وقت ما اللاعب كان في فريق محترفين بتفضل مقروءة بعد ما يخرج من
    // الدوري.
    if (req.user.role === ROLES.PRO_SCOUT) {
        const isUploader = media.uploadedBy && media.uploadedBy.toString() === req.user._id.toString();
        const belongsToPlayer = media.player.toString() === req.params.playerId;

        const inScope =
            isUploader &&
            belongsToPlayer &&
            (await playerInProScoutScope(
                req,
                await Player.findById(media.player).select("team createdBy")
            ));

        if (!inScope) {
            logScopeDenial({ req, resource: "playerMedia", resourceId: req.params.id });
            return next(
                new AppError(
                    belongsToPlayer
                        ? "You are not allowed to access this media"
                        : "This media does not belong to this player",
                    403
                )
            );
        }
        return next();
    }

    // Deny by default (FR-002) — رول غير معدود صراحةً يُرفَض هنا حتى لو كانت قيمة
    // uploadedBy تطابق هويته بالمصادفة؛ فحص الرول بوابة أولى قبل فحص uploadedBy.
    return next(new AppError("You are not allowed to access this media", 403));
});

// بيسمح للأدمن دايمًا، وللكوتش/الأوبزيرفر بس لو موجودين فى مصفوفة attendees بتاعت المباراة
export const checkSeasonMatchAttendee = asyncHandler(async (req, res, next) => {
    const match = await SeasonMatch.findById(req.params.id).select("attendees").setOptions({ skipPopulate: true });

    if (!match) {
        return next(new AppError("Season match not found", 404));
    }

    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.COACH || req.user.role === ROLES.OBSERVER) {
        const isAttendee = (match.attendees ?? []).some(
            (a) => a.toString() === req.user._id.toString()
        );
        if (!isAttendee) {
            return next(new AppError("You are not assigned to attend this match", 403));
        }
        return next();
    }

    // Stage 2 — proScout. مسارات الحضور لسه مقفولة من allowedTo لحد المرحلة 6،
    // فالفرع ده مش قابل للوصول عبر HTTP دلوقتي — موجود عشان لما الحد يتفتح
    // يبقى الفحص الأمني معمول بالفعل مش مؤجّل.
    //
    // **الفحصين الاتنين مطلوبين مع بعض**: عضوية attendees وحدها **مش** فحص دوري.
    // من غير فحص النطاق، أول ما المرحلة 6 تفتح الحد، proScout اتضاف لـattendees
    // بتاعة مباراة في الدوري الممتاز (بأي طريقة) هيعدّي. النطاق هو اللي بيبقى
    // حامل الحمل ساعتها.
    //
    // skipPopulate: exists() بتنفّذ كـfindOne فبتشغّل pre(/^find/) بتاع
    // seasonMatchModel اللي بيعمل populate رباعي — نفس السبب اللي الفحص فوق
    // مستخدم عشانه setOptions({ skipPopulate: true }).
    //
    // الحضور نفسه مرفوض دلوقتي بغض النظر — المرحلة 2 قراءة بس.
    if (req.user.role === ROLES.PRO_SCOUT) {
        const inScope = await SeasonMatch.exists({
            _id: req.params.id,
            ...(await seasonMatchScopeFor(req)),
        }).setOptions({ skipPopulate: true });

        if (!inScope) {
            logScopeDenial({ req, resource: "seasonMatch", resourceId: req.params.id });
        }
        return next(new AppError("You are not assigned to attend this match", 403));
    }

    // Deny by default — رول غير معدود صراحةً.
    return next(new AppError("You are not assigned to attend this match", 403));
});

// Stage 2 — حارس النطاق لـGET /seasonMatches/:id. القائمة محكومة بـbaseFilterFn،
// لكن ApiFeature/gettingAll مابيحكموش مسارات /:id — فمن غير الحارس ده أي مباراة
// خارج الدوري بتبقى قابلة للقراءة بالـID المباشر (Principle IV).
//
// بنمرّر نفس أوبجكت النطاق بتاع القائمة لـexists — نفس مبدأ checkPlayerOwnership:
// تعريف واحد، فمستحيل ينحرف نطاق القائمة عن نطاق الوصول المباشر (FR-011).
export const checkSeasonMatchScope = asyncHandler(async (req, res, next) => {
    if (req.user.role === ROLES.ADMIN) {
        return next();
    }

    if (req.user.role === ROLES.PRO_SCOUT) {
        const inScope = await SeasonMatch.exists({
            _id: req.params.id,
            ...(await seasonMatchScopeFor(req)),
        }).setOptions({ skipPopulate: true });

        if (!inScope) {
            logScopeDenial({ req, resource: "seasonMatch", resourceId: req.params.id });
            return next(new AppError("You are not allowed to access this match", 403));
        }
        return next();
    }

    // الكوتش والأوبزيرفر: السلوك القائم كما هو بالظبط — الحارس ده مابيضيفش عليهم
    // أي قيد جديد (Principle III). سكوب الأوبزيرفر على القوائم موجود في
    // seasonMatchBaseFilterFor ومالوش علاقة بالمسار ده.
    return next();
});

// Stage 2 — حارس النطاق لـGET /teams/:id (Constraint C-3).
//
// ليه حارس مش تعديل في الكنترولر: getSpecific بتاع الفرق هو
// gettingSpecific(Team) — findById عريان من غير أي hook للنطاق. تعديل الفاكتوري
// العامة كان هيمس موارد تانية بتستخدمها، والمبدأ IV بيطلب إن رفض مسارات /:id
// ييجي من الطبقة دي أصلاً.
//
// لاحظ اللاتماثل المقصود مع professionalTeamIds في services/scope.js: هناك
// الـop بيبقى distinct فبيتخطّى hook الحذف الناعم (الفرق المحترفة المعطّلة
// بتفضل في نطاق **اللاعبين** عشان لاعبيها مايختفوش)، وهنا exists بتنفّذ
// كـfindOne فالـhook بيشتغل والفرق المعطّلة بتتستبعد — زي كل الرولات التانية.
export const checkTeamScope = asyncHandler(async (req, res, next) => {
    if (req.user.role !== ROLES.PRO_SCOUT) {
        // C-3: القراءات المفتوحة تبقى مفتوحة — admin/coach/observer سلوكهم
        // مطابق تماماً لما كان قبل المرحلة دي.
        return next();
    }

    const inScope = await Team.exists({
        _id: req.params.id,
        ...(await teamScopeFor(req)),
    });

    if (!inScope) {
        logScopeDenial({ req, resource: "team", resourceId: req.params.id });
        return next(new AppError("You are not allowed to access this team", 403));
    }
    return next();
});