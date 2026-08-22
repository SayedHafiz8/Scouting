# Phase 0 Research: proScout Name on the Professional League Lens

No `[NEEDS CLARIFICATION]` markers remained in `spec.md` — scope, visibility, and mask questions
were resolved by the project owner, against a direct code inspection, before the spec was written.
This document records the implementation-level decisions the plan depends on.

## R1 — Where to gate the populate

**Decision**: Gate the `populate({ path: "createdBy", select: "name" })` call inside
`playerController.getAll` on `req.user.role === ROLES.ADMIN`, applied to the same `ApiFeature`
query object that already carries the `coach` and `team` populates.

**Rationale**: `getAll` already conditionally shapes its response per role (`masksObservedAsPending`,
`isCoach`, `PLAYER_ADMIN_ONLY_LENSES` query-key stripping) — this is the established pattern for
role-conditional response shape in this controller, not a new one. Attaching the `populate` at query
build time (before `.find()` executes) means non-admin roles never issue the extra lookup, so there
is no performance cost on their path either.

**Alternatives considered**:
- *Populate unconditionally, strip the field for non-admins after the fact.* Rejected: this runs the
  extra `User` lookup for every request regardless of role, and creates a moment in the code where
  the field exists in memory for a role not supposed to see it — a strictly worse shape than never
  fetching it.
- *A separate endpoint (`GET /players/professional-with-creator`).* Rejected: violates Principle IV's
  spirit of one query path per resource, and the spec's own FR-004 requires the *existing* endpoint's
  non-admin behavior to be untouched, not routed elsewhere.

## R2 — Field naming and shape on the wire

**Decision**: Reuse the field name `createdBy` as-is (already the Mongoose field name), populated to
`{ _id, name }` — matching the exact `select` shape already used for `coach` (`select: "name email"`
minus `email`, since FR-002 excludes it) in the same controller.

**Rationale**: Consistency with the sibling `coach` populate the frontend already consumes via
`coachName(player)` (`player-list.component.ts:920-925`). No new response envelope or wrapper is
needed — `Player.createdBy` simply becomes a populated sub-document instead of a bare ObjectId
string, exactly as `Player.coach` already behaves for admins today.

**Alternatives considered**:
- *A new top-level response key (e.g. `data.creatorNames`) parallel to `documents`.* Rejected: adds
  an unnecessary second data shape for something that is a per-document attribute, and breaks the
  "documents are self-contained" assumption the frontend already relies on for `coach`/`team`.

## R3 — Frontend consumption pattern

**Decision**: Add a `creatorName(player: Player): string` helper on `PlayerListComponent`, structured
identically to the existing `coachName(player: Player): string` (handle the populated-object case,
the unpopulated-string case, and the absent case, returning `''` for the latter two).

**Rationale**: `coachName` already solves the exact same three-way shape problem (`User | string |
undefined`) for the sibling field. Reusing the pattern is the "no parallel logic" reading of keeping
the codebase consistent — there is no reason for `createdBy` to be handled differently from `coach`
on the client, since both arrive the same way (populated object for admin, otherwise absent/string).

**Alternatives considered**:
- *A pipe or directive.* Rejected: `coachName`/`isOrphaned` are already plain component methods for
  this exact class of problem; introducing a pipe for one field only would be an unjustified new
  abstraction (CLAUDE.md: "don't add abstractions beyond what the task requires").

## R4 — Type surface

**Decision**: Add `createdBy?: { name: string } | string` to the hand-written `Player` interface
(`frontend/src/app/core/models/player.model.ts`), following the same hand-annotated pattern already
used for `coach?: User | string` on the line directly above it, rather than trying to derive it from
`api.generated.ts`.

**Rationale**: `api.generated.ts` is derived from `openapi.json`'s `Player` schema, which describes
the *stored* shape (`createdBy: ObjectId`), not the *populated* response shape — the same is already
true of `coach`, which is typed as `User` in the schema comment but documented in `player.model.ts`
as `User | string` by hand, because the OpenAPI schema has no way to express "sometimes populated."
This feature follows that existing, already-accepted precedent rather than inventing a new one.

**Alternatives considered**: none seriously considered — this is the only pattern the codebase
already uses for a populated reference field on `Player`.

## R5 — Regenerating `openapi.json` / `api.generated.ts`

**Decision**: Run `npm run dump-spec` (Backend) once the `@swagger` JSDoc above `GET /players`
documents the new admin-only `createdBy` field in its response schema, then `npm run gen:types`
(frontend), per Principle V ("changing a route's shape MUST be accompanied by both in the same PR").

**Rationale**: mirrors exactly what Stage 4c did for its own smaller response change (adding
`isProfessional` to `PLAYER_FILTERS` did not change the `Player` schema's returned shape, but
Stage 4c still ran both commands as a matter of process; this feature *does* change the returned
shape for admins, so the same two commands are non-optional here).

**Alternatives considered**: Skipping regeneration since `UserRole` (the thing Principle V's stated
rationale usually protects) is unaffected. Rejected: Principle V's rule is about "any route's shape,"
not specifically `UserRole` — the `Player` schema in `openapi.json` would otherwise silently
under-describe what `admin` callers actually receive.
