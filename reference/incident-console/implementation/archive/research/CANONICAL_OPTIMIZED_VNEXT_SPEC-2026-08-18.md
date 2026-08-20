# Canonical optimized vNext specification

Status: non-normative research synthesis. This is the single combined
optimization specification selected from four independent alternatives. It
does not amend a contract, authorize an unresolved behavior, or claim implementation proof. Its crosswalk is
a pre-2026-08-18 research snapshot; current `BEH-*` status and closure authority are in
`revision-spec/UNRESOLVED_BEHAVIOR.md` and the accepted `REV-*` clauses. The current register has no open
inherited behavior entry.

The objective is fewer semantic owners, fewer repeated algorithms, fewer
allocations, and substantially less code while retaining every accepted
feature. A reduction is accepted only when its ownership, failure, proof, and
performance gates pass together. A generic abstraction that hides a missing
behavior is a failed optimization.

## 1. Authority and research inputs

Read in this order:

1. [`revision-spec/README.md`](../../revision-spec/README.md) and accepted revisions;
2. the normative files in [`contracts/`](../../contracts/);
3. [`UNRESOLVED_BEHAVIOR.md`](../../revision-spec/UNRESOLVED_BEHAVIOR.md);
4. this synthesis;
5. the research inputs and alternatives below.

Accepted revisions override conflicting older wording. Untouched contract
clauses remain authoritative. An open `BEH-*` item is not implementation
permission, even when another contract paragraph appears to choose an answer.
Those contradictions are recorded here as blocked candidates.

Research inputs:

- The graph and alternative-input files from this pre-2026-08-18 synthesis are not retained in the
  current tree; the synthesis remains only as a historical snapshot.
The former root guardrail, CLI-exploration, and open-question documents were retired after their
contract-worthy content was integrated into the active contracts, including
[`IMPLEMENTATION_WORKFLOW.md`](../../contracts/IMPLEMENTATION_WORKFLOW.md).

## 2. Synthesis decision

| Source                                  | Selected contribution                                                                                                                  | Rejected or deferred contribution                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Alternative A: conservative semantics   | Effect-owned scopes, queues, fibers, interruption, explicit policy owners, five authorities                                            | Keeping one independent consumer/fiber per actor as the permanent scheduler shape     |
| Alternative B: algorithms               | Exact primitive keys, immutable plan indexes, `StorePatch`, exact relation indexes, deadline index, bounded sink, differential oracles | Fixed-page store, custom arenas, and other representation changes before measurements |
| Alternative C: deletion/surface         | Delete duplicate runtimes, queues, registries, projections, wrappers, and file-local truth; enforce deletion gates                     | Treating a file-count target as proof of semantic equivalence                         |
| Alternative D: adversarial completeness | One runtime implementation, narrow shared mechanisms, race workloads, plugin boundaries, hostile-input gates                           | Universal projection/evidence kernels and event-log-owned runtime                     |

Chosen combination:

1. Use the five-authority architecture as the semantic center.
2. Use pinned Effect `ManagedRuntime`, `Scope`, `Queue`, `Fiber`, `Stream`,
   `Clock`/`TestClock`, interruption, and finalizers as the runtime substrate.
3. Use one `ActorIngress` per actor plus one duplicate-free ready-actor
   scheduler. Keep the queue implementation conservative until a benchmark
   proves a custom transport worthwhile.
4. Use exact authored identity and collision-safe primitive keys. Hashes may
   route lookup but never decide equality.
5. Use one `StorePatch` per logical commit, one canonical revision, exact-key
   relation indexes, one `DeadlineIndex`, and bounded evidence sinks.
6. Share only transport, diff, relation-index mechanics, and small pure
   functions. Keep resource, transaction, stream, timer, context, lifecycle,
   evidence, and CLI policies distinct.
7. Defer custom mailbox rings, dense arenas, segmented COW, object pools,
   timer wheels, and universal projection kernels until promotion gates pass.

## 3. Authorities and data ownership

| Authority                    | Owns                                                                                                   | Must not own                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `AppPlan`                    | Immutable compiled machines, descriptors, declarations, requirements, and indexes                      | Runtime phases, actors, fibers, current values                 |
| `FlowRuntime`                | One execution world, admission, actor directory, scheduling, clock, host signals, and disposal         | Machine semantics, canonical resource values, retained history |
| `ActorState` / `ActorCell`   | One actor's frame, memory, bindings, occurrences, issues, dependencies, leases, lifecycle, and ingress | Shared canonical values, another actor, React state            |
| `StoreKernel` / `StoreState` | Canonical resources, generations, overlays, revisions, fences, and exact-store indexes                 | Actor invocation or notification policy                        |
| `EvidenceHub`                | Evidence acceptance, ordering, release permits, and sink attachment                                    | Unbounded history, Story checkpoint authority, static facts    |

Derived coordinators are not additional semantic authorities:

- `ContextGraph` owns provider/consumer edges, wave IDs, topological work, and
  context publication.
- `StoreFanout` owns dynamic registrations and reverse lookup; it never owns
  canonical values.
- `DeadlineIndex` owns due-time ordering and compact cancellation entries;
  operation policies own repetition and meaning.
- `CheckpointCut` reads a consistent product from authorities; it is not a
  second history or snapshot store.
- Effect `Scope`s own finalizers. Cleanup plans may order owner scopes but do
  not retain duplicate release closures.

<pre class="mermaid">
flowchart TB
  Definition[Definition input] --> Compiler[Pure compiler]
  Compiler --> Plan[Immutable AppPlan]
  Plan --> Runtime[One FlowRuntime instance]
  Runtime --> Directory[Actor directory]
  Directory --> Actor[ActorCell + ActorState]
  Actor --> Ingress[ActorIngress]
  Ingress --> Interpret[Named policy interpreter]
  Interpret --> Commit[Pure candidate and commit coordinator]
  Commit --> Store[StoreKernel + StoreState]
  Commit --> Frame[ActorFrame publication]
  Commit --> Evidence[EvidenceHub acceptance]
  Store --> Fanout[StoreFanout reverse index]
  Fanout --> Ingress
  Runtime --> Context[ContextGraph waves]
  Context --> Ingress
  Runtime --> Deadlines[DeadlineIndex]
  Deadlines --> Ingress
  Frame --> View[Passive read cut]
  Store --> View
  Evidence --> Sink[Optional bounded RingSink]
  Plan --> Facts[Execution-free static facts]
  Facts --> CLI[CLI projection]
  Evidence --> Cut[Story CheckpointCut]
  Cut --> Story[Story projection]
</pre>

There is one runtime implementation. Browser roots, requests, Stories, tests,
and isolated server calls may construct separate runtime instances, but they
do not construct separate runtime _kinds_ or parallel state models. React,
Story, inspection, CLI, and future Vue/Svelte adapters are bridges or plugins
over the runtime and its inspection projections.

