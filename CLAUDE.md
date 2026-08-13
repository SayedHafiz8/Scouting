# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Talent Radar — a football (soccer) youth-scouting platform. Coaches register players and file scouting reports, observers are assigned to specific players and record video/evaluations, and admins oversee everything (player selection status, monthly coach/observer evaluations, season matches, media review).

Three top-level projects, each with its own `package.json` and `node_modules`:

| Dir | Stack |
|---|---|
| `Backend/` | Express 5 + Mongoose 9, ESM (`"type": "module"`), Socket.IO, vitest |
| `frontend/` | Angular 21, standalone components + signals, Tailwind, Karma/Jasmine |
| `e2e/` | Playwright against a live backend + built frontend |

Node version is pinned in `.nvmrc` (22).

## Commands

```bash
# Backend (cwd: Backend/)
npm start                        # nodemon server.js — needs config.env (see config.env.example)
npm test                         # vitest run — spins up mongodb-memory-server, no live DB needed
npm run test:watch
npm test -- tests/players.test.js            # single file
npm test -- -t "coach cannot see"            # single test by name
npm run dump-spec                # regenerate ../openapi.json from the swagger JSDoc

# Frontend (cwd: frontend/)
npm start                        # ng serve on :4200, talks to :8000 (environment.development.ts)
npm run build
npx ng test --watch=false --browsers=ChromeHeadless   # what CI runs
npm run gen:types                # openapi.json -> src/app/core/models/api.generated.ts

# E2E (cwd: e2e/) — requires backend on :3000/:8000 and frontend on :4200 already running
npm test
npx playwright test tests/players.spec.ts
npm run test:headed / test:debug / test:report
```

CI (`.github/workflows/ci.yml`) runs backend vitest and frontend build+karma in parallel, then Playwright with a real mongo service container. All three are blocking. The E2E job seeds via `e2e/seed.js` (creates the test coach through the admin API) and `Backend/seeds/seedAgeGroups.js` — a fresh DB **must** have age groups or player creation throws.

`Backend/config.env` is git-ignored. In CI every var comes from the workflow `env:` block instead; `dotenv.config()` failing to find the file is expected there.

## Backend architecture

### Roles and data isolation

Three roles: `admin`, `coach`, `observer`. Isolation is enforced in three independent layers, and tests in `Backend/tests/isolation.test.js` encode the contract — **do not weaken it without a security review**.

1. **`ApiFeature.filter()`** (`utils/apiFeatures.js`) — the list-endpoint scope. Its precedence is deliberate: client query < route param < ownership scope, ownership applied **last** so no client input can widen it. `ownerFields` (e.g. `{ coach: "coach", observer: "observers" }`) is the declaration that a collection is owned; its *absence* means shared reference data (Team, AgeGroup). A role missing from the map, or a request with no `req.user`, resolves to a match-nothing filter. Non-whitelisted query keys (`allowed: [...]`) are dropped, not merged.
2. **`middlewares/ownership.js`** — per-document guards for `/:id` routes (`checkPlayerOwnership`, `checkReportOwnership`, `checkMediaOwnership`, `checkSeasonMatchAttendee`). Admin short-circuits; observers must appear in the player's `observers` array; coaches must own the record.
3. **`protect` / `allowedTo(...roles)`** in `controllers/authController.js` — auth + coarse role gate on every route.

Route files compose all three, e.g. `protect, allowedTo("coach"), checkPlayerOwnership, updateValidate, update`.

### Generic CRUD factory

`services/services.js` exports `creating`, `gettingAll`, `gettingSpecific`, `updating`, `softDelete`, `restoring`, `deleteOne`. Controllers usually wrap these rather than reimplement. Response envelope is uniform: `{ status, data: { document } }` for one, `{ status, count, pagination, data: { documents } }` for lists — the Angular models (`core/models/api-response.model.ts`) mirror this exactly.

`gettingAll`'s optional `baseFilterFn(req)` handles ownership scopes too complex for a single `ownerFields` path (e.g. observers seeing matches of teams of their assigned players). It must return a plain object, never a Mongoose Query.

### Soft delete

`User` has a `pre(/^find/)` hook applying `{ active: { $ne: false } }`. Bypass it explicitly with `.setOptions({ bypassFilter: true })` — used by `restoring`, `seedAdmin`, and the deactivated-users admin views. `toJSON` transforms strip secrets (password, reset codes, refresh token, ID-card paths, vault counters) — add new sensitive fields to that transform, not just to route projections.

### Player age groups

`models/playedModel.js` derives `ageGroup` from `dateOfBirth` in both `pre('save')` and `pre('findOneAndUpdate')`, throwing if the birth year is outside 2007–2019 or no matching `AgeGroup` doc exists. Tests use `seedAgeGroups()` from `tests/helpers/factory.js` for this reason.

### Media pipeline (Bunny CDN)

Video and images never transit the VPS at scale:

- **Video**: backend creates a Bunny Stream video and returns a short-lived presigned **TUS envelope** (`utils/mediaUrl.js` `tusUploadEnvelope`); the browser uploads directly to Bunny. The Stream management API key never reaches the client. Completion arrives via a webhook mounted at an unguessable secret path (`POST /webhooks/bunny/:secret`, outside `/api` so it skips the user limiter), and `socket/handlers/videoReconcile.js` is the fallback — and the *only* resolution path on localhost, where the webhook can't reach you.
- **Playback/images** are signed URLs with two *different* token schemes (documented at the top of `utils/mediaUrl.js`): hex `sha256(key+videoId+expires)` only for the iframe embed, urlsafe-base64 `sha256(key+path+expires)` for every direct CDN file and storage object. Image URLs use a **quantised expiry** so the same asset yields a byte-identical URL within a 30-minute bucket (CDN cache hits).
- **`resolveImageUrl`** is called from model `toJSON` transforms: falsy → `null`, `http(s)://` → passthrough (legacy Cloudinary), else → signed Bunny path.
- **Two storage zones**: `media` (avatars, scouting images — CDN + token auth) and `vault` (national ID cards — **no pull zone, no CDN**). Vault reads additionally require an `X-Vault-Token` header, obtained by an admin re-entering their password (`POST /auth/vaultPassword/verify`, 15-min token, lockout counters on the user doc) — see `middlewares/vaultAccess.js`.
- **`services/mediaMatchGate.js`** decides whether an upload auto-links to a season match: `gated` (a match within a UTC ±1-day window that the uploader actually attended and entered a result for) vs `freeform` (anything else — always allowed, but title/description required). Note the window is computed in UTC because `matchDate` is stored as UTC midnight from `<input type="date">`.

### Background jobs and realtime

`server.js` boots Socket.IO plus four `node-cron` jobs from `socket/handlers/`: `dailySummary`, `cleanupDeactivated`, `videoReconcile`, `mediaRetention`. Sockets authenticate with the same JWT access token (`socket/index.js`) and `connectedUsers` maps userId → set of socket ids for multi-tab delivery. Dashboards push live updates via `emitAdminDashboardUpdate` / `emitCoachDashboardUpdate` / `emitObserverDashboardUpdate` fired after mutating controllers (fire-and-forget — responses don't await them).

### API docs → frontend types

Routes carry `@swagger` JSDoc blocks above the imports. `npm run dump-spec` writes the merged spec to the repo-root `openapi.json`, which `frontend`'s `npm run gen:types` turns into `api.generated.ts`. If you change a route's shape, regenerate both. `/api-docs` (Swagger UI) is mounted only when `NODE_ENV !== production`.

### Auth flow

Short-lived access token in memory + `refreshToken` httpOnly cookie (hence `cors({ credentials: true })` and `withCredentials` on the client). `protect` rejects tokens issued before `passwordChangedAt`. **Signup is disabled** — the route is deliberately not mounted in `authRouter.js`; coaches and observers are created by admins via `POST /api/v1/users`, and the first admin comes from `seedAdmin()` in `server.js` using `ADMIN_*` env vars.

Rate limiting in `app.js` is layered (general → auth → refresh → forgotPassword) and keyed by **user id when a valid bearer token is present**, falling back to normalized IP. `NODE_ENV=test` raises every limit to 10000 so test suites and E2E logins don't trip it.

## Frontend architecture

Standalone components throughout, no NgModules. `app.config.ts` wires the router (all feature routes lazy via `loadChildren`), both interceptors, ngx-translate, and two `APP_INITIALIZER`s — one restoring the session from the refresh cookie before the first navigation, one resolving the language.

- **`core/`** — `auth/` (service + `authGuard` + `roleGuard(['admin'])`), `interceptors/`, `models/` (hand-written models alongside the generated `api.generated.ts`), `services/` (socket, theme, toast, language, query-builder, breadcrumb/player context).
- **`features/<domain>/`** — components plus a `services/<domain>.service.ts` that owns that domain's HTTP calls. New API surface goes in the feature's own service, not a shared god-service.
- **`layout/`** shell/header/sidebar/notification-panel; **`shared/components/`** presentational pieces (radar-chart, rating-bar, media-uploader, dialogs, skeletons).

`AuthService` holds state in signals (`currentUser`, `accessToken`, derived `isAdmin`/`isCoach`/`isObserver`) and exposes `whenReady`, which guards await before deciding. The access token lives only in memory; `sessionStorage` keeps a `tr_user` hint so the interceptor knows whether a 401 is worth a refresh attempt. `auth.interceptor.ts` serialises concurrent 401s through a single refresh via a `BehaviorSubject` queue and skips the auth endpoints themselves.

Three environments: `environment.ts` (production, relative `/api/v1` behind nginx), `environment.development.ts` (`:8000`), `environment.ci.ts` (`:3000`, used only by `ng build --configuration=ci` because CI serves the bundle statically with no proxy).

i18n is English + Arabic (`src/assets/i18n/*.json`) — the UI is bilingual, so new user-facing strings need keys in both files.

## Conventions

- Much of the Backend's explanatory commentary is in Arabic, often marking security decisions (`B1`, `C3`, `F4`… refer to items from a security review). Preserve these when editing nearby code; they document *why* a constraint exists.
- Validation lives in `Backend/utils/validation/*.js` as express-validator chains, applied as route middleware before the controller.
- Errors: throw/`next(new AppError(msg, statusCode))`; `express-async-handler` wraps async controllers; `middlewares/errorMiddleware.js` is the single formatter.
- Backend tests run **sequentially** (`fileParallelism: false`) against one in-memory Mongo, with all collections cleared in `beforeEach`. External I/O (email, sockets, notifications) is mocked globally in `tests/setup.js`; Bunny network calls are mocked per test file so `bunnyConfig` stays real. Build fixtures with `tests/helpers/factory.js` rather than inline `create` calls.
- Express 5 route ordering matters: literal segments like `/counts` and `/reports/average-ratings` are declared **before** `/:id` so they aren't captured as ids.
