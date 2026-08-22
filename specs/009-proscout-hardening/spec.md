# Feature Specification: proScout Hardening (Stage 7)

**Feature Branch**: `009-proscout-hardening`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "المرحلة 7 — التصليب الشامل لرول proScout (hardening)، مبنية على docs/scout-pro-plan-v2.md §'المرحلة 7' وبنود checklists/security.md (CHK001-CHK035) من specs/008-proscout-matches-attendance/"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Complete Endpoint Disposition Inventory (Priority: P1)

A security reviewer needs a single, current document that states — for every operation the API exposes — exactly how a `proScout` user is treated: allowed unfiltered, allowed but scoped to the professional league, or denied. Without this, "deny by default" is an unverified claim rather than a proven property of the system.

**Why this priority**: Every other story in this stage depends on knowing what the current, ground-truth surface is. Negative tests, E2E checks, and the router-level guard are all built against this inventory.

**Independent Test**: Can be fully delivered and reviewed on its own — run `npm run dump-spec`, cross-reference every route in `Backend/routes/*.js` against `openapi.json` and `allowedTo(...)` declarations, and produce a document with zero "unclassified" rows.

**Acceptance Scenarios**:

1. **Given** the updated `openapi.json` and the current `Backend/routes/*.js`, **When** the inventory is built, **Then** every operation has exactly one disposition for `proScout`: Allowed, Scoped, or Denied — none are left blank.
2. **Given** the Stage 4/5 inventory (`specs/005-proscout-players-write/contracts/endpoint-inventory.md`, 83 operations), **When** the new inventory is produced, **Then** it explicitly lists which of those 83 operations changed disposition, which are unchanged, and which are new since Stage 5 — it does not silently replace the old document without a diff.
3. **[CORRECTED DURING IMPLEMENTATION — the route file, not just the constitution's prose summary, was read directly]** **Given** `GET /ages` and `GET /ages/:id`, **When** they are classified, **Then** the row records the fact as it actually is in `ageGroupRouter.js`: both routes carry **no** `protect` and **no** `allowedTo` at all — `proScout` receives 200, identically to every other role and to a request with no bearer token whatsoever (Constitution C-3, `TODO(AGES_UNAUTHENTICATED_READ)`). There is no `allowedTo`-based denial for these two GET operations to record; only `POST /ages` (admin-only) denies `proScout`. The row must not claim a 403 that does not occur.

---

### User Story 2 - Negative Access Proof for Restricted Domains (Priority: P1)

A security reviewer needs automated, repeatable proof — not a one-time manual check — that `proScout` cannot read or write age-group, user, observer, or evaluation data through any route, including attempts to widen scope via query parameters.

**Why this priority**: These four domains hold data explicitly excluded from `proScout`'s mandate (Constitution C-3, C-4, and Principle II's role-scoping intent). A regression here is a silent data-exposure bug, not a cosmetic one.

**Independent Test**: Run the new backend test file(s) in isolation; every test asserts a specific denial status code from a real HTTP request through the app, never a UI assumption.

**Acceptance Scenarios**:

1. **[CORRECTED DURING IMPLEMENTATION]** **Given** a `proScout` bearer token, **When** the one `protect`-bearing route in `ageGroupRouter.js` is called — `POST /ages` (there is no update or delete route for age groups in this router at all) — **Then** the response is 403.
2. **[CORRECTED DURING IMPLEMENTATION]** **Given** the same token, **When** `GET /ages` or `GET /ages/:id` is called, **Then** the response is 200 — identically to every other role and to a request with no token at all, since neither route carries `protect` or `allowedTo`. A clearly-labeled test documents this single, flat fact (not a "proScout denied, but no-token allowed" contrast that does not exist) so the gap stays visible rather than being implied fixed.
3. **Given** a `proScout` token, **When** any route under `userRouter.js` is called (list, detail, create, update, deactivate, restore, vault password/vault media), **Then** the response is 403.
4. **[CORRECTED DURING IMPLEMENTATION — no dedicated "observers" router exists]** **Given** a `proScout` token, **When** `PATCH /players/:id/observers` (the admin-only observer-assignment endpoint, in `playerRouter.js`) is called, **Then** the response is 403. Observer list/detail is not a separate route surface — it is the same `userRouter.js` operations Scenario 3 already covers (admin manages all user records, coaches and observers alike, through one router); there is nothing additional to test here beyond the assignment endpoint.
5. **Given** a `proScout` token, **When** any `coachEvaluations` or `observerEvaluations` route (read or write) is called, **Then** the response is 403.
6. **Given** a `proScout` token and a route that accepts a scope-relevant query parameter (e.g. `league`, `ageGroup`) on one of the above domains, **When** the parameter is set to a value that would widen or bypass the restriction, **Then** the request is still denied — the parameter is not honored before the role check.

