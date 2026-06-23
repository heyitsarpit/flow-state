# Library API

Status: implementation guide.

This page lists the client/runtime API shape without TypeScript interface declarations. The point is to keep the intended surface visible while each export gets implementation status, runtime semantics, and open questions.

## Product Shape

Flow State is a machine-first frontend runtime built on Effect.

The user should think in:

- states
- events
- context
- invoked Effects
- cached queries
- mutations
- streams
- snapshots
- tests

The public API surface may be stubbed before it is implemented. Stubs should teach the intended mental model, but they must not pretend semantics are settled.

## Implementation Status Labels

| Status     | Meaning                                                                     | Required docs                                          |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `ready`    | First implementation can start once the example calls it.                   | Function, input, output, properties, semantics, tests. |
| `stub`     | Export or docs can exist, but runtime behavior is intentionally incomplete. | Intended behavior, stub behavior, missing semantics.   |
| `research` | We need deeper XState, Effect, or TanStack study before implementation.     | Research target and decision needed.                   |
| `adapter`  | Useful bridge or interop surface, not the core runtime architecture.        | Boundary, ownership, and dependency rules.             |

## Packages

| Package                | Exports                                              | Why we need it                                 |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------- |
| `@flow-state/core`     | runtime, machine API, Effect boundaries, cache model | Framework-independent engine.                  |
| `@flow-state/react`    | provider, hooks, selectors                           | React rendering and event sending.             |
| `@flow-state/test`     | harness, fake runtime, controlled Effects/Streams    | First-class testing and examples.              |
| `@flow-state/devtools` | trace/devtools UI                                    | Stubbed package once trace receipts stabilize. |

## Core Runtime

| Function        | Input                                              | Output                | Key properties                           | Why we need it                                                        |
| --------------- | -------------------------------------------------- | --------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `createRuntime` | Effect layer, cache options, clock/tracing options | runtime handle        | services, cache, clock, trace, dispose   | One app-level place to run Effect programs and own runtime services.  |
| `createModule`  | module name and factory                            | grouped module object | machines, keys, tags, mutations, streams | Keeps feature APIs together without creating global soup. Stub first. |
| `createKey`     | serializable key parts                             | cache key             | deterministic, comparable, filterable    | Queries and invalidation need stable identity.                        |
| `createTag`     | tag name                                           | invalidation tag      | human-readable, groupable                | Mutations need to invalidate groups of cache entries.                 |

Open decision: these may become `flow.runtime`, `flow.module`, `flow.key`, and `flow.tag` instead of top-level exports.

## Flow Namespace

| Function        | Input                                                                   | Output                     | Key properties                                            | Why we need it                                                   |
| --------------- | ----------------------------------------------------------------------- | -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `flow.machine`  | machine config                                                          | machine definition         | states, events, context, invokes, graph metadata          | Main product primitive. Models legal UI/workflow states.         |
| `flow.effect`   | Effect factory and success/failure transitions                          | invoked work definition    | typed success, typed failure, defect path, cancellation   | Runs non-cached external work at state boundaries.               |
| `flow.query`    | cache key, Effect factory, cache policy, transitions                    | cached invoke definition   | key, stale/keep policy, dedupe, invalidation behavior     | Machine-owned read/cache semantics.                              |
| `flow.mutation` | input factory, Effect factory, invalidation, optional optimistic policy | mutation invoke definition | variables, rollback context, mutation scope, invalidation | Machine-owned write semantics.                                   |
| `flow.stream`   | Stream factory and value/failure mapping                                | stream invoke definition   | scoped subscription, value events, cleanup                | Websocket/SSE/upload/agent progress support.                     |
| `flow.assign`   | context update mapping                                                  | assignment wrapper         | optional metadata/compatibility                           | Escape hatch when an update needs to be named or wrapped.        |
| `flow.guard`    | predicate                                                               | guard wrapper              | optional metadata/compatibility                           | Escape hatch when a guard needs to be named or wrapped.          |
| `flow.action`   | synchronous action                                                      | action definition          | entry/exit/transition side effect                         | For local state-adjacent work inside the transition transaction. |
| `flow.input`    | input description/schema                                                | input marker               | typed machine start input                                 | Keeps route/props/input separate from context.                   |
| `flow.schema`   | Effect Schema or schema-like validator                                  | schema marker              | validation, decode, docs metadata                         | Runtime validation and future persistence.                       |
| `flow.option`   | value/schema                                                            | optional field marker      | present/absent value                                      | Avoids loose nullable context fields.                            |
| `flow.match`    | snapshot and state handlers                                             | matched render result      | exhaustive rendering                                      | Helps React render by state, not by boolean soup.                |
| `flow.can`      | snapshot/actor and event                                                | boolean                    | legal-event check                                         | Powers buttons, commands, and permission-like UI.                |