## 4. Data journeys in simple words

### 4.1 Actor command

```text
command
  -> admission into one actor ingress
  -> named machine/lane interpretation
  -> complete pure candidate
  -> one ActorState patch and optional StorePatch
  -> short atomic publication tail
  -> evidence acceptance
  -> post-commit reconciliation
  -> acknowledgment and release gate
```

Reentrant input appends behind admitted work; it never executes inline. No
external callback, transition, redirect, selector, or finite operation starts
before the candidate has been validated and published.

### 4.2 Resource and refetch

```text
lookup(P, K)
  -> canonical primitive resource key
  -> find/create one StoreKernel generation
  -> pin one shared P and run work once
  -> settle canonical truth exactly once
  -> publish one canonical revision and changed-key set
  -> StoreFanout finds affected registrations
  -> actors reread and publish fenced projections
  -> next explicit refresh event creates the next generation
```

Delivery registration count is not generation ownership. A continuing
occurrence or runtime lease may keep work alive with zero observers. The last
occurrence cancellation or runtime disposal interrupts it according to the
accepted operation law. Polling uses timer events plus explicit refresh
semantics, not timer-owned hidden action execution.

### 4.3 Transaction preview, rollback, commit, and remote unknown

```text
occurrence
  -> actor-owned overlay layer
  -> preview reads canonical base + initiating actor layers
  -> capture base revisions and durable idempotency identity
  -> dispatch once across the irreversible remote boundary
  -> success: explicit all-keys CAS promotion
  -> pre-boundary cancellation: remove local overlay
  -> post-boundary cancellation: publish Unknown(remoteId)
  -> reconciliation or compensation is a new occurrence
```

There is no generic public rollback operation. “Rollback” is local
pre-boundary overlay removal or failed promotion handling. Remote success is
never erased by a local undo; a conflict preserves canonical truth and the
remote outcome remains occurrence evidence.

### 4.4 Reactivity and context

```text
provider publication -> ContextGraph wave -> consumers reread providers
canonical commit -> exact reverse-index lookup -> actors reread StoreState
actor/store publication -> commit epoch changes -> passive view retries/accepts
```

The runtime installs and owns subscriptions internally. Hooks attach passive
read leases and bridges; users do not manually subscribe to internal resource,
transaction, context, or lifecycle publications. Selectors never acquire work,
refresh resources, mutate state, or run Effect.

### 4.5 Lifecycle and hydration

```text
prepared -> attach -> active -> suspend -> resume -> active
prepared/active/suspended -> disposing -> disposed/tombstoned
persisted semantic state -> inert restore -> live declaration rematerialization
```

Hydration does not replay finite work or restore fibers, queues, scopes,
streams, or inspection buffers. A failed continuing-operation rematerialization
stays non-running with truthful evidence.

### 4.6 Story, React, and CLI

```text
Story plan -> production RuntimeFactory -> same actor/store/evidence owners
React bridge -> passive reads and attachment scopes; no actor truth ownership
artifact CLI -> bounded structural decode -> pure projection -> atomic output
static facts -> symbol/import/dispatch index -> CLI explanation
```

Artifact-only CLI paths load no runtime, gateway, fixture, or TypeScript
program. A traced Story run uses one bounded sink; a zero-history run uses no
sink. Static facts contain provenance and explicit unknowns.

## 5. Canonical data structures

### 5.1 Immutable compiled plan

```text
AppPlan
  identity: appId, persistenceVersion, persistenceFingerprint
  machineTable: MachineId -> MachinePlan
  descriptorTable: DescriptorId -> DescriptorPlan
  declarationTable: DeclarationSlot -> declaration payload
  contextTable: ContextDeclarationId -> fixed edge payload
  requirementTable: RequirementId -> service requirement
  directory/indexes: authored identities -> typed handles
```

Build normalized parent/child, active-leaf, event-dispatch, context, and
tooling indexes once. Handles are not a second tagged copy of every payload.
Numeric slots are runtime-local accelerators and never durable identity.

### 5.2 Runtime and actor

```text
RuntimeDirectory: ActorRef -> admitting | live | tombstone

ActorCell
  identity: authored ActorRef + incarnation
  state: one ActorStateCell
  ingress: one mailbox of ActorEnvelope
  scheduler: idle | queued | draining
  lifecycle: ActorLifecycleOp
  actorScope + current attachment scope
  accepted-command waiters and owner leases

ActorState
  frame: immutable published memory/context/lifecycle/revision frame
  bindings: DeclarationSlot -> BindingState
  occurrences: OccurrenceId -> OccurrenceState
  baselines, issues, dependencies, cursors, incarnation, lifecycle epoch
```

Stable-ref tombstones prevent lookup or `ensureActor` from silently creating a
replacement incarnation. A prepared actor has no live directory entry until
the accepted attach path succeeds. A published `ActorFrame` is a reference to
actor truth, not another mutable authority.

### 5.3 Canonical resource identity and store

```text
CanonicalRefKey = collision-safe primitive key for (descriptor identity, K)

StoreState
  entries: CanonicalRefKey -> StoreEntry
  canonicalRevision
  changedRefKeys for the last logical batch

StoreEntry
  canonical base + freshness metadata
  GenerationLeaseState, when live
  ordered actor-scoped overlay layers
  canonical fence and lease epoch
```

Canonicalization costs O(|K|) once, then expected O(1) lookup. The exact byte
grammar and mutable-container treatment remain controlled by `BEH-027`. A
hash may route to collision buckets but hash equality is never semantic
identity. Executable `P` remains separate and is never reconstructed from `K`.

### 5.4 Leases, transactions, deadlines, and evidence

```text
GenerationLeaseState
  shared work and pinned P
  generation epoch
  delivery registrations
  continuing occurrence leases
  runtime/disposal lease
  settlement: live | settling | settled | interrupted

RemoteTxnState
  phase: Planned | Dispatching | Submitted | Unknown | Succeeded | Failed | Conflict
  remoteId/idempotency identity, boundary state, P, occurrence identity
  overlay IDs, captured base revisions, terminal-settlement bit

DeadlineEntry: dueAt + stable order key + owner slot + fence token + status

RingSink
  capacity (0 or default 256), circular storage, accepted high-water
  processed/truncated high-water, truncation boundary, lifecycle status
```

`EvidenceHub` accepts records but retains no history. Retention belongs to
bounded sinks and checkpoint cuts. Turn records and lifecycle records have
separate constructors even if their transport is shared.

### 5.5 Identity and fact-fence normalization

Normalize identity into explicit, non-interchangeable records. Do not create a
single universal identity that allows durable actor identity, resource lookup,
and finite occurrence identity to blur together:

