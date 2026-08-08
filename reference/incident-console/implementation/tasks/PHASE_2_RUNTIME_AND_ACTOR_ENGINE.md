# Phase 2 — Managed runtime and actor engine

Status: waiting on Phase 1

## Objective

Build one ManagedRuntime-owned execution engine with immutable boot, synchronous root
handles, ordered actor mailboxes, pure TurnPlans, effectful CommitPlans, one atomic actor
snapshot publication, complete Cause handling, and finalizer-complete disposal.

## Governing contracts

`SEM-001`–`SEM-007`, `SEM-023`, `SEM-024`, `SEM-027`, `ARCH-007`–`ARCH-012`,
`ARCH-017`, `ARCH-018`, `ARCH-024`–`ARCH-026`, `WIRE-004`–`WIRE-010`, `API-012A`,
`SNAP-001`, `SNAP-002`, `SNAP-010`, `HOST-001`–`HOST-007`, `HOST-016`–`HOST-018`,
`PROOF-003`, `PROOF-004`, and `PROOF-014`.

## Allowed scope

Managed runtime Layer, root/dynamic actor registry, mailbox, actor snapshots, boot decode,
TurnPlan/CommitPlan interpreter, activity supervisor foundations, runtime disposal, and
focused lifecycle/race tests.

Resource lookup policy, optimistic transaction semantics, React, stories, and CLI are
forbidden except for minimal internal interfaces consumed by later phases.

## Tasks

- [ ] Construct one Effect `ManagedRuntime`; remove competing top-level Scope and custom
      managed-context registries.
- [ ] Decode and normalize immutable boot before root activation.
- [ ] Create each actor's real unbounded Effect Queue and replay-one snapshot store during the
      synchronous, requirement-free bootstrap, then expose stable root and dynamic handles.
- [ ] Replace the custom ready-work scheduler with one ManagedRuntime-owned consumer per actor;
      public send uses `Queue.offerUnsafe` and internal acknowledged dispatch offers to the same
      Queue through Effect.
- [ ] Implement package-private acknowledged dispatch using Deferred while public `send`
      remains synchronous.
- [ ] Separate pure transition/redirect planning from effectful reconciliation; enforce the
      100-microstep stabilization bound.
- [ ] Publish state, memory, primitive registries, receipts, issues, lifecycle, and revisions
      through one actor `SubscriptionRef` exactly once per committed command.
- [ ] Derive one TurnRecord after publication and isolate sink failure from committed state.
- [ ] Implement full-Cause classification and preserve typed failure, defect, interruption,
      and cleanup lanes.
- [ ] Implement idempotent disposal: stop admission, settle buffered acknowledgments,
      interrupt/await all work, publish disposed, complete snapshots, and close the runtime.

## Acceptance

- Pre-ready events execute exactly once after one shared Layer acquisition; acquisition
  failure reaches every waiting internal acknowledgment and Provider readiness bridge.
- Reentrant events remain FIFO and one command produces one actor revision/publication.
- Redirects start work only from the final stabilized configuration.
- Observer or inspection failure cannot roll back or block an actor publication.
- Mixed failure-plus-defect Causes classify as defect while retaining the complete Cause.
- Disposal runs every finalizer once, never abandons cleanup, settles buffered Deferreds
  before Queue shutdown, publishes one disposed snapshot, and is idempotent.

## Deletion obligations

Delete the React-style actor shell from runtime construction paths, custom ready-work/FIFO
scheduling, owned-effect runner, split issue source, manual cleanup registry, mutable
`hydrateBoot`, zero-argument/test-default runtime creation, and abortable disposal semantics.

## Gates and receipt

Run deterministic mailbox/reentrancy/publication tests, async Layer acquisition and failure
tests, boot-before-activation tests, Cause matrix tests, finalizer/disposal tests, package
test/typecheck/build. The receipt includes publication sequences, finalizer counts, Cause
evidence, zero-live-work proof, deletions, and exact exits.
