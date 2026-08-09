# Public API contract

Status: normative vNext contract

This contract defines the supported package routes, public values, descriptor grammar,
testing plan surface, inspection surface, and CLI surface. Type propagation is specified in
[`TYPE_SYSTEM.md`](./TYPE_SYSTEM.md), host and React behavior in
[`REACT_AND_HOSTS.md`](./REACT_AND_HOSTS.md), and removals in
[`COMPATIBILITY_AND_DELETIONS.md`](./COMPATIBILITY_AND_DELETIONS.md).

The live package already publishes exactly the root, React, testing, server, inspect, and
package-manifest routes (`packages/flow-state/package.json:33-54`). Those route names are the
vNext package boundary.

## Package routes

### API-001 — Routes are isolated named-export surfaces

The package MUST publish these runtime-value exports and MUST NOT publish a package-owned
`flow`, `test`, `inspect`, or `hooks` namespace object. Consumers choose aliases locally.

```ts
import * as flow from "flow-state";
import * as flowTest from "flow-state/testing";
import * as inspect from "flow-state/inspect";
```

```ts
// flow-state
export {
  app,
  can,
  child,
  decodeRuntimeBoot,
  definition,
  FlowBootDecodeError,
  FlowDehydrateError,
  FlowDisposeError,
  machine,
  module,
  resource,
  runtime,
  stream,
  tag,
  transaction,
  view,
};

// flow-state/react
export { FlowProvider, useActor, useView };

// flow-state/testing
export { behavior, control, fixture, model, story };
export { FlowStoryExecutionError };

// flow-state/server
export { withRequestRuntime };

// flow-state/inspect
export {
  analyzeTrace,
  attachInspectionSink,
  buildBehaviorContract,
  compressTraceArtifact,
  createInspectionBufferSink,
  decompressTraceArtifact,
  diffBehaviorContracts,
  diffTrace,
  exportTraceArtifact,
  formatInspectionEvent,
  formatInspectionTimeline,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTransactionOverlapSummary,
  graphOf,
  importTraceArtifact,
  inspectActivities,
  inspectMicrosteps,
  inspectTransition,
  renderBehaviorContract,
  renderBehaviorCoverage,
  renderBehaviorDiff,
  sliceBehaviorContract,
  summarizeTrace,
  whyNoTransition,
};
```

The current route-negative tests are the compatibility baseline: non-root routes do not
export root builders, and no route exports a package-owned `flow` object
(`packages/flow-state/src/public-api-types.test.ts:63-106`).

### API-002 — Root type exports are consumer-facing contracts only

The root MUST export the companion types needed to name or infer its values:
`Definition`, `StateToken`, `EventToken`, `StateOf`, `EventOf`, `Machine`, `MemoryOf`,
`InputOf`, `RequirementsOf`, `Resource`, `ResourceRef`, `ResourceSnapshot`, `Transaction`,
`TransactionRef`, `TransactionSnapshot`, `View`, `SelectedOf`, `Module`, `App`, `Runtime`,
`RootActor`, `DynamicActor`, `ActorSnapshot`, the small active `FlowIssue` summary, and
`CanonicalKeyInput`, `Tag`, and `InvalidationTarget`, plus the app-branded
`RuntimeBootPayload` returned by runtime dehydration or the app-bound unknown decoder and accepted
as immutable boot input. `FlowBootDecodeError`, `FlowDehydrateError`, and `FlowDisposeError` are
the named root error classes needed to discriminate synchronous boot decoding, asynchronous
dehydration, and host cleanup at their JavaScript boundaries.

The root MUST NOT export `FlowReceipt`, standalone status aliases, full diagnostic facts,
Cause aliases, or TurnRecord types. The one `Cause.Cause<unknown>` field on `FlowDisposeError` is
the explicit host-cleanup exception; ordinary snapshots expose their literal discriminants directly;
full receipt and diagnostic facts belong to `flow-state/inspect`.

The root MUST NOT export internal service tags, store or orchestrator implementations,
`ManagedRuntime`, pending outcome records, boot artifact types, test harness types, or inspect artifact types. The
current root leaks internal runtime service contracts at `packages/flow-state/src/index.ts:26-40`;
vNext removes that leakage.

## Definition and machine grammar

### API-003 — One definition owns the complete static actor shape

`definition` MUST have exactly this authoring shape:

```ts
const Incident = definition({
  id: "Incidents/Console",
  states: ["QUEUE", "DETAIL", "FAILED"],
  events: {
    IncidentOpened: (incidentId: string) => ({ incidentId }),
    IncidentLoaded: (incident: Incident) => ({ incident }),
    IncidentLoadFailed: (error: IncidentFailure) => ({ error }),
    IncidentSaveRequested: (patch: IncidentPatch) => ({ patch }),
    RetryRequested: null,
  },
  memory: () => ({
    selectedIncidentId: null as string | null,
    retryCount: 0,
  }),
});
```

