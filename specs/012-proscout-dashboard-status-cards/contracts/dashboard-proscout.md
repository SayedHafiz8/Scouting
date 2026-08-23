# Contract: `GET /dashboard/proScout`

**Change type**: additive response fields only. Method, path, auth (`protect, allowedTo(PRO_SCOUT)`),
and all currently-returned fields are unchanged.

## Request

No change. `GET /dashboard/proScout`, bearer token of a user with `role: "proScout"`. No body, no
query params consumed by this endpoint today (unchanged).

## Response — `200 OK`

```json
{
  "status": "success",
  "data": {
    "totalPlayers": 5,
    "selectedPlayers": 2,
    "pendingPlayers": 2,
    "rejectedPlayers": 1,
    "upcomingMatchesCount": 3,
    "totalReports": 7,
    "upcomingMatches": [ "...ProScoutMatch (unchanged shape)..." ],
    "latestResults": [ "...ProScoutMatch (unchanged shape)..." ],
    "recentReports": [ "...ProScoutReport (unchanged shape)..." ]
  }
}
```

New fields, all `integer`, always present (never `null`/`undefined`, `0` when the proScout has no
players in scope):

| Field | Description |
|---|---|
| `selectedPlayers` | Count of the requesting proScout's own players (`createdBy` scope) with `status: "selected"`. |
| `pendingPlayers` | Count with `status: "pending"` **or** `status: "observed"` (folded together). |
| `rejectedPlayers` | Count with `status: "rejected"`. |

## Invariant (contract-level, MUST hold for every response)

```
totalPlayers === selectedPlayers + pendingPlayers + rejectedPlayers
```

## Swagger / OpenAPI

`Backend/utils/swagger.js` → `components.schemas.ProScoutDashboard` gains three `integer`
properties (`selectedPlayers`, `pendingPlayers`, `rejectedPlayers`), positioned to match the
existing `CoachDashboard` schema's naming. `npm run dump-spec` (repo-root `openapi.json`) and
`npm run gen:types` (`frontend/src/app/core/models/api.generated.ts`) MUST run in the same PR.

## Unaffected contracts (explicitly out of scope, listed for reviewer clarity)

- `GET /dashboard/coach`, `GET /dashboard/observer`, `GET /dashboard/admin` — zero change (FR-009,
  Constitution Principle III). No route, controller, or schema for these is touched.
- `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`,
  `GET /seasonMatches` — zero change. `tests/isolation.test.js` is not affected by this feature
  since it exercises none of `dashboardController.js`.
