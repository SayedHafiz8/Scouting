---
description: "Task list for ProScout Data Scope Enforcement"
---

# Tasks: ProScout Data Scope Enforcement

**Input**: Design documents from `/specs/003-proscout-data-scope/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Mandatory.** The spec lists its acceptance criteria as "اختبارات إلزامية", and Constitution Principle VI requires a positive *and* a negative test for every permission. Test tasks are not optional here.

**Organization**: Grouped by user story. Note the hard ordering constraint below — it overrides the usual "stories are fully parallel" assumption.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4, mapping to the user stories in spec.md
- Every task names its exact file path
- Scenario numbers refer to the table in [quickstart.md §2](./quickstart.md)

## Path Conventions

Backend-only feature inside a three-project monorepo. All paths are repo-relative; backend commands run from `Backend/`.

---

## ⚠️ Non-negotiable ordering constraint

Scope must exist **before** any `allowedTo` gate opens. This is not a preference — verified in [research.md R6](./research.md), opening `GET /players/counts` or `GET /seasonMatches` without scope returns the **entire collection**, not an empty list.

Within every story phase: scope → guard → **then** the gate → **then** the Stage-1 expectation update for that gate.

## ⚠️ Four pre-existing test expectations change — not one

`Backend/tests/roles/proScoutRoleDefinition.test.js` encodes Stage 1's deliberate deferrals. **This feature flips four of them**, and each flip must land in the *same phase* as the gate that causes it, or the suite goes red for reasons the implementer cannot distinguish from a regression:

| Expectation in that file | Flipped by | Updated by |
|---|---|---|
| `GET /players/counts` → 403 | T024 | **T025** (Phase 3) |
| `GET /players/reports/average-ratings` → 403 | T024 | **T025** (Phase 3) |
| `GET /seasonMatches` → 403 | T032 | **T033** (Phase 4) |
| `GET /teams` → unscoped 200 | T037 | **T036** (Phase 5) |

Every *other* expectation in that file (`GET /users`, `POST /players`, `POST …/reports` → 403) stays exactly as-is.

---

## Phase 1: Setup (Baseline capture)

**Purpose**: Establish a known-good "before" state, so any later failure is attributable to this feature rather than pre-existing drift.

- [X] T001 Run the untouched regression baseline from `Backend/` (`npm test -- tests/isolation.test.js tests/players.test.js tests/seasonMatches.test.js tests/teams.test.js tests/ownership.test.js tests/roles/proScoutRoleDefinition.test.js`) and record the pass counts in the PR description — this is the "before" half of the Principle III proof
- [X] T002 [P] Regenerate `openapi.json` from `Backend/` (`npm run dump-spec`) **before** any code change, so the final spec diff shows only this feature's five opened gates. Stage 0 already regenerated it, so **an empty diff is the expected result** — a non-empty one means the committed spec had drifted and should be committed separately from this feature

**Checkpoint**: Baseline green and recorded.

---

## Phase 2: Foundational (BLOCKING — no story can start until this is done)

**Purpose**: The `createdBy` field and the central scope module. Every user story reads from these.

**⚠️ CRITICAL**: T003–T014 block all of Phase 3+.

### Data layer

- [X] T003 Add the `createdBy` field (`ObjectId`, `ref: "User"`, **not** required) to `Backend/models/playedModel.js`, placed directly below `coach`, with an Arabic comment in the surrounding style explaining it serves the team-less branch of the proScout scope and does not replace `coach` — see [data-model.md §1](./data-model.md)
- [X] T004 Add the compound index `playerSchema.index({ team: 1, createdBy: 1 })` to `Backend/models/playedModel.js`, with a comment stating why the existing `{ team: 1 }` **sparse** index cannot serve this branch (sparse omits `team: null` documents, which is exactly the set the branch selects)
- [X] T005 [P] Register the new index in `Backend/scripts/syncAllIndexes.js` following the existing per-model convention
- [X] T006 [P] Add `lockField("createdBy")` to **both** `createValidate` and `updateValidate` in `Backend/utils/validation/playerValidation.js`, beside the existing `lockField("coach")` — without it `PATCH /players/:id` lets a coach rewrite attribution
- [X] T007 Set `req.body.createdBy = req.user._id` in `playerController.create` in `Backend/controllers/playerController.js`, immediately after the existing `req.body.coach = req.user._id` assignment

### Migration

- [X] T008 [P] Create `Backend/scripts/backfillPlayerCreatedBy.js` modelled line-for-line on `Backend/scripts/backfillSearchTokens.js`: dry-run default, `--apply` to write, cursor + `bulkWrite` in batches of 500, selection `{ createdBy: { $exists: false }, coach: { $exists: true, $ne: null } }`, orphans counted and **skipped**, and the rollback (`$unset`) documented in the file header
- [X] T009 [P] Add `"backfill-player-createdby": "node scripts/backfillPlayerCreatedBy.js"` to the `scripts` block of `Backend/package.json`, matching the `backfill-search-tokens` entry

### Central scope layer

- [X] T010 Create `Backend/services/scope.js` exporting `professionalTeamIds`, `playerScopeFor`, `seasonMatchScopeFor`, and `teamScopeFor` exactly as specified in [contracts/scope-module.md](./contracts/scope-module.md) — memoize team ids on `req`, return real `ObjectId`s (never strings), return plain objects (never a Mongoose `Query`), and return a bare `{}` for every non-proScout role. **`professionalTeamIds` must keep deactivated professional teams** so their players don't vanish from scope: any `.distinct()` form already skips the soft-delete hook (the op is `distinct`, which never matches `/^find/` — measured, see [research R2](./research.md)), so add `.setOptions({ bypassFilter: true })` as intent-documentation while knowing it is a **no-op**. The real hazard is the reverse: never rewrite this to a form that stays a `find` (`.select("_id")`, `.lean()`, …), which *would* apply the hook and silently drop those teams. T012 is what actually enforces this
- [X] T011 **Wrap every non-empty scope in `$and`** in `Backend/services/scope.js` — `{ $and: [ <condition> ] }`, never the bare condition. Chained Mongoose conditions merge **last-wins on key collision**, and `league` is both the scope key *and* a client-whitelisted filter in `SEASON_MATCH_FILTERS` and `TEAM_FILTERS`, so an unwrapped scope is **overwritten** by `?league=premier`. Measured on mongoose 9.7.2, not theorised — see [research R12](./research.md). Non-proScout roles keep a bare `{}` (an empty `$and: []` is a MongoDB error and would also break Principle III's byte-identical guarantee)
- [X] T012 [P] **Create** `Backend/tests/roles/proScoutDataScope.test.js` (this is the task that brings the file into existence; every later test task appends to it) with the scope-shape unit tests (scenario 1): (a) each helper returns an **`$and`-wrapped** filter for proScout and exactly `{}` for admin/coach/observer — pinning the invariant at the source, so a future edit that unwraps a scope fails here rather than silently in an endpoint; and (b) `professionalTeamIds` **includes a deactivated professional team's id**. Assertion (b) is the only real protection for that requirement — no `.distinct()` spelling enforces it, and the `bypassFilter` option in T010 is a no-op ([research R2](./research.md))
- [X] T013 [P] Create `Backend/utils/accessLog.js` exporting `logScopeDenial({ req, resource, resourceId })`, emitting one structured line carrying the four fields Constitution Principle IV requires (`userId`, `role`, `path`, `resourceId`) plus `resource` and a timestamp — no database write, per [research.md R9](./research.md)

### Test fixtures

- [X] T014 [P] Add a direct-model fixture helper to `Backend/tests/helpers/factory.js` for building players that the API cannot yet create (`team: null` with an arbitrary `createdBy`, and players on a named team) — proScout cannot `POST /players` until Stage 4, so these fixtures cannot go through the HTTP path

**Checkpoint**: Scope module callable, `createdBy` persisted and locked. No behavior has changed for any role yet.

---

## Phase 3: User Story 1 — ProScout sees only professional-league players (P1) 🎯 MVP

**Goal**: Players, player detail, counts, and average-ratings all scoped to professional-league teams plus the proScout's own team-less players.

**Independent Test**: Log in as proScout against a mixed dataset; the list, the counts total, and a direct out-of-scope ID lookup all behave per [quickstart.md §2](./quickstart.md) scenarios 2–15.

### Tests for User Story 1 ⚠️ write first, confirm they fail

- [X] T015 [P] [US1] Add the players-scope cases (scenarios **2–5, 11, 12**) to `Backend/tests/roles/proScoutDataScope.test.js`: professional-team player visible; premier-team player absent from list **and 403 by direct ID**; `team: null` + own `createdBy` visible; `team: null` + a different creator absent; count matches the manually computed subset; in-scope detail returns 200 with `observers` absent, `observed` rendered as `pending`, and `coach` still present
- [X] T016 [P] [US1] Add the widening-attempt cases (scenarios **6–7**) to the same file, using the **right key**: `?team=<premier team id>` is the real escalation vector because `team` **is** in `PLAYER_FILTERS` and therefore reaches the merge — assert the result stays in-scope. Separately assert `?league=premier` is *dropped* as non-whitelisted (`league` is **not** in `PLAYER_FILTERS`), so it never reaches the filter at all — same outcome, different mechanism, and the test comment must say which is which
- [X] T017 [P] [US1] **(Constitution Principle VI — mandatory case)** Add the search / sort / pagination cases (scenarios **8–10**) to the same file: `?keyword=` returns only in-scope matches; `?keyword=` combined with `?team=<premier id>` still cannot widen; `?sort=` and `?page=`/`?limit=` operate strictly inside scope, with `count`, `numberOfPages` and `next`/`prev` never reflecting excluded records. Mirror the equivalent coach/observer cases already in `tests/isolation.test.js` — Principle VI names these ملزمة for **every** permission test set, and until this task existed the proScout set had none
- [X] T018 [P] [US1] Add the aggregate cases (scenarios **13–15**) to the same file: `GET /players/counts` total equals the in-scope count only; `GET /players/reports/average-ratings` with out-of-scope ids in `?ids=` omits them from the response; and an assertion that the scope filter carries real `ObjectId`s — a string-typed scope silently matches nothing inside `$match`

### Implementation for User Story 1

- [X] T019 [US1] Thread `playerScopeFor` into `playerController.getAll` in `Backend/controllers/playerController.js` by passing it to `Player.find(...)` in the **base position**. Note precisely *why* this is safe: `ApiFeature` chains `.find()` on top, and chained conditions merge **last-wins on key collision, not AND** — the composition is an AND only because the scope is `$and`-wrapped (T011). Do not restate this as "base position merges as AND"; that generalisation is false and is what R12 corrected
- [X] T020 [US1] **(FR-014)** Apply `maskObservedForCoach` to proScout in both `getAll` and `getSpecific` in `Backend/controllers/playerController.js`, with a comment recording that this is the deny-by-default reading ([research.md R11](./research.md)) and that FR-014 is explicitly marked revisitable in Stage 4 — do **not** apply `maskCoachForObserver`, the player's coach stays visible
- [X] T021 [US1] Scope `getCountsByAgeGroup` in `Backend/controllers/playerController.js`: add an explicit proScout branch composing the scope into `$match` as `{ $and: [scope, match] }` — **not** object spread, which could silently collide on a `team` or `$or` key
- [X] T022 [US1] Narrow the `ids` list in `getAverageRatingsForPlayers` in `Backend/controllers/scoutingReportController.js` to in-scope players before the pipeline runs, **keeping** the existing `match.coach = req.user._id` authorship restriction — the two narrowings intersect, they do not replace one another ([research.md R7](./research.md))
- [X] T023 [US1] Add an explicit proScout branch to `checkPlayerOwnership` in `Backend/middlewares/ownership.js` using `Player.exists({ _id: id, ...(await playerScopeFor(req)) })`, calling `logScopeDenial` and returning 403 on miss — reusing the identical filter object is what makes list scope and ID scope provably identical (FR-011). **Follow the [`ownership.js` insertion contract](#ownershipjs--insertion-contract)**: insert above the trailing `Deny by default` return, never in place of it, and establish both new imports here (rows 1–2)
- [X] T024 [US1] **Gate opening (depends on T019–T023)**: add `ROLES.PRO_SCOUT` to `allowedTo` for `GET /players/:id`, `GET /players/counts`, and `GET /players/reports/average-ratings` in `Backend/routes/playerRouter.js`, and replace the Stage-1 deferral comment — anchor on its opening text `"proScout المضاف هنا فقط من الأربعة list endpoints"` rather than line numbers, which drift once the file is edited — with one recording that the deferral is now resolved and how
- [X] T025 [US1] **(Must land with T024 — the suite is red between them)** Update `Backend/tests/roles/proScoutRoleDefinition.test.js`: flip the `GET /players/counts` and `GET /players/reports/average-ratings` expectations from **403** to a scoped 200, and rewrite the block comment above them (currently at ~L63-70). That comment states the premise [research R6](./research.md) **disproved** — it claims all three deferred endpoints "fall through to an UNFILTERED query ({} — all documents)", which is true for counts and seasonMatches but **false for average-ratings**, which was already restricted to the requester's own authored reports. Record accurately why the deferral existed and why it is now resolved; leave the `GET /seasonMatches` case alone, it belongs to T033

**Checkpoint**: US1 fully functional. `proScoutDataScope.test.js` green, `proScoutRoleDefinition.test.js` green again after T025, `isolation.test.js` still green **unmodified**.

---

## Phase 4: User Story 2 — ProScout sees only professional-league matches (P1)

**Goal**: Season match list and detail restricted to `league: "professional"`; attendance on out-of-scope matches refused.

**Independent Test**: A premier-league match is absent from the list and 403 by direct ID, while the observer's existing match scope is byte-for-byte unchanged.

### Tests for User Story 2 ⚠️ write first, confirm they fail

- [X] T026 [P] [US2] Add the season-match cases (scenarios **16, 17, 19**) to `Backend/tests/roles/proScoutDataScope.test.js`: professional match visible; premier match absent from list and **403 by direct ID**; attendance on an out-of-scope match refused with 403
- [X] T027 [P] [US2] **Add the escalation test that would have caught the design flaw** (scenario **18**): as proScout, `GET /seasonMatches?league=premier` MUST return zero rows, not the premier schedule. `league` is whitelisted in `SEASON_MATCH_FILTERS`, so without the `$and` wrapper from T011 the client value *replaces* the scope. This test fails loudly if anyone ever unwraps it
- [X] T028 [P] [US2] Add the observer regression case (scenario **20**) asserting the observer's match scope is unchanged — same count and same ids as before this feature, since `seasonMatchBaseFilterFor` is being restructured and its observer branch is Constitution-protected

### Implementation for User Story 2

- [X] T029 [US2] Convert `seasonMatchBaseFilterFor` in `Backend/controllers/seasonMatchController.js` from `if` to an explicit switch delegating to `seasonMatchScopeFor`: admin/coach → `{}`, observer → the **existing** `$or` preserved byte for byte, proScout → `{ $and: [ { league: "professional" } ] }` (**wrapped** — T011; an unwrapped `{ league: … }` is overwritten by `?league=premier`), unrecognized → `MATCH_NOTHING` (changed from `{}` — deny-by-default)
- [X] T030 [US2] Add a new `checkSeasonMatchScope` guard to `Backend/middlewares/ownership.js` using `SeasonMatch.exists({ _id, ...scope }).setOptions({ skipPopulate: true })` with `logScopeDenial` on miss, and wire it onto `GET /seasonMatches/:id` in `Backend/routes/seasonMatchRouter.js`. **`skipPopulate` is required, not optional**: `Model.exists()` runs as `findOne`, which fires `seasonMatchSchema`'s `pre(/^find/)` and performs a four-way populate (`ageGroup`, `homeTeam`, `awayTeam`, `attendees`) just to test existence — verified. The existing `checkSeasonMatchAttendee` already avoids this the same way ([ownership.js:104](../../Backend/middlewares/ownership.js#L104)); match that pattern. Per the [insertion contract](#ownershipjs--insertion-contract) rows 3–4: **append** the new guard at end of file and **extend** T023's existing `scope.js` named import rather than adding a second one
- [X] T031 [US2] Add an explicit proScout branch to `checkSeasonMatchAttendee` in `Backend/middlewares/ownership.js`. **Be explicit about what the branch does**, because the existing function checks attendee membership only, which is *not* a league check: the proScout branch MUST verify the match is in scope via `SeasonMatch.exists({ _id, ...(await seasonMatchScopeFor(req)) }).setOptions({ skipPopulate: true })` (same reason as T030 — `exists` runs as `findOne` and would otherwise trigger the four-way populate) **in addition to** attendee membership, and MUST deny (403 + `logScopeDenial`) while the attendance gate is still closed. Add a comment naming which check becomes load-bearing when Stage 6 opens the gate — without it, Stage 6 inherits a guard that would admit a proScout to a premier-league match they had somehow been added to. This branch is **not reachable over HTTP in this stage**, so T042 unit-tests it directly. [Insertion contract](#ownershipjs--insertion-contract) row 5: above the trailing `Deny by default` return, inside `checkSeasonMatchAttendee` — which by now sits *above* T030's appended guard
- [X] T032 [US2] **Gate opening (depends on T029–T031)**: add `ROLES.PRO_SCOUT` to `allowedTo` for `GET /seasonMatches` and `GET /seasonMatches/:id` in `Backend/routes/seasonMatchRouter.js`
- [X] T033 [US2] **(Must land with T032)** Update `Backend/tests/roles/proScoutRoleDefinition.test.js`: flip the `GET /seasonMatches` expectation from **403** to a scoped 200, and remove it from the Stage-1 deferral comment block that T025 rewrote

**Checkpoint**: US1 and US2 both independently green, and `proScoutRoleDefinition.test.js` green again.

---

## Phase 5: User Story 3 — ProScout sees only professional-league teams (P2)

**Goal**: Team list and detail scoped by league, closing the "known accepted exception" Stage 1 recorded for `GET /teams`.

**Independent Test**: A premier team is absent from the proScout's list and 403 by direct ID, while admin/coach/observer team results are identical to pre-feature.

### Tests for User Story 3 ⚠️ write first, confirm they fail

- [X] T034 [P] [US3] Add the teams cases (scenarios **21, 22, 24**) to `Backend/tests/roles/proScoutDataScope.test.js`: professional team visible; premier team absent and **403 by direct ID**; and an explicit Constraint C-3 regression asserting admin/coach/observer team results are unchanged in both count and content
- [X] T035 [P] [US3] Add the same escalation test for teams (scenario **23**): as proScout, `GET /teams?league=premier` MUST return zero rows. `league` is whitelisted in `TEAM_FILTERS`, so this is the second endpoint the unwrapped scope would have leaked (research R12)
- [X] T036 [US3] **(Must land with T037)** Update the `GET /teams` expectation in `Backend/tests/roles/proScoutRoleDefinition.test.js` from "unscoped 200, documented pre-existing gap" to a league-scoped list, and update the surrounding comment to say the Stage-1 exception is now closed. This is the **fourth and last** pre-existing expectation this feature changes — see the table at the top of this file

### Implementation for User Story 3

- [X] T037 [US3] Pass a `baseFilterFn` built from `teamScopeFor` as the fourth argument to the existing `gettingAll(Team, ...)` call in `Backend/controllers/teamsController.js` — the signature is `gettingAll(model, filterOptions, populateOptions, baseFilterFn)` and the current call passes only **two** args, so it must become `gettingAll(Team, { … }, null, teamBaseFilterFn)`. **That explicit `null` is load-bearing**: passing the function in third position is silently accepted as `populateOptions`, leaving the list unscoped and failing **open** with no error. Preserve the in-place comment explaining why `Team` deliberately has no `ownerFields` — a league scope is not an ownership scope. The returned filter must be `$and`-wrapped (T011): `league` is in `TEAM_FILTERS`, so an unwrapped scope loses to the client's `?league=`
- [X] T038 [US3] Add a new `checkTeamScope` guard to `Backend/middlewares/ownership.js` using `Team.exists({ _id, ...scope })` with `logScopeDenial` on miss, and wire it onto `GET /teams/:id` in `Backend/routes/teamRouter.js` — `gettingSpecific(Team)` is a bare `findById` with no scope hook, which is why this needs a guard rather than a controller change. [Insertion contract](#ownershipjs--insertion-contract) rows 6–7: `Team` joins the end of the model import group (its first use in this file), `teamScopeFor` extends the existing `scope.js` import, and the guard is **appended** after `checkSeasonMatchScope`

**Checkpoint**: All three data surfaces scoped. `ownership.js` now exports six guards.

---

## Phase 6: User Story 4 — Denied access attempts are auditable (P3)

**Goal**: Every out-of-scope refusal leaves an investigable trail; zero silent denials.

**Independent Test**: Trigger a denial on each resource type and assert the logger fired exactly once with the four required fields.

- [X] T039 [P] [US4] Add the denial-logging cases (scenario **25**) to `Backend/tests/roles/proScoutDataScope.test.js`, spying on `Backend/utils/accessLog.js` and asserting exactly one call carrying `userId`, `role`, `path`, and `resourceId` for a denial on each of player, season match, and team
- [X] T040 [US4] Audit all six guards in `Backend/middlewares/ownership.js` and confirm every proScout denial path calls `logScopeDenial` before returning its `AppError` — this closes SC-004's "zero silent denials", and is a sweep rather than new logic because T023/T030/T031/T038 each added their own call site. In the same pass, verify the [insertion contract](#ownershipjs--insertion-contract) invariant held: run `git diff main -- Backend/middlewares/ownership.js` and confirm **no `Deny by default` line was deleted** — each of the four original guards must still end with its own explicit deny, with the proScout branch sitting above it, and the two new guards must have one too

**Checkpoint**: SC-004 satisfied.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Future-proofing guards, their tests, contract regeneration, and the full Principle VI sweep.

- [X] T041 [P] Add explicit proScout branches to `checkReportOwnership` and `checkMediaOwnership` in `Backend/middlewares/ownership.js` — nothing routes to them for this role yet, but `checkMediaOwnership` compares `uploadedBy` without a role check, so an unlisted role would see anything it had uploaded by accident rather than by decision (Constraint **C-2**). [Insertion contract](#ownershipjs--insertion-contract) row 8: two different functions, each above its own trailing `Deny by default` return; no new imports
- [X] T042 Add **direct unit tests for the three guard branches that no HTTP request can reach in this stage** — `checkSeasonMatchAttendee` (T031), `checkReportOwnership` and `checkMediaOwnership` (T041) — in `Backend/tests/roles/proScoutDataScope.test.js`, invoking each middleware with a stubbed `req`/`res`/`next` rather than going through the router. Without this the branches are wired but **unverified**: every HTTP-level test hits `allowedTo` first and passes for the wrong reason, so deleting the scope check inside T031's branch would break nothing until Stage 6 opens the gate. "Wired ahead of Stage 6" and "verified" are different claims, and only this task makes the second one true
- [X] T043 Add the deny-by-default sweep test (scenario **26**) to `Backend/tests/roles/proScoutDataScope.test.js`, asserting **403** for every route marked 403 in [contracts/proscout-endpoint-matrix.md](./contracts/proscout-endpoint-matrix.md) — assert the status code, never an empty body, per Constitution Principle I
- [X] T044 Regenerate the API contract: `npm run dump-spec` from `Backend/`, then `npm run gen:types` from `frontend/`, and commit both `openapi.json` and `frontend/src/app/core/models/api.generated.ts` — required by Principle V because five gates changed
- [X] T045 Run the full backend suite (`npm test` from `Backend/`) and confirm `tests/isolation.test.js` passes **unmodified** — compare against the T001 baseline. Exactly **four** expectation changes are intended, all in `proScoutRoleDefinition.test.js` (T025 ×2, T033, T036); any other delta is a regression, not a test to fix
- [X] T046 [P] Run the frontend CI gates (`npm run build` and `npx ng test --watch=false --browsers=ChromeHeadless` from `frontend/`) — the frontend is untouched by this feature but both gates are blocking in CI and the generated types changed in T044
- [X] T047 [P] Verify the backfill end to end per [quickstart.md §5](./quickstart.md): dry run reports sensible totals and orphan counts, `--apply` writes, a second run reports nothing to do (idempotence), and the documented `$unset` rollback restores the prior state
- [X] T048 Update `docs/scout-pro-plan-v2.md` Stage 2 with an execution note in the style of the existing Stage 1 note, recording the deviations found during this stage (scope module instead of `buildOwnerScope`; six ownership guards instead of four; `average-ratings` scoped on the wrong axis rather than unscoped; `GET /players/:id` opened with masking) **and — most importantly for later stages — the `$and` wrapping rule from R12**: any future stage that adds a scope whose key is client-whitelisted will hit the same last-wins merge trap, so Stages 4–6 must inherit that rule rather than rediscover it

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks every user story**
- **Phase 3 (US1)**, **Phase 4 (US2)**, **Phase 5 (US3)**: each depends only on Phase 2 and touches disjoint controllers and routers — but **all three edit `Backend/middlewares/ownership.js`** and **all three edit `proScoutRoleDefinition.test.js`**, so parallelising them requires coordinating those two files
- **Phase 6 (US4)**: depends on US1–US3, because it audits the call sites they create
- **Phase 7 (Polish)**: depends on everything

### `ownership.js` — insertion contract

`Backend/middlewares/ownership.js` is the one file five tasks edit: **T023** (US1), **T030** and **T031** (US2), **T038** (US3), **T041** (Polish). Executed in ascending task order, no edit removes or rewrites an earlier one — provided each edit lands at the anchor named below. Every edit is an **insertion**; none is a replacement.

**File shape today** (before any task):

```
imports  →  checkPlayerOwnership  →  checkReportOwnership
         →  checkMediaOwnership   →  checkSeasonMatchAttendee
