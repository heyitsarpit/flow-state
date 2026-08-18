# vNext runtime architecture

This contract assigns ownership to the pure compiler, the single Effect runtime, actor
engines, the shared resource kernel, and host adapters. Components MUST NOT reproduce one
another's state or lifetime machinery.

## Pure application compiler

### ARCH-001 — AppPlan is inert and closed-world

`flow.app({ id, persistenceVersion, modules })` MUST synchronously compile the exact named machine
records into one flattened `App.M` catalogue, every listed machine's complete operation graph and
requirements, canonical IDs, durable descriptor resolution, and the compiled ownership and
reachability plan into one immutable `AppPlan`. Compilation MUST execute no Effect, acquire no
resource, create no actor, and mutate no global registry.

`App.M` MUST be the complete machine-admission catalogue. Declaring an operation makes it part of
the static plan without acquiring a resource, running a transaction, or subscribing to a stream;
the compiler MUST NOT scan callbacks to discover operations. A running runtime MUST NOT expand the
executable universe.

Every admitted machine's durable `id` MUST be unique within one `AppPlan`. Compilation MUST reject
two distinct machine values, or two authored machine entries, that claim the same durable machine ID
even when their `App.M` property names or module IDs differ. A machine family MUST have one tooling
owner in the compiled plan; duplicate ownership is a compile-time failure, not a runtime ambiguity.

Callbacks may materialize only operation plans and context bindings admitted by the compiled
machine definitions and exact graph. An out-of-plan machine, descriptor, or provider is rejected
before actor or StoreState mutation. The old `dynamicMachines` admission seed has no replacement.

### ARCH-002 — Application and actor identity are explicit

The app ID MUST be explicit and collision-free. A machine's explicit `id` remains its durable
machine and artifact identity, while an `App.M` property name is only an ergonomic catalogue and
TypeScript inference key. Module order and property names MUST NOT qualify machine, actor, or
persistence identity.

Every actor backed by machine `M` MUST carry one exact machine-branded `ActorRef<M>`. A stable ref
has an authored durable ID and identifies a shared actor; a local actor receives a generated opaque
runtime-local ref that is neither durable nor restorable. Refs are inert identities and carry no
input, context bindings, construction policy, ownership, subscription, or disposal authority.

### ARCH-003 — Modules and actor admission are distinct

`module({ id, machines })` MUST accept an exact keyed machine record and preserve each authored
property name. `app({ id, persistenceVersion, modules })` MUST accept an ordered array of
unaliased modules and flatten their records into one exact `App.M`; duplicate machine property
names across modules MUST be rejected. App compilation creates zero actor instances, and a listed
machine MUST NOT become an automatic root.

Every local actor creation, shared actor registration, and Story-local actor MUST use a machine in
`App.M`. `actorRef(machine, id)` creates an inert durable address; `runtime.ensureActor(ref, ...)`
is the restore-or-create owner boundary; `runtime.getActor(ref)` is lookup-only; and
`runtime.createActor(machine, ...)` always creates a fresh local actor without a stable ID. The
runtime MUST NOT accept `dynamicMachines`, `RootActor`, `DynamicActor`, `runtime.actor(machine)`,
or ID-bearing local creation.

The module ID MUST be unique within its app and is tooling identity for CLI slicing, trace and
inspection grouping, behavior artifacts, and module-scoped diffs only. It MUST NOT contribute to
machine identity, `App.M` keys, actor refs, actor persistence keys, context bindings, runtime
identity, or operation identity. Modules MUST NOT gain an actor factory, input registry, or startup
policy merely to make a machine host-admissible.

Renaming a module ID is artifact-breaking: the new build MUST use a different tooling group and
artifact path and MUST NOT silently compare or alias the old module section. The rename remains
runtime- and persistence-compatible because admitted machines, stable actor refs, restored actor
state, context bindings, and operation addresses do not contain the module ID; preserving history
requires explicit artifact migration. The compiled plan assigns one tooling owner to each admitted
machine family and rejects duplicate ownership; moving a machine between modules is artifact-breaking
but does not change runtime or persistence identity.

