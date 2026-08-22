# Endpoint Inventory — Stage 6 Delta

**Feature**: `specs/008-proscout-matches-attendance/` | Principle VI obligation

Stage 4 produced the full inventory of 83 operations
([`specs/005-.../contracts/endpoint-inventory.md`](../../005-proscout-players-write/contracts/endpoint-inventory.md));
Stage 5 added one, reaching 84
([`specs/007-.../contracts/endpoint-inventory-delta.md`](../../007-proscout-dashboard/contracts/endpoint-inventory-delta.md)).

This stage adds **zero** new operations and changes the proScout decision on **three** existing ones.
Total stays **84**.

## Changed

| Operation | Before this stage | After this stage | Enforcement |
|---|---|---|---|
| `POST /seasonMatches/{id}/attend` | refused (403, no `allowedTo` entry) | **allowed, scoped** | `allowedTo(..., PRO_SCOUT)` + `checkSeasonMatchScope` (new on this route) |
| `DELETE /seasonMatches/{id}/attend` | refused (403) | **allowed, scoped** | same as above |
| `PATCH /seasonMatches/{id}/status` | refused (403, no `allowedTo` entry) | **allowed, scoped + attendee-gated** | `allowedTo(..., PRO_SCOUT)` + corrected `checkSeasonMatchAttendee` proScout branch |

## Unchanged (restated, not re-verified per-row)

- `GET /seasonMatches` and `GET /seasonMatches/{id}` were already **allowed, scoped** as of Stage 2/3
  (`research.md R1`) — no change here.
- The other 80 operations from the Stage 4/5 inventory keep their exact decisions. This stage edits no
  `allowedTo` argument list outside `seasonMatchRouter.js`.
- **C-3 remains open**, untouched by this stage.

## Verification method

Built from `Backend/routes/seasonMatchRouter.js` directly, then cross-checked against the regenerated
`openapi.json` after `npm run dump-spec`, per Principle VI.

**Confirmed during implementation (2026-08-22)**: `dump-spec` + `gen:types` (tasks.md T018) produced
a contained diff — `openapi.json` +9/-3 lines, `frontend/.../api.generated.ts` +13/-3 lines — matching
exactly the three changed operations above and no others. `tests/roles/proScoutMatchAttendance.test.js`
(G-1…G-13) and the corrected `T042` block in `tests/roles/proScoutDataScope.test.js` exercise every
row in the "Changed" table above at the HTTP level; the full backend suite (638/638) and
`tests/isolation.test.js` (15/15, unmodified) confirm nothing else moved.
