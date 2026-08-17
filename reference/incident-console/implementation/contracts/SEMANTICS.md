# vNext runtime semantics

These rules define observable runtime behavior. Architecture and wire-format choices are
specified separately, but an implementation is conforming only when all three contract
files agree.

## Actor turns and publication

### SEM-001 — One mailbox orders every actor fact

Each actor MUST have one unbounded Effect Queue and one consumer. Accepted external events,
asynchronous completion facts, store-change facts, timer facts, and child facts MUST enter through
that Queue. Reentrant sends MUST preserve FIFO order. Disposal is the sole exception: it begins
through the out-of-band shell state in ARCH-025 so it can close a consumer blocked on readiness.

### SEM-001A — Fresh initialization precedes actor activation

A fresh actor MUST invoke its definition's pure memory factory exactly once with its admitted
input when that factory exists, otherwise materialize the canonical empty readonly memory
record. Before constructing its first snapshot, it evaluates the initial state's redirects with
the redirect context and no event until stable; intermediate states never publish or acquire work.
A restored actor MUST use its already-stable materialized state/memory and MUST NOT invoke the
factory or re-evaluate redirects. A factory throw, redirect callback defect, or 100-microstep
initial redirect loop fails actor creation without publishing a partial actor or starting owned
work.

### SEM-002 — Planning is pure and bounded

The consumer MUST stabilize an accepted event and its redirects into a pure `TurnPlan`
before acquiring or releasing work. Redirect stabilization MUST stop before attempting
microstep 101. During an event or timer turn, a redirect callback defect or bound failure retains
the prior published state, memory, bindings, and store facts, then publishes one active contained-
defect issue and TurnRecord; it never publishes the unstable candidate. Intermediate redirects
MAY create receipt intents, but only the final configuration owns activities.

The machine `states` record is exhaustive. For an event turn, planning reads the current state's
matching `on` entry, treats shorthand as one transition, and evaluates an authored list in order;
the first transition with an absent or truthy guard wins. No winner produces a normal
no-transition turn. Guards and `updateMemory` receive one frozen object containing the current
state token, readonly memory, complete current snapshot/readers, and exact causal event.
`updateMemory` runs once for the winner and shallowly merges its partial result over memory.
`reenter` defaults to false: a same-target transition retains the configuration activation unless
explicitly true, while a different target always replaces it. Redirects then evaluate in authored
order against the updated candidate snapshot and read only `{ state, memory, snapshot }`; they
never receive the original event. An absent `when` is the unconditional fallback; the first absent
or truthy candidate wins and stabilization repeats until none
matches or the bound fails. Timer guards/updates instead read
`{ state, memory, snapshot, timer: { name, startedAt, dueAt } }`; a timer never becomes a fake
domain event. A callback throw follows SEM-024A. `can(snapshot, event)` executes only the event-
transition selection and guard path without memory update, redirect execution, receipt creation,
issue publication, or mutation; it returns false for final nodes and when no transition wins, and
synchronously rethrows the original guard defect.

Entering a state declared `{ type: "final" }` is an ordinary stabilized turn and publishes one
ordinary snapshot whose value is that final token. The final node owns no activity. Reconciliation
releases the prior configuration only after final publication and TurnRecord acceptance. A root
actor remains active, readable, persistable, and runtime-owned until disposal; final entry does
not complete its snapshot stream or auto-dispose it. A later event is admitted normally and
produces an ordinary no-transition turn because a final node has no transition surface.

### SEM-003 — Reconciliation produces one CommitPlan

Reconciliation MUST translate a `TurnPlan` into a package-private immutable `CommitPlan`
describing store changes, desired activity ownership, primitive facts, receipt intents, and
issues. User Effects MUST NOT run inside pure planning or before the resulting actor snapshot
publishes. Async completion MUST NOT mutate actor or store state outside a later mailbox turn.

### SEM-004 — Store commit precedes one actor publication

