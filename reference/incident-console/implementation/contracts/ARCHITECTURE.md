# vNext runtime architecture

This contract assigns ownership to the pure compiler, the single Effect runtime, actor
engines, the shared resource kernel, and host adapters. Components MUST NOT reproduce one
another's state or lifetime machinery.

## Pure application compiler

### ARCH-001 — AppPlan is inert and closed-world

`flow.app({ id, persistenceVersion, modules })` MUST synchronously compile vocabulary,
descriptor definitions, tokens, root machines and views, transitive reachability, canonical
IDs, durable ref resolution, and inferred Effect requirements into one immutable `AppPlan`.
Compilation MUST execute no Effect, acquire no resource, and mutate no global registry.

### ARCH-002 — Application identity is explicit

The app ID MUST be explicit and collision-free. Root actor identity MUST be
`${app.id}/root/${machine.id}` and MUST NOT depend on module order or property names. One
root machine may be owned by only one module. Distinct definitions claiming any globally
addressed ID MUST be rejected app-wide; the same definition object MAY be reachable through
multiple graphs.

### ARCH-003 — Roots and reachability are distinct

Module machines are public `Input = void` roots and module views are public root-bound read
entries. Resources, transactions, streams, children, services, and reusable machines are
inferred transitively. Unreachable definitions MUST be diagnosed.
`runtime.actor(machine)` addresses roots only; dynamic creation accepts only reachable
machines.

### ARCH-004 — AppPlan owns serialized descriptor resolution

In-process refs MAY retain their definition privately, but a serialized descriptor ID MUST
resolve through the runtime's `AppPlan`. Process-global descriptor or app registries are
forbidden because they break multiple-runtime, test, and hot-reload isolation.

### ARCH-005 — Effect requirements propagate without erasure

The hidden `R` of every resource, transaction, stream, and reachable child machine MUST
flow through machine, module, and app types. `flow.runtime` MUST constrain its application
Layer to provide the entire inferred environment. Layer acquisition errors remain runtime
readiness failures; descriptor `E` values remain operation outcomes.

### ARCH-006 — Machine construction uses typed input

A machine definition MUST infer `Input`, `Memory`, event vocabulary, states, and reachable
requirements. Its initializer is `memory: ({ input }) => Memory`. Automatic roots require
`Input = void`; dynamic instances and child declarations provide typed input. Restoration
uses materialized memory rather than replaying input.

## Managed runtime boundary

### ARCH-007 — One ManagedRuntime owns the graph

`flow.runtime({ app, layer?, boot? })` MUST create exactly one Effect `ManagedRuntime` from
Flow's internal Layer and, when required, the application Layer. The application Layer MAY
be omitted only when the compiled app requirements are `never`. Flow MUST NOT add a
competing top-level Scope, custom Layer memoization, or a parallel finalizer registry.
ManagedRuntime disposal closes all descendants exactly once.

### ARCH-008 — Boot precedes root activation

The runtime constructor MUST decode, validate, and normalize Flow-owned boot structure before
any root activity starts. Application code MUST migrate and validate opaque domain values
before passing the payload to the runtime. The constructor MAY synchronously expose root
handles and pure initial or hydrated snapshots while Layer acquisition is pending. Mutable
post-start hydration is forbidden.

### ARCH-009 — Early dispatch enters the real mailbox before the shared Layer build

The runtime constructor MUST create each actor's one Effect Queue before exposing its handle.
Public `send` MUST synchronously use `Queue.offerUnsafe` on that real unbounded Queue, so calls
made before acquisition retain FIFO order without a no-op shell or separate JavaScript
buffer. The one Queue consumer MUST be forked through ManagedRuntime; it waits on the shared
Layer build before interpreting commands. Package-private acknowledged dispatch MUST offer to
the same Queue through Effect. Acquisition failure MUST close admission, fail acknowledged
waiters, and reach readiness without executing queued commands.

### ARCH-010 — Runtime construction always names app and Layer

The public zero-argument runtime constructor is forbidden. Production, request, story, and
test runtimes all provide an app and provide a Layer whenever its compiled requirements are
not `never`; fixture and test services are installed only through the corresponding Layer.

### ARCH-011 — Host callbacks reenter managed ownership

Host signals and event sources MUST enter through a scoped Effect stream or runtime-owned
Queue. A callback MUST NOT call `Effect.runSync` to mutate runtime state, because that can
publish reentrantly outside managed ownership. The browser host-signal adapter MUST register
listeners with `Effect.acquireRelease`, synchronously offer immutable focus/online facts to
one internal Queue, and let its ManagedRuntime-owned consumer apply policy. Non-browser and
story hosts install private static or controlled sources; no host-signal mutator is public.

## Actor and store components

### ARCH-012 — ActorEngine owns mailbox and snapshot publisher