```

Each of the four existing guards ends with the same three-line shape:

```js
    // Deny by default (Constitution Principle II / Constraint C-2) — ...
    return next(new AppError("...", 403));
});
```

#### Invariant — the one way these tasks can silently destroy each other

> **The trailing `Deny by default` return is never removed, never replaced, and never edited.** A proScout branch is inserted **above** it, after the last existing role branch. Removing that line and putting a proScout branch in its place still passes every test in this feature — and quietly converts a deny-by-default guard back into a fall-through, which is exactly Constraint **C-2**. If a diff on this file shows a *deleted* `Deny by default` line, the change is wrong regardless of what the tests say.

#### Anchors, in execution order

| # | Task | Edit | Anchor |
|---|---|---|---|
| 1 | **T023** | Import `playerScopeFor` from `../services/scope.js` and `logScopeDenial` from `../utils/accessLog.js` | Append two lines to the **end of the existing import block**, after the `ROLES` import. Do not reorder or rewrite existing imports. |
| 2 | **T023** | proScout branch in `checkPlayerOwnership` | Between the closing `}` of the existing `if (req.user.role === ROLES.COACH)` block and the `// Deny by default` comment |
| 3 | **T030** | Import `seasonMatchScopeFor` from `../services/scope.js` | **Extend the existing named import** added in T023 → `import { playerScopeFor, seasonMatchScopeFor } from "../services/scope.js"`. Do not add a second import statement from the same module. |
| 4 | **T030** | New `checkSeasonMatchScope` guard | **Appended at end of file**, after `checkSeasonMatchAttendee` |
| 5 | **T031** | proScout branch in `checkSeasonMatchAttendee` | Between the closing `}` of the existing `if (COACH \|\| OBSERVER)` block and its `// Deny by default` comment — note this is inside `checkSeasonMatchAttendee`, which now sits *above* T030's new function |
| 6 | **T038** | Import `Team` model and `teamScopeFor` | `Team` goes at the **end of the model import group** (after `SeasonMatch`); `teamScopeFor` **extends the same named import** from `../services/scope.js` |
| 7 | **T038** | New `checkTeamScope` guard | **Appended at end of file**, after `checkSeasonMatchScope` |
| 8 | **T041** | proScout branches in `checkReportOwnership` and `checkMediaOwnership` | Each between the closing `}` of its existing `if (COACH \|\| OBSERVER)` block and its `// Deny by default` comment. No imports needed beyond those already present. |

