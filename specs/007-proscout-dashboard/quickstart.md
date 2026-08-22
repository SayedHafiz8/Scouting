# Quickstart — Validating the ProScout Dashboard (Stage 5)

**Feature**: `specs/007-proscout-dashboard/` | Run top to bottom; each section states what "done"
looks like.

## Prerequisites

- Node 22 (`.nvmrc`)
- `Backend/config.env` present (see `config.env.example`) — only needed for §5/§6, not for the
  test suites, which use `mongodb-memory-server`
- Nothing to migrate or seed for this feature (no schema change — see [data-model.md](./data-model.md))

---

## §0 — Baseline before touching anything

```bash
cd Backend  && npm test
cd frontend && npx ng test --watch=false --browsers=ChromeHeadless
```

**What done looks like**: both green, and you have **written the two counts down**. Stage 4c closed
at 613 backend / 137 frontend; confirm what this branch actually reports, because the final gate
(§4) is "baseline + new cases", and a baseline assumed rather than measured makes that gate
meaningless.

Expect **7 frontend failures** later by design — the three spec files in
[research.md R10](./research.md) assert the pre-Stage-5 state:

| File | Failures |
|---|---|
| `core/services/role-landing.service.spec.ts` | 1 |
| `layout/sidebar/sidebar.component.spec.ts` | 3 |
| `core/auth/role.guard.spec.ts` | 3 |

All seven must be **green at §0** and are edited as part of the work, not after it. An 8th failure
is a real break, not an expected one — which is the whole reason for counting them here.

---

## §1 — Backend scope correctness

```bash
cd Backend
npm test -- tests/roles/proScoutDashboard.test.js
```

**What done looks like**: every guarantee G-1…G-7 from
[contracts/dashboard-proscout.md](./contracts/dashboard-proscout.md) has a case, and each of these
fails if the corresponding safeguard is removed:

- a premier-league match seeded alongside professional ones → absent from all three match figures
- a match dated **today** → in `latestResults`, not in `upcomingMatches`
- 7 upcoming matches → `upcomingMatchesCount === 7` while `upcomingMatches.length === 5`
- another proScout's `team: null` player → not in `totalPlayers`
- another user's report on an in-scope player → not in `totalReports` / `recentReports`
- `JSON.stringify(res.body)` does **not** contain `"ageGroup"`

The last one is asserted against the serialized body deliberately: `SeasonMatch`'s `pre(/^find/)`
hook auto-populates `ageGroup`, so a source-level review would pass while the response still carries
it ([research.md R6](./research.md)).

---

## §2 — Existing roles unchanged (Principle III)

```bash
cd Backend
npm test -- tests/isolation.test.js
npm test -- tests/dashboardCache.test.js tests/dashboardEmit.test.js
```

**What done looks like**:

- `isolation.test.js` passes **with zero edits to the file**. Any edit here is a breaking change
  requiring a documented security review, not a normal merge.
- Admin cache behaviour is untouched: the TTL tests still show two aggregations for the first
  request and zero for the second.
- 403 is asserted for admin, coach, and observer on `GET /dashboard/proScout` — a 200 with zeroes
  is **not** acceptable evidence of refusal (Principle I).

---

## §3 — Frontend

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless
npm run build
```

**What done looks like**:

- `role-landing.service.spec.ts` — proScout → `['/dashboard/proScout']`, and the "other three roles
  untouched" case still passes.
- `sidebar.component.spec.ts` — proScout sees exactly `['/dashboard','/players','/profile']`
  (3 anchors); admin still 6, coach and observer still 4 each, same order.
- `dashboard.routes.ts` — a coach/observer/admin opening `/dashboard/proScout` lands on their own
  destination; an unknown role lands on `/unauthorized`.
- `role.guard.spec.ts` — a refused proScout now bounces to `/dashboard/proScout` (was `/players`),
  and the "never returns true … whatever the landing is" case still passes **unchanged**. That case
  is the security assertion; the three destination strings around it are UX detail.
- `npm run build` exits 0. This is also the type-level gate: `'proScout'` in a route guard or nav
  entry is checked against the generated `UserRole` union, so a typo is a compile error.
  Two pre-existing bundle-size budget warnings are expected; no new ones.

---

## §4 — Contract regeneration (Principle V — a route was added)

```bash
cd Backend  && npm run dump-spec
cd frontend && npm run gen:types
```

**What done looks like**: `openapi.json` gains exactly one operation
(`GET /dashboard/proScout`) and one schema (`ProScoutDashboard`); `api.generated.ts` regenerates
with no unrelated diff. Both files are committed in the same change as the route.

Then re-run both suites: green at **baseline (§0) + the new cases**, with the three edited spec
files counted as edits rather than additions.

---

## §5 — Manual smoke (browser)

```bash
cd Backend  && npm start     # :8000
cd frontend && npm start     # :4200
```

1. As admin, create a user with role **proScout** (the role appears in the user form since Stage 4).
2. Create at least one team with `league: professional`, a few players on it, and both a past and a
   future professional-league match. Create one premier-league match as a control.
3. Log out; log in as the proScout.

**What done looks like**:

- Login lands on `/dashboard/proScout` — **not** `/players` (the Stage 4 temporary landing) and not
  `/unauthorized`.
- The sidebar shows exactly three entries: Dashboard, Players, Profile. No My Matches, no Age Groups.
- The premier-league control match appears nowhere.
- No card, table column, or heading mentions an age group.
- Typing `/dashboard/coach` (or `/users`, `/age-groups`) in the address bar does **not** open the
  page — it bounces back to `/dashboard/proScout`. Note this is *not* `/unauthorized`: that screen is
  for unrecognized roles, and a refused-but-recognized role goes to its own landing, exactly as a
  coach refused an admin route goes to `/dashboard/coach`.

---

## §6 — Empty state

Log in as a **second, brand-new** proScout with no players, matches, or reports.

**What done looks like**: each of the three sections renders its own explicit "nothing yet" message
and the counters read 0 — no blank panels, no spinner that never resolves, no error toast. Both
English and Arabic wording is present (`assets/i18n/en.json` and `ar.json`); switching language
shows no raw translation key.

---

## Rollback

Revert the branch. There is no migration, no seeder, no index, and no schema change to undo
([data-model.md](./data-model.md)), so revert is complete by itself — with one caveat worth stating:
reverting restores the proScout landing destination to `/players` and removes the Dashboard nav
entry, which is a coherent state (it is exactly the Stage 4 state), not a half-built one.
