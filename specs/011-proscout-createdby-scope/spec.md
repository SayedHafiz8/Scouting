# Feature Specification: proScout Player Scope Narrowed to createdBy

**Feature Branch**: `011-proscout-createdby-scope`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "المرحلة 11 — تضييق سكوب اللاعبين لـproScout إلى createdBy فقط.
تعديل جوهري على قرار المرحلة 2 (specs/003-proscout-data-scope). القرار الجديد المحسوم: سكوب
اللاعبين (كل الوصول: قائمة، تفاصيل، داشبورد) يتغيّر من playerScopeFor الحالي (فرق professional
+ team:null بـcreatedBy) إلى createdBy فقط — بلا استثناء. سكوب المباريات (seasonMatchScopeFor)
وسكوب الفرق (teamScopeFor) يفضلوا زي ما هم، بلا تغيير. مبني على جرد فعلي موثّق في
docs/scout-pro-plan-v2.md (المرحلة 11) لكل نقطة استهلاك لـplayerScopeFor في الكود الفعلي:
services/scope.js, middlewares/ownership.js (checkPlayerOwnership, playerInProScoutScope,
checkReportOwnership, checkMediaOwnership), controllers/playerController.js (getAll,
getCountsByAgeGroup), controllers/dashboardController.js (getProScoutDashboardData),
controllers/scoutingReportController.js (getAverageRatingsForPlayers), وعدسة الأدمن
specs/006-admin-professional-lens وspecs/010-professional-lens-creator (مفحوصين ومؤكَّد إنهم
غير متأثرين لأن الأدمن يتخطى playerScopeFor بالكامل)."

---

## ✅ Constitutional conflict — resolved 2026-08-23

`.specify/memory/constitution.md` Constraint C-4 previously locked the `proScout` player scope to
the Stage 2 `$or` shape (professional-league team OR `team: null` + `createdBy`) as "the only
approved definition." This feature's target shape (`{ createdBy: <userId> }` alone) directly
superseded that lock, so it could not proceed to `/speckit-plan` until the constitution itself was
amended. **Resolved**: `/speckit-constitution` ran and C-4 now reflects the `createdBy`-only shape,
under version **1.1.0** (MINOR bump; see the Sync Impact Report at the top of `constitution.md` for
the full rationale, including an honest note on why a stricter reviewer might argue for a heavier
classification). No further constitutional action is needed before planning.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A proScout sees only the players they personally created (Priority: P1)

A `proScout` logs in and opens the players list, a player's detail page, and their dashboard. In
every one of those views, they see only players whose `createdBy` field is their own user id —
never a player created by another `proScout`, a `coach`, or by data migration/admin action, even
if that player belongs to a team in the professional league.

**Why this priority**: this is the entire point of the change — closing the gap where any
`proScout` could see and act on a colleague's players just because they share a professional-league
team. Without this story shipped, nothing else in this feature has any effect.

**Independent Test**: as `proScout` A, create a player on a professional-league team. As `proScout`
B, request the players list, that player's detail page by direct ID, and the dashboard — confirm
none of the three surfaces the player or any of its data (own dashboard totals unaffected by it).

**Acceptance Scenarios**:

1. **Given** a player created by `proScout` A and assigned to a professional-league team, **When**
   `proScout` B requests `GET /players`, **Then** the player does not appear in B's results.
2. **Given** the same player, **When** `proScout` B requests it directly by ID
   (`GET /players/:id`), **Then** the request is rejected (403), not silently emptied.
3. **Given** the same player, **When** `proScout` A (the creator) requests the players list, the
   detail page, and the dashboard, **Then** the player appears in all three exactly as it does
   today.
4. **Given** a player created by `proScout` A with `team: null` (not yet assigned to a team),
   **When** `proScout` B requests it, **Then** it is invisible to B — matching today's behavior for
   this branch, which this feature does not change.

---

### User Story 2 - Admin's professional-league visibility is completely unaffected (Priority: P2)

An admin uses the existing Professional League lens (Stage 4c) and sees the creator's name on each
row (Stage 4d). Both continue to show every professional-league player, from every `proScout`,
exactly as before this feature — because the admin branch never reads the `proScout` scope at all.

**Why this priority**: P2, not P1, because this story is about *proving no regression* rather than
delivering new value — but it is the safety net that makes the P1 narrowing acceptable, since the
admin remains the one role that can still see and reconcile everything.

**Independent Test**: with players created by two different `proScout` users, sign in as admin,
activate the Professional League lens, and confirm both players still appear with their correct
creator names — byte-identical to pre-feature behavior on this surface.

**Acceptance Scenarios**:

1. **Given** professional-league players created by multiple different `proScout` users, **When**
   an admin views the Professional League lens, **Then** every one of them still appears, each with
   its correct creator name.
