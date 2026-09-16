import mongoose from "mongoose";
import User from "../models/userModel.js";
import { ROLES } from "../constants/roles.js";

// شرط "اللاعبين اللي المتابع ده كشافهم" — نفس قاعدة resolveScout في playerController:
// مالهمش كوتش، والمتابع هو createdBy، أو لاعب قديم أنشأه أدمن والمتابع أول واحد في observers.
// الأدمنز المتعطلين بيتحسبوا برده (bypassFilter) عشان لاعبينهم القدام مايتحسبوش متابعة غلط.
export const observerScoutMatch = async (observerId) => {
    const oid = new mongoose.Types.ObjectId(String(observerId));
    const adminIds = await User.find({ role: ROLES.ADMIN }).setOptions({ bypassFilter: true }).distinct("_id");
    return {
        coach: null,
        $or: [
            { createdBy: oid },
            { createdBy: { $in: adminIds }, "observers.0": oid },
        ],
    };
};
