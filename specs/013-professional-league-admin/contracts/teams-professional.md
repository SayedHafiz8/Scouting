# Contract: Team endpoints — professional-league behavior change

**Change type**: relaxed requirement (fewer required fields for one `league` value), not a new
endpoint. Method, path, and `premier`-league behavior are unchanged.

## `POST /teams`

### Request (professional-league team, new behavior)

```json
{
  "name": "Al Ahly Pro",
  "clubName": "Al Ahly",
  "league": "professional"
}
```

No `ageGroup` field. Previously this request was rejected with `422` ("Team must belong to an
ageGroup"). It now succeeds.

### Request (premier-league team — unchanged)

```json
{
  "name": "Al Ahly U15",
  "clubName": "Al Ahly",
  "league": "premier",
  "ageGroup": "<AgeGroup id>"
}
```

Behavior identical to today: `422` if `ageGroup` is missing or invalid.

### Response — `201 Created`

```json
{
  "status": "success",
  "data": {
    "document": {
      "_id": "...",
      "name": "al ahly pro",
      "clubName": "Al Ahly",
      "league": "professional",
      "ageGroup": null,
      "active": true
    }
  }
}
```

`ageGroup` is `null`/absent for a professional-league team, present (populated or id) for a
premier-league team.

## `GET /teams?league=professional`

Unchanged shape — returns professional-league teams, each with `ageGroup: null`.

## `DELETE /teams/:id`

Unchanged — admin-only, works identically regardless of `ageGroup` presence.

## Swagger

`Team` schema's `ageGroup` property gains `nullable: true`.