---

### User Story 3 - End-to-End Denial Proof in the Browser (Priority: P2)

A security reviewer needs confirmation that the denial holds in the actual running application, not only at the HTTP-test level: a logged-in `proScout` user never sees the restricted navigation items and is redirected away from restricted screens.

**Why this priority**: Backend tests prove the API is closed; this closes the loop by proving the UI cannot be tricked into showing a false affordance or leaking data through a client-side-only guard (Constitution Principle I).

**Independent Test**: Run the new Playwright spec against a live backend + built frontend; it logs in as a seeded `proScout` user and drives real navigation.

**Acceptance Scenarios**:

1. **Given** a `proScout` user logs in through the UI, **When** the session lands, **Then** the sidebar does not render Age Groups, Users, or Observers items.
2. **Given** a logged-in `proScout` session, **When** the browser is navigated directly to `/age-groups`, `/users`, or `/observers` by URL, **Then** the app redirects to whatever destination `RoleLandingService.landingFor('proScout')` currently returns (`/dashboard/proScout` as of Stage 5 — **not** `/unauthorized`, which is only the fallback for roles that case statement doesn't recognize) — the test reads that destination from the shared service at run time rather than hardcoding either path string.
3. **Given** the redirect in Scenario 2, **When** the underlying API call for that screen's data is inspected, **Then** it also returns a 403 — the E2E test does not treat a client-side redirect alone as proof.

---

### User Story 4 - Deny-by-Default Guarantee, Correctly Scoped to What the Architecture Actually Provides (Priority: P2)

A maintainer adding a new route six months from now, with no memory of this hardening effort, needs the system to make "I forgot to restrict `proScout` on this" as hard to do silently as possible — and needs the test suite to be honest about which part of that guarantee is a real, self-enforcing code property versus which part depends on a human (or CI check) keeping a document in sync.

**Why this priority**: Per-route negative tests (Story 2) only cover routes that exist today. This story is what keeps "deny by default" meaningful for routes that don't exist yet — but only for the slice of that promise the codebase can actually keep.

**[CORRECTED DURING PLANNING — see `research.md` R4]**: The original framing of this story assumed omitting `allowedTo` from a new route denies `proScout` by default. Re-reading Constitution Principle II shows the opposite is explicitly documented as the current, accepted architecture: *"غياب `allowedTo` يعني 'كل رول مسجّل'"* (absence of `allowedTo` means "every registered role" is allowed) — i.e. a route with `protect` but no `allowedTo` is open to `proScout`, not closed to it. There is no code-level mechanism today that flips this default; Principle II relies on the endpoint inventory (Story 1) plus PR review to catch the omission, not on middleware behavior. Introducing a global reject-unless-declared middleware would be an architecture change with a real risk of altering existing-role behavior on any route whose `allowedTo` is already incomplete — out of scope for an audit stage under Principle III. This story is therefore split into the two guarantees that are honestly separable:

**Independent Test**: (a) Unit-test `allowedTo(...)` itself as a pure function of its role-list argument — independent of which production routes currently call it — proving it correctly denies any role not listed; (b) add a CI-checkable count assertion that the number of operations enumerated across `Backend/routes/*.js` matches the number of rows in the Stage 7 endpoint inventory, so a route added without a matching inventory row (and therefore without a reviewed `proScout` disposition) fails the check even though the route itself would still be reachable.

**Acceptance Scenarios**:

1. **Given** `allowedTo("admin")` (or any role subset not including `proScout`), **When** it is invoked directly in a unit test with a mock request whose `req.user.role` is `"proScout"`, **Then** it calls `next` with a 403 `AppError` — proving the function itself, not any specific route's wiring, denies correctly.
2. **Given** `allowedTo("proScout")` (or any list including it), **When** invoked the same way, **Then** it calls `next()` with no error — the same test file proves both the positive and negative case for the function in isolation, so the guard is not tautological against production routes.
3. **Given** the current `Backend/routes/*.js` files and the Stage 7 endpoint inventory (Story 1), **When** the operation-count check runs, **Then** the two counts are equal; a route added to a router file without a corresponding inventory row makes the check fail, surfacing the omission even though `allowedTo`'s own behavior (Scenario 1/2) is unaffected by it.

---

### User Story 5 - Denial Logging Verification (Priority: P3)

A security reviewer needs confirmation that every denied `proScout` access attempt is captured in a log with enough detail (user id, role, path, requested resource id) to support an incident investigation, per Constitution Principle IV.

**Why this priority**: Lower priority than proving denial itself, but without it a real incident is undetectable after the fact even though the request was correctly blocked.

**Independent Test**: Trigger a handful of denied requests across different layers (role gate, ownership guard, scope layer) and assert the logger was called with the required fields — an automated assertion, not a manual log inspection.

**Acceptance Scenarios**:

1. **Given** a `proScout` request denied by `allowedTo` (role gate), **When** the request completes, **Then** a log entry is recorded containing the user id, role, request path, and (when applicable) the requested resource id.
2. **Given** a `proScout` request denied by an `ownership.js` guard (e.g. direct access to an out-of-scope player id), **When** the request completes, **Then** the same fields are recorded.
3. **Given** the assertions in Scenarios 1-2, **When** a reviewer inspects the test output, **Then** it is the automated assertion — not a manual log-file read — that constitutes proof for this story's acceptance.

---

### User Story 6 - Isolation Contract Extended, Not Modified (Priority: P1)

A maintainer needs `tests/isolation.test.js` — the binding data-isolation contract per Constitution Principle III — to cover `proScout` scenarios, while every pre-existing assertion in that file continues to pass byte-for-byte unmodified.

**Why this priority**: This is the file Constitution Principle III singles out as NON-NEGOTIABLE; touching an existing expectation in it requires a documented security review outside normal PR review, so getting this boundary right is a hard gate, not a preference.

**Independent Test**: Diff the file before and after this stage; every pre-existing `describe`/`it` block is byte-identical, and all `proScout` coverage appears in new blocks appended to the file.

**Acceptance Scenarios**:

1. **Given** the current `tests/isolation.test.js`, **When** this stage's changes are applied, **Then** a diff shows only additions (new `describe`/`it` blocks) — zero lines changed or removed inside existing blocks.
2. **Given** the extended file, **When** the full suite runs, **Then** every pre-existing assertion and every new `proScout` assertion passes.

---

### User Story 7 - Full Regression on Existing Roles (Priority: P1)

A maintainer needs proof that `coach`, `observer`, and `admin` see exactly the same data, in the same shape, after this stage as before it — across every endpoint family Constitution Principle III names.

**Why this priority**: This is the same NON-NEGOTIABLE guarantee as Story 6, applied to the wider regression surface (not just the isolation contract file) and to the display masks that depend on role.

**Independent Test**: Run the regression suite against a snapshot of expected counts/content computed directly from seeded fixtures, independent of the code path under test.

**Acceptance Scenarios**:

1. **Given** seeded fixtures for `coach`, `observer`, and `admin`, **When** `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`, `GET /seasonMatches`, and `GET /dashboard/{coach,observer,admin}` are called for each role, **Then** both the result **count** and result **content** match a value computed independently from the fixtures — not merely a 200 status.
2. **Given** a `coach` request for a player, **When** the response is inspected, **Then** `maskObservedForCoach` still hides `observers` and reports `observed` as `pending`, unchanged from pre-Stage-7 behavior.
3. **Given** an `observer` request for a player, **When** the response is inspected, **Then** `maskCoachForObserver` still hides `player.coach`, unchanged from pre-Stage-7 behavior.

---

### Edge Cases

- What happens when the endpoint inventory (Story 1) finds an operation present in `Backend/routes/*.js` but absent from `openapi.json` even after `npm run dump-spec`? → The inventory records it as a documentation gap on the operation's row rather than skipping the row; it does not block classifying the operation's actual `proScout` disposition, which is still determined by reading the route file.
- What happens when a route has `protect` but no `allowedTo` at all — does the Story 4 guarantee deny `proScout` on it automatically? → **No.** Per Constitution Principle II, absence of `allowedTo` means every registered role, including `proScout`, is allowed. Story 4's guarantee is therefore two narrower, honestly-provable things: `allowedTo(...)` itself always denies roles not in its list (a unit-level property, independent of which routes use it), and the operation-count check against the Story 1 inventory fails CI if a route exists with no matching inventory row — surfacing the omission for review rather than closing it in code. Routes with no `protect` at all (the `GET /ages` shape) are outside even the count check's reach in the same way and stay covered only by C-3's documented exception, surfaced through the inventory (Story 1), not through Story 4.
- What happens if a `proScout`-scoped endpoint (e.g. `GET /players`) is included by mistake in the Story 2 negative-test set, since it is legitimately Scoped rather than Denied? → Story 2's test set is drawn only from the Denied rows of the Story 1 inventory; Scoped and Allowed rows are explicitly out of this story's scope and are already covered by Stage 2-6 tests.
- What happens when a denied request in Story 5 originates from a route with no matching resource id (e.g. a list endpoint, not a `/:id` route)? → The log entry omits the resource id field for that request rather than recording a placeholder value; user id, role, and path are still required.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The stage MUST produce a complete endpoint inventory built by cross-referencing `Backend/routes/*.js` against the `openapi.json` produced by `npm run dump-spec` — the route files, not `openapi.json` alone, are the source of truth for which operations exist, per Constitution Principle VI.
- **FR-002**: The inventory MUST classify every operation's disposition for `proScout` as exactly one of: **Allowed** (unfiltered), **Scoped** (filtered to the professional-league scope established in Stage 2), or **Denied** (403) — no operation may be left unclassified, and an unclassified operation is itself a failing condition for this stage.
- **FR-003**: The inventory MUST reconcile explicitly against `specs/005-proscout-players-write/contracts/endpoint-inventory.md` (83 operations): it supersedes that document as the current source of truth, and it MUST list, by operation, what changed since Stage 5 (added, removed, reclassified) rather than presenting itself as an unrelated, from-scratch document.
- **FR-004** **[CORRECTED DURING IMPLEMENTATION — verified directly against `Backend/routes/ageGroupRouter.js`]**: The inventory MUST record `GET /ages` and `GET /ages/:id` as `OPEN`: neither route carries `protect` nor `allowedTo`, so `proScout` receives 200 — identically to every other role and to a request with no bearer token at all (Constitution C-3, `TODO(AGES_UNAUTHENTICATED_READ)`). The inventory MUST NOT record these two rows as `proScout`-Denied; only `POST /ages` (the router's sole `protect`+`allowedTo(admin)` route — there is no update or delete route for age groups) denies `proScout`. This stage MUST NOT add `protect` to the two GET routes — doing so would reopen a constitutionally Resolved Decision (C-3) and change behavior for `admin`/`coach`/`observer`, violating Principle III.
- **FR-005**: A negative backend test MUST cover the one `protect`-bearing route under the age-groups domain (`POST /ages`, `ageGroupRouter.js`), asserting `proScout` receives 403.
- **FR-006** **[CORRECTED DURING IMPLEMENTATION]**: A negative backend test MUST document that `GET /ages` and `GET /ages/:id` return 200 for `proScout`, for every other role, and for a request carrying no bearer token at all — one flat fact, not a `proScout`-denied-vs-unauthenticated-allowed contrast, since no such contrast exists in the current code. The test exists so the gap is visible in the suite rather than implied closed by the adjacent `POST /ages` denial test.
- **FR-007**: Negative backend tests MUST cover the full `userRouter.js` surface (list, detail, create, update, deactivate, restore, vault-password verification, vault media reads), asserting `proScout` receives 403 on each.
- **FR-008** **[CORRECTED DURING IMPLEMENTATION]**: A negative backend test MUST cover `PATCH /players/:id/observers` (the admin-only observer-assignment endpoint), asserting `proScout` receives 403. There is no separate "observers" router to sweep — observer list/detail views are served by the same `userRouter.js` operations FR-007 already covers.
- **FR-009**: Negative backend tests MUST cover `coachEvaluations` and `observerEvaluations` routes, both read and write, asserting `proScout` receives 403.
- **FR-010**: Every negative test in FR-005, FR-007, FR-008, and FR-009 MUST assert a specific denial status code (403, or 404 only where existence must not be disclosed) obtained from an actual HTTP request through the app — a 200 response with an empty body MUST NOT be accepted as proof of denial, per Constitution Principle I and VI.
- **FR-011**: At least one negative test per domain in FR-005, FR-007, FR-008, and FR-009 MUST attempt to widen or bypass the restriction via a scope-relevant query parameter, and MUST assert the attempt is still denied.
- **FR-012**: Two distinct, separately-passing regression checks MUST exist for the deny-by-default guarantee, per the corrected understanding in Story 4: (a) a unit test proving `allowedTo(...)` denies any role not in its argument list and allows any role that is, independent of any specific production route; and (b) a test asserting the count of operations enumerated in `Backend/routes/*.js` equals the number of rows in the Stage 7 endpoint inventory (Story 1), so a route added without a corresponding, reviewed inventory row fails CI even though `allowedTo`'s own behavior is unaffected by the omission. Neither check MUST be described as "denying a future unguarded route by construction" — that property does not exist in the current architecture (Constitution Principle II: absence of `allowedTo` allows every role).
- **FR-013**: The E2E suite MUST verify that a logged-in `proScout` session does not render Age Groups, Users, or Observers items in the sidebar navigation.
- **FR-014**: The E2E suite MUST verify that direct browser navigation to `/age-groups`, `/users`, and `/observers` while authenticated as `proScout` redirects to the same destination `RoleLandingService` returns for this role for a denied route — the E2E assertion MUST read that destination from the shared service (or a fixture derived from it) rather than a separately hardcoded path string, consistent with the precedent set by `role-landing-destinations.spec.ts` in Stage 6.
- **FR-015**: For each E2E denial scenario in FR-014, the test MUST also confirm the underlying API request for that screen's data returns 403 — a client-side redirect alone MUST NOT be treated as sufficient proof, per Constitution Principle I.
- **FR-016**: Denied `proScout` access attempts MUST be logged with, at minimum, the user id, the role, the request path, and the requested resource id when the route is a `/:id`-style route — per Constitution Principle IV — and this MUST be proven by an automated test assertion on the logging call/output, not by a manual log review alone.
- **FR-017**: `tests/isolation.test.js` MUST be extended with new `describe`/`it` blocks covering `proScout` scenarios; this stage MUST NOT modify, remove, or alter the expected outcome of any pre-existing block in that file. Any change to a pre-existing expectation is out of scope for this stage and requires the documented security review Constitution Principle III mandates for such a change.
- **FR-018**: A regression test suite MUST prove, for `coach`, `observer`, and `admin`, that both the result **count** and result **content** of `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`, `GET /seasonMatches`, and `GET /dashboard/{coach,observer,admin}` are unchanged from pre-Stage-7 behavior, computed against an independent expectation derived from seeded fixtures rather than from the code path under test.
- **FR-019**: The regression suite MUST additionally verify that `maskObservedForCoach` (coach) and `maskCoachForObserver` (observer) continue to behave exactly as before this stage.
- **FR-020**: All new backend test files MUST build fixtures via `Backend/tests/helpers/factory.js`, consistent with the project's existing test convention, and MUST NOT weaken or bypass the global I/O mocks in `tests/setup.js`.

### Key Entities

*(Not applicable — this stage audits and hardens access to existing entities; it introduces no new data model.)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the operations listed in the Stage 7 endpoint inventory carry a stated `proScout` disposition (Allowed, Scoped, or Denied) — zero operations are left unclassified.
- **SC-002**: Every route in the age-groups, users, observers, and evaluations domains has at least one passing automated denial assertion, and the inventory's "Denied" row count for these domains matches the number of passing denial assertions exactly (one assertion per denied route, not per `it`/`test.each` block).
- **SC-003**: `allowedTo(...)`'s role-list denial behavior is proven correct independent of any specific route (unit-level), and the inventory/route operation-count check fails when a route exists with no matching inventory row — together giving a route added without an inventory entry a CI failure, without requiring a new per-route test to be written to catch it.
- **SC-004**: `tests/isolation.test.js` passes in full, with a diff against its pre-Stage-7 version showing zero changes to any line inside a pre-existing `describe`/`it` block.
- **SC-005**: The regression suite shows zero difference in result count or result content for `coach`, `observer`, and `admin` across all five endpoint families named in FR-018, compared to their pre-Stage-7 values.
- **SC-006**: The E2E suite demonstrates a `proScout` session can neither see nor reach (by direct URL) the Age Groups, Users, or Observers screens, with both the UI redirect and the underlying API denial verified.
- **SC-007**: Every denied `proScout` request exercised by the test suite has a corresponding logged entry containing user id, role, and path, verified by automated assertion.

## Assumptions

- This stage introduces no new backend routes, models, or frontend screens — it audits, tests, and documents the access surface established by Stages 0-6.
- Constitution Constraint C-3 (`GET /ages`, `GET /ages/:id`, `GET /teams`, `GET /teams/:id` keep their existing unauthenticated/broad-read behavior for `admin`/`coach`/`observer`) is a Resolved Decision and is out of scope to change; this stage documents the `proScout`-specific slice of it (denied via `allowedTo`) without touching the underlying `protect`-less routes.
- `specs/005-proscout-players-write/contracts/endpoint-inventory.md` becomes historical once this stage's inventory is published; this stage's inventory (at `specs/009-proscout-hardening/contracts/endpoint-inventory.md`) is the new source of truth going forward, and the two are reconciled with an explicit diff rather than the old file being silently abandoned.
- Stage outputs live under this feature's own directory and the existing top-level test directories, not under `specs/008-proscout-matches-attendance/`: the endpoint inventory and its supporting docs go in `specs/009-proscout-hardening/contracts/`, new backend test file(s) go in `Backend/tests/` alongside the existing suite, extensions to the isolation contract are made in place in `Backend/tests/isolation.test.js`, and new E2E coverage goes in `e2e/tests/`.
- "Log review" (Plan §7.5) is delivered as automated test assertions on logger calls (FR-016), not a manual, undocumented log inspection step — this makes the requirement objectively verifiable and repeatable in CI.
- The deny-by-default guarantee (Story 4 / FR-012) is, per Constitution Principle II, not a property `allowedTo`'s absence provides on its own — a route with `protect` and no `allowedTo` is open to every registered role today. This stage's guard is therefore split into a unit-level proof of `allowedTo`'s own correctness plus an inventory/route-count parity check, not a claim that future unguarded routes are denied in code. [CORRECTED DURING PLANNING — see `research.md` R4; the original wording of this stage's plan assumed the opposite.]
- `e2e/seed.js` currently seeds only a `coach` account and `e2e/helpers/auth.ts` only exports `loginAsCoach` — no `proScout` (or `observer`) E2E fixture has ever existed. FR-013-015 require this stage to extend `seed.js` (idempotent create-or-skip, same admin-API pattern as the coach account) and add a `loginAsProScout` helper; this is in scope as a prerequisite for Story 3, not a pre-existing capability being reused. [Gap surfaced during planning — see `research.md` R5.]
- Denied role-gate requests (`allowedTo` rejections) are not logged today — only ownership/scope-layer denials are, via the existing `Backend/utils/accessLog.js`. FR-016 requires this stage to add one call site inside `allowedTo`'s rejection branch, reusing that same helper's field contract (extended with an `event: "role_denied"` variant) rather than the logging pipeline being pre-existing and only needing a test. This is the one production code change this stage makes. [Gap surfaced during planning — see `research.md` R1/R2.]