The actor MUST first acquire the runtime-global TurnRecord commit permit and reserve/preflight the
next evidence sequence, failing before mutation on overflow. While holding that permit, it reserves
immediate ownership, submits one atomic store command, receives its
resource projections and revision, materialize actual issues and TurnRecord facts, and
publish exactly one immutable actor snapshot. It MUST then submit one TurnRecord to the
runtime hub with its closed sink-release gate, enqueue one package-private post-commit reconciliation fact for staged activity
starts/releases followed by every newly admitted pending-outcome ID in stable sequence order,
complete the command acknowledgment when present, open the sink gate, and release StoreFanout in
that order.
Hub acceptance MUST use the reserved evidence sequence without invoking sinks inline, then release
the commit permit only after the record is queued. Sink
processing starts after acknowledgment and cannot delay fanout or alter this committed
sequence. Because the post-commit fact is offered before acknowledgment, a later `.flush()` can
start staged work deterministically; `.send()` itself never waits for user Effects to start or
settle.

The StoreState commit through actor publication and TurnRecord-hub acceptance is one
uninterruptible, nonblocking critical section containing no user callback or Effect suspension.
Disposal either wins before the store commit and aborts the command, or waits until actor truth and
its TurnRecord are accepted; it MUST NOT interrupt a half-published turn. Staged work still has not
started and may be suppressed by disposal after that boundary.

### SEM-005 — Actor snapshots are complete turn boundaries

One snapshot MUST contain state, memory, resource and transaction projections, streams,
timers, children, issues, lifecycle, actor revision, and observed store revision from the
same turn. Receipts and publication evidence MUST be projected from TurnRecord and MUST NOT
be actor snapshot fields. The package-private `ActorState` MUST commit that public snapshot and
its durable binding cursors/pending outcomes in one modification; no fact may be exposed or
captured through an independently mutable source.

### SEM-006 — Public send is synchronous; story acknowledgment is private

`actor.send(event)` MUST synchronously admit the event and return `void`. It MUST NOT wait
for Layer acquisition, the actor turn, or asynchronous work. A package-private acknowledged
dispatch MUST use a command `Deferred` that completes after SEM-004 actor publication and
TurnRecord hub acceptance, but before sink processing or later asynchronous work. Story `.send`
MUST await that Deferred and nothing later. The dispatch allocates the Deferred and admits the
command synchronously at the shell edge before returning the awaiting Effect, so it remains usable
while the shared Layer is still acquiring.

### SEM-006A — Mapped activity outcomes have durable mailbox admission

Every mapped resource, transaction, stream, timer, or child outcome MUST first materialize one
package-private `PendingOutcome` while the actor commits the projection and cursor or consumed fact
that caused it. The record MUST contain actor ID, binding identity, activation and operation
generation or value revision where applicable, outcome kind, event token ID, opaque event payload,
and a stable outcome ID. Each actor owns one monotonic safe-integer `outcomeSequence`; the ID is derived from
actor ID and that sequence, while the record retains the source identity. Multiple outcomes from
one turn receive sequence numbers in stabilized binding declaration order. Recording the pending
outcome, advancing both its source cursor and actor outcome sequence, and publishing the actor turn
are one atomic actor-state decision. The mapped event MUST NOT exist only as an unpersisted Queue
offer. The causal TurnRecord MUST identify the admitted outcome ID without exposing its payload.
If admitting the batch would exceed `Number.MAX_SAFE_INTEGER`, the actor MUST fail its invariant
before increment, ID reuse, record insertion, or partial publication.

After publication and TurnRecord acceptance, and before acknowledging the causal command when it
has an acknowledgment, the actor offers one internal mailbox command for that outcome ID.
Processing the command MUST verify the pending record, apply the already
materialized event through ordinary transition planning, and remove the record in the same
committed turn whether the event is accepted or has become inapplicable. It MUST NOT rerun the
outcome mapper. Duplicate commands for an already-cleared ID are stale no-ops. Planned release or
binding replacement MUST NOT clear an admitted outcome; its ordinary mailbox event survives and
may become inapplicable. Only actor or runtime disposal MAY clear undelivered records as cleanup
without routing them. The event turn's TurnRecord MUST distinguish applied,
inapplicable-and-cleared, stale-duplicate, and disposal-cleared outcome IDs.

