# Contract — proScout endpoint decision matrix (Stage 2 exit state)

**Feature**: `003-proscout-data-scope` | **Date**: 2026-08-20

Constitution Principle VI requires a per-endpoint decision for the role, defaulting to refusal, and
requires the inventory to be built from `Backend/routes/*.js` — **not** from `openapi.json` alone.
This table is that inventory for `proScout`, as it must stand when this feature merges.

Legend — **Scoped**: reachable, results narrowed by the central scope layer. **403**: refused by
`allowedTo`. **403 (guard)**: passes `allowedTo`, refused per-document by `ownership.js`.

---

## Players

| Method | Route | proScout | Enforced by | Δ this phase |
|---|---|---|---|---|
| GET | `/players` | Scoped | base filter from `playerScopeFor` | scope added (was `MATCH_NOTHING`) |
| GET | `/players/:id` | Scoped / 403 (guard) | `checkPlayerOwnership` proScout branch | **gate opened** |
| GET | `/players/counts` | Scoped | `$match` from `playerScopeFor` | **gate opened** |
| GET | `/players/reports/average-ratings` | Scoped | id pre-filter + existing authorship filter | **gate opened** |
| POST | `/players` | 403 | `allowedTo` | — (Stage 4) |
| PATCH | `/players/:id` | 403 | `allowedTo` | — (Stage 4) |
| DELETE | `/players/:id` | 403 | `allowedTo` (admin only) | — |
| PATCH | `/players/:id/status` | 403 | `allowedTo` (admin only) | — |
| PATCH | `/players/:id/observers` | 403 | `allowedTo` (admin only) | — permanent |
| PATCH | `/players/:id/coach` | 403 | `allowedTo` (admin only) | — permanent |
| PATCH | `/players/:id/profileImg` | 403 | `allowedTo` | — (Stage 4) |
| GET | `/users/:id/players` (nested) | Scoped | same base filter; parent scope ANDs on top | scope added |

**Response masking** (research R11): `GET /players` and `GET /players/:id` apply
`maskObservedForCoach` to proScout — `observed` → `pending`, `observers` stripped.

## Scouting reports

| Method | Route | proScout | Δ |
|---|---|---|---|
| GET | `/players/:playerId/reports` | 403 | — (Stage 4) |
| POST | `/players/:playerId/reports` | 403 | — (Stage 4) |
| GET/PATCH/DELETE | `/players/:playerId/reports/:id` | 403 | — (Stage 4) |

`checkReportOwnership` gains an explicit proScout branch even though nothing routes to it yet
(research R10).

## Media

| Method | Route | proScout | Δ |
|---|---|---|---|
| GET/POST | `/players/:playerId/media` | 403 | — (Stage 4) |
| GET/PATCH/DELETE | `/players/:playerId/media/:id` | 403 | — (Stage 4) |
| GET | `/players/:playerId/media/:id/download` | 403 | — (Stage 4) |

`checkMediaOwnership` gains an explicit proScout branch now (research R10). This closes Constraint
**C-2**'s named gap for the new role: the function compares `uploadedBy` without a role check, so an
unlisted role would see anything it had uploaded, by accident rather than by decision.

## Season matches

| Method | Route | proScout | Enforced by | Δ this phase |
|---|---|---|---|---|
| GET | `/seasonMatches` | Scoped | `seasonMatchBaseFilterFor` | **gate opened** |
| GET | `/seasonMatches/:id` | Scoped / 403 (guard) | new `checkSeasonMatchScope` | **gate opened** |
| POST | `/seasonMatches` | 403 | `allowedTo` (admin only) | — permanent |
| PATCH/DELETE | `/seasonMatches/:id` | 403 | `allowedTo` (admin only) | — permanent |
| PATCH | `/seasonMatches/:id/status` | 403 | `allowedTo` | — (Stage 6 recommends permanent) |
| POST/DELETE | `/seasonMatches/:id/attend` | 403 | `allowedTo` | — (Stage 6) |

`checkSeasonMatchAttendee` gains an explicit proScout branch now (research R10).

## Teams

