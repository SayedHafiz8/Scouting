# Feature Specification: Professional League Admin Page

**Feature Branch**: `013-professional-league-admin`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "صفحة إدارة دوري المحترفين للأدمن + عدد proScouts في داشبورد الأدمن — قائمة/إدارة proScouts، قائمة/إدارة فرق دوري المحترفين، قائمة/إدارة مباريات دوري المحترفين في مكان واحد متكامل، مع عنصر قائمة جانبية جديد بين 'المتابعون' و'الفئات العمرية'، وتوسيع كارد الداشبورد الحالي بعمود proScouts ثالث."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin manages proScout accounts from one place (Priority: P1)

An admin wants to see who the registered professional-league scouts (proScouts) are, and to add a
new one, without hunting through the general coach-management screen or guessing whether such a
list exists at all today.

**Why this priority**: This is the one management capability the app has no path to at all right
now — there is no list of proScouts anywhere in the admin UI, so this is the most novel, most
immediately valuable piece of the feature, and can ship as a complete, self-contained increment.

**Independent Test**: Log in as admin, open the new "Professional League" page, see a list of
existing proScouts, add a new one, and confirm the new proScout can log in and see their own
dashboard.

**Acceptance Scenarios**:

1. **Given** an admin on the new Professional League page, **When** they view the proScouts
   section, **Then** they see every user with the proScout role, with enough detail to identify
   each one (name, email, active/inactive state).
2. **Given** an admin on the proScouts section, **When** they add a new proScout with valid
   details, **Then** the new proScout appears in the list and can log in with the credentials
   set.
3. **Given** an admin opens an existing proScout's details from the list, **When** they view it,
   **Then** they see the same kind of profile detail already available for coaches and observers.

---

### User Story 2 - Admin manages professional-league teams from the same place (Priority: P2)

An admin wants to add, view, and remove professional-league teams from the new page, without
having to go into an unrelated age-group's page to do it (today's only path, and one that forces
picking an age group that has no real meaning for a professional-league team).

**Why this priority**: Directly valuable on its own — an admin can start standing up professional
teams from a sensible, dedicated place — and independent of proScout account management (US1).

**Independent Test**: Log in as admin, open the new page, add a professional-league team without
being asked to pick an age group, see it appear in the list, and remove it.

**Acceptance Scenarios**:

1. **Given** an admin on the Professional League page, **When** they view the teams section,
   **Then** they see only professional-league teams (never premier-league teams).
2. **Given** an admin creating a new team on this page, **When** they fill in the team's name and
   club, **Then** they are never asked to choose an age group, and the team saves successfully
   with no age group attached.
3. **Given** an admin removes a team from this page, **When** the removal completes, **Then** the
   team no longer appears in this list or anywhere else professional-league teams are shown.
4. **Given** an admin manages teams for a youth age group elsewhere in the app (existing
   behavior), **When** they create a premier-league team there, **Then** they are still required
   to pick an age group exactly as before — this feature changes nothing about that flow.

---

### User Story 3 - Admin manages professional-league matches from the same place (Priority: P2)

An admin wants to schedule, edit, and record the result of professional-league fixtures from the
new page, the same way match management already works for youth age groups today.

**Why this priority**: Completes the "one integrated place" promise alongside US2 — teams without
fixtures are of limited use — but is independently valuable and testable on its own once at least
two professional teams exist (from US2).

**Independent Test**: With two professional-league teams already created, log in as admin, open
the new page, schedule a fixture between them, edit it, and record a result.

**Acceptance Scenarios**:

1. **Given** an admin on the Professional League page with at least two professional teams
   available, **When** they view the matches section, **Then** they see only professional-league
   fixtures (never premier-league fixtures).
2. **Given** an admin schedules a new fixture between two professional teams, **When** they save
   it, **Then** it appears in the professional-league fixture list with the details entered.
3. **Given** an existing professional-league fixture, **When** the admin edits its details or
   records its result, **Then** the change is reflected immediately in the list.
4. **Given** an admin manages fixtures for a youth age group elsewhere in the app (existing
   behavior), **When** they schedule a premier-league fixture there, **Then** nothing about that
   flow changes.

---

### User Story 4 - Admin dashboard shows proScout headcount (Priority: P3)

An admin glancing at their dashboard wants to see how many proScouts are registered, right next
to the coach and observer counts they already see, without navigating anywhere else.

**Why this priority**: Small, independent, and lowest-risk of the four — a single additional
number on an existing screen — but least urgent since the admin can already find this count by
visiting the new page from US1.

**Independent Test**: Log in as admin, view the dashboard, and confirm the existing
coaches/observers figure now shows a third, correct proScout count alongside them, styled the same
way as the other two.

**Acceptance Scenarios**:

1. **Given** an admin on their dashboard, **When** they view the card that already shows coach
   and observer counts, **Then** they also see the total number of registered proScouts in the
   same card, in the same visual style as the other two figures.
2. **Given** a new proScout is added (via US1) or an existing one is removed, **When** the admin
   reloads the dashboard, **Then** the proScout count reflects the change accurately.
3. **Given** the admin dashboard's other figures (players, reports, media, coaches, observers,
   top coaches), **When** this feature ships, **Then** none of those other figures change.