Boot MUST restore every pending outcome into the prepared `ActorState`, preseed its stable ID into
the real mailbox in sequence order after the first hydrated publication but before the actor
handle escapes, and then preseed one activation barrier command. The mailbox consumer still waits
for runtime readiness. It MUST drain all restored IDs before the barrier reconciles restored
activities, so no new completion or early host event can overtake them. This is durable
at-least-once command scheduling plus
actor-state deduplication, yielding exactly-once application of an outcome within one actor
lifetime. A captured runtime that continues running and a separately booted copy remain two
independent runtimes; dehydration is not a distributed handoff protocol.

The restored-activity barrier is the sole post-publication reconciliation exception to SEM-004's
tail-enqueued fact. After its hydrated publication and hub/gate boundary, the consumer starts the
desired restored ownership as a nonblocking continuation before taking the next Queue item. With a
preseeded mailbox `[restored outcomes..., barrier, early host events...]`, restored outcomes
therefore apply first, restored activities activate second, and early host events run third.
Ordinary event turns still tail-enqueue reconciliation, preserving the explicit story `flush`
boundary.

### SEM-007 — Snapshot streams replay the current truth

`actor.snapshots` MUST emit atomic actor snapshots, replay the latest snapshot to a late
subscriber, emit the terminal disposed snapshot, and then complete. `getSnapshot()` MUST
return the same latest immutable value synchronously.

## Resource-store semantics

### SEM-008 — StoreState is the only canonical resource authority

One immutable `StoreState` MUST contain authoritative resource bases, lookup generations,
ordered optimistic overlays, store revision, and an ordered, canonically deduplicated immutable
`changedRefs` vector valid only for that revision.
Actor snapshots contain projections and exact referenced identities, not independent
canonical copies.

### SEM-009 — Store revisions are monotonic commit identities

Every base, overlay, generation, freshness, invalidation, hydration, or eviction change
MUST advance the store revision. A consumer that observes a revision jump MUST reread the
whole relevant projection rather than assuming the latest `changedRefs` vector covers skipped
revisions.

StoreFanout MUST deliver revision facts through actor mailboxes. A recipient ignores a
revision less than or equal to its observed revision; for a newer revision it reads current
StoreState rather than a historical value. Autonomous freshness and collection commits MAY
fan out immediately because they have no initiating actor publication barrier.

### SEM-010 — Exact refs identify parameterized resources

Resource identity MUST be exactly the descriptor ID plus the canonically encoded exact argument
tuple retained by `resource.ref(...args)`. No projected key, hash, equality callback, lookup URL,
tag, or returned value may participate. Canonically equal tuples from one descriptor MUST resolve
to one ref; different tuples MUST remain distinct in ownership, lookup deduplication, snapshots,
inspection, persistence, and garbage collection. The store MUST retain the arguments needed to
rerun `lookup`, `tags`, and `placeholder` without reconstructing them from another identity.

### SEM-011 — Ownership, observation, freshness, and collection are separate

Only stabilized actor activities MAY acquire resource leases or authorize active refresh.
Views, React subscriptions, inspection, and passive actor projections MUST NOT affect lease
count, refresh, stale time, or collection time. Freshness expiry and collection MUST publish
through ordinary StoreState commits driven by Effect Clock.

`staleTime` starts at canonical update, with a default of zero; expiry marks data stale without
starting work. `gcTime` starts only after the last machine owner and in-flight lookup release
the ref, defaults to five minutes, and may be infinite. Ensure reuses fresh data, refresh always
replaces the exact-ref generation, and active observe ownership ensures missing/stale data and
authorizes stale focus/reconnect refresh. Exact-ref owners join one store-global lookup
generation.

A successful value always publishes as fresh first. `staleTime: 0` schedules a separate same-time
StoreState turn that marks it stale; `gcTime: 0` similarly schedules collection only after the
last eligible release and never folds collection into the success or release commit. Effect
scheduler order plus store mailbox order is authoritative for equal deadlines.