`Incident.S.QUEUE` MUST be a frozen `{ kind: "state", name: "QUEUE", id: fullId }` token.
`Incident.E.IncidentOpened` MUST be a frozen callable token with
`{ kind: "event", name: "IncidentOpened", id: fullId }`, and calling it MUST return a frozen plain
record `{ type: fullId, ...payload }`. Member IDs use GLO-01's namespace-tagged length-prefixed
encoding. An event payload constructor MUST return a readonly plain record, MUST NOT own `type`,
and MUST fail synchronously for any other result. A `null` event declaration MUST produce a
zero-argument constructor. The optional pure `memory` factory owns fresh actor initialization and infers
`Input` and `Memory`; omitting it means `Input = void` and an empty readonly memory record.
`definition` MUST NOT accept a type-only memory marker or a separate `initialMemory`; the factory
is both the inference source and fresh value constructor.

```ts
// INVALID: state and event identity cannot be repeated in a second declaration.
machine({
  id: "Incidents/Console",
  states: ["QUEUE", "DETAIL"],
  events: ["IncidentOpened"],
});
```

### API-004 — Machine construction has one behavior callback

The only public machine constructor MUST be
`machine(definition, ({ S, E, activity }) => config)`. The first argument already fixes exact
state, event, input, and memory types, so every transition and activity selector in the second
callback is contextually typed without referring back to the machine being declared. The
callback MUST NOT declare or replace memory initialization.
The returned machine inherits `definition.id` unchanged. Calling `machine` twice for one
definition produces colliding machine identities if both values are presented to one app.

```ts
const incidentMachine = machine(Incident, ({ S }) => ({
  initial: S.QUEUE,
  states: {
    QUEUE: {
      on: {
        IncidentOpened: {
          target: S.DETAIL,
          updateMemory: ({ event }) => ({ selectedIncidentId: event.incidentId }),
        },
      },
    },
    DETAIL: {
      redirect: {
        when: ({ memory }) => memory.selectedIncidentId === null,
        target: S.QUEUE,
      },
      timers: {
        stale: {
          delay: "30 seconds",
          target: S.FAILED,
        },
      },
    },
    FAILED: {
      on: {
        RetryRequested: {
          target: S.QUEUE,
        },
      },
    },
  },
}));
```

Machine state nodes MAY contain only `type`, `on`, `redirect`, `activities`, and `timers`.
`type`, when present, MUST be `"final"`. An `on` entry MAY be a state-token shorthand, one
transition, or an ordered readonly list of transitions. Transitions MAY contain only
`target`, `guard`, `updateMemory`, and `reenter`. `redirect` MAY be one redirect or an
ordered readonly list; each redirect MAY contain only `when` and required `target`. Timer
entries MAY contain only `delay`, `guard`, required `target`, and `updateMemory`. The
machine grammar MUST NOT expose
`context`, `update`, `actions`, `entry`, `exit`, `invoke`, `always`, `after`, transition
`submit`, or anonymous Effect callbacks. The selected grammar and lifecycle ownership are
specified at `reference/incident-console/DESIGN_DECISIONS.md:93-111,222-243,370-419`.

The callback objects are exact and frozen. An event-transition guard/update receives
`{ state, memory, snapshot, event }`, where `event` is narrowed to the matching event token's
envelope. A redirect `when` receives `{ state, memory, snapshot }` and never receives a prior
event. A timer guard/update receives `{ state, memory, snapshot, timer }`, where `timer` is
`{ name, startedAt, dueAt }`; Flow never invents a domain event for a timer. Activity `params`,
`input`, and invalidation selectors receive `{ state, memory, snapshot, event }` with
`event: EventOf<Machine> | null` plus a frozen `cause` discriminated as `activation`, `event`,
`timer`, `store`, or `internal`: the accepted domain event remains available for the final
post-stabilization activity selection, while fresh activation, timer, store-fanout, and internal
reconciliation use `null`. Hydration restores materialized bindings and does not call selectors.
`snapshot` is the complete pre-turn public snapshot for a
transition and the stabilized candidate snapshot for redirects and activity selection.

`delay` accepts one fixed Effect `Duration.Input`, never a callback. Machine construction converts
it once with `Duration.toMillis` and rejects a negative, fractional, sub-millisecond, non-finite,
or unsafe-integer result. Zero is valid but fires through a later mailbox turn after the scheduled
snapshot publishes. A timer name is unique across the machine, and its stable compiled identity is
machine ID plus state token plus timer name.

A final state node MUST be exactly `{ type: "final" }`. It has no event transitions, redirect,
activities, timers, or output callback. The final actor snapshot is its completion value; vNext
does not add a separate final-output type.

```ts
// INVALID
machine(Incident, ({ S }) => ({
  initial: S.QUEUE,
  states: {
    QUEUE: {
      entry: () => console.log("hidden work"),
      always: S.DETAIL,
    },
  },
}));
```

## Resources, transactions, streams, and children

### API-005 — Resource identity is descriptor plus canonical argument tuple

`resource` MUST accept one exact parameter tuple inferred from `lookup`. That tuple is both the
lookup input and the complete parameterized identity input; a resource MUST NOT declare a second
`key`, hash, equality, or identity projection.

```ts
const incidentDetail = resource({
  id: "incidents.detail",
  lookup: (incidentId: string) => IncidentApi.get(incidentId),
  tags: (incidentId) => [tag("incidents"), tag(`incident:${incidentId}`)],
  staleTime: "30 seconds",
  gcTime: "5 minutes",
  placeholder: (incidentId) => makeIncidentPlaceholder(incidentId),
});

const detailRef = incidentDetail.ref("incident-1");
```

