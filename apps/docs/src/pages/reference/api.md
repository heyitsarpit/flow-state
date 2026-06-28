# API Reference

This is the quick reference for the public Flow State surface. Deeper pages explain semantics and patterns.

## Core

| API                | Use for                                                                                              | Details                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `flow.module`      | Domain manifests.                                                                                    | [Runtime](/reference/runtime)             |
| `flow.resource`    | Canonical shared reads with key, lookup, tags, cache, freshness, placeholder, schema, and snapshots. | [Resources](/reference/resources)         |
| `flow.transaction` | Canonical writes with params, commit, preview, invalidates, routes, and concurrency.                 | [Transactions](/reference/transactions)   |
| `flow.machine`     | Process state, context, guards, updates, invokes, actions, and legal events.                         | [Machines](/reference/machines)           |
| `flow.view`        | Optional read models for significant UI projection across multiple sources.                          | [React And Views](/reference/views-react) |
| `flow.app`         | App module composition and inventory.                                                                | [Runtime](/reference/runtime)             |
| `App.layer`        | Effect Layer composition for Flow services and app services.                                         | [Runtime](/reference/runtime)             |
| `flow.runtime`     | Host runtime bridge with resources and orchestrators.                                                | [Runtime](/reference/runtime)             |

## Store And Orchestrators

| API                       | Use for                                                     | Details                       |
| ------------------------- | ----------------------------------------------------------- | ----------------------------- |
| `flow.store.memory`       | In-memory ResourceStore descriptor for app runtimes.        | [Runtime](/reference/runtime) |
| `flow.store.test`         | Deterministic, seedable ResourceStore descriptor for tests. | [Runtime](/reference/runtime) |
| `flow.orchestrators.live` | App actor-system descriptor for runtime actors.             | [Runtime](/reference/runtime) |
| `flow.orchestrators.test` | Test actor-system descriptor for deterministic scenarios.   | [Runtime](/reference/runtime) |

## Flow Integration

| API               | Use for                                        | Details                                     |
| ----------------- | ---------------------------------------------- | ------------------------------------------- |
| `flow.ensure`     | Process dependency on a resource.              | [Machines](/reference/machines)             |
| `flow.observe`    | Data dependency on a resource.                 | [Machines](/reference/machines)             |
| `flow.refresh`    | Explicit resource refresh.                     | [Machines](/reference/machines)             |
| `flow.run`        | Run a transaction from a state.                | [Transactions](/reference/transactions)     |
| `flow.patch`      | Patch ResourceStore data and record receipts.  | [Transactions](/reference/transactions)     |
| `flow.invalidate` | Mark resources stale by ref, tag, or filter.   | [Transactions](/reference/transactions)     |
| `flow.stream`     | State-scoped Effect streams.                   | [Streams And Time](/reference/streams-time) |
| `flow.after`      | One-shot delayed transitions.                  | [Streams And Time](/reference/streams-time) |
| `flow.child`      | Parent-owned child actors and supervision.     | [Machines](/reference/machines)             |
| `flow.can`        | Legal command checks for snapshots and actors. | [Machines](/reference/machines)             |

## React

| API                | Use for                                                                                    | Details                                   |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `FlowProvider`     | React runtime boundary.                                                                    | [React And Views](/reference/views-react) |
| `flow.useResource` | Read a resource from React.                                                                | [React And Views](/reference/views-react) |
| `flow.use`         | Start or subscribe to a flow actor from React.                                             | [React And Views](/reference/views-react) |
| `flow.useView`     | Read an explicit projection from React when direct resource or actor reads are not enough. | [React And Views](/reference/views-react) |

## Tests

| API                      | Use for                                                     | Details                   |
| ------------------------ | ----------------------------------------------------------- | ------------------------- |
| `flowTest`               | Focused flow scenario tests.                                | [Testing](/guide/testing) |
| `flowTest.app`           | App-level tests with resources, modules, Layers, and flows. | [Testing](/guide/testing) |
| `createControlledEffect` | Deterministic one-shot Effect test handle.                  | [Testing](/guide/testing) |
| `createControlledStream` | Deterministic stream test handle.                           | [Testing](/guide/testing) |

## Runtime Facts

| Fact                     | Where to inspect                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Resource snapshots       | ResourceStore, harness `.cache()` / `.resources()`, full snapshots.                         |
| Transaction snapshots    | Harness `.transactions()`.                                                                  |
| Stream snapshots         | Harness `.streams()` and full snapshots.                                                    |
| Timer snapshots          | Not yet exposed; delayed transitions are currently proved through receipts and actor state. |
| Child actor snapshots    | Actor `.children()` and full snapshots.                                                     |
| Receipts                 | Actor or harness `.receipts()`.                                                             |
| Issues                   | Actor or harness `.issues()`.                                                               |
| Trace and timeline facts | Trace views, receipts, graph/trace helpers.                                                 |
| App and module inventory | `module.inventory()` and `app.inventory()`.                                                 |
