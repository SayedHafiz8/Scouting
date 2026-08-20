# Feature Specification: ProScout Data Scope Enforcement

**Feature Branch**: `003-proscout-data-scope`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "أضف سكوب البيانات لرول proScout بحيث يستحيل تقنياً وصوله لبيانات خارج دوري المحترفين. حقل ملكية createdBy على Player، سكوب اللاعبين (فرق professional + لاعبين team:null من إنشائه)، سكوب المباريات (league=professional)، سكوب الفرق (league=professional)، فروع صريحة في ownership.js، وتسجيل محاولات الوصول المرفوضة."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - ProScout sees only professional-league players (Priority: P1)

A user with the proScout role opens the players list and only sees players who belong to a professional-league team, plus any team-less players that this same proScout personally registered. Players belonging to any other league, or team-less players registered by someone else, never appear — not in lists, not by direct ID lookup.

**Why this priority**: This is the core promise of the role. Without it, a proScout can see youth-academy player data they have no business relationship to, which is the primary risk this feature exists to close.

**Independent Test**: Log in as a proScout, call the players list endpoint and a direct single-player lookup by ID for a player outside scope; confirm the list excludes it and the direct lookup is refused.

**Acceptance Scenarios**:

1. **Given** a player belongs to a team in the professional league, **When** a proScout requests the players list, **Then** that player is included.
2. **Given** a player belongs to a team in a non-professional league, **When** a proScout requests that player directly by ID, **Then** the request is refused (not returned as data).
3. **Given** a player has no team assigned and was registered by the requesting proScout, **When** that proScout requests the players list, **Then** the player is included.
4. **Given** a player has no team assigned and was registered by a different user, **When** a proScout requests the players list, **Then** the player is excluded.
5. **Given** a proScout adds extra filters (e.g. by age group or a different league) to the players list request, **When** the request is processed, **Then** the extra filter narrows the result further but can never widen it beyond the professional-league scope.
6. **Given** a mix of in-scope and out-of-scope players exists, **When** a proScout requests player counts or player average-ratings, **Then** the request succeeds (no longer refused outright) and every returned number is computed only over the in-scope players, matching a manually-computed professional-league subset exactly.
7. **Given** an in-scope player has observers assigned and a status of "observed", **When** a proScout views that player in the list or in detail, **Then** the observer list is absent from the response and the status reads "pending" — while the player's coach remains visible (FR-014).

---

### User Story 2 - ProScout sees only professional-league matches (Priority: P1)

A proScout browsing season matches only sees matches that belong to the professional league. Attempting to open, or register attendance for, a match from another league is refused.

**Why this priority**: Matches are the second major data surface after players, and attendance registration is a write action — leaking or allowing writes here is an equally direct scope breach.

**Independent Test**: Log in as a proScout, request the matches list and a direct match lookup by ID for a non-professional-league match; confirm both are excluded/refused.

**Acceptance Scenarios**:

1. **Given** a match belongs to the professional league, **When** a proScout requests the matches list, **Then** the match is included.
2. **Given** a match belongs to a non-professional league, **When** a proScout requests that match directly by ID, **Then** the request is refused.
3. **Given** a match belongs to a non-professional league, **When** a proScout attempts to register or remove their own attendance on it, **Then** the action is refused.

---

### User Story 3 - ProScout sees only professional-league teams (Priority: P2)

A proScout browsing teams only sees teams in the professional league, both in the team list and when opening a single team's details.

**Why this priority**: Teams are reference data other scoped views (players, matches) depend on conceptually, but on their own carry lower risk than player or match records — hence P2, addressed after the two higher-risk surfaces.

**Independent Test**: Log in as a proScout, request the teams list and a direct team lookup by ID for a non-professional team; confirm both are excluded/refused, while every other role's team visibility stays exactly as before.

**Acceptance Scenarios**:

1. **Given** a team is in the professional league, **When** a proScout requests the teams list, **Then** the team is included.
2. **Given** a team is not in the professional league, **When** a proScout requests that team directly by ID, **Then** the request is refused.
3. **Given** any existing role (admin, coach, observer) requests teams, **When** the request is processed, **Then** the result is identical to before this feature existed.

---

### User Story 4 - Denied access attempts are auditable (Priority: P3)

