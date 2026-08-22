# Quickstart: Pro Scout Matches & Attendance

**Feature**: `specs/008-proscout-matches-attendance/` | Phase 1 validation guide

## Prerequisites

- Backend: `cd Backend && npm test` runnable (spins up `mongodb-memory-server`, no live DB needed).
- Frontend: `cd frontend && npx ng test --watch=false --browsers=ChromeHeadless` runnable.
- A seeded `proScout` user, a professional-league `Team`/`SeasonMatch`, and a premier-league
  `SeasonMatch`, built via `Backend/tests/helpers/factory.js` (not inline `create` calls, per project
  convention).

## §0 — Regenerate the spec after route changes

```bash
cd Backend && npm run dump-spec
cd ../frontend && npm run gen:types
```

Run once `seasonMatchRouter.js`'s `allowedTo` lists change (Constitution Principle V).

## §1 — Backend: attend is scoped (G-1, G-2)

```bash
cd Backend
npm test -- tests/roles/proScoutMatchAttendance.test.js
```

Expected: a proScout attending a professional-league match gets 200 with its id added to
`attendees` (G-1); the identical call against a premier-league match id gets 403 before
`attendMatch` runs (G-2) — assert via a spy or a document-unchanged check, not just the status code.

## §2 — Backend: status entry is scoped + attendee-gated (G-9…G-12)

```bash
npm test -- -t "proScout.*status"
```

Expected: 200 only when all three hold at once — professional league, registered attendee, today is
the match date. Flip any one condition and expect 403 (not-in-scope or not-an-attendee) or 400
(wrong day) per [contracts/season-match-attend-status.md](./contracts/season-match-attend-status.md).

## §3 — Backend: coach/observer/admin unchanged

```bash
npm test -- tests/isolation.test.js
npm test -- tests/roles/
```

Expected: `isolation.test.js` passes with **zero edits**. Every existing coach/observer/admin
attend/status test still passes unmodified.

## §4 — Frontend: age group hidden, league locked, attendance + result entry work

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless --include='**/my-matches.component.spec.ts'
```

Expected (new spec file, `research.md R7`): as proScout — no age-group column in the DOM, no league
toggle in the DOM, `selectedLeague()` starts at `'professional'`, attend/unattend button works on an
in-scope match, and the result-entry form appears/saves exactly when `canEnterResult()` says it
should (unchanged method, now exercised under a proScout identity for the first time).

## §5 — Frontend: nav + landing/rejection matrix

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts' --include='**/role-landing-destinations.spec.ts' --include='**/role.guard.spec.ts'
```

Expected: sidebar shows 4 items for proScout (Dashboard, Players, My Matches, Profile). The new
central matrix (`role-landing-destinations.spec.ts`) passes for every role. `role.guard.spec.ts`'s
refusal assertions, now computed from `RoleLandingService` rather than hardcoded, still pass — proving
the two didn't drift apart in this stage's own change.

## §6 — Manual sanity (dev servers)

```bash
# terminal 1
cd Backend && npm start
# terminal 2
cd frontend && npm start
```

Log in as a seeded proScout, open **My Matches**: only professional-league fixtures, no age-group
column, no league toggle. Attend an upcoming one; on its match day, log in again and enter a result.
Confirm a premier-league match id typed directly into the URL 403s.
