# Feature Specification: Role-Based Sidebar Navigation

**Feature Branch**: `phase-3-navigation-routing`

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "فعّل التنقّل المبني على الرولات في الفرونت إند (sidebar.component.ts) وأغلق deny-by-default في القائمة الجانبية. حوّل القائمة لمصفوفة NavItem[] تُبنى من الداتا وفعّل حقل roles؛ أي عنصر بدون تطابق رول صريح = مخفي؛ أعد إنتاج قائمة كل رول قائم بدقة 1:1؛ proScout يشوف عنصرين بالضبط (Players و Profile) مع تسجيل Dashboard و My Matches كـfollow-ups للمرحلتين 5 و6؛ وثّق منع proScout من /age-groups و/users و/observers باختبارات صريحة."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Existing roles see an unchanged menu (Priority: P1)

An administrator, a coach, and an observer each open the application. Each one sees exactly the same navigation menu they saw before this change: the same entries, in the same order, pointing at the same destinations, with the same labels and icons. Nothing appears, disappears, or moves.

**Why this priority**: Constitution Principle III is non-negotiable — no behavior change for existing roles. This work rewrites the mechanism that produces every menu for every user, so the primary risk is a silent regression for the three roles that are already in production. Every other story in this feature is worthless if this one fails.

**Independent Test**: Capture the menu each existing role sees before the change, apply the change, capture it again, and confirm the two captures are identical entry-for-entry and order-for-order.

**Acceptance Scenarios**:

1. **Given** a signed-in administrator, **When** the navigation menu is displayed, **Then** it contains exactly: Dashboard, Players, Coaches, Observers, Age Groups, Profile — in that order. (The "Coaches" entry leads to the users area; it is labelled Coaches today and keeps that label.)
2. **Given** a signed-in coach, **When** the navigation menu is displayed, **Then** it contains exactly: Dashboard, Players, My Matches, Profile — in that order.
3. **Given** a signed-in observer, **When** the navigation menu is displayed, **Then** it contains exactly: Dashboard, Players, My Matches, Profile — in that order.
4. **Given** an administrator viewing the players page, **When** the sidebar renders, **Then** the formation graphic below the menu still appears under exactly the same condition as before (administrator, on the players page) and is unaffected by the menu rework.
5. **Given** any existing role, **When** a menu entry is displayed, **Then** its label, icon, and destination are unchanged from before this feature.

---

### User Story 2 - Unpermitted entries are hidden by default (Priority: P1)

The menu is produced from a declared list of entries, each carrying the set of roles allowed to see it. An entry is shown only when the signed-in user's role is explicitly named on it. Any role that is not named — including a role added to the system in the future and forgotten here — sees nothing for that entry.

**Why this priority**: Constitution Principle II (deny by default) and Principle VII ("navigation MUST be built from permissions, not from hand-written conditions on a role name"). Today the menu is a set of hand-written conditions whose *else* branch is "show it", so every future role silently inherits Dashboard, Players, and Profile. This story inverts that default, and it is what makes Story 3 correct by construction rather than by remembering.

**Independent Test**: Present the menu with a role that appears on no entry at all and confirm zero entries are produced; repeat with no signed-in user and confirm the same.

**Acceptance Scenarios**:

1. **Given** a signed-in user whose role appears on no menu entry, **When** the menu is displayed, **Then** zero entries are shown.
2. **Given** no signed-in user, **When** the menu is displayed, **Then** zero entries are shown.
3. **Given** a menu entry that names a set of roles, **When** a user whose role is outside that set views the menu, **Then** the entry is absent — not merely disabled or greyed out.
4. **Given** a new entry is added to the declared list without naming any role, **When** any user views the menu, **Then** the entry is invisible to everyone.

---

### User Story 3 - ProScout sees only what it can actually use (Priority: P1)

A professional-league scout signs in and sees a menu containing exactly two entries: Players and Profile. There is no entry leading to a destination the role is refused, and no entry hinting at data the role has no access to — age groups in particular are absent, permanently.