Every argument MUST be a finite canonical JSON-like value. `resource.ref(...args)` MUST retain a
frozen canonical copy of the exact tuple, and ref equality MUST be canonical equality of
`[descriptor.id, args]`. Canonically equal tuples from one descriptor identify one ref; distinct
tuples remain distinct even when their lookups happen to contact the same endpoint. A
zero-argument lookup exposes only `resource.ref()` and uses the empty tuple. This identity MUST
round-trip through boot and artifacts without calling user code.

`tags` and `placeholder`, when present, MUST accept the same exact parameter tuple as `lookup`;
`placeholder` MUST return the lookup success type. Its value is governed by `SEM-012` and is never
canonical data. The descriptor MUST reject `key`, a domain `schema`, `freshness.staleAfter`,
`onInvalidate`, and custom equality or hashing. Live tests already prove exact parameter and
`Effect<A, E, R>` preservation
(`packages/flow-state/src/public-api-types.test.ts:1319-1401`); vNext retains those proofs while
removing the duplicate resource identity projection.

`staleTime` and `gcTime` accept non-negative Effect `Duration.Input`; `gcTime` additionally
accepts `Infinity`. Defaults are `staleTime: 0` and `gcTime: "5 minutes"`. Policy belongs to
the descriptor family and cannot be overridden by an activity, view, hook, fixture seed, or
runtime call. Descriptor construction converts durations once with `Duration.toMillis`; finite
values MUST be non-negative safe-integer milliseconds, and `Infinity` is valid only for `gcTime`.
Fractional, sub-millisecond, non-finite, negative, or overflowing results reject synchronously.

### API-006 — Resource activities are contextually typed machine bindings

`ensure`, `observe`, `refresh`, and `invalidate` MUST exist only on the `activity` kit passed to
the `machine(definition, callback)` behavior callback. They MUST NOT be standalone package
exports. The kit methods are:

```ts
activity.ensure(ref, { outcomes? }?);
activity.observe(ref, { outcomes? }?);
activity.refresh(ref, { outcomes? }?);

activity.ensure(resource, { params: (snapshot) => tupleOrNull, outcomes? });
activity.observe(resource, { params: (snapshot) => tupleOrNull, outcomes? });
activity.refresh(resource, { params: (snapshot) => tupleOrNull, outcomes? });

activity.invalidate(refOrTag);
activity.invalidate({
  targets: (snapshot) => readonlyRefOrTagArrayOrNull,
});
```

Finite `ensure` and `refresh` MAY map `success`, `failure`, `defect`, and `interrupt`.
Continuing `observe` MAY map `value`, `failure`, `defect`, and `interrupt`. The property MUST
be named `outcomes`, and an activity MUST NOT target a state or update memory directly.
Each mapped event is emitted at most once for the exact binding activation or lookup generation
specified by `SEM-011A` and `SEM-011B`; mapping an outcome never turns a store commit into an
inline or reentrant actor transition.

The mapper signatures are exact: resource `success`/`value` receive only `A`, `failure` receives
only `E`, and `defect`/`interrupt` receive no argument. A mapper is absent when its channel is
`never`; no mapper receives an `Exit`, `Cause`, generation, ref, snapshot, or synthetic error.
Direct-ref options contain only `outcomes`; selector options contain only `params` and optional
`outcomes`. Per-binding freshness, GC, retry, equality, and concurrency overrides are rejected.

`tag(id)` MUST create an immutable nominal tag with a non-empty stable string ID and no
schema overload. An `InvalidationTarget` is exactly one resource ref or one tag. A ref matches
only its descriptor-plus-argument-tuple identity; a tag matches refs whose descriptor produced
that tag ID for their retained arguments. Canonical-key filters and arbitrary predicates are not
part of resource invalidation.

The selector form is a contextually typed finite binding. Its `targets` callback receives the exact parent
snapshot plus `event: EventOf<Machine> | null` and returns a readonly target list or `null` to
decline. An empty list also normalizes to no binding. Flow MUST canonicalize refs, deduplicate
equal targets in first-seen order, and include the resulting non-empty target vector in binding
identity. The selector is pure and MUST NOT enumerate the store. Static and selector forms mark
all matched bases invalidated in one store revision; active
`activity.observe` ownership may then authorize refresh, while passive views and finite
`activity.ensure` ownership do not.

`ensure` emits a finite result from a fresh canonical hit or from the one lookup generation it
starts or joins; retained stale data remains readable but does not settle the binding. `refresh`
uses the same finite outcome rules but always requests a replacement generation. `observe` is
continuing ownership: it emits the current canonical value once on activation, ensures missing
or stale data, emits later canonical value replacements, and authorizes stale focus/reconnect
refresh while active. Concurrent owners of one exact ref join the store-global current lookup
generation rather than starting duplicate Effects. Placeholder, invalidation-only, overlay-only,
and equal-value metadata commits do not emit value or success outcomes by themselves.

### API-007 — Transaction descriptors are machine-independent

`transaction` MUST retain only external execution and instance policy: `id`, `key`, `preview`,
`commit`, `invalidates`, and `concurrency`. Parent snapshot selection and routed
`outcomes` belong to the machine activity binding in API-009.

