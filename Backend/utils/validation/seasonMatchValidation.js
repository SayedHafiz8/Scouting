import { check, body, query, param } from "express-validator";

import validatorMiddleware from "../../middlewares/validatorMiddleware.js";
import AgeGroup from "../../models/ageGroupModel.js";
import Team from "../../models/teamModel.js";
import SeasonMatch from "../../models/seasonMatchModel.js";

// فاليديشن الموسم: لازم يكون "YYYY/YYYY" والسنة التانية = الأولى + 1
const seasonFormat = (chain) =>
    chain
        .matches(/^\d{4}\/\d{4}$/)
        .withMessage("Season must be in format YYYY/YYYY (e.g. 2025/2026)")
        .custom((v) => {
            const [start, end] = v.split("/").map(Number);
            if (end !== start + 1) {
                throw new Error("Season end year must be start year + 1");
            }
            return true;
        });

// مايستحملش تسجيل/تعديل مباراة بتاريخ فات — لازم النهارده أو بعده.
// بنقارن بـ "بداية النهارده" مش بلحظة الوقت الحالي بالظبط — لأن التاريخ الجاي من
// <input type="date"> بيتحول لمنتصف الليل UTC (مثلاً 00:00:00Z)، ولو قارناه بـ
// Date.now() (اللي فيه ساعة اليوم الحالية) هيبقى دايمًا "فات" إلا في أول لحظة باليوم —
// يعني عمليًا مستحيل تسجّل ماتش بتاريخ النهارده. عشان كده بنقارن ببداية اليوم.
const matchDateNotPast = (chain) =>
    chain.custom((val) => {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        if (new Date(val).getTime() < startOfToday.getTime()) {
            throw new Error("Match date cannot be in the past");
        }
        return true;
    });

// الدوري — الممتاز أو المحترفين
const LEAGUES = ["premier", "professional"];
const leagueValid = (chain) =>
    chain.isIn(LEAGUES).withMessage("league must be either 'premier' or 'professional'");

// بيجيب الـ ageGroup/league اللي المفروض الفريق يتبعهم: من الـ body لو بيتبعتوا، وإلا من المباراة نفسها (وقت التعديل)
const resolveMatchContext = async (req) => {
    let ageGroup = req.body.ageGroup;
    let league = req.body.league;
    if ((!ageGroup || !league) && req.params.id) {
        const match = await SeasonMatch.findById(req.params.id).select("ageGroup league").setOptions({ skipPopulate: true });
        ageGroup = ageGroup ?? match?.ageGroup?.toString();
        league = league ?? match?.league;
    }
    return { ageGroup, league };
};

// بيتأكد إن الفريق موجود وتابع لنفس الفئة العمرية والدوري بتاعت المباراة
const teamBelongsToMatchAgeGroup = (fieldName) =>
    check(fieldName)
        .isMongoId().withMessage(`Invalid ${fieldName} Id`)
        .custom(async (val, { req }) => {
            const team = await Team.findById(val);
            if (!team) {
                throw new Error(`No team for this id: ${val}`);
            }

            const { ageGroup: matchAgeGroup, league: matchLeague } = await resolveMatchContext(req);
            // Stage 13 (R6) — مباريات/فرق دوري المحترفين مالهمش ageGroup خالص، فمفيش
            // مقارنة تُعمل هنا أصلاً؛ الفحص بيتخطّى صراحة لـleague: "professional"،
            // وبشكل دفاعي كمان لو team.ageGroup مش موجود لأي سبب (بدل كراش .toString()).
            if (matchLeague !== 'professional' && matchAgeGroup && team.ageGroup) {
                if (team.ageGroup.toString() !== matchAgeGroup.toString()) {
                    throw new Error(`${fieldName} must belong to the match's age group`);
                }
            }
            if (matchLeague && team.league !== matchLeague) {
                throw new Error(`${fieldName} must belong to the match's league`);
            }
            return true;
        });

// الحضور بقى self-service: الكشاف نفسه بيسجّل حضوره عن طريق POST /:id/attend —
// مش بيتبعت في إنشاء/تعديل المباراة خالص
const attendeesLocked = body("attendees")
    .not()
    .exists()
    .withMessage("attendees cannot be set here — scouts self-enroll via the attend endpoint");

const homeAwayDistinct = check("awayTeam").custom((val, { req }) => {
    if (req.body.homeTeam && val && String(req.body.homeTeam) === String(val)) {
        throw new Error("homeTeam and awayTeam must be different");
    }
    return true;
});

