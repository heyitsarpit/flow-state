# Patterns

These patterns keep Flow State applications readable and testable.

## Domain Modeling

Prefer schema-backed domain values and typed failures at I/O boundaries.

```ts
export type LaunchProjectId = string & Brand.Brand<"LaunchProjectId">;
export const LaunchProjectId = Brand.nominal<LaunchProjectId>();

export const LaunchProjectSchema = Schema.Struct({
  id: Schema.String.pipe(Schema.brand("LaunchProjectId")),
  name: Schema.String,
  summary: Schema.String,
  launchDate: Schema.String,
  version: Schema.Number,
  updatedAt: Schema.Number,
});

export class ProjectConflict extends Schema.TaggedErrorClass<ProjectConflict>()("ProjectConflict", {
  serverVersion: Schema.Number,
  serverProject: LaunchProjectSchema,
}) {}
```

| Prefer                                                | Avoid                                                     |
| ----------------------------------------------------- | --------------------------------------------------------- |
| Branded IDs for cross-boundary identifiers.           | Plain strings that can be mixed accidentally.             |
| `Schema.TaggedErrorClass` for typed failures.         | Throwing generic `Error` for expected domain outcomes.    |
| `Redacted` and schema redaction for sensitive fields. | Ad hoc string masking in UI components.                   |
| `Option` for absence in Flow/Effect code.             | Loose nullable values with unclear ownership.             |
| `Result` for pure synchronous validation.             | Running an Effect only to trim or validate a local draft. |

## Services

Keep platform and product effects behind Effect services.

| Prefer                                              | Avoid                                               |
| --------------------------------------------------- | --------------------------------------------------- |
| `Context.Service` classes.                          | Custom dependency injection containers.             |
| `Effect.fn("Name")` for observable service methods. | Anonymous async functions hidden in descriptors.    |
| `Clock.currentTimeMillis` or `DateTime.now`.        | Ambient wall-clock reads inside services and tests. |
| `Layer.succeed`, `Layer.mergeAll`, `Layer.provide`. | Test-only globals or monkey patches.                |
| Service methods returning `Effect` and `Stream`.    | Promises or callbacks in machine transition code.   |

## Resources

Use resources for canonical app data.

```ts
export const readinessResource = flow.resource({
  id: "launch.readiness",
  key: (id) => createKey("launch", "readiness", id),
  lookup: () => Effect.succeed(readinessFixture),
  tags: () => [readinessTag],
  freshness: { staleAfter: "15 seconds", onInvalidate: "active" },
});
```

| Prefer                                           | Avoid                                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| Stable `key` functions built from domain IDs.    | Per-render object identity as a resource key.         |
| `lookup` for Effect-backed reads.                | Hidden fetches in views or React components.          |
| `tags` for invalidation groups.                  | Repeating lists of concrete resource refs everywhere. |
| `placeholder` for non-canonical renderable data. | Pretending placeholder data is fresh canonical data.  |

## Transactions

Use transactions for writes that need receipts, preview, rollback, invalidation, or concurrency.

| Prefer                                            | Avoid                                                   |
| ------------------------------------------------- | ------------------------------------------------------- |
| `params` for variables.                           | Legacy variable names in new examples.                  |
| `commit` for the write Effect.                    | Calling services directly from transition reducers.     |
| `preview` for rollbackable ResourceStore patches. | Updating canonical data in flow context.                |
| `invalidates` for resource coherence.             | Manual refresh buttons as the only coherence mechanism. |

Flow can roll back Flow-owned preview patches. It cannot undo a remote server write that already committed.

## Machines

Machines own process state and legal events.

| Prefer                                              | Avoid                                           |
| --------------------------------------------------- | ----------------------------------------------- |
| Bare `guard` predicates.                            | Guard wrapper APIs unless metadata is required. |
| Pure `update` reducers.                             | Mutating context in place.                      |
| `actions` for synchronous transition-side receipts. | Async work in `actions`.                        |
| `flow.ensure` for process dependencies.             | Advancing a state before required data exists.  |
| `flow.observe` for visible data dependencies.       | Copying resource snapshots into context.        |

## React And Views

Default to direct React reads. Use `flow.useResource` for shared data, `flow.use` for workflow actors, and `flow.can` for command availability. Add `flow.view` only when a screen needs a reusable projection that combines or significantly transforms multiple runtime sources.

| Prefer                                                                                   | Avoid                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `flow.useResource` for resource-only UI like breadcrumbs.                                | Starting a flow when the UI only needs shared data.                                        |
| `flow.use` for workflow screens.                                                         | React owning workflow effects in `useEffect`.                                              |
| `flow.can` for button enablement.                                                        | Duplicating guards in components.                                                          |
| `flow.view` for cross-source projections such as overview dashboards or trace summaries. | Adding a view for simple labels already available from one resource or one actor snapshot. |

## Tests

Use app-level tests when ResourceStore is part of the behavior. Use focused flow tests when it is not.

| Prefer                                                                           | Avoid                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `flowTest.app(App).seedResources(...)`.                                          | Hand-wiring cache state into machine context.             |
| `.provide(layer)` with real Effect Layers.                                       | Bypassing services in flow tests.                         |
| `.flush()` for ready work.                                                       | Random sleeps.                                            |
| Host test runner assertions over harness facts.                                  | Flow-owned `.expect*` helper APIs.                        |
| Direct Effect service tests for schema, redaction, batching, and typed failures. | Forcing every service behavior through a screen scenario. |
