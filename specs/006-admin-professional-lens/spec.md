# Feature Specification: Admin Lens for Professional-League Players

**Feature Branch**: `006-admin-professional-lens`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "Stage 4c — admin lens for professional players. Add `?isProfessional=true` filter to `PLAYER_FILTERS` and a «دوري المحترفين» / «Professional League» chip next to the existing «No coach» chip on the admin players page, opening flat view with search, sort and pagination working exactly as any other view. This is a gap-fix for a regression introduced by Stage 4b (professional players carry no `ageGroup`, so they belong to no age-group card and the admin has no intentional route to them), not part of the original scout-pro plan."

---

## Why this stage exists *(read this first)*

This is **not** a planned stage. `docs/scout-pro-plan-v2.md` never contained it. It exists because
**Stage 4b introduced a regression in the admin's experience that Stage 4b did not notice**, and this
document records that honestly so a future reader does not mistake it for scope creep.

**What Stage 4b changed**: players created by a `proScout` are flagged `isProfessional: true` and, by
the constitution's C-4 exception (v1.0.2), carry **no age group at all**.

**What that broke**: the admin's players page opens on a grid of age-group cards. A player with no age
group belongs to no card. The consequence was measured against a live in-memory stack, with one
professional player and one youth player present:

| What the admin sees | Value |
|---|---|
| Total on the page header | **2** |
| Sum of all age-group cards | **1** |
| Difference, unexplained and unreachable | **1** |

**Three separate failures, all in the same gap:**

1. **No intentional route to the data.** No card contains professional players. There is no search
   box in the grid view at all — the keyword field only renders once a card is opened or a flat view
   is active. The admin cannot navigate to these players.
2. **A number that lies.** The header total counts players the page then refuses to show, and offers
   no explanation for the difference.
3. **The one route that does work, works by accident.** The "No coach" chip finds professional
   players only because Stage 4 chose to leave `Player.coach` unset for proScout-created players
   (research R5). That was an ownership-semantics decision, not a navigation decision. Any future
   change that assigns a coach to these players removes the admin's last route to them **silently** —
   no error, no empty state, just players that exist, are counted, and cannot be opened.

The scope of this stage is exactly those three failures and nothing else.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The admin finds professional players on purpose (Priority: P1)

An admin opens the players page and sees a filter chip labelled **Professional League** beside the
existing **No coach** chip. Activating it replaces the age-group grid with a flat list of every
professional-league player in the system. The chip stays visibly active, and deactivating it returns
the admin to the grid exactly as before.

**Why this priority**: this is the entire point of the stage. Without it the admin has no
deliberate route to a class of players the system already stores, counts, and permits them to edit.

**Independent Test**: create a professional player and a youth player as the respective roles, sign
in as an admin, activate the chip, and confirm the list contains the professional player and not the
youth player. Delivers the missing route on its own, with no other story implemented.

**Acceptance Scenarios**:

1. **Given** an admin on the players page with the grid visible, **When** they activate the
   Professional League chip, **Then** the grid is replaced by a flat list containing every
   professional player and no youth player.
2. **Given** the chip is active, **When** the admin deactivates it, **Then** the age-group grid
   returns and shows the same cards and counts it showed before the chip was ever touched.
3. **Given** an admin with the chip active, **When** they open a player from the list, **Then** the
   player detail page opens normally, with no behavior specific to this lens.
4. **Given** the **No coach** chip is active, **When** the admin activates the Professional League
   chip, **Then** the view starts clean — the No coach condition, the keyword and the position
   filter are all cleared, and only the professional condition applies.
5. **Given** the Professional League chip is active, **When** the admin activates the **No coach**
   chip, **Then** the view starts clean the other way — the professional condition, the keyword and
   the position filter are all cleared, and only the No coach condition applies. Both chips clear on
   activation, symmetrically (`plan.md` **PC-1**, owner-directed change to the existing chip).
6. **Given** the lens is active, **When** the admin uses the team filter, **Then** the choices
   offered are professional-league teams only.

---

### User Story 2 — Search, sort and pagination behave identically in this lens (Priority: P1)

With the Professional League lens active, the admin uses the same keyword search, the same sort
control and the same pagination as in any other flat view. Nothing about this lens is a special case.

**Why this priority**: equal to P1 because a list of professional players the admin cannot search is
only half a fix — the absence of a search box in the grid view is one of the three failures this
stage exists to close. A lens that reintroduces that limitation solves nothing.

**Independent Test**: with more players than fit one page, confirm keyword search narrows results,
sorting reorders them, page 2 is reachable, and every result on every page is still a professional
player.

**Acceptance Scenarios**:

1. **Given** the lens is active with several professional players, **When** the admin types a keyword
   matching one of them, **Then** only matching professional players are listed.
2. **Given** the lens is active, **When** the admin sorts the list, **Then** the order changes and
   the membership of the list does not.
3. **Given** more professional players than one page holds, **When** the admin moves to page 2,
   **Then** page 2 contains only professional players and the page indicator reflects the true total.
4. **Given** the lens is active with a keyword applied, **When** the admin deactivates the lens,
   **Then** the keyword is not silently carried into a view where it means something different.

