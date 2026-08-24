---

description: "Task list for Professional League Admin Page"
---

# Tasks: Professional League Admin Page

**Input**: Design documents from `/specs/013-professional-league-admin/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/*.md, quickstart.md

**Tests**: Included for the two backend behavior changes with real regression risk (the
`Team`/`SeasonMatch` `ageGroup` conditional-requirement change, and specifically the crash R6
found and fixed) — Constitution Principle III/VI require regression evidence for exactly this
shape of change. Frontend component specs are included for the same reason the codebase already
tests `sidebar.component.spec.ts` and `pro-scout-dashboard.component.spec.ts` this way.

**Organization**: Tasks are grouped by the four user stories in spec.md, in priority order
(US1=P1, US2=P2, US3=P2, US4=P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US4)

## Path Conventions

Web app layout per plan.md: `Backend/` (Express/Mongoose) + `frontend/` (Angular). Paths below are
repo-relative from `e:\Work\Talent-Radar - Copy`.

---

## Phase 1: Setup

- [X] T001 Run `npm test` in `Backend/` and confirm the full suite (including `tests/isolation.test.js`) is green before any change — baseline for the Polish-phase regression check. No file changes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The route, sidebar entry, and page shell are the one thing all four user stories'
acceptance scenarios depend on ("admin opens the new page…") — none of the stories can be
independently tested without this existing first.

**⚠️ CRITICAL**: No user story task can begin until T002–T006 are complete.

- [X] T002 In `frontend/src/app/app.routes.ts`, add a new child route `professional-league` (alongside the existing `observers`/`age-groups` entries, `app.routes.ts:24-37`) with `canActivate: [roleGuard(['admin'])]`, `loadChildren` pointing at a new `features/professional-league/professional-league.routes.ts`.
- [X] T003 [P] In `frontend/src/app/layout/sidebar/sidebar.component.ts`, add `'professional-league'` to the `NavIcon` union (line 10), a new `NAV_ITEMS` entry `{ labelKey: 'NAV.PROFESSIONAL_LEAGUE', icon: 'professional-league', route: '/professional-league', roles: ['admin'] }` positioned between the `NAV.OBSERVERS` and `NAV.AGE_GROUPS` rows (line 26/27), and a new `@case ('professional-league')` in the icon `@switch` (lines 62-103) with a stroke-style SVG consistent with the existing set — exact icon choice subject to the T046 design review, a reasonable placeholder is acceptable now.
- [X] T004 [P] In `frontend/src/app/layout/sidebar/sidebar.component.spec.ts`, update the admin menu href assertion (line 65) to insert `'/professional-league'` between `'/observers'` and `'/age-groups'` in the expected array.
- [X] T005 Create `frontend/src/app/features/professional-league/professional-league.routes.ts` (default route → new page component) and `frontend/src/app/features/professional-league/professional-league-page/professional-league-page.component.ts` — a page shell with three empty sections (proScouts / teams / matches), mirroring `age-group-detail.component.ts`'s section-card structure (`card p-5 md:p-6` blocks) but with no age-group context. Each user story phase below fills in its own section.
- [X] T006 [P] Add `"NAV": { "PROFESSIONAL_LEAGUE": "Professional League" }` (merge into the existing `NAV` object) and a new top-level `"PROFESSIONAL_LEAGUE": { "TITLE": ..., "SUBTITLE": ... }` namespace to both `frontend/src/assets/i18n/en.json` and `frontend/src/assets/i18n/ar.json` — page-level copy only; section-specific keys are added in each story's phase.

**Checkpoint**: `/professional-league` is reachable by admin only, shows an empty three-section shell, and is listed correctly in the sidebar. User story work can begin.

---

## Phase 3: User Story 1 - Admin manages proScout accounts (Priority: P1) 🎯 MVP

**Goal**: Admin can view, add, and inspect proScout accounts from the new page, reusing the
existing coach/observer account UI.

**Independent Test**: Log in as admin, open the new page, see the proScouts list, add a new one,
open its detail view, confirm the new proScout can log in.

### Implementation for User Story 1

- [X] T007 [US1] In `frontend/src/app/features/professional-league/professional-league.routes.ts`, add child routes `pro-scouts/new`, `pro-scouts/:userId/edit` (→ `UserFormComponent`) and `pro-scouts/:userId` (→ `UserDetailComponent`), mirroring `observers.routes.ts:8-19` exactly.
- [X] T008 [US1] In `frontend/src/app/features/users/user-form/user-form.component.ts`, add `'proScout'` to the query-param role whitelist (`ngOnInit`, line 374: `roleParam === 'observer' || roleParam === 'admin' || roleParam === 'coach'`) so `/professional-league/pro-scouts/new?role=proScout` preselects it, matching how `/observers/new?role=observer` already works.
- [X] T009 [US1] In the same file, extend `submit()`'s `dest()` closure (lines 419-423) from a binary (`observer` → `/observers`, else → `/users`) to a three-way branch: `observer` → `/observers`, `proScout` → `/professional-league`, else → `/users`. Do not change the `admin`/`coach` else-branch behavior.
- [X] T010 [US1] In `frontend/src/app/features/users/user-detail/user-detail.component.ts`, generalize `isObserverCtx`/`isCoachCtx` (lines 393-394) to a three-way `contextGroup` computed (`'observers' | 'coaches' | 'proScouts'`), updating every consumer (title/breadcrumb at lines 21-22, edit/cancel links at line 149/214-equivalent, translation group at line 339) to branch on it. For the `'proScouts'` case: breadcrumb/back-link → `/professional-league`, title → a new `PROSCOUTS.TITLE` key, and the "view players"/"view dashboard" quick action (lines ~167-169, ~403) is **hidden entirely** (no admin-facing proScout dashboard drill-down exists — do not invent one).
- [X] T011 [P] [US1] In `frontend/src/assets/i18n/en.json` and `ar.json`, add a `PROSCOUTS` namespace mirroring the existing `OBSERVERS` namespace shape exactly (`TITLE`, `SUBTITLE`, `ADD`, `ROLE_BADGE`, `EMPTY`, `EMPTY_MSG`, `DEACTIVATE_TITLE`, `DEACTIVATE_MSG`, `FORM.ADD_TITLE`, `FORM.EDIT_TITLE`).
- [X] T012 [US1] In `professional-league-page.component.ts`, implement the proScouts section: list via `UserService.getAll({ sort: 'name', role: 'proScout' })` (mirroring `observer-list.component.ts:143`), an "Add proScout" action linking to `['/professional-league/pro-scouts/new']` with `queryParams: { role: 'proScout' }`, each row navigating to `/professional-league/pro-scouts/:id`, and an empty-state matching `observer-list.component.ts`'s pattern (`app-empty-state`).
- [X] T013 [P] [US1] Create `professional-league-page.component.spec.ts` covering: the proScouts list renders fetched users, the "Add proScout" link carries the correct `queryParams`, and the empty state shows when the list is empty.
- [X] T014 [P] [US1] Extend `frontend/src/app/features/users/user-form/user-form.component.spec.ts` (or create it if it does not yet exist) with: navigating with `?role=proScout` preselects the proScout role, and submitting a proScout creation redirects to `/professional-league`.

**Checkpoint**: User Story 1 is fully functional and independently testable — proScout account management works end-to-end from the new page.

---

## Phase 4: User Story 2 - Admin manages professional-league teams (Priority: P2)

**Goal**: Admin can add, view, and remove professional-league teams from the new page, with no
age-group prompt.

**Independent Test**: Log in as admin, open the new page, add a professional-league team without
being asked for an age group, see it in the list, remove it.

### Tests for User Story 2

> Contract: `contracts/teams-professional.md`. Write first; they fail until T015-T017 land.

- [X] T015 [P] [US2] Create `Backend/tests/roles/teamProfessionalAgeGroup.test.js`: (a) `POST /teams` with `league: "professional"` and no `ageGroup` → `201`, saved document has no `ageGroup`; (b) `POST /teams` with `league: "premier"` and no `ageGroup` → `422`, same message as today (regression); (c) `DELETE /teams/:id` on a professional team works unchanged.

### Implementation for User Story 2

- [X] T016 [P] [US2] In `Backend/models/teamModel.js`, remove `required: true` from the `ageGroup` field definition (lines 9-13) and add `pre('save')`/`pre('findOneAndUpdate')` hooks mirroring `Backend/models/playedModel.js:207-237`: if `league === 'professional'`, set `ageGroup = undefined`; otherwise, throw if `ageGroup` is absent (explicit check, matching today's requirement exactly for `premier`).
- [X] T017 [US2] In `Backend/utils/validation/teamValidation.js`, make `createValidate`'s custom `ageGroup` check (lines 38-58) conditional on `req.body.league !== 'professional'` — skip the lookup/requirement entirely for professional teams; leave the `premier` path (including the nested-route `req.params.id` fallback) unchanged. Depends on T016 landing first so the model-level hook is the authoritative enforcement point.
- [X] T018 [P] [US2] In `Backend/utils/swagger.js`, add `nullable: true` to the `Team` schema's `ageGroup` property (line 83).
- [X] T019 [US2] Create `Backend/scripts/unsetProfessionalTeamAgeGroup.js`, mirroring `Backend/scripts/backfillPlayerCreatedBy.js`'s structure exactly (dry-run by default, `--apply` to write, cursor + batched `bulkWrite`, connection via `config.env`): clears `ageGroup` on every `Team` document with `league: "professional"` that currently has one. Document in the header that rollback is not meaningful (the pre-migration value was itself an accident of creation context, not a value worth restoring).
- [X] T020 [P] [US2] In `Backend/package.json`, add `"unset-professional-team-agegroup": "node scripts/unsetProfessionalTeamAgeGroup.js"` alongside the existing `backfill-player-createdby` script.
- [X] T021 [US2] Run `npm run dump-spec` in `Backend/` then `npm run gen:types` in `frontend/`; confirm the diff is limited to `Team.ageGroup` gaining `nullable: true`. Depends on T018.
- [X] T022 [P] [US2] In `frontend/src/app/core/models/team.model.ts`, make `ageGroup` optional (`ageGroup?: string`).
- [X] T023 [US2] In `frontend/src/app/features/teams/services/team.service.ts`, make `create()`'s payload type `ageGroup` optional. Depends on T022.
- [X] T024 [US2] In `professional-league-page.component.ts`, implement the teams section: list via `TeamService.getAll(undefined, 'professional')`, an inline create form (name + clubName only, no age-group picker — mirroring `age-group-detail.component.ts`'s team-form pattern, lines 118-132, minus the age-group field), and delete-with-confirmation via `TeamService.delete()` (mirroring `age-group-detail.component.ts`'s `teamDeleteTarget`/`doDeleteTeam` pattern, lines 151, 494-501, 800-807).
- [X] T025 [P] [US2] Extend `professional-league-page.component.spec.ts` with: creating a team sends no `ageGroup` in the payload, the teams list only shows professional-league teams, delete removes a team from the list, and — if `TeamService.delete()` surfaces a guard error for teams with attached players/fixtures (confirm at implementation time) — that error is displayed rather than silently removing the row (spec.md Edge Cases, existing deletion guardrails must remain reachable from the new page).
- [X] T026 [P] [US2] Reuse the existing `TEAMS.*` i18n keys already used by `age-group-detail.component.ts` (no new keys expected — confirm at implementation time whether any professional-context-specific copy is needed, e.g. a subtitle, and add only that to `en.json`/`ar.json` if so).

**Checkpoint**: User Stories 1 AND 2 both work independently — professional-league team management is live with no age-group prompt, and premier-league team creation is unchanged (T015b).

---

## Phase 5: User Story 3 - Admin manages professional-league matches (Priority: P2)

**Goal**: Admin can schedule, edit, and record results for professional-league fixtures from the
new page, with no age-group prompt — and without the crash R6 identified.

**Independent Test**: With at least two professional-league teams (from US2), log in as admin,
open the new page, schedule a fixture between them, edit it, record a result.

### Tests for User Story 3

> Contract: `contracts/season-matches-professional.md`. T030 is the specific regression test for
> the crash found in `research.md` R6 — write it first; it must fail (as a `500`, not a `422`)
> against pre-T027/T028 code, then pass after.

- [X] T027 [P] [US3] In `Backend/models/seasonMatchModel.js`, remove `required: true` from `ageGroup` and add `pre('save')`/`pre('findOneAndUpdate')` hooks mirroring T016's `Team` treatment exactly: if the fixture's `league === 'professional'`, clear `ageGroup`; otherwise require it explicitly, unchanged from today.
- [X] T028 [US3] In `Backend/utils/validation/seasonMatchValidation.js`, fix `teamBelongsToMatchAgeGroup` (lines 54-71): skip the `team.ageGroup.toString() !== matchAgeGroup.toString()` comparison (line 64) entirely when `matchLeague === 'professional'` (or defensively, whenever `team.ageGroup` is absent) — this must be an explicit skip ("no constraint here for professional fixtures"), not merely wrapped to avoid throwing. Depends on T027.
- [X] T029 [P] [US3] In `Backend/utils/swagger.js`, locate the schema property describing `SeasonMatch.ageGroup` (confirm exact schema name/location — not a literal `SeasonMatch:` block per a first pass, likely composed under a different response shape) and add `nullable: true`.
- [X] T030 [US3] Create `Backend/tests/roles/seasonMatchProfessionalAgeGroup.test.js`: (a) `POST /seasonMatches` with `league: "professional"`, two professional teams, no `ageGroup` → `201`, not `500` (the crash regression — assert this explicitly, e.g. with a comment naming R6); (b) same for `PATCH /seasonMatches/:id`; (c) `POST /seasonMatches` with `league: "premier"` and no `ageGroup` → still `422`, unchanged message; (d) the existing home/away-team-age-group-match check still rejects a mismatched premier fixture; (e) `teamBelongsToMatchAgeGroup`'s league check still rejects a professional team paired into a premier fixture. Depends on T027, T028.
- [X] T031 [US3] Run `npm run dump-spec` in `Backend/` then `npm run gen:types` in `frontend/`; confirm the diff is limited to the `SeasonMatch`-shaped schema's `ageGroup` gaining `nullable: true` plus T021's earlier `Team` change. Depends on T029.
- [X] T032 [P] [US3] In `frontend/src/app/core/models/season-match.model.ts`, make `ageGroup` optional on the payload type used for professional-league creation/edit (confirm exact type name, e.g. `SeasonMatchPayload`).
- [X] T033 [US3] In `frontend/src/app/features/season-matches/services/season-match.service.ts`, update the payload type to match T032 if the service itself declares its own type rather than importing the model's.
- [X] T034 [US3] In `professional-league-page.component.ts`, implement the matches section: list via `SeasonMatchService.getAll({ league: 'professional' })`, create/edit form (season/matchDate/homeTeam/awayTeam/venue, no age-group picker) and result entry, mirroring `age-group-detail.component.ts`'s match-form section (lines 178-344, 810-862) with the age-group field and dependency removed, and the home/away team dropdowns sourced from the teams section's professional-league team list (T024).
- [X] T035 [P] [US3] Extend `professional-league-page.component.spec.ts` with: creating a fixture sends no `ageGroup`, the matches list only shows professional-league fixtures, editing and result entry work.
- [X] T036 [P] [US3] Reuse the existing `SEASON_MATCHES.*` i18n keys already used by `age-group-detail.component.ts`; add only professional-context-specific copy if needed, to both `en.json` and `ar.json`.

**Checkpoint**: User Stories 1, 2, AND 3 all work independently — the "one integrated place" promise (teams + fixtures + proScouts) is complete, and the crash R6 identified is closed and regression-tested.

---

## Phase 6: User Story 4 - Admin dashboard shows proScout headcount (Priority: P3)

**Goal**: The existing coach/observer count card on the admin dashboard gains a third,
same-colored proScout figure.

**Independent Test**: Log in as admin, view the dashboard, confirm the card shows three figures
(Coaches/Observers/ProScouts) in the same visual style, matching the actual counts.

### Tests for User Story 4

> Contract: `contracts/admin-dashboard-proscouts.md`.

- [X] T037 [P] [US4] Extend `Backend/tests/dashboardCache.test.js` (or the appropriate existing admin-dashboard test file) with: `GET /dashboard/admin` returns `totalProScouts` matching an independently-counted `User.countDocuments({ role: 'proScout' })`, and every other admin dashboard figure (`totalPlayers`, `selectedPlayers`, `totalReports`, `totalMedia`, `totalCoaches`, `totalObservers`, `totalMatchesPlayed`, `topCoaches`, `selectionRate`) is byte-identical to before (FR-010).

### Implementation for User Story 4

- [X] T038 [P] [US4] In `Backend/controllers/dashboardController.js`'s `computeAdminDashboardData` (lines 83-155), add `User.countDocuments({ role: ROLES.PRO_SCOUT })` to the `Promise.all` alongside the existing `totalCoaches`/`totalObservers` queries (lines 102-103), and return it as `totalProScouts`.
- [X] T039 [P] [US4] In `Backend/utils/swagger.js`'s `AdminDashboard` schema (lines 228-241), add `totalProScouts: { type: "integer" }`.
- [X] T040 [US4] Run `npm run dump-spec` in `Backend/` then `npm run gen:types` in `frontend/`; confirm the diff is limited to `AdminDashboard` gaining `totalProScouts` plus the T021/T031 changes already made. Depends on T038, T039.
- [X] T041 [P] [US4] In `frontend/src/app/core/models/dashboard.model.ts`, add `totalProScouts: number` to `AdminDashboard` if it is not already covered by the `Required<components['schemas']['AdminDashboard']>` derivation (confirm at implementation time; add explicitly only if needed).
- [X] T042 [US4] In `frontend/src/app/features/dashboard/admin-dashboard/admin-dashboard.component.ts`, extend the hand-built Coaches/Observers card (lines 83-106) to a third column: duplicate the `flex-1 min-w-0` block (lines 94-98/100-103) and the `width:1px` divider (line 99) for `adminData()!.totalProScouts`, using the exact same `#f472b6`/`rgba(236,72,153,…)` color already on the card — no new color, no new shared component.
- [X] T043 [P] [US4] Update the `[attr.aria-label]` on the card's `role="group"` wrapper (line 83) to include the proScout count alongside coaches/observers.

