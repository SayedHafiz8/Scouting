import crypto from "crypto";

import {
    bunnyConfig,
    putStorageObject,
    getStorageObject,
    deleteStorageObject,
    purgeUrl,
} from "../config/bunny.js";

// ============================================================================
// Image storage helpers (§5 / §5b). sharp compression stays in the controllers;
// these just move the compressed buffer to the right Bunny Storage zone and
// handle cleanup. Two zones:
//   • media zone  → CDN-fronted, token-signed on read (avatars + scouting images)
//   • vault zone  → NO CDN; bytes only ever streamed through the backend (ID cards)
// ============================================================================

// object key like "profiles/<uuid>.jpg" — folders mirror the old Cloudinary layout
export const buildKey = (folder, ext = "jpg") =>
    `${folder}/${crypto.randomUUID()}.${ext}`;

// ── media zone (CDN-fronted) ──────────────────────────────────────────────
export const uploadMediaImage = async (buffer, key, contentType = "image/jpeg") => {
    const { media } = bunnyConfig();
    await putStorageObject(media, key, buffer, contentType);
    return key;
};

// delete + purge the edge (F5). Best-effort by default — never blocks the request path.
//
// strict: true بيخلي الدالة ترمي بدل ما تبلع الخطأ. بيتستخدم بس في مسارات الـretention
// اللي بتمسح اليوزر نهائياً (§9): هناك لو Bunny فشل لازم نوقف حذف الدوكيومنت، عشان
// مايبقاش عندنا سجل متمسح وبايتات لسه موجودة على التخزين للأبد. الـdefault فضل
// best-effort عشان كل المستدعيين القدام (استبدال صورة، حذف ميديا) مايتأثروش.
export const deleteMediaImage = async (key, { strict = false } = {}) => {
    if (!key || /^https?:\/\//i.test(key)) return; // skip legacy Cloudinary URLs
    const { media } = bunnyConfig();
    try {
        await deleteStorageObject(media, key);
        await purgeUrl(`https://${media.cdnHostname}/${key}`);
    } catch (err) {
        if (strict) throw err;
        console.error(`Failed to delete media image ${key}:`, err.message);
    }
};

// ── vault zone (no CDN) — ID cards ────────────────────────────────────────
export const uploadVaultImage = async (buffer, key, contentType = "image/jpeg") => {
    const { vault } = bunnyConfig();
    await putStorageObject(vault, key, buffer, contentType);
    return key;
};

export const getVaultImage = async (key) => {
    if (!key || /^https?:\/\//i.test(key)) return null; // legacy URL → not in the vault
    const { vault } = bunnyConfig();
    return getStorageObject(vault, key);
};

// strict: true → بترمي بدل ما تبلع (زي deleteMediaImage فوق). أهم هنا تحديداً لأن
// دي صور بطاقات الرقم القومي — أخطر داتا في النظام وأكترها حساسية للـretention.
export const deleteVaultImage = async (key, { strict = false } = {}) => {
    if (!key || /^https?:\/\//i.test(key)) return;
    const { vault } = bunnyConfig();
    try {
        await deleteStorageObject(vault, key);
    } catch (err) {
        if (strict) throw err;
        console.error(`Failed to delete vault image ${key}:`, err.message);
    }
};