### ARCH-004 — AppPlan owns serialized descriptor and actor resolution

In-process refs MAY retain their definition privately, but a serialized descriptor ID and durable
stable actor ref MUST resolve through the receiving runtime's `AppPlan` and `App.M`. Operation
identity is descriptor ID plus canonical `K`; executable input `P` is retained by the live binding
and is not identity. Process-global descriptor, actor, or app registries are forbidden because they
break multiple-runtime, test, and hot-reload isolation.

### ARCH-005 — Effect requirements propagate without erasure

The hidden `R` of every resource, transaction, stream, and machine admitted by `App.M` MUST flow
through machine, module, and app types. The app MUST include the complete requirements of every
listed machine, even when no actor instance is created. `flow.runtime` MUST constrain its
application Layer to provide the entire inferred environment after removing Flow-owned
`Scope.Scope`. Descriptor types retain raw `R`, while `RequirementsOf` reports only services the
application Layer supplies. Layer acquisition errors remain runtime readiness failures; descriptor
`E` values remain operation outcomes.

### ARCH-006 — Machine construction uses typed input

A definition MUST own the static actor shape: input, events, state declarations, inherited
readonly context, memory initialization, and the closed named operation catalogue. Its pure
initializer is `memory: ({ input }) => Memory`, and it is the single inference source for `InputOf`
and `MemoryOf`; omitting the initializer argument fixes input to `void`. A machine adds transition
behavior, activity bindings, timers, redirects, context-to-event registrations, and reachable
requirements without redefining that static shape. Machine behavior does not receive the original
input after initialization. Restoration uses materialized memory rather than invoking the
initializer or replaying input.

## Managed runtime boundary

### ARCH-007 — One ManagedRuntime owns the graph

`flow.runtime({ app, layer?, boot? })` MUST create one FlowRuntimeShell and exactly one Effect
ManagedRuntime. FlowRuntimeShell owns only the non-scoped Queue and SubscriptionRef cells
required before the synchronous handle returns. ManagedRuntime owns Flow's internal Layer,
the optional application Layer, every Scope, consumer fiber, activity, and finalizer. The
application Layer MAY be omitted only when requirements are `never`. Flow MUST NOT add a
competing top-level Scope, custom Layer memoization, or parallel finalizer registry.

### ARCH-007A — Runtime phases are private and linearized

The runtime shell MUST own one private phase cell with the closed union
`constructed | booting | ready | failed | disposed`. `constructed` contains only the synchronous
service-free shell cells and immutable app/boot inputs. The phase MUST enter `booting` before boot
installation, Layer acquisition, or initial actor admission begins; it MUST enter `ready` only after
the graph is sealed, the application Layer is available, and attached actors have crossed their
activation barrier.

No attached actor handle or owner lease may escape before the instance graph is sealed; the inert
prepared React handle is the sole exception and is governed by ARCH-018. After graph sealing but
while the shared Layer is still acquiring, an already-attached actor MAY expose its real mailbox for
pre-readiness command admission; those commands remain queued and no user Effect starts before
`ready`. The runtime object itself exposes no phase union or second readiness API: existing readiness
and Effect-bridge surfaces observe this private phase.

Any boot or Layer failure moves the phase to `failed`, closes admission, and rolls back every owner,
context edge, actor registration, and queued acknowledgment in reverse acquisition order. Disposal
during `constructed` or `booting` wins the phase linearization, cancels bootstrap, performs the same
reverse rollback, and reaches `disposed`. `failed` rejects further actor admission; only cleanup may
still complete after the failed phase. A phase transition is published through the runtime-owned
readiness boundary and never through a user machine event.

### ARCH-008 — Boot precedes actor activation