**Why this priority**: This is the visible deliverable of the phase and the first point where the deny-by-default default from Story 2 pays off. It is P1 alongside the others because a menu offering a scout a link that ends in a refusal is worse than no link at all.

**Independent Test**: Sign in as a proScout and confirm the menu shows Players and Profile and nothing else.

**Acceptance Scenarios**:

1. **Given** a signed-in proScout, **When** the menu is displayed, **Then** it contains exactly two entries: Players and Profile.
2. **Given** a signed-in proScout, **When** the menu is displayed, **Then** no entry for age groups, users, observers, dashboard, or matches is present.
3. **Given** a signed-in proScout, **When** each displayed entry is followed, **Then** the destination it leads to is one the role is permitted to open (no entry leads to a refusal).

---

### User Story 4 - Direct navigation to administration areas is refused (Priority: P2)

A proScout who types the address of the users area, the observers area, or the age-groups area directly into the browser — bypassing the menu entirely — is refused and lands on the "unauthorized" page. The corresponding server requests are refused as well, so the refusal does not depend on the browser.

**Why this priority**: Constitution Principle I — hiding a menu entry is not a permission. Story 3 removes the link; this story proves the door is locked. It is P2 only because the enforcement is expected to be already in place from earlier phases; the deliverable here is the proof, not the lock.

**Independent Test**: With a proScout session, request each administration area directly and confirm the result is a redirect to the unauthorized page; independently confirm the server refuses the matching data requests.

**Acceptance Scenarios**:

1. **Given** a signed-in proScout, **When** the users area is opened directly by address, **Then** the user is redirected to the unauthorized page.
2. **Given** a signed-in proScout, **When** the observers area is opened directly by address, **Then** the user is redirected to the unauthorized page.
3. **Given** a signed-in proScout, **When** the age-groups area is opened directly by address, **Then** the user is redirected to the unauthorized page.
4. **Given** a signed-in proScout, **When** the server is asked for the data behind any of those three areas, **Then** the request is refused with an explicit refusal status, not an empty success.
5. **Given** an existing role that *is* permitted for one of those areas, **When** it opens that area directly, **Then** access is granted exactly as before.

---

### Edge Cases

