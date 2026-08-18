# vNext runtime semantics

These rules define observable runtime behavior. Architecture and wire-format choices are
specified separately, but an implementation is conforming only when all three contract
files agree.

## Actor turns and publication

### SEM-001 — One mailbox orders every actor fact

Each actor MUST own one mailbox. An active actor MUST have one unbounded Effect Queue and one consumer.
Accepted external events, asynchronous completion facts, store-change facts, timer facts, and
context-propagation facts MUST enter through that Queue. Reentrant sends MUST preserve FIFO order. A
prepared React actor MUST have the real command-buffering mailbox required by `REV-HOST-002`, bounded to
64 entries; overflow rejects synchronously without mutation and abandoned handles remain inert. Child facts
are not an accepted surface:
recursive substates share the actor's mailbox, memory, context, operations, and lifetime under
`REV-MACH-001` and `DEL-002`.

Lifecycle control uses one serialized lane ordered with the mailbox. It may close admission and normalize
owned work, but it never creates a second actor queue or bypasses the actor's publication barrier.

### SEM-001A — Fresh initialization precedes actor activation

A fresh actor MUST invoke its definition's pure memory factory exactly once with its supplied input when
that factory exists, otherwise materialize the canonical empty readonly memory record. Input MUST remain
part of the definition's static actor shape and MUST NOT classify the actor as local or shared. Before
activation, the root `default` and each entered compound state's `default` MUST resolve to one exact active
leaf token. Redirect stabilization MUST evaluate active compound nodes from outermost to innermost and
preserve authored order; intermediate candidates MUST NOT publish or acquire work. A restored actor MUST
use its already-materialized state and memory and MUST NOT invoke the factory, replay input, or rebuild its
initial state. Machine behavior MUST NOT receive the original input after initialization and MUST operate
on memory, inherited context, state, and events.

A callback defect or redirect bound failure during initial construction fails actor creation without
publishing a partial active actor or starting owned work. A prepared React actor MUST expose the pure
initial snapshot required by `REV-HOST-002` and MAY carry a passive provisional context cut. Attachment
rechecks provider identity and publication revisions, installs current provider-derived context before
activation, and never persists or emits the provisional cut.

### SEM-002 — Event macrosteps plan before commit

One accepted event macrostep MUST:

1. select the winning transition;
2. evaluate its guard;
3. if accepted, evaluate `updateMemory` and then `actions`;
4. apply target and memory to a candidate actor projection;
5. stabilize redirects;
6. materialize and validate the complete finite-action batch;
7. stage actor and synchronous store changes;
8. commit and publish actor/store revisions atomically; and
9. only then start or join asynchronous work.

Guard, `updateMemory`, and `actions` MUST read the same immutable pre-turn snapshot and exact causal
event. Actions MUST NOT read candidate memory. A declined guard MUST evaluate neither later callback.
Omission, `null`, and an empty action list admit no finite work, while constructing a plan without
returning it remains inert. A defect in guard, memory, planning, redirects, keys, targets, or batch
validation discards the candidate whole turn; no candidate state, valid prefix, finite occurrence,
activity change, StoreState mutation, or external work survives. A contained callback defect then
uses SEM-024A to publish one separate issue-only actor snapshot from the prior committed truth. That
issue publication is not the discarded candidate and does not start work. An uncontainable invariant
defect closes admission and enters the terminal cleanup path. Edge plans remain admitted if a redirect
leaves the initial target.

The machine `states` record is exhaustive. Shorthand is one transition, and an authored transition list
is evaluated in order; the first transition with an absent or truthy guard wins. No winner produces a
normal no-transition turn. Guards, `updateMemory`, and `actions` receive one frozen object containing the
current state token, readonly memory, complete current snapshot/readers, and exact causal event.
`updateMemory` runs once for the winner and shallowly merges its partial result over memory. Redirects
evaluate in authored order against the updated candidate snapshot and read only `{ state, memory,
snapshot }`; they never receive the original event. Redirect stabilization MUST stop before attempting
microstep 101. During an event or timer turn, a redirect defect or bound failure retains the prior
published state, memory, bindings, and store facts, then publishes one active contained-defect issue and
TurnRecord; it never publishes an unstable candidate. Timer guards and updates instead receive
`{ state, memory, snapshot, timer: { name, startedAt, dueAt } }`.

A redirect authored on a compound state remains applicable while any descendant is active, including
after descendant transitions and memory updates. When several redirects apply on one active path, Flow
evaluates the outermost active compound through the exact leaf, preserving authored order within each
node.

The machine state declaration MUST be recursive and exact. A state declaration is a string leaf or a
single-key compound object whose value is another ordered state list. The compiled configuration MUST
mirror that tree: the root and every compound node require `default` and an exact nested `states` record,
while leaves retain their existing behavior fields. Every token is definition-derived and preserves its
complete path. Events remain one machine-wide protocol; compound and leaf handlers compile into one exact
table, and an ancestor/descendant duplicate handler is rejected rather than resolved by runtime fallback.

The `state` in snapshots and in every guard, redirect, timer, memory-update, and activity selector MUST
be the exact active leaf token. Exact equality tests only that leaf, while `state.matches(token)` may match
the active leaf or any active ancestor. Flow MUST accept at most ten state levels, using the same bound for
runtime validation and TypeScript inference.

`reenter` MUST name an exact active definition-derived state token, not be a Boolean. Flow MUST release
that active node and its descendant path, then enter the transition target inside that subtree, restarting
state-owned work at the named boundary. The compiler MUST reject an inactive boundary, a boundary from
another definition, or a boundary that does not contain the target. Without `reenter`, unchanged nodes
retain their activation and owned work.

