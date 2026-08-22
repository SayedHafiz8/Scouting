# Phase 1 Data Model — ProScout Dashboard (Stage 5)

**Feature**: `specs/007-proscout-dashboard/` | **Date**: 2026-08-22

## Schema changes

**None.** This feature adds no field, no collection, no index, and no migration. It is a read-only
projection over `Player`, `SeasonMatch`, and `ScoutingReport` as they exist after Stage 4c.

That is a deliberate outcome, not an omission: everything the dashboard needs already exists —
`Player.createdBy` (Stage 2), `Player.isProfessional` (Stage 4b), `SeasonMatch.league`, and
`ScoutingReport.coach` as the author reference.

---

## Derived entity: ProScout Dashboard Statistics

Computed per request, never persisted, never cached ([research.md R2](./research.md)).

| Field | Type | Meaning | Source |
|---|---|---|---|
| `totalPlayers` | integer | Players inside the role's player scope | `Player` ∩ `playerScopeFor` |
| `upcomingMatchesCount` | integer | Professional-league matches not yet played (uncapped) | `SeasonMatch` ∩ `seasonMatchScopeFor` ∩ `matchDate > endOfToday` |
| `totalReports` | integer | Reports authored by this user on in-scope players | `ScoutingReport` ∩ author ∩ scoped players |
| `upcomingMatches` | array ≤ 5 | Soonest first | same filter as `upcomingMatchesCount`, `sort matchDate: 1` |
| `latestResults` | array ≤ 5 | Most recent first | `SeasonMatch` ∩ scope ∩ `matchDate <= endOfToday`, `sort matchDate: -1` |
| `recentReports` | array ≤ 5 | Most recent first | same filter as `totalReports`, `sort matchDate: -1` |

### Element shapes

**`upcomingMatches[]` / `latestResults[]`** — identical shape; `result` is populated only for
matches that have one.

| Field | Type | Notes |
|---|---|---|
| `_id` | id | |
| `matchDate` | date-time | |
| `homeTeam` | `{ _id, name, clubName }` | |
| `awayTeam` | `{ _id, name, clubName }` | |
| `venue` | string \| null | |
| `status` | enum | `scheduled` / `completed` / `cancelled` / `postponed` |
| `result` | `{ homeScore, awayScore }` \| null | absent until entered |

**`recentReports[]`**

| Field | Type | Notes |
|---|---|---|
| `_id` | id | |
| `player` | `{ _id, name, position }` | |
| `matchDate` | date-time | |
| `overallRating` | number | |

### Fields deliberately excluded

- **`ageGroup`** — on both match elements. FR-005 / Constraint C-4.
  ⚠️ `SeasonMatch` has a `pre(/^find/)` hook that auto-populates `ageGroup`, `homeTeam`, `awayTeam`,
  and `attendees` on **every** `find`. The field therefore arrives unless it is explicitly projected
  away. This is an active removal, not an omission — see [research.md R6](./research.md).
- **`attendees`** — not part of any stated indicator, and it names other users. Excluded for the
  same reason `PLAYER_ADMIN_ONLY_LENSES` exists.
- **`observers`, `coach`** on any player reference — the role is already masked from these on the
  players page (`maskObservedForCoach` applies to proScout since Stage 2); a dashboard must not
  become the side door around a mask the list view enforces.

---

## Scope invariants

These are the properties the tests exist to hold. Each is a restatement of the Stage 2 contract,
not a new rule.

- **I-1** — Every figure derives from `playerScopeFor(req)` or `seasonMatchScopeFor(req)`. No
  literal `"professional"`, and no re-derivation of the professional-team id set, appears in the
  dashboard controller. (Principle IV)
- **I-2** — Every composition of a scope with an additional condition is `{ $and: [ scope, … ] }`.
  No spread of a scope object anywhere in this feature. (Principle IV; [research.md R1](./research.md))
- **I-3** — Both scope functions return `{}` for admin, coach, and observer, and the new endpoint is
  unreachable by them regardless, so no existing role's query text changes. (Principle III)
- **I-4** — `totalReports` and `recentReports` share one filter object; the count can never describe
  a different population than the list. ([research.md R4](./research.md))
- **I-5** — `upcomingMatchesCount` is computed by a `countDocuments` over the uncapped filter, never
  from `upcomingMatches.length`. The list is capped at 5; the card must not silently cap the number.
- **I-6** — The upcoming/past boundary is end-of-today, matching the three existing dashboards.
  A match dated today is a **result**, never an upcoming match, and never both.
  ([research.md R7](./research.md))
- **I-7** — No response field is named `ageGroup` or contains an age-group document, at any nesting
  depth. Asserted against the serialized response body, not against source code.

---

## State transitions

None. The feature is read-only and introduces no write path, no status field, and no lifecycle.
