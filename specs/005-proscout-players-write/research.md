# Phase 0 — Research: proScout Players Page & Write Access

**Feature**: `specs/005-proscout-players-write/` | **Branch**: `004-proscout-players-write` | **Date**: 2026-08-21

All findings below are measured against the working tree at `phase-3-navigation-routing`
(Stages 0–3 merged into the branch, not yet into `main`).

---

## R1 — The entire read half of this stage is already built. Stage 4 verifies it; it does not write it.

**Decision**: FR-001, FR-004, FR-005, FR-006 require **zero new backend code**. They ship as
verification tasks (tests that would fail if the behavior regressed), not implementation tasks.

**Evidence** — Stage 2 landed a central scope layer and wired every read path to it:

| Requirement | Already implemented at | Status |
|---|---|---|
| FR-001 players list scope | `services/scope.js:82` `playerScopeFor` → `playerController.js:242` | Done |
| FR-004 search/sort/pagination in scope | `playerController.js:244-271` (scope in base position, `ApiFeature` chains on top) | Done |
| FR-005 counts scoped | `playerController.js:127-128` (`$and: [scope, match]`) | Done |
| FR-005 average-ratings scoped | `scoutingReportController.getAverageRatingsForPlayers` (Stage 2 R6 fix) | Done |
| FR-006 `maskObservedForCoach` on proScout | `playerController.js:280` (list), `:306` (detail), `:101` (counts) | Done |
| Direct-ID denial | `ownership.js:55-66` `checkPlayerOwnership` proScout branch | Done |

**Rationale for calling this out loudly**: the plan document's Stage 4 text lists these as work
items. Treating them as work items would mean re-implementing a scope path that already exists —
the exact duplication Principle IV forbids. The `[NEEDS CLARIFICATION]` in the plan
(`maskObservedForCoach`?) was already answered in code by Stage 2 deviation #5, and the owner
confirmed that answer before this spec was written.

**Alternatives considered**: adding a second "Stage-4 scope" for the write paths. Rejected —
Principle IV. Every new write guard reads `playerScopeFor` / `professionalTeamIds` from
`services/scope.js`.

---

## R2 — `DELETE /players/{playerId}/reports/{id}` is admin-only today, **not** coach+observer.

**Decision**: proScout gets `POST` and `PATCH` on reports. It does **not** get `DELETE`.

**Evidence**: `routes/scoutingReportRouter.js:282` —
`.delete(protect, allowedTo(ROLES.ADMIN), deleteValidate, deleting)`.

**Rationale**: the plan document asserts "حالياً coach + observer" for PATCH/DELETE. That is
accurate for PATCH and wrong for DELETE. The spec's own governing rule (Assumptions §3:
"mirroring current coach permissions … not a broader set") and Principle II both resolve the
conflict the same way: coach cannot delete a report, so proScout cannot either. Granting DELETE
would hand a brand-new role a destructive privilege that two established roles lack, on the
strength of a factual error in a planning document.

**Alternatives considered**: granting DELETE as literally written. Rejected — it is a
privilege *escalation* relative to the stated model, and it is irreversible on data
(reports are hard-deleted).

---

## R3 — `GET /players/{playerId}/media/{id}/download` is admin-only by deliberate security design.

**Decision**: proScout does **not** get `/media/:id/download`.

**Evidence**: `routes/playerMediaRouter.js` — `.get(protect, allowedTo(ROLES.ADMIN), …, downloadVideo)`,
carrying the inline comment `Download the 720p MP4 (backend-proxied attachment — F7d) — admin-only`.
The sibling `DELETE /media/:id` is admin-only for the same reason (`F5/F7d restriction`).

**Rationale**: identical to R2, but stronger — `F7d` is a numbered item from the project's security
review, and the constitution's Conventions section requires those markers be preserved as
documentation of *why* a constraint exists. The plan text ("`/media/{id}/download`: أضف proScout")
would silently reverse a security-review decision. Coaches and observers upload media and cannot
download the source file; proScout matches them.

**What proScout does get on media** (the exact coach set): `POST /media/video`,
`GET /media/upload-eligibility`, `POST /media/video/:mediaId/upload-envelope`,
`GET /media`, `POST /media`, `GET /media/:id`.

**Alternatives considered**: granting download and documenting it as an accepted exception.
Rejected — no requirement in the spec needs it; US4 is satisfied by upload + view.

---

## R4 — Out-of-scope team assignment already fails, with **400**, and that is deliberate. Do not change it to 403.