- **Session not yet restored.** The application restores the session from a stored credential before the first navigation. Until the signed-in user is known, the role is absent, so the menu shows zero entries and fills in once the role resolves. It MUST NOT briefly show a fuller menu and then remove entries.
- **Role changed by an administrator during an open session.** The menu reflects whatever role the current session reports; it is not cached independently of that. A changed role takes effect no later than the next sign-in.
- **A role named on an entry whose destination it cannot open.** This is the failure mode the phase is closing, and it MUST NOT be introduced: any role named on an entry must be permitted at that entry's destination. Deliberate exceptions are recorded in "Deferred by Design" below.
- **Entry ordering.** Order is a property of the declared list, not of the viewing role. Every role sees the entries it is permitted to see in the same relative order.
- **Unused leftovers.** The current menu code declares a set of player-status sub-entries that the displayed menu never uses. They are not part of the menu today, so they MUST NOT appear in it after this change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The navigation menu MUST be produced from a single declared collection of entries, each carrying its label, icon, destination, and the explicit set of roles permitted to see it.
- **FR-002**: An entry MUST be displayed only when the signed-in user's role is explicitly named on that entry. Absence from the named set MUST hide the entry.
- **FR-003**: When no signed-in user exists, or the signed-in user's role is named on no entry, the menu MUST contain zero entries.
- **FR-004**: The menu presented to an administrator MUST be exactly: Dashboard, Players, Coaches, Observers, Age Groups, Profile — in that order. ("Coaches" is the entry leading to the users area; the label is unchanged from today.)
- **FR-005**: The menu presented to a coach MUST be exactly: Dashboard, Players, My Matches, Profile — in that order.
- **FR-006**: The menu presented to an observer MUST be exactly: Dashboard, Players, My Matches, Profile — in that order.
- **FR-007**: The menu presented to a proScout MUST be exactly: Dashboard, Players, My Matches, Profile — in that order. **(Updated by Stage 6 — see DF-002 below. Was "Dashboard, Players, Profile" while the role had no matches destination; originally "Players, Profile" while it had no dashboard destination either — see DF-001.)**
- **FR-008**: The age-groups entry MUST NOT name proScout, in this phase or any later one.
- **FR-009**: Every entry's label, icon, and destination MUST be identical to the corresponding entry before this change, so that no existing role observes any visual or behavioral difference.
- **FR-010**: The formation graphic rendered below the menu MUST keep its existing display condition (administrator, while the players area is active) and MUST NOT become a menu entry.
- **FR-011**: The unused player-status sub-entry declarations MUST NOT be rendered in the menu; the menu MUST have no sub-entries after this change, matching its current state.
- **FR-012**: A proScout MUST be refused when opening the users, observers, or age-groups areas directly by address, and MUST be sent to the unauthorized destination.
- **FR-013**: The refusal in FR-012 MUST be derived from the single existing role-destination source, not from a new hand-written condition.
- **FR-014**: The server MUST refuse a proScout's requests for the data behind the users, observers, and age-groups areas with an explicit refusal status rather than an empty successful response. Where this is already true, it MUST be demonstrated by test rather than assumed. (Constitution C-3 records `GET /ages` as reachable without authentication at all — an accepted, separately-tracked exception; the demonstration MUST record the actual behavior rather than assert a refusal that does not exist.)
- **FR-015**: Every role named on an entry MUST be permitted at that entry's destination, except for the deliberate deferrals recorded in "Deferred by Design".
- **FR-016**: Every role name written into the entry collection MUST be checked at build time against the system's generated set of valid roles. A misspelled or retired role name MUST fail the build, not silently match nothing. (This is a verification requirement, not a requirement to introduce a new constant — see `research.md` R4 for why a parallel role-name object is rejected.)
- **FR-017**: No user-facing text may be introduced without both English and Arabic wording; this change is expected to introduce none, reusing the existing menu labels.

### Deferred by Design *(binding follow-ups)*

These two entries belonged to proScout by the overall plan but were deliberately **not** added in this phase, because the destinations behind them did not yet accept the role — adding them then would have produced a menu entry that ends in a refusal, violating FR-015. Both DF-001 and DF-002 have since been discharged, by Stage 5 and Stage 6 respectively.

- **DF-001 — Dashboard entry for proScout → Phase 5. DISCHARGED.** The dashboard area routes each role to its own landing destination, and proScout originally had none, so it resolved to the unauthorized destination.

  > **History**: Stage 4 gave the role a temporary landing (`/players`, the one page it could
  > actually work in at the time) rather than leave a successful login ending on a refusal screen.
  > **Stage 5** (`specs/007-proscout-dashboard/`) then built the real dashboard
  > (`GET /dashboard/proScout` + the page), **edited the existing `RoleLandingService` case in
  > place** to return `['/dashboard/proScout']` (no second case was added for the role — a
  > duplicate would mean two contradicting branches in the same `switch`, and only the first would
  > ever run), and added proScout to the Dashboard nav entry's role set. FR-007 above now reflects
  > three entries.
  >
  > Locked by `core/services/role-landing.service.spec.ts` → *"RoleLandingService — proScout
  > (DF-001, discharged in Stage 5)"* and `layout/sidebar/sidebar.component.spec.ts`'s proScout
  > cases.
