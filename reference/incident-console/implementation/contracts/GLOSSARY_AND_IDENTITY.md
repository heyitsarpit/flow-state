# Glossary and identity contract

Status: locked

This contract gives every Flow concept one name and every durable or concurrent entity one
identity. Other contracts reference these rules rather than redefining the terms.

## Definitions

### GLO-01. Definition

A definition is one immutable value containing a stable explicit ID, named state tokens,
callable event tokens, actor input, and a pure initial-memory factory. It declares the complete
static shape of one actor family but owns no transition or activity behavior.

Every authored ID and local state/event name MUST retain its exact source spelling and be a
non-empty string of at most 256 UTF-8 bytes with no C0 control, DEL, lone-surrogate, or NUL code
point. Flow MUST NOT apply Unicode normalization or locale-sensitive comparison: composed and
decomposed spellings remain distinct identities. Composite IDs use
the canonical segment encoding `<utf8ByteLength>:<segment>` and a fixed namespace tag; raw
delimiter concatenation is forbidden.

State token ID: `S|<definition-segment>|<state-name-segment>`.

Event token ID: `E|<definition-segment>|<event-name-segment>`.

The `S|` and `E|` namespace tags plus length-prefixed segments prevent cross-kind and segment
boundary collisions without restricting ordinary authored punctuation such as `/`, `.`, or `:`.

### GLO-02. Machine and actor

A machine is immutable transition and activity behavior bound to one definition. An actor is
one live runtime instance of that machine. The machine owns transition legality, redirect
stabilization, memory updates, activities, and timers; the actor owns the mailbox,
generations, live work, publications, and disposal.

The machine inherits the definition ID unchanged. Two distinct machine values bound to one
definition therefore collide if presented to the same app; behavior variants require distinct
definitions and identities.

A machine state is a durable mutually exclusive behavioral mode. Resource, transaction,
stream, timer, and child statuses are overlapping operation lifecycles and MUST NOT be
expanded into a Cartesian product of machine states.

### GLO-03. Memory and input

Input is supplied once when a fresh actor is created. The definition's pure
`memory: ({ input }) => Memory` factory derives actor-local memory exactly once. Restored actors
retain serialized memory and MUST NOT invoke the factory or replay input. Omitting `memory`
defines `Input = void` and an empty readonly memory record.

Memory is local mutable domain state changed only by an accepted machine transition. It is
not a cache, server projection, operation status table, or general escape hatch.

### GLO-04. Descriptor and ref

A descriptor is a reusable immutable definition such as a resource, transaction, stream,
machine, or view. Its explicit ID identifies the definition family, never a parameterized
runtime instance.

A resource or transaction ref is the typed identity of one resolved descriptor instance.
The same ref identity MUST be used by execution, actor snapshots, views, receipts,
inspection, stories, persistence, invalidation, concurrency, and cleanup.

### GLO-05. Canonical key domain

`CanonicalKeyInput` consists only of:

- `null`, strings, booleans, and finite numbers;
- readonly arrays whose elements are canonical key inputs;
- readonly plain records with string keys and canonical key values.

Record keys are encoded by raw ascending UTF-16 code-unit order, exactly as JavaScript relational
string comparison defines it. Flow MUST NOT call `localeCompare` or normalize a key. `undefined`,
non-finite numbers, negative zero, bigint, symbols, functions, dates, maps,
sets, class instances, prototypes other than `Object.prototype` or `null`, accessors, symbol keys,
reserved prototype keys, sparse arrays, cycles, throwing proxies, and strings with lone surrogates
are rejected synchronously at ref construction. The WIRE-016 walker and bounds are the single
validation implementation for in-process identity and artifacts.

Resource argument tuples and transaction, stream, timer, and child key projections MUST be
canonical. A resource argument tuple is both lookup input and identity input; resources have no
second projected key.

### GLO-06. Descriptor and ref identity

