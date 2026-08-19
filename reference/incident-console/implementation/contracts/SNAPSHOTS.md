# Actor and primitive snapshot contract

Status: normative vNext contract

This contract fixes the public immutable read surface consumed by passive views, hosts, Stories, and
inspection. Snapshots report machine and primitive truth; they do not create ownership, start work, or
retain execution history.

## Actor publication

### SNAP-001 — One actor snapshot is one revision

Every actor snapshot MUST contain the exact active leaf in `state`, readonly `memory`, a monotonic
safe-integer `revision`, the `storeRevision` observed by that actor publication, the closed lifecycle
`prepared | active | suspended | disposed`, typed named-operation readers, and currently active issues. No
field may read through to mutable live state.

The public snapshot MAY expose the accepted active issue summary. Operation state, occurrence identity,
clearing ownership, generation clearing, and terminal retention follow `REV-OPS-017` and `REV-OPS-018`; the
artifact projection of those facts follows WIRE-020B.

Every lifecycle transition MUST publish one coherent immutable snapshot through the existing handle before
appending its inspection event. Lifecycle evidence MUST NOT create a machine revision or `TurnRecord`; an
inspection listener MUST observe the event's `to` lifecycle after receiving that event. Lifecycle snapshots
increment the private/public publication revision, retain the preceding machine-turn revision, and carry
the runtime-global evidence sequence through their `LifecycleRecord`; no second public revision field exists.

Actor snapshots MUST NOT expose receipts, diagnostic facts, pending outcome records, `handled` booleans,
errors, raw Effect `Cause.Cause<unknown>`, or a failure lifecycle. Full TurnRecords and diagnostic facts belong to explicitly
installed `flow-state/inspect` sinks. Child-specific issue and snapshot surfaces are removed by
`REV-MACH-001` and `DEL-002`.

`state` and every callback state value are the exact active leaf token. `state.matches(token)` may match
that leaf or any active ancestor. Flow MUST NOT expose an XState-style nested state value or a separate
callback field identifying the declaration node. A terminal-looking state is an ordinary active actor state: it does not
add an actor lifecycle or output field, complete the snapshot stream, auto-dispose the actor, emit parent
completion, or close the mailbox. Static machine metadata and the compiled transition table determine its
behavior; Flow MUST NOT expose a final-state node kind under `REV-MACH-010` and `DEL-005`.

### SNAP-002 — Public readers are passive and exact

Primitive readers expose only typed passive operations for the named `O` catalogue. Resource, transaction,
and stream families expose their accepted `key(P)`, `getData(K)`, and `getState(K)` relationships, with
execution methods remaining unavailable to a snapshot selector. A missing exact identity MUST NOT insert a
record, acquire a lease, change freshness, advance a revision, or start external work.

```ts
const orderKey = O.orderById.key({ orderId, client });
const order = O.orderById.getData(orderKey);
const orderState = O.orderById.getState(orderKey);
const submitState = O.submitIntent.getState([submissionId]);
```

These are named-family reads over canonical `K`; they do not imply generic `resources.get`,
`transactions.get`, public operation enumeration, bound entries, `ref`, `byKey`, `byLane`, `require`,
subscription, retry, reset, seed, retention, or mutation methods. Any actor may passively read an admitted
shared canonical entry it never materialized; missing reads are synthetic absent/idle and remain passive.
The exact closed state union is defined by `REV-OPS-017`.

## Resources

### SNAP-003 — Resource state remains a bounded descriptor/K projection

Resource status discriminants remain part of the retained resource surface under `RET-003`. The exact
descriptor/K-typed `getState(K)` union, generation, failure, retained-value refresh, collection, and stream
declaration laws are defined by `REV-OPS-017`; cross-actor canonical visibility is defined by `SNAP-004`.

`P` is complete immutable executable input and `K` is the ordered readonly canonical tuple returned by
`key(P)`. Resource identity is descriptor namespace plus canonical `K`; methods that execute lookup work
accept complete `P`, while passive reads accept `K`. Equal keys do not switch the pinned `P` of a running
generation, and a hydrated key-only entry remains passive until a live binding supplies executable `P`.