**Resulting file shape** (after T041):

```
imports (asyncHandler, mongoose, Player, ScoutingReport, PlayerMedia,
         SeasonMatch, Team, AppError, ROLES,
         { playerScopeFor, seasonMatchScopeFor, teamScopeFor }, { logScopeDenial })
  → checkPlayerOwnership       (+ proScout branch, T023)
  → checkReportOwnership       (+ proScout branch, T041)
  → checkMediaOwnership        (+ proScout branch, T041)
  → checkSeasonMatchAttendee   (+ proScout branch, T031)
  → checkSeasonMatchScope      (new, T030)
  → checkTeamScope             (new, T038)
```

#### Why this ordering is collision-free

- **Existing-function edits (T023, T031, T041) touch four *different* functions.** No two tasks insert into the same function body, so their anchors cannot overlap.
- **New-function edits (T030, T038) only append.** Appending at end-of-file is order-independent; running T038 before T030 changes only the resulting order of the two functions, not their behavior.
- **The import block is the only genuinely shared region.** T023 establishes both new import statements; T030 and T038 *extend the existing named import* rather than adding a duplicate. Two `import { … } from "../services/scope.js"` statements in one file is legal ESM but a lint smell and a merge-conflict magnet — hence the explicit rule.
- **`Team` is imported only at T038**, not up front at T023, so the file never carries an unused import between tasks.

