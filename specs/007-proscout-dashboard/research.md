# Phase 0 Research — ProScout Dashboard (Stage 5)

**Feature**: `specs/007-proscout-dashboard/` | **Date**: 2026-08-22

Every decision below was checked against the actual code or measured, not assumed. Stage 2's
number-one deviation was a merge-semantics assumption that turned out to be wrong in exactly the
place this stage now has to touch, so the measurements are repeated here rather than cited.

---

## R1 — Combining a wrapped scope with a date filter: nest in `$and`, never spread

**Decision**: Every query in this feature composes as `{ $and: [ scope, <own conditions> ] }`.
Spreading a scope object (`{ ...scope, matchDate: … }`) is banned in this feature's code.

**Rationale**: `seasonMatchScopeFor` and `playerScopeFor` return `{ $and: [ … ] }` (Stage 2's
carrying rule, `services/scope.js`). This stage must intersect those with a **date** condition —
the first time a proScout scope is combined with a caller-side condition that itself may want
`$and`. Measured on this repo's mongoose (9.7.2):

```js
const scope = { $and: [ { league: 'professional' } ] };

// nested — correct
countDocuments({ $and: [ scope, { matchDate: { $gte: d } } ] })
  → {"$and":[{"$and":[{"league":"professional"}]},{"matchDate":{"$gte":"…"}}]}   ✅

// spread with a non-colliding key — happens to work
countDocuments({ ...scope, matchDate: { $gte: d } })
  → {"$and":[{"league":"professional"}],"matchDate":{"$gte":"…"}}                ✅

// spread where the caller also wants $and — SCOPE SILENTLY VANISHES
countDocuments({ ...scope, $and: [ { matchDate: { $lt: d } } ] })
  → {"$and":[{"matchDate":{"$lt":"…"}}]}                                          ❌ no league at all
```

The third form returns **the entire premier league** and throws no error. It is one refactor away
from the second form, which is the form a developer reaches for naturally. Nesting is the only
composition that cannot degrade this way, so it is the rule for all four queries, including the
ones where spreading would currently be harmless.

**Alternatives considered**: (a) unwrap the scope and re-merge its inner conditions — reaches
inside the scope layer's representation from a consumer, which is precisely what Principle IV
forbids; (b) spread where safe, nest where not — makes correctness depend on the reader knowing
which keys collide, and Stage 2's deviation #1 is the evidence that this reasoning fails in review.

---

## R2 — No caching for this dashboard

**Decision**: `GET /dashboard/proScout` performs no cache read and no cache write. It does not
touch `dashboardCache`, `ADMIN_OVERVIEW_KEY`, or `COACHES_STATS_KEY`.

**Rationale**: The existing cache comment block in `controllers/dashboardController.js` (§11)
already settles this and says so explicitly: the cache key is global and safe *only* because the
two cached functions read neither `req.user` nor `req.params` nor `req.query`. It states that
coach and observer dashboards are not cached and must not be, because a shared key over
per-user-scoped data is a cross-role data leak. The proScout dashboard is per-user scoped by
construction. Caching it under any shared key would be the exact failure that comment warns about.

Not caching also keeps FR-010 trivially true: this feature adds no entry to the map the admin
paths read, so admin cache behavior is unchanged by construction rather than by test.

**Alternatives considered**: a per-user key (`proScout:<id>`). Rejected — no measured need
(the queries are index-served and bounded, unlike the admin `$group` full scans the cache exists
for), and it would introduce the project's first user-keyed cache entry as a side effect of an
unrelated feature.

---

## R3 — Which scope function serves which figure

**Decision**:

| Figure | Scope source | Composition |
|---|---|---|
| Player count | `playerScopeFor(req)` | `$match: { $and: [ scope, {} ] }` in an aggregate, or `countDocuments(scope)` |
| Upcoming matches | `seasonMatchScopeFor(req)` | `{ $and: [ scope, { matchDate: { $gte: todayStart } } ] }` |
| Latest results | `seasonMatchScopeFor(req)` | `{ $and: [ scope, { matchDate: { $lt: todayStart } } ] }` |
| Recent reports | `playerScopeFor(req)` ∩ authorship | see R4 |

**Rationale**: These are the two Stage 2 functions that already define the role's data boundary,
already used by `getAll`, `getCountsByAgeGroup`, `getAverageRatingsForPlayers`,
`seasonMatchBaseFilterFor`, and four `ownership.js` guards. Principle IV requires the new consumer
to read from them, not to re-derive `league: "professional"` or the professional-team-ids `$or`.

Both return `{}` for every existing role, which is why re-using them cannot perturb coach, observer,
or admin — but that is moot here anyway, since the new controller is reachable only by proScout.

