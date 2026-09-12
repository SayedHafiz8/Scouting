import asyncHandler from "express-async-handler";

import Team from "../models/teamModel.js";
import { creating, deleteOne, gettingAll, gettingSpecific, updating } from "../services/services.js";
import { teamScopeFor } from "./../services/scope.js";

export const setAgeIdToBody = (req, res, next) => {
    // Nested Router
    if(!req.body.ageGroup) req.body.ageGroup = req.params.id;
    next();
}

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
// audit-backend — `active` **مش** هنا عن قصد. هو بيفترض true من المخطط،
// والفهرس الفريد على Team شرطي عليه
// (partialFilterExpression: { active: { $eq: true } })، يعني إنشاء فريق
// بـactive: false كان بيعدّي من قيد التفرّد على (name, ageGroup, league).
// ageGroup بيوصل في الـbody: setAgeIdToBody بيحطه من param الراوت المتداخل
// قبل الفاليديشن والكنترولر.
const TEAM_CREATE_FIELDS = ["name", "ageGroup", "league", "clubName"];

export const create = creating(Team, { allowed: TEAM_CREATE_FIELDS }); 

// Team مالهاش حقل ملكية أصلاً (ownerFields متغيّبة عمداً) — دي داتا مرجعية مشتركة.
// لو حد ضاف protect للراوت ده بكرة، مفيش أي سكوب ملكية ممكن يتحسب بالغلط.
// Stage 2 مابيغيّرش ده: سكوب الدوري **مش** سكوب ملكية، فمكانه الفلتر الأساسي.
const TEAM_FILTERS = ["ageGroup", "league"];

// @desc    Get all age groups
// @route   POST api/v1/ages
// @access  private
//
// Stage 2 — الوسيط الرابع (baseFilterFn) بيسكب الفرق للـproScout على
// league: "professional". بيرجع {} لكل رول قائم فسلوكهم مطابق تماماً (C-3:
// القراءات المفتوحة تبقى مفتوحة).
//
// ⚠️ الـnull التالت مقصود ومطلوب: التوقيع هو
// gettingAll(model, filterOptions, populateOptions, baseFilterFn) — تمرير الدالة
// في الموضع التالت بيتقبل بصمت كـpopulateOptions، فتفضل القايمة بلا سكوب
// وتفشل **مفتوحة** من غير أي خطأ.
export const getAll = gettingAll(
    Team,
    // audit-database I2 — name مفهرس كـprefix في الـunique
    // { name, ageGroup, league }، فالترتيب بيه مغطّى.
    { parentField: "ageGroup", allowed: TEAM_FILTERS, sortable: ["name"] },
    null,
    teamScopeFor
);

// @desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const getSpecific = gettingSpecific(Team);

// @desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const deleting = deleteOne(Team);

//@desc    Get specific age 
// @route   POST api/v1/ages/:id
// @access  private
export const update = updating(Team);