# Cutover vocabulary

[Back to the roadmap](../TASK.md)

These `CV-*` rows name the surviving public vocabulary. They remain cutover
invariants because callers use the final surface, removed aliases stay absent,
and both the positive path and old-path rejection remain proved.

Status: all four cutovers are complete. The rows remain as negative-regression
requirements for source and packed consumers.

## CV-1 — `useActor` replaces `use`

- Export `useActor` from `flow-state/react` as the actor hook name.
- Migrate callers and docs from `use` to `useActor`.
- Remove `use` from the supported public React surface; do not keep a second hook
  implementation or legacy alias.
- Prove `useActor` has exact inference, ownership, cleanup, and packed React
  18/19 behavior, and that legacy `use` imports fail intentionally.
- Owning slice: P4B.2.

## CV-2 — `getSnapshot()` replaces `snapshot()`

- Use `getSnapshot()` across runtime, testing, React, Scenario, and inspection code.
- Migrate callers and docs from `snapshot()` to `getSnapshot()`.
- Remove `snapshot()` from the supported actor read surface after the owning
  caller inventory is migrated.
- Prove `getSnapshot()` remains side-effect-free with the exact return type, and
  that legacy `snapshot()` calls fail intentionally.
- Owning slice: P1C.2, with adapter callers completed in Phase 4.

## CV-3 — Story for authored concepts, Scenario for execution

- Story names authored examples, discovery, and CLI commands.
- Scenario names execution options, outcomes, reports, checks, and blocked reasons.
- Migrate public execution APIs, types, reports, and adapter outputs from Story
  execution names to Scenario names.
- Remove public Story execution aliases after migration.
- Serialized `story-run`, `story-run-blocked`, and `story-test` kinds remain as
  explicit historical JSON fixture discriminants under the P4C.1a boot-v1 wire
  exception. They are not supported execution API vocabulary; authored concepts
  use Story and execution concepts use Scenario.
- Programmatic and CLI paths consume the same Scenario result and keep success,
  domain failure, blocked proof, defect, interruption, and internal error distinct.
- Owning slice: P4A.2.

## CV-4 — Transaction and receipt vocabulary

- Keep `flow.transaction`, `params`, `commit`, `preview`, `invalidates`, routes,
  and concurrency as the surviving write vocabulary.
- New resource facts use `resource:*`; write facts use `transaction:*`.
- Runtime, inspection, CLI, JSON, and tests project the same canonical fact names.
- Remove `query:*`, `mutation:*`, and `cache:*` from executable receipts,
  primary facts, tests, and docs; clearly labeled historical prose may mention
  them only to explain the migration.
- Owning slices: P2.3 and P4D.2.
