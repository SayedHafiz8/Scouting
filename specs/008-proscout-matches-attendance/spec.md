# Feature Specification: Pro Scout Matches & Attendance

**Feature Branch**: `008-proscout-matches-attendance`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "صفحة المباريات لرول proScout — قراءة مباريات دوري المحترفين فقط، تسجيل حضور بدون إدخال نتيجة، إخفاء أي مرجع للفئة العمرية في الواجهة، وإضافة اختبار مركزي واحد لوجهات الهبوط/الرفض لكل رول."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse professional-league matches (Priority: P1)

A pro scout signs in and opens the matches page. They see only matches belonging to the professional league — past results and upcoming fixtures — with no way to filter by, or otherwise see, age-group information, since age groups are not part of how this role organizes their work.

**Why this priority**: This is the reason the role needs a matches page at all. Without it, the scout has no way to plan which fixtures to attend.

**Independent Test**: Sign in as a pro scout with matches seeded in both the professional league and other leagues; confirm the list shows only professional-league matches, and that no age-group filter or column is present.

**Acceptance Scenarios**:

1. **Given** matches exist in both the professional league and other leagues, **When** a pro scout opens the matches list, **Then** only professional-league matches appear.
2. **Given** a pro scout is viewing the matches list, **When** they look at the available filters, **Then** they can filter by season — the same filter every other role already has — but there is no age-group filter, and no league toggle either, since a pro scout only ever has one league to see in the first place.
3. **Given** a pro scout opens a match's details, **When** the page renders, **Then** lineup, events, and result are shown, and nothing on the page references an age group.
4. **Given** a pro scout knows the internal ID of a match outside the professional league, **When** they navigate directly to that match's detail URL, **Then** they are denied access, not shown the match.

---

### User Story 2 - Register attendance and record the result (Priority: P1)

A pro scout is going to watch a professional-league match in person or wants to mark themselves as covering it. They mark themselves as attending, and can later remove themselves if their plans change. If they're the one there on match day, they can also enter the match's result — under the same same-day-only constraint that already applies to coaches and observers.

**Why this priority**: Attendance is how the scout signals which fixtures they're covering, mirroring what coaches and observers already do. Result entry is the natural extension of being the attendee actually at the match — withholding it here while granting it to every other attendee role would leave the pro scout unable to close out a match they covered.

**Independent Test**: Sign in as a pro scout, mark attendance on a professional-league match, confirm it's reflected; remove attendance and confirm it's cleared. On match day, as an attendee, enter the match result and confirm it's saved. Attempt attendance and result entry on a match outside the professional league and confirm both are rejected. Attempt result entry on a day other than the match day and confirm it's rejected, same as for a coach.

**Acceptance Scenarios**:

1. **Given** a professional-league match, **When** a pro scout registers attendance, **Then** they are recorded as attending.
2. **Given** a pro scout is already registered as attending a professional-league match, **When** they remove their attendance, **Then** they are no longer recorded as attending.
3. **Given** a match outside the professional league, **When** a pro scout attempts to register attendance (via the API directly, bypassing the UI), **Then** the request is denied.
4. **Given** a pro scout is a registered attendee of a professional-league match, and today is that match's date, **When** they enter the match's status/result, **Then** it is saved, exactly as it would be for an attendee coach or observer.
5. **Given** a pro scout is a registered attendee of a professional-league match, **When** they attempt to enter or change that match's status/result on a day other than the match day, **Then** the action is denied — identical to the existing constraint on coaches and observers.
6. **Given** a match outside the professional league, **When** a pro scout attempts to enter its status/result even if somehow recorded as an attendee, **Then** the action is denied.

---

### User Story 3 - Reliable navigation for every role, including on failure (Priority: P2)

Whenever any user — of any role — either lands somewhere after login or is denied access to a page, the destination they land on is correct and predictable, and stays correct as the product evolves. This applies to the pro scout's new matches entry point as much as to every existing role.

**Why this priority**: This role's navigation has drifted twice already during earlier stages of this rollout (a dashboard link and now a matches link that didn't exist yet, each requiring a follow-up fix once the real page landed). A single, authoritative check that covers every role's landing and rejection destinations prevents a third silent drift and protects the other roles' behavior while this feature changes the pro scout's own routing.

**Independent Test**: Run the consolidated landing/rejection test suite; it independently verifies, for every role, both where they land after login and where they land when denied access to a page they don't have — including the pro scout's newly-added matches entry.

**Acceptance Scenarios**:

1. **Given** the consolidated test suite, **When** it runs, **Then** it verifies the login landing destination for every existing role (admin, coach, observer, pro scout) in one place.
2. **Given** the consolidated test suite, **When** it runs, **Then** it verifies the access-denied destination for every role attempting a page outside its permissions, in one place.
3. **Given** a future change to any role's landing or rejection destination, **When** that change is made without updating the shared source of truth, **Then** the consolidated test fails immediately.

---

