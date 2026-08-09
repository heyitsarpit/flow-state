# Actor and primitive snapshot contract

Status: normative vNext contract

This contract fixes the public immutable read surface consumed by views, hosts, stories, and
inspection. Snapshots report machine and primitive truth; they do not create ownership, start
work, or retain execution history.

## Actor publication

### SNAP-001 — One actor snapshot is one revision

Every actor snapshot MUST contain the exact machine token in `value`, readonly `memory`, a
monotonic safe-integer `revision`, the `storeRevision` observed by that actor turn,
`lifecycle: "active" | "disposed"`, typed primitive readers, and currently active issues. No
field may read through to mutable live state.

The public active issue type MUST be exactly:

```ts
type FlowIssue = Readonly<{
  kind: "failure" | "defect" | "interrupt" | "cleanup" | "invariant";
  source: "runtime" | "machine" | "resource" | "transaction" | "stream" | "timer" | "child";
  id: string;
}>;
```

`id` is an immutable occurrence identity containing source, owning actor, exact binding/ref when
present, generation when present, and issue kind. Package-private issue state separately retains a
clearing-owner key containing actor, source, and binding/ref but no attempt generation. A later
success or release for that owner clears its prior operational occurrences, including failures
from older generations; success for another ref/binding cannot clear them. Fatal invariant and
cleanup issues remain on the
terminal disposed snapshot. Actor snapshots MUST NOT expose receipts, diagnostic
facts, pending outcome records, `handled` booleans, errors, Causes, or a failure lifecycle. Full
TurnRecords and diagnostic facts belong to explicitly installed `flow-state/inspect` sinks.

A final machine token remains an ordinary active actor snapshot value. Finality does not add an
actor lifecycle or output field, complete the snapshot stream, or auto-dispose a root. Static
machine metadata determines that the token is final; `flow.can` rejects every event there.

### SNAP-002 — Public readers are passive and exact

Primitive readers expose typed `get` operations and no mutation, subscription, retry, reset,
seed, enumeration, or retention method. A missing exact identity returns that primitive's
frozen idle snapshot and MUST NOT insert a record, acquire a lease, or advance a revision.

```ts
const todo = snapshot.resources.get(todoDetail.ref(todoId));
const save = snapshot.transactions.get(saveTodo.ref({ todoId }));
```

Resource readers additionally expose `require(ref)`. It returns only a canonical value whose
availability is `"value"`; idle, placeholder, and `status: "failure"` projections throw a
structured Flow invariant diagnostic. Inspection and persistence may enumerate through
package-private AppPlan-aware adapters, not through the component read surface.

## Resources

### SNAP-003 — Resource snapshots use one bounded factored union

The public type MUST have this semantic shape. `Ref` is the exact resource-ref type passed to
`get`; helper aliases are explanatory and MUST NOT be standalone exports.

```ts
type ResourceFetchActivity =
  | { readonly activity: "idle"; readonly generation?: never }
  | { readonly activity: "fetching"; readonly generation: number };

type ResourceValueState<A, Ref> = Readonly<{
  ref: Ref;
  availability: "value";
  value: A;
  updatedAt: number;
  expiresAt: number;
}> &
  (
    | { readonly status: "success"; readonly freshness: "fresh"; readonly invalidatedAt?: never }
    | { readonly status: "stale"; readonly freshness: "stale"; readonly invalidatedAt?: never }
    | {
        readonly status: "stale";
        readonly freshness: "invalidated";
        readonly invalidatedAt: number;
      }
  ) &
  ResourceFetchActivity;

type ResourceSnapshot<A, E, Ref = ResourceRef> =
  | Readonly<{
      ref: Ref;
      status: "idle";
      availability: "empty";
      activity: "idle";
      freshness: "stale";
      generation?: never;
    }>
  | Readonly<{
      ref: Ref;
      status: "loading";
      availability: "empty";
      activity: "fetching";
      freshness: "stale";
      generation: number;
    }>
  | Readonly<{
      ref: Ref;
      status: "loading";
      availability: "placeholder";
      activity: "fetching";
      freshness: "stale";
      generation: number;
      value: A;
    }>
  | Readonly<{
      ref: Ref;
      status: "failure";
      availability: "empty";
      activity: "idle";
      freshness: "stale";
      generation: number;
      error: E;
    }>
  | ResourceValueState<A, Ref>;
```

This union is exhaustive. `value` exists exactly when `availability` is `"placeholder"` or
`"value"`; `error` exists only on empty typed failure; `generation` exists exactly for an active
fetch or the terminal empty failure that records its attempt. Canonical data is `status:
"success"` only while fresh and `status: "stale"` when expired or invalidated. A manual refresh
may therefore be a fresh value with `activity: "fetching"`. A failed refresh that retains
canonical data remains in the appropriate value member, with no `error`; its binding outcome,
active issue summary, and TurnRecord carry the attempt failure. Defects and interruptions enter
active issue summaries and TurnRecords rather than widening `E`.

`expiresAt` is present on every canonical base because `staleTime` is always finite. Descriptor
construction validates the duration, and each update validates `updatedAt + staleTime` as a safe
integer before committing the base.

The declaration implementation MUST preserve this fixed top-level union and the two small
factored unions directly. It MUST NOT generate a distributive conditional cross-product from
`A`, `E`, descriptor policy, or activity kinds, recursively inspect those types, or add
descriptor-specific status members. Narrowing by `status`, `availability`, `activity`, and
`freshness` MUST work without a cast, and declaration/type-instantiation growth per resource MUST
remain constant.

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