Timer guards and updates read `{ state, memory, snapshot, timer: { name, startedAt, dueAt } }`; a timer
never becomes a fake domain event. Timer-owned finite `actions` are not inferred: `REV-OPS-006` accepts
actions only on event handlers, and `REV-OPS-015` accepts timer event-targeting with explicit-refresh
polling.

An actor-bound `can(event)` evaluates only event-transition selection and guard legality without memory
updates, redirect execution, receipt creation, issue publication, mutation, or operation admission. It
returns false when no transition wins and synchronously rethrows the original guard defect. A
terminal-looking leaf is an ordinary leaf with no authored transitions or owned work; it does not complete
the actor, emit parent completion, produce final output, close subscriptions, stop the mailbox, or change
the actor lifecycle.

### SEM-002A — Context is readonly, bound, and propagated atomically

A definition MAY declare a `context` record of readonly selectors over other actor definitions. Each
selector MUST be synchronous, pure, and evaluated against one atomic provider snapshot using complete-value
`Object.is` for scalar and non-record results and fixed-key, field-by-field `Object.is` for named records.
Context MUST mean inherited readonly actor projections; actor-local mutable data remains `memory`, and
refs MUST NOT become selected context values.

Actor construction MUST bind every declared context slot to one exact `ActorRef` through `contextBindings`,
with one authored key for every declared slot. The application plan and runtime MUST reject missing or
ambiguous providers, foreign refs, and context-dependency cycles. A binding remains fixed for the complete
consumer lifetime; changing a provider requires replacing or re-keying the consumer rather than rebinding
its memory and context history. Context edges do not create actor parentage, lifetime ownership, or a
command channel.

Individual actor disposal MUST be rejected before disposal begins while any non-disposed consumer,
including a suspended consumer, remains bound to that actor's ref. The rejection MUST identify every
dependent actor ref and bound context key. Suspension detaches live subscriptions and work but retains
the logical context edge and provider-incarnation dependency; it MUST NOT allow provider disposal
underneath the consumer. It MUST not retain stale projections or cascade disposal across context edges.
Whole-runtime disposal tears the graph down in reverse dependency order, consumers before providers,
including suspended consumers.

During bootstrap, Flow MUST install each consumer's initial context projection after its exact providers
are installed or restored and before activation, initial continuing-work reconciliation, the first
externally observable snapshot, or handle escape. This baseline is silent. A machine-level
`onContext.select` registration records that baseline and, after a later selected-value change, maps
`(current, previous)` to one typed self-event, `false`, or `null`; it MUST NOT target state, update memory,
execute an operation, or expose an actor ref. The emitted event enters the ordinary mailbox and its
ordinary handler remains the owner of legality, guards, memory updates, and finite actions.

When a provider publication changes several selected values, Flow MUST install all changed projections in
one ordered, atomic consumer context turn, publish one consumer revision, expose the latest context to
views and future callbacks, and reconcile continuing work once. It MUST NOT publish intermediate
combinations, replay event handlers, manufacture a transition, update memory, or admit finite actions by
itself. Each committed provider turn starts one bounded propagation wave. Flow MUST mark reachable context
consumers pending and drain the sealed acyclic context graph in dependency order; a consumer participates
at most once after its dirty upstream dependencies for that wave settle and receives at most one combined
context turn evaluated from the latest provider snapshots. Publications from different actor turns start
different waves and MUST NOT be coalesced merely because they occur close together. A wave ends when its
marked dirty set drains; it MUST NOT wait for global runtime quiescence.

### SEM-003 — Reconciliation produces one CommitPlan

Reconciliation MUST translate a planned turn into a package-private immutable `CommitPlan` describing
store changes, desired state-activity ownership, primitive facts, mapped-operation intentions, and issues.
User Effects MUST NOT run inside pure planning or before the resulting actor snapshot publishes.
Asynchronous completion, timer facts, stream emissions, context waves, and StoreFanout facts MUST enter a
later actor mailbox turn. A projection-only fact rereads authoritative current state and publishes one
complete snapshot without evaluating transitions, guards, redirects, actions, memory updates, or hidden
events; a mapped outcome event is a later ordinary turn.

### SEM-004 — Store commit precedes one actor publication

The actor MUST first acquire the runtime-global TurnRecord commit permit and reserve/preflight the next
evidence sequence, failing before mutation on overflow. While holding that permit, it reserves immediate
ownership, submits one atomic store command, receives its resource projections and revision, materializes
actual issues and TurnRecord facts, and publishes exactly one immutable actor snapshot. A normal machine
publication advances both the actor's private publication revision and machine-turn revision; an
issue-only publication advances only publication revision and performs no StoreState command. It MUST then submit
one TurnRecord to the runtime hub with its closed sink-release gate, enqueue one package-private
post-commit reconciliation fact for staged activity starts/releases and admitted operation completions,
complete the command acknowledgment when present, open the sink gate, and release StoreFanout in that
order. Exact occurrence scheduling and completion ordering follow `SEM-016` and `SEM-018`.

Hub acceptance MUST use the reserved evidence sequence without invoking sinks inline, then release the
commit permit only after the record is queued. Sink processing starts after acknowledgment and cannot delay
fanout or alter this committed sequence. Because post-commit reconciliation is offered before
acknowledgment, `process()` can drain ready work deterministically; `.send()` itself never waits for user
Effects to start or settle.

The StoreState commit through actor publication and TurnRecord-hub acceptance is one uninterruptible,
nonblocking critical section containing no user callback or Effect suspension. Disposal either wins before
the store commit and aborts the command, or waits until actor truth and its TurnRecord are accepted; it
MUST NOT interrupt a half-published turn. Staged work still has not started and may be suppressed by
disposal after that boundary.

### SEM-005 — Actor snapshots are complete turn boundaries