```ts
type SaveIncidentParams = Readonly<{
  incidentId: string;
  patch: IncidentPatch;
}>;

const saveIncident = transaction({
  id: "incidents.save",
  key: ({ incidentId }: SaveIncidentParams) => ({ incidentId }),
  preview: {
    apply: ({ params }) => [
      { ref: incidentDetail.ref(params.incidentId), replace: optimisticIncident },
    ],
  },
  commit: ({ incidentId, patch }) => IncidentApi.patch(incidentId, patch),
  invalidates: ({ params }) => [incidentDetail.ref(params.incidentId)],
  concurrency: "serialize",
});

saveIncident.ref({ incidentId: "incident-1" });
```

When `key` is present, `transaction.ref(keyInput)` MUST require exactly the key function's
return type. When `key` is absent, the transaction MUST be a singleton and expose only
`transaction.ref()`. A zero-argument `commit` creates a singleton transaction. The descriptor
MUST NOT accept `params`, `routes`, a parent machine, parent memory, or parent events. The
transaction model is retained by `reference/incident-console/DESIGN_DECISIONS.md:499-537`,
and exact preview replacement typing already has a live proof at
`packages/flow-state/src/public-api-types.test.ts:3896-4014`.

`invalidates`, when present, MUST be either a readonly `InvalidationTarget` list or a callback
receiving `{ readonly params: P }` for the exact transaction params and returning that readonly
list. It uses the same exact-ref and nominal-tag semantics as `activity.invalidate`; it MUST NOT
accept a canonical-key filter or arbitrary store predicate.

`preview.apply` returns only a readonly list of exact `{ readonly ref; readonly replace }` entries.
VNext does not support `{ patch }`, mutable drafts, or an authoritative-result mapper. Flow freezes
the list, validates that every ref's descriptor was already admitted by AppPlan, and rejects two
canonically equal target refs before StoreState mutation; an empty list is a valid no-op preview.
Opaque replacement values are retained by identity and are application-owned immutable data.
After concurrency admission, Flow materializes and validates preview entries and invalidation
targets before starting an external commit. It applies the generation's complete ordered preview
atomically in the admission turn, including for a queued serialized attempt; `reject` evaluates no
callback and creates no overlay. A callback defect admits no attempt, applies no overlay, and starts
no external commit. Success later removes only that generation's overlay and applies the already
materialized invalidation vector without rerunning user code.

Concurrency is actor-local and keyed by the exact transaction ref. `reject`, `cancel`, `allow`,
and `serialize` therefore coordinate only attempts owned by one actor and one exact ref; there is
no public `scope` or cross-actor scheduler. Applications that require cross-command or cross-actor
serialization MUST model it as one command-owning machine/transaction or enforce it in the
external service.

On successful commit, the runtime MUST remove that generation's optimistic overlays and
invalidate the authoritative base. It MUST NOT promote preview output to canonical server
truth. vNext does not include an authoritative-result mapping.

### API-008 — Stream and child descriptors are machine-independent

The public descriptors MUST contain only reusable external or child-machine identity:

```ts
stream({
  id,
  subscribe: (...params) => Stream.Stream<Value, Error, Requirements>,
});

child({
  id,
  machine,
});
```

`stream` MUST NOT accept a parent selector, key, or outcomes. `child` MUST NOT accept parent
input, key, or outcomes. Those fields belong to `activity.stream` and `activity.child`, whose
selectors are contextually typed by the parent machine. Parameterized stream and child
bindings MUST provide a canonical `key` projection. Stream normal exhaustion MUST be named
`complete`, not `done`. Flow adds no `pressure` option or buffering scheduler: Effect Stream's
pull/backpressure semantics are authoritative, and an application that needs bounded dropping or
coalescing authors that policy explicitly inside its Stream. Scoped remote leases MUST use an Effect-scoped stream when they are
continuing operational work or a child actor when their lifecycle changes application
behavior; the public API MUST NOT add a third lease primitive.

### API-009 — Activity bindings own parent selection and routed outcomes

The contextually typed kit MUST expose `activity.run`, `activity.stream`, and `activity.child`.
Their `params` or `input` selectors receive the exact parent snapshot plus
`event: EventOf<Machine> | null`; they return a concrete immutable input or `null` to decline
the binding. Their direct `outcomes` literal maps operation results back into exact parent
events. Descriptors MUST NOT own those parent-specific callbacks.

Any ref returned by a selector, preview, or invalidation callback MUST belong to a descriptor
already admitted by an explicit binding or graph seed in AppPlan. Callback execution never expands
the app graph; an out-of-plan ref fails before actor or StoreState mutation. VNext exposes no
static dependency tuple for callback-only reachability.

```ts
SAVING: {
  activities: [
    activity.run(saveIncident, {
      params: ({ memory, event }) =>
        memory.selectedIncidentId === null ||
        event === null ||
        event.type !== E.IncidentSaveRequested.id
          ? null
          : {
              incidentId: memory.selectedIncidentId,
              patch: event.patch,
            },
      outcomes: {
        success: (incident) => E.IncidentLoaded(incident),
        failure: (error) => E.IncidentLoadFailed(error),
      },
    }),
  ],
}
```

