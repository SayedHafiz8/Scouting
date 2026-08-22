# Feature Specification: ProScout Dashboard

**Feature Branch**: `phase-5-dashboard`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "داشبورد رول proScout. أنشئ GET /dashboard/proScout بنفس باترن /dashboard/coach و /dashboard/observer الموجودين. كل الإحصائيات محسوبة عبر طبقة السكوب من المرحلة 2 — ممنوع كتابة استعلامات إحصائية جديدة تتجاوزها. المؤشرات: عدد لاعبيه، المباريات القادمة في دوري المحترفين، آخر النتائج، تقاريره الأخيرة. ممنوع أي كارت أو رسم بياني يخص الفئات العمرية. سلوك واضح للحالة الفارغة. dashboard.routes.ts: أضف مسار الرول الجديد للـ mapping بعد إصلاح الـ fallback في المرحلة 0. معايير القبول: كل رقم يساوي نظيره المحسوب يدوياً من بيانات league=professional. أرقام /dashboard/coach و /dashboard/observer و /dashboard/admin لم تتغير. ملاحظة من نهاية المرحلة 3: RoleLandingService فيه case 'proScout' مؤقت بيرجع ['/players']. هذه المرحلة تعدّل نفس الـcase لـ ['/dashboard/proScout'] بدون إضافة case ثاني."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - proScout lands on their own dashboard after login (Priority: P1)

