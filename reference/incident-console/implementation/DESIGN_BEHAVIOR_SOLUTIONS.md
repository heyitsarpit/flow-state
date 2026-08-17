# Flow State vNext behavioral solution proposal

Status: proposed internal architecture and semantics; not yet accepted

This file proposes one coherent closure for
[`DESIGN_BEHAVIOR_GAPS.md`](./DESIGN_BEHAVIOR_GAPS.md). It does not change the accepted public API in
[`DESIGN_REVISIONS.md`](./DESIGN_REVISIONS.md), and it is not normative until its decisions are
explicitly accepted and promoted into the implementation contracts. Public names, constructors,
hooks, actor/ref/lease capabilities, Story commands, operation families, context authoring, and the
deletion of child machines remain fixed.

The design uses one small serialization kernel for publication while leaving external work,
selectors, context propagation, finalizers, and Story sinks concurrent. That gives every observable
fact one order without turning the runtime into a single-threaded executor.

## 1. Runtime kernel

Each compiled `AppPlan` describes a sealed universe of definitions, operation descriptors, context
slots, and module ownership. A live runtime separately owns a changing instance graph. The internal
`RuntimeCore` contains:

- a bootstrap coordinator that owns Layer acquisition, boot installation, factory registration,
  graph validation, activation, rollback, and readiness;
- a short-held commit coordinator that serializes state replacement, store replacement, lifecycle
  publication, occurrence admission, evidence sequence allocation, and checkpoint pointer capture;
- an actor directory and context graph registry, with tombstones retained for the runtime incarnation;
- one actor cell per live actor, containing the immutable published snapshot pointer, mailbox,
  lifecycle lane, context state, occurrence ledgers, issues, and observers;
- a context-wave coordinator that drains the acyclic provider graph outside the commit coordinator;
- a store kernel containing immutable entry records, descriptor/tag/family reverse indexes, resource
  generations, transaction-owned overlays, and fanout subscriptions;
- an atomic-read coordinator that gives selectors one actor-and-store cut and tracks passive store
  dependencies;
- a clock cell whose immutable `{ now, version }` pointer is updated by the scheduler through the
  commit coordinator, allowing checkpoint capture without calling Clock under the permit;
- an operation host that begins external descriptor execution only after production admission and
  initial status publication; and
- one evidence hub that sequences turns, lifecycle changes, store facts, and diagnostics and fans
  them out to inspection, Story, artifacts, and host sinks.

The commit coordinator is a synchronous critical section, not an executor. No Effect, stream pull,
finalizer, selector, context wave, callback, sink, or filesystem operation runs while it is held.
Concurrent actors may plan and execute external work in parallel, then enter the coordinator only to
validate their fences and replace immutable pointers. This keeps the correctness model simple while
making contention proportional to publication rate rather than effect duration.

Lock order is always commit permit, then actor-directory read lease, then immutable actor/store
pointers. Dehydration alone adds a context-closure barrier before taking that order. No other path may
acquire those owners in reverse order.

## 2. Bootstrap, identity, admission, and ownership

`RuntimeFactory<App>` is the accepted inert callable, defined exactly as a callable taking the typed
host and returning the synchronously created acquiring runtime shell, plus a readonly structural
`app: App` property.
Discovery reads only `factory.app`; it never invokes the callable, allocates a runtime, acquires a
Layer, or registers an actor. Inside the call, the factory uses the existing runtime constructor and
performs all initial `ensureActor` registrations before returning; return closes registration and
starts graph validation. Internally, the runtime constructor keeps bootstrap registration open only
through the current JavaScript job and seals it in the queued bootstrap continuation after the
synchronous factory returns; async factory registration is rejected. The shell exposes only readiness and disposal while acquiring, and
`runtime.ready()` is the cached asynchronous activation boundary. This avoids a second registration
callback or pre-ready owner API and preserves the existing Provider readiness path.

```ts
type RuntimeFactory<App> = {
  readonly app: App;
  (host: RuntimeHost<App>): FlowRuntime<App>;
};
```

Bootstrap performs this exact sequence:

1. It validates and decodes boot data, allocates a private `RuntimeCore`, and opens the root scope.
2. It borrows the host's Clock, operation executor, fixtures, and persistence capability, then
   acquires the application Layer and runtime-owned evidence attachments in its own root scope.
