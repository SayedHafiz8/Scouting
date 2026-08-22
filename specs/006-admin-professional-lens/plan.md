# Implementation Plan: Admin Lens for Professional-League Players

**Feature**: `specs/006-admin-professional-lens/` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Stack**: Express 5 + Mongoose 9 (ESM, vitest) · Angular 21 standalone + signals (Karma/Jasmine)

---

## ⚠️ Two premises in the clarification do not match the code

Both were measured, not inferred. Each changes what this plan builds, so neither is applied silently.

### PC-1 — The "No coach" chip does **not** clear other filters. It merges them.

> *"لما يتفتح، أي فلاتر تانية كانت شغالة … بتتمسح وتبدأ من الأول — **زي أي ضغطة على «بدون كوتش»**"*

The two halves of that sentence describe different behaviors. `toggleOrphaned()`
([player-list.component.ts:614](../../frontend/src/app/features/players/player-list/player-list.component.ts#L614))
navigates with `queryParamsHandling: 'merge'` and sets exactly one key. `status`, `position` and
`observer` survive the toggle. `keyword` survives too, and for a different reason — it is a plain
component field, never read from or written to the URL, so no navigation can reset it.

So "clears everything" and "exactly like No coach" cannot both hold.

**Resolution — the stated intent wins over the stated precedent.** Point 2 describes the desired
outcome in its own words ("تبدأ من الأول من غير أي فلترة سابقة"); point 1's "بالحرف" is read as the
*interaction pattern* (a toggle chip that swaps the grid for a flat list), not the *navigation
semantics*. The Professional League chip therefore **replaces** the query params instead of merging,
and explicitly clears `keyword`, which no navigation would clear on its own.

**RESOLVED — owner chose consistency over precedent.** Rather than leaving the two chips asymmetric,
**`toggleOrphaned()` is changed to clear as well**. Both chips now replace the query string instead
of merging, and both clear `keyword` explicitly — **on both transitions**, not just activation. A
first draft of this rule cleared on activation only and left deactivation as "just drop my key,"
which is a *narrower* clear than FR-013 requires — spec.md's FR-013/FR-013a now state explicitly
that deactivation returns to the same clean state as activation, not a merge-style partial revert.

Rule, identical for both, on both transitions:

```
navigate(queryParams = {})   // always a full clear, on toggle either direction — no queryParamsHandling → replace
keyword = ''
```

**This is a deliberate behavior change to a control admins use today**, and it is the only such change
in this stage. It is owner-directed, not a side effect. Recording what it costs:

- **Not a Principle III violation.** Principle III binds the *data* behavior of existing roles —
  result counts and content on the list endpoints, and the display masks. This changes which query
  params survive a click in the admin's own UI. No scope, no ownership, no mask, no endpoint. The
  server is not touched by PC-1 at all.
- **Two existing frontend assertions must change**, in
  [player-list.component.spec.ts:124-145](../../frontend/src/app/features/players/player-list/player-list.component.spec.ts#L124-L145):
  `expect(extras.queryParamsHandling).toBe('merge')` and, on switch-off,
  `expect(extras.queryParams).toEqual({ coach: null })` → `{}`. Both are edited **in place with the
  reason**, following the precedent this project already set when Stage 4 opened gates that Stage 1/2
  tests had asserted closed. Neither is a test being deleted to go green.
- **One existing assertion survives untouched, and it matters**: *"keeps an active status filter
  alongside the lens"* arrives at a URL that already carries both params. Clearing happens on
  **toggle**, not on **arrival** — so deep links and refreshes still honour every param in the URL
  (FR-009). If that test ever needs editing, the clearing has leaked into routing and the change is
  wrong.

**Net effect on FR-013**: the asymmetry is gone. Either chip, pressed from any state, starts clean.

### PC-2 — There is no team filter dropdown on the players list. Point 3 adds one.

> *"استثناء واحد: قائمة فلتر «الفريق» (dropdown) **لو المستخدم استخدمها بعد ما فتح الـview دي**"*

The players list filter bar holds exactly two controls: a keyword input and a **position** select
([player-list.component.ts:243-285](../../frontend/src/app/features/players/player-list/player-list.component.ts#L243-L285)).
There is no team dropdown to constrain. `team` is a permitted *API* filter (`PLAYER_FILTERS`), and
`Player.team` is rendered as a text label on each card, but nothing in this page ever offers a team
picker. The nearest one lives in the player **form**, which is a different component with a different
purpose.

**Resolution**: point 3 is implemented as **new UI**, not as a constraint on existing UI — a team
dropdown added to the filter bar, populated with professional-league teams only. Scope grows by one
control; this is flagged because "make the existing dropdown filter itself" and "build a dropdown"
are different amounts of work, and the second is what the request actually requires.

**Bounded deliberately**: the dropdown appears **only while the Professional League lens is active**.
Adding an always-present team filter to the players list would be a new capability for every admin
view and every role — outside a regression-fix stage, and untested territory for coach and observer
scope. A general team filter can be lifted out later if it proves wanted.

---

## Design decisions

### D-1 — Server: one whitelist entry, nothing else

`isProfessional` joins `PLAYER_FILTERS` in
[playerController.js:209](../../Backend/controllers/playerController.js#L209). That is the entire
server change for filtering. It is **not** added to `PLAYER_ADMIN_ONLY_LENSES`.

Why not admin-only: that list exists for `coach` / `observer` / `observers`, which are oracles —
they let a caller probe *other users' identities* against their own scoped data.
`isProfessional` names no user. Ownership scope is merged last and by AND
(`ApiFeature.filter()` precedence, Principle IV), so a coach sending `?isProfessional=true` gets
their own players intersected with a flag none of them carry: an empty list, revealing nothing they
could not already determine. FR-003 and SC-006 are the tests that hold this to account; if either
fails, the entry moves to `PLAYER_ADMIN_ONLY_LENSES` and the frontend is unaffected.

Mongoose casts the string `"true"` to boolean against a `Boolean` path, so no manual coercion — but
this is asserted by test rather than assumed, because a silent cast failure here fails *open*
(filter ignored → unfiltered list), not closed.

### D-2 — Server: an explicit `professional` count, derived from the flag

`getCountsByAgeGroup` ([playerController.js:~160](../../Backend/controllers/playerController.js#L160))
groups by `$ageGroup` and already discards the `null` bucket from `counts` while still adding it to
`total` — which is precisely the arithmetic gap the admin sees. The `$group` stage gains a
`professional` accumulator so the response carries it explicitly.

Rejected: computing it client-side as `total − Σ counts`. It needs no server change and is wrong —
any player whose `ageGroup` is missing for an unrelated reason gets silently relabelled
"professional" and hidden a second time. Recorded in the spec's edge cases and Assumptions.

The count rides the same `finalMatch` as the age-group buckets, so FR-006 (identical status/coach/
observer conditions) holds by construction rather than by a parallel query kept in sync by hand.

### D-3 — Client: the lens is URL state, holding no signal of its own

Exactly the `orphanedOnly()` pattern: a getter over a query param, no new signal to desynchronise.
`professionalOnly()` reads `isProfessional === 'true'`; `skipGroupsView()` gains it as a fourth
disjunct, so flat-view routing, loading, and the empty state are inherited whole from a path that
already carries test coverage. FR-009 (survives refresh, linkable) follows for free.

`toggleProfessional()` and the now-updated `toggleOrphaned()` (PC-1) share one shape: navigate with
`queryParamsHandling` omitted — a full replace, not a merge — and clear `keyword` directly, since
`keyword` lives outside the URL and no navigation touches it on its own.

### D-4 — Client: the team dropdown is lens-local and professional-only

Rendered inside the filter bar under `@if (professionalOnly())`. Populated by
`teamService.getAll(undefined, 'professional')` — the same call
[player-form.component.ts](../../frontend/src/app/features/players/player-form/player-form.component.ts)
already makes for the proScout team picker, so no new service surface. Fetched once on first
activation, not per keystroke.

The dropdown restricts *what the admin can pick*, which is convenience, not enforcement. Actual
confinement is D-1: the list is already `isProfessional: true`, so choosing a premier-league team
would simply return nothing. Per Principle I this distinction is stated, not blurred — the dropdown
is a reflection of the filter, never its cause.

### D-5 — `proScout` sees no chip and no dropdown

FR-010. Every player in that role's scope is professional; the chip would be an inert control
implying a distinction the role does not have. Guarded by `auth.isAdmin()`, alongside the existing
admin-only chip block.

---

## Phases

Ordered so each is independently revertible, and so the server is correct before any UI depends on it
(Principle I).

| Phase | Content | Gate |
|---|---|---|
| **0** | Spec updated (FR-013/FR-013a/FR-013b, US1 scenarios 4-6) for the resolved PC-1/PC-2 | — |
| **1** | Backend: `isProfessional` → `PLAYER_FILTERS` (D-1) | Filter works; scope still AND-ed |
| **2** | Backend: `professional` accumulator in counts (D-2) | Arithmetic closes server-side |
| **3** | Backend tests: positive, negative (coach/observer/proScout), cast, non-regression | Full suite green, `isolation.test.js` **unmodified** |
| **4** | Frontend: chip + `professionalOnly()` + `toggleProfessional()` + `skipGroupsView()` (D-3) | Lens opens, clears, survives refresh |
| **5** | Frontend: `toggleOrphaned()` changed to clear-not-merge (PC-1); 2 existing specs edited in place with reason | Both chips symmetric; the 1 surviving arrival-time assertion untouched |
| **6** | Frontend: chip count badge on the grid (FR-011) | Header total = Σ cards + chip |
| **7** | Frontend: lens-local professional team dropdown (D-4, PC-2) | Dropdown lists professional teams only |
| **8** | i18n `PLAYERS.PROFESSIONAL_LEAGUE` in `en.json` + `ar.json` (FR-012) | Both files |
| **9** | `npm run dump-spec` → `npm run gen:types` (Principle V) | `openapi.json` + `api.generated.ts` regenerated |
| **10** | SC-004 regression-proofing test — assign a coach to every professional player, assert all still reachable | The accidental route is provably no longer load-bearing |

**Phase 10 is the one that decides whether this stage worked.** Phases 1-9 add a route; Phase 10
proves the admin no longer depends on the "No coach" side effect that Stage 4's R5 decision created
by accident. A green Phases 1-9 with a failing Phase 10 means the gap was papered over, not closed.

---

## Constitution check

| | Position |
|---|---|
| **I** — server-side first | Enforcement is D-1 in the query layer. Chip and dropdown visibility are explicitly *not* the control (D-4). |
| **II** — deny by default | No permission granted. The filter narrows an already-scoped set; no role reaches a player it could not already reach. |
| **III** — no behavior change **(NON-NEGOTIABLE)** | `isolation.test.js` **not edited**. FR-014 regression tests for admin/coach/observer. PC-1 changes the No coach chip's client-side navigation only — no scope, ownership, mask or endpoint is touched, so this does not engage Principle III's data-behavior guarantee; see plan text above for why. |
| **IV** — single central scope layer | `services/scope.js` **not touched**. The filter joins the existing whitelist and the existing merge precedence. No hand-written condition in any controller. |
| **V** — independently deployable | Self-contained; depends only on Stage 4b being merged. Phase 8 keeps `openapi.json` → `UserRole` derivation intact. |
| **VI** — positive + negative | No new permission, so the Stage 4 endpoint inventory stands unchanged. Negative tests still owed: FR-003, SC-006. |
| **VII** — role-name single source | No new role; `ROLES` / `auth.isAdmin()` used throughout. No new string literals. |
| **C-4** | Relied upon unchanged. This stage surfaces the consequence of the v1.0.2 exception; it does not extend or reinterpret it. |
| **C-1, C-2, C-3, C-5** | Not touched. `TODO(AGES_UNAUTHENTICATED_READ)` remains open. |

**No constitutional amendment required.**

---

## Risks

- **PC-1 changes an existing control's behavior for the first time in this project outside a stage
  whose stated subject is that control.** Owner-directed and narrow — client-side navigation only,
  two frontend assertions updated in place — but it is still a precedent: this is the first time a
  "gap-fix" stage has edited behavior of a feature not in its own name. Worth remembering if a future
  gap-fix stage cites this one as license for a bigger edit.
- **PC-2 grows scope by one control.** Bounded to the lens (D-4) so it does not become a general team
  filter for every role by default.
- **A silent cast failure fails open.** If `"true"` ever stops casting to boolean, the filter is
  ignored and the lens shows *every* player — visibly wrong to an admin, but wrong in the permissive
  direction. Asserted by test in Phase 3 rather than trusted.