**Decision**: keep the existing 400. Restate the spec's acceptance criteria as "rejected, and
indistinguishable from a nonexistent team id" rather than "403".

**Evidence**: `utils/validation/playerValidation.js:19-26` `teamExistsInScope` runs
`teamScopeFor(req)` and rejects with `No team for this id: <id>` → `validatorMiddleware` → 400.
It is already applied to `createValidate` (`:97-100`) and `updateValidate` (`:149-152`).

**Rationale**: the Stage-2 comment above that helper documents the reason at length. A 403 for
"team exists but is out of your league" versus 400 for "no such team" is an **oracle**: it lets a
proScout enumerate which arbitrary ObjectIds are real premier-league teams, defeating
`checkTeamScope`'s 403 on `GET /teams/:id`. Converting to 403 to satisfy a literal reading of the
acceptance criterion would reintroduce exactly the leak Stage 2 closed.

**Consequence for the spec**: FR-008's "403" is amended in `contracts/` to "rejected (400,
message identical to an unknown team id)". Principle I is still satisfied — the request is
refused server-side with an error status, not a 200 with an empty body.

**Alternatives considered**: 404. Rejected — same oracle problem in reverse, and it would change
the response coach and observer already get for a bad team id (Principle III).

---

## R5 — `playerController.create` writes `coach = req.user._id` unconditionally. A proScout must not become a player's `coach`.

**Decision**: for `ROLES.PRO_SCOUT`, leave `Player.coach` **unset**. `createdBy` carries the
attribution. `coach` continues to be set from the token for `ROLES.COACH`, byte-identically.

**Evidence**:
- `playerController.js:37-40` — `req.body.coach = req.user._id; req.body.createdBy = req.user._id;`
- `models/playedModel.js:100-103` — `coach` is deliberately **not** `required`; the §9 comment
  describes the "orphan player" state as a supported, admin-recoverable condition.
- `playerController.js:482` `assignPlayerCoach` validates `User.findOne({ _id, role: ROLES.COACH })`
  — the system's own definition of what may occupy `coach`.
- `ownership.js:44` — the coach branch compares `player.coach` to the requesting coach's id; a
  proScout's id can never match a coach's, so a proScout-created player is invisible to every coach
  either way.

**Rationale**: writing a proScout's id into `coach` would create rows that the codebase's own
validator (`assignPlayerCoach`) considers invalid, and would surface a proScout's name in the
admin's Coach column and `?coach=` lens — a visible change to admin behavior on a field whose
meaning is "the coach who owns this player". Leaving it unset reuses the already-supported orphan
state, keeps `PATCH /players/:id/coach` as the single legitimate way to give a player a coach, and
costs proScout nothing: its own access comes from `team`/`createdBy`, never from `coach`.

**Known consequence, accepted**: proScout-created team-less players appear in the admin's
"No coach" (`?coach=none`) lens. That lens exists precisely to collect players needing a coach
assignment, so this is the intended destination, not pollution.

**Alternatives considered**:
- `coach = proScout id` — rejected above.
- Making `coach` required and inventing a placeholder — rejected; schema change with a migration,
  for no requirement.

**Follow-up to verify during implementation**: confirm no consumer dereferences `player.coach`
without a null guard on the create path (`emitCoachDashboardUpdate` at `:393` and `:501` is
already guarded; `dailySummary` and the coach dashboard aggregations need a read-through).

---

## R6 — `checkReportOwnership` and `checkMediaOwnership` currently hard-deny proScout by design; Stage 4 is where those branches become real.

**Decision**: replace the placeholder 403 branches with the real checks. Both must verify
**two** axes, not one.

**Evidence**: `ownership.js:97-100` and `:132-135` each contain a proScout branch that logs and
returns 403, with a comment stating the branch exists so that "opening the gate in Stage 4 is one
line, not deferred security thinking".

**Required shape**:
- **Report** — author check (`report.coach === req.user._id`, the same field coach and observer use;
  `scoutingReportController.js:116` sets `coach = req.user._id` for whoever authors) **AND**
  player-in-scope check. The second axis is load-bearing: `/reports/:id` routes run
  `checkReportOwnership` **only** — `checkPlayerOwnership` is not in that chain
  (`scoutingReportRouter.js:280-281`). Without it, a report authored while its player was on a
  professional team stays editable after an admin moves that player to another league.
- **Media** — same two axes (`media.uploadedBy` + player-in-scope), plus the existing
  `media.player === req.params.playerId` consistency check.

