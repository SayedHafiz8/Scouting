# Feature Specification: proScout Name on the Professional League Lens

**Feature Branch**: `010-professional-lens-creator`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "4d — show the responsible proScout's name on each player in the admin's Professional League lens (Stage 4c). Scope: GET /players list endpoint only, admin only. proScout does not see this field even on their own players — their own scope already confines them to their own players, so the field adds nothing for them. No security mask is required (this is plain display of an existing, already-populated field, not a new client-filterable query key)."

---

## Why this feature exists *(read this first)*

This closes a backlog item recorded at the end of Stage 4c (`specs/006-admin-professional-lens/`)
and repeated at the end of Stage 6 (`specs/008-proscout-matches-attendance/`). It was deliberately
deferred out of both stages rather than folded in, because re-opening a closed stage for an
unplanned addition would have meant re-running its full quality gates for something with no spec of
its own.

`Player.createdBy` has existed since Stage 2 (`specs/003-proscout-data-scope/`) and is populated on
every player, of every role, at creation time. Verified directly against the current codebase before
writing this spec: **no endpoint populates or returns it today** — not `GET /players`, not
`GET /players/:id`. This feature opens exactly one of those two doors.

**Why `GET /players` and not `GET /players/:id`**: the Professional League lens (Stage 4c) is a
flat-list view reachable only from the players list page — there is no lens-specific element or
behavior on the player detail page today. Extending this to the detail page is a separate,
deliberately out-of-scope decision for a future iteration.

