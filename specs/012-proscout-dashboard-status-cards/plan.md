# Implementation Plan: ProScout Dashboard Status Cards

**Branch**: `012-proscout-dashboard-status-cards` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-proscout-dashboard-status-cards/spec.md`

## Summary

`GET /dashboard/proScout` currently returns `totalPlayers` with no breakdown by status. Add
`selectedPlayers` / `pendingPlayers` / `rejectedPlayers` to its response, computed from the same
`playerScopeFor(req)` scope already used for `totalPlayers` (no new or wider query), with
`observed` folded into `pendingPlayers` exactly as `getCoachDashboardData` already does for the
coach. Surface the three counts as stat cards on the proScout dashboard page, reusing the existing
`StatCardComponent` and `selected`/`pending`/`rejected` icon variants already shipped for the coach
dashboard. No new endpoint, no new frontend component, no i18n additions — this is an additive
field change to an existing response plus template wiring on an existing page.

## Technical Context

**Language/Version**: JavaScript (ESM) — Node 22 (Backend); TypeScript — Angular 21 (frontend)

**Primary Dependencies**: Express 5, Mongoose 9 (Backend); Angular standalone components + signals (frontend)

**Storage**: MongoDB — `Player.status` enum (`selected` | `pending` | `observed` | `rejected`), no schema change

**Testing**: vitest + mongodb-memory-server + `tests/helpers/factory.js` (Backend); Karma/Jasmine (frontend)

**Target Platform**: Existing web app (server + Angular SPA) — no new platform surface

**Project Type**: Web application (existing `Backend/` + `frontend/` structure)

**Performance Goals**: No new round trip beyond what `getProScoutDashboardData` already performs per request; status breakdown MUST be derived from an existing/consolidated scoped query, not an additional separately-scoped one (FR-006)

**Constraints**: MUST reuse `playerScopeFor(req)` as the sole scope source (Constitution Principle IV); MUST NOT diverge from the `totalPlayers` figure already returned by the same endpoint; MUST NOT touch `getCoachDashboardData`, `getObserverDashboardData`, `computeAdminDashboardData`, or their routes

**Scale/Scope**: One controller function (`getProScoutDashboardData`), one Swagger schema (`ProScoutDashboard`), one generated-types regen, one frontend model interface, one frontend component template — no migration, no new route, no new role logic

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I — Server-Side Enforcement First | N/A to this change | No new access decision is introduced. This feature adds *read-only aggregate counts* over data already returned by the same authenticated, already-scoped endpoint. Nothing is hidden-only in the frontend; the counts are computed server-side from `playerScopeFor(req)`. |
| II — Deny by Default | N/A | No new role, no new route, no new `allowedTo`. The existing `getProScoutDashboard` route (`protect, allowedTo(PRO_SCOUT), getProScoutDashboard`) is untouched. |
| III — No Behavior Change for Existing Roles | **PASS (gate)** | `getCoachDashboardData`, `getObserverDashboardData`, `computeAdminDashboardData`, and their routes MUST NOT be modified — only referenced as the pattern to copy. `tests/isolation.test.js` is unaffected (it governs `ApiFeature.filter()`, not `dashboardController.js`). Regression tests required per FR-009. |
| IV — Single Central Scope Layer | **PASS (gate)** | The three new counts MUST be computed from the same `playerScopeFor(req)` result already assigned to `playerScope` in `getProScoutDashboardData` (dashboardController.js:257) — no new manual filter, no second call to `playerScopeFor` with different arguments. This is the central design constraint of the whole feature (FR-002, FR-006). |
| V — Independently Deployable Phases | PASS | Single additive change to one endpoint's response shape + one page's template. No migration. Requires `npm run dump-spec` + `npm run gen:types` in the same PR (route shape changes). |
| VI — Positive/Negative Test per Permit | PASS (adapted) | This isn't a new permission, so no new 403 test is required. The applicable form: a positive test proving proScout A's counts are correct and unaffected by proScout B's players (spec Acceptance Scenario 3), and a regression test proving coach/observer/admin dashboard shapes are byte-identical to before. |
| VII — Single Source of Truth for Role Names | N/A | No role-name string literals introduced. |

No violations requiring justification — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/012-proscout-dashboard-status-cards/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── dashboard-proscout.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
Backend/
├── controllers/
│   └── dashboardController.js     # getProScoutDashboardData — add status breakdown here
├── utils/
│   └── swagger.js                 # ProScoutDashboard schema — add 3 fields
└── tests/
    └── roles/
        └── proScoutDashboard.test.js   # extend with status-breakdown assertions

frontend/
├── src/app/core/models/
│   ├── api.generated.ts           # regenerated via npm run gen:types (not hand-edited)
│   └── dashboard.model.ts         # ProScoutDashboard interface — add 3 fields
└── src/app/features/dashboard/pro-scout-dashboard/
    ├── pro-scout-dashboard.component.ts        # add 3 app-stat-card entries
    └── pro-scout-dashboard.component.spec.ts   # extend with new field assertions

openapi.json                        # regenerated via npm run dump-spec (repo root)
```

**Structure Decision**: Existing web application layout (`Backend/` + `frontend/`), no new
directories. This is a modification to one existing controller function, one existing Swagger
schema, one existing frontend model, and one existing frontend component — the same files Stage 5
(`specs/007-proscout-dashboard/`) created, extended rather than replaced.

## Complexity Tracking

*No Constitution Check violations — table not applicable.*
