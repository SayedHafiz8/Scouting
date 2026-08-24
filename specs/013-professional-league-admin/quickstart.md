# Quickstart: Professional League Admin Page

## Prerequisites

- Backend running with an admin account seeded (`seedAdmin()`), at least one `AgeGroup` seeded
  (`seedAgeGroups()` — still required generally, even though this feature's own flows avoid
  needing one).
- Frontend dev server pointed at that backend.
- The `Team.ageGroup`/`SeasonMatch.ageGroup` migration script has been run (or the database is
  fresh, so there is nothing to migrate).

## 1. Backend contract checks (automated)

```bash
cd Backend
npm test -- tests/roles/teamProfessionalAgeGroup.test.js       # new — R5
npm test -- tests/roles/seasonMatchProfessionalAgeGroup.test.js # new — R6, the crash-fix contract
npm test -- tests/dashboardCache.test.js                        # totalProScouts, regression on the rest
```

Expected, per `contracts/teams-professional.md` and `contracts/season-matches-professional.md`:
- Creating a `league: "professional"` team without `ageGroup` → `201`, saved document has no
  `ageGroup`.
- Creating a `league: "premier"` team without `ageGroup` → still `422`, unchanged message.
- Creating a `league: "professional"` fixture between two such teams, without `ageGroup` → `201`
  (not a `500` — this is the specific regression test for the crash found in R6).
- Creating a `league: "premier"` fixture still requires and validates `ageGroup` exactly as today.
- `GET /dashboard/admin` response includes `totalProScouts` matching an independently-counted
  `User.countDocuments({ role: 'proScout' })`.

## 2. Migration script dry run (manual, once)

```bash
cd Backend
node scripts/unsetProfessionalTeamAgeGroup.js            # dry run — reports count only
node scripts/unsetProfessionalTeamAgeGroup.js --apply     # writes
```

Expected: reports how many professional-league `Team` documents had `ageGroup` cleared; `0` on a
fresh database.

## 3. Regression suite (mandatory, Constitution Principle III)

```bash
cd Backend
npm test    # full suite — tests/isolation.test.js must still pass unmodified
```

Expected: zero failures, zero changed assertions in files this feature does not own — in
particular every existing `age-group-detail`-adjacent backend test for premier-league team/match
creation.

## 4. Contract regen (mandatory, Constitution Principle V)

```bash
cd Backend && npm run dump-spec
cd ../frontend && npm run gen:types
git diff --stat openapi.json frontend/src/app/core/models/api.generated.ts
```

Expected diff: additive/nullable-only — `Team.ageGroup` and the `SeasonMatch` schema's `ageGroup`
gain `nullable: true`, `AdminDashboard` gains `totalProScouts`, nothing else changes shape.

## 5. Manual browser check (visual — not covered by automated tests)

1. Log in as admin. Confirm a new "Professional League" item appears in the sidebar between
   "Observers" and "Age Groups" — and confirm it does **not** appear when logged in as coach,
   observer, or proScout.
2. Try navigating directly to the new page's URL as a non-admin — confirm it's denied/redirected,
   the same way `/age-groups` already is for non-admins.
3. On the new page: add a proScout (confirm no age-group field appears anywhere in that flow),
   confirm it appears in the proScout list, open its detail view, confirm the title/breadcrumb
   read correctly for a proScout (not "Coaches").
4. Add two professional-league teams (confirm no age-group picker). Schedule a fixture between
   them (confirm no age-group picker there either), edit it, record a result.
5. Go to any existing age-group's page and confirm premier-league team/match creation still asks
   for (and requires) an age group exactly as before.
6. View the admin dashboard — confirm the Coaches/Observers card now shows a third proScout
   figure, same pink color as the other two, and that the number matches the proScout list from
   step 3.
7. Run the `ui-ux-pro-max` design review pass over the new page and the updated dashboard card
   before considering the feature visually complete (FR-011) — not a substitute for steps 1-6.

## 6. Frontend unit checks (automated)

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts'
npx ng test --watch=false --browsers=ChromeHeadless --include='**/user-form.component.spec.ts'
npx ng test --watch=false --browsers=ChromeHeadless --include='**/professional-league*.spec.ts'
```

Expected: `sidebar.component.spec.ts`'s admin menu assertion updated and passing (R1);
`user-form.component.spec.ts` covering the new `proScout` query-param preselect and redirect
(R2); new spec file(s) for the page itself passing.