**Checkpoint**: All four user stories are independently functional. The full feature is complete.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T044 [P] Run the full `npm test` suite in `Backend/`; confirm `tests/isolation.test.js` passes unmodified, and no existing test (particularly premier-league team/fixture creation, wherever it lives today) changed assertions. — 739/739 passed (35 files), including `tests/isolation.test.js` unmodified.
- [X] T045 [P] Run `npx ng test --watch=false --browsers=ChromeHeadless` in `frontend/` for the full suite; confirm `sidebar.component.spec.ts`, `user-form.component.spec.ts`, `user-detail.component.spec.ts` (if it exists), and any existing `age-group-detail.component.spec.ts` pass with the expected, intentional changes only (T004, T014, T010's consumers). — 178/178 passed.
- [X] T046 Run the `ui-ux-pro-max` skill against the new page and the updated dashboard card before considering the feature visually complete (FR-011, spec Assumptions "Design review before build") — review against `frontend/src/styles.scss`'s token system, not as a substitute for it. **Hard gate, like T030 — FR-011 is a MUST, not optional polish; do not mark this feature done under schedule pressure without it.** — Reviewed against `styles.scss` tokens: `.card`/`.btn-*`/`.form-input` classes, CSS custom properties (`--bg-secondary`, `--text-primary/secondary/muted`, `--border-color/subtle`), 24x24 stroke-width:2 SVG icon convention, and the existing pink dashboard color reused verbatim (no 4th color introduced) — all confirmed consistent, no raw hex/ad-hoc styling found. See chat for full findings.
- [ ] T047 Perform the manual browser walkthrough in `quickstart.md` §5 (not automatable — needs live dev servers and visual confirmation, same caveat every prior stage in this project has recorded rather than skipped silently). — **Not performed this session**: no live dev servers were started; automated coverage (739 backend + 178 frontend tests) is not a substitute for this step.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — run first, purely observational.
- **Foundational (Phase 2)**: Depends on Setup. BLOCKS all of Phase 3-6 — none of the four user
  stories has anywhere to render without the route/sidebar/page shell existing.
- **User Story 1 (Phase 3)**: Depends on Foundational only. No dependency on US2/US3/US4.
- **User Story 2 (Phase 4)**: Depends on Foundational only. Independent of US1; T017 depends on
  T016 (same reasoning as `Player.isProfessional`: model hook is the authority, validation defers
  to it); T021 depends on T018; T023 depends on T022; T024 depends on T021 (needs the real field
  shape) and T023.
- **User Story 3 (Phase 5)**: Depends on Foundational, and **on US2's T024** for the team dropdown
  data (a fixture needs professional teams to exist) — not a hard code dependency, but the
  independent test description itself requires "at least two professional-league teams." T028
  depends on T027; T031 depends on T029; T033 depends on T032; T034 depends on T031, T033, and
  T024 (US2).
- **User Story 4 (Phase 6)**: Depends on Foundational only. Fully independent of US1/US2/US3 —
  could be implemented and shipped first if desired, despite being P3 (lowest priority does not
  mean "must be last," just "least urgent").
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- T003 and T004 (Foundational) — different files.
- T006 (Foundational i18n) can proceed alongside T002/T003/T005 — different files.
- T011, T013, T014 (US1) — different files, once T007-T010 land.
- T015 (US2 test) can be written in parallel with T016 (US2 model) — same contract, different
  files; T015 will fail until T016+T017 land, by design.
- T018, T020, T022 (US2) — different files, no interdependency.
- T027 (US3 model) can proceed in parallel with US2's T016 — different files, different
  collections, no shared dependency.
- **US2 (Phase 4) and US4 (Phase 6) can be implemented fully in parallel** by different
  developers — zero file overlap.
- T038, T039 (US4) — different files.

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Different files, no interdependency:
Task: "Add professional-league NavItem + icon case in frontend/src/app/layout/sidebar/sidebar.component.ts"
Task: "Update admin menu href assertion in frontend/src/app/layout/sidebar/sidebar.component.spec.ts"
Task: "Add NAV.PROFESSIONAL_LEAGUE + PROFESSIONAL_LEAGUE namespace to en.json/ar.json"
```

## Parallel Example: User Story 2 backend (Phase 4)

```bash
# T015 (test) and T016 (model) touch different files — write both, T015 fails until T016+T017 land:
Task: "Create Backend/tests/roles/teamProfessionalAgeGroup.test.js"
Task: "Remove ageGroup required:true from Backend/models/teamModel.js, add conditional pre-save/pre-findOneAndUpdate hooks"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (baseline) + Phase 2 (Foundational — route, sidebar, page shell).
2. Complete Phase 3 (US1 — proScout account management).
3. **STOP and VALIDATE**: an admin can already manage proScout accounts from a real, if
   incomplete-looking, page. This alone resolves the Stage 13 backlog item this feature grew out
   of ("صفحة المدربين تعرض الكوتشز والـproScouts مع بعض" — proScouts get their own place).
4. Deploy/demo if ready.

### Incremental Delivery

1. Setup + Foundational → shell ready.
2. Add US1 (proScouts) → test independently → demo (MVP).
3. Add US2 (teams) → test independently → demo. Note the crash-adjacent risk lives in US3, not
   here — US2 alone is lower-risk and can ship first.
4. Add US3 (matches) → test independently, **with T030's crash regression as the hard gate** →
   demo. Do not skip T030 even under schedule pressure — it is the test for the exact bug that
   blocked this feature's plan phase.
5. Add US4 (dashboard count) → test independently → demo. Can genuinely be done at any point
   after Foundational, including first, since it has zero dependency on the other three.
6. Polish (Phase 7) → full regression + design review + manual walkthrough → merge as one PR
   (Constitution Principle V — the backend `ageGroup` changes and the frontend page that depends
   on them ship together, not staged).
   T046 is a second hard gate alongside T030 — skipping it leaves FR-011 unverified, not merely
   under-polished.
