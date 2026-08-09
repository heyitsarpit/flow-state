# Implementation blockers, confirmed issues, and resolved design questions

Status: resolved into the normative contracts and proof matrix indexed by
[`implementation/README.md`](./implementation/README.md)

Survey date: 2026-08-09

Related contract: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)

This file records the findings from a package-wide survey of every public export in
`packages/flow-state/package.json`, the library implementation and tests, every maintained
example, and the vendored Effect v4 source. It distinguishes defects already present in
the library from design decisions resolved by the normative implementation contracts.

The current package suite passes 1,019 tests and the examples pass 67 tests. Those green
results are useful regression evidence, but they do not cover the lifecycle, identity,
publication, and isolation failures below.

Every **B** and **Q** item below now has a selected outcome in the normative contracts indexed by
`implementation/README.md`; the deleted `BLOCKER_RESOLUTIONS.md` ledger is not an authority. This
file remains the audit and evidence inventory, not an active source of implementation semantics.

## Status vocabulary

- **Confirmed issue (`I`)**: incorrect or unsafe behavior in the current implementation.
- **Implementation blocker (`B`)**: the target architecture is ambiguous or incorrect
  without another decision.
- **Resolved design question (`Q`)**: a historical semantic choice whose selected outcome now lives
  in a named normative contract.
- **Cleanup (`C`)**: code, exports, dependencies, examples, or tests to remove or
  consolidate after their replacement exists.

## Resolved blocking decisions

### B1. Optimistic success cannot promote preview data to canonical server truth

The current implementation applies optimistic previews to shared resource data while
tracking their ownership actor-locally. Two actors previewing the same resource can
therefore overwrite or roll back one another. Moving the overlay ledger into the shared
store fixes ownership, but the current target still says a successful preview folds into
the canonical base. A transaction's `preview` function cannot prove what the server
stored.

Settled direction required before implementation:

- Store ordered optimistic overlays globally, identified by actor ID, transaction ref,
  generation, target resource ref, and insertion order.
- Remove only that generation's overlays on success, typed failure, defect, interruption,
  restoration, or disposal.
- On success, invalidate or refresh the authoritative resource base.
- Do not publish preview output as canonical data unless a future explicit API maps an
  authoritative server response into a resource value.

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview.ts:25`
- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-preview.ts:94`
- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-completion.ts:127`
- `DESIGN_DECISIONS.md:1815`

### B2. The actor turn, rather than the resource store, owns atomic publication

`Ref.modify` followed by a separate notification does not make a transaction start atomic.
Observers could see `pending` before its preview, the preview before its receipts, or
machine state from a different revision. The initiating actor must publish one coherent
snapshot for one mailbox turn.

The required protocol is:

1. The mailbox takes one command and the pure machine planner produces a stabilized
   `TurnPlan`.
2. Reconciliation reserves, starts, replaces, or stops immediate work and constructs a
   `CommitPlan`.
3. One atomic store command returns the post-commit resource projections and store
   revision.
4. The actor materializes state, memory, primitive registries, receipts, issues, and the
   observed store revision into one immutable snapshot.
5. The actor publishes exactly once, then acknowledges the command.
6. Store changes are fanned out to other actor mailboxes only after the initiating actor
   has published.

Use a single `SubscriptionRef<StoreState>` containing the immutable store state, revision,
and changed refs. Do not use `SynchronizedRef + PubSub`: mutation and publication are two
separate phases that concurrent writers can reorder. Effect v4's `SubscriptionRef`
updates the value and its replaying change stream under one permit.

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-resources.ts:375`
- `packages/flow-state/src/core/orchestrator/orchestrator-resources.ts:389`
- `packages/flow-state/src/core/orchestrator/orchestrator-resources.ts:399`
- `docs/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:248`
- `docs/codebases/effect-v4/packages/effect/src/SubscriptionRef.ts:464`

### B3. Boot is immutable runtime constructor input and precedes root activation

Creating or activating roots before applying boot lets them run against empty state. Boot
must be decoded and normalized as part of `flow.runtime({ app, layer, boot? })`, before any
root activity starts. Mutable `hydrateBoot` must be removed.

The v2 envelope must include at least:

- Flow artifact and definition format versions;
- application ID and application-owned `persistenceVersion`;
- actor ID, machine ID, root or dynamic kind, and parent identity where applicable;
- canonical resource and transaction ref arguments sufficient to restart work;
- one canonical resource store, rather than duplicated resource values in every actor;
- each actor's referenced primitive identities and last observed store revision.

