# Quickstart: Validate ProScout Role Definition

Prerequisites: `Backend/config.env` set up locally (or rely on `NODE_ENV=test` defaults), Node 22 (`.nvmrc`), dependencies installed in `Backend/` and `frontend/`.

## 1. Backend regression + new tests

```bash
cd Backend
npm test                                   # full suite must still pass unmodified
npm test -- tests/roles/proScoutRoleDefinition.test.js   # new stage-1 tests
npm test -- tests/isolation.test.js        # explicit re-run — the binding isolation contract
```

Expected: all green, zero modified assertions in `tests/isolation.test.js`.

## 2. Manual API smoke test (optional, mirrors the automated contract in `contracts/role-contract.md`)

```bash
# as an admin, create a proScout user (adjust payload/auth to match existing admin user-creation flow)
curl -X POST http://localhost:8000/api/v1/users \
  -H "Authorization: Bearer <admin-token>" -H "Content-Type: application/json" \
  -d '{"name":"Scout Test","email":"proscout.test@example.com","password":"Passw0rd!","passwordConfirm":"Passw0rd!","role":"proScout"}'

# log in as that user
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"proscout.test@example.com","password":"Passw0rd!"}'
# → expect 200 with an access token

# with that token, confirm zero data access
curl http://localhost:8000/api/v1/players -H "Authorization: Bearer <proscout-token>"
# → expect 200, data.documents: []

curl http://localhost:8000/api/v1/users -H "Authorization: Bearer <proscout-token>"
# → expect 403 (allowedTo("admin") route)
```

## 3. Contract regeneration

```bash
cd Backend && npm run dump-spec
cd ../frontend && npm run gen:types
git diff --stat ../openapi.json src/app/core/models/api.generated.ts   # confirm proScout now present in UserRole
```

## 4. Frontend smoke check

```bash
cd frontend
npm start   # ng serve on :4200
```

Log in as the `proScout` test user created above → expect immediate redirect to `/unauthorized`, no dashboard content, no sidebar items beyond whatever the (unmodified) shell renders for an unrecognized role.

## 5. Full CI gate (matches `.github/workflows/ci.yml`)

```bash
cd Backend && npm test
cd ../frontend && npm run build && npx ng test --watch=false --browsers=ChromeHeadless
```

Both must pass before this stage is considered mergeable per Constitution Principle V.
