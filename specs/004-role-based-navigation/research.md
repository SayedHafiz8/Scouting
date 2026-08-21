# Phase 0 Research: Role-Based Sidebar Navigation

**Feature**: `specs/004-role-based-navigation/` | **Date**: 2026-08-21

All findings below were verified against the working tree, not recalled. Line references are to the state of the branch at the time of writing.

---

## R1 — How the menu is produced today (the baseline that must not change)

**Finding**: `frontend/src/app/layout/sidebar/sidebar.component.ts` declares `interface NavItem { label; icon; route; roles: UserRole[] }` at lines 10-15 and **never references it**. The rendered menu is seven hand-written `<a>` blocks in the template, gated by three conditions:

| Entry | Route | Current gate | Effective roles |
|---|---|---|---|
| Dashboard | `/dashboard` | *(none)* | every signed-in role |
| Players | `/players` | *(none)* | every signed-in role |
| Coaches | `/users` | `@if (isAdmin())` | admin |
| Observers | `/observers` | `@if (isAdmin())` (same block) | admin |
| Age Groups | `/age-groups` | `@if (isAdmin())` (same block) | admin |
| My Matches | `/my-matches` | `@if (auth.isCoach() \|\| auth.isObserver())` | coach, observer |
| Profile | `/profile` | *(none)* | every signed-in role |

**Consequences confirmed**:

- The ungated four (Dashboard, Players, Profile — and any future ungated entry) are the deny-by-default hole named in the spec: `proScout` sees them today with no decision ever having been made.
- **Admin does not see My Matches**, even though `/my-matches` is guarded `roleGuard(['coach','observer','admin'])` and admin *can* open it. This is a live inconsistency between menu and route. Principle III forbids changing it here.
- `const STATUS_CHILDREN` (lines 17-21) and the `statusChildren` property (line 371) are dead: nothing in the template reads them. The menu has **no** sub-entries today. The plan document's Stage-3 text says "+ فروع status للأدمن فقط، سطر 138" — line 138 is in fact the mini-pitch condition, not status children. The plan text is wrong about the current state; FR-011 encodes reality.

**Decision**: The role matrix in `contracts/navigation-matrix.md` is transcribed from the table above, entry for entry, including the admin/My-Matches asymmetry.

**Alternatives considered**: Treating the admin/My-Matches gap as a bug and fixing it here — rejected, it is a visible behavior change for an existing role (Principle III, SC-001). Recorded as an out-of-scope observation instead.

---

## R2 — Rendering distinct SVG icons from a data-driven list

**Problem**: Each entry's icon is a different inline `<svg>` body — and not a uniform shape family. Dashboard is four `<rect>`s, Players is a `<circle>` plus a `<path>`, Coaches is two `<path>`s plus a `<circle>`, Age Groups is three `<rect>`s, My Matches is a `<rect>` plus three `<line>`s. There is no single `d` attribute to parameterise.

**Options evaluated**:

| Option | Verdict |
|---|---|
| Store the SVG body as a markup string, render via `[innerHTML]` | **Rejected.** Angular's sanitizer strips SVG content from `innerHTML`; bypassing it means `bypassSecurityTrustHtml` on hand-written markup — new sanitizer-bypass surface for zero benefit. |
| Normalise every icon to an array of `<path d="…">` | **Rejected.** Requires redrawing five of the seven icons. FR-009 demands the icon be *identical*; redrawing guarantees visual drift. |
| Keep each icon's exact SVG literal in the template, selected by a `@switch` on the entry's icon key | **Selected.** |

**Decision**: `NavItem.icon` is a key (`'dashboard' \| 'players' \| …`); the template loops over the visible entries and picks the icon body with `@switch (item.icon)`, each branch containing the **existing SVG literal moved verbatim**.

**Rationale**: The thing the constitution requires to be data-driven is the *permission* decision (Principle VII: "التنقّل في الواجهة MUST يُبنى من الصلاحيات لا من شرط مكتوب يدوياً على اسم الرول"). Visibility, order, label, and destination all become data. The glyph markup stays literal, which is precisely what makes FR-009's "no visual difference" provable by inspection rather than by eye. A `@switch` on an icon key is not a role condition and does not reintroduce the hole.

---

## R3 — Where the entry list lives

**Decision**: A module-level `const NAV_ITEMS: readonly NavItem[]` in `sidebar.component.ts`, next to the existing `STATUS_CHILDREN`, exported for tests.

