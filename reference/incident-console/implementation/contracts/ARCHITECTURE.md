# vNext runtime architecture

Status: normative vNext contract

This file assigns one owner to compilation, runtime construction, actor lifetimes, mailboxes,
store state, scheduling, evidence, and host bridges. The other active contract files own the
observable turn, snapshot, and host details linked below.

## Ownership map

| Owner | Owns | Must not be duplicated by |
| --- | --- | --- |
| `AppPlan` | closed machine/operation graph, IDs, requirements, ownership and reachability | runtime, adapter, Story, CLI |
| `FlowRuntimeShell` + one `ManagedRuntime` | boot, provider graph, scopes, runtime readiness, cleanup | React, Story, host callback |
| `ActorEngine` | one actor mailbox, actor state, publication, occurrence cursors, activity reconciliation | StoreKernel, React, inspection |
| `StoreKernel` | one canonical `StoreState`, generations, overlays, revisions | actor-local caches, `RcMap`, adapters |
| `StoreFanout` | canonical revision delivery to actor mailboxes | direct StoreState subscriptions |
| owner lease | individual terminal actor disposal | ordinary actor handle, `ActorRef`, React cleanup |
| host adapter | entering Flow through the managed boundary | synchronous `runSync` mutation |

## Runtime construction

```ts
const setup = flow.runtimeSetup({
  app: TodoApp,
  implementation: TodoLive,
  persistence: persistence({ storage, scope: "user:42" }),
});

const runtime = setup.construct();
await runtime.ready();
const lease = runtime.ensureActor(TodoRefs.primary, {
  input: { userId: "user-42" },
  contextBindings,
});
lease.actor.send(Todo.E.RefreshRequested());
```

`RuntimeSetup` discovery is synchronous and inert. `construct()` returns the runtime handle;
bootstrap, restoration, Implementation acquisition, initial admission, graph sealing, and actor
activation occur at the readiness boundary. `runtime.ready()` is the only public readiness Effect.

### ARCH-001 — AppPlan is inert and closed-world

- Surface: `flow.app({ id, persistenceVersion, modules })`, `App.M`, `AppPlan`.
- Rule: Compile the exact named machine records synchronously into one immutable flattened plan containing the complete operation graph, requirements, canonical IDs, durable descriptor resolution, ownership, reachability, and the indexes shared by admission, ownership, inspection, fixtures, and tooling. Every consumer uses those compiled indexes; a duplicate graph walk is permitted only when its completeness and ordering are proved. Compilation executes no Effect, acquires no resource, creates no actor, mutates no global registry, and never scans callbacks.
- Accepts: Declared operations, exact in-plan machines, descriptors, and context bindings.
- Rejects: Duplicate durable machine IDs, duplicate property ownership, the same machine value under multiple module owners, out-of-plan machines/descriptors/providers, and the removed `dynamicMachines` admission seed.
- Observable guarantee: `App.M` is the complete executable/admission universe; runtime execution cannot expand it.
- Proof: Compile-time plan and fixture/admission proofs; see `HOST-P01` and the exact AppPlan references in `REACT_AND_HOSTS.md`.
- Trace: `ARCH-003`, `ARCH-004`, `ARCH-027`, `HOST-001`.

### ARCH-002 — Application and actor identity are explicit

- Surface: app ID, machine `id`, `ActorRef<M>`.
- Rule: App IDs are explicit and collision-free. A machine's explicit `id` is durable machine/artifact identity; an `App.M` property is only an ergonomic TypeScript key. Every actor carries one exact machine-branded ref: authored durable ID for stable actors, generated opaque runtime-local ID for local actors.
- Accepts: Inert refs with no behavior or ownership authority.
- Rejects: Identity qualified by module order/property names; refs carrying input, bindings, construction, ownership, subscriptions, or disposal.
- Observable guarantee: Ref equality identifies the intended machine/actor identity without granting control.
- Proof: Exact-ref compile/runtime proofs in `HOST-P01`.
- Trace: `ARCH-003`, `ARCH-004`, `HOST-002`.

### ARCH-003 — Modules and actor admission are distinct

- Surface: `module({ id, machines })`, `app({ modules })`, `actorRef`, `ensureActor`, `getActor`, `createActor`.
- Rule: Modules preserve exact keyed machine records and are ordered, unaliased tooling groups. A module ID is tooling/artifact identity only: it is not machine, actor, persistence, context, runtime, or operation identity. Renaming a module creates a new tooling group and requires an explicit artifact/migration decision; no runtime or persistence alias is implied. App compilation creates no actors and no automatic root. `actorRef(machine, id)` is inert; `ensureActor` restores or creates a shared actor; `getActor` only looks up; `createActor` always creates a fresh local actor without a stable ID.
- Accepts: In-plan machines, unique module IDs/property names, explicit stable refs, opaque local creation, Story-local actors.
- Rejects: Duplicate module machine keys, automatic roots, `dynamicMachines`, `RootActor`, `DynamicActor`, `runtime.actor(machine)`, ID-bearing local creation, module actor factories/input registries/startup policy.
- Observable guarantee: Module renames/moves are artifact-breaking tooling changes but do not change runtime/persistence identity; no machine becomes a root implicitly.
- Proof: Closed `App.M`, duplicate-owner, and admission proofs in `HOST-P01`.
- Trace: `ARCH-001`, `ARCH-002`, `HOST-001`, `HOST-002`.

