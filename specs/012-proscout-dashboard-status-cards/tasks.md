---

description: "Task list for ProScout Dashboard Status Cards"
---

# Tasks: ProScout Dashboard Status Cards

**Input**: Design documents from `/specs/012-proscout-dashboard-status-cards/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-proscout.md, quickstart.md

**Tests**: Included — this codebase's Constitution (Principle III, VI) requires regression evidence and positive tests for every data-scoping change, and the spec's acceptance scenarios are directly test-shaped.

**Organization**: One user story (US1, P1) covers the entire feature — there is no MVP-vs-later split here, US1 *is* the whole scope.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to the user story from spec.md (US1)

## Path Conventions

Web app layout per plan.md: `Backend/` (Express/Mongoose) + `frontend/` (Angular). Absolute paths
below are repo-relative from `e:\Work\Talent-Radar - Copy`.

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline before touching shared dashboard code.

- [X] T001 Run `npm test` in `Backend/` and confirm the full suite (including `tests/isolation.test.js` and `tests/roles/proScoutDashboard.test.js`) is green before any change — this is the baseline T012/T013 will be compared against. No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The backend response shape and its generated types are a shared prerequisite for both
the backend tests (Phase 3) and the frontend implementation (Phase 3) — nothing in Phase 3 can be
written against the real field names until this phase lands.

**⚠️ CRITICAL**: No User Story 1 task can begin until T002–T005 are complete.

- [X] T002 In `Backend/controllers/dashboardController.js`, inside `getProScoutDashboardData` (~line 256-324), add `selectedPlayers`/`pendingPlayers`/`rejectedPlayers` to the returned object, computed from the **same** `playerScope` variable already assigned at the top of the function (`const playerScope = await playerScopeFor(req);`) — do not call `playerScopeFor` again or build a second filter (Constitution Principle IV, research.md R1). Fold `observed` into `pendingPlayers` by copying `getCoachDashboardData`'s existing line verbatim: `const pendingPlayers = (statusMap["pending"] ?? 0) + (statusMap["observed"] ?? 0);` (research.md R2). Choose either aggregation shape from research.md R3 (a `$facet` alongside/replacing the existing `totalPlayers`/`scopedPlayerIds` queries, or a parallel `Player.aggregate([{ $match: playerScope }, { $group: ... }])` added to the existing `Promise.all`) — either is acceptable as long as no second independently-built player filter is introduced.
- [X] T003 [P] In `Backend/utils/swagger.js`, add `selectedPlayers`, `pendingPlayers`, `rejectedPlayers` (`type: "integer"`) to the `ProScoutDashboard` schema (~line 306-316), matching the property shape already used in the `CoachDashboard` schema (~line 207-218).
- [X] T004 Run `npm run dump-spec` in `Backend/`, then `npm run gen:types` in `frontend/`, to regenerate `openapi.json` (repo root) and `frontend/src/app/core/models/api.generated.ts`. Depends on T002 and T003. Confirm the diff is additive-only (three new integer properties on `ProScoutDashboard`, nothing else changes shape) per quickstart.md §3.
- [X] T005 [P] In `frontend/src/app/core/models/dashboard.model.ts`, add `selectedPlayers: number`, `pendingPlayers: number`, `rejectedPlayers: number` to the hand-written `ProScoutDashboard` interface (~line 47-54). No hard dependency on T004 — the interface is hand-maintained, not generated, so this only needs the field names fixed by T002/T003, not T004's regen step to finish.

**Checkpoint**: `GET /dashboard/proScout` now returns the three new fields; `openapi.json` and the generated/hand-written frontend types agree with it. User Story 1 work can begin.

---

## Phase 3: User Story 1 - proScout sees a status breakdown of their own players (Priority: P1) 🎯 MVP

**Goal**: A proScout viewing their dashboard sees Selected/Pending/Rejected counts for their own
players, correctly scoped and summing to the total already shown.

**Independent Test**: Log in as a proScout with a known mix of player statuses, load
`GET /dashboard/proScout` (or the dashboard page), and verify the three new fields/cards match the
expected counts and sum to `totalPlayers`.

### Tests for User Story 1

> Write these first against the Phase 2 field names; they should fail until Phase 2's controller
> change (T002) is complete, and pass immediately after since T002 already lands the logic.

- [X] T006 [US1] In `Backend/tests/roles/proScoutDashboard.test.js`, add a positive test: a proScout (via `tests/helpers/factory.js`) with players in statuses `[selected, selected, pending, observed, rejected]` gets back `{ selectedPlayers: 2, pendingPlayers: 2, rejectedPlayers: 1 }` from `GET /dashboard/proScout`, and `totalPlayers === selectedPlayers + pendingPlayers + rejectedPlayers` (spec Acceptance Scenario 1, FR-003/FR-004).
- [X] T007 [US1] In the same file (after T006), add a test: a proScout with zero players gets `selectedPlayers: 0, pendingPlayers: 0, rejectedPlayers: 0` (present, not missing/undefined) from `GET /dashboard/proScout` (spec Acceptance Scenario 2).
- [X] T008 [US1] In the same file (after T007), add a test: proScout A (3 players, mixed statuses) and proScout B (4 different players) each created via the factory — proScout A's response counts reflect only their own 3 players, unaffected by B's (spec Acceptance Scenario 3, SC-003).
- [X] T009 [US1] In the same file (after T008), add a test: a proScout who authored a `ScoutingReport` on a player that has since left their `createdBy` scope (a different proScout is now that player's `createdBy` — reuse the out-of-scope fixture pattern already used in `Backend/tests/roles/proScoutCreatedByScope.test.js`) does not have that player counted in any of the three status fields (spec Acceptance Scenario 4).

### Implementation for User Story 1

- [X] T010 [US1] In `frontend/src/app/features/dashboard/pro-scout-dashboard/pro-scout-dashboard.component.ts`, add three `app-stat-card` entries for `d.selectedPlayers` / `d.pendingPlayers` / `d.rejectedPlayers`, using `iconName="selected"|"pending"|"rejected"` and the existing `DASHBOARD.SELECTED`/`DASHBOARD.PENDING`/`DASHBOARD.REJECTED` translation keys (already shipped for `coach-dashboard.component.ts` — no new i18n keys needed), linked to `/players` with `[queryParams]="{status: '...'}"` mirroring `coach-dashboard.component.ts`'s existing status cards (~line 50-76). Adjust the stat-card grid layout so all 6 numbers (total, selected, pending, rejected, upcoming matches, total reports) are readable — e.g. split into a primary row (total + 3 status cards) and a secondary row (matches + reports), mirroring `coach-dashboard.component.ts`'s primary/secondary row split (research.md R5). Do not add any age-group-related card or column (FR-008).
- [X] T011 [P] [US1] In `frontend/src/app/features/dashboard/pro-scout-dashboard/pro-scout-dashboard.component.spec.ts`, extend the existing test(s) to assert the three new stat cards render with the correct labels and values from a mocked `ProScoutDashboard` response.

**Checkpoint**: User Story 1 is fully functional — the proScout dashboard page shows correct, correctly-scoped status counts, verified by both backend and frontend automated tests.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Prove no other role's behavior changed (Constitution Principle III is non-negotiable
here) and close out manual verification quickstart.md can't automate.

- [X] T012 [P] Run `npm test -- tests/roles/coachDashboard.test.js tests/roles/observerDashboard.test.js` in `Backend/` and confirm zero failures and zero changed assertions (FR-009, quickstart.md §2). Note: no dedicated `coachDashboard.test.js`/`observerDashboard.test.js` files exist in this repo — coach/observer/admin dashboard behavior is instead covered by `tests/dashboardCache.test.js` and `tests/dashboardEmit.test.js` (18/18 passing, unmodified) plus the sibling-dashboard assertions already in `proScoutDashboard.test.js` G-7.
- [X] T013 Run the full `npm test` suite in `Backend/` and confirm `tests/isolation.test.js` passes with no modifications, and total pass count is baseline (T001) + the new tests from T006-T009 (quickstart.md §2). Result: 729/729 (33 files) — baseline 726 + 3 new tests in G-8 (T006-T009 landed as 3 new `it` blocks plus one extended existing test for T007, not 4 new ones).
- [X] T014 [P] Run `npx ng test --watch=false --browsers=ChromeHeadless --include='**/pro-scout-dashboard.component.spec.ts'` in `frontend/` and confirm it passes. Result: 6/6 (5 pre-existing + 1 new).
- [ ] T015 (not performed this session — no interactive browser/dev-server environment available here, same limitation documented in every prior stage's implementation notes, e.g. Stage 6/11 quickstart §5/§T022) Perform the manual browser walkthrough in quickstart.md §4: log in as a proScout with mixed player statuses, confirm the three new cards render with correct counts, confirm the total equals their sum, confirm no age-group card/column appears anywhere on the page, and (if a status-card link is wired) confirm it navigates to a pre-filtered, correctly-scoped player list.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run first, purely observational.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all of Phase 3. T002 and T003 are independent of each other ([P]); T004 depends on both; T005 depends on T002/T003 (field names) but not on T004 finishing.
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) completion. Tests (T006-T009) are one sequential edit pass on the same file; all four depend on T002 being merged to pass. Implementation (T010) depends on T004/T005 (needs the typed fields to exist); T011 depends on T010.
- **Polish (Phase 4)**: Depends on Phase 3 completion.

### Parallel Opportunities

- T002 and T003 (Phase 2) — different files.
- T006-T009 (Phase 3 tests) — same file; apply as one sequential edit pass, not parallel writers.
- T011 (frontend spec) can proceed in parallel with the T006-T009 block — different files, both depend only on Phase 2.
- T012 and T014 (Phase 4) — different test suites, independent.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# T002 and T003 touch different files and can be done together:
Task: "Add status-breakdown computation to getProScoutDashboardData in Backend/controllers/dashboardController.js"
Task: "Add selectedPlayers/pendingPlayers/rejectedPlayers to ProScoutDashboard schema in Backend/utils/swagger.js"
```

## Parallel Example: Phase 3 (User Story 1)

```bash
# T006-T009 are one sequential edit to a single file — not a parallel batch.
# Only this pair is genuinely parallel (different files):
Task: "Extend Backend/tests/roles/proScoutDashboard.test.js with status-breakdown assertions (T006-T009, sequential)"
Task: "Extend frontend pro-scout-dashboard.component.spec.ts with new stat-card assertions (T011)"
```

---

## Implementation Strategy

### MVP = the whole feature

There is only one user story (P1) — it is the entire scope of this feature. There is no smaller
independently-shippable slice: the three counts and the three cards are one unit of value (a
proScout without all three status numbers, or without the cards displaying them, delivers nothing).

1. Complete Phase 1 (baseline).
2. Complete Phase 2 (Foundational) — backend field + schema + regen + frontend types.
3. Complete Phase 3 (User Story 1) — tests + frontend cards.
4. **STOP and VALIDATE**: run Phase 4 in full before merging.
5. Merge — this is a single, independently deployable PR (Constitution Principle V).
