# Phase 1 Data Model: ProScout Role Definition

## Entities

### User (existing entity — one field's allowed values extended)

| Field | Type | Change in this stage |
|---|---|---|
| `role` | `String` enum | Gains `proScout` as a fourth permitted value, alongside `admin`, `coach`, `observer`. Default remains `coach` (unchanged — `proScout` is never a default, only explicitly assigned). |

No new fields, no new collections, no migration. `role` is a plain string on the existing `User` schema (`Backend/models/userModel.js`); its `enum` is already derived from the shared `ROLE_VALUES` constant, so this stage's change is entirely at the constant's definition site (`Backend/constants/roles.js`), not the schema.

### Validation rules

- `role` (when present in a request body) MUST be one of `ROLE_VALUES` — unchanged mechanism (`express-validator` `isIn(ROLE_VALUES)` in `Backend/utils/validation/userValidation.js`), now accepting one more value because the underlying constant grew.
- No new validation rule is introduced. Assigning `proScout` to a user goes through the exact same admin user-creation/update validation path as any other role.

### State / relationships

- No state machine changes. A `proScout` user, once created, behaves like any user record with respect to soft-delete (`active` flag), password reset, and auth token issuance — none of that logic branches on role.
- No relationship changes: `proScout` is not yet referenced by any ownership field (`Player.coach`, `Player.observers`, etc.) in this stage — that is explicitly Stage 2's work.

## Out of scope for this stage (tracked for Stage 2)

- `Player.createdBy` field does not exist yet and is not created here (Constitution TODO(PLAYER_OWNER_FIELD), Stage 2 concern).
- No `ownerFields` entry for `proScout` on any resource.
- No `baseFilterFn` league-scoping.
