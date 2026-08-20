# Implementation Plan: ProScout Data Scope Enforcement

**Branch**: `phase-2-data-scope-layer` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-proscout-data-scope/spec.md`

## Summary

Give the `proScout` role a real data scope — professional-league players, matches and teams, plus
its own team-less players — enforced in one central place so that no endpoint, present or future,
can reach outside it.

Technical approach: introduce a single scope module (`Backend/services/scope.js`) that produces
plain filter objects, and thread it into the **base-filter position** of every list query, the
`$match` of both aggregations, and — critically — the `/:id` guards in `ownership.js` via
`Model.exists({ _id, ...scope })`, so list scope and direct-lookup scope are literally the same
object and cannot drift. Add `Player.createdBy` with a backfill to make the team-less branch
expressible. Only then open the `allowedTo` gates that Stage 1 deliberately left at 403.

Four findings during research changed the shape of this work versus `docs/scout-pro-plan-v2.md`, and
a fifth — the `$and` wrapping rule (R12) — corrected this plan's own first draft after cross-artifact
analysis caught that base-position scoping does not AND the way it appears to. See
[research.md](./research.md) and the Complexity Tracking table below.

## Technical Context

**Language/Version**: Node.js 22 (`.nvmrc`), ESM (`"type": "module"`)

**Primary Dependencies**: Express 5, Mongoose 9, express-validator, express-async-handler

**Storage**: MongoDB. One additive schema field (`Player.createdBy`) + one compound index; no
collection added, no field removed or repurposed.

**Testing**: vitest, run sequentially (`fileParallelism: false`) against `mongodb-memory-server`,
collections cleared in `beforeEach`, fixtures from `Backend/tests/helpers/factory.js` (which already
exports `createProScout` and `createTeam`)

**Target Platform**: Linux server (API); the Angular frontend is **untouched** by this feature

**Project Type**: Web service (backend-only change within a three-project monorepo)

**Performance Goals**: No measurable regression for existing roles — their scope resolves to `{}`,
which spreads into a filter as a no-op, so their queries are byte-identical. For proScout: exactly
**one** extra `distinct` per request (memoized on `req`), never one per document.

**Constraints**: Constitution Principle III is non-negotiable — `Backend/tests/isolation.test.js`
must pass **unmodified**. Scope must land before any `allowedTo` gate opens (FR-012). No filter
logic written inline in a controller (Principle IV).

**Scale/Scope**: **18 backend files** touched (plus `openapi.json`, the generated frontend types, and
the plan doc); 1 new service module, 1 new util, 1 new script, 1 new test file, 2 new ownership
guards + 4 new proScout branches in existing ones; 5 `allowedTo` gates opened; frontend source and
e2e unchanged. The file count matters here — this is the phase the plan flags for line-by-line human
review.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Verdict | How this design satisfies it |
|---|---|---|
| **I — Server-side enforcement first** | ✅ Pass | Backend-only feature; no UI change at all. Every refusal is a real 403 from `ownership.js`, never an empty 200. Proof is API-level tests. |
| **II — Deny by default** | ✅ Pass | `proScout` stays **out** of `ownerFields`, so `buildOwnerScope` still returns `MATCH_NOTHING` for it as a second line of defence. `seasonMatchBaseFilterFor`'s `default` changes from `{}` to `MATCH_NOTHING`. Guards for reports/media/attendance get explicit proScout branches *before* their gates ever open. Masking defaults to the narrower option (R11). |
| **III — No behavior change for existing roles** | ✅ Pass | Every scope helper returns `{}` for admin/coach/observer; `{}` spread into a filter is a no-op, so their queries are unchanged by construction, not by care. The observer branch of `seasonMatchBaseFilterFor` is preserved byte for byte. `isolation.test.js` is not edited. **Four** pre-existing expectations *do* change, all in `proScoutRoleDefinition.test.js` and all about the **new** role only: counts, average-ratings and seasonMatches flip 403 → scoped 200 as their Stage-1 deferrals resolve, and `GET /teams` flips unscoped → scoped. Each is updated in the same phase as the gate that causes it (T025, T033, T036), so the suite is never left red across a phase boundary. No expectation about admin, coach, or observer changes anywhere. |
| **IV — Single central scope layer** | ✅ Pass *(after R12)* | One module, one definition per resource, nine consumers. `/:id` guards reuse the *same object* via `exists({ _id, ...scope })` rather than re-expressing it. All helpers return plain objects, never Queries. Denials logged with the four required fields. **Merge precedence required a fix**: base-position scoping does *not* inherently AND — chained conditions merge last-wins, so a client-whitelisted scope key (`league`) was overwritten by `?league=premier`. Every non-empty scope is now `$and`-wrapped, which restores Principle IV's "ownership applied last" semantics without touching `ApiFeature`. See [research R12](./research.md). |
| **V — Independently deployable** | ✅ Pass | Additive schema field, non-required, so the backfill can run before *or* after deploy without breaking edits. Documented rollback (`$unset`). Feature is complete and shippable on its own: reads are scoped, writes stay 403. `dump-spec` + `gen:types` run in the same PR. |
| **VI — Positive and negative test per permission** | ✅ Pass *(after G1)* | Full endpoint inventory built from `Backend/routes/*.js` in [contracts/proscout-endpoint-matrix.md](./contracts/proscout-endpoint-matrix.md). Every opened endpoint gets both a positive test (exact count *and* content) and a negative test asserting **403**, not an empty body. The three mandatory cases each map to named tasks: **direct ID out of scope** → guards T023/T030/T038 with tests in T015/T026/T034; **query param attempting to widen** → T016 (`?team=`, the whitelisted key on players), T027 and T035 (`?league=`, the key that collides with the scope on matches and teams); **search/sort/pagination inside scope** → **T017**, added after cross-artifact analysis found this row asserting coverage that no task actually provided. Guard branches unreachable over HTTP in this stage are unit-tested directly by **T042**. |
| **VII — Single source of truth for role names** | ✅ Pass | All new code imports `ROLES` from `Backend/constants/roles.js`. No new string literals. Test files keep literals deliberately, per the Stage-0 clarify decision recorded in that file's header. |

**Gate result: PASS — no violations requiring justification.** The Complexity Tracking table below
records deviations from the *plan document*, which is subordinate to the Constitution, not
violations of the Constitution itself.

## Project Structure

### Documentation (this feature)

```text
specs/003-proscout-data-scope/
├── plan.md                              # This file
├── spec.md                              # Feature specification
├── research.md                          # Phase 0 — decisions + 3 corrections to the plan doc
├── data-model.md                        # Phase 1 — Player.createdBy, index, backfill, filter shapes
├── quickstart.md                        # Phase 1 — how to run and validate
├── contracts/
│   ├── proscout-endpoint-matrix.md      # Principle VI inventory: every route's proScout verdict
│   └── scope-module.md                  # Internal interface of services/scope.js + accessLog.js
└── checklists/requirements.md           # Spec quality checklist (passed)
```

### Source code (repository root)

```text
Backend/
├── services/
│   ├── scope.js                         # NEW — the central scope layer
│   └── services.js                      # unchanged (baseFilterFn already supported)
├── utils/
│   ├── accessLog.js                     # NEW — structured denial logging
│   ├── apiFeatures.js                   # UNCHANGED (deliberately — see research R1)
│   └── validation/playerValidation.js   # + lockField("createdBy") ×2
├── models/
│   └── playedModel.js                   # + createdBy field, + { team, createdBy } index
├── middlewares/
│   └── ownership.js                     # + proScout branches ×4, + checkTeamScope,
│                                        #   + checkSeasonMatchScope  (→ 6 exported guards)
├── controllers/
│   ├── playerController.js              # create: set createdBy; getAll/getSpecific: scope + mask;
│   │                                    #   getCountsByAgeGroup: scoped $match
│   ├── scoutingReportController.js      # getAverageRatingsForPlayers: id pre-filter
│   ├── seasonMatchController.js         # seasonMatchBaseFilterFor → explicit switch
│   └── teamsController.js               # getAll: + baseFilterFn
├── routes/
│   ├── playerRouter.js                  # open 3 gates; replace the Stage-1 deferral comment
│   ├── seasonMatchRouter.js             # open 2 gates
│   └── teamRouter.js                    # + checkTeamScope on GET /teams/:id
├── scripts/
│   ├── backfillPlayerCreatedBy.js       # NEW — dry-run/--apply, idempotent, rollback documented
│   └── syncAllIndexes.js                # register the new index
└── tests/roles/
    ├── proScoutRoleDefinition.test.js   # UPDATE the GET /teams expectation (intended)
    └── proScoutDataScope.test.js        # NEW — the bulk of the acceptance criteria

openapi.json                             # regenerate via npm run dump-spec
frontend/src/app/core/models/api.generated.ts   # regenerate via npm run gen:types
```

**Structure Decision**: Existing layout, no new top-level directories. The one new *concept* — a
scope module — lands in `Backend/services/` beside `services.js` and `mediaMatchGate.js`, both of
which are likewise cross-cutting policy modules consumed by controllers. `ownership.js` grows from
four guards to six; that growth is required by Constraint C-3 and is explained in research R8.

## Implementation ordering (non-negotiable)

FR-012 and the spec's Assumptions make this an ordering requirement, not a preference. Opening a
gate before its scope exists does not yield an empty result — it yields the **entire collection**
for `/players/counts` and `/seasonMatches` (verified: research R6).

1. `Player.createdBy` + index + validation locks + backfill script
2. `services/scope.js` + `utils/accessLog.js`
3. Base filters: players list, season matches, teams list
4. Aggregations: counts, average-ratings
5. `ownership.js` — six guards, explicit proScout branches, denial logging
6. **Only now**: open the five `allowedTo` gates
7. `dump-spec` → `gen:types`
8. Full regression: `isolation.test.js` unmodified, plus the new suite

Steps 1–5 are individually safe to merge; step 6 is the only one that changes what the role can
reach.

## Complexity Tracking

> No Constitution violations. These are deviations from `docs/scout-pro-plan-v2.md` Stage 2, which
> the Constitution's Governance section subordinates to itself. Each is justified in research.md.

| Deviation from the plan doc | Why needed | Simpler alternative rejected because |
|---|---|---|
| Scope via a central module in the base-filter position, **not** `apiFeatures.js buildOwnerScope` (R1) | Constraint C-4 mandates `baseFilterFn` for this `$or` shape; the first branch needs an async lookup | Making `buildOwnerScope` async breaks the synchronous chained API of `ApiFeature.filter()` — the one class the entire isolation contract rests on. Inline `$or` in the controller is forbidden by Principle IV. |
| **Six** ownership guards, not four (R8) | `GET /teams/:id` and `GET /seasonMatches/:id` have no per-document guard today, and C-3 requires teams league-scoped for this role | Adding a league check inside `gettingSpecific(Team)` would scope a *generic* factory used by other resources; a guard keeps the change local and Principle-IV-compliant. |
| Also opens `GET /players/:id` and applies `maskObservedForCoach` to proScout (R10, R11) | FR-003 covers "player detail", which needs the gate open; the response then has no masking branch for this role and would expose the `observers` array | Leaving the gate closed fails FR-003. Leaving masking off is a silent exposure decision that would pre-empt the open `[NEEDS CLARIFICATION]` in Stage 4. |
| Denial logging to structured stderr, not a collection (R9) | Principle IV needs four fields captured; a collection here means attacker-controlled unbounded writes | A TTL index bounds retention, not write rate, so the disk-exhaustion window stays open. |
| `average-ratings` treated as *wrongly-axed*, not *unfiltered* (R6) | Source says `match.coach = req.user._id` already applies to every non-admin | Implementing against the plan doc's stated premise would have produced a fix for a leak that does not exist, while missing the real issue: an unvalidated `?ids=` existence oracle. |
| Every scope is `$and`-wrapped, not a bare condition (R12) | `league` is both the scope key and a client-whitelisted filter; chained Mongoose conditions merge last-wins, so `?league=premier` replaced the scope outright on `/seasonMatches` and `/teams` | Stripping `league` from `queryParams` per-role fixes only the keys someone remembers to strip — the next scope key added anywhere silently reopens the hole. Removing `league` from the whitelists changes existing-role behavior (Principle III). |
