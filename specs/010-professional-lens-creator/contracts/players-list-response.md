# Contract: `GET /api/v1/players` response shape change

This documents the one contract surface this feature touches. No new endpoint, no new request
parameter — an additive, role-gated field on an existing response.

## Request

Unchanged. No new query parameter is introduced (FR-008). Existing parameters, including
`?isProfessional=true` (Stage 4c) that activates the Professional League lens, are unaffected.

## Response — `admin` caller

**Before this feature** (per document in `data.documents[]`):

```jsonc
{
  "_id": "...",
  "name": "...",
  // ...other existing fields...
  "coach": { "_id": "...", "name": "...", "email": "..." },   // or absent for orphaned players
  "team": { "_id": "...", "name": "...", "clubName": "..." },
  "isProfessional": true,
  "createdBy": "64f..."   // raw ObjectId string — set since Stage 2, never populated until this feature
}
```

**After this feature**:

```jsonc
{
  "_id": "...",
  "name": "...",
  // ...other existing fields, unchanged...
  "coach": { "_id": "...", "name": "...", "email": "..." },
  "team": { "_id": "...", "name": "...", "clubName": "..." },
  "isProfessional": true,
  "createdBy": { "_id": "...", "name": "..." }   // NEW — admin only; null/absent if no creator or creator deactivated
}
```

Every other field, and the envelope (`status`, `count`, `pagination`, `data.documents`), is
unchanged. This is an additive field only.

## Response — `coach`, `observer`, `proScout` caller

**No change whatsoever.** `createdBy`, when set on a player, appears exactly as it always has: a bare
`ObjectId` string — never a populated `{ _id, name }` object. **Corrected during implementation**:
neither `getAll` nor `getSpecific` has ever used `.select()` to exclude this field, so the raw string
was already present in every response for every role since Stage 2; this feature does not remove it,
only adds the resolved-name form for `admin`. The response must be byte-identical to before this
feature (FR-004, SC-003) — verified by asserting the raw string is unchanged, not by asserting the
key is absent. This is the primary regression contract this feature must not violate.

## Response — `GET /api/v1/players/:id`, any role including admin

**No change whatsoever.** This endpoint is untouched by this feature (FR-005). Existing tests for
`getSpecific` continue to assert the exact same fields as before.

## Verification

- Positive: `Backend/tests/roles/adminProfessionalLens.test.js` — admin request against players with
  distinct, known `createdBy` values returns the correct name per player, and `null`/absent for a
  player with none.
- Negative: a parallel test asserting a `coach`/`observer`/`proScout` response to the identical query
  (same players, same filters) contains no `createdBy` key at all — not `null`, absent entirely —
  and matches the pre-feature response fixture byte-for-byte.
- Boundary: a `GET /players/:id` request for the same player, by admin, asserted to omit `createdBy`
  exactly as before this feature.
- `Backend/tests/isolation.test.js` passes unmodified (Principle III).