Browser online state is an advisory refresh signal, not lookup admission authority. An offline
fact MUST NOT block explicit ensure, observe, or refresh activation and MUST NOT cancel or pause an
in-flight generation. A reconnect or focus fact starts a lookup only for an actively observed exact ref
that is missing or stale and has no current in-flight generation. It leaves fresh refs and joined
existing generations unchanged. Application machines remain free to gate their own activities
from explicit domain connectivity events; Flow exposes no generic paused resource state.

`tags(...args)` is evaluated exactly once when StoreState first materializes a new exact-ref
lifetime. Flow validates, deduplicates in first-seen order, freezes, and retains that tag vector
until the ref is collected; invalidation never enumerates descriptors or reruns tag callbacks. A
tag callback defect prevents materialization and lookup. `placeholder(...args)` is evaluated once
for each new empty lookup generation after the pending generation publishes but before lookup
execution starts; a defect settles that generation as a contained defect with no base mutation and
no lookup call. A synchronous throw while invoking `lookup`, transaction `commit`, or stream
`subscribe` is the defect of the already-published operation generation, not a construction
failure.

### SEM-011A — Finite resource outcomes belong to one binding activation

Each `ensure` or `refresh` binding has one actor-local activation generation and may emit at most
one terminal mapped outcome before becoming consumed. Activation against a fresh canonical base
MUST publish the active binding and pending `success(currentValue)` first, then enqueue its
internal outcome command as a later mailbox fact without starting a lookup. Activation against
retained stale or invalidated data MUST keep
that value visible, start or join the current exact-ref lookup, and MUST NOT emit success for the
retained value. Activation without canonical data may project a placeholder but MUST NOT emit an
outcome for it.

A consumed finite binding retains its resource lease until its containing configuration
activation releases or reenters. Consumption stops routing; it does not silently change ownership
or begin GC.

Every accepted finite binding MUST register against one exact lookup generation. Owners that join
one store-global lookup share execution but not outcome ownership: successful completion records
one pending `success(result)` for every still-current registered finite binding, and typed
failure, defect, or non-release interruption records the corresponding outcome once for each such
binding. The actor turn that projects the completion, retained-value failure issue, or refreshed
metadata MUST publish with those pending outcomes before their internal commands are enqueued.
Replacement by a newer lookup generation is Flow-planned cancellation: every still-current finite
or observe registration moves atomically to the replacement generation and the canceled generation
routes no interruption. Planned refresh replacement, transaction `cancel`, stream/child parameter
replacement, state exit, reentry replacement, actor disposal, and runtime disposal are releases
governed by `SEM-021` and MUST NOT route interruption. Only an otherwise-current operation that
self-interrupts or is interrupted by an external dependency outside Flow ownership may emit its
authored `interrupt()` mapping.

A finite success is the lookup result even when it is `Object.is`-equal to the retained canonical
value. An unrelated canonical replacement, invalidation-only commit, freshness-only commit,
overlay-only commit, collection, or projection reread MUST NOT settle a finite binding that is
registered to another lookup generation.

### SEM-011B — Observe emits canonical value revisions, not store noise

Each active `observe` binding MUST retain a package-private `lastEmittedValueRevision`. On fresh
activation it MUST publish the active binding and pending current canonical value exactly once,
then enqueue its internal outcome command. On stale or invalidated activation it MUST do the same
and also start or join a lookup; the
retained value is an initial observation, not finite success. With no canonical base it emits no
value until a lookup installs one. Every later canonical value revision for the exact ref MUST
record one pending `value(newValue)` for each still-current observe binding in the actor turn that
publishes the projection containing the revision, then enqueue its internal command regardless of
which owner started the successful lookup.

Each canonical base stores a package-private `valueRevision`. Installing the first value or a
value for which `Object.is(previous, next)` is false increments it. A successful equal-value
lookup MUST still update canonical timestamps and freshness and settle joined finite bindings,
but it MUST NOT increment `valueRevision` or emit another observe `value`. Flow MUST NOT expose a
descriptor equality callback or apply recursive structural equality in the StoreKernel.
Invalidation-only, freshness-only, generation-only, overlay-only, and GC metadata commits do not
increment `valueRevision` and MUST NOT emit observe `value`. Lookup failure, defect, or
non-release interruption emits its mapped outcome once per exact lookup generation joined by the
still-current observe binding; retained canonical data stays visible. Planned release emits no
outcome.

