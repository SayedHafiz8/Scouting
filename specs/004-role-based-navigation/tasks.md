---

description: "Task list for Role-Based Sidebar Navigation (Phase 3 — proScout)"
---

# Tasks: Role-Based Sidebar Navigation

**Input**: Design documents from `/specs/004-role-based-navigation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/navigation-matrix.md](./contracts/navigation-matrix.md)

**Tests**: Included and **mandatory**. Constitution Principle VI requires a positive and a negative test per permission, and Principle III requires that "unchanged behavior" be proven by a test that would fail if behavior changed — not by code review.

**Organization**: Grouped by user story. Note the honest caveat in [Story Independence](#story-independence) — the four stories here share one refactor and are *not* independently deployable slices in the usual sense.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths included in every task

## Path Conventions

Web app, per plan.md: `frontend/src/app/...` and `Backend/tests/...`. This phase modifies **four code files** — the change budget in [contracts/navigation-matrix.md §5](./contracts/navigation-matrix.md), which also lists the documentation paths expected to change (this feature's `specs/` artifacts and the `docs/scout-pro-plan-v2.md` note). Touching any other code is a scope breach.

---

## ⚠️ READ THIS BEFORE PHASE 2 — the test ordering here is INVERTED

The usual TDD rule ("write the test, watch it fail, then implement") **does not apply to T004–T007**, and following it would destroy the only real safeguard in this phase.

`sidebar.component.spec.ts` is written to capture what the sidebar renders **today**, before any production line is touched. It **MUST PASS on first run against the unmodified component.** A failure there does not mean "good, now implement" — it means the expected menu was written from intent rather than measured from reality, and it must be corrected against the real DOM before proceeding.

Why: Principle III's claim is "existing roles see an identical menu." If the expectation and the refactor are authored together, they can be wrong in the same way and the suite still passes. Writing the expectation against pre-change code makes it a *measurement*. See [research.md R5](./research.md).

Tests that follow the normal fail-first rule: T014–T016 (US2), T018–T019 (US3), T020–T022 (US4). Those describe behavior that does not exist yet.

---

## Phase 1: Setup

**Purpose**: Confirm the toolchain runs and record the starting state, so any later failure is attributable.

- [X] T001 Verify the frontend test runner is green before any change: run `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` and **record the actual passing count** — that measured number is the baseline T025 compares against. (Historical reference from the Phase-2 note: ~84. A different number is not by itself a problem; a *red* suite is.) → **Measured: 84/84 green.**
- [X] T002 [P] Verify the backend suite is green before any change: run `npm test` in `Backend/` and **record the actual passing count** — the baseline T027 compares against. (Historical reference: ~492 across 24 files. Same caveat as T001.) → **Measured: 505/505 green, 24 files.** (First attempt raced with the T022 edit landing mid-run and read 507; caught via `git show HEAD:...` showing 10 `it()` blocks vs. 12 in the working copy, and confirmed clean by stashing the one changed test file and re-running — see T027.)
- [X] T003 [P] Confirm the change budget is understood: re-read [contracts/navigation-matrix.md §5](./contracts/navigation-matrix.md) — exactly four **code** files may be modified (`frontend/src/app/layout/sidebar/sidebar.component.ts`, `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`, `frontend/src/app/core/auth/role.guard.spec.ts`, `Backend/tests/roles/proScoutRoleDefinition.test.js`), plus this feature's own `specs/` artifacts and the `docs/scout-pro-plan-v2.md` execution note from T030

**Checkpoint**: Both suites green, baseline counts recorded (84 frontend / 505 backend).

---

## Phase 2: Foundational — Baseline Capture (BLOCKING)

**Purpose**: Measure the pre-change menu. This is the phase the entire Principle III guarantee rests on.

**⚠️ CRITICAL**: No production line of `sidebar.component.ts` may be edited until T007 passes. If T007 fails, fix the *expectation*, not the component.

- [X] T004 Create `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` with a `setup(role)` harness modeled on `frontend/src/app/features/players/player-list/player-list.component.spec.ts`: `TestBed` + `provideRouter([])` + `provideTranslateService({ lang: 'en', fallbackLang: 'en' })` + an `AuthService` stub. The stub MUST derive `currentUser`, `isAdmin`, `isCoach`, and `isObserver` from a single `role` argument so it cannot express a state that is impossible in production ([research.md R5](./research.md))
- [X] T005 Add a helper in `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` that reads the ordered `href` values of the sidebar `<nav>` anchors — assert on destinations, not on label text (translate resolves keys to raw key strings under test)
- [X] T006 Add the three baseline cases to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` per [contracts/navigation-matrix.md §2](./contracts/navigation-matrix.md): admin → 6 hrefs, coach → 4, observer → 4, each asserting exact sequence **and** exact count. While writing them, confirm against [contracts/navigation-matrix.md §3](./contracts/navigation-matrix.md) that every destination listed for a role is one that role can actually activate — all 14 already are, which is what makes FR-015 true for the existing roles
- [X] T007 Run `npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts'` in `frontend/` against the **unmodified** component and confirm all three cases pass. **Do not proceed while red.** In particular, confirm the coach and observer cases do **not** expect `/users`/`/observers`/`/age-groups`, and the admin case does **not** expect `/my-matches` ([contracts/navigation-matrix.md §1](./contracts/navigation-matrix.md), row 6) → **Confirmed: 3/3 baseline cases green against the unmodified component; 5 not-yet-implemented cases (proScout, deny-by-default, DOM-absence) failed as expected.**