Descriptor IDs use the authored-ID grammar in GLO-01 and are validated during pure app
compilation. Definition, module, descriptor, view, fixture, control, tag, and host-actor IDs occupy
named namespaces. A collision is rejected within any resolver namespace; unrelated kinds do not
share a flat namespace unless a contract explicitly resolves them through the same lookup.
Resource-ref identity is the descriptor ID plus its canonically encoded exact
argument tuple. Transaction-ref identity remains the descriptor ID plus its canonical key
projection. The encoded identity is computed once and retained immutably so caller mutation
cannot change map identity.

Two distinct descriptor objects with the same ID are an app compilation error. One shared
descriptor object may be reachable from multiple roots.

### GLO-07. App and module

A module is an inert static boundary listing public root machines and public root-bound views. A
module is not a dynamic-machine inventory, actor factory, service registry, fixture registry,
runtime, or arbitrary metadata bag.

An app has an explicit ID, persistence version, exact module tuple, an optional exact tuple of
statically admitted dynamic machines, and a pure compiled `AppPlan`. The presented application
universe is the transitive closure seeded by module roots and those dynamic machines; root-bound
views validate against that universe but do not expand it. A dynamic seed authorizes later host
creation without supplying input, creating an actor, or mutating a running runtime. Executable
descriptors and reusable child machines otherwise enter the closure through machine-local
activity bindings; a view read does not make a descriptor executable or reachable. There is no
process-global app or descriptor registry, and an unpresented definition cannot be diagnosed
until a host attempts to use it.

### GLO-08. Actor identity

Each unique compiled module-root machine has exactly one automatic root actor with ID
`root|<app-segment>|<machine-segment>`. Re-exporting one shared root through more than one module
does not create another actor; presenting distinct machine values with the same root identity is
an AppPlan collision. Module order or property names MUST NOT affect root identity.

A dynamic actor with an explicit host ID has identity
`dynamic|<app-segment>|<host-id-segment>`. An omitted ID receives an opaque runtime-local identity
and is not restorable. A restorable child actor uses
`child|<parent-identity-segment>|<compiled-binding-slot-segment>|<canonical-key-segment>`.

### GLO-09. Activity identity

AppPlan assigns every authored item a stable compiled slot. An entry in `activities` uses machine
ID, state-token ID, activity kind, and the declaration's zero-based ordinal within that array. A
timer instead uses machine ID, state-token ID, the literal `timer` kind, and its machine-wide
unique authored timer name; it never borrows an activity-array ordinal. The compiled slot, rather
than object or function allocation identity, is durable. Reordering activity declarations or
renaming/moving a timer is a persistence-breaking authoring change and therefore requires a new
application persistence version; vNext rejects the old boot rather than silently migrating it.

An active binding identity contains:

1. activity kind;
2. compiled binding slot and descriptor ID where present;
3. exact resource or transaction ref, or explicit canonical stream, timer, or child key;
4. a materialized, canonically deduplicated invalidation target vector for either direct or
   computed invalidation.

That tuple is the semantic `BindingKey`. Activation generation is monotonic instance metadata
allocated only when a BindingKey is newly acquired; it is not part of equality, so an equal desired
BindingKey can retain its existing generation across a non-reentering turn.

An outcome map belongs to the compiled binding slot and is not identified by runtime function
identity. Changing its authored declaration without a persistence-version migration is unsupported
for an artifact produced by the prior app version.

Re-entering the same stabilized configuration retains an equal binding. Changing any
identity component releases the old binding and acquires a new one. Two bindings in one
configuration MUST NOT claim the same primitive execution with different outcome owners.

### GLO-10. Generation, revision, and turn

A generation orders attempts for one exact runtime identity. It prevents stale completion
from publishing current facts. Generation checks are required even when Effect interruption
is requested because external work may be uninterruptible.

A revision identifies an immutable published store or actor snapshot. Store revision
increments for canonical values, overlays, lookup generations, freshness, invalidation, or
eviction. Actor revision increments once per published mailbox turn.

Prepared actor and store revisions start at zero. The first activity/operation generation,
resource `valueRevision`, pending-outcome sequence, and runtime-global TurnRecord sequence are one;
controlled endpoint call/subscription ordinals alone start at zero. Every monotonic counter is a
non-negative safe integer, increments before the mutation it identifies, and MUST fail its owning
invariant before wrap, reuse, or partial publication. A fully collected exact ref may later begin a
new store-owned lifetime at generation and value-revision one because no retained fact still names
the evicted lifetime; actor and runtime-global counters never reset.

