# Phase 0 Research: ProScout Dashboard Status Cards

No `[NEEDS CLARIFICATION]` markers were left in the Technical Context or the spec — the owner
resolved scope, status-folding, and implementation-pattern decisions in
`docs/scout-pro-plan-v2.md` (backlog item "داشبورد proScout") before this spec was written. This
document records the concrete decisions and the alternatives considered, so `/speckit-tasks` and
`/speckit-implement` have a single reference instead of re-deriving them from the controller.

## R1 — Which query computes the three counts?

**Decision**: Reuse the `playerScope` variable already computed at the top of
`getProScoutDashboardData` (`const playerScope = await playerScopeFor(req);`,
`dashboardController.js:257`) — the same value already feeding `totalPlayers` and
`scopedPlayerIds`. Compute the status breakdown as one additional aggregate stage (or a
`$facet` alongside the existing distinct-ids/count work), not a second independently-built filter.

**Rationale**: Constitution Principle IV requires exactly one definition of the scope per resource,
consumed everywhere. `services/scope.js`'s own header comment (R12-style warning, "$and مش موجود في
أي وايت ليست") documents a real, previously-exploited bug class where a second hand-rolled filter
diverged from the central one. FR-002/FR-006/SC-002 exist specifically to rule that class of bug
out here: `totalPlayers` and the three status counts MUST be mathematically guaranteed to sum
correctly because they come from the same underlying `$match`, not from two queries that could
silently drift.

**Alternatives considered**:
- *Separate `Player.countDocuments({ ...manualFilter, status: 'selected' })` per status* — rejected:
  reintroduces exactly the "second hand-written copy of the scope" pattern Principle IV and the
  Stage 11 postmortem (`docs/scout-pro-plan-v2.md` §11 items 4–5) warn against; three extra round
  trips instead of the aggregate framework's single pass.
- *Client-side derivation (fetch the player list, count in the browser)* — rejected: the dashboard
  deliberately never fetches the full player list (only 5-item preview lists for matches/reports);
  pulling the full player set just to count statuses defeats the purpose of a dashboard summary and
  would leak an unbounded amount of data over the wire for a proScout with many players.

## R2 — How is `observed` folded into `pending`?

**Decision**: Copy `getCoachDashboardData`'s exact statusMap merge
(`dashboardController.js:207-210`):

```js
const pendingPlayers = (statusMap["pending"] ?? 0) + (statusMap["observed"] ?? 0);
```

**Rationale**: The plan input is explicit that proScout gets "نفس منطق `maskObservedForCoach`"
treatment — the same convention already applied to proScout elsewhere in the codebase (report/media
ownership guards, per `docs/scout-pro-plan-v2.md` Stage 11 item 5/6 discussion referencing
`maskObservedForCoach`-equivalent masking already active for this role). Reusing the coach's exact
line, rather than writing new logic, keeps this a copy of a proven pattern rather than a new
behavior to independently verify.

**Alternatives considered**: Exposing `observedPlayers` as a fourth, separate field — rejected by
the plan input ("observed تُطوى في pending") and would contradict FR-004/Acceptance Scenario 1,
which spells out the expected 2/2/1 split treating `observed` as `pending`.

## R3 — Aggregation shape: replicate `getCoachDashboardData`'s `$facet`, or extend the existing `Player.find(playerScope).distinct("_id")` call?

**Decision**: Left to `/speckit-tasks`/implementation to choose the lowest-risk shape, with one
hard constraint: whatever shape is chosen, it MUST read `playerScope` once and MUST NOT add a
second, independently-constructed player filter. Two concrete options are compatible with this
constraint and both are acceptable:
  (a) a `$facet` aggregate mirroring `getCoachDashboardData` exactly (`byStatus` + `total`,
      optionally also `ids` to also replace `Player.find(playerScope).distinct("_id")` in the same
      round trip), or
  (b) a `Player.aggregate([{ $match: playerScope }, { $group: { _id: "$status", count: {...} } }])`
      run alongside the existing `Player.countDocuments(playerScope)` / `.distinct("_id")` calls
      already in the `Promise.all`.