**Rationale**: One consumer today. Extracting to a service or a separate core file adds an indirection with no second caller, and the constitution's Governance section requires the simplest solution that satisfies the principles. Order-of-declaration is the render order, which makes the ordering requirements (FR-004…FR-007) readable at a glance.

**Alternatives considered**: A `NavigationService` in `core/services/` — rejected as premature; revisit if Phase 5 or a second navigation surface (header, mobile drawer) needs the same list.

---

## R4 — Referring to role names in the frontend

**Finding**: The backend has `Backend/constants/roles.js` (`ROLES`, `ROLE_VALUES`). The frontend has **no** equivalent: `UserRole` in `core/models/user.model.ts` is a *type* derived from `api.generated.ts` (verified: `role?: "admin" | "coach" | "observer" | "proScout"` at `api.generated.ts:3840`), and every call site writes literals — `roleGuard(['admin'])`, `roleGuard(['admin','observer'])`, and so on across `app.routes.ts` and `dashboard.routes.ts`.

**Decision**: Do **not** introduce a frontend `ROLES` constant in this phase. Type `NAV_ITEMS` as `readonly NavItem[]` with `roles: readonly UserRole[]`, so every role name written into the list is compile-checked against the generated union.

**Rationale**: Constitution Principle VII's frontend clause requires exactly one thing — that `UserRole` stays derived from `openapi.json` — and that already holds. A misspelled or retired role name in `NAV_ITEMS` is a build error under this typing, which is the property the "single source of truth" rule exists to buy. Adding a parallel `ROLES` object would either sit unused beside ~10 existing literal call sites (a second source of truth, the exact failure mode Principle VII warns about) or force a repo-wide migration that is a behavior-neutral churn outside this phase's scope.

**Alternatives considered**: Creating `core/models/roles.ts` and migrating only touched call sites — rejected: it leaves the codebase with two conventions and no phase owning the rest. If a frontend constant is wanted, it belongs in its own change that migrates all call sites at once. Recorded as an out-of-scope observation.

---

## R5 — Proving "no change for existing roles"

**Constraint**: Jasmine/Karma has no built-in snapshot facility, and a hand-written expected array proves nothing on its own — if the refactor and the expectation are written together, both can be wrong in the same way.

**Decision**: A three-step ordering, enforced as a task dependency:

1. Write `sidebar.component.spec.ts` asserting the rendered menu for admin, coach, and observer **against the current, unmodified component**, and run it. It MUST pass before any production line is touched. That run is the baseline capture — the expectation is validated against the real pre-change DOM, not against the author's intent.
2. Refactor the component.
3. Re-run. The same untouched spec must still pass.

**What is asserted**: the ordered list of `href` values on the menu's `<a>` elements, plus the count. Destinations are the stable identity; label text under a test-configured translate service resolves to the raw key, which is stable but less meaningful.

**Test harness**: reuse the established pattern from `features/players/player-list/player-list.component.spec.ts` — `TestBed` with `provideRouter([])`, `provideTranslateService({ lang: 'en', fallbackLang: 'en' })`, and an `AuthService` stub exposing `currentUser`/`isAdmin`/`isCoach`/`isObserver` as `signal()`s. `PlayerContextService` is a plain injectable and can be provided real.

**Note on the stub**: the current component reads role three ways — `isAdmin()` (its own `computed` over `currentUser()`), `auth.isCoach()`, and `auth.isObserver()`. The stub must set `currentUser` **and** the boolean signals consistently, otherwise the baseline capture is measuring a state that cannot occur in production. After the refactor the component reads only `currentUser()?.role`, and the stub's booleans become inert — deliberately, since the spec is unchanged between the two runs.

---

## R6 — Guard behavior for proScout on the three administration areas

**Finding**: `/users`, `/observers`, and `/age-groups` in `app.routes.ts` each carry `canActivate: [roleGuard(['admin'])]`. `roleGuard` (`core/auth/role.guard.ts:16-20`) returns `true` on a match, otherwise `router.createUrlTree(roleLanding.landingFor(role))`. `RoleLandingService.landingFor` (Phase 0 artifact) maps admin/coach/observer to their dashboards and **everything else, including `proScout` and `undefined`, to `/unauthorized`**.

