---

description: "Task list for Stage 4c — admin lens for professional-league players"

---

# Tasks: Admin Lens for Professional-League Players

**Input**: Design documents from `specs/006-admin-professional-lens/` (spec.md, plan.md)

**Prerequisites**: Stage 4b merged (`specs/005-proscout-players-write/`) — `Player.isProfessional` must exist.

**Tests**: Included. Constitution Principle VI requires a positive + negative test per new permission, and Principle III requires a regression test proving existing roles are byte-identical.

**Organization**: Tasks are grouped by user story (spec.md). US1 and US2 are both P1 — US1 (the route) is built first because US2 (search/sort/pagination) needs the flat list to already exist to test against. US3 (P2, the honest count) follows. Two cross-cutting fixes (PC-1, PC-2) sit in their own phase because they touch code outside any single story's boundary.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / PC (cross-cutting, owner-directed)

---

## Phase 1: Setup

No new dependencies, no new project structure — this stage adds a filter, an aggregation field, and two Angular controls to files that already exist. Nothing to initialize.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one server change every other task depends on. **US1's chip is inert without this.**

- [X] T001 Add `"isProfessional"` to `PLAYER_FILTERS` in [Backend/controllers/playerController.js:209-212](../../Backend/controllers/playerController.js#L209-L212), with a comment naming this stage and D-1 (why it is *not* added to `PLAYER_ADMIN_ONLY_LENSES` at line 207 — the flag names no user, unlike `coach`/`observer`/`observers`).
- [X] T002 Add a `professional` accumulator to the `$group` stage in `getCountsByAgeGroup` in [Backend/controllers/playerController.js:162-165](../../Backend/controllers/playerController.js#L162-L165) — e.g. `professional: { $sum: { $cond: ["$isProfessional", 1, 0] } }` — and surface it in the response's `data` object alongside `counts` and `total` (line ~174-177). Comment: this rides the same `finalMatch` as the age-group buckets by construction (FR-006), and exists because `total − Σ counts` would mislabel any player missing `ageGroup` for an unrelated reason as professional (rejected in plan.md D-2).
- [X] T003 [P] Update the two `@swagger` JSDoc blocks for `GET /players` and `GET /players/counts` (near [Backend/routes/playerRouter.js](../../Backend/routes/playerRouter.js)) to document the new `isProfessional` query param and the new `professional` count field, per Principle V (route-shape changes require `dump-spec` + `gen:types` in the same PR — done in T024/T025 below).

**Checkpoint**: The filter and the count both exist server-side. Nothing consumes them yet.

---

## Phase 3: User Story 1 — The admin finds professional players on purpose (Priority: P1) 🎯 MVP

**Goal**: A chip that opens a flat, scoped list of every professional player.

**Independent Test**: Create one professional and one youth player, sign in as admin, activate the chip, confirm the list contains exactly the professional player.

### Tests for User Story 1

> Write these first; confirm they fail before T001/T002 land, and again before the frontend tasks land.

- [X] T004 [P] [US1] Positive test: admin sends `?isProfessional=true` to `GET /players`, receives exactly the professional players and none of the youth players — in `Backend/tests/roles/proScoutPlayersWrite.test.js` or a new `Backend/tests/roles/adminProfessionalLens.test.js` (prefer the new file; this is Stage 4c's own test surface, not Stage 4's).
- [X] T005 [P] [US1] Negative test: a coach sends `?isProfessional=true` and receives **only their own players**, scoped exactly as without the filter (their professional-flagged players intersected with their `coach` scope — empty unless they happen to own one). Asserts the filter cannot widen coach/observer scope. **Also assert FR-016**: for a coach whose own scope does yield a result under this filter, the response still masks `observed` as `pending` and omits `observers` — the chip is admin-only (FR-010), so this direct-API path is the *only* place FR-016 is observable, and it has no other test. Same file as T004.
- [X] T006 [P] [US1] No-op test for `proScout`. ⚠️ **Correction, measured during implementation**: the original wording ("true and false get the same result") was wrong — every player a proScout can create is flagged `isProfessional: true` by the create controller (Stage 4b), so `?isProfessional=false` correctly narrows to **zero**, not to the unfiltered set. Split into two assertions: `?isProfessional=true` matches the unfiltered result (FR-010/FR-015's actual "no-op" claim), and `?isProfessional=false` returns an empty list without becoming an oracle. Same file as T004.
- [X] T007 [P] [US1] Cast-safety test: assert `"true"`/`"false"` cast correctly against the `Boolean` path. ⚠️ **Correction, measured during implementation**: plan.md's risk framed an invalid value (e.g. `?isProfessional=notabool`) as needing to "fail open in the safe direction (rejected or ignored)". Measured reality: Mongoose's Boolean cast throws a `CastError` for a non-boolean-like string, and the project's global `handelCastError` (middlewares/errorMiddleware.js) already turns that into a plain **400** — the same mechanism every other Boolean/ObjectId filter in this codebase relies on. There was never a silent-fallback risk to guard against; the test asserts the existing 400, not a new behavior this stage adds. Same file as T004.
- [X] T008 [P] [US1] Count test: `GET /players/counts` for an admin returns a `professional` value equal to the number of `isProfessional: true` players within scope, matching FR-005/FR-006 — including with a `?status=` filter applied, so the chip-count and the card-counts stay comparable (US3's SC-002 depends on this holding). Same file as T004.
- [X] T009 [P] [US1] Regression test: for admin, coach and observer, `GET /players` and `GET /players/counts` with the filter **absent** return byte-identical counts and content to pre-change behavior (FR-014). Same file as T004.

### Implementation for User Story 1

- [X] T010 [US1] Add `professionalOnly()` getter to `PlayerListComponent` reading `isProfessional === 'true'` from the route query params, mirroring `orphanedOnly()` at [frontend/src/app/features/players/player-list/player-list.component.ts:614-616](../../frontend/src/app/features/players/player-list/player-list.component.ts#L614-L616).
- [X] T011 [US1] Add `toggleProfessional()` navigating with `queryParamsHandling` **omitted** (full replace, not merge — D-3/PC-1) and clearing `this.keyword = ''` directly (it lives outside the URL). Same file, near `toggleOrphaned()`.
- [X] T012 [US1] Add `req.professionalFilter` binding to `ngOnInit()`'s `queryParamMap.subscribe` block ([player-list.component.ts:591-600](../../frontend/src/app/features/players/player-list/player-list.component.ts#L591-L600)) so the flag is read from the URL on load, matching how `coachFilter`/`observerFilter` are read.
- [X] T013 [US1] Add `this.auth.isProScout() === false` guard is already implicit — add `professionalOnly()` as a fourth disjunct in `skipGroupsView()` ([player-list.component.ts:635-637](../../frontend/src/app/features/players/player-list/player-list.component.ts#L635-L637)), so activating the chip routes through the existing flat-list path with no parallel template.
- [X] T014a [US1] Add `isProfessional?: string` to the `PlayerFilters` interface in `frontend/src/app/core/models/player.model.ts:51-64` — it is a strict interface today and has no such field; without it, nothing downstream can carry the flag without a type error surfacing the gap.
- [X] T014b [US1] Add `isProfessional: this.professionalOnly() ? 'true' : undefined` to the `filters` object literal built in `load()` at [player-list.component.ts:726-735](../../frontend/src/app/features/players/player-list/player-list.component.ts#L726-L735). This is the actual call site that reaches the server — `player.service.ts`'s `getAll()` only forwards whatever `PlayerFilters` object it is given, it does not assemble one.
- [X] T015 [US1] Add the **Professional League** chip button in the template, adjacent to the **No coach** chip at [player-list.component.ts:100-108](../../frontend/src/app/features/players/player-list/player-list.component.ts#L100-L108), gated behind `@if (auth.isAdmin())` (same block the No coach chip already sits in — FR-010 excludes `proScout` and every non-admin role by construction, since only admin sees that block at all).
- [X] T016 [US1] Wire the chip's `[class.status-chip-on]`, `[attr.aria-pressed]` and `(click)="toggleProfessional()"` following the No coach chip's exact attribute pattern (lines 101-106).

**Checkpoint**: US1 independently testable — chip opens a correctly-scoped flat list, survives refresh (URL-driven), and the endpoint tests from T004-T009 are green.

---

## Phase 4: User Story 2 — Search, sort and pagination behave identically in this lens (Priority: P1)

**Goal**: The lens is a normal flat view, not a special case.

**Independent Test**: With ≥6 professional players, confirm keyword search narrows the list, sort reorders it, and page 2 is reachable — all without leaking a youth player onto any page.

**Depends on**: Phase 3 (the flat list must exist to test against).

### Tests for User Story 2

- [X] T017 [P] [US2] Frontend test: with `professionalOnly()` true, typing a keyword and calling the existing search path narrows results and the query still carries `isProfessional=true` — in `frontend/src/app/features/players/player-list/player-list.component.spec.ts`, alongside the existing orphaned-filter describe block.
- [X] T018 [P] [US2] Frontend test: deactivating the lens with a keyword set does not leak the keyword into the grid view in a way that means something different there (FR — "no silently carried keyword"). Same file.
- [X] T019 [P] [US2] Backend test: `GET /players?isProfessional=true&keyword=...&page=2&sort=...` composes correctly with pagination and sort — confirms no parallel query builder was introduced (FR-004). Same file as T004 (`adminProfessionalLens.test.js`).

### Implementation for User Story 2

- [X] T020 [US2] Confirm (and if needed adjust) that the existing search input, position select, sort control and paginator at [player-list.component.ts:243-330](../../frontend/src/app/features/players/player-list/player-list.component.ts#L243-L330) render unconditionally in flat view — i.e. verify no `@if` gates them away from the professional lens specifically. This should require **no code change** if T013 correctly routes through the existing flat-view path; if it does require a change, that is a sign FR-002/FR-004 (single code path) has been violated somewhere and must be fixed, not special-cased.

**Checkpoint**: US1 + US2 together — a fully usable, searchable, sortable, paginated lens.

---

## Phase 5: User Story 3 — The header total stops lying (Priority: P2)

**Goal**: The chip shows the professional count on the grid view, so header total = Σ cards + chip.

**Independent Test**: With N professional and M youth players, confirm header total reads N+M, cards sum to M, chip reads N.

**Depends on**: Phase 2 (T002, the `professional` count field must exist).

### Tests for User Story 3

- [X] T021 [P] [US3] Frontend test: `loadGroupCounts()` result's `professional` value is rendered as the chip's badge in the grid view (not the flat view) — new spec in `player-list.component.spec.ts`.

### Implementation for User Story 3

- [X] T022 [US3] Extend `loadGroupCounts()` at [player-list.component.ts:~700](../../frontend/src/app/features/players/player-list/player-list.component.ts#L700) (the `countsByAgeGroup` subscribe block) to store the new `professional` value from the response, e.g. a `professionalCount` signal.
- [X] T023 [US3] Render `professionalCount()` as a `chip-badge` on the **Professional League** chip when the grid (not flat) view is active and the value is nonzero. **Note the inverted condition versus every existing badge**: the `observed`/`selected`/`pending`/`rejected` badges at lines 55-94 each show their count only while *that chip is active* (`@if (statusFilter === 'observed')`, etc.) — this one must do the opposite, showing while the chip is **inactive** (grid visible, per FR-011). Gate it on `!professionalOnly()` (or equivalently on the grid being rendered), not on `professionalOnly()`.

**Checkpoint**: All three user stories independently functional. The arithmetic on screen closes.

---

## Phase 6: Cross-Cutting — PC-1 (chip symmetry) and PC-2 (professional team dropdown)

**Purpose**: Two changes the owner explicitly requested that touch code outside any single story above — recorded separately so their non-story nature is visible, not folded into US1's diff.

- [X] T024 [PC] Change `toggleOrphaned()` at [player-list.component.ts:614-620](../../frontend/src/app/features/players/player-list/player-list.component.ts#L614-L620) to match `toggleProfessional()` (T011): navigate with `queryParamsHandling` **omitted** instead of `'merge'`, and clear `this.keyword = ''`. Add a comment naming PC-1 and this stage — this is the one behavior change in the stage to an existing, already-shipped control, made on explicit instruction.
- [X] T025 [PC] Update the two now-incorrect assertions in `frontend/src/app/features/players/player-list/player-list.component.spec.ts` (~lines 125-145): `expect(extras.queryParamsHandling).toBe('merge')` → `.toBeUndefined()` (or however "no handling passed" asserts in this test's style), and the switch-off assertion `expect(extras.queryParams).toEqual({ coach: null })` → `.toEqual({})`. Edit in place with a comment stating the reason (PC-1), following the project's established precedent for updating pre-existing assertions when a stage deliberately changes behavior.
- [X] T026 [PC] Confirm the *surviving* test — `'keeps an active status filter alongside the lens'` (arrival via URL, not a toggle click) — needs **no change**. If it does, the clearing has leaked from toggle-time into routing/arrival, which is wrong; fix the leak, not the test.
- [X] T027 [PC] Add a `teamFilter = ''` component field (new state — does not exist today) and a professional-only team `<select>` bound to it with `[(ngModel)]="teamFilter" (ngModelChange)="resetAndLoad()"`, rendered only `@if (professionalOnly())`, near [player-list.component.ts:270-284](../../frontend/src/app/features/players/player-list/player-list.component.ts#L270-L284) (next to the position select). Populate its options via `teamService.getAll(undefined, 'professional')` — the same call already used in `player-form.component.ts` for the proScout team picker — fetched once on first activation of the lens, not per keystroke.
- [X] T028 [PC] Add `team: this.teamFilter || undefined` to the `filters` object literal in `load()` at [player-list.component.ts:726-735](../../frontend/src/app/features/players/player-list/player-list.component.ts#L726-L735). `PlayerFilters.team` already exists in the type (unlike `isProfessional` — see T014a), but `load()` does not currently populate it for any view, so this line must be added explicitly or the select will render with no effect. Confirm no new *server* filter is needed — `team` is already in `PLAYER_FILTERS` — this control only narrows the *choices offered*, per D-4/Principle I; it cannot widen scope even if misused, since a non-professional team id would simply return nothing under the active `isProfessional=true` condition.
- [X] T029 [P] [PC] Frontend test: with the lens active, the team dropdown's options come only from a `league=professional` team request — assert the `teamService.getAll` spy is called with `('professional')` and never with a broader call, in `player-list.component.spec.ts`.

**Checkpoint**: Both chips symmetric; the professional lens has its own scoped team filter; no general team filter exists outside this lens.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T030 [P] Add `PLAYERS.PROFESSIONAL_LEAGUE` key to `frontend/src/assets/i18n/en.json` (near `NO_COACH` at line 399) — e.g. `"Professional league"` (distinct from the existing `SEASON_MATCHES.LEAGUE_PROFESSIONAL`, which labels a different control with a different audience).
- [X] T031 [P] Add the matching Arabic key to `frontend/src/assets/i18n/ar.json` (near `NO_COACH` at line 399) — `"دوري المحترفين"`.
- [X] T032 Run `npm run dump-spec` in `Backend/` to regenerate `openapi.json` with the new query param and count field (T003), then `npm run gen:types` in `frontend/` to regenerate `api.generated.ts` (Principle V — required whenever route shape changes).
- [ ] T033 Full backend suite (`npm test` in `Backend/`) green, with **`Backend/tests/isolation.test.js` unmodified** (Principle III gate).
- [X] T034 Full frontend suite (`npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/`) green.
- [X] T035 **SC-004 regression-proofing test** (plan.md Phase 10 — the decisive one): assign a coach to every existing professional player in a test fixture, then assert every one of them is still reachable through the new lens (T004's positive test, re-run against coach-assigned professional players). If this fails, the admin still silently depends on the "No coach" side effect and the gap named in spec.md is not actually closed.
- [X] T036 Update `docs/scout-pro-plan-v2.md` and/or a `PR-DESCRIPTION.md` for this stage, naming it explicitly as a post-4b gap-fix (not part of the original plan), per the precedent set by Stage 4b's own PR description.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: blocks all of Phase 3-6 — the filter and count field must exist before anything consumes them.
- **US1 (Phase 3)**: depends on Phase 2. Nothing else.
- **US2 (Phase 4)**: depends on Phase 3 (needs the flat list to exist).
- **US3 (Phase 5)**: depends on Phase 2 only (T002) — independent of Phase 3/4, could run in parallel with them.
- **PC (Phase 6)**: depends on Phase 3 (`toggleProfessional()` must exist as the pattern `toggleOrphaned()` is changed to match).
- **Polish (Phase 7)**: depends on everything above.

### Parallel Opportunities

- T004-T009 (all Phase 3 tests) are one file but independent test cases — can be drafted in parallel by different people, committed together.
- T003 (swagger docs) can run in parallel with T001/T002 since it's a different concern (documentation) on adjacent but non-overlapping lines.
- Phase 5 (US3) can proceed in parallel with Phase 3/4 once Phase 2 is done, since it touches the grid view while US1/US2 touch the flat view.
- T030/T031 (i18n, two different files) are trivially parallel.

---

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 3 (US1) → **stop and validate**: an admin can reach professional players on purpose. This alone closes failure #1 from spec.md ("no intentional route").

### Incremental Delivery

1. Foundational → US1 → validate → this is already a meaningful fix.
2. Add US2 → validate → the lens stops being a second-class view.
3. Add US3 → validate → the header total stops lying (failure #2 closed).
4. Add Phase 6 (PC-1 + PC-2) → validate → symmetric chips, scoped team dropdown.
5. Phase 7 → validate → **T035 is the real acceptance gate**: only once it passes has failure #3 ("the one route that works, works by accident") actually been closed.
