# vNext runtime architecture

This contract assigns ownership to the pure compiler, the single Effect runtime, actor
engines, the shared resource kernel, and host adapters. Components MUST NOT reproduce one
another's state or lifetime machinery.

## Pure application compiler

### ARCH-001 — AppPlan is inert and closed-world

`flow.app({ id, persistenceVersion, modules, dynamicMachines? })` MUST synchronously compile
definitions, tokens, root machines and views, statically admitted dynamic machines,
machine-local activity bindings, their transitive child-machine closure, canonical IDs, durable
ref resolution, and inferred Effect requirements into one immutable `AppPlan`. Compilation MUST
execute no Effect, acquire no resource, and mutate no global registry.

`dynamicMachines`, when present, MUST be an exact readonly tuple of already-declared machine
values. It is an admission seed only: it MUST NOT create an actor, supply actor input or identity,
register a factory, add a root, or permit runtime graph mutation. The compiler MUST deduplicate a
repeated identical machine value and reject distinct admitted values that collide by definition or
machine identity.

Callbacks may materialize only refs whose descriptor is already admitted by an explicit binding
or graph seed in AppPlan. A callback result cannot expand reachability; an out-of-plan ref is
rejected before any actor or StoreState mutation. VNext adds no static dependency tuple until an
ordinary application proves callback-only reachability is necessary.

### ARCH-002 — Application identity is explicit

The app ID MUST be explicit and collision-free. Root actor identity uses GLO-08's canonical
length-prefixed `root` encoding and MUST NOT depend on module order or property names. One
root machine may be owned by only one module. Distinct definitions claiming any globally
addressed ID MUST be rejected app-wide; the same definition object MAY be reachable through
multiple graphs.

### ARCH-003 — Roots and reachability are distinct

Module machines are public `Input = void` roots and module views are public root-bound read
entries. The app's optional `dynamicMachines` tuple is the only additional public seed: it admits
machine families that a host may instantiate without turning them into automatic roots. Resources,
transactions, streams, services, and reusable machines otherwise become reachable through
machine-local activity bindings, recursively including child machine bindings. Every root and
dynamic seed contributes its complete reachable closure and Effect requirements. Views validate
against that closure and MUST NOT expand it by reading a ref. Compilation diagnoses foreign
references inside the presented closure, not unseen definition objects. `runtime.actor(machine)`
addresses roots, while `runtime.actor(machine, { id })` looks up any live durable
dynamic actor; dynamic creation accepts a root, an explicit dynamic seed, or another machine in
the compiled closure and rejects every other object as `UnreachableMachine`.

Modules MUST remain roots-and-views-only. A module MUST NOT gain a dynamic-machine inventory,
actor factory, input registry, or startup policy merely to make a machine host-admissible.

### ARCH-004 — AppPlan owns serialized descriptor resolution

In-process refs MAY retain their definition privately, but a serialized descriptor ID MUST
resolve through the runtime's `AppPlan`. Process-global descriptor or app registries are
forbidden because they break multiple-runtime, test, and hot-reload isolation.

### ARCH-005 — Effect requirements propagate without erasure

The hidden `R` of every resource, transaction, stream, and reachable child machine MUST flow
through machine, module, and app types. An app MUST include the complete requirements of every
root and every explicit dynamic-machine seed, even when no instance of a dynamic machine is ever
created. `flow.runtime` MUST constrain its application Layer to provide the entire inferred
environment after removing Flow-owned `Scope.Scope`. Descriptor types retain raw `R`, while
`RequirementsOf` reports only services the application Layer supplies. Layer acquisition errors remain runtime readiness failures; descriptor `E` values
remain operation outcomes.

### ARCH-006 — Machine construction uses typed input

A definition MUST infer `Input`, `Memory`, events, and states before its machine callback is
contextually typed. Its pure initializer is `memory: ({ input }) => Memory`. A machine adds
transition behavior, activity bindings, and reachable requirements without redefining that
static shape. Automatic roots require `Input = void`; dynamic instances and child declarations
provide typed input. Restoration uses materialized memory rather than invoking the initializer.

## Managed runtime boundary

### ARCH-007 — One ManagedRuntime owns the graph

`flow.runtime({ app, layer?, boot? })` MUST create one FlowRuntimeShell and exactly one Effect
ManagedRuntime. FlowRuntimeShell owns only the non-scoped Queue and SubscriptionRef cells
required before the synchronous handle returns. ManagedRuntime owns Flow's internal Layer,
the optional application Layer, every Scope, consumer fiber, activity, and finalizer. The
application Layer MAY be omitted only when requirements are `never`. Flow MUST NOT add a
competing top-level Scope, custom Layer memoization, or parallel finalizer registry.

### ARCH-008 — Boot precedes root activation

The package-private BootCoordinator MUST synchronously decode and validate Flow-owned boot
structure with its service-free v2 boot Schema and install one PreparedBoot before root activity.
Application code migrates and validates opaque domain values first. Resource normalization
is supplied by StoreKernel; transaction and overlay normalization are supplied by the
transaction kernel; the artifact boundary reuses the boot codec and MUST NOT implement a
second hydration path. The constructor MAY expose root handles and prepared snapshots while
Layer acquisition is pending. Mutable post-start hydration is forbidden.

