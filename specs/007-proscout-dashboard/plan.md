# Implementation Plan: ProScout Dashboard

**Branch**: `phase-5-dashboard` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-proscout-dashboard/spec.md`

## Summary

Add `GET /dashboard/proScout` and the Angular page behind it, so the proScout role gets a home
screen showing its scoped player count, upcoming professional-league matches, latest results, and
its own recent reports — every figure read through the Stage 2 scope layer rather than re-derived.
The same change discharges DF-001 from Stage 3: the temporary `RoleLandingService` case is edited in
place to point at the new dashboard, and the role joins the Dashboard sidebar entry.

The technical core is small and almost entirely additive. The risk is concentrated in three places,
all of which are addressed by construction rather than by review:

1. **Composing a scope with a date filter.** Measured: spreading a `$and`-wrapped scope into an
   object that also carries `$and` makes the scope vanish silently and returns the whole premier
   league. All compositions nest ([research.md R1](./research.md)).
2. **`ageGroup` arriving unrequested.** `SeasonMatch` auto-populates it on every `find`; suppression
   is an explicit projection and is asserted against the response body, not the source
   ([research.md R6](./research.md)).
3. **Documents and tests that assert the pre-Stage-5 state** and must be edited, not appended to —
   **four** files, 7 expected failures ([research.md R10](./research.md)). The transitive one is the
   trap: editing `RoleLandingService` changes where *every* guarded route bounces a refused proScout,
   so `role.guard.spec.ts` breaks without `role.guard.ts` being touched at all.

## Technical Context

**Language/Version**: Node 22 (`.nvmrc`); ESM throughout the backend (`"type": "module"`)

**Primary Dependencies**: Express 5, Mongoose 9.7.2, Angular 21 (standalone + signals), ngx-translate

**Storage**: MongoDB. **No schema change, no migration, no new index** — see
[data-model.md](./data-model.md)

**Testing**: vitest (backend, sequential, `mongodb-memory-server`); Karma/Jasmine (frontend);
Playwright (e2e, not extended by this feature)

**Target Platform**: Web — Express API on :8000 dev, Angular SPA on :4200

**Project Type**: Web application (separate `Backend/` and `frontend/` projects)

**Performance Goals**: No new access pattern; every query is served by an existing index
([research.md R8](./research.md)). No caching added, and deliberately so
([research.md R2](./research.md))

**Constraints**: Constitution v1.0.2 Principles I–VII; Constraint C-4 (`league: "professional"` is
the only accepted definition of the second division); C-3 remains open and untouched

**Scale/Scope**: 1 new endpoint (84 total), 1 new Angular route, 1 new component, ~6 i18n key pairs,
3 existing test/spec artifacts edited

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Both passes below.*

| Principle | Verdict | How this design satisfies it |
|---|---|---|
| **I — Server-side enforcement first** | ✅ PASS | The endpoint is gated by `protect` + `allowedTo(ROLES.PRO_SCOUT)` before any UI work exists. Refusal for other roles is **403**, never 200-with-zeroes — stated in the contract and asserted in §2 of [quickstart.md](./quickstart.md). Hiding the nav entry is not offered as evidence anywhere. |
| **II — Deny by default** | ✅ PASS | The new route carries an explicit `allowedTo`. No existing `allowedTo` is widened. The role gains exactly one operation; the other 83 decisions are restated unchanged in [contracts/endpoint-inventory-delta.md](./contracts/endpoint-inventory-delta.md). |
| **III — No behavior change for existing roles** | ✅ PASS | Both scope functions already return `{}` for admin/coach/observer, and the new endpoint is unreachable by them regardless. `dashboardController`'s existing four exported handlers are not edited; the cache map gains no key ([research.md R2](./research.md)). `isolation.test.js` runs **unmodified**. Sidebar edit touches one `roles` array; the three existing menus are asserted identical. |
| **IV — Single central scope layer** | ✅ PASS | Every figure reads `playerScopeFor` / `seasonMatchScopeFor` from `services/scope.js`. Invariant I-1 forbids a literal `"professional"` in the dashboard controller. No manual filter condition is written in the controller beyond the date split and the authorship axis, both of which are orthogonal to scope. |
| **V — Independently deployable** | ✅ PASS | Merged alone, the role gains a working dashboard and loses nothing. `dump-spec` + `gen:types` are in the same change (§4 of quickstart). Rollback is a plain revert — no migration to undo, and the reverted state is exactly the coherent Stage 4 state. |
| **VI — Positive and negative test per permission** | ✅ PASS | Positive: exact counts and list contents, not merely 200. Negative: 403 for all three existing roles; premier-league data absent; another user's reports and team-less players absent. Endpoint inventory obligation met as a delta ([research.md R11](./research.md)). |
| **VII — Single source of truth for role names** | ✅ PASS | Backend uses `ROLES.PRO_SCOUT`; no new string literal. Frontend uses the generated `UserRole` union, so a typo is a build error. `RoleLandingService`'s existing case is **edited**, keeping exactly one branch per role — a second `case 'proScout'` would be unreachable code and is explicitly prohibited. |

**Constraint handling**:

- **C-4** — honoured: the professional definition is consumed only through the scope layer, and
  `ageGroup` is actively excluded from the payload rather than merely unused.
- **C-3** — **remains open, untouched.** This feature requests no age-group data, which is a change
  of intent, not a closed door. `/ages` still has no `protect`. Restated in the inventory delta so
  the absent Age Groups nav entry is not mistaken for enforcement.
- **C-1** — already closed in Stage 0; this feature consumes `RoleLandingService` and `/unauthorized`
  rather than reintroducing per-site role logic.
- **C-2** — not engaged: no `/:id` path is added, so no `ownership.js` guard is needed or touched.

**Complexity Tracking**: no violations — the section is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/007-proscout-dashboard/
├── plan.md                                   # This file
├── spec.md
├── research.md                               # Phase 0 — R1…R11
├── data-model.md                             # Phase 1 — derived entity + invariants I-1…I-7
├── quickstart.md                             # Phase 1 — validation guide §0…§6
├── contracts/
│   ├── dashboard-proscout.md                 # Phase 1 — endpoint contract + G-1…G-7
│   └── endpoint-inventory-delta.md           # Phase 1 — Principle VI obligation
├── checklists/
│   └── requirements.md
└── tasks.md                                  # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
Backend/
├── controllers/
│   └── dashboardController.js                # EDIT — add getProScoutDashboard + its data fn.
│                                             #        The four existing handlers, the cache map,
│                                             #        and the three emitters are NOT touched.
├── routes/
│   └── dashboardRouter.js                    # EDIT — one route + its @swagger block
├── services/
│   └── scope.js                              # READ ONLY — consumed, never modified
├── utils/
│   └── swagger.js                            # EDIT — ProScoutDashboard schema
└── tests/
    ├── roles/proScoutDashboard.test.js       # NEW  — G-1…G-7
    ├── isolation.test.js                     # UNMODIFIED (must stay so)
    └── dashboardCache.test.js                # UNMODIFIED — proves cache untouched

frontend/src/app/
├── core/
│   ├── models/dashboard.model.ts             # EDIT — ProScoutDashboard type
│   ├── models/api.generated.ts               # REGENERATED — gen:types
│   ├── auth/role.guard.spec.ts               # EDIT — 3 cases assert the refused-proScout
│   │                                         #        bounce; the landing changes transitively
│   │                                         #        via RoleLandingService. role.guard.ts
│   │                                         #        itself is NOT touched.
│   └── services/
│       ├── role-landing.service.ts           # EDIT IN PLACE — the existing 'proScout' case
│       └── role-landing.service.spec.ts      # EDIT — assertions flip to /dashboard/proScout
├── features/dashboard/
│   ├── dashboard.routes.ts                   # EDIT — guarded /proScout route
│   ├── services/dashboard.service.ts         # EDIT — getProScoutDashboard()
│   └── pro-scout-dashboard/                  # NEW  — component (+ spec)
├── layout/sidebar/
│   ├── sidebar.component.ts                  # EDIT — 'proScout' into the Dashboard entry only
│   └── sidebar.component.spec.ts             # EDIT — 2 entries → 3
└── assets/i18n/{en,ar}.json                   # EDIT — new DASHBOARD.* keys, both files

openapi.json                                   # REGENERATED — dump-spec
specs/004-role-based-navigation/spec.md        # EDIT — FR-007/SC-002 counts; DF-001 discharged
```