**Why admin only, and not also the proScout who created the player**: the admin is the only role
that currently lacks a way to tell, from the list, who is responsible for a given professional
player. A `proScout` viewing this same list already sees only players within their own scope
(Stage 2's `playerScopeFor`) — showing them their own name on every row of a list that is entirely
theirs states nothing they do not already know from being logged in as themselves. This was
confirmed as a deliberate final decision, not a default: the field is admin-only.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The admin sees who is responsible for each professional player (Priority: P1)

An admin activates the Professional League chip on the players page. Next to each player in the
resulting flat list, the admin can see the name of the `proScout` who created that player.

**Why this priority**: this is the entire point of the feature. Without it, the admin can reach
professional players (Stage 4c) but still cannot tell them apart by who is accountable for each one
— a gap that becomes visible only after Stage 4c is used, not before.

**Independent Test**: as a `proScout`, create a professional player. As a second `proScout`, create
another. Sign in as admin, activate the Professional League chip, and confirm each player's row
shows the correct creator's name, matching who actually created it.

**Acceptance Scenarios**:

1. **Given** an admin with the Professional League lens active, **When** the list of professional
   players loads, **Then** each player shows the name of the `proScout` who created it.
2. **Given** two professional players created by two different `proScout` users, **When** the admin
   views the lens, **Then** the two players show two different, correct names — not the same name,
   not swapped.
3. **Given** a professional player whose creator name is shown, **When** the admin looks at any other
   information already on that row (from Stage 4c), **Then** nothing else about the row has changed.

---

### User Story 2 — A player with no recorded creator degrades gracefully (Priority: P2)

A small number of players may lack a `createdBy` value (pre-Stage-2 legacy data, or the documented
orphan case where a player has neither a coach nor a creator). For these, the admin sees a clear
absence of a name rather than an error or a broken row.

**Why this priority**: P2 because the lens is fully usable without hitting this case, but the case is
known to exist in the data (Stage 2's backfill script explicitly documents unattributable orphans)
and must not break the page when it occurs.

**Independent Test**: with a player that has no `createdBy`, load the lens as admin and confirm the
row renders normally with an empty/placeholder indication instead of a name, and the rest of the list
still loads.

**Acceptance Scenarios**:

1. **Given** a professional player with no `createdBy` value, **When** the admin views the lens,
   **Then** that player's row renders without error and shows no name (or an explicit placeholder),
   while every other row is unaffected.

---

### Edge Cases

- **The creator user no longer exists or was deactivated.** The row must still render; the name
  shown must reflect whatever the reference currently resolves to (a soft-deleted user's name, if the
  reference still resolves) without throwing.
- **A non-admin role requests `GET /players` directly** (bypassing the UI). Their response must be
  byte-identical to today's — the new field must not appear for them at all, not even as `null`,
  since the query changes shape only for admins.
- **`GET /players/:id`, for any role, including admin.** Must be completely unaffected — no field
  added, no query change — proving the scope boundary held.
- **The lens is inactive** (admin viewing the ordinary age-group grid or any other admin players
  view). The field's presence or absence outside the lens is not restricted by this feature one way
  or the other, since `GET /players` is one endpoint shared by every admin view; what matters is that
  every other view's existing content is unchanged (see FR-006).

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For an admin caller, `GET /players` responses MUST include the name of the user
  referenced by each player's existing `createdBy` field.
- **FR-002**: The value exposed MUST be the creator's name only — no email, role, or other user
  attribute.
- **FR-003**: A player with no `createdBy` value MUST be represented without error, in a way the
  admin players page can render as an explicit absence.
- **FR-004**: For any non-admin caller of `GET /players` (`coach`, `observer`, `proScout`), the
  response MUST NOT include this field or the underlying lookup — their response shape and content
  MUST be unchanged from before this feature.
- **FR-005**: `GET /players/:id` MUST NOT be changed by this feature, for any role, including admin —
  proving the scope stated above holds.
- **FR-006**: Every admin view of `GET /players` other than the Professional League lens (the
  age-group grid, other flat views, other filters) MUST continue to return the same set of players
  and the same values for every field that existed before this feature; only the new field is added.
- **FR-007**: The admin's Professional League lens (Stage 4c) MUST display the creator's name
  alongside each player in the flat list.
- **FR-008**: No new client-suppliable query filter is introduced by this feature. This is a display
  addition only; filtering players by creator is out of scope.

### Key Entities

- **Player** — already carries `createdBy` (a reference to the `User` who created it), set at
  creation and unchanged by this feature. This feature makes that existing, already-populated
  reference visible to the admin on one existing endpoint. No field is added to the data model.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin viewing the Professional League lens can identify the responsible `proScout`
  for every player in the list without leaving the page or performing any additional lookup.
- **SC-002**: A player with no recorded creator is visibly distinguishable from one with a creator,
  with zero page errors or broken rows.
- **SC-003**: Every other role's `GET /players` response, and every role's `GET /players/:id`
  response including admin's, is **byte-identical** to pre-feature behavior — proven by tests that
  fail if it changes, not by review.
- **SC-004**: Existing regression suites covering Stage 2 (`proScoutDataScope.test.js`) and Stage 4c
  (`adminProfessionalLens.test.js`) pass with unchanged counts, and `tests/isolation.test.js` passes
  unmodified.

---

## Constitutional position

| Item | Position |
|---|---|
| **Principle I** — server-side first | The name is attached server-side, gated on the caller's role. The UI displays what the server sends; it enforces nothing on its own. |
| **Principle II** — deny by default | No new access is granted. `createdBy` already existed on every player for every role; this feature only resolves it to a name, and only in the one response an admin already receives in full. |
| **Principle III** — no behavior change (NON-NEGOTIABLE) | FR-004, FR-005, FR-006, SC-003. `tests/isolation.test.js` MUST pass unmodified. Non-admin roles and `GET /players/:id` (all roles) see zero change. |
| **Principle IV** — single central scope layer | Not touched. This feature adds a `populate` inside the existing `getAll` controller for the admin branch; it does not add, modify, or bypass `playerScopeFor` or `ApiFeature`. |
| **Principle V** — independently deployable | Self-contained. Depends only on Stage 2 (`createdBy` existing) and Stage 4c (the lens it enhances) being merged. |
| **Principle VI** — positive + negative per permission | Grants no new permission or endpoint. The negative case (non-admin gets nothing new) is the test this stage owes. |
| **Principle VII** — single source of truth for role names | No new role. The admin check uses the existing role constant. |

**No constitutional amendment is required for this feature.**

---

## Assumptions

- **`createdBy` is trustworthy as already established.** Locked against client input since Stage 2
  (`lockField("createdBy")`); this feature re-displays it and re-verifies nothing about that lock.
- **No mask is required.** Unlike `PLAYER_ADMIN_ONLY_LENSES` (`coach`/`observer`/`observers`), which
  exists to stop a non-admin role from using a query parameter as an oracle to discover another
  user's identity, this feature adds no new client-suppliable filter — it is read-only display,
  gated entirely server-side on `req.user.role === admin`. The precedent that made a mask necessary
  does not apply here.
- **A `proScout`'s own name on their own players has no display value for them and is intentionally
  withheld**, per explicit decision — not because it would leak anything (their own scope already
  limits them to their own players), but because it adds nothing to show it.
- **The Professional League lens is the only surface for this feature.** Any other page or export
  that also renders `GET /players` results will incidentally gain the field for admins if it reuses
  the same response; no other page is in scope for adding new UI to display it.
- **Out of scope**: `GET /players/:id` / the player detail page; showing this to `proScout`, `coach`,
  or `observer`; any new filter or sort on `createdBy`; any change to how `createdBy` is set or
  backfilled.

---

## Dependencies

- **Stage 2** (`specs/003-proscout-data-scope/`) — introduced and populates `Player.createdBy`.
- **Stage 4c** (`specs/006-admin-professional-lens/`) — the Professional League lens this feature
  adds the name display to.

---

## Implementation note (discovered during `/speckit-implement`)

The premise verified before writing this spec — "no endpoint populates or returns `createdBy`
today" — was imprecise. Neither `getAll` nor `getSpecific` in `playerController.js` has ever used
`.select()` to exclude any field, so `createdBy` was already present in **every** JSON response, for
**every** role, as a raw `ObjectId` string, since Stage 2. What was actually true, and what this
feature changes, is narrower: no endpoint ever **populated** it to a name.

This does not change the feature's scope or value — an admin previously saw a useless raw id and now
sees a name, which is the entire point — but it changes what "unaffected" (FR-004, FR-005) means in
practice and how it must be tested:

- **FR-004 and FR-005** are satisfied by `createdBy` remaining the same bare `ObjectId` string it was
  before this feature, for every non-admin role and for `GET /players/:id` (all roles including
  admin) — not by the key disappearing from the response. A test asserting the key is entirely
  absent will pass vacuously for any player where `createdBy` happens to be unset, and only exposes
  the real contract when checked against a player where the field **is** set — this is how the
  discovery surfaced (`Backend/tests/roles/adminProfessionalLens.test.js`, initial T008/T009 drafts).
- The **admin-only masking assumption** in this document's Assumptions section ("no mask is
  required... this is read-only display, gated entirely server-side") still holds. The correction is
  about the *baseline* being masked from, not about any new exposure — the raw id string was already
  as visible to non-admin roles before this feature as it is after.
