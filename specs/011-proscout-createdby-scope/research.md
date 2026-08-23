# Phase 0 Research: proScout Player Scope Narrowed to createdBy

All `[NEEDS CLARIFICATION]` markers in `spec.md` were resolved by the project owner on 2026-08-23
(all Option A) before this plan started; no open unknowns remain in the Technical Context. This
document instead consolidates the call-site research already performed (recorded in
`docs/scout-pro-plan-v2.md`, "المرحلة 11") into the decisions this plan builds on, plus two
implementation-shape questions that came up while turning the spec into a plan.

## R1 — Exact new shape of `playerScopeFor`

**Decision**: Replace the current body with a direct, unwrapped condition:

```js
export async function playerScopeFor(req) {
    if (!req?.user) return { ...MATCH_NOTHING };
    if (req.user.role !== ROLES.PRO_SCOUT) return {};
    return wrap({ createdBy: req.user._id });
}
```

**Rationale**: `wrap()` already exists and handles the `$and`-wrapping rule documented at the top of
`scope.js` (R12 from Stage 2: sequential Mongoose `.find()` calls merge by **last-key-wins**, not
AND, and `createdBy` is not a client-allowed filter key today so this specific field can't collide
— but `wrap()` costs nothing to keep and keeps the function's output shape consistent with
`seasonMatchScopeFor`/`teamScopeFor`, so there is no reason to special-case it away). `teamIds`/
`professionalTeamIds(req)` is no longer called from this function — removed, not left dead — but the
export stays (see R3).

**Alternatives considered**:
- Returning `{ createdBy: req.user._id }` unwrapped (no `wrap()`) — rejected: `createdBy` isn't in
  `PLAYER_FILTERS` today, so there's no client-key collision risk right now, but leaving the
  function's contract ("always $and-wrapped or {}") inconsistent for one case only invites a future
  bug if `createdBy` is ever added to `PLAYER_FILTERS` (e.g. for an admin filter-by-creator feature).
  `wrap()` is free; keep the invariant uniform.

## R2 — Whether `professionalTeamIds()` is still needed

**Decision**: Keep it exported and unchanged. It's still consumed by `teamScopeFor` (FR-006,
unchanged) and by `checkTeamScope`/write-time team validation (FR-007, unchanged) — confirmed by the
Stage 11 call-site audit. Only its use *inside* `playerScopeFor` and the two `ownership.js` copies
(R3) is removed.

**Rationale**: Constitution C-4 (amended) is explicit that `professionalTeamIds()` is not being
deleted from the system, only removed from the player *read* scope. Verified by grep before writing
this plan: `professionalTeamIds` is referenced in `services/scope.js` (`teamScopeFor`),
`middlewares/ownership.js` (`checkTeamScope`, and the two sites this feature edits), with no other
callers that would become dead code.

## R3 — Updating the two `ownership.js` duplicates in lockstep

**Decision**: `checkPlayerOwnership`'s `proScout` branch and the shared `playerInProScoutScope`
helper both drop their `player.team && teamIds.some(...)` clause, leaving only
`player.createdBy?.equals(req.user._id)`. `professionalTeamIds(req)` is no longer called from either
site (it was only being called to build `teamIds` for the now-removed clause). The `await` on
`professionalTeamIds(req)` is removed accordingly — these functions stay `async` because they're
still awaited by their callers' existing signatures, but no longer perform that particular lookup.

**Rationale**: FR-008 requires all three copies to change together; this is the literal mechanical
translation of R1's new condition into the two in-memory comparison sites. No round-trip savings are
lost — the document (`select("coach observers team createdBy")` / `select("team createdBy")`) is
already loaded by the caller's own `findById`, and `createdBy` is already in both `select()` lists,
so no `.select()` change is needed either.

**Alternatives considered**: Unifying all three into one exported predicate — deferred as a follow-up,
not done here (see `plan.md` Complexity Tracking). Considered and rejected for this feature
specifically because it would mix a security-sensitive scope-shape change with an unrelated
refactor, widening what a reviewer has to hold in their head for a single PR.

## R4 — Report/media ownership guards (FR-012)

**Decision**: No code change needed beyond R3. `checkReportOwnership` and `checkMediaOwnership`
already call `playerInProScoutScope(req, player)` as one of their three required conditions
(`isAuthor/isUploader AND belongsToPlayer AND inScope`). Once `playerInProScoutScope` itself
narrows (R3), both guards automatically reject a `proScout`'s own report/media on a now-out-of-scope
player — exactly the Option A outcome the owner chose. This is a consequence of R3, not a separate
implementation task, though it MUST be covered by a dedicated regression test (User Story 3) because
it's a behavior change that isn't obvious from reading `checkReportOwnership` alone.

## R5 — Dashboard (`getProScoutDashboardData`)

**Decision**: No code change. `playerScope = await playerScopeFor(req)` (dashboardController.js:256)
automatically narrows once R1 lands; `matchScope = await seasonMatchScopeFor(req)` is untouched
(FR-006). The existing code comment at dashboardController.js:248-249 ("ممنوع أي فلتر يدوي هنا")
already forbids exactly the kind of local override that would be needed to diverge from this — so
the file needs zero edits, only a new regression test asserting the narrower `totalPlayers`/
`totalReports`/`recentReports` and the unchanged `upcomingMatches`/`latestResults`.

## R6 — `getCountsByAgeGroup` / `getAverageRatingsForPlayers`

**Decision**: No code change (`playerController.js:159`, `scoutingReportController.js:302`) — both
already consume `playerScopeFor` as a black box. Regression tests only.

## R7 — Migration / backfill

**Decision**: None performed, per FR-013 (Option A, owner-resolved). No script, no data change. This
is a research non-finding worth recording explicitly: it was considered (see `docs/scout-pro-plan-v2.md`
Question 2) and explicitly declined, not overlooked.

## R8 — Test file placement

**Decision**: New dedicated suite `Backend/tests/roles/proScoutCreatedByScope.test.js`, following the
existing per-stage naming convention (`proScoutDataScope.test.js` for Stage 2,
`proScoutPlayersWrite.test.js` for Stage 4, `proScoutFullRegression.test.js` for Stage 7), rather than
editing the Stage 2 suite in place. `proScoutDataScope.test.js`'s existing assertions that
specifically encode the *old* team-based branch (e.g. "a player on a professional team, not created
by the requesting proScout, is visible") need updating in place — those are direct contradictions of
the new contract, not additions — while the new file carries the createdBy-only-specific scenarios
(orphan players, cross-proScout denial, report/media authorship-vs-scope).

**Rationale**: Matches the project's established one-file-per-stage convention (confirmed by
directory listing of `Backend/tests/roles/`), keeps the "this test was written to lock in Stage 11's
contract" traceability the same way `T042` in Stage 2 was rewritten (not duplicated) when Stage 6
changed its outcome (documented in `docs/scout-pro-plan-v2.md`, Stage 6 note #2).
