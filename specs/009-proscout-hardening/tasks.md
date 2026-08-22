---

description: "Task list template for feature implementation"
---

# Tasks: proScout Hardening (Stage 7)

**Input**: Design documents from `specs/009-proscout-hardening/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: This stage's subject matter *is* tests and audit evidence — every user story below is itself a testing/verification deliverable per spec.md's Functional Requirements, so test tasks are not optional extras here; they are the stage's output.

**Organization**: Tasks are grouped by user story (spec.md priorities) to enable independent implementation and verification of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US7, matching spec.md)
- File paths are exact and repo-relative

## Path Conventions

Existing three-project monorepo (`Backend/`, `frontend/`, `e2e/`) per plan.md's Project Structure — no new top-level directories.

---

## Phase 1: Setup

**Purpose**: Prerequisites that unblock the inventory and E2E work, with no interdependency between them.

- [X] T001 Run `npm run dump-spec` in `Backend/` to refresh the repo-root `openapi.json` — required before Story 1's inventory can cross-reference it (FR-001)
- [X] T002 [P] Add `E2E_PROSCOUT_EMAIL` / `E2E_PROSCOUT_PASSWORD` entries (with the documented password-format caveat already present for `E2E_ADMIN_*`) to `e2e/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one shared artifact scaffold that Stories 1, 2, and 4 all read from or write into — must exist, with the agreed schema, before those stories' tasks begin.

**⚠️ CRITICAL**: T003 must be complete before any task in Phase 3 (US1) or Phase 5 (US4) starts.

- [X] T003 Create `specs/009-proscout-hardening/contracts/endpoint-inventory.md` scaffold: header, the FR-003 reconciliation section (stating the Stage 5 baseline of 83 operations and a placeholder for the delta list), and one empty `##` section per router file per `contracts/endpoint-inventory-schema.md`'s grouping (`ageGroupRouter.js`, `coachEvaluationRouter.js`, `observerEvaluationRouter.js`, `userRouter.js`, `authRouter.js`, `teamRouter.js`, `playerMediaRouter.js`, `scoutingReportRouter.js`, `playerRouter.js`, `dashboardRouter.js`, `seasonMatchRouter.js`) — done directly as the full populated document (T004-T013's content) in one pass rather than scaffold-then-fill, since all 11 router files were read together

**Checkpoint**: Inventory scaffold exists — Story 1's per-router population tasks and Story 4's row-count check both have a target file.

---

## Phase 3: User Story 1 - Complete Endpoint Disposition Inventory (Priority: P1) 🎯 MVP

**Goal**: A single document classifying every API operation's `proScout` disposition (Allowed/Scoped/Denied/Open), reconciled against the Stage 5 baseline, with zero unclassified rows.

**Independent Test**: Open `contracts/endpoint-inventory.md` after T012 and confirm every row has a non-empty `proScoutDisposition` cell and the reconciliation section lists every delta from the 83-operation Stage 5 baseline.

### Implementation for User Story 1

> All tasks below edit the same file (`contracts/endpoint-inventory.md`) section-by-section — not parallelizable against each other, but each is independently reviewable.

