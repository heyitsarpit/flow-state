# API Reference

This page is the shortest useful map of the public Flow State surface.

If the API feels large at first glance, the important thing to know is that you
do not need all of it at once.

## Start Here

Most apps can begin with this small set:

| API           | Why it exists                                                         |
| ------------- | --------------------------------------------------------------------- |
| `resource`    | Canonical shared data with stable identity and runtime snapshots.     |
| `transaction` | Writes with preview, rollback, invalidation, routes, and concurrency. |
| `machine`     | Workflow state and state-owned work.                                  |
| `app`         | Compose domains into one typed app boundary.                          |
| `App.layer`   | Install the runtime around store, orchestrators, and Effect services. |
| `runtime`     | Create the runtime you actually run.                                  |
| `test`        | Prove focused workflow behavior with runtime facts instead of sleeps. |
| `useResource` | Read shared data from React.                                          |
| `use`         | Read and drive a workflow actor from React.                           |

If you learn those well, the rest of the API usually makes sense in context.

You do not need `module` or `app` on day one. Add them when you want
app-level inventory, fixture-backed app tests, duplicate-id validation, or one
assembly point for the runtime layer.
Start with `test(machine).with(...).run()` for focused workflow proofs, and
reach for `test.app(App).scenario(machine)` only when fixtures, resource
ownership, or app inventory are part of the contract.

## Import Paths

This table is the canonical package-layout contract for the docs.

| Import path           | Owns                                                           |
| --------------------- | -------------------------------------------------------------- |
| `@flow-state/core`    | Core builders, keys, tags, runtime creation, shared types.     |
| `@flow-state/react`   | `FlowProvider` and React hooks.                                |
| `@flow-state/testing` | `test`, `flowTest` compatibility, and controlled test helpers. |
| `@flow-state/server`  | Request-scoped runtime helpers and boot types.                 |
| `@flow-state/inspect` | Machine analysis and live runtime inspection helpers.          |

Prefer focused named imports in smaller files:

```ts
import { machine, resource, transaction } from "@flow-state/core";
```

For crowded files, prefer an import-site namespace alias instead of depending
on a package-published `flow` object:

```ts
import * as flowCore from "@flow-state/core";

const editor = flowCore.machine({
  /* ... */
});
```

## Core Builders

| API           | Use for                                                               |
| ------------- | --------------------------------------------------------------------- |
| `createKey`   | Stable resource keys.                                                 |
| `createTag`   | Shared invalidation tags.                                             |
| `resource`    | Canonical shared reads.                                               |
| `transaction` | Typed writes with preview, routes, invalidation, and concurrency.     |
| `machine`     | Workflow state, legal events, guards, updates, and state-owned work.  |
| `view`        | Optional multi-source UI projections.                                 |
| `module`      | Domain manifests with inventory, fixtures, and validation.            |
| `app`         | App composition from modules.                                         |
| `App.layer`   | Runtime installation around store, orchestrators, and Layers.         |
| `runtime`     | Runtime bridge for resources, actors, inspection, and boot hydration. |
| `outcomes`    | Transaction outcome routing.                                          |
| `selectView`  | View selection outside React.                                         |

## Why `module` And `app` Exist

They are not the first APIs every small slice needs. Add them when you want one
app assembly boundary, inventory, fixture-backed app tests, or duplicate-id
validation.

For runnable receipts, current limits, and the concrete payoff behind those
claims, read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## Runtime Wiring And State-Owned Commands

| API                  | Use for                                      |
| -------------------- | -------------------------------------------- |
| `store.memory`       | Live in-memory ResourceStore descriptor.     |
| `store.test`         | Deterministic test ResourceStore descriptor. |
| `orchestrators.live` | Live actor-system descriptor.                |
| `orchestrators.test` | Deterministic actor-system descriptor.       |
| `ensure`             | Required resource dependency for a state.    |
| `observe`            | Active-state subscription to a resource.     |
| `refresh`            | Explicit resource refresh.                   |
| `run`                | Run a transaction from a state.              |
| `patch`              | Patch a resource and record receipts.        |
| `invalidate`         | Mark refs, tags, or filters stale.           |
| `stream`             | State-scoped ongoing values.                 |
| `after`              | One-shot delayed transitions.                |
| `child`              | Parent-owned child actors.                   |
| `can`                | Legal-command checks.                        |

## React

| API            | Use for                                          |
| -------------- | ------------------------------------------------ |
| `FlowProvider` | Runtime boundary for React hooks.                |
| `useResource`  | Provider-backed resource reads.                  |
| `use`          | Provider-backed actor creation and subscription. |
| `useView`      | Explicit view projection in React.               |

## Testing

| API                      | Use for                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `test`                   | Preferred builder for `test(machine).with(...).run()` focused scenarios. |
| `flowTest`               | Narrow migration alias for `flowTest(machine).start()`.                  |
| `runFlowStory`           | Execute default-start or snapshot-start stories in tests.                |
| `storyToTest`            | Turn a story run into a reusable pass/fail report.                       |
| `test.app`               | App-aware harness for resources, fixtures, and scenarios.                |
| `test.model`             | Guard-aware event path generation.                                       |
| `createControlledStream` | Deterministic stream helper for tests.                                   |

## Server And Inspection

| API                       | Use for                                            |
| ------------------------- | -------------------------------------------------- |
| `withRequestRuntime`      | Create and dispose one runtime per server request. |
| `analyzeTrace`            | Machine-aware analysis from a captured trace.      |
| `graphOf`                 | Machine graph descriptors.                         |
| `captureTrace`            | Trace descriptors from snapshots.                  |
| `summarizeTrace`          | Concise incident summaries from captured traces.   |
| `exportTraceArtifact`     | Versioned JSON-friendly trace artifacts.           |
| `importTraceArtifact`     | Validate and rehydrate trace artifacts.            |
| `compressTraceArtifact`   | Gzip a trace artifact for transport or storage.    |
| `decompressTraceArtifact` | Rehydrate a gzipped trace artifact.                |
| `diffTrace`               | Section-by-section comparison of two traces.       |
| `flowStories`             | Story descriptors for inspection and docs.         |
| `storyToDoc`              | Turn a story into a docs-friendly descriptor.      |

## Important Notes

- Runtime creation goes through `runtime(App.layer(...))` so app services
  stay explicit.
- Some surfaces are executable but intentionally narrow. Use
  [Supported Today](/reference/status) when you need exact proof boundaries.
- Historical `query` and `mutation` wording is not part of the current authoring
  surface.
