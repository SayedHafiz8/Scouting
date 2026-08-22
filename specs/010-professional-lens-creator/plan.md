# Implementation Plan: proScout Name on the Professional League Lens

**Branch**: `010-professional-lens-creator` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-professional-lens-creator/spec.md`

## Summary

Admins currently cannot tell, from the Professional League lens (Stage 4c, `GET /players?isProfessional=true`),
which `proScout` is responsible for a given player. `Player.createdBy` has carried that answer since
Stage 2 but is never populated or returned by any endpoint. This feature adds a conditional
`populate({ path: "createdBy", select: "name" })` to `playerController.getAll`, gated on
`req.user.role === ROLES.ADMIN`, and renders the resolved name on each row of the admin's flat
player list. No scope, ownership, or mask logic changes — the field is pure display, added to a
response only the admin ever receives in full.

## Technical Context

**Language/Version**: Node.js 22 (ESM), Express 5, Mongoose 9 · Angular 21 (standalone + signals), TypeScript

**Primary Dependencies**: Existing stack only — no new dependency. Backend: `mongoose` `.populate()`
(already used for `coach`/`team`/`observers` in the same controller). Frontend: existing
`PlayerListComponent`, `PlayerService`, `AuthService`.

**Storage**: MongoDB via Mongoose. No schema change — `Player.createdBy` already exists
(`Backend/models/playedModel.js:118`, Stage 2). This feature only resolves the reference; it adds no
field, index, or migration.

**Testing**: Vitest (`Backend/tests/roles/adminProfessionalLens.test.js` extended, plus a new
byte-identical-response regression check for non-admin roles); Karma/Jasmine for the frontend row
rendering.

**Target Platform**: Existing web app (backend on Node, Angular SPA) — no new platform surface.

**Project Type**: Web application (`Backend/` + `frontend/`), per repo layout in CLAUDE.md.

**Performance Goals**: No measurable change expected — one additional `.populate()` call, on the
admin's request path only, resolving a single-hop reference already indexed by `_id` on `User`. No
new N+1 pattern: it is one `populate` per list request, identical in shape to the existing `coach`
and `team` populates on the same query.

**Constraints**: Must not add any new client-suppliable query key (FR-008); must not alter response
shape at all for non-admin roles (FR-004) or for `GET /players/:id` for any role (FR-005).

**Scale/Scope**: One backend controller (`playerController.getAll`), one Mongoose `.populate()` call,
one frontend component (`PlayerListComponent`) template addition, one model type addition
(`Player.createdBy`), plus the `openapi.json`/`api.generated.ts` regeneration Principle V requires
for any route-shape change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Check | Status |
|---|---|---|
| **I — Server-side enforcement first** | The name is attached server-side (`req.user.role === ADMIN` gate inside the controller, not a frontend `@if`). The frontend only renders what the response already contains. | PASS |
| **II — Deny by default** | No new access. `createdBy` already exists on every `Player` document for every role (Stage 2); this feature does not widen who can *read* a player, only what one already-fully-privileged role (`admin`, which already receives the full player document) sees on it. Non-admin roles get nothing new — verified by FR-004/SC-003. | PASS |
| **III — No behavior change for existing roles (NON-NEGOTIABLE)** | `coach`, `observer`, `proScout` responses from `GET /players` are untouched — the `populate` is added inside an `if (isAdmin)` branch, never on their code path. `GET /players/:id` is untouched for every role including `admin` — no line in `getSpecific` is touched. `tests/isolation.test.js` is not modified. Regression tests assert byte-identical responses for all three non-admin roles and for `GET /players/:id`. | PASS |
| **IV — Single central scope layer** | Not engaged. This feature adds no scope, filter, or ownership condition — `playerScopeFor`, `ApiFeature.filter`, and `ownership.js` are untouched. The change is a `select`/`populate` projection detail inside `getAll`, downstream of scoping, same as the existing `coach`/`team` populates already there. | PASS (N/A — no scope logic added) |
| **V — Independently deployable phases** | Self-contained: depends only on Stage 2 (field exists) and Stage 4c (lens exists), both merged. `npm run dump-spec` + `npm run gen:types` MUST run in the same PR since the `GET /players` response shape changes for `admin`. | PASS (action required, tracked in tasks) |
| **VI — Positive and negative test per permission** | No new permission is granted, so no new endpoint-inventory row is needed. The positive test (admin sees the correct name per player) and negative test (non-admin gets nothing new, byte-identical response) are both required deliverables of this plan. | PASS (tests planned) |
| **VII — Single source of truth for role names** | The admin gate uses `ROLES.ADMIN` from the existing constant (`constants/roles.js`), consistent with every other role check already in `playerController.js`. No string literal introduced. | PASS |

**Gate result: PASS.** No violations to record in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/010-professional-lens-creator/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── players-list-response.md
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
Backend/
├── controllers/
│   └── playerController.js        # getAll(): add gated populate + response shape
├── models/
│   └── playedModel.js              # createdBy already exists — read-only reference, no edit
├── routes/
│   └── playerRouter.js             # @swagger JSDoc above GET /players: document new admin-only field
└── tests/
    └── roles/
        └── adminProfessionalLens.test.js   # extend: positive + negative + /:id-unaffected +
                                             # other-admin-views-unaffected + non-filterable cases

frontend/
├── src/app/core/models/
│   └── player.model.ts             # add optional createdBy?: { _id?: string; name: string } | string
├── src/assets/i18n/
│   ├── en.json                     # add PLAYERS.CREATED_BY label
│   └── ar.json                     # add matching Arabic translation
└── src/app/features/players/player-list/
    ├── player-list.component.ts    # add creatorName(player) helper, mirroring coachName();
                                     # render name on each row while professionalOnly() is active
    └── player-list.component.spec.ts   # extend: creatorName() populated/string/null/undefined cases

openapi.json                        # regenerate via `npm run dump-spec` (Backend/)
frontend/src/app/core/models/api.generated.ts   # regenerate via `npm run gen:types` (frontend/)
```

**Structure Decision**: Existing web-application layout (`Backend/` + `frontend/`, per CLAUDE.md) is
reused as-is. No new directory, service, or module — this is a scoped modification of one controller
method and one existing list component, matching the "single controller, single component" shape of
the feature's own scope statement.

## Complexity Tracking

*No entries — Constitution Check gate passed with no violations.*