### ARCH-004 — AppPlan owns descriptor and actor resolution

- Surface: serialized descriptor IDs, stable refs, operation identity.
- Rule: Receiving runtimes resolve serialized descriptors and durable refs only through their own `AppPlan`/`App.M`. Operation identity is descriptor ID plus canonical `K`; executable `P` stays on the live binding and is not identity.
- Accepts: Private in-process definition retention when resolution still uses the receiving plan.
- Rejects: Process-global descriptor, actor, or app registries; `P`-based identity.
- Observable guarantee: Multiple runtimes, tests, and hot reloads remain isolated.
- Proof: Cross-runtime resolution and identity checks in `HOST-P01` and `SNAP-P01`.
- Trace: `ARCH-001`, `ARCH-002`, `SEM-010`, `SNAP-003`.

### ARCH-005 — Effect requirements propagate without erasure

- Surface: hidden `R`, `RequirementsOf`, `flow.runtime` Implementation.
- Rule: Resource, transaction, stream, machine, module, and app types retain the complete inferred environment. `flow.runtime` requires the application Implementation after removing Flow-owned `Scope.Scope`; descriptor `R` remains raw.
- Accepts: Omitted Implementation only when requirements are `never`; fixture/test services through the corresponding Implementation.
- Rejects: Erasing requirements, treating an Implementation acquisition failure as an operation outcome, or installing services outside the runtime boundary.
- Observable guarantee: Readiness fails at runtime when Implementation acquisition fails; descriptor `E` remains an operation outcome.
- Proof: Type-mode and readiness proofs; see `HOST-006`, `HOST-015`.
- Trace: `ARCH-007`, `ARCH-010`, `SEM-006A`.

### ARCH-006 — Machine construction uses typed input

- Surface: definition input, `memory: ({ input }) => Memory`, state/events/context/operations.
- Rule: The definition owns static actor shape and is the sole inference source for `InputOf` and `MemoryOf`. The pure initializer runs once for fresh construction; machine behavior thereafter receives memory, readonly context, state, and events, not original input. Restoration installs materialized memory without initialization or input replay.
- Accepts: Omitted initializer input as `void`; transitions, activities, timers, redirects, context selectors, and operations layered onto the static shape.
- Rejects: Reclassifying local/shared actors from input, rerunning input on restore/resume, or redefining static shape in machine behavior.
- Observable guarantee: Fresh and restored actors have deterministic, distinct initialization semantics.
- Proof: Fresh/restore and type proofs in `HOST-P01`, `HOST-P04`, `SNAP-P01`.
- Trace: `SEM-001A`, `SEM-024`, `HOST-002`.

### ARCH-007 — One ManagedRuntime owns the graph

- Surface: `runtimeSetup(...).construct()`, `FlowRuntimeShell`, Effect `ManagedRuntime`.
- Rule: Construction creates one shell and exactly one ManagedRuntime. The shell owns only requirement-free non-scoped `Queue` and `SubscriptionRef` cells needed before synchronous return. ManagedRuntime owns Flow's provider graph, optional Implementation, every Scope, fiber, activity, and finalizer.
- Accepts: One runtime per execution scope; host-owned Effect runtime for process I/O only when it does not own Flow state/order/lifetimes.
- Rejects: Competing top-level scopes, custom provider-graph memoization, parallel finalizer registries, or a public zero-argument runtime constructor.
- Observable guarantee: Every Flow scope has one coherent runtime owner.
- Proof: Runtime topology and cleanup proofs in `HOST-P01`, `HOST-P05`.
- Trace: `ARCH-007A`, `ARCH-010`, `ARCH-032`, `HOST-006`.

### ARCH-007A — Runtime phases are private and linearized

- Surface: private runtime phase; public `runtime.ready()`.
- Rule: The phase is `constructed | booting | ready | failed | disposed`. Booting begins before restoration/acquisition/admission; ready follows graph seal, Implementation availability, and attached-actor activation barriers. No real handle/lease/command escapes before seal and readiness; inert prepared React handles are the sole exception.
- Accepts: Shell cells in `constructed`; private queues/activation state after seal while Implementation acquires.
- Rejects: A public phase union, second readiness API, handle escape before seal, or admission after `failed`.
- Observable guarantee: Boot failure enters `failed` after reverse rollback; disposal during `constructed`/`booting` wins, cancels bootstrap, rolls back, and reaches `disposed`. Phase changes never become machine events.
- Proof: Phase, rollback, and readiness proofs in `HOST-P01`, `HOST-006`.
- Trace: `ARCH-008`, `ARCH-009`, `SEM-027`.