One machine-turn snapshot MUST contain the exact active leaf state, memory, inherited context, resource
and transaction projections, continuing stream projections, timers, issues, lifecycle, its public
publication revision, and observed store revision from the same turn. A projection-only publication also
contains a complete immutable snapshot and advances publication revision and the actor's observed
projection cursor without advancing machine-turn revision. The private machine-turn revision correlates
machine publications without becoming a second public snapshot field. Issue-only and lifecycle snapshots
use a new publication revision while retaining the preceding machine-turn revision.
Child projections are removed by `REV-MACH-001` and `DEL-002`.
Receipts and publication evidence MUST be projected from TurnRecord and MUST NOT be actor snapshot fields.
The package-private actor state MUST commit that public snapshot and its durable cursors in one
modification; no fact may be exposed or captured through an independently mutable source.

### SEM-006 — Public send is synchronous; story acknowledgment is private

`actor.send(event)` MUST synchronously admit the event and return `void`. It MUST NOT wait for Layer
acquisition, the actor turn, or asynchronous work. A package-private acknowledged dispatch MUST use a
command `Deferred` that completes after actor publication and TurnRecord hub acceptance, but before sink
processing or later asynchronous work. Story `.send` MUST await that Deferred and nothing later. The
dispatch allocates the Deferred and admits the command synchronously at the shell edge before returning
the awaiting Effect, so it remains usable while the shared Layer is still acquiring.

When planning contains a contained callback defect, the acknowledged dispatch resolves only after the
separate issue-only publication and its TurnRecord are accepted; it does not acknowledge discarded
candidate work. An invariant defect fails the acknowledged dispatch after closing admission and
retaining terminal cleanup truth.

### SEM-006A — Operation outcomes use the production completion path

Finite resource `lookup` and `refetch`, transaction `commit`, and continuing resource `subscribe` and
stream `subscribe` plans are inert until an accepted machine declaration admits them. Finite operations
map `success`, `failure`, `defect`, and `interrupt`; continuing resource and stream operations map
`value` or emission, `failure`, `defect`, and `interrupt` through their authored outcome handlers. An
omitted mapper enqueues no event for that lane, and a mapper receives no `Exit`, `Cause`, state, or
lifecycle metadata.

Operation completion, authoritative writes, canonical projections, ownership, occurrence identity, and
mapped events MUST pass through the same production operation kernels for live hosts and Stories. A Story
`simulate` command replaces only external execution; it MUST match an already-pending exact operation
occurrence and MUST NOT directly mutate actor memory, canonical data, snapshots, generations, or evidence.
Every admitted occurrence is internally fenced by actor incarnation, operation kind, descriptor ID,
canonical `K`, one-based ordinal, and—when shared work is involved—the exact store generation and lease
epoch. A late completion may settle only its bounded old evidence and MUST NOT publish into a later actor
incarnation or collected/reused store entry.
Exact controlled interception remains unresolved under `BEH-019` and `BEH-020`. Occurrences settle once;
queued cancellation does not start external work, late results are fenced, and terminal history remains
bounded evidence rather than an actor-lifetime registry. Completion-side writes, overlays, status, revision,
and mapped-event ordering follow `SEM-016` and `SEM-018`. Stream hydration rematerializes live declarations
from executable input without replaying emissions; no child outcome surface exists under `DEL-002`.

### SEM-007 — Snapshot streams replay the current truth

`actor.snapshots` MUST emit atomic immutable actor snapshots, replay the latest snapshot to a late
subscriber, emit lifecycle snapshots through the actor's disposed terminal boundary, and then complete.
`getSnapshot()` MUST return the same latest immutable value synchronously. The lifecycle value is the
truthful `prepared | active | suspended | disposed` value and `snapshot.revision` identifies every
distinct publication, including lifecycle and issue-only publications. Prepared subscriptions replay
the prepared snapshot and become live on activation; suspended subscriptions replay the suspended
snapshot once and complete; disposed subscriptions replay the terminal snapshot and complete. Prepared
commands buffer up to 64 entries, active commands admit, and suspended or disposed commands reject
without buffering. `can(event)` remains pure transition legality and is independent of command admission.

## Resource-store semantics

### SEM-008 — StoreState is the only canonical resource authority

One Flow runtime MUST own one canonical resource store containing descriptor IDs, canonical keys, committed
base values and metadata, generation state, a shared ordered overlay ledger, the monotonic canonical store
revision, and an ordered canonically deduplicated immutable `changedRefs` vector valid only for that
revision. Overlay layers retain their exact initiating actor incarnation, occurrence, descriptor, and
canonical `K`; their effective values are actor-scoped projections, not shared canonical truth. Same-runtime
actors using equal descriptor and canonical `K` MUST share canonical data and lookup generations while
retaining independent actor lifetimes, occurrences, declarations, previews, and outcome mappings. Actors
own finite occurrences, continuing declarations, and immutable projections, not private resource caches.
Separate runtimes, SSR requests, tests, and browser roots remain isolated.

### SEM-009 — Store revisions are monotonic commit identities

Every canonical base, generation, freshness, invalidation, hydration, or eviction change MUST advance the
canonical store revision. Applying, removing, or replaying an actor-local preview advances the initiating
actor's publication revision and owner-overlay cursor, but does not create a canonical revision or fan out
to non-owners. A consumer that observes a revision jump MUST reread the relevant current projection rather
than assuming a skipped `changedRefs` vector covers the missing revisions.

StoreFanout MUST deliver canonical revision facts through actor mailboxes and is the sole actor-facing
StoreState path. A recipient ignores a revision less than or equal to its observed revision, ignores refs
outside its registered dependency set, and for a newer revision reads current StoreState rather than a
historical value. Autonomous freshness and collection commits MAY fan out immediately because they have no
initiating actor-publication barrier. Adjacent projection-only facts may coalesce to the newest revision and
the union of changed refs; lifecycle, terminal-operation, cancellation, stream-terminal, and mapped-event
facts MUST NOT coalesce. Owner-overlay facts target only their initiating actor.