Hydration MUST restore each binding's activation/consumed state and value-revision cursor without
rerunning its selector or replaying an already emitted outcome. A consumed finite binding stays
consumed. An active finite binding is reconciled only after the first hydrated publication: a
fresh canonical base settles it once, otherwise it starts or joins ordinary lookup policy. An
active observe binding emits nothing for a revision at or below its restored cursor; if the closed
store capture contains a newer canonical value revision than the actor had observed, it emits the
latest value once after the first hydrated publication. Normalizing serialized execution never
emits a synthetic failure or interruption route.

### SEM-012 — Placeholder data is an active projection only

A descriptor placeholder MAY appear only while a lookup generation is active and no
canonical value exists. It MUST use `availability: "placeholder"`, MUST NOT be persisted or
written into the canonical base, MUST NOT produce success, and MUST disappear when that
lookup settles.

### SEM-013 — RcMap leases do not own data

RcMap MUST own exact-ref activity leases and idle-GC timing only. RcMap invalidation MUST
NOT implement Flow stale-data invalidation. An expiry finalizer MAY evict canonical data
only with `evictIfLeaseEpoch(ref, token)`, so an old Scope cannot evict a reacquired lease.

### SEM-014 — FiberMap replacement still needs Flow generations

FiberMap MUST own keyed lookup replacement and cancellation, but every completion MUST
compare the exact ref and Flow generation immediately before committing. Removal or old
fiber finalization MUST delete an in-flight entry only when it still owns that generation.

## Transactions and activities

### SEM-015 — Exact transaction refs own generations

Transaction execution, actor-visible snapshots, routes, receipts, pending work, and
persistence MUST use exact transaction refs rather than descriptor IDs. Every completion
MUST match actor ID, exact ref, and generation before it may publish or route.

Actor-visible terminal projection MUST follow the binding in the current configuration as
specified by SNAP-007. Older generations and refs whose bindings left the configuration belong
in TurnRecords, not an actor-lifetime transaction map.

### SEM-016 — Optimistic overlays are global and ordered

The shared store MUST identify each optimistic layer by actor ID, exact transaction ref,
generation, exact target ref, and store-wide insertion order. Multi-ref preview application
and removal MUST be atomic, and replay MUST preserve insertion order across actors.

### SEM-017 — Preview output never becomes authoritative implicitly

Success MUST remove the successful generation's layers and invalidate or refresh its
declared targets. Typed failure, defect, interruption, restoration, and disposal MUST also
remove only their own layers. VNext transaction and stream outcomes cannot write canonical
resource bases. Server-returned values may enter typed
machine events and memory, while canonical resource truth changes only through the resource
lookup path. Arbitrary cache mutation and authoritative-response mapping are explicit vNext
non-goals.

### SEM-017A — Managed children complete autonomously

Entering a child's final state publishes its exact final child snapshot before the parent is
notified. The owning parent binding then materializes at most one `complete(finalSnapshot)` mapped
outcome, marks its child projection complete, and releases the child actor after that pending
outcome has durable admission. The binding retains its terminal complete projection while the same
parent configuration activation remains current; reentry or a changed canonical key creates a new child
generation. Boot restores a terminal child and consumed completion cursor without restarting it or
replaying completion.

A child machine has no typed failure channel. A contained child defect publishes terminal
`defect`; external or parent interruption publishes `interrupt`; planned binding release publishes
`stopped`. These lanes route only when the child binding explicitly authors the corresponding
outcome mapper, except planned `stopped`, which never routes. Every terminal lane retains its
projection for the current parent activation and releases the child Scope exactly once.

Managed child bindings accept no parent commands. A changed canonical key is replacement, not
message delivery; equal key retains the original materialized input even if a later selector
returns another opaque value. Independently commandable workflows use host-owned dynamic actors admitted
by the AppPlan.

### SEM-018 — Serialized admission is unbounded FIFO