A proScout logs in and, instead of being dropped on the player list (today's temporary landing) or an unauthorized page, is taken straight to a dashboard summarizing their professional-league scouting activity.

**Why this priority**: This closes the last dangling follow-up (DF-001) from Stage 3's navigation work — without it, the role has no home screen and the temporary `/players` landing stays permanent by default.

**Independent Test**: Log in as a proScout user and confirm the browser lands on `/dashboard/proScout` showing that user's own numbers, with no dependency on any other story below.

**Acceptance Scenarios**:

1. **Given** a logged-in proScout, **When** they land on the app root or dashboard root, **Then** they are routed to `/dashboard/proScout`.
2. **Given** a proScout directly navigates to `/dashboard/coach`, `/dashboard/observer`, or `/dashboard/admin`, **When** the route resolves, **Then** access is refused — the guard does not grant entry — and the refusal bounces them to their own landing destination (`/dashboard/proScout`), exactly as a coach refused an admin-only route is bounced to `/dashboard/coach` today. `/unauthorized` is the destination for *unrecognized* roles only, and proScout is no longer one of those.
3. **Given** a signed-in proScout, **When** the sidebar renders, **Then** it shows exactly Dashboard, Players, Profile — in that order — and the Dashboard entry opens the proScout dashboard rather than a refusal.
4. **Given** a coach, an observer, or an administrator, **When** the sidebar renders, **Then** their menu is identical in set and order to what it was before this change.

---

### User Story 2 - proScout sees their scoped activity summary (Priority: P1)

A proScout views counters for the players they can see (professional-league teams + their own unassigned players), upcoming professional-league matches, the latest match results, and their most recent scouting reports — all restricted to their existing data scope.

**Why this priority**: This is the core value of the dashboard — a truthful, scoped snapshot. Without correct scoping this page would leak or misrepresent data the role isn't meant to see, which is the primary risk this stage carries.

**Independent Test**: Seed players/matches/reports across both professional and non-professional teams (and for both this proScout and another), call `GET /dashboard/proScout`, and confirm every number matches a manual count restricted to `league=professional` scope + own unassigned players.

**Acceptance Scenarios**:

1. **Given** a proScout with players in professional-league teams and some unassigned players they created, **When** they view the dashboard, **Then** the player count equals exactly those players (not other proScouts' unassigned players, not non-professional-league players).
2. **Given** professional-league matches scheduled after today and others before today, **When** the dashboard loads, **Then** only future professional-league matches are counted/listed as upcoming, and only past professional-league matches appear as latest results.
3. **Given** scouting reports authored by this proScout and by other users, **When** the dashboard loads, **Then** only this proScout's own recent reports are shown.
4. **Given** a non-professional-league match or a report by a different coach/observer, **When** the dashboard is computed, **Then** neither affects any of this proScout's numbers.

---

### User Story 3 - proScout with no data yet sees a clear empty state (Priority: P2)

A newly-assigned proScout with no players, no matches, and no reports yet opens the dashboard and sees an explicit "nothing yet" state per section instead of blank space, zeros with no context, or an error.

**Why this priority**: New proScouts are the first people to hit this screen (there's no seed data for a brand-new role yet), so a broken or confusing empty experience is a near-certain first impression, not an edge case.

**Independent Test**: Log in as a proScout with zero scoped players/matches/reports and confirm each dashboard section renders a distinct "no data" message rather than erroring or rendering empty containers.

**Acceptance Scenarios**:

1. **Given** a proScout with no scoped players, **When** the dashboard loads, **Then** the player counter card shows `0` — not a blank, a dash, or an error — and it is visibly not the loading skeleton.
2. **Given** a proScout with no upcoming professional-league matches, **When** the dashboard loads, **Then** the upcoming-matches section shows an empty-state message instead of an empty list with no explanation.
3. **Given** a proScout with no reports yet, **When** the dashboard loads, **Then** the recent-reports section shows an empty-state message.

---

### Edge Cases

- A proScout with only unassigned (`team: null`) players they created — no professional-league team players at all — still sees an accurate non-zero player count.
- A professional-league team is soft-deleted after players were assigned to it — those players remain in scope per Stage 2's documented behavior (soft-deleted professional teams still count), so the dashboard's player count must not silently drop them.
- A match is professional-league but the proScout never recorded attendance — it must still be counted since matches are scoped by `league`, not by the proScout's own attendance (Stage 2's `seasonMatchScopeFor`, unlike coach/observer counts, is not attendance-scoped).
- Admin, coach, and observer dashboard responses and their cached values must be byte-for-byte unaffected by this change — this stage only adds a new endpoint/branch, it does not touch the shared cache keys or existing computation functions.
- A proScout is impersonated/queried by an admin the way `/dashboard/admin/:coachId` works for coaches — out of scope for this stage unless explicitly requested; no such route exists for proScout today and none is required by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dashboard endpoint that returns statistics for the logged-in proScout only, following the same request/response shape as the existing coach and observer dashboard endpoints.
- **FR-002**: The player count returned MUST be computed through the existing centralized player data-scope layer (Stage 2) — no new, independently-written scope-equivalent query may be introduced for this purpose.
- **FR-003**: The upcoming-matches and latest-results figures MUST be computed through the existing centralized season-match scope layer (Stage 2), filtered further by date (future vs. past) relative to the request time, without re-deriving the professional-league condition by any other means.
- **FR-004**: The recent-reports figure MUST reflect only scouting reports that are **both** authored by the requesting proScout **and** written on a player inside that proScout's player scope. The two constraints intersect; neither replaces the other. The count and the list MUST be derived from the same filter, so they can never describe different populations.
- **FR-005**: System MUST NOT expose any age-group-related statistic, card, chart, or breakdown on this dashboard.
- **FR-006**: Each of the three **list** sections (upcoming matches, latest results, recent reports) MUST render its own distinct, explicit empty-state message when it has no data — not a blank area, a bare empty container, or an error. The **counter** cards (players, upcoming matches, reports) MUST render the numeral `0`, which is their empty state; they are not required to carry prose. In every case the loading state MUST be visually distinct from the empty state, so "nothing yet" is never mistaken for "still loading".
- **FR-007**: The endpoint MUST be reachable only by users with the proScout role; all other roles receive the existing role-based rejection behavior for a route not assigned to them.
- **FR-008**: The frontend routing configuration MUST add a `/dashboard/proScout` route guarded to the proScout role only, following the same guard pattern as the existing coach/observer/admin dashboard routes.
- **FR-009**: The role-to-landing-page mapping MUST route a logged-in proScout to `/dashboard/proScout` by editing the existing temporary case for this role (introduced in Stage 3) in place — the mapping must retain exactly one entry per role, never two competing entries for the same role.
- **FR-010**: Existing `/dashboard/coach`, `/dashboard/observer`, and `/dashboard/admin` responses (values and caching behavior) MUST remain unchanged by this feature.
- **FR-011**: The dashboard's player, match, and report counts MUST be verifiable byte-for-byte against a manual count restricted to `league=professional` scope (plus the proScout's own unassigned players, per the existing player-scope definition).
- **FR-012**: The proScout role MUST be added to the Dashboard navigation entry's role set, so a proScout sees exactly three menu entries (Dashboard, Players, Profile) in that declaration order. No other navigation entry may gain the role in this feature — My Matches remains withheld until its own stage, and Age Groups is barred permanently.
- **FR-013**: The navigation expectations recorded by the earlier navigation feature (its "exactly two entries" checkpoint and the deferral note that made it a checkpoint rather than a final state) MUST be updated in the same change that adds the third entry, so no document is left asserting a count that the code no longer produces.

### Deferred by Design *(inherited, binding)*

- **DF-001 — discharged by this feature.** The navigation feature deliberately withheld the Dashboard entry from proScout and routed the role to the players page temporarily, recording that the phase creating the proScout dashboard must (a) change that landing destination in place, (b) add the role to the Dashboard entry, and (c) update the entry-count expectation. All three are carried here as FR-009, FR-012, and FR-013.
- **DF-002 — untouched.** The My Matches entry and the matches area remain withheld from proScout; that deferral belongs to the matches stage, not this one. This feature MUST NOT add the role to that entry or open those routes.

### Key Entities

- **ProScout Dashboard Statistics**: A per-user, on-demand summary (not persisted) comprising: total scoped player count, upcoming professional-league matches, latest professional-league match results, and the proScout's own recent scouting reports.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every number shown on a proScout's dashboard is identical to the value obtained by manually counting the corresponding `league=professional`-scoped data (plus own unassigned players) for that same user.
- **SC-002**: Existing coach, observer, and admin dashboard numbers are unchanged before and after this feature ships (regression-verified).
- **SC-003**: A proScout with zero scoped players, matches, or reports sees an explicit "no data yet" message in every relevant section instead of an unexplained empty or erroring view.
- **SC-004**: 100% of proScout logins land on `/dashboard/proScout`, and 100% of proScout attempts to open a route the role is not listed for (another role's dashboard, or any administration area) are **refused** — the guard never grants entry — with the refusal bouncing to `/dashboard/proScout`. Measured by the guard's return value, not by the destination: the destination is a UX detail, "did not grant access" is the security property.
- **SC-005**: No age-group-related figure appears anywhere on the proScout dashboard.
- **SC-006**: A proScout sees exactly 3 menu entries (Dashboard, Players, Profile); administrator, coach, and observer menus are unchanged in both set and order (6, 4, and 4 entries respectively).

## Assumptions

- **The upcoming/past split uses an end-of-today boundary, so a match happening *today* is a result, never an upcoming match.** "Upcoming" means a match date after the end of today; "latest results" means a match date at or before the end of today, most recent first. This mirrors the boundary the coach, observer, and admin dashboards already use, and the reason is recorded there: match dates are stored as UTC midnight (from `<input type="date">`), so comparing against "now" would classify a match happening today as not-yet-played for most of the day and produce a race. A different boundary here would let a match appear in both sections or neither on match day. See `research.md` R7 and `data-model.md` I-6.
- "Recent reports" surfaces a short, most-recent-first list/count of scouting reports **authored by the proScout on players inside their scope** — both axes, intersected. Authorship follows the observer dashboard's convention (the report's `coach` field is the writer regardless of role); the player-scope axis follows the precedent set for `average-ratings`, which narrowed the player axis while keeping the authorship constraint. **Recorded trade-off**: a proScout whose player later leaves the professional league sees their own report count drop. This is the strict direction and is preferred, because the alternative surfaces an out-of-scope player's name on the dashboard. See `research.md` R4 and `data-model.md` I-4. Exact list length follows the existing dashboard pattern's conventions rather than introducing a new pagination scheme.
- No admin-facing "view a specific proScout's dashboard" route (analogous to `/dashboard/admin/:coachId`) is required by this stage; it is not mentioned in the stage's scope and can be added later if requested.
- This dashboard is read-only; it introduces no new write endpoints.
- Realtime push updates (the existing socket-emitter pattern used for admin/coach/observer dashboards) are not required for this stage unless trivially reachable via the existing pattern — the stage's acceptance criteria only concern correctness of numbers and empty states, not live push.
