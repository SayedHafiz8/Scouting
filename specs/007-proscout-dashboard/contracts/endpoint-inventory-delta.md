# Endpoint Inventory — Stage 5 Delta

**Feature**: `specs/007-proscout-dashboard/` | **Principle VI obligation**

Stage 4 produced the full inventory of 83 operations at
[`specs/005-proscout-players-write/contracts/endpoint-inventory.md`](../../005-proscout-players-write/contracts/endpoint-inventory.md),
with the proScout decision recorded for each: 24 allowed/scoped, 57 refused, 2 (`/ages`) neither.

This stage adds **one** operation and modifies **no** existing `allowedTo` call, so the obligation
is discharged as a delta rather than a regenerated table
([research.md R11](../research.md)).

## Added

| Operation | proScout | admin | coach | observer | Enforcement |
|---|---|---|---|---|---|
| `GET /dashboard/proScout` | **allowed, scoped** | 403 | 403 | 403 | `protect` + `allowedTo(ROLES.PRO_SCOUT)`; figures scoped via `services/scope.js` |

New total: **84 operations** — 25 allowed/scoped, 58 refused, 2 neither.

## Unchanged (restated, not re-verified per-row)

- The 57 refusals from Stage 4 keep their refusals. This stage edits no `allowedTo` argument list
  anywhere in `Backend/routes/`.
- The five sibling dashboard operations keep their exact role sets:

  | Operation | Roles |
  |---|---|
  | `GET /dashboard/coach` | coach |
  | `GET /dashboard/admin` | admin |
  | `GET /dashboard/admin/coaches-stats` | admin |
  | `GET /dashboard/admin/:coachId` | admin |
  | `GET /dashboard/observer` | observer |
  | `GET /dashboard/admin/observer/:observerId` | admin |

  proScout was already refused on all six and remains refused; no admin-viewing variant of the new
  endpoint is added, so admin gains nothing here either.

- **C-3 remains open.** `GET /ages` and `GET /ages/:id` still carry no `protect` at all
  (`ageGroupRouter.js:113,116`), so they remain reachable unauthenticated. This stage does not touch
  them and does not close the constraint. The proScout dashboard requests no age-group data, which is
  a change of *intent*, not a closed door — the same distinction Stage 4 recorded for the players
  page. `TODO(AGES_UNAUTHENTICATED_READ)` stands.

## Verification method

Built from `Backend/routes/dashboardRouter.js` directly, then cross-checked against the regenerated
`openapi.json` after `npm run dump-spec` — in that order, per Principle VI's requirement that the
inventory be built from the route files rather than from `openapi.json` alone.