The public snapshot contract MUST NOT generate a distributive conditional cross-product from value,
failure, descriptor policy, or activity kinds, recursively inspect those types, or add helper aliases as
standalone exports. `REV-OPS-017` fixes the family-specific inferred union without exporting a parallel
state alias.

### SNAP-004 — Canonical and actor-effective reads are distinct

Canonical truth remains in the runtime-scoped resource store, and passive resource reads never create
ownership or external work. An unbound store read returns committed canonical base state. An actor snapshot
read returns the committed base plus that actor's own ordered optimistic layers for the exact descriptor/K;
it never includes another actor's preview. Transaction updaters read canonical base, not effective overlay
values. Tags derive from canonical `K`, and an equal authoritative write may refresh freshness/store
publication but advances value revision and effective fanout only when the effective value changes.

### SNAP-005 — Resource projection follows actor ownership and store retention

An actor's resource projection is derived from its current actor-owned operation bindings and the shared
StoreState for the exact descriptor/K identity. Releasing a binding releases that actor's ownership; it does
not by itself define canonical-data deletion. Same-runtime actors may share canonical data and lookup
generations while retaining independent bindings, occurrences, projections, and lifetimes. Separate runtime
instances remain isolated.

After binding release, the actor's local projection is removed while canonical data remains until normal
collection policy evicts it. Any actor may passively read an admitted shared canonical entry it never
materialized; a missing read is synthetic absent/idle and does not materialize an entry. This clause does
not preserve the old generic-ref or unconditional-idle rule.

## Transactions

### SNAP-006 — Transaction snapshots use actor-local descriptor/K identity

Every transaction state projection MUST expose the exact transaction descriptor and canonical `K` that
identify its actor-local status, together with a generation when the accepted state shape requires one.
The public projection retains the accepted typed success, failure, defect, interruption, and post-boundary
`unknown`/`reconcileRequired` lanes and MUST NOT expose raw Effect `Cause.Cause<unknown>`; the complete Cause stays in package-private
issue backing and TurnRecord facts. Failure-versus-defect classification and the closed public union follow
`REV-OPS-017`.

The exact closed `TransactionSnapshot<A, E, K>` union, field presence, generation exposure, terminal
retention, and collection behavior follow `REV-OPS-017` and `SEM-018`. Absent fields MUST remain absent;
this contract MUST NOT use a generic
transaction registry or accumulate old attempts in an ordinary actor snapshot.

### SNAP-007 — Transaction projection follows the current actor binding

An actor exposes transaction state for an actor-owned descriptor/K identity in its current stabilized
configuration. State activation, passive reads, completion,
and reconciliation MUST NOT admit or readmit a transaction attempt; finite commits are admitted only by an
accepted event transition `actions` result. Attempt history may belong in TurnRecords and inspection
evidence, while exact ordinary-snapshot retention and occurrence projection follow `REV-OPS-017`; no generic
actor-lifetime attempt map is accepted.

The exact projection when a binding is removed, replaced, suspended, disposed, or reentered follows
`REV-OPS-017`; occurrence retention across those boundaries follows `SEM-018`.

## Streams and timers

### SNAP-008 — Continuing operation snapshots use named families and declaration identity

Resource subscriptions and stream subscriptions are actor-owned continuing operation declarations. Their
passive state is read through the exact named family and canonical `K`, not through a generic
`snapshot.streams.get(streamDefinition)` registry. A continuing resource may observe canonical values;
streams are not runtime resource entries and are not deduplicated across actors.

Equal normalized declaration identity retains the existing generation and originally retained executable
`P`. A changed declaration slot, operation kind, descriptor, or canonical key releases the old declaration
exactly once and admits the replacement. Stream status retains `hasValue`, latest `V` when present, emission
count, generation, and terminal status in addition to its status. Emissions become durable state only
through mapped events or explicit authoritative resource writes. The accepted stream status discriminants
include idle, connecting, running, complete, typed failure, defect, and interruption.

Hydration MUST NOT silently invent a prior stream emission or a generic key-to-input inverse. It
rematerializes a live declaration from its current executable `P` after pending outcomes drain; terminal
streams do not restart, and missing executable input fails closed with a precise diagnostic. Child snapshots,
child addressing, child completion, child lifecycle, child persistence, and child Story/model surfaces are
removed by `REV-MACH-001` and `DEL-002`; recursive substates do not create a second snapshot source.

