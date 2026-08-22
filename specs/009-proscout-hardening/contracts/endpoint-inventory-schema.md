# Contract: Endpoint Inventory Format (Stage 7)

**Consumed by**: `contracts/endpoint-inventory.md` (produced during `/speckit-implement`, per FR-001-004)
**Reuses**: The schema and vocabulary from `specs/005-proscout-players-write/contracts/endpoint-inventory.md` verbatim (R3) — this contract exists to make that reuse explicit and binding, not to define something new.

## Table schema

```markdown
| Operation | Current `allowedTo` | proScout | Stage 7 Δ | Enforcing layer |
|---|---|---|---|---|
| `METHOD /path` | `role, role, ...` or `(none)` | `ALLOW` \| `SCOPED` \| `DENY` \| `OPEN` | `new` \| `reclassified` \| `—` | mechanism name, or `no protect — C-3` |
```

Grouped by router file (one `##` section per file in `Backend/routes/*.js`), same grouping Stage 5 used: `ageGroupRouter.js`, `coachEvaluationRouter.js`, `observerEvaluationRouter.js`, `userRouter.js`, `authRouter.js`, `teamRouter.js`, `playerMediaRouter.js`, `scoutingReportRouter.js`, `playerRouter.js`, `dashboardRouter.js`, `seasonMatchRouter.js`.

## Disposition vocabulary (unchanged from Stage 5)

- **`ALLOW`** — in `allowedTo`, response unfiltered by scope.
- **`SCOPED`** — in `allowedTo`, response narrowed by the central scope layer (Stage 2-6).
- **`DENY`** — not in `allowedTo`; returns 403.
- **`OPEN`** — no `protect` and no `allowedTo` at all on the route: reachable by unauthenticated callers, not just every registered role. **[CORRECTED DURING IMPLEMENTATION]** Verified directly against the route files: only `GET /ages` and `GET /ages/:id` (`ageGroupRouter.js`) qualify — both routes have zero middleware before the controller. `GET /teams` and `GET /teams/:id` are **not** `OPEN`: they carry `protect`, and — per Stage 2's C-3 implementation — are additionally `SCOPED` for `proScout` specifically (`GET /teams` via `teamScopeFor` as a `baseFilterFn` on `gettingAll`, `GET /teams/:id` via the `checkTeamScope` ownership guard); other roles (`admin`/`coach`/`observer`) see them unfiltered (`ALLOW`), which is what C-3 preserves. Each `OPEN` row MUST also name `C-3` in `Enforcing layer`; `SCOPED` team rows MUST name `teamScopeFor` / `checkTeamScope` instead.

## Reconciliation requirement (FR-003)

The document MUST open with a short section stating:
1. The prior baseline it supersedes (`specs/005-proscout-players-write/contracts/endpoint-inventory.md`, 83 operations, 2026-08-21).
2. A count comparison: total operations found this stage vs. 83.
3. An explicit list of every operation whose `Stage 7 Δ` is `new` or `reclassified` — an empty list is a valid, statable outcome, but the section itself MUST be present even if there are zero deltas.

## Source of truth (FR-001)

Every row MUST be traceable to a line in `Backend/routes/*.js`, read after `npm run dump-spec` has been re-run — `openapi.json` alone MUST NOT be the sole source, per Constitution Principle VI's explicit correction (the spec file undercounted operations by ~22 historically).
