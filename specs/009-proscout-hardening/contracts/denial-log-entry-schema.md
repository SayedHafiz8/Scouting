# Contract: Denial Log Entry Format (Stage 7)

**Governs**: `Backend/utils/accessLog.js` — the existing `logScopeDenial` export (Stage 2, unchanged) plus the new `logRoleDenial` export this stage adds (FR-016, R1/R2).
**Consumed by**: `Backend/tests/roles/proScoutDenialLogging.test.js` (FR-016), and any future incident investigation reading the process log stream.

See `data-model.md` → "Entity: Denial Log Entry" for the full field table and validation rules. This file is the binding contract test code and reviewers check new call sites against.

## Function contracts

```js
/**
 * Scope/ownership-layer denial (existing, Stage 2 — unchanged by this stage).
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {string} params.resource     domain noun: "player" | "seasonMatch" | "team" | ...
 * @param {string} params.resourceId
 */
export function logScopeDenial({ req, resource, resourceId }) { /* event: "scope_denied" */ }

/**
 * Role-gate denial (new, this stage — called from authController.js's allowedTo()).
 * @param {object} params
 * @param {import('express').Request} params.req
 * @param {string} params.resource     route mount path, "/api/v1" prefix stripped, e.g. "ageGroups"
 */
export function logRoleDenial({ req, resource }) { /* event: "role_denied" */ }
```

Both MUST delegate to one shared internal writer so the four Principle-IV-required fields (`userId`, `role`, `path`, `resourceId`) are assembled in exactly one place — no call site constructs the log line by hand.

## Call-site obligations

- `middlewares/ownership.js` — unchanged; already calls `logScopeDenial` on every explicit-deny branch (Stage 2, C-2 closure).
- `controllers/authController.js` → `allowedTo(...)` — new: on the `!roles.includes(req.user.role)` branch, call `logRoleDenial({ req, resource: <derived from req.baseUrl> })` **before** calling `next(new AppError(...))`, so a request that throws downstream for unrelated reasons doesn't suppress the log.
- No other call site is added by this stage. A test-only route created for FR-012's `allowedTo` unit test MUST NOT be routed through the real Express app (it is a direct function-call unit test per Story 4's corrected scope), so it does not produce a log entry to assert on.

## Test obligations (FR-016)

- **[CORRECTED DURING IMPLEMENTATION — see `research.md` R7]** Spy on `console.warn` (the real sink) and parse its JSON output, rather than mocking `logScopeDenial`/`logRoleDenial` and inspecting `req.params`/`req.baseUrl` off the captured `req` argument after the response completes — Express restores those properties on the shared `req` object once the middleware layer unwinds, so a post-hoc read is stale. The entry object itself is serialized synchronously at call time and is unaffected.
- Assert exactly one matching log line (`event: "role_denied"` or `"scope_denied"`) per denied request (not zero, not more than once).
- Assert the four required fields are present and correctly typed on every entry — `userId`/`role` non-null (the request is always authenticated in these scenarios; the `null` branches in `data-model.md` cover the unauthenticated case, which is out of scope here since `allowedTo` runs after `protect`).