### SNAP-009 — Timer identity is machine-wide and typed

Timer record keys MUST be unique across one machine definition. `snapshot.timers.get(name)` accepts only
that machine's inferred timer-name union and returns:

```ts
type TimerSnapshot<State, Name> =
  | { readonly status: "idle"; readonly name: Name }
  | {
      readonly status: "scheduled";
      readonly name: Name;
      readonly state: State;
      readonly generation: number;
      readonly startedAt: number;
      readonly dueAt: number;
    }
  | {
      readonly status: "fired";
      readonly name: Name;
      readonly state: State;
      readonly generation: number;
      readonly startedAt: number;
      readonly dueAt: number;
      readonly firedAt: number;
    }
  | {
      readonly status: "interrupt";
      readonly name: Name;
      readonly state: State;
      readonly generation: number;
      readonly startedAt: number;
      readonly dueAt: number;
    };
```

The `state` in every timer record is the exact active leaf token. A timer authored on a compound state
starts when that compound becomes active, retains its original deadline across transitions among its
descendants, and is cancelled when that compound exits. Exact `reenter` restarts the named active boundary;
ordinary descendant transitions do not reset an unchanged compound timer. Timer history belongs in
TurnRecords. Timer facts target explicit events only; polling uses an existing `after` timer plus an explicit
refresh event and never admits finite actions directly.

## Time, immutability, and proof

### SNAP-010 — Snapshot time uses the runtime Clock

All public timestamps are integer epoch milliseconds read from the runtime's Effect Clock. Story snapshots
and evidence therefore use TestClock time. A snapshot and every nested collection or value created by Flow
MUST be frozen or otherwise observably immutable; later turns cannot mutate a previous reference.

Flow shallow-copies and freezes every envelope, record, array, canonical argument/key copy, reader, issue
vector, and snapshot container it creates. Opaque application memory fields, event payload members,
resource/transaction/stream values and errors, transaction params, preview replacements, and actor inputs
remain application-owned immutable values: Flow retains their identity, never mutates them, and does not
recursively freeze a class instance or arbitrary domain graph. Mutating one after admission is unsupported
and may bypass revision or observer detection.

Every Story checkpoint and successful `run.end` is deeply frozen and captured through one production
`DehydrateBarrier` read cut after the Store commit permit. The barrier captures the complete static
Story-plan closure, one StoreState revision, published actor snapshots, pending work, TestClock time, and
the accepted runtime evidence prefix through one sequence fence; unrelated runtime actors are excluded.
Captured roots are deeply frozen before registry leases are released, and `actor(...)` never performs a
live lookup. Capture does not process, move time, create, dispose, restore, or perform external work;
`run.end` is captured after commands and before cleanup. The package-owned frozen
`FlowStoryExecutionError` envelope retains completed checkpoints, optional end evidence, the failure
boundary, primary and ordered cleanup diagnostics, cancellation evidence, and accepted/drained sequence
facts. The complete Effect `Cause.Cause<unknown>` remains public on the declared Flow error boundaries;
actor snapshots do not expose it, and artifact projection follows WIRE-020B.

### SNAP-P01 — Discriminant and reader proof

Compile proofs MUST preserve exact machine state tokens, actor refs, event, input, context, memory,
descriptor, canonical `K`, selected-value, and timer-name types. They MUST prove that named family passive
reads accept `K`, execution plans require complete `P`, and deleted generic registries, refs, bound entries,
child surfaces, final-node fields, registered views, and ordinary actor disposal are absent.

Runtime proofs MUST show that missing reads are side-effect-free, same-runtime canonical sharing preserves
independent actor ownership, explicit authoritative writes fence older generations, mapped operation
outcomes use production completion paths, and captured snapshots never change after later turns, collection,
suspension, resumption, or disposal. Proofs MUST cover actor-scoped effective reads, preview promotion and
rollback, occurrence fencing, stream latest-value projections, hydration restart without emission replay,
and passive operation-read reactivity. Operation-union and collection proofs are owned by `REV-OPS-017` and
`REV-OPS-018`; lifecycle and host-write proofs retain their owning `REV-*` clauses and phase receipts.
