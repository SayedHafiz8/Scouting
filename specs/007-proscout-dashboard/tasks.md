---

description: "Task list for ProScout Dashboard (Stage 5)"
---

# Tasks: ProScout Dashboard

**Input**: Design documents from `/specs/007-proscout-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **MANDATORY, not optional.** Constitution Principle VI requires a positive *and* a negative test for every permission, and Principle III requires regression proof for every existing role. A test task in this list is not a nice-to-have that can be dropped for time.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are given in every task

## Path Conventions

Web application, two projects: `Backend/` (Express 5, ESM, vitest) and `frontend/` (Angular 21, Karma/Jasmine). Paths below are repo-root-relative.

---

## Phase 1: Setup

**Purpose**: Establish the measured baseline that the final gates compare against. Skipping this makes every "baseline + N" claim later unverifiable.

- [X] T001 Run `npm test` in `Backend/` and record the exact pass count and file count in a scratch note — this is the number T041 compares against ([quickstart.md](./quickstart.md) §0)
- [X] T002 [P] Run `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` and record the exact pass count — this is the number T042 compares against
- [X] T003 [P] Confirm on the current branch that all **three** soon-to-change spec files are **green** before any edit — `core/services/role-landing.service.spec.ts`, `layout/sidebar/sidebar.component.spec.ts`, and `core/auth/role.guard.spec.ts` (7 cases total across them). They assert the pre-Stage-5 state and must be seen passing first, so their later failure is a deliberate edit and not a pre-existing break ([research.md R10](./research.md))

**Checkpoint**: Two numbers written down, and the two soon-to-change specs confirmed green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The backend endpoint and its client plumbing. Both P1 stories consume it — the landing page has nothing to open without it, and the figures have no source.

**⚠️ Note on phase weight**: this phase is unusually large relative to the story phases. That is honest, not a structuring error: the feature is one endpoint and one page, so the endpoint is genuinely a shared prerequisite rather than story-specific work. Splitting it to look balanced would create fake independence.

- [X] T004 Add the `ProScoutDashboard` schema to `Backend/utils/swagger.js`, beside the existing `CoachDashboard` / `ObserverDashboard` definitions, matching the payload in [contracts/dashboard-proscout.md](./contracts/dashboard-proscout.md) — scalars `totalPlayers`, `upcomingMatchesCount`, `totalReports`, plus arrays `upcomingMatches`, `latestResults`, `recentReports`. **No `ageGroup` property at any depth** (FR-005)
- [X] T005 Add a private `getProScoutDashboardData(req)` helper to `Backend/controllers/dashboardController.js`, below `getObserverDashboardData`. It MUST import `playerScopeFor` and `seasonMatchScopeFor` from `../services/scope.js`, and MUST contain no literal `"professional"` and no re-derivation of the professional-team id set (invariant I-1, Principle IV). Run all queries under one `Promise.all`, following the sibling helpers' shape
- [X] T006 In that helper, compose **every** filter as `{ $and: [ scope, <own condition> ] }`. Spreading a scope object is prohibited in this file — measured, a spread whose caller also carries `$and` silently discards the scope and returns the whole premier league ([research.md R1](./research.md), invariant I-2). Use the end-of-today boundary `new Date(new Date().setHours(23,59,59,999))` exactly as the three existing helpers do (invariant I-6, [research.md R7](./research.md))
- [X] T007 In that helper, derive the report filter as authorship **and** player scope — resolve in-scope player ids once, then match `{ coach: req.user._id, player: { $in: ids } }` — and use **the same filter object** for both `totalReports` and `recentReports` (invariant I-4, [research.md R4](./research.md), mirroring `scoutingReportController.js:293-314`)
- [X] T008 In that helper, compute `upcomingMatchesCount` with its own `countDocuments` over the uncapped filter, never as `upcomingMatches.length` — the list is capped at 5 and the stat card must show the true total (invariant I-5)
- [X] T009 In that helper, project the match lists explicitly (`select` / `$project`) so `ageGroup` and `attendees` are excluded. ⚠️ `SeasonMatch` has a `pre(/^find/)` hook that auto-populates `ageGroup`, `homeTeam`, `awayTeam`, and `attendees` on every `find`, so the field arrives unless actively removed ([research.md R6](./research.md), invariant I-7)
- [X] T010 Export `getProScoutDashboard` from `Backend/controllers/dashboardController.js` as an `asyncHandler` returning `res.status(200).json({ status: "success", data })` — the `{ status, data }` envelope used by `getCoachDashboard`/`getObserverDashboard`, **not** the factory's `{ data: { document } }`
- [X] T011 Verify by inspection that T005–T010 added **no** entry to `dashboardCache` and did not touch `ADMIN_OVERVIEW_KEY`, `COACHES_STATS_KEY`, `computeAdminDashboardData`, `getCoachDashboardData`, `getObserverDashboardData`, or the three socket emitters in `Backend/controllers/dashboardController.js`. Per-user scoped data must never share the global cache key — the file's own §11 comment block says so ([research.md R2](./research.md))
- [X] T012 Register the route in `Backend/routes/dashboardRouter.js`: `dashboardRouter.get("/proScout", allowedTo(ROLES.PRO_SCOUT), getProScoutDashboard);` beside `/observer`. Use `ROLES.PRO_SCOUT`, never the string literal (Principle VII). `protect` is already router-wide — do not re-add it
- [X] T013 Add the `/dashboard/proScout` `@swagger` JSDoc block to the existing comment block at the top of `Backend/routes/dashboardRouter.js` (that file documents all operations in one block above the imports), referencing `#/components/schemas/ProScoutDashboard` and documenting 200/401/403
- [X] T014 Run `npm run dump-spec` in `Backend/`, then `npm run gen:types` in `frontend/`. Confirm `openapi.json` gains exactly one operation and one schema, and that `frontend/src/app/core/models/api.generated.ts` regenerates with no unrelated diff (Principle V)
- [X] T015 [P] Add `export type ProScoutDashboard = Required<components['schemas']['ProScoutDashboard']>;` to `frontend/src/app/core/models/dashboard.model.ts`. Derive it from the generated schema the way `CoachDashboard` does — do **not** copy the hand-written `ObserverDashboard` precedent in that same file
- [X] T016 [P] Add `getProScoutDashboard()` to `frontend/src/app/features/dashboard/services/dashboard.service.ts`, returning `this.http.get<ApiResponse<ProScoutDashboard>>(\`${this.base}/proScout\`)`, following the existing `getObserverDashboard()` shape