The package-private BootCoordinator MUST synchronously decode and validate Flow-owned boot
structure with its service-free v2 boot Schema and install one PreparedBoot before actor activity.
Application code migrates and validates opaque domain values first. Resource normalization
is supplied by StoreKernel; transaction and overlay normalization are supplied by the
transaction kernel; the artifact boundary reuses the boot codec and MUST NOT implement a
second hydration path. Initial runtime construction MUST install and validate boot actors,
complete the production factory's initial `ensureActor` calls, resolve every exact
context-provider ref, reject missing, foreign, duplicate, and cyclic registrations, seal the
graph, and only then activate or expose public runtime and actor handles. Mutable post-start
hydration is forbidden.

If any bootstrap validation, Layer acquisition, initial ensure, provider resolution, or graph seal
step fails, the booting phase MUST close admission and roll back owners, dependency edges, actor
registrations, and queued acknowledgments in reverse acquisition order. No partially validated graph,
actor handle, external operation, or public lifecycle evidence may survive that rollback.

Dehydration MUST begin only between completed context-propagation waves and MUST capture a
context-closed cut. Included consumers record exact `contextBindings` refs and provider revisions;
hydration restores providers before consumers and installs derived context silently. A concurrent
mismatch fails with retryable `ConcurrentDehydrate`. An included durable consumer depending on an
opaque local provider fails with non-retryable `NonDurableContextProvider`; Flow MUST NOT promote,
recreate, substitute, or rebind that provider automatically.

### ARCH-009 — Attached actor dispatch enters the real mailbox before the shared Layer build

The runtime MUST create each attached actor's one Effect Queue before exposing its handle. The
initial graph seal in ARCH-008 precedes imperative handle escape; a prepared React actor is an
inert exception governed by ARCH-018 and is not a registered runtime actor.
After installing the prepared snapshot, it MUST synchronously install the restored actor facts needed
for activation and then one boot-activation barrier command; a fresh actor installs only the barrier.
The exact pending-outcome ordering and hydration rematerialization rules remain owned by the applicable
unresolved operation and persistence boundaries. Only then may its handle escape.
Public `send` MUST synchronously use `Queue.offerUnsafe` on that real unbounded Queue, so calls
made before acquisition retain FIFO order without a no-op shell or separate JavaScript
buffer. The one Queue consumer MUST be forked through ManagedRuntime; it waits on the shared
Layer build before interpreting commands. It drains restored outcomes, then the barrier activates
current desired ownership, then any early host commands. Package-private acknowledged dispatch MUST
synchronously allocate its command Deferred with `Deferred.makeUnsafe`, pass the same shell
admission/lifetime check as public `send`, and admit with `Queue.offerUnsafe` before returning
`Deferred.await(deferred)` as an Effect. This is the sole service-free pre-readiness admission path; it MUST
NOT create another runtime or await ManagedRuntime acquisition before offering. Acquisition failure
MUST close admission, fail acknowledged waiters, and reach readiness without executing queued
commands.

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
supervised activities. `ActorState` contains the public immutable `ActorSnapshot` plus private durable
binding facts, operation cursors, the active dependency set, lifecycle epoch, observed store revision,
publication revision, and machine-turn revision; `getSnapshot()` and `actor.snapshots` project only its
public snapshot. Projection-only publications and machine-turn publications share this atomic owner but
have distinct revision effects.
Every actor has one exact `actor.ref`, and its individual disposal authority
is held only by the separate owner lease. Async completions carry exact identity and generation
back into the mailbox.
Activity starts and releases are staged during CommitPlan interpretation
and enacted only by a package-private post-commit reconciliation fact queued after publication
and before command acknowledgment. These implementation types and TurnPlan/CommitPlan MUST remain
package-private.

The boot-activation barrier is the only exception: after its publication/evidence boundary, the
consumer enacts restored desired ownership as a nonblocking continuation before taking the next
Queue item, so early host commands cannot overtake activation. Ordinary turns retain the queued
post-commit fact and explicit post-commit reconciliation boundary.