**Rationale**: Both satisfy FR-002/FR-006. Option (a) is the more literal reading of "القالب الجاهز
موجود في `getCoachDashboardData`" and also reduces round trips (folds `totalPlayers` and
`scopedPlayerIds` into the same aggregate), but touches more of the existing `Promise.all` shape.
Option (b) is a smaller diff. Neither is a scope/security decision — this is left as an
implementation choice for the tasks phase, not a product decision requiring `/speckit-clarify`.

**Alternatives considered**: None that satisfy Principle IV — any shape that does not start from
`playerScope` is out of bounds regardless of round-trip count.

## R4 — Does this affect `matchScope`, `reportFilter`, or any other part of `getProScoutDashboardData`?

**Decision**: No. `matchScope`/`upcomingMatches`/`latestResults` (league-wide, `seasonMatchScopeFor`)
and `totalReports`/`recentReports` (`reportFilter`, authorship ∩ current player scope) are
untouched by this feature — they already exist and their behavior is explicitly documented as
intentionally divergent from player scope (constitution.md C-4, "تباين مقصود وموثَّق"). This feature
only adds fields; it changes no existing field's value.

**Rationale**: Confirmed by reading `getProScoutDashboardData` end-to-end
(`dashboardController.js:256-324`) — none of the existing `Promise.all` entries reference player
status, so none of them need to change to add a parallel status-based computation.

## R5 — Frontend: new component, or extend the existing one?

**Decision**: Extend `pro-scout-dashboard.component.ts` in place, adding three `app-stat-card`
entries to the existing stat-card grid, using `iconName="selected"|"pending"|"rejected"` (already
implemented in `StatCardComponent`, used today by `coach-dashboard.component.ts`) and the existing
`DASHBOARD.SELECTED` / `DASHBOARD.PENDING` / `DASHBOARD.REJECTED` i18n keys (already present in both
`en.json` and `ar.json`, since the coach dashboard already ships them).

**Rationale**: `StatCardComponent` is already a shared, parametrized component — Principle-adjacent
reuse ("مكوّن مشترك للكاردز... استخدمه بدل تكرار الـHTML" from the original task framing). No new
component, no new i18n keys, no new CSS is needed. The grid currently reads
`grid-cols-1 sm:grid-cols-3` for 3 cards (`totalPlayers`, `upcomingMatchesCount`, `totalReports`);
adding 3 more cards means either widening the grid to 6 cells (`sm:grid-cols-3 lg:grid-cols-6` or a
second row) or splitting into a "primary row" (total + status 3) and "secondary row" (matches +
reports), mirroring `coach-dashboard.component.ts`'s existing primary/secondary row split. Exact
layout is a presentation detail for `/speckit-tasks`, not a research unknown.

**Alternatives considered**: A new `ProScoutStatusCardsComponent` wrapper — rejected as unnecessary
indirection; `StatCardComponent` already takes all needed inputs (`label`, `value`, `iconName`,
`iconBg`, `iconColor`, `link`, `queryParams`), so a wrapper would add a file without adding
capability.

## R6 — API contract regeneration

**Decision**: `Backend/utils/swagger.js`'s `ProScoutDashboard` schema (line ~306) gets three new
`integer` properties (`selectedPlayers`, `pendingPlayers`, `rejectedPlayers`), matching the shape
already used in `CoachDashboard` (line ~207). `npm run dump-spec` (Backend) then `npm run gen:types`
(frontend) MUST run in the same PR per Constitution Principle V ("تغيير شكل أي route MUST يصحبه
`npm run dump-spec`... `npm run gen:types`... في نفس الـPR").

**Rationale**: `frontend/src/app/core/models/dashboard.model.ts`'s `ProScoutDashboard` interface is
hand-written (not `Required<components['schemas']['ProScoutDashboard']>` like `CoachDashboard` is)
— per its own comment, this is deliberate ("Re-expand so the two list element types above are used,
rather than the shallow-Required generated shape"). The three new fields still need to be added by
hand to that interface even after `gen:types` regenerates `api.generated.ts`, exactly as
`totalPlayers`/`upcomingMatchesCount`/etc. already are.
