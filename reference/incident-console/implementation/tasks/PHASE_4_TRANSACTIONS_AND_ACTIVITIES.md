# Phase 4 — Transactions and activities

Status: waiting on Phase 3

## Objective

Implement exact transaction identity and concurrency, the global ordered optimistic
overlay ledger, activity reconciliation, streams, timers, explicitly owned actors, and
scoped remote leases on the Phase 2 actor and Phase 3 store owners. Recursive machine
states never create child-machine owners.

## Governing contracts

`API-007`–`API-009`, `TYPE-006`–`TYPE-008`, `SEM-006A`, `SEM-015`–`SEM-024`, `SEM-024A`,
`SEM-017A`, `ARCH-015`,
`ARCH-023`, `WIRE-007`–`WIRE-012`, `HOST-017`, `SNAP-006`–`SNAP-010`,
`PROOF-005`, `PROOF-007`, `PROOF-014`, `PROOF-015`,
and the activity portions of `PROOF-003` and `PROOF-004`.

## Allowed scope

Transaction runner, exact transaction refs, overlay commands, concurrency supervisors,
activity reconciliation, streams, timers, explicit actor lifecycles, scoped lease pattern, snapshots,
receipts/issues, and deterministic tests.

React, story runner, artifact formats, and CLI are forbidden.

## Implementation hints (non-normative)

ARCH-028 recommends `Effect.suspend`/`Stream.suspend` at authored factories, FiberMap for keyed
replacement, FiberSet for independent attempts, one keyed Queue worker for serialization, and
`acquireRelease` for scoped leases. These choices must preserve Flow-owned PendingOutcome,
overlay, TimerCoordinator, generation, and stable-order laws rather than redefine them.

## Tasks

- [ ] Reject subordinate-machine descriptors, child completion, child snapshots, and child
      persistence at compile, runtime, Story, and artifact boundaries. Recursive substates share one
      actor mailbox, memory, context, operation ownership, and lifetime.
- [ ] Keep explicitly owned actors autonomous and expose no
      parent-to-actor command path. Only a changed canonical key replaces a generation; equal key
      retains the original materialized input, and independently commanded workflows use explicitly
      admitted actor owners.
- [ ] Materialize at most one keyed stream binding per declaration;
      no runtime-sized membership/outcome collection API enters vNext.
- [ ] Encode the complete canonical store or fail `ArtifactBoundExceeded`; do not
      introduce resource persistence selectors.
- [ ] Prevent transaction/stream outcomes from writing canonical resource bases. Success
      removes preview and invalidates/refetches; server values may route through typed machine
      events while resource lookup remains the sole canonical publication path.
- [ ] Throw `FlowDehydrateError` from capture and preserve retryable
      concurrent capture separately from terminal non-durable actor/stream, identity closure,
      payload encoding, bound, and disposed-runtime failures.
- [ ] Use exact transaction refs for generations, actor snapshots, routes, TurnRecords,
      concurrency, persistence, and cleanup.
- [ ] Bind machine-independent transactions and streams through the machine-local activity kit.
      Memory/event selectors and routed outcomes live on bindings, while
      descriptors retain only execution, identity, policy, and Effect requirements.
- [ ] Implement `reject`, `cancel`, `allow`, and unbounded FIFO
      `serialize` per actor-local exact transaction ref without deduplication. Remove transaction
      `scope` and any cross-actor Flow scheduler.
- [ ] For `allow`, settle every generation's overlays and TurnRecord, but prevent an older
      completion from projecting or routing after a newer generation is admitted.
- [ ] Allocate serialized generation on accepted admission; state exit/disposal drops queued
      attempts without routing an outcome.
- [ ] Store ordered overlays globally by actor, transaction ref, generation, target ref, and
      store order; apply multi-ref previews atomically.
- [ ] Remove exactly one generation's overlays on every terminal path. Success invalidates
      authoritative bases and never promotes preview data.
- [ ] Reconcile activity identity from the stable compiled binding slot and exact ref/key; source
      order is the persistence boundary and outcome functions never contribute allocation identity.
