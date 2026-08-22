# Stage 4c — Admin Lens for Professional-League Players

**Not part of `docs/scout-pro-plan-v2.md`.** This is a gap-fix for a regression Stage 4b introduced
and did not notice: professional players (`isProfessional: true`) carry no `ageGroup` at all (C-4
exception, constitution v1.0.2), so they belong to no age-group card on the admin's players page and
had no intentional route to them at all.

Spec, plan, and tasks: `specs/006-admin-professional-lens/`.

## What this does

- Adds `isProfessional` as an ordinary, whitelisted list filter on `GET /players` and an explicit
  `professional` count on `GET /players/counts` — both server-side, both scoped exactly like every
  other filter (no new permission, no scope-layer change).
- Adds a **Professional League** chip to the admin's players page, next to the existing **No coach**
  chip, opening a flat, searchable, sortable, paginated list of every professional player.
- Adds a professional-league-only team dropdown, shown only while that lens is active (owner-directed
  addition, PC-2 — the request named a filter dropdown that didn't exist on this page yet).
- Changes the **No coach** chip's own toggle behavior to match the new chip: both now fully reset the
  view on activation instead of merging query params (owner-directed, PC-1 — the one behavior change
  in this stage to a control not named in its own scope).

## Constraint ledger

**Layers touched:**

| Layer | Change |
|---|---|
| `allowedTo` role gate | **None.** No new permission is granted to any role. |
| Central scope layer | **Not touched.** `services/scope.js` untouched. `isProfessional` joins the existing `PLAYER_FILTERS` whitelist in `playerController.js` and is merged by the existing precedence rule (client query < route param < ownership scope, scope applied last). |
| Per-document ownership | Not touched. |

**Constitution constraints addressed or relied upon:**

- **C-4 — relied upon, unchanged.** This stage is entirely downstream of the `isProfessional` /
  no-`ageGroup` exception ratified in v1.0.2. It makes that exception's consequence visible to the
  admin; it does not extend, narrow, or reinterpret it.
- **C-1, C-2, C-3, C-5** — not touched.
- **Principle III (non-negotiable)** — `Backend/tests/isolation.test.js` is **unmodified** (verified:
  zero diff). The one deliberate behavior change in this stage (PC-1, the No-coach chip's toggle
  semantics) is client-side navigation only — no endpoint, scope, ownership, or mask is touched by
  it, so it does not engage this principle's data-behavior guarantee. See `plan.md` for the full
  argument.
- **Principle VI** — grants no new permission, so the Stage 4 endpoint inventory is unchanged.
  Negative tests are still owed and present: a coach/observer/proScout cannot widen their scope with
  the new filter (`Backend/tests/roles/adminProfessionalLens.test.js`).

## Test results

| Suite | Before this stage | After |
|---|---|---|
| Backend (vitest) | 594 passed / 25 files | **612 passed / 26 files** |
| Frontend (karma) | 117 passed | **137 passed** |
| `Backend/tests/isolation.test.js` | unmodified | **unmodified (zero diff)** |

`npm run build` (frontend) clean — pre-existing bundle-budget warnings only, unrelated to this
change. `npm run dump-spec` + `npm run gen:types` run in this PR.

## Two corrections made during implementation

Both planned tests turned out to assert something not actually true, discovered while writing them —
recorded here rather than silently adjusted, following the project's established precedent for
correcting prior research in place:

1. **The filter is not a literal no-op for `proScout` on both values.** `plan.md`'s original framing
   ("`?isProfessional=true` and `?isProfessional=false` return the same result") was wrong: every
   player a `proScout` can create is flagged `isProfessional: true` by Stage 4's own create
   controller, so `?isProfessional=false` correctly narrows to **zero** — that's the filter working,
   not failing. Split into two assertions: `true` matches the unfiltered result (the actual "no-op"
   claim in FR-010/FR-015), `false` returns empty without becoming an oracle.
2. **An invalid filter value is rejected with 400, not silently ignored.** `plan.md`'s risk section
   anticipated needing to guard against a silent cast fallback to the unfiltered set. Measured
   reality: Mongoose's `Boolean` cast throws a `CastError` for a non-boolean-like string, and this
   project's existing `handelCastError` (`middlewares/errorMiddleware.js`) already turns that into a
   plain 400 — the same mechanism every other Boolean/ObjectId filter in the codebase already relies
   on. There was no silent-fallback risk to close; the test asserts existing, already-safe behavior.

## The decisive test

**`SC-004` (`adminProfessionalLens.test.js`, "the professional lens does not depend on the 'No coach'
accident")** — assigns a coach to every professional player in the fixture, confirms the old "No
coach" route is now empty, and confirms the new `?isProfessional=true` lens still finds all of them.
This is the test that actually closes the gap named in `spec.md`: before this stage, the admin's only
route to professional players was a side effect of Stage 4's decision to leave `Player.coach` unset
for `proScout`-created players (research R5) — an ownership decision, not a navigation one. Any future
change assigning a coach to these players would have silently removed the admin's last route to them.
It no longer does.

## Owner-directed decisions recorded in `plan.md`

- **PC-1** — the **No coach** chip's toggle was changed (not just the new chip) to fully reset the
  view on activation, for consistency between the two controls. This is the one behavior change in
  the stage whose subject is not the new filter itself.
- **PC-2** — the team filter named in the request did not exist on this page; it was built new,
  scoped to render only while the professional lens is active (not a general team filter for every
  role/view).

Both are argued in full in `plan.md`, with the premise mismatch against the original clarification
recorded rather than silently resolved.

## Still outstanding

None — all 36 tasks in `tasks.md` are complete, including the decisive `SC-004` regression test.
`TODO(AGES_UNAUTHENTICATED_READ)` (C-3) remains open, as before this stage; it is out of scope here.
