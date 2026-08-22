# Feature Specification: proScout Players Page & Write Access

**Feature Branch**: `005-proscout-players-write`

> **Numbering note (analysis finding F6)**: this spec directory is `specs/005-proscout-players-write`.
> The git branch was originally created as `004-proscout-players-write`, which collides with Stage 3's
> `specs/004-role-based-navigation`. Rename the branch to `005-proscout-players-write` before opening
> the PR so one number identifies one stage.

**Created**: 2026-08-21

**Status**: Ready for planning review → implementation (post `/speckit-analyze` remediation)

**Input**: User description: "صفحة اللاعبين وصلاحيات الكتابة لرول proScout" — read access to the players page scoped to the professional-league scope established in Stage 2, removal of age-group filtering/columns for this role only, and write access (create/update players, reports, media, profile image) mirroring the coach role's existing write permissions, with `createdBy` auto-populated and team assignment restricted to `league: "professional"`. `maskObservedForCoach` applies to proScout exactly as it applies to coach.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse scoped players list (Priority: P1)

A proScout user opens the Players page and sees only players belonging to professional-league teams, plus any team-less players they personally created. No age-group filter, column, or tab is visible to them.

**Why this priority**: This is the core value of the role — without a correctly scoped, correctly shaped list, nothing else matters.

**Independent Test**: Log in as a proScout user with a known set of professional-league players and a team-less player they created; verify the list shows exactly that set, with no age-group filter/column present, while a coach account viewing the same page still sees the age-group filter.

**Acceptance Scenarios**:

1. **Given** a proScout user assigned no players, **When** they open the Players page, **Then** they see only players on professional-league teams plus team-less players they created themselves.
2. **Given** a proScout user viewing the Players page, **When** the page renders, **Then** no age-group filter control, column, or tab is present.
3. **Given** a coach or observer user viewing the Players page, **When** the page renders, **Then** the age-group filter/column/tabs are unchanged from current behavior.
4. **Given** a proScout user searching, sorting, or paginating the players list, **When** they apply search/sort/pagination, **Then** results are drawn only from their scope (professional-league teams + their own team-less players).
5. **Given** a proScout user viewing player counts or average-ratings widgets, **When** the data loads, **Then** the numbers reflect only their scope.

---

### User Story 2 - View player detail without age-group data (Priority: P1)

A proScout user opens a player's detail page and sees the player's information without any age-group-related section, while the observation/report data they're allowed to see (per the existing coach-equivalent masking rule) displays consistently.

**Why this priority**: Detail view is the second most common surface after the list; leaking age-group data here would defeat the purpose of removing it from the list.

**Independent Test**: Open a player detail page as proScout and confirm no age-group section renders; confirm `observers` field is absent and `observed` status renders as `pending` regardless of underlying data, matching what a coach sees for the same player shape.

**Acceptance Scenarios**:

1. **Given** a proScout user opens a player detail page for a player in their scope, **When** the page renders, **Then** no age-group-related section is shown.
2. **Given** a proScout user opens a player detail page, **When** the response is inspected, **Then** the `observers` field is masked and `observed` status is reported as `pending`, identical to the existing coach behavior.
3. **Given** a proScout user requests a player detail page for a player outside their scope (e.g., a premier-league team) by direct ID, **When** the request is made, **Then** access is denied with **403** — matching the existing per-document guard's behavior for every other role, and never a 200 with an empty body.

---

### User Story 3 - Create and edit players within scope (Priority: P2)

A proScout user creates a new player and edits players they're allowed to manage, with team assignment restricted to professional-league teams (or left team-less, which auto-attributes ownership to them).

**Why this priority**: Write access is the point of the role beyond read-only scouting, but it depends on User Story 1/2's scoping being correct first.

**Independent Test**: As proScout, create a player assigned to a professional-league team and verify `createdBy` is set to the acting user; attempt to create/assign a player to a premier-league team and verify rejection; attempt to edit a player outside scope and verify rejection.

**Acceptance Scenarios**:

1. **Given** a proScout user submits a new player assigned to a professional-league team, **When** the request completes, **Then** the player is created with `createdBy` set to the acting user.
2. **Given** a proScout user submits a new player assigned to a team outside `league: "professional"`, **When** the request is made, **Then** it is rejected, with a response indistinguishable from submitting a team id that does not exist (FR-008).
3. **Given** a proScout user edits a player already within their scope, **When** the update is valid, **Then** it succeeds.
4. **Given** a proScout user attempts to edit a player outside their scope, **When** the request is made, **Then** it is rejected (403).
5. **Given** a proScout user attempts to reassign a player's team to one outside `league: "professional"`, **When** the request is made, **Then** it is rejected on the same terms as scenario 2 (FR-008).
6. **Given** a proScout user attempts to change a player's `observers` assignment, **When** the request is made, **Then** it is rejected (403) — this action remains admin-only.

