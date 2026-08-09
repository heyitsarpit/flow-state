# Phase 2 — Managed runtime and actor engine

Status: waiting on Phase 1

## Objective

Build one ManagedRuntime-owned execution engine with immutable boot, synchronous root
handles, ordered actor mailboxes, pure TurnPlans, effectful CommitPlans, one atomic actor
snapshot publication, complete Cause handling, and finalizer-complete disposal.

## Governing contracts

`SEM-001`–`SEM-007`, `SEM-001A`, `SEM-023`, `SEM-024`, `SEM-027`, `ARCH-007`–`ARCH-012`,
`ARCH-017`, `ARCH-024`–`ARCH-026`, `WIRE-004`, `WIRE-005`, the boot portion of
`WIRE-014`, `API-012A`, `TYPE-011`, `TYPE-012`, `SNAP-001`, `SNAP-002`, `SNAP-010`,
`HOST-001`–`HOST-006`, `HOST-016`, `HOST-018`,
`PROOF-003`, `PROOF-004`, and `PROOF-014`.

## Allowed scope

Managed runtime Layer, runtime shell, root/dynamic actor registry, mailbox, actor snapshots,
shared private boot-envelope Schema and decode, TurnPlan/CommitPlan interpreter, TurnRecord hub,
StoreFanout foundation, activity supervisor foundations, runtime disposal, and
focused lifecycle/race tests.

Resource lookup policy, optimistic transaction semantics, React, stories, and CLI are
forbidden except for minimal internal interfaces consumed by later phases.

## Tasks

- [ ] Implement final-node turns: `{ type: "final" }` publishes an ordinary final-token snapshot,
      releases prior ownership after publication, exposes no output, remains active/readable as a
      root, and admits later events as ordinary no-transition turns.
- [ ] Index every live stable-ID dynamic actor, whether freshly created or restored, and expose
      lookup-only `runtime.actor(machine, { id })`; reject missing, mismatched, opaque, disposed,
      foreign, and ambiguous identity while creation continues to reject collisions.
- [ ] Construct one Effect `ManagedRuntime`; remove competing top-level Scope and custom
      managed-context registries.
- [ ] Decode the immutable boot envelope, validate AppPlan identity, and install generic actor
      `PreparedBoot` before root activation. Define one normalizer extension boundary consumed by
      the Phase 3 resource kernel and Phase 4 transaction/activity kernel.
- [ ] Implement root `decodeRuntimeBoot(app, unknown, { decodeDomain })` over that same Schema as
      the sole branded re-entry for same-version domain-validated unknown storage input.
- [ ] Create each actor's real unbounded Effect Queue and replay-one private `ActorState` cell in
      a synchronous `FlowRuntimeShell`, then expose stable root and dynamic handles whose reads
      project only the public snapshot. ManagedRuntime
      owns every consumer fiber and Scope; it does not retroactively own the shell cells.
- [ ] Before each handle escapes, preseed restored pending-outcome IDs in stable sequence order and
      then one boot-activation barrier; fresh actors preseed only the barrier. The managed consumer
      waits for readiness, drains restored IDs, activates current ownership, then handles early
      host events.
- [ ] For fresh roots and dynamic actors, invoke the compiled definition memory factory exactly
      once when present with typed input, otherwise use the canonical empty readonly record,
      before the initial snapshot and activity activation. Restoration uses materialized memory;
      a factory defect leaves no partial actor or owned work.
- [ ] Materialize all fresh root memories into inert locals in compiled order before allocating
      any shell cell, registry entry, Layer acquisition, or consumer; a later factory defect calls
      no later factory and publishes nothing.
- [ ] Implement `runtime.actor(machine)` as root-only lookup and
      `runtime.createActor(machine, { input, id? })` as creation constrained to the compiled
      closure seeded by roots and `app.dynamicMachines`. A machine object never presented to AppPlan fails with
      `UnreachableMachine`; no process-global registry participates.
- [ ] Replace the custom ready-work scheduler with one ManagedRuntime-owned consumer per actor;
      public send uses `Queue.offerUnsafe` and internal acknowledged dispatch offers to the same
      Queue through Effect.
