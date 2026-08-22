# Contract — full project endpoint inventory, proScout decision per operation

**Feature**: `specs/005-proscout-players-write/` | **Date**: 2026-08-21

**Why this file exists**: Constitution Principle VI — *"كل مرحلة تمس الصلاحيات MUST ترفق جرداً لكل
endpoints المشروع وقرار كل واحد منها للرول المعني (`مسموح` / `مرفوض`)، بحيث يكون الافتراضي هو الرفض."*
Stage 4 changes `allowedTo` on 13 operations, so the obligation is live. Analysis finding **D1**.

**Source**: enumerated from `Backend/routes/*.js` — the constitution requires the router files, **not**
`openapi.json`, because that file has been incomplete historically.

**Decision column**:
`ALLOW` = in `allowedTo` and unscoped · `SCOPED` = in `allowedTo`, result narrowed by the central
scope layer · `DENY` = not in `allowedTo`, returns 403 · `OPEN` = no `allowedTo` at all (see notes).

**Reading the "Stage 4" column**: `new` = changed by this stage · `—` = untouched.

---

## 1. `playerRouter.js` — mounted at `/api/v1/players` **and** at `/api/v1/users/:id/players`

> ⚠️ **The double mount is load-bearing.** `userRouter.js:482` does
> `userRouter.use("/:id/players", playerRouter)`. Every row below is therefore reachable at a second
> URL where `req.params.id` is a **user id**, which `setUserIdToBody` copies into `req.body.coach`.
> See finding **B1** in `research.md` addendum — this is why the create path must `delete`
> `req.body.coach` for proScout rather than merely not setting it.

| Operation | Current `allowedTo` | proScout | Stage 4 | Enforcing layer |
|---|---|---|---|---|
| `GET /players` | coach, admin, observer, **proScout** | SCOPED | — | `playerScopeFor` base filter |
| `POST /players` | coach | **ALLOW** | **new** | `teamExistsInScope`; `create` sets `createdBy`, deletes `coach` |
| `GET /players/counts` | coach, admin, observer, **proScout** | SCOPED | — | `$and: [scope, match]` |
| `GET /players/reports/average-ratings` | coach, admin, observer, **proScout** | SCOPED | — | id-narrowing + author constraint |
| `GET /players/:id` | coach, admin, observer, **proScout** | SCOPED | — | `checkPlayerOwnership` |
| `PATCH /players/:id` | coach | **ALLOW** | **new** | `checkPlayerOwnership` + `teamExistsInScope` |
| `DELETE /players/:id` | admin | DENY | — | admin-only |
| `PATCH /players/:id/status` | admin | DENY | — | admin-only |
| `PATCH /players/:id/observers` | admin | DENY | — | admin-only — **FR-013, asserted** |
| `PATCH /players/:id/coach` | admin | DENY | — | admin-only |
| `PATCH /players/:id/profileImg` | coach, admin | **ALLOW** | **new** | `checkPlayerOwnership` added to chain |

## 2. `scoutingReportRouter.js` — `/players/:playerId/reports`

| Operation | Current | proScout | Stage 4 | Enforcing layer |
|---|---|---|---|---|
| `GET /` | coach, admin, observer | **ALLOW** | **new** | `checkPlayerOwnership` + own-author narrowing |
| `POST /` | coach, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `GET /statistics` | coach, admin, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `GET /:id` | coach, admin, observer | **ALLOW** | **new** | `checkReportOwnership` (two-axis) |
| `PATCH /:id` | coach, observer | **ALLOW** | **new** | `checkReportOwnership` (two-axis) |
| `DELETE /:id` | admin | DENY | — | admin-only — **research R2, asserted** |

## 3. `playerMediaRouter.js` — `/players/:playerId/media`

| Operation | Current | proScout | Stage 4 | Enforcing layer |
|---|---|---|---|---|
| `POST /video` | coach, observer | **ALLOW** | **new** | `checkPlayerOwnership` + `videoCreateLimiter` |
| `GET /upload-eligibility` | coach, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `POST /video/:mediaId/upload-envelope` | coach, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `GET /` | coach, admin, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `POST /` | coach, observer | **ALLOW** | **new** | `checkPlayerOwnership` |
| `GET /:id` | coach, admin, observer | **ALLOW** | **new** | `checkMediaOwnership` (three-condition) |
| `DELETE /:id` | admin | DENY | — | admin-only (F5/F7d) |
| `GET /:id/download` | admin | DENY | — | admin-only (F7d) — **research R3, asserted** |
| `PATCH /:id/review` | admin | DENY | — | admin-only — **asserted** |

## 4. `seasonMatchRouter.js` — `/seasonMatches` *(Stage 6 territory, unchanged here)*

| Operation | Current | proScout | Stage 4 |
|---|---|---|---|
| `GET /` | coach, admin, observer, **proScout** | SCOPED | — |
| `POST /` | admin | DENY | — |
| `GET /:id` | coach, admin, observer, **proScout** | SCOPED (`checkSeasonMatchScope`) | — |
| `PATCH /:id` | admin | DENY | — |
| `DELETE /:id` | admin | DENY | — |
| `PATCH /:id/status` | coach, observer, admin | DENY | — (Stage 6 open question) |
| `POST /:id/attend` | coach, observer | DENY | — (Stage 6) |
| `DELETE /:id/attend` | coach, observer | DENY | — (Stage 6) |

## 5. `teamRouter.js` — `/teams`, also mounted at `/ages/:id/teams`

