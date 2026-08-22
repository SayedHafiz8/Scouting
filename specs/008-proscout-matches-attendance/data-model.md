# Data Model: Pro Scout Matches & Attendance

**Feature**: `specs/008-proscout-matches-attendance/` | Phase 1

No schema change, no migration, no new index. This stage changes **who can reach existing fields
through existing mutations**, not the shape of any document.

## Entities touched (no structural change)

### SeasonMatch (`Backend/models/seasonMatchModel.js`) — unchanged schema

Relevant existing fields, all already present:

| Field | Type | Relevance to this stage |
|---|---|---|
| `league` | `'premier' \| 'professional'` | Scope key (Constraint C-4). Unchanged. |
| `ageGroup` | ObjectId → AgeGroup, `required: true` | Stays required and populated server-side; suppressed from proScout's UI only (Constitution C-4: "الاستثناء الوحيد المسموح" does not touch `SeasonMatch`, only `Player`). |
| `matchDate` | Date (UTC midnight) | Drives both the pre-match-day attendance window (`isBeforeMatchDay`) and the match-day-only result window (`updateMatchStatus`). Unchanged logic, now reachable by a new role. |
| `status` | `'scheduled' \| 'completed' \| 'postponed' \| 'cancelled'` | Writable by proScout via `/status` under the same constraint as coach/observer. |
| `result` | `{ homeScore, awayScore }` | Writable alongside `status: 'completed'`. Unchanged shape. |
| `attendees` | `ObjectId[] → User` | proScout can now `$addToSet`/`$pull` its own id here, same as coach/observer. |

### Attendance — a relationship, not a new entity

"Attendance" is the `attendees` array on `SeasonMatch`; there is no separate collection. The
distinction the spec draws between "attendee" and "match-result authority" is enforced procedurally
(you must be in `attendees` **and** it must be the match's own day to call `/status`), not by a
separate data structure — consistent with how coach/observer already work.

## Invariants this stage MUST hold (and tests that pin them)

- **I-1**: `checkSeasonMatchAttendee`'s proScout branch grants only when **both** league scope
  (`seasonMatchScopeFor`) and attendee membership (`attendees` contains `req.user._id`) hold —
  neither alone is sufficient. See [research.md R2](./research.md).
- **I-2**: `checkSeasonMatchScope` (unmodified) is the single gate for "can this proScout touch this
  match by ID at all," reused verbatim on the attend routes — not reimplemented. See
  [research.md R4](./research.md).
- **I-3**: The same-day result-entry window and the before-match-day attendance window are both
  role-generic (`role !== ADMIN`) and require no new branch for proScout. See
  [research.md R3](./research.md), [R5](./research.md).
- **I-4**: `ageGroup` remains present and populated in every API response reaching this feature's
  code paths (`GET`, attend, status) — this stage suppresses it in the Angular template only, never
  strips or nulls it server-side. Verified by asserting the field's presence in the same response body
  whose UI is asserted not to render it.
- **I-5**: No existing `allowedTo` argument list for coach, observer, or admin changes on any route
  this stage touches (`/attend`, `/status`, `/seasonMatches`, `/seasonMatches/:id`).
