# Concepts

Flow State separates app data, process state, optional UI projection, and Effect execution so each concern has a clear owner.

## Ownership Rules

| Owner              | Owns                                                                                                                  | Does not own                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ResourceStore      | Canonical app data, resource snapshots, freshness, invalidation, preview patches, subscriptions.                      | Product workflow states such as editing, saving, conflict, or awaiting approval.                  |
| OrchestratorSystem | Actors, machine state, process context, transitions, state-scoped work, cancellation, child actors.                   | Canonical API data that multiple screens or flows need.                                           |
| Views              | Optional read models for significant projection across multiple resources, actors, receipts, streams, or child flows. | Fetching, transaction execution, workflow state, canonical writes, simple one-resource rendering. |
| Effect runtime     | Services, Layers, scopes, fibers, clocks, schedules, streams, cache internals, observability.                         | Flow-specific product semantics and public workflow snapshots.                                    |

Canonical data lives in ResourceStore. Process state lives in flows. Most UI can read those directly; views are for screens where direct reads would duplicate non-trivial projection logic. Effect services perform side effects and are composed with Layers.

## Resource, Flow Context, Or View

| Put it in    | When                                                                | Launch Workspace example                                                                            |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Resource     | The value is canonical data shared by screens, flows, or commands.  | `launch.project`, `launch.permissions`, `launch.readiness`, `launch.assets`, `launch.approval`.     |
| Flow context | The value is local process state or a user decision.                | Active tab, project draft, save conflict, selected trace label.                                     |
| View         | The value is a reusable projection across multiple runtime sources. | Readiness score across resource lists, assistant progress joined with child state, trace summaries. |

Avoid copying resource data into flow context just to render it. Seed the ResourceStore in tests, observe resources from flows, and introduce views only when joining or transforming runtime facts would otherwise spread across components.

## Modules

`flow.module` is a domain manifest. It gives the runtime, docs, tests, route adapters, and devtools a stable inventory of a product domain without guessing from arbitrary exports.

```ts
export const Project = flow.module(
  "Project",
  () => ({
    byId,
    comments,
    save: saveProjectTransaction,
    editor,
    resources: { byId, comments },
    transactions: { save: saveProjectTransaction },
    machines: { editor },
  }),
  {
    dependencies: ["Session"],
    tags: ["project"],
    screens: ["Editor"],
    fixtures: ["launchWorkspaceSeed.project"],
  },
);
```

`flow.app({ modules })` composes modules, validates obvious inventory problems, and exposes flattened module ownership for tests and documentation.

## Effect Posture

Flow State does not replace Effect. Import Effect-native concepts from `effect`:

```ts
import { Clock, Context, Effect, Layer, Option, Redacted, Result, Schema, Stream } from "effect";
import { flow, flowTest } from "@flow-state/core";
```

Use `Context.Service` for app APIs, `Layer` for live/test composition, `Effect` for service work, `Stream` for ongoing values, `Schedule` and `Duration.Input` for time, `Schema` for decode boundaries, `Option` for absence, `Result` for pure validation, and `Exit` / `Cause` for typed failure, defect, and interrupt lanes.

## Use This When

Use Flow State when a screen needs workflow state and runtime-owned shared data at the same time: editor saves, permission gates, live streams, child tasks, traceable receipts, and deterministic scenario tests.

Prefer Effect directly for service internals, batching, retry, polling, logging, and platform clients. Prefer Flow State for app-visible resources, flows, runtime facts, test harnesses, and the occasional view when a screen needs a real projection layer.