3. It installs the store and stable actor cells from boot without activating them.
4. At the queued bootstrap continuation, it seals the synchronous factory-registration window. Every
   restored actor must have been claimed by an exact `ensureActor`; an unclaimed boot actor fails with
   `UnclaimedBootActor`.
5. It ignores fresh input for restored actors and never reruns their initializer. It validates the
   exact restored context bindings, resolves every provider, rejects duplicates, foreign refs,
   disposed refs, and instance cycles, then installs silent context baselines.
6. It publishes the prepared restored actor roots, drains restored pending outcomes through the
   production mailboxes, then reconciles continuing declarations to rematerialize executable inputs.
   Only after successful reconciliation does it stage external work and activate in dependency order.
7. It resolves readiness and exposes the runtime. Failure or interruption closes every acquired owner
   in reverse order, runs every cleanup, and reports the primary failure plus ordered cleanup defects.

Post-bootstrap `createActor` and `ensureActor` use one admission transaction. They reserve identity,
resolve and validate the whole context edge set, compute the initial memory and silent context
baseline, insert the actor and edges, and publish activation under one commit. Failure removes the
reservation and exposes no handle or partial graph.

Possession of the public runtime is the owner capability for `ensureActor`; this is an authority
boundary, not a security boundary. `FlowProvider` internally narrows the runtime to a consumer view
that has lookup, local React construction, observation, and command capabilities but cannot call
owner operations. Concurrent ensures join one construction and return the same interned owner lease;
its `dispose` is idempotent and there is no reference count or independent lifetime per caller.

Stable IDs use the existing authored-ID grammar with a maximum of 256 UTF-8 bytes. A durable ref key
contains only length-prefixed serialized machine identity and stable ID, so refs remain app-independent
and any app admitting that exact machine may use one. Persisted actor-record identity separately
prefixes the runtime app identity. A prepared opaque ref contains the runtime brand and a fresh frozen
object-identity token; it mutates no runtime counter or registry during render. Attachment may allocate
a bounded diagnostic ordinal, but that ordinal is not identity and is never serialized. The compiler
assigns one module owner to each exact machine value and rejects duplicates across keys or modules;
moving module ownership changes artifacts but not persisted actor identity.

Dehydration includes every live stable actor owned by the runtime, whether ensured during bootstrap
or later, plus the transitive stable provider closure. Suspended actors are included, disposed
tombstones are not, and an opaque actor in the durable closure fails closed. Hydration cannot invent
ownership: each restored actor must be claimed by the current factory before activation.

## 3. Publication, evidence, and atomic reads

Every actor has two revisions. The existing public `snapshot.revision` is a publication revision and
advances for any observably different immutable snapshot, including lifecycle and issue changes. A
package-private turn revision advances only for real machine, context, timer, or operation-result
turns. Persistence and domain replay correlate with turn revision; runtime evidence carries both
where applicable. View selection identity additionally includes StoreState revision and selector
identity, because a passive shared-store dependency may change without an actor publication.

One ordered `RuntimeEvidenceRecord` stream contains `TurnRecord`, `LifecycleRecord`, and
`DiagnosticRecord`. Actor-owned store changes stay inside their committing `TurnRecord`; a trusted
host-only store mutation uses a `DiagnosticRecord` with the resulting store revision, so one mutation
is never reported twice. The commit coordinator assigns one runtime sequence at the same commit that
publishes the referenced pointers. Inspection attachments remain bounded, nonblocking, and explicitly
truncation-aware; Story installs no implicit history sink, checkpoints capture immutable roots, and a
requested trace uses the ordinary bounded inspection attachment. Sink execution and failure never
delay a later runtime commit or StoreFanout.

The sequence is a safe integer. Admission preflights a reserve of one terminal lifecycle record per
live actor, one unsubscribe record per active package-private observer attachment, and one runtime
terminal diagnostic; ordinary work rejects before consuming that reserve. Detaching an observer
releases its unused reserve or spends it on unsubscribe. Runtime disposal spends remaining reserves
in raw actor-identity order, so exhaustion cannot prevent cleanup evidence.