| Method | Route | proScout | Enforced by | Δ this phase |
|---|---|---|---|---|
| GET | `/teams` | Scoped | new `baseFilterFn` on `gettingAll(Team, …)` | **scope added** (was unscoped 200 — closes **Stage-1 contract C6**) |
| GET | `/teams/:id` | Scoped / 403 (guard) | new `checkTeamScope` | **scope added** (was unscoped 200) |
| POST/PATCH/DELETE | `/teams`, `/teams/:id` | 403 | `allowedTo` (admin only) | — |
| GET | `/ages/:id/teams` (nested) | Scoped | same base filter | scope added |

**Note on the two `C`-numbering schemes**: `C6` above is an item from the **Stage-1 spec's** contract
list (as cited in `tests/roles/proScoutRoleDefinition.test.js:124`, "contract C6"). Everywhere else in
this document, `C-2`/`C-3`/`C-4` refer to **Constitution** constraints, which run C-1…C-5 only. Two
schemes, same letter — always qualify which one you mean.

**Note on `/ages/:id/teams` vs `/ages`**: these two rows look contradictory — proScout is permanently
denied `/ages` (below) yet reaches `/ages/:id/teams`. They are consistent. `ageGroupRouter.js:109`
mounts `ageRouter.use('/:id/teams', teamRouter)` with **no** `allowedTo` of its own, and Constraint
C-3's denial is route-level on `/ages` and `/ages/:id`. The nested path is a *teams* route that
happens to hang off an age-group id — it is denied nowhere and scoped by the same team base filter.
Do not "fix" this by adding a role gate to the mount; that would change behavior for coach and
observer, violating Principle III.

This closes the "known accepted exception" that Stage 1 recorded for `GET /teams` and that
`tests/roles/proScoutRoleDefinition.test.js` currently asserts as an unscoped 200 — **that test
expectation must be updated by this feature**, and it is the one pre-existing proScout test whose
change is expected and intended.

## Age groups

| Method | Route | proScout | Δ |
|---|---|---|---|
| GET | `/ages`, `/ages/:id` | **200 — public** | — unchanged, see below |
| POST/PATCH/DELETE | `/ages`, `/ages/:id` | 403 | — permanent |

> **⚠️ Corrected during implementation.** An earlier version of this row said `403 permanent
> (Constraint C-3)`. That was wrong, and the reason matters.
>
> Constitution **C-3** states the new role *"MUST يُمنَع من `/ages` و `/ages/:id` صراحةً عبر
> `allowedTo`"*. **That requirement is not implementable as written.** `ageGroupRouter.js:113,116`
> declares `.get(getAll)` and `.get(getSpecific)` with **no `protect` at all** — there is no
> `req.user` for `allowedTo` to gate on. These routes are readable by *anyone*, authenticated or
> not, which is precisely the registered tech-debt item `TODO(AGES_UNAUTHENTICATED_READ)`,
> explicitly out of scope by owner decision.
>
> Adding `protect` here would change behavior for unauthenticated callers, outside this stage's
> scope, so it was **not** done. `tests/roles/proScoutDataScope.test.js` now asserts the real
> behavior (200 with a token, 200 without one) so nobody mistakes an absent denial for a present
> one. Closing C-3's gap for real requires resolving the tech-debt item first.

The write verbs above genuinely are 403 — those carry `protect, allowedTo(ROLES.ADMIN)`.

## Users, evaluations, dashboards, vault

| Area | proScout | Δ |
|---|---|---|
| `/users/**` | 403 | — permanent |
| `/coachEvaluations/**`, `/observerEvaluations/**` | 403 | — permanent |
| `/dashboard/admin`, `/dashboard/coach`, `/dashboard/observer` | 403 | — (Stage 5 adds `/dashboard/proScout`) |
| `/auth/vaultPassword/**`, ID-card reads | 403 | — permanent (Constitution: vault stays admin-only) |

---

## Invariant asserted by this contract

Every row not marked **Scoped** returns **403**, never `200` with an empty body. Constitution
Principle I: *"قائمة فارغة تعني 'لا توجد بيانات'، لا 'ممنوع'"*. The two are distinguishable by
status code, and the negative tests assert the code, not the body.
