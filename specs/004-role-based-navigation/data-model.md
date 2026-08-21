# Phase 1 Data Model: Role-Based Sidebar Navigation

**Feature**: `specs/004-role-based-navigation/` | **Date**: 2026-08-21

No persisted data is introduced or modified. The "model" here is a compile-time constant and the derivation applied to it at render time.

---

## Entity: `NavItem`

One entry in the sidebar menu. Already declared at `sidebar.component.ts:10-15`; this phase puts it to use and adjusts two fields.

| Field | Type | Meaning | Change |
|---|---|---|---|
| `labelKey` | `string` | Translation key resolved through `TranslatePipe` (e.g. `NAV.DASHBOARD`) | Renamed from `label` — the existing field held a key, not a label, and the old name invited someone to put literal text there |
| `icon` | `NavIcon` | Discriminator selecting which SVG body the template renders | Narrowed from `string` to a union of the seven icon keys, so an unknown key is a build error |
| `route` | `string` | Absolute in-app destination, e.g. `/players` | unchanged |
| `roles` | `readonly UserRole[]` | The **complete** set of roles permitted to see this entry. A role absent from this array cannot see the entry. | Type tightened to `readonly`; this is the field the whole feature exists to activate |

```text
NavIcon = 'dashboard' | 'players' | 'coaches' | 'observers' | 'age-groups' | 'my-matches' | 'profile'
```

**Why `roles` is a whitelist and never a blacklist**: Constitution Principle II. An allowlist fails closed when someone forgets to update it — a new role sees nothing. A denylist fails open — a new role sees everything. The current hand-written template is effectively a denylist, which is the defect being repaired.

**Validation rules**:

- `roles` MUST be non-empty in practice, but an empty array is *legal* and means "nobody sees this" (FR-002's degenerate case). It is not an error state.
- Every role name MUST typecheck against `UserRole`, which is generated from `openapi.json` (`api.generated.ts:3840`). A retired or misspelled role fails the build rather than silently never matching. See `research.md` R4 for why no parallel `ROLES` constant is introduced.
- `route` MUST correspond to a route every role in `roles` can actually activate (FR-015). This is a review obligation, not a type constraint; the deliberate exceptions are DF-001 and DF-002, which are honored by *omission* rather than by adding an unreachable entry.

---

## Collection: `NAV_ITEMS`

A module-level `readonly NavItem[]`. **Declaration order is render order** — there is no sort step, no priority field, and no per-role ordering. This is what makes FR-004…FR-007's ordering requirements readable directly from the source.

The concrete contents — the role matrix — are specified in [contracts/navigation-matrix.md](./contracts/navigation-matrix.md), which is the authoritative table. It is not duplicated here.

---

## Derivation: `visibleNavItems`

A `computed` over the collection:

```text
visibleNavItems = NAV_ITEMS filtered to entries whose roles include currentUser()?.role
```

**Behavior at the boundaries**:

| Input state | Result | Requirement |
|---|---|---|
| `currentUser()` is `null` (session not yet restored, or signed out) | `[]` | FR-003 |
| Role is a value named on no entry | `[]` | FR-003, SC-007 |
| Role is named on some entries | Those entries, in declaration order | FR-002, FR-004…FR-007 |

**Reactivity**: `currentUser` is a signal, so the menu recomputes when the session resolves or the user changes. Because the empty state is the *starting* state, the menu can only grow as the role becomes known — never shrink. This is what satisfies the spec's "must not briefly show a fuller menu then remove entries" edge case without any additional loading state (`research.md` R8).

**A note on what is deliberately absent**: there is no per-entry `visible` flag, no `disabled` state, and no "show but block on click". An entry the role may not use is *absent from the DOM*. A greyed-out entry would advertise the existence of an area the role has no business knowing about, and would also make the DOM-count assertions in the tests ambiguous.

---

## Out of the model

These render in the sidebar but are **not** `NavItem`s and are untouched by the derivation:

- **Logo header** — unconditional.
- **Mini-pitch formation graphic** — keeps its own `isAdmin() && isPlayersActive()` condition (FR-010). It is an interactive filter control, not navigation; folding it into `NAV_ITEMS` would require the item model to carry a second, page-dependent condition for one member's sake.
- **User-info footer** — unconditional, reads `auth.currentUser()` directly.
- **`STATUS_CHILDREN` / `statusChildren`** — dead declarations that the template never reads. They stay dead and MUST NOT be rendered (FR-011). The model has no notion of sub-entries because the menu has none.