2. **Given** the existing regression suites for Stage 4c (`adminProfessionalLens.test.js`) and Stage
   4d (`specs/010-professional-lens-creator`), **When** they are run after this feature, **Then**
   they pass unmodified.

---

### User Story 3 - A proScout loses access to their own report/media once the player falls out of scope (Priority: P3)

Before this feature, a `proScout` could author a scouting report or upload media on any player on a
professional-league team, including one they did not create. After the scope narrows, that player
falls outside their scope — and **player scope wins**: the `proScout` loses read/edit access to
that report and that media item too, even though they personally authored/uploaded it (resolved
2026-08-23, Option A — "الوصول ينسحب، سكوب اللاعب بيغلب").

**Why this priority**: P3 — it only matters for reports/media that already exist at the point this
feature ships, and for any new report a `proScout` could no longer even create post-feature (since
creating a report already requires the player to be in scope).

**Independent Test**: as `proScout` A, author a report and upload media on a player created by
`proScout` B (professional-league team, pre-feature). After the feature ships, as `proScout` A,
attempt to read/edit that report and that media item — confirm both are rejected (403), consistently.

**Acceptance Scenarios**:

1. **Given** a report authored by `proScout` A on a player created by `proScout` B, **When** A
   requests that report after this feature ships, **Then** the request is rejected (403) — authorship
   alone does not override the narrowed player scope.
2. **Given** media uploaded by `proScout` A on the same player, **When** A requests or attempts to
   edit that media after this feature ships, **Then** the request is rejected (403) — identical
   treatment to the report case, no asymmetry between the two guards.

---

### Edge Cases

- **Legacy/orphaned professional players**: a player already assigned to a professional-league team
  whose `createdBy` is not a `proScout` at all (created before Stage 2 existed, imported by an
  admin, or created by a `coach` before being reassigned to a professional team). After this
  feature, no `proScout` can see or act on this player at all — only the admin can, via the
  existing Stage 4c/4d lens. **Resolved 2026-08-23, Option A**: accepted as-is, no migration. No
  rule exists (or is being invented here) for which `proScout` such a player "should" belong to, so
  reassignment stays a manual admin action if it's ever needed, not an automated backfill.