### SEM-010 — Canonical keys identify parameterized operations

Every authored `key(P)` MUST synchronously return an ordered readonly tuple `K`. Exact resource,
transaction, and stream identity MUST use the descriptor namespace plus canonical `K`; complete executable
input `P` is retained by each live binding or operation generation and is never identity. A later equal-key
owner MUST NOT replace the pinned `P` of a running resource generation or duplicate its work. An explicit
`refetch(P)` admits a replacement generation with its own `P`.

Canonical `K` MUST contain only `null`, booleans, strings, finite numbers, readonly arrays, and plain
readonly records. Canonicalization MUST sort record keys and normalize `-0`. It MUST reject `undefined`,
non-finite numbers, bigint, symbols, functions, accessors, class instances, mutable structures, cycles,
and branded secret values. Unbranded strings are observable in persistence, inspection, diagnostics, and
artifacts and authors MUST hash or replace secret material. One key is limited to 16 nested levels, 256
total value nodes, and 8 KiB in the tagged canonical byte encoding. These are not state, actor, descriptor,
or cache-entry-count limits. Projection, validation, canonicalization, and defensive freezing MUST finish
before ownership, actor/store mutation, admission, or external work. Failure MUST name the exact `K[index]`
or nested record path and abort the whole candidate turn.

The exact byte grammar, counting, hostile-reflection behavior, copying/freezing behavior, and the
mutable-structure boundary remain unresolved under `BEH-027`; no implementation detail may fill that gap.
Simultaneous eligibility uses stable runtime acquisition order. Releasing the supplying binding cannot
switch the running generation. A later automatic generation uses the oldest remaining eligible binding;
an explicit refetch uses its caller's `P`. The same stable acquisition order is retained across hydration.

### SEM-011 — Named operation families separate ownership, reads, and policy

The definition MUST declare one flat named record of resource, transaction, and stream descriptors. The
machine receives the exact actor-bound `O` catalogue plus `onMemory`, `invalidate`, and `clear` capabilities.
Listing a descriptor, calling `O.name.key(P)`, reading `getData(K)` or `getState(K)`, or constructing an
unreturned plan MUST remain passive and MUST NOT acquire ownership, change freshness, mutate state, or
start external work.

Resource `lookup(P)` is finite and may settle from a usable fresh canonical value without invoking its
adapter; missing, stale, or invalidated data starts or joins the exact lookup generation. `subscribe(P)` is
continuing desired ownership, observes the canonical entry, starts or joins ordinary lookup policy when
acquisition is required, and retains ownership until its declaration releases. `refetch(P)` is a finite
forced replacement even when data is fresh. `setData(K, valueOrUpdater)` is an explicit authoritative
write, and `cancel(K)` is actor-owned finite cancellation. Streams are actor-owned continuing operations,
not runtime resource entries, and have no actor `cancel(K)`.

Descriptor freshness and collection policy remain descriptor configuration. This revision establishes no
new policy defaults. Exact resource, transaction, and stream state unions, generation and failure
projections, retained-value refresh, collection, cross-actor read visibility, and duplicate stream-read
behavior remain unresolved under `BEH-023`.

Browser online state is an advisory refresh signal, not lookup-admission authority. An offline fact MUST
NOT block explicit lookup, subscription, or refetch activation and MUST NOT cancel or pause an in-flight
generation. A reconnect or focus fact may start ordinary lookup only for an actively subscribed exact
identity that is missing or stale and has no current in-flight generation. Application machines remain free
to gate their own activities from explicit domain connectivity events; Flow exposes no generic paused
resource state.

### SEM-011A — Finite resource outcomes belong to an admitted occurrence

A finite lookup or refetch plan MUST be admitted only through an accepted event transition `actions`
result. Its authored outcome options are exactly `success(A)`, `failure(E)`, `defect()`, and `interrupt()`;
each mapper returns one typed machine event and an omitted mapper emits no event. A fresh canonical value
may settle a finite lookup without adapter work; a stale, invalidated, or missing value follows ordinary
lookup-generation policy while retained canonical data remains readable during replacement.

Explicit resource or transaction `cancel(K)` is actor-local and bulk-only: it affects every current finite
occurrence owned by the calling actor that matches `K`, records interruption with the accepted cancellation
cause, and suppresses later results to those occurrences. Canonical data remains unchanged; shared work
continues while another owner remains. Cancellation of the final owner interrupts the shared controller and
fences late completion. Planned cancel, state release, and concurrency supersession publish status and
evidence but no mapped domain outcome. Occurrences settle once, cancellation is actor-local bulk
cancellation, and late completions are fenced; preview and completion ordering follow `SEM-016` and
`SEM-018`.

### SEM-011B — Continuing subscriptions map canonical changes explicitly

A continuing resource `subscribe(P)` MUST use exactly `value(A)`, `failure(E)`, `defect()`, and
`interrupt()` outcome mappers. On activation it publishes an existing canonical value once through its
authored `value` mapper, then publishes later canonical replacements through that mapper. Equal values and
overlay-only changes do not invoke `value`, and planned release emits no interruption outcome. Returned
continuing work reconciles by declaration slot, operation kind, exact descriptor, and canonical `K`, never
by plan-object or executable-`P` identity. A freshly allocated equal plan retains existing work; a changed
descriptor, declaration slot, or canonical key releases the old declaration and admits the new one. Each
live executable binding retains its complete `P`, and one shared resource generation pins exactly one `P`.
The runtime owns these subscriptions; callers do not manually subscribe for actor correctness.

### SEM-011D — Continuing streams retain a latest projection