Lifecycle records use one closed cause union: start is `imperative-create`, `ensure-fresh`,
`boot-restore`, or `react-attachment`; suspend is `react-effect-cleanup` or
`runtime-host-suspend`; resume is `react-effect-setup` or `runtime-host-resume`; dispose is
`owner-dispose`, `runtime-dispose`, `bootstrap-rollback`, or `invariant-failure`. React never tells
Flow whether a cleanup is Strict Mode rehearsal, Activity hiding, or final unmount, so evidence does
not claim that distinction.

A checkpoint takes the commit permit briefly and captures immutable actor pointers, store pointer,
pending-work registry pointer, evidence sequence, and clock-cell pointer from one commit boundary. It
does not hold the permit while decoding or rendering evidence. Context propagation may be pending at
that instant, so the checkpoint may truthfully show a new provider publication and an older consumer
publication together with the pending context wave. Dehydration is stronger: it waits for a
context-closed boundary, takes the same cut, verifies every recorded provider revision, and retries
with `ConcurrentDehydrate` if the closure changed.

`useView` evaluates inside a `SelectionFrame` containing one actor snapshot, one StoreState root, and
that root's epoch. Every `O.getData(K)` or `O.getState(K)` records its canonical store entry in the
frame. Successful evaluation installs new dependencies before removing old ones, then compares the
current root epoch; a mismatch discards the result and reevaluates, preventing a lost intervening
write. Selection memoization keys on actor publication revision, StoreState revision, and selector
identity. A selector defect retains the old dependencies internally but memoizes and rethrows the
defect for that identity; it never returns the old value as a successful selection. The 257th distinct
entry throws `ViewDependencyLimitExceeded`, installs no partial dependency set, and is rethrown until
the read identity changes. Passive reads never create an entry, acquire ownership, affect freshness,
or start work.

## 4. Actor lifecycle, React, and context

An actor cell serializes attach, suspend, resume, and dispose through one lifecycle lane. Internal
phases such as `suspending`, `suspended-clean`, `suspended-failed`, and `resuming` prevent overlapping
generations, while the public lifecycle remains the accepted four-state union.

Suspension closes new admission, synchronously detaches subscriptions and continuing ownership,
fences cancellable generations, normalizes published operation state, and publishes `suspended` in
one commit. The owned fibers and registrations are structurally detached before publication, so an
asynchronous finalizer defect cannot leave actor-owned live work even if external cleanup reports
failure. Finalizers run outside the commit coordinator, and resume joins them before it can reconcile
or activate. A defect leaves the actor publicly suspended and internally `suspended-failed`, records
the issue, and makes resume reject with the cleanup cause; only explicit lease or runtime disposal may
make it terminal.

Work follows one exact suspension table:

- queued transactions are removed and published interrupted. Active transaction fibers receive an
  interruption request: an interrupt exit settles as cancelled, while work that remains running after
  its scope closes is classified as uninterruptible detached work and retains its truthful outcome for
  the actor's resume. Flow needs no unobservable point-of-no-return marker;
- unsettled external finite occurrences are interrupted and never replayed. Synchronous `setData`,
  invalidation, clear, and cancellation already committed with a turn remain historical facts. A
  completion already admitted to the commit coordinator wins, while a later completion loses its
  fence;
- streams lose ownership and close once; resume starts a new generation only if the current continuing
  declaration still selects it;
- timers retain absolute deadlines, do not count hidden time twice, and deliver at most one due fact
  after resume according to the accepted timer policy;
- pending durable outcomes and occurrence cursors remain, while a context wave retains its dirty
  marker and resumes from current provider snapshots rather than replaying old projections.

A lease-owned suspended actor retains its logical context edges, so a provider cannot be disposed
under it. Every React Effect cleanup performs the same suspension and removes an attachment-owned
local actor's graph registration because React cannot identify a final detach; setup performs full
readmission and may fail with an exact missing or changed provider diagnostic. Such a React-local
actor cannot provide context to an independently owned actor. A provider that must outlive one
component attachment must instead be a lease-owned opaque actor from `createActor` or a stable actor
from `ensureActor(stableRef)`. Detached uninterruptible work may retain only the actor's minimal
occurrence and pending-outcome cell until settlement or runtime disposal, so immediate collectibility
applies only when no such fact remains.