The exact remaining binding shapes are:

```ts
activity.stream(streamDescriptor, {
  params: (snapshot) => parameterTupleOrNull,
  key: (params) => canonicalKey,
  outcomes?,
});

activity.child(childDescriptor, {
  input: (snapshot) => childInputOrNull,
  key: (input) => canonicalKey,
  outcomes?,
});
```

A zero-argument transaction exposes `activity.run(transaction, { outcomes? })` and uses the
singleton ref; each activation/event/timer edge admitted under SEM-019 supplies the empty parameter
tuple. A zero-parameter stream exposes `activity.stream(streamDescriptor, { outcomes? })` with the
empty-tuple key. A `void`-input child exposes `activity.child(childDescriptor, { outcomes? })` with
void input and the empty-tuple key. Parameterized forms always require their selector and canonical
key projection; no arity is inferred from an optional callback at runtime.

Managed children are autonomous supervised workflows. Their binding does not accept a
parent-to-child command mapper, actor-handle selector, or send callback. A workflow that needs
independent host commands must be an app-admitted dynamic actor; changing a managed child's
canonical key replaces its generation. Stream and child key is the sole equality projection: when
a later selector returns the same key with different opaque params/input, Flow retains the existing
generation and its originally materialized params/input. Authors MUST include every replacement-
significant fact in the canonical key; Flow never applies structural or reference equality to
opaque params/input.

Transaction outcomes map `success(A)`, `failure(E)`, `defect()`, and `interrupt()`. Stream outcomes
map `value(A)`, `complete()`, `failure(E)`, `defect()`, and `interrupt()`. Child outcomes map
`complete(exactFinalChildSnapshot)`, `defect()`, and `interrupt()`; child machines have no typed
failure channel. A mapper is unavailable where its typed channel is `never`, and no mapper receives
Cause or a synthetic error. Planned stop/release never routes an outcome.

Restoration uses the persisted materialized binding and MUST NOT rerun its selector for an
already active or consumed generation. A running stream's concrete params are persisted only as
restart input. Ordinary stream params remain exact and unrestricted, but `dehydrate()` MUST fail
with `NonDurableActiveStreamParams` when an active binding's materialized tuple is outside the
canonical durable carrier; it MUST NOT emit an unrestorable boot payload.

## Views, modules, and applications

### API-010 — A view is bound to one machine and selects one actor snapshot

```ts
const incidentView = view(incidentMachine, {
  id: "incidents.detail.view",
  select: (snapshot) => {
    const incidentId = snapshot.memory.selectedIncidentId;
    const detail =
      incidentId === null ? null : snapshot.resources.get(incidentDetail.ref(incidentId));
    const save =
      incidentId === null ? null : snapshot.transactions.get(saveIncident.ref({ incidentId }));
    return {
      state: snapshot.value,
      detail,
      saveStatus: save?.status ?? "idle",
      canRetry: can(snapshot, Incident.E.RetryRequested()),
    };
  },
});
```

A view MUST receive the complete readonly actor snapshot directly and MUST return its
authored projection directly. It MUST NOT declare `sources`, acquire work, accept an equality
function, receive injected `can` or `whyNot`, or return a prescribed query-shaped wrapper.
The settled observer contract is at `reference/incident-console/DESIGN_DECISIONS.md:1001-1084`.

### API-011 — Modules declare public roots and views only

```ts
const IncidentsModule = module({
  id: "Incidents",
  machines: [incidentMachine],
  views: [incidentView],
});
```

`machines` MUST be public root machine entry points. `views` MUST bind those roots. Resources,
transactions, streams, children, and services MUST be inferred from the root graphs and any
app-level dynamic-machine seeds.
The static carrier graph MUST be acyclic: every descriptor is declared before the machine that
binds it, and every child descriptor refers to an already-declared reachable child machine.
Self-recursive and mutually recursive definition graphs, lazy descriptor thunks, and
post-construction graph mutation are not part of vNext.
Modules MUST NOT accept a generic inventory, metadata bucket, fixtures, screens,
permissions, dependency strings, or actor factories. This is the settled module boundary at
`reference/incident-console/DESIGN_DECISIONS.md:878-922`.

### API-012 — Apps have explicit durable identity

```ts
const IncidentApp = app({
  id: "incident-console",
  persistenceVersion: "1",
  modules: [IncidentsModule],
  dynamicMachines: [incidentEditorMachine],
});
```

An app MUST require a collision-free `id`, an application-owned `persistenceVersion`, and an
exact module tuple. Optional `dynamicMachines` MUST be an exact tuple of statically admitted
machine families. It contributes those graphs and Effect requirements to AppPlan but creates no
actor, supplies no input or ID, adds no root, and permits no post-construction registration. The
app MUST remain inert and MUST NOT expose `.layer(...)`. App compilation MUST reject duplicate
IDs within each named resolver namespace, ambiguous root ownership, views bound outside their module roots, and foreign
references from inside the presented transitive closure. It MUST NOT reject an unseen definition
merely because another definition exists elsewhere in the process.

### API-012A — Runtime and actors expose commands, evidence, and host lifetime

Unknown persisted input MUST enter through:

```ts
const boot = decodeRuntimeBoot(IncidentApp, unknownStoredValue, {
  decodeDomain: ({ kind, value, machineId, descriptorId }) =>
    decodeIncidentDomainValue({ kind, value, machineId, descriptorId }),
});
```

`decodeRuntimeBoot(app, value, { decodeDomain })` MUST synchronously run the same bounded
service-free v2 Schema as runtime construction, validate the exact app and persistence identity,
visit every opaque domain slot through WIRE-003's frozen locator union in canonical path order,
validate every callback result against the shared bounds, and return the app-branded
`RuntimeBootPayload<App>`. The callback is required for unknown storage and its throw escapes with
the original identity; it may validate/normalize current-version domain values but cannot migrate
Flow identities or another `persistenceVersion`. On Flow-owned failure the decoder MUST throw this
frozen package-constructed error shape:

```ts
class FlowBootDecodeError extends Error {
  readonly _tag: "FlowBootDecodeError";
  readonly kind:
    | "Malformed"
    | "BoundExceeded"
    | "FlowVersionMismatch"
    | "DefinitionVersionMismatch"
    | "AppMismatch"
    | "PersistenceVersionMismatch"
    | "AppPlanMismatch"
    | "UnresolvableIdentity";
  readonly path: readonly (string | number)[];
}
```

The first failing structural or identity check in canonical traversal order owns `kind` and
`path`; the decoder never aggregates or retries errors. Assertion-casting the brand and accepting
unknown directly in `runtime` are unsupported. A payload returned directly by
`runtime.dehydrate()` is already app-branded and does not pass through `decodeDomain` again.

Runtime construction MUST behave as these two overloads:

```ts
runtime({ app, boot? }); // only when RequirementsOf<App> is never
runtime({ app, layer, boot? });
```

The runtime MUST expose `actor(rootMachine)`, `createActor(machine, { input, id? })`,
`ready()`, `runPromise(effect)`, `runPromiseExit(effect)`, `dehydrate()`, and `dispose()`.
It MUST additionally expose lookup-only `actor(dynamicMachine, { id })` for a durable dynamic
actor already present in the registry. This overload returns the exact existing handle and never
creates, adopts, supplies input, or changes disposal ownership. It rejects a missing ID, machine
mismatch, opaque non-durable identity, disposed incarnation, and foreign machine.
`dehydrate()` MUST return `Promise<RuntimeBootPayload<App>>`; runtime and dynamic-actor
`dispose()` MUST return `Promise<void>` and every repeated call MUST return the same Promise.
`runPromise` returns `Promise<A>` using Effect's ordinary Cause-to-rejection boundary, while
`runPromiseExit` returns `Promise<Exit.Exit<A, E>>` and never rejects for an Effect failure; both
may reject with the original shared Layer acquisition failure before an Effect begins. Root and dynamic actors MUST
expose `id`, `machine`, `getSnapshot()`, `snapshots`, and synchronous `send(event): void`;
only a dynamic actor exposes `dispose()`. Exact readiness, acknowledgment, observation, SSR,
and disposal semantics are owned by `REACT_AND_HOSTS.md`.

`FlowDisposeError` MUST be a frozen package-constructed `Error` with
`_tag: "FlowDisposeError"`, full `cause: Cause.Cause<unknown>`, and
`scope: "actor" | "runtime"`. Runtime scope combines actor-owned cleanup and application-Layer or
global-scope finalizer Causes without squashing either. Internally every owner exposes one
package-private `disposeExit(): Exit<void, unknown>`; runtime composition orders actor Causes by raw
actor ID, then StoreKernel, then application-Layer/global scope, and combines them sequentially.
Public `dispose()` maps that complete Cause to one cached `FlowDisposeError`; repeated calls return
the identical Promise and, on failure, the identical error object.

`createActor` MUST reject a machine absent from the app's compiled transitive closure; this is
a runtime authority check over the presented app, not an app-compilation search for process-wide
unseen definitions.

The runtime MUST NOT expose mutable resource or orchestrator services, `hydrateBoot`, a
public ManagedRuntime, test controls, or a public acknowledged-dispatch operation.

### API-012B — Synchronous host misuse has one stable structural error

Flow-owned synchronous declaration, lookup, admission, and passive-reader failures throw a frozen
package-constructed error whose constructor is not exported but whose shape is exact:

```ts
type FlowUsageErrorShape = Readonly<{
  _tag: "FlowUsageError";
  code:
    | "InvalidDefinition"
    | "InvalidCanonicalValue"
    | "AppPlanCollision"
    | "UnreachableMachine"
    | "ActorNotFound"
    | "ActorIdCollision"
    | "ActorDisposed"
    | "RuntimeDisposed"
    | "ForeignIdentity"
    | "AmbiguousRoot"
    | "ResourceUnavailable"
    | "InspectionSinkAlreadyAttached"
    | "RenderModeMutation";
  operation: string;
  details: Readonly<Record<string, CanonicalKeyInput>>;
  cause?: unknown;
}>;
```

Only a user callback defect may populate `cause`, preserving the thrown value by identity. The
shape covers `definition`/descriptor/ref construction, AppPlan compilation, root/dynamic/view
resolution, `send`, render-mode mutation, inspection attachment, and `resources.require`; it does
not replace typed Effect failures, boot/dehydrate/dispose errors, or story errors. Tests MUST assert
tag/code/details and side-effect boundaries rather than message prose.

