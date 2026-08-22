# Contract: Attend & Status for proScout

**Feature**: `specs/008-proscout-matches-attendance/` | Phase 1

Covers the three mutating operations this stage opens or corrects. `GET /seasonMatches` and
`GET /seasonMatches/{id}` are unchanged (`research.md R1`) and are not repeated here.

## `POST /seasonMatches/{id}/attend`

**Roles**: `coach`, `observer` (unchanged), **`proScout` (added)**

**Middleware chain (new)**: `protect, allowedTo(COACH, OBSERVER, PRO_SCOUT), checkSeasonMatchScope, attendMatch`

`checkSeasonMatchScope` is inserted ahead of the controller for the first time on this route
(`research.md R4`). For coach/observer it is a no-op (its existing `default` branch). For proScout it
requires the match to satisfy `seasonMatchScopeFor` (`league: "professional"`) or the request 403s
before `attendMatch` runs.

| Gate | Grant | Result |
|---|---|---|
| G-1 | proScout, match in professional league, before match day, not cancelled | 200, `attendees` gains caller's id |
| G-2 | proScout, match in **premier** league | **403** (new — `checkSeasonMatchScope`), `attendMatch` never runs |
| G-3 | proScout, match in professional league, on/after match day | 400 (unchanged `isBeforeMatchDay` rule, `research.md R5`) |
| G-4 | proScout, match cancelled | 400 (unchanged) |
| G-5 | coach or observer, any match they could already reach | unchanged — 200 |

## `DELETE /seasonMatches/{id}/attend`

Same shape as `POST`, mirrored:

**Middleware chain (new)**: `protect, allowedTo(COACH, OBSERVER, PRO_SCOUT), checkSeasonMatchScope, unattendMatch`

| Gate | Grant | Result |
|---|---|---|
| G-6 | proScout, match in professional league, before match day | 200, `attendees` loses caller's id |
| G-7 | proScout, match in premier league | 403 (new) |
| G-8 | proScout, on/after match day | 400 (unchanged) |

## `PATCH /seasonMatches/{id}/status`

**Roles**: `coach`, `observer`, `admin` (unchanged), **`proScout` (added)**

**Middleware chain (unchanged shape, proScout added to `allowedTo`)**:
`protect, allowedTo(COACH, OBSERVER, PRO_SCOUT, ADMIN), checkSeasonMatchAttendee, updateStatusValidate, updateMatchStatus`

`checkSeasonMatchAttendee`'s proScout branch is corrected (`research.md R2`) to require **both**
league scope and attendee membership, matching the coach/observer branch's shape.

| Gate | Grant | Result |
|---|---|---|
| G-9 | proScout, attendee of the match, match in professional league, today is match day, `status: "completed"` | 200, `status`/`result` saved (`updateMatchStatus` unchanged, `research.md R3`) |
| G-10 | proScout, attendee, professional league, **not** today | 400 (unchanged same-day rule) |
| G-11 | proScout, professional league, **not** an attendee | **403** (corrected — was unconditional 403 before this stage too, but for the wrong reason: R2) |
| G-12 | proScout, attendee, match in **premier** league (hypothetically added as attendee out-of-band) | **403** (scope leg of the corrected branch) |
| G-13 | coach/observer/admin, any case | unchanged |

## Negative cases carried over unchanged (Principle III)

- Any role not in a route's `allowedTo` (e.g. `proScout` on `PATCH /seasonMatches/{id}` general
  update, or `DELETE /seasonMatches/{id}`) — still refused, untouched by this stage.
- Coach/observer attend/status behavior — byte-identical; no branch in any touched file changes for
  them (`research.md R2, R4`).