React preparation may resolve a registered provider or an opaque ref whose private token identifies
another prepared actor in the same runtime brand. Prepared cells form an inert `PreparedGraph` through
those tokens without a runtime registry mutation. Attaching any consumer atomically attaches its
committed prepared-provider closure in topological order; later hook setups join already attached
cells, and cleanup remains owned by each cell's own hook attachment. Attachment compares registered
provider turn revisions and prepared provider identities; when a registered revision changed, it
recomputes the entire silent baseline from a fresh cut, while a missing, uncommitted, or mismatched
provider rejects without partial publication. Server rendering holds the fixed preparation cut, and
hydration must produce the same first view selection from the client boot root before subscriptions.

The construction tuple compares runtime and machine by exact object identity and each declared
binding slot by Flow ref equality; a change throws `ActorConstructionChanged` and requires a keyed
remount. Input is consumed only on the first render like a state initializer, so later inline-object
identity changes are ignored and never reconstruct the actor; applying new input requires a keyed
remount. A prepared actor buffers at most 64 commands. The sixty-fifth throws
`PreparedMailboxOverflow` with machine and opaque-ref diagnostics and consumes no mailbox ordinal; an
abandoned prepared handle remains inert.

If a context selector throws after a provider commit, the consumer retains its full prior context,
records one failed `TurnRecord`, advances turn and publication revisions, skips downstream consumers
for that wave, and remains dirty. The issue clears only after a successful retry from current
snapshots, and `onContext` then compares with its last successful baseline. Dehydration rejects a dirty
durable closure with non-retryable `ContextProjectionDefect`, including actor, provider, and binding
paths, rather than serializing a projection that cannot be derived from its providers.

The handle matrix is exact: prepared handles admit bounded buffered commands, passive reads, and local
observer registration; that observer hub acquires no runtime owner and emits no inspection evidence.
Active handles admit commands, reads, and observation. Suspended handles allow reads and observation
but reject commands. Disposed handles preserve their terminal snapshot and reject commands and new
observation. The package-private React adapter subscription remains a zero-argument change
notification with no synthetic replay; the public replay surface is only the existing snapshot
stream. First and last active adapter subscriptions emit `actor:subscribe` and `actor:unsubscribe`
diagnostics; suspension detaches them, and prepared observers emit neither. `can(event)` remains a pure transition-legality
query and does not imply that lifecycle admission is currently open.

## 5. Operations kernel

The public read projections are closed, discriminated data. Full Effect causes remain inspection-only;
public defect members carry the existing normalized `DefectSummary`. Every projection carries typed
canonical `K`, but a generation exists only where work actually had one:

```ts
type ResourceBase<A> =
  { status: "absent" } | { status: "value"; data: A; valueRevision: number; updatedAt: number };

type ResourceEffective<A> =
  { status: "absent" } | { status: "value"; data: A; optimistic: boolean };

type ResourceFreshness =
  | { status: "empty" }
  | { status: "fresh"; staleAt: number }
  | { status: "stale"; cause: "expired" | "invalidated" | "lookup-failure" };

type LookupState<A, E> =
  | { status: "idle" }
  | { status: "pending"; generation: number; startedAt: number; placeholder?: A }
  | { status: "failure"; generation: number; error: E; finishedAt: number }
  | { status: "defect"; generation: number; defect: DefectSummary; finishedAt: number }
  | {
      status: "interrupted";
      generation: number;
      cause: OperationInterruptCause;
      finishedAt: number;
    }
  | { status: "superseded"; generation: number; cause: SupersessionCause; finishedAt: number };

type ResourceState<K, A, E> = {
  key: K;
  storeRevision: number;
  base: ResourceBase<A>;
  effective: ResourceEffective<A>;
  freshness: ResourceFreshness;
  lookup: LookupState<A, E>;
};

type TransactionState<K, A, E> =
  | { status: "idle"; key: K }
  | { status: "queued"; key: K; occurrence: number; queuedAt: number }
  | {
      status: "committing";
      key: K;
      occurrence: number;
      startedAt: number;
      cancellationRequested: boolean;
    }
  | { status: "success"; key: K; occurrence: number; value: A; finishedAt: number }
  | { status: "failure"; key: K; occurrence: number; error: E; finishedAt: number }
  | { status: "defect"; key: K; occurrence: number; defect: DefectSummary; finishedAt: number }
  | {
      status: "interrupted";
      key: K;
      occurrence: number;
      cause: OperationInterruptCause;
      finishedAt: number;
    }
  | {
      status: "superseded";
      key: K;
      occurrence: number;
      cause: SupersessionCause;
      finishedAt: number;
    };

type StreamState<K, E> =
  | { status: "idle"; key: K }
  | { status: "connecting"; key: K; occurrence: number; generation: number; startedAt: number }
  | { status: "running"; key: K; occurrence: number; generation: number; startedAt: number }
  | { status: "complete"; key: K; occurrence: number; generation: number; finishedAt: number }
  | {
      status: "failure";
      key: K;
      occurrence: number;
      generation: number;
      error: E;
      finishedAt: number;
    }
  | {
      status: "defect";
      key: K;
      occurrence: number;
      generation: number;
      defect: DefectSummary;
      finishedAt: number;
    }
  | {
      status: "interrupted";
      key: K;
      occurrence: number;
      generation: number;
      cause: OperationInterruptCause;
      finishedAt: number;
    };
```