### ARCH-009 — Early dispatch enters the real mailbox before the shared Layer build

The runtime constructor MUST create each actor's one Effect Queue before exposing its handle.
After installing the prepared snapshot, it MUST synchronously preseed restored pending-outcome IDs
in stable sequence order and then one boot-activation barrier command; a fresh actor preseeds only
the barrier. Only then may its handle escape.
Public `send` MUST synchronously use `Queue.offerUnsafe` on that real unbounded Queue, so calls
made before acquisition retain FIFO order without a no-op shell or separate JavaScript
buffer. The one Queue consumer MUST be forked through ManagedRuntime; it waits on the shared
Layer build before interpreting commands. It drains restored outcomes, then the barrier activates
current desired ownership, then any early host commands. Package-private acknowledged dispatch MUST offer to the same Queue through Effect. Acquisition failure MUST close admission, fail acknowledged
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
`SubscriptionRef<ActorState>`, acknowledged-command Deferreds, a pure planner, a reconciler, and
supervised activities. `ActorState` contains the public immutable `ActorSnapshot` plus private
durable binding cursors and pending outcomes; `getSnapshot()` and `actor.snapshots` project only
its public snapshot. Async completions carry exact identity and generation back into the mailbox.
Activity starts and releases are staged during CommitPlan interpretation
and enacted only by a package-private post-commit reconciliation fact queued after publication
and before command acknowledgment. These implementation types and TurnPlan/CommitPlan MUST remain
package-private.

The boot-activation barrier is the only exception: after its publication/evidence boundary, the
consumer enacts restored desired ownership as a nonblocking continuation before taking the next
Queue item, so early host commands cannot overtake activation. Ordinary turns retain the queued
post-commit fact and explicit flush boundary.

The actor engine also owns its package-private durable `PendingOutcome` map. The same commit that
advances an activity emission cursor or finite consumed fact MUST add the materialized mapped
event to that map; post-publication logic offers only its stable ID to the mailbox. Consuming the
event removes the record in the event turn. The map and public snapshot MUST change through one
`ActorState` modification, never two mutable owners. Boot restores the map before scheduling those
IDs and never persists Queue internals. Newly admitted IDs are offered after TurnRecord acceptance
and before causal command acknowledgment.

A computed invalidation selector MUST run only during pure machine planning. Reconciliation
materializes its readonly `InvalidationTarget` list or `null`; `null` owns nothing, while a
concrete list is canonically deduplicated, an empty vector normalizes to no binding, and a
non-empty vector becomes the finite binding identity and one atomic StoreKernel command for that
activation generation. The StoreKernel receives only materialized
exact refs and nominal tags and MUST NOT receive or retain the user selector.

### ARCH-013 — StoreKernel owns one SubscriptionRef

One `SubscriptionRef<StoreState>` owns authoritative resource bases, lookup generations,
ordered optimistic overlays, revision, and changed refs. Store mutation and replaying
publication MUST occur through one `SubscriptionRef.modify` or `modifyEffect`; a
`SynchronizedRef + PubSub` split is forbidden. StoreKernel returns commit revision, changed
refs, and projections but MUST NOT invoke actors.

### ARCH-013A — StoreFanout owns cross-actor notification

A package-private StoreFanout coordinator owns the live actor-mailbox registry. For an
actor-originated commit, it MUST hold fanout until the initiating snapshot is published, its
TurnRecord is accepted by the hub, and its acknowledgment completes. It then offers one
revision fact to every other live actor Queue. Actors MUST NOT subscribe directly to
StoreState. StoreFanout, StoreState, and the TurnRecord hub MUST remain package-private.

### ARCH-013B — DehydrateBarrier excludes half-published store commits

A package-private DehydrateBarrier MUST be shared by StoreKernel commit windows and runtime
capture. It prevents capture from reading StoreState between an actor's store commit and actor
publication without globally freezing unrelated state-only actor turns. A successful capture
uses one StoreState revision, stable actor registry leases, and the WIRE-009 revision checks;
the barrier itself is not a public consistency or transaction API.

### ARCH-014 — RcMap owns leases and GC only

RcMap is the scoped lease table for exact resource refs and their idle-GC deadlines. It is
not the data store, and `RcMap.invalidate` is not Flow invalidation. Activity acquisition
MUST call `RcMap.get` inside its Scope. Eviction finalizers MUST carry a lease epoch before
they can modify StoreState.

### ARCH-015 — Fiber ownership follows concurrency semantics

FiberMap owns keyed `cancel` replacement work, FiberSet owns independent `allow` work, and a
per-key Queue with one supervised worker owns `serialize` work. Flow generation tokens remain
authoritative publication guards even after fiber interruption.

Store-global resource lookup is the ownership exception: StoreKernel's runtime Scope owns one
exact-ref FiberMap generation and its temporary in-flight lease, while each actor Scope owns only
its registration and RcMap activity lease. Releasing the first actor cannot interrupt joined work;
the StoreKernel generation may settle and warm canonical data after every registration releases,
while only exact-ref generation replacement or runtime disposal cancels it.

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

