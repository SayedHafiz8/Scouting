---

description: "Task list for Pro Scout Matches & Attendance"
---

# Tasks: Pro Scout Matches & Attendance

**Input**: Design documents from `/specs/008-proscout-matches-attendance/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included — Constitution Principle VI requires a positive and negative test per new
permission, and this stage grants three (attend x2, status entry).

**Organization**: Tasks are grouped by user story from `spec.md`: US1 (Browse matches, P1), US2
(Attend + record result, P1), US3 (Landing/rejection consolidation, P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Web app: `Backend/` (Express) and `frontend/` (Angular), per `plan.md` Project Structure.

---

## Phase 1: Setup

**Purpose**: Confirm the ground this stage builds on is what research.md says it is — no code
changes in this phase.

- [X] T001 Run `cd Backend && npm test -- tests/roles/proScoutDataScope.test.js` and confirm it is
      green on the current branch, so the T042 edits in Phase 4 have a known-good starting point
      (`research.md R9`). — 58/58 passed.
- [X] T002 Run `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts' --include='**/role.guard.spec.ts' --include='**/role-landing.service.spec.ts'`
      and confirm all green, establishing the pre-change baseline for Phase 3's edits. — 30/30 passed.

**Checkpoint**: Baseline confirmed green. No production code touched yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the matches page reachable in the UI for a proScout, so US1 and US2 are testable
end-to-end through the app rather than only via direct API calls. Blocks the UI-facing parts of both
stories (their API-level backend tests do not depend on this phase).

- [X] T003 [P] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, add `'proScout'` to the
      `My Matches` nav item's `roles` array (currently `['coach', 'observer']`) —
      [contracts/frontend-navigation.md](./contracts/frontend-navigation.md).
- [X] T004 [P] In `frontend/src/app/app.routes.ts`, add `'proScout'` to the `/my-matches` route's
      `roleGuard([...])` array (currently `['coach', 'observer', 'admin']`) —
      [contracts/frontend-navigation.md](./contracts/frontend-navigation.md).
- [X] T005 In `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`, update the existing test
      `'proScout menu contains no age-groups, users, observers, or my-matches entry (FR-008, FR-015)'`
      (currently asserts `hrefs).not.toContain('/my-matches')`): split it so the proScout menu
      snapshot now asserts **4** items — `/dashboard`, `/players`, `/my-matches`, `/profile` — and the
      age-groups/users/observers exclusions remain asserted unchanged. Depends on: T003.
- [X] T006 In `specs/004-role-based-navigation/spec.md`, mark **DF-002** discharged, mirroring how
      DF-001 was marked discharged in Stage 5 — one line, pointing at this feature directory. Depends
      on: T003, T004.

**Checkpoint**: A proScout user can now open `/my-matches` in the running app (the page itself is not
yet role-aware — that lands in US1/US2).

---

## Phase 3: User Story 1 - Browse professional-league matches (Priority: P1) 🎯 MVP

**Goal**: A proScout sees only professional-league matches, with no age-group filter/column anywhere,
and cannot reach an out-of-scope match by direct ID.

**Independent Test**: Sign in as a seeded proScout with matches in both leagues; confirm the list
shows only professional-league matches, filters have no age-group option, and a premier-league
match's detail URL 403s.

### Tests for User Story 1

> Backend scoping for `GET /seasonMatches*` already exists (Stage 2/3, `research.md R1`) — these
> tasks are regression proof, not new production code.

- [X] T007 [P] [US1] Run `cd Backend && npm test -- tests/roles/proScoutDataScope.test.js -t "seasonMatch"`
      (or the equivalent describe blocks covering `GET /seasonMatches` scoping) and confirm they still
      pass unmodified — this is the FR-001 regression proof, not a new test file. — Ran describe
      `'proScout — season match scope (US2, FR-004, FR-006)'`, 5/5 passed, including scenario 19
      (attend on out-of-scope match refused — still 403 after this stage, now via
      `checkSeasonMatchScope` instead of the role gate, per `research.md R4`).
- [X] T008 [P] [US1] Create `frontend/src/app/features/season-matches/my-matches/my-matches.component.spec.ts`
      (no baseline exists — `research.md R7`) with the US1 slice: as proScout, no age-group `<th>`/`<td>`
      in the DOM, no league-toggle button group in the DOM, `selectedLeague()` initializes to
      `'professional'`, and `load()` is called with a league scoped to `'professional'`. As
      coach/observer/admin (regression), the age-group column and league toggle are still present —
      one assertion per role, so a future accidental broadening is caught here. — 4/8 red as
      expected (age-group hide, toggle hide, selectedLeague default, load() league param); the 4
      coach/observer/admin regression cases pass against the unmodified component.