Streams remain actor-owned continuing declarations, not runtime resource entries. Their passive projection
retains `status`, `hasValue`, the latest `value` when present, an emission count, the declaration generation,
and terminal status. Emissions update this projection automatically but are projection-only; they become
durable machine state only through mapped events or explicit authoritative `setData` writes. The default
pressure policy coalesces to the latest emission. Planned release stores no further value and emits no
outcome. Hydration rematerializes a live declaration from executable `P` without replaying emissions;
terminal streams do not restart, and missing executable input fails closed rather than being reconstructed
from `K`.

### SEM-011C — Invalidation and clearing are scoped actor actions

`invalidate(targets)` and `clear(targets)` MUST accept only the accepted readonly mixture of exact
`[O.resource, K]` targets, declared reachable resource tags, and admitted resource families. Planning MUST
resolve all targets, validate authority and keys, expand tags and families, deduplicate first-seen matches,
and reject the whole action batch before mutation when any target is invalid or unauthorized.

For a nonempty resolved match set, invalidation retains canonical data, marks every matched identity stale,
publishes all matched mutations atomically in one store revision, and starts no lookup directly. A surviving
subscription may authorize replacement. Clear atomically removes matched bases, failure/freshness metadata,
and overlays, fences generations, interrupts work, and publishes all matched mutations in one store
revision; a surviving subscription observes missing data and may reacquire under ordinary rules.

Clear exists only as `clear([...targets])` returned by an accepted event transition. Machines receive no
zero-argument clear, AppPlan-external wildcard, or whole-runtime clear; complete removal belongs to
`runtime.dispose()`. Expansion bounds, missing or zero-match behavior, and active-lookup interaction remain
unresolved under `BEH-030`; mixed command conflicts follow `SEM-018`.

### SEM-012 — Placeholder projection remains passive and actor-scoped

Placeholder data is descriptor-owned projection metadata and is never an implicit canonical write or
operation outcome. Tags derive solely from canonical `K`. `getData(K)` reads committed base for an unbound
store view and actor-effective base plus that actor's own ordered preview layers for a bound actor view.
Updaters read committed base; equal authoritative writes may refresh freshness/store publication but emit an
effective value change only when the effective value changes. No placeholder status, default, or new family
method is added.

### SEM-013 — RcMap leases do not own data

RcMap MUST own exact operation-identity activity leases and idle-GC timing only. RcMap invalidation MUST
NOT implement Flow stale-data invalidation. An expiry finalizer MAY evict canonical data only when its
lease epoch still owns the exact descriptor/K entry, so an old scope cannot evict a reacquired lease.
The accepted collection projection remains bounded by `BEH-023`.

### SEM-014 — FiberMap replacement still needs Flow generations

FiberMap MAY own keyed lookup replacement and cancellation, but every completion MUST compare the exact
descriptor/K identity and Flow generation immediately before committing. Removal or old-fiber finalization
MUST delete an in-flight entry only when it still owns that generation.

## Transactions and activities

### SEM-015 — Transaction identity uses descriptor and canonical key

Transaction execution, actor-visible projections, routes, receipts, pending work, and persistence MUST
use the exact transaction descriptor plus canonical `K`, with actor-local generations for attempts. Every
completion MUST match actor ownership, exact descriptor/K identity, and generation before it may publish or
route. The exact public transaction state union remains under `BEH-023`; occurrence terminality follows
`SEM-018`, and older generations belong in inspection evidence rather than an actor-lifetime generic registry.

### SEM-015A — External transaction cancellation is truthful across the irreversible boundary

The transaction adapter MUST distinguish local work from the remote point of no return. Queued or pre-effect
work may be interrupted and its local preview discarded. Before the adapter crosses its irreversible boundary,
Flow MAY request abort and classify the occurrence as interrupted without a mapped domain outcome. Before
dispatch, the adapter MUST durably record the remote operation identity and the boundary state. After the
boundary, cancellation stops local observation and fences late publication; it MUST NOT claim that the remote
effect was undone. The internal result is an uncertain or reconciliation-required fact until a separate,
repeatable reconciliation read confirms the remote outcome.

An uncertain operation MUST NOT be automatically retried as a new remote request. Reconciliation reuses the
same remote idempotency identity, while compensation is a separate explicit domain operation with its own
identity and outcome. The actor projection exposes `unknown` or reconciliation-required truth without
claiming remote rollback; the full Cause and remote identity remain package-private evidence. This clause
adds no generic outbox, saga, or rollback API.

### SEM-016 — Optimistic overlays remain shared-store state

Optimistic layers belong to the runtime-scoped StoreKernel ledger and MUST be associated with the exact
initiating actor incarnation, transaction occurrence, descriptor, and canonical `K`. Only the initiating
actor sees an uncommitted effective projection. An updater reads canonical base, not another actor's
overlay. A successful occurrence promotes its layer into canonical StoreState atomically and then emits one
canonical StoreFanout revision. Failure, defect, and pre-boundary interruption remove only that layer and
replay remaining owner layers without changing canonical StoreState. Post-boundary cancellation removes
local provisional state, publishes `unknown` or reconciliation-required truth, and never claims remote
rollback. Promotion uses base-revision compare-and-set; a changed base preserves remote canonical truth,
removes or conflicts the local layer, and publishes an initiating-actor conflict issue. Non-initiating
actors receive neither preview nor preview-rollback facts.

### SEM-017 — Operation output never becomes canonical implicitly

Resource lookup success installs canonical data through the resource store. Transaction and stream results
MUST NOT become canonical data implicitly. An admitted transaction or stream mapping MAY declare explicit
`setData(K, value)` writes; those writes use authoritative generation fencing under `REV-OPS-010` before
the mapped domain event. Every successful write MUST fence and interrupt older lookup generations for the
identity, clear invalidation and current failure metadata, advance the entry revision and generation fence,
publish once, and leave continuing subscribers attached to observe the base. An updater result of
`undefined` declines with no change. Server-returned values may enter typed machine events and memory,
while canonical resource truth changes only through lookup or an explicit accepted authoritative write.
Arbitrary cache mutation and implicit response mapping remain outside the accepted surface. Boot/SSR/fixture seeding and
the trusted host-write owner, API, authority, and evidence remain unresolved under `BEH-032`; this clause
does not authorize a generic runtime registry or ordinary cache-clear escape hatch.

