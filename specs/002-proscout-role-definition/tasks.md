---

description: "Task list for Stage 1 — ProScout Role Definition"
---

# Tasks: ProScout Role Definition

**Input**: Design documents from `/specs/002-proscout-role-definition/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/role-contract.md](./contracts/role-contract.md), [quickstart.md](./quickstart.md)

**Tests**: Included — Constitution Principle VI requires a positive and a negative test per permission, and this stage's entire deliverable is a proven-empty permission set.

**Organization**: Tasks are grouped by the three P1 user stories in spec.md. All three are P1 because they are sequential facets of one indivisible outcome (a role that exists, can log in, and sees nothing) — spec.md's own priority ordering (US1 → US2 → US3) is preserved as the build order below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 (admin can assign the role), US2 (role can log in), US3 (role sees nothing)

## Path Conventions

Web app split per plan.md: `Backend/` (Express/Mongoose/vitest), `frontend/` (Angular), repo-root `openapi.json`.

---

## Phase 1: Setup

**Purpose**: Confirm the working branch and baseline are correct before any change.

- [X] T001 Confirm current branch is `002-proscout-role-definition` and `Backend/tests` all pass on the unmodified baseline (`cd Backend && npm test`), establishing the pre-change regression snapshot referenced by Constitution Principle III.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single change every user story depends on — `proScout` must exist as a recognized role value before login, admin-assignment, or deny-by-default behavior can be exercised at all.

**⚠️ CRITICAL**: No user story task can be verified until this phase is complete.

- [X] T002 Add `PRO_SCOUT: 'proScout'` to the `ROLES` object (and confirm it flows into `ROLE_VALUES`) in `Backend/constants/roles.js`, following the existing `ADMIN`/`COACH`/`OBSERVER` pattern and the file's own header comment on being the single source of truth.
- [X] T003 Verify (read-only, no edit expected) that `Backend/models/userModel.js`'s `role.enum` and `Backend/utils/validation/userValidation.js`'s `isIn(ROLE_VALUES)` checks pick up `proScout` automatically via their existing import of `ROLE_VALUES` — per research.md's confirmed finding. If either file is found to hardcode role literals instead of importing the constant, fix it here (that would be a Stage-0 regression, not new Stage-1 scope).

**Checkpoint**: `proScout` is now a valid `role` value everywhere the shared constant is consumed. User story work can begin.

---

## Phase 3: User Story 1 - Admin assigns the ProScout role (Priority: P1)

**Goal**: An admin can create/update a user with `role: "proScout"` through the existing user-management flow, with no new UI or endpoint.

**Independent Test**: Admin creates a user with `role: "proScout"` via `POST /api/v1/users`; the created document has `role: "proScout"`; an invalid role string is still rejected with the existing validation error.

### Tests for User Story 1

- [X] T004 [P] [US1] Added to `Backend/tests/users.test.js` (not a new file — resolved the T004/T007 file-ownership ambiguity flagged by `/speckit-analyze` finding I1 by keeping T004 in the existing file and letting T007 own the new one).
- [X] T005 [P] [US1] Already covered by the existing `users.test.js` invalid-role test — which itself had to be fixed as part of this stage: it originally used `role: 'proScout'` as its "invalid role" example (a Stage-0 test written before this role existed), so it would have broken the moment `proScout` became valid. Changed its example to `'notARealRole'` to keep testing the same validation behavior.

### Implementation for User Story 1

- [X] T006 [US1] Run the new tests from T004/T005 against the change from T002/T003 and confirm both pass with no controller or route change required — `services/services.js`'s generic `creating` factory and existing validation chain already handle any value in `ROLE_VALUES`, so this story should require zero new backend logic beyond the constant.

**Checkpoint**: Admin-assignable `proScout` role is proven end-to-end via API test, independent of login or scoping behavior.

---

## Phase 4: User Story 2 - ProScout user can log in (Priority: P1)

**Goal**: A `proScout` user authenticates through the standard login flow and receives a valid access token and refresh cookie, identically to any other role.

**Independent Test**: Seed a `proScout` user, call `POST /api/v1/auth/login` with valid credentials, and confirm a valid access token + refresh cookie are issued.

### Tests for User Story 2

- [X] T007 [P] [US2] Create `Backend/tests/roles/proScoutRoleDefinition.test.js` (new file, per plan.md's Project Structure) with a `beforeEach`-seeded `proScout` user (via `tests/helpers/factory.js`, extended if it doesn't yet support arbitrary roles — see T008) and a test asserting `POST /api/v1/auth/login` with that user's valid credentials returns `200` with a valid access token and sets the `refreshToken` cookie.
- [X] T008 [US2] Added a dedicated `createProScout()` function to `factory.js`, matching the existing `createCoach`/`createObserver` pattern (own function per role, role passed as a literal string) rather than a generic parametrized helper — kept consistent with the file's established style. Initially imported `ROLES` from `constants/roles.js` here, then reverted: the constant's own header comment states `Backend/tests/**` is deliberately excluded from importing it, to keep test files an independent oracle from the constant they're validating (`/speckit-clarify` Q1 decision).
- [X] T009 [P] [US2] In the same test file, assert that the issued token is accepted by `protect` middleware on a subsequent authenticated request (e.g. hitting any route and confirming the response is not a `401`) — proving authentication succeeds even though authorization will deny access (covered in US3).

### Implementation for User Story 2

- [X] T010 [US2] Run T007–T009 against the Phase 2 change and confirm all pass with zero changes to `controllers/authController.js` — login and `protect` are role-agnostic by design, so this story should require no new backend code.

**Checkpoint**: `proScout` login is proven end-to-end via API test, independent of what the role can subsequently access.

---

## Phase 5: User Story 3 - ProScout sees no data anywhere (Priority: P1)

**Goal**: Prove, with real HTTP responses (Constitution Principle I), that a logged-in `proScout` user gets zero data access anywhere in the system today — list endpoints return empty, role-gated routes return 403, and the frontend routes to `/unauthorized`.

**Independent Test**: As a logged-in `proScout` user, call `GET /players` (expect `200` + empty array), call a handful of representative `allowedTo(...)`-gated routes that exclude `proScout` (expect `403` each), and confirm frontend login routes to `/unauthorized`.

### Tests for User Story 3

- [X] T011 [P] [US3] `GET /players` allowedTo list extended to include `PRO_SCOUT` (`Backend/routes/playerRouter.js`) — this was the one route change this stage needed; it's the only one of the four candidate list endpoints that runs through the central `ApiFeature`/`ownerFields` layer, so adding it here is safe (deny-by-default `MATCH_NOTHING` still applies since `proScout` was never added to `ownerFields`).
- [X] T012 [P] [US3] **Deviated from the original task description during implementation.** Discovered while writing these tests that `/players/counts`, `/players/reports/average-ratings`, and `GET /seasonMatches` do NOT go through the central scope layer — they use ad-hoc per-role `if/else` branches in their controllers that fall through to an *unfiltered* query (`{}` = all documents) for any role not explicitly branched on. Adding `proScout` to their `allowedTo` lists (as originally planned) would have leaked all season-match/player-count data, not returned empty. Left all three at `403` instead (unchanged `allowedTo`) and wrote tests asserting `403`, not empty-array. Documented in `docs/scout-pro-plan-v2.md` and `contracts/role-contract.md` remains accurate since it never claimed C3-style empty behavior for these three.
- [X] T013 [P] [US3] All three examples covered as planned, plus the `/players/counts` and `/players/reports/average-ratings` 403s folded in here as part of the T012 correction.
- [X] T014 [P] [US3] Add a test asserting `GET /api/v1/teams` as a `proScout` user returns `200` with the full team list (not `403`, not scoped) — this documents the accepted, pre-existing exception (contract C6, Constitution C-3) rather than treating it as a bug to fix in this stage.
- [X] T015 [US3] Run `Backend/tests/isolation.test.js` in full and confirm it passes unmodified — the binding proof that `admin`/`coach`/`observer` behavior (count and content of every listed endpoint) is unaffected by this stage (Constitution Principle III).

### Implementation for User Story 3

- [X] T016 [US3] All pass. One route allowlist change was needed (`GET /players`, see T011) — the "zero route changes" assumption in the original task text was corrected mid-implementation (see T012); no new scope/filtering logic was written anywhere, which was the actual invariant that mattered.
- [X] T017 [US3] Regenerate the API contract: `cd Backend && npm run dump-spec`, then `cd ../frontend && npm run gen:types`. Confirm `openapi.json` and `frontend/src/app/core/models/api.generated.ts` now include `proScout` in the `UserRole` type (Constitution Principle V, spec FR-007).
- [X] T018 [P] [US3] Verified via an added unit test in `role-landing.service.spec.ts` (`landingFor('proScout') → ['/unauthorized']`) rather than a manual browser session — equivalent proof, and it's now a permanent regression test instead of a one-time manual check. No frontend code change was needed, confirming research.md's finding.
- [X] T019 [US3] Update `docs/scout-pro-plan-v2.md`'s Stage 1 section (or add a short note) recording that `GET /teams` remains open to `proScout` as a documented, accepted exception to be closed in Stage 2 — satisfying spec FR-009's requirement that this gap be explicitly tracked, not silently left implicit.

**Checkpoint**: All three user stories are independently proven. `proScout` exists, can log in, and is provably locked out of every data surface except the one already-documented exception.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final consistency pass before merge.

- [X] T020 Full Backend suite: **446 tests passed, 23 test files, 0 failed.** `isolation.test.js` diff is empty (confirmed via `git diff --stat`).
- [X] T021 Frontend build: clean (only pre-existing bundle-budget warnings, unrelated to this change). Karma: **84/84 passed**, including the new `proScout` case in `role-landing.service.spec.ts`.
- [X] T022 Diff reviewed. **No `ownerFields` map, no `ownership.js` branch gained a `proScout` entry — that invariant held.** One `allowedTo(...)` list *did* change (`GET /players`, see T011/T012) — a deliberate, reviewed deviation from the original "zero route changes" assumption, not an accidental scope leak; the three other candidate routes were deliberately left untouched specifically to avoid a leak. Full changed-file list: `Backend/constants/roles.js`, `Backend/routes/playerRouter.js`, `Backend/tests/helpers/factory.js`, `Backend/tests/users.test.js`, `Backend/tests/roles/proScoutRoleDefinition.test.js` (new), `docs/scout-pro-plan-v2.md`, `openapi.json`, `frontend/src/app/core/models/api.generated.ts`, `frontend/src/app/core/services/role-landing.service.spec.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories (nothing can be tested until `proScout` is a valid role value).
- **User Stories (Phase 3–5)**: All depend on Phase 2. US1, US2, US3 are independently testable once Phase 2 lands but are listed in spec priority order (US1 → US2 → US3) since that mirrors the stage's own narrative (assign → login → prove nothing else works) and T007's shared fixture file is naturally built once, in US2, and reused by US3.
- **Polish (Phase 6)**: Depends on Phases 3–5 all being complete.

### Within Each User Story

- Tests are written before their implementation/verification task, and MUST fail before Phase 2 lands (there is no `proScout` role to test against) and pass after.
- US3 depends on the fixture-building work done in US2 (T008) — noted as the one intentional cross-story reuse, kept to a single shared factory extension rather than duplicated fixtures.

### Parallel Opportunities

- T004 and T005 (US1 tests) can run in parallel — different assertions, same describe block but independent.
- T011, T012, T013, T014 (US3 tests) can run in parallel once T007–T009's fixture setup exists.
- T018 (frontend manual check) can run in parallel with any Backend-only task in Phase 5 once T002 has landed.

---

## Parallel Example: User Story 3

```bash
# Once the proScout fixture exists (T007-T009), these can run/be written in parallel:
Task: "GET /players returns empty for proScout in Backend/tests/roles/proScoutRoleDefinition.test.js"
Task: "GET /players/counts, /players/reports/average-ratings, /seasonMatches return empty for proScout"
Task: "403 on allowedTo-gated routes excluding proScout (users, players write, reports write)"
Task: "GET /teams returns full list for proScout (documented exception)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

Technically all three stories together are the stage's minimum viable outcome — a role that exists but can't log in (US1 without US2) or that can log in but isn't proven locked down (US1+US2 without US3) is not a safe intermediate state to merge, per spec.md's own framing ("Every story here is P1 because none delivers value alone"). Treat Phases 3–5 as one atomic delivery for merge purposes, even though they are built and verified as separable increments during development.

### Incremental Delivery (within this one stage)

1. Complete Setup + Foundational → `proScout` exists as a role value.
2. Add US1 → prove admin can assign it.
3. Add US2 → prove it can log in.
4. Add US3 → prove it sees nothing; regenerate contracts; verify frontend.
5. Polish → full CI-equivalent run, diff review against the constitution.
6. Merge as a single PR (per plan.md's Independently Deployable Phases requirement — this whole stage is one deployable unit).

## Notes

- No task in this stage adds a new `ownerFields` entry, `allowedTo(...)` grant, or `ownership.js` branch for `proScout` — that absence is the feature. Any future task that seems to require one of those edits to make a test pass should be treated as a signal that the test itself is testing something out of Stage 1's scope (that's Stage 2 territory in `docs/scout-pro-plan-v2.md`).
- Commit after each phase checkpoint, not after every task — phases 3, 4, and 5 checkpoints are natural commit boundaries.
- `Backend/tests/isolation.test.js` MUST NOT be edited by any task in this stage (T015 only runs it).