Flow validates its structural envelope and descriptor identities. Application code owns
migration and validation of opaque domain memory and payloads. Durable carriers must be
bounded finite JSON-like values; cyclic objects and arbitrary class instances are not
valid boot data.

Evidence:

- `packages/flow-state/src/runtime/contract-runtime.ts:297`
- `packages/flow-state/src/runtime/contract-runtime.ts:501`
- `packages/flow-state/src/runtime/contract-runtime.ts:508`
- `packages/flow-state/src/core/api/snapshot-types.ts:202`
- `packages/flow-state/src/core/api/snapshot-types.ts:214`

### B4. Dehydration is revision-consistent, not globally linearizable

Effect has no primitive that atomically snapshots several independently owned actor
mailboxes and a shared resource store. Locking them together would introduce deadlock
risk or quietly create a global event sequencer.

The default contract should be:

- every actor snapshot is internally atomic;
- every actor records the resource-store revision it observed;
- the resource store is captured once;
- the runtime envelope may contain actor snapshots from slightly different instants;
- hydration rematerializes actor projections from canonical store data and recorded refs.

If a future feature requires a globally linearizable multi-actor snapshot, it must propose
one explicit global commit sequencer rather than extending this dehydration contract.

### B5. Synchronous root handles need a non-React host boundary

React `useActor(machine)` is insufficient for SSR, CLI, inspection, and server requests.
Those hosts need to address an already-created root without accidentally creating a
second dynamic actor.

Add:

```ts
runtime.actor(machine); // compiled root lookup only
runtime.createActor(machine, input); // dynamic instance creation
actor.snapshots; // Effect Stream of atomic snapshots
```

`ManagedRuntime.make` is synchronous and builds its Layer lazily once. An early `send`
can call `ManagedRuntime.runFork`; the fiber waits on the shared Layer build rather than
using a no-op shell or a second JavaScript buffer. Layer acquisition failure must reach
the runtime readiness observer and every waiting dispatch.

Evidence:

- `packages/flow-state/src/react/use-actor.ts:20`
- `packages/flow-state/src/react/use-actor.ts:134`
- `examples/server-prefetch-hydration/src/server/request-boot.ts:20`
- `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:273`
- `docs/codebases/effect-v4/packages/effect/src/ManagedRuntime.ts:297`

### B6. Story `send` acknowledges one actor turn

An authored `.checkpoint()` intentionally does not flush or make progress. Consequently,
the story interpreter's `.send(event)` command must wait until that exact mailbox turn has
stabilized, completed its immediate reconciliation, published once, and acknowledged its
snapshot. It must not wait for later asynchronous resource, transaction, stream, timer, or
child completion.

Mailbox commands that need acknowledgment should carry an Effect `Deferred`. Actor
disposal must fail all buffered acknowledgments before shutting down the queue, because
`Queue.shutdown` discards buffered messages.

Evidence:

- `DESIGN_DECISIONS.md:1584`
- `docs/codebases/effect-v4/packages/effect/src/Queue.ts:1080`
- `docs/codebases/effect-v4/packages/effect/src/Deferred.ts:183`

### B7. Activity identity and ownership must be canonical

Newly allocated child inputs or stream parameters cannot be compared by object identity.
Every active declaration uses its compiled slot—machine ID, state token, activity kind,
and zero-based declaration ordinal—plus the descriptor ID and canonical resolved key.
Authored declaration reordering is a persistence boundary and requires migration.

Required rules:

- resources and transactions use their exact resolved refs;
- parameterized child and stream declarations provide an explicit key projection;
- timers use the compiled declaration slot plus canonical timer key;
- one actor configuration cannot simultaneously own `ensure(ref)` and `observe(ref)` as
  independent executions of the same resource ref;
- outcome-map allocation identity never participates in persistence or reconciliation.

`FiberMap` should own cancel-previous replacement, `FiberSet` concurrent work, and a Queue
plus one supervised worker serialized work. Each activity runs as `Effect.scoped`; do not
also create and manually close a second child `Scope`. Flow still retains generation
tokens because Effect cannot stop stale user callbacks from attempting a commit.

Evidence:

- `docs/codebases/effect-v4/packages/effect/src/FiberMap.ts:125`
- `docs/codebases/effect-v4/packages/effect/src/FiberMap.ts:327`
- `docs/codebases/effect-v4/packages/effect/src/FiberSet.ts:120`

### B8. Effect requirements must propagate through the compiled app graph