| Phase | Admission | Required boundary |
| --- | --- | --- |
| `constructed` | none | service-free shell only |
| `booting` | bootstrap/activation only | persistence, Implementation, ensures, providers, seal |
| `ready` | ordinary work | all attached actors crossed activation barrier |
| `failed` | closed | cleanup only |
| `disposed` | closed | terminal |

### ARCH-008 — Persistence restoration precedes actor activation

- Surface: package-private `PersistenceCoordinator`, `PreparedBoot`, optional persistence provider.
- Rule: Validate the service-free v2 record, use the default/provider codec, normalize resources through StoreKernel and transactions/overlays through their kernels, restore declared persistable actors/operations, acquire Implementation, complete initial `ensureActor`s, resolve exact context refs, seal the graph, then activate/expose handles. Mutable post-start hydration is forbidden.
- Accepts: Context-closed capture cuts between completed propagation waves; exact binding refs/provider revisions; restored providers before consumers.
- Rejects: Missing/foreign/duplicate/cyclic providers, partial graph escape, opaque local provider promotion/recreation/substitution/rebinding, concurrent capture mismatch without retry classification.
- Observable guarantee: Boot failure leaves no actor/handle/edge/ack/evidence residue; `ConcurrentDehydrate` is retryable and `NonDurableContextProvider` is non-retryable.
- Proof: `HOST-P04`, `SNAP-P01`, WIRE-009/011/012 references.
- Trace: `ARCH-007A`, `SEM-002A`, `SEM-027A`, `HOST-014`.

### ARCH-009 — Attached dispatch enters the real mailbox after readiness

- Surface: actor `send`, package-private acknowledged dispatch, actor Queue consumer.
- Rule: Create one Queue before handle escape; install restored facts and one boot-activation barrier (fresh actors install only the barrier); fork the one consumer through ManagedRuntime; drain restored outcomes and activate desired ownership before the next Queue item. After ready, `send` uses synchronous `Queue.offerUnsafe`; acknowledged dispatch uses `Deferred.makeUnsafe`, the same admission check, `Queue.offerUnsafe`, then awaits the Deferred.
- Accepts: Acknowledged bootstrap/activation dispatch before readiness; ordinary public commands only after readiness.
- Rejects: Direct transition execution, a second queue, arbitrary pre-ready host commands, or executing queued commands after acquisition failure.
- Observable guarantee: FIFO mailbox order and activation-before-early-command order; acquisition failure fails waiters and rolls back.
- Proof: `SEM-001`, `SEM-006`, `HOST-004`.
- Trace: `ARCH-012`, `SEM-004`, `SEM-006A`.

Exact pending-outcome ordering and hydration rematerialization are owned by `SEMANTICS.md`
`SEM-016`/`SEM-018`, `PUBLIC_API.md` `API-006`, and `WIRE-011`/`WIRE-012`. Only after those
restored facts and the activation barrier are installed may the handle escape.

### ARCH-010 — Runtime construction names app and Implementation

- Surface: production, request, Story, and test runtime construction.
- Rule: Every runtime names an app and supplies an Implementation whenever inferred requirements are not `never`.
- Accepts: Fixture/test services installed through that Implementation.
- Rejects: Zero-argument construction and testing-only actor engines.
- Observable guarantee: All hosts use the same typed runtime boundary.
- Proof: `HOST-001`, `HOST-006`, `HOST-013`.
- Trace: `ARCH-005`, `ARCH-007`, `ARCH-020`.

### ARCH-011 — Host callbacks reenter managed ownership

- Surface: browser focus/online and non-browser host signals.
- Rule: Enter through a scoped Effect stream or runtime-owned Queue. Browser listeners use `Effect.acquireRelease`, synchronously offer immutable facts to one internal Queue, and a ManagedRuntime-owned consumer applies policy.
- Accepts: Private static/controlled sources for non-browser and Story hosts.
- Rejects: Callback `Effect.runSync` mutation, public host-signal mutators, or host-owned Flow state.
- Observable guarantee: Host facts cannot publish reentrantly outside the runtime owner; offline is advisory and never cancels/blocks explicit operation admission.
- Proof: Host parity and lifecycle proofs in `HOST-P03`, `HOST-P05`.
- Trace: `SEM-011`, `ARCH-032`.

### ARCH-012 — ActorEngine owns mailbox and snapshot publisher

