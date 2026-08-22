# Phase 1 Data Model: proScout Name on the Professional League Lens

No schema change. This feature adds no field, no index, and no migration. It documents the existing
`Player.createdBy` reference and the one new derived view of it: its populated form in the admin's
`GET /players` response.

## Entity: Player (existing, unchanged)

Relevant existing fields only (`Backend/models/playedModel.js`):

| Field | Type | Notes |
|---|---|---|
| `createdBy` | `ObjectId` (ref: `User`) | Set once at creation by the server (`playerController.create`, Stage 2), locked against client input on both create and update (`lockField("createdBy")`). Not `required` — pre-Stage-2 and orphaned documents may lack it. **This feature reads it; it does not write, lock, or backfill it — those already exist.** |

## Derived view: `createdBy` as seen by an admin calling `GET /players` (new, response-only)

Not a schema addition — a `.populate()` projection applied only inside `playerController.getAll`,
only when `req.user.role === ROLES.ADMIN`.

| Field (on the populated sub-document) | Type | Source |
|---|---|---|
| `_id` | `ObjectId` | `User._id` |
| `name` | `string` | `User.name` |

No other `User` field (email, role, vault counters, etc.) is included — `select: "name"` only, per
FR-002.

### Shape by caller, for `GET /players`

| Caller role | `document.createdBy` value |
|---|---|
| `admin` | `{ _id, name }` if the referenced user still resolves (or if the player has `createdBy` set to a still-active user); `null`/falsy if the player has no `createdBy` at all, or if the referenced user was soft-deactivated — see Edge Cases below |
| `coach`, `observer`, `proScout` | **The bare `ObjectId` string, identical to today** — no `populate` call is made on their path. **Corrected during implementation**: neither `getAll` nor `getSpecific` has ever used `.select()` to exclude this field, so it was already present as a raw string in every response for every role since Stage 2 — "unaffected" means the string is unchanged, not that the key disappears. |

### Edge cases, resolved

- **Player has no `createdBy` value at all** (legacy/orphan, per Stage 2's `backfillPlayerCreatedBy.js`
  `ORPHANS` bucket): `.populate()` on a `null`/absent reference resolves to `null`. The frontend's
  `creatorName()` helper (mirroring `coachName()`) treats `null`/absent identically, returning `''`.
  No error, no thrown exception — this is standard Mongoose `populate` behavior on an empty ref,
  already relied upon elsewhere in this same controller for `coach` on orphaned players.
- **The referenced `User` was soft-deleted.** `User` has a `pre(/^find/)` hook filtering
  `{ active: { $ne: false } }` (per CLAUDE.md). `Player.populate("createdBy")` is a `find`-family
  operation and is therefore subject to that hook by default: a deactivated creator's `populate`
  resolves to `null` unless `.setOptions({ bypassFilter: true })` is used — which this feature does
  **not** do, matching the same (unbypassed) behavior already used for the existing `coach` populate
  in the same query. A deactivated creator therefore displays the same as "no creator" (FR-003's
  graceful-absence case covers this without additional logic).

## State transitions

None. `createdBy` is write-once at creation (already true before this feature); this feature adds no
new write path, no new transition, and no new validation rule.
