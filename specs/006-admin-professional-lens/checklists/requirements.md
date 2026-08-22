# Specification Quality Checklist: Admin Lens for Professional-League Players

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-22
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Validation history

**Iteration 1 — four items failed.** Recorded here rather than silently fixed, because two of them
changed the substance of the spec, not its wording.

1. ❌ *No implementation details* — the first draft named `PLAYER_FILTERS`,
   `?isProfessional=true`, `PLAYER_ADMIN_ONLY_LENSES` and `GET /players/counts` inside the
   functional requirements, carried straight over from the user's phrasing. Those names are the
   *plan's* business. **Fixed**: FR-001…FR-006 now state the capability; the concrete names survive
   only in the Input quote and in the Assumptions, where naming the rejected alternative is the
   point.
2. ❌ *Success criteria are technology-agnostic* — an early SC read "the counts endpoint returns a
   `professional` key". **Fixed**: replaced by SC-002, which states the arithmetic the admin can
   verify on screen.
3. ❌ *Requirements are testable* — "the chip behaves like the No coach chip" is not testable
   without reading that chip's source. **Fixed**: FR-008, FR-009 and FR-013 now state the observable
   behaviors (flat list, URL-reflected, mutually independent) instead of referring to a precedent.
4. ❌ *Edge cases are identified* — the first draft accepted deriving the professional count as
   `total − Σ cards`, which is wrong for any player whose age group is missing for some *other*
   reason. **Fixed**: added as an explicit edge case, FR-005 now requires derivation from the flag,
   and the rejected approach is recorded in Assumptions so it is not re-proposed during planning.

**Iteration 2 — all items pass.**

**Iteration 3 — re-validated after the clarification round.** Two premises in the clarification did
not match the code and were resolved in `plan.md` as **PC-1** (the No coach chip merges filters, it
does not clear them) and **PC-2** (there is no team dropdown on the players list — point 3 adds one).
FR-013 was rewritten, FR-013a/FR-013b added, and US1 gained scenarios 4-6. All checklist items still
pass; scope grew by one UI control, which is recorded in PC-2 rather than absorbed quietly.

**Iteration 4 — re-validated after the owner's follow-up decision.** The owner chose consistency for
PC-1: the **No coach** chip is now changed (one line) to clear filters like the new chip, instead of
merging. FR-013a rewritten to require this; US1 scenario 5 rewritten to match. This is the one
functional requirement in the document whose subject is an existing control rather than the new one
— flagged explicitly in the Principle III row so a reviewer does not read "no behavior change" and
miss that a real, if narrow, behavior change is included on instruction. Checklist items still pass:
the requirement is testable (two named frontend assertions to update, one named assertion that must
NOT need touching) and scope-bounded (client-side navigation only, no endpoint or scope change).

**Iteration 5 — re-validated after `/speckit-analyze`.** The analysis pass (run against spec.md,
plan.md and tasks.md together, not the spec alone) surfaced five real findings, all remediated in
place rather than deferred:

- **FR-016 had zero task coverage** — masks staying applied is only observable via the direct-API
  edge case (FR-003), and no test asserted it. Folded into T005.
- **FR-011/T023 asked for a badge condition that contradicts the precedent it named as a model** —
  every existing badge shows its count while its own chip is *active*; this one must show while
  *inactive*. T023 corrected to state the inversion explicitly instead of just citing the pattern.
- **Two tasks (T014, T027/T028) assumed wiring that doesn't exist yet** — `PlayerFilters` has no
  `isProfessional` field, and no `teamFilter` component state exists for the new team dropdown. Split
  into explicit sub-tasks (T014a/T014b) and named the missing state field in T027/T028, so neither
  can be marked done while the value never reaches the server.
- **FR-013/FR-013a were silent on deactivation** — they specified clearing behavior for *activating*
  a chip but not for turning one off, while the plan's implementation rule cleared on both
  transitions. Rewritten so both FRs state the deactivation behavior explicitly, and plan.md's rule
  now reads `navigate(queryParams = {})` unconditionally rather than branching on toggle direction.

None of these needed a scope change — all were completeness gaps in how the existing decisions were
written down. Checklist items still pass.

## Notes

- Two judgement calls are recorded as **falsifiable assumptions** rather than resolved by asking,
  because each has a test attached that will fail loudly if the call was wrong:
  - the filter is available to all roles rather than admin-gated server-side → held to account by
    FR-003 and SC-006;
  - `proScout` does not get the chip → held to account by FR-010 and FR-015.
- **SC-004 is the load-bearing criterion of this stage.** The admin can reach professional players
  today *by accident*, through the "No coach" lens. A change that merely adds a second route while
  still depending on that accident has not fixed the gap. SC-004 assigns a coach to every
  professional player and requires them to stay reachable.