**Checkpoint**: The expected menus are now measured facts, not assertions of intent. The refactor may begin.

---

## Phase 3: User Story 1 — Existing roles see an unchanged menu (Priority: P1) 🎯 MVP

**Goal**: Replace the hand-written, individually-gated links with a data-driven menu while producing byte-identical output for admin, coach, and observer.

**Independent Test**: The spec file from Phase 2, **unmodified**, still passes after the refactor.

### Implementation for User Story 1

- [X] T008 [US1] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, update the `NavItem` interface per [data-model.md](./data-model.md): rename `label` → `labelKey`, narrow `icon` to the `NavIcon` union (`'dashboard' | 'players' | 'coaches' | 'observers' | 'age-groups' | 'my-matches' | 'profile'`), and type `roles` as `readonly UserRole[]`
- [X] T009 [US1] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, add `const NAV_ITEMS: readonly NavItem[]` with the seven entries **in the render order and with the exact role sets** given in [contracts/navigation-matrix.md §1](./contracts/navigation-matrix.md) — proScout omitted for now; it arrives in US3
- [X] T010 [US1] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, add `readonly visibleNavItems = computed(...)` filtering `NAV_ITEMS` by `this.auth.currentUser()?.role`, returning `[]` when the role is absent or matches no entry ([data-model.md](./data-model.md) derivation table)
- [X] T011 [US1] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, replace the seven hand-written `<a>` blocks with one `@for` over `visibleNavItems()`, preserving the anchor's classes, `routerLinkActive="sidebar-active"`, and `(click)="onNavClick()"` verbatim; render each icon via `@switch (item.icon)` with the **existing SVG literals moved character-for-character, never retyped or normalised** ([research.md R2](./research.md))
- [X] T012 [US1] Verify nothing outside the menu moved in `frontend/src/app/layout/sidebar/sidebar.component.ts`: the logo header, the mini-pitch block with its `isAdmin() && isPlayersActive()` condition (FR-010), the user-info footer, and the `styles` array are untouched; `STATUS_CHILDREN` and `statusChildren` remain unrendered (FR-011)
- [X] T013 [US1] Re-run `npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts'` in `frontend/` with the Phase 2 spec **unedited**. All three baseline cases must still pass. If a case now fails, the refactor changed behavior — fix the component, never the expectation → **Confirmed: 8/8 pass (3 baseline unchanged + 5 that previously failed now pass, ahead of their own phases).**

**Checkpoint**: The mechanism is fully replaced and existing roles are provably unaffected. This is the MVP: shippable alone, with proScout still seeing the old ungated menu.

---

## Phase 4: User Story 2 — Unpermitted entries are hidden by default (Priority: P1)

**Goal**: Prove the default is now "hidden unless named", so a future role added to the system and forgotten here inherits nothing.

**Independent Test**: A role that appears on no entry, and a null user, each render zero menu entries.

**Note**: The *mechanism* arrived with T010. This phase's tasks are the tests that lock it — these follow the normal fail-first rule if written before T010, and are simply green after it. Either order is acceptable; what matters is that they exist and would fail if T010 were reverted.

