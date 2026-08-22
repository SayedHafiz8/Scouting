# Contract — `GET /api/v1/dashboard/proScout`

**Feature**: Stage 5, `specs/007-proscout-dashboard/`

## Route composition

```js
dashboardRouter.get("/proScout", allowedTo(ROLES.PRO_SCOUT), getProScoutDashboard);
```

`protect` is already applied router-wide (`dashboardRouter.use(protect)`), matching every other
dashboard route. Declaration order is free — `/proScout` collides with no `/:param` segment on this
router (the only parameterised paths are `/admin/:coachId` and `/admin/observer/:observerId`, both
under `/admin`). It is declared alongside `/observer` for readability.

**Layer coverage** (the three mandatory layers, Constitution §"الطبقات الثلاث"):

| Layer | Applied here |
|---|---|
| Role gate | `protect` + `allowedTo(ROLES.PRO_SCOUT)` |
| List scope | `playerScopeFor` / `seasonMatchScopeFor` from `services/scope.js` |
| Document ownership | n/a — no `/:id` path; the endpoint exposes no addressable resource |

## Request

No path params, no query params, no body. Any query string sent is ignored — there is no filter
surface on this endpoint, so there is no key for a client to use to widen the scope.

## Responses

### 200 — proScout

```json
{
  "status": "success",
  "data": {
    "totalPlayers": 12,
    "upcomingMatchesCount": 3,
    "totalReports": 27,
    "upcomingMatches": [
      {
        "_id": "6712…",
        "matchDate": "2026-09-04T00:00:00.000Z",
        "homeTeam": { "_id": "66f1…", "name": "Al Ahly A", "clubName": "Al Ahly" },
        "awayTeam": { "_id": "66f2…", "name": "Zamalek A", "clubName": "Zamalek" },
        "venue": "Cairo Stadium",
        "status": "scheduled",
        "result": null
      }
    ],
    "latestResults": [
      {
        "_id": "6710…",
        "matchDate": "2026-08-18T00:00:00.000Z",
        "homeTeam": { "_id": "66f1…", "name": "Al Ahly A", "clubName": "Al Ahly" },
        "awayTeam": { "_id": "66f3…", "name": "Pyramids A", "clubName": "Pyramids" },
        "venue": null,
        "status": "completed",
        "result": { "homeScore": 2, "awayScore": 1 }
      }
    ],
    "recentReports": [
      {
        "_id": "6713…",
        "player": { "_id": "66aa…", "name": "Ahmed Ali", "position": "CM" },
        "matchDate": "2026-08-18T00:00:00.000Z",
        "overallRating": 7.4
      }
    ]
  }
}
```

Envelope is `{ status, data }` with the payload **directly** under `data` — matching
`/dashboard/coach` and `/dashboard/observer` exactly (`res.json({ status: "success", data })`), not
the `{ data: { document } }` envelope used by the CRUD factory.

### 200 — empty state

Every list is `[]` and every count is `0`. Never `null`, never a missing key, never 404.

```json
{
  "status": "success",
  "data": {
    "totalPlayers": 0,
    "upcomingMatchesCount": 0,
    "totalReports": 0,
    "upcomingMatches": [],
    "latestResults": [],
    "recentReports": []
  }
}
```

A stable key set is what lets the client distinguish "no data" from "field not returned"; the empty
state is a UI concern (FR-006), not a different response shape.

### 401 — no/invalid token

Standard `protect` rejection.

### 403 — admin, coach, observer

`allowedTo` rejection. Per Principle I this MUST be a 403, **not** a 200 with zeroes — a zeroed
payload would read as "you have no data" rather than "this is not your dashboard".

> Note the asymmetry with `/dashboard/coach` and `/dashboard/observer`, both of which admin *can*
> reach via their `/admin/...` variants. No admin variant of this endpoint is added
> (spec Assumptions); admin therefore receives 403 here, and this is the documented decision, not an
> oversight.

## Scope guarantees (test oracles)

| # | Guarantee |
|---|---|
| G-1 | `totalPlayers` equals `count(players in professional-league teams) + count(players with team=null created by this user)` — and excludes another proScout's team-less players |
| G-2 | No premier-league match contributes to `upcomingMatchesCount`, `upcomingMatches`, or `latestResults` |
| G-3 | A match dated today appears in `latestResults` and **not** in `upcomingMatches` |
| G-4 | `upcomingMatchesCount` reflects the true total even when it exceeds the 5-item list cap |
| G-5 | Reports authored by another user never appear, and never contribute to `totalReports` |
| G-6 | No `ageGroup` key appears anywhere in the serialized response body, at any depth |
| G-7 | `/dashboard/coach`, `/dashboard/observer`, `/dashboard/admin`, and `/dashboard/admin/coaches-stats` return byte-identical bodies before and after this feature |

## OpenAPI

A `@swagger` JSDoc block is added above the imports in `routes/dashboardRouter.js` (the file's
existing convention — all six current operations are documented in one block there), plus a
`ProScoutDashboard` schema in `utils/swagger.js` alongside `CoachDashboard` / `ObserverDashboard`.

Then, per Principle V: `npm run dump-spec` in `Backend/`, `npm run gen:types` in `frontend/`.

`core/models/dashboard.model.ts` gains `ProScoutDashboard`. Note the existing file hand-writes
`ObserverDashboard` rather than deriving it from the generated types even though a matching schema
exists — the new type SHOULD be derived from `components['schemas']['ProScoutDashboard']` like
`CoachDashboard` is, rather than copying the hand-written precedent.
