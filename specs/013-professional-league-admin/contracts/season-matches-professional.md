# Contract: SeasonMatch endpoints — professional-league behavior change

**Change type**: relaxed requirement, mirroring the `Team` contract, plus a crash fix. No new
endpoint; `premier`-league behavior unchanged.

## `POST /seasonMatches`

### Request (professional-league fixture, new behavior)

```json
{
  "league": "professional",
  "season": "2025/2026",
  "matchDate": "2026-09-10",
  "homeTeam": "<professional Team id, ageGroup: null>",
  "awayTeam": "<professional Team id, ageGroup: null>",
  "venue": "Cairo Stadium"
}
```

No `ageGroup` field. Both prerequisites this depends on:

- Before this feature: rejected with `422` ("Team must belong to an ageGroup"-equivalent /
  missing required field), same class of error as the `Team` contract.
- Immediately after `Team.ageGroup` was cleared for professional teams, but before this contract's
  fix: this request would have crashed the server with a `500` (`TypeError` inside
  `teamBelongsToMatchAgeGroup`, calling `.toString()` on the now-`undefined` team `ageGroup`) —
  **this is the bug this contract closes**, not a pre-existing `422`.
- After this feature ships: succeeds with `201`.

### Request (premier-league fixture — unchanged)

```json
{
  "league": "premier",
  "ageGroup": "<AgeGroup id>",
  "season": "2025/2026",
  "matchDate": "2026-09-10",
  "homeTeam": "<premier Team id, same ageGroup>",
  "awayTeam": "<premier Team id, same ageGroup>",
  "venue": "..."
}
```

Behavior identical to today, including the existing "home/away team must belong to the match's age
group" check (still enforced for premier fixtures).

### Response — `201 Created`

```json
{
  "status": "success",
  "data": {
    "document": {
      "_id": "...",
      "league": "professional",
      "ageGroup": null,
      "season": "2025/2026",
      "matchDate": "2026-09-10T00:00:00.000Z",
      "homeTeam": "...",
      "awayTeam": "...",
      "venue": "Cairo Stadium",
      "status": "scheduled"
    }
  }
}
```

## `PATCH /seasonMatches/:id`

Same rule: editing a professional-league fixture (or one whose resolved league, from the existing
document, is `professional`) never requires or validates `ageGroup`; editing a premier-league
fixture is unchanged.

## Regression (must not change)

- `teamBelongsToMatchAgeGroup`'s league check (`awayTeam`/`homeTeam` must belong to the match's
  `league`) still applies to both leagues, unchanged.
- The existing home/away-team-age-group-match check still applies, unchanged, for premier
  fixtures.
- `noDuplicateFixture` (same team pair, same day, same age group + league) — for professional
  fixtures this now runs with `ageGroup: undefined` on both sides of the duplicate lookup, which
  is consistent (two professional fixtures between the same teams on the same day are still
  caught, scoped by `league` alone in that case since `ageGroup` no longer discriminates within
  professional).

## Swagger

The `SeasonMatch` response schema's `ageGroup` property gains `nullable: true` (exact schema
location to be confirmed against `Backend/utils/swagger.js` at task time).