**Rationale**: this is the identical failure mode Stage 2 documented for
`checkSeasonMatchAttendee` — "membership alone is not a league check". The scope is the load-bearing
half; ownership alone fails open on data that moves.

**Alternatives considered**: relying on the parent `checkPlayerOwnership` for nested routes.
Rejected — it is genuinely absent from the `/reports/:id` and `/media/:id` chains.

---

## R7 — `PATCH /players/:id/profileImg` has no `checkPlayerOwnership`; it hand-rolls a coach-only check in the controller.

**Decision**: add `checkPlayerOwnership` to the route and let it carry proScout, rather than adding
a second inline `if (role === PRO_SCOUT)` branch in `uploadProfileImg`.

**Evidence**: `playerRouter.js:511-512` — the chain is
`protect, allowedTo(COACH, ADMIN), upload.single('profileImg'), uploadProfileImg`, with the
ownership comparison living at `playerController.js:537-543`.

**Rationale**: Principle IV forbids hand-written filter/ownership conditions inside controllers;
`ownership.js` is the designated layer and already has a correct proScout branch. Adding the
middleware also gives proScout the scope-denial logging every other guarded route emits.

**Constraint (Principle III)**: the existing inline coach check must stay in place and unchanged.
`checkPlayerOwnership` reaches the same verdict for coach and admin, so adding it in front is a
no-op for them — but "reaches the same verdict" must be proven by the coach/admin regression tests,
not assumed. One observable difference exists and must be checked: ordering. `checkPlayerOwnership`
runs **before** `upload.single()` if inserted early, meaning a rejected request no longer writes a
temp file — a strict improvement, but it changes which error surfaces when both the player is
missing and the file is bad. Place the middleware after `upload.single()` only if a regression test
demands the old ordering.

---

## R8 — Report and media **read** routes must open too, or the player detail page is a dead end for proScout.

**Decision**: add proScout to `GET /reports`, `GET /reports/statistics`, `GET /reports/:id`,
`GET /media`, `GET /media/:id`.

**Evidence**: `scoutingReportRouter.js:269, 275, 280` and `playerMediaRouter.js` — all currently
`allowedTo(COACH, ADMIN, OBSERVER)`. `players.routes.ts:15-33` makes `reports` the **default child
route** of player detail (`redirectTo: 'reports'`), so opening any player as proScout lands on a
403'd view.

**Rationale**: US4's acceptance scenarios require a proScout to create a report and then see it.
`getAll` for reports already scopes non-admins to their own authored reports
(`scoutingReportController.js:140` `baseFilter.coach = req.user._id`), so proScout inherits the
correct narrow behavior with no new logic — same as observer.

**Note**: these are read grants the plan document does not list. They are in-scope because FR-014's
"the page works" and US4's scenarios cannot both hold without them.

---

## R9 — `AuthService` has no `isProScout`. The frontend cannot express this role today.

**Decision**: add `readonly isProScout = computed(() => this.currentUser()?.role === 'proScout')`
alongside the existing three at `core/auth/auth.service.ts:22-24`.

**Evidence**: only three role computeds exist. Stage 3's sidebar deliberately avoided them by
building from a `NavItem[]` matrix keyed on `UserRole`, so nothing has needed `isProScout` until
now. The players page, by contrast, gates on `auth.isCoach()` / `auth.isAdmin()` / `auth.isObserver()`
in ~10 template positions.

**Rationale**: `UserRole` is already derived from `openapi.json` → `api.generated.ts:3840`, which
lists `proScout`. The computed is a typed read of an existing source of truth, not a new
declaration (Principle VII).

---

## R10 — The players list is a two-view component pivoting on age group. `skipGroupsView()` is the exact, existing hook.

**Decision**: `skipGroupsView()` gains `|| this.auth.isProScout()`. No new view mode, no template
fork.

**Evidence**: `player-list.component.ts:627-629` —
`return !!this.observerFilter || this.auth.isObserver() || this.orphanedOnly();`
`:632-650` `resolveView()` routes to a **flat player list** when this returns true, bypassing the
age-group card grid entirely (`:115` `@if (!selectedGroup() && !flatView())`).

**Rationale**: observers already get exactly the UI this feature describes — a flat, scoped,
age-group-free player list. FR-002 is one boolean, reusing a path with existing test coverage,
rather than a parallel proScout template.

