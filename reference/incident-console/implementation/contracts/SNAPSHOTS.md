# Actor and primitive snapshot contract

Status: normative vNext contract

This contract fixes the public immutable read surface consumed by passive views, hosts, Stories, and
inspection. Snapshots report machine and primitive truth. They are immutable passive reads: they do not
create ownership, start work, retain execution history, or expose runtime internals. `SEMANTICS.md` owns
publication ordering; `REACT_AND_HOSTS.md` owns host attachment and selector integration.

## Snapshot-first examples

```ts
const snapshot = actor.getSnapshot();
const orderKey = snapshot.O.orderById.key({ orderId });
const order = snapshot.O.orderById.getData(orderKey);
const orderState = snapshot.O.orderById.getState(orderKey);
const submitState = snapshot.O.submitIntent.getState([submissionId]);
```

The named family readers above accept canonical `K`; execution plans retain complete executable `P`.
They are passive and do not imply a generic registry, bound entry, subscription, retry, reset, seed,
retention, or mutation method.

## Actor publication

### SNAP-001 — One actor snapshot is one revision

- Surface: public `ActorSnapshot` and `actor.snapshots`.
- Rule: Every snapshot contains exact active leaf `state`, readonly `memory`, monotonic safe-integer `revision`, observed `storeRevision`, lifecycle `prepared | active | suspended | disposed`, typed named-operation readers, and active issues. Every container Flow creates is frozen/immutable; no field reads mutable live state. `state` and every callback state value are the exact active leaf token; `state.matches(token)` may match that leaf or any active ancestor.
- Accepts: Accepted public issue summary, passive operation readers, lifecycle snapshots with new publication revision and prior machine-turn revision.
- Rejects: Receipts, diagnostics, pending outcome records, `handled`, errors, raw `Cause.Cause<unknown>`, failure lifecycle, child projections, nested XState-style state values, final-node kind, actor output, or second public revision field.
- Observable guarantee: Lifecycle snapshot is published before lifecycle evidence; lifecycle does not advance machine-turn revision or create a TurnRecord. A terminal-looking state remains an ordinary active actor state and does not complete/dispose/close the stream/mailbox.
- Proof: `SNAP-P01`, `HOST-P05`.
- Trace: `SEM-005`, `SEM-011C`, `SEM-024`, `SEM-028`, `REV-MACH-001`, `REV-MACH-010` (historical/trace-only;
  no active contract clause), `DEL-005`, `WIRE-020B`.

### SNAP-002 — Public readers are passive and exact

- Surface: named `O` readers in actor snapshots/selectors.
- Rule: Resource, transaction, and stream families expose typed `key(P)`, `getData(K)`, and `getState(K)` relationships. A missing exact identity returns synthetic absent/idle without inserting a record, acquiring a lease, changing freshness, advancing revision, or starting work. Synchronous readers are observational only: they cannot run an Effect, call `runSync`, acquire a Scope, schedule work, or mutate runtime/store state.

```ts
const key = O.orderById.key({ orderId });
const data = O.orderById.getData(key);
const state = O.orderById.getState(key);
```

- Accepts: An actor passively reading an admitted same-runtime canonical entry it never materialized; exact named family reads.
- Rejects: `resources.get`, `transactions.get`, public operation enumeration, `ref`, `byKey`, `byLane`, `require`, subscription, retry, reset, seed, retention, mutation, generic registries, and execution methods in a selector.
- Observable guarantee: A passive missing read has no runtime/store/ownership effect.
- Proof: `SNAP-P01`, `HOST-P03`.
- Trace: `SEM-011`, `SEM-025`, `SNAP-004`, `PUBLIC_API.md` `API-006`.

## Resources

### SNAP-003 — Resource state remains a bounded descriptor/K projection

- Surface: resource `getState(K)`, `getData(K)`, descriptor namespace, canonical tuple.
- Rule: `P` is complete immutable executable input; `K` is the ordered readonly tuple from `key(P)`; identity is descriptor namespace + `K`. Resource execution accepts `P`; passive reads accept `K`. Equal keys do not switch a running generation's pinned `P`; hydrated key-only entries remain passive until a live binding supplies `P`.
- Resource status discriminants remain part of the retained resource surface under `RET-003`; the exact descriptor/`K`-typed `getState(K)` union, generation, failure, retained-value refresh, collection, and stream declaration laws are defined by `PUBLIC_API.md` `API-006`, while cross-actor canonical visibility is defined by `SNAP-004`.
- Accepts: Family-specific status/generation/failure/retained-value/collection projection defined by `PUBLIC_API.md` `API-006`; bounded dense arrays/plain records and sorted record keys under `API-005`.
- Rejects: Public parallel state aliases/cross-product conditional types, recursive type inspection, or limits confused with state/cache-entry counts.
- Observable guarantee: Canonicalization, validation, projection, defensive copy, and freezing finish before ownership/store mutation/external work; key failures identify exact tuple/nested path.
- Proof: `SNAP-P01` and `PUBLIC_API.md` `API-005`/`API-006`.
- Trace: `SEM-010`, `SEM-011`, `SNAP-004`.