**Checkpoint**: `GET /api/v1/dashboard/proScout` returns correctly-scoped data to a proScout and 403 to everyone else; the client can call it in a typed way. No page exists yet.

---

## Phase 3: User Story 1 — proScout lands on their own dashboard (Priority: P1) 🎯 MVP

**Goal**: A proScout login ends on `/dashboard/proScout`, and the sidebar offers a Dashboard entry that opens it. This discharges DF-001.

**Independent Test**: Log in as a proScout — the browser lands on `/dashboard/proScout` and the sidebar shows exactly Dashboard, Players, Profile.

### Implementation for User Story 1

- [X] T017 [US1] Create `frontend/src/app/features/dashboard/pro-scout-dashboard/pro-scout-dashboard.component.ts` as a standalone component following the `observer-dashboard/` sibling — `signal`-based `data`/`loading`, `ngOnInit` calling `dashboardService.getProScoutDashboard()`, `StatCardComponent` + `SkeletonLoaderComponent` + `TranslatePipe` imports. Render the three stat cards and three list sections. **Do not** subscribe to `SocketService` — no proScout emitter exists and none is added ([research.md R9](./research.md))
- [X] T018 [US1] Register the route in `frontend/src/app/features/dashboard/dashboard.routes.ts`: path `proScout`, `loadComponent` for the new component, `canActivate: [roleGuard(['proScout'])]` — matching the coach/observer/admin entries exactly. Add it as a sibling entry; leave the trailing `path: ''` landing redirect entry last
- [X] T019 [US1] **Edit in place** the existing `case 'proScout':` in `frontend/src/app/core/services/role-landing.service.ts` to return `['/dashboard/proScout']`, and replace its "temporary until Stage 5" comment block with a note that DF-001 is discharged. ⚠️ Do **not** add a second `case 'proScout'` — two branches for one role in one `switch` means only the first ever runs (DF-001, [research.md R10](./research.md))
- [X] T020 [US1] Add `'proScout'` to the `roles` array of the **Dashboard** entry in `NAV_ITEMS` in `frontend/src/app/layout/sidebar/sidebar.component.ts` (FR-012). Add it to **no other** entry — My Matches stays withheld for DF-002, Age Groups is barred permanently
- [X] T021 [US1] Update `frontend/src/app/core/services/role-landing.service.spec.ts`: flip the proScout assertions from `['/players']` to `['/dashboard/proScout']`, retitle the suite away from "temporary until Stage 5", and keep the "other three roles are untouched" case unchanged (Principle III)
- [X] T022 [US1] Update `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`: proScout now expects `['/dashboard', '/players', '/profile']`; remove `/dashboard` from the proScout negative-contains list while keeping `/age-groups`, `/users`, `/observers`, `/my-matches`; change the DOM anchor count assertion from `2` to `3`
- [X] T023 [US1] Confirm the existing cases in `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` still assert admin = 6 entries and coach/observer = 4 each **in unchanged order** (they already exist at the top of that spec — this is verification, not a new case). This is the SC-006 regression guard and must fail if T020 touches the wrong entry
- [X] T024 [US1] ⚠️ Update `frontend/src/app/core/auth/role.guard.spec.ts` — **three** cases at lines ~100-110 (`/users`, `/observers`, `/age-groups`) assert the refused-proScout landing is `'/players'`. T019 changes that landing, so all three fail. Change them to `'/dashboard/proScout'` and refresh the block comment above them (it currently says "temporary until Stage 5"). **Leave `'never returns true for proScout on an admin-only route, whatever the landing is'` exactly as it is** — that case was written to survive this stage and is the actual security assertion (SC-004)
- [X] T025 [P] [US1] Add a spec at `frontend/src/app/features/dashboard/pro-scout-dashboard/pro-scout-dashboard.component.spec.ts` asserting the component calls `getProScoutDashboard()` on init and renders the returned figures, with `DashboardService` stubbed
- [X] T026 [US1] Update `specs/004-role-based-navigation/spec.md`: (a) FR-007 and SC-002 change from "exactly two entries" to three for proScout; (b) **SC-005** — which claims the three administration areas "end at the unauthorized destination" — is corrected to the role's own landing, since that has been false since Stage 4 (`/players`) and changes again here (`/dashboard/proScout`); (c) DF-001 is marked discharged by this feature with a link to `specs/007-proscout-dashboard/` (FR-013)