**Structure Decision**: The existing two-project web layout is used unchanged. The new dashboard
handler lives in `controllers/dashboardController.js` beside its three siblings rather than in a new
file — it is the same kind of thing, and the file's §11 cache commentary is the context a future
reader needs in order to understand why this one is uncached. The new Angular component follows the
`coach-dashboard/` and `observer-dashboard/` sibling convention.

## Design decisions carried into implementation

These are the points where the obvious implementation is the wrong one. Each has a test that fails
if it regresses.

1. **Nest, never spread** (I-2). `{ $and: [ scope, { matchDate: … } ] }`. The spread form works
   today and breaks silently the day someone adds a second `$and` — measured in
   [research.md R1](./research.md).
2. **`upcomingMatchesCount` is its own `countDocuments`** (I-5), not `upcomingMatches.length`, which
   is capped at 5.
3. **Matches are league-scoped, not attendance-scoped** ([research.md R3](./research.md)). This
   differs from the coach/observer dashboards on purpose. The labels must read "professional league",
   not "attended", or the number will be reported as a bug.
4. **Today's matches are results, not upcoming** (I-6) — end-of-day boundary, matching all three
   existing dashboards and the UTC-midnight storage of `matchDate`.
5. **Reports are filtered on both authorship and player scope** (I-4), following the precedent
   `getAverageRatingsForPlayers` set in Stage 2. Count and list share one filter object.
6. **No cache, no socket emitter** ([research.md R2](./research.md), [R9](./research.md)). Both are
   deliberate asymmetries with the sibling dashboards and belong in the PR description.

## Phase status

- [x] **Phase 0 — Research**: [research.md](./research.md), R1–R11. No `NEEDS CLARIFICATION`
      remained from the spec; the plan document had pre-resolved this stage's open questions and
      DF-001 fixed the landing-destination decision.
- [x] **Phase 1 — Design & Contracts**: [data-model.md](./data-model.md),
      [contracts/](./contracts/), [quickstart.md](./quickstart.md).
- [x] **Constitution re-check after Phase 1**: re-evaluated above — still 7/7 PASS. The Phase 1
      design added no endpoint beyond the one inventoried, no write path, and no schema change, so
      no gate moved.
- [ ] **Phase 2 — Tasks**: `/speckit-tasks` (not produced by this command).