---

### User Story 4 - Write reports, media, and profile image within scope (Priority: P2)

A proScout user files scouting reports, uploads media, and updates the profile image for players within their scope, with the same write capabilities coaches and observers currently have on these sub-resources.

**Why this priority**: Reports and media are the substance of scouting activity; without them the role can browse but can't do its job.

**Independent Test**: As proScout, create and edit a report on an in-scope player (succeeds) and attempt the same on an out-of-scope player (rejected); attempt to delete a report and to download a media file (both rejected — admin-only, see FR-010/FR-011); upload media and update profile image on an in-scope player (succeeds).

**Acceptance Scenarios**:

1. **Given** a proScout user creates a report on a player within their scope, **When** the request completes, **Then** the report is created successfully.
2. **Given** a proScout user edits their own report on an in-scope player, **When** the request completes, **Then** it succeeds.
2a. **Given** a proScout user attempts to delete any report, **When** the request is made, **Then** it is rejected (403) — deletion is admin-only for every non-admin role (FR-010).
3. **Given** a proScout user attempts to create or edit a report on a player outside their scope, **When** the request is made, **Then** it is rejected (403).
4. **Given** a proScout user uploads media, or views media, for a player within their scope, **When** the request completes, **Then** it succeeds.
5. **Given** a proScout user attempts to upload or view media for a player outside their scope, **When** the request is made, **Then** it is rejected (403).
5a. **Given** a proScout user attempts to download a media file, **When** the request is made, **Then** it is rejected (403) — download is admin-only for every non-admin role (FR-011).
6. **Given** a proScout user updates a player's profile image for a player within their scope, **When** the request completes, **Then** it succeeds.
7. **Given** a proScout user attempts to update a player's profile image for a player outside their scope, **When** the request is made, **Then** it is rejected (403).

### Edge Cases

- A team-less player (`team: null`) created by a different proScout user (or by a coach) MUST NOT appear in this proScout user's list, detail access, or write operations.
- A player currently on a professional-league team gets reassigned (by an admin, outside this feature) to a non-professional team — the next read by the proScout user who no longer has scope MUST exclude it, and any pending write from that user MUST be rejected.
- Exporting the players list (if an export feature exists) as proScout MUST only include players within scope — never the full unscoped dataset.
- A proScout user's create/edit request that omits a team MUST succeed and result in a team-less player owned by them (`createdBy`), not an error.
- Existing coach and observer behavior for players list, detail, reports, media, profile image, and observers-assignment MUST remain byte-for-byte unchanged — this feature only adds a new role branch, never modifies existing role branches.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show the proScout role only players belonging to professional-league teams, or team-less players created by that same user, on the players list.
- **FR-002**: System MUST hide the age-group filter control, any age-group column, and any age-group-related tab from the players list UI when the active user's role is proScout, while leaving that UI unchanged for all other roles.
- **FR-003**: System MUST hide any age-group-related section on the player detail page when the active user's role is proScout, while leaving that UI unchanged for all other roles.
- **FR-004**: System MUST scope search, sort, and pagination results on the players list to the proScout user's scope (FR-001) with no way for query parameters to widen it.
- **FR-005**: System MUST scope the players-counts and reports-average-ratings endpoints to the proScout user's scope when called by that role.
- **FR-006**: System MUST apply the same `observers`-masking and `observed`→`pending` behavior currently applied to the coach role to the proScout role, without change to how it applies to coach.
- **FR-007**: System MUST allow the proScout role to create and update players (mirroring current coach permissions on these endpoints), auto-populating `createdBy` with the acting user on creation.
- **FR-008**: System MUST reject any proScout create or update request that assigns a player to a team where `league` is not `"professional"`, and the rejection MUST be indistinguishable from the rejection given for a team id that does not exist at all. *(Amended during planning: the implementation returns 400 with an identical message in both cases rather than 403. A status-code difference between "real team, wrong league" and "no such team" is an enumeration oracle that would defeat the direct-access guard on teams. See `research.md` R4.)*
- **FR-009**: System MUST reject (403) any proScout create or update request targeting, or reassigning to, a player outside that user's scope (FR-001).
- **FR-010**: System MUST allow the proScout role to create and update scouting reports on players within their scope, and reject (403) the same actions on players outside their scope. Report **deletion** MUST remain denied (403) — it is an admin-only action that neither coach nor observer holds today, and the mirroring rule in Assumptions caps proScout at the coach baseline. *(Amended during planning: the source plan described deletion as a coach/observer permission; it is not. See `research.md` R2.)*
- **FR-011**: System MUST allow the proScout role to upload media and view media for players within their scope, and reject (403) the same actions on players outside their scope. Media **download** and **deletion** MUST remain denied (403) — both are admin-only by an existing security decision that coach and observer are also subject to. *(Amended during planning: see `research.md` R3.)*
- **FR-011a**: System MUST allow the proScout role to read scouting reports and media for players within their scope, on the same terms as coach and observer (own-authored records only, for non-admins) — without this the player detail view, whose default tab is reports, is unreachable for the role.
- **FR-012**: System MUST allow the proScout role to update the profile image of players within their scope, and reject (403) the same action on players outside their scope.
- **FR-013**: System MUST reject (403) any proScout attempt to modify a player's `observers` assignment, regardless of scope — this action remains admin-only.
- **FR-014**: System MUST leave all existing coach, observer, and admin behavior on the players page and all endpoints listed above completely unchanged.
- **FR-015**: Where a players export feature exists, system MUST scope exported data for the proScout role identically to FR-001. **Resolved during planning as NOT APPLICABLE**: no export capability exists anywhere in the players feature, the player controllers, or the routers (verified by search for CSV/XLSX/download-export paths). The requirement stands as a constraint on any future export feature; it generates no work in this stage. *(Analysis finding E1.)*
- **FR-016**: On creating a player, system MUST record the proScout as the creator without recording them as the player's owning coach — that field's established meaning is "the coach who owns this player", and the system's own validation elsewhere accepts only coach-role users in it. *(Added during planning: see `research.md` R5.)*
- **FR-017**: An administrator MUST be able to assign the proScout role to a user through the user-management interface, not only through a direct API call. *(Added during planning: the role selector currently hard-codes three roles, making every acceptance scenario above unreachable through the UI. See `research.md` R13.)*

