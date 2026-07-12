# Compatibility vocabulary

[Back to the roadmap](../TASK.md)

These `CV-*` rows protect supported names and behavior. They are semantic
invariants, not migrations to execute outside their owning phase.

## CV-1 — `useActor` while retaining `use`

- Export `useActor` from `flow-state/react` as the preferred actor hook name.
- Keep `use` as the same implementation with identical inference, ownership,
  lifecycle, and packed React 18/19 behavior.
- Do not remove `use`, generate a second hook, or fork cleanup semantics.
- Owning slice: P4B.2.

## CV-2 — `getSnapshot()` while retaining `snapshot()`

- Prefer `getSnapshot()` across new runtime, testing, React, Scenario, and
  inspection code.
- Keep `snapshot()` as a side-effect-free alias returning the same object and exact type.
- Inventory/migrate callers only in the phase that owns them; no alias removal is approved.
- Owning slice: P1C.2, with adapter callers completed in Phase 4.

## CV-3 — Story for authored concepts, Scenario for execution

- Story names authored examples, discovery, and CLI commands.
- Scenario names execution options, outcomes, reports, checks, and blocked reasons.
- Preserve public Story execution aliases where required and serialized
  `story-run`/`story-test` kinds.
- Programmatic and CLI paths consume the same Scenario result and keep success,
  domain failure, blocked proof, defect, interruption, and internal error distinct.
- Owning slice: P4A.2.

## CV-4 — Transaction and receipt vocabulary

- Preserve `flow.transaction`, `params`, `commit`, `preview`, `invalidates`,
  routes, and concurrency.
- New resource facts use `resource:*`; write facts use `transaction:*`.
- Runtime, inspection, CLI, JSON, and tests project the same canonical fact names.
- Do not introduce primary `query:*`, `mutation:*`, or `cache:*` vocabulary;
  clearly labeled historical prose may mention it.
- Owning slices: P2.3 and P4D.2.