## Testing definitions

### API-013 — Story is the only public declarative execution plan

`story` MUST be exported from `flow-state/testing` and MUST bind its app and machine before
commands are appended.

```ts
const assignIncident = story({
  app: IncidentApp,
  machine: incidentMachine,
  start: { kind: "fresh" },
  title: "assign an incident",
  tags: ["smoke"],
})
  .with({
    fixtures: [incidentApiFixture],
    progress: { maxTurns: 100 },
  })
  .send(Incident.E.IncidentOpened("incident-1"))
  .flush()
  .checkpoint("opened")
  .settle()
  .checkpoint("settled");

const run = await assignIncident.run();
run.checkpoints.opened;
run.final;
```

The builder commands MUST be exactly `with`, `send`, `perform`, `flush`, `settle`, `advance`,
`setTime`, `advanceToNextTimer`, `checkpoint`, and `run`. Plans MUST be immutable and linear.
They MUST NOT contain runtime branches, loops, predicates, arbitrary callbacks, promises,
Effects, matcher callbacks, or live actor readers. `checkpoint` MUST capture immediately and
MUST NOT progress execution. The consolidated story contract is settled at
`reference/incident-console/DESIGN_DECISIONS.md:1198-1358,1484-1511`.

The constructor options are exactly `app`, `machine`, optional `start`, `title`,
`description`, and `tags`. `start` is the exclusive `fresh | boot` union in
TEST-003. It MAY be omitted only for a `void`-input machine; a non-void-input machine MUST
receive either fresh input or a compatible boot actor. `.with(...)`
accepts only direct `fixtures` and one `progress.maxTurns` policy; app, start, raw Layers,
seeds, clocks, and runtimes MUST NOT be supplied there.

### API-013A — Testing runtime shapes are inferred

`FlowStoryExecutionError` MUST be the only named runtime class exported by
`flow-state/testing`. Story plans, run results, checkpoints, fixture definitions, controls,
models, and model paths MUST be inferred from their constructors and values; the testing route
MUST NOT export parallel named result, path, status, phase, evidence, or diagnostic classes.
`FlowStoryExecutionError` is the single host-rejection class for a plan that cannot execute as
authored. It MUST extend `Error`, expose frozen `_tag: "FlowStoryExecutionError"`, `phase:
"prepare" | "command" | "dispose"`, full `Cause.Cause<unknown>`, optional frozen
`command: { index: number; value: unknown }`, a frozen checkpoint record, exactly one frozen
evidence member (`{ kind: "none" } | { kind: "at-failure"; value: unknown } | { kind: "final";
value: unknown }`), and frozen cleanup
`{ status: "complete" } | { status: "failed"; cause: Cause.Cause<unknown> }`. Its constructor is
package-owned; callers inspect readonly fields and do not synthesize instances. Product outcomes
remain inferred immutable evidence rather than named status wrappers.

### API-014 — Fixture is the only reusable story environment input

```ts
const saveCall = control.effect<
  readonly [incidentId: string, patch: IncidentPatch],
  Incident,
  IncidentFailure
>({ id: "IncidentApi.save" });

const incidentEvents = control.stream<IncidentEvent, IncidentFailure>({
  id: "IncidentApi.events",
});

const incidentApiFixture = fixture({
  id: "incidents.fixture.api",
  controls: [saveCall, incidentEvents],
  seeds: [{ ref: incidentDetail.ref("incident-1"), value: initialIncident }],
  layer: ({ control }) =>
    Layer.succeed(IncidentApi, {
      save: control.effect(saveCall),
      events: control.stream(incidentEvents),
    }),
});
```

Effect call refs MUST expose `succeed`, `fail` when the endpoint error is not `never`, `die`,
and `interrupt`. Stream subscription refs MUST expose `emit`, `complete`, `fail` when
available, `die`, and `interrupt`. Call and subscription ordinals MUST be zero-based,
endpoint-local, and reset for every run. Stories MUST install environment capabilities only
through `.with({ fixtures })`.

### API-015 — Model discovery is pure and returns executable stories

```ts
const baseStory = story({ app: IncidentApp, machine: incidentMachine });
const incidentModel = model(baseStory, {
  stateKey: ({ value, memory }) => [value.id, memory],
});
const result = incidentModel.getShortestPaths({
  events: [Incident.E.IncidentOpened("incident-1"), Incident.E.RetryRequested()],
  maxDepth: 20,
  limit: 100,
});

await result.paths[0]!.story.run();
await result.paths[0]!.story.flush().run();
```

`model(baseStory, { stateKey })` MUST accept only a command-empty fresh-start story: app, machine,
fresh input/memory override, fixtures, and
progress policy may already be bound, but no `send`, `perform`, progress, clock, or checkpoint
command may have been appended; boot starts are rejected. `stateKey` is required, pure, and returns
the canonical identity for every predicted state, as specified by TEST-014. Candidate events belong solely to each `getShortestPaths` or
`getSimplePaths` call; the model and base story MUST NOT retain a candidate registry between
traversals.

