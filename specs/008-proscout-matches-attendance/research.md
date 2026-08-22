# Research: Pro Scout Matches & Attendance

**Feature**: `specs/008-proscout-matches-attendance/` | Phase 0

All findings below come from reading the current state of the code, not from the plan text alone —
the plan's Stage 6 section predates a corrected decision (proScout now gets match-result entry, not
just attendance) and undercounts how much of the read path is already built.

## R1 — The read path is already done; this stage is almost entirely attend + status

`GET /seasonMatches` and `GET /seasonMatches/{id}` already scope proScout to `league: "professional"`
via `seasonMatchBaseFilterFor` (`seasonMatchController.js:29-53`, delegating to `seasonMatchScopeFor`
in `services/scope.js`) and `checkSeasonMatchScope` (`middlewares/ownership.js:274-296`), both wired
in Stage 2/3. `seasonMatchRouter.js:198-204` already carries `ROLES.PRO_SCOUT` in `allowedTo` for both
`GET` routes. **No backend read-path code changes are needed for FR-001.**

**Decision**: treat FR-001 as a verification obligation (regression tests), not new code — writing
scope logic that already exists would violate Principle IV (single central scope layer) and
Principle III (no behavior change) by risking a second, divergent definition.

## R2 — `checkSeasonMatchAttendee`'s proScout branch computes the right thing and then denies anyway

`middlewares/ownership.js:252-262` already has a `PRO_SCOUT` branch that checks league scope via
`seasonMatchScopeFor`, but — per its own comment — "الحضور نفسه مرفوض دلوقتي بغض النظر" (attendance
itself is refused regardless, for now): it computes `inScope`, optionally logs a denial, then
**unconditionally** calls `next(new AppError(...))`. This was Stage 2's deliberate placeholder:
scope-check plumbing built ahead of the route being opened, so the security check would not be an
afterthought once `/status` opens.

Two things are missing for a correct grant, and the branch checks neither today:

1. **League scope** — already computed (`inScope`), just not actually gated on.
2. **Attendee membership** — the coach/observer branch two cases above
   (`ownership.js:228-236`) checks `match.attendees` for the caller's id; the proScout branch does not
   replicate this at all.

**Decision**: rewrite the proScout branch to require **both**: `inScope` (via `seasonMatchScopeFor`,
unchanged helper) **and** attendee membership (identical check to the coach/observer branch — same
`.some((a) => a.toString() === req.user._id.toString())` shape). Deny with the same message and log
a scope denial only when the scope leg fails (matching `checkSeasonMatchScope`'s existing logging
convention) — an out-of-scope match and an in-scope match the caller isn't attending are both a plain
403, but only the former is a scope violation worth logging.

## R3 — The same-day result-entry constraint applies to proScout automatically

`updateMatchStatus` (`seasonMatchController.js:120-139`) gates the "day of match" constraint on
`req.user.role !== ROLES.ADMIN`, not on an allowlist of non-admin roles. Once `ROLES.PRO_SCOUT` is
added to the route's `allowedTo`, the constraint applies to it with **zero additional code** — this
is the mechanism the corrected plan decision (`docs/scout-pro-plan-v2.md`, Stage 6 §5) relies on.

**Decision**: no change to `updateMatchStatus` itself. Confirmed by reading, not assumed — this is the
one place in the whole stage where "just add the role to `allowedTo`" is actually sufficient by
construction, precisely because the existing code was written role-generically.

## R4 — `attend`/`unattend` currently have no ownership guard of any kind

`seasonMatchRouter.js:211-213` composes `protect, allowedTo(ROLES.COACH, ROLES.OBSERVER)` for both
`POST` and `DELETE /:id/attend` — no `checkSeasonMatchScope`, no `checkSeasonMatchAttendee`, nothing
between the role gate and the controller. For coach/observer this is fine: coach's list scope is `{}`
(sees every match) and observer's own scope check happens ahead of this concern (an observer
attending an out-of-scope match is a pre-existing gap this stage does not touch — Principle III).
For proScout, `allowedTo(ROLES.PRO_SCOUT)` alone would let them attend **any** match by ID with no
league check at all — the exact shape of hole Constraint C-4 exists to close.