A turn is one serialized actor mailbox command, including pure transition planning,
redirect stabilization, immediate reconciliation, one publication, and optional
acknowledgment. Later asynchronous completion is another turn.

### GLO-11. TurnPlan, CommitPlan, and TurnRecord

`TurnPlan` is the pure result of applying one command to one actor snapshot and stabilizing
redirects. It contains intended state, memory, receipt intents, and activity changes but
performs no Effect and claims no Effectful fact already occurred.

`CommitPlan` is the package-private immutable reconciliation command set derived from a
TurnPlan. Its interpreter reserves generations, applies one atomic store change, and stages
owned work. User Effects start or stop only from the post-publication reconciliation fact
queued on the same actor mailbox.

`TurnRecord` is immutable actual-fact evidence derived after a successful actor publication.
The runtime TurnRecord hub accepts it before command acknowledgment and assigns its global
sequence without running sinks inline. Receipt, inspection, and trace sinks process the same
record after acknowledgment and MUST NOT maintain competing histories.

`PendingOutcome` is a package-private durable actor record containing one already materialized
activity-mapped event and the binding/generation identity that admitted it. Queue commands carry
its stable ID; the actor record, rather than Queue persistence, owns deduplication and restoration.

### GLO-12. Snapshot and registry

An actor snapshot is the single immutable public publication containing state token,
memory, typed resource and transaction registries, stream/timer/child facts, issues,
`active | disposed` lifecycle, actor revision, and observed store revision from one turn.
Receipts are TurnRecord projections and are not actor snapshot fields.

`ActorState` is the package-private atomic owner containing that public snapshot plus durable
binding cursors and pending outcomes. Public readers project the snapshot; dehydration captures
the complete state. These facts MUST NOT live in separately mutable owners.

Primitive registries are immutable typed readers. Descriptor-ID records and mutable maps
are not public snapshot APIs.

### GLO-13. Issue, receipt, and pending work

An issue is a current structured failure, defect, interruption, cleanup problem, or
invariant violation. A receipt is immutable causal evidence of something the runtime
accepted, started, published, rejected, interrupted, or finalized. `pendingWork` is a live
inventory for tests and tooling and is not actor state or settlement by itself.

### GLO-14. View and MachineObserver

A view is a pure selector bound to one machine family. It projects one actor snapshot and
starts no work. `MachineObserver` is the internal subscription and structural-sharing
adapter for exactly one actor and view; it owns no actor, cache lease, operation, retry, or
query-result state machine.

### GLO-15. Story, fixture, control, and checkpoint

A story is an immutable lazy linear command plan bound to one app and machine. A fixture is
an immutable directly referenced per-run environment definition. A control command is
inert typed external input for a controlled endpoint. A checkpoint is an immediate frozen
capture of actor snapshot, pending work, and TestClock time; it never progresses execution.

### GLO-16. Boot and artifact

Boot is immutable runtime constructor input carrying Flow-owned vNext structural data and
opaque application payloads. An artifact is an explicitly exported versioned behavior or
trace envelope. Flow validates its structure and identity; applications validate and
migrate their domain payloads.

## Identity laws

- `GLO-L1`: Equal canonical ref identities address the same runtime instance in every
  subsystem.
- `GLO-L2`: Descriptor ID alone never identifies parameterized work.
- `GLO-L3`: App, root actor, ref, binding, and control identity are independent of source
  property order and runtime allocation order.
- `GLO-L4`: A stale generation may finalize its own resources but cannot mutate, remove, or
  publish current generation facts.
- `GLO-L5`: A passive view read, actor-snapshot subscription, or inspection observation never
  manufactures identity, ownership, or canonical state. `activity.observe` is deliberately not
  passive observation: it is a machine-owned continuing resource binding and its materialized
  exact ref participates in activity identity and refresh authorization.
- `GLO-L6`: Durable decoding resolves only through the receiving app's compiled plan.
- `GLO-L7`: Two runtimes with equal public IDs remain isolated by runtime ownership.
