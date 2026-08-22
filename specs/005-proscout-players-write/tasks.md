---
description: "Task list for proScout Players Page & Write Access (Stage 4)"
---

# Tasks: proScout Players Page & Write Access

**Input**: Design documents from `/specs/005-proscout-players-write/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/proscout-write-matrix.md](contracts/proscout-write-matrix.md)

**Tests**: **REQUIRED, not optional.** Constitution Principle VI mandates a positive *and* a
negative test for every permission, and Principle III requires regression tests proving existing
roles are byte-identical. Test tasks below are gates, not extras.

**Organization**: Grouped by user story. US1/US2 are largely *verification* of Stage 2 work
(research R1) — they still ship as real tasks because an unverified invariant is an unprotected one.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4 map to the user stories in [spec.md](spec.md)
- File paths are repo-relative

## Path Conventions

Three-project layout: `Backend/`, `frontend/`, `e2e/`. New backend tests go in
`Backend/tests/roles/`, matching Stages 1–3.

---

## ⚠️ The ordering rule that governs this whole stage

**A guard is completed before its gate is opened.** `checkReportOwnership` and
`checkMediaOwnership` currently contain placeholder branches that hard-deny proScout. Phase 2
turns them into real two-axis guards; only Phase 6 then adds proScout to `allowedTo` on those
routes. Reversing that order is the exact failure Stage 1 documented and Stage 2 avoided — it
would expose whole collections, not return zero rows.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the baseline this stage is measured against, and make the role assignable
so anything here can actually be exercised by a human.

- [X] T001 Capture the pre-change baseline: run `npm test` in `Backend/` and `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/`, and record the passing test counts (expected: 492 backend across 24 files, 84 frontend) in the PR description as the number this stage must not reduce
- [X] T002 [P] Replace the three hard-coded `<option>` literals at lines ~170-173 of `frontend/src/app/features/users/user-form/user-form.component.ts` with an `@for` over a module-level `const ROLE_OPTIONS: readonly UserRole[] = ['coach', 'admin', 'observer', 'proScout']`, plus a label map keyed by role. **Note the limitation honestly in a comment**: `UserRole` is a pure type alias (`user.model.ts:5` → `api.generated.ts`) with no runtime value, so this is **compile-time checked, not auto-derived** — the compiler rejects any role not in the generated union, but adding a role to `openapi.json` will not populate this list on its own. Same discipline as `NAV_ITEMS` in `sidebar.component.ts:22` (FR-017, research R13, Principle VII, analysis finding U1)
- [X] T003 [P] Add `COACHES.FORM.PRO_SCOUT` label to `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/ar.json` (both files — bilingual rule)
- [X] T004 Add a Karma test in `frontend/src/app/features/users/user-form/user-form.component.spec.ts` asserting the role select renders exactly four options including `proScout`, and that the previous three still render with unchanged values (FR-017)
- [X] T004a [P] Add `readonly isProScout = computed(() => this.currentUser()?.role === 'proScout');` to `frontend/src/app/core/auth/auth.service.ts` alongside the existing three role computeds at lines ~22-24 (research R9). *Moved here from Phase 2 during analysis (finding F4): Phase 3 depends on it, and it has no dependency on the guard work, so leaving it in the blocking phase made the stated MVP path uncompilable*

**Checkpoint**: An admin can create a proScout user through the UI. Manual validation of every
later phase is now possible.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Complete the two per-document guards and the create-path attribution rule. **No
`allowedTo` on any write route may be widened until this phase is done.**

**⚠️ CRITICAL**: Phases 5 and 6 are blocked on this phase. Phases 3 and 4 are not.

- [X] T005 Replace the placeholder proScout branch in `checkReportOwnership` in `Backend/middlewares/ownership.js` (lines ~97-100) with a real two-axis guard: author check (`report.coach` equals `req.user._id`, the same field coach and observer use) **AND** the report's player is inside `playerScopeFor(req)`. Keep `logScopeDenial({ req, resource: "scoutingReport", resourceId })` on every denial. Preserve the existing Arabic comment explaining why the branch was a placeholder, updating it to describe the guard now in place (research R6)
- [X] T006 Replace the placeholder proScout branch in `checkMediaOwnership` in `Backend/middlewares/ownership.js` (lines ~132-135) with a three-condition guard: `media.uploadedBy` equals `req.user._id`, `media.player` equals `req.params.playerId`, **AND** the media's player is inside `playerScopeFor(req)`. Keep the denial logging and preserve the C-2 comment (research R6)
- [X] T007 In both T005 and T006, resolve the player-in-scope check by reusing the request-cached `professionalTeamIds(req)` and comparing in memory — the same technique `checkPlayerOwnership` uses at lines ~55-66 — rather than issuing a second `Player.exists()` round-trip per request
- [X] T008 ⚠️ In `Backend/controllers/playerController.js` `create` (lines ~36-42), write the coach assignment as `if (req.user.role === ROLES.COACH) req.body.coach = req.user._id; else delete req.body.coach;`. **`delete` is mandatory — "simply don't set it" is exploitable.** `playerRouter` is mounted a second time at `/users/:id/players` (`userRouter.js:482`), where `setUserIdToBody` copies the URL's **user id** into `req.body.coach`; today only `create`'s unconditional overwrite neutralises it. Use `else`, not `else if (proScout)`, so a future fifth role inherits the safe branch (Principle II). `req.body.createdBy = req.user._id` stays unconditional. Add an Arabic comment recording both the reason (a proScout is not a coach; `assignPlayerCoach` accepts only coach-role users) and the double-mount trap — FR-016, research R5 + **R14**, invariant I-1
- [X] T008a [P] Add a test asserting `POST /api/v1/users/<a real coach id>/players` as a proScout returns 201 with `coach` **unset** — exercising the **nested** mount specifically. A test that only hits `POST /api/v1/players` cannot catch the R14 escalation (research R14)
- [X] T009 Verify no consumer dereferences `player.coach` unguarded on the create path: read through `emitCoachDashboardUpdate` call sites in `Backend/controllers/playerController.js`, `Backend/socket/handlers/dailySummary.js`, and the coach dashboard aggregations in `Backend/controllers/dashboardController.js`. Add null guards only where genuinely missing; record findings in the PR (research R5 follow-up)
- [X] T010 In `Backend/utils/validation/playerValidation.js`, make `teamExistsInScope` call `logScopeDenial({ req, resource: "team", resourceId: val })` when the team **exists but falls outside** the caller's scope — distinguishing that case from a genuinely unknown id *for the log only*. The HTTP response MUST stay byte-identical in both cases (research R4 anti-oracle); the distinction is server-side evidence, never observable by the client. Constitution Principle IV: "كل محاولة وصول مرفوضة MUST تُسجَّل" (analysis finding D2)
- [X] T011 [P] Add a unit test in `Backend/tests/roles/proScoutPlayersWrite.test.js` calling `checkReportOwnership` and `checkMediaOwnership` directly (the pattern used in `proScoutDataScope.test.js`) to prove both axes are load-bearing: a report/media the proScout authored on a player that is **no longer** in scope must be denied, and denial must call `logScopeDenial` exactly once
- [X] T011a [P] Add a test asserting T010's logging: an out-of-scope team id on `POST /players` calls `logScopeDenial` once, an unknown team id does **not**, and both return an identical HTTP status and body (finding D2 + research R4)

**Checkpoint**: Guards are real. Gates may now be opened.

---

## Phase 3: User Story 1 - Browse scoped players list (Priority: P1) 🎯 MVP

**Goal**: proScout sees a flat, correctly scoped players list with no age-group filter, column, or
tab — and the page stops requesting age-group data entirely.

**Independent Test**: Sign in as proScout with a known mix of professional-league, premier-league,
own team-less and other-user team-less players; the list shows exactly the expected set, renders no
age-group grid, and issues no `/ages` request. A coach signed into the same page still sees the grid.

### Tests for User Story 1

- [X] T012 [P] [US1] In `Backend/tests/roles/proScoutPlayersWrite.test.js`, assert `GET /players` for a proScout returns exactly the professional-league players plus its own `team: null` players, with `count` equal to a hand-computed number — and that a premier-league player and another user's team-less player are both absent (FR-001, US1.1)
- [X] T013 [P] [US1] Assert search (`?keyword=`), sort (`?sort=`) and pagination (`?page=2&limit=1`) stay inside scope across pages, and that `?ageGroup=<a premier-league group id>` and `?team=<premier team id>` do **not** widen the result (FR-004, US1.4, Principle VI mandatory cases)
- [X] T014 [P] [US1] Assert `GET /players/counts` and `GET /players/reports/average-ratings` for a proScout equal hand-computed values over in-scope players only (FR-005, US1.5)
- [X] T015 [P] [US1] In `frontend/src/app/features/players/player-list/player-list.component.spec.ts`, assert that for a proScout the age-group card grid does not render, `flatView()` is true, and **no HTTP request to `/ages` is issued**; and that for a coach and an admin the grid still renders and `/ages` is still requested (FR-002, FR-014, US1.2, US1.3)

### Implementation for User Story 1

- [X] T016 [US1] Add `|| this.auth.isProScout()` to `skipGroupsView()` in `frontend/src/app/features/players/player-list/player-list.component.ts` (line ~628), with a comment naming the reason — a proScout has no age-group dimension, exactly like an observer viewing their own players (FR-002, research R10)
- [X] T017 [US1] Early-return from `loadGroups()` in the same file (line ~652) when `auth.isProScout()`, setting `loadingGroups` false so the flat list renders without waiting. Comment must state this is an **intent fix, not access control** — `/ages` has no `protect` at all and remains open to everyone (research R10 consequence 1, R12)
- [X] T018 [US1] Widen the "Add player" button gate at line ~34 from `auth.isCoach()` to also allow proScout, and the `[actionLabel]` empty-state gate at line ~295 likewise, so the role that may now create players can reach the form (FR-007 UI surface)
- [X] T019 [US1] Confirm by test, not inspection, that `load()` (line ~713) sends no `ageGroup` query param in flat view for proScout — assert on the request URL rather than trusting that both source values are empty (research R10 consequence 2)

**Checkpoint**: US1 fully functional and independently testable.

---

## Phase 4: User Story 2 - View player detail without age-group data (Priority: P1)

**Goal**: proScout opens an in-scope player and sees masked observation data; out-of-scope ids are
refused.

**Independent Test**: `GET /players/:id` on an in-scope player returns 200 with `observers` absent
and `observed` reported as `pending`; the same call on a premier-league player returns 403.

### Tests for User Story 2

- [X] T020 [P] [US2] Assert `GET /players/:id` for an in-scope player returns 200, with `observers` absent from the body and a player whose stored `status` is `observed` reported as `pending` (FR-006, US2.1, US2.2)
- [X] T021 [P] [US2] Assert `GET /players/:id` for a premier-league player and for another user's team-less player both return **403** — explicitly asserting the status code, never a 200 with an empty body (US2.3, Principle I)
- [X] T022 [P] [US2] Assert `?status=observed` is dropped rather than executed for a proScout, and that `?status=pending` returns both `pending` and `observed` players — matching the coach behavior at `playerController.js:204-213` (FR-006)
- [X] T023 [P] [US2] Assert `?coach=`, `?observer=` and `?observers=` (the admin-only lenses) are stripped for a proScout, so neither can be used as an oracle (FR-006, existing `PLAYER_ADMIN_ONLY_LENSES` behavior)

### Implementation for User Story 2

- [X] T024 [US2] Confirm by reading `frontend/src/app/features/players/player-detail/player-detail.component.ts` that no age-group section exists to hide, and record that finding as a one-line comment in the component or the PR rather than adding a dead conditional (FR-003 — the requirement is satisfied by construction; do not add code to satisfy it cosmetically)

**Checkpoint**: US1 and US2 both work independently. The read half is now *proven*, not assumed.

---

## Phase 5: User Story 3 - Create and edit players within scope (Priority: P2)

**Goal**: proScout creates and edits players, attributed via `createdBy`, restricted to
professional-league teams.

**Blocked by**: Phase 2 (T008 must land before `POST /players` opens).

**Independent Test**: Create a player on a professional team → 201 with `createdBy` set and `coach`
unset; create one on a premier team → rejected identically to an unknown team id; edit an
out-of-scope player → 403.

### Tests for User Story 3

- [X] T025 [P] [US3] Assert `POST /players` as proScout returns 201, `createdBy` equals the caller, and **`coach` is unset** (FR-016, invariant I-1, US3.1)
- [X] T026 [P] [US3] Assert `POST /players` with a `team` in a non-professional league is rejected with **400** and a message byte-identical to the one returned for a syntactically valid but nonexistent team id — the two cases must be indistinguishable (FR-008, US3.2, research R4)
- [X] T027 [P] [US3] Assert `PATCH /players/:id` succeeds on an in-scope player and returns **403** on a premier-league player and on another user's team-less player (US3.3, US3.4)
- [X] T028 [P] [US3] Assert `PATCH /players/:id` reassigning `team` to a non-professional team is rejected on the same terms as T026 (FR-008, US3.5)
- [X] T029 [P] [US3] Assert a client-supplied `createdBy` in the body of both `POST /players` and `PATCH /players/:id` is rejected with 400 by `lockField("createdBy")` (invariant I-2)
- [X] T030 [P] [US3] Assert `PATCH /players/:id/observers` returns **403** for a proScout on an in-scope player — scope does not grant it (FR-013, US3.6)
- [X] T031 [P] [US3] Assert a proScout creating a player with a birth year outside 2007–2019 receives the same 400 every other role receives (invariant I-4)
- [X] T032 [P] [US3] Assert invariant I-3: a player with `teamName` free text, `team: null` and a different `createdBy` is absent from the proScout's list and returns 403 by direct id. This **documents** the registered tech-debt behavior; it does not fix it

### Implementation for User Story 3

- [X] T033 [US3] Add `ROLES.PRO_SCOUT` to `allowedTo` on `POST /players` and `PATCH /players/:id` in `Backend/routes/playerRouter.js` (lines ~487 and ~496). `checkPlayerOwnership` is already in the PATCH chain and already has a correct proScout branch; `teamExistsInScope` is already in both validators (contract §1)
- [X] T034 [US3] Verify `setUserIdToBody` (`playerController.js:27-31`) is harmless on this path — it sets `req.body.coach = req.params.id`, which `create` then overwrites for coach and T008 leaves unset for proScout. Add a test asserting a proScout cannot smuggle a `coach` value through it

**Checkpoint**: proScout can create and edit players. US1–US3 all independently functional.

---

## Phase 6: User Story 4 - Write reports, media, and profile image within scope (Priority: P2)

**Goal**: proScout files reports, uploads and views media, and sets profile images — for in-scope
players only, matching the coach permission set exactly.

**Blocked by**: Phase 2 (T005, T006 must land before these gates open).

**Independent Test**: File a report on an in-scope player and read it back; attempt the same on an
out-of-scope player → 403; attempt report deletion and media download → 403.

### Tests for User Story 4

- [X] T035 [P] [US4] Assert `POST` and `PATCH` on `/players/:playerId/reports` succeed for a proScout on an in-scope player, and that `GET /reports` returns only reports it authored — matching the observer's existing narrowing (FR-010, FR-011a, US4.1, US4.2)
- [X] T036 [P] [US4] Assert `DELETE /players/:playerId/reports/:id` returns **403** for a proScout, including on a report it authored itself — deletion is admin-only for every non-admin role (FR-010, US4.2a, research R2)
- [X] T037 [P] [US4] Assert report `POST`/`PATCH`/`GET` on an out-of-scope player all return **403** (US4.3)
- [X] T038 [P] [US4] Assert `POST /players/:playerId/media` and `GET /players/:playerId/media` succeed on an in-scope player and return **403** on an out-of-scope one. Mock Bunny network calls per-file as the existing media tests do, keeping `bunnyConfig` real (FR-011, US4.4, US4.5)
- [X] T039 [P] [US4] Assert `GET /players/:playerId/media/:id/download` and `DELETE /media/:id` both return **403** for a proScout — both are admin-only under security item F7d (FR-011, US4.5a, research R3)
- [X] T040 [P] [US4] Assert `PATCH /players/:id/profileImg` succeeds on an in-scope player and returns **403** on an out-of-scope one (FR-012, US4.6, US4.7)
- [X] T041 [P] [US4] **Regression guard for T044**: assert `PATCH /players/:id/profileImg` behaves identically for a coach on their own player (200), a coach on another coach's player (403), and an admin on any player (200) — before and after the middleware insertion. This is the single highest Principle III risk in the stage (research R7)
- [X] T042 [P] [US4] Assert the "player left the league" edge case: a report authored by a proScout while its player was on a professional team becomes non-`PATCH`able once an admin moves that player to another league — proving the scope axis in T005 is load-bearing, not decorative

### Implementation for User Story 4

- [X] T043 [US4] Add `ROLES.PRO_SCOUT` to `allowedTo` on `GET /`, `GET /statistics`, `POST /`, `GET /:id` and `PATCH /:id` in `Backend/routes/scoutingReportRouter.js` (lines ~269, 275, 280, 281). **Leave `DELETE /:id` as `allowedTo(ROLES.ADMIN)`** and add a comment naming research R2 so a future reader does not "fix" the omission (contract §2)
- [X] T044 [US4] Add `ROLES.PRO_SCOUT` to `allowedTo` on `POST /video`, `GET /upload-eligibility`, `POST /video/:mediaId/upload-envelope`, `GET /`, `POST /` and `GET /:id` in `Backend/routes/playerMediaRouter.js`. **Leave `DELETE /:id`, `GET /:id/download` and `PATCH /:id/review` admin-only**, adding a comment naming F7d and research R3 (contract §3)
- [X] T045 [US4] Add `checkPlayerOwnership` to the `PATCH /players/:id/profileImg` chain in `Backend/routes/playerRouter.js` (line ~512) and add `ROLES.PRO_SCOUT` to its `allowedTo`. Place the middleware relative to `upload.single('profileImg')` so that T041's coach and admin assertions still pass; if ordering forces a choice, prefer the position that preserves existing error precedence (research R7)
- [X] T046 [US4] Leave the existing inline coach ownership check in `uploadProfileImg` (`playerController.js:537-543`) **in place and unchanged**. It is now redundant for coach, but removing it is a behavior change to an existing role outside this stage's scope (Principle III). Add a comment pointing at `checkPlayerOwnership` as the primary guard

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T047 Run `npm run dump-spec` in `Backend/` to regenerate `openapi.json` — this stage changes `allowedTo` on ~13 operations (Principle V, same PR)
- [X] T048 Run `npm run gen:types` in `frontend/` to regenerate `src/app/core/models/api.generated.ts`, and confirm `proScout` is still present in the `role` union (Principle V)
- [X] T049 [P] Apply the proScout Team-dropdown copy in `frontend/src/app/features/players/player-form/player-form.component.ts`: keep the silent age-group derivation in `ageGroupForDob()`/`syncTeamsForDob()`, keep the age-group narrowing of the team list (it is invisible and produces the correct set), but replace the three age-group-naming hints — `PLAYERS.FORM.TEAM_LOCKED`, `TEAM_HINT`, `TEAM_EMPTY` — with proScout variants that name the blocking condition without naming age groups (FR-002, research R11)
- [X] T050 [P] Add the new proScout hint keys to `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/ar.json` (both files)
- [X] T051 [P] Negative sweep in `Backend/tests/roles/proScoutPlayersWrite.test.js`: assert 403 for proScout on `DELETE /players/:id`, `PATCH /players/:id/status`, `PATCH /players/:id/coach`, and `PATCH /media/:id/review` — the adjacent admin-only routes this stage deliberately did not open ([contracts/endpoint-inventory.md](contracts/endpoint-inventory.md) §1, §3; Principle VI obligation 1)
- [X] T058 [P] Router-level denial sweep, satisfying Principle VI obligation 2 from [contracts/endpoint-inventory.md](contracts/endpoint-inventory.md): one parameterised test per domain this stage grants nothing in — `/users` (14 operations), `/coachEvaluations`, `/observerEvaluations`, `/dashboard` — asserting 403 for a proScout on a representative operation of each HTTP method. Written at router level, not per route, exactly as Principle VI item 4 prescribes, so any endpoint added to those routers later is denied by default and proven so
- [X] T052 [P] Carry forward the Stage-3 test documenting that `GET /ages` returns 200 both with and without a token, and confirm its comment still states that C-3 is **not** closed and that T017 did not close it (research R12)
- [X] T053 Run `npm test -- tests/isolation.test.js` in `Backend/` and confirm it passes **with zero edits to that file**. If it requires any edit, stop — that is a breaking change requiring documented security review, not a test fix (Principle III, non-negotiable)
- [X] T054 Run the full gate: `npm test` in `Backend/`, `npm run build` and `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/`, then Playwright in `e2e/`. Confirm the passing counts are **not lower** than the T001 baseline
- [ ] T055 Walk `quickstart.md` §4 end to end manually against a running stack, including the `/age-groups` direct-URL redirect and the premier-league-player 403
- [X] T056 Write the PR description's constraint ledger as the Governance section requires: which of the three layers were touched, and which of C-1…C-5 were addressed or relied upon (see `plan.md` Constitution Check)
- [X] T057 Append the Stage 4 execution note to `docs/scout-pro-plan-v2.md` under the Stage 4 block, following the format Stages 1–3 used: what was implemented, and every deviation from the stage text with its reason (the nine in `research.md`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately. Now also carries **T004a (`isProScout`)**, moved out of Phase 2 during analysis (finding F4) because Phase 3 needs it and it has no dependency on the guard work
- **Phase 2 (Foundational)**: blocks Phases 5 and 6. Does **not** block Phases 3 and 4
- **Phase 3 (US1)** and **Phase 4 (US2)**: depend only on **T004a** from Phase 1; their backend tasks are pure verification and can run at any time
- **Phase 5 (US3)**: requires T008 (create-path attribution, incl. the R14 `delete`) before T033 opens the gate
- **Phase 6 (US4)**: requires T005–T007 (real guards) before T043–T045 open the gates
- **Phase 7 (Polish)**: requires all route changes (T033, T043, T044, T045) before T047/T048 regenerate the spec

### The hard ordering rules

1. T005, T006, T007 **must** be merged before T043, T044 — guard before gate.
2. T008 **must** be merged before T033 — and T008 must use `delete`, not omission (R14). Opening
   `POST /players` to proScout without it is a privilege escalation, not a cosmetic gap.

Everything else in this stage tolerates reordering.

### Parallel Opportunities

- T002, T003 and T004a touch independent files — fully parallel
- All test tasks marked [P] within a phase touch either separate `describe` blocks in one new file or separate spec files; write them in parallel, but land T011/T011a's guard tests with Phase 2
- Phases 3 and 4 can proceed in parallel with Phase 2, since neither opens a gate
- T049, T050 and T058 are independent of every other backend task

---

## Parallel Example: Phase 6 tests

```bash
# All of these are independent assertions in Backend/tests/roles/proScoutPlayersWrite.test.js
Task: "T035 report POST/PATCH/GET positive path"
Task: "T036 report DELETE → 403"
Task: "T038 media POST/GET positive + out-of-scope 403"
Task: "T039 media download + delete → 403"
Task: "T041 profileImg coach/admin regression"
```

---

## Implementation Strategy

### MVP (US1 only)

1. Phase 1 (which now includes T004a `isProScout`) → Phase 3. Phase 2 is genuinely skippable here —
   US1 opens no gate and needs no guard
2. **Stop and validate**: proScout sees a flat, scoped, age-group-free players list
3. This alone is deployable — it changes no permission, only what one role fetches and renders

### Incremental delivery

1. Setup → US1 → validate → deploy (MVP)
2. US2 → validate → deploy (read half now *proven*)
3. Foundational (Phase 2) → US3 → validate → deploy (player writes)
4. US4 → validate → deploy (reports, media, images)
5. Polish → regenerate spec and types → full gate → merge

Phase 2 sits deliberately between steps 2 and 3 rather than at the front: nothing before it opens a
gate, and putting the guard work immediately before the writes that need it keeps the
guard-before-gate rule visible in the commit history.

---

## Notes

- New backend tests belong in `Backend/tests/roles/proScoutPlayersWrite.test.js`, following the
  structure of `proScoutDataScope.test.js`
- Build fixtures with `Backend/tests/helpers/factory.js` (`createProScout`, `createTeam`,
  `createPlayerDoc`, `seedAgeGroups`) — never inline `create` calls (Principle VI)
- Test files keep role names as **string literals** on purpose — an oracle independent of
  `constants/roles.js`, per the Stage-2 clarification decision
- Production code uses `ROLES.PRO_SCOUT` and `UserRole`; no new role string literals (Principle VII)
- Preserve every Arabic security comment adjacent to code you touch, and extend rather than replace
  the ones in `ownership.js` that describe why the placeholder branches existed
- Commit per task or logical group; stop at any checkpoint to validate a story independently
