# Contract: `proScout` Role Behavior

This stage adds no new endpoints. The "contract" here is the behavioral guarantee the existing API surface must uphold for the new role value, expressed as request/response pairs any implementation must satisfy. `npm run dump-spec` regenerates `openapi.json` afterward so `UserRole` reflects the new enum value — no manual schema edits to the OpenAPI spec.

## C1 — Role enum accepts `proScout`

**Request**: `POST /api/v1/users` (admin-authenticated) with `{ ..., "role": "proScout" }`
**Response**: `201`, created user document has `role: "proScout"`

**Request**: same, with `{ ..., "role": "notARealRole" }`
**Response**: `422` validation error (unchanged existing behavior for any invalid role)

## C2 — Login works identically for `proScout`

**Request**: `POST /api/v1/auth/login` with valid `proScout` user credentials
**Response**: `200`, body contains a valid access token; `refreshToken` httpOnly cookie is set — same shape as for `coach`/`observer`/`admin`

## C3 — List endpoints return empty, not an error, not other users' data

**Request**: `GET /api/v1/players` — Bearer token for an authenticated `proScout` user
**Response**: `200`, `{ status, count: 0, pagination: {...}, data: { documents: [] } }`

This applies to every owner-scoped list endpoint (`ownerFields`-governed): `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`, `GET /seasonMatches` (via its `baseFilterFn`, which also defaults to no access for an unrecognized role — see research.md), and any dashboard aggregate endpoint gated the same way.

## C4 — Role-gated routes reject with 403

**Request**: any route whose middleware chain includes `allowedTo(...)` where `proScout` is not in the list (i.e., every existing protected route today, since no route lists `proScout` yet)
**Response**: `403`

## C5 — `/:id` direct-access routes reject via ownership guards

**Request**: `GET /api/v1/players/:id` for a `proScout`-authenticated user, any `:id`
**Response**: `403` (route itself is gated by `allowedTo("coach", "observer")` today, which already excludes `proScout` — C4 covers this before ownership.js is even reached)

## C6 — Known accepted exception: `GET /teams`

**Request**: `GET /api/v1/teams` — Bearer token for an authenticated `proScout` user
**Response**: `200` with the full team list (no role gate exists on this route for *any* role today — Constitution C-3). This is not a regression introduced by this stage; it is pre-existing, documented behavior that Stage 2 is responsible for scoping by `league`.

## Frontend contract

**Action**: `proScout` user completes login in the browser
**Result**: Router navigates to `/unauthorized` (via `RoleLandingService.landingFor()`'s `default` branch) — no dashboard, sidebar item, or player/match data is rendered.
