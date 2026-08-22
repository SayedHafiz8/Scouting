# Stage 4 — proScout Players Page & Write Access

Spec, plan, research, contracts and tasks: `specs/005-proscout-players-write/`

## What this does

Gives the `proScout` role write access to players, scouting reports, media and profile images —
confined to the professional-league scope Stage 2 built — and removes the age-group dimension from
that role's players experience. Read access was already correct as of Stage 2; this stage verifies
it with tests rather than reimplementing it.

## Constraint ledger (required by the Governance section)

**Layers touched — all three:**

| Layer | Change |
|---|---|
| `allowedTo` role gate | 13 operations opened to `proScout` (`routes/playerRouter.js`, `scoutingReportRouter.js`, `playerMediaRouter.js`) |
| Central scope layer | **Read-only.** `services/scope.js` was not modified. `teamExistsInScope` in `playerValidation.js` gained denial logging only — its scope logic is unchanged. |
| Per-document ownership | `checkReportOwnership` and `checkMediaOwnership` placeholder branches replaced with real multi-axis guards; `checkPlayerOwnership` added to the `profileImg` chain |

**Constitution constraints addressed or relied upon:**

- **C-2 — advanced.** The two `proScout` placeholder branches in `ownership.js` became real guards
  (author/uploader **and** player-in-scope). `uploadProfileImg`'s hand-rolled controller-level
  ownership comparison is now superseded by `checkPlayerOwnership` on the route; the old check was
  left in place unchanged, since removing it would alter an existing role's path.
- **C-3 — relied upon, still open.** `GET /ages` has no `protect` at all, so `allowedTo` cannot act
  on it. Suppressing the client's `/ages` request is an **intent** change, not a lock. A test asserts
  the endpoint returns 200 both with a proScout token and with no token, so nobody mistakes the
  hidden UI for a closed door. `TODO(AGES_UNAUTHENTICATED_READ)` stands.
- **C-4 — relied upon unchanged.** `league: "professional"` scope shapes consumed exactly as Stage 2
  built them, `$and`-wrapping intact.
- **C-1, C-5** — not touched.

**Principle VI endpoint inventory**: all **83** project operations enumerated from
`Backend/routes/*.js` in `contracts/endpoint-inventory.md` — 24 allowed/scoped, 57 denied, 2
(`/ages`) neither.

## Test results

| Suite | Before | After |
|---|---|---|
| Backend (vitest) | 507 passed / 24 files | **580 passed / 25 files** |
| Frontend (karma) | 95 passed | **112 passed** |
| `tests/isolation.test.js` | 15 passed | **15 passed, file unedited** |

`npm run build` clean. `npm run dump-spec` + `npm run gen:types` run in this PR.

## Deliberate refusals — four grants the plan document asked for and this PR does not make

1. **`DELETE /reports/:id`** stays admin-only. The plan called it a coach/observer permission; it is
   not — no coach can delete a report. Granting it would give a new role a destructive privilege two
   established roles lack.
2. **`GET /media/:id/download`** stays admin-only under security-review item **F7d**, as does
   `DELETE /media/:id` and `PATCH /media/:id/review`.
3. **Out-of-scope team assignment returns 400, not the 403 the acceptance criterion named.** A
   status difference between "real team, wrong league" and "no such team" is an enumeration oracle
   that defeats `checkTeamScope`. A test compares both responses byte-for-byte. The distinction
   exists only in the server-side denial log.
4. **A proScout is never written into `Player.coach`.** That field means "the coach who owns this
   player", and `assignPlayerCoach` accepts only coach-role users in it. `createdBy` carries the
   attribution; the player lands in the admin's existing "No coach" lens.

Each is argued in `research.md` (R2, R3, R4, R5) and covered by an asserted negative test.

## Two findings discovered during implementation

**`POST /users/:id/players` is dead for every role** — `TODO(NESTED_PLAYER_CREATE_DEAD)`.
`playerRouter` is mounted twice; on the nested mount `setUserIdToBody` injects `req.body.coach` from
the URL **before** `createValidate` runs, so `lockField("coach")` rejects it with 400. Either the
middleware or the lock is wrong. Not fixed here — fixing it changes behavior on a route coaches
nominally own. Documented with a test.

