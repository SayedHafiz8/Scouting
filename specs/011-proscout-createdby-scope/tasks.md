---

description: "Task list for proScout Player Scope Narrowed to createdBy"
---

# Tasks: proScout Player Scope Narrowed to createdBy

**Input**: Design documents from `/specs/011-proscout-createdby-scope/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/scope-contract.md, quickstart.md — all present.

**Tests**: Included. Constitution Principle VI requires a positive and negative test per permission, and Principle III requires a test that fails if existing-role behavior changes — this feature cannot be considered done without them.

**Organization**: Tasks are grouped by user story (spec.md P1/P2/P3) to enable independent verification of each. The actual production-code change is small enough (2 files) that it lives entirely in the Foundational phase — every story below depends on it and adds no further code, only tests, per research.md R4–R6.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- File paths are exact and relative to the repository root

---

## Phase 1: Setup

- [X] T001 ~~Confirm branch `011-proscout-createdby-scope` is checked out~~ — **no `before_specify` git hook exists in this repo, so no dedicated branch was ever created; work happened directly on the pre-existing `phase-5b-dashboard-status-cards` branch instead.** Flagged to the user rather than silently branching. `Backend/` dependencies confirmed already installed — no new dependency (plan.md Technical Context).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The actual scope-narrowing change. Every user story below depends on this being complete — none of them add further production code (research.md R4, R5, R6 confirm `checkReportOwnership`, `checkMediaOwnership`, `playerController.js`, `dashboardController.js`, and `scoutingReportController.js` all consume the scope as a black box and need no edits of their own).

**⚠️ CRITICAL**: No user story task can be meaningfully verified until this phase is complete.

- [X] T002 [P] In `Backend/services/scope.js`, replace `playerScopeFor`'s `proScout` branch — remove the `professionalTeamIds`/`$or` team-membership clause, return `wrap({ createdBy: req.user._id })` only (research.md R1). **Also update the JSDoc-style comment block directly above `playerScopeFor`** (currently describes the old two-branch `$or` design in detail — "نطاق اللاعبين. فرعين: ...") so it documents the `createdBy`-only rationale instead; a stale comment describing removed logic is worse than no comment (analyze finding U1)
- [X] T003 [P] In `Backend/middlewares/ownership.js`, simplify both `checkPlayerOwnership`'s `proScout` branch and the shared `playerInProScoutScope` helper to `player.createdBy?.equals(req.user._id)` only, removing the `professionalTeamIds`/team-membership clause from each (research.md R3) — do not touch `checkTeamScope` or any other branch in this file. **Also update the surrounding comments on both sites** (they currently explain the removed `professionalTeamIds`/in-memory team comparison in detail) so they describe the simplified `createdBy`-only check instead (analyze finding U1)

**Checkpoint**: Central scope is narrowed. `playerController.js`, `dashboardController.js`, `scoutingReportController.js`, `checkReportOwnership`, and `checkMediaOwnership` all inherit the new shape automatically (Constitution Principle IV) — no edits needed in any of them.

---

## Phase 3: User Story 1 - A proScout sees only the players they personally created (Priority: P1) 🎯 MVP

**Goal**: Prove a `proScout` can no longer see, open, filter into, or write to a player they did not create, across every read/write surface — while their own players are completely unaffected.

**Independent Test**: `npm test -- tests/roles/proScoutCreatedByScope.test.js tests/roles/proScoutDataScope.test.js` (Backend/) — all pass.

- [X] T004 [US1] In `Backend/tests/roles/proScoutDataScope.test.js`, rewrite the existing Stage 2 assertions that encode team-based cross-proScout visibility (a `proScout` seeing another's player via shared team membership) so they match the `createdBy`-only contract instead of contradicting it (research.md R8)
- [X] T005 [US1] Create `Backend/tests/roles/proScoutCreatedByScope.test.js`, built on `Backend/tests/helpers/factory.js` fixtures per project convention, with a positive-scope scenario: `proScout` A's own players are complete and correct across `GET /players`, `GET /players/:id`, and `GET /players/counts` (spec.md SC-002)
- [X] T006 [US1] In the same file, add a negative-scope scenario: `proScout` B cannot see `proScout` A's professional-league-team player via `GET /players` (absent from list), `GET /players/:id` (403, not empty), or `GET /players/counts` (excluded from the count) — depends on T005 (spec.md FR-001, FR-003)
- [X] T007 [US1] In the same file, add a query-widening scenario: `proScout` B's `?team=<professional-team-id>` on `GET /players` does not restore visibility into `proScout` A's players — depends on T006 (spec.md FR-004, Edge Cases)
- [X] T008 [US1] In the same file, add a write-guard scenario: `proScout` B's `PATCH /players/:id` on `proScout` A's professional-league-team player is rejected 403 — behavior that was previously allowed via team scope — depends on T007 (contracts/scope-contract.md)
- [X] T009 [US1] In the same file, assert that `logScopeDenial` is invoked with the correct user id, role, path, and resource id for each of the T006 and T008 rejections — depends on T008 (spec.md FR-011, SC-005; analyze finding C1)
- [X] T010 [US1] In the same file, add a `GET /players/reports/average-ratings` scenario: the `?ids=` list is intersected with the requester's `createdBy` scope, not team scope — depends on T009 (spec.md FR-005)
- [X] T011 [US1] In the same file, add a `GET /dashboard/proScout` scenario: `totalPlayers`/`totalReports`/`recentReports` narrow to `createdBy` while `upcomingMatches`/`upcomingMatchesCount`/`latestResults` remain full-league and unchanged — depends on T010 (spec.md Edge Cases, FR-006)
- [X] T012 [US1] In the same file, add a spot-check scenario: `GET /teams` and `GET /seasonMatches` results for a `proScout` are unchanged by T002/T003 — the only direct verification of FR-006/FR-007, which have no other dedicated task — depends on T011 (spec.md FR-006, FR-007; analyze finding C2)
- [X] T013 [US1] In the same file, add an orphan-player edge case: a professional-league-team player whose `createdBy` is not a `proScout` (e.g. created by a `coach`) is invisible to every `proScout` — depends on T012 (spec.md FR-013)

**Checkpoint**: User Story 1 is independently verifiable — run the Independent Test above.

---

## Phase 4: User Story 2 - Admin's professional-league visibility is completely unaffected (Priority: P2)

**Goal**: Prove the admin's Professional League lens (Stage 4c) and creator-name display (Stage 4d) return identical results before and after this feature.

**Independent Test**: `npm test -- tests/roles/adminProfessionalLens.test.js` (Backend/) — passes, including the new scenario below.

- [X] T014 [US2] ~~add a scenario~~ — already covered verbatim by the existing `specs/010 — GET /players exposes createdBy.name to admin only` test ("returns the correct creator name per player for two distinct proScout creators", `adminProfessionalLens.test.js:403-417`, from Stage 4d), which is admin-only and independent of `proScout` scope. No new test added — would have duplicated existing coverage.
- [X] T015 [US2] Ran `Backend/tests/roles/adminProfessionalLens.test.js` in full: 29/30 passed unmodified; **1 pre-existing assertion broke** ("?isProfessional=true returns the same result as no filter", ~line 162) — its `League Player` fixture had no `createdBy`, so it silently relied on the removed team-based branch. Fixed in place (added `createdBy: scout.user._id`, same pattern as T004) — a regression discovered during implementation, not anticipated in this task list. 30/30 pass now.

**Checkpoint**: User Story 2 is independently verifiable — run the Independent Test above.

---

## Phase 5: User Story 3 - A proScout loses access to their own report/media once the player falls out of scope (Priority: P3)

**Goal**: Prove that authorship alone does not preserve access once the underlying player leaves a `proScout`'s scope (Option A, resolved 2026-08-23).

**Independent Test**: `npm test -- tests/roles/proScoutCreatedByScope.test.js` (Backend/) — passes, including the scenarios below.

- [X] T016 [US3] In `Backend/tests/roles/proScoutCreatedByScope.test.js`, add a scenario: `proScout` A's own scouting report on a player created by `proScout` B is rejected (403) for both read and edit after this feature — depends on T013 (spec.md FR-012, User Story 3)
- [X] T017 [US3] In the same file, add a scenario: `proScout` A's own uploaded media on the same player is rejected (403) for read/download after this feature — depends on T016 (spec.md FR-012)
- [X] T018 [US3] In the same file, assert that `logScopeDenial` is invoked with the correct detail for each of the T016 and T017 rejections — depends on T017 (spec.md FR-011, SC-005; analyze finding C1)
- [X] T019 [US3] In the same file, add a consistency assertion: the report-guard and media-guard produce the identical accept/reject outcome for the same `proScout`/out-of-scope-player pair — no asymmetry between the two — depends on T018 (spec.md User Story 3, Acceptance Scenario 2)

**Checkpoint**: User Story 3 is independently verifiable — run the Independent Test above.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Whole-system regression proof and stage close-out.

- [X] T020 Ran the full Backend suite twice. **First run surfaced 22 failures in 2 files not on the original task list** — `proScoutPlayersWrite.test.js` (Stage 4/5's `inScopePlayer()` fixture never set `createdBy`, silently relying on the removed team-based branch) and `proScoutDashboard.test.js` (3 fixtures with the same gap). Fixed all in place, same pattern as T004 (added `createdBy: scout.user._id`); one test in `proScoutPlayersWrite.test.js` had its actual *mechanism* invalidated (simulated scope-loss via team transfer, which no longer affects scope at all) and was rewritten to simulate scope-loss via `createdBy` reassignment instead, preserving the original test's intent. Final run: **33/33 files, 726/726 tests pass**, `tests/isolation.test.js` unmodified — Constitution Principle III and spec.md FR-010 satisfied.
- [X] T021 [P] Ran `npm run dump-spec` in `Backend/` then `npm run gen:types` in `frontend/` — `git diff --stat` on both `openapi.json` and `api.generated.ts` produced zero content diff (only a line-ending warning), confirming this feature changed no route or response shape
- [X] T022 [P] **Not executed manually in this session** — steps 3–5 require live dev servers (`npm start` in `Backend/` and `frontend/`) and interactive browser/API checks, unavailable in this non-interactive environment. Every scenario quickstart.md step 3 and 4 describe (two-proScout create/read/report/media walkthrough, admin lens spot-check) is exercised at the HTTP layer by T005–T019 via supertest — same assertions, automated instead of manual. Step 5 (frontend smoke check) genuinely not run: no new UI code exists for this feature, so this is a real gap if a human wants visual confirmation of graceful empty-state rendering — flagged, not silently skipped (matches the pattern already established for Stage 6/7's unrun manual checks).
- [X] T023 Added the "ملاحظة تنفيذية" implementation note to `docs/scout-pro-plan-v2.md`'s Stage 11 section, matching the established pattern for Stages 0–10 — documents the 726/33 final test result, the two off-plan files discovered broken (proScoutPlayersWrite.test.js, proScoutDashboard.test.js) and why the original call-site audit missed them (test fixtures, not production code), the one test whose mechanism was invalidated, T014's overlap with existing Stage 4d coverage, T022's real gap (no visual browser check), and the T001 branch discrepancy

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup. **Blocks all user stories** — T002/T003 are the only production-code change in this feature.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on US2/US3.
- **User Story 2 (Phase 4)**: Depends on Foundational only — independent of US1 (different test file: `adminProfessionalLens.test.js` vs. `proScoutCreatedByScope.test.js`). Can run in parallel with Phase 3.
- **User Story 3 (Phase 5)**: Depends on Foundational **and** on US1's T013 (same file, sequential edits — `proScoutCreatedByScope.test.js`). Cannot start until T013 is done.
- **Polish (Phase 6)**: Depends on all three user story phases being complete.

### Within Phase 3 (US1) and Phase 5 (US3)

T005–T013 and T016–T019 append to the same file (`proScoutCreatedByScope.test.js`) in sequence — each depends on the previous to avoid merge conflicts on one file. They are not parallelizable with each other.

### Parallel Opportunities

- T002 and T003 (Foundational) — different files, no dependency on each other.
- Phase 3 (US1) and Phase 4 (US2) — different test files, both depend only on Foundational; a second contributor could pick up US2 while US1 is in progress.
- T021 and T022 (Polish) — independent verification steps, no shared file.

---

## Parallel Example: Foundational Phase

```bash
# T002 and T003 touch different files and have no dependency on each other:
Task: "Replace playerScopeFor's proScout branch in Backend/services/scope.js"
Task: "Simplify checkPlayerOwnership + playerInProScoutScope in Backend/middlewares/ownership.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) — trivial, no new dependencies.
2. Complete Phase 2 (Foundational) — T002 + T003 is the entire production-code change for this feature.
3. Complete Phase 3 (US1) — proves the core narrowing works, in both directions (own players intact, others' rejected), plus the FR-011/FR-006/FR-007 checks folded in.
4. **STOP and VALIDATE**: run US1's Independent Test. This is the MVP — it delivers the entire security fix motivating this stage (`docs/scout-pro-plan-v2.md`, "المرحلة 11").

### Incremental Delivery

1. Setup + Foundational → the scope change ships.
2. US1 → proves the change is correct and complete for the primary read/write surfaces.
3. US2 → proves admin is unaffected (safety net for the narrowing).
4. US3 → proves the authorship-vs-scope edge case resolves the way the owner decided.
5. Polish → whole-suite regression, spec/type regeneration confirmation, manual walkthrough, plan doc close-out note.

### Solo Implementer Strategy

Given the small footprint (2 production files, 1 new test file, 1 existing test file edited), this is realistically done in one pass: T001 → T002/T003 → T004 through T019 in order (they're mostly sequential by file anyway) → T020–T023. The phase split above exists for independent *verification* checkpoints, not because parallel staffing is expected to be necessary.