## Planned Flow Helpers

| Function         | Input                           | Output                  | Key properties                       | Why it may exist                                                      |
| ---------------- | ------------------------------- | ----------------------- | ------------------------------------ | --------------------------------------------------------------------- |
| `flow.child`     | child machine/actor config      | child invoke definition | lifecycle, parent/child events       | Actor composition. Stub until supervision semantics are chosen.       |
| `flow.raise`     | internal event                  | raised event action     | internal queue, trace receipt        | Internal decomposition. Runtime queue exists before public helper.    |
| `flow.after`     | duration or schedule and target | delayed transition      | Clock/TestClock support              | Timeouts, debounce, auto-dismiss, retry.                              |
| `flow.view`      | multiple sources and projection | renderable view model   | source snapshots, priority, commands | Multi-actor rendering. Stub until selector and priority rules settle. |
| `flow.viewState` | state name and payload          | view state              | render union state                   | Helper for `flow.view`.                                               |

## Effect Bridge

| Function           | Input                            | Output                      | Key properties                             | Why we need it                                  |
| ------------------ | -------------------------------- | --------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `fromEffectResult` | Effect factory and runtime/layer | actor/invoke adapter        | success/failure as data, defects separate  | Bridge primitive and implementation reference.  |
| `fromEffectStream` | Stream factory and runtime/layer | stream actor/invoke adapter | scoped stream, cancellation, value mapping | Stream interop and later XState bridge support. |

Open decision: these may stay public for XState users as adapter utilities, but they must not define core runtime semantics.

## Sync Kernel And Effect Work

Flow State should be Effect-native, not sync-first. The distinction is where asynchrony is allowed.

| Layer             | What happens there                                                                               | Why it matters                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Transition kernel | Select transition, evaluate guards, apply assignments, compute exit/entry sets, enqueue invokes. | Must be deterministic, atomic, and testable. No snapshot should leak halfway through.                           |
| Effect work       | `flow.effect`, `flow.query`, `flow.mutation`, `flow.stream`, timers, child actors.               | Runs in scopes/fibers with typed success, typed failure, defects, interruption, cleanup, and TestClock control. |
| Actions           | Synchronous transition receipts or local side effects.                                           | Async actions would secretly become invokes without lifecycle, cancellation, or result routing.                 |

Why `flow.action` is sync-only:

- If the runtime waits for an async action, it blocks run-to-completion and makes event ordering unstable.
- If the runtime forks an async action, it has created an invoke without the name, scope, result event, cleanup, or test handle.
- Effect should still be the default abstraction for external work, but it should enter through named async primitives where lifecycle is explicit.

Async workflow work belongs in `flow.effect`, `flow.query`, `flow.mutation`, `flow.stream`, `flow.after`, or `flow.child`. `flow.action` is additional, not the main async path.

## Machine Config Properties

| Property  | Input                    | Output/meaning            | Why we need it                    |
| --------- | ------------------------ | ------------------------- | --------------------------------- |
| `name`    | string                   | machine identity          | Trace, debugging, docs.           |
| `input`   | schema or input marker   | machine start input       | Route/props/runtime input.        |
| `context` | context factory or shape | machine context           | Data carried by workflow.         |
| `initial` | state name/path          | initial active state      | Start point.                      |
| `states`  | state map                | state tree                | Legal workflow modes.             |
| `on`      | event map                | top-level transitions     | Shared/global event handling.     |
| `test`    | metadata/invariants      | test metadata             | Semantic coverage and invariants. |
| `version` | number                   | machine version           | Future snapshot migration.        |
| `migrate` | migration map            | migrated snapshot/context | Later persistence support.        |

## State Config Properties

