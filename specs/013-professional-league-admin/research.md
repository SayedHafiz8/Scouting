# Phase 0 Research: Professional League Admin Page

All product-scope decisions were resolved by the owner before `/speckit-plan` (see
`docs/scout-pro-plan-v2.md`, Stage 13, and `specs/013-professional-league-admin/spec.md`
Assumptions). This phase's job is to verify those decisions against the actual code and resolve
the technical unknowns discovered while doing so — one of which (R6) turned out to be a genuine
blocker requiring a constitutional amendment, now applied (`.specify/memory/constitution.md`
v1.2.0).

## R1 — Sidebar entry and route guard

**Decision**: Add one `NAV_ITEMS` entry (`sidebar.component.ts:22-30`) between the existing
`NAV.OBSERVERS` and `NAV.AGE_GROUPS` rows: `{ labelKey: 'NAV.PROFESSIONAL_LEAGUE', icon:
'professional-league', route: '/professional-league', roles: ['admin'] }`. Add a matching
`NavIcon` union member and one new `@case` in the icon `@switch` (line 62-103) — a simple
stroke-style icon consistent with the existing set (final pick subject to the R9 design review,
not decided here). Mount the route in `app.routes.ts` at the same level as `/observers`
(`app.routes.ts:24-28`), with `canActivate: [roleGuard(['admin'])]` — identical pattern, not a new
mechanism.

**Rationale**: `NAV_ITEMS` is a declarative, deny-by-default array (Stage 3) — a new admin-only
row is a one-line addition, no template `@if` branching needed. `roleGuard` already exists and is
reused verbatim for every other admin-only route.

**Verification needed at task time**: `sidebar.component.spec.ts:65` asserts the exact admin menu
href list (`['/dashboard', '/players', '/users', '/observers', '/age-groups', '/profile']`) — this
MUST be updated to insert `/professional-league` in the correct position, or the test fails
(intentionally — it is the regression guard for FR-001/nav ordering).

## R2 — proScout management: reuse, with two real gaps found

**Decision confirmed and refined**: `UserFormComponent`/`UserDetailComponent`/`UserService` are
reused, per the spec's Assumptions — but the initial code investigation (Stage 13's pre-specify
pass) understated the work: it assumed the reuse was already "complete" for `proScout` because
`ROLE_OPTIONS` includes it. Deeper reading during this plan phase found two real gaps:

1. **`user-form.component.ts:374`** — the query-param role preselect only whitelists
   `'observer' | 'admin' | 'coach'`. Navigating to `/pro-scouts/new?role=proScout` (the pattern
   `/observers/new?role=observer` establishes) would silently leave the role dropdown on its
   default, not proScout. **Fix**: add `'proScout'` to that whitelist.
2. **`user-form.component.ts:419-423`** — the post-submit redirect (`dest()`) is a hard binary:
   `observer` → `/observers`, everything else → `/users`. A newly created proScout would be sent
   to the coach list, not back to the new page. **Fix**: extend to a three-way branch (`observer`
   → `/observers`, `proScout` → `/professional-league`, else → `/users`), the smallest change that
   keeps `coach`/`admin` behavior byte-identical (FR-009).

