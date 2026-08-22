# Contract — proScout endpoint decisions for the Players domain

**Feature**: `specs/005-proscout-players-write/` | **Date**: 2026-08-21

Built from `Backend/routes/*.js` (the constitution's Principle VI requires the router files, not
`openapi.json`, as the source). Every row states the decision **and** the enforcing layer, so the
implementation and the negative tests are read off the same table.

Legend for **After**: `ALLOW` = in `allowedTo`, scoped; `403` = not in `allowedTo`;
`SCOPED` = in `allowedTo`, result narrowed by the central scope layer.

---

## 1. `/players` — `routes/playerRouter.js`

| Method + path | Before | After | Enforcing layer | Status |
|---|---|---|---|---|
| `GET /players` | SCOPED | SCOPED | `playerScopeFor` in base position | Stage 2 — verify only |
| `GET /players/counts` | SCOPED | SCOPED | `$and: [scope, match]` in `getCountsByAgeGroup` | Stage 2 — verify only |
| `GET /players/reports/average-ratings` | SCOPED | SCOPED | id-narrowing + author constraint | Stage 2 — verify only |
| `GET /players/:id` | ALLOW | ALLOW | `checkPlayerOwnership` proScout branch | Stage 2 — verify only |
| **`POST /players`** | 403 | **ALLOW** | `createValidate` → `teamExistsInScope`; `create` sets `createdBy`, omits `coach` | **new** |
| **`PATCH /players/:id`** | 403 | **ALLOW** | `checkPlayerOwnership` + `updateValidate` → `teamExistsInScope` | **new** |
| `DELETE /players/:id` | 403 | 403 | admin-only, unchanged | — |
| `PATCH /players/:id/status` | 403 | 403 | admin-only, unchanged | — |
| `PATCH /players/:id/observers` | 403 | **403 (asserted)** | admin-only — FR-013 | negative test |
| `PATCH /players/:id/coach` | 403 | 403 | admin-only, unchanged | — |
| **`PATCH /players/:id/profileImg`** | 403 | **ALLOW** | `checkPlayerOwnership` added to the chain (R7) | **new** |

### Response-shape contract for the two write endpoints

`POST /players` — request body identical to coach's. Server-assigned, client-rejected:
`coach` (omitted for proScout), `createdBy` (= caller), `ageGroup` (derived), `status`,
`observers`, `profileImg`, `searchTokens`.

Rejections:

| Condition | Status | Body |
|---|---|---|
| `team` outside `league: "professional"` | **400** | `No team for this id: <id>` — byte-identical to an unknown id (research R4) |
| `team` id that does not exist | 400 | same message |
| birth year outside 2007–2019 | 400 | existing model error, unchanged |
| target player outside scope (`PATCH`) | **403** | `You are not allowed to access this player's data`, logged via `logScopeDenial` |

> **Note on FR-008.** The spec says "403". The implementation is **400**, deliberately: a 403 for
> "real team, wrong league" versus 400 for "no such team" is an enumeration oracle that defeats
> `checkTeamScope`. FR-008's intent — "rejected, never created" — is met. See research R4.

---

## 2. `/players/:playerId/reports` — `routes/scoutingReportRouter.js`

| Method + path | Before | After | Enforcing layer | Status |
|---|---|---|---|---|
| **`GET /reports`** | 403 | **ALLOW** | `checkPlayerOwnership` + author scope in `getAll` (R8) | **new** |
| **`GET /reports/statistics`** | 403 | **ALLOW** | `checkPlayerOwnership` (R8) | **new** |
| **`POST /reports`** | 403 | **ALLOW** | `checkPlayerOwnership`; `coach` = caller | **new** |
| **`GET /reports/:id`** | 403 | **ALLOW** | `checkReportOwnership` proScout branch (R6) | **new** |
| **`PATCH /reports/:id`** | 403 | **ALLOW** | `checkReportOwnership` proScout branch (R6) | **new** |
| `DELETE /reports/:id` | 403 | **403 (asserted)** | admin-only today — **not** coach+observer (R2) | negative test |

`checkReportOwnership` proScout branch — **both** conditions required:

```
report.coach == req.user._id          # author, same field coach/observer use
AND player-of-report ∈ playerScopeFor(req)
```

Failing either → 403 + `logScopeDenial({ resource: "scoutingReport" })`.

---

## 3. `/players/:playerId/media` — `routes/playerMediaRouter.js`

| Method + path | Before | After | Enforcing layer | Status |
|---|---|---|---|---|
| **`POST /media/video`** | 403 | **ALLOW** | `checkPlayerOwnership` + `videoCreateLimiter` | **new** |
| **`GET /media/upload-eligibility`** | 403 | **ALLOW** | `checkPlayerOwnership` | **new** |
| **`POST /media/video/:mediaId/upload-envelope`** | 403 | **ALLOW** | `checkPlayerOwnership` | **new** |
| **`GET /media`** | 403 | **ALLOW** | `checkPlayerOwnership` (R8) | **new** |
| **`POST /media`** | 403 | **ALLOW** | `checkPlayerOwnership` | **new** |
| **`GET /media/:id`** | 403 | **ALLOW** | `checkMediaOwnership` proScout branch (R6) | **new** |
| `DELETE /media/:id` | 403 | 403 | admin-only (F5/F7d), unchanged | — |
| `GET /media/:id/download` | 403 | **403 (asserted)** | admin-only (F7d) — **not** granted (R3) | negative test |
| `PATCH /media/:id/review` | 403 | 403 | admin-only, unchanged | — |

`checkMediaOwnership` proScout branch — **all three** conditions:

```
media.uploadedBy == req.user._id
AND media.player == req.params.playerId
AND player-of-media ∈ playerScopeFor(req)
```

---

## 4. Adjacent domains — explicitly unchanged

| Route group | proScout | Note |
|---|---|---|
| `GET /teams`, `GET /teams/:id` | SCOPED | Stage 2, `teamScopeFor` / `checkTeamScope` |
| `GET /ages`, `GET /ages/:id` | **200 for everyone incl. anonymous** | C-3 unenforceable — `TODO(AGES_UNAUTHENTICATED_READ)`. Test documents actual behavior (R12) |
| `/seasonMatches/*` | as Stage 2 | Stage 6 |
| `/dashboard/*` | 403 | Stage 5 |
| `/users`, `/observers`, `/coachEvaluations`, `/observerEvaluations` | 403 | Stage 7 sweep |

---

## 5. Frontend contract

| Surface | proScout behavior | Mechanism |
|---|---|---|
| Players list — age-group card grid | **not rendered** | `skipGroupsView()` returns true (R10) |
| Players list — `GET /ages` request | **not issued** | `loadGroups()` early-returns |
| Players list — `ageGroup` query param | **never sent** | flat view leaves both sources empty |
| Players list — status chips | rendered (`!isObserver()`), no `observed` chip (`isAdmin()` only) | existing gates, unchanged |
| Players list — "Add player" button | **rendered** | gate widens from `isCoach()` to `isCoach() \|\| isProScout()` |
| Player detail — age-group section | n/a | no age-group section exists in the component (verified) |
| Player detail — `observers` / `observed` | masked | server-side, `maskObservedForCoach` |
| Player form — Team dropdown | professional teams only | server-side `teamScopeFor`; age-group narrowing kept but unnamed (R11) |
| Player form — `TEAM_LOCKED` / `TEAM_HINT` / `TEAM_EMPTY` copy | proScout-specific strings, EN + AR | new i18n keys |
| Admin → user form → role select | gains `proScout` | derived from `UserRole`, not hard-coded (R13) |
| `/age-groups`, `/users`, `/observers` direct URL | `/unauthorized` | Stage 3 `roleGuard`, verify only |

---

## 6. Regression contract (Principle III)

For `admin`, `coach`, and `observer`, **count and content** must be unchanged on:
`GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`,
`GET /players/:id`, all `/reports/*`, all `/media/*`, `PATCH /players/:id/profileImg`.

`Backend/tests/isolation.test.js` must pass **with no edits**. The one place this is at genuine
risk is R7 — inserting `checkPlayerOwnership` into the `profileImg` chain — which is why that route
carries its own coach + admin regression test.
