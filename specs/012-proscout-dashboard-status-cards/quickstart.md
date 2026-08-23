# Quickstart: ProScout Dashboard Status Cards

## Prerequisites

- Backend running with a seeded proScout user (`seedAgeGroups()` not required — this feature
  doesn't touch age groups) and at least one professional-league `Team` for player creation.
- Frontend dev server (`ng serve`) pointed at that backend.

## 1. Backend contract check (automated)

```bash
cd Backend
npm test -- tests/roles/proScoutDashboard.test.js
```

Expected: existing tests still pass unmodified, plus new assertions (added in this feature) proving:
- a proScout with players `[selected, selected, pending, observed, rejected]` gets back
  `{ selectedPlayers: 2, pendingPlayers: 2, rejectedPlayers: 1 }` and
  `totalPlayers === selectedPlayers + pendingPlayers + rejectedPlayers`.
- a proScout with zero players gets back all three fields as `0`, not missing/undefined.
- two different proScouts' counts don't leak into each other (proScout A's players never appear in
  proScout B's counts).
- a report authored by the proScout on a player that has left their `createdBy` scope does not
  affect the status counts (they follow `playerScopeFor`, not report authorship) — reuses the
  existing out-of-scope fixture pattern already in this test file / `proScoutCreatedByScope.test.js`.

## 2. Regression check (automated, mandatory per Constitution Principle III)

```bash
cd Backend
npm test -- tests/roles/coachDashboard.test.js tests/roles/observerDashboard.test.js
npm test    # full suite — tests/isolation.test.js must still pass unmodified
```

Expected: zero failures, zero changed assertions in files this feature does not own.

## 3. Contract regen (mandatory, Constitution Principle V)

```bash
cd Backend && npm run dump-spec
cd ../frontend && npm run gen:types
git diff --stat openapi.json frontend/src/app/core/models/api.generated.ts
```

Expected diff: additive only — three new `integer` properties on `ProScoutDashboard`, nothing else
changes shape.

## 4. Manual browser check (visual — not covered by automated tests)

1. Log in as a proScout with a mix of player statuses (or create players via `POST /players` and
   `PATCH /players/:id` to set statuses, or via the admin professional-league lens).
2. Navigate to the proScout dashboard.
3. Confirm three new cards appear (Selected / Pending / Rejected) alongside the existing Total
   Players / Upcoming Matches / Total Reports cards, with correct counts and no age-group-related
   card or column anywhere on the page.
4. Confirm the total players card's number equals the sum of the three new cards.
5. Click through a status card (if linked with `queryParams`, mirroring the coach dashboard's
   `/players?status=selected` pattern) and confirm it lands on the player list pre-filtered to that
   status, scoped to this proScout's own players.

## 5. Frontend unit check (automated)

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless --include='**/pro-scout-dashboard.component.spec.ts'
```

Expected: existing tests pass, extended with assertions that the three new fields render as stat
cards with the correct values and labels.