### SNAP-004 — Canonical and actor-effective reads are distinct

- Surface: unbound store read versus bound actor snapshot read.
- Rule: Unbound reads return committed canonical base. Actor reads return canonical base plus only that actor's ordered optimistic layers for exact descriptor/`K`. Transaction updaters read canonical base, not effective overlay. Tags derive only from canonical `K`.
- Accepts: Equal authoritative write refreshing freshness/store publication; effective value change only when effective value differs.
- Rejects: Another actor's preview in a read, overlay treated as canonical, or passive read acquiring ownership/work.
- Observable guarantee: Same-runtime actors share canonical truth but never each other's previews.
- Proof: `SNAP-P01`.
- Trace: `SEM-008`, `SEM-012`, `SEM-016`.

### SNAP-005 — Resource projection follows actor ownership and store retention

- Surface: actor resource projection and shared canonical StoreState.
- Rule: Actor projection derives from current actor-owned bindings plus shared exact descriptor/`K` store state. Releasing a binding removes that actor's local projection but does not define canonical deletion; normal collection policy owns canonical eviction.
- Accepts: Any actor passively reading an admitted shared canonical entry it never materialized; synthetic absent/idle for a missing read.
- Rejects: Generic refs or unconditional idle as the retention rule; actor release deleting canonical data by itself; cross-runtime sharing.
- Observable guarantee: Independent actor bindings/occurrences/projections/lifetimes coexist over shared canonical data.
- Proof: `SEM-008`, `SEM-013`, `SNAP-P01`.
- Trace: `ARCH-014`, `SEM-009`, `SEM-020`.

## Transactions

### SNAP-006 — Transaction snapshots use actor-local descriptor/K identity

- Surface: transaction snapshot/projection.
- Rule: Expose exact transaction descriptor and canonical `K`, plus generation where required by `PUBLIC_API.md` `API-006`. Preserve accepted success/failure/defect/interruption and post-boundary `unknown`/`reconcileRequired` lanes; keep complete Cause in private issue/TurnRecord facts. The exact closed `TransactionSnapshot<A, E, K>` union, field presence, generation exposure, terminal retention, and collection behavior follow `PUBLIC_API.md` `API-006` and `SEM-018`; absent fields remain absent.
- Accepts: Exact closed `TransactionSnapshot<A, E, K>` shape, absent fields remaining absent, bounded terminal retention.
- Rejects: Raw Effect Cause, generic transaction registry, accumulated old attempts in ordinary snapshots, or a new public union/occurrence handle.
- Observable guarantee: Snapshot truth distinguishes typed failure, defect, interruption, and remote uncertainty without claiming rollback.
- Proof: `SEM-015`, `SEM-015A`, `SEM-023`, `SNAP-P01`.
- Trace: `SEM-018`, `SEM-024A`.

### SNAP-007 — Transaction projection follows the current actor binding

- Surface: actor-owned transaction descriptor/`K` projection.
- Rule: Projection follows the current stabilized binding. Activation, passive reads, completion, and reconciliation never admit/readmit a finite commit; finite commits enter only through accepted event `actions`. The exact projection when a binding is removed, replaced, suspended, disposed, or reentered follows `PUBLIC_API.md` `API-006`; occurrence retention across those boundaries follows `SEM-018`.
- Accepts: Attempt history in TurnRecords/inspection; family-specific projection/retention during binding removal, replacement, suspension, disposal, and reentry as defined by `API-006`/`SEM-018`.
- Rejects: Generic actor-lifetime attempt maps, state activation as implicit commit, or a second snapshot source.
- Observable guarantee: Removing/replacing a binding changes the defined projection without inventing a new attempt.
- Proof: `SEM-018`, `SNAP-P01`.
- Trace: `SEM-006A`, `SEM-019`, `SEM-020`.

## Streams and timers

### SNAP-008 — Continuing operation snapshots use named families and declaration identity

- Surface: named resource subscriptions and stream subscriptions.
- Rule: Read continuing state through the named family and `K`, not a generic stream registry. Equal compiled declaration identity retains generation and original `P`; changed slot/kind/descriptor/`K` releases old exactly once and admits replacement. Stream projection retains `hasValue`, latest value when present, emission count, generation, and terminal status.
- Accepts: Resource subscriptions observing canonical values; independent streams across actors; accepted status discriminants idle/running/complete/typed failure/defect/interruption.
- Rejects: Generic `snapshot.streams.get`, cross-actor stream deduplication, duplicate live stream declaration for one actor/descriptor/`K`, emission replay, key-to-input inverse, child surfaces, or terminal restart.
- Observable guarantee: Hydration rematerializes live stream declarations from executable `P` after pending outcomes drain; missing `P` fails closed and does not invent history.
- Emissions become durable state only through mapped events or explicit authoritative resource writes. A second live stream declaration by the same actor for the same descriptor and canonical `K` rejects before replacing or releasing the existing declaration; different actors remain independent. Any actor may passively read an admitted same-runtime resource identity without acquiring ownership, starting work, refreshing, mutating, or altering collection, and a missing read does not materialize a store entry.
- Hydration does not silently invent a prior stream emission or a generic key-to-input inverse. Terminal streams do not restart, and missing executable input fails closed with a precise diagnostic. Child snapshots, child addressing, child completion, child lifecycle, child persistence, and child Story/model surfaces remain removed by `REV-MACH-001` and `DEL-002`; recursive substates do not create a second snapshot source.
- Proof: `SEM-011B`, `SEM-011D`, `SEM-030`, `SNAP-P01`.
- Trace: `SEM-019`, `SEM-020`, `HOST-014`.