`OperationInterruptCause` is `cancelled | suspended | actor-disposed | runtime-disposed |
external-interruption`; `SupersessionCause` is `refetch | authoritative-write | clear |
concurrency-policy`. A refresh failure sits beside retained `base` and `effective` values, so stale
data remains explicit. An optimistic overlay may supply `effective: value` while `base` is absent.
The public `occurrence` is the one-based ordinal in that actor lane; the full actor, descriptor, and
key identity is implicit in the bound family read and explicit in inspection evidence.
Stream state never retains the latest emission. Resource reads may passively address any resource
family admitted by the actor's `AppPlan`; a missing or collected entry returns synthetic
absent/empty/idle state without materializing it. When the final owner releases, retention expiry
collects the entry and indexes in one store commit and records an inspection fact. Transaction status,
queues, and cursors live in the actor cell; StoreKernel owns only shared resources and transaction
overlays. An absent transaction or stream lane returns `idle`, and reconciliation rejects a second
live stream declaration for the same actor, descriptor, and `K` before changing the existing binding.

All operation admission builds a finite plan against the pre-turn actor snapshot, then commits the
machine turn and the entire admitted batch atomically. Event and timer transitions use the same
planner. Equal-due timers are ordered by stable actor identity and authored timer slot before their
facts enter actor mailboxes. A timer guard decline consumes the due fact without actions. A planning
defect consumes the due fact and publishes one issue-only turn, but applies no target, memory, store,
occurrence, or external-work prefix.

An occurrence lane is `(actor ref, kind, descriptor, canonical K)`. It allocates a one-based ordinal
only when admission succeeds; rejected candidate batches consume no ordinal. With no public
occurrence handle, `cancel(K)` is lane-wide and affects every currently cancellable occurrence in
that lane. A resource occurrence may attach to one store-global generation for `(descriptor, K)`, but
the actor occurrence and shared generation remain separate evidence identities. One actor may own at
most one live stream for an exact `(descriptor, K)`.

The bounded ledgers are:

- 64 finite plans in one action batch;
- 256 pending occurrences in one lane and 1,024 pending finite occurrences in one actor;
- 4,096 distinct occurrence cursors retained per actor lifetime, with sparse terminal ranges
  compacted behind the monotonic cursor; and
- 256 retained terminal transaction projections per actor, evicted by deterministic completion LRU.

Admission of a 4,097th distinct lifetime lane rejects before mutation with
`OccurrenceLaneLimitExceeded`; cursors are never evicted or reused because doing so would make an old
ordinal indistinguishable from a new one.

Persistence stores each lane's descriptor, canonical key bytes, next ordinal/high-water mark, active
occurrences, terminal projections still inside the retention bound, and links from resource
occurrences to shared generation IDs. After hydration, every ordinal at or below the high-water that
is not listed active is settled; an ordinal above it was never admitted. Sparse settled ranges may be
compacted without changing that test.