**`UserDetailComponent`** has the same shape of gap, at a different layer:
`isObserverCtx`/`isCoachCtx` (`user-detail.component.ts:393-394`) drive the page's title,
breadcrumb link, cancel/edit links, and role-specific quick actions (`view players` /
`view dashboard`, lines ~149-169, ~403). A proScout falls into neither computed flag today, so it
silently inherits the **coach** branch everywhere (wrong breadcrumb label, wrong back-link, and a
"view coach's dashboard" quick action wired to `/dashboard/admin?coach=<id>` — a route that has no
meaning for a proScout and was never built, per Stage 5's explicit "بيتاعه هو بس، مفيش نسخة أدمن").
**Fix, decided here** (a reuse-shape implementation detail, not a new product-scope question —
consistent with the spec's own framing of FR-003): generalize the binary flags to a three-way
`contextGroup` computed (`'observers' | 'coaches' | 'proScouts'`), each with its own title/
breadcrumb/back-route, and **hide** the "view dashboard"/"view players" quick action entirely for
the proScout context rather than pointing it at a page that does not exist — building an
admin-facing proScout dashboard drill-down is explicitly out of scope for this feature (it is not
in the spec's user stories, and inventing one here would silently grow scope).

**Rationale for reuse over a new form/detail pair**: the alternative (a parallel `ProScoutForm`/
`ProScoutDetail`) would duplicate ~250 lines of already-working create/edit/upload logic for a
one-line role difference — exactly the kind of unjustified complexity Constitution Governance
("التعقيد MUST يُبرَّر") rules out. The two gaps above are small, targeted edits to existing
conditionals, not a rewrite.

## R3 — Team management: create + list + delete, no age-group picker

**Decision confirmed**: reuse `TeamService` (`getAll`, `create`, `delete` — already used this way
nowhere in a standalone page, but the calls themselves are generic). `getAll(undefined, 'professional')`
already supports scoping by league with no age group. `create()`'s payload type
(`{ name, clubName, ageGroup, league }`) needs `ageGroup` to become optional
(`ageGroup?: string`), and the new page's create call omits it — the backend (R6 below) then
determines the saved value from `league`, not from what the client sends.

**No new component needed for the list/create/delete UI shape** — it is new markup (this page has
no age-group context to embed inside), but it is a small, direct adaptation of the *pattern*
already proven in `age-group-detail.component.ts`'s teams section (`age-group-detail.component.ts:104-168`),
not new interaction design.

## R4 — Match management: create + list + edit + result, no age-group picker

**Decision confirmed**: reuse `SeasonMatchService` the same way, scoped to `league: 'professional'`.
`SeasonMatchPayload.ageGroup` stays required at the type level (R6 keeps `SeasonMatch.ageGroup`
required for `premier` matches) — the new page must still send a value for the request to
type-check today, unless (per R6) the backend is changed to accept its absence for professional
fixtures, at which point the frontend type also becomes conditionally optional. See R6.

## R5 — `Team.ageGroup`: schema and validation changes, mirroring `Player.isProfessional`

**Decision** (owner-confirmed, `docs/scout-pro-plan-v2.md` Stage 13):

- `Backend/models/teamModel.js`: remove `required: true` from the `ageGroup` field definition.
  Add `pre('save')`/`pre('findOneAndUpdate')` hooks mirroring `playedModel.js:207-237` exactly:
  if `league === 'professional'`, clear `ageGroup` (`undefined`); otherwise, require it explicitly
  (throw if absent — a check, not an inference) so `premier` behavior is provably unchanged.
- `Backend/utils/validation/teamValidation.js`'s `createValidate` custom check (lines 38-58)
  currently *unconditionally* requires `ageGroup` (from body or nested route param) with the
  message "Team must belong to an ageGroup". This must become conditional on
  `req.body.league !== 'professional'` — for professional teams, skip the lookup/requirement
  entirely (the model-level hook is the authoritative enforcement point, same division of
  responsibility as `Player.isProfessional`: validation permits, the model's `pre('save')`
  guarantees).
- `updateValidate` (lines 65-68) currently validates only `id` — no field-level validation exists
  on `PATCH /teams/:id` today for any field. Out of scope to add here (this feature does not add a
  team-edit UI; the existing gap is pre-existing and untouched, Constitution Principle III).
- **Migration**: existing professional-league team documents already carry an `ageGroup` value
  (an accident of whichever age-group page they were created under). A one-off backfill script
  clears it, following the exact pattern of `Backend/scripts/backfillPlayerCreatedBy.js`:
  dry-run by default, `--apply` to write, cursor + `bulkWrite` in batches, a documented rollback
  (`Team.updateMany({ league: "professional" }, { $unset: { ageGroup: "" } })` is already
  effectively the forward operation, so rollback here means re-deriving a value, which is not
  meaningful — the script's header should instead document that rollback is "not applicable,
  the pre-migration value was itself accidental," consistent with how
  `backfillPlayerCreatedBy.js` treats its own orphan case). New npm script `unset-professional-team-agegroup`
  in `Backend/package.json`, alongside `backfill-player-createdby`.
- **Swagger**: `Team` schema's `ageGroup` property (`Backend/utils/swagger.js:83`) needs
  `nullable: true` added — it can now legitimately be absent.

## R6 — `SeasonMatch.ageGroup`: the blocking discovery, now resolved

**Decision** (owner-confirmed after a paused `/speckit-plan` session and a constitutional
amendment — `.specify/memory/constitution.md` v1.2.0): `SeasonMatch.ageGroup` gains the exact same
kind of exception as `Player.isProfessional`, for fixtures between two `league: "professional"`
teams. This was **not** assumable from the original Stage 13 decision (which only addressed
`Team.ageGroup`) — the constitution explicitly locked `SeasonMatch.ageGroup` as required "بلا
استثناء... هذا الاستثناء يخص Player وحده" (no exception, Player's is the only one). Proceeding
without resolving this would have shipped a feature whose headline capability (US3, professional
fixture management) crashes on first use: `teamBelongsToMatchAgeGroup` in
`Backend/utils/validation/seasonMatchValidation.js:64` calls `team.ageGroup.toString()`
unconditionally whenever a match-level `ageGroup` is present (and it always is, being required) —
with `Team.ageGroup` now `undefined` for professional teams (R5), this throws a `TypeError` on
every professional-league fixture create/edit attempt.

**Implementation, mirroring R5 exactly**:

- `Backend/models/seasonMatchModel.js`: remove `required: true` from `ageGroup`; add
  `pre('save')`/`pre('findOneAndUpdate')` hooks — if both `homeTeam` and `awayTeam` resolve to
  `league: "professional"` teams (equivalently: `req.body.league === 'professional'`, since a
  fixture's own `league` already determines which teams it may reference, per
  `teamBelongsToMatchAgeGroup`'s existing `league` check), clear `ageGroup`; otherwise require it
  explicitly, unchanged from today.
- `Backend/utils/validation/seasonMatchValidation.js`:
  - `teamBelongsToMatchAgeGroup` (lines 54-71): the `team.ageGroup.toString()` comparison
    (line 64) MUST be skipped when `matchLeague === 'professional'` (or, defensively, whenever
    `team.ageGroup` is absent) — not merely guarded against throwing, but treated as "no
    constraint to check here," matching the new constitution language ("MUST يتخطّى الفحص ده
    صراحةً... تجاهله بصمت... MUST NOT يُعتبر تنفيذاً كافياً").
  - `resolveMatchContext` (lines 42-51), `noDuplicateFixture` (lines 89-...), and the two other
    call sites of the `ageGroup`/`league` pair (~line 92, ~line 135) all currently treat a missing
    `ageGroup` as "can't validate yet, skip" (`if (!ageGroup || ...) return true;`) — this already
    degrades gracefully for an absent `ageGroup`, so these do **not** need changes; only the one
    unconditional `.toString()` call does.
- **Swagger**: the `SeasonMatch`-shaped schema's `ageGroup` property needs `nullable: true` —
  exact schema name/location to be confirmed at task time (not found under the literal name
  `SeasonMatch` in a first pass of `swagger.js`; likely composed differently, e.g. per-response
  shape).

**Rationale for this option over the two alternatives presented to the owner**: a single canonical
placeholder `AgeGroup` document would have reintroduced exactly the "arbitrary value assigned by
accident" smell this whole feature exists to remove, just centralized instead of per-page; asking
the admin to still pick an `ageGroup` only for fixtures would contradict the spirit of "no
age-group concept for the professional league" for half the feature while removing it for the
other half. Mirroring the existing, already-proven `Player.isProfessional` pattern keeps exactly
one exception *shape* in the codebase, applied twice.

## R7 — Admin dashboard: `totalProScouts`, same undocumented pink

**Decision confirmed**: `Backend/controllers/dashboardController.js`'s `computeAdminDashboardData`
(lines 83-155) adds one `Promise.all` entry, `User.countDocuments({ role: ROLES.PRO_SCOUT })`,
alongside the existing `totalCoaches`/`totalObservers` entries (lines 102-103), and one return
field `totalProScouts`. `Backend/utils/swagger.js`'s `AdminDashboard` schema (lines 228-241) gains
one `integer` property. `npm run dump-spec` + `npm run gen:types` in the same PR (Constitution
Principle V, same as Stage 12).

On the frontend, `admin-dashboard.component.ts:83-106`'s hand-built two-column card becomes three
columns: change the `flex items-center gap-4` row (line 94) to hold a third `flex-1 min-w-0` block
plus a second `width:1px` divider (line 99's pattern, duplicated), reusing the exact same
`#f472b6`/`rgba(236,72,153,…)` color already on that card (no new CSS variable, no `app-stat-card`
— this card was never built from that shared component, and there's no reason to migrate it as
part of this feature).

## R8 — i18n

**Decision**: new keys needed in both `en.json` and `ar.json` (Constitution "دورة كل مرحلة" /
CLAUDE.md i18n rule): `NAV.PROFESSIONAL_LEAGUE`, a new `PROSCOUTS` namespace mirroring the
existing `OBSERVERS` namespace shape exactly (`TITLE`, `SUBTITLE`, `ADD`, `ROLE_BADGE`, `EMPTY`,
`EMPTY_MSG`, `DEACTIVATE_TITLE`, `DEACTIVATE_MSG`, `FORM.ADD_TITLE`, `FORM.EDIT_TITLE`), and a new
top-level namespace for the page's team/match sections (exact key shape to be finalized at task
time against whatever the R9 design pass settles on — likely reusing `TEAMS.*`/`SEASON_MATCHES.*`
keys already used by `age-group-detail.component.ts` rather than duplicating them, since the
underlying concepts are identical).

## R9 — Design consistency review

**Decision** (owner-confirmed): the `ui-ux-pro-max` skill is invoked before any UI/template work
begins on this feature (FR-011), reviewing against `frontend/src/styles.scss`'s documented token
system (colors, `.card`/`.form-input` conventions, `scale(1.015)` hover pattern, focus-visible
rules) as the source of truth — not as a substitute for it. This is a process step for
`/speckit-implement`, not a design decision this plan makes itself; recorded here so the
requirement is not lost between phases.