**Checkpoint**: A proScout logs in and reaches a working dashboard page through the menu. No document or test still asserts the two-entry menu.

---

## Phase 4: User Story 2 — proScout sees their scoped activity summary (Priority: P1)

**Goal**: Every figure is provably restricted to the role's scope, and no existing role's numbers moved.

**Independent Test**: Seed professional and premier data for two different proScouts, call the endpoint, and confirm each number equals a manual count over the professional-league scope only.

### Tests for User Story 2 (mandatory — Principles III & VI)

- [X] T027 [P] [US2] Create `Backend/tests/roles/proScoutDashboard.test.js` using `tests/helpers/factory.js` fixtures (`createProScout`, `createPlayerDoc`, `createTeam`, `seedAgeGroups`) — never inline `create` calls (Principle VI). Follow the structure of `tests/roles/proScoutDataScope.test.js`
- [X] T028 [US2] **G-1 positive**: `totalPlayers` equals players on professional-league teams **plus** the caller's own `team: null` players, with exact count and content — not merely a 200
- [X] T029 [US2] **G-1 negative**: another proScout's `team: null` player is absent from `totalPlayers`, and a player on a premier-league team is absent
- [X] T030 [US2] **G-2**: a seeded premier-league match contributes to none of `upcomingMatchesCount`, `upcomingMatches`, `latestResults`
- [X] T031 [US2] **G-3**: a match dated **today** appears in `latestResults` and **not** in `upcomingMatches` — the end-of-day boundary, asserted in both directions so it can never land in both or neither (invariant I-6)
- [X] T032 [US2] **G-4**: seed 7 upcoming professional matches → `upcomingMatchesCount === 7` while `upcomingMatches.length === 5` (invariant I-5)
- [X] T033 [US2] **G-5**: a report authored by a different user on an in-scope player appears in neither `totalReports` nor `recentReports`; and a report by the caller on a player outside scope is likewise absent (both axes of invariant I-4)
- [X] T034 [US2] **G-6**: `JSON.stringify(res.body)` does not contain the substring `"ageGroup"`. Assert against the **serialized response body**, not the source — the auto-populate hook means a source review would pass while the payload still carries it (invariant I-7)
- [X] T035 [US2] **G-7 / negative permission**: `GET /dashboard/proScout` returns **403** for admin, coach, and observer. A 200 with zeroes is explicitly **not** acceptable evidence of refusal (Principle I); assert the status code
- [X] T036 [US2] **G-7 regression**: assert `/dashboard/coach`, `/dashboard/observer`, `/dashboard/admin`, and `/dashboard/admin/coaches-stats` return unchanged bodies, and that a proScout receives 403 on all four (Principle III)
- [X] T037 [US2] Run `npm test -- tests/isolation.test.js` in `Backend/` and confirm it passes **with zero edits to that file**. Any required edit is a breaking change needing a documented security review, not a normal merge (Principle III)

