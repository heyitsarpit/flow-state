# Library API vNext

Status: quick reference draft.

This page is the short map of the vNext API. It lists the intended public
functions and what each one is for. The deeper pages explain semantics,
lifecycles, Effect integration, and testing.

## Mental Model

```txt
Resources model what the app knows.
Flows model what the app is doing.
Views model what the user sees.
```

The app runtime has sibling services:

```txt
FlowRuntime
  ResourceStore       shared app data
  OrchestratorSystem  actors and flow state
  Trace               correlated receipts and timelines
  Clock/Scheduler     time, timers, retries, refresh
  App services        user APIs, storage, auth, config
```

The ownership rule:

| Layer          | Owns                                               | Example                                  |
| -------------- | -------------------------------------------------- | ---------------------------------------- |
| ResourceStore  | Canonical data, freshness, invalidation, patches.  | `Project.byId("p1")`, `Project.comments` |
| Orchestrators  | Process state, drafts, legal events, cancellation. | `editing`, `saving`, `conflict`          |
| Views          | Pure projections for rendering.                    | `Project.editorView`                     |
| Effect runtime | Services, Layers, scopes, fibers, streams, clocks. | `ProjectApi`, `Clock`, `Stream`          |

If data is shared by multiple components or flows, put it in a resource. If it
represents a workflow decision, put it in flow context. If it only shapes UI,
put it in a view.

## Core Authoring API

| Function        | Use for                         | Description                                                                                  |
| --------------- | ------------------------------- | -------------------------------------------------------------------------------------------- |
| `flow.module`   | Domain grouping.                | Defines a named domain module that returns resources, mutations, machines, and views.        |
| `flow.resource` | Canonical reads.                | Defines an Effect-backed shared resource with key, lookup, cache, freshness, and tags.       |
| `flow.mutation` | Canonical writes.               | Defines an Effect-backed write transaction with input, optimistic patch, and invalidations.  |
| `flow.machine`  | Explicit flows.                 | Defines process state, legal events, guards, updates, invokes, and lifecycle descriptors.    |
| `flow.view`     | Render projections.             | Defines a pure projection from resource snapshots plus flow snapshots to UI-ready data.      |
| `flow.app`      | App assembly.                   | Defines the app module set and produces app Layers for live/test runtimes.                   |
| `App.layer`     | Runtime dependency composition. | Builds an Effect Layer containing Flow services plus user services.                          |
| `flow.runtime`  | Host bridge.                    | Creates a runtime handle from a Layer, backed by Effect `ManagedRuntime`.                    |
| `flowTest`      | Flow testing.                   | Starts focused flow tests and app-runtime tests while leaving assertions to the test runner. |

## Resource API

| Function / field           | Use for                | Description                                                                           |
| -------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `key`                      | Resource identity.     | Computes a stable key from resource arguments.                                        |
| `lookup`                   | Loading data.          | Effect program that produces resource data or typed failure.                          |
| `tags`                     | Group invalidation.    | Labels resource entries for mutation invalidation and devtools grouping.              |
| `cache.capacity`           | Cache bounds.          | Maximum number of entries, aligned with Effect `Cache` language.                      |
| `cache.timeToLive`         | Expiration.            | How long cached exits remain reusable.                                                |
| `freshness.staleAfter`     | UI freshness.          | Marks data stale while preserving currently available data.                           |
| `freshness.refresh`        | Active refresh.        | Uses Effect `Schedule` to refresh while observed.                                     |
| `freshness.onInvalidate`   | Invalidation behavior. | Controls whether invalidation starts active refresh.                                  |
| `placeholder`              | Placeholder data.      | Provides renderable non-canonical data while lookup runs.                             |
| `schema`                   | Decode/docs boundary.  | Optional Effect `Schema` for data crossing I/O, persistence, or docs.                 |
| `ResourceSnapshot`         | Runtime fact.          | Multi-axis snapshot: availability, activity, freshness, timestamps, placeholder flag. |
| `ResourceStore.get`        | Snapshot read.         | Reads the current snapshot for a resource ref.                                        |
| `ResourceStore.ensure`     | Blocking availability. | Runs or joins lookup and succeeds only when data is available.                        |
| `ResourceStore.refresh`    | Refetch.               | Starts a new lookup without implying a semantic flow transition.                      |
| `ResourceStore.invalidate` | Mark stale.            | Invalidates a ref, tag, or filter and records receipts.                               |
| `ResourceStore.patch`      | Direct cache update.   | Applies a patch to currently available data.                                          |
| `ResourceStore.subscribe`  | Observation.           | Subscribes components, flows, tests, and devtools to resource snapshots.              |