- **DF-002 — My Matches entry for proScout → Phase 6. DISCHARGED.** The matches area was restricted to coach, observer, and administrator, and the attendance actions behind it were restricted to coach and observer on the server.

  > **History**: Stage 6 (`specs/008-proscout-matches-attendance/`) opened
  > `POST`/`DELETE /seasonMatches/{id}/attend` and `PATCH /seasonMatches/{id}/status` to proScout
  > (the latter under the same attendee-plus-match-day constraint coaches/observers already have),
  > opened the `/my-matches` route guard to the role, and added proScout to the My Matches nav
  > entry's role set. FR-007 above now reflects four entries.
  >
  > Locked by `layout/sidebar/sidebar.component.spec.ts` → *"proScout sees exactly: Dashboard,
  > Players, My Matches, Profile (Stage 6 — DF-002 discharged)"* and
  > `core/auth/role-landing-destinations.spec.ts`.

Both were recorded here so that the original "exactly two entries" expectation in FR-007 was understood as a phase checkpoint, not a final state — DF-001's discharge (three entries) was the first checkpoint moving; DF-002's discharge (four entries) is the second, and closes this deferral.

### Key Entities

- **Navigation entry**: One item in the sidebar menu. Carries a display label, an icon, a destination within the application, and the explicit set of roles permitted to see it. The collection of these entries, in declaration order, is the sole source of the menu.
- **Role**: The single identifier attached to a signed-in user that decides which navigation entries are visible and which destinations are reachable. The set of valid roles is defined once for the whole system.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For each of administrator, coach, and observer, the set and order of menu entries after this change is identical to the set and order before it — zero differences.
- **SC-002**: A proScout sees exactly 4 menu entries **(Updated by Stage 6 — was 3 while DF-002 was open, and 2 before that while DF-001 was open)**; a coach and an observer see exactly 4 each; an administrator sees exactly 6.
- **SC-003**: A user with no role, and a user with a role named on no entry, each see exactly 0 menu entries.
- **SC-004**: 100% of menu entries shown to any role lead to a destination that role can open. DF-001 (Stage 5) and DF-002 (Stage 6) are both discharged and are no longer exclusions.
- **SC-005**: All three administration areas (users, observers, age groups), when opened directly by a proScout, are refused — the guard does not grant entry — with the refusal bouncing to the role's own landing destination (`/dashboard/proScout` as of Stage 5) rather than granting access. **Corrected by Stage 5**: this criterion originally named `/unauthorized` as the destination, which stopped being accurate the moment Stage 4 gave the role its own (then-temporary) landing — `/unauthorized` is reserved for *unrecognized* roles, and a refused-but-recognized role has bounced to its own destination since Stage 4. The security property — "the guard does not grant access" — was true throughout and is what this criterion actually measures; only the destination string was stale.
- **SC-006**: The server's decision for a proScout on the data behind those three areas is recorded by an executable check for each one, so a future change that silently opens one of them fails a test.
- **SC-007**: Adding a hypothetical new role to the system, without touching the menu, results in that role seeing 0 entries.
- **SC-008**: The full existing frontend test suite and the production build both pass with no new failures.

## Assumptions

- The single role-to-landing-destination source introduced in Phase 0, and the unauthorized destination it points unknown roles at, both already exist and are reused unchanged; this phase adds no second copy of that logic.
- The refusal of proScout at the users, observers, and age-groups areas is already achieved by the existing role restrictions on those areas. This phase's deliverable there is executable proof, not new enforcement. If a check reveals the refusal does not actually hold, closing that gap becomes in scope for this phase.
- The menu's current appearance — spacing, hover and active styling, the collapse behavior on narrow screens, and the click-to-close behavior on mobile — is preserved by reusing the existing markup and styles for each entry rather than redesigning them.
- Menu entry labels continue to come from the existing bilingual translation keys, so no new English/Arabic wording is required.
- The formation graphic, the signed-in user's summary block at the bottom, and the logo header are outside the menu collection and are untouched.
- Scope is limited to the frontend. The backend is touched only by adding confirming tests if a needed one is missing; no production backend source and no existing isolation test is modified.
- The overall plan's stated target of four proScout entries in this phase is knowingly reduced to two by owner decision, with the remaining two bound to Phases 5 and 6 as DF-001 and DF-002.
