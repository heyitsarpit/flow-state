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

The public API surface may be stubbed before it is implemented. API-settled surfaces have final call shapes and snapshot contracts, but they must not pretend runtime behavior is proven.

## Implementation Status Labels

| Status           | Meaning                                                                     | Required docs                                           |
| ---------------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| `runtime-proven` | Runtime behavior is implemented and covered by example tests.               | Function, input, output, properties, semantics, tests.  |
| `api-settled`    | Final API shape is encoded in types/docs/tests; runtime behavior is absent. | Function, input, output, snapshot shape, test contract. |
| `stub`           | Export or docs can exist, but semantics are intentionally incomplete.       | Intended behavior, stub behavior, missing semantics.    |
| `research`       | We need deeper XState, Effect, or TanStack study before implementation.     | Research target and decision needed.                    |
| `adapter`        | Useful bridge or interop surface, not the core runtime architecture.        | Boundary, ownership, and dependency rules.              |

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

| Function          | Input                                                                    | Output                     | Key properties                                            | Why we need it                                                   |
| ----------------- | ------------------------------------------------------------------------ | -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| `flow.machine`    | machine config                                                           | machine definition         | states, events, context, invokes, graph metadata          | Main product primitive. Models legal UI/workflow states.         |
| `flow.effect`     | Effect factory and success/failure transitions                           | invoked work definition    | typed success, typed failure, defect path, cancellation   | Runs non-cached external work at state boundaries.               |
| `flow.query`      | cache key, Effect factory, cache policy, transitions                     | cached invoke definition   | key, stale/keep policy, dedupe, invalidation behavior     | Machine-owned read/cache semantics.                              |
| `flow.mutation`   | input factory, Effect factory, invalidation, optional optimistic policy  | mutation invoke definition | variables, rollback context, mutation scope, invalidation | Machine-owned write semantics.                                   |
| `flow.submit`     | mutation definition plus optional `target`, `guard`, `update`, `actions` | transition config          | event-triggered mutation submission                       | Lets events start runtime-owned mutations without hand wiring.   |
| `flow.outcomes`   | success/failure/defect/interrupt route config                            | async route map            | tuple/string/function shorthands for outcome events       | Keeps query, mutation, stream, and effect routes consistent.     |
| `flow.stream`     | Stream factory, pressure policy, and value/failure routes                | stream invoke definition   | scoped subscription, value events, cleanup                | Websocket/SSE/upload/agent progress support.                     |
| `flow.view`       | snapshot projection config                                               | view descriptor            | typed `selectView`/`useView` projection metadata          | Dashboards and agents need stable derived views.                 |
| `flow.schema`     | schema config                                                            | schema descriptor          | decode/validate metadata                                  | Checkout persistence and docs need stable shape contracts.       |
| `flow.persist`    | version/select/redact/migrate config                                     | persistence descriptor     | snapshot persistence contract                             | Checkout restore without saving fibers/services.                 |
| `flow.history`    | history config                                                           | history descriptor         | previous-state metadata                                   | Checkout/approval backtracking.                                  |
| `flow.permission` | permission config                                                        | permission descriptor      | allowed/denied reason metadata                            | Approval flows need explainable gated commands.                  |
| `flow.invariant`  | invariant config                                                         | invariant descriptor       | business-rule metadata                                    | Tests and runtime can assert product rules.                      |
| `flow.assign`     | context update mapping                                                   | assignment wrapper         | optional metadata/compatibility                           | Escape hatch when an update needs to be named or wrapped.        |
| `flow.guard`      | predicate                                                                | guard wrapper              | optional metadata/compatibility                           | Escape hatch when a guard needs to be named or wrapped.          |
| `flow.action`     | synchronous action                                                       | action definition          | entry/exit/transition side effect                         | For local state-adjacent work inside the transition transaction. |
| `flow.input`      | input description/schema                                                 | input marker               | typed machine start input                                 | Keeps route/props/input separate from context.                   |
| `flow.schema`     | Effect Schema or schema-like validator                                   | schema marker              | validation, decode, docs metadata                         | Runtime validation and future persistence.                       |
| `flow.option`     | value/schema                                                             | optional field marker      | present/absent value                                      | Avoids loose nullable context fields.                            |
| `flow.match`      | snapshot and state handlers                                              | matched render result      | exhaustive rendering                                      | Helps React render by state, not by boolean soup.                |
| `flow.can`        | snapshot/actor and event                                                 | boolean                    | legal-event check                                         | Powers buttons, commands, and permission-like UI.                |

## Planned Flow Helpers