> `research.md` R14 initially claimed this was a live privilege-escalation path for proScout, on the
> reasoning that `lockField` could not see a path-injected value. **That was wrong, and the
> correction is recorded in R14.** The validator runs after the middleware and does catch it. The
> `delete req.body.coach` in the controller was kept as defense in depth — correct independently of
> validator ordering — but it is not the load-bearing fix it was first described as.

**Tech debt item 5 closed**: the admin role selector was three hard-coded `<option>` literals, so
`proScout` could not be assigned through the UI at all. Now driven by
`const ROLE_OPTIONS: readonly UserRole[]`. Note the honest limitation: `UserRole` is a *type* with no
runtime value, so this is **compile-time checked, not auto-derived** — adding a role to
`openapi.json` will not populate the list on its own.

## Two Stage 1/2 test assertions intentionally updated

`proScoutRoleDefinition.test.js` and `proScoutDataScope.test.js` asserted `POST /players → 403` and
`POST /reports → 403`. Stage 4 opens exactly those gates, so those assertions were updated to record
that the gate opened and that the denial moved to the scope layer — following the precedent Stage 2
already set in the same file (`GET /seasonMatches → reachable and scoped (Stage-2 gate opened)`).
`isolation.test.js` was **not** touched.

## Stage 4b — professional players are adults (added after the stage, on owner request)

proScout registers professional players, who are adults; the 2007–2019 birth-year window made them
impossible to enter. The floor is now **1996** (age 30 in 2026) **for professional players only**.
Coach and admin keep 2007–2019 with a mandatory age group, unchanged and tested.

**Design**: a server-set `Player.isProfessional` boolean, written in `create` from the creator's role
and locked against client input on both create and update. The model's pre-save hooks branch on the
flag — not on the requester's role (the model has no `req.user`), and not on the team's league
(`team` is nullable, and a team-less proScout player is exactly the case Stage 2's second scope
branch exists for).

**Professional players carry no `ageGroup` at all.** Age groups are a youth concept — academy squads
split by birth year. The alternative, seeding groups for 1996–2006, would have put eleven new cards
in the age-group grid for coach and admin, which the owner explicitly ruled out.

> ### ✅ Constitutional position — resolved by amendment v1.0.2
>
> Constraint **C-4** stated that `ageGroup` remains *"مشتقاً إجبارياً على `Player`"* and must not be
> read as permission to remove or bypass it. Skipping the derivation for professional players
> contradicted that as literally written, so it was flagged rather than assumed.
>
> The owner amended the constitution (**v1.0.1 → v1.0.2**, PATCH) to add an explicit, bounded
> exception to C-4. **That amendment must be reviewed and merged as its own PR touching only
> `.specify/memory/constitution.md`**, as the Governance section requires — not folded into this one.
>
> The amendment binds four constraints on the exception, all of which this PR already satisfies:
> server-only assignment with `lockField` on create **and** update; the carve-out limited to the
> birth-year range and the `ageGroup` derivation and nothing else; the youth path byte-identical and
> proven by a coach regression test; and `SeasonMatch.ageGroup` untouched.
>
> The sync-impact report in the amendment records honestly that a reviewer could argue this is MINOR
> rather than PATCH, and why the owner classified it as PATCH.
>
> The same change also amends this stage's own invariant **I-4** ("ageGroup derivation is
> untouched"), and one Stage 4 test that asserted it — both updated in place with the reason.

**The floor is a fixed 1996, not `currentYear - 30`** (owner's choice, and the safer one): a rolling
floor would make an already-registered 1996 player fail validation on any DOB edit the moment they
age out. It drifts slowly — 31 in 2027 — which matches how `MAX_BIRTH_YEAR` already behaves.

Frontend: for proScout the DOB year list spans 1996–2019, the Team dropdown is no longer gated on or
narrowed by an age group (it lists the professional set, which the server enforces anyway), and the
form no longer requests `/ages` — the same intent fix as the players list, and with the same caveat
that it does **not** close C-3.

**Tests**: 14 new backend cases — the widened range including its boundaries (1996 accepted, 1995
rejected, 2020 still rejected), `ageGroup` left unset, creation succeeding with no `AgeGroup` doc for
1996, edit-after-create, and both lock-field paths. Plus four asserting the youth path is byte-identical
for a coach, including that 2008 still fails with "No age group is configured".

## Still outstanding

**T055 — the manual walkthrough in `quickstart.md` §4 has not been run.** It needs a live backend,
frontend and database. Everything automated is green; the human pass over the real UI is not done.