```text
CanonicalRef      = descriptorId + canonicalKeyBytes
CanonicalRefKey   = collision-safe primitive index key for CanonicalRef
ActorIdentity     = authored ActorRef + actorIncarnation
OperationIdentity = actorIncarnation + occurrenceOrdinal + descriptorId
                     + canonicalKeyBytes + operationKind + declarationSlot
                     + remoteIdentity/boundary
BindingKey        = declarationSlot + operationKind + descriptorId
                     + canonicalKeyBytes
```

`canonicalKeyBytes` is the exact contract-defined representation of `K`;
`CanonicalRefKey` is only an index accelerator. A hash may route to collision
buckets, but canonical-byte equality remains the semantic check. `P` remains
executable input and is never reconstructed from `K`.

Every asynchronous fact carries a discriminated fence. Share the actor/lifetime
prefix and the rejection skeleton, but require owner-specific fields:

```text
ActorFencePrefix = actorIncarnation + leaseEpoch
FactFence =
  resource: prefix + generationEpoch + canonicalRefKey
  transaction: prefix + occurrenceOrdinal + remoteIdentity + remoteBoundary
  stream: prefix + declarationSlot + bindingGeneration
  timer: prefix + declarationSlot + timerGeneration
  context: prefix + contextWaveId + providerRevision
  storeFanout: prefix + storeRevision + changedRefKeys
```

`validateFence` first checks the actor/lifetime prefix, then delegates to the
authoritative owner table for the fact kind. A missing owner-specific field is
a malformed fact, not a current fact. Stale facts may produce bounded truthful
evidence, but never a state mutation or a new operation.

### 5.6 Revision meanings and compiled state indexes

Keep revision meanings separate even when they are represented by small numeric
values:

```text
ActorRevision
  publication       // any published actor frame
  machineTurn       // accepted machine-turn publication only
  observedStore     // last canonical revision observed by this actor

StoreRevision
  canonicalStore
  changedRefKeys
```

Lifecycle and projection-only publications advance `publication` without
manufacturing a `machineTurn`. A Store revision is canonical resource truth;
it is not an actor publication revision. Passive reads and capture compare the
relevant pair rather than treating one counter as a universal clock.

Each `MachinePlan` owns the normalized state relation and hot dispatch table:

```text
MachinePlan
  nodes: token, parent, depth, kind, children, defaultChild, declarations
  stateIndex: StateToken -> node position
  eventTable: active-leaf/event -> ordered handler rows
  declarationTable: compiled activity/context/timer slots
```

Parent/child relations and event tables are authoritative. Roots, leaf lists,
compound lists, ancestor arrays, and active paths are derived views for bounded
runtime or cold inspection work; they are not duplicated authorities.

The compiler emits one immutable index set for admission, actor creation,
inspection, Story recipe validation, persistence identity, and future tooling:

```text
AppPlanIndexes
  machineById, descriptorById, stateByToken, parentByState
  transitionsByStateAndEvent, contextProvidersByRef
  contextConsumersByProvider, operationFamiliesByDescriptor, moduleIds
```

Runtime-local numeric declaration/state slots may replace repeated string
lookups, but slot numbering is never actor, descriptor, generation, or
persistence identity. Do not bit-pack revisions through JavaScript bitwise
operations. Static source facts are a separate execution-free symbol/import/
dispatch index with provenance and explicit unknowns; they never become
runtime authority.

## 6. Minimal shared mechanisms

The optimization shares mechanics only where the semantic laws are identical.

### 6.1 `ActorIngress`

`ActorIngress` owns mailbox admission and the path to a named policy
interpreter. `FlowRuntime` owns the ready-actor queue and fairness quantum.
The baseline uses the pinned Effect queue; a private ring is an experiment,
not a second scheduler. One actor has at most one queued scheduler marker and
one draining owner. A full prepared/suspended mailbox follows the accepted
overflow behavior; no accepted terminal, mapped event, lifecycle fact, or
command is silently dropped.

### 6.2 `BindingDiff`

`BindingDiff(previous, next)` is a pure replacement/removal planner:

```text
equal       -> retain lifetime and pinned P
changed     -> release old exactly once, acquire new
false/null  -> release this declaration only
initial     -> acquire without a previous binding
```

Named resource, stream, timer, and activity policies provide ownership,
generation, terminal, and release semantics. `BindingDiff` never switches on
operation kind and never owns passive view leases.

### 6.3 `ReplaceableRelationIndex`

Use one forward/reverse edge substrate with separate logical instances:

```text
forward: ConsumerId -> { epoch, dependency keys, cursor, owner metadata }
reverse: DependencyKey -> ConsumerId -> epoch
```

`StoreFanout` may replace dynamic registrations. `ContextGraph` uses fixed
edges, suspended-edge retention, wave IDs, topological frontiers, equality,
and coalescing rules that remain outside the shared substrate. Empty reverse
buckets are removed and recipients are deduplicated with a local stamp.

### 6.4 Actor envelopes and the drain protocol

Commands and facts share one mailbox without sharing semantics:

```text
ActorEnvelope
  kind: command | externalFact | lifecycle | reconciliation
  payload
  fence: FactFence | undefined
  ack: Deferred | undefined
  causalBatch: number | undefined
```

The mailbox owns entries and admission; the runtime owns one ready-actor
queue; the actor owns the sole drain token. The observable algorithm is:

```text
offer(envelope)
  -> reject if disposed
  -> apply accepted suspended/prepared admission rule
  -> append to actor mailbox
  -> if active and scheduler is idle, queue actor once

drain()
  -> mark draining
  -> consume the configured fairness quantum
       interpret with current ActorFrame
       publish or reject according to envelope kind
       allow reentrant offers to append behind current work
  -> if work remains, requeue actor once
  -> mark idle
```

No reentrant offer executes inline. No `Array.shift`, per-event array rebuild,
or second Story/test ready queue is allowed. A full mailbox follows its
accepted overflow behavior; it never silently drops a command, terminal fact,
mapped event, or lifecycle fact. The fairness quantum and high-rate stream
policy remain policy/BEH boundaries rather than hidden defaults.

### 6.5 Event and fact ownership

All external work re-enters through a named actor envelope. The envelope kind
determines what may be read, projected, committed, or coalesced:

| Fact or input               | Delivery owner                                    | May cause                                   | Must not cause implicitly                        |
| --------------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------------------------------ |
| Public/acknowledged command | ActorIngress                                      | ordinary machine turn and declared writes   | inline reentrancy or bypassed evidence           |
| Store revision              | affected actor ingress                            | authoritative reread and projection         | copied historical values or transition execution |
| Resource outcome            | joined actor ingress after StoreKernel settlement | fenced projection and optional mapped event | duplicate canonical settlement                   |
| Transaction settlement      | initiating actor ingress                          | overlay resolution and explicit promotion   | unannounced canonical write or retry             |
| Stream emission             | owning actor ingress                              | projection and optional mapped event        | implicit resource-cache write                    |
| Stream terminal             | owning actor ingress                              | terminal projection/evidence                | mapped event or canonical write by default       |
| Timer due                   | owning actor ingress                              | optional event turn                         | direct state mutation or finite work bypass      |
| Context propagation         | consumer ingress                                  | context projection and later mapped event   | cross-actor parentage or StoreState write        |
| Lifecycle command           | serialized ActorIngress lane                      | lifecycle publication and attachment work   | machine `TurnRecord` semantics                   |
| Post-commit reconciliation  | owning actor ingress                              | binding/lifecycle reconciliation            | mutation before the initiating publication       |
| Mapped domain event         | actor ingress                                     | ordinary machine turn                       | inline transition execution                      |
| Host signal                 | host adapter, then runtime                        | interruption, lifecycle, or disposal path   | direct domain write                              |
| Evidence record             | EvidenceHub                                       | bounded sink/projection delivery            | current runtime mutation                         |

This table is a routing and ownership invariant, not a new public API. The
accepted contract and applicable BEH decide exact envelopes and failure
projections. When a fact is stale, malformed, cancelled, or superseded, the
owner records only the truthful bounded result and does not reinterpret it as a
new command.

### 6.6 Small pure functions, not universal kernels

Keep these as small stateless functions called by named policy owners:

- `validateFence(fact)` checks the fields required by that fact's owner;
- `sameSelection(previous, next)` implements accepted equality;
- `readViewCut()` samples revisions and conditionally installs a passive lease;
- `StorePatch` builds an all-or-none logical store update;
- `DeadlineIndex` orders due entries without owning timer meaning.

Do not create one policy-switching `FencedProjection`, one universal evidence
decoder, or one operation interpreter for resources, transactions, lifecycle,
streams, Story, and CLI. Shared code must not erase owner-specific settlement,
retention, cancellation, or failure laws.

## 7. Core algorithms and protocols

### 7.1 Pure planning and commit

```text
TurnPlan = previous ActorFrame
         + machine transition
         + ActorState patch
         + optional StorePatch
         + binding/occurrence diff
         + evidence draft

validate complete candidate
  -> reserve evidence permit
  -> enter short commit critical section
  -> apply StorePatch to one working root
  -> advance one canonical revision and changed-key set
  -> publish StoreState and ActorFrame once
  -> accept evidence
  -> exit critical section
  -> enqueue post-commit reconciliation before acknowledgment
  -> open release gate
```

Planning, validation, key derivation, selector work, callbacks, and allocation
occur before the short tail. A failed candidate publishes no prefix. A
monotonic `commitEpoch` is odd during the non-suspending publication interval
and even outside it; passive readers and capture retry if it changes.

`StorePatch` applies all declared writes atomically or none, advances one
canonical revision, and publishes one changed-key set. The initial physical
implementation may copy one native root per logical batch. A paged or
segmented representation is a later candidate gated by Section 11.

### 7.2 Commit data shape and invariants

Keep the planning boundary explicit while avoiding duplicate intermediate
copies:

```text
TurnPlan
  previousFrame
  machineTransition
  actorPatch
  storePatch
  bindingDiff
  occurrenceDiff
  evidenceDraft

StorePatch
  baseRevision
  baseWrites
  overlayAdds
  overlayRemoves
  generationChanges
  changedRefKeys
```

`TurnPlan` is a pure candidate. A commit boundary validates and applies the
already-built patches; it must not clone the same data into separate mutation,
outcome, and receipt models merely to rename it.

The commit ordering is:

```text
validate whole candidate
  -> reserve evidence permit
  -> commitEpoch becomes odd in a non-suspending section
  -> apply StorePatch to one StoreState working root
  -> derive one canonical revision and deduplicated changedRefKeys
  -> publish StoreState and ActorFrame once
  -> accept the turn evidence
  -> commitEpoch becomes even
  -> enqueue post-commit reconciliation
  -> complete acknowledged command
  -> open release gate
  -> deliver StoreFanout facts
```

Therefore:

- no user Effect runs during pure planning or the commit tail;
- no StoreFanout delivery precedes initiating actor publication, evidence
  acceptance, acknowledgment, and the release gate;
- no half-published StoreState/ActorFrame is visible to capture or passive
  reads;
- all declared writes succeed atomically or none do;
- publication-only facts never evaluate transitions;
- mapped events are later ordinary envelopes; and
- sink work cannot delay actor acknowledgment or canonical fanout.

### 7.3 Resource generations and refetch

The StoreKernel separates delivery registrations from generation ownership.
An adapter result settles exactly once even when registration count is zero if
a valid continuing occurrence or runtime lease remains. Settlement commits
canonical truth, then creates separately fenced facts for current recipients.
The last eligible lease cancellation interrupts the generation and fences late
results. A refetch is an explicit operation event that creates or refreshes a
generation; a timer only targets the actor or dispatches that event.

The generation path is:

```text
lookup(P)
  -> validate and derive K
  -> CanonicalRef = descriptor + K
  -> read StoreState
  -> fresh: projection fact, no adapter
  -> missing/stale: get or create GenerationLeaseState
  -> pin the first live P and execute once
  -> settle the generation once, including with zero registrations
  -> commit canonical result
  -> emit separately fenced facts to captured live recipients
```

Registration count is not generation ownership. Actor bindings own delivery
and activity leases; StoreKernel owns the shared generation settlement. Derived
indexes may include `occurrencesByKey`, `bindingsByKey`, and `generationByRef`
for exact-key admission and release, but occurrence and generation rows remain
authoritative. Add and remove every index entry with its owner lifetime.

### 7.4 Transactions and remote boundaries

Promotion preflights every touched base revision, applies all writes in one
`StorePatch`, and removes initiating overlays only after all-key CAS succeeds.
Equal writes still follow the accepted overlay/promotion semantics; they are
not optimized away by value equality. Before an irreversible boundary,
cancellation can remove local overlay state. After it, the occurrence becomes
`Unknown(remoteId)` and recovery reconciles the same idempotency identity; it
never redispatches. Compensation is a new occurrence.

Each touched ref has an ordered overlay layer containing `overlayId`, actor
incarnation, occurrence ID, base revision, patch, and order. The occurrence
also retains the exact touched-key set. This lets cancellation and settlement
remove only the owner's layers without scanning every actor or replaying the
whole store. Effective reads combine the canonical base with only the
initiating actor's applicable layers.

Promotion follows this sequence:

```text
settlement fact enters actor ingress
  -> fence occurrence and remote identity
  -> reject duplicate settlement
  -> classify success/failure/defect/interruption
  -> compare every declared base revision
  -> apply all writes or none through one StorePatch
  -> promote/remove only this occurrence's layers
  -> publish canonical revision before mapped events
```

