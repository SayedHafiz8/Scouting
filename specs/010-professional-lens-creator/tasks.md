---

description: "Task list template for feature implementation"
---

# Tasks: proScout Name on the Professional League Lens

**Input**: Design documents from `/specs/010-professional-lens-creator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/players-list-response.md, quickstart.md

**Tests**: Included. The spec's Success Criteria (SC-003, SC-004) and Constitution Principle III/VI
require regression proof by failing test, not review — this project's established convention
(every prior stage in `docs/scout-pro-plan-v2.md`) treats that as an explicit test request.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent implementation and
testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2)
- File paths are exact and relative to the repository root

---

## Phase 1: Setup

**Purpose**: No new project, dependency, or scaffolding is needed — this feature modifies one
existing controller and one existing component in an already-running stack. The only "setup" is
confirming the exact patterns being mirrored, so the following tasks are read-only.

- [X] T001 [P] Read `Backend/controllers/playerController.js` lines 238-342 (`getAll`) and confirm
  the exact insertion point for a conditional `.populate({ path: "createdBy", select: "name" })`
  alongside the existing `coach`/`team` populates (around line 297-300).
- [X] T002 [P] Read `frontend/src/app/features/players/player-list/player-list.component.ts` lines
  918-933 (`coachName()`, `isOrphaned()`) to confirm the exact helper-method pattern `creatorName()`
  must mirror.

**Checkpoint**: Insertion points confirmed — implementation phases below can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The single backend response-shape change both user stories depend on, plus the
generated-artifact regeneration Principle V requires for it. Nothing in Phase 3 or Phase 4 can be
verified end-to-end until this phase is done.

**⚠️ CRITICAL**: No user story task can be verified against a real response until T003-T006 are complete.

- [X] T003 [US1][US2] Add a role-gated `.populate({ path: "createdBy", select: "name" })` to the
  `Player.find(scope)` query chain in `getAll` (`Backend/controllers/playerController.js`, inside
  the existing `.populate({ path: "coach", ... }).populate({ path: "team", ... })` chain at
  line ~297-300), applied only when `req.user.role === ROLES.ADMIN`. Non-admin roles must build the
  exact same query object as before this change — no branch, no extra populate call, on their path.
- [X] T004 [P] Update the `@swagger` JSDoc block above the `GET /players` route in
  `Backend/routes/playerRouter.js` to document the new admin-only `createdBy: { _id, name }` field
  on the `Player` response schema (per `contracts/players-list-response.md`). — Implemented in the
  central `Player` schema in `Backend/utils/swagger.js` (the `$ref` target for the `GET /players`
  route's response), not inline in `playerRouter.js`, since that is where `coach`/`observers` are
  already documented (correction to the file path recorded in plan.md/tasks.md).
- [X] T005 Add `createdBy?: { _id?: string; name: string } | string` to the `Player` interface in
  `frontend/src/app/core/models/player.model.ts`, placed directly below the existing `coach?: User |
  string;` line, following the same hand-annotated pattern (per `research.md` R4).
- [X] T006 Run `npm run dump-spec` in `Backend/` and `npm run gen:types` in `frontend/` to regenerate
  `openapi.json` and `frontend/src/app/core/models/api.generated.ts`. Confirm the diff is limited to
  the `Player` schema's `createdBy` response description (per `research.md` R5). — Confirmed:
  `openapi.json` +11/-0 lines, `api.generated.ts` +2/-0 lines, both isolated to `createdBy`.

**Checkpoint**: Admin `GET /players` responses now carry `createdBy` as `{ _id, name }` (or absent);
every other caller and endpoint is provably untouched. User story implementation can begin.

---

## Phase 3: User Story 1 - Admin sees who is responsible for each professional player (Priority: P1) 🎯 MVP

**Goal**: On the Professional League lens, each player's row shows the name of the `proScout` who
created it, visible to `admin` only.

**Independent Test**: As two different `proScout` users, create one professional player each. Sign
in as admin, activate the Professional League chip, and confirm each row shows its actual creator's
name — matching spec.md's own Independent Test for this story.

### Tests for User Story 1

> **NOTE**: Write these tests first; confirm they fail against the pre-Phase-2 behavior (no
> `createdBy` in the response) before implementing Phase 2's populate, or re-run them immediately
> after Phase 2 to confirm they now pass.

- [X] T007 [P] [US1] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js`: an admin's
  `GET /players?isProfessional=true` request, against two professional players created by two
  distinct `proScout` users (via `tests/helpers/factory.js`), returns `createdBy.name` matching each
  player's actual creator — not swapped, not identical.
