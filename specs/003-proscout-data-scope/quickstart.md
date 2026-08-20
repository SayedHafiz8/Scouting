# Quickstart — validating ProScout Data Scope Enforcement

**Feature**: `003-proscout-data-scope` | **Date**: 2026-08-20

How to run and prove this feature works. Implementation details live in
[plan.md](./plan.md) and [data-model.md](./data-model.md); this is the validation guide.

---

## Prerequisites

```bash
node -v          # must be 22 (see .nvmrc)
cd Backend && npm ci
```

No live database is needed for the test suite — `mongodb-memory-server` boots automatically via
`tests/globalSetup.js`. `config.env` is only needed for `npm start` and the backfill script.

---

## 1. The regression gate (run this first, and again last)

Principle III is non-negotiable, so the existing isolation contract is the gate on everything else.

```bash
cd Backend
npm test -- tests/isolation.test.js
```

**Expected**: all pass, with the file **unmodified**. If a change here seems necessary, stop — that
is a breaking change requiring a documented security review, not a test fix.

Then the broader existing-role regression:

```bash
npm test -- tests/players.test.js tests/seasonMatches.test.js tests/teams.test.js tests/ownership.test.js
```

**Expected**: all pass unchanged. These encode admin/coach/observer behavior across exactly the
surfaces this feature touches.

---

## 2. The new scope suite

```bash
npm test -- tests/roles/proScoutDataScope.test.js
```

Fixtures come from `tests/helpers/factory.js` (`createProScout`, `createTeam`, `createPlayer`,
`createCoach`, `seedAgeGroups`) — never inline `create` calls.

### Scenarios this suite must cover

Derived from the spec's acceptance scenarios and Constitution Principle VI. Each **positive** case
asserts exact count *and* content; each **negative** asserts **403**, never an empty 200.

**Scope module** (foundational — pins the invariant at its source)

| # | Setup | Expect |
|---|---|---|
| 1 | each scope helper, called for each role | proScout → an **`$and`-wrapped** filter; admin/coach/observer → exactly `{}`. An unwrapped scope is silently overwritten by a colliding client key (research R12), so this is the test that catches an unwrapping regression before it reaches an endpoint |

**Players** (spec US1)

| # | Setup | Expect |
|---|---|---|
| 2 | player on a `professional` team | present in `GET /players` |
| 3 | player on a `premier` team | absent from list; `GET /players/:id` → **403** |
| 4 | `team: null`, `createdBy` = this proScout | present |
| 5 | `team: null`, `createdBy` = another user | absent; direct id → **403** |
| 6 | `?team=<premier team id>` | `team` **is** in `PLAYER_FILTERS`, so this reaches the merge — the real escalation vector. Result stays in-scope (empty) |
| 7 | `?league=premier` on `/players` | `league` is **not** in `PLAYER_FILTERS`, so it is *dropped* before the filter, never merged. Same outcome as #6, different mechanism — the test comment must say which is which |
| 8 | `?keyword=<prefix matching an out-of-scope player>` | search returns only in-scope matches (Principle VI: البحث داخل النطاق فقط) |
| 9 | `?keyword=` combined with `?team=<premier id>` | search still cannot widen the scope — mirrors the coach/observer cases already in `isolation.test.js` |
| 10 | `?sort=` and `?page=`/`?limit=` over a mixed dataset | ordering and paging operate strictly inside scope; `count`, `numberOfPages`, and `next`/`prev` never reflect excluded records |
| 11 | mixed dataset | `count` equals the manually computed professional subset |
| 12 | in-scope player detail, player has observers and status `observed` | 200, `observers` **absent**, status reads `pending`, `coach` still present (FR-014) |

**Aggregates** (spec US1 scenario 6, FR-012/FR-013)

| # | Setup | Expect |
|---|---|---|
| 13 | mixed dataset | `GET /players/counts` → 200, `total` equals the in-scope count only |
| 14 | `?ids=` containing out-of-scope player ids | `GET /players/reports/average-ratings` → 200, those ids absent from the response |
| 15 | scope filter values | are real `ObjectId`s — a string-typed scope silently matches nothing in `$match` (research R5) |

**Season matches** (spec US2)