When a proScout is denied access to a specific player, match, or team because it falls outside their scope, the system records that the attempt happened, so misuse or probing can be investigated after the fact.

**Scope note**: reports and media are deliberately excluded here. A proScout is refused those at the coarse role gate, so the request never reaches the scope layer and there is no scope denial to record. They become auditable in Stage 4, when their gates open and their scope checks start running. Logging for the existing roles (admin, coach, observer) is likewise out of scope for this feature.

**Why this priority**: This is an operational/security-monitoring aid, not a functional gate — the system is already safe without it, but investigating incidents is much harder without a trail.

**Independent Test**: Trigger a denied access attempt as a proScout, then confirm a corresponding record exists showing who attempted what and was denied.

**Acceptance Scenarios**:

1. **Given** a proScout requests a record outside their scope, **When** the request is denied, **Then** a record of the denial (who, what, when) is captured.

---

### Edge Cases

- A player has no team and was never explicitly created by the requesting proScout (e.g. bulk-imported, or created by an admin) — treated the same as "created by someone else": excluded.
- A team's league is changed after players/matches already reference it — scope must reflect the team's *current* league at request time, not a cached value.
- A proScout supplies conflicting or contradictory filters (e.g. explicitly requesting a non-professional league) — the request returns zero results rather than an error, since the combination is simply outside scope.
- Pagination, sorting, and counts must all be computed after scope is applied, so page counts and totals never reveal the existence of out-of-scope records.
- An existing player/match/team record with a missing or unrecognized league value on its team is treated as out of scope (excluded) rather than defaulting to visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST record which user registered each player, at the time of registration, so team-less players can be attributed to their creator.
- **FR-002**: System MUST apply a default attribution (existing owning coach) to every player that existed before this feature, so no existing player is left without an attributed creator.
- **FR-003**: System MUST restrict a proScout's player list and player detail results to: players on a professional-league team, plus team-less players the requesting proScout personally registered.
- **FR-004**: System MUST restrict a proScout's season match list and match detail results to matches in the professional league.
- **FR-005**: System MUST restrict a proScout's team list and team detail results to professional-league teams, without changing what any other role sees.
- **FR-006**: System MUST refuse a proScout's attempt to register or remove match attendance for a match outside the professional league.
- **FR-007**: System MUST ensure that any client-supplied filter (query parameter) can only narrow a proScout's results further, never widen them beyond the professional-league scope.
- **FR-008**: System MUST produce identical, exact results/counts for a professional-league scoped request as would be obtained by manually filtering the full dataset to that scope.
- **FR-009**: System MUST leave the data visible to admin, coach, and observer roles completely unchanged by this feature, across players, matches, and teams.
- **FR-010**: System MUST record a durable log entry whenever a **proScout's** request for a specific player, match, or team is denied for being outside their scope. Extending the same logging to the existing roles' denials is explicitly **out of scope** for this feature — it would broaden the change surface beyond the role this feature introduces, and is better done as its own piece of work.
- **FR-011**: System MUST apply the same professional-league scope rule consistently whether a record is reached through a list endpoint or a direct single-record lookup by ID.
- **FR-012**: System MUST extend the same player scope defined in FR-003 to every derived/aggregate view over players — specifically the player counts view (`GET /players/counts`) and the player average-ratings view (`GET /players/reports/average-ratings`). Both are currently refused outright for proScout as a deliberate interim measure; this feature MUST convert them from a blanket refusal into genuinely scoped results computed over the professional-league subset only.

  **Ordering rule — applies to all three deferred views** (the two above plus the season matches view): scope MUST be in place **before** the refusal is lifted. The reason differs by view, and the difference matters:

  - **Player counts** and **season matches** fall back to a genuinely **unfiltered** dataset for any role they do not recognize. Lifting their refusal first would expose *every* record in the collection, not an empty result.
  - **Average-ratings** is *already* narrow — it restricts to the requester's own authored reports — but it is scoped on the **wrong axis**: report authorship, not player league. It accepts an arbitrary list of player ids and answers questions about players the caller may have no right to know exist. The ordering rule still binds, as belt-and-braces rather than as the sole barrier.

  Opening any of the three to proScout before its scope is in place is forbidden regardless of which of these two cases it falls under.
