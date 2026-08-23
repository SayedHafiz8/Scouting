# Contract: proScout Scope Behavior per Endpoint

No route, request shape, or response shape changes. No `allowedTo(...)` membership changes — every
endpoint a `proScout` could reach before this feature, they can still reach; only the *set of
documents* returned/accessible narrows. This contract exists to make that narrowing explicit and
testable per endpoint, per Constitution Principle VI (positive + negative test per permission).

| Endpoint | Before (Stage 2 → v1.0.2) | After (this feature) | Changed? |
|---|---|---|---|
| `GET /players` | Team-in-professional-league OR own `team:null` players | Own (`createdBy`) players only | ✅ narrows |
| `GET /players/:id` | Same shape, via `checkPlayerOwnership` | Own players only, others → 403 | ✅ narrows |
| `GET /players/counts` | Same shape (aggregate `$match`) | Own players only | ✅ narrows |
| `GET /players/reports/average-ratings` | `?ids=` intersected with team-scope, further intersected with report-authorship | `?ids=` intersected with `createdBy`-scope, further intersected with report-authorship | ✅ narrows |
| `GET /dashboard/proScout` — `totalPlayers`, `totalReports`, `recentReports` | Team-scope-derived | `createdBy`-scope-derived | ✅ narrows |
| `GET /dashboard/proScout` — `upcomingMatches`, `upcomingMatchesCount`, `latestResults` | Full professional league (`seasonMatchScopeFor`) | **Unchanged** — full professional league | ⛔ no change (explicit) |
| `POST /players` | Any professional-league team, or none | **Unchanged** | ⛔ no change |
| `PATCH /players/:id` | Guarded by `checkPlayerOwnership` (team-scope) | Guarded by `checkPlayerOwnership` (`createdBy`-scope) | ✅ narrows (write access to *other* proScouts' players, which existed before via team-scope, is removed) |
| `POST/PATCH /players/:playerId/reports` | Guarded by `checkReportOwnership`/player-in-scope at creation time | Same guards, narrower player scope | ✅ narrows |
| `GET/PATCH /players/:playerId/reports/:id` | `checkReportOwnership`: author AND belongs-to-player AND team-in-scope | `checkReportOwnership`: author AND belongs-to-player AND `createdBy`-in-scope | ✅ narrows — including own-authored reports on now-out-of-scope players (FR-012) |
| `POST /players/:playerId/media`, `GET/DELETE /media/:id` (proScout-reachable subset) | `checkMediaOwnership`: uploader AND belongs-to-player AND team-in-scope | `checkMediaOwnership`: uploader AND belongs-to-player AND `createdBy`-in-scope | ✅ narrows — including own-uploaded media (FR-012) |
| `GET /teams`, `GET /teams/:id` | `teamScopeFor` — full professional league | **Unchanged** | ⛔ no change |
| `GET /seasonMatches`, `GET /seasonMatches/:id`, attendance endpoints | `seasonMatchScopeFor` — full professional league | **Unchanged** | ⛔ no change |
| `GET /players` (admin, Professional League lens, Stage 4c/4d) | All professional-league players + creator name | **Unchanged** — admin path never reads `proScout` scope | ⛔ no change |
| `GET /players`, `GET /players/:id`, etc. for `coach`/`observer` | Existing role-specific scopes | **Unchanged** | ⛔ no change |

## Negative-test obligations (Principle VI)

For every row marked "✅ narrows" above, the task list MUST include:
1. A **positive** test: the owning `proScout` still gets exactly what they had before (same count,
   same content, for their own players).
2. A **negative** test: a second `proScout`, previously able to reach the resource via team
   membership, is now rejected — 403 for direct-ID/write routes, absent-from-list for list routes
   (not a 200-with-partial-content that silently includes stale expectations).
3. A **query-widening** test where applicable: a client-supplied filter (`?team=`, `?ids=`) cannot
   restore the removed visibility.

For every row marked "⛔ no change", the task list MUST include a regression test asserting
byte-identical count and content pre/post-feature (Constitution Principle III).