| # | Setup | Expect |
|---|---|---|
| 16 | `league: professional` match | present in `GET /seasonMatches` |
| 17 | `league: premier` match | absent; `GET /seasonMatches/:id` → **403** |
| 18 | `?league=premier` on `/seasonMatches` | **zero rows**, not the premier schedule. `league` **is** whitelisted here, so without the `$and` wrapper the client value replaces the scope outright (research R12) |
| 19 | attendance on an out-of-scope match | **403** (today via `allowedTo`; the guard branch also checks scope, wired ahead of Stage 6) |
| 20 | observer requests matches | same count and same ids as before this feature — `seasonMatchBaseFilterFor` is restructured, and its observer branch is Constitution-protected |

**Teams** (spec US3)

| # | Setup | Expect |
|---|---|---|
| 21 | `professional` team | present in `GET /teams` |
| 22 | `premier` team | absent; `GET /teams/:id` → **403** |
| 23 | `?league=premier` on `/teams` | **zero rows** — same escalation vector as #18, second affected endpoint |
| 24 | admin / coach / observer request teams | result identical to pre-feature — this is the C-3 guarantee |

**Denial logging** (spec US4, SC-004)

| # | Setup | Expect |
|---|---|---|
| 25 | an out-of-scope `/:id` request on each of player, season match, and team | logger called exactly once per denial with `userId`, `role`, `path`, `resourceId` |

**Deny-by-default sweep** (Principle II)

| # | Setup | Expect |
|---|---|---|
| 26 | every route in [the endpoint matrix](./contracts/proscout-endpoint-matrix.md) marked 403 | returns 403 for proScout — assert the **status code**, never an empty body |

### Four intended changes to an existing test

`tests/roles/proScoutRoleDefinition.test.js` encodes Stage 1's deliberate deferrals. This feature
resolves them, so **four** of its expectations flip — all about the proScout role only, none about
admin, coach, or observer:

| Expectation | Was | Becomes | Updated by |
|---|---|---|---|
| `GET /players/counts` | 403 | scoped 200 | T025 |
| `GET /players/reports/average-ratings` | 403 | scoped 200 | T025 |
| `GET /seasonMatches` | 403 | scoped 200 | T033 |
| `GET /teams` | unscoped 200 | scoped 200 | T036 |

Each update lands in the **same phase** as the gate that causes it, so the suite is never left red
across a phase boundary. If you see these three go red between opening a gate and updating the file,
that is the expected intermediate state — not a regression.

T025 also rewrites the block comment above those tests. It currently claims all three deferred
endpoints "fall through to an UNFILTERED query" — true for counts and seasonMatches, **false** for
average-ratings, which was already restricted to the requester's own reports ([research R6](./research.md)).

Every other expectation in that file (`GET /users`, `POST /players`, `POST …/reports` → 403) stays
exactly as it is.

---

## 3. Full suite + the other CI gates

```bash
cd Backend  && npm test
cd frontend && npm run build && npx ng test --watch=false --browsers=ChromeHeadless
```

The frontend is not modified by this feature, but both gates are blocking in CI and the generated
types change (below).

---

## 4. Regenerate the API contract

Required by Principle V whenever a route's shape or access changes — six gates open here.

```bash
cd Backend  && npm run dump-spec     # → ../openapi.json
cd frontend && npm run gen:types     # → src/app/core/models/api.generated.ts
```

Commit both. Skipping this leaves `UserRole` and the endpoint inventory stale, and the inventory is
what Principle VI's audit is built from.

---

## 5. The backfill (deployment step, not a test step)

Additive and non-required, so it can run before or after deploy without breaking edits.

```bash
cd Backend
npm run backfill-player-createdby              # dry run — reports counts, writes nothing
npm run backfill-player-createdby -- --apply   # writes
npm run sync-indexes -- --apply                # creates { team, createdBy }
```

**Expected dry-run output**: total players, how many lack `createdBy`, and how many are orphans
(no `coach`) that will be **skipped** — an orphan has no honest creator, and absent behaves
identically to null in the scope query.

Re-running is safe: the selection matches only documents still missing the field.

**Rollback**: `Player.updateMany({}, { $unset: { createdBy: "" } })`. The field is read by exactly
one code path, so unsetting it restores prior behavior with no schema change.

---

## 6. Manual smoke check (optional)

```bash
cd Backend && npm start      # needs config.env
```

As an admin, create a proScout (`POST /api/v1/users` — signup is disabled by design), one
`professional` team and one `premier` team, and a player on each. Then, as the proScout:

```
GET /api/v1/players            → only the professional-team player
GET /api/v1/players/<premier player id>   → 403
GET /api/v1/teams              → only the professional team
GET /api/v1/seasonMatches      → only league=professional
```

Confirm a `scope_denied` line appears in the server output for each 403.