The actor engine owns the package-private bookkeeping needed to route mapped operation facts through the
production mailbox. Every external callback, timer fact, stream emission, transaction settlement, context
wave, and store revision enters this mailbox. A projection-only fact publishes a complete snapshot without
evaluating transitions, guards, memory updates, redirects, actions, or hidden events; a mapped event is a
later ordinary mailbox turn. Occurrence cursors, pending outcomes, settlement, and hydration facts remain
in this same atomic owner rather than competing mutable state.

Finite resource, transaction, cache-write, invalidation, and clear plans are admitted only by the
winning event transition's `actions`; continuing resource and stream plans are owned by state
`activities` or independent `onMemory` declarations. `invalidate(targets)` and `clear(targets)`
resolve exact `[O.resource, K]` targets, declared reachable tags, and admitted resource families,
deduplicate first-seen matches, and reject the whole batch before mutation when a target is invalid
or unauthorized. The StoreKernel receives only materialized exact refs, canonical keys, and nominal
tags; it MUST NOT receive or retain a user selector. Timer-owned finite actions are not inferred.

### ARCH-013 — StoreKernel owns one SubscriptionRef

One `SubscriptionRef<StoreState>` owns authoritative resource bases, lookup generations, a shared ordered
overlay ledger, the canonical revision, and changed refs. Overlay layers retain their exact initiating actor
incarnation, occurrence, descriptor, and canonical `K`; their effective values are actor-scoped projections,
not shared canonical truth. Store mutation and replaying publication MUST occur through one
`SubscriptionRef.modify` or `modifyEffect`; a `SynchronizedRef + PubSub` split is forbidden. StoreKernel
returns commit revision, changed refs, and projections but MUST NOT invoke actors.

### ARCH-013A — StoreFanout owns cross-actor notification

A package-private StoreFanout coordinator owns the live actor-mailbox registry and exact dependency reverse
indexes. It is the sole actor-facing delivery path for canonical StoreState revisions. For an
actor-originated commit, it MUST wait until the initiating actor snapshot is published, its TurnRecord is
accepted, and its acknowledgment completes; it then offers one compact canonical revision fact to each
other affected live actor Queue. Owner-overlay facts target only the initiating actor. Recipients ignore
stale revisions, reread current StoreState, and may coalesce adjacent projection-only facts. Lifecycle,
terminal-operation, cancellation, stream-terminal, and mapped-event facts are not coalesced. Actors MUST
NOT subscribe directly to StoreState. StoreFanout, StoreState, and the TurnRecord hub MUST remain
package-private.

### ARCH-013B — DehydrateBarrier excludes half-published store commits

A package-private DehydrateBarrier MUST be shared by StoreKernel commit windows and runtime
capture. It prevents capture from reading StoreState between an actor's store commit and actor
publication without globally freezing unrelated state-only actor turns. A successful capture
uses one StoreState revision, stable actor registry leases, and the WIRE-009 revision checks;
the barrier itself is not a public consistency or transaction API.

### ARCH-014 — RcMap owns leases and GC only

RcMap is the scoped lease table for exact resource identities and their idle-GC deadlines. It is
not the data store, and `RcMap.invalidate` is not Flow invalidation. Resource identity is
descriptor ID plus canonical `K`; executable `P` remains with the live binding. Activity
acquisition MUST call `RcMap.get` inside its Scope. Eviction finalizers MUST carry a lease epoch
before they can modify StoreState.

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

`actor.ref` is the exact machine-branded identity exposed by the ordinary actor handle.
`actor.send(event): void` is the synchronous command surface. `getSnapshot()` and
`actor.snapshots` are the synchronous and streaming evidence surfaces. A package-private
acknowledged dispatch is reserved for Stories and internal orchestration; public code MUST
NOT receive the Deferred. Individual disposal is absent from the actor handle and belongs
only to the owner lease `{ actor, dispose }`. Actor snapshots expose the production lifecycle
`prepared | active | suspended | disposed`.

