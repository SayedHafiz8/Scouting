# Feature Specification: ProScout Role Definition

**Feature Branch**: `002-proscout-role-definition`

**Created**: 2026-08-19

**Status**: Draft

**Input**: User description: "أضف رول proScout للنظام. في نهاية المرحلة يقدر يعمل login بس مايشوفش أي بيانات إطلاقاً. (Stage 1 of docs/scout-pro-plan-v2.md — role definition only, no data access yet)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin assigns the ProScout role (Priority: P1)

An admin creates or edits a user account and assigns them the new `proScout` role, the same way they currently assign `coach`, `observer`, or `admin`.

**Why this priority**: Nothing else in this stage matters if the role cannot exist as a valid, assignable value in the system.

**Independent Test**: Admin creates a user with `role: "proScout"` via the existing user-management flow; the user is persisted with that role and appears correctly in the admin user list.

**Acceptance Scenarios**:

1. **Given** an admin is authenticated, **When** they create a new user and set the role to `proScout`, **Then** the user is created successfully with `role: "proScout"`.
2. **Given** an admin attempts to set a user's role to an arbitrary unsupported string, **When** the request is submitted, **Then** it is rejected by validation exactly as it is today for any other invalid role.

---

### User Story 2 - ProScout user can log in (Priority: P1)

A user with the `proScout` role logs in through the standard login flow and receives a valid access token, exactly like any other role.

**Why this priority**: Login is the explicit success bar named in the stage goal ("يقدر يعمل login").

**Independent Test**: Log in as a seeded `proScout` user and confirm a valid access token and refresh cookie are issued.

**Acceptance Scenarios**:

1. **Given** a user exists with role `proScout` and valid credentials, **When** they log in, **Then** they receive a valid access token and refresh cookie, identical in mechanics to any other role.
2. **Given** a logged-in `proScout` user's token, **When** it's presented to `protect` middleware on any route, **Then** the request is authenticated (identity is recognized) — authorization is a separate concern (see Story 3).

---

### User Story 3 - ProScout sees no data anywhere (Priority: P1)

Immediately after login, a `proScout` user must not be able to read or write any business data. Every list endpoint returns empty, every restricted route returns 403, and the frontend never lands them on a page with real content.

**Why this priority**: This is the safety invariant of the whole staged rollout — the role must exist in a fully locked-down state before any scope is ever added to it (Stage 2+). A gap here is a security regression by construction.

**Independent Test**: As a logged-in `proScout` user, call `GET /players` and confirm an empty array (not an error, not other users' data); call every route guarded by `allowedTo(...)` that excludes `proScout` and confirm 403; log in through the frontend and confirm landing on `/unauthorized`.

**Acceptance Scenarios**:

1. **Given** a logged-in `proScout` user, **When** they call `GET /players`, **Then** the response is `200` with an empty `documents` array (deny-by-default ownership scope), not a `500` error and not another role's data.
2. **Given** a logged-in `proScout` user, **When** they call any route protected by `allowedTo(...)` that does not list `proScout`, **Then** the response is `403`.
3. **Given** a logged-in `proScout` user, **When** they log in via the frontend, **Then** they are routed to `/unauthorized` (the existing deny-by-default fallback from Stage 0), not to any dashboard containing real data.
4. **Given** the known exception `GET /teams` (no `allowedTo` gate on that route today for any role), **When** a `proScout` user calls it, **Then** the response is documented as a known gap to be closed in Stage 2 — not silently treated as acceptable long-term behavior.

---

### Edge Cases

- What happens when an existing regression test suite exercises `coach`, `observer`, or `admin` role behavior? It must pass unchanged — this stage must not alter any existing role's access.
- What happens when the frontend receives a `proScout` user's session on initial load (e.g. page refresh)? It must still resolve the role correctly and re-apply the same deny-by-default redirect, not treat the unrecognized-looking role as an error state.
- What happens if `GET /teams` is called by a `proScout` user before Stage 2 closes that gap? It returns whatever an authenticated user currently gets (undocumented today) — this must be explicitly noted as accepted, temporary exposure, not silently ignored.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept `proScout` as a valid value for a user's `role` field, alongside the existing `admin`, `coach`, `observer` values, in both the data model and request validation.
- **FR-002**: System MUST allow an admin to assign the `proScout` role to a user through the existing role-assignment mechanism (user creation/update), with no new admin-facing workflow required.
- **FR-003**: System MUST authenticate `proScout` users identically to other roles (login issues a valid access token and refresh cookie; `protect` middleware recognizes their identity on subsequent requests).
- **FR-004**: System MUST default to denying `proScout` users all data access: any list endpoint scoped by role ownership MUST return an empty result set (not an error) for this role, and any endpoint gated by an explicit role allowlist that does not include `proScout` MUST return `403`.
- **FR-005**: System MUST NOT require the deny-by-default data scope for `proScout` to be implemented via an explicit ownership mapping — the absence of a mapping for the role is itself sufficient to produce the empty-result behavior (no scope logic is added in this stage).
- **FR-006**: Frontend MUST route a `proScout` user to the existing `/unauthorized` page immediately after login, consistent with the deny-by-default behavior already established for any role without dedicated dashboard/navigation support.
- **FR-007**: System MUST regenerate the published API schema and the generated frontend types so that `proScout` is a recognized role value on both sides of the API contract.
- **FR-008**: System MUST leave all existing behavior for `admin`, `coach`, and `observer` roles completely unchanged — this includes access scope, validation, login, and frontend routing.
- **FR-009**: The known gap where `GET /teams` has no role-based access gate MUST be explicitly documented as an accepted, temporary exception for this stage, to be closed in a later stage.

### Key Entities

- **User (role field)**: Existing entity; its `role` attribute gains one new permitted value, `proScout`, alongside `admin`, `coach`, `observer`. No new attributes are added in this stage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user assigned the `proScout` role can complete login and receive a valid session, with the same reliability as any existing role (100% of valid-credential login attempts succeed).
- **SC-002**: 100% of data-list requests made by a `proScout` user return an empty result rather than an error or another user's data.
- **SC-003**: 100% of role-gated routes that exclude `proScout` correctly reject its requests with `403`.
- **SC-004**: 100% of existing automated tests covering `admin`, `coach`, and `observer` behavior continue to pass without modification.
- **SC-005**: A `proScout` user landing on the frontend after login is shown the unauthorized page in 100% of attempts, with zero exposure of any dashboard, player, match, or user data.

## Assumptions

- This stage is purely definitional: it introduces the role as a recognized identity but intentionally grants it zero data access. Scope (which players/matches/teams a `proScout` user can see) is out of scope here and is addressed in Stage 2 of `docs/scout-pro-plan-v2.md`.
- The existing role-assignment mechanism (admin user creation/update) requires no new UI or endpoint — only the accepted value set changes.
- `GET /teams`'s missing `allowedTo` gate is pre-existing tech debt (documented in the plan) and is explicitly carried forward as a known, temporary exception rather than fixed in this stage, to avoid scope creep into Stage 2 work.
- "Regression on coach/observer/admin" means the existing automated test suites (`Backend/tests/isolation.test.js` and related role/ownership tests) pass unmodified; no new manual regression process is introduced.
