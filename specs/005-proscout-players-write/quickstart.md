# Quickstart — validating proScout Players Page & Write Access

**Feature**: `specs/005-proscout-players-write/` | **Date**: 2026-08-21

How to prove this stage works. Contract details live in
[contracts/proscout-write-matrix.md](contracts/proscout-write-matrix.md); field semantics in
[data-model.md](data-model.md).

---

## Prerequisites

- Node 22 (`.nvmrc`)
- `Backend/config.env` present (see `config.env.example`) — only for the manual pass; the automated
  suite uses `mongodb-memory-server` and needs no live DB
- Branch `004-proscout-players-write`

---

## 1. Automated — the gate that decides the stage is done

```bash
# Backend (cwd: Backend/)
npm test                                   # full suite, sequential, in-memory mongo
npm test -- tests/isolation.test.js        # MUST pass with zero edits to that file
npm test -- tests/roles/                   # Stage 1–4 role suites
npm test -- -t "proScout"                  # every proScout assertion across files

# Frontend (cwd: frontend/)
npx ng test --watch=false --browsers=ChromeHeadless
npm run build
```

**Pass condition**: all three CI jobs green (`Backend` vitest, `frontend` build + karma, Playwright).
All are blocking per the constitution.

Baseline to beat: Stage 2 left **492 backend tests across 24 files** passing, and 84 frontend tests.
A drop in either count is a regression, not a cleanup.

---

## 2. After any route change — regenerate the spec and types

Required by Principle V, in the **same** PR:

```bash
cd Backend  && npm run dump-spec     # → ../openapi.json
cd frontend && npm run gen:types     # → src/app/core/models/api.generated.ts
```

This stage changes `allowedTo` on ~13 operations, so both are mandatory. Verify
`api.generated.ts` still lists `proScout` in the `role` union afterwards.

---

## 3. Scenario coverage map

Each row is one spec scenario and the layer that must prove it. Every permission gets a positive
**and** a negative test (Principle VI).

| Spec scenario | Positive | Negative |
|---|---|---|
| US1.1 list scope | in-scope players returned, count matches a hand-computed set | premier-league player absent |
| US1.2 no age-group UI | proScout renders flat list | age-group grid absent; `/ages` **not** requested |
| US1.3 other roles unchanged | coach/observer see the grid | — |
| US1.4 search/sort/paginate | results stay in scope across pages | `?ageGroup=<premier group>` does not widen |
| US1.5 counts + avg ratings | numbers equal hand-computed | out-of-scope players excluded from both |
| US2.2 masking | `observed` → `pending`; `observers` absent | `?status=observed` dropped, not executed |
| US2.3 direct ID | in-scope `GET /players/:id` → 200 | out-of-scope → **403** (not 200-empty) |
| US3.1 create + `createdBy` | 201, `createdBy` = caller, **`coach` unset** (I-1) | client-supplied `createdBy` → 400 |
| US3.2 premier team on create | — | **400**, message identical to unknown id (R4) |
| US3.3 / US3.4 edit | in-scope PATCH → 200 | out-of-scope PATCH → 403 |
| US3.5 reassign to premier | — | **400** |
| US3.6 observers | — | `PATCH /players/:id/observers` → **403** |
| US4.1–4.3 reports | POST + PATCH on in-scope → 2xx | out-of-scope → 403; **`DELETE` → 403** (R2) |
| US4.4–4.5 media | upload + `GET /media` on in-scope → 2xx | out-of-scope → 403; **`/download` → 403** (R3) |
| US4.6–4.7 profile image | in-scope PATCH → 200 | out-of-scope → 403 |
| Edge: other user's team-less player | — | absent from list, 403 on direct ID |
| Edge: `teamName` free-text (I-3) | — | another user's `teamName` player not reachable |
| Edge: player leaves professional league | — | previously-authored report no longer PATCHable |
| FR-014 regression | coach/observer/admin counts + content byte-identical | `isolation.test.js` unedited |

Build fixtures with `Backend/tests/helpers/factory.js` — not inline `create` calls — and keep
external I/O mocked as `tests/setup.js` does.

---

## 4. Manual walkthrough (the reason R13 is in scope)

```bash
cd Backend  && npm start     # :8000
cd frontend && npm start     # :4200
```

1. Sign in as admin → **Users** → create a user with role **proScout**.
   *Before this stage that option does not exist in the dropdown* — if it is missing, R13 is not done.
2. Ensure at least one `Team` has `league: "professional"` and one has another league, each with a
   player. A fresh DB needs `Backend/seeds/seedAgeGroups.js` first or player creation throws.
3. Sign out, sign in as the proScout.
   - Sidebar shows exactly **Players** and **Profile** (Stage 3 baseline — Dashboard and My Matches
     arrive in Stages 5 and 6).
   - Players opens a **flat list**, no age-group cards. Network tab shows **no `/ages` request**.
   - Only professional-league players and the user's own team-less players appear.
4. **Add player** → the Team dropdown offers professional teams only; no hint text names an age group.
   Save → the player appears in the list.
5. Open that player → **Reports** tab loads (not a 403 page) → file a report → it appears.
   Upload media → it appears. Change the profile image → it updates.
6. Paste a premier-league player's id into the URL → **403**, not an empty page.
7. Paste `/age-groups` into the URL → redirected to `/unauthorized`.

---

## 5. Rollback

No migration, no schema change, no seeder (data-model.md). Reverting the branch is a complete
rollback — proScout returns to the Stage 3 read-only posture. Players created by a proScout during
the trial keep `createdBy` set and `coach` unset; after a revert they are reachable by admin through
the existing **No coach** (`?coach=none`) lens, and assignable via `PATCH /players/:id/coach`.