- [X] T014 [P] [US2] Add a case to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`: a signed-in user whose role is not named on any entry (e.g. `'auditor'` cast through `as UserRole`) renders **0** anchors (FR-003, SC-007)
- [X] T015 [P] [US2] Add a case to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`: `currentUser()` is `null` renders **0** anchors, covering both the signed-out state and the pre-session-restore first paint (FR-003, [research.md R8](./research.md))
- [X] T016 [US2] Add an assertion to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` that a hidden entry is **absent from the DOM**, not merely disabled or hidden by CSS — assert on anchor count, not on visibility styling (FR-002, [data-model.md](./data-model.md) "what is deliberately absent")

**Checkpoint**: Deny-by-default holds on the frontend and is enforced by a test that fails if the default is ever re-inverted.

---

## Phase 5: User Story 3 — ProScout sees only what it can actually use (Priority: P1)

**Goal**: proScout gets exactly two entries — Players and Profile — with no entry leading to a destination the role is refused.

**Independent Test**: Render the sidebar as proScout; exactly `/players` and `/profile` appear.

- [X] T017 [US3] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, add `'proScout'` to the `roles` array of **exactly two** `NAV_ITEMS` entries: Players and Profile. Add it to no other entry — Dashboard and My Matches are withheld by DF-001/DF-002, and Age Groups is barred permanently by FR-008
- [X] T018 [US3] Add a case to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`: proScout renders exactly **2** anchors, in order `/players`, `/profile` (FR-007, SC-002)
- [X] T019 [US3] Add a negative case to `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` asserting that a proScout menu contains **no** `/age-groups`, `/users`, `/observers`, `/dashboard`, or `/my-matches` anchor — this is the assertion that fails the day someone adds proScout to the wrong entry (FR-008, FR-015)

**Checkpoint**: proScout's menu is correct and self-consistent — every entry shown leads somewhere the role can open.

---

## Phase 6: User Story 4 — Direct navigation to administration areas is refused (Priority: P2)

**Goal**: Prove the doors are locked independently of the menu — in the browser, and on the server.

**Independent Test**: Guard cases return a `UrlTree` to `/unauthorized`; backend cases record the server's actual decision per area.

**No production code changes in this phase.** The enforcement already exists ([research.md R6](./research.md)); the deliverable is executable proof.

- [X] T020 [P] [US4] Add proScout cases to `frontend/src/app/core/auth/role.guard.spec.ts` following the existing `runRoleGuard` pattern: a proScout user against `roleGuard(['admin'])` returns a non-`true` result whose `.toString()` is `/unauthorized` — one case per administration area (`/users`, `/observers`, `/age-groups`), so a future landing-map change breaks all three visibly (FR-012, FR-013, SC-005)
- [X] T021 [P] [US4] Widen the allowed-roles type in the `runRoleGuard` helper of `frontend/src/app/core/auth/role.guard.spec.ts` from `('coach' | 'admin')[]` to `UserRole[]` so the new cases typecheck without changing any existing case's behavior
- [X] T022 [US4] Add a `GET /ages` reality-record test to `Backend/tests/roles/proScoutRoleDefinition.test.js`: assert **200 with a proScout token** and **200 with no token at all**. Comment it with Constitution **C-3** and **TODO(AGES_UNAUTHENTICATED_READ)**, stating plainly that `ageGroupRouter.js:113,116` mount these reads with no `protect`, so `allowedTo` has no `req.user` to reject, and that the test records reality so nobody mistakes the missing menu entry for a locked door (FR-014, [contracts/navigation-matrix.md §4](./contracts/navigation-matrix.md))
- [X] T023 [US4] Confirm — do **not** add — that `GET /users` already returns 403 for proScout at `Backend/tests/roles/proScoutRoleDefinition.test.js:53`, and add a one-line comment there noting it covers the `/observers` page too, since that page injects the same `UserService` and has no endpoint of its own ([contracts/navigation-matrix.md §4](./contracts/navigation-matrix.md))
- [X] T024 [US4] Run `npm test -- tests/roles/proScoutRoleDefinition.test.js` in `Backend/` and confirm green → **Confirmed: 12/12 pass (10 pre-existing + 2 new `GET /ages` cases).**

**Checkpoint**: Every claim about denial is backed by a status code, and the one place the server does *not* deny is on the record rather than assumed away.

---

## Phase 7: Polish & Gates

