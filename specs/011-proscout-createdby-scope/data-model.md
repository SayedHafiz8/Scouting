# Phase 1 Data Model: proScout Player Scope Narrowed to createdBy

No schema change. This feature changes a query shape, not a document shape. Documented here for
completeness, per the Key Entities in `spec.md`.

## Player (existing — `Backend/models/playedModel.js`)

| Field | Type | Change in this feature |
|---|---|---|
| `createdBy` | `ObjectId` → `User`, set automatically at creation (Stage 2), locked against client input | **None to the field itself.** Becomes the *sole* input to `proScout` read-scope decisions — was previously one of two `$or` branches, now the only condition. |
| `team` | `ObjectId` → `Team`, nullable, `default: null` | **None.** Still used for write-time validation (`checkTeamScope`) and for the admin's Professional League lens filter (`isProfessional`, Stage 4c) — neither of which reads `proScout` scope. No longer read by `playerScopeFor` itself. |
| `coach` | `ObjectId` → `User`, nullable | Unaffected. Remains the `coach`-role ownership field; already cleared (not set) for players created by non-coach roles per Stage 4's finding. |

No new field, no new index, no migration (FR-013). The existing index supporting `createdBy` lookups
(added in Stage 2's backfill) is unchanged and sufficient — the new scope query is a strict
simplification of the old one (single equality condition vs. an `$or` of two conditions), so no new
index is required and no query-plan regression is expected.

## `playerScopeFor` return shape (`Backend/services/scope.js`)

The scope function itself is the closest thing this feature has to a "data model" — it's the single
source of truth for what a `proScout` may read (Constitution Principle IV).

**Before** (Stage 2 → v1.0.2):
```js
{ $and: [{ $or: [
    { team: { $in: <professionalTeamIds> } },
    { team: null, createdBy: <userId> }
] }] }
```

**After** (this feature → constitution v1.1.0):
```js
{ $and: [{ createdBy: <userId> }] }
```

For every other role, and for a request with no `req.user`, the function's contract is unchanged:
`{}` (unrestricted — scoping handled elsewhere or role short-circuits) or `MATCH_NOTHING`
(`{ _id: { $in: [] } }`) respectively.

## Guard predicates in `middlewares/ownership.js` (in-memory equivalents)

Two call sites re-derive the same condition in memory instead of querying `playerScopeFor` a second
time (performance optimization from Stage 4, unchanged by this feature — see `plan.md` Complexity
Tracking). Both narrow identically to R1/R3 in `research.md`:

| Site | Before | After |
|---|---|---|
| `checkPlayerOwnership` (proScout branch) | `(player.team && teamIds.some(t => t.equals(player.team))) \|\| (!player.team && player.createdBy?.equals(req.user._id))` | `player.createdBy?.equals(req.user._id)` |
| `playerInProScoutScope` (used by `checkReportOwnership`, `checkMediaOwnership`) | same shape as above | same simplification as above |

No change to what fields these sites `.select()` — `createdBy` is already selected at every call
site that needs it.

## No new entities

`ScoutingReport` and `PlayerMedia` schemas are unaffected. Their existing `player` reference is what
`checkReportOwnership`/`checkMediaOwnership` resolve to a `Player` document before evaluating
`playerInProScoutScope` — that resolution step is unchanged; only the predicate's outcome narrows.