- [ ] Implement package-private acknowledged dispatch using Deferred while public `send`
      remains synchronous.
- [ ] Implement one actor-owned durable `PendingOutcome` map and stable-ID mailbox command.
      Projection/cursor publication adds the materialized event atomically; processing removes it
      in the event turn; duplicate IDs no-op; boot restores records before scheduling them once.
- [ ] Separate pure transition/redirect planning from effectful reconciliation; enforce the
      100-microstep stabilization bound.
- [ ] Publish state, memory, primitive registries, active issue summaries, lifecycle, and
      revisions through one actor `SubscriptionRef` exactly once per committed command.
- [ ] Derive one TurnRecord from the actual committed fact batch after publication, accept it in
      one runtime hub, queue one package-private post-commit reconciliation fact for staged work,
      queue newly admitted pending-outcome IDs in stable sequence order, complete acknowledgment,
      then release StoreFanout.
      External sink work and failure must not
      delay acknowledgment or mutate committed state.
- [ ] Reserve one terminal actor revision and TurnRecord sequence per live actor plus one StoreState
      cleanup revision; reject boot, ordinary commits, and dynamic creation before they consume
      those credits, then spend disposal credits in raw actor-ID order.
- [ ] Implement full-Cause classification and preserve typed failure, defect, interruption,
      and cleanup lanes.
- [ ] Implement idempotent disposal: stop admission, settle buffered acknowledgments,
      interrupt/await all work, publish disposed, complete snapshots, and close the runtime.
- [ ] Prove the permanently pending-Layer path discards buffered public sends without executing
      planners/callbacks, fails acknowledged commands once, rejects later sends, and leaves zero
      shell cells, subscribers, Queues, readiness waiters, or package-owned fibers.
- [ ] Keep vNext reachable only through package-private proof entry points. Public routes continue
      to use unchanged legacy owners until Phase 7; no adapter may translate old grammar into vNext
      or compose both engines in one runtime.

## Acceptance

- Pre-ready events execute exactly once after one shared Layer acquisition; acquisition
  failure reaches runtime readiness and every waiting internal acknowledgment.
- Present fresh-memory factories run exactly once before the initial snapshot and activities;
  omitted factories produce the canonical empty record, restored actors run them zero times,
  and a factory defect leaves no partial actor or live work.
- Reentrant events remain FIFO and one command produces one actor revision/publication; a
  publication receipt exists only in its post-publication TurnRecord.
- Capture between outcome admission and mailbox processing cannot lose or duplicate the mapped
  event, and outcome mappers are never rerun during boot.
- Ordinary binding release preserves admitted outcomes; only actor/runtime disposal may clear
  them. Restored activities cannot start and early host events cannot run before restored outcomes
  drain through the production mailbox.
- Redirects start work only from the final stabilized configuration.
- User Effects cannot start before their pending actor snapshot and TurnRecord exist; a later
  mailbox drain enacts the staged ownership.
- Observer or inspection failure cannot roll back or block an actor publication.
- Mixed failure-plus-defect Causes classify as defect while retaining the complete Cause.
- Disposal runs every finalizer once, never abandons cleanup, settles buffered Deferreds
  before Queue shutdown, clears pending outcomes without routing them, publishes one disposed
  snapshot, and is idempotent.
- Prepared revision-zero snapshots produce no TurnRecord; activation is sequence one, and disposal
  remains publishable under every accepted near-overflow state.

## Deletion obligations

Delete these owners from the package-private vNext runtime: the React-style actor shell, custom
ready-work/FIFO scheduling, owned-effect runner, split issue source, manual cleanup registry,
mutable `hydrateBoot`, zero-argument/test-default runtime creation, and abortable disposal
semantics. The frozen legacy public shell and runtime stay reachable only through the unchanged
legacy routes until their atomic Phase 7 deletion.

## Gates and receipt

Run deterministic mailbox/reentrancy/publication/fanout tests, async Layer acquisition and
failure tests, boot-before-activation tests, Cause matrix tests, finalizer/disposal tests, package
test/typecheck/build. The receipt includes publication sequences, finalizer counts, Cause
evidence, zero-live-work proof, deletions, and exact exits.