| Operation | Current | proScout | Stage 4 | Note |
|---|---|---|---|---|
| `GET /teams` | **OPEN** (`protect`, no `allowedTo`) | SCOPED | — | Constraint C-3 accepted exception; `teamScopeFor` as `baseFilterFn` |
| `GET /ages/:id/teams` | **OPEN** | SCOPED | — | Same controller, so the same scope applies — verified |
| `POST /teams` | admin | DENY | — | |
| `GET /teams/:id` | **OPEN** | SCOPED | — | `checkTeamScope` |
| `PATCH /teams/:id` | admin | DENY | — | |
| `DELETE /teams/:id` | admin | DENY | — | |

## 6. `ageGroupRouter.js` — `/ages`

| Operation | Current | proScout | Stage 4 | Note |
|---|---|---|---|---|
| `GET /ages` | **no `protect` at all** | **200 — NOT denied** | — | ⚠️ C-3 unenforceable, `TODO(AGES_UNAUTHENTICATED_READ)` |
| `GET /ages/:id` | **no `protect` at all** | **200 — NOT denied** | — | ⚠️ same |
| `POST /ages` | admin | DENY | — | |

> These two rows are the only place in this inventory where the answer is neither ALLOW nor DENY.
> Anonymous callers get 200. Hiding the Age Groups nav item (Stage 3) and suppressing the client's
> `/ages` request (Stage 4, task T017) are **intent** changes. Neither closes C-3.

## 7. `dashboardRouter.js` — `/dashboard` *(Stage 5 territory)*

| Operation | Current | proScout | Stage 4 |
|---|---|---|---|
| `GET /dashboard/coach` | coach | DENY | — |
| `GET /dashboard/admin` | admin | DENY | — |
| `GET /dashboard/admin/coaches-stats` | admin | DENY | — |
| `GET /dashboard/admin/:coachId` | admin | DENY | — |
| `GET /dashboard/observer` | observer | DENY | — |
| `GET /dashboard/admin/observer/:observerId` | admin | DENY | — |

## 8. `userRouter.js` — `/users`

Every operation is `allowedTo(ROLES.ADMIN)`: `GET /deactivated`, `GET /`, `POST /`, `GET /:id`,
`PATCH /:id`, `DELETE /:id`, `PATCH /:id/changePassword`, `DELETE /:id/force`,
`PATCH /:id/restore`, `PATCH /:id/profileImg`, `PATCH /:id/idCardImg/front`,
`PATCH /:id/idCardImg/back`, `GET /:id/idCardImg`, `GET /:id/idcard/:side`.

**proScout: DENY on all 14.** The last two additionally sit behind `requireVaultToken` — the
constitution's "بيانات الـvault MUST تبقى admin-only" clause. **Stage 4 grants nothing here.**

## 9. `coachEvaluationRouter.js` — `/coachEvaluations`

| Operation | Current | proScout |
|---|---|---|
| `GET /`, `GET /summary`, `GET /:id` | admin, coach | DENY |
| `GET /monthly`, `POST /`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/publish`, `PATCH /:id/archive`, `PATCH /:id/refresh-stats` | admin | DENY |

## 10. `observerEvaluationRouter.js` — `/observerEvaluations`

| Operation | Current | proScout |
|---|---|---|
| `GET /`, `GET /summary`, `GET /:id` | admin, observer | DENY |
| `POST /`, `PATCH /:id`, `DELETE /:id`, `PATCH /:id/publish`, `PATCH /:id/archive`, `PATCH /:id/refresh-stats` | admin | DENY |

## 11. `authRouter.js` — `/auth`

| Operation | Gate | proScout |
|---|---|---|
| `POST /login`, `POST /forgotPassword`, `POST /logout`, `POST /refreshToken`, `POST /verifyResetCode`, `PUT /resetPassword` | public | ALLOW (as any user) |
| `PATCH /changeMyPassword`, `PATCH /updateLoggedUser` | `protect`, any role | ALLOW (own account only) |
| `POST /vaultPassword/verify` | admin | DENY |
| `POST /setup-admin` | public, first-run only | ALLOW-as-public (unchanged) |

> Signup is deliberately not mounted. proScout users are created by an admin via `POST /users`.

## 12. Webhooks — outside `/api`

`POST /webhooks/bunny/:secret` — unguessable secret path, no user auth, no role involvement.
Unchanged and out of scope.

---

## Totals

| | Count |
|---|---|
| Operations inventoried | **83** |
| proScout ALLOW / SCOPED after Stage 4 | 24 |
| proScout DENY | 57 |
| Neither (C-3 unauthenticated reads) | 2 |
| Changed by Stage 4 | **13** |

**Default is denial**: 57 of 83 operations refuse proScout, and every one of them refuses because a
role is *absent from an explicit `allowedTo` list* — not because of a fall-through. The two
exceptions (§6) are named, tested against their real behavior, and tracked as pre-existing tech debt.

## Negative-test obligations arising from this inventory

Testing all 57 denials individually is neither useful nor maintainable. Per Principle VI's item 4
("اختبار على مستوى الراوتر مش على مستوى كل route"), the obligation is discharged as:

1. **Per-route assertions** for the denials adjacent to a granted capability, where a mistake is
   plausible: `PATCH /players/:id/observers`, `DELETE /players/:id`, `PATCH /players/:id/status`,
   `PATCH /players/:id/coach`, `DELETE /reports/:id`, `GET /media/:id/download`, `DELETE /media/:id`,
   `PATCH /media/:id/review` — tasks T030, T036, T039, T051.
2. **Router-level sweeps** for whole domains this stage grants nothing in — `/users`,
   `/coachEvaluations`, `/observerEvaluations`, `/dashboard` — one parameterised test per router
   asserting 403 on a representative operation of each method (task T058).
3. **Documented non-denial** for `/ages` and `/ages/:id` (task T052).