A CAS conflict preserves the current canonical base, retains remote-success
truth as occurrence evidence, and publishes conflict state. A post-boundary
cancellation removes only local provisional state and publishes reconciliation
required; it never silently retries or erases the remote operation.

### 7.5 Context and StoreFanout

Context publication creates one wave, traverses reverse edges, drains
topological frontiers, rereads all provider snapshots, compares all selected
slots, and publishes each consumer at most once per wave before mapping later
events. Suspended consumers retain logical dependency edges while active
subscriptions detach.

StoreFanout receives a canonical revision and changed keys, looks up affected
registrations only, deduplicates recipients, and sends compact facts. Each
recipient rereads StoreState and applies its own fence. Cross-source ordering
is a named policy boundary, not accidental queue order.

ContextGraph owns a distinct wave protocol:

```text
provider publishes
  -> mark reachable consumers dirty through reverse edges
  -> ContextGraph owns wave ID, topological rank, dirty set, and frontiers
  -> read current provider snapshots
  -> compare all selected slots
  -> install changed context slots atomically
  -> publish one consumer ActorFrame
  -> enqueue later mapped events
```

No intermediate combination of context slots is observable. StoreFanout may
coalesce adjacent projection revisions, but lifecycle, terminal, cancellation,
stream-terminal, and mapped-event facts do not merge. The shared relation
index provides edge mechanics only; source, read, equality, order, result, and
coalescing remain owner-specific.

### 7.6 Passive read cut

```text
subscribe before first read
  -> sample even commitEpoch, actor revision, StoreState revision
  -> select from immutable roots and tentatively collect dependencies
  -> recheck epoch/revisions and lease installation
  -> retry on odd epoch, changed revision, or lost wakeup
  -> install view-owned relation lease
  -> notify only on accepted selection change
```

The runtime owns the publication subscriptions. The hook only reads and
bridges the accepted passive tuple. Selector exceptions, construction tuples,
and final public memoization remain controlled by their BEHs.

The passive selection helper returns the previous representative when the
accepted equality says the selection is unchanged. It must not acquire work,
refresh a resource, mutate state, run Effect, or open a subscription from inside
the selector. A mounted view owns its current selected value and dependency
lease locally; that projection is never ActorState or StoreState authority.

### 7.7 Lifecycle, scopes, and persistence

Candidate private lifecycle phases are:

```text
Stable/Prepared -> Activating -> Active
Active -> Suspending -> Suspended -> Resuming -> Active
Prepared | Active | Suspended -> Disposing -> Disposed
```

Each operation has an epoch and join result. The actor Scope owns attachment
Scopes; attachment Scopes own subscriptions, stream fibers, timers, and view
leases. StoreKernel owns generation Scopes independently. Effect finalizers
are the ordinary release authority. Cleanup metadata may order owner IDs but
does not duplicate closures. Exact transitions, overflow, and evidence remain
blocked where the BEH crosswalk says so.

React attachment grants suspension authority only; an owner lease grants
individual terminal-disposal authority. Prepared abandonment is discarded
without runtime registration, tombstone, or accepted actor evidence. Runtime
cleanup closes context consumers before providers, settles accepted
acknowledgments, installs stable-ref tombstones, drains accepted evidence, and
closes runtime resources. A compact cleanup entry may record owner kind,
identity, dependency rank, and release status, but it must point to the owning
Scope rather than retain long-lived release closures.

Capture takes one non-suspending cut of selected actors, StoreState revision,
frames, provider revisions, normalized pending work, and evidence high-water.
Hydration restores semantic state inertly, providers before consumers, silent
baselines, deadlines, and rebuildable indexes. It rematerializes continuing
work from live declarations only after restoration; it does not replay finite
work or restore old fibers and queues.

Capture is a consistency protocol, not a purpose-switching serializer. Durable
dehydration validates exact actor/provider membership and revisions; a Story
checkpoint additionally captures its selected actor targets, `runtime.now`,
pending-work inventory, and accepted evidence high-water. EvidenceHub alone
cannot construct a checkpoint or `run.end`. Restore reconstructs derived
indexes from authority and never lets serialized actor projections overwrite
canonical StoreState.

### 7.8 Operation-specific continuing policies

The shared binding diff does not erase operation-specific lifetime rules:

```text
StreamBinding
  declarationSlot + descriptor + K + bindingGeneration
  -> external subscription
  -> StreamEmissionFact/StreamTerminalFact enters ActorIngress
  -> validate generation and actor incarnation
  -> publish projection or terminal state

TimerBinding
  declarationSlot + timerGeneration + dueAt
  -> DeadlineIndex
  -> TimerDueFact enters ActorIngress
  -> consume this generation whether the guard accepts or rejects
  -> polling schedules the next deadline only after refresh settles
```

Stream latest values are actor projections, not canonical resource data.
Completion, failure, defect, and interruption are terminal facts with their
own fences. A normal `after` timer is consumed once and does not directly
admit finite work. Equal deadlines use deterministic actor/declaration/
insertion ordering, and resume performs at most one overdue refresh.

`onMemory`, activities, resources, streams, timers, and passive view leases
share identity comparison and replacement mechanics only. Their policy owners
decide activation, exact reentry, committed memory-change, state-exit,
suspension, and reconciliation triggers. A binding change releases the old
lifetime exactly once before acquiring the replacement according to that
policy; a passive selector never enters this active-binding path.

### 7.9 Bootstrap and lifecycle failure matrix

Runtime control has one phase owner:

```text
constructed -> booting -> ready
booting -> failed -> disposed
ready -> failed -> disposed
```

Bootstrap prepares service-free runtime cells, restores/adopts actors,
resolves exact provider refs, installs silent context baselines, and reconciles
continuing ownership before handles escape. If decoding, admission, or
bootstrap fails, cleanup runs in reverse acquisition order:

```text
bootstrap failure
  -> stop new admission
  -> interrupt and fence fibers, timers, streams, and generations
  -> settle accepted acknowledgments
  -> release edges, registrations, staged actors, and scopes
  -> preserve primary failure plus cleanup failure
  -> dispose runtime resources
```

This is staged bootstrap rollback, not the public transaction rollback
concept. Prepared abandonment creates no runtime registration, tombstone, or
accepted actor evidence. Runtime disposal checks context integrity, cleans
consumers before providers, drains already-linearized evidence, installs
stable-ref tombstones, and closes queues, sinks, scopes, and services. A
cleanup defect does not suppress later eligible cleanup or fabricate success.

Lifecycle publication advances actor `publication` revision but not
`machineTurn` revision and does not create a machine `TurnRecord`. Exact
lifecycle sequence allocation, sink ordering, overflow, drain, and failure
projection remain BEH-controlled.

### 7.10 Host and artifact boundaries