### Implementation for User Story 1

- [X] T009 [US1] In `frontend/src/app/features/season-matches/my-matches/my-matches.component.ts`,
      wrap the age-group table header (`<th>...AGE_GROUP...</th>`, line ~82) and its cell
      (`<td>...ageGroupName(m.ageGroup)...</td>`, line ~107) in `@if (!auth.isProScout())` —
      [contracts/frontend-navigation.md](./contracts/frontend-navigation.md),
      [data-model.md I-4](./data-model.md) (field stays in the API response; only the template hides
      it). Depends on: T008 (test written first). — Also made the two expandable-row
      `[attr.colspan]` values role-aware (`columnCount()`, 4 for proScout vs 5 otherwise) since the
      hidden column would otherwise leave the hardcoded `colspan="5"` one column too wide.
- [X] T010 [US1] In the same file, change the `selectedLeague` signal's initial value
      (line ~303, `signal<SeasonMatchLeague>('premier')`) to be role-conditional: `'professional'` for
      `auth.isProScout()`, `'premier'` unchanged for every other role — `research.md R6`. Depends on:
      T008.
- [X] T011 [US1] In the same file, wrap the league-toggle button group (lines ~54-61) in
      `@if (!auth.isProScout())` — there is nothing to toggle for this role.
      [contracts/frontend-navigation.md](./contracts/frontend-navigation.md). Depends on: T008.
- [X] T012 [US1] Run T008's spec (`npx ng test --watch=false --browsers=ChromeHeadless --include='**/my-matches.component.spec.ts'`)
      and confirm green after T009-T011. Depends on: T009, T010, T011. — 8/8 passed.

**Checkpoint**: User Story 1 is fully functional and independently testable — a proScout can browse
their scoped matches with no age-group exposure, and every other role's view is provably unchanged.

---

## Phase 4: User Story 2 - Register attendance and record the result (Priority: P1)

**Goal**: A proScout can attend/unattend a professional-league match, and — as a registered attendee,
on the match's own day — enter its result, under the identical constraint coaches/observers already
have. Both are refused outside the professional league.

**Independent Test**: As proScout, attend a professional-league match, confirm it sticks; on match
day, enter a result and confirm it saves. Attempt both attend and status entry on a premier-league
match and confirm both are rejected.

### Tests for User Story 2

- [X] T013 [P] [US2] In `Backend/tests/roles/proScoutDataScope.test.js`, edit the `T042` describe
      block (lines 753-817, `research.md R9`):
      - Rename it (it stops being "unreachable over HTTP in this stage" once this feature's route
        changes land — reword to reflect the corrected, HTTP-reachable behavior).
      - Rewrite `'checkSeasonMatchAttendee: proScout is denied even when listed as an attendee
        (Stage 2 = read only)'` (line 796): `proMatch` (in-scope, is-attendee) must now be **granted**
        (`next` called with no argument), not 403.
      - Rewrite the final block of `'... the SCOPE check runs ...'` (lines 812-816): `proMatch` must
        now be **granted**, not "still denied but unlogged." The `premierMatch` scope-denial-and-log
        assertion (lines 804-810) is unchanged.
      - Add a new case: `proMatch`-league match where the scout is **not** in `attendees` — must be
        403, proving the attendee-membership leg independently of the scope leg (no existing case
        covers this — `research.md R9`).
      This task is written and expected to **fail** until T016 lands. — Confirmed red: 2 failed
      (grant cases), 2 passed (the new not-an-attendee case + the unchanged out-of-scope-logs case).
- [X] T014 [P] [US2] Create `Backend/tests/roles/proScoutMatchAttendance.test.js` with HTTP-level
      cases per [contracts/season-match-attend-status.md](./contracts/season-match-attend-status.md)
      G-1 through G-13, built with `tests/helpers/factory.js` (`createProScout`, `createTeam` with
      `{ league: ... }` overrides, direct `SeasonMatch.create` for fixtures, following the pattern in
      `proScoutDataScope.test.js` lines 774-793): `POST`/`DELETE /:id/attend` scoped grant/deny
      (G-1, G-2, G-6, G-7), day-window 400s carried over unchanged (G-3, G-4, G-8), and
      `PATCH /:id/status` grant only when in-scope + attendee + same day (G-9), with each of the three
      conditions individually violated (G-10, G-11, G-12). G-8 (unattend refused on/after match day)
      also stands in for spec.md's edge case "removes attendance then immediately tries to enter the
      result the same day" — that case never reaches the status endpoint at all, since the unattend
      call it depends on 400s first (`research.md R5`); no separate case is needed for it. This task
      is written and expected to **fail** until T017 lands. — Confirmed red: 8/12 failed exactly the
      cases gated on the not-yet-open route (G-1, G-3, G-4, G-6, G-8, G-9, G-10, and the postponed-
      status regression case); G-2/G-7/G-11/G-12 already passed since they expect 403 either way.
      Also discovered and fixed a `vi.useFakeTimers()` footgun: the bare form freezes **all** timers,
      not just `Date`, and hung the whole file (20s-per-test timeouts cascading once one test's fake
      state leaked past a hang) — switched every call to `vi.useFakeTimers({ toFake: ['Date'] })`,
      leaving real `setTimeout` for Express/Mongo's own internals. Not documented in research.md
      (discovered during implementation, not planning); noting it here for anyone extending this file.