Pure exploration MUST start from a command-empty base story. Each traversal call MUST supply
and own its candidate events; neither the base story nor a fixture may contribute candidates.
A fixture MAY contribute immutable static seeds only. The pure model MUST contain no
`Effect.run*`, transaction commit, or stream subscription. `path.story.run()` is the live
Effect proof for the traversal-produced path.

### ARCH-022 — TurnRecords feed explicit sinks

Before StoreState mutation, ActorEngine MUST acquire the hub's runtime-global commit permit and
reserve/preflight the next evidence sequence. It holds the permit through actor publication and
hub acceptance, so overflow fails precommit and concurrent actors cannot publish sequence order
out of order. After actor publication, one immutable TurnRecord MUST be accepted by the runtime
TurnRecord hub before command acknowledgment. The hub uses the reserved sequence, queues it
with a package-private release gate, and returns without invoking sinks inline. Sink workers await
that gate. The actor completes any command acknowledgment, opens the gate, and releases
StoreFanout in that order; commands without a Deferred open it at the same conceptual boundary.
After the gate opens, receipt, inspection, trace,
CLI, or artifact-export sinks MAY process it; sink processing and failure MUST NOT block
StoreFanout or mutate committed state. The runtime MUST NOT maintain separate mutable
histories. `createInspectionBufferSink` owns a bounded observational buffer, not runtime
truth.

### ARCH-023 — Existing child and stream ownership cover remote leases

A lease with behaviorally visible phases belongs in a child actor. A purely operational
continuing lease MAY use `Effect.acquireRelease` within a scoped stream activity. No new runtime
primitive, lifetime registry, or hidden cancellation channel is permitted.

## Effect API constraints

### ARCH-024 — RuntimeShell bootstraps service-free cells synchronously

`Queue.make` and `SubscriptionRef.make` are effectful but requirement-free and complete
synchronously in Effect v4. FlowRuntimeShell MAY execute those constructors once with
`Effect.runSync` before returning synchronous handles and owns the resulting non-scoped cells
for their whole lifetime. This exception applies only to construction. ManagedRuntime owns
their consumers and all Effectful execution; host callbacks MUST NOT run Effects
synchronously or mutate actor state. Shell disposal settles acknowledgments and closes the
cells exactly once after managed consumers stop.

Pre-readiness acquisition failure/disposal is the one terminalization exception: because pinned
ManagedRuntime does not start even requirement-free `runFork` bodies before its Context resolves,
the shell may synchronously compare-and-set terminal state, complete buffered Deferreds with their
failure, publish/close the terminal SubscriptionRef/PubSub through service-free runSync operations,
drain/shutdown Queues, and expose no user callback. After readiness, the ordinary managed actor
cleanup path owns terminal publication.

### ARCH-024A — Internal runtime concepts stay private

AppPlan, StoreState, ActorState, TurnPlan, CommitPlan, TurnRecord, StoreFanout, the TurnRecord hub,
PendingOutcome, and MachineObserver MUST remain package-private. Public APIs expose definitions, commands,
snapshots, views, boot payloads, and inspect projections without exposing runtime owners.

### ARCH-025 — Queue shutdown follows acknowledgment settlement

Effect Queue shutdown discards buffered messages. Disposal MUST therefore begin through an out-of-
band RuntimeShell compare-and-set rather than a Queue command, close admission immediately, race a
pending readiness wait with that signal, interrupt/await the consumer, fail its current and every
drained buffered command Deferred, and only then call `Queue.shutdown`. This path must work even
when Layer acquisition never completes.

### ARCH-026 — Exit and Cause remain intact internally

Operation and cleanup fibers MUST use `Effect.exit`, `Effect.onExit`, and full Cause
inspection. `Effect.result` is insufficient because defects and interruptions escape it;
`Cause.squash` is lossy and belongs only at a host throw or rejection boundary.

### ARCH-027 — VNext keeps the executable graph and statechart scope closed

VNext machines are flat. Hierarchical compound states, parallel regions, shallow/deep history,
and their macrostep semantics are not implemented. Child actors and concurrent activities solve
ownership and work concurrency but MUST NOT be documented as equivalent statechart semantics.
Applications that need remembered navigation encode it explicitly in memory.

VNext runtimes cannot extend AppPlan after construction. A host may asynchronously import modules
before calling `app(...)` and `runtime(...)`, or create a separately scoped runtime for a lazy
application island. It cannot register a route module, service requirement, descriptor, root, or
dynamic machine into a running runtime.

VNext activity bindings materialize one resource ref, stream, or child per declaration. There is
no runtime-sized keyed collection reconciler, dynamic parallel/infinite binding, or per-member
outcome aggregation. Applications use statically repeated bindings or one application-owned
aggregate resource/stream until a future collection design defines membership, scopes, bounds,
outcomes, snapshots, and persistence together.

VNext exposes explicit inspection sinks and artifacts but no built-in browser/WebSocket inspector
transport. An application may forward sink projections to its own tool without changing runtime
ownership.