- [X] T008 [P] [US1] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js`: the same
  request made as `coach`, then as `observer`, then as `proScout`, produces a response with no
  `createdBy` key on any document — asserted by comparing the full response body against a
  pre-computed fixture/snapshot of the pre-feature shape (per `contracts/players-list-response.md`,
  "Response — non-admin caller"). — **Corrected during implementation** (see spec.md "Implementation
  note"): `createdBy` was already present as a raw `ObjectId` string for every role before this
  feature (no `.select()` ever excluded it). The test instead asserts the string is unchanged —
  never resolved to a name — for coach/observer/proScout, using a player each role can actually see
  with `createdBy` genuinely set (the "key is absent" framing passed vacuously otherwise).
- [X] T009 [P] [US1] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js`: an admin's
  `GET /players/:id` request for the same professional player has no `createdBy` key in the response
  — proving `getSpecific` is untouched (FR-005). — **Corrected the same way as T008**: asserts the
  bare id string is returned unchanged, not that the key is absent.
- [X] T010 [P] [US1] Frontend unit test in
  `frontend/src/app/features/players/player-list/player-list.component.spec.ts`: `creatorName()`
  returns the `name` when `player.createdBy` is a populated `{ _id, name }` object.
- [X] T011 [P] [US1] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js` (closes
  analysis finding C1 / FR-006): an admin's `GET /players` request **without**
  `?isProfessional=true` — the ordinary age-group grid view, and at least one other existing filter
  combination (e.g. `?status=selected` or `?ageGroup=<id>`) — returns the same set of players and
  the same values for every pre-existing field as a pre-feature fixture/snapshot, with `createdBy`
  present only as an additive field on each document. This proves the admin-wide populate added in
  T003 (which is not gated on the lens being active) changes nothing else about any other admin view
  of this endpoint.
- [X] T012 [P] [US1] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js` (closes
  analysis finding C2 / FR-008): an admin's `GET /players?createdBy=<someUserId>` request returns the
  **same result** as the identical request without the `createdBy` query parameter — proving the key
  is not present in `PLAYER_FILTERS` and is silently dropped, not accidentally whitelisted into a
  filter, guarding against a future edit introducing that regression.

### Implementation for User Story 1

- [X] T013 [US1] Add a `creatorName(player: Player): string` method to `PlayerListComponent`
  (`frontend/src/app/features/players/player-list/player-list.component.ts`), mirroring
  `coachName()` (lines 920-925): return `''` if `createdBy` is absent or a bare string, otherwise
  return `createdBy.name`.
- [X] T014 [US1] Render the creator name on each row of the flat player list, visible only while
  `professionalOnly()` is true and `auth.isAdmin()` is true, in the template section of
  `player-list.component.ts` around the flat-view row markup (near line 246 `@if (selectedGroup() ||
  flatView())`). — Placed directly after the existing `coachName()`/`isOrphaned()` block (line
  ~419-429), mirroring its markup exactly.
- [X] T015 [P] [US1] Add an i18n key for the creator-name label (e.g. `PLAYERS.CREATED_BY: "Added
  by"`) to `frontend/src/assets/i18n/en.json`, alongside the existing `PLAYERS.PROFESSIONAL_LEAGUE`
  key (line ~409).