- [X] T015 [P] [US2] In the same new file, add coach/observer regression cases: attend, unattend, and
      status entry behave byte-identically to their pre-stage behavior (same fixtures, same
      assertions as an existing coach/observer test if one exists, or freshly written against current
      documented behavior) — proves T016/T017 do not touch their code paths
      (`research.md R2, R4`; Constitution Principle III). — Adapted in place: `Backend/tests/
      seasonMatches.test.js` already carries a full existing coach/observer suite for exactly these
      three operations (`describe('POST/DELETE /api/v1/seasonMatches/:id/attend', ...)` and the
      `PATCH /:id/status` cases in the `GET/PATCH/DELETE /:id` describe block) — writing a second,
      duplicate set in the new file would violate the "don't duplicate what already exists" principle
      the task list itself follows elsewhere. This task is satisfied by re-running that existing file
      unmodified after T017 lands (done as part of T021), rather than adding new coach/observer cases.

### Implementation for User Story 2

- [X] T016 [US2] In `Backend/middlewares/ownership.js`, rewrite the `ROLES.PRO_SCOUT` branch of
      `checkSeasonMatchAttendee` (lines ~252-262): keep the existing `inScope` computation via
      `seasonMatchScopeFor` and its `logScopeDenial` call on scope failure, but stop unconditionally
      denying — add the attendee-membership check (same shape as the coach/observer branch two cases
      above, `.some((a) => a.toString() === req.user._id.toString())` against `match.attendees`), and
      grant (`return next()`) only when **both** `inScope` and attendee-membership hold; deny
      (same 403 message as the coach/observer branch) otherwise — [research.md R2](./research.md),
      [data-model.md I-1](./data-model.md). Depends on: T013, T014 (failing tests exist first).
- [X] T017 [US2] In `Backend/routes/seasonMatchRouter.js`:
      - Add `ROLES.PRO_SCOUT` to the `allowedTo(...)` list on `PATCH /:id/status` (line ~208, currently
        `COACH, OBSERVER, ADMIN`).
      - Add `ROLES.PRO_SCOUT` to the `allowedTo(...)` lists on `POST` and `DELETE /:id/attend`
        (lines ~212-213, currently `COACH, OBSERVER`).
      - Insert `checkSeasonMatchScope` into both attend routes' middleware chain, ahead of
        `attendMatch`/`unattendMatch` (currently no ownership guard runs on these routes at all —
        `research.md R4`). Import `checkSeasonMatchScope` from `../middlewares/ownership.js`
        (already exported, used elsewhere in this router file for `GET /:id`).
      - Update the three `@swagger` JSDoc blocks above these routes (`access` lines) to list
        `proScout`.
      [contracts/season-match-attend-status.md](./contracts/season-match-attend-status.md). Depends
      on: T016.