### SEM-017A — Child-machine surfaces are removed

Flow MUST NOT expose child machines, child inputs, child lifecycles, child completion, child snapshots,
child addressing, child persistence, child Story commands, or child model surfaces. Recursive substates
share one actor's memory, context, event protocol, mailbox, operations, and lifetime. An independent
workflow MUST use an explicitly owned actor admitted by the `AppPlan`, or remain unsupported under
`BEH-034`; no child-equivalent internal owner may be smuggled back into this contract.

### SEM-018 — Transaction concurrency is actor-local and keyed

Transaction concurrency is actor-local per exact transaction descriptor and canonical `K`; there is no
public transaction `scope`, lane, or cross-actor Flow scheduler. A transaction family with an omitted key
projector uses `K = []`. The accepted policies are:

- `reject` declines a second active attempt without evaluating its commit-side callbacks;
- `cancel` cancels the prior attempt, then admits its replacement;
- `allow` admits independent generations, while only the current generation may update the current
  projection or route an outcome; and
- `serialize` materializes each admitted `P` and runs the exact-key queue FIFO.

State release and disposal cancel or release owned work without routing a planned interruption mapper. Each
admitted occurrence settles exactly once; queued cancellation starts no external work, late results are
fenced, and terminal history remains bounded evidence rather than an actor-lifetime registry. `reject`
consumes no occurrence, `cancel` removes the prior local preview before admitting its replacement, `allow`
retains independently ordered layers while only the current generation controls the public projection and
mapped event, and `serialize` admits exact-key FIFO with preview application at dequeue. Retry is a new
explicit commit event and never an automatic policy action.

### SEM-019 — Activity identity uses stable declaration slots

Continuing activity identity MUST include the stable compiled AppPlan declaration slot, operation kind,
exact descriptor, and canonical `K`; executable `P` is retained input, not function-allocation identity.
A changed descriptor, key, or normalized declaration identity MUST release the old binding and acquire a
new one. A freshly allocated equal plan retains existing continuing work.

Finite resource and transaction work is admitted through event-transition `actions`, while continuing
resources and streams are authored as state `activities` or independent `onMemory` declarations. Each
`onMemory` entry receives current immutable memory on activation, re-entry, and committed memory changes;
each entry independently owns one continuing plan, `false`, or `null`. `false` and `null` release only
that entry. No callback receives an unsubscribe handle, and no entry may return runtime-sized arrays,
`subscribeMany`, or `subscribeEach` behavior.

`onMemory.select(selector, factory)` uses the shared selector equality and accepts no custom comparator.
On owning-state activation or re-entry it invokes the factory with the current selected value and
`previous: undefined`; the selection baseline resets when the state exits. A later selected-value change
invokes the factory with the current and immediately preceding selected values. Equality suppresses the
factory. The factory returns one continuing plan, `false`, or `null`, and those sentinels release only this
declaration.

An `after` timer may target an explicit refresh event for a continuing resource. The runtime admits at most
one refresh for an exact descriptor/K identity, schedules the next timer only after settlement, waits for the
next interval after failure, and never retries implicitly. Suspension and disposal cancel and fence the timer;
resume performs at most one overdue refresh. No timer fact admits finite actions directly.

An activity authored on a compound state starts when that compound becomes active, remains alive across
descendant transitions, and stops only when that compound exits. Descendant activities follow their own
state membership; nested activities start parent-to-child and stop child-to-parent. An unchanged ancestor
path preserves its work. A compound timer starts when its compound becomes active, retains its original
deadline across descendant transitions, and is cancelled when that compound exits.

A timer is one-shot per configuration activation. Its due fact consumes the scheduled generation once
whether its guard accepts or rejects the transition and publishes `status: "fired"`; it cannot reschedule
on an unrelated same-state turn. Changed state or exact `reenter` creates a new generation. Equal
deadlines use the retained deterministic ordering boundary. Timer-owned finite actions remain prohibited;
`REV-OPS-015` accepts timers as event-targeting only.

### SEM-020 — Scope ownership is singular

Every actor-local activity binding MUST run as `Effect.scoped` under the actor's managed ownership. Keyed
work uses FiberMap, independent parallel work uses FiberSet, and serialized transaction work uses a Queue
worker. An activity MUST NOT create a manually managed second child Scope. Release and finalization MUST
run exactly once in reverse acquisition order where ordering applies.

An exact-key resource lookup is runtime-store execution rather than actor-private execution. The runtime
store owns its lookup generation and in-flight lease; actor scopes own registrations and activity leases.
Actor release removes only that registration. Generation checks suppress superseded completion and lease
epochs suppress old collection. Suspension is one serialized lifecycle lane: queued finite occurrences
settle as planned interruption without starting adapters, unsettled finite work receives the production
interruption request, continuing streams close without a mapped domain outcome, installed timers retain
absolute deadlines, pending outcomes and occurrence cursors remain, and an ignored interruption retains
only the minimum fact needed for truthful settlement. Resume waits for finalizers, reconciles continuing
declarations and due timers, and never replays finite work or claims reversal of an irreversible effect.
The public transaction state union and any `unknown` or reconciliation representation remain unresolved
under `BEH-023`; this internal normalization does not add a public lane. A cleanup defect leaves the
actor suspended and blocks resume until owner or runtime disposal.

### SEM-021 — Planned release is cleanup, not a routed outcome