Effect stays inside runtime-owned services, fibers, queues, scopes, clocks, and
finalizers. React, Story, server, worker, and CLI convert to Promise/callback/
process protocols only at their host edge. Artifact-only CLI commands perform
bounded decode, kind-specific validation, pure projection, bounded encoding,
same-directory temporary creation, flush/close, and the accepted atomic commit
algorithm; they load no runtime, gateway, fixture, or TypeScript program.

Story execution uses the same production RuntimeFactory. A traced run attaches
one bounded sink and drains its accepted prefix; a no-history run attaches no
sink. Signals stop later work, preserve the primary Cause, and do not interrupt
an already-entered artifact commit window. The exact output and signal
envelopes remain contract-controlled.

Boundary checklist:

- `EvidenceHub` accepts and sequences records but retains no history; retention
  belongs to bounded sinks or immutable checkpoint cuts.
- `TurnRecord` represents an accepted machine turn. `LifecycleRecord` remains
  a distinct evidence kind and never inherits machine-turn acknowledgment or
  release-gate meaning merely because transport is shared.
- A checkpoint is one consistent read product containing selected actor
  targets, actor frames, `runtime.now`, pending work, and evidence high-water;
  EvidenceHub alone cannot construct it.
- Durable dehydration validates actor/provider membership and revisions;
  hydration restores providers before consumers, installs silent baselines,
  rebuilds derived indexes, and rematerializes continuing work from live `P`.
- Hydration never replays finite work or restores old queues, fibers, scopes,
  streams, or inspection buffers.
- Artifact-only CLI commands use bounded structural decoding and pure
  projections without constructing a runtime or gateway.
- Artifact output is written to a sibling temporary, flushed and closed, then
  committed atomically according to the accepted destination/`--force` rules.
- A signal before filesystem commit prevents publication; a signal after the
  commit boundary does not roll the artifact back.
- Story failures preserve completed checkpoints and the primary `Cause` while
  cleanup outcomes remain ordered secondary evidence.

## 8. Safe sharing and forbidden merges

| Share safely                                    | Never merge                                            |
| ----------------------------------------------- | ------------------------------------------------------ |
| Actor ingress transport and scheduler admission | A second Story/test/CLI runtime                        |
| Pure binding diff                               | Continuing binding with finite occurrence              |
| Relation-index edge mechanics                   | ContextGraph policy with StoreFanout policy            |
| Fence-field prefix helpers                      | One optional fence that omits owner fields             |
| Selection equality and passive read retry       | Passive view state as ActorState authority             |
| StorePatch construction                         | Actor-effective overlay with canonical StoreState      |
| Deadline ordering                               | One timer policy for every operation meaning           |
| Effect Scope ordering                           | Duplicate finalizer callbacks                          |
| Bounded structural walking                      | CLI-only semantic decoder or universal artifact schema |
| Immutable AppPlan indexes                       | Machine hierarchy identity with actor identity         |
| Accepted-evidence projection helpers            | EvidenceHub as retained history or runtime truth       |

## 9. Deletion and implementation-surface plan

Delete a mechanism only after every reader/writer moves to the named owner and
the old export, type, fixture, helper, generated residue, and runtime path are
absent where the migration contract requires absence.

| Delete or merge                                     | Replacement                                      | Required proof                                      |
| --------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| Duplicate Story/test/scenario runtime stacks        | Production `RuntimeFactory` plus Story plan      | Live/Story parity and cleanup parity                |
| Per-feature command/fact/lifecycle/pre-ready queues | `ActorIngress` and ready scheduler               | FIFO, reentrancy, admission, ack, suspend, dispose  |
| Full StoreState clone per record                    | One logical `StorePatch`                         | Atomic CAS, capture consistency, structural sharing |
| Global keyed-concurrency scans                      | Exact primitive-key indexes                      | allow/reject/cancel/serialize and late-result races |
| Per-feature deadline maps                           | `DeadlineIndex` plus named policies              | cancellation, equal-deadline order, timer semantics |
| Repeated context/fanout edge code                   | Relation-index substrate with separate instances | fixed-edge and replacement/disposal proofs          |
| Parallel inspect/trace/CLI decoded authorities      | Accepted-record projections and bounded sinks    | artifact parity, corrupt input, truncation, BEH-033 |
| Repeated AppPlan graph walks                        | One immutable plan directory/index               | admission, Story, persistence, inspection, facts    |
| Legacy public surfaces                              | Hard deletion and negative proofs                | export absence, type failure, CLI rejection         |

Target budgets are engineering goals, not contract clauses:

- at most 12 mutable map families and at most 6 runtime registry roots;
- at most 5 queue families: actor ingress, host signal, ready actors, exact
  transaction lanes, and attached async sink delivery;
- each shared mechanism must replace at least two complete implementations,
  delete at least twice its own non-test LOC, and be no more than 250
  non-test LOC unless split into mechanism and policy;
- all shared mechanisms together target at most 1,200 non-test LOC; no semantic
  authority file targets more than 500 non-test LOC;
- the same feature slice must lose at least 30% implementation LOC, or the
  proposed abstraction is rejected as complexity camouflage.

## 10. Promotion gates

All thresholds in this section are provisional engineering gates. They are
acceptance criteria for an implementation experiment, not new public
semantics. A candidate must pass semantic gates and measurable resource gates
together; a faster implementation with a lost event is a failure.

### 10.1 Benchmark protocol

Run Node 22.18+ production builds on a dedicated M2-or-better runner in seven
fresh processes. Warm for 10 seconds and measure for 30 seconds. Record HDR
histograms for p50/p95/p99, enqueue-to-ack separately from internal work, CPU,
RSS, allocation count/bytes, GC time/pause, queue depth, dropped/rejected
inputs, and semantic counters. Compare both with the last approved receipt
and a simple correctness oracle. No candidate may regress an existing approved
path by more than 10%; absolute limits below also apply.

Every run records a final state/evidence fingerprint and exact workload seed.
Throughput is irrelevant if fingerprints, mapped-recipient counts, fences,
cleanup, or evidence prefixes differ.

### 10.2 Latency, throughput, fairness, and backpressure

| Workload                      | Provisional gate                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Pure actor memory turn        | p50 <= 0.20 ms, p95 <= 0.60 ms, p99 <= 1.5 ms                                                                   |
| One store write plus evidence | p50 <= 0.40 ms, p95 <= 1.2 ms, p99 <= 3 ms                                                                      |
| Enqueue only                  | p50 <= 10 us, p99 <= 40 us                                                                                      |
| Saturated enqueue-to-ack      | p99 <= 10 ms at 80% configured capacity; no unbounded queue growth                                              |
| StoreFanout                   | <= 75 us fixed overhead + <= 2 us per matched actor; zero-match p99 changes by <= 10% from 100 to 10,000 actors |
| Sustained throughput          | >= 50,000 memory turns/s and >= 20,000 store turns/s, or >= 1.25x the conforming baseline                       |
| Fairness                      | Jain index >= 0.99 for one hot actor plus 1,023 cold actors; cold p99 <= 10 ms and no starvation                |
| GC                            | <= 5% wall time, p99 pause <= 8 ms, no pause > 20 ms, final 30-second throughput within 5% of initial           |

