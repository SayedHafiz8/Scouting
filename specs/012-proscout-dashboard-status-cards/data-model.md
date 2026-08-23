# Data Model: ProScout Dashboard Status Cards

No new persisted entity, no schema migration. This feature adds a **derived, read-only summary**
computed on read from the existing `Player` collection.

## Player status breakdown (derived, not persisted)

Source field: `Player.status` — existing enum, unchanged by this feature:
`selected` | `pending` | `observed` | `rejected` (defined in `models/playedModel.js`).

| Output field | Derivation | Notes |
|---|---|---|
| `selectedPlayers` | count of `Player.status === "selected"` within `playerScopeFor(req)` | Same treatment as `CoachDashboard.selectedPlayers` / `AdminDashboard.selectedPlayers`. |
| `pendingPlayers` | count of `Player.status === "pending"` **plus** `Player.status === "observed"`, within `playerScopeFor(req)` | `observed` is folded in, copying `getCoachDashboardData`'s existing `(statusMap["pending"] ?? 0) + (statusMap["observed"] ?? 0)` line verbatim (research.md R2). |
| `rejectedPlayers` | count of `Player.status === "rejected"` within `playerScopeFor(req)` | |

**Invariant** (FR-003, SC-002): `totalPlayers === selectedPlayers + pendingPlayers + rejectedPlayers`
for every response, because all four numbers are counted from the same `playerScopeFor(req)` result
with no other filter applied — there is no status value outside the four the enum defines, so the
partition is exhaustive.

**Scope**: identical to the existing `totalPlayers` field on the same response —
`{ createdBy: req.user._id }` (Stage 11 / constitution.md C-4, v1.1.0). No new scope variant is
introduced; this feature does not touch `services/scope.js`.

## Response shape change

`ProScoutDashboard` (`GET /dashboard/proScout` response `data`) — additive only, no field removed
or renamed:

```
{
  totalPlayers: integer,          // unchanged
  selectedPlayers: integer,       // NEW
  pendingPlayers: integer,        // NEW
  rejectedPlayers: integer,       // NEW
  upcomingMatchesCount: integer,  // unchanged
  totalReports: integer,          // unchanged
  upcomingMatches: ProScoutMatch[],  // unchanged
  latestResults: ProScoutMatch[],    // unchanged
  recentReports: ProScoutReport[],   // unchanged
}
```

No other dashboard response shape (`CoachDashboard`, `AdminDashboard`, `ObserverDashboard`) changes.
