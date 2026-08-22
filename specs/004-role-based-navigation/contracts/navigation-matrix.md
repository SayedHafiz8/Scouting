# Contract: Navigation Matrix

**Feature**: `specs/004-role-based-navigation/` | **Date**: 2026-08-21

This is the authoritative table for what each role sees and what each role may open. `NAV_ITEMS` in `sidebar.component.ts` MUST match section 1 exactly, entry-for-entry and in this order.

---

## 1. Menu entries × roles

Order below **is** render order. `✓` = the role is named on the entry; blank = the entry is absent from that role's DOM entirely.

| # | Entry | `labelKey` | `route` | `icon` | admin | coach | observer | proScout |
|---|---|---|---|---|:---:|:---:|:---:|:---:|
| 1 | Dashboard | `NAV.DASHBOARD` | `/dashboard` | `dashboard` | ✓ | ✓ | ✓ | — *(DF-001)* |
| 2 | Players | `NAV.PLAYERS` | `/players` | `players` | ✓ | ✓ | ✓ | **✓** |
| 3 | Coaches | `NAV.COACHES` | `/users` | `coaches` | ✓ | | | — |
| 4 | Observers | `NAV.OBSERVERS` | `/observers` | `observers` | ✓ | | | — |
| 5 | Age Groups | `NAV.AGE_GROUPS` | `/age-groups` | `age-groups` | ✓ | | | **— permanently** |
| 6 | My Matches | `NAV.MY_MATCHES` | `/my-matches` | `my-matches` | | ✓ | ✓ | — *(DF-002)* |
| 7 | Profile | `NAV.PROFILE` | `/profile` | `profile` | ✓ | ✓ | ✓ | **✓** |
| | **Total visible** | | | | **6** | **4** | **4** | **2** |

**Two cells that look like mistakes and are not:**

- **Row 6, admin is blank.** Admin does not see My Matches today, even though `/my-matches` is guarded `roleGuard(['coach','observer','admin'])` and admin *can* open it. The current template gates that link on `auth.isCoach() || auth.isObserver()`. This is a pre-existing menu/route inconsistency; Principle III requires reproducing it verbatim. Do **not** "fix" it in this phase.
- **Row 5, proScout.** Not a deferral. FR-008: the age-groups entry MUST NOT name proScout in this phase or any later one. The role is barred from age-group data by design.

**Deferred cells (binding, see spec.md "Deferred by Design"):**

- **DF-001 — row 1, proScout → Phase 5.** `/dashboard` routes each role to its own landing destination via `RoleLandingService`; proScout has none, so it resolves to `/unauthorized`. Phase 5 creates the proScout dashboard, registers its landing, **and adds `proScout` to row 1**.
  - **Amended after Stage 4**: the landing is now an explicit `case 'proScout'` returning `['/players']`, because the default branch turned every successful proScout login into an `/unauthorized` screen. Phase 5 **edits that case** to `['/dashboard/proScout']`; it must not add a second case for the same role.
- **DF-002 — row 6, proScout → Phase 6.** `/my-matches` is `roleGuard(['coach','observer','admin'])`, and the attendance endpoints behind it are `allowedTo(COACH, OBSERVER)`. Phase 6 opens both, **and adds `proScout` to row 6**.

Adding either cell before its phase produces a menu entry that ends in a refusal — the exact defect FR-015 forbids.

---

## 2. Role → menu, as an assertion table

What the tests must assert, per role, on the ordered `href` list of the menu's `<a>` elements:

| Role | Expected `href` sequence | Count |
|---|---|---|
| `admin` | `/dashboard`, `/players`, `/users`, `/observers`, `/age-groups`, `/profile` | 6 |
| `coach` | `/dashboard`, `/players`, `/my-matches`, `/profile` | 4 |
| `observer` | `/dashboard`, `/players`, `/my-matches`, `/profile` | 4 |
| `proScout` | `/players`, `/profile` | 2 |
| unknown role (e.g. `'auditor'`) | *(none)* | 0 |
| no signed-in user | *(none)* | 0 |

Rows 1–3 are the Principle III contract and MUST be verified against the **unmodified** component before the refactor (`research.md` R5).

---

## 3. Route guard decisions for proScout

The frontend enforcement side. `roleGuard(allowed)` returns `true` on a match, otherwise a `UrlTree` from `RoleLandingService.landingFor(role)` — which maps proScout, like every unrecognised role, to `/unauthorized`.

