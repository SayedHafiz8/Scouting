# Feature Specification: ProScout Dashboard Status Cards

**Feature Branch**: `012-proscout-dashboard-status-cards`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "إضافة كاردز Selected/Rejected/Pending لداشبورد proScout (GET /dashboard/proScout). الكاردز تتقسّم على playerScopeFor الحالي (createdBy بس دلوقتي) — نفس المتغير المستخدم في totalPlayers، فمفيش تضارب أرقام. observed تُطوى في pending، بنفس منطق maskObservedForCoach المطبّق بالفعل على proScout. القالب الجاهز موجود في getCoachDashboardData (dashboardController.js) — aggregate + $facet بنفس الشكل."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - proScout sees a status breakdown of their own players (Priority: P1)

A proScout logs into their dashboard and, alongside the total player count they already see, wants to know at a glance how many of the players they scout have been selected, how many are still pending a decision, and how many have been rejected — without opening the full player list and counting manually.

**Why this priority**: This is the entire feature. Without it, there is nothing to test or deploy — it's the one and only user-facing change.

**Independent Test**: Log in as a proScout who has created players with a mix of statuses (`selected`, `pending`, `observed`, `rejected`), load the dashboard, and verify the three cards show the correct counts and that they sum to the total player count already shown.

**Acceptance Scenarios**:

1. **Given** a proScout has created 5 players with statuses selected, selected, pending, observed, rejected, **When** they load their dashboard, **Then** they see Selected: 2, Pending: 2 (pending + observed folded together), Rejected: 1.
2. **Given** a proScout has created 0 players, **When** they load their dashboard, **Then** all three cards show 0, with no error.
3. **Given** proScout A has created 3 players and proScout B (a different proScout) has created 4 different players, **When** proScout A loads their dashboard, **Then** the cards reflect only proScout A's 3 players, not B's.
4. **Given** a proScout previously authored a scouting report on a player who has since passed out of their scope (a different proScout is that player's `createdBy`), **When** they load their dashboard, **Then** that player is not counted in any of the three cards (status cards follow the same player scope as `totalPlayers`, not report authorship).

---

### Edge Cases

- A player status value that is not one of `selected` / `pending` / `observed` / `rejected` (should not occur given the current status enum, but the aggregation must not silently drop or miscount it — every player counted in `totalPlayers` must land in exactly one of the three cards).
- A proScout with players whose statuses are all the same (e.g. all `pending`) — the other two cards must correctly show 0, not be omitted from the response.
- Concurrent creation of a new player by the same proScout between page load and a manual refresh — no consistency guarantee is required beyond "reflects a valid recent state," consistent with the rest of the dashboard (no caching layer, per existing `getProScoutDashboardData` design).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `GET /dashboard/proScout` MUST return three additional counts — `selectedPlayers`, `pendingPlayers`, `rejectedPlayers` — alongside the fields it already returns (`totalPlayers`, `upcomingMatchesCount`, `totalReports`, `upcomingMatches`, `latestResults`, `recentReports`).
- **FR-002**: The three counts MUST be computed over the exact same player scope already used to compute `totalPlayers` for this endpoint (the requesting proScout's own `createdBy` scope) — no broader or narrower query.
- **FR-003**: For every request, `selectedPlayers + pendingPlayers + rejectedPlayers` MUST equal `totalPlayers` in the same response.
- **FR-004**: A player whose status is `observed` MUST be counted within `pendingPlayers`, not reported as a separate status, consistent with the existing "observed folds into pending" treatment already applied elsewhere for this role.
- **FR-005**: A player whose status is `selected` MUST be counted in `selectedPlayers`; `rejected` in `rejectedPlayers`; `pending` in `pendingPlayers`.
- **FR-006**: The status breakdown MUST NOT be computed by an additional, separately-scoped database query — it MUST be derived from the same central player-scope definition used for `totalPlayers`, so the two can never diverge for the same request.
- **FR-007**: The proScout's own dashboard page (frontend) MUST display the three counts as status cards, consistent in presentation with the equivalent cards already shown to coaches.
- **FR-008**: The proScout dashboard MUST NOT display or introduce any card, column, or breakdown related to age groups.
- **FR-009**: Behavior of `GET /dashboard/coach`, `GET /dashboard/observer`, and `GET /dashboard/admin` MUST remain unchanged — none of them gain or lose fields as a result of this feature.

### Key Entities

- **Player status breakdown**: A derived, read-only summary of `Player.status` values (`selected`, `pending`, `observed`, `rejected`) counted within one proScout's own player scope. Not a new persisted entity — computed on read from the existing `Player` collection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A proScout can see how many of their players are selected, pending, and rejected without leaving the dashboard or opening the player list.
- **SC-002**: The three displayed counts always add up to the total player count shown on the same dashboard view — no visible discrepancy under any player status mix.
- **SC-003**: A proScout never sees another proScout's players reflected in their own status counts.
- **SC-004**: Existing dashboard behavior for admin, coach, and observer roles shows zero observable change after this feature ships.

## Assumptions

- The three status cards are additive fields on the existing `GET /dashboard/proScout` response — no new endpoint is introduced.
- "Same player scope as `totalPlayers`" means the current `createdBy`-only scope (post Stage 11 / constitution v1.1.0); if that scope changes in the future, this feature's counts change with it automatically since both are derived from the same central definition.
- No `selectionRate` percentage is required by this feature; if added for visual parity with the coach/admin dashboards, it MUST be computed from `selectedPlayers` / `totalPlayers` and is a nice-to-have, not a blocking requirement.
- No caching is introduced for these counts, consistent with the rest of `getProScoutDashboardData`, which is intentionally uncached because it is per-user scoped data.