### SNAP-009 — Timer identity is machine-wide and typed

- Surface: `snapshot.timers.get(name)` and timer facts.
- Rule: Timer names are unique across a machine and `name` accepts only the inferred timer-name union. Timer `state` is the exact active leaf. Compound timers start on compound activation, retain deadline through descendant changes, cancel on compound exit, and restart only on exact `reenter`.

```ts
type TimerSnapshot<State, Name> =
  | { readonly status: "idle"; readonly name: Name }
  | { readonly status: "scheduled"; readonly name: Name; readonly state: State;
      readonly generation: number; readonly startedAt: number; readonly dueAt: number }
  | { readonly status: "fired"; readonly name: Name; readonly state: State;
      readonly generation: number; readonly startedAt: number; readonly dueAt: number;
      readonly firedAt: number }
  | { readonly status: "interrupt"; readonly name: Name; readonly state: State;
      readonly generation: number; readonly startedAt: number; readonly dueAt: number };
```

- Accepts: One-shot configuration generation, explicit event targeting, `after` refresh polling.
- Rejects: Timer-owned finite actions, fake domain events, deadline reset on unrelated descendant turn, or timer identity outside the machine.
- Observable guarantee: Due consumes its generation once and publishes `fired` whether its guard accepts/rejects; timer history remains evidence, not ordinary snapshot history. Timer facts target explicit events only; polling uses an existing `after` timer plus an explicit refresh event and never admits finite actions directly.
- Proof: `SNAP-P01`, `HOST-P02`.
- Trace: `SEM-002`, `SEM-019`, `SEM-020`.

## Time, immutability, and proof

### SNAP-010 — Snapshot time uses the runtime Clock

- Surface: timestamps, snapshots, checkpoints, Story `TestClock`.
- Rule: Public timestamps are integer epoch milliseconds from runtime Effect Clock; Stories/evidence use TestClock. Flow shallow-copies/freezes every envelope, record, array, canonical argument/key copy, reader, issue vector, and snapshot container. Application-owned opaque values are retained by identity and not recursively frozen. Checkpoint capture excludes unrelated actors, performs no live lookup from `actor(...)`, releases its read leases after `run.end` is captured, and runs `run.end` before cleanup.
- Accepts: Deeply frozen Story checkpoints and successful `run.end` captured through one DehydrateBarrier cut over committed published state; capture includes static Story closure, one StoreState revision, published actor snapshots, pending work, time, and accepted evidence prefix, then releases leases.
- Rejects: Mutating prior snapshots, live lookup during `actor(...)` capture, moving time, creating/restoring/disposing actors, external work during capture, or selected context serialized as a second truth source.
- Observable guarantee: Later turns, collection, suspension, resume, and disposal cannot mutate an earlier snapshot/checkpoint. `FlowStoryExecutionError` retains frozen checkpoints/end evidence, failure boundary, ordered cleanup diagnostics, cancellation evidence, and sequence facts; declared Flow errors retain complete Cause. Actor snapshots do not expose that Cause, and artifact projection follows `WIRE-020B`.
- Proof: `SNAP-P01`, `HOST-P04`, `HOST-P05`.
- Trace: `ARCH-013B`, `SEM-004`, `HOST-014`.

### SNAP-P01 — Discriminant and reader proof

- Surface: compile/runtime proof obligations for snapshots and passive readers.
- Rule: Prove exact machine state tokens, refs, event/input/context/memory, descriptors, canonical `K`, selected values, and timer names; named family reads accept `K`, execution plans require `P`, and deleted generic/child/final-node/registered-view/disposal surfaces are absent.
- Accepts: Runtime proofs for passive missing reads, canonical sharing with independent ownership, explicit write fencing, production completion mapping, frozen capture, actor-effective reads, overlay promotion/rollback, occurrence fencing, latest stream projection, hydration without emission replay, and passive operation-read reactivity.
- Rejects: Type-only or source-text proof of runtime behavior; receipts/operation-union/collection semantics duplicated here; source truth from a second contract owner.
- Observable guarantee: Snapshot/read proof covers observable semantics without exposing internal runtime owners.
- Proof: This is the snapshot proof index; operation unions/collection remain `PUBLIC_API.md` `API-006`, host writes remain `HOST-017`.
- Trace: `SEM-005`, `SEM-025`, `HOST-P01`–`HOST-P04`.