- [X] T004 [US1] Populate the `ageGroupRouter.js` section of `specs/009-proscout-hardening/contracts/endpoint-inventory.md`, including the `OPEN` / `C-3` rows for `GET /ages` and `GET /ages/:id` (proScout = 200, same as everyone) per FR-004
- [X] T005 [US1] Populate the `coachEvaluationRouter.js` section
- [X] T006 [US1] Populate the `observerEvaluationRouter.js` section
- [X] T007 [US1] Populate the `userRouter.js` section (list, detail, create, update, deactivate, restore, vault-password, vault media)
- [X] T008 [US1] Populate the `authRouter.js` section
- [X] T009 [US1] Populate the `teamRouter.js` section — `GET /teams`/`GET /teams/:id` are `SCOPED` for proScout (`teamScopeFor`/`checkTeamScope`, Stage 2), `ALLOW` for admin/coach/observer (C-3), not `OPEN`
- [X] T010 [US1] Populate the `playerMediaRouter.js` section
- [X] T011 [US1] Populate the `scoutingReportRouter.js` section
- [X] T012 [US1] Populate the `playerRouter.js`, `dashboardRouter.js`, and `seasonMatchRouter.js` sections, reconciling directly against the matching rows already documented in `specs/005-proscout-players-write/contracts/endpoint-inventory.md`
- [X] T013 [US1] Write the reconciliation section: total operation count found vs. 83, and the explicit list of `new`/`reclassified` operations since Stage 5 (depends on T004-T012) — found 92 vs. the baseline's stated 83; documented as a pre-existing discrepancy in the baseline's own row-sum, not force-reconciled
- [X] T014 [US1] Verify zero unclassified rows across the full document (SC-001) and record the total Denied-row count for Story 2 to cross-check against — 0 unclassified rows (92/92 have a disposition); Story 2's four domains sum to **35 DENY rows**: 1 (`POST /ages`) + 14 (`userRouter.js`) + 1 (`PATCH /players/:id/observers`) + 10 (`coachEvaluationRouter.js`) + 9 (`observerEvaluationRouter.js`)

**Checkpoint**: Inventory complete — Stories 2 and 4 can now build against a stable row count and disposition list.

---

## Phase 4: User Story 2 - Negative Access Proof for Restricted Domains (Priority: P1)

**Goal**: Automated, repeatable denial proof for every Denied route in the age-groups, users, observers, and evaluations domains, including scope-widening query-param attempts.

**Independent Test**: `npm test -- tests/roles/proScoutHardeningNegative.test.js` passes in isolation, and its number of "denied" assertions matches the Denied-row count T014 recorded for these four domains.

### Implementation for User Story 2

> All tasks below add to the same new file — sequential within the file, but the file itself has no dependency on Stories 1's document beyond T014's count for the final cross-check.

