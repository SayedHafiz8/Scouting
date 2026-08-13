import dotenv from "dotenv";

dotenv.config({ path: "./config.env" });

// ============================================================================
// Bunny config + thin API wrappers (Stream + Storage + Purge).
// No new npm deps — native fetch + crypto only.
//
// Two Storage zones by design:
//   - "media" zone  → CDN pull zone WITH token auth  (avatars + scouting images)
//   - "vault" zone  → NO pull zone / NO CDN          (national ID cards)
// Bunny Stream (one video library) handles all video.
//
// الإعدادات بتتقرا lazy (وقت النداء) عشان التستات تقدر تظبط/تغيّر الـ env.
// ============================================================================

export const bunnyConfig = () => ({
    stream: {
        libraryId: process.env.BUNNY_STREAM_LIBRARY_ID,
        apiKey: process.env.BUNNY_STREAM_API_KEY, // management API (create/get/delete)
        tokenAuthKey: process.env.BUNNY_STREAM_TOKEN_AUTH_KEY, // playback token signing (F1)
        cdnHostname: process.env.BUNNY_STREAM_CDN_HOSTNAME, // pull-zone host for the library
        webhookSecret: process.env.BUNNY_STREAM_WEBHOOK_SECRET,
    },
    media: {
        zone: process.env.BUNNY_STORAGE_MEDIA_ZONE,
        apiKey: process.env.BUNNY_STORAGE_MEDIA_API_KEY,
        cdnHostname: process.env.BUNNY_MEDIA_CDN_HOSTNAME, // pull-zone host
        tokenAuthKey: process.env.BUNNY_MEDIA_TOKEN_AUTH_KEY, // URL token auth (F4)
    },
    vault: {
        zone: process.env.BUNNY_STORAGE_VAULT_ZONE,
        apiKey: process.env.BUNNY_STORAGE_VAULT_API_KEY,
        // deliberately NO cdnHostname — the vault zone has no pull zone (C3)
    },
    accountApiKey: process.env.BUNNY_ACCOUNT_API_KEY, // account-level, for CDN Purge (F5)
    limits: {
        maxVideoMB: Number(process.env.BUNNY_MAX_VIDEO_MB) || 50,
        // 0 = no duration cap
        maxVideoSeconds: Number(process.env.BUNNY_MAX_VIDEO_SECONDS) || 0,
        maxVideosPerPlayerMatch: Number(process.env.BUNNY_MAX_VIDEOS_PER_PLAYER_MATCH) || 5,
        maxFailedAttemptsPerPlayerMatch:
            Number(process.env.BUNNY_MAX_FAILED_ATTEMPTS_PER_PLAYER_MATCH) || 5,
    },
});

const STREAM_BASE = "https://video.bunnycdn.com";
const STORAGE_BASE = "https://storage.bunnycdn.com";

// ─────────────────────────────────────────────────────────────────────────────
// Bunny Stream — management API
// ─────────────────────────────────────────────────────────────────────────────

// إنشاء فيديو فاضي — بيرجّع الـ guid اللي المتصفح هيرفع عليه بالـ TUS
export const createStreamVideo = async (title) => {
    const { stream } = bunnyConfig();
    const res = await fetch(
        `${STREAM_BASE}/library/${stream.libraryId}/videos`,
        {
            method: "POST",
            headers: {
                AccessKey: stream.apiKey,
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({ title: title || "video" }),
        }
    );
    if (!res.ok) {
        throw new Error(`Bunny createStreamVideo failed: ${res.status}`);
    }
    return res.json(); // { guid, ... }
};

// جلب حالة/بيانات الفيديو — منها بنشتق status وحجم/مدة الفيديو (F2)
export const getStreamVideo = async (videoId) => {
    const { stream } = bunnyConfig();
    const res = await fetch(
        `${STREAM_BASE}/library/${stream.libraryId}/videos/${videoId}`,
        {
            headers: { AccessKey: stream.apiKey, Accept: "application/json" },
        }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`Bunny getStreamVideo failed: ${res.status}`);
    }
    return res.json();
};

export const deleteStreamVideo = async (videoId) => {
    const { stream } = bunnyConfig();
    const res = await fetch(
        `${STREAM_BASE}/library/${stream.libraryId}/videos/${videoId}`,
        {
            method: "DELETE",
            headers: { AccessKey: stream.apiKey, Accept: "application/json" },
        }
    );
    // 404 = خلاص مش موجود، اعتبرها نجاح (idempotent)
    if (!res.ok && res.status !== 404) {
        throw new Error(`Bunny deleteStreamVideo failed: ${res.status}`);
    }
    return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bunny Storage — object API (used for both the media zone and the vault zone;
// the caller passes which zone/key to use)
// ─────────────────────────────────────────────────────────────────────────────

const normalizeKey = (key) => key.replace(/^\/+/, "");

export const putStorageObject = async (zoneCfg, key, buffer, contentType) => {
    const res = await fetch(
        `${STORAGE_BASE}/${zoneCfg.zone}/${normalizeKey(key)}`,
        {
            method: "PUT",
            headers: {
                AccessKey: zoneCfg.apiKey,
                "Content-Type": contentType || "application/octet-stream",
            },
            body: buffer,
        }
    );
    if (!res.ok) {
        throw new Error(`Bunny putStorageObject failed: ${res.status}`);
    }
    return true;
};

export const getStorageObject = async (zoneCfg, key) => {
    const res = await fetch(
        `${STORAGE_BASE}/${zoneCfg.zone}/${normalizeKey(key)}`,
        {
            headers: { AccessKey: zoneCfg.apiKey },
        }
    );
    if (res.status === 404) return null;
    if (!res.ok) {
        throw new Error(`Bunny getStorageObject failed: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
        buffer: Buffer.from(arrayBuffer),
        contentType: res.headers.get("content-type") || "application/octet-stream",
    };
};

export const deleteStorageObject = async (zoneCfg, key) => {
    const res = await fetch(
        `${STORAGE_BASE}/${zoneCfg.zone}/${normalizeKey(key)}`,
        {
            method: "DELETE",
            headers: { AccessKey: zoneCfg.apiKey },
        }
    );
    if (!res.ok && res.status !== 404) {
        throw new Error(`Bunny deleteStorageObject failed: ${res.status}`);
    }
    return true;
};

// ─────────────────────────────────────────────────────────────────────────────
// CDN Purge (F5) — evict edge copies after a media-zone delete/replace.
// Uses the account-level API key. The vault zone has no CDN → never purged.
// ─────────────────────────────────────────────────────────────────────────────
export const purgeUrl = async (url) => {
    const { accountApiKey } = bunnyConfig();
    if (!accountApiKey) return false; // purge غير مفعّل — مش بنفشل العملية عشانه
    const res = await fetch(
        `https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`,
        {
            method: "POST",
            headers: { AccessKey: accountApiKey, Accept: "application/json" },
        }
    );
    return res.ok;
};