#### If the stories are worked in parallel instead

The behavioral independence above still holds, but the edits collide **textually** in git. Either serialize this one file (agree that whoever finishes first pushes, the others rebase), or have one person apply T023 + T030 + T031 + T038 + T041 to `ownership.js` as a single commit while the others work the controllers and routers, which are genuinely disjoint. The same applies to `proScoutRoleDefinition.test.js`, edited by T025, T033, and T036.

### Within each story

Tests first (must fail) → scope wiring → ownership guard → gate opening → Stage-1 expectation update. The gate task in each phase explicitly depends on every implementation task before it, and the expectation update immediately follows the gate so the suite is never left red across a phase boundary.

### Parallel opportunities

- T005, T006, T008, T009, T012, T013, T014 within Phase 2
- All test-authoring tasks marked [P] across stories (they append to one shared new file — coordinate, or write into distinct `describe` blocks)
- The three story phases in full, once Phase 2 lands
- T041, T046, T047 in Phase 7

---

## Parallel Example: after Phase 2 completes

```bash
# Three developers, disjoint controllers:
Dev A: T015-T025  (US1 — playerController.js, scoutingReportController.js, playerRouter.js)
Dev B: T026-T033  (US2 — seasonMatchController.js, seasonMatchRouter.js)
Dev C: T034-T038  (US3 — teamsController.js, teamRouter.js)
# All three touch ownership.js and proScoutRoleDefinition.test.js — see the insertion contract.
```

---

## Implementation Strategy

### MVP (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3
2. **Stop and validate**: proScout sees exactly the professional-league players and its own team-less ones; everything else is 403
3. Shippable on its own — matches and teams simply stay refused, which is the correct deny-by-default state

### Incremental delivery

Each story phase leaves the system deployable, because a story that has not landed yet leaves its endpoints at 403 rather than half-scoped. This is what makes Constitution Principle V hold here: there is no intermediate broken state, only a progressively smaller refusal set.

---

## Notes

- Every new line of production code imports role names from `Backend/constants/roles.js` — no string literals (Principle VII). Test files deliberately keep literals, per the decision recorded in that file's header.
- Arabic comments marking security decisions must be preserved and extended in the same style when editing nearby code.
- `Backend/utils/apiFeatures.js` is **not** modified by any task in this list. That is deliberate — see [research.md R1](./research.md). `proScout` stays absent from `ownerFields` so the list still fails closed if the base filter is ever dropped.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