## React, stories, and inspection

### ARCH-018 — Runtime readiness uses a minimal external store

Because `SubscriptionRef.make` is effectful, the React provider MAY own one tiny synchronous
immutable external store for runtime acquisition state only. It MUST NOT own actor commands,
machine state, resources, retries, or leases. `FlowProvider` receives only an already-created Flow
runtime. Browser app runtimes are created outside React bootstrap; request and Story runtimes remain
scope-owned.

During render, `useActor(machine, options?)` prepares one final local actor with its opaque ref,
initial snapshot, stable handle, and real command-buffering mailbox without registering it,
acquiring ownership, or starting external work. Preparation may carry a passive provisional context cut
and the exact provider refs and provider publication revisions observed for that cut, but it creates no
logical graph edge. Commit rechecks provider identity and revision, installs the current derived context
baseline atomically, activates that same actor, and drains buffered commands once. A changed machine,
runtime, input, or context-binding identity during one component incarnation fails synchronously with a
keyed-remount diagnostic; it never replaces the actor or reuses its memory. Prepared command buffering
is bounded to 64 commands; overflow rejects without mutation. Abandoned preparation leaves no runtime
registration, logical dependency, subscription, work, evidence, or terminal-disposal obligation. React
owns only the attachment lease: cleanup suspends the actor, while runtime or explicit owner disposal
remains the sole terminal authority.

### ARCH-019 — Passive actor selectors are the only React subscription path

`useView(actor, selector)` is the only ordinary reactive subscription path. It reads one atomic
actor context containing exact leaf `state`, immutable `memory`, inherited readonly `context`,
`lifecycle`, `issues`, bound `can(event)`, and snapshot-bound passive `O` reads. Scalar and
non-record results use complete-value `Object.is`; named records use fixed-key field-by-field
`Object.is`; no comparator argument is accepted. React hooks MUST remain passive and MUST NOT
subscribe directly to StoreState or primitive lifecycle controllers, acquire operation work, or
mutate runtime state. `MachineObserver` remains package-private.

### ARCH-020 — Stories run the real scoped architecture

One immutable Story plan and one scoped runner MUST use the real runtime factory, fixture Layer,
production Flow runtime, exact app-owned actor refs, Story-local actor recipes, and Effect
TestClock. The public constructors are `story.app(runtimeFactory, options?)`,
`story.machine(machine, options?)`, and `story.actor(machine, options?)`. Story commands use
acknowledged actor dispatch. A recipe run materializes providers before consumers, retains owner
leases, exposes only their actor handles, and disposes those leases in reverse dependency order.
The runner MUST dispose on success, execution failure, cancellation, and cleanup failure. Story
code MUST NOT provide a testing-only actor, mailbox, scheduler, operation, cache, snapshot, or
cleanup implementation.

### ARCH-021 — Pure model exploration never executes production Effects

Pure model discovery MUST accept only a command-empty fresh `story.machine` plan. Each traversal
call MUST supply and own its candidate events; neither the base plan nor a fixture may contribute
candidates. A fixture MAY contribute immutable static seeds only. The pure model MUST contain no
`Effect.run*`, transaction commit, or stream subscription. App Stories MUST prove real cross-actor
orchestration rather than being reduced to one predicted machine model. `path.story.run()` is the
live Effect proof for the traversal-produced path.

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

Lifecycle transitions publish one coherent immutable actor snapshot before appending their
inspection event. They add `actor:suspend` and `actor:resume` while retaining start, restore, and
dispose, and MUST NOT add `actor:prepare`. Lifecycle evidence MUST NOT create a machine revision
or TurnRecord. A lifecycle record nevertheless enters the same runtime-global evidence hub as a
TurnRecord under the same publication barrier and sequence allocator; the record carries the full
immutable lifecycle snapshot, actor/app/plan provenance, `from`, `to`, discriminated cause, actor
publication revision, machine-turn revision, timestamp, and reserved evidence sequence. Sinks receive
that record asynchronously after the publication boundary and never re-read mutable actor state as
the evidence payload.