// بيمنع تسجيل نفس الفريقين (بأي ترتيب) فى نفس اليوم وفى نفس الفئة العمرية مرتين.
// بيدعم التحديث الجزئي — لو حقل منهم ناقص فى الـ body بيكمله من نسخة المباراة المحفوظة.
const noDuplicateFixture = body().custom(async (_, { req }) => {
    let { ageGroup, matchDate, homeTeam, awayTeam, league } = req.body;

    if (req.params.id && (!ageGroup || !matchDate || !homeTeam || !awayTeam || !league)) {
        const existing = await SeasonMatch.findById(req.params.id)
            .select("ageGroup matchDate homeTeam awayTeam league")
            .setOptions({ skipPopulate: true });
        if (existing) {
            // Stage 13 — مباريات professional مالهاش ageGroup أصلاً؛ فضل undefined
            // بدل ما نكراش على .toString() (نفس منطق R6).
            ageGroup = ageGroup ?? existing.ageGroup?.toString();
            matchDate = matchDate ?? existing.matchDate.toISOString();
            homeTeam = homeTeam ?? existing.homeTeam.toString();
            awayTeam = awayTeam ?? existing.awayTeam.toString();
            league = league ?? existing.league;
        }
    }

    if (!matchDate || !homeTeam || !awayTeam || !league) return true;
    if (league !== 'professional' && !ageGroup) return true;

    const dayStart = new Date(matchDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const duplicate = await SeasonMatch.findOne({
        ageGroup,
        league,
        matchDate: { $gte: dayStart, $lt: dayEnd },
        $or: [
            { homeTeam, awayTeam },
            { homeTeam: awayTeam, awayTeam: homeTeam },
        ],
        ...(req.params.id ? { _id: { $ne: req.params.id } } : {}),
    });

    if (duplicate) {
        throw new Error("A match between these two teams is already scheduled on this date for this age group and league");
    }
    return true;
});

// كل فريقين بيقابلوا بعض مرتين فى الموسم (ذهاب وإياب) — مينفعش نفس الفريق يبقى مضيف فى
// المباراتين. بنفحص كل الموسم (مش يوم بعينه زي noDuplicateFixture)، وبنسمح فقط لو
// الترتيب معكوس عن أي مباراة سابقة بين نفس الفريقين.
const alternateHomeAway = body().custom(async (_, { req }) => {
    let { ageGroup, homeTeam, awayTeam, league, season } = req.body;

    if (req.params.id && (!ageGroup || !homeTeam || !awayTeam || !league || !season)) {
        const existing = await SeasonMatch.findById(req.params.id)
            .select("ageGroup homeTeam awayTeam league season")
            .setOptions({ skipPopulate: true });
        if (existing) {
            ageGroup = ageGroup ?? existing.ageGroup?.toString();
            homeTeam = homeTeam ?? existing.homeTeam.toString();
            awayTeam = awayTeam ?? existing.awayTeam.toString();
            league = league ?? existing.league;
            season = season ?? existing.season;
        }
    }

    if (!homeTeam || !awayTeam || !league || !season) return true;
    if (league !== 'professional' && !ageGroup) return true;

    const rematchWithSameHost = await SeasonMatch.findOne({
        ageGroup,
        league,
        season,
        homeTeam,
        awayTeam,
        ...(req.params.id ? { _id: { $ne: req.params.id } } : {}),
    });

    if (rematchWithSameHost) {
        throw new Error(
            "These two teams already have a match this season with this same home team — the return match must swap home and away"
        );
    }
    return true;
});

// بعد ما ميعاد المباراة يعدي، الأدمن ميقدرش يعدل أو يمسح المباراة تاني
const matchNotLocked = param("id").custom(async (val) => {
    const match = await SeasonMatch.findById(val).select("matchDate").setOptions({ skipPopulate: true });
    if (match && match.matchDate.getTime() < Date.now()) {
        throw new Error("This match's date has already passed and can no longer be modified");
    }
    return true;
});

// status/result بقوا بيتغيروا بس عن طريق PATCH /:id/status (الكوتش الحاضر أو الأدمن) — مش من هنا
const statusLocked = [
    body("status").not().exists().withMessage("status cannot be set here — use the update-status endpoint"),
    body("result").not().exists().withMessage("result cannot be set here — use the update-status endpoint"),
];

export const getAllValidate = [
    query("ageGroup").optional().isMongoId().withMessage("Invalid ageGroup id"),
    seasonFormat(query("season").optional()),
    query("status")
        .optional()
        .isIn(["scheduled", "completed", "cancelled", "postponed"])
        .withMessage("Invalid status"),
    query("league").optional().isIn(LEAGUES).withMessage("Invalid league"),
    // بيسمح لكوتش/أوبزيرفر يجيب جدول المباريات بتاعته بس (فلترة على مصفوفة attendees)
    query("attendees").optional().isMongoId().withMessage("Invalid attendees id"),
    validatorMiddleware,
];

export const getSpecificValidate = [
    check("id").isMongoId().withMessage("Invalid SeasonMatch Id"),
    validatorMiddleware,
];

export const createValidate = [
    // Stage 13 — مباريات دوري المحترفين (league: "professional") مالهاش ageGroup
    // خالص، بنفس نمط Team.ageGroup: الفحص ده بالكامل بيتخطّى ليها؛ غير كده لسه
    // مطلوب صراحة زي ما كان بالظبط.
    check("ageGroup").custom(async (val, { req }) => {
        if (req.body.league === 'professional') return true;
        if (!val) throw new Error("Invalid ageGroup id");
        if (!/^[0-9a-fA-F]{24}$/.test(val)) throw new Error("Invalid ageGroup id");
        const ageGroup = await AgeGroup.findById(val);
        if (!ageGroup) throw new Error(`No age group for this id: ${val}`);
        return true;
    }),
    seasonFormat(check("season").trim().notEmpty().withMessage("Season is required")),
    leagueValid(check("league").notEmpty().withMessage("league is required")),
    matchDateNotPast(
        check("matchDate")
            .notEmpty().withMessage("Match date is required")
            .isISO8601().withMessage("Invalid date format")
    ),
    teamBelongsToMatchAgeGroup("homeTeam"),
    teamBelongsToMatchAgeGroup("awayTeam"),
    homeAwayDistinct,
    noDuplicateFixture,
    alternateHomeAway,
    check("venue").optional().isString().withMessage("venue must be a string"),
    ...statusLocked,
    attendeesLocked,
    validatorMiddleware,
];

export const updateValidate = [
    check("id").isMongoId().withMessage("Invalid SeasonMatch Id"),
    matchNotLocked,
    check("ageGroup")
        .optional()
        .isMongoId().withMessage("Invalid ageGroup id")
        .custom((val) =>
            AgeGroup.findById(val).then((ageGroup) => {
                if (!ageGroup) {
                    return Promise.reject(new Error(`No age group for this id: ${val}`));
                }
            })
        ),
    seasonFormat(check("season").optional().trim().notEmpty().withMessage("Season cannot be empty")),
    leagueValid(check("league").optional()),
    matchDateNotPast(check("matchDate").optional().isISO8601().withMessage("Invalid date format")),
    check("homeTeam").optional().custom(async (val, { req }) => {
        const team = await Team.findById(val);
        if (!team) throw new Error(`No team for this id: ${val}`);
        const { ageGroup: matchAgeGroup, league: matchLeague } = await resolveMatchContext(req);
        if (matchLeague !== 'professional' && matchAgeGroup && team.ageGroup && team.ageGroup.toString() !== matchAgeGroup.toString()) {
            throw new Error("homeTeam must belong to the match's age group");
        }
        if (matchLeague && team.league !== matchLeague) {
            throw new Error("homeTeam must belong to the match's league");
        }
        return true;
    }),
    check("awayTeam").optional().custom(async (val, { req }) => {
        const team = await Team.findById(val);
        if (!team) throw new Error(`No team for this id: ${val}`);
        const { ageGroup: matchAgeGroup, league: matchLeague } = await resolveMatchContext(req);
        if (matchLeague !== 'professional' && matchAgeGroup && team.ageGroup && team.ageGroup.toString() !== matchAgeGroup.toString()) {
            throw new Error("awayTeam must belong to the match's age group");
        }
        if (matchLeague && team.league !== matchLeague) {
            throw new Error("awayTeam must belong to the match's league");
        }
        return true;
    }),
    homeAwayDistinct,
    noDuplicateFixture,
    alternateHomeAway,
    check("venue").optional().isString().withMessage("venue must be a string"),
    ...statusLocked,
    attendeesLocked,
    validatorMiddleware,
];

export const deleteValidate = [
    check("id").isMongoId().withMessage("Invalid SeasonMatch Id"),
    matchNotLocked,
    validatorMiddleware,
];

// PATCH /:id/status — الكوتش الحاضر (attendee) أو الأدمن بس، منفصلة عن التعديل العام
export const updateStatusValidate = [
    check("id").isMongoId().withMessage("Invalid SeasonMatch Id"),
    check("status")
        .notEmpty().withMessage("status is required")
        .isIn(["scheduled", "completed", "cancelled", "postponed"])
        .withMessage("Invalid status"),
    check("result.homeScore").optional().isInt({ min: 0 }).withMessage("homeScore must be a non-negative integer"),
    check("result.awayScore").optional().isInt({ min: 0 }).withMessage("awayScore must be a non-negative integer"),
    validatorMiddleware,
];