**Two consequences that must be handled explicitly**:
1. `loadGroups()` (`:652-666`) fetches `/ages` unconditionally on init. For proScout the result is
   never rendered, so the call must be skipped — otherwise the page issues a request for the exact
   data category the role is meant not to consume. (`/ages` has no `protect` at all — see R12 — so
   the call *succeeds*, which makes skipping it a correctness/intent fix, not an error fix.)
2. `load()` (`:713`) sends `ageGroup: this.pendingGroupId || …`. In flat view both are empty, so no
   `ageGroup` param is sent. Confirmed safe; assert it in a test rather than trusting it.

**Alternatives considered**: hiding the age-group grid with a CSS/`@if` guard while leaving the
data flow intact. Rejected — Principle I: the visible element is not the point; the role should not
be *fetching* age-group data at all.

---

## R11 — The create/edit player form derives its Team dropdown from age group. This is the one place FR-002 genuinely conflicts with existing structure.

**Finding**: `player-form.component.ts:298-329` — `ageGroupForDob()` maps the entered date of birth
to an `AgeGroup`, and `syncTeamsForDob()` disables the Team select until a valid age group resolves,
then loads `teamService.getAll(ageGroup._id)`. Three user-visible strings name the concept:
`PLAYERS.FORM.TEAM_LOCKED`, `PLAYERS.FORM.TEAM_HINT`, `PLAYERS.FORM.TEAM_EMPTY`.

**Decision**: keep the age-group *derivation* (it is silent, server-mandated, and unavoidable —
`playedModel.js:165-179` derives `ageGroup` from `dateOfBirth` in a `pre('save')` hook and throws
without it). Change only what the proScout **sees and fetches**:
- the Team dropdown for proScout lists teams from `teamScopeFor` (professional league) — the backend
  already enforces this, so this is about which request the form makes;
- the three age-group-naming hint strings are replaced for proScout with copy that names the
  blocking condition without naming age groups (new EN + AR keys, per the constitution's
  bilingual rule).

**Rationale**: FR-002/FR-003 govern what the role *sees*, and the Assumptions section already
states the derived field stays in the data. Removing the derivation is out of the question — it is a
model-level invariant shared by every role.

**Open sub-question deferred to `/speckit-tasks`**: whether proScout's Team dropdown should stay
age-group-narrowed (professional teams *for this birth year*) or list all professional teams. The
narrower option is a strictly smaller set and cannot leak; the wider one may show teams the player
cannot legally join. Recommendation: keep the age-group narrowing, since it is invisible to the user
and produces the correct set — the requirement is to hide the concept, not to widen the data.

---

## R12 — Constraint C-3 remains unenforceable, unchanged from Stage 2 and 3.

**Finding**: `routes/ageGroupRouter.js:113,116` still expose `GET /ages` and `GET /ages/:id` with
**no `protect`**. `allowedTo` cannot deny a role on a route that never populates `req.user`.

**Decision**: unchanged — out of scope, `TODO(AGES_UNAUTHENTICATED_READ)`. R10's decision to stop
*calling* `/ages` for proScout is a client-side intent fix and must not be described, in code
comments or tests, as closing C-3. Carry forward the Stage-3 test that documents the actual
behavior (200 with a token, 200 without one).

---

## R13 — Tech debt #5: an admin cannot assign the proScout role from the UI.

**Finding**: `user-form.component.ts:170-173` hard-codes three role options
(`coach`, `admin`, `observer`) instead of deriving from `UserRole`.

**Decision**: **in scope for this stage.** The plan document flags it as "add it as a task in Stage 4
if it must be done before any full manual test of the new role" — and Stage 4 is the first stage
that produces a proScout experience worth manually testing. Without it, every acceptance scenario in
this spec requires a raw API call to create the test user.

**Rationale**: also a direct Principle VII violation (hand-written role literals in new-adjacent
code, and a parallel role list that has already drifted).

---

## R14 — ⚠️ `playerRouter` is mounted **twice**. `POST /users/:id/players` would let a proScout choose the player's `coach`.

*Discovered while building `contracts/endpoint-inventory.md` for analysis finding D1. This is a
latent privilege-escalation bug in the R5 design as originally worded, not a pre-existing one — it
becomes reachable only when `POST /players` opens to proScout.*

**Evidence**:
- `userRouter.js:482` — `userRouter.use("/:id/players", playerRouter);`
  Every player route is therefore reachable a second time under `/api/v1/users/:id/players`, where
  `req.params.id` is a **user id**, not a player id.
