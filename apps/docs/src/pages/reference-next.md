# Reference vNext

Status: proposed API contract.

This section is the clean target API. It is allowed to disagree with the current
runtime and with the older reference pages under [`/reference`](/reference/lib_api).

Flow is an Effect-powered app runtime.

```txt
Resources model what the app knows.
Flows model what the app is doing.
Views model what the user sees.
```

That is the mental model. Flow should not teach "your app is a state machine".
Most apps have shared data plus explicit workflows. The state-machine part is
the workflow/control-flow layer, not the owner of canonical data.

## Ownership Rules

| Layer               | Owns                                                                                                | Does not own                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Resource Store      | Canonical app data, resource snapshots, freshness, invalidation, optimistic patches, subscriptions. | Product workflow states such as editing, saving, conflict, awaiting approval. |
| Orchestrator System | Actors, machine state, process context, transitions, state-scoped effects, cancellation.            | Canonical API data that other components also need.                           |
| Views               | Projections from resource snapshots plus flow snapshots.                                            | Fetching, mutation lifecycle, workflow state, canonical writes.               |
| Effect Runtime      | Services, Layers, scopes, fibers, clocks, schedules, streams, cache internals, observability.       | Flow-specific product semantics and public workflow snapshots.                |

Canonical data lives in the Resource Store. Process state lives in
orchestrators. Rendering decisions live in views. Effect Layers install all of
the services into one app runtime.

## Public Concepts

The public API should stay small:

```txt
flow.module
flow.resource
flow.mutation
flow.machine

flow.app
App.layer
flowTest
```

Domain modules make the API cohesive:

```ts
export const Project = flow.module("Project", ({ resource, mutation, machine }) => {
  const byId = resource(...)
  const comments = resource(...)
  const save = mutation(...)
  const editor = machine(...)

  return { byId, comments, save, editor }
})
```

Internally those definitions are different services and descriptors. Publicly
they share one domain vocabulary:

```txt
Project.byId
Project.comments
Project.save
Project.editor
```

## Effect Posture

Use Effect directly when Effect already owns the concept.

```ts
import {
  Array,
  Cause,
  Context,
  Data,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Match,
  Option,
  Queue,
  Record,
  Redacted,
  Result,
  Schedule,
  Schema,
  Stream,
  TestClock,
  pipe,
} from "effect";

import { flow, flowTest } from "@flow-state/core";
```

Flow should not re-export Effect as a shadow standard library. If users need
`Stream`, `Schedule`, `Duration.Input`, `Schema`, `Result`, `Option`,
`RequestResolver`, `Redacted`, or `Layer`, they should import those names from
`effect`.

## What Flow Adds

Flow adds the app-runtime layer that Effect intentionally does not prescribe:

- Resource definitions with UI/test/devtools snapshots.
- Orchestrator definitions with state-machine semantics.
- Integration primitives such as `ensure`, `observe`, `refresh`, `run`,
  `patch`, and `invalidate`.
- Shared traces that correlate resource events, machine events, mutation
  transactions, streams, timers, and Effect spans.
- Test harnesses that can seed resources, start flows, control Effects/Streams,
  advance time, and expose receipts.

## App Shape

```ts
export const App = flow.app({
  modules: [Session, Project, Checkout, Agent],
})

export const AppLive = App.layer({
  store: flow.store.memory({
    gc: true,
    traces: true,
  }),
  orchestrators: flow.orchestrators.live(),
  services: [
    ProjectApi.layer,
    AuthApi.layer,
    CommentApi.layer,
    Observability.layer,
  ],
})

export const AppTest = App.layer({
  store: flow.store.test({
    seed: [[Project.byId("p1"), fakeProject]],
  }),
  orchestrators: flow.orchestrators.test(),
  services: [
    ProjectApi.layerMock({
      saveProject: () => Effect.fail(new ProjectConflict(...)),
    }),
  ],
})
```

React receives one runtime:

```tsx
<FlowProvider layer={AppLive}>
  <AppRoutes />
</FlowProvider>
```

Tests receive the same app definitions with different Layers:

```ts
const harness = flowTest(Project.editor)
  .provide(AppTest)
  .start({ input: { projectId: "p1" } });

expect(harness.state()).toBe("viewing");

harness.send({ type: "EDIT" }).send({ type: "SAVE" });
await harness.flush();

expect(harness.state()).toBe("conflict");
```

The definitions are the same. The Layers are different.

Flow owns runtime controls and facts. Vitest, `@effect/vitest`, or the host
test runner owns assertions, diffs, snapshots, reporters, and property checks.
Do not add Flow-owned `.expectState()` or `.expectData()` helpers to the public
contract.

## Replacements

| Old/current direction                       | vNext direction                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `flow.query` as machine-owned read          | `flow.resource` in the app Resource Store                                        |
| Query lifecycle copied into machine context | Multi-axis resource snapshots observed by flows and components                   |
| `staleTime` / `gcTime`                      | Resource freshness plus Effect `Cache` names: `lookup`, `capacity`, `timeToLive` |
| Async iterable as primary stream            | `Stream.Stream<A, E, R>`                                                         |
| Flow retry/polling fields                   | `Schedule` for retry, polling, repeat, sampling, and refresh                     |
| Custom duration shape                       | `Duration.Input`                                                                 |
| Bespoke DI/mocks                            | `Context.Service` plus `Layer`                                                   |
| Collapsed errors                            | `Exit` / `Cause` with success, typed failure, defect, interruption               |
| Ad hoc redaction                            | `Redacted`, `Schema.Redacted`, trace redaction policy                            |
| Manual tagged errors plus duplicate schemas | `Schema.TaggedErrorClass` or `Data.TaggedError`                                  |

Compatibility shims may exist while the runtime catches up. The docs should
teach the final model, not the shim.

The built examples are API pressure tests, not syntax authority for vNext. When
they are rewritten, keep the problems they prove but move the code toward this
model:

- Todo List: pure flow state and selectors, no ResourceStore ceremony.
- Project Editor: canonical project data in resources, draft/conflict process
  state in the editor flow, save as a mutation transaction.
- Upload Manager: state-scoped `Stream`, cancellation, pressure, and virtual
  time.
- Cached Dashboard: shared resources, stale/refresh snapshots, invalidation,
  and view projections.
- Checkout: guards, permissions, redaction, persistence shape, and idempotent
  mutation semantics.
- Agent Workspace: child flows, progress streams, approvals, traces, replay,
  and devtools.

## Page Map

- [Library API](/reference-next/lib-api) is the quick reference of functions,
  services, hooks, and test probes.
- [Core API](/reference-next/core) defines modules, resources, mutations,
  machines, snapshots, and view projections.
- [Effect Runtime](/reference-next/effect-runtime) defines runtime services,
  Layers, ManagedRuntime, ResourceStore, OrchestratorSystem, Trace, Clock, and
  failure/receipt semantics.
- [Streams And Schedules](/reference-next/streams-schedules) defines
  state-scoped streams, timers, schedules, pressure, and cancellation.
- [Tests And Examples](/reference-next/tests-and-examples) defines test Layers,
  seeded stores, controlled effects/streams, virtual time, transactions, and
  example expectations.