**Decision**: compose `checkSeasonMatchScope` onto both attend routes, ahead of the controller. This
is the same middleware already guarding `GET /:id` — reusing it means proScout's "which matches can I
touch by ID" answer has exactly one definition (Principle IV), not a second one written for attend.
The middleware already no-ops for admin and passes coach/observer through unchanged (its `default`
branch), so this does not touch existing behavior — verified by re-reading
`ownership.js:274-296` line by line.

## R5 — `attendMatch`/`unattendMatch` are also blocked on match day, not just result entry

`isBeforeMatchDay` (`seasonMatchController.js:161-165`) requires attendance to be registered or
cancelled strictly **before** the match's calendar day — the opposite window from
`updateMatchStatus`'s "only on the match day" rule. This is unrelated to role and needs no change, but
it resolves an edge case from the spec: a proScout cannot remove attendance on match day at all (the
call 400s before role/scope is even relevant), so "unattend then immediately re-enter the result the
same day" is not reachable through the API — the spec's edge case holds trivially, not through new
enforcement.

## R6 — The frontend matches page is already role-agnostic where it matters

`MyMatchesComponent` (`frontend/.../season-matches/my-matches/my-matches.component.ts`) computes
`isAttending`, `canToggleAttend`, and `canEnterResult` from `auth.isAdmin()` plus attendee-membership
checks against `auth.currentUser()` — **not** from `isCoach()`/`isObserver()`. A proScout landing on
this exact component, with the route opened to it, gets working attendance and (once R3's route
change lands) working result entry with no logic change to those three methods.

What the component does **not** yet handle correctly for proScout:

- The age-group column (`SEASON_MATCHES.AGE_GROUP` header + `ageGroupName(m.ageGroup)` cell,
  `my-matches.component.ts:82,107`) renders unconditionally — must be suppressed for this role
  (FR-002; the field itself stays in the API response per Constitution C-4, only UI exposure changes).
- The league toggle defaults to `'premier'` and is always interactive
  (`my-matches.component.ts:303,54-61`). A proScout has exactly one league to see; leaving the toggle
  live and defaulted to the wrong tab means their first view is a confusing empty list (the backend's
  `$and`-wrapped scope silently returns nothing for `league=premier`, per Stage 5's R1/R12 finding —
  it does not error, it just shows zero rows). **Decision**: default `selectedLeague` to
  `'professional'` and hide the toggle entirely for this role — there is nothing for it to toggle.
- The "Observer secondary view" block is already gated on `auth.isObserver()` and needs no change.

**Decision**: extend `MyMatchesComponent` in place rather than build a parallel page — the alternative
(a second component reimplementing attendance/result-entry) would duplicate exactly the logic R6 shows
is already correct, and would need to be kept in sync by hand forever after. This matches the
Assumptions section of `spec.md`.

## R7 — No spec file exists yet for `MyMatchesComponent`

`frontend/src/app/features/season-matches/` has no `*.spec.ts` at all today — confirmed by a
recursive glob, not inferred. This stage is the first to add proScout-specific branching to this
component, so Principle VI's "positive and negative test per permission" obligation means this stage
must create `my-matches.component.spec.ts`, not extend one — there is nothing to extend. Scope kept
tight to what this stage touches (age-group visibility, league default/lock, attendance, result entry)
rather than a full behavioral spec of the pre-existing coach/observer paths.

## R8 — The landing/rejection consolidation (Stage 6 item 7) has a precise site of drift

`role.guard.spec.ts` hardcodes redirect-destination strings per role
(`'/dashboard/coach'`, `'/dashboard/admin'`, `'/dashboard/proScout'`, `/unauthorized'`) in eleven
separate assertions. `role-landing.service.spec.ts` hardcodes the same destinations again, this time
against `RoleLandingService.landingFor()` directly. Both files are correct today, but both are frozen
snapshots of `RoleLandingService`'s current switch — exactly the drift Stage 3's note #1 and Stage 5's
note #1 both hit (`docs/scout-pro-plan-v2.md` Stage 3 note 1, Stage 5 executive note). Adding proScout
to `my-matches` (this stage) is a **third** place this could silently go stale if the same pattern
(hand-written string per role) is repeated again.