Leaving an owning state configuration MUST release its activities and MAY publish cleanup facts, but it
MUST NOT synthesize a domain outcome route. Cleanup defects MUST enter issues and receipts without rolling
back an already published transition. Planned cancel, state release, and concurrency supersession likewise
do not invoke an authored interruption mapper.

### SEM-022 — Continuing remote behavior uses accepted actor ownership

Flow MUST NOT represent a behaviorally significant remote workflow as a child machine or child activity.
Such a workflow requires an explicitly owned actor admitted by the `AppPlan`; a purely operational
continuing lease MAY remain a scoped stream activity whose acquisition uses `Effect.acquireRelease`.
Normal completion, interruption, and release failure MUST remain distinguishable, and release MUST run
exactly once. The accepted material does not authorize a child-equivalent replacement surface.

## Failure, disposal, and observation

### SEM-023 — Full Cause determines classification

Runtime operation completion MUST retain `Exit` and full `Cause`. Classification precedence is defect,
then typed failure, then interruption-only. Empty or unclassifiable failure is an internal defect. Cause
squashing is allowed only while adapting to a JavaScript throw or rejection boundary. Public snapshots do
not expose `Cause`; complete failure evidence belongs in inspection TurnRecords.

### SEM-024 — Owner-lease disposal and the production actor lifecycle

The production actor lifecycle MUST be the closed union `prepared | active | suspended | disposed`, with
transitions `prepared -> active <-> suspended` and a terminal transition to `disposed`. `prepared` means
never attached, with no live runtime resources and command buffering enabled. `active` enables command
admission and live runtime-resource ownership. `suspended` preserves actor continuity while rejecting
commands and owning no live attachment resources. `disposed` is terminal and rejects every later
operation.

Individual terminal disposal MUST belong only to an explicit owner lease `{ actor, dispose }`. The actor
handle and ref MUST expose no disposal authority. `lease.dispose()` MUST be asynchronous, idempotent, and
terminal; its first successful call closes command admission, releases the actor through production
cleanup, settles buffered acknowledged commands, interrupts owned work, awaits and classifies finalizers,
publishes the disposed snapshot with cleanup truth, and makes escaped handles reject later commands.
Dropping a lease MUST NOT dispose the actor. Whole-runtime disposal MUST subsume outstanding leases and
tear down the context graph in reverse dependency order. Disposal MUST be rejected before it begins when
any non-disposed consumers, including suspended consumers, remain bound to the actor's ref, and the
rejection MUST identify every dependent actor ref and bound context key. A suspended consumer retains its
logical provider edge even though it owns no live attachment subscription. A terminal-looking machine
state does not complete or dispose the actor.

Stable shared actor disposal MUST leave a runtime-incarnation tombstone. `getActor(ref)` and
`ensureActor(ref, ...)` MUST reject that disposed ref until the runtime itself is disposed; a new runtime
may restore or create a fresh incarnation from the same durable ref. Post-bootstrap admission and owner
authority follow SEM-029; durable capture membership and stable-ref encoding remain unresolved under
`BEH-004` and `BEH-005`.

React Effect setup activates or resumes the same prepared or suspended actor, while Effect cleanup
genuinely suspends it. Suspension releases attachment-owned registrations, observer fanout, context
subscriptions, continuing scopes, and installed timers while preserving the exact ref, handle, state,
memory, context baseline, operation records, and absolute timer deadlines. Resume reacquires production
resources against current providers and due deadlines without rerunning input, memory initialization,
committed events, finite actions, or baseline `onContext`. Suspension closes command admission at one
linearization point: earlier admitted commands retain FIFO order, later commands reject, and no suspended
command is buffered. Queued finite work is normalized without adapter start, unsettled finite work is
interrupted, streams close, and resume waits for finalizers before reconciling continuing work and due
timers. Cleanup defects leave the actor suspended and make resume fail until owner or runtime disposal.
The capability matrix is the closed prepared/active/suspended/disposed matrix in SEM-007.

Every lifecycle transition MUST publish one coherent immutable snapshot through the existing handle before
appending its inspection event. Lifecycle evidence MUST retain `actor:start`, `actor:restore`, and
`actor:dispose`, add `actor:suspend` and `actor:resume`, and MUST NOT add `actor:prepare`. Lifecycle evidence
MUST NOT create a machine-turn revision or `TurnRecord`; an inspection listener MUST observe the event's
`to` lifecycle after receiving that event. The lifecycle snapshot receives a new publication revision,
and its immutable `LifecycleRecord` is accepted asynchronously through the same globally sequenced
evidence hub as TurnRecords. The record includes the published snapshot and exact actor/app/plan
provenance, `from`, `to`, cause, publication revision, machine-turn revision, timestamp, and evidence
sequence. Sink overflow truncates only that sink with its retained-prefix marker; it cannot block or
roll back publication. Runtime disposal drains every accepted evidence record after terminal lifecycle
publication and never manufactures a terminal TurnRecord.

### SEM-024A — Callback defects retain committed truth

A user callback defect contained before the StoreState commit MUST first discard the candidate, retaining
the prior state, memory, bindings, and observed store revision. It then publishes one issue-only active
snapshot with the minimal public issue summary while retaining the full Cause in its TurnRecord. The
issue-only publication increments publication revision, not machine-turn revision; it admits no finite
occurrence, changes no StoreState, starts no staged work, and does not retry user callbacks. The
acknowledged dispatch resolves after that publication and TurnRecord are accepted. A Flow invariant
defect MUST close admission, fail the current and buffered acknowledged commands, finalize owned work,
and publish the disposed snapshot with fatal and cleanup truth. The post-store-commit publication path
MUST use non-failing primitives; committing StoreState and abandoning actor publication is an invariant
violation, not a recoverable snapshot.

