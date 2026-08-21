# Quickstart: Verifying Role-Based Sidebar Navigation

**Feature**: `specs/004-role-based-navigation/` | **Date**: 2026-08-21

How to confirm this feature does what it claims. Expected values come from [contracts/navigation-matrix.md](./contracts/navigation-matrix.md) — that table is authoritative; this guide only says how to exercise it.

## Prerequisites

- Node 22 (`.nvmrc`)
- `frontend/` and `Backend/` dependencies installed (`npm install` in each)
- Nothing else. The frontend checks are unit-level and need no running server; the backend check spins up an in-memory Mongo by itself.

---

## 1. The regression gate (run this first, and again at the end)

The claim that carries the most risk is "existing roles see an identical menu" (Principle III, SC-001).

```bash
cd frontend
npx ng test --watch=false --browsers=ChromeHeadless
```

**Expected**: the whole suite green, including `sidebar.component.spec.ts`.

**The ordering that makes this meaningful**: `sidebar.component.spec.ts` is written **before** the component is refactored and must pass against the unmodified component. If you are reviewing after the fact, verify this from the commit history — a spec written alongside the code it checks proves only self-consistency. See `research.md` R5.

To run only the sidebar checks while iterating:

```bash
npx ng test --watch=false --browsers=ChromeHeadless --include='**/sidebar.component.spec.ts'
```

---

## 2. Per-role menu contents

Covered by `sidebar.component.spec.ts`. Each case renders the sidebar with an `AuthService` stub for one role and asserts the ordered `href` list of the menu's anchors.

Expected counts: admin **6**, coach **4**, observer **4**, proScout **2**, unknown role **0**, no user **0**. Full sequences in section 2 of the navigation matrix.

The two cases worth reading closely:

- **unknown role → 0 entries** is the deny-by-default proof (SC-007). It is the assertion that fails if someone reintroduces an ungated entry.
- **admin has no My Matches** is not an oversight — see the matrix, row 6.

---

## 3. Route refusal for proScout

Covered by the added cases in `core/auth/role.guard.spec.ts`. Each asserts that `roleGuard(['admin'])` with a proScout user returns a `UrlTree` whose string form is `/unauthorized`, for each of the three administration areas.

---

## 4. Server-side decisions

```bash
cd Backend
npm test -- tests/roles/proScoutRoleDefinition.test.js
```

**Expected**: green.

Two distinct outcomes are recorded there, and they are **not** the same:

- `GET /users` → **403** for proScout. This backs both the `/users` and the `/observers` areas — the observers page calls the same endpoint.
- `GET /ages` → **200**, both with a proScout token and with no token at all.

The second one is deliberate and is not a bug in this feature. `ageGroupRouter.js` mounts those reads with no `protect`, so there is no user for `allowedTo` to reject — Constitution **C-3** / **TODO(AGES_UNAUTHENTICATED_READ)**, tech debt held outside this plan by owner decision. The test exists so the missing menu entry is never mistaken for a locked door, and so that adding `protect` later fails this assertion loudly instead of passing unnoticed.

---

## 5. Build gate

```bash
cd frontend
npm run build
```

**Expected**: success. This also catches the type-level guarantee from `data-model.md` — a role name in `NAV_ITEMS` that is not part of the generated `UserRole` union is a compile error, not a silently-never-matching string.

---

## 6. Manual smoke check (optional)

If you want to see it rather than read assertions:

```bash
# terminal 1
cd Backend && npm start        # needs config.env
# terminal 2
cd frontend && npm start       # :4200
```

Sign in as each role and compare the sidebar against the matrix. For proScout, also paste `/users`, `/observers`, and `/age-groups` into the address bar — each should land on `/unauthorized`.

**Read this before drawing conclusions**: landing on `/unauthorized` demonstrates the *frontend* refuses. It says nothing about the server, which is why section 4 exists as a separate check. Constitution Principle I — a hidden link is not a permission.

---

## What "done" looks like

| Check | Where |
|---|---|
| Existing roles' menus unchanged | §1, §2 — baseline spec passing before *and* after the refactor |
| Deny-by-default holds for unknown roles | §2 — unknown role and no-user cases |
| proScout sees exactly Players + Profile | §2 |
| proScout is refused at the three admin areas in the browser | §3 |
| The server's actual decision per area is on record | §4 |
| No type or build regression | §5 |
| Nothing outside the change budget was touched | `contracts/navigation-matrix.md` §5 |
