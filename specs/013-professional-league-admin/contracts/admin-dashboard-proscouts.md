# Contract: `GET /dashboard/admin` — `totalProScouts`

**Change type**: additive response field only, mirroring `specs/012-proscout-dashboard-status-cards`'s
pattern for the previous stage.

## Response — `200 OK`

```json
{
  "status": "success",
  "data": {
    "totalPlayers": 120,
    "selectedPlayers": 40,
    "pendingPlayers": 60,
    "rejectedPlayers": 20,
    "totalReports": 300,
    "totalMedia": 85,
    "totalCoaches": 12,
    "totalObservers": 5,
    "totalProScouts": 3,
    "totalMatchesPlayed": 40,
    "topCoaches": ["..."],
    "selectionRate": "33.33"
  }
}
```

New field: `totalProScouts` (`integer`) — total count of users with `role: "proScout"`, active or
not (same counting rule as `totalCoaches`/`totalObservers`, which do not filter on `active`
either).

## Unaffected

`GET /dashboard/coach`, `GET /dashboard/observer`, `GET /dashboard/proScout` — zero change.