- **Dashboard match/report asymmetry**: the proScout dashboard (Stage 5) shows upcoming matches and
  latest results for the *entire* professional league (`seasonMatchScopeFor`, unchanged by this
  feature) alongside player/report totals that *are* narrowed to `createdBy`. **Resolved
  2026-08-23, Option A**: this divergence is intentional, documented final behavior — matches stay
  league-wide (per Constitution: match scope is explicitly out of this feature's scope), while
  players/reports narrow to the proScout's own. No additional join logic ties matches to a
  proScout's own players.
- What happens when a `proScout` who created a player is later deactivated? The player's
  `createdBy` reference still points to that (now-inactive) user; no other `proScout` gains access
  to it as a result — only the admin can reach it, same as any orphan case.
- A `proScout` sends `?team=<professional-team-id>` on `GET /players` hoping to see teammates'
  players by filtering on team instead of relying on the removed team-based branch — the request
  MUST still return only their own `createdBy` players (client filters intersect with scope, they
  never replace it — existing `ApiFeature` guarantee, unchanged by this feature).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST scope every `proScout` read of player data — the players list
  (`GET /players`), a single player by ID (`GET /players/:id`), the age-group/professional counts
  (`GET /players/counts`), and the dashboard (`GET /dashboard/proScout`) — to players whose
  `createdBy` equals the requesting `proScout`'s own user id, and to no others.
- **FR-002**: The system MUST remove the professional-league-team branch from the `proScout` player
  scope entirely — team membership MUST NOT, by itself, grant a `proScout` visibility into a player
  they did not create.
- **FR-003**: A `proScout` requesting a player outside their own `createdBy` scope by direct ID
  MUST receive an explicit rejection (403), not an empty/absent result.
- **FR-004**: The players-list scope narrowing MUST hold under any client-supplied query filter
  (`team`, `status`, `position`, etc.) — filters intersect with the `createdBy` scope, never expand
  it.
- **FR-005**: `GET /players/reports/average-ratings` MUST restrict the players it will report
  averages for to the requesting `proScout`'s own `createdBy` scope, replacing its current
  professional-league-team-based restriction.
- **FR-006**: The season-match scope (`seasonMatchScopeFor`, all of `GET /seasonMatches` and match
  attendance) and the team scope (`teamScopeFor`, `GET /teams` and team selection at player
  creation) MUST NOT change as part of this feature — both remain scoped to the full professional
  league, exactly as today.
- **FR-007**: Creating a player (`POST /players`) and validating its team assignment
  (`checkTeamScope`) MUST NOT change — a `proScout` MUST still be able to create a player on any
  professional-league team. Only the resulting visibility of that player to *other* `proScout`
  users changes (to none).
- **FR-008**: The three independent in-code copies of the current scope logic — the central
  `playerScopeFor` (`services/scope.js`), and the two duplicated in-memory comparisons in
  `middlewares/ownership.js` (the `proScout` branch of `checkPlayerOwnership`, and the shared
  `playerInProScoutScope` helper used by `checkReportOwnership` and `checkMediaOwnership`) — MUST
  all be updated together to the same `createdBy`-only definition, in the same change. None may be
  left on the old team-based shape.
- **FR-009**: The admin's Professional League lens (Stage 4c) and the creator-name display on it
  (Stage 4d) MUST continue to return every professional-league player regardless of who created it,
  and MUST continue to show the correct creator name for each — unaffected by this feature, because
  the admin path does not consult the `proScout` scope.
- **FR-010**: `tests/isolation.test.js` MUST pass unmodified, and regression suites for `coach`,
  `observer`, and `admin` across all endpoint families named in Constitution Principle III MUST show
  unchanged counts and content.
- **FR-011**: Every rejected access attempt under the narrowed scope MUST be logged with enough
  detail to investigate (user id, role, path, requested resource id) — consistent with the existing
  `logScopeDenial` mechanism.
- **FR-012**: `checkReportOwnership` and `checkMediaOwnership` MUST reject a `proScout`'s access to
  a report or media item they personally authored/uploaded once the underlying player falls outside
  their narrowed `createdBy` scope — player scope wins over authorship, applied identically to both
  guards (resolved 2026-08-23, Option A; see User Story 3).
- **FR-013**: Professional-league players whose current `createdBy` is not a `proScout` (or is
  unset) MUST be left as-is: visible to the admin only (via the existing Stage 4c/4d lens), with no
  `proScout` able to see or act on them, and no migration/backfill performed as part of this feature
  (resolved 2026-08-23, Option A; see Edge Cases).

### Key Entities

- **`Player.createdBy`** — existing field (Stage 2), a reference to the user who created the player.
  Becomes, with this feature, the *sole* determinant of `proScout` visibility into a player, in
  every read surface. No schema change.
- **`playerScopeFor` (`services/scope.js`)** — the single central definition of `proScout` player
  scope (Constitution Principle IV). This feature is entirely a change to this function's returned
  query shape, plus the two duplicated in-memory copies of it in `ownership.js` (FR-008).
- **`ScoutingReport` / `PlayerMedia`** — unaffected in schema; their `proScout` access guards
  (`checkReportOwnership`, `checkMediaOwnership`) currently combine authorship with player scope,
  and the player-scope half of that combination narrows per FR-008, with the exact consequence
  pending FR-012's resolution.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A `proScout` can never retrieve, view, or modify a player they did not create — proven
  by an automated test that creates a player as one `proScout` and asserts every read/write endpoint
  rejects a second `proScout`, not by manual review.
- **SC-002**: A `proScout`'s own players list, player detail pages, and dashboard totals are
  complete and correct for exactly the players they created — no false negatives (their own players
  missing) and no false positives (someone else's players present).
- **SC-003**: The admin's Professional League lens and creator-name display return identical results
  before and after this feature, for the same underlying data — proven by the existing Stage 4c/4d
  regression suites passing unmodified.
- **SC-004**: `coach`, `observer`, and `admin` regression suites show zero change in response count
  or content across every endpoint family covered by `tests/isolation.test.js` and Constitution
  Principle III.
- **SC-005**: Every access-denial path introduced or changed by this narrowing produces a logged,
  investigable record (FR-011), verified by test.

## Assumptions

- **The constitutional conflict (see the flagged section above) will be resolved via
  `/speckit-constitution` before `/speckit-plan` runs against this spec.** This spec documents the
  target behavior; it does not itself carry authority to override C-4.
- **`professionalTeamIds()` and `teamScopeFor` remain necessary** even though `playerScopeFor` stops
  using team membership for player *read* scope — they are still required for `checkTeamScope`
  (validating a player's team assignment at write time) and for `GET /teams`, both explicitly
  unchanged by FR-006/FR-007.
- **No change to how `createdBy` is set at player creation.** It continues to be populated
  automatically from `req.user._id` on `POST /players`, locked against client input, exactly as
  established in Stage 2/4.
- **The three duplicated copies of the scope logic (FR-008) are updated in lockstep as a matter of
  discipline for this change, not unified into one shared function.** Unifying them into a single
  exported helper is a reasonable follow-up but is a separate refactor decision or optionally a
  design choice made at `/speckit-plan` time, not assumed here.
