import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { resolveImageUrl } from "../utils/mediaUrl.js";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['coach', 'admin', 'observer'],
        default: 'coach'
    },
    profileImg: {
        type: String
    },
    idCardFrontImg: {
        type: String
    },
    idCardBackImg: {
        type: String
    },
    // بيتفلعوا لو الأدمن غلط كذا مرة في إعادة إدخال باسوورده لفتح صور البطاقة الشخصية
    vaultFailedAttempts: {
        type: Number,
        default: 0
    },
    vaultLockedUntil: {
        type: Date,
        default: null
    },
    address: {
        type: String
    },
    birthDate: {
        type: Date
    },
    active: {
        type: Boolean,
        default: true
    },
    deactivatedAt: {
        type: Date,
        default: null
    },
    phoneNumber: {
        type:String,
    },
    passwordChangedAt: Date,
    passwordResetCode: String,
    passwordResetExpires: Date,
    passwordResetVerified: Boolean,
    refreshToken: String,
    refreshTokenExpires: Date,
});

userSchema.pre('save', async function() {
    if (!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, 12);
})

userSchema.pre(/^find/,  function() {
    if (this.getOptions().bypassFilter) return;
    this.where({ active: { $ne: false } });
});

userSchema.set("toJSON", {
    transform: (doc, ret) => {
        delete ret.password;
        delete ret.passwordResetCode;
        delete ret.passwordResetExpires;
        delete ret.passwordResetVerified;
        delete ret.refreshToken;
        delete ret.refreshTokenExpires;
        delete ret.idCardFrontImg;
        delete ret.idCardBackImg;
        delete ret.vaultFailedAttempts;
        delete ret.vaultLockedUntil;
        // C4/F4: profileImg بيتحوّل لـ URL موقّع (Bunny) أو passthrough (legacy) أو null
        if (ret.profileImg) ret.profileImg = resolveImageUrl(ret.profileImg);
        return ret;
    }
});

// index لتسريع queries على role (admin notifications + dashboard coach count)
userSchema.index({ role: 1 });
// cleanupDeactivated cron: بيدور على المستخدمين المعطلين قبل تاريخ معين
userSchema.index({ active: 1, deactivatedAt: 1 });

const User = mongoose.model('User', userSchema);

export default User;