- Surface: `ActorEngine`, `ActorState`, actor Queue and `SubscriptionRef<ActorState>`.
- Rule: One actor owns one unbounded Queue, consumer, atomic `SubscriptionRef`, acknowledged Deferreds, pure planner, reconciler, occurrence cursors, private bindings, revisions, and supervised activities. All external facts enter that mailbox. Projection-only facts publish complete snapshots without transition evaluation; mapped events are later ordinary turns. Activity start/release is staged in `CommitPlan` and reconciled after publication, before acknowledgment, except boot activation's nonblocking continuation.
- Accepts: Event, callback, timer, stream, transaction, context, store, hydration, and operation facts through the mailbox.
- Rejects: Independent mutable occurrence/snapshot stores, direct actor invocation by StoreKernel, timer-inferred finite actions, or selectors retained by StoreKernel.
- Observable guarantee: Public snapshots are passive projections of one atomic owner; owner-overlay reads remain actor-scoped.
- Proof: `SEM-001`–`SEM-005`, `SNAP-P01`.
- Trace: `ARCH-013`, `ARCH-013A`, `SEM-003`.

Synchronous snapshot reads use immutable runtime-owned state and do not execute Effect, `runSync`,
or an acquisition path. Every external callback, timer fact, stream emission, transaction settlement,
context wave, and store revision enters this mailbox; asynchronous completions carry exact identity and
generation back into it.

### ARCH-013 — StoreKernel owns one SubscriptionRef

- Surface: canonical `StoreState`, overlay ledger, commit coordinator.
- Rule: One `SubscriptionRef<StoreState>` owns bases, lookup generations, ordered overlays, canonical revision, and changed refs. Every mutation/publication uses one `SubscriptionRef.modify`/`modifyEffect`; StoreKernel returns projections/revision and never invokes actors.
- Accepts: Actor-scoped overlays carrying initiating incarnation, occurrence, descriptor, and canonical `K`.
- Rejects: `SynchronizedRef + PubSub` split, actor-private canonical caches, or shared truth in overlays.
- Observable guarantee: Canonical data is shared only within one runtime; overlay promotion/rollback is atomic and explicit.
- Proof: `SEM-008`–`SEM-017`, `SNAP-004`.
- Trace: `ARCH-013A`, `ARCH-013B`, `SEM-016`.

### ARCH-013A — StoreFanout owns cross-actor notification

- Surface: package-private StoreFanout, actor dependency reverse index.
- Rule: StoreFanout is the only actor-facing StoreState path. It offers compact monotonic revision facts to affected other actor queues only after initiating snapshot publication, TurnRecord acceptance, and acknowledgment. Recipients ignore stale revisions, reread current StoreState, and may coalesce adjacent projection-only facts.
- Accepts: Exact dependency-index delivery; owner-overlay facts only to the initiating actor; autonomous commits without an initiating barrier.
- Rejects: Direct actor StoreState subscriptions, transition/snapshot mutation in fanout, or coalescing lifecycle/terminal/cancellation/stream-terminal/mapped-event facts.
- Observable guarantee: Cross-actor reads are tear-free and causally ordered after the initiating publication boundary.
- Proof: `HOST-P03`, `SNAP-P01`.
- Trace: `ARCH-012`, `SEM-009`, `SEM-026`.

The package-private StoreFanout coordinator owns the live actor-mailbox registry and exact dependency
reverse index. It offers only compact monotonic revision facts to affected actor queues after the
initiating publication, evidence acceptance, and acknowledgment boundary; recipients reread current
StoreState and may coalesce only adjacent projection-only facts.

### ARCH-013B — DehydrateBarrier excludes half-published commits

- Surface: package-private `DehydrateBarrier`.
- Rule: Share the barrier between StoreKernel commit windows and capture. Capture sees one StoreState revision, stable actor leases, and WIRE-009 checks, but does not freeze unrelated state-only turns.
- Accepts: Capture after a completed commit/publication boundary.
- Rejects: Capture between actor store commit and actor publication or a barrier used as a public consistency/transaction API.
- Observable guarantee: Checkpoints and persistence never capture half-published state.
- Proof: `SNAP-010`, `SNAP-P01`, `HOST-P04`.
- Trace: `SEM-004`, `HOST-014`.

### ARCH-014 — RcMap owns leases and GC only

- Surface: `RcMap`, exact descriptor/`K` resource identity.
- Rule: RcMap owns scoped activity leases and idle-GC deadlines. Activity acquisition calls `RcMap.get` inside its Scope; eviction finalizers carry a lease epoch before StoreState mutation.
- Accepts: Exact-key lease lookup and final-owner collection policy.
- Rejects: Treating RcMap as data store, `RcMap.invalidate` as Flow invalidation, or old-epoch eviction.
- Observable guarantee: Reacquisition fences stale collection and actor release does not define canonical deletion.
- Proof: `SEM-013`, `SEM-020`, `SNAP-005`.
- Trace: `ARCH-015`, `SEM-014`.

