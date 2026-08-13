import crypto from "crypto";

import { bunnyConfig } from "../config/bunny.js";

// ============================================================================
// Signed-URL / token helpers (§2). Pure functions — no network — so they can be
// unit-tested in isolation before any controller depends on them.
//
// TWO different token schemes:
//   • Bunny STREAM iframe embed (iframe.mediadelivery.net) → sha256_hex(tokenAuthKey + videoId + expires),
//                             scoped to the videoId (F1) — this is the documented "embed view token".
//   • Everything else — Stream CDN direct files (b-cdn.net: HLS/MP4/thumbnail) AND
//     Storage (media zone, images/avatars) — go through the underlying CDN pull
//     zone's standard token auth: urlsafe_base64(sha256_raw(tokenAuthKey + path + expires)).
//     Verified against live Bunny: the videoId+hex scheme 403s on direct CDN file
//     requests even with a correct key — only the path-based scheme is accepted there.
// ============================================================================

// TTLs (seconds) per asset type — A3
export const TTL = {
    VIDEO_PLAYBACK: 3 * 60 * 60, // ~3h — must outlast the longest match video
    VIDEO_DOWNLOAD: 30 * 60, // one-shot
    VIDEO_THUMBNAIL: 30 * 60,
    IMAGE: 30 * 60, // quantised (F4)
};

const nowSec = () => Math.floor(Date.now() / 1000);

// ─────────────────────────────────────────────────────────────────────────────
// F4 — quantised expiry for cache-stable image URLs.
// expires = ceil(now / 30min) * 30min + 30min  → validity always in [30, 60] min,
// and byte-identical for every render inside the same 30-min bucket (cache hit).
// ─────────────────────────────────────────────────────────────────────────────
export const quantizedExpiry = (bucketSeconds = 1800, at = Date.now()) => {
    const s = Math.floor(at / 1000);
    return Math.ceil(s / bucketSeconds) * bucketSeconds + bucketSeconds;
};

// ─────────────────────────────────────────────────────────────────────────────
// Bunny Stream — per-video playback token (F1)
// ─────────────────────────────────────────────────────────────────────────────
export const streamToken = (videoId, expires, tokenAuthKey = bunnyConfig().stream.tokenAuthKey) =>
    crypto
        .createHash("sha256")
        .update(`${tokenAuthKey}${videoId}${expires}`)
        .digest("hex");

const streamUrl = (file, videoId, ttl) => {
    const { stream } = bunnyConfig();
    const path = `/${videoId}/${file}`;
    const expires = nowSec() + ttl;
    const token = storageToken(path, expires, stream.tokenAuthKey);
    return `https://${stream.cdnHostname}${path}?token=${token}&expires=${expires}`;
};

// HLS playlist (ABR) — the main playback source
export const streamHlsUrl = (videoId, ttl = TTL.VIDEO_PLAYBACK) =>
    streamUrl("playlist.m3u8", videoId, ttl);

// MP4 fallback (download) — A4. Must match the highest resolution enabled
// in the Bunny Stream library's Encoding settings, or Bunny 404s the request.
export const streamMp4Url = (videoId, ttl = TTL.VIDEO_DOWNLOAD) =>
    streamUrl("play_480p.mp4", videoId, ttl);

export const streamThumbnailUrl = (videoId, ttl = TTL.VIDEO_THUMBNAIL) =>
    streamUrl("thumbnail.jpg", videoId, ttl);

// Token-embed iframe — the token covers the videoId, same as the CDN URLs
export const streamEmbedUrl = (videoId, ttl = TTL.VIDEO_PLAYBACK) => {
    const { stream } = bunnyConfig();
    const expires = nowSec() + ttl;
    const token = streamToken(videoId, expires);
    return `https://iframe.mediadelivery.net/embed/${stream.libraryId}/${videoId}?token=${token}&expires=${expires}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// F3 — presigned TUS upload envelope for direct browser→Bunny video upload.
// The browser uploads over TUS to Bunny; the VPS never sees the bytes.
// signature = sha256_hex(libraryId + STREAM_API_KEY + expires + videoId).
// The management API key is NEVER sent to the browser — only this short-lived
// signature. `expires` is set generously (default 12h) so a flaky match-day
// upload can resume replaying the same signature.
// ─────────────────────────────────────────────────────────────────────────────
export const TUS_ENVELOPE_TTL = 12 * 60 * 60; // 12h

export const tusUploadEnvelope = (videoId, { mediaId, ttl = TUS_ENVELOPE_TTL } = {}) => {
    const { stream } = bunnyConfig();
    const expires = nowSec() + ttl;
    const signature = crypto
        .createHash("sha256")
        .update(`${stream.libraryId}${stream.apiKey}${expires}${videoId}`)
        .digest("hex");
    return {
        mediaId,
        libraryId: stream.libraryId,
        videoId,
        tusEndpoint: "https://video.bunnycdn.com/tusupload",
        expires,
        signature,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// Bunny Storage (media zone) — standard URL token authentication.
// token = base64( sha256_raw(securityKey + path + expires) ) made URL-safe.
// `path` is the object path with a leading slash, e.g. "/players/abc.jpg".
// ─────────────────────────────────────────────────────────────────────────────
export const storageToken = (path, expires, securityKey) =>
    crypto
        .createHash("sha256")
        .update(`${securityKey}${path}${expires}`)
        .digest("base64")
        .replace(/\n/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");

// وقّع مسار object في زون الميديا. `expiresOverride` بيستخدمه توقيع الأفاتار
// عشان الـ quantised expiry الثابت (F4).
export const signMediaUrl = (key, { ttl = TTL.IMAGE, expiresOverride } = {}) => {
    const { media } = bunnyConfig();
    const path = `/${String(key).replace(/^\/+/, "")}`;
    const expires = expiresOverride ?? nowSec() + ttl;
    const token = storageToken(path, expires, media.tokenAuthKey);
    return `https://${media.cdnHostname}${path}?token=${token}&expires=${expires}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// C4 — avatar/profileImg resolver, 3-way guard. Used by model toJSON transforms.
//   falsy       → null
//   http(s)://  → passthrough (legacy Cloudinary URL)
//   else        → Bunny media-zone path → token-sign with the QUANTISED expiry
//                 so the same avatar yields the same URL within a 30-min bucket.
// ─────────────────────────────────────────────────────────────────────────────
export const resolveImageUrl = (value) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    return signMediaUrl(value, { expiresOverride: quantizedExpiry() });
};