### Key Entities

- **Player**: The scouted athlete record. Relevant attributes for this feature: `team` (reference, nullable), `createdBy` (owning user, established in Stage 2), `observers` (masked for proScout per FR-006), `observed` status (masked to `pending` for proScout per FR-006), age-group derived field (hidden from proScout UI per FR-002/FR-003 but not removed from the data).
- **Team**: Determines scope eligibility via its `league` attribute (`"professional"` vs. other values, established in Stage 2).
- **Scouting Report**: Written by proScout users on in-scope players; ownership/edit rules mirror existing coach/observer report permissions.
- **Media**: Uploaded and viewed by proScout users on in-scope players; mirrors existing coach/observer media permissions. Download and deletion remain admin-only for every non-admin role (FR-011).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of players list and player detail responses returned to a proScout user contain only in-scope players (professional-league teams + own team-less players) — verified by automated tests comparing API results against a manually computed expected set.
- **SC-002**: 0 age-group filters, columns, tabs, or detail sections are rendered anywhere in the proScout role's players experience, across list and detail views.
- **SC-003**: 100% of proScout write attempts (create/update player, report, media, profile image) targeting out-of-scope players are rejected with **403**, and 100% of attempts to assign a non-professional team are rejected with a response **indistinguishable from a nonexistent team id** (FR-008) — both verified by automated tests, and neither ever answered with a 200 carrying an empty body. *(Amended during analysis to match FR-008; finding F1.)*
- **SC-004**: 0 regressions in coach, observer, or admin behavior on the players page or any endpoint touched by this feature, verified by full regression test suite passing unchanged.
- **SC-005**: proScout users can complete the create-player → file-report → upload-media workflow entirely within their own scope without needing to leave the Players page.

## Assumptions

- Stage 2's scope definition (`team` in professional-league teams, or `team: null` with matching `createdBy`) and its `$and`-wrapped query-safety pattern are reused as-is for all new scoping in this feature — no new scope logic is invented.
- `maskObservedForCoach` **already applies to `proScout`** as of Stage 2 — on the list, the detail view, and the counts endpoint alike. This feature verifies that behavior with tests; it does not extend or restructure it. *(Corrected during analysis; finding A2.)*
- "Mirroring current coach permissions" for reports/media/profile-image means proScout gets exactly the same allowed HTTP verbs on the same routes as coach (and observer, where the route currently allows both), not a broader or narrower set.
- No new UI **layout** is required — the players list and detail layouts are reused unchanged. Beyond conditionally hiding age-group elements, the only additive UI is one new option in the admin's role selector (FR-017) and widening the existing "Add player" control to this role.
- FR-015 (export scoping) was checked during planning and resolved as not applicable — no export feature exists. *(Finding E1.)*
- **New user-facing copy IS introduced**, in English and Arabic both: a label for the `proScout` role option (FR-017), and replacement hint strings for the create/edit form's Team dropdown that state the blocking condition without naming age groups. Everything else is existing copy, conditionally hidden. *(Corrected during analysis; finding F3.)*
