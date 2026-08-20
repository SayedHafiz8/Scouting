# Implementation Plan: ProScout Role Definition

**Branch**: `002-proscout-role-definition` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-proscout-role-definition/spec.md`

## Summary

Register `proScout` as a fourth valid role value across the backend's single role source of truth and its consumers (Mongoose enum, request validation), regenerate the API contract and generated frontend types, and confirm — without adding any new scoping logic — that the existing deny-by-default mechanisms (`ApiFeature.buildOwnerScope`, `ownership.js`'s explicit-switch guards, `allowedTo(...)` allowlists, `RoleLandingService`) already reduce an unrecognized-to-them role to zero data access and a `/unauthorized` landing. This stage adds no scope, no new endpoints, and no new frontend routes — it only makes the role exist and proves it starts locked down.

## Technical Context

**Language/Version**: Node.js 22 (ESM) for Backend; TypeScript / Angular 21 for frontend

**Primary Dependencies**: Express 5, Mongoose 9, express-validator (Backend); Angular standalone components + signals (frontend)

**Storage**: MongoDB (via Mongoose) — `User.role` is a plain string enum field, no schema migration needed for this stage

**Testing**: vitest (Backend, `Backend/tests/**`, sequential/`fileParallelism:false` against mongodb-memory-server); Karma/Jasmine (frontend)

**Target Platform**: Existing web app (Express API + Angular SPA), no new platform surface

**Project Type**: Web application (existing `Backend/` + `frontend/` split)

**Performance Goals**: N/A — no new query paths or hot paths introduced; login and existing list endpoints keep current performance characteristics

**Constraints**: Must not alter any observable behavior for `admin`, `coach`, `observer` (Constitution Principle III, non-negotiable); must not grant `proScout` any implicit access (Principle II); role names must flow from the single constant (Principle VII)

**Scale/Scope**: One new enum value in one constant, propagated to ~4 backend touch points and 2 generated-artifact regenerations; zero new database records beyond ordinary role assignment; zero new frontend components or routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Server-Side Enforcement First | This stage's "no access" claim must be proven by actual HTTP 403/empty-array responses in Backend tests, not by frontend hiding. Plan's acceptance tests are API-level. | PASS |
| II. Deny by Default | `proScout` is added to the role enum/validation only — deliberately **not** added to any `ownerFields` map, `allowedTo(...)` list, or `ownership.js` branch. Its absence is what produces the lockdown; nothing is disabled to achieve it. | PASS |
| III. No Behavior Change for Existing Roles | No existing route, filter, or guard is edited for `admin`/`coach`/`observer` in this stage — only additive enum/validation values and a schema regen. `tests/isolation.test.js` runs unmodified. | PASS |
| IV. Single Central Scope Layer | No new scope logic is written at all in this stage (deferred to Stage 2); nothing bypasses `ApiFeature`/`baseFilterFn`. | PASS (N/A — no scope added) |
| V. Independently Deployable Phases | This stage is mergeable/deployable alone: a `proScout` user can log in and gets zero access, a fully valid (if minimal) end state. `dump-spec` + `gen:types` run in the same change since the role enum shape changed. | PASS |
| VI. Positive and Negative Test per Permission | Positive test: login succeeds with valid token (the one capability this stage grants). Negative tests: `GET /players` → empty array, every `allowedTo(...)`-gated route excluding `proScout` → 403, `GET /teams` documented as accepted known gap (Constitution C-3 already resolves this — not this stage's problem to close). | PASS |
| VII. Single Source of Truth for Role Names | `proScout` is added once to `Backend/constants/roles.js` (`ROLES`/`ROLE_VALUES`); `userModel.js` enum and `userValidation.js` both derive from it, no new string literals. Frontend `UserRole` stays derived from `openapi.json` → `api.generated.ts`. | PASS |

No violations to justify — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-proscout-role-definition/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
Backend/
├── constants/
│   └── roles.js                          # add proScout to ROLES / ROLE_VALUES
├── models/
│   └── userModel.js                      # role.enum already derives from ROLE_VALUES — no edit needed, verify only
├── utils/
│   └── validation/
│       └── userValidation.js             # role check already derives from ROLE_VALUES — no edit needed, verify only
├── utils/
│   └── apiFeatures.js                    # buildOwnerScope — no edit; verify proScout falls to MATCH_NOTHING
├── middlewares/
│   └── ownership.js                      # no edit; verify explicit-switch default-deny already covers proScout
└── tests/
    └── roles/                            # new: proScout login + deny-by-default regression tests
        └── proScoutRoleDefinition.test.js

frontend/src/app/core/models/
└── api.generated.ts                       # regenerated via npm run gen:types (no manual edit)

openapi.json                                # regenerated via npm run dump-spec (repo root)
```

**Structure Decision**: Existing `Backend/` + `frontend/` web-application split is reused as-is. The only new file is a backend regression test module; every other touch point is a one-line addition to an existing constant (`roles.js`) plus regeneration of two derived artifacts (`openapi.json`, `api.generated.ts`). No new frontend component, route, or service is created in this stage — `RoleLandingService`'s existing `default → /unauthorized` branch already covers any role it doesn't recognize by name, which is what makes this stage's frontend requirement (FR-006) satisfied without a frontend code change.

## Complexity Tracking

*No Constitution Check violations — table not needed.*
