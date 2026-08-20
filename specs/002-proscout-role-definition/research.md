# Phase 0 Research: ProScout Role Definition

No open `NEEDS CLARIFICATION` markers remain from the spec — the plan doc (`docs/scout-pro-plan-v2.md`) and the project constitution (`.specify/memory/constitution.md`) had already resolved every decision relevant to this stage. This document records the confirmations made by reading the actual code, per Constitution Principle I ("proof of denial MUST be an actual HTTP response / verified behavior, not an assumption").

## Decision: Role constant is the only backend touch point for the enum itself

**Decision**: Add `PRO_SCOUT: 'proScout'` to `ROLES` in `Backend/constants/roles.js`. No other file needs a literal edit for the enum/validation to accept it.

**Rationale**: `Backend/models/userModel.js:22-26` already derives `role.enum` from `ROLE_VALUES` (imported from `constants/roles.js`), and `Backend/utils/validation/userValidation.js:58-59,100-101` already derives its `isIn(ROLE_VALUES)` check from the same constant. This is exactly the Stage 0 "single source of truth" work (Constitution Principle VII) — confirmed by reading both files directly rather than assuming.

**Alternatives considered**: Editing the Mongoose enum and the validator's allowed-values list independently was the pre-Stage-0 pattern; it's no longer applicable since both already import from the shared constant.

## Decision: No `ownerFields` entry, no `allowedTo` grant, no `ownership.js` branch — by design

**Decision**: This stage deliberately does **not** add `proScout` to any `ownerFields` map, any route's `allowedTo(...)` list, or as a named branch in `ownership.js`. Its absence is the mechanism that produces zero access.

**Rationale**: Confirmed by reading `Backend/utils/apiFeatures.js:84-93` (`buildOwnerScope`): a role missing from a resource's `ownerFields` map resolves to `MATCH_NOTHING` (empty result, not an error) — this is existing, unmodified behavior. Confirmed by reading `Backend/middlewares/ownership.js:12-45` (`checkPlayerOwnership`, representative of all four ownership guards after Stage 0's hardening): the explicit switch over `admin`/`observer`/`coach` ends in an unconditional `403` for any other role — the Stage 0 "explicit deny" refactor already covers a role it has never heard of, with no code change required to keep denying `proScout`.

**Alternatives considered**: Explicitly adding a `proScout: null`-style deny entry was considered for documentation clarity, but the existing map/switch semantics already treat "absent" as "denied" — adding a redundant entry would only create a place for a future edit to accidentally grant access by uncommenting/changing it. Absence is the safer signal and matches Constitution Principle II's intent.

## Decision: Frontend requires no code change for the `/unauthorized` landing

**Decision**: No edit to `role.guard.ts`, `dashboard.routes.ts`, or `RoleLandingService` is needed for a `proScout` user to land on `/unauthorized` after login.

**Rationale**: Confirmed by reading `frontend/src/app/core/services/role-landing.service.ts`: `landingFor()` is a `switch` over known role strings (`admin`/`coach`/`observer`) with `default: return ['/unauthorized']`. A role string it doesn't recognize by name — `proScout` — already falls into that default branch. This was exactly the Stage 0 fix for Constraint C-1 (redirect loop), verified here to already generalize to a role invented after that fix shipped.

**Alternatives considered**: None — this is the intended payoff of Stage 0 centralizing the landing logic instead of writing a Stage 1 special case.

## Decision: `GET /teams` remains an accepted, already-documented exception

**Decision**: This stage does not touch `teamRouter.js`. The absence of `allowedTo(...)` on `GET /teams` is not fixed here.

**Rationale**: Constitution Constraint C-3 already rules on this: `GET /teams` and `GET /teams/:id` stay open for all registered roles by deliberate decision (closing them would change behavior for existing roles, which Principle III forbids outside a dedicated stage). C-3 additionally requires the *new* role to eventually get a `league`-scoped view of `/teams` via `baseFilterFn` — but that is explicitly deferred to the stage that builds scoping (Stage 2 in `docs/scout-pro-plan-v2.md`), not this one. This stage's job is only to document the temporary exposure, matching spec FR-009.

**Alternatives considered**: Adding `allowedTo` to `/teams` now was rejected — it would be new behavior for `admin`/`coach`/`observer` too (routes have no role gate today), violating Principle III's non-negotiable no-behavior-change rule outside the stage where that specific change is the point.

## Decision: Regenerate `openapi.json` and `api.generated.ts` in this same stage

**Decision**: Run `npm run dump-spec` (Backend) then `npm run gen:types` (frontend) as part of this stage's implementation, not deferred.

**Rationale**: Constitution Principle V requires contract regeneration in the same PR as any route/role shape change, since frontend `UserRole` is derived from `openapi.json`. The role enum is part of the `User` schema's public shape even though no route signature changes.

**Alternatives considered**: Skipping regeneration since no route path changes — rejected; the enum value itself is part of the generated `UserRole` type and needs to be present so the frontend type system doesn't diverge from what the backend now accepts.