| Property | Input                                         | Output/meaning         | Why we need it                           |
| -------- | --------------------------------------------- | ---------------------- | ---------------------------------------- |
| `entry`  | action list                                   | runs on state entry    | Setup, trace, telemetry.                 |
| `exit`   | action list                                   | runs on state exit     | Cleanup and receipts.                    |
| `on`     | event map                                     | event transitions      | Main workflow behavior.                  |
| `invoke` | effect/query/mutation/stream/child            | state-boundary work    | Core Effect integration.                 |
| `always` | transition or transition list                 | eventless transition   | Derived routing and validation branches. |
| `after`  | duration/schedule transitions                 | delayed transition     | Time-based workflows.                    |
| `states` | child state map                               | nested state tree      | Compound states.                         |
| `type`   | atomic/compound/parallel/final/history marker | state node kind        | Statechart semantics.                    |
| `tags`   | string list                                   | state labels           | Rendering, tests, devtools.              |
| `meta`   | structured metadata                           | docs/devtools metadata | Non-runtime annotations.                 |

## Transition Properties

| Property      | Input                    | Output/meaning              | Why we need it                   |
| ------------- | ------------------------ | --------------------------- | -------------------------------- |
| `target`      | state name/path          | next state                  | Moves workflow.                  |
| `guard`       | predicate or named guard | enabled/disabled transition | Branching and safety.            |
| `update`      | context reducer          | new context                 | Default pure state update slot.  |
| `actions`     | action list              | side effects/receipts       | Transition side effects.         |
| `raise`       | internal event           | queued internal event       | Optional internal decomposition. |
| `description` | text                     | docs/test label             | Human/AI understanding.          |

## Query Properties

| Property    | Input                                                    | Output/meaning     | Why we need it                    |
| ----------- | -------------------------------------------------------- | ------------------ | --------------------------------- |
| `key`       | context/input to key                                     | cache identity     | Dedupe and invalidation.          |
| `effect`    | context/input to Effect                                  | read operation     | Typed data fetching.              |
| `cache`     | stale/keep/dedupe policy                                 | lifecycle rules    | Query behavior.                   |
| `policy`    | cache-first/network-first/refetch/stale-while-revalidate | fetch strategy     | Explicit cache behavior.          |
| `onSuccess` | transition/assignment                                    | success path       | Machine-owned data routing.       |
| `onFailure` | transition/assignment                                    | typed failure path | Expected errors stay visible.     |
| `onDefect`  | transition/reporting policy                              | defect path        | Unexpected defects stay separate. |

Implementation rule:

- Queries are cache-owned and state-observed.
- Entering a state attaches an observer to the query.
- Exiting the state detaches that observer.
- Cache work may continue after detach according to cache policy.
- A late query completion may update cache, but it must not transition an inactive invoke generation.

## Mutation Properties

| Property      | Input                       | Output/meaning                  | Why we need it                 |
| ------------- | --------------------------- | ------------------------------- | ------------------------------ |
| `input`       | context/event to variables  | mutation variables              | Captures submitted data.       |
| `effect`      | variables to Effect         | write operation                 | Typed write side effect.       |
| `optimistic`  | transaction callbacks       | optimistic cache/context update | Fast UI with rollback.         |
| `invalidates` | keys/tags/predicate         | invalidation plan               | Keeps reads coherent.          |
| `scope`       | mutation scope/key          | concurrency policy              | Avoids overlapping write bugs. |
| `onSuccess`   | transition/assignment       | success path                    | Workflow continuation.         |
| `onFailure`   | transition/assignment       | typed failure path              | Conflict/retry/error flows.    |
| `onDefect`    | transition/reporting policy | defect path                     | Unexpected runtime failures.   |

Implementation rule:

- Mutations are event-triggered actor work, not automatic state-entry work by default.
- A mutation belongs to an actor generation and must route success/failure only if still relevant.
- Concurrency policy must be explicit: serialize, reject while running, cancel previous, or last-write-wins.
- Optimistic updates remain in the surface, but stub behavior may initially record the intended transaction without applying rollback.

## Stream Properties

