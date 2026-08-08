# Glossary and identity contract

Status: locked

This contract gives every Flow concept one name and every durable or concurrent entity one
identity. Other contracts reference these rules rather than redefining the terms.

## Definitions

### GLO-01. Vocabulary

A vocabulary is one immutable definition containing a stable explicit ID, named state
tokens, and callable event tokens. It declares names and payload constructors but owns no
runtime behavior.

State token ID: `${vocabularyId}/S/${stateName}`.

Event token ID: `${vocabularyId}/E/${eventName}`.

The `/S/` and `/E/` segments are mandatory and prevent a state and event with the same
local name from sharing serialized identity.

### GLO-02. Machine and actor

A machine is an immutable behavior definition bound to one vocabulary. An actor is one
live runtime instance of that machine. The machine owns transition legality, redirect
stabilization, memory updates, activities, and timers; the actor owns the mailbox,
generations, live work, publications, and disposal.

A machine state is a durable mutually exclusive behavioral mode. Resource, transaction,
stream, timer, and child statuses are overlapping operation lifecycles and MUST NOT be
expanded into a Cartesian product of machine states.

### GLO-03. Memory and input

Input is supplied once when a fresh dynamic actor is created. The pure
`memory: ({ input }) => Memory` initializer derives actor-local memory. Restored actors
retain serialized memory and MUST NOT replay input.

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

Record keys are encoded in sorted order. `undefined`, non-finite numbers, bigint, symbols,
functions, dates, maps, sets, class instances, prototypes other than `Object.prototype` or
`null`, and cycles are rejected synchronously at ref construction.

Both ref arguments and the descriptor's projected key MUST be canonical because the
arguments rerun the operation while the projected key determines instance equality.

### GLO-06. Descriptor and ref identity

Descriptor IDs are explicit, non-empty, collision-safe strings validated during pure app
compilation. Ref identity is the descriptor ID plus the canonical encoded projected key.
The encoded identity is computed once and retained immutably so caller mutation cannot
change map identity.

Two distinct descriptor objects with the same ID are an app compilation error. One shared
descriptor object may be reachable from multiple roots.

### GLO-07. App and module

A module is an inert static boundary listing public root machines and public root-bound
views. A module is not a service registry, fixture registry, runtime, or arbitrary metadata
bag.

An app has an explicit ID, persistence version, exact module tuple, and a pure compiled
`AppPlan`. Resources, transactions, streams, child machines, and Effect requirements are
inferred transitively from roots. There is no process-global app or descriptor registry.

### GLO-08. Actor identity

The one automatic root actor for a machine has ID
`${appId}/root/${machineId}`. Module order or property names MUST NOT affect it.

A dynamic actor with an explicit host ID uses an app-namespaced canonical identity. An
omitted ID receives an opaque runtime-local identity and is not restorable. A restorable
child actor uses its stable parent identity plus its canonical child activity key.

### GLO-09. Activity identity

An active binding identity contains:

1. activity kind;
2. declaration object identity and descriptor ID where present;
3. exact resource or transaction ref, or explicit canonical stream, timer, or child key;
4. outcome-map identity.

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

A turn is one serialized actor mailbox command, including pure transition planning,
redirect stabilization, immediate reconciliation, one publication, and optional
acknowledgment. Later asynchronous completion is another turn.

### GLO-11. TurnPlan, CommitPlan, and TurnRecord

`TurnPlan` is the pure result of applying one command to one actor snapshot and stabilizing
redirects. It contains intended state, memory, receipts, and activity changes but performs
no Effect.

`CommitPlan` is the effectful reconciliation command set derived from a TurnPlan. It
reserves generations, applies one atomic store change, and starts or stops owned work.

`TurnRecord` is immutable evidence derived after a successful actor publication. Receipts,
inspection, and trace projections consume the same record; they MUST NOT maintain competing
histories.

### GLO-12. Snapshot and registry

An actor snapshot is the single immutable public publication containing state token,
memory, typed resource and transaction registries, stream/timer/child facts, receipts,
issues, lifecycle, actor revision, and observed store revision from one turn.

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
- `GLO-L5`: A read or observation never manufactures identity, ownership, or canonical
  state.
- `GLO-L6`: Durable decoding resolves only through the receiving app's compiled plan.
- `GLO-L7`: Two runtimes with equal public IDs remain isolated by runtime ownership.