**Decision**: The enforcement required by FR-012 already holds; no production change. Deliver executable proof only — extend `role.guard.spec.ts` with a proScout case per area, asserting the returned `UrlTree` stringifies to `/unauthorized`. FR-013 is satisfied by construction: the guard already derives the destination from the single `RoleLandingService`.

**Rationale**: The spec's Assumptions already flag that if a check reveals the refusal does not hold, closing it becomes in scope. It holds; the tests lock it.

---

## R7 — Server-side refusal for the same three areas (Principle I)

Traced what each frontend area actually requests:

| Area | Request it issues | proScout result | Status |
|---|---|---|---|
| `/users` | `GET /api/v1/users` via `UserService` | **403** | Already covered — `Backend/tests/roles/proScoutRoleDefinition.test.js:53` |
| `/observers` | `GET /api/v1/users` via the **same** `UserService` (verified: `observer-list.component.ts:4,128` imports `UserService` from `features/users/services`) | **403** | Covered by the same test — the observers page has no endpoint of its own |
| `/age-groups` | `GET /api/v1/ages` directly via `HttpClient` (verified: `age-group-list.component.ts:4,103`) | **200, and 200 without any token at all** | **Not a refusal.** See below |

**`GET /ages` finding**: `Backend/routes/ageGroupRouter.js` mounts `.get(getAll)` on `/` and `.get(getSpecific)` on `/:id` with **no `protect` and no `allowedTo`**. There is no `req.user`, so `allowedTo` has nothing to act on. This is Constitution constraint **C-3** together with **TODO(AGES_UNAUTHENTICATED_READ)**, logged as tech debt outside the plan's scope by owner decision, and it is the same wall Phase 2 hit (recorded in its deviation note 6).

**Decision**: Add a backend test that **documents the actual behavior** — proScout gets 200, and so does an unauthenticated request — with a comment naming C-3 and the TODO. Do not add `protect`; that is an out-of-scope behavior change for existing roles and for anonymous callers.

**Rationale**: FR-014 was written for exactly this case. The danger being defended against is a future reader assuming the age-groups door is locked because the menu entry is gone. A passing test that asserts 200 is an uncomfortable but honest record, and it will fail loudly on the day someone adds `protect` — at which point the tech-debt item is closed and the assertion flips.

**Alternatives considered**: Adding `protect` to `/ages` here — rejected twice over: it changes behavior for anonymous callers *and* it is explicitly reserved as separate tech debt by the constitution's C-3.

---

## R8 — First-paint behavior before the session resolves

**Finding**: `app.config.ts` runs an initializer that restores the session from the refresh cookie before the first navigation, and `AuthService.whenReady` is what guards await. `currentUser()` is `null` until it resolves.

**Decision**: No special handling needed, and none should be added. With deny-by-default (FR-003) a null user yields zero entries, so the menu can only ever grow as the role resolves — never shrink. The edge case in the spec ("MUST NOT briefly show a fuller menu and then remove entries") is satisfied by the same mechanism that satisfies FR-003, and is covered by the no-user test rather than by extra code.

**Note**: this is a genuine improvement over today's behavior, where Dashboard/Players/Profile render before the role is known. It is not a regression for existing roles (they end at the same menu), so Principle III is not engaged.

---

## R9 — Translation keys

**Verified**: every key the menu uses — `NAV.DASHBOARD`, `NAV.PLAYERS`, `NAV.COACHES`, `NAV.OBSERVERS`, `NAV.AGE_GROUPS`, `NAV.MY_MATCHES`, `NAV.PROFILE` — is present in **both** `frontend/src/assets/i18n/en.json` and `ar.json`.

**Decision**: FR-017 needs no work. The refactor reuses the existing keys; no new user-facing text is introduced.

---

## Out-of-scope observations (recorded, not acted on)

1. **Admin cannot reach My Matches from the menu** although the route permits admin. Menu/route inconsistency predating this phase; reproduced verbatim per Principle III.
2. **`STATUS_CHILDREN` / `statusChildren` are dead code.** Removing them is a tempting drive-by but is unrelated to the menu mechanism and would widen the diff that Principle III review must read line by line. Left in place; a follow-up may delete them.
3. **The frontend has no role-name constant** — ~10 literal call sites across `app.routes.ts` and `dashboard.routes.ts`. See R4; belongs in its own change.
4. **`GET /ages` is world-readable** — Constitution C-3 / TODO(AGES_UNAUTHENTICATED_READ), tech-debt item 1 in `docs/scout-pro-plan-v2.md`.