### Edge Cases

- A pro scout attempts to view a match's detail page for a match outside the professional league by typing the URL directly (not via a link) — must be denied, not just hidden from the list.
- A pro scout who is not registered as attending a match, and is not the scout who added a player to it, tries to remove someone else's attendance — must be denied.
- A match has no players from the professional league yet linked to a scout (e.g., seeded directly by an admin) — the match still appears if its league is professional; visibility does not depend on player linkage.
- The matches list and detail page are opened with no matches in the professional league at all — the page shows a clear empty state, not an error.
- A pro scout who already left a match (removed attendance) reopens the match detail page — they can still view it (viewing is governed by league scope, not attendance), but the page reflects they are no longer attending, and they can no longer enter its result.
- A pro scout is a registered attendee of a professional-league match but tries to enter the result before or after match day — denied, same as the existing coach/observer constraint.
- A pro scout removes their own attendance and immediately tries to enter the match result the same day — denied, since result entry requires being a current attendee, not just having been one earlier that day.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST show pro scouts only matches belonging to the professional league, both in the matches list and when a specific match is opened directly by its ID.
- **FR-002**: System MUST NOT expose any age-group filter, column, or reference on the matches list or match detail page for the pro scout role, even though the underlying match record still has an age group value.
- **FR-003**: System MUST let pro scouts filter the matches list by season, the same filter capability every other role already has on this page. System MUST NOT show a league toggle to this role — a pro scout has exactly one league to see, so there is nothing for it to switch between. No date, competition, or opponent filter exists on this page for any role today, and this feature does not add one.
- **FR-004**: System MUST let pro scouts register their own attendance at a professional-league match, and remove it later, the same way coaches and observers already can for their matches.
- **FR-005**: System MUST deny a pro scout's attempt to register or remove attendance on a match outside the professional league.
- **FR-006**: System MUST let a pro scout who is a registered attendee of a professional-league match enter or change that match's status/result, under the exact same same-day-only constraint already enforced for attendee coaches and observers (admin exempted, as today).
- **FR-007**: System MUST deny a pro scout's attempt to enter or change a match's status/result when they are not a registered attendee of that match, or when the match is outside the professional league — identical in effect to the existing rule for coaches and observers.
- **FR-008**: System MUST NOT change any existing behavior for the coach, observer, or admin roles on match listing, match detail, attendance, or status/result entry.
- **FR-009**: System MUST provide pro scouts a navigation entry point to the matches page, following the same access rules already established for other role-specific navigation entries (hidden entirely if the role can't reach the destination).
- **FR-010**: System MUST have one single, authoritative check that verifies, for every role (including pro scout), both the destination reached after successful login and the destination reached when access to a page is denied — replacing the current situation where this knowledge is scattered across multiple, separately-maintained test files.
- **FR-011**: System MUST continue enforcing that only registered attendees of a match (or an admin) can act on that match's status, unchanged from current behavior.

### Key Entities

- **Season Match**: A scheduled or completed fixture with a league, a date, an opponent, a status/result, and a list of attendees (users covering it). Already carries an age group internally; that association is not meaningful to the pro scout's workflow and must not surface to them.
- **Attendance**: The record of which users are covering a given match, self-registered and self-removed by the user, distinct from who is allowed to enter that match's result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pro scout viewing the matches list never sees a match outside the professional league, and attempting direct access to one by ID is refused 100% of the time.
- **SC-002**: A pro scout can register and later remove their own attendance at a professional-league match in under two actions each, with no failures for in-scope matches.
- **SC-003**: 100% of attendance attempts on out-of-scope matches by a pro scout are rejected.
- **SC-004**: A pro scout can submit a match result or status change only when they are a registered attendee of an in-scope match on the match's own day — 100% of attempts outside those conditions (wrong day, not an attendee, out-of-scope match) are rejected, and 100% of attempts meeting all three conditions succeed.
- **SC-005**: The consolidated landing/rejection check covers 100% of existing roles plus the pro scout, and a deliberate mismatch introduced in a single role's destination causes it to fail.
- **SC-006**: No existing coach, observer, or admin workflow around matches (listing, detail, attendance, status entry) changes in outcome as a result of this feature.

## Assumptions

- Entering or changing a match's status/result is opened to the pro scout on the exact same terms as coaches and observers already have: only as a registered attendee, only on the match's own day, admin exempted. This supersedes the earlier planning-stage recommendation to keep result entry coach-only — the plan's decision table has been corrected to grant proScout attendance **and** result entry, not attendance alone.
- "Matches page" for the pro scout is a role-appropriate view of the same underlying match data and attendance mechanism coaches/observers already use — it does not require a separate data model or a distinct attendance concept.
- The age group tied to a match is retained in the underlying record (unchanged) — only its exposure to this role's UI is affected.
- The consolidated landing/rejection check is a testing/verification asset, not a user-facing feature; it protects this and future rollouts from destination drift across all roles, not just pro scout.