### ARCH-015 — Fiber ownership follows concurrency semantics

- Surface: FiberMap, FiberSet, per-key Queue worker, StoreKernel lookup generation.
- Rule: FiberMap owns keyed `cancel` replacement work; FiberSet owns independent `allow` work; one keyed Queue worker owns `serialize`. StoreKernel owns exact-ref shared lookup generations and temporary in-flight leases; actor Scopes own registrations/activity leases. A lookup generation may still be warming or settling after all actor registrations release; only exact-key replacement or Runtime disposal cancels that shared work.
- Accepts: Exact-key indexes or bounded scans with proof; Flow generation tokens after interruption.
- Rejects: First actor release interrupting joined shared work, unbounded hot-path scans, or a second scheduler owner.
- Observable guarantee: Concurrency policy and final-owner behavior remain actor/store scoped and generation-safe.
- Proof: `SEM-018`, `SEM-020`, `SEM-030`.
- Trace: `ARCH-015A`, `ARCH-016`.

### ARCH-015A — Cancellation registration linearizes first

- Surface: cancellation/replacement generation record.
- Rule: Commit cancellation registration and its fencing record before a scheduler can execute work, for synchronous and asynchronous schedulers.
- Accepts: Synchronous completion only after ownership is registered.
- Rejects: A task escaping replacement, cancellation, or disposal because it completed before registration.
- Observable guarantee: Every admitted completion has a valid cancellation/replacement owner.
- Proof: `SEM-014`, `SEM-018`, `SEM-030`.
- Trace: `ARCH-015`, `ARCH-031`.

### ARCH-016 — Beta.86 `startImmediately` is not a contract

- Surface: Effect 4.0.0-beta.86 `FiberMap.run`/`FiberSet.run`.
- Rule: Correctness, ordering, and tests MUST NOT depend on `startImmediately`; the pinned implementation does not forward it to `runForkWith`.
- Accepts: Explicit Flow mailbox/generation ordering.
- Rejects: Treating the option as a scheduling guarantee.
- Observable guarantee: Conformance does not drift with that implementation detail.
- Proof: Pinned dependency/source check plus `SEM-018` behavior proofs.
- Trace: `ARCH-015`, `ARCH-028`.

### ARCH-017 — Public actor API separates command and evidence

- Surface: `actor.ref`, `actor.send`, `getSnapshot`, `actor.snapshots`, owner lease.
- Rule: The actor handle exposes exact identity, synchronous `send(event): void`, and passive evidence only. Acknowledged dispatch is package-private for Story/internal orchestration. Individual disposal exists only on `{ actor, dispose }`; lifecycle is `prepared | active | suspended | disposed`.
- Accepts: Synchronous command admission and snapshot streaming.
- Rejects: Public Deferred/Promise acknowledgments, disposal on actor/ref, or a failure lifecycle.
- Observable guarantee: Commands, evidence, and ownership cannot be confused.
- Proof: `HOST-003`–`HOST-005`, `SEM-006`, `SEM-024`.
- Trace: `ARCH-018`, `SNAP-001`.

### ARCH-018 — Runtime readiness and React preparation use a minimal external store

- Surface: private React readiness adapter, prepared `useActor` handle.
- Rule: React may own one tiny immutable external store for runtime acquisition state only. During render, `useActor` prepares one final opaque local actor with pure initial snapshot, stable handle, real bounded command mailbox, and optional passive provisional context cut; no registry, edge, ownership, subscription, work, or evidence exists until commit attachment.
- Accepts: One prepared actor per component incarnation; 64 buffered commands; one atomic attachment recheck/activation/drain; keyed-remount diagnostic on machine/runtime/input/binding identity changes.
- Rejects: React-owned actor engine/state/lease, >64 buffered commands, replacement/reused memory, abandoned-handle registration, or a second `useActorByRef` construction path.
- Observable guarantee: Abandonment is inert; cleanup suspends the same actor; runtime/owner remains terminal disposal authority.
- Proof: `HOST-P02`, `HOST-012`.
- Trace: `ARCH-019`, `HOST-007`–`HOST-009`.

Preparation closes its command-buffering mailbox at one internal linearization point on abandonment;
buffered commands are never delivered, later commands reject, and the abandoned handle remains inert.

### ARCH-019 — Passive actor selectors are the only React subscription path

- Surface: `useView(actor, selector)`.
- Rule: Read one atomic actor context containing leaf `state`, immutable `memory`, readonly `context`, lifecycle, issues, bound `can(event)`, and snapshot-bound passive `O`. Equality is complete-value `Object.is` for scalar/non-record results and fixed-key fieldwise `Object.is` for named records; no comparator is accepted.
- Accepts: Passive `key`, `getData`, and `getState` reads; internal dependency tracking.
- Rejects: Direct StoreState/lifecycle subscriptions, operation acquisition, mutation, registered views, ref/family/view IDs, or view-bound `can` APIs.
- Observable guarantee: Matching actor/store publications rerun selectors against one tear-free cut; passive selectors never create work.
- Proof: `HOST-P03`, `SNAP-P01`.
- Trace: `SEM-025`, `SEM-026`, `HOST-011`.

