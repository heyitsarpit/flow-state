# vNext runtime semantics

These rules define observable runtime behavior. Architecture and wire-format choices are
specified separately, but an implementation is conforming only when all three contract
files agree.

## Actor turns and publication

### SEM-001 — One mailbox orders every actor fact

Each actor MUST have one unbounded Effect Queue and one consumer. Accepted external events,
asynchronous completion facts, store-change facts, timer facts, child facts, and disposal
commands MUST enter through that Queue. Reentrant sends MUST preserve FIFO order.

### SEM-002 — Planning is pure and bounded

The consumer MUST stabilize an accepted event and its redirects into a pure `TurnPlan`
before acquiring or releasing work. Redirect stabilization MUST stop after 100 microsteps
with a structured issue. Intermediate redirects MAY create receipts, but only the final
configuration owns activities.

### SEM-003 — Reconciliation produces one CommitPlan

Reconciliation MUST translate a `TurnPlan` into a `CommitPlan` describing store changes,
activity ownership changes, primitive facts, receipts, and issues. User Effects MUST NOT run
inside pure planning, and an asynchronous completion MUST NOT mutate actor or store state
outside a later mailbox turn.

### SEM-004 — Store commit precedes one actor publication

The actor MUST submit one atomic store command and receive the resulting resource
projections and store revision. It MUST then materialize and publish exactly one immutable
actor snapshot for the command. Changed refs MAY be fanned out to other actors only after
the initiating actor has published.

### SEM-005 — Actor snapshots are complete turn boundaries

One snapshot MUST contain state, memory, resource and transaction projections, streams,
timers, children, receipts, issues, and the observed store revision from the same turn.
Those facts MUST NOT be published through independently mutable public sources.

### SEM-006 — Public send is synchronous; story acknowledgment is private

`actor.send(event)` MUST synchronously admit the event and return `void`. It MUST NOT wait
for Layer acquisition, the actor turn, or asynchronous work. A package-private acknowledged
dispatch MUST use a command `Deferred` that completes after SEM-004 publication. Story
`.send` MUST await that Deferred and nothing later.

### SEM-007 — Snapshot streams replay the current truth

`actor.snapshots` MUST emit atomic actor snapshots, replay the latest snapshot to a late
subscriber, emit the terminal disposed snapshot, and then complete. `getSnapshot()` MUST
return the same latest immutable value synchronously.

## Resource-store semantics

### SEM-008 — StoreState is the only canonical resource authority

One immutable `StoreState` MUST contain authoritative resource bases, lookup generations,
ordered optimistic overlays, store revision, and the changed-ref hint for that revision.
Actor snapshots contain projections and exact referenced identities, not independent
canonical copies.

### SEM-009 — Store revisions are monotonic commit identities

Every base, overlay, generation, freshness, invalidation, hydration, or eviction change
MUST advance the store revision. A consumer that observes a revision jump MUST reread the
whole relevant projection rather than assuming the latest changed-ref hint covers skipped
revisions.

### SEM-010 — Exact refs identify parameterized resources

Resource identity MUST include descriptor ID and canonical arguments. Two refs from one
descriptor family MUST remain distinct in ownership, lookup deduplication, snapshots,
inspection, persistence, and garbage collection.

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

### SEM-012 — Placeholder data is an active projection only

A descriptor placeholder MAY appear only while a lookup generation is active and no
canonical value exists. It MUST be marked as placeholder data, MUST NOT be persisted or
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
remove only their own layers. No outcome may publish preview output into the base unless a
future explicit authoritative-response contract says so.

### SEM-018 — Serialized admission is unbounded FIFO

Serialized transactions MUST use one unbounded Queue and one supervised worker per
canonical concurrency key. A generation MUST be allocated at accepted admission, every
request MUST remain distinct, and identical refs MUST NOT deduplicate. State exit and
disposal MUST cancel active work and discard queued work without routing completion for an
attempt that never began.

### SEM-019 — Activity identity includes mapping identity

Activity identity MUST include declaration identity, descriptor ID, exact ref or explicit
canonical child, stream, or timer key, and outcome-map identity. A changed key or mapping
MUST release the old binding and acquire a new one. Two bindings resolving to the same
identity in one stabilized configuration MUST be rejected.

Each finite binding starts at most once in one configuration activation generation. A
terminal finite binding becomes consumed and MUST NOT restart merely because an unrelated
event republishes the same configuration. Removal followed by reactivation, changed
identity, or explicit transition `reenter` creates a new activation generation. Boot MUST
restore materialized active and consumed bindings without rerunning selectors or implicitly
retrying work.

### SEM-020 — Scope ownership is singular

Every activity MUST run as `Effect.scoped` under the actor's managed ownership. Keyed work
uses FiberMap, independent parallel work uses FiberSet, and serialized work uses a Queue
worker. The activity MUST NOT create a manually managed second child Scope. Release and
finalization MUST run exactly once in reverse acquisition order where ordering applies.

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