---

### User Story 3 — The header total stops lying (Priority: P2)

On the age-group grid, the admin can see how many players are missing from the cards and why. The
count of professional players is visible on the chip itself, so the difference between the header
total and the sum of the cards is accounted for rather than unexplained.

**Why this priority**: P2 because the lens is usable without it — but leaving it out means shipping a
page that shows an admin a number it will not honour. That is a correctness problem, not a polish
problem, and it is one of the three failures named above.

**Independent Test**: with N professional players and M youth players present, confirm the header
total reads N+M, the cards sum to M, and the chip carries N — so the arithmetic closes on screen.

**Acceptance Scenarios**:

1. **Given** professional players exist, **When** the admin views the age-group grid, **Then** the
   Professional League chip shows their count, and header total = sum of cards + chip count.
2. **Given** no professional players exist, **When** the admin views the grid, **Then** the chip
   shows no count (or zero) and does not imply hidden data.
3. **Given** a status filter is active, **When** the counts load, **Then** the chip count reflects
   the same filter as the card counts, so the arithmetic still closes.

---

### Edge Cases

- **No professional players exist yet.** The lens must render a normal empty state, not an error and
  not a spinner that never resolves.
- **A player exists with no age group that is *not* professional** (legacy or malformed data). Such a
  player must not be counted as professional. The count must be derived from the professional flag
  itself, never inferred by subtracting card sums from the total — subtraction would quietly
  reclassify bad data as professional and hide it a second way.
- **A non-admin sends the filter directly to the API.** A coach or observer passing the filter by
  hand must receive only their own players (an empty list, since they own no professional players) —
  never a widened result. The filter must not become a way around ownership scope.
- **A `proScout` sends the filter.** Their scope is already entirely professional; the filter must be
  a no-op, not an error and not an escape hatch.
- **Both chips active, then one removed.** Removing one condition must leave the other intact, with
  no full page reset.
- **Deep link / refresh.** An admin who bookmarks or refreshes the URL while the lens is active must
  land back in the same lens, not on the grid.

---

## Requirements *(mandatory)*

### Functional Requirements

**Data access**

- **FR-001**: The players list endpoint MUST accept a professional/non-professional filter as an
  ordinary, whitelisted list filter.
- **FR-002**: That filter MUST be combined with the caller's ownership scope by AND, applied after
  the scope, and MUST NOT be able to widen, replace, or bypass it for any role.
- **FR-003**: A non-admin who supplies the filter MUST receive results still confined to their own
  scope. The filter MUST NOT be a privilege, an oracle, or a means of discovering the existence of
  players outside the caller's scope.
- **FR-004**: Search, sort, pagination and every other existing list filter MUST work with this
  filter applied, using the same code path as every other list request — no parallel query builder.
- **FR-005**: The player counts endpoint MUST report the number of professional players within the
  caller's scope as its own explicit value, derived from the professional flag.
- **FR-006**: FR-005's value MUST honour the same status/coach/observer conditions already applied to
  the age-group counts in the same response, so the two are always directly comparable.

**Admin interface**

- **FR-007**: The players page MUST offer the admin a **Professional League** chip adjacent to the
  existing **No coach** chip, following that chip's established interaction pattern.
- **FR-008**: Activating the chip MUST show a flat player list rather than the age-group grid.
- **FR-009**: The chip's active state MUST be reflected in the page URL, so the view survives refresh
  and can be linked to.
- **FR-010**: The chip MUST be shown to admins only. It MUST NOT appear for coach or observer, and
  MUST NOT appear for `proScout` (whose entire view is already professional, making the chip a
  no-op control that implies a distinction the role does not have).
- **FR-011**: The chip MUST display the count from FR-005 while the age-group grid is visible, so the
  difference between the header total and the sum of the cards is visibly accounted for.
- **FR-012**: The chip's label MUST be available in both English and Arabic.
- **FR-013**: Activating the chip MUST start the view clean: every other active filter — keyword,
  position, status, the **No coach** condition — is cleared, and only the professional condition
  applies. Deactivating it MUST **likewise** return the view to that same clean state (grid visible,
  keyword/position/status all cleared) — not merely remove the professional condition while leaving
  other filters as they were. This is stricter than a plain toggle, and is stated explicitly because
  nothing else in this document implies it.
- **FR-013a**: The **No coach** chip MUST be changed to match: both activating and deactivating it
  MUST clear every other active filter (keyword, position, status, the Professional League
  condition), exactly as FR-013 requires for its own chip. Both chips behave identically on both
  transitions, symmetrically. This is a deliberate, owner-directed change to an existing control —
  `plan.md` **PC-1** — not a side effect, and it is the one behavior change in this stage that is not
  scoped to the new filter itself.
- **FR-013b**: While the lens is active, the admin MUST be offered a team filter whose choices are
  professional-league teams only. It MUST NOT appear outside this lens, and it is a convenience over
  the filter of FR-001 — never the thing that confines the result (Principle I).

**Non-regression**

- **FR-014**: For admin, coach and observer, every existing players view MUST return the same count
  and the same content as before this change when the new filter is absent — proven by tests that
  fail if it changes, not by review.
