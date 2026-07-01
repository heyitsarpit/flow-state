# API Reference

This page is the shortest useful map of the public Flow State surface.

If the API feels large at first glance, the important thing to know is that you
do not need all of it at once.

## Start Here

Most apps can begin with this small set:

| API                | Why it exists                                                         |
| ------------------ | --------------------------------------------------------------------- |
| `flow.resource`    | Canonical shared data with stable identity and runtime snapshots.     |
| `flow.transaction` | Writes with preview, rollback, invalidation, routes, and concurrency. |
| `flow.machine`     | Workflow state and state-owned work.                                  |
| `flow.app`         | Compose domains into one typed app boundary.                          |
| `App.layer`        | Install the runtime around store, orchestrators, and Effect services. |
| `flow.runtime`     | Create the runtime you actually run.                                  |
| `flow.useResource` | Read shared data from React.                                          |
| `flow.use`         | Read and drive a workflow actor from React.                           |
| `flowTest`         | Prove behavior with runtime facts instead of sleeps.                  |

If you learn those well, the rest of the API usually makes sense in context.

You do not need `flow.module` or `flow.app` on day one. Add them when you want
app-level inventory, fixtures, typed module lookup, or one assembly point for
the runtime layer.

## Import Paths

| Import path           | Owns                                                       |
| --------------------- | ---------------------------------------------------------- |
| `@flow-state/core`    | Core builders, keys, tags, runtime creation, shared types. |
| `@flow-state/react`   | `FlowProvider` and React hooks.                            |
| `@flow-state/testing` | `test`, `flowTest`, and controlled test helpers.           |
| `@flow-state/server`  | Request-scoped runtime helpers and boot types.             |
| `@flow-state/inspect` | Machine analysis and live runtime inspection helpers.      |

## Core Builders

| API                | Use for                                                               |
| ------------------ | --------------------------------------------------------------------- |
| `createKey`        | Stable resource keys.                                                 |
| `createTag`        | Shared invalidation tags.                                             |
| `flow.resource`    | Canonical shared reads.                                               |
| `flow.transaction` | Typed writes with preview, routes, invalidation, and concurrency.     |
| `flow.machine`     | Workflow state, legal events, guards, updates, and state-owned work.  |
| `flow.view`        | Optional multi-source UI projections.                                 |
| `flow.module`      | Domain manifests with inventory, fixtures, and validation.            |
| `flow.app`         | App composition from modules.                                         |
| `App.layer`        | Runtime installation around store, orchestrators, and Layers.         |
| `flow.runtime`     | Runtime bridge for resources, actors, inspection, and boot hydration. |
| `flow.outcomes`    | Transaction outcome routing.                                          |
| `selectView`       | View selection outside React.                                         |

## Why `flow.module` And `flow.app` Exist

They are not just naming ceremony, but they are also not the first APIs every
small slice needs.

Today they already provide:

- app and module inventory
- duplicate-id validation
- fixture registration and `seedModuleFixtures(...)`
- typed `moduleMap` access
- one place to build the runtime layer

If your app does not need any of that yet, they can feel heavier than
`resource` or `machine`. But they are earning concrete behavior in the current
codebase, not just future promise.

For runnable receipts, current limits, and simplification candidates, read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## Runtime Wiring And State-Owned Commands

| API                       | Use for                                      |
| ------------------------- | -------------------------------------------- |
| `flow.store.memory`       | Live in-memory ResourceStore descriptor.     |
| `flow.store.test`         | Deterministic test ResourceStore descriptor. |
| `flow.orchestrators.live` | Live actor-system descriptor.                |
| `flow.orchestrators.test` | Deterministic actor-system descriptor.       |
| `flow.ensure`             | Required resource dependency for a state.    |
| `flow.observe`            | Active-state subscription to a resource.     |
| `flow.refresh`            | Explicit resource refresh.                   |
| `flow.run`                | Run a transaction from a state.              |
| `flow.patch`              | Patch a resource and record receipts.        |
| `flow.invalidate`         | Mark refs, tags, or filters stale.           |
| `flow.stream`             | State-scoped ongoing values.                 |
| `flow.after`              | One-shot delayed transitions.                |
| `flow.child`              | Parent-owned child actors.                   |
| `flow.can`                | Legal-command checks.                        |

## React

| API                | Use for                                          |
| ------------------ | ------------------------------------------------ |
| `FlowProvider`     | Runtime boundary for React hooks.                |
| `flow.useResource` | Provider-backed resource reads.                  |
| `flow.use`         | Provider-backed actor creation and subscription. |
| `flow.useView`     | Explicit view projection in React.               |

## Testing

| API                      | Use for                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `test`                   | Preferred scenario builder for focused machine tests.      |
| `flowTest`               | Narrow migration alias for `flowTest(machine).start()`.    |
| `runFlowStory`           | Execute default-start or snapshot-start stories in tests.  |
| `storyToTest`            | Turn a story run into a reusable pass/fail report.         |
| `test.app`               | App-level harness with resources, fixtures, and scenarios. |
| `test.model`             | Guard-aware event path generation.                         |
| `createControlledStream` | Deterministic stream helper for tests.                     |

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

- The current package split uses five real packages: `@flow-state/core`,
  `@flow-state/react`, `@flow-state/testing`, `@flow-state/server`, and
  `@flow-state/inspect`.
- Runtime creation goes through `flow.runtime(App.layer(...))` so app services
  stay explicit.
- Some surfaces are executable but intentionally narrow. Use
  [Supported Today](/reference/status) when you need exact proof boundaries.
- Historical `query` and `mutation` wording is not part of the current authoring
  surface.