| Function         | Input                           | Output                  | Key properties                    | Why it may exist                                                   |
| ---------------- | ------------------------------- | ----------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `flow.child`     | child machine/actor config      | child invoke definition | lifecycle, parent/child summaries | Actor composition with graph and snapshot visibility.              |
| `flow.raise`     | internal event                  | raised event action     | internal queue, trace receipt     | Internal decomposition. Runtime queue exists before public helper. |
| `flow.after`     | duration or schedule and target | delayed transition      | Clock/TestClock support           | Timeouts, debounce, auto-dismiss, retry.                           |
| `flow.viewState` | state name and payload          | view state              | render union state                | Helper for `flow.view`.                                            |

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

| Property | Input                                                    | Output/meaning   | Why we need it                  |
| -------- | -------------------------------------------------------- | ---------------- | ------------------------------- |
| `key`    | context/input to key                                     | cache identity   | Dedupe and invalidation.        |
| `effect` | context/input to Effect                                  | read operation   | Typed data fetching.            |
| `cache`  | stale/keep/dedupe policy                                 | lifecycle rules  | Query behavior.                 |
| `policy` | cache-first/network-first/refetch/stale-while-revalidate | fetch strategy   | Explicit cache behavior.        |
| `routes` | pure outcome-to-event mappers                            | result routing   | Machine-owned data routing.     |
| `issues` | failure/defect/interrupt policy                          | issue collection | Expected failures stay visible. |

Implementation rule:

- Queries are cache-owned and state-observed.
- Entering a state attaches an observer to the query.
- Exiting the state detaches that observer.
- Cache work may continue after detach according to cache policy.
- A late query completion may update cache, but it must not transition an inactive invoke generation.
- Query routes are pure mappers from `Exit`/`Cause` outcomes to machine events, not arbitrary observer callbacks. Side effects belong in machine transitions, global runtime observers, or explicit mutation/work actions.
- Query success records `cache:write`.
- Query snapshots expose tags, observer count, updated time, stale time, GC time, and invalidation time.

## Mutation Properties

| Property      | Input                           | Output/meaning                  | Why we need it                 |
| ------------- | ------------------------------- | ------------------------------- | ------------------------------ |
| `input`       | context/event to variables      | mutation variables              | Captures submitted data.       |
| `effect`      | variables to Effect             | write operation                 | Typed write side effect.       |
| `optimistic`  | transaction callbacks           | optimistic cache/context update | Fast UI with rollback.         |
| `invalidates` | keys/tags/predicate             | invalidation plan               | Keeps reads coherent.          |
| `scope`       | mutation scope/key              | concurrency policy              | Avoids overlapping write bugs. |
| `routes`      | pure outcome-to-event mappers   | result routing                  | Workflow continuation.         |
| `actions`     | scoped mutation callbacks       | actor-owned follow-up work      | Rare imperative integration.   |
| `issues`      | failure/defect/interrupt policy | issue collection                | Conflict/retry/error flows.    |

Implementation rule:

- Mutations are event-triggered actor work, not automatic state-entry work by default.
- A mutation belongs to an actor generation and must route success/failure only if still relevant.
- Concurrency policy must be explicit: serialize, reject while running, cancel previous, or last-write-wins.
- Optimistic updates remain in the surface, but stub behavior may initially record the intended transaction without applying rollback.
- Prefer declarative `invalidates`, `optimistic`, `rollback`, and pure `routes`. Callback-style mutation actions are allowed only when scoped to the submitted mutation generation and must not behave like per-component query observers.
- Invalidation targets may be keys, tags, strings, predicate targets, or a function of mutation input and success value.
- Successful invalidation records `cache:invalidate`, marks matching resources stale, and records `cache:stale`.

## Workflow Properties

| Surface           | Input                                                  | Output/meaning         | Why we need it                                                      |
| ----------------- | ------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------- |
| `createStatePath` | path segments                                          | stable state path id   | Nested workflows need path names.                                   |
| `flow.permission` | id, description, path, event, meta, and check function | permission descriptor  | Approval gates need denial reason and explainable command metadata. |
| `flow.invariant`  | id, description, path, meta, check, message, severity  | invariant descriptor   | Business rules need test handles and owner/path metadata.           |
| `flow.persist`    | id, version, select/redact/migrate                     | persistence descriptor | Restore drafts without fibers.                                      |
| `flow.schema`     | schema metadata                                        | schema descriptor      | Validation/docs/replay boundary.                                    |
| `flow.history`    | id, depth, target                                      | history descriptor     | Backtracking semantics.                                             |

Implementation rule:

- Workflow descriptors are metadata until a specific example proves runtime behavior.
- State nodes may carry nested `states`, `initial`, `type`, `history`, `permissions`, and `invariants` metadata.
- Persisted snapshots must not include fibers, services, scopes, or in-flight Effect handles.

## Stream Properties

