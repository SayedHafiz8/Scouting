# Data Model: Professional League Admin Page

No new collections. This feature changes the write rules on two existing schemas
(`Team`, `SeasonMatch`) and adds one derived count to the admin dashboard read model.

## `Team` (`Backend/models/teamModel.js`)

| Field | Change |
|---|---|
| `ageGroup` (ObjectId ref AgeGroup) | `required: true` → conditionally required. `pre('save')`/`pre('findOneAndUpdate')`: if `league === 'professional'`, cleared to `undefined`; if `league === 'premier'`, still required explicitly (throws if absent) — no behavior change for premier teams. |
| `league` (enum `premier`\|`professional`) | Unchanged — becomes the sole determinant of whether `ageGroup` is required. |
| `name`, `clubName`, `active` | Unchanged. |

**Invariant** (new): every `Team` with `league: "professional"` has `ageGroup === undefined`;
every `Team` with `league: "premier"` has `ageGroup` set to a valid `AgeGroup` id. No third state.

**Migration**: pre-existing `professional`-league `Team` documents currently carry an `ageGroup`
value (assigned by accident of creation context, pre-Stage-13). A one-off script clears it
(`$unset: { ageGroup: "" }` scoped to `{ league: "professional" }`), following the dry-run/`--apply`
pattern of `Backend/scripts/backfillPlayerCreatedBy.js`.

## `SeasonMatch` (`Backend/models/seasonMatchModel.js`)

| Field | Change |
|---|---|
| `ageGroup` (ObjectId ref AgeGroup) | `required: true` → conditionally required, mirroring `Team.ageGroup` above **and** `Player.isProfessional`'s existing pattern (constitution v1.2.0). If both `homeTeam` and `awayTeam` belong to `league: "professional"` teams (equivalently, the fixture's own `league === 'professional'`), `ageGroup` is cleared to `undefined`; otherwise it stays required exactly as today. |
| `league`, `homeTeam`, `awayTeam`, `matchDate`, `venue`, `season`, `status`, `result`, `attendees` | Unchanged. |

**Invariant** (new): every `SeasonMatch` with `league: "professional"` has `ageGroup === undefined`;
every `SeasonMatch` with `league: "premier"` has `ageGroup` set to a valid `AgeGroup` id. Mirrors
the `Team` invariant above — a professional-league fixture can only reference professional-league
teams (existing `teamBelongsToMatchAgeGroup` league check, unchanged), which now have no
`ageGroup` themselves, so the fixture has none either.

**No migration needed**: no `professional`-league `SeasonMatch` documents can exist yet — this
feature is the first thing that lets an admin create one (professional teams have had nowhere to
be scheduled together until now).

## Derived read model: `AdminDashboard.totalProScouts`

Not a new entity — a count derived on read, alongside the existing `totalCoaches`/`totalObservers`
in `computeAdminDashboardData` (`Backend/controllers/dashboardController.js`):

```js
totalProScouts: await User.countDocuments({ role: ROLES.PRO_SCOUT })
```

Cached under the same `ADMIN_OVERVIEW_KEY` TTL cache as the rest of `computeAdminDashboardData`'s
output — no new cache key, no new invalidation path.

## No new entities

- **ProScout account management** operates on the existing `User` collection/role — no schema
  change.
- **Professional-league team and fixture management** operate on the existing `Team`/`SeasonMatch`
  collections — the only changes are the conditional-requirement rules above.
