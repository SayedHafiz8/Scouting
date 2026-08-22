# Phase 1 — Data Model: proScout Players Page & Write Access

**Feature**: `specs/005-proscout-players-write/` | **Date**: 2026-08-21

**One schema field, no migration.** Stage 4 itself added nothing; **Stage 4b** (added after the
stage, on owner request — professional players are adults) adds a single server-set boolean,
`Player.isProfessional`, defaulting to `false`. No index and no backfill: existing players default
to `false`, which is exactly the youth behavior they already had. This document records *how
existing fields are read and written* by the new role, and which invariants must not break.

---

## Player (`Backend/models/playedModel.js`)

| Field | Type | Role of this field in Stage 4 |
|---|---|---|
| `team` | `ObjectId → Team`, `default: null` | Primary scope axis. On write, constrained to `league: "professional"` by `teamExistsInScope`. |
| `createdBy` | `ObjectId → User`, optional | Attribution. Set from the token on `POST /players` for **every** role. Second scope axis, read only when `team` is null. Locked against client input by `lockField("createdBy")`. |
| `coach` | `ObjectId → User`, optional | Ownership by a **coach**. **Left unset when the creator is a proScout** (research R5). Never read by proScout scope. |
| `teamName` | `String`, nullable | Free-text alternative to `team`, mutually exclusive with it. **Scope-invisible** — see invariant I-3. |
| `ageGroup` | `ObjectId → AgeGroup` | Derived server-side from `dateOfBirth` **for youth players only**. Left unset for professional players (Stage 4b). Never written by any client. |
| `isProfessional` | `Boolean`, default `false` | **Stage 4b.** Set in `create` from the creator's role (`true` for proScout). Selects the birth-year window (1996–2019 vs 2007–2019) and whether `ageGroup` is derived at all. Locked against client input on create and update. |
| `observers` | `ObjectId[] → User` | Masked out of every proScout response. Writable only by admin. |
| `status` | enum | `"observed"` renders as `"pending"` for proScout, and `?status=observed` is dropped from its queries. |
| `searchTokens` | `String[]`, `select: false` | Derived. Backs FR-004's search within scope. |

### Scope expression (unchanged, `services/scope.js:82`)

```js
{ $and: [ { $or: [
    { team:  { $in: <ids of league:"professional" teams> } },
    { team:  null, createdBy: <req.user._id> },
] } ] }
```

The `$and` wrapper is load-bearing and must not be unwrapped — see `research.md` R12 of Stage 2.

---

## ScoutingReport (`Backend/models/scoutingReportModel.js`)

| Field | Role in Stage 4 |
|---|---|
| `coach` | **Author**, not owner-coach. Set to `req.user._id` for whoever writes the report — coach, observer, and now proScout alike (`scoutingReportController.js:116`). This is the field `checkReportOwnership` compares. No change. |
| `player` | Second guard axis. `checkReportOwnership` must confirm the referenced player is in the proScout's scope, because `checkPlayerOwnership` is absent from the `/reports/:id` chain (research R6). |

---

## PlayerMedia (`Backend/models/playerMediaModel.js`)

| Field | Role in Stage 4 |
|---|---|
| `uploadedBy` | Author. Same treatment as `ScoutingReport.coach`. |
| `player` | Second guard axis, same reason as above. |

---

## Team (`Backend/models/teamModel.js`)

Read-only in this stage. `league` is the scope key; `teamScopeFor` and `teamExistsInScope` both read
it. No writes.

---

## Invariants the implementation must preserve

- **I-1 — `coach` never holds a non-coach.** Enforced today by `assignPlayerCoach`
  (`User.findOne({ _id, role: ROLES.COACH })`). Stage 4 must not introduce a path that writes a
  proScout id into `coach`. A test asserts `player.coach` is unset after a proScout creates a player.
- **I-2 — `createdBy` is server-assigned only.** `lockField("createdBy")` on both `createValidate`
  and `updateValidate` already rejects any client-supplied value; the controller then overwrites it.
  Both layers stay.
- **I-3 — `teamName` does not confer scope.** A player with `teamName: "Some Club"` and `team: null`
  is in a proScout's scope **only** via the `createdBy` branch. A proScout must not be able to reach
  another user's free-text-team players by guessing a club name. This is registered tech debt
  (plan item #4) and is *tested* here, not fixed here.
- **I-4 — ~~`ageGroup` derivation is untouched.~~ AMENDED by Stage 4b.** The hooks now branch on
  `Player.isProfessional`:
  - **Youth (`false`, the default — coach and admin)**: unchanged in every respect. Birth year
    2007–2019, `ageGroup` derived, and the "No age group is configured" error preserved.
  - **Professional (`true` — set when the creator is a proScout)**: birth year **1996**–2019, and
    the `ageGroup` derivation is **skipped**, leaving the field unset.

  `isProfessional` is server-assigned only and carries `lockField` on both create and update, so a
  coach cannot flip a youth player to professional and thereby escape the 2007 floor.

  ✅ Sanctioned by Constraint **C-4**'s explicit exception, added in constitution **v1.0.2**. That
  exception binds four things, all satisfied here: server-only assignment with `lockField` on create
  and update; the carve-out limited to the birth-year range and the `ageGroup` derivation and nothing
  else; the youth path byte-identical and proven by a coach regression test; and
  `SeasonMatch.ageGroup` left `required: true` with no exception.
- **I-5 — No new index.** The two scope branches are served by `{ team: 1 }` (sparse) and
  `{ team: 1, createdBy: 1 }`, both added in Stage 2.

---

## State transitions

None introduced. `status` transitions remain admin-only (`PATCH /players/:id/status`), and proScout
is not granted that route.
