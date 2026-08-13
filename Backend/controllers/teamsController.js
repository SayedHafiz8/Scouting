import asyncHandler from "express-async-handler";

import Team from "../models/teamModel.js";
import { creating, deleteOne, gettingAll, gettingSpecific, updating } from "../services/services.js";

export const setAgeIdToBody = (req, res, next) => {
    // Nested Router
    if(!req.body.ageGroup) req.body.ageGroup = req.params.id;
    next();
}

// @desc    Create new AgeGroup
// @route   POST api/v1/ages
// @access  private
export const create = creating(Team); 

// Team مالهاش حقل ملكية أصلاً (ownerFields متغيّبة عمداً) — دي داتا مرجعية مشتركة.
// لو حد ضاف protect للراوت ده بكرة، مفيش أي سكوب ملكية ممكن يتحسب بالغلط.
const TEAM_FILTERS = ["ageGroup", "league"];

// @desc    Get all age groups
// @route   POST api/v1/ages
// @access  private
export const getAll = gettingAll(Team, { parentField: "ageGroup", allowed: TEAM_FILTERS });

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