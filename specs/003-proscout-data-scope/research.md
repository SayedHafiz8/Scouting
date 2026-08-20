# Phase 0 — Research: ProScout Data Scope Enforcement

**Feature**: `003-proscout-data-scope` | **Date**: 2026-08-20

This document resolves every unknown before design. Three findings **contradict assumptions
carried in `docs/scout-pro-plan-v2.md` Stage 2** and one contradicts a line in this feature's own
spec; each is called out explicitly under "⚠️ Correction".

---

## R1 — Mechanism for the player scope: `baseFilterFn`, **not** `buildOwnerScope`

**Decision**: The proScout player scope is resolved by a new central module,
`Backend/services/scope.js`, and threaded into `playerController.getAll` as the base filter passed
to `Player.find(...)` — the same position `gettingAll` uses for `baseFilterFn`. It is **not** added
to the `ownerFields` map in `ApiFeature.buildOwnerScope`.

**⚠️ Correction**: `docs/scout-pro-plan-v2.md` Stage 2 item 2 says *"سكوب اللاعبين في apiFeatures.js
buildOwnerScope"*. The Constitution overrides this (Governance: "عند التعارض … الدستور هو المرجع").
Constraint **C-4** states the scope *"MUST يُنفَّذ عبر `baseFilterFn` (Principle IV)، لأن شكله `$or`
مركّب لا يُعبَّر عنه بـ `ownerFields`"*.

