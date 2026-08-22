# Implementation Plan: proScout Hardening (Stage 7)

**Branch**: `009-proscout-hardening` (git branch in use for this work: `phase-7-hardening`) | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-proscout-hardening/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Stage 7 does not add any new user-facing capability. It audits the entire API surface for the `proScout` role, closes the two concrete verification gaps research turned up (role-gate denials from `allowedTo` are not currently logged, and no test proves a *future* unguarded route is caught automatically), and produces the evidence artifacts (endpoint inventory, negative tests, E2E denial tests, extended `isolation.test.js`, full regression) that Constitution Principles II, III, IV, and VI require before this role can be considered hardened. The technical approach is: (1) generate the inventory from `Backend/routes/*.js` cross-referenced with a refreshed `openapi.json`; (2) add one small, additive change to `authController.js`'s `allowedTo` so role-gate denials call a new `logRoleDenial` export — sharing `accessLog.js`'s internal writer with the existing `logScopeDenial` (Stage 2), which already covers ownership-layer denials the same way; (3) write the negative/router-level/E2E/regression tests specified in spec.md's Functional Requirements against the existing, unchanged route stack.

## Technical Context

**Language/Version**: JavaScript (Node 22, ESM) for `Backend/`; TypeScript for `frontend/` and `e2e/` — all pinned by the existing repo, no new language/runtime introduced.

**Primary Dependencies**: Backend: Express 5, Mongoose 9, `express-async-handler`, `express-validator` (all existing). Frontend/E2E: Angular 21, Playwright (existing). No new dependency is added by this stage.

**Storage**: N/A — no schema or persisted-data change. The one code change (below) writes to the existing process log stream via `console.warn`, the same sink `logScopeDenial` already uses (the new `logRoleDenial` export shares that sink and internal writer); no new collection.

**Testing**: `vitest` (Backend, sequential `fileParallelism: false`, `mongodb-memory-server`, fixtures via `Backend/tests/helpers/factory.js`) for the endpoint inventory's negative tests, the router-level guard test, the `isolation.test.js` extension, and the regression suite. Playwright (`e2e/`) for the browser-level denial proof, run against a live backend + built frontend.

**Target Platform**: Existing Express 5 API (`Backend/`) and Angular SPA (`frontend/`) — no new platform.

**Project Type**: Web application (existing three-project monorepo: `Backend/`, `frontend/`, `e2e/`) — Option 2 in the structure below.

**Performance Goals**: N/A — this stage is an audit/test stage; it introduces no new request path with a performance profile of its own.

**Constraints**:
- `Backend/tests/isolation.test.js` MUST pass with zero modification to any pre-existing assertion (Constitution Principle III, NON-NEGOTIABLE).
- `GET /ages` and `GET /ages/:id` MUST NOT gain `protect` — Constitution C-3 is a Resolved Decision; reopening it without a constitutional amendment is out of scope.
- The one production code change in this stage (wiring `allowedTo` to the new `logRoleDenial` export) MUST NOT change any response status code or body for any role — verified by the FR-018 regression suite, which already covers denial paths indirectly via count/content equality, plus the existing negative-test suites for coach/observer/admin across other stages.

**Scale/Scope**: Full backend route surface — `Backend/routes/*.js` (11 router files; ~85+ operations once reconciled against the Stage 5 baseline of 83) — classified for one role (`proScout`) plus regression proof for the three existing roles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Applies? | How this stage complies |
|---|---|---|
| I. Server-Side Enforcement First | Yes | Every FR proves denial via an HTTP status assertion (FR-010) or an API-level check alongside the E2E redirect (FR-015) — never a UI-only assertion. |
| II. Deny by Default | Yes | FR-002/FR-012 make "unclassified = failing" and "new route without `allowedTo` = caught automatically" the explicit bar, closing the one class of drift Principle II worries about. |
| III. No Behavior Change for Existing Roles (NON-NEGOTIABLE) | Yes | FR-017 forbids touching any pre-existing `isolation.test.js` assertion; FR-018/019 require count-and-content regression proof, including both display masks, for coach/observer/admin. The one production change (logging wire-up) is response-invisible by construction (see Research R1) but is still covered by the regression suite as a belt-and-suspenders check. |
| IV. Single Central Scope Layer | Yes | This stage adds no new scope logic — it audits the scope layer built in Stages 2-6. The logging change (new `logRoleDenial` export) shares `accessLog.js`'s one internal writer with the existing `logScopeDenial` rather than inventing a parallel logging path. |
| V. Independently Deployable Phases | Yes | This stage's only production change (FR-016's logging wire-up) is additive and reversible on its own; it does not depend on or block any other stage. `npm run dump-spec` re-run is required only because the inventory step reads `openapi.json`, not because any route shape changes. |
| VI. Positive and Negative Test per Permission | Yes | This is this stage's core subject: FR-005–011 are negative tests per domain; the positive side (Scoped/Allowed rows) is already proven by Stages 2-6 and is out of this stage's scope per spec.md's Edge Cases. |
| VII. Single Source of Truth for Role Names | Yes | No new role-name literal is introduced; the stage reads the existing `ROLES`/`allowedTo` declarations, it does not add new ones. |
| C-1 (redirect loop) | N/A | Already closed in Stage 3; FR-014 reuses `RoleLandingService`, it does not touch `role.guard.ts`. |
| C-2 (ownership.js fall-through) | N/A | Already closed in Stage 2 (explicit `proScout` branches). This stage only tests the existing branches, per FR-005–009. |
| C-3 (`GET /ages`, `GET /teams` stay open) | Yes | FR-004/FR-006 explicitly forbid adding `protect`; the inventory documents the gap distinctly from `proScout`'s own (already-correct) `allowedTo` denial, exactly as C-3 requires. |
| C-4 (`league: "professional"` scope definition) | N/A | No scope logic changes; this stage audits, it does not redefine, the professional-league scope. |
| C-5 (no permission system) | N/A | This stage does not add a permission model; it works within the existing role-literal RBAC. |