Transaction concurrency is actor-local per exact transaction ref; the canonical concurrency key
is the length-prefixed actor ID plus exact ref identity. There is no public transaction `scope` and
no cross-actor Flow scheduler. Serialized transactions MUST use one unbounded Queue and one
supervised worker per canonical concurrency key. A generation MUST be allocated at accepted admission, every
request MUST remain distinct, and identical refs MUST NOT deduplicate. State exit and
disposal MUST cancel active work and discard queued work without routing completion for an
attempt that never began.

For `allow`, every admitted generation runs and settles its own overlays and TurnRecord. Once a
newer generation has been admitted for that actor/ref, an older completion MUST NOT replace the
actor's current transaction projection or route a domain outcome. `reject` admits no second
generation while one runs, and `cancel` interrupts/finalizes the prior generation without routing
its interrupt mapper before admitting the replacement.

### SEM-019 — Activity identity uses stable compiled slots

Activity identity MUST include the stable AppPlan binding slot, descriptor ID, exact ref,
materialized invalidation target vector, or explicit canonical child, stream, or timer key. The
outcome map belongs to that compiled slot and never contributes function allocation identity. A changed
ref, target vector, or key MUST release the old binding and acquire a
new one. Two bindings resolving to the same identity in one stabilized configuration MUST be
rejected.

Each finite resource/invalidation binding starts at most once in one configuration activation
generation. A terminal finite binding becomes consumed and MUST NOT restart merely because an
unrelated event republishes the same configuration. Removal followed by reactivation, changed
identity, or explicit transition `reenter` creates a new activation generation.

`activity.run` is deliberately edge-triggered rather than a retained finite binding. Fresh state
activation and each accepted domain-event or timer turn whose selector returns params admits one
distinct transaction attempt under `reject | cancel | allow | serialize`; a no-transition event
may therefore admit an attempt while the same configuration remains active. Store-fanout,
operation-completion, outcome, and other `event: null` reconciliation turns admit nothing and do
not release an already admitted attempt. State exit, explicit reentry, actor disposal, or runtime
disposal cancels every active/queued attempt owned by that configuration. Boot MUST
restore materialized active and consumed bindings without rerunning selectors or implicitly
retrying finite or already-terminal work. Reconstructing captured desired ownership for a
previously running continuing stream follows `WIRE-011A`: it is one fresh scoped subscription,
not retry or continuation of serialized execution.

A timer is one-shot per configuration activation. Its due fact consumes the scheduled generation
exactly once whether its guard accepts or rejects the transition, publishes `status: "fired"`, and
cannot reschedule on an unrelated same-state/non-reentering turn; changed state or explicit reentry
creates a new generation. A planned state exit removes it to idle without an interrupt outcome,
while actor/runtime disposal may retain `interrupt` in the terminal disposed snapshot. Equal
deadlines are offered in raw actor-ID order and then stable compiled timer-slot order, independent
of hash-map or fiber scheduling. Deadline addition is checked as a non-negative safe integer before
scheduling; overflow fails that timer activation before mutation.

### SEM-020 — Scope ownership is singular

Every actor-local activity binding MUST run as `Effect.scoped` under the actor's managed ownership. Keyed work
uses FiberMap, independent parallel work uses FiberSet, and serialized work uses a Queue
worker. The activity MUST NOT create a manually managed second child Scope. Release and
finalization MUST run exactly once in reverse acquisition order where ordering applies.

An exact-ref lookup is store-global execution rather than actor execution. StoreKernel's runtime
Scope owns its FiberMap generation and temporary in-flight lease; actor Scopes own registrations
and activity leases. Actor release removes only that registration, and StoreKernel interrupts the
lookup only for exact-ref generation replacement or runtime disposal. With no registrations it may
still settle and warm canonical data under its in-flight lease, after which ordinary GC policy
applies. A joined owner therefore survives departure of the owner that first caused the lookup.

When freshness expiry, invalidation, explicit refresh, lookup replacement, lease reacquisition, and
an old GC finalizer meet at one Clock instant, there is no timestamp-wide batch merge. Each offered
fact acquires the ordinary StoreKernel command/commit order and produces at most one StoreState
revision. Generation checks suppress superseded lookup completion, lease epochs suppress old GC,
and reacquisition before an old eviction commit preserves the new owner. After the ordered facts
drain, at most one current lookup generation exists for the exact ref and no stale expiry or GC fact
may mark or remove a base installed by a later revision.