- `playerController.js:27-31` — `setUserIdToBody` runs first in the `POST` chain and does
  `if (!req.body.coach) req.body.coach = req.params.id;`
- `playerController.js:37` — `create` then does `req.body.coach = req.user._id`, which **overwrites**
  whatever `setUserIdToBody` put there. That unconditional overwrite is the only reason the nested
  mount is safe today.

**The concern as originally written** (and how it was corrected): R5 says "leave `coach` unset for
proScout". Implemented literally — by skipping the assignment — `req.body.coach` retains the value
`setUserIdToBody` copied from the URL, which looked like it would let a proScout
`POST /api/v1/users/<any coach id>/players` and create a player owned by a coach of their choosing.

> ### ⚠️ Correction, measured during implementation
>
> **The escalation is not reachable, and the original claim here was wrong.** This section first
> asserted that `lockField("coach")` could not catch the injected value because it "arrives via the
> path, after validation ordering is decided". That is false. The route chain is
> `setUserIdToBody, createValidate, create` — the middleware writes `req.body.coach` **before**
> `createValidate` runs, so `lockField("coach")` (`body('coach').not().exists()`) sees it and
> rejects with 400.
>
> The measured consequence is broader than the original finding: **`POST /users/:id/players` returns
> 400 for every role**, including coaches. The nested create route is dead on arrival and has been
> for as long as `lockField("coach")` has existed. It is not a proScout problem, and this stage does
> not fix it — doing so would change behavior on a route coaches nominally own (Principle III).
> Logged as new tech debt below.
>
> The `delete req.body.coach` in T008 is **kept** as defense in depth: it makes the controller
> correct independently of validator ordering, so a future reordering, an added `$set` path, or a
> new non-coach author role cannot resurrect the hazard. It is no longer the load-bearing fix it was
> described as — it is a belt alongside an existing brace.

**Decision**: the create path must **actively delete** the field, not merely decline to set it:

```js
if (req.user.role === ROLES.COACH) req.body.coach = req.user._id;
else delete req.body.coach;          // proScout (and any future non-coach author)
req.body.createdBy = req.user._id;
```

`else delete` rather than `else if (proScout) delete` — deny-by-default (Principle II): a future
fifth role that gains `POST /players` inherits the safe behavior instead of the exploitable one.

**Rationale for the shape**: the alternative — removing `setUserIdToBody` from the chain — changes
behavior on a route coaches use today (Principle III). Deleting the key in the controller is local,
additive, and leaves the coach path byte-identical.

**Test obligation** (revised to match the measurement): assert that
`POST /api/v1/users/<coachId>/players` returns **400 for a proScout and for a coach alike**,
documenting the actual behavior of the nested mount rather than a create path that does not exist.
Assert separately, on the flat route, that a proScout's created player has `coach` unset.

**New tech debt discovered here** — `POST /users/:id/players` is unreachable for every role:
`setUserIdToBody` injects `req.body.coach` and `lockField("coach")` immediately rejects it. Either
the middleware or the lock is wrong; the route has presumably never been exercised. Out of scope for
Stage 4 (fixing it changes coach-facing behavior). Recommend logging as
`TODO(NESTED_PLAYER_CREATE_DEAD)` alongside the plan document's existing tech-debt list.

---

## Summary of deviations from the plan document's Stage 4 text

| # | Plan text | Actual | Resolution |
|---|---|---|---|
| 1 | Items 1–5 are work | Already shipped in Stage 2 | Verification tasks only (R1) |
| 2 | `[NEEDS CLARIFICATION] maskObservedForCoach?` | Answered in code by Stage 2 | Confirmed by owner; FR-006 (R1) |
| 3 | Reports "حالياً coach + observer" incl. DELETE | DELETE is admin-only | proScout gets POST/PATCH, no DELETE (R2) |
| 4 | Add `/media/{id}/download` | Admin-only per security item F7d | Not granted (R3) |
| 5 | Out-of-scope team → 403 | Already rejected with 400, deliberately | Keep 400 (R4) |
| 6 | (silent) | `create` would make a proScout a player's `coach` | `coach` left unset (R5) |
| 7 | (silent) | Report/media **read** routes closed → detail page dead-ends | Opened (R8) |
| 8 | (silent) | No `isProScout` on `AuthService` | Added (R9) |
| 9 | Deferred "or Stage 4" | Role dropdown hard-codes 3 roles | In scope (R13) |
| 10 | (silent) | `playerRouter` double-mount lets a proScout pick a player's `coach` via the URL | `delete req.body.coach` (R14) |
