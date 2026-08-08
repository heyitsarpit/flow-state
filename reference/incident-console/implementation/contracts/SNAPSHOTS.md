# Actor and primitive snapshot contract

Status: normative vNext contract

This contract fixes the public immutable read surface consumed by views, hosts, stories, and
inspection. Snapshots report machine and primitive truth; they do not create ownership, start
work, or retain execution history.

## Actor publication

### SNAP-001 — One actor snapshot is one revision

Every actor snapshot MUST contain the exact machine token in `value`, readonly `memory`, a
monotonic safe-integer `revision`, the `storeRevision` observed by that actor turn,
`lifecycle: "active" | "failed" | "disposed"`, typed primitive readers, the receipts emitted
by that turn, and currently active issues. No field may read through to mutable live state.

`receipts` is the immutable batch emitted by that publication, not cumulative actor history.
Resolved issues disappear from `issues`; retained turn history belongs only to an explicitly
installed TurnRecord sink.

### SNAP-002 — Public readers are passive and exact

Primitive readers expose typed `get` operations and no mutation, subscription, retry, reset,
seed, enumeration, or retention method. A missing exact identity returns that primitive's
frozen idle snapshot and MUST NOT insert a record, acquire a lease, or advance a revision.

```ts
const todo = snapshot.resources.get(todoDetail.ref(todoId));
const save = snapshot.transactions.get(saveTodo.ref({ todoId }));
```

Resource readers additionally expose `require(ref)`. It returns only a canonical value whose
availability is `"value"`; idle, placeholder, and failure projections throw a structured Flow
invariant diagnostic. Inspection and persistence may enumerate through package-private
AppPlan-aware adapters, not through the component read surface.

## Resources

### SNAP-003 — Resource status is a convenience over orthogonal facts

Every `ResourceSnapshot<A, E>` exposes its exact `ref` and these readonly fields:

```ts
type ResourceStatus = "idle" | "loading" | "success" | "failure" | "stale";
type ResourceAvailability = "empty" | "placeholder" | "value" | "failure";
type ResourceActivity = "idle" | "fetching" | "paused";
type ResourceFreshness = "fresh" | "stale" | "invalidated";
```

It also exposes `isPlaceholderData`, optional lookup `generation`, `updatedAt`,
`invalidatedAt`, `expiresAt`, typed `value`, and typed `error` only on union members where the
field exists. The broad `.status` never replaces availability, activity, or freshness:

- no canonical data plus active lookup is `loading`; a descriptor placeholder has
  `availability: "placeholder"`, typed `value`, and `isPlaceholderData: true`;
- canonical data is `success` while fresh and `stale` while stale or invalidated, even when a
  background lookup makes `activity` equal `fetching` or `paused`;
- typed lookup failure with no canonical data is `failure` with `availability: "failure"` and
  typed `error`;
- idle with no canonical data is `idle` and `availability: "empty"`.

A failed refresh MAY retain canonical data and expose its typed `error`, but its availability
remains `value`; the lookup's failure outcome and TurnRecord carry the failed attempt. Defects
and interruptions enter issues and receipts rather than widening `E`.

### SNAP-004 — Placeholder and canonical value are never confused

`require(ref)` MUST reject `availability: "placeholder"`. Placeholder projections MUST NOT
set `updatedAt`, become `success`, emit a finite success/value outcome, persist, or survive the
active lookup generation. When canonical data exists, a placeholder is absent rather than
shadowing it.

### SNAP-005 — Resource projection follows machine reference and store collection

An actor projects refs materialized by its current or prior machine-owned bindings while the
shared StoreState still retains those entries. Releasing a binding does not delete canonical
data; StoreState collection later causes a new actor turn that removes the projection. A view
read of a ref the actor never materialized returns idle even if another actor happens to own
the same store ref.

## Transactions

### SNAP-006 — Transaction snapshots are exact-ref discriminated unions

Every `TransactionSnapshot<A, E>` exposes its exact `ref`, and every non-idle attempt exposes
its actor-local `generation`:

```ts
import type { Cause } from "effect";

type TransactionSnapshot<A, E> =
  | { readonly status: "idle"; readonly ref: TransactionRef }
  | {
      readonly status: "queued" | "pending";
      readonly ref: TransactionRef;
      readonly generation: number;
    }
  | {
      readonly status: "success";
      readonly ref: TransactionRef;
      readonly generation: number;
      readonly value: A;
    }
  | {
      readonly status: "failure";
      readonly ref: TransactionRef;
      readonly generation: number;
      readonly error: E;
      readonly cause: Cause.Cause<E>;
    }
  | {
      readonly status: "defect";
      readonly ref: TransactionRef;
      readonly generation: number;
      readonly cause: Cause.Cause<E>;
    }
  | {
      readonly status: "interrupt";
      readonly ref: TransactionRef;
      readonly generation: number;
      readonly cause: Cause.Cause<never>;
    };
```

The illustrative `Cause` parameters do not authorize lossy casts: a mixed failure-plus-defect
exit uses the defect member and retains the complete original Cause internally and in its
issue. Fields absent from a union member MUST remain absent rather than `undefined` placeholders.

### SNAP-007 — Transaction projection follows the current binding generation

The actor registry publishes only the latest generation for each exact ref materialized by a
binding in the current stabilized configuration. A terminal finite binding becomes consumed
and retains its terminal snapshot while that same configuration activation remains current.
When the binding is removed, replaced, or explicitly reentered, its old projection is removed
or replaced in that actor turn; later `get(oldRef)` returns idle.

Attempt history, older generations, and projections from prior configurations belong in
TurnRecords and inspection. They MUST NOT accumulate in the ordinary actor snapshot. Scope and
concurrency keys never replace the exact transaction ref as observable identity.

## Streams, timers, and children

### SNAP-008 — Continuing activity snapshots use declaration identity

`snapshot.streams.get(streamDefinition)` and `snapshot.children.get(childDefinition)` use the
exact reachable definition object, not a string ID. Their snapshots expose the materialized
canonical key, generation, and primitive lifecycle. Stream status is
`idle | running | complete | failure | defect | interrupt`; child status is
`idle | active | complete | failure | defect | interrupt | stopped`. Value, child snapshot,
typed error, and Cause fields exist only on applicable union members.

One actor may materialize at most one binding from one stream or child declaration at a time;
changed params or key replace its generation. Reusing two distinct definitions with one ID is
an AppPlan collision, while reading an inactive definition returns idle.

### SNAP-009 — Timer identity is machine-wide and typed

Timer record keys MUST be unique across one machine definition. `snapshot.timers.get(name)`
accepts only that machine's inferred timer-name union and returns
`idle | scheduled | fired | interrupt`, with state token, generation, start time, and due time
on applicable members. Timer history belongs in TurnRecords. This machine-wide uniqueness
rule prevents state-local string lookup from becoming ambiguous in views and artifacts.

## Time, immutability, and proof

### SNAP-010 — Snapshot time uses the runtime Clock

All public timestamps are integer epoch milliseconds read from the runtime's Effect Clock.
Story snapshots therefore use TestClock time. A snapshot and every nested collection or value
created by Flow MUST be frozen or otherwise observably immutable; later turns cannot mutate a
previous reference.

### SNAP-P01 — Discriminant and reader proof

Compile proofs MUST narrow every resource, transaction, stream, timer, and child union without
casts; reject foreign refs/definitions and unavailable fields; and preserve `A`, `E`, state,
memory, and timer-name literals. Runtime proofs MUST show missing reads are side-effect-free,
placeholder is not canonical, transaction projections leave with their bindings, and captured
snapshots never change after later turns, collection, or disposal.
