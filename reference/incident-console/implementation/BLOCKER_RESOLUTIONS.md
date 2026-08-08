# vNext blocker resolutions

This ledger resolves every blocker and open question in `IMPLEMENTATION_BLOCKERS.md` for
the vNext contract pack. `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative. Where an
older statement in `DESIGN_DECISIONS.md` conflicts with this ledger, this ledger is the
correction that the implementation contracts encode.

## Blockers

### RES-B01 — Optimistic success does not create server truth

Optimistic layers MUST live in the shared resource store and MUST be identified by actor
ID, exact transaction ref, generation, exact target resource ref, and store-wide insertion
order. Every terminal outcome MUST remove only that generation's layers. Success MUST then
invalidate or refresh the authoritative base; it MUST NOT fold preview output into that base.
An authoritative response mapping is deferred from the first release.

### RES-B02 — The actor turn owns coherent publication

One mailbox command MUST produce a pure stabilized `TurnPlan`, reconciliation MUST produce
a `CommitPlan`, and one store command MUST return the post-commit projections and revision.
The initiating actor MUST then publish one immutable snapshot and acknowledge the command
before changed refs are fanned out to other actor mailboxes. State, memory, primitive
registries, receipts, issues, and the observed store revision MUST come from that one turn.

### RES-B03 — Boot is immutable constructor input

`flow.app({ id, persistenceVersion, modules })` MUST compile a pure inert `AppPlan`.
`flow.runtime({ app, layer?, boot? })` MUST decode and normalize boot before root activation,
and mutable `hydrateBoot` MUST NOT exist. `layer` MAY be omitted only when the app has no
unresolved requirements. The v2 envelope MUST identify Flow and definition versions, app
and persistence versions, actors and parentage, exact refs, one canonical store, and each
actor's observed store revision.

### RES-B04 — Dehydration is revision-consistent

Every actor snapshot MUST be internally atomic and record its observed store revision. A
dehydration operation MUST capture the canonical store once, but it MAY capture different
actors from slightly different instants. Hydration MUST rematerialize actor resource
projections from canonical store data and recorded refs. The default contract MUST NOT
claim global multi-actor linearizability.

### RES-B05 — Root handles exist before acquisition

`runtime.actor(machine)` MUST synchronously return only the compiled root actor;
`runtime.createActor(machine, { input, id? })` MUST create only an app-reachable dynamic
actor; and `actor.snapshots` MUST expose the atomic snapshot stream. The runtime constructor
MUST synchronously create the actor's real Effect Queue and snapshot store. Early public sends
MUST enter that Queue in order, while its single ManagedRuntime-owned consumer waits on shared
Layer acquisition. React MUST NOT create a no-op shell or a second command buffer. Acquisition
failure MUST reach runtime readiness and every waiting acknowledged dispatch.

### RES-B06 — Story send acknowledges one turn

Public `actor.send(event)` MUST remain synchronous and return `void`; it admits a command
but does not expose an acknowledgment. A package-private acknowledged dispatch MUST attach
an Effect `Deferred` and complete it only after that command's stabilized snapshot is
published. Story `.send` MUST use this path and MUST NOT wait for later asynchronous
operation settlement. Disposal MUST settle buffered acknowledgments before queue shutdown.

### RES-B07 — Activity identity and ownership are canonical

An active binding MUST be identified by declaration identity, descriptor ID, exact ref or
explicit canonical child, stream, or timer key, and outcome-map identity. A changed key or
outcome map MUST restart the binding. One actor configuration MUST NOT own `ensure(ref)` and
`observe(ref)` as separate executions of the same ref. Each activity MUST run as
`Effect.scoped`; it MUST NOT create and manually close a second child `Scope`. `FiberMap`,
`FiberSet`, and a supervised Queue worker own replacement, parallelism, and serialization,
while Flow generation checks still guard publication.

### RES-B08 — Effect requirements propagate through the app

Every descriptor's `Effect<A, E, R>` requirement MUST propagate through its machine graph,
module roots, and `AppPlan`. Runtime construction MUST reject a Layer that does not provide
the inferred application environment. Routed vocabulary ownership, transitive
reachability, root membership, and every globally addressed ID MUST also be validated.

### RES-B09 — Machine input has one shape

Machines MUST initialize actor-local memory with `memory: ({ input }) => Memory`. Module
roots MUST have `Input = void`; dynamic actors MUST receive typed input through
`runtime.createActor(machine, { input })`. Restoration MUST retain materialized memory and
MUST NOT replay input.

### RES-B10 — Full Cause determines the lane

Operation completion MUST use `Effect.exit` and retain the complete `Cause`. Any defect
selects the defect lane; otherwise any typed failure selects the domain-failure lane;
otherwise an interruption-only Cause selects the interruption lane. An empty or impossible
Cause is an internal defect. `Cause.squash` is permitted only at a JavaScript host boundary.

### RES-B11 — Capability projection belongs in views

State-dependent and payload-dependent capability projections MUST be authored in
`flow.view` and MAY call `flow.can(snapshot, exactEvent)`. `useActor` MUST remain a command
handle without a broad subscription. The package MUST NOT add `useCan`, duplicate machine
acceptance in a capability table, or broaden `useActor` to make direct `getSnapshot()` reads
reactive.

### RES-B12 — External lease representation follows behavioral ownership

The package MUST NOT add another operation primitive for remote leases. A behaviorally
significant lease lifecycle MUST be represented by a child actor with explicit states and
events. A purely operational continuing lease MAY be represented by a scoped stream built
with `Effect.acquireRelease` inside the scoped stream activity. Normal completion and
interruption MUST remain distinct,
release MUST run exactly once, and cleanup defects MUST enter actor issues.

## Open-question resolutions

### RES-Q01 — No implicit authoritative transaction publication

The first release uses overlay removal plus invalidation or refresh on success. A future
typed response-to-resource mapping MAY publish authoritative values, but preview output
MUST never be interpreted as that mapping.

### RES-Q02 — Serialized admission is unbounded FIFO

Serialized work MUST use an unbounded actor-local FIFO per canonical concurrency key.
Every accepted request MUST receive a generation at admission and MUST remain a distinct
attempt; identical refs MUST NOT deduplicate. State exit or disposal MUST stop the worker,
cancel active work, remove owned overlays, and discard queued work with cleanup
interruption facts but without routing outcomes for work that never began.

### RES-Q03 — Pending execution never resumes generically

Pending and queued transactions MUST restore as terminal interruption with a restoration
receipt and issue, MUST remove their materialized optimistic layers before first hydrated
publication, and MUST NOT route an outcome or automatically retry. In-flight resource
lookups MUST likewise normalize to retained canonical data plus ordinary post-restore
ownership policy.

### RES-Q04 — Ref arguments use the durable carrier

Resource and transaction ref arguments MUST themselves use the canonical finite JSON-like
carrier. The projected key alone is insufficient to restart work. The first release MUST
NOT add an alternative descriptor codec; decoded descriptor IDs MUST resolve through the
compiled `AppPlan`, never a process-global registry.

### RES-Q05 — Readiness has a synchronous host store

Runtime readiness MUST use a tiny synchronous immutable external store with `acquiring`,
`ready`, `failed`, and `disposed` states because Effect has no synchronous
`SubscriptionRef` constructor. `FlowProvider` MUST throw acquisition failure during render,
and SSR `getServerSnapshot` MUST return a prepared immutable value. Readiness MUST NOT be
modeled as a user-authored machine loading state.

### RES-Q06 — Observer equality and failure are deterministic

The observer MUST recursively reuse structure only for acyclic arrays and plain records,
then compare the selected root with `Object.is`. Cycles and opaque values MUST use identity.
A selector exception MUST be memoized for that actor revision so repeated reads of the same
revision throw the same failure without reevaluating; a later revision MAY evaluate again.

### RES-Q07 — Disposal publishes after cleanup

Disposal MUST stop admission, settle buffered acknowledgments, interrupt owned work, await
and classify every finalizer, publish one terminal disposed snapshot containing cleanup
truth, and then complete `actor.snapshots`. Runtime disposal MUST be idempotent and
non-abortable from Flow's perspective; a host MAY stop waiting but cleanup continues.

### RES-Q08 — Controlled endpoint collisions are exact and deterministic

Story controls MUST be keyed by endpoint kind and exact canonical target: exact resource
or transaction ref, canonical stream/activity key, or the unique clock/host-signal token.
Reusing the same definition object MAY share an endpoint. A different object claiming the
same endpoint identity MUST fail story preparation deterministically.

### RES-Q09 — Cancellation is an execution error with cleanup truth

Story cancellation MUST stop later commands, capture completed checkpoints and `atFailure`
when actor creation occurred, await runtime disposal, and reject with
`FlowStoryExecutionError`. The error MUST preserve the primary cause and cleanup result;
the public result MUST NOT add a competing status union.

### RES-Q10 — TurnRecords feed sinks rather than a second history

The runtime MUST NOT own a second mutable receipt, trace, or inspection history. One
immutable `TurnRecord` MUST feed configured sinks after actor publication.
`createInspectionBufferSink` MUST default to capacity 256 and MUST emit explicit truncation
markers when records are evicted. Artifacts MUST persist only records explicitly exported
from a sink; ordinary runtime buffering is not persistence.

### RES-Q11 — Roots are declared; other surfaces are reachable

Modules MUST declare public root machines and public root-bound views. Resources,
transactions, streams, children, services, and reusable machines MUST be inferred
transitively. `runtime.actor(machine)` MUST reject non-roots;
`runtime.createActor(machine, { input })` MUST accept only app-reachable machines.

### RES-Q12 — Existing child and stream forms cover leases

A child actor MUST own a remote lease whose acquisition, active state, replacement,
completion, or cancellation changes application behavior. A scoped stream activity using
`Effect.acquireRelease` MAY own a lease that only emits
continuing operational facts.
Neither convention permits ignored release failure, and no new lease primitive is added.