### Implementation for User Story 2

- [X] T038 [US2] Bind the three scalars to `StatCardComponent` instances in `pro-scout-dashboard.component.ts` — players, upcoming professional-league matches, reports. ⚠️ Label the match card **"professional league"**, never "attended": unlike the coach/observer dashboards this figure is league-scoped, not attendance-scoped, and an "attended" label will be reported as a bug ([research.md R3](./research.md))
- [X] T039 [US2] Render the `upcomingMatches`, `latestResults`, and `recentReports` lists in the component. Show no age-group column, badge, or heading anywhere (FR-005)

**Checkpoint**: Every number on the page is provably scoped, and the other three dashboards are byte-identical.

---

## Phase 5: User Story 3 — clear empty state (Priority: P2)

**Goal**: A brand-new proScout sees an explicit "nothing yet" per section, not blank panels or an error.

**Independent Test**: Log in as a proScout with zero players, matches, and reports — each of the three sections shows its own message and the counters read 0.

- [X] T040 [P] [US3] Add the new keys to **both** `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/ar.json` under `DASHBOARD` — a title/subtitle pair for this role plus three empty-state messages and the list section headings. Both files in the same task: a key added to one only is a raw key on screen for half the users (Constitution, Quality Gates)
- [X] T041 [US3] Add per-section empty-state rendering to `pro-scout-dashboard.component.ts`: each of the three list sections shows its own translated message when its array is empty, distinct from the loading skeleton, and the stat cards render `0` rather than blank (FR-006). Add a spec case covering the all-empty payload

**Checkpoint**: The first-run experience is explicit rather than ambiguous.

---

## Phase 6: Polish & Gates

- [X] T042 Run the full backend suite `npm test` in `Backend/` — green, at the T001 baseline plus the new cases in `tests/roles/proScoutDashboard.test.js`
- [X] T043 Run the full frontend suite `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` — green, at the T002 baseline plus new cases, counting T021/T022/T024 as **edits** rather than additions (7 pre-existing cases changed, not added)
- [X] T044 [P] Run `npm run build` in `frontend/` — exit 0. This is also the Principle VII type gate: `'proScout'` in a route guard or nav entry is checked against the generated `UserRole` union, so a typo fails the build. Two pre-existing bundle-budget warnings are expected; no new ones
- [X] T045 [P] Confirm [contracts/endpoint-inventory-delta.md](./contracts/endpoint-inventory-delta.md) matches the shipped code — one added operation, 84 total, no other `allowedTo` touched — by grepping `Backend/routes/` for `allowedTo` changes in the branch diff (Principle VI)
- [ ] T046 Walk [quickstart.md](./quickstart.md) §5 and §6 manually in a browser: proScout login lands on the dashboard, sidebar shows exactly three entries, the premier-league control match appears nowhere, no age group is mentioned, `/dashboard/coach` redirects away, and the second empty proScout sees the empty states in both languages
- [X] T047 Write the PR description declaring, per the Constitution's compliance-review rule: which of the three enforcement layers this touched (role gate + list scope; **not** document ownership — no `/:id` path added), that **C-3 remains open and untouched**, and the two deliberate asymmetries with the sibling dashboards — **no caching** ([R2](./research.md)) and **no socket emitter** ([R9](./research.md))

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks US1, US2, and US3**
- **Phase 3 (US1)**: depends on Phase 2
- **Phase 4 (US2)**: depends on Phase 2. Its test half (T027–T037) is independent of US1 and can run alongside it; its two implementation tasks (T038–T039) touch the component created in T017
- **Phase 5 (US3)**: depends on T017 (the component) — in practice, after US1
- **Phase 6 (Polish)**: depends on all desired stories