The canonical key validator accepts primitives, arrays, and plain records. It copies arrays and
records into Flow-owned containers, deeply freezes the copies, normalizes `-0`, and sorts record keys
by raw UTF-16 order. A throwing reflection trap fails at the exact key path before mutation; a
transparent Proxy cannot be detected portably and is canonicalized from its observed descriptor
graph. The root is depth zero; each scalar or container counts once; encoded bytes are counted
after canonical UTF-8 emission. The byte grammar uses ASCII tags and decimal length prefixes:
`n` for null, `b0`/`b1` for booleans, `d<byteLength>:<ECMAScript Number::toString>` for finite numbers,
`s<byteLength>:<UTF-8>` for strings, `a<count>:<self-delimiting children>` for arrays, and
`o<count>:<encoded string key, encoded value pairs>` for records. This one encoding supplies equality,
diagnostics, persistence, and hashing. Equality always compares canonical bytes; a hash is only an
index accelerator and collisions compare the bytes. The validator rejects cycles, sparse arrays, accessors, symbol
keys, functions, non-finite numbers, lone surrogates, non-plain prototypes, depth above 16, more than
256 nodes, or an encoding above 8,192 UTF-8 bytes.

For equal `K`, the shared resource generation pins only the `P` that started external work. Every
actor-local registration separately pins its occurrence mapper and delivery metadata, so one shared
completion can truthfully settle different actor outcomes. Each successful continuing reconciliation
updates only that binding's candidate `P`; a future generation selects the oldest eligible binding by
its persisted acquisition ordinal, never one store-global “latest” candidate.
Nothing attempts to reconstruct executable `P` from `K` after hydration. Restored pending outcomes
are installed and drained through production mailboxes first, then continuing declarations rerun to rematerialize current `P`; finite work and
terminal streams never restart. Equal `K` restores the binding and its ordinal with the newly
materialized candidate `P`; changed `K` stages ordinary release-and-acquire, and `null` stages release,
all before readiness. Only after the complete reconciliation candidate validates and readiness opens
may external execution begin. A declaration defect or illegal duplicate rolls bootstrap back.

Tags and placeholders are pure functions of canonical `K`, so equal-key owners cannot disagree.
Tags materialize once when a new entry is staged, are limited to 64 distinct 256-byte IDs per entry,
and a tag defect aborts entry creation. A placeholder materializes once after an empty generation is
staged as pending but before its external lookup starts; its defect settles that generation as a
defect and starts no external work. `getData` returns the overlay-effective authoritative value and
never returns a placeholder; `getState` separately exposes placeholder and lookup status. A resource
`setData` updater runs exactly once, synchronously outside the commit coordinator, against the base in
the captured StoreState. Its candidate carries that entry revision; commit rejects
`ConcurrentStoreWrite` without rerunning the callback if the revision changed. In one JavaScript
runtime turn there is normally no yield between synchronous planning and commit, so this is a hostile
reentrancy check rather than a retry loop. Returning `undefined` removes that write intent and changes
nothing. A successful write fences older lookup generations, clears invalidation and lookup failure,
preserves unrelated overlays, advances store revision and freshness, and advances base value revision
when `Object.is(previousBase, nextBase)` is false even if an overlay hides the change. Effective-value
fanout advances only when the overlay-effective value changes. Transaction preview updaters follow the
same outside-commit candidate rule, and overlay removal recomputes effective value from remaining
ordered overlays and base.

Both `invalidate` and `clear` retain the accepted exact, tag, and family targets. Reverse indexes
expand a target before mutation; more than 1,024 entries rejects the whole candidate batch. A missing
exact target or zero-match tag/family is a successful no-op and advances no store revision.
Invalidating an active lookup marks the entry stale and lets that generation settle; clearing fences
and interrupts a cancellable lookup before deleting the entry.

After expansion, the exact-address algebra is exhaustive. Identical invalidations, identical clears,
and identical lane-wide cancels deduplicate. Repeated lookups remain distinct occurrences and join one
generation. One invalidation may coexist with lookups, one refetch, or cancel and is applied first.
Two refetches, lookup plus refetch, or cancel plus lookup/refetch conflict. Any write conflicts with
another write, invalidate, clear, cancel, lookup, or refetch. Clear conflicts with every non-clear
intent. Overlapping tag/family targets first expand and then use these same rules. A declined updater
contributes no write intent. Any conflict rejects the whole candidate before actor/store mutation,
occurrence allocation, or external work.

