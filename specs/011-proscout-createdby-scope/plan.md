# Implementation Plan: proScout Player Scope Narrowed to createdBy

**Branch**: `011-proscout-createdby-scope` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-proscout-createdby-scope/spec.md`

## Summary

`proScout` player scope currently grants visibility into any player on a professional-league team,
regardless of who created it (Stage 2, `services/scope.js` `playerScopeFor`). This let one `proScout`
see and act on a colleague's players purely by shared team membership. This feature removes that
team-based branch entirely, leaving `Player.createdBy === req.user._id` as the sole scope condition
for every `proScout` read of player data (list, detail, counts, average-ratings, dashboard) — and,
by extension, for the report/media ownership guards that currently combine authorship with player
scope. Match scope and team scope are explicitly out of scope and stay untouched. No schema change:
`Player.createdBy` already exists (Stage 2) and is already populated on every create. The technical
approach is a targeted edit to one central function (`playerScopeFor`) plus its two known duplicated
copies in `middlewares/ownership.js`, which per FR-008 MUST change in the same commit/PR to avoid the
three-copy drift the codebase has been carrying since Stage 4.

## Technical Context

**Language/Version**: Node.js (ESM, `"type": "module"`), pinned via `.nvmrc` to 22

**Primary Dependencies**: Express 5, Mongoose 9, `express-async-handler` — no new dependency introduced

**Storage**: MongoDB (existing `Player`, `ScoutingReport`, `PlayerMedia` collections) — no schema/index change; `Player.createdBy` already exists and is indexed as of Stage 2

**Testing**: vitest (`Backend/tests`), sequential execution against `mongodb-memory-server`, fixtures via `tests/helpers/factory.js`

**Target Platform**: Existing Express 5 backend (`Backend/`); no frontend code change required — the players list/detail/dashboard pages already render whatever the backend scope returns, with no client-side scope logic to update

**Project Type**: Web service (backend-only change; this repo's `frontend/` and `e2e/` are unaffected beyond passive regression coverage)

**Performance Goals**: N/A — no new query pattern; `{ createdBy: <userId> }` is a strict simplification of the current `$or` (fewer clauses, same indexed field), so no regression expected. Not benchmarked as this feature narrows an existing indexed-field query, not introduce one.

**Constraints**: Constitution Principle IV (single central scope layer — `playerScopeFor` is the definition, all consumers read from it) and Principle III (zero behavior change for `coach`/`observer`/`admin`, proven by `tests/isolation.test.js` and existing regression suites passing unmodified)

**Scale/Scope**: Backend-only. Touches 1 central function + 2 duplicated in-memory copies (`services/scope.js`, `middlewares/ownership.js`) and 0 controllers directly (they all consume `playerScopeFor`/`playerInProScoutScope` and need no logic change themselves, per the Stage 11 call-site audit in `docs/scout-pro-plan-v2.md`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Check | Status |
|---|---|---|
| I — Server-Side Enforcement First | Scope change lives entirely in `services/scope.js` + `middlewares/ownership.js` (backend). No frontend gating logic exists or is added for this narrowing — the players/dashboard pages already render server output as-is. | PASS |
| II — Deny by Default | This feature *strengthens* deny-by-default: it removes a branch that granted implicit visibility via team membership. No new implicit grant is introduced. | PASS |
| III — No Behavior Change for coach/observer/admin | `playerScopeFor` short-circuits to `{}` for every non-`proScout` role (unchanged control flow); `teamScopeFor`/`seasonMatchScopeFor` untouched (FR-006). Admin's Stage 4c/4d lens confirmed by code audit to never consult `proScout` scope. Regression suites (`adminProfessionalLens.test.js`, `proScoutFullRegression.test.js` equivalents, `tests/isolation.test.js`) MUST pass unmodified — verified in Phase 1/tasks, not assumed. | PASS (verify by test in tasks) |
| IV — Single Central Scope Layer | `playerScopeFor` remains the sole definition. Known pre-existing violation carried forward from Stage 2/4: `middlewares/ownership.js` holds two duplicated in-memory copies of the same logic (`checkPlayerOwnership`'s proScout branch, `playerInProScoutScope`) for a documented performance reason (avoiding a second DB round-trip on an already-loaded document). FR-008 requires these to change in lockstep with `playerScopeFor`, not to be unified in this feature. See Complexity Tracking. | PASS WITH NOTED PRE-EXISTING DEVIATION |
| V — Independently Deployable | Single, self-contained backend change. No dependency on any unmerged stage. Rollback = revert the scope shape (git revert), no migration to unwind (FR-013: explicitly no migration performed). | PASS |
| VI — Positive + Negative Test per Permission | Plan requires: positive (a proScout's own players/reports/media, exact count+content), negative (another proScout's players/reports/media rejected, not empty-200), direct-ID-outside-scope, query-param-widening-attempt, and the full endpoint inventory delta (scope narrows, no endpoint gains/loses `allowedTo` membership) — captured in tasks. | PASS (enforced in tasks) |
| VII — Single Source of Truth for Role Names | No new role, no role-name literal introduced. | PASS |
| C-4 (constitution, amended v1.1.0) | This feature *is* the implementation of the amended C-4. Target shape matches exactly. | PASS |

No unjustified violations. The one noted deviation (three copies of scope logic instead of one) is pre-existing (Stage 2/4), not introduced by this feature, and is carried forward per FR-008/Assumptions rather than fixed here — see Complexity Tracking for why unifying it is out of scope.

## Project Structure

### Documentation (this feature)

```text
specs/011-proscout-createdby-scope/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   └── scope-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks command — NOT created by /speckit-plan)
```

### Source Code (repository root)

This is the existing Talent Radar repo (Express 5 + Mongoose backend, Angular frontend, Playwright
e2e — see root `CLAUDE.md`). This feature touches backend files only:

```text
Backend/
├── services/
│   └── scope.js                          # playerScopeFor — the shape changes here (Phase 1)
├── middlewares/
│   └── ownership.js                      # checkPlayerOwnership (proScout branch) + playerInProScoutScope — sync with scope.js
├── controllers/
│   ├── playerController.js               # getAll, getCountsByAgeGroup — consume playerScopeFor, no logic change expected
│   ├── dashboardController.js            # getProScoutDashboardData — consumes playerScopeFor, no logic change expected
│   └── scoutingReportController.js       # getAverageRatingsForPlayers — consumes playerScopeFor, no logic change expected
└── tests/
    └── roles/
        ├── proScoutDataScope.test.js       # Stage 2/6 suite — existing scope tests need shape update
        ├── proScoutCreatedByScope.test.js  # new — this feature's dedicated regression suite (proposed name)
        └── adminProfessionalLens.test.js   # Stage 4c suite — one new regression scenario added (US2), no other edits

