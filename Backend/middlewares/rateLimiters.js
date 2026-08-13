import rateLimit from "express-rate-limit";

const isTest = process.env.NODE_ENV === "test";
const windowMs = (Number(process.env.RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000;

// ============================================================================
// Route-specific limiters for the Bunny video flow.
// In test mode the caps are raised so functional tests don't trip them, while
// still exercising the limiter chain. Dedicated tests set NODE_ENV back if they
// need to assert throttling (see the webhook flood test).
// ============================================================================

// Minting a Bunny video is a privileged, resource-touching action → throttle it.
export const videoCreateLimiter = rateLimit({
    windowMs,
    max: isTest ? 10000 : Number(process.env.VIDEO_CREATE_RATE_LIMIT_MAX) || 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: "error",
        message: "Too many video upload requests, please try again later",
    },
});

// F7a — the webhook is world-reachable and every hit triggers an outbound Bunny
// API GET; cap it so a flood can't amplify into many API calls.
export const bunnyWebhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isTest ? 10000 : Number(process.env.BUNNY_WEBHOOK_RATE_LIMIT_MAX) || 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: "error", message: "Too many requests" },
});