## Mutation API

| Function / field  | Use for                 | Description                                                                 |
| ----------------- | ----------------------- | --------------------------------------------------------------------------- |
| `input`           | Mutation variables.     | Optional Effect `Schema` for accepted input.                                |
| `run`             | Write operation.        | Effect program that performs the write.                                     |
| `optimistic`      | Fast UI.                | Applies an optimistic ResourceStore patch inside the mutation transaction.  |
| `invalidates`     | Cache coherence.        | Returns refs, tags, or filters to invalidate after success.                 |
| `concurrency`     | Overlap policy.         | `reject-while-running`, `serialize`, `cancel-previous`, or `allow`.         |
| `flow.run`        | Flow-side execution.    | Runs a mutation from a state as a traceable transaction.                    |
| `flow.patch`      | Flow-side cache patch.  | Patches a resource and records receipts.                                    |
| `flow.invalidate` | Flow-side invalidation. | Invalidates resources and wakes observers.                                  |
| `transactions()`  | Test/runtime facts.     | Exposes mutation transaction status, inputs, exits, rollback, and receipts. |

Final examples should teach `flow.mutation(...)` for definition and
`flow.run(Project.save, ...)` for flow execution. Older submit-style helpers may
exist as migration sugar, but they are not the primary vNext mental model.

## Machine API

| Function / field | Use for               | Description                                                                          |
| ---------------- | --------------------- | ------------------------------------------------------------------------------------ |
| `input`          | Start parameters.     | Route/props/runtime input separate from persistent process context.                  |
| `context`        | Process state.        | Drafts, selections, local decisions, conflict choices, retry state, child summaries. |
| `initial`        | Start state.          | Initial state node.                                                                  |
| `states`         | Flow graph.           | Named process states.                                                                |
| `on`             | Event transitions.    | Legal event handlers for a state or the whole machine.                               |
| `target`         | Transition target.    | Moves to another process state.                                                      |
| `guard`          | Branch condition.     | Pure predicate that enables or disables a transition.                                |
| `update`         | Context reducer.      | Pure reducer that returns process context changes.                                   |
| `actions`        | Synchronous receipts. | Local synchronous side effects or trace receipts inside a transition.                |
| `invoke`         | State-owned work.     | Runs resources, mutations, streams, timers, children, or Effects scoped to a state.  |
| `entry` / `exit` | Lifecycle actions.    | Synchronous setup/cleanup receipts around state entry and exit.                      |
| `always`         | Eventless routing.    | Deterministic routing after state entry or context update.                           |
| `after`          | One-shot timers.      | Delayed transitions backed by Effect `Clock` / `TestClock`.                          |
| `type`           | State kind.           | Atomic, compound, parallel, final, or history semantics.                             |
| `tags`           | State labels.         | Rendering, devtools, and test metadata.                                              |
| `meta`           | Docs/devtools data.   | Non-runtime annotations.                                                             |

Keep updates pure. Do not teach mutating context callbacks as the primary API.

## Integration Primitives

| Function          | Use for               | Description                                                                    |
| ----------------- | --------------------- | ------------------------------------------------------------------------------ |
| `flow.ensure`     | Process dependency.   | Blocks flow progress until a resource has data or typed failure.               |
| `flow.observe`    | Data dependency.      | Attaches latest resource snapshot to the active state without forcing routing. |
| `flow.refresh`    | Refetch trigger.      | Starts refresh without changing semantic state unless the flow chooses to.     |
| `flow.run`        | Mutation transaction. | Runs a mutation or named transaction from a state.                             |
| `flow.patch`      | Cache patch.          | Updates a resource snapshot directly and records receipts.                     |
| `flow.invalidate` | Staleness.            | Marks resources stale by ref, tag, or filter.                                  |
| `flow.stream`     | Ongoing state work.   | Runs an Effect `Stream` while a state is active.                               |
| `flow.after`      | One-shot delay.       | Schedules a delayed transition in the state scope.                             |
| `flow.child`      | Child flow.           | Starts child actors/flows with supervision and snapshot visibility.            |