| Route | Guard today | proScout outcome | Change needed |
|---|---|---|---|
| `/users` | `roleGuard(['admin'])` | `UrlTree` → `/unauthorized` | **None.** Add test (FR-012) |
| `/observers` | `roleGuard(['admin'])` | `UrlTree` → `/unauthorized` | **None.** Add test (FR-012) |
| `/age-groups` | `roleGuard(['admin'])` | `UrlTree` → `/unauthorized` | **None.** Add test (FR-012) |
| `/my-matches` | `roleGuard(['coach','observer','admin'])` | `UrlTree` → `/unauthorized` | None — consistent with DF-002 withholding the entry |
| `/dashboard` | none; child routes + `''` fallback resolve via `RoleLandingService` | → `/players` *(was `/unauthorized`; changed in Stage 4, see DF-001)* | None — consistent with DF-001 |
| `/players` | none | reachable | None — scoped server-side in Phase 2 |
| `/profile` | none | reachable | None |
| `/observer-evaluations` | `roleGuard(['admin','observer'])` | `UrlTree` → `/unauthorized` | None |
| `/coach-evaluations` | `roleGuard(['admin','coach'])` | `UrlTree` → `/unauthorized` | None |

No route file is modified in this phase. Every outcome above is produced by code that already exists; the deliverable is the executable proof for the first three rows.

---

## 4. Server-side decision for the same areas (Principle I)

A hidden menu entry is not a permission. Each area was traced to the request it actually issues:

| Area | Endpoint it calls | Route declaration | proScout result | Evidence |
|---|---|---|---|---|
| `/users` | `GET /api/v1/users` | `allowedTo(ADMIN)` | **403** | Already covered — `Backend/tests/roles/proScoutRoleDefinition.test.js:53` |
| `/observers` | `GET /api/v1/users` — the observers page injects the **same** `UserService` (`observer-list.component.ts:4,128`); it has no endpoint of its own | `allowedTo(ADMIN)` | **403** | Same test as above |
| `/age-groups` | `GET /api/v1/ages` via `HttpClient` (`age-group-list.component.ts:4,103`) | `.get(getAll)` — **no `protect`, no `allowedTo`** (`ageGroupRouter.js:113,116`) | **200 — and 200 with no token at all** | New documentation test |

**The `/ages` row is the honest exception.** There is no `req.user` on that route, so `allowedTo` has nothing to act on and cannot deny anything. This is Constitution **C-3** plus **TODO(AGES_UNAUTHENTICATED_READ)**, logged as tech debt outside this plan's scope by owner decision — the same wall Phase 2 hit and recorded.

The contract for this phase is therefore: **record the real behavior in a test**, commented with C-3 and the TODO, so that

1. nobody infers from the missing menu entry that the door is locked, and
2. the day someone adds `protect` to `/ages`, the assertion fails loudly and the tech-debt item gets closed deliberately rather than silently.

Adding `protect` here is explicitly out of scope: it changes behavior for anonymous callers and for existing roles, and the constitution reserves it as separate work.

---

## 5. Change budget

Files this phase is permitted to modify. Anything outside this list is a scope breach.

**Code — exactly four files:**

| File | Change |
|---|---|
| `frontend/src/app/layout/sidebar/sidebar.component.ts` | `NAV_ITEMS` + `visibleNavItems` + template loop |
| `frontend/src/app/layout/sidebar/sidebar.component.spec.ts` | **new** |
| `frontend/src/app/core/auth/role.guard.spec.ts` | add proScout cases |
| `Backend/tests/roles/proScoutRoleDefinition.test.js` | add the `GET /ages` reality record |

**Documentation — expected to change, and not counted against the code budget:**

| Path | Change |
|---|---|
| `specs/004-role-based-navigation/**` | This feature's own artifacts |
| `docs/scout-pro-plan-v2.md` | Stage-3 execution note (tasks.md T030), matching the Stage-1 and Stage-2 notes already there |

Explicitly **not** modified: `app.routes.ts`, `dashboard.routes.ts`, `role.guard.ts`, `role-landing.service.ts`, any `Backend/` production source, `Backend/tests/isolation.test.js`, `openapi.json`, `api.generated.ts`, and the i18n files (all required keys already exist in both locales).