### ARCH-020 — Stories run the real scoped architecture

- Surface: `story.app`, `story.machine`, `story.actor`, Story runner.
- Rule: Stories use typed `RuntimeSetup`, constructed production Runtime, fixture Implementation, exact app-owned refs, Story-local recipes, acknowledged dispatch, and Effect TestClock. Providers materialize before consumers; leases expose only handles and dispose in reverse dependency order on success, failure, cancellation, or cleanup failure.
- Accepts: `story.app(runtimeSetup, options?)`, `story.machine(machine, options?)`, `story.actor(machine, options?)`.
- Rejects: Testing-only actor/mailbox/scheduler/operation/cache/snapshot/cleanup implementations or direct result injection.
- Observable guarantee: Story and live commands traverse the same production actor, operation, store, context, evidence, and cleanup paths.
- Proof: `HOST-P03`, `HOST-P05`.
- Trace: `ARCH-010`, `SEM-006A`, `HOST-004`.

### ARCH-021 — Pure model exploration never executes production Effects

- Surface: fresh command-empty `story.machine` model and `path.story.run()`.
- Rule: Pure traversal owns its candidate events; fixtures may provide immutable static seeds only. The pure model contains no `Effect.run*`, transaction commit, or stream subscription. Live proof uses `path.story.run()`.
- Accepts: Cross-actor orchestration in App Stories through the real runtime.
- Rejects: Fixture-provided event candidates or reducing an App Story to one predicted machine model.
- Observable guarantee: Pure exploration is execution-free and live execution is separately evidenced.
- Proof: Story model/live parity proof in `HOST-P03`.
- Trace: `ARCH-020`, `SEM-001`, `SEM-006A`.

### ARCH-022 — TurnRecords feed explicit sinks

- Surface: runtime-global evidence hub, TurnRecord, LifecycleRecord, sink release gate.
- Rule: Reserve the evidence sequence and commit permit before StoreState mutation; hold through actor publication and hub acceptance. Queue immutable records behind a release gate; acknowledge, open the gate, then release StoreFanout. Sinks process asynchronously and never mutate runtime truth.
- Accepts: Bounded observational sinks; lifecycle records in the same global sequence; sink-local retained-prefix truncation.
- Rejects: Inline sink invocation, separate mutable histories, post-publication sequence exhaustion, sink overflow blocking/rolling back publication, synthetic terminal TurnRecords.
- Observable guarantee: Accepted evidence is ordered, lifecycle snapshots precede their events, disposal drains the accepted prefix after terminal lifecycle records.
- Proof: `HOST-P05`, `SEM-004`, `SEM-028`.
- Trace: `ARCH-013A`, `ARCH-024`, `ARCH-025`.

### ARCH-023 — Existing actor and stream ownership cover remote leases

- Surface: behaviorally visible remote workflow and operational continuing lease.
- Rule: A behaviorally visible phased lease belongs to an explicitly owned AppPlan actor. A purely operational continuing lease may use `Effect.acquireRelease` in a scoped stream activity.
- Accepts: Existing actor or stream ownership.
- Rejects: Child-machine ownership, new lifetime registries, hidden cancellation channels, or a child-equivalent primitive.
- Observable guarantee: Remote completion, interruption, and release remain distinguishable and release exactly once.
- Proof: `SEM-022`, `HOST-P01`.
- Trace: `ARCH-032`, `SEM-017A`.

### ARCH-024 — RuntimeShell bootstraps service-free cells synchronously

- Surface: shell-only `Queue.make`, `SubscriptionRef.make`, `Deferred.makeUnsafe`, `Queue.offerUnsafe`.
- Rule: The shell may use `Effect.runSync` only once for requirement-free construction and shell terminalization. ManagedRuntime owns all consumers/effectful execution; host callbacks never use synchronous Effects to mutate actor state.
- Accepts: Shell compare-and-set terminal state, buffered Deferred settlement, terminal SubscriptionRef/PubSub publication, queue drain/shutdown before readiness when ManagedRuntime cannot start.
- Rejects: General synchronous Effect execution, user callbacks, or post-ready shell mutation.
- Observable guarantee: Pre-readiness failure/disposal settles exactly once; ordinary ready cleanup remains managed.
- Proof: `HOST-P05`, `ARCH-025`.
- Trace: `ARCH-007`, `ARCH-009`, `SEM-004`.

### ARCH-024A — Internal runtime concepts stay private