- [ ] Route transaction, stream, and timer mappings through Phase 2's durable
      `PendingOutcome` admission. The causal projection and materialized event record commit
      together; mailbox processing clears by stable ID without rerunning the mapper.
- [ ] Enact staged activity starts and releases only from Phase 2's post-commit reconciliation
      fact; never run a user Effect during CommitPlan interpretation or before actor publication.
- [ ] Use `FiberMap` for replaceable work, `FiberSet` for independent work, and Queue plus one
      supervised worker for serialized work. Run each program as `Effect.scoped` without a
      second manually managed Scope.
- [ ] Implement keyed streams and timers with generation-gated mailbox completion. Explicit actor
      lifecycles use the Phase 2 actor owner and lease rules; no activity binding creates a child Scope.
- [ ] Expose no Flow stream `pressure` option or buffer; prove Effect Stream/application-authored
      backpressure works through the ordinary stream activity lifecycle.
- [ ] Persist the concrete params of every running durable stream binding. On hydration, record
      the old generation as an unrouted restoration interruption and start exactly one fresh
      scoped generation after hydrated publication, readiness, and the restored-outcome barrier
      without rerunning selectors.
      Noncanonical active params fail capture as `NonDurableActiveStreamParams`; terminal streams
      remain consumed.
- [ ] Implement continuing remote leases through scoped streams; use an explicitly owned actor when the
      lease lifecycle is domain behavior.
- [ ] Normalize pending/queued transaction restoration to interruption with no route and no
      automatic retry before first hydrated publication.
- [ ] Complete referentially closed dehydration across durable actors, actor refs, activity
      identities, exact refs, transaction bindings, and optimistic overlays. Reject opaque actors
      that own persistent state and retryable concurrent graph replacement rather than emitting
      an orphaned payload.
- [ ] Finish the executable private vNext root owner and prove its hosts delegate to the same
      runtime, store, transaction, stream, timer, and actor engine. Keep every public route on
      legacy until the atomic Phase 7 switch.

## Acceptance

- A transaction-start turn publishes pending status, preview, issue summary, and one matching
  store revision together; its receipt exists only in the accepted post-publication TurnRecord.
- Activity code begins only after the pending turn has published and cannot race ahead of the
  snapshot that reports it.
- Two actors and several transaction generations can overlap on one resource without
  overwriting or rolling back another generation.
- Success, failure, defect, interruption, restoration, state exit, and disposal each remove
  only owned overlays and preserve the complete Cause where applicable.
- Serialized attempts run FIFO, allocate stable queued identities, and never route work
  that did not start.
- Stream, timer, explicitly owned actor, and lease replacement cannot accept stale completion.
- Recursive substates never have an initializer, snapshot, completion, or persistence lifecycle
  separate from their containing actor.
- Planned state exit releases work once without synthesizing an external interruption
  outcome; cleanup defects become issues and do not roll back published transitions.
- Capturing after any activity projection but before its mapped event turn restores that pending
  event exactly once; duplicate outcome-ID commands and inapplicable events clear safely.
- Dehydration either returns a deterministic closed payload or a structured
  `NonDurableActorOwnsPersistentState`, `NonDurableActiveStreamParams`, or
  `ConcurrentDehydrate` failure.

## Deletion obligations

Record legacy implementation owners for atomic Phase 7 deletion, including actor-local preview ledgers, descriptor-ID transaction registries, hard-coded
serialize capacity/rejection, generic actor retry/reset methods, duplicate activity Scopes,
legacy invoke/after owners, transaction `scope`, stream `pressure`, and the `Stream.never`
ignored-cancellation runbook pattern. Do not delete public legacy owners before the all-route Phase
7 cutover.

## Gates and receipt

Run transaction identity/concurrency/overlay interleaving tests, multi-actor store tests,
application-authored Stream backpressure and completion tests, timer TestClock tests, explicit actor lifecycle tests,
remote-lease exit matrix, restoration tests, package test/typecheck/build. The receipt
also runs private packed vNext root consumers plus frozen-facade consumers and proves both reach the
same engine; it includes overlay timelines, queue order, stale-completion evidence, Cause/finalizer matrix,
deletions, and exact exits.
