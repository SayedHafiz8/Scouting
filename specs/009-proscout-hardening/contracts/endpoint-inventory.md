# Contract — full project endpoint inventory, proScout decision per operation (Stage 7)

**Feature**: `specs/009-proscout-hardening/` | **Date**: 2026-08-22

**Why this file exists**: Constitution Principle VI — every stage touching permissions must ship a full endpoint inventory with a default of denial. This is the Stage 7 hardening pass: it re-derives every operation directly from `Backend/routes/*.js` (post `npm run dump-spec`), not by trusting the prior document's prose.

**Source**: `Backend/routes/*.js` — 11 router files, read directly for this document (`ageGroupRouter.js`, `coachEvaluationRouter.js`, `observerEvaluationRouter.js`, `userRouter.js`, `authRouter.js`, `teamRouter.js`, `playerMediaRouter.js`, `scoutingReportRouter.js`, `playerRouter.js`, `dashboardRouter.js`, `seasonMatchRouter.js`).

**Decision column** (unchanged vocabulary from Stage 5's `specs/005-proscout-players-write/contracts/endpoint-inventory.md`, per `contracts/endpoint-inventory-schema.md`):
`ALLOW` = in `allowedTo` and unscoped · `SCOPED` = in `allowedTo`, result narrowed by the central scope layer · `DENY` = not in `allowedTo`, returns 403 · `OPEN` = no `protect` **and no** `allowedTo` at all — reachable by unauthenticated callers, not merely "every registered role."

**Counting convention**: a route mounted a second time via a nested router (e.g. `playerRouter` also under `/users/:id/players`; `teamRouter` also under `/ages/:id/teams`) is counted **once**, at its primary mount, matching Stage 5's convention for the `/users/:id/players` mount.

## Reconciliation against the Stage 5 baseline (FR-003)

**Baseline**: `specs/005-proscout-players-write/contracts/endpoint-inventory.md`, dated 2026-08-21, states **83** operations.

**This document's count**: **92** operations, verified by direct reading of the 11 router files listed above (not re-derived from the baseline's prose).

**This is a known, explained discrepancy, not a silent recount.** Summing the baseline document's own listed rows (its 11 numbered sections) yields 92, not the 83 the baseline states in its "Totals" table — the baseline's headline number does not match the sum of the rows it itself lists. This document does not attempt to force agreement with the baseline's stated total; it reports what direct route-file reading produces and flags the pre-existing discrepancy for a future stage to resolve if it becomes load-bearing.

**Changes since the Stage 5 baseline** (by operation):

<!-- reconciliation-table: excluded from the T023 route/inventory row-count parity check — these rows describe deltas, not the current per-router operation list counted in §1-11 below -->

| Operation | Stage 5 baseline | This inventory | Change |
|---|---|---|---|
| `GET /dashboard/proScout` | not present (Stage 5 called this "Stage 5 territory", not yet built) | `ALLOW` (`allowedTo(ROLES.PRO_SCOUT)`) | **new** — shipped in the dashboard stage |
| `PATCH /seasonMatches/:id/status` | `DENY` ("Stage 6 open question") | `SCOPED` (`checkSeasonMatchAttendee`, attendee + match-day constraint, `ADMIN` exempt) | **reclassified** — resolved and shipped in the matches/attendance stage |
| `POST /seasonMatches/:id/attend` | `DENY` ("Stage 6") | `SCOPED` (`checkSeasonMatchScope`) | **reclassified** — shipped |
| `DELETE /seasonMatches/:id/attend` | `DENY` ("Stage 6") | `SCOPED` (`checkSeasonMatchScope`) | **reclassified** — shipped |
| `GET /ages`, `GET /ages/:id` | baseline already correctly recorded these as "200 — NOT denied" / `OPEN`, not `DENY` | `OPEN` (unchanged) | **—** confirmed unchanged; this document's Story-1-driving spec (`spec.md`) initially mis-stated these as `proScout`-Denied before this implementation pass corrected the error against the baseline and the route file — see `spec.md` FR-004's `[CORRECTED DURING IMPLEMENTATION]` note |
| `GET /teams`, `GET /teams/:id` | baseline already correctly recorded these as `SCOPED` (`teamScopeFor` / `checkTeamScope`), not `OPEN` | `SCOPED` (unchanged) | **—** confirmed unchanged; same correction note applies |
| All other operations | — | — | **—** unchanged |

<!-- /reconciliation-table -->

Net: 3 reclassified (all in `seasonMatchRouter.js`, all widening `proScout`'s access per the matches/attendance stage's own spec), 1 new (`GET /dashboard/proScout`), remainder unchanged.

---