Completion has one pipeline: classify the external exit, validate its fence, and materialize each
registration's mapper exactly once outside the coordinator. The coordinator then performs one atomic
shared-store commit and atomically installs a durable pending outcome for every attached actor
registration. After release, those outcomes enter independently ordered mailboxes by stable actor
identity and occurrence ordinal and are consumed idempotently; Flow does not claim a cross-actor
atomic turn, but a crash cannot retain shared success while losing delivery. A registration mapper
defect settles only that actor occurrence as defect and applies none of its requested writes or event;
it cannot roll back the shared canonical result or another registration. Transaction and stream
callbacks build one actor-local candidate whose overlay removal, requested store changes, status, and
pending outcome installation commit atomically. The outcome then enqueues and drains idempotently. A
stale completion records supersession without changing current entry truth.

Construction seeding is a package-private host capability available only before activation. Boot
restoration installs first and has sole authority for its addresses; a seed collision with boot or
another seed rejects construction even when values are equal. In a fresh runtime, valid seeds use the
supplied timestamp or current injected Clock, begin at value revision one with descriptor-derived
freshness, and form revision-zero StoreState. With restored noncolliding state, all seeds install in
one bootstrap-only store commit that preserves restored entry revisions and advances the global store
revision once. Neither path creates an occurrence, generation, or external work. Any trusted post-start write uses the same
commit, revision, fanout, and evidence path; there is no flat runtime operation catalogue because
operation aliases are definition-local.

The operation host is the sole interception seam. Live execution delegates admitted descriptor work
to the real host. In a Story, every external resource, transaction, and stream descriptor invocation
is controlled: fixture Layers still satisfy dependencies, but descriptor Effects and Streams do not
execute. The controlled host records the admitted actor, kind, descriptor, canonical key, lane,
ordinal, and shared-generation link after production admission and status publication.

`simulate` resolves its target, operation plan, and canonical key, then matches the exact one-based
actor occurrence. Not-yet-admitted, wrong-kind, wrong-key, interrupted, already-settled, and duplicate
terminal observations have distinct diagnostics. A resource observation settles its linked shared
generation once and fans the canonical result to every still-attached registration; an occurrence
that has already detached cannot settle work retained by another owner. Stream emissions may repeat
while the generation is current, followed by exactly one completion, failure, defect, or interruption.
Finite operations accept exactly one terminal observation. Story cleanup interrupts every remaining
controlled waiter. All injected observations reenter the production completion path, so admission,
ownership, concurrency, mapping, store commits, actor events, and evidence remain identical to live
execution.

## 6. Stories, checkpoints, and cleanup

Story preparation compiles every `story.actor` recipe and scans every command target in the complete
immutable plan. A recipe binding may point to an app-owned `ActorRef` or another recipe object. Recipe
object identity plus a plan-local ordinal identifies a node; provider edges are validated for missing
slots and cycles, materialized in topological order, and released in reverse order. Bounds are 4,096
recipe nodes, 10,000 edges, and dependency depth 32.

The Story capture set is every actor recipe or ref targeted anywhere in the completed plan plus its
transitive context-provider closure. The set is materialized before the first command, so an actor
used only later can still appear in an earlier checkpoint. An unreferenced recipe is outside that
Story run and evidence lookup for it returns `EvidenceUnavailable`. Checkpoint cost is proportional
to this capture set plus pending work, not to unrelated actors in the runtime.

`story.machine` uses a package-private focused `AppPlan` compiler mode. It validates that initial and
later selected-context records contain exactly the declared keys. Initial values install as a silent
baseline before the first snapshot and continuing reconciliation; later `setContext` values enter the
production selected-context coordinator directly. Focused mode creates no provider revision,
selector, ref, or graph edge, so it does not claim to prove provider selection or resolution. Parity
tests compare its consumer turns with an equivalent `story.app` provider graph.

The Story runner owns the outer TestClock, fixture, controlled-host, and optional inspection scopes;
the runtime borrows those capabilities and owns actors, StoreState, application Layer, and its sink
attachments. Preparation failure before a runtime exists returns no runtime evidence. After
preparation, one run stops command and simulation admission, captures `run.end` after successful
commands or `atFailure` for execution/cancellation/end-capture failure, disposes Story-local leases in
reverse recipe order, disposes the runtime in reverse context order, drains and detaches requested
inspection, then closes the outer controlled host, fixtures, and clock. Cleanup is uninterruptible and
attempts every finalizer exactly once.