- [X] T025 Run the full frontend suite: `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` — green, with the count equal to **the number measured in T001** plus the newly added cases → **Confirmed: 95/95 (84 baseline + 8 sidebar.component.spec.ts + 3 new role.guard.spec.ts cases).**
- [X] T026 [P] Run the frontend build: `npm run build` in `frontend/` — success. This also proves the type-level guarantee: a role name in `NAV_ITEMS` outside the generated `UserRole` union is a compile error ([research.md R4](./research.md)) → **Confirmed: exit 0.** Two pre-existing bundle-size budget warnings (unrelated to this change) remain; no new warnings.
- [X] T027 [P] Run the full backend suite: `npm test` in `Backend/` — green, count equal to **the number measured in T002** plus the case added by T022. Confirm `Backend/tests/isolation.test.js` passes **unmodified** → **Confirmed: 507/507 (505 baseline + 2 new `GET /ages` cases), 24 files, `isolation.test.js` untouched.** (A first full-suite run raced with the T022 edit and read 507 both "before" and "after"; re-verified honestly by stashing the one changed test file, confirming 505 against the true pre-edit state, then restoring it — see T002.)
- [X] T028 Verify the **code** diff stays inside the budget in [contracts/navigation-matrix.md §5](./contracts/navigation-matrix.md): run `git diff --name-only` and confirm that, ignoring `specs/004-role-based-navigation/**` and `docs/scout-pro-plan-v2.md` (both expected to change), only the four listed code files appear — in particular no `app.routes.ts`, no `role.guard.ts`, no `role-landing.service.ts`, no `Backend/` production source, no `openapi.json`, no `api.generated.ts`, no i18n files → **Confirmed via `git status --short`: exactly the four code files, plus the two expected documentation paths.**
- [X] T029 Walk [quickstart.md](./quickstart.md) end to end and confirm each "What done looks like" row → **Confirmed** (§1–§5 all correspond to the executed T007/T013/T020/T022/T025/T026 runs above; §6 manual browser smoke check left to the user, see completion report).
- [X] T030 Append a Stage-3 execution note to `docs/scout-pro-plan-v2.md` under المرحلة 3, in the style of the Stage-1 and Stage-2 notes: record that the plan's "4 عناصر بالضبط" acceptance criterion was reduced to **2** by owner decision, that DF-001 (Dashboard → Phase 5) and DF-002 (My Matches → Phase 6) are binding follow-ups each naming the exact edit its phase must make, that the plan's reference to "فروع status للأدمن، سطر 138" describes code that is dead and unrendered (line 138 is the mini-pitch), that admin does not see My Matches today and this was reproduced verbatim rather than fixed, and that `GET /ages` could not be proven denied because it carries no `protect` (C-3)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Baseline Capture)**: depends on Phase 1. **BLOCKS every production edit.** T007 is a hard gate
- **Phase 3 (US1)**: depends on T007 passing
- **Phase 4 (US2)**: depends on T010 (the derivation) existing
- **Phase 5 (US3)**: depends on T009 (the `NAV_ITEMS` constant) existing
- **Phase 6 (US4)**: independent of Phases 3–5 — touches different files entirely and can run at any point after Phase 1
- **Phase 7 (Gates)**: depends on everything

### Story Independence

An honest caveat, since the template assumes independent slices: **US1, US2, and US3 share one refactor and are not separately deployable.** US1 delivers the mechanism (T008–T011); US2 and US3 are a handful of tests and a two-word data edit riding on it. Shipping US1 alone is coherent (existing roles unchanged, proScout still on the old ungated menu). Shipping US2 or US3 without US1 is not meaningful.

**US4 is genuinely independent** — different files, no shared code, verifiable on its own.

### Within Each Story

- Phase 2's tests must **pass** before implementation (inverted — see the warning at the top)
- Phase 4/5/6 tests follow the normal rule: they describe behavior that does not yet exist
- Data (`NAV_ITEMS`) before derivation (`visibleNavItems`) before template

### Parallel Opportunities

- T002, T003 in parallel
- T014, T015 in parallel (independent cases in one file — coordinate the edit)
- T020, T021 in parallel with the whole of Phases 3–5 (different files)
- T026, T027 in parallel

---

## Parallel Example: Phase 6 alongside Phase 3

```bash
# Developer A — the refactor (frontend/src/app/layout/sidebar/)
Task: "T008–T013 — NavItem, NAV_ITEMS, visibleNavItems, template loop, re-verify baseline"

# Developer B — the proof (frontend/src/app/core/auth/, Backend/tests/roles/)
Task: "T020–T024 — proScout guard cases and the GET /ages reality record"
```

No file overlap between the two lanes.

---

## Implementation Strategy

### MVP (Phases 1–3)

1. Setup + record baseline counts
2. **Baseline capture — T007 must be green against untouched code**
3. Refactor; re-run the same spec unedited
4. **STOP and VALIDATE**: existing roles provably unchanged. Shippable here

### Incremental Delivery

1. Phases 1–3 → mechanism replaced, Principle III proven → ship
2. Phase 4 → deny-by-default locked by test → ship
3. Phase 5 → proScout's two entries → ship
4. Phase 6 → server- and guard-side proof → ship
5. Phase 7 → gates + the execution note that Phases 5 and 6 will read

---

## Notes

- **The single most important line in this file** is T007: the baseline spec passing against unmodified code. Everything else is ordinary work.
- Do not "fix" the admin/My-Matches asymmetry (matrix §1, row 6) — Principle III forbids it here.
- Do not add `protect` to `/ages` — C-3 reserves it as separate tech debt.
- Do not delete `STATUS_CHILDREN` — unrelated dead code, and removing it widens the diff a human must review line by line.
- SVG literals are **moved**, never retyped.
- Commit after each checkpoint.
