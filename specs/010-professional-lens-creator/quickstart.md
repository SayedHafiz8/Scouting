# Quickstart: Validating the proScout Creator Name on the Professional League Lens

## Prerequisites

- Backend running against `mongodb-memory-server` (for automated tests) or a live dev Mongo (for
  manual verification), with age groups and at least two `professional`-league `Team` documents
  seeded.
- Two `proScout` users and an `admin` user, created via the admin `POST /api/v1/users` flow
  (signup is disabled — see CLAUDE.md).
- Backend on `:8000`, frontend on `:4200` (`npm start` in each, per CLAUDE.md commands) for the
  manual/browser check.

## Automated validation (primary — run this first)

```bash
# Backend/
npm test -- tests/roles/adminProfessionalLens.test.js
npm test -- tests/isolation.test.js
npm test -- tests/roles/proScoutDataScope.test.js
```

Expected: all pass, with the isolation suite's assertion count unchanged from before this feature
(Principle III — it is not modified by this feature, only run to confirm it still passes).

```bash
# frontend/
npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: existing `player-list.component.spec.ts` suite passes, plus new assertions for
`creatorName()` covering the populated-object, plain-string, and absent cases (mirroring the
existing `coachName()` test coverage).

## Manual validation (browser, end-to-end proof)

1. Log in as `proScout` A, create a professional player (no team assigned is fine — the orphan
   branch of Stage 2's scope still applies).
2. Log in as `proScout` B, create a second professional player.
3. Log in as `admin`, open the Players page, activate the **Professional League** chip
   (`data-testid="professional-filter"`).
4. Confirm: player from step 1 shows proScout A's name; player from step 2 shows proScout B's name.
   The two names are different and match who actually created each player.
5. Open the player detail page for either player. Confirm no creator name appears there (out of
   scope — `GET /players/:id` is untouched).
6. Log in as a `coach` or `observer` and load the players page. Confirm nothing changes in their
   view — no new column, no new field, nothing observable (their `GET /players` response never
   carries the field).

## Regenerating generated artifacts (required before merge, per Principle V)

```bash
# Backend/ — after updating the @swagger JSDoc above GET /players to document
# the new admin-only createdBy field in the response schema
npm run dump-spec

# frontend/ — regenerate types from the updated openapi.json
npm run gen:types
```

Expected: a small, targeted diff in `openapi.json` and `api.generated.ts` limited to the `Player`
schema's `createdBy` response description — no unrelated operations change shape.

## Success signal

All of the above pass, and the four "Verification" checks in
[`contracts/players-list-response.md`](./contracts/players-list-response.md) are each backed by a
named, currently-passing test.