The essential distinction:

```txt
ensure = process dependency
observe = data dependency
```

## Stream And Time API

| Function / field   | Use for               | Description                                                          |
| ------------------ | --------------------- | -------------------------------------------------------------------- |
| `flow.stream`      | State-scoped streams. | Runs a `Stream.Stream<A, E, R>` and maps values/exits into events.   |
| `input`            | Stream input.         | Derives stream parameters from flow input/context.                   |
| `stream`           | Source.               | Returns an Effect `Stream`; adapters can convert async iterables.    |
| `pressure`         | Backpressure.         | `suspend`, `dropping`, `sliding`, `unbounded`, or `sample`.          |
| `routes.value`     | Value events.         | Maps stream values into flow events.                                 |
| `routes.done`      | Completion.           | Maps normal stream completion into an event.                         |
| `routes.failure`   | Typed failures.       | Maps expected stream failures into events.                           |
| `routes.defect`    | Defects.              | Maps unexpected defects into events or issues.                       |
| `routes.interrupt` | Cancellation.         | Maps interruption when product semantics need it.                    |
| `flow.after`       | Delayed transition.   | One-shot timer; use `Schedule` for repeat, retry, polling, sampling. |
| `Schedule`         | Repetition policy.    | Imported from `effect`, not re-created by Flow.                      |
| `Duration.Input`   | Duration shape.       | Human strings and Effect duration inputs.                            |
| `TestClock`        | Deterministic time.   | Test-time control for sleeps, timers, schedules, and refresh.        |

## View And React API

| Function           | Use for               | Description                                                        |
| ------------------ | --------------------- | ------------------------------------------------------------------ |
| `flow.view`        | Projection.           | Defines a pure selector from flow snapshot and resource snapshots. |
| `flow.useResource` | Resource rendering.   | Reads a resource ref directly from React.                          |
| `flow.use`         | Flow rendering.       | Starts or subscribes to a flow actor from React.                   |
| `flow.useView`     | View rendering.       | Reads a named view projection.                                     |
| `flow.can`         | Legal commands.       | Checks whether an event is legal for a snapshot or actor.          |
| `match` helpers    | Rendering ergonomics. | Optional adapters over snapshots; not the source of runtime truth. |
| `FlowProvider`     | Runtime provider.     | Installs the app runtime/Layer for React components.               |

Components can use either side. A breadcrumb can read `Project.byId(projectId)`
without starting `Project.editor`. A workflow screen can start `Project.editor`
and render the resources that flow observes.

## App Runtime API

| Function / service           | Use for                   | Description                                                               |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------- |
| `flow.app`                   | App definition.           | Registers domain modules and creates app layer helpers.                   |
| `App.layer`                  | Live/test composition.    | Produces an Effect `Layer` with Flow services and user services.          |
| `flow.store.memory`          | Production ResourceStore. | In-memory resource store with GC, traces, and subscriptions.              |
| `flow.store.test`            | Deterministic store.      | Seedable ResourceStore for tests.                                         |
| `flow.orchestrators.live`    | Production actors.        | Live OrchestratorSystem.                                                  |
| `flow.orchestrators.test`    | Test actors.              | Deterministic OrchestratorSystem for scenario tests.                      |
| `flow.runtime`               | Runtime handle.           | Creates a FlowRuntime from a Layer.                                       |
| `FlowRuntime.runPromise`     | Host bridge.              | Runs an Effect through the managed runtime.                               |
| `FlowRuntime.runPromiseExit` | Exit-preserving bridge.   | Runs an Effect and preserves typed failure/defect/interruption as `Exit`. |
| `FlowRuntime.dispose`        | Cleanup.                  | Interrupts runtime-owned actors, resources, timers, streams, and scopes.  |
| `ResourceStore`              | Shared memory service.    | Cache entries, snapshots, invalidation, optimistic transactions.          |
| `OrchestratorSystem`         | Process service.          | Actors, transitions, snapshots, subscriptions, state-scoped work.         |
| `Trace`                      | Timeline service.         | Resource, mutation, flow, timer, stream, and Effect span correlation.     |