- Surface: `AppPlan`, `StoreState`, `ActorState`, `TurnPlan`, `CommitPlan`, `TurnRecord`, StoreFanout, hub, MachineObserver, boot/codec carriers.
- Rule: Keep these owners package-private. Public APIs expose definitions, commands, snapshots, refs, passive selectors, inert persistence providers, and inspect projections only.
- Accepts: Package-private inspection/evidence protocol.
- Rejects: Public registered view definitions, runtime owners, mutable histories, or codec carriers.
- Observable guarantee: Hosts cannot create competing ownership paths through internal structures.
- Proof: Public-boundary proofs in `HOST-P03` and `SNAP-P01`.
- Trace: `ARCH-017`, `ARCH-032`.

### ARCH-025 — Queue shutdown follows acknowledgment settlement

- Surface: runtime disposal and actor Queue shutdown.
- Rule: Disposal begins with an out-of-band shell CAS, closes admission, races readiness, interrupts/awaits consumers, fails current and drained acknowledged commands, then shuts queues. Before queue shutdown it stops evidence admission, opens accepted release gates, drains bounded sinks, and closes ManagedRuntime/queues.
- Accepts: Disposal even while Implementation acquisition never completes.
- Rejects: Queue-command disposal, dropped Deferreds, or synthetic terminal TurnRecords.
- Observable guarantee: No buffered acknowledgment is silently lost and no accepted evidence remains undrained at close.
- Proof: `HOST-P05`.
- Trace: `ARCH-022`, `ARCH-024`, `SEM-024`, `SEM-028`.

### ARCH-026 — Exit and Cause remain intact internally

- Surface: operation and cleanup fibers; host error boundaries.
- Rule: Retain `Exit` and full `Cause` through classification with `Effect.exit`/`Effect.onExit`. Use `FlowDisposeError` and `FlowStoryExecutionError` for complete Cause preservation; squash only at an intentionally lossy JS throw/rejection boundary.
- Accepts: Ordered private `CauseProjection` in TurnRecords/artifacts.
- Rejects: `Effect.result` as complete classification, `Cause.squash` as internal truth, or Cause in public actor snapshots.
- Observable guarantee: Defect, typed failure, and interruption remain distinguishable.
- Proof: `SEM-023`, `HOST-015`, `SNAP-006`.
- Trace: `ARCH-028`, `SEM-024A`.

### ARCH-027 — The executable graph and statechart scope stay closed

- Surface: recursive state declarations, activities, timers, runtime graph, inspection transport.
- Rule: Accept recursive leaf/compound states to depth ten with exact nested configuration/defaults; one machine-wide event protocol; compound activities/timers own active lifetimes; redirects stabilize outermost-to-leaf; `reenter` names an exact active boundary. Terminal-looking leaves remain ordinary leaves. AppPlan cannot grow after construction.
- Accepts: Async module import before `app(...)`/`runtimeSetup(...).construct()` or a separately scoped lazy application island; one continuing binding per declaration or one app-owned aggregate resource/stream.
- Rejects: Runtime route/module/service/descriptor/machine registration, child actors for hierarchy, runtime-sized dynamic collection reconciliation, built-in browser/WebSocket inspector transport.
- Observable guarantee: Recursive substates share one actor; equal-deadline/timer order remains Flow-owned and the executable universe is closed.
- Proof: State depth, redirect, activity, and lifecycle proofs in `SEM-002`, `SEM-019`, `SNAP-009`.
- Trace: `ARCH-032`, `SEM-017A`, `SEM-022`.

Terminal-looking leaves remain ordinary leaves: they do not complete an actor, emit parent
completion, produce final output, close subscriptions, stop the mailbox, or add a final-state node.
Child actors do not implement hierarchy; recursive substates share one actor. Runtime code exposes no
built-in browser/WebSocket inspector transport and no generic plugin or registration lifecycle.

### ARCH-029 — Post-bootstrap actor admission is one transaction

- Surface: `runtime.ensureActor`, `runtime.createActor` after graph seal.
- Rule: Validate exact app/plan provenance, machine/ref identity, input, every binding, provider availability, tombstones, duplicate instance identity, and instance cycles before registry/StoreState mutation. Install silent context baseline and logical edges, attach, activate, then expose the lease. Concurrent ensures join one admission.
- Accepts: One terminal owner authority for concurrent ensures.
- Rejects: Partial handle/snapshot/generation/evidence, registry mutation before validation, or a second incarnation for a tombstoned ref.
- Observable guarantee: Before the owner lease is visible, failure rolls back staged work, edges, mailbox, registration, and prepared actor in reverse order. A failure after ownership is visible uses the ordinary production disposal path and retains its cleanup truth.
- Proof: `HOST-P01`, `HOST-006`, `SEM-029`.
- Trace: `ARCH-008`, `ARCH-030`, `HOST-003`.

### ARCH-030 — The lifecycle lane normalizes suspension