docs/
└── scout-pro-plan-v2.md   # "المرحلة 11" section gets an implementation-note update at close-out (Polish phase)
```

**Structure Decision**: No new modules, no new directories beyond the spec/plan artifacts above. This
is a narrow, surgical change inside the existing central scope layer (Principle IV) — the entire
point of that layer is that a change like this touches one function, not N controllers. Frontend
(`frontend/`) and `e2e/` are listed only as regression-verification targets in tasks, not touched
structurally.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Three independent copies of the `proScout` player-scope condition (`playerScopeFor`, `checkPlayerOwnership`'s in-memory branch, `playerInProScoutScope`) instead of one shared function | Pre-existing since Stage 2/4 (documented code-review fix #4): `checkPlayerOwnership`/`checkReportOwnership`/`checkMediaOwnership` already have the player document loaded from their own `findById`, so re-deriving the scope condition in memory avoids a second DB round-trip that calling `playerScopeFor(req)` + a fresh `Player.exists()` query would cost on every single-resource request. | Unifying into one exported predicate (e.g. `isPlayerInProScoutScope(player, req)` called from all three sites) is the obviously simpler design and is *not* rejected as wrong — it is deferred: doing it as part of this feature would mix a scope-shape change with a refactor of an unrelated pre-existing pattern, widening the diff a security-sensitive PR needs to carry, and touching a working performance optimization that has its own dedicated code-review history. FR-008 requires the three copies to be updated in lockstep (verified by test) rather than merged. Left as a named follow-up, not silently accepted. |