Flow helpers should wrap real Effect `Layer`s. Do not invent a parallel
dependency injection model.

## Test API

| Function / probe         | Use for                | Description                                                                 |
| ------------------------ | ---------------------- | --------------------------------------------------------------------------- |
| `flowTest(flow)`         | Focused flow test.     | Starts a machine/flow harness.                                              |
| `flowTest.app(App)`      | App-runtime test.      | Target shape for tests involving resources plus flows.                      |
| `.provide(layer)`        | Dependencies.          | Provides live/test/mock Effect Layers.                                      |
| `.start(input)`          | Start actor.           | Starts a flow with input.                                                   |
| `.send(event)`           | Drive scenario.        | Sends an event and returns the harness for transcript-style tests.          |
| `.flush()`               | Drain ready work.      | Runs work already ready; does not advance time or wait for open Deferreds.  |
| `.settle(bounds)`        | Bounded quiescence.    | Target helper for bounded draining across events, effects, timers, streams. |
| `.advance(duration)`     | Virtual time.          | Target helper backed by Effect `TestClock`.                                 |
| `.state()`               | Current state.         | Returns current flow state.                                                 |
| `.context()`             | Process context.       | Returns current process context.                                            |
| `.snapshot()`            | Full snapshot.         | Returns flow snapshot with resources, mutations, streams, timers, issues.   |
| `.can(event)`            | Legal event check.     | Checks whether the event can be accepted.                                   |
| `.resources()`           | Resource facts.        | Inspects observed resource snapshots.                                       |
| `.mutations()`           | Mutation facts.        | Inspects mutation snapshots.                                                |
| `.transactions()`        | Transaction facts.     | Inspects vNext mutation transaction history.                                |
| `.streams()`             | Stream facts.          | Inspects stream status and emissions.                                       |
| `.timers()`              | Timer facts.           | Inspects scheduled/fired timers.                                            |
| `.receipts()`            | Trace facts.           | Inspects semantic receipts.                                                 |
| `.issues()`              | Failure facts.         | Inspects typed failures, defects, and interruptions.                        |
| `.trace()`               | Timeline facts.        | Inspects correlated runtime timeline.                                       |
| `createControlledEffect` | One-shot test control. | Deferred-backed success/failure/defect/interrupt handle.                    |
| `createControlledStream` | Stream test control.   | Queue/PubSub-backed value/failure/defect/done/interrupt handle.             |

Flow does not own assertion helpers. Use `expect(...)`, `assert(...)`, or
`@effect/vitest` assertions against harness facts.

## Effect Names Flow Should Not Replace

Import these from `effect` directly:

| Effect name           | Use for                                    |
| --------------------- | ------------------------------------------ |
| `Effect`              | Programs, typed success/failure/R.         |
| `Layer`               | Dependency composition.                    |
| `Context.Service`     | User and runtime services.                 |
| `ManagedRuntime`      | Host bridge for running Effects.           |
| `Stream`              | Ongoing values and async sources.          |
| `Schedule`            | Retry, repeat, polling, sampling.          |
| `Duration.Input`      | Duration values.                           |
| `Clock` / `TestClock` | Time and deterministic tests.              |
| `Exit` / `Cause`      | Success, typed failure, defect, interrupt. |
| `Schema`              | Decoding, validation, docs, persistence.   |
| `Option`              | Internal absence.                          |
| `Result`              | Pure sync validation.                      |
| `Redacted`            | Sensitive values.                          |
| `Queue` / `PubSub`    | Stream/test sources and pressure.          |
| `Cache`               | Lookup cache internals where useful.       |
| `RequestResolver`     | Batching/data-source internals.            |
