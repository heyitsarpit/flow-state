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
  ensure,
  invalidate,
  machine,
  module,
  observe,
  refresh,
  resource,
  run,
  runtime,
  stream,
  tag,
  transaction,
  view,
  vocabulary,
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
  inspectActions,
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
`Vocabulary`, `StateToken`, `EventToken`, `StateOf`, `EventOf`, `Machine`, `MemoryOf`,
`InputOf`, `RequirementsOf`, `Resource`, `ResourceRef`, `ResourceSnapshot`, `Transaction`,
`TransactionRef`, `TransactionSnapshot`, `View`, `SelectedOf`, `Module`, `App`, `Runtime`,
`RootActor`, `DynamicActor`, `ActorSnapshot`, `FlowIssue`, `FlowReceipt`, and
`CanonicalKeyInput`, `Tag`, and `InvalidationTarget`, plus the app-branded
`RuntimeBootPayload` returned by runtime dehydration and accepted as immutable boot input.
The root MUST also export the snapshot discriminants `ResourceStatus`,
`ResourceAvailability`, `ResourceActivity`, `ResourceFreshness`, `TransactionStatus`,
`StreamStatus`, `TimerStatus`, and `ChildStatus` defined by `SNAPSHOTS.md`.

The root MUST NOT export internal service tags, store or orchestrator implementations,
`ManagedRuntime`, boot artifact types, test harness types, or inspect artifact types. The
current root leaks internal runtime service contracts at `packages/flow-state/src/index.ts:26-40`;
vNext removes that leakage.

## Vocabulary and machine grammar

### API-003 — One vocabulary owns state and event identity

`vocabulary` MUST have exactly this authoring shape:

```ts
const Incident = vocabulary({
  id: "Incidents/Console",
  states: ["QUEUE", "DETAIL", "FAILED"],
  events: {
    IncidentOpened: (incidentId: string) => ({ incidentId }),
    IncidentLoaded: (incident: Incident) => ({ incident }),
    IncidentLoadFailed: (error: IncidentFailure) => ({ error }),
    IncidentSaveRequested: (patch: IncidentPatch) => ({ patch }),
    RetryRequested: null,
  },
});
```

`Incident.S.QUEUE` MUST be a frozen state token. `Incident.E.IncidentOpened` MUST be a
frozen callable event token, and `Incident.E.IncidentOpened("incident-1")` MUST return a
frozen event envelope. Member IDs MUST be `${vocabulary.id}/S/${name}` and
`${vocabulary.id}/E/${name}`. A `null` event declaration MUST produce a zero-argument
constructor. These rules follow the settled vocabulary contract
(`reference/incident-console/DESIGN_DECISIONS.md:618-699`).

```ts
// INVALID: state and event identity cannot be repeated in a second declaration.
machine({
  id: "Incidents/Console",
  states: ["QUEUE", "DETAIL"],
  events: ["IncidentOpened"],
});
```

### API-004 — Machine construction has one overload

The only public machine constructor MUST be
`machine(vocabulary, (states, events) => config)`.

