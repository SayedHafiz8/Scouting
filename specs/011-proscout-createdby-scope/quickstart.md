# Quickstart: Validating the createdBy-only proScout Scope

Backend-only change — no frontend build or e2e run is required to validate the core contract, though
a manual UI smoke-check is listed at the end for completeness.

## Prerequisites

- `Backend/config.env` present (see `config.env.example`) — not needed for the automated suite, which
  spins up `mongodb-memory-server`, but needed for `npm start`.
- Node 22 (`.nvmrc`).

## 1. Run the targeted regression suites (primary validation)

```bash
cd Backend
npm test -- tests/roles/proScoutDataScope.test.js
npm test -- tests/roles/proScoutCreatedByScope.test.js   # new suite from this feature
npm test -- tests/roles/proScoutPlayersWrite.test.js
npm test -- tests/roles/proScoutFullRegression.test.js
npm test -- tests/roles/adminProfessionalLens.test.js
npm test -- tests/isolation.test.js
```

Expected: all pass. `tests/isolation.test.js` in particular MUST show **zero diff** in its own
assertions (Constitution Principle III) — if this file needs an edit to pass, stop and treat it as a
signal something scoped outside this feature broke, per Constitution Governance.

## 2. Run the full backend suite

```bash
cd Backend
npm test
```

Expected: no new failures anywhere outside the files touched above — confirms `coach`/`observer`/
`admin` regression (Constitution Principle III, `spec.md` FR-010).

## 3. Manual scenario walkthrough (matches `spec.md` User Story 1 + 3)

Using two `proScout` accounts (seed via admin, or `tests/helpers/factory.js` equivalents in a script)
and one professional-league team:

1. As `proScout` A: `POST /players` with `team` set to a professional-league team id. Note the
   returned player id.
2. As `proScout` A: create a scouting report on that player (`POST /players/:playerId/reports`) and
   upload a media item (`POST /players/:playerId/media`). Note both ids.
3. As `proScout` B:
   - `GET /players` — the player from step 1 MUST NOT appear.
   - `GET /players/:id` with that id — MUST return 403.
   - `GET /players/counts` — MUST NOT count that player.
4. As `proScout` A: `GET /players`, `GET /players/:id`, `GET /dashboard/proScout` — the player MUST
   still appear in all three, exactly as before this feature.
5. As `proScout` A: `GET /players/:playerId/reports/:id` and the media item from step 2 — expected
   per FR-012/User-Story-3, these still succeed **for now** because the player is still in A's own
   scope (A created it). To exercise the actual FR-012 scenario, repeat steps 2–3 with A authoring a
   report on a player **created by B** (pre-feature fixture, or seeded directly) — A's access to that
   report/media MUST be rejected (403) after this feature ships.

## 4. Admin regression spot-check (User Story 2)

As admin: activate the Professional League lens on the players page, confirm both `proScout` A's and
`proScout` B's players are visible with correct creator names — unaffected by everything above.

## 5. (Optional) Frontend smoke check

```bash
cd frontend
npm start
```

Sign in as a `proScout`, confirm the players page and dashboard render without error for a narrower
result set — no new UI code exists for this feature, so this step is about confirming the existing
pages degrade gracefully to a smaller data set (e.g. empty-state handling), not about verifying new
UI.
