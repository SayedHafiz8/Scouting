# Contract: Navigation & Landing-Destination Consolidation

**Feature**: `specs/008-proscout-matches-attendance/` | Phase 1

## Sidebar + route guard

| Item | Before | After |
|---|---|---|
| `sidebar.component.ts` — `My Matches` entry `roles` | `['coach', 'observer']` | `['coach', 'observer', 'proScout']` |
| `app.routes.ts` — `/my-matches` `roleGuard` | `['coach', 'observer', 'admin']` | `['coach', 'observer', 'admin', 'proScout']` |

This discharges DF-002 (registered in `specs/004-role-based-navigation/spec.md`, Stage 3 executive
note #1): the sidebar entry was deliberately withheld until the destination it points to actually
worked for this role.

`sidebar.component.spec.ts`'s existing assertion — `proScout menu contains no ... my-matches entry` —
is **edited**, not left contradictory: the snapshot moves from "absent" to "present," with the same
test asserting the full 3-item menu (Dashboard, Players, **My Matches**, Profile → 4 items), closing
the loop DF-002 opened.

## Landing/rejection consolidation (Stage 6 item 7)

**New file**: `frontend/src/app/core/auth/role-landing-destinations.spec.ts`

Single hardcoded matrix — the one place expected destinations are literal strings:

```ts
const EXPECTED: Record<UserRole, { landing: string; refusedElsewhereGoesTo: string }> = {
  admin:    { landing: '/dashboard/admin',    refusedElsewhereGoesTo: '/dashboard/admin' },
  coach:    { landing: '/dashboard/coach',    refusedElsewhereGoesTo: '/dashboard/coach' },
  observer: { landing: '/dashboard/observer', refusedElsewhereGoesTo: '/dashboard/observer' },
  proScout: { landing: '/dashboard/proScout', refusedElsewhereGoesTo: '/dashboard/proScout' },
};
```

For each role: asserts `RoleLandingService.landingFor(role)` matches `landing`, **and** asserts
`roleGuard(['__no_such_role__'])` (a route the role is never listed on) redirects to
`refusedElsewhereGoesTo` — driving the guard for real, not just reading the service. An unrecognized
role (`undefined`, a garbage string) is asserted to land on `/unauthorized` in both columns.

**Edited**: `role.guard.spec.ts` — the eleven hand-written destination-string assertions (e.g.
`expect(result.toString()).toBe('/dashboard/coach')`) are rewritten to
`expect(result.toString()).toBe(roleLandingService.landingFor(role).join('/'))`, injecting the real
`RoleLandingService` into the test bed instead of duplicating its output as a literal. The behavioral
assertions (`toBeTrue()` / `not.toBeTrue()`) are unchanged — this file keeps proving the guard's
allow/deny logic; it stops being a second source of truth for *where* a denial lands.

**Unchanged**: `role-landing.service.spec.ts` — already the direct, non-duplicated test of
`landingFor()`. Left as-is per `research.md R8`.

## Match detail / list UI (proScout-specific)

- `my-matches.component.ts` template: the age-group `<th>`/`<td>` pair is wrapped in
  `@if (!auth.isProScout())`.
- `selectedLeague` signal's initial value becomes role-conditional: `'professional'` for proScout,
  `'premier'` (unchanged default) for everyone else.
- The league-toggle button group is wrapped in `@if (!auth.isProScout())` — there is nothing to
  toggle when the role has exactly one reachable league.
- No other template branch changes: `canEnterResult`, `isAttending`, `canToggleAttend`, the
  attend/unattend button, and the expandable reports/media panel are already role-agnostic
  (`research.md R6`) and apply to proScout unchanged.