**Gate result**: PASS. No principle is weakened; the one production change (logging wire-up in `allowedTo`) is additive, reuses an existing audited helper, and is covered by the regression requirement. No entry is needed in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/009-proscout-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── endpoint-inventory-schema.md   # Column/format contract the Stage 7 inventory doc must follow
│   ├── endpoint-inventory.md          # The inventory itself (produced during /speckit-implement, per FR-001-004)
│   └── denial-log-entry-schema.md     # Field contract for logScopeDenial (existing) and logRoleDenial (new, role-gate) entries
├── checklists/
│   ├── requirements.md  # Spec-quality checklist (already validated)
│   └── (security.md lives in specs/008-proscout-matches-attendance/ — the CHK001-CHK035 source checklist this spec answers)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
Backend/
├── controllers/
│   └── authController.js        # ONE production change: allowedTo() denial branch calls the new logRoleDenial (FR-016)
├── utils/
│   └── accessLog.js              # Existing Stage-2 helper (logScopeDenial) — gains a new logRoleDenial export sharing its internal writer
├── routes/                       # Read-only for this stage — the inventory (FR-001) audits these 11 files, none are modified
│   ├── ageGroupRouter.js
│   ├── userRouter.js
│   ├── playerRouter.js
│   ├── seasonMatchRouter.js
│   ├── teamRouter.js
│   └── ... (remaining routers, enumerated in the inventory)
└── tests/
    ├── isolation.test.js         # Extended only — new describe blocks for proScout (FR-017)
    ├── helpers/factory.js        # Existing fixture builders, reused (FR-020)
    └── roles/
        ├── proScoutHardeningNegative.test.js   # NEW — FR-005, FR-007, FR-008, FR-009, FR-010, FR-011
        ├── proScoutRouterGuard.test.js         # NEW — FR-012 (deny-by-default regression guard)
        ├── proScoutDenialLogging.test.js       # NEW — FR-016 (asserts logScopeDenial AND logRoleDenial spies called with required fields)
        └── proScoutFullRegression.test.js      # NEW — FR-018, FR-019 (coach/observer/admin count+content regression)

e2e/
└── tests/
    └── proscout-hardening.spec.ts   # NEW — FR-013, FR-014, FR-015

openapi.json                        # Refreshed via `npm run dump-spec` (FR-001) — no manual edits
frontend/src/app/core/models/api.generated.ts  # Refreshed via `npm run gen:types` if dump-spec changes shape (none expected — no route shape changes this stage)
```

**Structure Decision**: Existing three-project monorepo (`Backend/`, `frontend/`, `e2e/`) — Option 2 (Web application) from the template, unchanged. This stage adds test files only (plus the one-line logging wire-up in `authController.js`); no new directories, services, or components are introduced.

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 0 research and Phase 1 design surfaced two concrete code changes not visible from the spec alone: `logRoleDenial` in `authController.js` (R1/R2) and the `e2e/seed.js` + `auth.ts` extension (R5). Neither was anticipated as "production code" at the initial gate; both are re-checked here explicitly.*

| Change | Principle III risk (existing-role behavior) | Verdict |
|---|---|---|
| `allowedTo()` calls the new `logRoleDenial` before `next(new AppError(...))` | The function's control flow, status code, and error body are unchanged for every role (coach/observer/admin/proScout) — the only effect is a `console.warn` side-effect on the branch that was already rejecting the request. `data-model.md`'s Denial Log Entry validation rules state this explicitly, and FR-018's regression suite asserts response equality across this exact code path. | PASS — additive, response-invisible. |
| `e2e/seed.js` gains a `proScout`-creating step; `auth.ts` gains `loginAsProScout` | Purely additive: the existing coach-seeding step and `loginAsCoach` are untouched, and no existing E2E spec is modified. | PASS — additive, no existing E2E test's behavior changes. |

**Gate result (post-design)**: PASS, unchanged from the pre-design gate. No entry is needed in Complexity Tracking.

## Complexity Tracking

*No entries — the Constitution Check gate passed without needing a justified violation, both pre- and post-design.*