Every `TransactionSnapshot<A, E, Ref>` exposes its exact `ref`, and every non-idle attempt exposes
its actor-local `generation`:

```ts
type TransactionSnapshot<A, E, Ref = TransactionRef> =
  | { readonly status: "idle"; readonly ref: Ref }
  | {
      readonly status: "queued" | "pending";
      readonly ref: Ref;
      readonly generation: number;
    }
  | {
      readonly status: "success";
      readonly ref: Ref;
      readonly generation: number;
      readonly value: A;
    }
  | {
      readonly status: "failure";
      readonly ref: Ref;
      readonly generation: number;
      readonly error: E;
    }
  | {
      readonly status: "defect";
      readonly ref: Ref;
      readonly generation: number;
    }
  | {
      readonly status: "interrupt";
      readonly ref: Ref;
      readonly generation: number;
    };
```

A public transaction snapshot MUST expose typed `error` only on the `failure` member and MUST
NOT expose `Cause` on any member. A mixed failure-plus-defect exit uses the defect member; the
complete original Cause remains in package-private issue backing and inspect TurnRecord facts.
Fields absent from a union member MUST remain absent rather than `undefined` placeholders.

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
exact reachable definition object, not a string ID. Their exact semantic unions are:

```ts
type StreamSnapshot<A, E, Key> =
  | { readonly status: "idle" }
  | { readonly status: "running"; readonly key: Key; readonly generation: number }
  | { readonly status: "complete"; readonly key: Key; readonly generation: number }
  | {
      readonly status: "failure";
      readonly key: Key;
      readonly generation: number;
      readonly error: E;
    }
  | { readonly status: "defect"; readonly key: Key; readonly generation: number }
  | { readonly status: "interrupt"; readonly key: Key; readonly generation: number };

type ChildSnapshot<Child, Key> =
  | { readonly status: "idle" }
  | {
      readonly status: "active";
      readonly key: Key;
      readonly generation: number;
      readonly snapshot: Child;
    }
  | {
      readonly status: "complete";
      readonly key: Key;
      readonly generation: number;
      readonly snapshot: Child;
    }
  | { readonly status: "defect"; readonly key: Key; readonly generation: number }
  | { readonly status: "interrupt"; readonly key: Key; readonly generation: number }
  | { readonly status: "stopped"; readonly key: Key; readonly generation: number };
```

`Child` is the exact child actor snapshot. Child machines have no typed error channel, so child
snapshots have no `failure` member; a contained child execution defect uses `defect`. Fields absent
from a member are absent rather than optional placeholders. Public stream and child
snapshots MUST NOT expose Cause; full failure evidence belongs to their TurnRecord facts.

One actor may materialize at most one binding from one stream or child declaration at a time;
only a changed canonical key replaces its generation, while equal key retains the originally
materialized opaque params/input. Reusing two distinct definitions with one ID is
an AppPlan collision, while reading an inactive definition returns idle.

A managed child that reaches a final token publishes `status: "complete"` with its exact final
child snapshot. The parent binding may retain that frozen terminal projection after the child
actor itself has been released; later reads do not expose a command handle or revive the child.

### SNAP-009 — Timer identity is machine-wide and typed

Timer record keys MUST be unique across one machine definition. `snapshot.timers.get(name)`
accepts only that machine's inferred timer-name union and returns:

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

Fields absent from a member remain absent. Timer history belongs in TurnRecords. This machine-wide uniqueness
rule prevents state-local string lookup from becoming ambiguous in views and artifacts.

## Time, immutability, and proof

### SNAP-010 — Snapshot time uses the runtime Clock

All public timestamps are integer epoch milliseconds read from the runtime's Effect Clock.
Story snapshots therefore use TestClock time. A snapshot and every nested collection or value
created by Flow MUST be frozen or otherwise observably immutable; later turns cannot mutate a
previous reference.

Flow shallow-copies and freezes every envelope/record/array it creates, including event envelopes,
canonical argument/key copies, readers, issue vectors, and snapshot containers. Opaque application
memory fields, event payload members, resource/transaction/stream values and errors, transaction
params, preview replacements, and child inputs remain application-owned immutable values: Flow
retains their identity, never mutates them, and does not recursively freeze a class instance or
arbitrary domain graph. Mutating one after admission is unsupported and may bypass revision or
observer detection; durable decoding is stricter and copies only WIRE-001-compatible data.

### SNAP-P01 — Discriminant and reader proof

Compile proofs MUST narrow every resource, transaction, stream, timer, and child union without
casts; reject foreign refs/definitions and unavailable fields; and preserve `A`, `E`, state,
memory, and timer-name literals. They MUST also prove that resource snapshots expose no
`isPlaceholderData`, `paused`, or `availability: "failure"`, and that actor snapshots expose no
receipts, public Cause, full facts, or failure lifecycle. Primitive compile proofs MUST show
that typed `error` exists only on a typed-failure member and no member exposes `cause`. Runtime
proofs MUST show missing reads are
side-effect-free, placeholder is not canonical, failed refresh does not duplicate an error on
retained canonical data, transaction projections leave with their bindings, and captured
snapshots never change after later turns, collection, or disposal.