### Critical path

T001 → T004…T016 (foundational, mostly sequential — same two files) → T017 → T038/T041 → T042/T043 → T046

### Within-file serialization (these are NOT parallel despite touching different concerns)

- T005–T011 all edit `Backend/controllers/dashboardController.js` — sequential
- T012, T013 both edit `Backend/routes/dashboardRouter.js` — sequential
- T017, T038, T039, T041 all edit `pro-scout-dashboard.component.ts` — sequential
- T022, T023 both edit `sidebar.component.spec.ts` — sequential
- T014 must follow T004 and T013 (it regenerates from them), and must precede T015/T016 (which consume the generated types)

### Parallel Opportunities

- T002, T003 in Setup
- T015, T016 after T014 — different files
- T021, T022/T023, T024, T025 are four **different** spec files (`role-landing.service.spec.ts`, `sidebar.component.spec.ts`, `role.guard.spec.ts`, the new component spec) and can be edited in parallel — but all four must follow T019/T020, since they assert what those two tasks change
- **T027–T037 (the whole backend test story) can proceed in parallel with all of Phase 3** — different project, different files, and they only need Phase 2
- T040 alongside any component work — JSON files only
- T044, T045 in Polish

---

## Parallel Example: after Foundational completes

```bash
# Developer A — User Story 1 (frontend routing/nav)
Task: "T017 Create pro-scout-dashboard.component.ts"
Task: "T019 Edit the existing proScout case in role-landing.service.ts"
Task: "T020 Add proScout to the Dashboard NAV_ITEMS entry"

# Developer B — User Story 2 tests (backend), fully independent
Task: "T027 Create Backend/tests/roles/proScoutDashboard.test.js"
Task: "T030 G-2: premier-league match contributes to nothing"
Task: "T034 G-6: no ageGroup in the serialized body"
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1)** — a proScout logs in, lands on their own dashboard, and reaches it from the menu. This is the smallest increment that discharges DF-001 and removes the temporary `/players` landing, and it is independently deployable: the page shows real, already-scoped figures because Phase 2 built the endpoint correctly.

### Incremental delivery

1. Setup + Foundational → endpoint live, 403 for everyone else
2. + US1 → **MVP**: role has a home screen (DF-001 discharged)
3. + US2 → the scoping is *proven*, not just implemented; existing roles proven unmoved
4. + US3 → first-run experience is explicit
5. Polish → gates, inventory, PR declaration

### Do not skip

- **T037** — `isolation.test.js` passing unmodified is the binding contract, not a formality
- **T035** — a 403, not a 200 with zeroes; this is the Principle I proof
- **T034** — asserted on the serialized body, because the auto-populate hook defeats source review
- **T024** — `role.guard.spec.ts` has three assertions that T019 breaks. Missing it fails the blocking frontend CI gate (T043), and its "never returns true" case is the actual SC-004 security assertion — do not weaken it while updating the landing strings around it
- **T026** — leaving Stage 4's spec asserting a two-entry menu (or an `/unauthorized` refusal that stopped being true in Stage 4) is exactly the drift DF-001 was written to prevent

---

## Notes

- `[P]` = different files, no dependency on an incomplete task
- Commit after each task or logical group
- Every scope composition nests in `$and`; spreading a scope object is prohibited in this feature ([research.md R1](./research.md))
- Arabic security commentary in `Backend/` near edited code must be preserved — it documents *why* a constraint exists (Constitution, Quality Gates)