```ts
const incidentMachine = machine(Incident, (S, E) => ({
  memory: () => ({
    selectedIncidentId: null as string | null,
    retryCount: 0,
  }),
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
    FAILED: {},
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

```ts
// INVALID
machine(Incident, (S) => ({
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

### API-005 — Resource refs preserve lookup arguments and canonical identity

`resource` MUST accept an exact parameter tuple inferred from `key` and `lookup`.

```ts
const incidentDetail = resource({
  id: "incidents.detail",
  key: (incidentId: string) => ({ incidentId }),
  lookup: (incidentId: string) => IncidentApi.get(incidentId),
  tags: (incidentId) => [tag("incidents"), tag(`incident:${incidentId}`)],
  placeholder: (incidentId) => ({ id: incidentId, status: "unknown" }),
  staleTime: "30 seconds",
  gcTime: "5 minutes",
});

const detailRef = incidentDetail.ref("incident-1");
```

`key` MUST return `CanonicalKeyInput` directly. Ref arguments and the returned key MUST be
finite canonical JSON-like values so identity can round-trip through boot and CLI artifacts.
The descriptor MUST NOT accept a domain `schema`, `freshness.staleAfter`, or
`onInvalidate`. Live tests already prove exact parameter and `Effect<A, E, R>` preservation
(`packages/flow-state/src/public-api-types.test.ts:1319-1401`); vNext retains those proofs
while replacing the old config names.

`staleTime` and `gcTime` accept non-negative Effect `Duration.Input`; `gcTime` additionally
accepts `Infinity`. Defaults are `staleTime: 0` and `gcTime: "5 minutes"`. Policy belongs to
the descriptor family and cannot be overridden by an activity, view, hook, fixture seed, or
runtime call.

### API-006 — Resource activities use refs or typed parameter selectors

The public overloads MUST be:

```ts
ensure(ref, options?);
observe(ref, options?);
refresh(ref, options?);

ensure(resource, { params: (snapshot) => tupleOrNull, outcomes? });
observe(resource, { params: (snapshot) => tupleOrNull, outcomes? });
refresh(resource, { params: (snapshot) => tupleOrNull, outcomes? });

invalidate(refOrTagOrFilter);
```

Finite `ensure` and `refresh` MAY map `success`, `failure`, `defect`, and `interrupt`.
Continuing `observe` MAY map `value`, `failure`, `defect`, and `interrupt`. The property MUST
be named `outcomes`, and an activity MUST NOT target a state or update memory directly.
Outcome ownership is settled at `reference/incident-console/DESIGN_DECISIONS.md:240-345`.

`tag(id)` MUST create an immutable nominal tag with a non-empty stable string ID and no
schema overload. An invalidation target is exactly one resource ref, one tag, or one
`CanonicalKeyInput` filter. A ref matches only itself; a tag matches refs whose descriptor
projected that tag ID; and a filter matches every descriptor ref whose projected key is
canonically equal to the filter. `invalidate(target)` is a finite synchronous store activity:
it marks every matching base invalidated in one store revision, then active `observe`
ownership may authorize refresh. Passive views and finite `ensure` ownership do not.

`ensure` returns retained canonical data while it is fresh and otherwise owns one finite
shared lookup. `refresh` always requests a new generation, replacing older lookup work for the
same exact ref. `observe` is continuing ownership: it ensures missing or stale data on
activation and authorizes stale focus/reconnect refresh while active. Concurrent owners of one
exact ref join the store-global current generation rather than starting duplicate lookup
Effects.

### API-007 — Transactions own execution, observable ref identity, and settlement routes

`transaction` MUST retain `params`, `key`, `preview`, `commit`, `invalidates`, `routes`,
`scope`, and `concurrency`:

```ts
const saveIncident = transaction({
  id: "incidents.save",
  params: ({
    memory,
    event,
  }: {
    readonly memory: MemoryOf<typeof incidentMachine>;
    readonly event: EventOf<typeof Incident> | null;
  }) =>
    memory.selectedIncidentId === null ||
    event === null ||
    event.type !== Incident.E.IncidentSaveRequested.id
      ? null
      : {
          incidentId: memory.selectedIncidentId,
          patch: event.patch,
        },
  key: ({ incidentId }) => ({ incidentId }),
  preview: {
    apply: ({ params }) => [
      { ref: incidentDetail.ref(params.incidentId), replace: optimisticIncident },
    ],
  },
  commit: ({ incidentId, patch }) => IncidentApi.patch(incidentId, patch),
  invalidates: ({ params }) => [incidentDetail.ref(params.incidentId)],
  routes: {
    success: (incident) => Incident.E.IncidentLoaded(incident),
    failure: (error) => Incident.E.IncidentLoadFailed(error),
  },
  scope: { id: "incident-saves" },
  concurrency: "serialize",
});

saveIncident.ref({ incidentId: "incident-1" });
```

When `key` is present, `transaction.ref(keyInput)` MUST require exactly the key function's
return type. When `key` is absent, the transaction MUST be a singleton and expose only
`transaction.ref()`. When `params` is absent, `commit` MUST be zero-argument. `routes` MUST
accept a direct contextual literal; an identity-only inference wrapper MUST NOT exist. The
transaction model is retained by `reference/incident-console/DESIGN_DECISIONS.md:499-537`,
and exact preview replacement typing already has a live proof at
`packages/flow-state/src/public-api-types.test.ts:3896-4014`.

`params` receives the readonly stabilized actor snapshot plus `event`, the vocabulary event
that caused this binding activation or `null` during eventless fresh activation. It MUST
return concrete immutable params or `null` to decline the attempt. Restoration uses the
persisted materialized binding and MUST NOT call `params` again for an already active or
consumed generation.

On successful commit, the runtime MUST remove that generation's optimistic overlays and
invalidate the authoritative base. It MUST NOT promote preview output to canonical server
truth. vNext does not include an authoritative-result mapping.

### API-008 — Streams and children have canonical activity identity

The public stream and child shapes MUST be:

```ts
stream({
  id,
  params?,
  key?,
  subscribe: ({ params }) => Stream.Stream<Value, Error, Requirements>,
  pressure?,
  outcomes?: { value, complete, failure, defect, interrupt },
});

child({
  machine,
  input?,
  key?,
  outcomes?: { complete, failure, defect, interrupt },
});
```

Parameterized streams and children MUST provide a canonical `key` projection. Stream normal
exhaustion MUST be named `complete`, not `done`. Scoped remote leases MUST use an
Effect-scoped stream when they are continuing operational work or a child actor when their
lifecycle changes application behavior; the public API MUST NOT add a third lease primitive.

### API-009 — State-triggered transaction execution is an activity

`run(transaction)` MUST produce a self-identifying activity and MUST use the transaction's
own `routes`. It MUST NOT accept another outcome map.

```ts
SAVING: {
  activities: [run(saveIncident)],
}
```

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
      saveStatus: save.status,
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
transactions, streams, children, and services MUST be inferred from reachable machine graphs.
Modules MUST NOT accept a generic inventory, metadata bucket, fixtures, screens,
permissions, dependency strings, or actor factories. This is the settled module boundary at
`reference/incident-console/DESIGN_DECISIONS.md:878-922`.

### API-012 — Apps have explicit durable identity

```ts
const IncidentApp = app({
  id: "incident-console",
  persistenceVersion: "1",
  modules: [IncidentsModule],
});
```

An app MUST require a collision-free `id`, an application-owned `persistenceVersion`, and an
exact module tuple. It MUST remain inert and MUST NOT expose `.layer(...)`. App compilation
MUST reject duplicate global IDs, ambiguous root ownership, views bound outside their module
roots, and unreachable dynamic actor definitions.

### API-012A — Runtime and actors expose commands, evidence, and host lifetime

Runtime construction MUST behave as these two overloads:

```ts
runtime({ app, boot? }); // only when RequirementsOf<App> is never
runtime({ app, layer, boot? });
```

The runtime MUST expose `actor(rootMachine)`, `createActor(machine, { input, id? })`,
`ready()`, `runPromise(effect)`, `runPromiseExit(effect)`, `dehydrate()`, and `dispose()`.
`dehydrate()` MUST return `Promise<RuntimeBootPayload<App>>`. Root and dynamic actors MUST
expose `id`, `machine`, `getSnapshot()`, `snapshots`, and synchronous `send(event): void`;
only a dynamic actor exposes `dispose()`. Exact readiness, acknowledgment, observation, SSR,
and disposal semantics are owned by `REACT_AND_HOSTS.md`.

The runtime MUST NOT expose mutable resource or orchestrator services, `hydrateBoot`, a
public ManagedRuntime, test controls, or a public acknowledged-dispatch operation.

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
`description`, and `tags`. `start` is the exclusive `fresh | snapshot | boot` union in
TEST-003. It MAY be omitted only for a `void`-input machine; a non-void-input machine MUST
receive either fresh input, a compatible snapshot, or a compatible boot actor. `.with(...)`
accepts only direct `fixtures` and one `progress.maxTurns` policy; app, start, raw Layers,
seeds, clocks, and runtimes MUST NOT be supplied there.

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
const incidentModel = model(baseStory);
const paths = incidentModel.getShortestPaths({
  events: [Incident.E.IncidentOpened("incident-1"), Incident.E.RetryRequested()],
  maxDepth: 20,
  limit: 100,
});

await paths[0]!.story.run();
await paths[0]!.story.flush().run();
```

The model MUST expose only `getShortestPaths` and `getSimplePaths`. Each path MUST retain
predicted snapshots, steps, issues, weight, description, and `path.story`. The model MUST NOT
run Effects, synthesize asynchronous success routes, or expose `replay`, `replayFlushed`,
`provide`, `clock`, or `resolveSyncSuccessRoutes`. The unsafe current replay surface is visible
at `packages/flow-state/src/core/api/testing-types.ts:299-378`.

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

`createInspectionBufferSink({ capacity })` MUST own explicit bounded retention. The runtime
MUST NOT retain an implicit unbounded turn history. One formatter per projection MUST accept
format options; duplicate `format*Pretty` functions MUST NOT exist.

### API-018 — CLI consumes registered behavior and typed artifacts only

The installed `flow-state` binary MUST expose exactly these command families:

```text
flow-state behavior build
flow-state behavior render
flow-state behavior diff

flow-state story list
flow-state story describe <story-id>
flow-state story run <story-id>
flow-state story paths <story-id> --strategy shortest|simple

flow-state trace summarize <artifact>
flow-state trace proof <artifact> --selector <selector>
flow-state trace diff <left> <right>
```

Commands MUST load the named `BehaviorGateway` from `src/app/behavior.ts` or `--gateway`.
`story run` MUST invoke the registered plan's `.run()`. `story paths` MUST use concrete typed
events already authored in registered stories for that machine. The CLI MUST NOT accept
arbitrary payload-bearing event JSON; the current `parseEventJson` and `--event` path input at
`packages/flow-state/src/cli/index.ts:200-214,851-909` are removed.

## Proof obligations

### API-P01 — Export-map proof

Packed-package tests MUST assert the exact six public routes, reject private deep imports,
and assert that non-root routes cannot import root builders. The existing packed proof does
this for route names and import conditions at
`packages/flow-state/scripts/check-packed-consumers.mjs:259-267`.

### API-P02 — Grammar proof

Positive and negative compile fixtures MUST cover every valid and invalid example in
API-003 through API-016 under strict, isolated-modules, isolated-declarations, and packed
consumer modes.

### API-P03 — Semantic proof

Runtime tests MUST prove descriptor collision rejection, exact ref identity, no preview
promotion, route ownership, model purity, fixture isolation, story disposal, and CLI refusal
of arbitrary event payload fabrication.
