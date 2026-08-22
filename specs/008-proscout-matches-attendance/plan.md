# Implementation Plan: Pro Scout Matches & Attendance

**Branch**: `phase-6-matches-attendance` | **Date**: 2026-08-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-proscout-matches-attendance/spec.md`

## Summary

Open match attendance and match-result entry to `proScout`, and give it the matches page. The read
path (`GET /seasonMatches`, `GET /seasonMatches/{id}`) is already fully scoped from Stage 2/3 — this
stage's real surface is three route decisions and one frontend page:

1. `POST`/`DELETE /seasonMatches/{id}/attend` open to `proScout`, newly gated by the existing
   `checkSeasonMatchScope` middleware (reused, not reimplemented).
2. `PATCH /seasonMatches/{id}/status` opens to `proScout` too — **corrected from the original plan's
   "recommend deny"**: the role gets the same result-entry authority as an attendee coach/observer,
   under the identical same-day-attendee constraint. This requires fixing a Stage-2 placeholder in
   `checkSeasonMatchAttendee` that computes the right scope check and then denies unconditionally
   regardless of the result.
3. `MyMatchesComponent` — already role-agnostic for attendance and result entry — gets the age-group
   column and league toggle hidden for this role, and the sidebar/route guard opened, discharging
   DF-002 from Stage 3.

A fourth, cross-cutting piece rides along per Stage 5's review follow-up: a single consolidated test
(`role-landing-destinations.spec.ts`) that pins every role's login-landing and access-refusal
destination in one place, so this stage's own nav change can't quietly drift the way Stage 4/5's did.

The risk is concentrated in two places, both addressed by construction:

1. **A Stage-2 placeholder that looks finished but isn't.** `checkSeasonMatchAttendee`'s proScout
   branch already computes league scope correctly, then denies anyway, always — reading the comment
   next to it confirms this was deliberate ("attendance itself is refused regardless, for now").
   Fixing it means adding the missing attendee-membership check and actually branching on the scope
   result, not writing new logic from scratch ([research.md R2](./research.md)).
2. **The attend routes have no ownership guard today at all.** `allowedTo(PRO_SCOUT)` alone on
   `/attend` would let a proScout attend any match in the database by ID — reusing
   `checkSeasonMatchScope` (already proven correct for `GET /:id`) closes this without a second
   definition of "in scope" ([research.md R4](./research.md)).

## Technical Context

**Language/Version**: Node 22 (`.nvmrc`); ESM throughout the backend (`"type": "module"`)

**Primary Dependencies**: Express 5, Mongoose 9.7.2, Angular 21 (standalone + signals), ngx-translate

**Storage**: MongoDB. **No schema change, no migration, no new index** — see
[data-model.md](./data-model.md)

**Testing**: vitest (backend, sequential, `mongodb-memory-server`); Karma/Jasmine (frontend);
Playwright (e2e, not extended by this feature)

**Target Platform**: Web — Express API on :8000 dev, Angular SPA on :4200

**Project Type**: Web application (separate `Backend/` and `frontend/` projects)

**Performance Goals**: No new access pattern; attend/status reuse existing indexed lookups
(`_id`, `league`). No caching involved.

**Constraints**: Constitution v1.0.2 Principles I–VII; Constraint C-4 (`league: "professional"` is
the only accepted definition of the second division; `ageGroup` stays `required: true` on
`SeasonMatch` with no exception); C-3 remains open and untouched

**Scale/Scope**: 0 new endpoints (84 total, 3 proScout decisions changed), 1 new frontend spec file
(no baseline existed — [research.md R7](./research.md)), 1 new consolidated landing/rejection spec,
2 existing frontend specs edited (`sidebar.component.spec.ts`, `role.guard.spec.ts`), ~4 i18n key
reuses (no new copy needed — the page's existing strings are already role-neutral)

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Both passes below.*

| Principle | Verdict | How this design satisfies it |
|---|---|---|
| **I — Server-side enforcement first** | ✅ PASS | Attend and status are gated by `allowedTo` + `checkSeasonMatchScope`/`checkSeasonMatchAttendee` before any UI exists to call them. Refusal is 403/400 per [contracts/season-match-attend-status.md](./contracts/season-match-attend-status.md), never 200-with-no-effect. Hiding the league toggle or age-group column is never offered as evidence of enforcement — it is UX only, stated explicitly in [research.md R6](./research.md). |
| **II — Deny by default** | ✅ PASS | Both attend routes and `/status` carry explicit, unwidened `allowedTo` additions. No route's `allowedTo` is touched beyond adding `PRO_SCOUT`. The corrected `checkSeasonMatchAttendee` branch still ends in an explicit deny for every condition it doesn't grant — it does not become a wider fall-through. |
| **III — No behavior change for existing roles** | ✅ PASS | `checkSeasonMatchScope` and `seasonMatchScopeFor` are read-only dependencies, not edited. The coach/observer branches of `checkSeasonMatchAttendee` are untouched lines. `isolation.test.js` runs unmodified. `MyMatchesComponent`'s `canEnterResult`/`isAttending`/`canToggleAttend` methods are not edited — only new `@if` wrappers are added around age-group/league-toggle markup, gated on `auth.isProScout()`, which is `false` for every existing role. |
| **IV — Single central scope layer** | ✅ PASS | Attend routes reuse `checkSeasonMatchScope` verbatim rather than writing a second "is this match in scope" check ([research.md R4](./research.md)). The corrected attendee-check reuses `seasonMatchScopeFor`, the same function `GET /:id` already depends on. No manual filter condition is written anywhere in this stage. |
| **V — Independently deployable** | ✅ PASS | Merged alone: proScout gains working attendance, result entry, and a matches page; nothing else changes. `dump-spec` + `gen:types` land in the same change (§0 of quickstart). Rollback is a plain revert — no migration to undo. |
| **VI — Positive and negative test per permission** | ✅ PASS | Positive: exact grant conditions (G-1, G-6, G-9) assert state change, not just 200. Negative: out-of-scope (G-2/G-7/G-12), wrong-day (G-3/G-8/G-10), not-an-attendee (G-11) each get their own case. Endpoint inventory delta discharges the per-stage inventory obligation ([contracts/endpoint-inventory-delta.md](./contracts/endpoint-inventory-delta.md)). |
| **VII — Single source of truth for role names** | ✅ PASS | Backend uses `ROLES.PRO_SCOUT`, no new string literal. Frontend template guards use `auth.isProScout()` (added in Stage 4). `role-landing-destinations.spec.ts` is introduced specifically so redirect destinations stop being copy-pasted string literals across test files — the opposite of a new parallel definition; see [research.md R8](./research.md) and [contracts/frontend-navigation.md](./contracts/frontend-navigation.md). |

**Constraint handling**:

- **C-4** — honoured: `league: "professional"` remains the only scope definition consumed, via
  `seasonMatchScopeFor`. `SeasonMatch.ageGroup` stays `required: true`, populated, and present in
  every response this stage touches — only its UI rendering is suppressed ([data-model.md I-4](./data-model.md)).
- **C-3** — remains open, untouched. This stage adds no age-group query anywhere.
- **C-1** — already closed (Stage 0); consumed via `RoleLandingService`/`/unauthorized`, not
  reintroduced.
- **C-2** — engaged and corrected: `checkSeasonMatchAttendee`'s proScout branch is exactly the kind of
  "fall-through that looks like a deny but isn't actually checking the right thing" C-2 warns about —
  except here it's caught before merge rather than after, because the Stage-2 comment documented the
  gap in advance.

**Complexity Tracking**: no violations — the section is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/008-proscout-matches-attendance/
├── plan.md                                    # This file
├── spec.md
├── research.md                                # Phase 0 — R1…R9
├── data-model.md                              # Phase 1 — invariants I-1…I-5
├── quickstart.md                              # Phase 1 — validation guide §0…§6
├── contracts/
│   ├── season-match-attend-status.md          # Phase 1 — G-1…G-13
│   ├── frontend-navigation.md                 # Phase 1 — nav + landing-matrix contract
│   └── endpoint-inventory-delta.md            # Phase 1 — Principle VI obligation
├── checklists/
│   └── requirements.md
└── tasks.md                                   # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
Backend/
├── routes/
│   └── seasonMatchRouter.js                   # EDIT — PRO_SCOUT into 3 allowedTo lists;
│                                               #        checkSeasonMatchScope added to both
│                                               #        /:id/attend routes; @swagger blocks updated
├── middlewares/
│   └── ownership.js                           # EDIT — checkSeasonMatchAttendee's PRO_SCOUT branch:
│                                               #        add attendee-membership check, actually
│                                               #        branch on inScope instead of denying always.
│                                               #        checkSeasonMatchScope itself NOT touched.
├── controllers/
│   └── seasonMatchController.js               # READ ONLY — attendMatch, unattendMatch,
│                                               #        updateMatchStatus, seasonMatchBaseFilterFor
│                                               #        all consumed unchanged (research.md R3, R5)
├── services/
│   └── scope.js                               # READ ONLY — seasonMatchScopeFor consumed, not edited
└── tests/
    ├── roles/proScoutMatchAttendance.test.js  # NEW  — HTTP-level G-1…G-13
    ├── roles/proScoutDataScope.test.js        # EDIT — T042 block only (lines 753-817):
                                                #        rename + flip 2 assertions, add the
                                                #        missing not-an-attendee case
                                                #        (research.md R9). Everything else in
                                                #        this file (read-scope tests) UNMODIFIED.
    └── isolation.test.js                      # UNMODIFIED (must stay so)

frontend/src/app/
├── core/
│   └── auth/
│       ├── role.guard.spec.ts                 # EDIT — refusal assertions computed from
│       │                                      #        RoleLandingService instead of hardcoded
│       └── role-landing-destinations.spec.ts  # NEW  — consolidated matrix (Stage 6 item 7)
├── features/season-matches/
│   └── my-matches/
│       ├── my-matches.component.ts            # EDIT — age-group + league-toggle @if wrappers,
│       │                                      #        role-conditional selectedLeague default
│       └── my-matches.component.spec.ts       # NEW  — no baseline existed (research.md R7)
├── layout/sidebar/
│   ├── sidebar.component.ts                   # EDIT — 'proScout' into My Matches entry's roles
│   └── sidebar.component.spec.ts              # EDIT — proScout menu: 3 items → 4 (DF-002 closed)
├── app.routes.ts                              # EDIT — 'proScout' into /my-matches roleGuard
└── assets/i18n/{en,ar}.json                   # READ ONLY — existing SEASON_MATCHES.* keys reused

openapi.json                                   # REGENERATED — dump-spec
specs/004-role-based-navigation/spec.md        # EDIT — DF-002 marked discharged
```