Transition guards, redirects, timer guards, memory updates, binding selectors, key projections, and
invalidation target selectors fail before StoreState commit and retain prior actor/store facts. Resource
placeholder and tag behavior follows the canonical-key and actor-effective read rules in `SEM-016` and
`SNAP-004`. Outcome-mapper normalization after canonical settlement and completion-side writes follow
`SEM-016` and `SEM-018`. A view selector
changes no runtime state; selector exception memoization and recovery remain unresolved under `BEH-014`.

### SEM-024B — Issue identity has one clearing owner

An operational issue occurrence uses an immutable generation-bearing identity containing its source,
owning actor incarnation, exact binding identity when present, generation when present, and issue kind.
Its clearing-owner key contains actor incarnation, source, and exact binding identity without an attempt
generation. A later actor lifetime cannot clear, inherit, or republish an older occurrence.
Success or release by a later generation of that same owner clears older operational
occurrences; unrelated success cannot clear them. Invariant and cleanup issues survive through the
terminal disposed snapshot. Full Cause remains in TurnRecords even after an operational summary clears.

### SEM-025 — Views are exact passive actor projections

`useView(actor, selector)` MUST accept one exact actor handle and MUST be the sole ordinary reactive
subscription path. It MUST NOT create or dispose actors, change operation ownership or cache policy, or
accept a machine family, ref, registered view, or view ID. A selector receives one atomic context for one
actor revision containing exact state, immutable memory, inherited readonly context, lifecycle, issues,
bound `can(event)`, and snapshot-bound passive `O` reads.

The `O` catalogue exposed to a view MAY provide only passive `key`, `getData`, and `getState` reads. A
selector MUST NOT acquire, refresh, subscribe, commit, write, invalidate, clear, or otherwise mutate
runtime state. `useActor` and `useActorByRef` remain command-only and non-reactive. Flow MUST remove public
registered views, view IDs, module view registration, per-actor React Context, binding components, and
view-bound `can` APIs under `DEL-001`, `DEL-007`, `DEL-008`, and `RET-005`.

### SEM-026 — Shared selector equality is deterministic and narrow

Every long-lived context, `onMemory.select`, and `useView` selector MUST be synchronous, pure, and
side-effect-free. Scalar and non-record selected results MUST use complete-value `Object.is`. Named plain
record results MUST use their fixed key set and field-by-field `Object.is`. Arrays are ordinary selected
values and use complete-value `Object.is`. Equal results produce no downstream work, and selector
registrations accept no custom comparator. `useShallow(selector)` MAY remain an explicit React-only named
record memoization adapter using the same field comparison.

A selector's exact descriptor/K reads through passive `O.getData` and `O.getState` are tracked by the owning
view runtime. The dependency set is replaced after each completed evaluation, and a matching actor or
canonical StoreFanout publication reruns the selector against one tear-free boundary. Handlers do not
create implicit dependencies. Selector evaluation remains passive and cannot acquire ownership, start work,
or mutate state. Selector exception memoization and recovery remain unresolved under `BEH-014`.

### SEM-027 — Runtime readiness remains host state

Runtime acquisition and readiness are host/runtime concerns and MUST NOT be represented as a user-authored
machine loading state. Internally, the runtime phase is the private closed union
`constructed | booting | ready | failed | disposed`. `constructed` owns only service-free shell cells;
`booting` validates boot data, acquires the Layer, and admits the initial graph; `ready` permits ordinary
work; `failed` closes admission after reverse-order rollback; and `disposed` is terminal. Post-bootstrap
admission uses the same atomic transaction and rollback law as initial admission. No public phase union,
new readiness API, or machine state is added; existing host readiness and Effect bridges observe the
private phase. Actor snapshots use the separate production lifecycle in `SEM-024`.

### SEM-028 — Lifecycle evidence is ordered and asynchronously payloaded

Lifecycle publication and ordinary machine publication use separate actor ordering fields but one
runtime-global evidence sequence. The lifecycle lane holds the publication barrier while it allocates
the next sequence, publishes the immutable snapshot, and accepts the `LifecycleRecord`; the record is
then released to sinks asynchronously behind the same gate used for TurnRecords. A lifecycle record
contains the published immutable snapshot rather than a later live read, exact actor/app/plan and
actor-incarnation provenance, `from`, `to`, discriminated cause, timestamp, publication revision,
machine-turn revision, and evidence sequence.

Sink attachment overflow is bounded truncation with an explicit retained-prefix marker. It never blocks
publication, changes actor truth, or causes a second record history. Sink failure detaches only that sink
after preserving committed truth. Runtime disposal stops new admission, accepts any terminal lifecycle
records that were linearized, drains the accepted evidence prefix, and closes sinks and queues without
creating a synthetic terminal `TurnRecord`.

### SEM-029 — Post-bootstrap admission and rollback are linearized

After bootstrap, `ensureActor` and `createActor` validate exact app/plan provenance, machine identity,
ref incarnation, input, context bindings, provider availability, tombstones, duplicate instance
identity, and instance cycles in one admission transaction. The transaction installs the silent context
baseline and logical edges, attaches and activates the actor, and exposes the lease only after success.
Concurrent ensures for one stable identity join one admission and one terminal owner authority. Failure
rolls back staged work, dependency edges, mailbox, actor registration, and prepared state in reverse order;
no partial handle, snapshot, operation generation, StoreState mutation, or lifecycle evidence escapes.

### SEM-030 — Occurrence fences include actor incarnation

An occurrence is internally identified by actor incarnation, operation kind, descriptor ID, canonical `K`,
and a one-based non-reused ordinal. Shared resource work additionally carries its exact store generation
and lease epoch. Completion and controlled simulation MUST match all applicable fences before publishing;
stale facts may settle only bounded old evidence and MUST NOT touch a later actor lifetime, a reused stable
ref, or a collected/reused store entry. This internal identity does not add a public occurrence handle,
change the accepted operation unions, choose the transaction `unknown` representation, or change Cause
wire shape.