Resources and transactions retain `Effect<A, E, R>`, but current machine and app types do
not carry `R`. The target compiler needs a hidden requirements type from descriptor to
machine graph to module roots to app, and `flow.runtime` must constrain its supplied Layer
to satisfy the inferred application requirements.

The compiler must also validate routed vocabulary ownership, descriptor reachability,
root membership, and every globally addressed ID at runtime.

Evidence:

- `packages/flow-state/src/core/api/machine-core-types.ts:190`
- `packages/flow-state/src/core/api/app-descriptor-types.ts:90`

### B9. Machine input has one public shape

Use `memory: ({ input }) => Memory`, infer the actor's `Input`, and require `Input = void`
for automatically created module roots. Dynamic actors receive their typed input through
`runtime.createActor(machine, { input })`.

This closes the mismatch between the decision that reusable machines have input and the
current examples that only show `memory: () => ...`.

### B10. Complete Causes determine failure classification

The current code can report a typed failure while hiding a defect in the same Cause. Keep
the complete `Cause` and apply this precedence:

1. any defect means the defect lane;
2. otherwise any typed failure means the domain-failure lane;
3. otherwise interruption-only means the interruption lane.

Use `Effect.exit`, not `Effect.result`, for operation completion because the runtime must
retain success, typed failure, defect, and interruption. Squashing belongs only at a
JavaScript host boundary.

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-issues.ts:68`
- `packages/flow-state/src/core/transactions/transaction-runtime.ts:46`
- `docs/codebases/effect-v4/packages/effect/src/Effect.ts:2160`
- `docs/codebases/effect-v4/packages/effect/src/Cause.ts:758`

### B11. Capability projection uses the reactive view boundary

`useActor` deliberately returns a command handle without subscribing. A component that
calls `flow.can(actor.getSnapshot(), event)` directly will therefore not rerender when
acceptance changes.

State-dependent and payload-dependent capabilities belong in a view projection:

```ts
const editorView = flow.view(todoMachine, {
  id: "todos.editor.view",
  select: (snapshot) => ({
    canAdd: flow.can(snapshot, Todo.E.AddRequested("")),
    canAssign: (assignee: Assignee) => flow.can(snapshot, Todo.E.AssignmentRequested(assignee)),
  }),
});
```

Do not add `useCan`, a duplicated capability table, or broad `useActor` subscription.

### B12. Scoped external leases need an honest convention

Incident Console currently represents a remote runbook lease as `Stream.never` with
cancellation hidden in a finalizer. Normal completion, replacement, navigation, and
runtime disposal all appear as cancellation, and cancellation failure is ignored.

Prefer a child actor or a documented scoped-resource stream whose activity scope owns the
remote lease. Normal completion and interruption must remain distinguishable, cancellation
runs exactly once, and cleanup defects enter actor issues.

Evidence:

- `examples/incident-console/src/features/incidents/runbook-lease.ts:9`

## Confirmed issues in the current implementation

### I1. Pure model exploration executes production Effects

The supposedly pure path engine runs transaction commits through `Effect.runSyncExit` and
consumes streams through `Stream.runForEach`. Model discovery can therefore perform real
writes or subscriptions. Delete synchronous Effect resolution from the pure model;
fixture-controlled declared outcomes are the only valid discovery inputs. Live proof
belongs to `path.story.run()`.

Evidence:

- `packages/flow-state/src/core/machines/flow-paths.ts:1385`
- `packages/flow-state/src/core/machines/flow-paths.ts:1612`

### I2. `useActor` drops commands before attachment

The initial actor shell implements `send` and `subscribe` as no-ops, while real actor
attachment happens later in a layout effect. Commands sent during that interval disappear.
The shell also subscribes command-only components broadly through `useSource`.

Evidence:

- `packages/flow-state/src/react/use-actor.ts:20`
- `packages/flow-state/src/react/use-actor.ts:132`
- `packages/flow-state/src/react/use-actor.ts:134`

### I3. A cancelled resource lookup can delete a newer generation

Last-waiter cancellation removes an in-flight entry before the old lookup fiber terminates.
A new lookup can install a replacement, after which the old finalizer unconditionally
deletes the replacement. Generation checks may prevent stale data publication, but
deduplication is lost and later callers can start duplicate I/O.

Evidence:

- `packages/flow-state/src/core/store/resource-store-lookups.ts:93`
- `packages/flow-state/src/core/store/resource-store-lookups.ts:349`
- `packages/flow-state/src/core/store/resource-store-lookups.ts:371`

### I4. Placeholder data is canonical success while idle

Every empty resource record stores a placeholder and public projection reports it as
successful available data before a lookup becomes active. Placeholder values must be
observer projections for active lookup generations, not resource-store bases.

Evidence:

- `packages/flow-state/src/core/store/resource-snapshot.ts:74`
- `packages/flow-state/src/core/store/resource-snapshot.ts:141`

### I5. React subscriptions influence resource refresh policy

All resource subscribers increment active usage, and active invalidation uses that count to
decide whether to refresh. Mounting a component can therefore cause network work. Only
machine activity leases may control retention and refresh; views and React are passive.

Evidence:

- `packages/flow-state/src/core/store/resource-store-subscriptions.ts:35`
- `packages/flow-state/src/core/store/resource-store-memory.ts:242`
- `packages/flow-state/src/react/resource-source.ts:44`

### I6. Resource records have no automatic collection

The memory store retains one growing Map and removes entries only through explicit
mutation. Parameterized resource keys can accumulate for the lifetime of a runtime. The
replacement needs scoped owner leases and tested `gcTime` behavior.

Evidence:

- `packages/flow-state/src/core/store/resource-store-memory.ts:216`

### I7. Freshness expiry does not publish

Freshness is derived lazily from the current clock, but subscribers are notified only when
the backing record changes. A resource can become stale without any actor or view update.
Scoped stale timers must commit through the same store-revision path.

Evidence:

- `packages/flow-state/src/core/store/resource-snapshot.ts:58`
- `packages/flow-state/src/core/store/resource-store-subscriptions.ts:72`

### I8. The process-global resource registry breaks application isolation

Resource definitions are retained in a module-global strong Map and never removed.
Serialized ref resolution scans every historical definition, so HMR, repeated tests, and
multiple apps can create ambiguity before later ownership checks run. The compiled
`AppPlan` must own all descriptor resolution.

Evidence:

- `packages/flow-state/src/core/api/resource-runtime.ts:31`
- `packages/flow-state/src/core/api/resource-runtime.ts:53`
- `packages/flow-state/src/core/api/resource-runtime.ts:65`
- `packages/flow-state/src/runtime/contract-runtime.ts:358`

### I9. App-wide collision validation covers resources only

Modules declare resources, transactions, machines, streams, and views, but the app-global
collision list contains only resources. Duplicate roots and other descriptor IDs can
survive assembly and collide later in runtime, persistence, inspection, or CLI addressing.

Evidence:

- `packages/flow-state/src/descriptors/validation.ts:22`
- `packages/flow-state/src/descriptors/validation.ts:65`
- `packages/flow-state/src/descriptors/validation.ts:351`

### I10. Transaction and model identity use descriptor IDs instead of refs

Parameterized invocations of one transaction family share concurrency and snapshot slots.
The pure model similarly stores seeded resources under descriptor ID, allowing two keys of
one resource family to overwrite each other. Exact resolved refs must be the identity in
runtime, snapshots, testing, inspection, and persistence.

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts:27`
- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-start.ts:39`
- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-completion.ts:157`
- `packages/flow-state/src/testing/flow-model.ts:31`