Completed named checkpoints always survive. Execution or cancellation Cause is primary; otherwise
end-capture failure is primary; otherwise cleanup failure is primary. Runtime disposal, sink drain,
controlled-host, fixture, and clock failures append in that fixed order. Successful commands followed
by cleanup failure retain the captured `run.end`; failed execution never manufactures `run.end` and
retains `atFailure` when capture succeeded.

## 7. Artifacts, removed children, and migration

Because v2 artifacts have not shipped, the frozen v2 schemas are rebaselined rather than introducing
a v3. The exact behavior, trace, checkpoint, actor-locator, evidence, end, failure, cleanup, module
slice, CLI, field-order, bound, and canonical-JSON schemas live in
[`DESIGN_BEHAVIOR_DISPOSITIONS.md`](./DESIGN_BEHAVIOR_DISPOSITIONS.md). That appendix retains app ID,
persistence version, fingerprint, truncation, and cleanup truth; adds stable, recipe, and runtime-opaque
actor locators; represents compound states, context requirements, operation occurrences and shared
generations; and replaces every old `final` field with `end`. CLI text and JSON render from the same
decoded artifact used by the public Story result.

Deleting child machines leaves no hidden child-equivalent runtime owner. Operational lifetimes use
streams or acquire/release activities. A behaviorally significant subordinate with its own mailbox,
memory, failure boundary, or remote lease is a first-class actor owned by the production factory,
host, or Story recipe. Refs give hosts lookup identity, context remains readonly, and the host sends
events to each actor; a machine does not gain a cross-actor command channel. Dynamic machine-owned
subordinate actors are unsupported until a separately reviewed public ownership model exists.

The companion proposed matrix
[`DESIGN_BEHAVIOR_DISPOSITIONS.md`](./DESIGN_BEHAVIOR_DISPOSITIONS.md) contains a disposition row for
every affected old `GLO`, `API`,
`TYPE`, `SEM`, `SNAP`, `ARCH`, `WIRE`, `HOST`, `TEST`, `CLI`, `CUT`, and `PROOF` clause and every Phase
0 schema, task, example, and deletion. Each row says `retain`, `rewrite`, or `delete`, cites the
accepted revision and `BEH-*` item, names its replacement clause, and names at least one proof. CI
fails on an absent clause, mixed clause without split dispositions, dangling replacement, or gap with
no proof owner.

## 8. Gap disposition map

| Gap         | Proposed closure                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BEH-001–006 | Sections 1–2: bootstrap coordinator, atomic admission, runtime owner capability, durable closure, ref codec, and unique module ownership.                                                                   |
| BEH-007–008 | Section 3: publication versus turn revisions and one sequenced runtime evidence hub.                                                                                                                        |
| BEH-009–016 | Sections 3–4: retained or revalidated context edges, serialized lifecycle cleanup, prepared context, frozen hook tuples, bounded buffering, selector defects, dynamic passive reads, and the handle matrix. |
| BEH-017–022 | Sections 3 and 6: recipe DAGs, focused context mode, production operation interception, occurrence identity, atomic capture cuts, and exact cleanup.                                                        |
| BEH-023–032 | Section 5: state projections, timer actions, occurrence ledgers, batch algebra, key encoding, equal-key bindings, overlays, bounded invalidation, hydration reconciliation, and trusted seeding.            |
| BEH-033–035 | Section 7: rebaselined v2 artifacts, explicit replacement for subordinate behavior, and exhaustive old-clause dispositions.                                                                                 |

## 9. Proof order

Implementation should prove the seams in dependency order: immutable commit and evidence ordering;
bootstrap/admission/identity; lifecycle and context waves; atomic selector reads; occurrence and store
semantics; Story interception and capture; hydration/dehydration; then artifact and clause migration.
A later layer may depend only on already-proved lower seams. Any proof that requires another public
constructor, command, hook, identity kind, or operation family reopens the relevant design decision
instead of silently extending the API.