Attachment buffer overflow is sink-local truncation with its retained-prefix marker; it MUST NOT block
or roll back runtime publication. Runtime-global sequence exhaustion is preflighted before publication
and is an invariant failure. Runtime disposal first accepts the terminal lifecycle records and then
drains the already accepted evidence prefix before closing sink admission; it MUST NOT manufacture a
terminal `TurnRecord` merely to represent disposal.

### ARCH-023 — Existing actor and stream ownership cover remote leases

A lease with behaviorally visible phases belongs in an explicitly owned actor or is unsupported;
child-machine authoring cannot provide that owner. A purely operational continuing lease MAY use
`Effect.acquireRelease` within a scoped stream activity. No new runtime primitive, lifetime registry,
or hidden cancellation channel is permitted.

## Effect API constraints

### ARCH-024 — RuntimeShell bootstraps service-free cells synchronously

`Queue.make` and `SubscriptionRef.make` are effectful but requirement-free and complete
synchronously in Effect v4. FlowRuntimeShell MAY execute those constructors once with
`Effect.runSync` before returning synchronous handles and owns the resulting non-scoped cells
for their whole lifetime. This exception applies only to construction. ManagedRuntime owns
their consumers and all Effectful execution; host callbacks MUST NOT run Effects
synchronously or mutate actor state. Shell disposal settles acknowledgments and closes the
cells exactly once after managed consumers stop.

The same shell-only coordination boundary owns `Deferred.makeUnsafe` and `Queue.offerUnsafe` for
pre-readiness command admission. These unsafe constructors and offers do not authorize arbitrary
Effect execution or actor-state mutation outside the managed consumer.

Pre-readiness acquisition failure/disposal is the one terminalization exception: because pinned
ManagedRuntime does not start even requirement-free `runFork` bodies before its Context resolves,
the shell may synchronously compare-and-set terminal state, complete buffered Deferreds with their
failure, publish/close the terminal SubscriptionRef/PubSub through service-free runSync operations,
drain/shutdown Queues, and expose no user callback. After readiness, the ordinary managed actor
cleanup path owns terminal publication.

Before Queue shutdown, runtime disposal MUST stop new evidence admission, open the release gate for
every already accepted record, await the bounded sink drain, and only then close ManagedRuntime and
the actor Queues. Queue shutdown MUST NOT be represented by a synthetic terminal `TurnRecord`.

### ARCH-024A — Internal runtime concepts stay private

AppPlan, StoreState, ActorState, TurnPlan, CommitPlan, TurnRecord, StoreFanout, the TurnRecord hub,
and MachineObserver MUST remain package-private. Public APIs expose definitions,
commands, snapshots, actor refs, passive actor selectors, boot payloads, and inspect projections
without exposing runtime owners or registered view definitions.

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

VNext state declarations are recursive named leaf and compound groups, accepted to depth ten. The
machine configuration recursively mirrors the definition with required root and compound `default`
entries and exact nested `states` records. The active public state is one exact leaf token;
`matches` recognizes that leaf and its active ancestors. Compound handlers compile into one
machine-wide event protocol, compound activities and timers own their full active lifetimes, and
redirect stabilization runs from the outermost active compound through the leaf. `reenter` names
an exact active boundary. Terminal-looking leaves are ordinary leaves: there is no final-node kind,
parent completion, final output, automatic actor completion, or mailbox shutdown. Child actors do
not implement hierarchy; recursive substates share one actor.

VNext runtimes cannot extend AppPlan after construction. A host may asynchronously import modules
before calling `app(...)` and `runtime(...)`, or create a separately scoped runtime for a lazy
application island. It cannot register a route module, service requirement, descriptor, or machine
into a running runtime.