**Decision**: add one new file, `role-landing-destinations.spec.ts`, that is the single hardcoded
ground truth: for every `UserRole` in the generated union, the expected login-landing destination
(from `RoleLandingService.landingFor`) and the expected `roleGuard` refusal destination for a route the
role isn't listed on. `role.guard.spec.ts`'s existing per-role refusal assertions are **rewritten** to
assert `result.toString()` equals `roleLandingService.landingFor(role).join('/')` computed live,
rather than a literal — so that file can no longer drift, by construction, instead of by discipline.
`role-landing.service.spec.ts` is left as-is: it is already the direct, non-duplicated test of the one
function that matters, and duplicating its assertions into the new file would recreate the exact
problem being solved. The new file's role is to catch drift **between** `role.guard.ts`'s actual
redirect behavior and `RoleLandingService`'s declared destinations — a category role-landing.service.spec.ts
alone cannot catch, since it never invokes the guard.

## R9 — A test block already exists that is designed to flip at this exact stage

`Backend/tests/roles/proScoutDataScope.test.js:753-817`, `describe('T042 — guard branches
unreachable over HTTP in this stage', ...)`, was written in Stage 2 specifically to pin
`checkSeasonMatchAttendee`'s proScout branch **unit-level** (calling the guard function directly,
bypassing HTTP) because the route was still closed by `allowedTo`. Its own comment says so verbatim:
"حضور المباريات ... لسه 403 من allowedTo لحد المرحلة 4/6 ... من غير الملف ده، مسح فحص النطاق من جوه
فرع checkSeasonMatchAttendee مش هيكسر أي حاجة لحد ما المرحلة 6 تفتح الحد" (without this file, deleting
the scope check inside the branch would break nothing until Stage 6 opens the route). Its
`beforeEach` already builds exactly the two fixtures this stage needs: `proMatch` (professional
league, `attendees: [scout.user._id]`) and `premierMatch` (premier league, same attendee setup).

Two of its three `it` blocks assert the **pre-fix** behavior and MUST be updated, not left standing,
once `allowedTo` opens `/status` to `PRO_SCOUT` and the branch is corrected:

- `'checkSeasonMatchAttendee: proScout is denied even when listed as an attendee (Stage 2 = read
  only)'` (line 796) — asserts `proMatch` (in-scope, is-attendee) still 403s. Post-fix this case MUST
  grant (`next` called with no argument). The title is inaccurate the moment R2's fix lands ("Stage 2 =
  read only" stops being true) and must be renamed/rewritten, not just have its assertion flipped.
- `'checkSeasonMatchAttendee: the SCOPE check runs — an out-of-scope match logs a denial'`
  (line 804) — its final block (lines 812-816) asserts `proMatch` is "still denied (the gate is
  closed) but without a scope-violation log." Post-fix, `proMatch` must be **granted**, not merely
  denied-without-a-log; the scope-only-logs-on-actual-scope-violation assertion for `premierMatch`
  (lines 804-810) stays correct and unchanged.

Also missing from this file entirely: a case where the match **is** in scope but the caller is
**not** an attendee (G-11 in the contract) — the existing fixtures make every match's `attendees`
include the scout, so the attendee-membership leg of R2's fix is never independently exercised here.

**Decision**: this file's T042 block is **edited in place** (rename, flip two assertions, add the
missing not-an-attendee case) rather than superseded — it already has the right fixtures and already
documents *why* the old behavior existed, which is exactly the kind of comment Constitution
`Development Workflow` asks to preserve. A **separate, new** file
(`tests/roles/proScoutMatchAttendance.test.js`) covers the full HTTP-level contract (G-1…G-13,
including `attendMatch`/`unattendMatch`'s actual state changes and the day-window rules), since T042
only ever exercises the guard function directly and never the controller or the route chain.

## R10 — Endpoint inventory delta

Stage 4 (`specs/005-.../contracts/endpoint-inventory.md`) recorded 83 operations; Stage 5
(`specs/007-.../contracts/endpoint-inventory-delta.md`) added one, reaching 84. This stage changes the
proScout decision on exactly two existing operations (`POST`/`DELETE /seasonMatches/{id}/attend`) and
opens a third (`PATCH /seasonMatches/{id}/status`) that was previously refused — see
[contracts/endpoint-inventory-delta.md](./contracts/endpoint-inventory-delta.md). No operation is
added or removed; the total stays 84.