Queue capacity, overflow, acknowledgment, cancellation, and shutdown remain
semantic policy, not benchmark choices. Any bounded queue test records the
accepted result for every input: processed, rejected, superseded, or
interrupted.

### 10.3 Allocations, retained memory, and indexes

| Area                  | Provisional gate                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Memory-only turn      | <= 4 KiB and <= 24 allocations/turn                                                                          |
| Store turn            | <= 8 KiB and <= 48 allocations/turn                                                                          |
| Fanout                | <= one compact envelope plus <= 256 bytes/recipient                                                          |
| Runtime retained heap | after 10m turns, disposal, and forced full GC: <= max(2 MiB, 2% live baseline); retained slope < 1 byte/turn |
| Actor control state   | <= 24 KiB/actor excluding user values                                                                        |
| Cancelled deadlines   | rebuild before max(4,096, 2x live entries); rebuild zero cancelled entries                                   |
| Deadline rebuild      | 100,000 entries in <= 20 ms with deterministic equal ordering                                                |
| StorePatch sharing    | 100 writes/100,000 entries preserves >= 99.9% untouched entry identity                                       |
| StorePatch scaling    | 1,000 to 100,000 entries with same touched set increases allocation/p99 by <= 15%                            |
| Evidence sink         | capacity 256 retains <= 256 records and <= 256 KiB overhead after 1m records; capacity 0 retains none        |

Allocation gates count transient allocations and retained objects separately.
An arena or pool cannot pass by hiding retained user graphs, stale fences,
diagnostic identity, or cleanup ownership.

### 10.4 Reactivity and selection gates

- An unrelated canonical commit evaluates zero unrelated selectors.
- A matching registration performs at most one complete selector evaluation per
  stable revision pair.
- A context consumer runs at most once per publication wave.
- Equal selected values produce no host notification.
- A lost-wakeup race either retries or proves a relation lease installed before
  the next publication; no manual consumer subscription is required.
- StoreFanout, ContextGraph, lifecycle, and transaction facts retain their
  distinct ordering and fence semantics.

### 10.5 Startup, CLI, and TypeScript gates

| Area                      | Provisional gate                                                     |
| ------------------------- | -------------------------------------------------------------------- |
| AppPlan startup           | 100 machines/25,000 descriptors <= 50 ms; 400/100,000 <= 250 ms      |
| Empty runtime             | p95 <= 25 ms                                                         |
| Bootstrap                 | 100 actors at depth 10 <= 150 ms                                     |
| CLI `--help`              | <= 150 ms                                                            |
| Gateway-free artifact     | 1 MiB <= 300 ms; 64 MiB <= 3 s; RSS <= 3x input + 64 MiB             |
| TypeScript instantiations | 25 roots <= 197,405; 50 roots <= 368,053; doubled-root ratio < 2.25x |
| TypeScript wall/RSS       | <= 110% wall and <= 115% RSS of pinned approved receipt              |

Artifact-only CLI benchmarks must prove that runtime, gateway, fixture, and
TypeScript program loading did not occur. Static fact output must preserve
provenance and explicit unknowns rather than guessing from syntax.

### 10.6 Proof and API gates

Every reduction must pass:

1. owner proof: one mutable authority and one release owner are named;
2. semantic proof: accepted feature, ordering, identity, fence, cancellation,
   hydration, and failure behavior has executable coverage;
3. race proof: concurrent ensure, resume/dispose, zero-recipient settlement,
   overlay/CAS, remote unknown, context wave, lost wakeup, and late result;
4. absence proof: deleted APIs, runtimes, queues, helpers, fixtures, and
   generated residue are absent where required;
5. compatibility proof: public API and TypeScript consumer proofs stay within
   the accepted contract and no new API is introduced solely to expose an
   optimization detail;
6. proof-matrix proof: no required row is dropped, and no unresolved BEH is
   silently marked complete.

## 11. Representative workloads and semantic oracles

| Workload family     | Stress shape                                                          | Oracle                                                                              |
| ------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Actor pressure      | 1 and 1,024 actors; reentrant commands; one hot actor                 | FIFO, acknowledgment, fairness, no inline reentrancy, final frame                   |
| Fanout and identity | 10,000 actors, 32 refs, equal structural keys, replacement            | exact recipient set, mapped count, no unmatched fact, collision safety              |
| Context             | depth 10, wide diamonds, 10,000 consumers, suspended edges            | one wave, topological order, no duplicate evaluation, retained logical edge         |
| Store and overlays  | 10²–10⁶ entries, 1–100 writes, equal writes, concurrent promotion     | atomic all-key CAS, identity sharing, overlay visibility, conflict truth            |
| Lifetimes           | 1m timers, 90% cancellation, dispose/resume races, zero registrations | exactly-once settlement/finalization, no stale generation, bounded heap             |
| Remote transactions | crash/retry around idempotency boundary                               | no redispatch, stable `Unknown(remoteId)`, reconciliation and compensation identity |
| Hydration           | providers before consumers, continuing declarations, bad P/K          | no finite replay, truthful non-running failure, deterministic key selection         |
| Evidence and CLI    | capacities 0/1/256, truncation, corrupt/1/16/64 MiB artifacts         | accepted-prefix continuity, bounded retention, atomic output, no runtime load       |

The reference implementation for data-structure experiments is a simple
native-Map/root-copy implementation with the same semantic oracles. A more
complex structure must differential-test against it before it can replace it.

## 12. Accepted-feature retention matrix

| Feature                               | Canonical owner/path                            | Optimization constraint                            |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Machines, substates, context behavior | `AppPlan`, `ActorState`, `ContextGraph`         | no child-actor identity substitution for substates |
| One runtime for live/test/Story       | `RuntimeFactory` and `FlowRuntime`              | hosts are plugins/bridges, never parallel runtimes |
| Actor refs and incarnation            | `RuntimeDirectory` tombstones                   | authored stable refs; no silent replacement        |
| Reactive resources and transactions   | StoreKernel + StoreFanout + ingress             | internal subscriptions; passive reads remain pure  |
| Preview/rollback/commit               | occurrence overlays + StorePatch/CAS            | remote boundary is not locally rewindable          |
| Streams, timers, activities           | actor bindings + named policies + DeadlineIndex | shared diff mechanics, separate lifecycle laws     |
| Lifecycle/suspension/hydration        | ActorLifecycleOp, scopes, CheckpointCut         | exact open behavior stays blocked                  |
| Evidence/inspection                   | EvidenceHub and bounded sinks                   | no unbounded runtime history or universal decoder  |
| React/Story/testing/server            | host plugins over RuntimeFactory                | same semantic owners and cleanup path              |
| CLI and static facts                  | execution-free AppPlan/source index             | bounded decode, provenance, atomic artifact commit |