### SEM-021 — Planned release is cleanup, not a routed outcome

Leaving an owning configuration MUST release its activities and MAY publish cleanup facts,
but it MUST NOT synthesize a domain outcome route. Cleanup defects MUST enter issues and
receipts without rolling back an already published transition.

### SEM-022 — Existing primitives represent continuing leases

A behaviorally significant remote lease MUST be a child actor. A purely operational
continuing lease MAY be a scoped stream activity whose acquisition uses
`Effect.acquireRelease`. Normal completion,
interruption, and release failure MUST remain distinguishable, and release MUST run exactly
once. No separate lease operation kind is permitted.

## Failure, disposal, and observation

### SEM-023 — Full Cause determines classification

Runtime operation completion MUST retain `Exit` and full `Cause`. Classification precedence
is defect, then typed failure, then interruption-only. Empty or unclassifiable failure is an
internal defect. Cause squashing is allowed only while adapting to a JavaScript throw or
rejection boundary.

### SEM-024 — Disposal completes ownership before publication

Disposal MUST stop admission, settle every buffered acknowledged command, interrupt owned
work, await and classify all finalizers, publish one disposed snapshot containing cleanup
truth, and complete the snapshot stream. It MUST be idempotent. A host may abandon its wait,
but Flow cleanup MUST continue.

### SEM-024A — Actor failure has no failed snapshot lifecycle

Actor lifecycle MUST be `active | disposed`. A user callback defect contained before the
StoreState commit MUST retain the previous state, memory, bindings, and observed store
revision, then publish one active turn with the minimal public issue summary while retaining
the full Cause in its TurnRecord. A Flow invariant
defect MUST close admission, fail the current and buffered acknowledged commands, finalize
owned work, and publish the single disposed snapshot with fatal and cleanup truth. The
post-store-commit publication path MUST use non-failing primitives; committing StoreState
and abandoning actor publication is an invariant violation, not a recoverable snapshot.

Callback defects follow this exact boundary matrix:

- transition guards, redirects, timer guards, memory updates, binding selectors, key projections,
  preview builders, and invalidation target selectors fail before StoreState commit and retain the
  prior state, memory, binding, and store facts;
- resource placeholder and tag callbacks fail before base mutation, fail only the affected binding
  activation, and start no lookup;
- an outcome mapper that fails after canonical store or primitive settlement retains that committed
  truth, marks the affected binding generation consumed with a defect issue, records the full Cause,
  and admits no partial PendingOutcome;
- a view selector changes no runtime state; MachineObserver memoizes and rethrows it under SEM-026.

### SEM-024B — Issue identity has one clearing owner

An operational issue occurrence uses SNAP-001's generation-bearing ID, while its clearing-owner key
is actor plus source plus exact binding/ref without an attempt generation. Success or release by a
later generation of that same owner clears older operational occurrences; unrelated success cannot
clear them.
Invariant and cleanup issues survive through the terminal disposed snapshot. Full Cause remains in
TurnRecords even after an operational summary clears.

### SEM-025 — Views are passive capability projections

State- and payload-dependent capability values MUST be projected by authored views using
`flow.can(snapshot, exactEvent)`. Views MUST remain pure and MUST NOT acquire resources,
authorize refresh, or duplicate transition acceptance. `useActor` MUST remain an
unsubscribed command handle.

### SEM-026 — Observer structural reuse is deterministic

A MachineObserver MUST recursively reuse structure only for acyclic arrays and plain
records, then compare the selected root with `Object.is`. Cycles and opaque values use
identity. A selector exception MUST be memoized per actor revision and rethrown for every
read of that revision; evaluation MAY resume on a later revision.

### SEM-027 — Readiness is host state, not machine state

Runtime acquisition MUST expose synchronous immutable `acquiring`, `ready`, `failed`, and
`disposed` states. Acquisition failure MUST reach renderers and waiting acknowledged
dispatches. This lifecycle MUST NOT be represented as a user-authored machine loading
state.
