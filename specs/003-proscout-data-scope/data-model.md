# Phase 1 — Data Model: ProScout Data Scope Enforcement

**Feature**: `003-proscout-data-scope` | **Date**: 2026-08-20

Only one persisted field is added. Everything else in this feature is query shape, not storage.

---

## 1. `Player.createdBy` (new field)

**File**: [`Backend/models/playedModel.js`](../../Backend/models/playedModel.js)

| Property | Value |
|---|---|
| Path | `createdBy` |
| Type | `mongoose.Schema.ObjectId`, `ref: "User"` |
| Required | **No** — see rationale below |
| Default | none (absent on documents predating the backfill) |
| Written by | `playerController.create` only, from `req.user._id` |
| Client-writable | **Never** — `lockField("createdBy")` in both validation chains |
| Read by | The player scope filter, second `$or` branch, only when `team` is null |

**Why not `required: true`**: `services.updating` runs `findByIdAndUpdate` with
`runValidators: true`. A required field would make every pre-backfill player un-editable until the
migration completed, coupling routine edits to migration ordering. `coach` is non-required for a
directly analogous reason, documented at [playedModel.js:95-99](../../Backend/models/playedModel.js#L95-L99).

**Placement**: directly below `coach`, sharing its comment block's concern (ownership/attribution),
with an Arabic comment in the surrounding style explaining that it exists for the team-less branch of
the proScout scope and is not a replacement for `coach`.

### Index

```js
playerSchema.index({ team: 1, createdBy: 1 });
```

Serves the second `$or` branch (`{ team: null, createdBy: <id> }`). The existing
`{ team: 1 }` sparse index ([playedModel.js:205](../../Backend/models/playedModel.js#L205)) cannot
serve it — `sparse` omits documents where `team` is null, which is precisely the set this branch
selects. That is a subtle interaction worth stating in the index comment.

Register in `scripts/syncAllIndexes.js` per the existing convention.

### Backfill

`Backend/scripts/backfillPlayerCreatedBy.js` — modelled on
[`backfillSearchTokens.js`](../../Backend/scripts/backfillSearchTokens.js).

| Aspect | Behavior |
|---|---|
| Selection | `{ createdBy: { $exists: false }, coach: { $exists: true, $ne: null } }` |
| Write | `$set: { createdBy: <that player's coach> }` |
| Batching | cursor + `bulkWrite`, 500 per batch, `ordered: false` |
| Idempotent | Yes — re-running matches nothing |
| Default mode | Dry run; `--apply` to write |
| Orphans (`coach` unset) | Counted and reported, **skipped** — no honest creator exists, and absent behaves identically to null in the scope query |
| Rollback | `Player.updateMany({}, { $unset: { createdBy: "" } })`, documented in the file header |

Add `"backfill-player-createdby": "node scripts/backfillPlayerCreatedBy.js"` to
`Backend/package.json` scripts, matching `backfill-search-tokens`.

---

## 2. Scope filter shapes (derived, not stored)

**File**: `Backend/services/scope.js` (new) — the single definition every consumer reads.

### Professional team ids

```
professionalTeamIds(req) -> ObjectId[]
```
Memoized on `req`. Includes soft-deleted teams (`bypassFilter`) — see research R2, trap 2. Returns
real `ObjectId`s, never strings (research R5).

### Player scope

```
playerScopeFor(req) -> plain object
```

| Role | Returns |
|---|---|
| `proScout` | `{ $and: [ { $or: [ { team: { $in: <professional ids> } }, { team: null, createdBy: <req.user._id> } ] } ] }` |
| every other role | `{}` — no change to existing behavior |

The `$and` wrapper is mandatory on every non-empty scope, not cosmetic: chained Mongoose conditions
merge last-wins on key collision, so an unwrapped scope key that is also client-whitelisted gets
**overwritten** by the client. See [research R12](./research.md).

When there are zero professional teams, the first branch is `{ team: { $in: [] } }`, which matches
nothing; the second branch still works. No special-casing needed, and it fails closed.

### Season match scope

```
seasonMatchScopeFor(req) -> plain object
```
Folded into the existing `seasonMatchBaseFilterFor` in
[`seasonMatchController.js`](../../Backend/controllers/seasonMatchController.js), converted from
`if` to an explicit switch:

| Role | Returns | Change? |
|---|---|---|
| `admin`, `coach` | `{}` | unchanged |
| `observer` | existing team-of-assigned-players `$or` | **unchanged, byte for byte** (stays unwrapped) |
| `proScout` | `{ $and: [ { league: "professional" } ] }` | new |
| anything else | `MATCH_NOTHING` | changed from `{}` — deny-by-default (Principle II) |

`league` is whitelisted in `SEASON_MATCH_FILTERS`, so the `$and` wrapper here is what stops
`?league=premier` from replacing the scope outright (research R12). The same applies to
`teamScopeFor` below, where `league` is likewise in `TEAM_FILTERS`.

`SeasonMatch.league` is a first-class indexed field
([seasonMatchModel.js:16-21](../../Backend/models/seasonMatchModel.js#L16-L21), index at
[:73](../../Backend/models/seasonMatchModel.js#L73)) — no team join required.

### Team scope

```
teamScopeFor(req) -> plain object
```
`proScout` → `{ $and: [ { league: "professional" } ] }`; everyone else → `{}`. Passed as the new
`baseFilterFn` argument to the existing `gettingAll(Team, ...)`.

---

## 3. Entity relationships touched

```
User ──createdBy──> Player          (new; read only when Player.team is null)
User ──coach──────> Player          (existing, unchanged)
Team ──league─────> "professional"  (existing enum, now load-bearing for scope)
Player ──team─────> Team            (existing; first $or branch)
SeasonMatch ──league──> "professional"  (existing enum, now load-bearing)
```

No relationship is removed or repurposed. `coach` keeps its exact current meaning; `createdBy` is
additive and never consulted for a player that has a team.

---

## 4. Validation rules

| Rule | Where | Note |
|---|---|---|
| `createdBy` rejected from client input on create | `playerValidation.createValidate` | `lockField("createdBy")` beside the existing `lockField("coach")` |
| `createdBy` rejected from client input on update | `playerValidation.updateValidate` | same; without it `PATCH /players/:id` rewrites attribution |
| `createdBy` set server-side | `playerController.create` | assigned after body parse, so a smuggled value is overwritten regardless |

---

## 5. What is explicitly **not** changed

- `ApiFeature.buildOwnerScope` and the `ownerFields` map — untouched (research R1). `proScout`
  remains absent, so it still resolves to `MATCH_NOTHING` there as a second line of defence.
- `Player.ageGroup` — stays derived and required-in-practice. Constraint C-4 is explicit that the
  league scope MUST NOT be read as permission to bypass it.
- `Team` soft-delete hook, `TEAM_FILTERS`, and the deliberate absence of `Team.ownerFields`.
- The observer branch of `seasonMatchBaseFilterFor` (Constitution Principle III).
- `maskCoachForObserver` and `maskObservedForCoach` themselves — proScout is *added as a caller* of
  the latter (research R11); neither function's body changes.