- [X] T016 [P] [US1] Add the matching Arabic translation (e.g. `PLAYERS.CREATED_BY: "أضافه"`) to
  `frontend/src/assets/i18n/ar.json`, alongside the existing `PLAYERS.PROFESSIONAL_LEAGUE` key
  (line ~409).

**Checkpoint**: User Story 1 is fully functional — an admin activating the Professional League chip
sees the correct creator name per player, every other admin view of the same endpoint is provably
unaffected (T011), the field cannot be abused as a filter (T012), and no other role or endpoint is
affected.

---

## Phase 4: User Story 2 - A player with no recorded creator degrades gracefully (Priority: P2)

**Goal**: A professional player with no `createdBy` value (or whose creator was deactivated) renders
normally in the lens, with a visible absence instead of a name — no error, no broken row.

**Independent Test**: With a professional player that has no `createdBy`, load the lens as admin and
confirm the row renders normally with no name shown, and the rest of the list still loads — matching
spec.md's own Independent Test for this story.

### Tests for User Story 2

- [X] T017 [P] [US2] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js`: a
  professional player created with no `createdBy` (e.g. via direct `createPlayerDoc` factory
  override) returns `createdBy: null` (or the key absent) in the admin's response, with a `200` and
  no error, while sibling players in the same response are unaffected.
- [X] T018 [P] [US2] Backend test in `Backend/tests/roles/adminProfessionalLens.test.js`: a
  professional player whose `createdBy` user has been soft-deactivated (`active: false`) also
  resolves to `null`/absent for admin, matching the no-creator case (per `data-model.md`'s
  soft-delete edge case) rather than throwing or leaking a deactivated user's data. — Confirmed:
  Mongoose's `pre(/^find/)` soft-delete hook on `User` does apply during `.populate()`, so a
  deactivated creator resolves to falsy exactly like a missing one.

### Implementation for User Story 2

- [X] T019 [P] [US2] Extend the `creatorName()` unit test suite in
  `player-list.component.spec.ts` to assert `''` is returned when `player.createdBy` is `null` or
  `undefined` (T013's implementation already returns `''` for the absent case by construction — this
  task is the explicit regression test for it, not new production code).
- [X] T020 [US2] Confirm the row markup added in T014 renders no name (not an empty tag with visible
  styling, not a broken layout) when `creatorName(player)` returns `''` — adjust the template
  conditionally (`@if (creatorName(player); as name) { ... }`) if T014's markup does not already
  degrade cleanly. — Confirmed without changes needed: T014's markup is already gated by
  `@if (... && creatorName(player))`, so an empty string renders nothing at all.

**Checkpoint**: Both user stories are independently functional. A missing or deactivated creator
never breaks the page.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Prove non-regression across every role and every touched suite, per Constitution
Principle III, before this feature is considered done.

- [X] T021 Run `npm test -- tests/isolation.test.js` in `Backend/` and confirm it passes **unmodified**
  (Principle III — this file must not be touched by this feature). — 19/19 passed; `git status`
  confirms the file has zero diff.
- [X] T022 [P] Run `npm test -- tests/roles/proScoutDataScope.test.js` in `Backend/` and confirm the
  same pass count as before this feature (the `proScout` code path is untouched by T003's admin-only
  gate). — 59/59 passed.
- [X] T023 [P] Run `npm test -- tests/roles/adminProfessionalLens.test.js` in `Backend/` and confirm
  all Stage 4c tests plus the new T007-T009, T011, T012, T017-T018 tests pass. — 30/30 passed.
- [X] T024 Run `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` and confirm the
  existing `player-list.component.spec.ts` suite plus the new T010, T019 tests pass. — full suite:
  170/170 passed.
- [ ] T025 Execute the manual browser validation steps in `quickstart.md` (two proScout-created
  players, admin lens check, detail-page non-appearance check, coach/observer no-op check). — **Not
  run in this session**: requires live backend (`:8000`) and frontend (`:4200`) dev servers and
  visual interaction, outside this environment. Every behavior it would check is already covered by
  the automated HTTP-level tests (T007-T009, T011-T012, T017-T018) and the component-level tests
  (T010, T019) above.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — read-only, can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1. **BLOCKS** Phase 3 and Phase 4 — the response
  shape change (T003) is the one thing both user stories observe and test against.
- **User Story 1 (Phase 3)**: Depends on Phase 2 (T003-T006). No dependency on User Story 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 (T003-T006) and on T013/T014 from Phase 3 (it
  extends the same `creatorName()` method and row markup with the null/absent case — there is no
  separate implementation surface for the edge case, only additional test coverage of the one already
  built in Phase 3).
- **Polish (Phase 5)**: Depends on Phase 3 and Phase 4 both being complete.

### Within Each User Story

- Tests before implementation (T007-T012 before T013-T016; T017-T018 before T019-T020).
- Backend response shape (Phase 2) before any test that asserts on it.

### Parallel Opportunities

- T001, T002 (Setup) in parallel.
- T004, T005 (Foundational) in parallel with each other, but both depend on T003 landing first if
  regeneration (T006) is to reflect the final shape — in practice T004/T005 can be drafted in
  parallel with T003 and reconciled before T006 runs.
- T007, T008, T009, T010, T011, T012 (US1 tests) in parallel — different assertions, same or
  independent files.
- T015, T016 (US1 i18n) in parallel — different files.
- T017, T018 (US2 tests) in parallel.
- T019 in parallel with T017/T018 (different file).

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Backend test — two distinct proScout creators, correct name per player (T007)"
Task: "Backend test — non-admin roles get byte-identical response (T008)"
Task: "Backend test — GET /players/:id unaffected (T009)"
Task: "Frontend test — creatorName() returns name for populated object (T010)"
Task: "Backend test — other admin views of GET /players unaffected (T011)"
Task: "Backend test — ?createdBy= is not a whitelisted filter (T012)"

# Launch i18n keys together:
Task: "Add PLAYERS.CREATED_BY to en.json (T015)"
Task: "Add PLAYERS.CREATED_BY to ar.json (T016)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (read-only confirmation).
2. Complete Phase 2 — the populate change, JSDoc, type, and regeneration.
3. Complete Phase 3 — admin sees creator names on the lens, other admin views proven unaffected, and
   `createdBy` proven un-filterable.
4. **STOP and VALIDATE**: run T007-T012 and confirm they pass; manually check the lens in-browser.
5. This alone is a complete, mergeable increment — Phase 4 (the null/deactivated-creator edge case)
   is additive test coverage of the same code path, not new user-facing behavior gated behind it.

### Incremental Delivery

1. Setup + Foundational → response shape ready.
2. User Story 1 → test independently → this is the entire feature's visible value.
3. User Story 2 → test independently → closes the known edge case (orphaned/deactivated creators)
   with explicit proof rather than an unverified assumption that `populate` degrades safely.
4. Polish → full regression across `isolation.test.js`, Stage 2, and Stage 4c suites.

---

## Notes

- [P] tasks = different files or independent assertions, no ordering dependency.
- [Story] label maps each task to US1 or US2 for traceability against spec.md.
- This feature has no Foundational tasks that are *not* shared by both stories — Phase 2 is small
  and single-purpose by design, matching the plan's own "single controller, single component" scope
  statement.
- Commit after each task or logical group, per repository convention.
- No task in this list touches `Backend/utils/apiFeatures.js`, `Backend/services/scope.js`, or
  `Backend/middlewares/ownership.js` — Constitution Principle IV's central scope layer is
  intentionally not engaged by this feature.
- T011 and T012 were added following `/speckit-analyze` (findings C1, C2) to close two coverage gaps:
  FR-006 (other admin views of `GET /players` unaffected) and FR-008 (no new client-suppliable
  filter) had no dedicated test before that pass.