## 13. Exhaustive behavior crosswalk

This table covers every `BEH-001` through `BEH-034` heading present or
referenced by the current revision register. “Closed” means closed by the
named revision; it does not mean this research file re-closes it. “Blocked”
means preserve the representational slot and wait for explicit authority.

| BEH       | Historical synthesis status                    | Optimization treatment                                                          |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `BEH-001` | closed by `REV-COMP-015`                       | RuntimeFactory lifecycle; no second runtime kind                                |
| `BEH-002` | closed by `SEM-029`/`REV-COMP-015`             | post-bootstrap admission through RuntimeDirectory                               |
| `BEH-003` | closed by `REV-COMP-012`/`REV-COMP-013`        | ensure ownership and concurrent join protocol                                   |
| `BEH-004` | closed by `REV-COMP-005`                       | capture membership remains explicit, not inferred from directory                |
| `BEH-005` | closed by `REV-COMP-011`/`WIRE-008`            | stable/opaque ref encoding; no object identity                                  |
| `BEH-006` | closed by `REV-COMP-006`/`REV-COMP-008`        | tooling ownership stays at package boundary                                     |
| `BEH-007` | closed by `REV-HOST-003`/`REV-HOST-004`        | lifecycle publication revision is actor-owned                                   |
| `BEH-008` | closed by `REV-HOST-004`                       | lifecycle evidence remains distinct from turn evidence                          |
| `BEH-009` | closed by `REV-COMP-004`/`REV-HOST-005`        | suspended logical context edges remain representable                            |
| `BEH-010` | closed by `REV-HOST-005`/`ARCH-030`            | serialized suspension and finite-work normalization                             |
| `BEH-011` | closed by `REV-HOST-002`                       | prepared context/SSR attach path                                                |
| `BEH-012` | closed by `REV-HOST-002`/`ARCH-018`            | hook construction tuple remains host contract                                   |
| `BEH-013` | closed by `REV-HOST-002`/`SEM-001`             | prepared command bounds and abandoned handles                                   |
| `BEH-014` | closed by `REV-COMP-003`/`REV-HOST-006`        | context selector defect and error retention                                     |
| `BEH-015` | closed by `REV-HOST-007`                       | use commit epoch/read-cut protocol; do not reopen                               |
| `BEH-016` | closed by `REV-HOST-003`                       | actor-handle lifecycle matrix and attachment ownership                          |
| `BEH-017` | no active entry in current unresolved register | no new semantic choice; verify against revision authority before implementation |
| `BEH-018` | closed by `REV-TEST-005`                       | focused-machine context remains separate from actor identity                    |
| `BEH-019` | closed by `REV-TEST-007`                       | controlled-operation interception remains policy-owned                          |
| `BEH-020` | closed by `REV-TEST-007`/`SEM-030`             | Story occurrence identity remains distinct from lifecycle/turn identity         |
| `BEH-021` | closed by `REV-TEST-008`                       | CheckpointCut and capture set remain separate from EvidenceHub history          |
| `BEH-022` | closed by `REV-TEST-006`/`REV-TEST-008`        | cleanup/end evidence follows one Scope ownership path                           |
| `BEH-023` | closed by `REV-OPS-017`                        | exact operation unions/read visibility stay typed and owner-specific            |
| `BEH-024` | closed by `REV-OPS-015`                        | timers target events; no timer-owned hidden action                              |
| `BEH-025` | closed by `REV-OPS-015`                        | occurrence terminality and cancellation cardinality are preserved               |
| `BEH-026` | closed by `REV-OPS-015`                        | action-batch conflict algebra maps to all-key StorePatch/CAS                    |
| `BEH-027` | closed by `REV-OPS-016`                        | exact canonical-key grammar and mutable-container rules                         |
| `BEH-028` | closed by `REV-OPS-015`                        | equal-key pinning and post-hydration selection                                  |
| `BEH-029` | closed by `REV-OPS-015`                        | actor overlays, base/effective reads, promotion, rollback                       |
| `BEH-030` | closed by `REV-OPS-018`                        | invalidation and clearing bounds remain explicit policy                         |
| `BEH-031` | closed by `REV-OPS-015`                        | continuing hydration rematerializes without finite replay                       |
| `BEH-032` | closed by `REV-HOST-008`                       | host seeding/trusted writes remain auditable boundaries                         |
| `BEH-033` | closed by `REV-MIG-005`                        | artifact/result/signal representation; one private decoded schema authority     |
| `BEH-034` | closed by `REV-MIG-006`                        | removed child capability remains absent with negative proof                     |

The status column is retained as a cross-check against the accepted revisions.
The accepted revisions and `revision-spec/UNRESOLVED_BEHAVIOR.md` remain
authoritative, and the current register has no open inherited behavior entry.

## 14. Rejected, deferred, and promotion rules

Rejected as architectural shortcuts:

- event-log-owned runtime and universal replay reducer;
- per-actor canonical stores or isolated Story/test runtimes;
- hash-only identity, object-identity keys, process-global interning, and
  numeric slots used as durable identity;
- global scans for keyed concurrency or one optional fence shared by all facts;
- EvidenceHub retained history, one universal decoded artifact/result model,
  or one policy-switching projection kernel;
- manual subscriptions required from React or application users for internal
  resource, context, lifecycle, or transaction reactivity.

Deferred until the gates produce a measured need:

- custom actor mailbox rings or a second scheduler;
- fixed-page/HAMT/segmented persistent store roots;
- dense arenas, object pools, struct-of-arrays actor rows, and timer wheels;
- broad COW or zero-copy assumptions that retain large user graphs;
- cross-source global ordering machinery beyond the named policy boundary.

Promotion requires a recorded baseline, a benchmark with the workload and
semantic oracle above, a code/LOC diff, a memory/GC receipt, and focused race
proofs. The candidate must delete at least twice its own shared non-test LOC,
reduce the affected slice by at least 30% or demonstrably improve a measured
hot path, preserve all fingerprints and proof rows, add no public API, and
avoid more than 5% hot-path latency regression. If the candidate cannot pass
these gates without hiding policy in a generic switch, reject it and retain
the simpler representation.

The implementation starting point is therefore: five authorities, one runtime
implementation, Effect-owned lifetimes, exact keys, `ActorIngress`, pure
`BindingDiff`, separate relation-index instances, `StorePatch`,
`GenerationLeaseState`, `RemoteTxnState`, `DeadlineIndex`, commit-epoch
passive reads, bounded evidence, and execution-free CLI facts. All further
optimization is an experiment against this semantic baseline.
