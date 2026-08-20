# Contract — `Backend/services/scope.js` (internal interface)

**Feature**: `003-proscout-data-scope` | **Date**: 2026-08-20

This is the single central scope layer required by Constitution Principle IV. Every consumer reads
from here; no consumer re-expresses the logic.

---

## Exports

### `professionalTeamIds(req) => Promise<ObjectId[]>`

Ids of every `Team` with `league: "professional"`, **including soft-deleted ones**.

- Memoized on `req` for the request's lifetime. Never cached across requests — the spec requires
  scope to reflect a team's *current* league (research R2).
- Returns `mongoose.Types.ObjectId` instances. Callers MUST NOT stringify them — aggregation
  `$match` does not cast (research R5).
- **Must stay a `.distinct()` query.** Every `distinct` spelling skips the soft-delete hook (the op
  is `distinct`, which never matches `/^find/`) — measured, see [research R2](../research.md). The
  `bypassFilter` option is intent-documentation and a no-op. Rewriting this to any form that stays a
  `find` would apply the hook and silently drop deactivated professional teams, vanishing their
  players from scope. The enforcing check is the assertion in T012, not the option flag.
- Note the deliberate asymmetry with the two team-browsing paths below: they use `find`/`findOne`,
  fire the hook, and therefore **exclude** deactivated teams. A proScout can see a player on a
  retired professional team without being able to open that team's record.

### `playerScopeFor(req) => Promise<object>`

| Input role | Output |
|---|---|
| `proScout` | `{ $and: [ { $or: [ { team: { $in: ids } }, { team: null, createdBy: req.user._id } ] } ] }` |
| any other role | `{}` |

Always a **plain object**, never a Mongoose `Query` — Principle IV, and because an awaited Query
executes instead of composing (the reason documented at
[services.js:46-47](../../Backend/services/services.js#L46-L47)).

### `seasonMatchScopeFor(req) => Promise<object>`

| Input role | Output |
|---|---|
| `admin`, `coach` | `{}` |
| `observer` | existing `$or` over teams of assigned players — **unchanged, unwrapped** |
| `proScout` | `{ $and: [ { league: "professional" } ] }` |
| unrecognized | `MATCH_NOTHING` |

### `teamScopeFor(req) => Promise<object>`

`proScout` → `{ $and: [ { league: "professional" } ] }`; any other role → `{}`.

---

## Consumers (exhaustive)

| Consumer | Call | Composition |
|---|---|---|
| `playerController.getAll` | `playerScopeFor` | `Player.find(scope)` — base position, `ApiFeature` layers on top |
| `playerController.getSpecific` | via `checkPlayerOwnership` | guard runs before the controller |
| `playerController.getCountsByAgeGroup` | `playerScopeFor` | `{ $and: [scope, match] }` in `$match` |
| `scoutingReportController.getAverageRatingsForPlayers` | `playerScopeFor` | narrows `ids` before the pipeline (research R7) |
| `seasonMatchController.seasonMatchBaseFilterFor` | `seasonMatchScopeFor` | returned as the base filter |
| `teamsController.getAll` | `teamScopeFor` | new `baseFilterFn` argument to `gettingAll` |
| `ownership.checkPlayerOwnership` | `playerScopeFor` | `Player.exists({ _id, ...scope })` |
| `ownership.checkSeasonMatchScope` (new) | `seasonMatchScopeFor` | `SeasonMatch.exists({ _id, ...scope }).setOptions({ skipPopulate: true })` |
| `ownership.checkSeasonMatchAttendee` (branch) | `seasonMatchScopeFor` | same, plus attendee membership |
| `ownership.checkTeamScope` (new) | `teamScopeFor` | `Team.exists({ _id, ...scope })` |

`Model.exists()` executes as `findOne`, so it **does** fire `pre(/^find/)` — verified. That is
wanted for `Team` (keeps the by-id guard consistent with the list's soft-delete filtering) and
unwanted for `SeasonMatch`, whose hook performs a four-way populate; hence `skipPopulate` on the
latter only, matching the existing `checkSeasonMatchAttendee`.

The `exists({ _id, ...scope })` pattern is what makes list scope and ID scope provably identical
(FR-011). Any consumer that re-derives the condition instead is a defect.

---

## Composition rules

1. **Every non-empty scope is wrapped in `$and` — this is the load-bearing rule.** Chained Mongoose
   conditions merge **last-wins on key collision**, they do **not** AND. `league` is the scope key
   *and* a whitelisted client filter on both matches and teams, so an unwrapped scope is overwritten
   by `?league=premier` and the role sees the entire other league. Measured, not theorised — see
   [research R12](../research.md). `$and` appears in no `allowed` whitelist, so no client key can
   collide with it, and `$and` layers concatenate rather than replace.

   The scope module owns this wrapper. Consumers must never unwrap it, spread its contents, or
   reach past it to the inner condition.

2. **`$and`, not spread, inside aggregation `$match`** — the same reasoning, applied to the
   pipeline path (research R5).

3. **Base position for `find`.** The scope goes into `Model.find(scope)`; `ApiFeature` chains
   `.find()` on top. With rule 1 in force this composes as AND, which is what Constraint C-4's
   `seasonMatchBaseFilterFor` precedent *appears* to do. Note that precedent is safe only because
   it filters on `$or`/`homeTeam`/`awayTeam`, none of which is client-whitelisted — safe by accident
   of key choice, not by design. Do not treat it as proof that base-position scoping is inherently
   safe.

4. **Empty object for unaffected roles — bare `{}`, never `{ $and: [] }`.** `{}` spread into a
   filter is a no-op, which is the mechanical reason Principle III holds: existing roles' queries
   stay byte-identical. An empty `$and` array is also a MongoDB error, so this is not merely
   stylistic.

5. **Never widen.** Every consumer ANDs the scope with its own conditions and may only narrow
   further. A contradictory client filter yields **zero rows**, which is what the spec's edge case
   prescribes — not an error, and never a widened result.

---

## `Backend/utils/accessLog.js` (new)

```
logScopeDenial({ req, resource, resourceId })
```

Emits one structured line: `{ event: "scope_denied", userId, role, method, path, resource,
resourceId, at }` — the four fields Principle IV requires, plus resource type and timestamp.

Called from every proScout denial branch in `ownership.js`. Not a database write — research R9
explains why (attacker-controlled unbounded writes). Tests spy on this module to satisfy SC-004.
