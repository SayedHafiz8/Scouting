import { describe, it, expect } from "vitest";
import crypto from "crypto";

import {
    streamToken,
    streamHlsUrl,
    streamEmbedUrl,
    storageToken,
    signMediaUrl,
    quantizedExpiry,
    resolveImageUrl,
    TTL,
} from "../utils/mediaUrl.js";

// ============================================================================
// F1 — Bunny Stream per-video playback token
// ============================================================================
describe("F1 — Stream playback token", () => {
    const KEY = "test-stream-token-auth-key"; // matches globalSetup
    const VIDEO = "abc-123";
    const EXPIRES = 1_800_000_000;

    it("matches the documented concatenation order sha256_hex(key + videoId + expires)", () => {
        const expected = crypto
            .createHash("sha256")
            .update(`${KEY}${VIDEO}${EXPIRES}`)
            .digest("hex");
        expect(streamToken(VIDEO, EXPIRES)).toBe(expected);
    });

    it("is a 64-char hex string and deterministic", () => {
        const a = streamToken(VIDEO, EXPIRES);
        const b = streamToken(VIDEO, EXPIRES);
        expect(a).toBe(b);
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes when videoId, expires, or key changes", () => {
        const base = streamToken(VIDEO, EXPIRES);
        expect(streamToken("other", EXPIRES)).not.toBe(base);
        expect(streamToken(VIDEO, EXPIRES + 1)).not.toBe(base);
        expect(streamToken(VIDEO, EXPIRES, "different-key")).not.toBe(base);
    });

    it("builds HLS + embed URLs carrying token & expires for the right video", () => {
        const hls = streamHlsUrl(VIDEO);
        expect(hls).toContain(`/${VIDEO}/playlist.m3u8?token=`);
        expect(hls).toMatch(/[?&]expires=\d+/);

        const embed = streamEmbedUrl(VIDEO);
        expect(embed).toContain(`/embed/12345/${VIDEO}?token=`); // libraryId from globalSetup
    });

    it("playback TTL is ~3h so a long match video's tail still validates (A3)", () => {
        expect(TTL.VIDEO_PLAYBACK).toBe(3 * 60 * 60);
    });
});

// ============================================================================
// F4 — quantised expiry + cache-stable storage URLs
// ============================================================================
describe("F4 — quantised avatar expiry", () => {
    it("formula = ceil(now/30min)*30min + 30min", () => {
        const at = 1_000_000_000_000; // fixed ms
        const s = Math.floor(at / 1000);
        const expected = Math.ceil(s / 1800) * 1800 + 1800;
        expect(quantizedExpiry(1800, at)).toBe(expected);
    });

    it("validity is always between 30 and 60 minutes", () => {
        for (const offsetSec of [0, 1, 900, 1799, 1800]) {
            const at = (1_000_000_000 + offsetSec) * 1000;
            const exp = quantizedExpiry(1800, at);
            const validity = exp - Math.floor(at / 1000);
            expect(validity).toBeGreaterThanOrEqual(1800); // ≥ 30 min — no near-instant 403
            expect(validity).toBeLessThanOrEqual(3600); // ≤ 60 min
        }
    });

    it("is byte-identical for two renders inside the same 30-min bucket", () => {
        // two moments 5 minutes apart but within the same bucket
        const t1 = 1_000_000_000_000 + 60_000; // +1 min
        const t2 = 1_000_000_000_000 + 360_000; // +6 min
        // pick a base aligned so both land in the same bucket
        const bucket = 1800;
        const b1 = Math.ceil(Math.floor(t1 / 1000) / bucket);
        const b2 = Math.ceil(Math.floor(t2 / 1000) / bucket);
        if (b1 === b2) {
            expect(quantizedExpiry(bucket, t1)).toBe(quantizedExpiry(bucket, t2));
        }
        // and a later bucket differs
        const later = t1 + 40 * 60 * 1000; // +40 min → next bucket
        expect(quantizedExpiry(bucket, later)).not.toBe(quantizedExpiry(bucket, t1));
    });
});

describe("F4 — media-zone URL token auth", () => {
    const KEY = "test-media-token-auth-key"; // matches globalSetup

    it("matches urlsafe_base64(sha256(key + path + expires))", () => {
        const path = "/players/abc.jpg";
        const expires = 1_800_000_000;
        const expected = crypto
            .createHash("sha256")
            .update(`${KEY}${path}${expires}`)
            .digest("base64")
            .replace(/\n/g, "")
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        expect(storageToken(path, expires, KEY)).toBe(expected);
    });

    it("token is URL-safe (no +, /, or =)", () => {
        const url = signMediaUrl("players/abc.jpg");
        const token = new URL(url).searchParams.get("token");
        expect(token).not.toMatch(/[+/=]/);
    });

    it("signMediaUrl normalises a key with/without leading slash to the same path", () => {
        const fixed = quantizedExpiry();
        const a = signMediaUrl("players/x.jpg", { expiresOverride: fixed });
        const b = signMediaUrl("/players/x.jpg", { expiresOverride: fixed });
        expect(a).toBe(b);
        expect(a).toContain("/players/x.jpg?token=");
    });
});

// ============================================================================
// C4 — 3-way avatar resolver
// ============================================================================
describe("C4 — resolveImageUrl 3-way guard", () => {
    it("falsy → null", () => {
        expect(resolveImageUrl(null)).toBeNull();
        expect(resolveImageUrl(undefined)).toBeNull();
        expect(resolveImageUrl("")).toBeNull();
    });

    it("legacy http(s) URL → passthrough unsigned", () => {
        const legacy = "https://res.cloudinary.com/x/image/upload/y.jpg";
        expect(resolveImageUrl(legacy)).toBe(legacy);
    });

    it("bunny path → token-signed media URL with quantised (stable) expiry", () => {
        const url = resolveImageUrl("players/abc.jpg");
        expect(url).toContain("/players/abc.jpg?token=");
        expect(url).toMatch(/[?&]expires=\d+/);
        // stable within the bucket → two calls in the same tick are identical (cache hit)
        expect(resolveImageUrl("players/abc.jpg")).toBe(url);
    });
});