**Structure Decision**: The existing two-project web layout is used unchanged. No new controller,
service, or component file beyond the two test files and the one consolidated spec — everything else
is an edit to code already carrying the shape this stage needs, per
[research.md R1, R3, R6](./research.md).

## Design decisions carried into implementation

These are the points where the obvious implementation is the wrong one, or where the original plan
text (`docs/scout-pro-plan-v2.md`) was corrected. Each has a test that fails if it regresses.

1. **Result entry is granted, not withheld** — the plan's original "recommend deny" for
   `PATCH /status` is superseded. proScout gets it under the exact coach/observer constraint (attendee
   + same match day). Documented in `spec.md` Assumptions and `docs/scout-pro-plan-v2.md` Stage 6 §5.
2. **Fix the existing branch, don't add a parallel one.** `checkSeasonMatchAttendee`'s proScout branch
   already exists and already computes `inScope` — the fix adds the missing attendee check and wires
   the existing `inScope` result into the decision, rather than writing new gating logic
   ([research.md R2](./research.md)). A pre-existing test block
   (`proScoutDataScope.test.js` `T042`) was written in Stage 2 explicitly to be edited here — its own
   comment names Stage 6 as the trigger. Editing its two stale assertions is the intended flip, not a
   Principle III regression ([research.md R9](./research.md)).
