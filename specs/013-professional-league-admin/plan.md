# Implementation Plan: Professional League Admin Page

**Branch**: `013-professional-league-admin` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-professional-league-admin/spec.md`

## Summary

Give the admin one page to manage the three professional-league concepts that today either have
no home at all (proScout accounts) or are only reachable by hijacking an unrelated age group's
page (professional teams and fixtures): a new sidebar entry, one page reusing existing
create/list/detail components (`UserFormComponent`/`UserDetailComponent`/`UserService`,
`TeamService`, `SeasonMatchService`) scoped to `league: "professional"` with no age-group picker,
plus a third `totalProScouts` figure on the admin dashboard's existing coach/observer card.

The scope investigation during this plan phase surfaced a real blocker: clearing `Team.ageGroup`
for professional teams (the owner's Stage 13 decision) made `SeasonMatch.ageGroup` — constitutionally
required with no exception — impossible to satisfy for a professional-league fixture without a
crash in existing validation code. This was resolved with the owner's explicit sign-off as a
constitutional amendment (`.specify/memory/constitution.md` v1.2.0), extending the existing
`Player.isProfessional` exception pattern to `SeasonMatch.ageGroup` as well. See `research.md` R6.

## Technical Context

**Language/Version**: JavaScript (ESM) — Node 22 (Backend); TypeScript — Angular 21 (frontend)

**Primary Dependencies**: Express 5, Mongoose 9, express-validator (Backend); Angular standalone
components + signals, `@ngx-translate/core` (frontend)

**Storage**: MongoDB — conditional-requirement changes to two existing collections (`Team`,
`SeasonMatch`), no new collection; one-off migration script for pre-existing `Team` documents

**Testing**: vitest + mongodb-memory-server + `tests/helpers/factory.js` (Backend); Karma/Jasmine
(frontend)

**Target Platform**: Existing web app (server + Angular SPA) — no new platform surface

**Project Type**: Web application (existing `Backend/` + `frontend/` structure)

**Performance Goals**: No new hot path — this is low-traffic admin CRUD (team/fixture/proScout
counts are all small relative to the player collection); no new indexes anticipated beyond
whatever `sync-indexes` already covers for the touched fields

**Constraints**: MUST NOT change `premier`-league team/fixture creation behavior in any way
(FR-009, Constitution Principle III); MUST NOT change any other admin dashboard figure (FR-010);
MUST reuse existing account-creation/detail-viewing components rather than duplicating them
(spec Assumptions); the `Team`/`SeasonMatch` conditional-requirement mechanism MUST mirror the
existing `Player.isProfessional` pattern exactly (owner decision, constitution v1.2.0)

**Scale/Scope**: One new frontend route + page, small edits to two existing shared frontend
components (`UserFormComponent`, `UserDetailComponent`), two backend schema/validation changes,
one backend dashboard field, one migration script, one sidebar entry, new i18n keys — no new
backend route beyond what already exists on `teamRouter.js`/`seasonMatchRouter.js`/`userRouter.js`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applies? | Assessment |
|---|---|---|
| I — Server-Side Enforcement First | **PASS (gate)** | Access to the new page and its data is enforced by `roleGuard(['admin'])` (frontend route) backed by the existing `protect, allowedTo(ROLES.ADMIN)` gates already on every touched backend route (`userRouter.js`, `teamRouter.js`, `seasonMatchRouter.js`) — no new backend authorization surface is introduced, only new UI reaching existing admin-gated endpoints. |
| II — Deny by Default | **PASS (gate)** | The new sidebar entry and route both carry an explicit `roles: ['admin']`/`roleGuard(['admin'])` — nothing implicit. No new role, no `allowedTo` change. |
| III — No Behavior Change for Existing Roles | **PASS (gate)** | Every touched shared file (`user-form.component.ts`, `user-detail.component.ts`, `sidebar.component.ts`, `teamValidation.js`, `seasonMatchValidation.js`, `dashboardController.js`) is edited additively/conditionally: the `premier`/`coach`/`observer`/`admin` paths through each MUST be provably unchanged, verified by regression tests (`sidebar.component.spec.ts`'s existing menu assertions, existing premier-league team/fixture creation tests, `dashboardCache.test.js`). `tests/isolation.test.js` is unaffected — it governs `ApiFeature.filter()`, not any file this feature touches. |
| IV — Single Central Scope Layer | N/A | This feature adds no new data-scoping rule — `Team`/`SeasonMatch`'s `league` field already exists and already discriminates; this only changes what's *required*, not who can *see* what. `checkTeamScope`/`teamScopeFor`/`seasonMatchScopeFor` are untouched. |
| V — Independently Deployable Phases | PASS | Ships as one PR: schema/validation changes, migration script, dashboard field, and frontend page together — not staged, since the frontend page depends on the backend changes being live first (a page that can't create a professional team/fixture without the backend fix is a broken intermediate state, which Principle V forbids merging). `npm run dump-spec` + `npm run gen:types` required in the same PR (route response shape changes: `Team`, `SeasonMatch`, `AdminDashboard` schemas). |
| VI — Positive/Negative Test per Permission | PASS (adapted) | Not a new permission — the applicable form: positive tests proving a professional team/fixture can be created without `ageGroup` and that `totalProScouts` is correct (research.md R5-R7), and regression tests proving premier-league creation still requires `ageGroup` exactly as before (the "negative" half here is "still correctly rejected," not a new 403). |
| VII — Single Source of Truth for Role Names | PASS | No new role-name string literals — `ROLES.PRO_SCOUT` (Backend) and the existing `UserRole` type (frontend, `api.generated.ts`-derived) are reused as-is. |

**Post-research re-check**: The one real gate risk — `SeasonMatch.ageGroup`'s constitutional
"no exception" lock (Principle III/Governance: weakening a binding constraint requires "مراجعة
أمنية موثَّقة وموافقة صريحة من مالك المشروع") — was resolved via the proper channel: paused,
presented three options to the owner, received explicit sign-off, applied the amendment through
`/speckit-constitution` (v1.1.0 → v1.2.0), not worked around silently. No other gate is at risk
post-research. Complexity Tracking is not needed — no violation requires justification, since the
one constraint that *was* weakened went through the constitution's own amendment procedure rather
than being treated as a plan-level exception.

## Project Structure

### Documentation (this feature)

```text
specs/013-professional-league-admin/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── teams-professional.md
│   ├── season-matches-professional.md
│   └── admin-dashboard-proscouts.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
Backend/
├── models/
│   ├── teamModel.js                    # remove ageGroup required:true, add pre-save/pre-findOneAndUpdate hooks
│   └── seasonMatchModel.js             # same conditional-requirement treatment for professional fixtures
├── utils/
│   ├── validation/
│   │   ├── teamValidation.js           # createValidate: skip ageGroup requirement for league=professional
│   │   └── seasonMatchValidation.js    # teamBelongsToMatchAgeGroup: skip ageGroup comparison for professional
│   └── swagger.js                      # Team.ageGroup, SeasonMatch-shape ageGroup → nullable; AdminDashboard.totalProScouts
├── controllers/
│   └── dashboardController.js          # computeAdminDashboardData: + totalProScouts
├── scripts/
│   └── unsetProfessionalTeamAgeGroup.js  # new — migration, mirrors backfillPlayerCreatedBy.js
├── package.json                        # new npm script: unset-professional-team-agegroup
└── tests/
    └── roles/
        ├── teamProfessionalAgeGroup.test.js         # new
        └── seasonMatchProfessionalAgeGroup.test.js  # new — the crash-fix regression