**Note on matches — deliberate asymmetry with coach/observer**: the coach and observer dashboards
count matches by **attendance** (`attendees: userId`). The proScout match figures are scoped by
**league**, not attendance, because `seasonMatchScopeFor` is a league filter and Stage 2 defined the
role's match visibility that way. A proScout therefore sees professional-league matches they never
attended. This is intended and is a different question from "matches I attended"; the labels must
say "professional league", not "attended", or the number will read as wrong. Recorded because it is
the most likely source of a false SC-001 failure report.

---

## R4 — Reports: authorship **and** player scope, not authorship alone

**Decision**: Both the report count and the recent-report list match
`{ coach: req.user._id, player: { $in: <ids of players inside playerScopeFor> } }`.

**Rationale**: This is the exact shape Stage 2 already chose for
`getAverageRatingsForPlayers` (`scoutingReportController.js:293-314`, research R7 of Stage 2): it
narrowed the player axis by `playerScopeFor` **while keeping** the authorship constraint, and its
comment records that dropping authorship would have been a widening. The same two-axis intersection
is used here for the same reason.

The narrowing matters specifically for the *list*: `recentReports` carries player names, so a report
the proScout wrote on a player who has since moved to a premier-league team would surface a player
identity from outside the role's current scope. Applying the same match to the count keeps the count
and the list telling the same story — an important property for SC-001, whose oracle is a manual
count.

**Accepted trade-off, recorded**: a proScout whose player left the professional league sees their
own report count drop. This is the strict direction (fails closed), it is consistent with how the
role's player list already behaves for that same player, and the alternative leaks an out-of-scope
player's name onto a dashboard.

**Alternatives considered**: authorship only, matching `getObserverDashboardData`'s
`ScoutingReport.countDocuments({ coach: observerId })`. Rejected — the observer's scope is
assignment-based and has no equivalent "player left my scope" transition, so the precedent does not
transfer; and it is the looser of the two on the axis that carries names.

---

## R5 — Response shape: scalars plus three bounded lists

**Decision**:

```
{ totalPlayers, upcomingMatchesCount, totalReports,
  upcomingMatches[≤5], latestResults[≤5], recentReports[≤5] }
```

**Rationale**: The plan's four indicators are "player count, upcoming professional-league matches,
latest results, his recent reports". Only the first is naturally a single number; "latest results"
and "recent reports" are inherently lists. The precedent for a dashboard payload mixing scalars
with a bounded array already exists in this codebase — `AdminDashboard.topCoaches` is a
`$limit: 10` array inside an otherwise scalar payload. A cap of 5 keeps the payload small and the
empty-state rule (FR-006) meaningful per section.

`upcomingMatchesCount` is carried separately from `upcomingMatches.length` because the list is
capped: a proScout with 12 upcoming matches must see 12 on the stat card, not 5. `latestResults`
and `recentReports` are presented as lists only, with no total, so no capped-count confusion arises
there. `totalReports` is a genuine total (see R4) and is the stat-card figure.

**Alternatives considered**: scalars only (four numbers). Rejected — "latest results" reduced to a
count conveys nothing, and the plan names it as a distinct indicator from the upcoming-match count.

---

## R6 — Age groups: absent by construction, not by filtering

**Decision**: No dashboard figure groups by, filters on, or returns `ageGroup`; the match list
projections exclude it explicitly rather than relying on it being unrequested.

**Rationale**: FR-005 and Constraint C-4. Two concrete traps in this codebase:

1. `SeasonMatch` has a `pre(/^find/)` hook that **auto-populates `ageGroup`** (plus both teams and
   attendees) on every `find` unless `setOptions({ skipPopulate: true })` is passed. So a match
   query written the obvious way returns age-group data without anyone asking for it. The match
   lists must therefore use an explicit `select`/projection, and the contract test must assert the
   key's absence in the response body — not merely that no code mentions it.
2. Professional players carry **no** `ageGroup` at all (`isProfessional: true`, Stage 4b, C-4's
   documented exception), so any grouping by age group would bucket the role's own players under a
   null key. A second reason the concept simply does not apply here.

---

## R7 — "Today" boundary: reuse the existing end-of-day convention

**Decision**: The upcoming/past split uses the same day-boundary comparison the existing dashboards
use — `new Date(new Date().setHours(23,59,59,999))` as the "played by now" edge — with past =
`matchDate <= endOfToday` and upcoming = `matchDate > endOfToday`.

**Rationale**: `getCoachDashboardData`, `getObserverDashboardData`, and `computeAdminDashboardData`
all already compare against end-of-today, and the comment on the coach query explains why: matches
are stored as UTC midnight (from `<input type="date">`), so comparing against "now" would classify
a match happening today as not-yet-played for most of the day and produce a race. Using a different
boundary here would make a match appear in both sections, or neither, on match day.

Consequence worth stating: today's professional-league matches count as **results**, not upcoming.
That is the same classification a coach's `matchesAttended` already makes, so it is consistent
across the product rather than a new rule.