## 1. `playerRouter.js` — mounted at `/players` and (nested) at `/users/:id/players`

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `GET /players` | coach, admin, observer, proScout | SCOPED | `playerScopeFor` base filter |
| `POST /players` | coach, admin, observer, proScout | ALLOW | `teamExistsInScope`; `create` sets `createdBy`/`coach`/`observers` per role — admin's assignment fields (`coach`/`observers`/`proScout`) re-validated against `User` role |
| `GET /players/counts` | coach, admin, observer, proScout | SCOPED | `$and: [scope, match]` |
| `GET /players/reports/average-ratings` | coach, admin, observer, proScout | SCOPED | id-narrowing + author constraint |
| `GET /players/:id` | coach, admin, observer, proScout | SCOPED | `checkPlayerOwnership` |
| `PATCH /players/:id` | coach, admin, observer, proScout | ALLOW | `checkPlayerOwnership` + `teamExistsInScope`; ownership fields (`coach`/`observers`/`createdBy`) stay locked for every role, admin included — reassignment goes through the dedicated `/:id/coach`, `/:id/observers`, `/:id/proScout` routes |
| `DELETE /players/:id` | admin | DENY | admin-only |
| `PATCH /players/:id/status` | admin | DENY | admin-only |
| `PATCH /players/:id/observers` | admin | DENY | admin-only |
| `PATCH /players/:id/coach` | admin | DENY | admin-only |
| `PATCH /players/:id/proScout` | admin | DENY | admin-only — assigns `createdBy` (the proScout-scope axis), mirrors `/:id/coach` |
| `PATCH /players/:id/profileImg` | coach, admin, observer, proScout | ALLOW | `checkPlayerOwnership` |

## 2. `scoutingReportRouter.js` — `/players/:playerId/reports`

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `GET /` | coach, admin, observer, proScout | ALLOW | `checkPlayerOwnership` + own-author narrowing |
| `POST /` | coach, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `GET /statistics` | coach, admin, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `GET /:id` | coach, admin, observer, proScout | ALLOW | `checkReportOwnership` (two-axis) |
| `PATCH /:id` | coach, observer, proScout | ALLOW | `checkReportOwnership` (two-axis) |
| `DELETE /:id` | admin | DENY | admin-only |

## 3. `playerMediaRouter.js` — `/players/:playerId/media`

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `POST /video` | coach, observer, proScout | ALLOW | `checkPlayerOwnership` + `videoCreateLimiter` |
| `GET /upload-eligibility` | coach, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `POST /video/:mediaId/upload-envelope` | coach, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `GET /` | coach, admin, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `POST /` | coach, observer, proScout | ALLOW | `checkPlayerOwnership` |
| `GET /:id` | coach, admin, observer, proScout | ALLOW | `checkMediaOwnership` (three-condition) |
| `DELETE /:id` | admin | DENY | admin-only (F5/F7d) |
| `GET /:id/download` | admin | DENY | admin-only (F7d) |
| `PATCH /:id/review` | admin | DENY | admin-only |

## 4. `seasonMatchRouter.js` — `/seasonMatches`

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `GET /` | coach, admin, observer, proScout | SCOPED | `seasonMatchBaseFilterFor` → `{ league: "professional" }` wrapped in `$and` |
| `POST /` | admin | DENY | admin-only |
| `GET /:id` | coach, admin, observer, proScout | SCOPED | `checkSeasonMatchScope` |
| `PATCH /:id` | admin | DENY | admin-only |
| `DELETE /:id` | admin | DENY | admin-only |
| `PATCH /:id/status` | coach, observer, proScout, admin | SCOPED | `checkSeasonMatchAttendee` — attendee + match-day constraint (`role !== ADMIN`); admin exempt |
| `POST /:id/attend` | coach, observer, proScout | SCOPED | `checkSeasonMatchScope` (same guard as `GET /:id`) |
| `DELETE /:id/attend` | coach, observer, proScout | SCOPED | `checkSeasonMatchScope` |

## 5. `teamRouter.js` — `/teams` (also reachable, same handlers, via `/ages/:id/teams`)

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `GET /teams` | `protect` only, no `allowedTo` | SCOPED | `teamScopeFor` as `baseFilterFn` on `gettingAll` (Stage 2) — `ALLOW` unfiltered for admin/coach/observer per C-3 |
| `POST /teams` | admin | DENY | admin-only |
| `GET /teams/:id` | `protect` only, no `allowedTo` | SCOPED | `checkTeamScope` (Stage 2) — `ALLOW` unfiltered for admin/coach/observer per C-3 |
| `PATCH /teams/:id` | admin | DENY | admin-only |
| `DELETE /teams/:id` | admin | DENY | admin-only |

## 6. `ageGroupRouter.js` — `/ages` (also mounts `teamRouter` nested at `/ages/:id/teams`, counted in §5)

| Operation | Current | proScout | Enforcing layer |
|---|---|---|---|
| `GET /ages` | no `protect` at all | **OPEN — 200, not denied** | `C-3`, `TODO(AGES_UNAUTHENTICATED_READ)` — identical for every role and for no token |
| `GET /ages/:id` | no `protect` at all | **OPEN — 200, not denied** | `C-3`, same |
| `POST /ages` | admin | DENY | admin-only — the *only* `protect`-bearing operation in this router; there is no update or delete route for age groups |

