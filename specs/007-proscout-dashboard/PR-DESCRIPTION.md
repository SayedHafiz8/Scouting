# Stage 5 — ProScout Dashboard

Part of `docs/scout-pro-plan-v2.md`, Stage 5. Spec, plan, research, data model, contracts, and
tasks: `specs/007-proscout-dashboard/`.

## What this does

- Adds `GET /dashboard/proScout`, following the exact `{ status, data }` shape of
  `/dashboard/coach` and `/dashboard/observer`. Every figure is read through the Stage 2 central
  scope layer (`playerScopeFor`, `seasonMatchScopeFor` in `services/scope.js`) — no new,
  independently-written scope-equivalent query.
- Indicators: scoped player count, upcoming professional-league matches (count + list), latest
  results, and the proScout's own recent scouting reports.
- No age-group content anywhere on the dashboard — actively excluded, not merely unrequested (see
  "SeasonMatch auto-populate" below).
- Explicit empty-state messaging per list section, in both English and Arabic.
- Adds `/dashboard/proScout` to the frontend route table, guarded to the role.
- **Discharges DF-001** (open since Stage 3): edits the existing temporary `case 'proScout'` in
  `RoleLandingService` in place (was `/players`, now `/dashboard/proScout`) and adds the role to the
  sidebar's Dashboard entry — no second `switch` branch was added.

## Constraint ledger

**Layers touched:**

| Layer | Change |
|---|---|
| `allowedTo` role gate | **One addition.** `allowedTo(ROLES.PRO_SCOUT)` on the new `/dashboard/proScout` route. No existing `allowedTo` call is touched. |
| Central scope layer | **Consumed, not modified.** `services/scope.js` exports are read-only from this stage's controller code; `playerScopeFor`/`seasonMatchScopeFor` are unchanged. |
| Per-document ownership | **Not touched.** No `/:id` path is added — there is no addressable resource behind this endpoint, so `middlewares/ownership.js` gains no branch. |

**Constitution constraints addressed or relied upon:**

- **C-4 — relied upon, unchanged.** The `league: "professional"` definition is consumed only
  through the scope layer; no literal `"professional"` appears in the new controller code.
- **C-3 — remains open, untouched.** `GET /ages` still carries no `protect` at all
  (`TODO(AGES_UNAUTHENTICATED_READ)`). This stage requests no age-group data, which is a change of
  *intent*, not a closed door — restated explicitly in
  `contracts/endpoint-inventory-delta.md` so the absent Age Groups nav entry is never mistaken for
  server-side enforcement.
- **C-1, C-2, C-5** — not touched.
- **Principle III (non-negotiable)** — `Backend/tests/isolation.test.js` is **unmodified** (verified
  zero diff). `/dashboard/coach`, `/dashboard/observer`, `/dashboard/admin`, and
  `/dashboard/admin/coaches-stats` responses and caching are asserted unchanged by test
  (`tests/roles/proScoutDashboard.test.js`, G-7).
- **Principle IV (single scope layer)** — every filter composition nests in `$and`
  (`{ $and: [ scope, <own condition> ] }`), never spreads. Measured: spreading a scope object whose
  caller also carries `$and` silently discards the scope and would have returned the whole premier
  league (`research.md` R1). This is the one place in the feature where the "obvious" implementation
  is actively wrong, so it's called out here rather than left to be rediscovered.
- **Principle VI (positive + negative test per permission)** — `tests/roles/proScoutDashboard.test.js`
  carries both: exact-count/content positive assertions for every figure, and 403 (not a 200 with
  zeroes) for admin, coach, and observer.

## Two deliberate asymmetries with the sibling dashboards

Both are intentional scope decisions, not oversights, and are worth a reviewer's explicit sign-off
rather than being noticed later as "missing":

- **No caching.** `dashboardController.js`'s existing §11 comment block already states that a shared
  cache key over per-user-scoped data is a cross-role leak, and that coach/observer dashboards are
  deliberately not cached for exactly that reason. This dashboard follows the same rule — no read or
  write to `dashboardCache`.
- **No socket emitter.** Adding one would require instrumenting existing shared mutating controllers
  (player/report/media writes) — exactly the surface Principle III protects — for a capability no
  acceptance criterion in this stage asks for. `research.md` R9 records the reasoning; it's a
  candidate for its own follow-up stage if wanted.

## A correctness trap this stage had to design around

`SeasonMatch` has a `pre(/^find/)` hook that auto-populates `ageGroup` (plus both teams and
attendees) on **every** `find` unless `skipPopulate` is set. A source-level review of "no age-group
data" would have passed while the response body still carried it. The match queries pass
`.setOptions({ skipPopulate: true })` and populate `homeTeam`/`awayTeam` explicitly with a narrow
`select`; the negative test asserts against `JSON.stringify(res.body)`, not against the source.

## Test results

- Backend: **625/625** (613 baseline + 12 new, `tests/roles/proScoutDashboard.test.js`) —
  `tests/isolation.test.js` unmodified and passing.
- Frontend: **142/142** (137 baseline + 5 new component-spec cases; 7 pre-existing cases across
  `role-landing.service.spec.ts`, `sidebar.component.spec.ts`, and `role.guard.spec.ts` updated as
  edits, not additions, to reflect the new landing destination — see `research.md` R10).
- `npm run build`: exit 0, no new bundle-budget warnings.
- `npm run dump-spec` / `npm run gen:types`: one operation, one schema, additive diff only.

## Known gap in this PR

**T046 (manual browser smoke test) was not run.** `Backend/config.env` has no local database
configured — dev mode points at a live remote Atlas cluster (`academy_system`) — so running the dev
servers to click through the flow would have written test data (a proScout user, teams, matches)
into that shared database without confirmation. Given the strength of the automated coverage above
(all G-1…G-7 scope guarantees, all navigation/redirect cases, all empty-state cases), this was left
for the reviewer/owner to do manually against an environment they control, rather than assumed safe
to run against unilaterally.