### I11. Story executions can leak runtime-owned work

The story path flushes and captures output without guaranteeing runtime disposal. The
internal runtime-backed harness exposes disposal, but public started builders drop that
capability. The consolidated runner must use scoped acquisition and release on success,
failure, defect, interruption, and host cancellation.

Evidence:

- `packages/flow-state/src/testing/flow-stories.ts:81`
- `packages/flow-state/src/testing/runtime-backed-test-harness.ts:242`
- `packages/flow-state/src/testing/runtime-backed-test-harness.ts:277`

### I12. Serialized transactions reject rather than serialize beyond one waiter

The current queue capacity is hard-coded to one and generations are keyed by descriptor ID.
The target must define FIFO ordering, admission capacity, generation allocation, and how
state exit handles queued attempts without routing a completion for work that never began.

Evidence:

- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts:11`
- `packages/flow-state/src/core/orchestrator/orchestrator-transaction-concurrency.ts:64`

### I13. Zero-argument runtime construction silently installs test services

`flow.runtime()` appears production-ready but installs test notification, host-signal,
store, and orchestrator services. Remove the zero-argument path and require an app plus its
application Layer.

Evidence:

- `packages/flow-state/src/runtime/contract-runtime.ts:551`

### I14. Host callbacks escape runtime ownership through `Effect.runSync`

Host signal listeners call `Effect.runSync` directly, allowing reentrant publication and
execution outside the managed runtime Scope. Use Effect's scoped event-listener stream or a
runtime-owned queue.

Evidence:

- `packages/flow-state/src/core/runtime/host-signals.ts:26`
- `docs/codebases/effect-v4/packages/effect/src/Stream.ts:1558`

### I15. Trace artifact decoding loses useful failures

Current validation is shallow and import/decompression collapse corrupt, unsupported, and
malformed artifacts into `undefined`. Private Schema-v2 decoding should keep structured
`SchemaError` failures in the typed channel.

Evidence:

- `packages/flow-state/src/inspection/trace-artifact.ts:18`
- `packages/flow-state/src/inspection/trace-artifact.ts:171`

### I16. Durable key validation accepts values that cannot round-trip safely

Canonical keys currently accept `NaN`, infinities, `undefined`, and bigint, while
`resource.ref` does not validate durable identity eagerly. Invalid persisted identities
therefore fail far from their construction site. Lock and validate one finite durable
carrier contract at ref creation.

Evidence:

- `packages/flow-state/src/core/keys/canonical-key.ts:123`
- `packages/flow-state/src/core/keys/canonical-key.ts:221`
- `packages/flow-state/src/descriptors/resource.ts:28`

### I17. Runtime construction inside React can leak under Strict Mode

Several examples create a runtime in a `useState` initializer. Strict Mode may execute and
discard an initializer-created runtime without disposing it. Browser app runtimes should
be constructed once outside React bootstrap; request runtimes and story runtimes remain
scope-owned.

Evidence:

- `examples/basic-cached-posts/src/ui/FlowRoot.tsx:10`
- `examples/incident-console/src/ui/useOwnedFlowRuntime.ts:15`

### I18. Several examples claim workflows they do not perform

The offline example seeds fixtures after mount rather than restoring persisted state. The
server example calls a service directly and fabricates resource snapshots instead of
preloading through machine behavior. The optimistic example teaches rejected `flow.patch`
and `flow.after` APIs. They should be consolidated around the target workflows rather than
incrementally preserved.

Evidence:

- `examples/offline-recovery/src/ui/OfflineRecoveryClient.tsx:14`
- `examples/server-prefetch-hydration/src/server/request-boot.ts:20`
- `examples/optimistic-transactions/src/features/todos/machine.ts:22`

## Resolved design questions

### Q1. Is authoritative transaction publication needed in the first release?

Selected outcome: success removes that generation's overlays and invalidates declared refs.
Transaction results may update machine state through typed outcomes, but vNext has no direct
authoritative resource-write API and never infers canonical truth from `preview`.

### Q2. What are serialized transaction admission semantics?

Selected outcome: serialization uses an unbounded actor-local FIFO per exact transaction ref,
allocates a generation at admission, never deduplicates equal refs, and interrupts active work
while discarding queued work on state exit or disposal.

### Q3. What exactly survives persistence for pending operations?

Selected outcome: persist materialized schema-validated overlays and operation identity, never
functions, fibers, or Effects. Restore pending and queued transactions as terminal interruption,
remove their overlays, retain restoration evidence, and route no outcome or automatic retry.

### Q4. How are resource ref arguments made durable?

Selected outcome: exact ref arguments use the one bounded canonical durable carrier and the
receiving AppPlan resolves decoded descriptor IDs without a global registry or per-resource codec.

### Q5. How does runtime readiness appear in React and SSR?

Selected outcome: `FlowProvider` uses a private synchronous readiness store for pending, ready,
failed, and disposed states, throws acquisition/disposal failures during render, and gives
`useSyncExternalStore` an immutable server snapshot. SSR preloads in one request runtime, then
renders from a second mutation-free runtime constructed from the resulting boot.

This runtime bootstrap condition is not a user-authored machine `LOADING` state. Machine
states continue to describe application behavior.

### Q6. What is the exact observer sharing policy?

Selected outcome: equality remains private; recursive structural sharing applies to acyclic
arrays and plain records, while functions, classes, and cycles compare by identity. A selector
exception is memoized for that actor revision and evaluation resumes on the next revision.

### Q7. What is the disposal publication contract?

Selected outcome: disposal stops admission, awaits and classifies every finalizer, publishes one
observable terminal disposed snapshot, then completes observers. Disposal is idempotent and
non-abortable from Flow's ownership perspective; React rejects a disposed runtime rather than
reviving it.

### Q8. How are controlled endpoint and fixture identities validated?

Selected outcome: story graphs retain fixture definitions by object identity in first-seen order,
while fixture and controlled endpoint authored IDs occupy named compile-time namespaces; duplicate
IDs reject before Layer/runtime acquisition even when definitions differ structurally.

### Q9. What is the story-run cancellation result?

Selected outcome: host cancellation stops later commands, captures completed checkpoints plus
`atFailure`, awaits non-abortable cleanup, and rejects with `FlowStoryExecutionError` preserving
execution and cleanup Causes; successful product failures remain ordinary evidence without a
parallel Flow-owned status union.

### Q10. Does inspection retain complete turn history or a bounded projection?

Selected outcome: one immutable post-publication `TurnRecord` feeds live inspection, receipts,
traces, and CLI projections. Runtime history is opt-in through sinks; the bounded buffer drops the
oldest record deterministically and records the exact truncated prefix, while boot stores no history.

### Q11. Which app surfaces are roots and which are merely reachable?

Selected outcome: modules declare public root machines and views, AppPlan infers the reachable
closure, `runtime.actor(machine)` accepts only an automatic root, and `runtime.createActor`
accepts only statically reachable non-root machines. Stable-ID lookup resolves any live durable
incarnation but never creates, adopts, or revives it.

### Q12. What is the contract for scoped remote leases?

Selected outcome: a child actor owns the runbook remote lease and its activity Scope; no new
operation kind or scoped-resource stream constructor is added. Completion, replacement,
interruption, parent/runtime disposal, and cleanup failure follow the managed-child terminal matrix.

## Target architecture

### Pure application compiler

Compile vocabulary, descriptors, tokens, canonical IDs, root machine/view bindings,
transitive reachability, collision diagnostics, and inferred Effect requirements into one
inert `AppPlan`. Compilation runs no Effect and registers nothing globally.

### Managed runtime

Construct one Effect `ManagedRuntime`; do not add a second top-level Scope beside it. The
Layer builds the resource kernel, actors, observers, and supervisors. Root actor handles
exist synchronously while early dispatch fibers wait on the same lazy Layer acquisition.
Runtime disposal closes the ManagedRuntime and all descendants exactly once.

### Actor engine

Each actor owns an unbounded mailbox Queue, one consumer, one
`SubscriptionRef<ActorSnapshot>`, command Deferreds, and supervised activities. Planning
and redirect stabilization are pure. Reconciliation interprets the resulting commands,
and every command publishes one snapshot before acknowledgment. Async completion always
returns through the mailbox with its exact ref and generation.

### Resource kernel

One `SubscriptionRef<StoreState>` contains authoritative bases, lookup generations,
ordered optimistic overlays, store revision, and changed refs. `FiberMap` owns lookup
replacement. `RcMap` owns scoped machine leases and idle GC only; it is not the canonical
data store and `RcMap.invalidate` is not Flow invalidation.

RcMap expiry finalizers require a lease epoch. RcMap removes an expired entry before
closing its Scope, so a new owner can arrive while the old finalizer is evicting. The
finalizer may remove data only through `evictIfLeaseEpoch(ref, token)`.

### Activities and operations

Use `FiberMap` for keyed replace/cancel-previous, `FiberSet` for concurrent work, and a
per-declaration Queue with one supervised worker for serialized work. Do not depend on the
Effect v4 beta's `startImmediately` option; its current `FiberMap.run` and `FiberSet.run`
implementations do not forward the option.

### Views and React

Views are machine-bound pure selectors over one immutable actor snapshot. A hook-local
`MachineObserver` reads the snapshot synchronously, applies internal structural sharing,
and gives `useSyncExternalStore` one subscription path. React never owns actors, resources,
cache leases, retries, freshness, Suspense, or operation state.

### Stories and models

One immutable story AST and one scoped runner replace all three harness families. The
runner creates a real Flow runtime with fixture Layers and Effect `TestClock`, interprets
acknowledged commands, and returns immutable named checkpoints. The pure model consumes the
same event plan without running Effect programs; `path.story` is the live runtime proof.

### Artifacts, server, inspection, and CLI

Private Schema-v2 envelopes use `Schema.decodeUnknownEffect` and `Schema.encodeEffect` and
preserve typed decoding failures. Server requests create request-scoped runtimes and preload
through root-machine events. Inspection and CLI consume the compiled app graph, committed
TurnRecords, registered stories, and the same artifact codecs.

## Effect v4 primitive map

| Flow responsibility        | Effect v4 substrate                                                 | Constraint                                                          |
| -------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Runtime and Layer lifetime | `ManagedRuntime`, `Layer.effect`, `Layer.mergeAll`, `Layer.provide` | Do not create a competing top-level Scope.                          |
| Actor mailbox              | `Queue.unbounded`, one consumer                                     | Drain/fail acknowledgments before `Queue.shutdown`.                 |
| Command acknowledgment     | `Deferred`                                                          | Completes after one published turn, not async operation settlement. |
| Actor snapshot             | `SubscriptionRef<ActorSnapshot>`                                    | One immutable publication per acknowledged command.                 |
| Resource store             | `SubscriptionRef<StoreState>`                                       | Keep revision and changed refs inside the state.                    |
| Cancel-previous activity   | `FiberMap`                                                          | Keep Flow generation checks for authoritative commits.              |
| Concurrent activity        | `FiberSet`                                                          | Run each activity as `Effect.scoped`.                               |
| Serialized activity        | `Queue` plus one supervised worker                                  | Define capacity and admission explicitly.                           |
| Resource lease and GC      | `RcMap`                                                             | Lease epoch protects reacquisition from old finalizers.             |
| Freshness and timers       | `Clock.currentTimeMillis`, `Effect.sleep`                           | Tests use the same code under `TestClock`.                          |
| Story time                 | `TestClock.layer`, `TestClock.adjust`                               | No wall-clock sleeps in deterministic stories.                      |
| Completion and cleanup     | `Effect.exit`, `Effect.onExit`, full `Cause`                        | Do not use `Effect.result` for defects or interruption.             |
| Host event sources         | `Stream.fromEventListener`                                          | Avoid callback-owned `Effect.runSync`.                              |
| Boot and artifacts         | `Schema.decodeUnknownEffect`, `Schema.encodeEffect`                 | Preserve `SchemaError` in the typed channel.                        |
| Immutable indexes          | TypeScript or `HashMap`                                             | Compilation remains pure.                                           |

Effect `Cache` should not be the canonical resource store. It owns lookup result caching
and TTL, but it does not model passive actor snapshots, optimistic overlays, machine
ownership, or separate stale and GC lifetimes.

## Public export disposition

### Root `flow-state`

Keep and redesign `flow.vocabulary`, `flow.machine`, `flow.resource`, `flow.transaction`,
`flow.stream`, `flow.child`, `flow.ensure`, `flow.observe`, `flow.refresh`,
`flow.invalidate`, `flow.run`, `flow.can`, `flow.view`, `flow.module`, `flow.app`, and
`flow.runtime` around the compiled graph and exact refs.

Delete or internalize `after`, `patch`, `outcomes`, `store`, `orchestrators`, `selectView`,
the global resource registry, mutable production seeding/hydration/patching, and exported
internal service types. Reconsider `createKey` and `createTag`; resource and transaction
key projections should return canonical key input directly, and invalidation tags need one
consistent `flow.tag` surface or removal.

### `flow-state/react`

Keep `FlowProvider`, synchronous command-only `useActor`, and machine-bound `useView`.
Delete `useResource`, `resource-source`, the actor shell, hook comparators, and direct
resource/transaction lifecycle hooks.

### `flow-state/testing`

Keep the capabilities behind `story`, `fixture`, `control`, `checkpoint`, and `model`.
Delete or consolidate `test`, `flowTest`, `runFlowScenario`, `scenarioToReport`, controlled
stream mutation, mutable live-harness access, parallel evidence types, and runner-specific
debug formatters.

### `flow-state/server`

Keep one request-scoped runtime helper, changed to accept app, Layer, and optional boot.
Server preload must send root-machine events and observe the root rather than call services
and mutate resource internals directly.

### `flow-state/inspect` and CLI

Keep graph, transition, behavior, trace, artifact, and rendering capabilities, but rebuild
them over `AppPlan`, `TurnRecord`, registered stories, and Schema-v2 artifacts. Consolidate
parallel renderers and remove arbitrary event-payload fabrication.

## Cleanup candidates

### Library files and systems

- Remove `packages/flow-state/src/react/use-resource.ts` and
  `packages/flow-state/src/react/resource-source.ts`.
- Replace the actor shell in `packages/flow-state/src/react/use-actor.ts`.
- Consolidate `testing/test.ts`, `testing/flow-test.ts`,
  `testing/flow-test-builder.ts`, `testing/flow-stories.ts`,
  `testing/flow-story-test.ts`, `testing/focused-app.ts`,
  `testing/scenario-evidence.ts`, and the public runtime-backed harness.
- Remove the controlled-stream runtime and replace it with per-run Queue or Deferred
  fixture controls.
- Replace `core/scheduling/ready-work.ts`, `utils/fifo-queue.ts`, and
  `core/runtime/owned-effect-runner.ts` with the selected Effect primitives.
- Delete `core/api/resource-runtime.ts` after app-owned ref resolution lands.
- Derive trace projections from committed TurnRecords instead of a separate mutable
  `TraceLog`.
- Remove `@tanstack/store` after actor and resource publication use `SubscriptionRef`.
- Delete source-text architecture tests that assert filenames or token strings; replace
  them with inference, race, interruption, lifetime, and artifact round-trip proofs.

### Examples

Maintain three proving applications:

1. **Todo Essentials** merges basic cached posts and optimistic transactions and proves the
   ordinary resource, transaction, machine, view, React, fixture, story, and TestClock path.
2. **Incident Console** remains the flagship for multiple refs, transaction conflicts,
   streams, pressure, children, scoped remote cleanup, inspection, diagnostics, and browser
   lifecycle.
3. **Hydrated Offline Notes** merges server prefetch and offline recovery and proves request
   isolation, root-machine preload, v2 boot, first-render consistency, persisted outbox,
   reconnect drain, and disposal.

Move bounded-feed aggregation into a package contract fixture. Keep React 18/19 and
isolated-module proofs as packed-consumer/type fixtures rather than showcased apps. Delete
`examples/FEATURE_COVERAGE.md`; compiled stories and package contract tests should prove
coverage instead of a hand-maintained second specification.

## Required proof tests

- An event sent before asynchronous Layer acquisition completes is processed exactly once;
  typed acquisition failure reaches readiness observers and all waiting dispatches.
- Actor disposal drains or fails mailbox acknowledgments, interrupts every owned activity,
  runs finalizers exactly once, and is idempotent.
- Reentrant sends preserve mailbox order and every acknowledged command publishes exactly
  one immutable snapshot.
- An older resource or transaction generation can never commit after a newer one.
- Two parameterized refs from one descriptor family remain distinct everywhere.
- Two actors can run the same transaction ref without generation collision, while shared
  resource lookup generation remains store-global.
- React/view subscribe, unsubscribe, rerender, and Strict Mode behavior never changes
  resource leases, refresh, stale time, or GC time.
- RcMap release and exact-deadline reacquisition cannot let an old finalizer evict newly
  owned data; cover `gcTime: 0` and infinite GC.
- Placeholder data exists only during the active lookup projection and never becomes a
  canonical resource base.
- Overlapping optimistic transactions preserve overlay order and remove only their own
  generation on every terminal outcome.
- Success invalidates canonical data unless an explicit authoritative response mapping is
  used.
- Typed failure, defect, mixed Cause, and interruption-only results project to distinct
  lanes while retaining the original Cause for inspection.
- A late `SubscriptionRef` consumer receives the latest store state; every revision carries
  an ordered deduplicated immutable changed-ref vector, and revision jumps force a full reread.
- Boot is decoded before root activity starts, incompatible app or definition versions are
  rejected, and v2 artifacts round-trip.
- Effect `TestClock` drives timers, stale time, GC, and serialized activities without
  wall-clock sleeps.
- Story `.send().checkpoint()` captures the acknowledged event turn without silently
  flushing later operation completion.
- Pure model code has a structural and behavioral prohibition on `Effect.run*`; the
  corresponding `path.story` proves the live Effect path.
- React 18 and 19 observers survive readiness, subscribe/unsubscribe races, SSR server
  snapshots, and Strict Mode without leaking fibers or rendering split snapshots.

## Implementation order

1. Use the locked B1-B12 resolutions now promoted into the implementation contracts.
2. Compile vocabulary, durable refs, app graph, identity validation, and inferred
   requirements without executing Effect.
3. Build the ManagedRuntime boundary, immutable boot path, actor Queue, acknowledgments,
   TurnPlan/CommitPlan protocol, and atomic snapshot publication.
4. Replace the resource and transaction kernels with exact refs, SubscriptionRef state,
   FiberMap generations, RcMap leases, TestClock-driven time, and the global overlay ledger.
5. Connect MachineObserver, `FlowProvider`, synchronous `useActor`, and bound `useView`.
6. Consolidate story, fixture, control, checkpoint, and model execution onto the same actor
   engine.
7. Migrate Schema-v2 boot/trace/behavior artifacts, inspection, server support, and CLI.
8. Consolidate the examples, remove obsolete exports and utilities, and run package,
   packed-consumer, React 18/19, example, browser, and full workspace gates.