3. **Reuse `checkSeasonMatchScope` on attend, don't write a new guard** ([research.md R4](./research.md)).
4. **No same-day/pre-match-day code changes** — both windows (`isBeforeMatchDay`,
   the `updateMatchStatus` day check) are already role-generic ([research.md R3, R5](./research.md)).
5. **Reuse `MyMatchesComponent`, don't fork a proScout-specific page** — its core interaction logic is
   already role-agnostic; only two markup regions need role-conditional wrapping
   ([research.md R6](./research.md)).
6. **Default proScout to the `professional` tab and hide the toggle**, rather than leaving `premier`
   as the default and letting the scope layer silently return zero rows on first load
   ([research.md R6](./research.md)).
7. **One consolidated landing/rejection spec, sourced from `RoleLandingService`** — `role.guard.spec.ts`
   stops hardcoding destination strings and instead asserts against the service live, closing the
   drift pattern that has already bitten Stage 4 and Stage 5 ([research.md R8](./research.md)).

## Phase status

- [x] **Phase 0 — Research**: [research.md](./research.md), R1–R9. No `NEEDS CLARIFICATION` remained
      from the spec; the plan's one open question (result-entry authority) was resolved by the user's
      correction before this planning pass began.
- [x] **Phase 1 — Design & Contracts**: [data-model.md](./data-model.md),
      [contracts/](./contracts/), [quickstart.md](./quickstart.md).
- [x] **Constitution re-check after Phase 1**: re-evaluated above — still 7/7 PASS. The Phase 1 design
      added no endpoint beyond the three inventoried, no schema change, and reuses two existing
      middleware functions rather than introducing new ones, so no gate moved.
- [ ] **Phase 2 — Tasks**: `/speckit-tasks` (not produced by this command).