frontend/
├── src/app/
│   ├── app.routes.ts                              # new /professional-league route, roleGuard(['admin'])
│   ├── layout/sidebar/
│   │   ├── sidebar.component.ts                   # new NAV_ITEMS entry + icon case
│   │   └── sidebar.component.spec.ts               # update admin menu href assertion
│   ├── features/
│   │   ├── professional-league/                    # new feature directory
│   │   │   ├── professional-league.routes.ts
│   │   │   ├── professional-league-page/
│   │   │   │   ├── professional-league-page.component.ts
│   │   │   │   └── professional-league-page.component.spec.ts
│   │   │   └── services/                           # only if page-specific composition is needed beyond
│   │   │                                            # TeamService/SeasonMatchService/UserService directly
│   │   ├── users/user-form/
│   │   │   └── user-form.component.ts               # +'proScout' to role query-param whitelist; 3-way dest()
│   │   └── users/user-detail/
│   │       └── user-detail.component.ts              # isObserverCtx/isCoachCtx → 3-way contextGroup
│   └── core/models/
│       ├── team.model.ts                            # ageGroup?: string (optional)
│       ├── season-match.model.ts                     # ageGroup?: string for the professional path
│       ├── dashboard.model.ts                        # AdminDashboard.totalProScouts
│       └── api.generated.ts                          # regenerated via npm run gen:types
├── src/assets/i18n/
│   ├── en.json                                       # NAV.PROFESSIONAL_LEAGUE, PROSCOUTS.*, page copy
│   └── ar.json                                       # same keys, Arabic
└── src/app/features/teams/services/
    └── team.service.ts                               # create() payload: ageGroup optional

openapi.json                                          # regenerated via npm run dump-spec (repo root)
```

**Structure Decision**: Existing web application layout (`Backend/` + `frontend/`), extended with
one new frontend feature directory (`features/professional-league/`, following the same
`<feature>.routes.ts` + page-component convention as `features/observers/`) and targeted edits to
shared files. No new backend route files — all backend changes are to existing models, validation
chains, and one controller, on routes that already exist and are already admin-gated.

## Complexity Tracking

*No unresolved Constitution Check violations — the one real risk (weakening `SeasonMatch.ageGroup`'s
"no exception" constraint) was resolved through the constitution's own amendment procedure, not
through a plan-level exception, so this table is not applicable.*