Each actor engine owns one unbounded Queue, one consumer, one
`SubscriptionRef<ActorSnapshot>`, acknowledged-command Deferreds, a pure planner, a
reconciler, and supervised activities. Async completions carry exact identity and generation
back into the mailbox.

### ARCH-013 — StoreKernel owns one SubscriptionRef

One `SubscriptionRef<StoreState>` owns authoritative resource bases, lookup generations,
ordered optimistic overlays, revision, and changed refs. Store mutation and replaying
publication MUST occur through one `SubscriptionRef.modify` or `modifyEffect`; a
`SynchronizedRef + PubSub` split is forbidden.

### ARCH-014 — RcMap owns leases and GC only

RcMap is the scoped lease table for exact resource refs and their idle-GC deadlines. It is
not the data store, and `RcMap.invalidate` is not Flow invalidation. Activity acquisition
MUST call `RcMap.get` inside its Scope. Eviction finalizers MUST carry a lease epoch before
they can modify StoreState.

### ARCH-015 — Fiber ownership follows concurrency semantics

FiberMap owns keyed cancel-previous work, FiberSet owns independent concurrent work, and a
per-key Queue with one supervised worker owns serialized work. Flow generation tokens remain
authoritative publication guards even after fiber interruption.

### ARCH-016 — Beta.86 startImmediately is not a contract

Effect 4.0.0-beta.86 declares `startImmediately` on `FiberMap.run` and `FiberSet.run`, but
their implementations do not forward it to `runForkWith`. No correctness, ordering, or test
MUST depend on that option.

### ARCH-017 — Public actor API separates command and evidence

`actor.send(event): void` is the synchronous command surface. `getSnapshot()` and
`actor.snapshots` are the synchronous and streaming evidence surfaces. A package-private
acknowledged dispatch is reserved for stories and internal orchestration; public code MUST
NOT receive the Deferred.

## React, stories, and inspection

### ARCH-018 — Runtime readiness uses a minimal external store

Because `SubscriptionRef.make` is effectful, the React provider MAY own one tiny synchronous
immutable external store for runtime acquisition state only. It MUST NOT own actor commands,
machine state, resources, retries, or leases. Browser app runtimes are created outside React
bootstrap; request and story runtimes remain scope-owned.

### ARCH-019 — MachineObserver is the only React subscription path

An observer reads one immutable actor snapshot, evaluates one authored view, applies the
fixed SEM-026 sharing policy, and exposes one `useSyncExternalStore` subscription. React
hooks MUST remain passive and MUST NOT subscribe directly to StoreState or primitive
lifecycle controllers.

### ARCH-020 — Stories run the real scoped architecture

One immutable story AST and one scoped runner MUST acquire the real Flow runtime, fixture
Layer, root or dynamic actor, and Effect TestClock. Story commands use acknowledged actor
dispatch. The runner MUST dispose on success, execution failure, cancellation, and cleanup
failure.

### ARCH-021 — Pure model exploration never executes production Effects

The pure model MAY consume event plans and fixture-declared outcomes, but it MUST contain no
`Effect.run*`, transaction commit, or stream subscription. `path.story.run()` is the live
Effect proof for the same authored path.

### ARCH-022 — TurnRecords feed explicit sinks

After actor publication, one immutable TurnRecord MUST feed receipts, inspection, trace,
CLI, or artifact-export sinks. The runtime MUST NOT maintain separate mutable histories for
those projections. `createInspectionBufferSink` owns a bounded observational buffer, not
runtime truth.

### ARCH-023 — Existing child and stream ownership cover remote leases

A lease with behaviorally visible phases belongs in a child actor. A purely operational
continuing lease MAY use `Effect.acquireRelease` within a scoped stream activity. No new runtime
primitive, lifetime registry, or hidden cancellation channel is permitted.

## Effect API constraints

### ARCH-024 — Service-free primitives bootstrap synchronously, then become managed

`Queue.make` and `SubscriptionRef.make` are effectful but requirement-free and complete
synchronously in Effect v4. The runtime constructor MAY execute those constructors once with
`Effect.runSync` to establish real mailboxes and replay-one snapshot stores before returning
synchronous handles. This exception applies only to construction; host callbacks MUST NOT
run Effects synchronously or mutate actor state directly. Queue consumers, store commands,
subscriptions, and shutdown remain descendants of the one ManagedRuntime.

### ARCH-025 — Queue shutdown follows acknowledgment settlement

Effect Queue shutdown discards buffered messages. Actor disposal MUST therefore drain or
fail every buffered command Deferred before calling `Queue.shutdown`.

### ARCH-026 — Exit and Cause remain intact internally

Operation and cleanup fibers MUST use `Effect.exit`, `Effect.onExit`, and full Cause
inspection. `Effect.result` is insufficient because defects and interruptions escape it;
`Cause.squash` is lossy and belongs only at a host throw or rejection boundary.