---

### Edge Cases

- An admin tries to reach the new page's URL directly without being logged in as admin — access
  is denied the same way every other admin-only page in the app already denies it.
- A non-admin role (coach, observer, proScout) never sees the new sidebar entry and cannot reach
  the page by URL.
- A professional-league team already exists from before this feature shipped and currently has an
  age group attached (a side effect of how such teams were created previously) — after this
  feature ships, it no longer carries an age group.
- An admin tries to schedule a professional-league fixture while fewer than two professional teams
  exist — same guardrail already in place for youth age-group fixtures applies.
- Deleting a professional-league team that already has players or fixtures attached — existing
  deletion behavior/guardrails for teams are unchanged, just reachable from a new place.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The admin navigation MUST include a new "Professional League" entry, positioned
  between the existing "Observers" and "Age Groups" entries, visible to admins only.
- **FR-002**: The system MUST deny access to the new page and its underlying data for every
  non-admin role, both via navigation and via direct URL access.
- **FR-003**: The new page MUST let an admin view, and add, proScout accounts, and view an
  individual proScout's profile detail, using the same account-creation and detail-viewing
  experience already available for other roles (coach, observer) elsewhere in the app.
- **FR-004**: The new page MUST let an admin view, add, and remove professional-league teams,
  scoped so only professional-league teams ever appear or are affected there.
- **FR-005**: Creating a professional-league team MUST NOT require the admin to select an age
  group, and the saved team MUST carry no age-group value.
- **FR-006**: The new page MUST let an admin view, add, edit, and record the result of
  professional-league fixtures, scoped so only professional-league fixtures ever appear or are
  affected there.
- **FR-007**: Professional-league teams that existed before this feature shipped, and currently
  carry an age-group value, MUST have that value cleared as part of delivering this feature.
- **FR-008**: The admin dashboard's existing coach/observer count card MUST be extended with a
  third figure: the total number of registered proScouts, presented in the same visual style as
  the other two figures in that card.
- **FR-009**: Nothing about existing age-group pages, existing premier-league team/fixture
  creation (including the age-group requirement for premier-league teams), the general
  coach-management page, or the observer-management page MUST change as a result of this feature.
- **FR-010**: The admin dashboard's other existing figures (total players, selected/pending/
  rejected, reports, media, top coaches, selection rate) MUST NOT change as a result of this
  feature.
- **FR-011**: The new page's visual presentation MUST be consistent with the rest of the
  application's existing look and feel (colors, typography, spacing, iconography, interactive
  states) — reviewed for that consistency before being considered complete, not assumed.

### Key Entities

- **ProScout account**: A registered user with the proScout role — same underlying entity already
  used across the app, newly given a dedicated management view.
- **Professional League Team**: A team belonging to the professional league, distinguished from
  youth/premier teams by not being tied to any age group.
- **Professional League Fixture**: A scheduled match between two professional-league teams, with
  a date, venue, and (once played) a result — same underlying concept already used for youth/
  premier fixtures, scoped here to the professional league only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can view and add proScouts, professional-league teams, and
  professional-league fixtures all from a single page, in one uninterrupted session, without
  navigating to any other section of the app.
- **SC-002**: The proScout count shown on the admin dashboard always matches the actual number of
  registered proScouts, with no manual refresh or recalculation needed beyond reloading the page.
- **SC-003**: The new page and its data are completely unreachable by any non-admin role, in 100%
  of access attempts (navigation or direct URL).
- **SC-004**: Every professional-league team created after this feature ships has zero age-group
  values recorded against it; every premier-league team created continues to require one, with no
  change in that experience.
- **SC-005**: An admin unfamiliar with this change cannot tell, from appearance alone, that the
  new page or the dashboard's third figure were added later rather than being part of the
  original application.

## Assumptions

- **Reuse over rebuild**: The new page's proScout management reuses the account-creation and
  detail-viewing experience the app already provides for coaches and observers, rather than
  building a separate one — those flows already support every role including proScout. Likewise,
  team and fixture management reuse the same underlying mechanisms already powering the equivalent
  management embedded in age-group pages today, scoped to the professional league instead of a
  specific age group.
- **Third dashboard figure's color**: The existing coach/observer count card uses a color that
  does not belong to the app's three named accent colors (documented in the app's shared style
  definitions). By explicit decision, the new proScout figure reuses that same existing color
  rather than introducing a new one or deriving it from the documented palette — the three figures
  in that card share one consistent color, as they do today.
- **Data cleanup, not just a going-forward rule**: Clearing the age-group value from
  already-existing professional-league teams (FR-007) is a one-time cleanup performed as part of
  shipping this feature, not merely a rule applied to newly created teams from this point forward.
- **Design review before build**: Before any visual/UI work on this feature begins, the team's
  established design-review process is applied against the app's existing style conventions, so
  the new page and the dashboard update are held to the same bar as the rest of the app, not
  assessed only after the fact.
- **No change to youth/premier flows**: Every existing capability for premier-league teams and
  fixtures, and for managing coaches and observers, continues to work exactly as it does today —
  this feature only adds a new, additional path for the professional league and proScouts.
