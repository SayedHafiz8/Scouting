# Quickstart: Validating proScout Hardening (Stage 7)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is a validation guide, not an implementation guide — it proves the stage's Success Criteria after the tasks in `tasks.md` are done. It does not contain model/service/controller code.

## Prerequisites

- Backend and frontend dependencies installed (`Backend/`: `npm install`; `frontend/`: `npm install`; `e2e/`: `npm install`).
- `Backend/config.env` present (see `config.env.example`) for local runs; not needed for `npm test` (uses `mongodb-memory-server`).
- `e2e/.env` present with `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` already set (existing requirement) — Stage 7 adds `E2E_PROSCOUT_EMAIL` / `E2E_PROSCOUT_PASSWORD` to this file, see `.env.example`.

## 1. Refresh the API spec (FR-001)

```bash
cd Backend
npm run dump-spec
```

Confirm `openapi.json` at the repo root changed only if a route's shape actually changed this stage (none is expected — see plan.md's Constraints). No diff is a valid, expected outcome.

## 2. Build/verify the endpoint inventory (Story 1 / SC-001)

Cross-reference every file in `Backend/routes/*.js` against `openapi.json`, following `contracts/endpoint-inventory-schema.md`. Confirm:
- Every operation has a `proScoutDisposition` — zero blank rows (SC-001).
- The reconciliation section against the Stage 5 baseline (83 operations) is present and its delta list matches what actually changed.
- `GET /ages`, `GET /ages/:id`, `GET /teams`, `GET /teams/:id` are `OPEN` with `Enforcing layer` naming `C-3`.

## 3. Run the new negative/regression backend tests (Stories 2, 4, 5, 6, 7)

```bash
cd Backend
npm test -- tests/roles/proScoutHardeningNegative.test.js
npm test -- tests/roles/proScoutRouterGuard.test.js
npm test -- tests/roles/proScoutDenialLogging.test.js
npm test -- tests/isolation.test.js
npm test -- tests/roles/proScoutFullRegression.test.js
```

Expected: all pass. For `tests/isolation.test.js` specifically, additionally run:

```bash
git diff -- Backend/tests/isolation.test.js
```

Confirm the diff shows only added lines/blocks — zero removed or modified lines inside any pre-existing `describe`/`it` (SC-004).

Then run the full backend suite to confirm nothing else regressed:

```bash
npm test
```

## 4. Run the full backend suite once more with coverage of coach/observer/admin regression (SC-005)

Already included in step 3's `npm test` run; independently confirm by reading `proScoutFullRegression.test.js`'s assertions against the fixture-computed expected counts for `GET /players`, `GET /players/counts`, `GET /players/reports/average-ratings`, `GET /seasonMatches`, and `GET /dashboard/{coach,observer,admin}`, plus `maskObservedForCoach` / `maskCoachForObserver`.

## 5. E2E denial proof (Story 3 / SC-006)

Requires the backend on `:3000`, frontend built and served (per `e2e/README` / CI job pattern), then:

```bash
cd e2e
node seed.js          # idempotent — now also seeds the proScout account
npx playwright test tests/proscout-hardening.spec.ts
```

Expected: passes, proving (a) no restricted nav items render for `proScout`, (b) direct navigation to `/age-groups`, `/users`, `/observers` redirects to the shared `RoleLandingService` destination, and (c) the underlying API calls for those screens return 403.

## 6. Full regression gate (CI parity)

```bash
cd Backend && npm test
cd ../frontend && npx ng test --watch=false --browsers=ChromeHeadless && npm run build
cd ../e2e && npx playwright test
```

All three MUST pass — this stage is not done until CI parity is confirmed locally, per Constitution's quality gates.

## Success Criteria checklist (cross-reference to spec.md)

| SC | Verified by |
|---|---|
| SC-001 | Step 2 |
| SC-002 | Step 3 (`proScoutHardeningNegative.test.js`) cross-checked against the inventory's Denied-row count |
| SC-003 | Step 3 (`proScoutRouterGuard.test.js`) |
| SC-004 | Step 3 (`git diff` on `isolation.test.js`) |
| SC-005 | Step 4 |
| SC-006 | Step 5 |
| SC-007 | Step 3 (`proScoutDenialLogging.test.js`) |