- [X] T018 [US2] Run `cd Backend && npm run dump-spec` and `cd ../frontend && npm run gen:types`
      (Constitution Principle V — required whenever a route's `allowedTo` shape changes). Depends on:
      T017. — `openapi.json` +9/-3, `api.generated.ts` +13/-3; small, contained diff.
- [X] T019 [US2] Run T013 and T014's suites and confirm green:
      `npm test -- tests/roles/proScoutDataScope.test.js` and
      `npm test -- tests/roles/proScoutMatchAttendance.test.js`. Depends on: T016, T017. — 71/71
      passed (both files run together).
- [X] T020 [US2] Run `npm test -- tests/isolation.test.js` and confirm it passes with **zero edits**
      (Constitution Principle III, non-negotiable). Depends on: T017. — 15/15 passed, file untouched.
- [X] T021 [US2] Run the full backend suite (`cd Backend && npm test`) to catch any other test that
      hardcoded the pre-stage `PATCH /status` / `/attend` 403-for-proScout behavior. Depends on: T017.
      — 638/638 passed across 28 files; no test anywhere else hardcoded the old refusal.
- [X] T022 [US2] In `frontend/src/app/features/season-matches/my-matches/my-matches.component.spec.ts`
      (from T008), add proScout cases for attendance and result entry: `toggleAttend()` on an in-scope
      upcoming match adds the caller to `attendees`; `canEnterResult()` returns `true` only on match
      day while attending, matching the existing (unedited) method under a proScout identity —
      `research.md R6`. Depends on: T008, T018.
- [X] T023 [US2] Run the updated `my-matches.component.spec.ts` and confirm green. Depends on: T022.
      — 11/11 passed.

**Checkpoint**: User Stories 1 AND 2 both work independently. A proScout can browse, attend, and
record results for professional-league matches only; every other role is provably unchanged.

---

## Phase 5: User Story 3 - Reliable navigation for every role, including on failure (Priority: P2)

**Goal**: One authoritative, hardcoded matrix test pins every role's login-landing and access-refusal
destination, so this stage's own nav change (and any future one) can't drift silently.

**Independent Test**: Run the consolidated spec; it independently verifies, for every role, both the
login-landing destination and the access-denied destination — including proScout's newly-added
`/my-matches` entry point.

### Tests for User Story 3

- [X] T024 [US3] Create `frontend/src/app/core/auth/role-landing-destinations.spec.ts` per
      [contracts/frontend-navigation.md](./contracts/frontend-navigation.md): a hardcoded
      `EXPECTED` matrix (one entry per `UserRole`: admin, coach, observer, proScout) asserting (a)
      `RoleLandingService.landingFor(role)` matches the expected login-landing route, and (b)
      `roleGuard(['__no_such_role__'])` under that role's identity redirects to the expected
      refusal destination — driving the real guard, not just reading the service. Include an
      unrecognized-role case (`undefined`, a garbage string) asserting `/unauthorized` on both axes.
      Depends on: Phase 2 (needs `RoleLandingService` and `roleGuard` as they stand after T003/T004,
      though neither is edited by this story). — 13/13 passed standalone.

### Implementation for User Story 3

- [X] T025 [US3] In `frontend/src/app/core/auth/role.guard.spec.ts`, rewrite the eleven hardcoded
      destination-string assertions (e.g. `expect(result.toString()).toBe('/dashboard/coach')`) to
      inject the real `RoleLandingService` and assert
      `result.toString()).toBe(roleLandingService.landingFor(role).join('/'))` instead — leave the
      `toBeTrue()`/`not.toBeTrue()` behavioral assertions unchanged
      ([contracts/frontend-navigation.md](./contracts/frontend-navigation.md), `research.md R8`).
      Depends on: T024 (matrix exists as the reference point for what "correct" means here). —
      Implemented via a local `expectedLandingFor(role)` helper that does `new RoleLandingService()`
      directly (the service has no injected dependencies) rather than a second `TestBed.inject`,
      avoiding a TestBed-reconfiguration conflict with `runRoleGuard`'s own module setup within the
      same test.
- [X] T026 [US3] Run `role-landing-destinations.spec.ts`, `role.guard.spec.ts`, and
      `role-landing.service.spec.ts` together and confirm all green — proving the guard, the service,
      and the new matrix agree. Depends on: T024, T025. — 35/35 passed.
- [X] T027 [US3] Add one line to `docs/scout-pro-plan-v2.md` Stage 6's executive notes (following the
      existing pattern used by Stages 1-5) recording that item 7's consolidated test now exists at
      `frontend/src/app/core/auth/role-landing-destinations.spec.ts`. Depends on: T024. — Added as
      the opening executive note; T032 (Polish) will expand it once final test counts are in.

**Checkpoint**: All three user stories are independently functional. A future landing-destination
change in any role cannot land without this stage's matrix test failing first.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across the whole stage, matching `quickstart.md`.

- [X] T028 [P] Run `cd Backend && npm test` (full suite) — confirm green. — Satisfied by T021's run
      (638/638); re-running would be redundant since no backend file changed afterward.
- [X] T029 [P] Run `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` (full suite)
      — confirm green. — 166/166 passed.
- [X] T030 Update `specs/008-proscout-matches-attendance/contracts/endpoint-inventory-delta.md`'s
      "Verification method" note to confirm it was cross-checked against the regenerated
      `openapi.json` from T018 (Principle VI). — Added a confirmation note with the exact diff size
      and which test files exercise each changed row.
