# Phase 1 Data Model: proScout Hardening (Stage 7)

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-22

This stage introduces **no new persisted schema** — no new Mongoose model, no new field, no migration. It audits and tests the access surface Stages 0-6 already built. The "entities" below are the two evidence artifacts this stage produces, described here so `tasks.md` and the contracts in `contracts/` have a single, agreed shape to build against — not database collections.

## Entity: Endpoint Disposition Row

One row per operation enumerated from `Backend/routes/*.js` (per FR-001/FR-002). Lives in `contracts/endpoint-inventory.md`, produced during implementation (not by planning) since it requires exhaustively reading every route file.

| Field | Type | Notes |
|---|---|---|
| `operation` | string | `METHOD /path`, e.g. `GET /players/:id` |
| `currentAllowedTo` | string | The role list currently passed to `allowedTo(...)` on this route, or `(none)` if absent |
| `proScoutDisposition` | enum | One of `ALLOW`, `SCOPED`, `DENY`, `OPEN` — vocabulary carried forward unchanged from `specs/005-proscout-players-write/contracts/endpoint-inventory.md` (R3) |
| `stage7Delta` | enum | `new` \| `reclassified` \| `—` (unchanged since the Stage 5 baseline) |
| `enforcingLayer` | string | Which mechanism produces the disposition (e.g. `checkPlayerOwnership`, `playerScopeFor`, `admin-only`, or `no protect — C-3` for the `OPEN` rows) |

**Validation rules**:
- Every operation found in `Backend/routes/*.js` MUST have exactly one row (FR-002) — an operation with zero or more than one row is a build failure for this artifact.
- `proScoutDisposition = OPEN` MUST carry an `enforcingLayer` value that names the relevant constitution constraint (`C-3`) rather than being left blank. **[CORRECTED DURING IMPLEMENTATION]** Only `GET /ages` and `GET /ages/:id` qualify as `OPEN` (verified against `ageGroupRouter.js`: zero middleware on either route). `GET /teams` and `GET /teams/:id` carry `protect` and are `SCOPED` for `proScout` (via `teamScopeFor`/`checkTeamScope`, Stage 2) — they are `ALLOW` for `admin`/`coach`/`observer` (C-3's preserved existing-role behavior), never `OPEN`.
- `stage7Delta` MUST be computable by diffing against the Stage 5 baseline's 83 operations (FR-003); an operation absent from both documents is a `new` row, one absent from the current route files but present in Stage 5 is a removal and MUST be called out in the inventory's prose, not just dropped silently.

## Entity: Denial Log Entry

The shape written by `Backend/utils/accessLog.js` to the process log stream (`console.warn(JSON.stringify(entry))`) on every denied `proScout` (and other-role) request. The `scope_denied` variant already exists (Stage 2); the `role_denied` variant is this stage's one production addition (R1/R2).

| Field | Type | Notes |
|---|---|---|
| `event` | enum | `"scope_denied"` (existing, `middlewares/ownership.js`) \| `"role_denied"` (new, `controllers/authController.js` `allowedTo`) |
| `userId` | string \| null | `String(req.user._id)`, or `null` if no authenticated user |
| `role` | string \| null | `req.user.role`, or `null` |
| `method` | string \| null | `req.method` — present for both variants; `scope_denied` entries already carry it |
| `path` | string \| null | `req.originalUrl ?? req.url` |
| `resource` | string | `scope_denied`: a domain noun (`"player"`, `"seasonMatch"`, `"team"`, ...). `role_denied`: the route's mount path stripped of the `/api/v1` prefix (e.g. `"ageGroups"`, `"users"`) — no resource-specific context exists this early in the middleware chain. |
| `resourceId` | string \| null | `String(id)` when the route is a `/:id` route, else `null` (never a placeholder) |
| `at` | string | ISO 8601 timestamp |

**Validation rules**:
- Both variants MUST share the same four Principle-IV-required fields (`userId`, `role`, `path`, `resourceId`) with identical field names — no per-call-site renaming (R2's rationale for a single internal writer).
- `role_denied` entries MUST NOT invent a `resourceId` when the denying route is a collection route (e.g. `GET /users`) — `null` is correct, per spec.md's Edge Cases.
- Adding the `role_denied` event MUST NOT change the response returned to the caller (status code or body) for any role — this is a logging side-effect only, verified indirectly by the FR-018 regression suite already asserting response equality for coach/observer/admin.