**Rationale**: `buildOwnerScope` returns `{ [field]: this.user._id }` — a single path compared to a
single id ([apiFeatures.js:92](../../Backend/utils/apiFeatures.js#L92)). The required shape is a
two-branch `$or` whose first branch needs an **async** database lookup (professional team ids).
`ApiFeature.filter()` is synchronous and chained (`.filter().searchPrefix().sort()`); making
`buildOwnerScope` async would force every caller to `await` mid-chain — a breaking change to the one
class that the whole isolation contract rests on. That is a far larger blast radius than adding a
base filter.

**Alternatives considered**:
- *Async `ownerFields` values* (`{ proScout: async (user) => ({...}) }`) — rejected: turns
  `ApiFeature.filter()` async, touching every list endpoint and `tests/isolation.test.js`. Violates
  Principle III's blast-radius intent.
- *Inline `$or` written directly in `playerController.getAll`* — rejected outright by Principle IV:
  *"كتابة شرط فلترة يدوي داخل controller … MUST NOT تحدث"*. It would also drift from the copy needed
  in `ownership.js` and the two aggregations.

**Consequence**: `ApiFeature.buildOwnerScope` is **not modified at all** in this feature. `proScout`
stays absent from the `ownerFields` map, so it keeps resolving to `MATCH_NOTHING` there — the base
filter narrows on top of that. This is intentional belt-and-braces: even if the base filter were
ever dropped by mistake, the list fails **closed**, not open.

---

## R2 — Resolving professional team ids (and the `active`-flag trap)

**Decision**: One helper in the scope module, memoized **per request** on the `req` object:

```js
req.__professionalTeamIds ??= await Team.find({ league: "professional" })
    .setOptions({ bypassFilter: true })
    .distinct("_id");
```

**Rationale for per-request (not process-level) caching**: the spec's edge case requires scope to
*"reflect the team's current league at request time, not a cached value"*. A per-request cache
satisfies the plan doc's *"مرة واحدة لكل طلب مع cache، مش استعلام لكل لاعب"* while a TTL cache would
violate the edge case and add an invalidation bug surface for zero measurable gain (the query is a
covered `distinct` on a small collection).

**Two traps here — the first was originally written from recall and is corrected below after being
measured. Treat the measured behavior as authoritative.**

1. **No `.distinct()` spelling fires `pre(/^find/)` — the risk is switching *away* from `distinct`.**

   `teamModel.js` registers its soft-delete hook on `/^find/`
   ([teamModel.js:52](../../Backend/models/teamModel.js#L52)). Mongoose dispatches query middleware
   on the query's **final op**, and `.distinct()` sets `op = "distinct"`, which never matches
   `/^find/`. Measured on `mongodb-memory-server` against a fixture of 2 active + 1 deactivated
   professional team:

   ```
   Team.distinct("_id", filter)                          → 2   (hook skipped)
   Team.find(filter).distinct("_id")                     → 2   (hook skipped — same!)
   Team.find(filter).setOptions({bypassFilter}).distinct → 2   (identical)
   Team.find(filter)                          [control]  → 1   (hook applied)
   ```

   > ⚠️ **An earlier draft of this document claimed the first two spellings return *different* sets,
   > and that `find().distinct()` applies the filter. That is false.** All three `distinct` forms are
   > equivalent; only a query that *stays* a `find` runs the hook. Do not reason from the old claim.

   Consequences for T010:

   - `.setOptions({ bypassFilter: true })` is a **no-op** in this call. Keep it — it documents the
     intent — but it is belt-and-braces, **not** the mechanism. The mechanism is the op name.
   - The actual hazard is the reverse of what the old text implied: rewriting the helper to any form
     that returns documents (`Team.find(q).select("_id")`, `.lean().then(map)`, …) **would** apply
     the hook and silently drop deactivated professional teams — vanishing their players from the
     proScout's list. That refactor looks like a harmless simplification.
   - Because no spelling enforces the requirement, T012's scope-shape test must assert it directly:
     a deactivated professional team's id **must** appear in `professionalTeamIds`. That test, not
     the option flag, is what actually protects trap 2.

2. **Deactivated professional teams MUST stay in scope.** A soft-deleted `Team` still has
   `Player.team` documents pointing at it. Excluding it would make those players vanish from the
   proScout's list *without* making them out-of-league — a silent data-loss bug, not a security
   win. Including them cannot leak: everything reachable through that branch is professional-league
   data by construction. Direction of error matters here, and it points to "include".

   **The deliberate asymmetry this creates** — and it is deliberate, so do not "fix" it:

   | Path | Query op | Soft-delete hook | Deactivated pro team |
   |---|---|---|---|
   | `professionalTeamIds` (player scope) | `distinct` | skipped | **included** — its players stay visible |
   | teams list (R8, via `gettingAll`) | `find` | applied | excluded — matches every other role |
   | `checkTeamScope` (R8, via `Team.exists`) | `findOne` | applied | excluded — not browsable by id |

   `Model.exists()` runs as `findOne`, so it **does** fire the hook — verified. The list and the
   by-id guard therefore agree with each other, and both differ from the player-scope helper on
   purpose: a proScout can see a player *on* a retired professional team without being able to open
   that team's record.

---

## R3 — `Player.createdBy`: field, auto-fill, backfill, and lock

**Decision**: Add `createdBy: { type: ObjectId, ref: "User" }` to `playerSchema` (not `required`),
set server-side in `playerController.create`, backfilled from `coach` by a one-shot script, and
locked against client input in both validation chains.

**Why not `required: true`**: `coach` is deliberately non-required
([playedModel.js:95-99](../../Backend/models/playedModel.js#L95-L99)) so orphaned players survive a
coach deletion. Making `createdBy` required would make the *pre-existing* documents un-updatable
until the backfill runs (`runValidators: true` is on in `services.updating`), coupling every player
edit to migration ordering. Non-required + backfill is the reversible path Principle V asks for.

**Auto-fill**: `playerController.create` already does `req.body.coach = req.user._id`
([playerController.js:36](../../Backend/controllers/playerController.js#L36)); `req.body.createdBy =
req.user._id` sits beside it. Assignment happens *after* the body is received, so a client-supplied
value is overwritten rather than honoured.

**Mass-assignment lock**: belt-and-braces on top of that — add `lockField("createdBy")` to both
`createValidate` and `updateValidate` in
[playerValidation.js](../../Backend/utils/validation/playerValidation.js), matching the existing
`lockField("coach")` / `lockField("ageGroup")` treatment of server-owned fields. Without it,
`PATCH /players/:id` (which passes `req.body` straight to `findByIdAndUpdate`) would let a coach
rewrite the attribution of any player they own.

**Backfill**: a new `Backend/scripts/backfillPlayerCreatedBy.js` modelled line-for-line on
[backfillSearchTokens.js](../../Backend/scripts/backfillSearchTokens.js) — dry-run by default,
`--apply` to write, cursor + `bulkWrite` in batches of 500, idempotent (`createdBy: { $exists:
false }` only). Orphaned players (`coach` unset) are counted and **skipped**, not defaulted to some
arbitrary user — an orphan has no honest creator, and `createdBy: null` behaves identically to
absent for the scope query.

**Rollback path** (Principle V): `Player.updateMany({}, { $unset: { createdBy: "" } })`. Documented
in the script header. The field is additive and read by exactly one code path, so unsetting it
restores prior behavior with no schema change.

---

## R4 — Direct-ID enforcement reuses the *same filter object*

**Decision**: `ownership.js` guards for proScout do not re-express the scope as boolean logic. They
run the list filter against the single id:

```js
const inScope = await Player.exists({ _id: id, ...(await playerScopeFor(req)) });
if (!inScope) { /* log + 403 */ }
```

**Rationale**: This is the direct mechanical guarantee behind **FR-011** ("same rule whether reached
through a list endpoint or a direct lookup"). Any hand-written re-implementation of "is this player
in scope" is a second definition that can drift from the first — precisely the failure Principle IV
exists to prevent. Passing the identical object to `find` and to `exists` makes drift impossible by
construction rather than by test discipline.

**Cost**: one extra indexed query per `/:id` request for this role only. The `{ team: 1 }` sparse
index ([playedModel.js:205](../../Backend/models/playedModel.js#L205)) covers the first `$or`
branch; the second branch is a two-field equality match. Acceptable.

---

## R5 — Aggregation pipelines need explicitly cast `ObjectId`s

**Decision**: The scope helper returns **real `mongoose.Types.ObjectId` instances**, never strings.

**Rationale**: `Model.find()` casts query values against the schema; `Model.aggregate()` does
**not** — a `$match` with string ids matches zero documents, silently. Both consumers of this scope
(`getCountsByAgeGroup` and the average-ratings pre-filter) are aggregations. A string-typed scope
would fail *closed* (empty results, no error), which is safe but produces a confusing "the feature
just doesn't work" bug that is tedious to trace. `Team...distinct("_id")` already returns
`ObjectId`s; `req.user._id` is already an `ObjectId`. The requirement is simply to **not**
`String()` them anywhere along the way, and to assert it in a test.

**Composition in `$match`**: combine with `$and`, not object spread —
`{ $and: [scopeFilter, otherMatch] }`. Spreading risks a silent key collision if a future filter
ever introduces a `team` or `$or` key at the top level; `$and` cannot collide.

---

## R6 — ⚠️ Correction: `average-ratings` is **not** currently unfiltered

**Finding**: `docs/scout-pro-plan-v2.md` (Stage 1 note and Stage 2 preamble) and **FR-012 of this
feature's own spec** both state that all three deferred endpoints "fall back to an unfiltered
dataset" for an unrecognized role. That is true for two of the three, and **false for the third**.

| Endpoint | Actual behavior for an unrecognized role today | Real leak if `allowedTo` were opened first? |
|---|---|---|
| `GET /players/counts` | `match = {}` → counts **every player in the database** ([playerController.js:51-90](../../Backend/controllers/playerController.js#L51-L90)) | **Yes** — full-collection count leak |
| `GET /seasonMatches` | `seasonMatchBaseFilterFor` returns `{}` → **every match** ([seasonMatchController.js:25-32](../../Backend/controllers/seasonMatchController.js#L25-L32)) | **Yes** — full schedule leak |
| `GET /players/reports/average-ratings` | `if (role !== ADMIN) match.coach = req.user._id` → **only the requester's own reports** ([scoutingReportController.js:294-296](../../Backend/controllers/scoutingReportController.js#L294-L296)) | **No** — already narrow |

**Consequence for this feature**: the average-ratings endpoint is scoped on the **wrong axis**, not
unscoped. It restricts by *report authorship*, not by *player league*. Today a proScout authors no
reports, so it would return `{}` — safe but not for the stated reason. It still needs work, because
it accepts an arbitrary `?ids=` list and answers questions about players the caller may not be
allowed to know exist.

**FR-012's blanket-refusal ordering rule still holds for all three** — it is simply *load-bearing*
for two of them and *belt-and-braces* for the third. The spec sentence should be read as accurate
about `counts` and `seasonMatches`; `plan.md` records the correction rather than silently
implementing against a wrong premise.

---

## R7 — Scoping the average-ratings axis: intersect, don't replace

**Decision**: For proScout, keep the existing `coach: req.user._id` restriction **and** additionally
narrow `ids` to players inside the scope:

```js
const scopedIds = await Player.find({ _id: { $in: ids }, ...scope }).distinct("_id");
```

**Rationale**: Two independent narrowings, both preserved. Dropping the authorship restriction to
"all reports on in-scope players" would be *widening* — the opposite of Principle II — and would make
proScout the only non-admin role that reads other people's reports. Keeping both makes proScout
behave exactly like coach and observer on this endpoint, plus a league bound. Once Stage 4 lets
proScout author reports, the endpoint becomes useful with no further change.

**Alternatives considered**: *league-only, ignoring authorship* — rejected as a silent privilege
grant that no requirement asks for. *Leave the endpoint at 403* — rejected: FR-012 explicitly
requires the conversion, and the id-list is an existence oracle worth closing regardless.

---

## R8 — Teams: list via base filter, detail via a **fifth** ownership guard

**Decision**:
- `GET /teams` — add a `baseFilterFn` to the existing `gettingAll(Team, ...)` call returning
  `{ league: "professional" }` for proScout and `{}` for every other role.
- `GET /teams/:id` — add a **new** `checkTeamScope` guard to `ownership.js`.

**⚠️ Correction**: `docs/scout-pro-plan-v2.md` Stage 2 item 5 says *"أضف فرع proScout صريح في الأربع
دوال"* — four ownership functions. There are four today, and `Team` has none, because `gettingSpecific(Team)`
([teamsController.js:29](../../Backend/controllers/teamsController.js#L29)) performs a bare
`findById` with no scope hook whatsoever. Constraint C-3 nonetheless requires `GET /teams/:id` to be
league-scoped for the new role, and Principle IV requires ID-route refusals to come from the
ownership layer. So the count is **five**, and the fifth is new.

**Why `Team` gets no `ownerFields`**: deliberate, and documented in place —
*"Team مالهاش حقل ملكية أصلاً (ownerFields متغيّبة عمداً) — دي داتا مرجعية مشتركة"*
([teamsController.js:17-18](../../Backend/controllers/teamsController.js#L17-L18)). A league scope is
not an ownership scope; it belongs in the base filter. This preserves that comment's invariant
rather than contradicting it.

**Existing-role safety**: `TEAM_FILTERS` already whitelists `league`, so admin/coach/observer keep
passing `?league=` exactly as before; the base filter is `{}` for them, and `{} `spread into
`find()` is a no-op. C-3's *"القراءات المفتوحة تبقى مفتوحة"* is preserved literally.

---

## R9 — Denial logging: structured stderr, not a Mongo collection

**Decision**: A small `Backend/utils/accessLog.js` emitting one structured line per refusal:
`{ event: "scope_denied", userId, role, method, path, resourceId, at }`. **No new collection.**

**Rationale**: Constitution Principle IV requires *"معرّف المستخدم، الرول، المسار، ومعرّف المورد
المطلوب"* — four fields, all available at the refusal site, all present above. The project has
exactly one audit *collection* ([idCardAccessLogModel.js](../../Backend/models/idCardAccessLogModel.js))
and it logs **successful, rate-limited, human-initiated** ID-card reads — a fundamentally different
volume profile.

A collection here would be **attacker-controlled unbounded writes**: anyone holding a valid token can
generate one document per request by looping ids, turning an audit feature into a disk-exhaustion
vector against the same database that serves the app. Log lines go to the process's stream where
the host's existing rotation and retention already apply, and cost nothing to discard.

**Alternatives considered**: *Mongo collection with a TTL index* — rejected; a TTL bounds retention,
not write rate, so the DoS window stays open. *`console.warn` inline at each site* — rejected; five
call sites drifting in field names defeats the purpose of an audit trail.

**Test approach**: spy on the logger module (the project already mocks external I/O globally in
`tests/setup.js`), assert one call with the four required fields per denial. This is what makes
SC-004's "zero silent denials" verifiable.

---

## R10 — Which `allowedTo` gates open in this phase

Scope must land **before** the gate opens (FR-012, and the ordering assumption in the spec). Within
this phase the ordering is: scope module → base filters → ownership guards → *then* the gate edits.

**Opened here** (reads whose scope is now genuinely central):

| Route | Today | After | Enforced by |
|---|---|---|---|
| `GET /players/:id` | 403 | scoped 200 / 403 | `checkPlayerOwnership` proScout branch |
| `GET /players/counts` | 403 | scoped | `$match` from scope module |
| `GET /players/reports/average-ratings` | 403 | scoped | id pre-filter (R7) |
| `GET /seasonMatches` | 403 | scoped | `seasonMatchBaseFilterFor` |
| `GET /seasonMatches/:id` | 403 | scoped 200 / 403 | new `checkSeasonMatchScope` |
| `GET /teams`, `GET /teams/:id` | 200 unscoped | scoped | base filter + `checkTeamScope` |

**Deliberately left at 403** — writes belong to Stages 4 and 6, and this phase is read-scope only:
`POST`/`PATCH /players`, `POST /players/:playerId/reports`, `POST /players/:playerId/media`,
`PATCH /players/:id/profileImg`, `POST`/`DELETE /seasonMatches/:id/attend`,
`PATCH /seasonMatches/:id/status`.

**But their guards are wired anyway.** `checkReportOwnership`, `checkMediaOwnership`, and
`checkSeasonMatchAttendee` get explicit proScout branches in this phase even though nothing routes to
them for this role yet. This is exactly the lesson Stage 1 recorded: the danger is a future
`allowedTo` edit reaching a guard that never considered the role. Wiring the guard first makes the
later gate-opening a one-line change with no security thinking left undone.

---

## R11 — Response masking for proScout on player reads

**Decision**: Apply the existing `maskObservedForCoach` treatment to proScout in `getAll` and
`getSpecific` — `status: "observed"` renders as `"pending"`, and the `observers` array is stripped.

**Rationale**: Opening `GET /players/:id` (R10) exposes a response body that currently has *no*
masking branch for this role — it falls past both `if`s and returns the raw document including the
`observers` array. Choosing nothing is still choosing. Deny-by-default (Principle II) says take the
narrower option now; `docs/scout-pro-plan-v2.md` Stage 4 carries an open
`[NEEDS CLARIFICATION]` on whether proScout should see observer assignments, and masking keeps that
question genuinely open. Un-masking later is an additive change; un-leaking is not.

Note `maskCoachForObserver` is **not** applied — `player.coach` is not sensitive to a proScout under
any reading of the plan, and hiding it would break the coach column in the Stage 4 players page for
no stated reason.

---

## R12 — ⚠️ Every scope filter MUST be wrapped in `$and`

**Found during `/speckit-analyze`, after the initial design was written. This corrects R1's
composition rule and is the single most important constraint in this feature.**

**Problem**: The base-filter mechanism sanctioned by Constraint C-4 places the scope in
`Model.find(scope)` and lets `ApiFeature.filter()` chain `.find(clientQuery)` on top. Chained
Mongoose conditions merge **last-wins on key collision** — they do not AND. And `league`, the very
key the match and team scopes use, is a **whitelisted client filter** in both
`SEASON_MATCH_FILTERS` ([seasonMatchController.js:21](../../Backend/controllers/seasonMatchController.js#L21))
and `TEAM_FILTERS` ([teamsController.js:19](../../Backend/controllers/teamsController.js#L19)).

Measured on the project's own mongoose (9.7.2):

```
find({league:"professional"}).find({league:"premier"})  →  {"league":"premier"}
```

So a proScout calling `GET /seasonMatches?league=premier` or `GET /teams?league=premier` would have
received the **entire premier league**. That is a direct breach of FR-004, FR-005, FR-007 and
SC-001 — produced by the design, not by an implementation slip.

**Decision**: `services/scope.js` returns every non-empty scope wrapped in `$and`:

```js
{ $and: [ { league: "professional" } ] }
{ $and: [ { $or: [ { team: { $in: ids } }, { team: null, createdBy: userId } ] } ] }
```

`$and` is not in any `allowed` whitelist, so no client key can collide with it. Measured behavior:

```
find({$and:[{league:"professional"}]}).find({league:"premier"})
  →  {"$and":[{"league":"professional"}], "league":"premier"}     // AND → zero rows ✅
find({$and:[{league:"professional"}]}).find({$and:[{team:X}]})
  →  {"$and":[{"league":"professional"},{"team":X}]}              // layers concatenate ✅
```

Zero rows is exactly what the spec's edge case prescribes for a contradictory filter combination —
"returns zero results rather than an error". The empty scope for non-proScout roles stays a bare
`{}` (no `$and` wrapper), so existing roles' queries remain byte-identical (Principle III).

**Why the existing observer scope never exposed this**: `seasonMatchBaseFilterFor` filters on `$or`
/ `homeTeam` / `awayTeam`, and none of those is a client-whitelisted key. That code is safe **by
accident of key choice, not by design** — which is precisely why C-4 naming it "النموذج المرجعي"
propagated an unsafe assumption into this plan.

**Constitutional note**: this resolves a real tension. Principle IV requires ownership scope to be
applied **last** (`query العميل < param المسار < سكوب الملكية`), but C-4 mandates `baseFilterFn`,
which runs **first** in the chain — the opposite precedence. The `$and` wrapper restores the
intended semantics without modifying `ApiFeature`, which is what keeps the blast radius at zero.

**Alternatives considered**:
- *Strip `league` from `queryParams` for proScout before `ApiFeature`*, mirroring
  `PLAYER_ADMIN_ONLY_LENSES` — rejected: fixes only the keys someone remembers to strip, and the
  next scope key added anywhere silently reopens the hole. `$and` is safe for all keys, forever.
- *Remove `league` from the whitelists* — rejected: changes existing-role behavior (Principle III).
- *Apply the scope after `.filter()`* — rejected: requires reordering `gettingAll` for every model.

---

## Summary of deviations from `docs/scout-pro-plan-v2.md` Stage 2

| Plan doc said | This plan does | Why |
|---|---|---|
| Scope via `apiFeatures.js buildOwnerScope` | Central scope module + base filter; `buildOwnerScope` untouched | Constitution C-4 mandates `baseFilterFn`; async lookup cannot live in a sync chained method (R1) |
| "الأربع دوال" in `ownership.js` | **Five** — a new `checkTeamScope` | `GET /teams/:id` has no guard today, and C-3 requires it scoped (R8) |
| All three deferred endpoints leak everything | Two leak; average-ratings is scoped on the wrong axis | Verified against source (R6) |
| — | Also opens `GET /players/:id` + masks proScout responses | Required by FR-003 "player detail"; masking is the deny-by-default reading (R10, R11) |