- [ ] T031 Manual sanity per [quickstart.md §6](./quickstart.md): log in as a seeded proScout, open
      **My Matches**, confirm no age-group column, no league toggle, attend an upcoming
      professional-league fixture, and (on its match day, or by adjusting a seeded `matchDate`) enter
      a result. Confirm a premier-league match id typed directly into the URL 403s. — NOT PERFORMED
      in this session: no dev servers (`Backend`:8000, `frontend`:4200) were started, and doing so
      would require starting long-running background processes and a browser-driven check outside
      this session's scope. Every behavior this step would sanity-check is already covered by the
      automated suites: G-1…G-13 (HTTP-level, `proScoutMatchAttendance.test.js`) and the
      `my-matches.component.spec.ts` DOM assertions (T008, T022). Flagging explicitly per the
      project's standing instruction not to claim UI verification that wasn't actually performed.
- [X] T032 Update `docs/scout-pro-plan-v2.md` Stage 6 with an executive implementation note (matching
      the pattern used for Stages 1-5) summarizing what was built, any further deviations discovered
      during implementation, and the final test counts. — 8-point numbered note added: 638/638
      backend (28 files), 15/15 isolation.test.js unmodified, 166/166 frontend.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: No dependencies on Phase 1's outcome beyond it having run; BLOCKS the
  UI-facing halves of US1 and US2 (their backend halves do not depend on Phase 2 at all and can start
  in parallel with it).
- **User Stories (Phase 3-5)**: US1 and US2's backend tracks have no dependency on Phase 2. US1 and
  US2's frontend tracks depend on Phase 2. US3 depends on Phase 2 only for `roleGuard`/
  `RoleLandingService` to exist in their current (pre-this-stage) form, which they already do —
  effectively independent of Phase 2's edits.
- **Polish (Phase 6)**: Depends on Phases 3, 4, and 5 all being complete.

### User Story Dependencies

- **US1 (P1)**: Independent. No dependency on US2 or US3.
- **US2 (P1)**: Independent of US1 at the code level (different template regions, different backend
  routes), though both touch `my-matches.component.ts` and its spec — sequence T009-T011 (US1) before
  T022 (US2) to avoid the same file being edited by two untracked concurrent tasks.
- **US3 (P2)**: Fully independent of US1 and US2 — touches only `core/auth/`, never
  `season-matches/`.

### Within Each User Story

- Tests before implementation (T013/T014 before T016/T017; T008 before T009-T011; T024 before T025).
- Backend route/middleware change (T016, T017) before the frontend tasks that exercise it live
  (T022) — the frontend test can be written against the contract first, but attendance/result-entry
  will not actually work end-to-end until T017 lands.

### Parallel Opportunities

- T001, T002 in parallel (Setup).
- T003, T004 in parallel (different files, Foundational).
- T007, T008 in parallel (US1 tests, different files/languages).
- T013, T014, T015 in parallel (US2 tests, all in `Backend/tests/roles/`, different files or
  independent describe blocks).
- T028, T029 in parallel (Polish, full suites in different projects).
- US1 and US3 can be staffed entirely in parallel by different people once Phase 2 is done; US2's
  backend track (T013-T021) can run in parallel with US1 and US3 from the start.

---

## Parallel Example: User Story 2 tests

```bash
# Backend, three independent test-writing tasks:
Task: "Edit T042 block in Backend/tests/roles/proScoutDataScope.test.js — flip 2 assertions, add missing-attendee case"
Task: "Create Backend/tests/roles/proScoutMatchAttendance.test.js — G-1...G-13 HTTP-level"
Task: "Add coach/observer regression cases to the same new file"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (nav entry — needed to reach the page in the running app; US1's
   backend regression proof does not need it).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: a proScout can browse their scoped matches with no age-group exposure.
5. Deploy/demo if ready — this alone is a coherent, independently deployable increment
   (Constitution Principle V): the role can see its matches even before attendance/result-entry ships.

### Incremental Delivery

1. Setup + Foundational → nav entry exists.
2. Add US1 → browse works, age-group hidden → demo.
3. Add US2 → attend + result entry work under the coach/observer constraint → demo (this is the
   stage's headline capability and the corrected plan decision).
4. Add US3 → the consolidated landing/rejection matrix exists, closing the drift pattern from Stages
   4/5 → demo/merge.

### Parallel Team Strategy

With multiple developers, after Phase 2:

- Developer A: US1 (frontend-heavy, small backend regression-proof task).
- Developer B: US2 backend (T013-T021) — the stage's core risk (R2, R4).
- Developer C: US3 (fully isolated in `core/auth/`).
- US2's frontend slice (T022-T023) waits on Developer B's T017, but can be picked up by whoever
  finishes first.