| Property   | Input                             | Output/meaning        | Why we need it                           |
| ---------- | --------------------------------- | --------------------- | ---------------------------------------- |
| `id`       | stable string                     | stream identity       | Snapshot, trace, receipts, probes.       |
| `input`    | context/event/input to variables  | stream input          | Keeps service parameters out of context. |
| `stream`   | input/services/runtime to Stream  | pushed values         | Live data source.                        |
| `pressure` | queue/coalesce/sample/drop policy | backpressure behavior | High-frequency streams need a decision.  |
| `routes`   | value/failure/defect/done maps    | stream event routes   | Integrates stream outcomes into machine. |
| `issues`   | failure/defect/interrupt policy   | issue collection      | Expected stream errors stay visible.     |

Final pressure policy union:

```ts
type FlowStreamPressure<TValue> =
  | { strategy: "queue"; limit?: number }
  | { strategy: "coalesce-latest"; key: (value: TValue) => string }
  | { strategy: "drop"; limit?: number }
  | { strategy: "sample"; every: FlowDurationInput };
```

Implementation rule:

- Streams are state-scoped unless explicitly detached.
- State exit interrupts the stream fiber and records cleanup.
- Stream values update `snapshot.streams[id].latest` and enqueue mapped events when `routes.value` is provided.
- Product context changes only through normal transition `update` reducers.
- Stream interruption is receipt-only unless `routes.interrupt` is provided.
- Stream pressure defaults to `queue` for correctness, but high-frequency streams should choose `coalesce-latest`, `sample`, or `drop` explicitly.
- Coalesced, sampled, or dropped values must be visible in receipts so pressure policy does not hide behavior.

Final intended shape:

```ts
const liveProgress = flow.stream({
  id: "upload.progress",
  input: ({ context }) => ({ files: context.files }),
  stream: ({ input, services }) => services.upload.uploadFiles(input.files),
  pressure: {
    strategy: "coalesce-latest",
    key: (value) => value.fileId,
  },
  routes: {
    value: (value) => ({ type: "UPLOAD_PROGRESS", value }),
    done: () => ({ type: "UPLOAD_DONE" }),
    failure: (error) => ({ type: "UPLOAD_FAILED", error }),
    defect: (defect) => ({ type: "UPLOAD_DEFECT", defect }),
    interrupt: () => ({ type: "CANCEL_UPLOAD" }),
  },
});
```

## Delayed Transition Properties

| Property  | Input                            | Output/meaning     | Why we need it                        |
| --------- | -------------------------------- | ------------------ | ------------------------------------- |
| `id`      | stable string                    | timer identity     | Trace, receipts, probes.              |
| `delay`   | duration or context/event mapper | scheduled time     | Timeouts, dismissals, retry delays.   |
| `target`  | state target                     | delayed transition | Move after time passes.               |
| `guard`   | predicate                        | timer guard        | Avoid stale timers transitioning.     |
| `update`  | reducer or reducer list          | context update     | Auto-dismiss/reset without extra UI.  |
| `actions` | action or action list            | side effects       | Traceable timer-fired actions.        |
| `routes`  | fired/interrupted maps           | timer events       | Optional eventful timer handling.     |
| `receipt` | metadata                         | trace detail       | Diagnostics without app-owned timers. |

Implementation rule:

- `flow.after(...)` and state `after` entries are state-scoped.
- Entering the state schedules a timer on runtime `Clock`.
- Exiting the state interrupts the timer and records `timer:cancel`.
- Timer fire enqueues a runtime event or applies the configured target through the normal transition queue.
- Tests advance the same clock boundary with `harness.advance(...)`; there is no separate fake timeout path.

Final intended shape:

```ts
const dismissCompleted = flow.after({
  id: "upload.dismiss-completed",
  delay: "2 seconds",
  target: "idle",
  update: resetUpload,
});
```

## Runtime State Shapes

| Shape           | Key properties                                                                              | Why we need it                                  |
| --------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `EffectResult`  | success value or typed failure error                                                        | Keeps expected failures as data.                |
| `ResourceState` | data status, fetch status, timestamps, stale flag, failure count                            | Query lifecycle without boolean soup.           |
| `MutationState` | idle/running/success/failure, variables, submitted time, rollback context                   | Mutation lifecycle and testing.                 |
| `FlowSnapshot`  | state, context, status, tags, resources, mutations, streams, timers, active invokes         | Render/test/devtools unit.                      |
| `StreamState`   | idle/running/latest/failure/done/interrupted, emitted/coalesced/dropped, started/ended time | Subscription lifecycle without app bookkeeping. |
| `TimerState`    | scheduled/fired/cancelled, delay, scheduled time, fire time, fired/cancelled time           | Delayed transition lifecycle.                   |

Final stream snapshot contract:

```ts
interface FlowStreamSnapshot {
  id: string;
  status: "idle" | "running" | "done" | "failure" | "defect" | "interrupt";
  latest?: unknown;
  error?: unknown;
  defect?: unknown;
  emitted: number;
  coalesced: number;
  dropped: number;
  startedAt?: number;
  endedAt?: number;
}
```

Final timer snapshot contract:

```ts
interface FlowTimerSnapshot {
  id: string;
  status: "scheduled" | "fired" | "cancelled";
  delay: FlowDurationInput;
  scheduledAt: number;
  fireAt: number;
  firedAt?: number;
  cancelledAt?: number;
}
```

## React API

| Function/component | Input                           | Output                     | Key properties                    | Why we need it                               |
| ------------------ | ------------------------------- | -------------------------- | --------------------------------- | -------------------------------------------- |
| `FlowProvider`     | runtime and children            | React provider             | runtime context                   | Hooks need access to runtime.                |
| `useFlow`          | machine and input/options       | snapshot, send, can, actor | state rendering and event sending | Main React integration.                      |
| `useSelector`      | actor/runtime/view and selector | selected value             | equality, stability               | Avoids unnecessary renders.                  |
| `useView`          | view projection                 | view snapshot              | multi-source rendering            | Later support for multiple actors/resources. |
| `useActorRef`      | machine/options                 | actor ref                  | stable actor identity             | Advanced integration and imperative edges.   |

## Implementation Map

| Surface                         | Status           | Current behavior                                                                                                                   | Proof surface                                                        |
| ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `flow.machine`                  | `runtime-proven` | Validates config shape and exposes graph metadata.                                                                                 | Project Editor can start, send events, and expose snapshots.         |
| `flow.effect`                   | `stub`           | Records planned invoke lifecycle.                                                                                                  | Non-cached state-owned Effect example proves it.                     |
| `flow.query`                    | `runtime-proven` | Starts state-entry Effect work through runtime Layer.                                                                              | Project Editor load success/failure/defect/late-result tests.        |
| `flow.mutation`                 | `runtime-proven` | Starts submitted Effect work through runtime Layer.                                                                                | Project Editor save success/failure/defect/invalidation tests.       |
| `flow.submit`                   | `runtime-proven` | Returns transition config with mutation submission metadata plus optional guard/update/action fields.                              | Project Editor and Cached Dashboard start mutations from events.     |
| `flow.outcomes`                 | `runtime-proven` | Builds typed success/failure/defect/interrupt route maps from tuple/string/function shorthands.                                    | Core tests and examples share route vocabulary.                      |
| cache invalidation/stale probes | `runtime-proven` | Query success writes receipts; successful mutations mark matching resources stale.                                                 | Core dashboard test covers tag fanout and cache probes.              |
| `flow.stream`                   | `contract`       | Descriptor and public types are settled; runtime is absent.                                                                        | Streaming Upload Manager locks cleanup, pressure, and route API.     |
| `flow.after`                    | `contract`       | Descriptor and public types are settled; runtime is absent.                                                                        | Upload completion locks delayed transition/update API.               |
| `flow.view`                     | `runtime-proven` | Runs typed snapshot projections through `selectView` and React `useView`; advanced multi-actor priority rules are not implemented. | Cached Dashboard and Agent Workspace render descriptor-backed views. |
| workflow descriptors            | `api-settled`    | Permissions, invariants, schema, persistence, history, and state paths have stable descriptors.                                    | Checkout Or Approval Flow can encode workflow contracts.             |
| `flow.child`                    | `contract`       | Records child relationship descriptors, child summary snapshots, and child start/stop receipts; child machines/fibers are absent.  | Agent Workspace renders parent/child state without atom/store terms. |
| parallel runtime states         | `research`       | Compiles metadata only.                                                                                                            | XState fixture comparison for conflict/parallel semantics.           |
| experimental tooling            | `contract`       | Consumes trace/snapshot/graph metadata only; no devtools transport or production replay runtime.                                   | Agent Workspace uses `flowExperimental` reports and descriptors.     |
| XState bridge helpers           | `adapter`        | Isolates conversions.                                                                                                              | No core runtime dependency on XState.                                |

Project Editor now proves a minimal runtime-owned query and mutation path. The app context holds product state, while load/save lifecycle appears on `snapshot.resources`, `snapshot.mutations`, `snapshot.receipts`, and `snapshot.issues`. Full cache observer refetch, retry policy, mutation rollback, and non-cached `flow.effect` are still future proof points.

Cached Dashboard extends that cache slice with multiple state-entry queries, tag/key/predicate/string invalidation fanout, stale resource probes, and snapshot-backed `flow.view` projections through `useView`. Active observer refetch, GC, dedupe, and optimistic rollback remain future proof points.

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
