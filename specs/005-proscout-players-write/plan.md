# Implementation Plan: proScout Players Page & Write Access

**Branch**: `005-proscout-players-write` *(rename pending — see spec.md numbering note, finding F6)* | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-proscout-players-write/spec.md`

## Summary

Stage 4 of the proScout rollout. The role currently reads a correctly scoped players list and
player detail (Stage 2) and sees a two-item sidebar (Stage 3); it cannot write anything.

This stage does three things:

1. **Verifies** the read half. `research.md` R1 establishes that FR-001, FR-004, FR-005 and FR-006
   were fully implemented by Stage 2's central scope layer. They ship here as tests that fail on
   regression, not as new code.
2. **Opens the write gates** on players, scouting reports, media and profile images — matching the
   coach role's permission set exactly, no wider. Every gate is opened *after* the guard behind it
   is real: `checkReportOwnership` and `checkMediaOwnership` still carry Stage 2 placeholder
   branches that hard-deny proScout, and those become genuine two-axis checks (author **and**
   player-in-scope) before their routes are opened. Opening a gate ahead of its guard is the exact
   mistake Stage 1 documented and Stage 2 avoided.
3. **Removes the age-group concept from this role's UI** by routing proScout through the flat-list
   path observers already use, and by suppressing the `/ages` request the page issues on init.

Technical approach: no schema change, no migration, no new scope logic. Every new guard reads
`playerScopeFor` / `professionalTeamIds` from the existing `Backend/services/scope.js`
(Principle IV). On the frontend, `AuthService` gains the missing `isProScout` computed and
`skipGroupsView()` gains one clause.

Nine deviations from the plan document's Stage 4 text are recorded in `research.md`; four of them
(R2, R3, R4, R5) are refusals to grant a privilege the text asks for, each because granting it would
either exceed the coach baseline the spec itself sets or reverse a prior security decision.

## Technical Context

**Language/Version**: Node 22 (`.nvmrc`); ESM throughout the backend; TypeScript 5.x on the frontend

**Primary Dependencies**: Express 5, Mongoose 9.7.2, Socket.IO (backend); Angular 21 standalone
components + signals, Tailwind, ngx-translate (frontend)

**Storage**: MongoDB. **No schema change in this stage** — `Player.createdBy` and its
`{ team: 1, createdBy: 1 }` index landed in Stage 2

**Testing**: vitest with `mongodb-memory-server` (`fileParallelism: false`, collections cleared in
`beforeEach`, fixtures from `tests/helpers/factory.js`); Karma/Jasmine on the frontend; Playwright
for e2e

**Target Platform**: Linux server behind nginx; evergreen browsers

**Project Type**: Web application — `Backend/` + `frontend/` + `e2e/`

**Performance Goals**: no new N+1 and no new index. `professionalTeamIds(req)` is memoised on the
request object, so the write guards added here reuse the same cached id list the read path already
computed

**Constraints**:
- `Backend/tests/isolation.test.js` must pass **unedited** (Principle III, non-negotiable)
- Coach, observer and admin responses byte-identical before and after
- Any scope filter on a key that also appears in a client whitelist must be `$and`-wrapped
  (Stage 2 research R12) — relevant here because `team` is in `PLAYER_FILTERS`
- User-facing strings in EN **and** AR
- `npm run dump-spec` + `npm run gen:types` in the same PR

**Scale/Scope**: 13 backend route decisions changed (of 83 project operations inventoried), 2
ownership guards completed, 1 controller branch added, 1 validator gains denial logging, 1 route
chain reordered; 4 frontend files touched; ~25 new tests

**Out of scope, resolved during planning**: FR-015 (scoped export) — no export capability exists
anywhere in the players feature, controllers, or routers. Verified by search, recorded in spec.md.
*(Analysis finding E1.)*

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Result: **PASS** at both
points, with one documented amendment to a spec acceptance criterion (FR-008) and one
carried-forward known gap (C-3).*

| Principle | Assessment | Evidence |
|---|---|---|
| **I — Server-side enforcement first** | PASS | Every UI change in §5 of the contract has a server-side counterpart already in force. The `/ages` suppression (R10) is explicitly labelled an intent fix, **not** an access control, precisely so no one mistakes the hidden grid for a closed door. Denials are 403/400 with a body — never 200-empty. |
| **II — Deny by default** | PASS | Every grant is enumerated in `contracts/proscout-write-matrix.md` with its enforcing layer. Four routes the plan text asked to open are refused (R2, R3) and become **asserted negative tests**. Guards are completed *before* their gates open. |
| **III — No behavior change for existing roles** | PASS, one risk tracked | Every change is an additive role branch. The single genuine risk is R7 (inserting `checkPlayerOwnership` into the `profileImg` chain), which is why that route carries dedicated coach + admin regression tests. `isolation.test.js` stays unedited. |
| **IV — Single central scope layer** | PASS *(after analysis remediation)* | No new scope logic. `checkReportOwnership`, `checkMediaOwnership` and the create path all read `services/scope.js`. R7 explicitly *removes* a hand-rolled controller-level ownership comparison in favour of the middleware layer. The principle's logging clause is now met on the one newly-reachable denial path that lacked it — out-of-scope **team** assignment on write (T010, T011a). *Analysis finding D2.* |
| **V — Independently deployable** | PASS | Ships alone: proScout gains write access; no other role is touched; no migration, so revert is complete (quickstart §5). `dump-spec` + `gen:types` are in-PR. |
| **VI — Positive and negative test per permission** | PASS *(after analysis remediation)* | Quickstart §3 maps every scenario to both. The **full 83-operation project inventory** required by this principle is in [contracts/endpoint-inventory.md](contracts/endpoint-inventory.md), built from `Backend/routes/*.js` as the principle demands. Discharged as per-route assertions for denials adjacent to a grant (T030, T036, T039, T051) plus router-level sweeps for domains this stage grants nothing in (T058). Mandatory cases (out-of-scope direct ID, widening query param, search/sort/paginate in scope) are all present. *Analysis finding D1 — the first draft inventoried only the Players domain and summarised the rest, which did not meet the MUST.* |
| **VII — Single source of truth for role names** | PASS, and improved | No new string literals — `ROLES.PRO_SCOUT` on the backend, `UserRole` on the frontend. R13 **fixes** an existing violation by deriving the admin role dropdown from `UserRole` instead of three hard-coded literals. |

**Constraint ledger** (required in the PR description by the Governance section):

- **Layers touched**: all three — `allowedTo` gates, the central scope layer (read-only, via
  `services/scope.js` consumers), and `middlewares/ownership.js`.
- **C-2 — addressed further.** The two placeholder proScout branches in `ownership.js` become real
  two-axis guards; `uploadProfileImg`'s hand-rolled check is superseded by the middleware.
- **C-3 — carried forward, still unenforceable.** `GET /ages` has no `protect`, so `allowedTo`
  cannot act on it (R12). Unchanged from Stages 2 and 3, and the Stage-3 test documenting the actual
  200/200 behavior is retained.
- **C-4 — relied upon unchanged.** `league: "professional"` scope shapes are consumed exactly as
  Stage 2 built them.
- **TODO(PLAYER_OWNER_FIELD)** — closed by Stage 2; this stage is its first *write* consumer.

**Amendment to a spec acceptance criterion**: FR-008 says out-of-scope team assignment yields
**403**. The implementation keeps the existing **400**, because a status-code difference between
"real team, wrong league" and "no such team" is an enumeration oracle that defeats `checkTeamScope`
(research R4). FR-008's intent — the write is refused server-side and the player is never created —
holds. Recorded in the contract, not silently diverged.

## Project Structure

### Documentation (this feature)

```text
specs/005-proscout-players-write/
├── plan.md                              # This file
├── spec.md                              # Feature specification
├── research.md                          # Phase 0 — 13 findings, 9 deviations
├── data-model.md                        # Phase 1 — no schema change; invariants I-1..I-5
├── quickstart.md                        # Phase 1 — validation guide
├── contracts/
│   ├── proscout-write-matrix.md         # Phase 1 — Players-domain decisions + enforcing layers
│   └── endpoint-inventory.md            # Principle VI — all 83 project operations, decision each
├── checklists/
│   └── requirements.md                  # Spec quality checklist
└── tasks.md                             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
Backend/
├── routes/
│   ├── playerRouter.js                  # +proScout: POST /, PATCH /:id, PATCH /:id/profileImg
│   │                                    #   (+ checkPlayerOwnership on the profileImg chain, R7)
│   ├── scoutingReportRouter.js          # +proScout: GET /, GET /statistics, POST /,
│   │                                    #   GET /:id, PATCH /:id  — DELETE stays admin-only (R2)
│   └── playerMediaRouter.js             # +proScout: video, upload-eligibility, upload-envelope,
│                                        #   GET /, POST /, GET /:id — download stays admin (R3)
├── middlewares/
│   └── ownership.js                     # checkReportOwnership + checkMediaOwnership:
│                                        #   placeholder 403 → real two-axis guard (R6)
├── controllers/
│   └── playerController.js              # create(): `delete req.body.coach` for non-coach
│                                        #   authors — NOT mere omission (R5 + R14)
├── services/scope.js                    # READ ONLY — no edit
├── utils/validation/playerValidation.js # teamExistsInScope: scope logic unchanged (R4);
│                                        #   + logScopeDenial on out-of-scope teams (D2)
└── tests/
    ├── isolation.test.js                # MUST NOT BE EDITED
    └── roles/proScoutPlayersWrite.test.js   # new — the stage's test surface

frontend/src/app/
├── core/auth/auth.service.ts            # + isProScout computed (R9)
├── features/players/
│   ├── player-list/player-list.component.ts   # skipGroupsView() + isProScout;
│   │                                          #   skip loadGroups(); widen "Add" button gate (R10)
│   └── player-form/player-form.component.ts   # proScout team-dropdown copy (R11)
├── features/users/.../user-form.component.ts  # role select derived from UserRole (R13)
└── assets/i18n/{en,ar}.json                   # new keys for R11 copy

openapi.json                             # regenerated — npm run dump-spec
frontend/src/app/core/models/api.generated.ts  # regenerated — npm run gen:types
```

**Structure Decision**: the existing three-project layout is used unchanged. Backend changes
concentrate in the two layers the constitution designates for access control (`routes/` for the
coarse gate, `middlewares/ownership.js` for per-document guards); `services/scope.js` is read-only
in this stage, which is the clearest available signal that Principle IV was honoured — the scope was
consumed, not re-expressed. Frontend changes are confined to the players feature plus two
single-line additions in `core/` and `features/users/`.

## Complexity Tracking

No constitutional violations require justification. The one deliberate divergence — FR-008's
400-instead-of-403 — is a spec amendment argued in research R4 and recorded in the contract, not a
principle violation; both readings satisfy Principle I, and the chosen one additionally satisfies
Principle II by not creating an enumeration oracle.