VNext activity bindings materialize one continuing resource or stream plan per declaration. There is
no runtime-sized keyed collection reconciler, dynamic parallel/infinite binding, or per-member
outcome aggregation. Applications use statically repeated bindings or one application-owned
aggregate resource/stream until a future collection design defines membership, scopes, bounds,
outcomes, snapshots, and persistence together.

VNext exposes explicit inspection sinks and artifacts but no built-in browser/WebSocket inspector
transport. An application may forward sink projections to its own tool without changing runtime
ownership.

### ARCH-029 — Post-bootstrap actor admission is one transaction

After the initial graph seal, `ensureActor` and `createActor` MUST use the same package-private
admission transaction. The transaction validates app and exact machine provenance, stable-ref or
opaque-ref identity, input, every context binding, provider availability, tombstones, duplicate
instance identity, and instance-cycle freedom before mutating the actor registry or StoreState.
It then installs the silent context baseline, records logical dependency edges, attaches the actor,
activates it, and exposes the owner lease only after all steps succeed.

Concurrent `ensureActor` calls for one stable identity join one in-flight admission and share its
terminal owner authority; they MUST NOT create competing actor lifetimes. A failed admission rolls
back in reverse order: stop staged work, remove dependency edges, close the mailbox, remove the
registration, and discard the prepared actor. No partial handle, snapshot, operation generation,
StoreState mutation, or lifecycle evidence may escape. A failure after ownership is visible uses the
ordinary production disposal path and retains its cleanup truth.

### ARCH-030 — The lifecycle lane normalizes suspension

Each actor has one serialized lifecycle lane ordered against its mailbox. Suspension closes new
command admission at its linearization point; commands admitted before that point retain FIFO order
and finish before suspension, while later commands reject and are never buffered. The lane drains
queued finite occurrences without starting their adapters, interrupts unsettled finite work through
the production kernels, closes continuing streams, detaches subscriptions and timers, and retains
pending-outcome and occurrence cursors needed for truthful settlement. It publishes `suspended`
only after structural detach and finalizer settlement.

Resume waits for that serialized cleanup, reacquires continuing declarations and subscriptions,
reinstalls timers against their absolute deadlines, and routes changed provider values through one
ordinary context wave. It never replays finite work, reruns input or initialization, or claims that an
irreversible external effect was undone. A cleanup defect leaves the actor suspended and blocks resume
until explicit owner or runtime disposal. Logical context edges remain retained while the actor is
suspended, even though live subscriptions and work are detached.

### ARCH-031 — Operation occurrences carry actor-incarnation fencing

Every admitted finite occurrence carries a private actor-incarnation token, operation kind, descriptor
ID, canonical `K`, and one-based non-reused ordinal. When it joins shared resource work it also carries
the exact runtime-store generation and lease epoch. Completion and controlled simulation MUST match the
actor incarnation, operation identity, occurrence status, and generation fence before publishing an
outcome; a stale fact may settle only its bounded evidence and MUST NOT touch a later actor incarnation,
reused ref, collected store entry, or current mapped event.

The actor-incarnation token is allocated for each actor lifetime, is never reused within a runtime, and
is replaced on a later restored runtime incarnation. Consumed occurrence cursors remain sufficient to
reject duplicate observations, while public operation-state unions, transaction `unknown` or
reconciliation representation, and Cause wire shape remain governed by their existing unresolved
contracts. This is an internal fence, not a new public occurrence handle or operation API.

### ARCH-032 — Integration layers preserve one Flow runtime

For each execution scope, the Flow runtime is the sole owner of machine semantics, actor identity and
lifecycle, operation execution, `StoreState`, `StoreFanout`, scheduling, context propagation, and runtime
evidence. “One runtime” means one Flow runtime implementation and one Flow domain model; it does not
require live, request, Story, test, and CLI scopes to share one runtime instance.