**Alternatives considered**: `Date.now()` — reintroduces the exact race the existing comment
documents. Start-of-day — is the convention used by the *attendance* window
(`isBeforeMatchDay`), a different question (when may you still register), not "has it been played".

---

## R8 — Index coverage: adequate, no new index

**Decision**: Add no index for this feature.

**Rationale**: Checked `models/seasonMatchModel.js` and `models/playedModel.js`:

- Matches by league + date: `{ league: 1, season: 1, matchDate: 1 }` exists (declared for the
  "my matches" screen). A `{league, matchDate}` query uses the `league` prefix for bounds; `season`
  being skipped makes the `matchDate` bounds non-contiguous but the scan stays an IXSCAN over one
  league. `{ matchDate: 1 }` also exists as a fallback.
- Players by team-set / by `team:null + createdBy`: `{ team: 1 }` (sparse) and the non-sparse
  `{ team: 1, createdBy: 1 }` added by Stage 2 precisely for the orphan branch.
- Reports by author: reports are matched on `coach` + a bounded `player` `$in` list.

No query in this feature introduces a new access pattern. `scripts/syncAllIndexes.js` iterates
`mongoose.models` so it needs no edit either way.

---

## R9 — Frontend: no socket subscription, no realtime push

**Decision**: The proScout dashboard component loads once over HTTP and does not subscribe to
socket updates; no `emitProScoutDashboardUpdate` is added.

**Rationale**: The three existing emitters are each fired from mutating controllers and each has a
"skip if the user is offline" guard. Adding a fourth means finding and editing every proScout-
reachable mutation path (player create/update, report create/update, media upload), which is a set
of edits to *existing shared controllers* — exactly the surface Principle III protects, for a
capability no acceptance criterion in this stage asks for. The spec's assumptions section records
realtime as out of scope.

This is a visible asymmetry with the other three dashboards and should be stated in the PR
description rather than discovered later; it is a candidate for its own small stage.

---

## R10 — Documents that must be edited, not just added to

**Four** existing test/spec artifacts currently assert the *pre-Stage-5* state and will fail — by
design — the moment this feature lands. They are part of the change, not collateral:

| File | Current assertion | Required edit | Failing cases |
|---|---|---|---|
| `core/services/role-landing.service.spec.ts` | `landingFor('proScout')` → `['/players']` (suite titled "temporary until Stage 5") | → `['/dashboard/proScout']`; retitle | 1 |
| `layout/sidebar/sidebar.component.spec.ts` | proScout sees exactly `['/players','/profile']`; and `not.toContain('/dashboard')`; and `anchors.length === 2` | → 3 entries `['/dashboard','/players','/profile']`; drop `/dashboard` from the negative list (keep the other four); `=== 3` | 3 |
| `core/auth/role.guard.spec.ts` | three cases assert a refused proScout bounces to `'/players'` (`/users`, `/observers`, `/age-groups`) | → `'/dashboard/proScout'`; refresh the "temporary until Stage 5" block comment | 3 |
| `specs/004-role-based-navigation/spec.md` | FR-007 "exactly two"; SC-002 "proScout sees exactly 2"; SC-005 "end at the unauthorized destination"; DF-001 open | counts → 3; SC-005 → the role's own landing; mark DF-001 discharged | n/a |

**Total expected frontend failures before the edits: 7.**

`role.guard.spec.ts` is the easy one to miss — the landing destination is consumed transitively
through `RoleLandingService`, so editing `role-landing.service.ts` changes where **every** guarded
route bounces a refused proScout, not just the dashboard. That file also contains the one case
written specifically to survive this stage:

```ts
it('never returns true for proScout on an admin-only route, whatever the landing is', …)
```

That case asserts the actual security property and MUST be left untouched. The three cases around
it assert a UX destination and are the ones that change. The distinction matters: `/unauthorized` is
the destination for **unrecognized** roles, and proScout stopped being one of those in Stage 4 —
so a refused proScout has bounced to its own landing since then, and this stage only changes *which*
landing that is.

`role-landing.service.ts` itself must have its **existing** `case 'proScout'` edited in place. A
second `case 'proScout'` in the same `switch` is unreachable code — only the first branch runs —
and is explicitly prohibited by DF-001.

---

## R11 — Endpoint inventory obligation

Principle VI requires any stage touching permissions to carry a full endpoint inventory with a
decision per operation for the role. Stage 4 produced one at
`specs/005-proscout-players-write/contracts/endpoint-inventory.md` (83 operations). This stage adds
**one** operation and changes no other route's `allowedTo`, so the obligation is met by a delta
document (`contracts/endpoint-inventory-delta.md`) that names the new operation, its decision, and
restates that the other 83 decisions are unchanged — rather than by regenerating the full table,
which would produce a large diff with one changed row.

`npm run dump-spec` (Backend) then `npm run gen:types` (frontend) are required by Principle V
because a route is added.