| Property    | Input                   | Output/meaning       | Why we need it                  |
| ----------- | ----------------------- | -------------------- | ------------------------------- |
| `stream`    | context/input to Stream | pushed values        | Live data source.               |
| `map`       | stream value to event   | event mapping        | Integrates stream into machine. |
| `onValue`   | transition/action       | value handling       | Progress/live updates.          |
| `onFailure` | transition/action       | typed stream failure | Expected stream errors.         |
| `onDone`    | transition/action       | stream completion    | Completion workflows.           |

Implementation rule:

- Streams are state-scoped unless explicitly detached.
- State exit interrupts the stream fiber and records cleanup.
- Stream values enqueue mapped events or receipts.
- The implementation must define pressure policy before high-frequency streams: queue all, coalesce by key, sample, or drop with diagnostics.

## Runtime State Shapes

| Shape           | Key properties                                                            | Why we need it                        |
| --------------- | ------------------------------------------------------------------------- | ------------------------------------- |
| `EffectResult`  | success value or typed failure error                                      | Keeps expected failures as data.      |
| `ResourceState` | data status, fetch status, timestamps, stale flag, failure count          | Query lifecycle without boolean soup. |
| `MutationState` | idle/running/success/failure, variables, submitted time, rollback context | Mutation lifecycle and testing.       |
| `StreamState`   | idle/running/latest/failure/done                                          | Subscription lifecycle.               |
| `FlowSnapshot`  | state, context, status, tags, resources, mutations, active invokes        | Render/test/devtools unit.            |

## React API

| Function/component | Input                           | Output                     | Key properties                    | Why we need it                               |
| ------------------ | ------------------------------- | -------------------------- | --------------------------------- | -------------------------------------------- |
| `FlowProvider`     | runtime and children            | React provider             | runtime context                   | Hooks need access to runtime.                |
| `useFlow`          | machine and input/options       | snapshot, send, can, actor | state rendering and event sending | Main React integration.                      |
| `useSelector`      | actor/runtime/view and selector | selected value             | equality, stability               | Avoids unnecessary renders.                  |
| `useView`          | view projection                 | view snapshot              | multi-source rendering            | Later support for multiple actors/resources. |
| `useActorRef`      | machine/options                 | actor ref                  | stable actor identity             | Advanced integration and imperative edges.   |

## Implementation Map

| Surface                     | Status     | Stub behavior                                                 | First real implementation proof                                 |
| --------------------------- | ---------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `flow.machine`              | `ready`    | Validate config shape and expose graph metadata.              | Project Editor can start, send events, and expose snapshots.    |
| `flow.effect`               | `ready`    | Record planned invoke lifecycle.                              | Success, typed failure, defect, and interruption tests pass.    |
| `flow.query`                | `ready`    | Record key/effect/cache policy and planned observer.          | Cache hit/stale/fetch/failure and late completion tests pass.   |
| `flow.mutation`             | `ready`    | Record variables/effect/invalidation and planned concurrency. | Save success/failure/invalidation tests pass.                   |
| `flow.stream`               | `stub`     | Record stream mapping and pressure policy placeholder.        | Upload or agent-progress example proves cleanup and coalescing. |
| `flow.after`                | `stub`     | Record delayed transition metadata.                           | TestClock can advance timeout without real waiting.             |
| `flow.child`                | `stub`     | Record child machine relationship.                            | Parent/child lifecycle and snapshot tests pass.                 |
| `flow.view`                 | `stub`     | Record projection inputs and selected output.                 | Multi-actor view example proves selector priority and batching. |
| history/parallel states     | `research` | Compile metadata only.                                        | XState fixture comparison for conflict/history semantics.       |
| persistence/devtools/replay | `stub`     | Consume trace/snapshot metadata only.                         | Trace redaction and snapshot versioning rules exist.            |
| XState bridge helpers       | `adapter`  | Isolate conversions.                                          | No core runtime dependency on XState.                           |

## Implementation Constraints

- Keep the full intended surface documented.
- Stub hard features instead of deleting them.
- Do not clone the full TanStack Query option surface.
- Do not expose public atom/store vocabulary.
- Do not make XState the final core runtime.
- Do not route expected failures through raw Promise rejection semantics.

## Open Decisions

- Final package names.
- Whether React users call `useFlow` or `flow.use`.
- Exact statechart subset for the first implementation.
- Whether queries detach into cache or cancel on state exit.
- Cache key object support and matching rules.
- Mutation concurrency and rollback rules.
- Selector equality and batching behavior.