Story/testing is a runtime driver. Framework integrations are host bridges. Runtime inspection is an
observer and projection surface. Static source analysis is an execution-free analysis surface. The CLI
is a process host over these capabilities. Each surface MUST reuse the Flow-owned runtime, `AppPlan`,
and evidence model appropriate to its role and MUST NOT create a competing Flow runtime, actor
registry, scheduler, store, transition evaluator, mutable evidence history, artifact decoder, or
semantic model.

A host-owned Effect runtime for process I/O, a fixture Layer, `TestClock`, or a framework readiness store
is permitted only when it does not own Flow domain state, ordering, or lifetimes. The Flow runtime MUST
NOT depend on React, Story/testing, inspection, static analysis, or CLI code. Runtime code may emit the
raw package-private evidence protocol consumed by inspection; inspection report, retention, formatting,
and analysis implementations remain outside the runtime kernel.

This clause does not create a generic plugin interface, registration mechanism, discovery protocol, or
public extension lifecycle. Future framework adapters require their own focused contract and proofs.

### ARCH-028 — Recommended Effect v4 composition is non-normative

This section is implementation guidance, not observable semantics. An equivalent implementation
that satisfies every `MUST` law and proof remains valid; proofs, rather than the primitive choices
below, govern conformance.

- Prefer package-private `Context.Service` values for runtime-wide capabilities, composed once with
  `Layer.succeed` and `Layer.effect(Service, Effect.acquireRelease(...))`, then installed through
  the single ManagedRuntime boundary. Pure definition compilation, AppPlan construction, canonical
  identity, and TurnPlan calculation remain ordinary synchronous TypeScript.
- Prefer one synchronous authored-callback adapter built with `Result.try`, followed by exhaustive
  `Match` for classification; defer an Effect-returning callback with
  `Effect.suspend(() => callback(input)).pipe(Effect.exit)`, and use
  `Stream.suspend`. This keeps throw timing, typed failure, defect, and interruption classification
  in one place without changing the callback's public contract.
- Prefer one `Queue` consumer and one `SubscriptionRef<ActorState>` per actor. When a store commit
  needs both owners, acquire them in fixed order `TurnRecord commit permit -> DehydrateBarrier`;
  capture takes only DehydrateBarrier and no path acquires the commit permit while holding it.
  Protect only the non-suspending publication tail with `Effect.uninterruptibleMask`.
- Prefer StoreKernel ownership of shared lookup fibers with `FiberMap` and registrations with `RcMap`;
  transaction `cancel`, `allow`, and `serialize` can use `FiberMap`, `FiberSet`, and one keyed
  `Queue` worker respectively. Flow's generation checks and admission policy remain authoritative.
- Prefer one Effect-native `acquire/use/release` program below each Promise adapter for host and
  request lifetimes, normally using `Effect.acquireRelease` or `Effect.scoped`. Prefer one duration
  normalizer (`Duration.Input` to checked safe-integer milliseconds, allowing Infinity only where
  the public field permits it), one Cause module whose ordered `cause.reasons` traversal feeds
  classification and projection, and one private Schema owner reused by runtime, stories,
  artifacts, and CLI.
- Prefer exhaustive `Match` for closed private unions. Artifact decoding should combine reviewed
  Schema codecs with the bounded hostile-value walker rather than replace either one.
- Flow should retain its custom RuntimeShell, StoreKernel, StoreState, Flow generations,
  StoreFanout, DehydrateBarrier, lease epochs, TurnRecord release gates, per-key serialization
  admission, TimerCoordinator, and compiled executable table. Independent Clock sleeps cannot
  guarantee Flow's stable equal-deadline actor/timer-slot order, so TimerCoordinator remains the
  intended owner unless a later proof establishes an equivalent primitive.

Where ordered cleanup multiplicity matters, prefer an ordered list of v4
Causes or Exits and, only when one Cause value is required, construct it with
`Cause.fromReasons(causes.flatMap((cause) => cause.reasons))`. Avoid `Cause.combine` at
that boundary because it deduplicates reasons. Keep `Cause.squash` restricted to a deliberately
lossy host rejection boundary.
