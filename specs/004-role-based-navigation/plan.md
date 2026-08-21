# Implementation Plan: Role-Based Sidebar Navigation

**Branch**: `phase-3-navigation-routing` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-role-based-navigation/spec.md`

> **Note on naming**: the spec directory is `004-role-based-navigation` (sequential numbering), while the git branch is `phase-3-navigation-routing` (created before the spec, named after the plan document's stage number). They are the same work. Phases 0–2 shipped from `00N-*` branches; this one differs and that is deliberate, not a mismatch to reconcile.

## Summary

Replace the sidebar's seven hand-written, individually-gated menu links with a single declared collection of entries, each naming the roles permitted to see it, and render the menu by filtering that collection against the signed-in user's role. This inverts the menu's default from "visible unless a condition hides it" to "hidden unless a role is named" — closing the frontend half of deny-by-default (Principle II) and satisfying Principle VII's requirement that navigation be built from permissions rather than hand-written role conditions.

The menu each existing role sees must come out bit-identical (Principle III). The mechanism therefore changes completely while the output does not, and the plan's central device is ordering: the verification spec is written and made to pass **against the unmodified component first**, so the expected menus are captured from reality rather than from intent, and only then is the component refactored.

`proScout` gains exactly two entries — Players and Profile. The other two the overall plan assigns it (Dashboard, My Matches) are deliberately withheld here because their destinations still refuse the role; they are bound to Phases 5 and 6 as DF-001 and DF-002.

Route-level refusal of `proScout` at `/users`, `/observers`, and `/age-groups` already holds through the existing `roleGuard` + `RoleLandingService` chain. This phase adds no enforcement there — it adds the tests that prove it, plus a backend test recording the one place where the server does **not** refuse (`GET /ages`, Constitution C-3).

## Technical Context

**Language/Version**: TypeScript 5.x on Angular 21 (standalone components, signals); Node 22 per `.nvmrc`

**Primary Dependencies**: `@angular/router` (`RouterLink`, `RouterLinkActive`, `CanActivateFn`), `@ngx-translate/core` (`TranslatePipe`), existing `AuthService` signals, existing `RoleLandingService`

**Storage**: N/A — no persistence touched

**Testing**: Karma + Jasmine (`npx ng test --watch=false --browsers=ChromeHeadless`) for the frontend; Vitest (`npm test` in `Backend/`) for the single documentation test in R7

**Target Platform**: Browser (desktop + mobile breakpoints; the sidebar has a `lg:` collapse behavior that must survive)

**Project Type**: Web application — frontend-only change, with one additive backend test

**Performance Goals**: N/A. The menu derivation is a `computed` over a 7-element constant; it recomputes only when the signed-in user changes.

**Constraints**:
- Zero visual or behavioral difference for `admin`, `coach`, `observer` (Principle III, SC-001)
- No production backend source modified; `Backend/tests/isolation.test.js` not touched
- No new user-facing strings (existing `NAV.*` keys reused, verified present in both locales)
- No second copy of role→destination logic (FR-013)

**Scale/Scope**: One component rewritten (~7 template blocks → 1 loop + 1 icon switch), one new frontend spec file, one existing frontend spec file extended, one backend test file extended. 4 roles × 7 entries.

## Constitution Check

*GATE: evaluated before Phase 0 research, re-evaluated after Phase 1 design.*

| Principle | Applies? | How this plan satisfies it | Gate |
|---|---|---|---|
| **I — Server-Side Enforcement First** | **Yes, sharply.** This is a frontend-only phase, so it is the exact phase most at risk of presenting a hidden link as a permission. | The spec never claims a hidden entry denies anything. US4 requires a separate server-side decision per area, and R7 traced each area to its actual endpoint. Two of three are already 403-tested; the third (`GET /ages`) is **not refused** and this plan records that honestly rather than papering over it. | **PASS** |
| **II — Deny by Default** | Yes — this is the phase's purpose on the frontend. | FR-002/FR-003: an entry renders only when the role is explicitly named. Unknown role or no user → zero entries. SC-007 tests a hypothetical future role gets nothing. | **PASS** |
| **III — No Behavior Change (NON-NEGOTIABLE)** | Yes — highest risk item. | US1 is P1 with a zero-difference criterion. The baseline-first ordering (R5) makes the expectation a *measurement* of pre-change behavior, not a restatement of intent. The admin/My-Matches asymmetry found in R1 is reproduced verbatim rather than "fixed". No backend production source touched; `isolation.test.js` untouched. | **PASS** |
| **IV — Single Central Scope Layer** | No. | No data scoping, no query filters, no `ApiFeature`/`baseFilterFn`/`ownership.js` changes. Menu visibility is presentation, and this plan explicitly does not treat it as a scope layer. | **N/A** |
| **V — Independently Deployable** | Yes. | Shipping this alone leaves the system coherent: existing roles unchanged, proScout's menu shows only destinations it can already open. DF-001/DF-002 are withheld *because* including them would break this property. No migration, no route-shape change, so no `dump-spec`/`gen:types` needed. | **PASS** |
| **VI — Positive and Negative Test per Permission** | Yes, for the test-pairing clause. **No, for the full-inventory clause** — see the note below the table. | Positive: exact menu content and order per role (not merely "renders"). Negative: unknown role → 0 entries, no user → 0 entries, and proScout → `/unauthorized` on all three admin areas. The endpoints behind those three areas are inventoried in `contracts/navigation-matrix.md` §4, traced from `Backend/routes/*.js` as the principle requires. | **PASS** |
| **VII — Single Source of Truth for Role Names** | Yes — the clause "التنقّل في الواجهة MUST يُبنى من الصلاحيات لا من شرط مكتوب يدوياً على اسم الرول" is this phase's mandate. | FR-001 makes the menu permission-driven. FR-013 forbids a second role→destination copy; the guards keep using `RoleLandingService`. Role names in `NAV_ITEMS` are typed `readonly UserRole[]`, compile-checked against the openapi-derived union — see R4 for why a parallel frontend `ROLES` object is *rejected* rather than added. | **PASS** |

**On Principle VI's full-endpoint-inventory clause** — "كل مرحلة تمس الصلاحيات MUST ترفق جرداً لكل endpoints المشروع وقرار كل واحد منها للرول المعني":

This phase does **not** attach a project-wide endpoint inventory, and that is a deliberate reading rather than an omission. The clause is conditioned on a phase that *touches permissions*. The change budget (`contracts/navigation-matrix.md` §5) forbids modifying any `Backend/` production source, so no `allowedTo`, no `ownerFields`, no `baseFilterFn`, and no `ownership.js` guard changes in this phase — proScout's server-side permission set on the day this ships is byte-for-byte the set Phase 2 shipped. Nothing here can change any endpoint's decision for any role.

What this phase *does* change is which links a browser draws, and the corresponding obligation under Principle I is to prove the server's decision for the areas whose links moved. That is discharged for all three, endpoint by endpoint, in `contracts/navigation-matrix.md` §4.

The project-wide inventory remains owed, and its owner is unchanged: Stage 7 of `docs/scout-pro-plan-v2.md`, item 1, which builds it via `/speckit-checklist` over every operation. Recording the exemption here — rather than leaving it to be inferred — is itself the compliance obligation, since a reviewer checking the seven principles would otherwise find this row silent.

**Constraints engaged**: C-1 (relied upon as already closed by Phase 0 — `RoleLandingService` + `/unauthorized` exist and are reused unchanged); C-3 (hit directly at `GET /ages`; honored by recording, not by fixing — see R7).

**Post-Phase-1 re-evaluation**: no gate changed. The design added no new abstraction, no new role-name source, and no new enforcement layer. The one point that moved is Principle I: Phase 1 sharpened FR-014's evidence from "the server refuses" to "the server's actual decision is recorded per area", which is a strengthening — an assertion that can fail — not a relaxation.

### Complexity Tracking

No constitutional violations to justify. Two simplifications were actively chosen over more elaborate designs and are recorded in `research.md`: the entry list stays a module constant rather than becoming a service (R3), and role names stay typed literals rather than gaining a parallel constant object (R4).

## Project Structure

### Documentation (this feature)

```text
specs/004-role-based-navigation/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 output — R1..R9 + out-of-scope observations
├── data-model.md                  # Phase 1 output — NavItem shape, derivation rules
├── quickstart.md                  # Phase 1 output — how to verify this feature
├── contracts/
│   └── navigation-matrix.md       # Phase 1 output — role × entry matrix + guard/endpoint decisions
├── checklists/
│   └── requirements.md            # Spec quality checklist
└── tasks.md                       # /speckit-tasks output — NOT created here
```

### Source Code (repository root)

```text
frontend/src/app/
├── layout/sidebar/
│   ├── sidebar.component.ts       # MODIFIED — NAV_ITEMS constant + visibleNavItems computed
│   │                              #   + template loop with @switch icon bodies
│   └── sidebar.component.spec.ts  # NEW — per-role menu assertions (written first, R5)
├── core/auth/
│   ├── role.guard.ts              # UNCHANGED — already correct (R6)
│   └── role.guard.spec.ts         # MODIFIED — proScout → /unauthorized for the 3 admin areas
├── core/services/
│   └── role-landing.service.ts    # UNCHANGED — the single role→destination source (FR-013)
└── app.routes.ts                  # UNCHANGED — roleGuard(['admin']) on all three areas already denies

Backend/
├── routes/, controllers/, middlewares/, utils/   # UNTOUCHED — no production backend change
└── tests/roles/
    └── proScoutRoleDefinition.test.js  # MODIFIED — record actual GET /ages behavior (C-3)
```

**Structure Decision**: Frontend-only, following the repo's existing layout — the sidebar is presentational and lives in `layout/`, its permission data lives with it (R3), and the guard logic it mirrors stays in `core/auth/` + `core/services/`. The single backend edit is confined to an existing test file under `tests/roles/`; no `Backend/` production directory is opened.

## Implementation Approach

### Step 1 — Capture the baseline (before touching production code)

Write `sidebar.component.spec.ts` with a `setup(role)` harness modeled on `player-list.component.spec.ts`: `TestBed` + `provideRouter([])` + `provideTranslateService({ lang: 'en', fallbackLang: 'en' })` + an `AuthService` stub whose `currentUser`, `isAdmin`, `isCoach`, `isObserver` are `signal()`s set **consistently** (R5).

Assert, per role, the ordered `href` list of the nav `<a>` elements:

- admin → `/dashboard`, `/players`, `/users`, `/observers`, `/age-groups`, `/profile` (6)
- coach → `/dashboard`, `/players`, `/my-matches`, `/profile` (4)
- observer → same 4 as coach

Run it. **It must pass against the unmodified component.** If it does not, the expectation is wrong and must be corrected against reality before proceeding — that is the whole point of doing this first.

### Step 2 — Refactor the component

Add `const NAV_ITEMS: readonly NavItem[]` with the seven entries in current render order, each carrying `labelKey`, `icon` key, `route`, and `roles`. Add `readonly visibleNavItems = computed(...)` filtering on `this.auth.currentUser()?.role`, returning `[]` when the role is absent or matches nothing.

Replace the seven template blocks with one `@for` over `visibleNavItems()`, keeping the anchor's classes, `routerLinkActive`, and `(click)="onNavClick()"` exactly as they are, and selecting the icon body via `@switch (item.icon)` with each SVG literal moved verbatim (R2).

Leave untouched: the logo header, the mini-pitch block and its `isAdmin() && isPlayersActive()` condition (FR-010), the user-info footer, and the `styles` array.

### Step 3 — Add proScout and the negative cases

`NAV_ITEMS` gains `proScout` on exactly Players and Profile. Extend the spec with: proScout → `/players`, `/profile` (2); an unknown role → 0; no user → 0.

### Step 4 — Prove the doors are locked

Extend `role.guard.spec.ts` with proScout against `roleGuard(['admin'])`, asserting the result is a `UrlTree` stringifying to `/unauthorized` — one case per administration area.

Extend `Backend/tests/roles/proScoutRoleDefinition.test.js` with the `GET /ages` reality record (200 with a proScout token, 200 with no token), commented with C-3 / TODO(AGES_UNAUTHENTICATED_READ) so nobody reads it as an endorsement.

### Step 5 — Gates

`npx ng test --watch=false --browsers=ChromeHeadless`, `npm run build` in `frontend/`, and `npm test` in `Backend/`. All three must be green, with the backend suite's existing count unchanged apart from the added test.

## Risks

| Risk | Mitigation |
|---|---|
| The "identical menu" claim is asserted against intent rather than reality | Step 1 ordering: the spec must pass **before** the refactor exists (R5) |
| Icon markup drifts during the move into `@switch` | SVG literals are moved verbatim, never retyped or normalised (R2) |
| A reader concludes `/age-groups` is server-side denied because the menu entry is gone | Explicit test recording the 200, plus FR-014's wording and C-3 references in three artifacts |
| DF-001/DF-002 are forgotten and proScout is left permanently short two entries | Recorded as binding follow-ups naming the owning phase and the exact edit, in spec.md and in `contracts/navigation-matrix.md` |
| The `AuthService` stub sets booleans inconsistently with `currentUser`, so the baseline measures an impossible state | Called out in R5; the stub derives all four signals from one `role` argument |