- Surface: serialized lifecycle lane; `prepared | active | suspended | disposed`.
- Rule: Suspension closes command admission at one linearization point, drains pre-close commands FIFO, detaches work/subscriptions/timers, interrupts unsettled finite work, closes streams, retains cursors/pending truth, and publishes suspended only after cleanup. Resume waits for finalizers, reacquires continuing work, reinstalls absolute timers, performs at most one overdue refresh, and routes provider changes through one ordinary context wave.
- Accepts: Reusing the same ref/handle/memory/context/occurrence records; running finite resource release only for this actor; retaining remote identity as `unknown`/reconciliation-required after the irreversible boundary.
- Rejects: Buffering suspended commands, replaying finite work/emissions/input/initialization, automatic retry or remote rollback, or resume after cleanup defect.
- Observable guarantee: Suspended means no live attachment resources; cleanup defects leave it suspended and block resume until owner/runtime disposal.
- Proof: `HOST-P02`, `SEM-020`, `SEM-024`.
- Trace: `ARCH-009`, `ARCH-031`, `HOST-009`.

Logical context edges remain retained while an actor is suspended even though live subscriptions and
work are detached. Resume never reruns input, initialization, committed events, finite actions, or
baseline `onContext`; a remote effect interrupted after its irreversible boundary remains `unknown` or
reconciliation-required rather than claiming rollback.

### ARCH-031 — Operation occurrences carry actor-incarnation fencing

- Surface: private finite occurrence identity.
- Rule: Fence every admitted occurrence with actor incarnation, operation kind, descriptor ID, canonical `K`, one-based non-reused ordinal, and when shared work is involved exact store generation/lease epoch. Match every fence before publishing completion.
- Accepts: Bounded stale evidence and cursors sufficient to reject duplicate observations; new ordinal/generation on a later actor incarnation.
- Rejects: Late facts mutating later incarnations, reused refs, collected entries, or current mapped events; any public occurrence handle.
- Observable guarantee: Occurrences settle exactly once and hydration/restoration never replays external work.
- Proof: `SEM-006A`, `SEM-030`, `SNAP-P01`.
- Trace: `ARCH-015`, `ARCH-030`, `SEM-018`.

The actor-incarnation token is allocated for each actor lifetime, never reused within a runtime, and
replaced on a later restored incarnation. Public operation unions and transaction
`unknown`/`reconcileRequired` representation follow `PUBLIC_API.md` `API-006`; Cause wire shape follows
`WIRE-020B`. This fencing remains private and adds no public occurrence handle.

### ARCH-032 — Integration layers preserve one Flow runtime

- Surface: live/request/Story/test/CLI/React/inspection/static-analysis integrations.
- Rule: For each scope Flow owns machine semantics, actor identity/lifecycle, operations, StoreState, fanout, scheduling, context, and evidence. Story/testing drives it; frameworks bridge it; inspection observes it; CLI hosts it; static analysis does not execute it. The Flow runtime MUST NOT depend on React, Story/testing, inspection, static analysis, or CLI code.
- Accepts: Host-owned Effect runtime for process I/O, fixture Implementation, TestClock, or readiness store when none owns Flow domain state/order/lifetime.
- Rejects: Competing Flow runtime, actor registry, scheduler, store, transition evaluator, mutable evidence history, artifact decoder, semantic model, or generic plugin/registration lifecycle.
- Observable guarantee: Live and Story behavior use one Flow implementation and domain model while remaining scope-isolated.
- Proof: `HOST-P03`, `HOST-P05`.
- Trace: `ARCH-007`, `ARCH-020`, `HOST-013`, `HOST-015`.

### ARCH-028 — Recommended Effect v4 composition is non-normative

- Surface: implementation guidance only.
- Rule: Prefer package-private `Context.Service`/`Layer` composition through one ManagedRuntime; plain TypeScript for definitions, AppPlan, identity, and plans; `Result.try`/`Match`, `Effect.suspend`, `Stream.suspend`, one Queue + `SubscriptionRef` per actor, FiberMap/FiberSet/keyed Queue by policy, one duration normalizer, one Cause module, one Schema owner, and the custom RuntimeShell/StoreKernel/StoreFanout/DehydrateBarrier/TimerCoordinator. Acquire Store commit permit before DehydrateBarrier; never invert that order.
- Accepts: Equivalent implementations that satisfy every normative law and proof.
- Rejects: Treating primitive choice as contract, independent Clock sleeps as proof of equal-deadline order, `Cause.combine` where ordered multiplicity matters, or `Cause.squash` before a host boundary.
- Observable guarantee: Primitive substitutions do not change ownership, ordering, fencing, or failure truth.
- Proof: The normative clauses and their executable proofs, not this guidance.
- Trace: `ARCH-013B`, `ARCH-015`, `ARCH-024`, `ARCH-026`.