The model MUST expose only those two traversal methods, with only `events`, `maxDepth`, and `limit`
as call options. Each call returns frozen `{ paths, truncated, explored }`. Each inferred path value MUST retain
predicted pure machine projections/state keys, steps, issues, weight, description, and `path.story`; path collections,
path entries, traversal results, and their metadata MUST NOT gain named runtime classes or
required public type exports beyond API-013A. The model MUST NOT run Effects, synthesize
asynchronous success routes, or expose `replay`, `replayFlushed`, `provide`, `clock`, or
`resolveSyncSuccessRoutes`. The unsafe current replay surface is visible at
`packages/flow-state/src/core/api/testing-types.ts:299-378`.

### API-016 — Behavior is the sole discovery gateway

```ts
export const BehaviorGateway = behavior({
  stories: {
    "assign-incident": assignIncident,
  },
});
```

`behavior` MUST infer one shared app from its stories and MUST reject mixed-app stories.
Registered object keys are unique by JavaScript construction, must be non-empty stable
external IDs, and MUST NOT be synthesized from titles or property order. It MUST NOT accept a
separate app, fixture registry, model registry, or machine inventory. Registration MUST NOT
change execution.

## Inspection and CLI

### API-017 — Inspection derives from AppPlan, TurnRecord, and v2 artifacts

Pure graph and transition functions MUST accept inert definitions or immutable snapshots.
Live inspection MUST consume committed `TurnRecord`s after actor publication. Trace and
behavior artifacts MUST use the shared private v2 codecs and preserve typed decode failures.
Inspection MUST NOT maintain a second mutable history or fabricate a trace from an arbitrary
snapshot.

Each pure transition inspection performs exactly one planner pass and may report transition
selection, redirect microsteps, memory patch, and desired authored activity bindings. It cannot
report actual starts, releases, generations, pending outcomes, or finalizers because those facts
exist only after CommitPlan interpretation and are available only from TurnRecords. The function is
therefore named `inspectActivities`, not `inspectActions`. A foreign snapshot or callback defect
returns/throws the same stable frozen inspect diagnostic on every call; helpers MUST NOT rerun a
no-match plan to format its explanation.

`TurnRecord` remains package-private. `flow-state/inspect` exposes immutable receipt,
Cause-bearing diagnostic, trace, behavior, and artifact projections only as the inferred inputs
and outputs of the named values in API-001; it MUST NOT recreate a parallel exported hierarchy
of TurnRecord, receipt, fact, trace-result, or formatter-option aliases. Those rich projections
MUST NOT leak back through root actor snapshots. A custom sink protocol is not part of vNext.
`attachInspectionSink(runtime, sink)` accepts only a sink created by this route and returns a
frozen attachment with `drain(): Promise<void>` and `dispose(): Promise<void>`. Attachment observes
only records admitted after successful attachment; disposal stops admission, drains the accepted
prefix, detaches once, and is idempotent. Slow sink processing MUST NOT delay actor acknowledgment
or StoreFanout. A sink failure MUST preserve committed state, reject `drain` and `dispose` with its
Cause-bearing inspect diagnostic, detach the failed sink, and leave other sinks active.

`createInspectionBufferSink({ capacity })` MUST own explicit bounded retention. The runtime
MUST NOT retain an implicit unbounded turn history. Its frozen public value MUST expose
`snapshot()` and `clear()`; snapshots contain the retained ordered records plus
`truncatedBeforeSequence`, where capacity zero retains none but advances that marker. `clear()`
removes the current retained prefix without resetting global sequence or truncation truth. One formatter per projection MUST accept
format options; duplicate `format*Pretty` functions MUST NOT exist.

### API-018 — CLI consumes registered behavior and typed artifacts only

The installed `flow-state` binary MUST implement the exact grammar, TypeScript gateway boundary,
bounded v2 artifact path, story-executor parity, immutable result envelopes, stdout/stderr, exit,
signal, atomic-file, and truncation laws in [`CLI.md`](./CLI.md). `behavior check` is the only new
leaf beyond the retained behavior, story, and trace families.

Model path discovery remains a typed programmatic API and MUST NOT be exposed as a CLI command.
The CLI MUST NOT accept arbitrary payload-bearing event JSON, Scenario/local-proof compatibility
input, batch story execution, or another history/runner owner. The current `parseEventJson` and
`--event` path input at `packages/flow-state/src/cli/index.ts:200-214,851-909` are removed.

## Proof obligations

### API-P01 — Export-map proof

Packed-package tests MUST assert the exact six public routes and exact root runtime-value list,
reject standalone `ensure`, `observe`, `refresh`, `invalidate`, and `run` imports, reject
private deep imports, and assert that non-root routes cannot import root builders. The existing
packed proof does this for route names and import conditions at
`packages/flow-state/scripts/check-packed-consumers.mjs:259-267`.

### API-P02 — Grammar proof

Positive and negative compile fixtures MUST cover every valid and invalid example in
API-003 through API-016 under strict, isolated-modules, isolated-declarations, and packed
consumer modes.

### API-P03 — Semantic proof

Runtime tests MUST prove descriptor collision rejection, exact ref identity, no preview
promotion, route ownership, model purity, fixture isolation, story disposal, and CLI refusal
of arbitrary event payload fabrication.