- [X] T015 [US2] Create `Backend/tests/roles/proScoutHardeningNegative.test.js` with age-groups domain negative tests (FR-005, FR-020): `POST /ages` (the one `protect`-bearing route in `ageGroupRouter.js`) denied with 403 for `proScout`, fixtures built via `Backend/tests/helpers/factory.js`
- [X] T016 [US2] Add the separate, clearly-labeled documentation test for `GET /ages` and `GET /ages/:id` (FR-006) — asserts 200 for a `proScout` token, for another role's token, and for no token at all (one flat fact, not a proScout-denied contrast), explicitly not treated as a pass/fail gate on the gap itself
- [X] T017 [US2] Add users-domain negative tests to the same file (FR-007): all 14 `userRouter.js` operations swept via `it.each` (same router-level-sweep convention Stage 5's inventory used)
- [X] T018 [US2] Add a negative test to the same file for `PATCH /players/:id/observers` (admin-only assignment endpoint — the only observer-specific route beyond the userRouter.js surface FR-007 already covers) (FR-008)
- [X] T019 [US2] Add `coachEvaluations` (10 ops) and `observerEvaluations` (9 ops) negative tests to the same file, via `it.each` (FR-009)
- [X] T020 [US2] Add scope-widening query-param negative tests (4 total, one per domain) to the same file, using `Backend/tests/helpers/factory.js` fixtures throughout (FR-011, FR-020)
- [X] T021 [US2] Run `npm test -- tests/roles/proScoutHardeningNegative.test.js`, confirm all pass, and cross-check the count of denial assertions against T014's recorded Denied-row count for these four domains (SC-002) — **41/41 tests pass**; 35 core denial assertions (1+14+1+10+9) match T014's recorded 35 DENY rows exactly, plus 2 GET-200-documentation tests and 4 query-widening tests

**Checkpoint**: All four restricted domains have automated, passing denial proof.

---

## Phase 5: User Story 4 - Deny-by-Default Guarantee, Correctly Scoped (Priority: P2)

**Goal**: Two honest, separately-passing guarantees per the R4 correction — `allowedTo(...)`'s own role-list behavior proven in isolation, and a route-count-vs-inventory-row-count parity check.

**Independent Test**: `npm test -- tests/roles/proScoutRouterGuard.test.js` passes; deliberately removing a row from the inventory (or adding an unlisted route in a scratch branch) makes the parity check fail.

### Implementation for User Story 4

- [X] T022 [US4] Create `Backend/tests/roles/proScoutRouterGuard.test.js` with a unit test calling `allowedTo(...)` directly (mock `req`/`res`/`next`) proving it denies a role not in its argument list and allows one that is (FR-012, Story 4 Scenarios 1-2)
- [X] T023 [US4] Add the route/inventory row-count parity test to the same file (FR-012): count operations across `Backend/routes/*.js` and compare to the row count in `specs/009-proscout-hardening/contracts/endpoint-inventory.md` (added `<!-- reconciliation-table -->` markers to the inventory doc so the delta table doesn't double-count rows)
- [X] T024 [US4] Run `npm test -- tests/roles/proScoutRouterGuard.test.js`, confirm both checks pass (SC-003) — **4/4 pass**, parity confirmed at 92 operations both sides

**Checkpoint**: The corrected deny-by-default guarantee is proven and honestly scoped.

---

## Phase 6: User Story 6 - Isolation Contract Extended, Not Modified (Priority: P1)

**Goal**: `tests/isolation.test.js` covers `proScout` scenarios via new blocks only; zero changes to any pre-existing assertion.

**Independent Test**: `git diff -- Backend/tests/isolation.test.js` shows only additions; the full file passes.

### Implementation for User Story 6

- [X] T025 [US6] Add new `describe(...)` block covering proScout cross-tenant player isolation (the B1-equivalent gap: two proScouts, orphan-player leak via query params) to `Backend/tests/isolation.test.js`, appended after existing blocks, using `Backend/tests/helpers/factory.js` fixtures (FR-017, FR-020) — reports/media/season-matches/teams isolation-via-query-param scenarios don't materially exist for proScout beyond what `proScoutDataScope.test.js` (Stage 2) already covers (their list endpoints don't expose additional client-injectable scope-widening params), so the addition is scoped to the one file this contract actually governs (`ApiFeature.filter()` on `GET /players`)
- [X] T026 [US6] Run `npm test -- tests/isolation.test.js`, then `git diff -- Backend/tests/isolation.test.js` and confirm the diff contains only added lines, zero modified/removed lines inside any pre-existing block (SC-004) — **19/19 pass** (15 pre-existing + 4 new), diff confirmed additions-only

**Checkpoint**: The NON-NEGOTIABLE isolation contract now covers `proScout` without risking the documented-security-review escalation.

---

## Phase 7: User Story 7 - Full Regression on Existing Roles (Priority: P1)

**Goal**: Proven count-and-content equality for `coach`/`observer`/`admin` across the five Principle-III endpoint families, plus both display masks.

**Independent Test**: `npm test -- tests/roles/proScoutFullRegression.test.js` passes with assertions computed from independently-seeded fixture expectations, not from the code path under test.

### Implementation for User Story 7

- [X] T027 [US7] Create `Backend/tests/roles/proScoutFullRegression.test.js` asserting result count AND content equality (against fixture-derived expected values, built via `Backend/tests/helpers/factory.js`) for `coach`, `observer`, `admin` on `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`, `GET /seasonMatches` (FR-018, FR-020)
- [X] T028 [US7] Add the same count/content regression assertions for `GET /dashboard/coach`, `GET /dashboard/observer`, `GET /dashboard/admin` to the same file (FR-018)
- [X] T029 [US7] Add `maskObservedForCoach` (coach) and `maskCoachForObserver` (observer) regression assertions to the same file (FR-019)
- [X] T030 [US7] Run `npm test` (full Backend suite) and confirm zero regressions across all of the above (SC-005) — **11/11 pass** in isolation; full-suite run deferred to T042 (final CI-parity gate) to avoid redundant ~10min runs mid-implementation

**Checkpoint**: Existing-role behavior is proven unchanged, satisfying Constitution Principle III's NON-NEGOTIABLE requirement.

---

## Phase 8: User Story 5 - Denial Logging Verification (Priority: P3)

**Goal**: Every denied `proScout` request — both role-gate and ownership-layer — is logged with the four Principle-IV-required fields, proven by automated assertion. This is this stage's one production code change (R1/R2).

**Independent Test**: `npm test -- tests/roles/proScoutDenialLogging.test.js` passes; the full regression suite (T030) still passes unchanged after this story's production edit, confirming the logging addition is response-invisible.

### Implementation for User Story 5

- [X] T031 [US5] Extend `Backend/utils/accessLog.js` with `logRoleDenial({ req, resource })`, sharing the internal writer (`writeDenialLog`) with the existing `logScopeDenial`, writing `event: "role_denied"` and deriving `resource` from `req.baseUrl` (stripped of `/api/v1`), per `contracts/denial-log-entry-schema.md`
- [X] T032 [US5] Wire `logRoleDenial` into `Backend/controllers/authController.js`'s `allowedTo()` rejection branch, called before `next(new AppError(...))`, with no change to the response status/body for any role
- [X] T033 [US5] Create `Backend/tests/roles/proScoutDenialLogging.test.js`, fixtures built via `Backend/tests/helpers/factory.js`: spy on `console.warn` (not the module — see `research.md` R7 for why) and assert exactly one matching log entry per denied request, through both the role gate and an `ownership.js` guard, with `userId`, `role`, `path`, and `resourceId` (null for collection routes) populated (FR-016, FR-020, SC-007) — **4/4 pass**
- [X] T034 [US5] Run `npm test -- tests/roles/proScoutDenialLogging.test.js`, then re-run the full Backend suite (including T030's regression file) to confirm the T031/T032 production change altered zero response bodies or status codes — **found and fixed a real regression** (see research.md R8): 30 pre-existing tests broke (500 instead of 403) because two Stage 4/5 files' `vi.mock('accessLog.js', ...)` factories didn't declare the new `logRoleDenial` export. Fixed both mocks (no assertions changed). Full suite re-run after the fix: **32 files, 702/702 tests pass**

**Checkpoint**: Denial logging is complete for both layers, and proven not to have changed any existing role's behavior.

---

## Phase 9: User Story 3 - End-to-End Denial Proof in the Browser (Priority: P2)

**Goal**: A real, running-application proof that a `proScout` session cannot see or reach the restricted screens, backed by both a UI redirect and an API-level 403.

**Independent Test**: `npx playwright test tests/proscout-hardening.spec.ts` passes against a live backend + built frontend.

### Implementation for User Story 3

- [X] T035 [US3] Extend `e2e/seed.js` to idempotently create a `proScout` account via the admin API, mirroring the existing coach-seeding pattern (R5)
- [X] T036 [US3] Add `loginAsProScout(page)` to `e2e/helpers/auth.ts`, mirroring `loginAsCoach` (R5)
- [X] T037 [US3] Create `e2e/tests/proscout-hardening.spec.ts`: assert the sidebar does not render Age Groups, Coaches (the "users" nav label per `en.json` NAV.COACHES), or Observers items for a logged-in `proScout` session (FR-013)
- [X] T038 [US3] Add direct-URL navigation scenarios to the same spec for `/age-groups`, `/users`, `/observers` — asserting redirect to the same URL the app itself landed proScout on right after login (captured dynamically via `page.url()`, not hardcoded — RoleLandingService can't be imported into a Playwright spec directly, so this achieves FR-014's "not hardcoded" requirement via self-consistency instead of a literal service import) (FR-014)
- [X] T039 [US3] Add underlying-API 403 assertions for each denial scenario in the same spec (`/users`, `/observers` — `/ages` is the documented C-3 exception, asserted as 200 not 403) (FR-015)
- [X] T040 [US3] Run `node seed.js` then `npx playwright test tests/proscout-hardening.spec.ts` against a live backend + built frontend, confirm pass (SC-006) — **RUN AND VERIFIED, 2/2 pass** against backend (`:8000`, dev `config.env`) + built/served frontend (`:4200`). Fixed along the way (all pre-existing gaps unrelated to this stage's own code): (1) `seed.js` had an early `return` after the coach "already exists" branch that skipped proScout creation entirely — fixed to fall through; (2) `e2e/.env` was missing `E2E_PROSCOUT_EMAIL`/`E2E_PROSCOUT_PASSWORD` — added; (3) the FR-014/015 test's per-path `waitForResponse` legitimately waits out its full 10s timeout when roleGuard redirects before the guarded route's component ever fires an API call (true for `/users`, `/observers`) — 3×10s exceeded the default 30s test timeout, so `test.setTimeout(60_000)` was added to that test. Also ran the full local e2e suite (`auth.spec.ts`, `players.spec.ts`, `reports.spec.ts`) as a sanity check per the user's request and found (and fixed) three pre-existing, unrelated stale-selector bugs from prior UI changes: `auth.spec.ts`'s `waitForURL('**/auth/login')` didn't account for the guard's `?returnUrl=` query param; `players.spec.ts` still targeted a removed native `<input type="date">` and free-text nationality/city inputs (the form now uses day/month/year `<select>`s and a country/governorate `<select>` pair) and the players list is now a birth-year accordion; `reports.spec.ts` still targeted a removed match-date input and "Promote" button (matchDate is now server-derived) and sent `team` as a free-text string instead of `teamName` (the API requires `team` to be a real ObjectId). Also found and fixed a real concurrency bug in `playwright.config.ts`: `fullyParallel: false` only serializes tests within one file, so different spec files still ran on separate workers by default, and their concurrent logins as the same shared coach/proScout/admin accounts raced the backend's refresh-token rotation — added `workers: 1`. Full suite (8/8) confirmed green in one clean run.

**Checkpoint**: Denial is proven end-to-end in the browser, not just at the HTTP-test level.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final CI-parity gate and closing the loop on this stage's own documentation practice.

- [X] T041 [P] Run `npm run gen:types` in `frontend/` and confirm no diff to `api.generated.ts` (T001's `dump-spec` is expected to produce no route-shape change this stage, per plan.md's Constraints) — confirmed, zero diff on both `openapi.json` and `api.generated.ts`
- [X] T042 Run the full CI-parity gate per `quickstart.md` §6: `Backend` vitest (**32/32 files, 702/702 tests pass**), `frontend` build + karma (**166/166 pass, build succeeds**), `e2e` Playwright (**8/8 pass**, single clean run with `workers: 1`) — all three confirmed against a live backend (`:8000`) and served frontend (`:4200`)
- [X] T043 Walk `quickstart.md`'s Success Criteria checklist (SC-001 through SC-007) and confirm every row is verified — SC-001 (T014, 0 unclassified), SC-002 (T021, 41/41 incl. 35 denial matches), SC-003 (T024, 4/4), SC-004 (T026, 19/19 additions-only), SC-005 (T030, 11/11), SC-006 (T040, 2/2 live E2E pass), SC-007 (T034, 4/4) — all seven verified
- [X] T044 Add a Stage 7 "ملاحظة تنفيذية" section to `docs/scout-pro-plan-v2.md` documenting the R4 (deny-by-default correction), R1/R2/R8 (denial-logging: gap, design, and the mock-regression it caused), R5 (E2E fixture gap), and the FR-004/FR-008 spec corrections discovered during implementation, following the same pattern every prior stage used

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 can start immediately and run in parallel with each other.
- **Foundational (Phase 2)**: T003 depends on nothing but should follow T001 (so the scaffold's header can reference the freshly-dumped spec) — BLOCKS Phase 3 (US1) and, transitively, Phase 5 (US4).
- **User Stories (Phase 3-9)**: See per-story dependencies below — most are independent of each other.
- **Polish (Phase 10)**: Depends on all seven user stories being complete.

### User Story Dependencies

- **US1 (P1, Phase 3)**: Depends on Foundational (T003). No dependency on other stories. **Must complete before US4** (T023 reads its row count).
- **US2 (P1, Phase 4)**: Depends on Foundational only for its final cross-check (T021 references T014's count) — the tests themselves (T015-T020) can be written in parallel with US1.
- **US4 (P2, Phase 5)**: Depends on US1 (T013/T014 must be done before T023).
- **US6 (P1, Phase 6)**: Independent of every other story — can run any time after Setup.
- **US7 (P1, Phase 7)**: Independent of every other story — can run any time after Setup.
- **US5 (P3, Phase 8)**: Independent of every other story, but T034 re-runs T030's regression file, so US7 (Phase 7) should complete first for that final check to mean something.
- **US3 (P2, Phase 9)**: Independent of every other story; heaviest prerequisite (live backend + built frontend), typically done last in a single working session.

### Parallel Opportunities

- T001 and T002 (Setup) in parallel.
- Once T003 (Foundational) is done: US1 (Phase 3), US2 (Phase 4, minus its final cross-check), US6 (Phase 6), US7 (Phase 7), and US5 (Phase 8) can all proceed in parallel if staffed — they touch disjoint files.
- US4 (Phase 5) can only start once US1's T013/T014 are done.
- US3 (Phase 9) can be developed in parallel with everything else but its final run (T040) is easiest done alone, last, against a clean live-server environment.

---

## Parallel Example: Setup + early Foundational

```bash
# Launch Setup tasks together:
Task: "Run npm run dump-spec in Backend/"
Task: "Add E2E_PROSCOUT_EMAIL / E2E_PROSCOUT_PASSWORD to e2e/.env.example"

# Then, once T003's scaffold exists, these can proceed in parallel:
Task: "Populate ageGroupRouter.js section of the inventory (US1)"
Task: "Create proScoutHardeningNegative.test.js with age-groups negative tests (US2)"
Task: "Add new describe('proScout', ...) block to isolation.test.js (US6)"
Task: "Create proScoutFullRegression.test.js (US7)"
Task: "Extend accessLog.js with logRoleDenial (US5)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational).
2. Complete Phase 3 (US1) — the endpoint inventory.
3. **STOP and VALIDATE**: T014 confirms zero unclassified rows. This alone already satisfies SC-001 and is the evidence every later story cross-checks against.

### Incremental Delivery

1. Setup + Foundational → inventory scaffold ready.
2. US1 → inventory complete (MVP evidence artifact).
3. US2, US6, US7 → the three P1 hardening deliverables, in any order or in parallel — each independently closes a Constitution obligation (VI, III-isolation, III-regression respectively).
4. US4 → deny-by-default guarantee, once US1's row count is stable.
5. US5 → denial logging, the stage's one production change, validated against US7's regression file.
6. US3 → E2E proof, typically last given its live-server prerequisite.
7. Polish → CI-parity gate and the Stage 7 plan-doc note.

### Suggested Session Grouping

Given this is a single-reviewer hardening stage (per `docs/scout-pro-plan-v2.md`'s "conversation جديدة لكل مرحلة" convention) rather than a multi-developer sprint, a reasonable sequential order is: **Phase 1 → 2 → 3 (US1) → 4 (US2) → 6 (US6) → 7 (US7) → 5 (US5) → 5 (US4) → 9 (US3) → 10 (Polish)** — front-loading the P1 stories that don't depend on live servers, saving the heaviest (E2E) for last.

---

## Notes

- [P] tasks touch different files with no dependency on an incomplete task; tasks without [P] either share a file with a preceding task in the same phase or have an explicit cross-phase dependency called out above.
- [Story] label maps every Phase 3-9 task to its spec.md user story for traceability.
- This stage's "tests" (US2, US4, US6, US7, US5's test file) are the deliverable, not a TDD scaffold for separate production code — the only production code in the entire stage is T031/T032 (US5's logging wire-up).
- Commit after each phase's checkpoint, not after every individual task — each checkpoint is independently reviewable and matches one Constitution obligation.
- Re-run `npm test` (full Backend suite) after T032's production change specifically, even though T034 already covers it, since it is the one place in this stage where a mistake could silently change behavior for an existing role.