- **FR-013**: System MUST ensure that every aggregate number a proScout sees (counts, averages, totals) is computed strictly over that proScout's scoped record set, so no aggregate reveals the existence, quantity, or characteristics of out-of-scope records.
- **FR-014**: System MUST hide observer-assignment information from a proScout, applying the **same treatment coaches already receive**: the list of observers assigned to a player is omitted entirely, and a player whose status is "observed" is presented as "pending". This applies to both the player list and the player detail view.

  **Why this is stated rather than left unsaid**: this feature opens the player detail view to proScout, and that response currently has no masking rule for the role — so it would return observer assignments by default. Choosing to say nothing is still a choice about what the role can see. The narrower option is taken now; **this requirement is explicitly marked revisitable in Stage 4**, which carries the open question of whether a proScout should see observer assignments at all. Relaxing a mask later is additive; retracting data already exposed is not.

  Note this covers observer information only. The player's coach remains visible to a proScout — unlike observers, who have that field hidden.

### Key Entities

- **Player**: A youth/professional prospect. Gains a "registered by" attribution linking it to the user who created it, used only when the player has no team. Its visibility to a proScout depends on its team's league or, if team-less, on who registered it.
- **Team**: Belongs to a league (e.g. professional vs. others). Determines which players and matches fall inside a proScout's scope.
- **Season Match**: Belongs to a league via its associated teams/competition. Determines which matches and attendance actions a proScout may see or perform.
- **Access Denial Record**: A log entry capturing that a proScout's request for a specific out-of-scope record was refused, for later audit. Scoped to proScout by FR-010; extending it to the existing roles is separate work.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of player, match, and team records outside the professional league are unreachable by a proScout, whether via list browsing or direct ID lookup — verified by automated regression tests covering every such attempt.
- **SC-002**: A proScout's list results **and every aggregate figure** (counts, average ratings) always match, count-for-count and record-for-record, the manually-computed professional-league subset of the data, with zero discrepancies across repeated test runs.
- **SC-002a**: The three views the previous phase left refused for proScout (player counts, player average-ratings, season matches) all return scoped data rather than a refusal — and none of them, at any point, returns an unfiltered result set; verified by a test that would fail loudly if scope were bypassed.
- **SC-003**: 100% of existing automated isolation/regression tests for admin, coach, and observer continue to pass unmodified after this feature ships, confirming zero behavior change for existing roles.
- **SC-004**: Every denied out-of-scope **proScout** access attempt during testing produces a corresponding auditable record, with zero silent denials. Measured across the three resources in scope for this feature: players, matches, and teams.

## Assumptions

- "Professional league" is represented by a single, existing league classifier already usable to categorize teams (and matches transitively through their teams); this feature does not introduce a new classification scheme.
- "Registered by" attribution is only meaningful (and only checked) for team-less players; once a player has a team, scope is determined purely by that team's league, regardless of who registered the player.
- The default attribution applied to pre-existing players (FR-002) uses the player's current owning coach as a reasonable stand-in for "who registered this player," since no such record previously existed.
- Denial logging (FR-010) is an internal operational record, not user-facing; no UI is required to view it as part of this feature.
- This feature governs data scope primarily. It changes the coarse "may this role attempt the request at all" gate for exactly **five** read views: player detail, player counts, player average-ratings, the season matches list, and season match detail. Team views are *not* in that list — they are already reachable by any authenticated role and are being **scoped**, not opened. Every other view's role gate is left untouched.
- The strict ordering for those five views is non-negotiable: scope must be in place **before** the refusal is lifted. For player counts and the season matches views, lifting first would not yield an empty result — it would yield the full unfiltered dataset, precisely the exposure the previous phase avoided. For average-ratings the barrier is thinner (it is already narrow, just on the wrong axis, per FR-012), but the rule binds identically rather than being judged case by case.
- Response masking (FR-014) is the one place this feature changes the *shape* of a response rather than the set of records returned. It applies to proScout only and leaves every other role's response untouched.
- The player counts view groups results by age group. Whether a proScout has any use for that grouping is a presentation concern deferred to a later phase; this feature only guarantees the underlying numbers are correctly scoped.