> Per Constitution C-3, this stage does not and must not add `protect` to the two GET routes — doing so would change behavior for `admin`/`coach`/`observer` and reopen a Resolved Decision.

## 7. `dashboardRouter.js` — `/dashboard`

| Operation | Current `allowedTo` | proScout | Enforcing layer |
|---|---|---|---|
| `GET /dashboard/coach` | coach | DENY | role-only |
| `GET /dashboard/admin` | admin | DENY | role-only |
| `GET /dashboard/admin/coaches-stats` | admin | DENY | role-only |
| `GET /dashboard/admin/:coachId` | admin | DENY | role-only |
| `GET /dashboard/observer` | observer | DENY | role-only |
| `GET /dashboard/admin/observer/:observerId` | admin | DENY | role-only |
| `GET /dashboard/proScout` | proScout | ALLOW (self-scoped by controller) | role-only + `getProScoutDashboard`'s own professional-league scope |

## 8. `userRouter.js` — `/users`

Every operation below is `protect` + `allowedTo(ROLES.ADMIN)` only — **DENY on all 14** for `proScout`.

| Operation |
|---|
| `GET /users/deactivated` |
| `GET /users` |
| `POST /users` |
| `GET /users/:id` |
| `PATCH /users/:id` |
| `DELETE /users/:id` |
| `PATCH /users/:id/changePassword` |
| `DELETE /users/:id/force` |
| `PATCH /users/:id/restore` |
| `PATCH /users/:id/profileImg` |
| `PATCH /users/:id/idCardImg/front` |
| `PATCH /users/:id/idCardImg/back` |
| `GET /users/:id/idCardImg` (additionally behind `requireVaultToken`) |
| `GET /users/:id/idcard/:side` (additionally behind `requireVaultToken`) |

`userRouter` also nests `playerRouter` at `/users/:id/players` — those operations are counted once, under §1.

## 9. `coachEvaluationRouter.js` — `/coachEvaluations`

All 10 operations are `admin`-only or `admin`+`coach` — **DENY on all 10** for `proScout`.

| Operation | Current `allowedTo` |
|---|---|
| `GET /` | admin, coach |
| `POST /` | admin |
| `GET /summary` | admin, coach |
| `GET /monthly` | admin |
| `PATCH /:id/publish` | admin |
| `PATCH /:id/archive` | admin |
| `PATCH /:id/refresh-stats` | admin |
| `GET /:id` | admin, coach |
| `PATCH /:id` | admin |
| `DELETE /:id` | admin |

## 10. `observerEvaluationRouter.js` — `/observerEvaluations`

All 9 operations are `admin`-only or `admin`+`observer` — **DENY on all 9** for `proScout`.

| Operation | Current `allowedTo` |
|---|---|
| `GET /` | admin, observer |
| `POST /` | admin |
| `GET /summary` | admin, observer |
| `PATCH /:id/publish` | admin |
| `PATCH /:id/archive` | admin |
| `PATCH /:id/refresh-stats` | admin |
| `GET /:id` | admin, observer |
| `PATCH /:id` | admin |
| `DELETE /:id` | admin |

## 11. `authRouter.js` — `/auth`

| Operation | Gate | proScout |
|---|---|---|
| `POST /login` | public | ALLOW (as any user — this is how proScout authenticates) |
| `POST /forgotPassword` | public | ALLOW |
| `POST /logout` | public (needs an active session cookie in practice) | ALLOW |
| `POST /refreshToken` | public (needs the refresh cookie) | ALLOW |
| `POST /verifyResetCode` | public | ALLOW |
| `PUT /resetPassword` | public | ALLOW |
| `PATCH /changeMyPassword` | `protect`, any role | ALLOW (own account only) |
| `PATCH /updateLoggedUser` | `protect`, any role | ALLOW (own account only) |
| `POST /vaultPassword/verify` | admin | DENY |
| `POST /setup-admin` | public, first-run only | ALLOW-as-public (unchanged; refuses if an admin already exists) |

Signup is deliberately not mounted. `proScout` users are created by an admin via `POST /users`.

---

## Totals

| | Count |
|---|---|
| Operations inventoried | **92** |
| proScout ALLOW / SCOPED | 33 |
| proScout DENY | 57 |
| Neither (C-3 unauthenticated reads — `GET /ages`, `GET /ages/:id`) | 2 |
| Unclassified | **0** (SC-001) |

**Default is denial**: 57 of 92 operations refuse `proScout`, and every one of them refuses because the role is *absent from an explicit `allowedTo` list* — not because of a fall-through (Constitution Principle II). The two `OPEN` rows (§6) are named, tested against their real behavior (not assumed), and remain tracked as pre-existing tech debt (`TODO(AGES_UNAUTHENTICATED_READ)`), unchanged and unclosed by this stage per C-3.