- **FR-015**: The `proScout` experience MUST be unchanged by this stage. This stage adds an admin
  lens; it grants nothing and removes nothing for `proScout`.
- **FR-016**: The masks that already apply to list responses (`observed` shown as `pending`, hidden
  observer assignments, hidden coach for observers) MUST continue to apply unchanged inside this
  lens.

### Key Entities

- **Player** — already carries the professional flag, introduced by Stage 4b and set by the server
  from the creating user's role. **This stage adds no field and changes no schema.** It only makes an
  existing, already-populated flag filterable and countable.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can reach any professional player from the players page in **at most two
  interactions** (activate the chip, then click the player) without typing a URL by hand. Today this
  is impossible through any intentional route.
- **SC-002**: On the age-group grid, **header total = sum of card counts + professional count**, with
  all three visible on the same screen. Today the difference is unexplained.
- **SC-003**: The admin can find a professional player **by name**, from a page where no name search
  currently exists for them.
- **SC-004**: Removing the accidental route — assigning a coach to every professional player — leaves
  every one of them still reachable. This is the regression-proofing test: it must pass, proving the
  admin no longer depends on the "No coach" side effect.
- **SC-005**: Result counts and content for admin, coach and observer on all existing player views
  are **byte-identical** to the pre-change behavior when the new filter is not supplied.
- **SC-006**: A coach or observer supplying the filter by hand receives **only their own players**,
  and cannot distinguish "no professional players exist" from "professional players exist but are not
  mine".

---

## Constitutional position

| Item | Position |
|---|---|
| **Principle I** — server-side first | The filter is enforced in the query layer. The chip is a reflection of it. Hiding the chip from non-admins is **not** the access control; FR-003 is. |
| **Principle II** — deny by default | The filter grants no new access. It narrows an existing, already-scoped result set. No role can see a player through this filter that it could not already see. |
| **Principle III** — no behavior change (NON-NEGOTIABLE) | FR-014, FR-015, SC-005. `tests/isolation.test.js` MUST pass **unmodified**. FR-013a changes the **No coach** chip's client-side navigation (which query params a click clears) — not the data an existing role receives from any endpoint, and not a scope, ownership, or mask. Principle III binds the latter; see `plan.md` PC-1 for why the former is out of its scope. |
| **Principle IV** — single central scope layer | The scope layer is **not modified**. The filter joins the existing whitelist and is merged by the existing precedence rule (client query < route param < ownership scope). No hand-written condition in any controller. |
| **Principle V** — independently deployable | Self-contained. Depends on Stage 4b being merged (the flag must exist); depends on nothing after it. |
| **Principle VI** — positive + negative per permission | This stage grants **no new permission**, so the endpoint inventory is unchanged from Stage 4. It still owes the negative tests in FR-003 / SC-006. |
| **Principle VII** — single source of truth for role names | No new role. Role checks use the existing constant. |
| **C-4** | Relied upon, unchanged. This stage is downstream of the v1.0.2 exception — it makes the consequence of that exception visible to the admin. It does not extend, narrow, or reinterpret the exception. |
| **C-1, C-2, C-3, C-5** | Not touched. |

**No constitutional amendment is required for this stage.**

---

## Assumptions

- **The professional flag is trustworthy.** It is server-assigned and locked against client input on
  both create and update (constitution C-4, v1.0.2). This stage relies on that and does not re-verify
  it beyond a test asserting the lock still holds.
- **The filter is safe to expose to every role rather than restricting it to admins server-side.**
  It reveals no other user's identity — unlike the coach/observer lenses, which are admin-only
  precisely because they do. Combined with ownership scope, a non-admin using it can only ever narrow
  their own results. FR-003 and SC-006 are the tests that hold this assumption to account; if either
  fails, the filter must become an admin-only lens instead.
- **The professional count is derived from the flag, not by subtraction.** Deriving it as
  `total − Σ cards` would be cheaper and needs no server change, but it would silently label any
  legacy player with a missing age group as "professional". Named as an edge case above, and rejected.
- **The chip belongs on the players page, not the age-groups page.** Professional players have no age
  group by design; putting a card for them in a grid titled "age groups" would assert a category
  membership the constitution's C-4 exception explicitly denies.
- **`proScout` does not get the chip.** Everything in that role's scope is already professional.
- **No backfill.** Every existing player already carries the flag with its correct value —
  Stage 4b's default (`false`) is exactly the youth behavior all pre-existing players had.
- **Out of scope**: any change to how professional players are created, scoped, owned, or masked; any
  change to the age-groups page; any dashboard for `proScout` (that is Stage 5, DF-001); and closing
  `TODO(AGES_UNAUTHENTICATED_READ)` (C-3), which remains open.

---

## Dependencies

- **Stage 4b** (`specs/005-proscout-players-write/`) must be merged — it introduced the flag this
  stage filters on.
- **Constitution v1.0.2** — the C-4 exception that removed `ageGroup` from professional players is
  the direct cause of the gap this stage closes. Per Governance, that amendment is a separate PR
  touching only `.specify/memory/constitution.md`; this stage assumes it is merged.
