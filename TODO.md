# Flow State vNext Rebuild TODO

Goal: rebuild the runtime, docs, and one flagship example app around the new
vNext mental model in `apps/docs/src/pages/reference-next`.

```txt
Resources model what the app knows.
Flows model what the app is doing.
Views model what the user sees.
```

The current examples are API pressure tests, not syntax authority. Preserve the
problems they prove, but fold them into one cohesive app that teaches the final
API shape: `flow.module`, `flow.resource`, `flow.mutation`, `flow.machine`,
`flow.view`, `flow.app`, `App.layer`, and `flowTest`.

## Ground Rules

- [ ] Treat `apps/docs/src/pages/reference-next` as the product contract.
- [ ] Keep canonical API data in ResourceStore; keep process state in flows; keep render derivation in views.
- [ ] Use Effect names directly when Effect owns the concept: `Effect`, `Layer`, `Context.Service`, `ManagedRuntime`, `Stream`, `Schedule`, `Duration.Input`, `Clock`, `TestClock`, `Exit`, `Cause`, `Schema`, `Option`, `Result`, `Redacted`, `Queue`, `PubSub`, `Cache`, `RequestResolver`.
- [ ] Prefer ergonomic Effect-native call sites in docs and examples. For durations, write human-readable `Duration.Input` strings such as `"30 seconds"`, `"5 minutes"`, and `"250 millis"` instead of object-shaped durations.
- [ ] Do not create Flow wrappers around Effect concepts just to make the namespace feel uniform.
- [ ] Keep Flow-owned names for integration semantics: resource snapshots, flow snapshots, receipts, traces, transactions, `ensure`, `observe`, `run`, `patch`, `invalidate`.
- [ ] Preserve bare `guard`, pure `update`, and synchronous `actions` slots for machine ergonomics.
- [ ] Do not add Flow-owned assertion helpers such as `.expectState()` or `.expectData()`. Use `flowTest(...)` plus Vitest or `@effect/vitest` assertions.
- [ ] Keep the flagship example contract-first and UI-thin. Prove semantics with tests before React polish.
- [ ] Use direct Effect service tests for services, schemas, redaction, batching, and typed failures; use Flow scenario tests for resource/orchestrator integration.
- [ ] Keep docs, examples, and tests in lockstep after every phase.
- [ ] Run targeted checks after each phase; run `pnpm verify` before final closeout.

## Phase 0: Spec Alignment And API Inventory

- [ ] Read and pin the vNext contract:
  - [ ] `apps/docs/src/pages/reference-next.md`
  - [ ] `apps/docs/src/pages/reference-next/lib-api.md`
  - [ ] `apps/docs/src/pages/reference-next/core.md`
  - [ ] `apps/docs/src/pages/reference-next/effect-runtime.md`
  - [ ] `apps/docs/src/pages/reference-next/streams-schedules.md`
  - [ ] `apps/docs/src/pages/reference-next/tests-and-examples.md`
- [ ] Reconcile existing exported APIs in `packages/flow-state/src/index.ts` against `reference-next/lib-api.md`.
- [ ] Mark each export as one of:
  - [ ] keep final
  - [ ] rename to vNext
  - [ ] migration alias
  - [ ] remove from final docs/examples
  - [ ] contract-only stub
- [ ] Create or update type tests for final API names before large runtime rewrites.
- [ ] Ensure the vNext docs explicitly list all functions the examples will use.
- [ ] Keep old `apps/docs/src/pages/reference/*` pages as legacy implementation docs unless intentionally updating them; new work should teach `reference-next`.

Acceptance gate:

- [ ] A short export inventory exists in the TODO or a linked work note.
- [ ] No example rewrite starts before the final API names are chosen.

## Phase 1: Runtime Services And App Layer

### FlowRuntime

- [ ] Make `FlowRuntime` the single app runtime that owns:
  - [ ] ResourceStore
  - [ ] OrchestratorSystem
  - [ ] Trace
  - [ ] Clock/Scheduler
  - [ ] user app services
- [ ] Use Effect `ManagedRuntime` as the host bridge when a Layer is supplied.
- [ ] Expose `runPromise`, `runPromiseExit`, and `dispose` behavior consistent with `reference-next/effect-runtime.md`.
- [ ] Ensure disposal interrupts actor-owned work, resource refresh fibers, streams, timers, and service scopes.
- [ ] Add finalizer/disposal tests with a scoped test service.

### App Construction

- [ ] Implement or stub with type coverage:
  - [ ] `flow.app({ modules })`
  - [ ] `App.layer({ store, orchestrators, services })`
  - [ ] `flow.runtime(layer)`
  - [ ] `flow.store.memory(...)`
  - [ ] `flow.store.test(...)`
  - [ ] `flow.orchestrators.live()`
  - [ ] `flow.orchestrators.test()`
- [ ] Keep Flow helpers as wrappers around real Effect `Layer`s.
- [ ] Do not invent a parallel dependency injection model.
- [ ] Preserve Effect service requirements through descriptor types where possible.
- [ ] Add type tests proving a service-requiring resource/mutation/stream cannot run without a compatible Layer.

### Services

- [ ] Rewrite example services around `Context.Service` classes.
- [ ] Prefer service identifiers with package/path style names.
- [ ] Use static `layer`, `layerMock`, or `layerTest` helpers where useful.
- [ ] Use `Effect.fn("Domain.operation")` for service methods and resource/mutation lookup functions.
- [ ] Add `createPartialTestLayer` or update `createTestLayer` to support partial service fakes that `Effect.die` on missing methods.

Acceptance gate:

- [ ] A minimal app with one resource, one mutation, one flow, one service Layer, and one React provider smoke path compiles.
- [ ] Runtime disposal has at least one test.

## Phase 2: ResourceStore

### Resource Definition

- [ ] Implement `flow.resource` with:
  - [ ] `key`
  - [ ] `lookup`
  - [ ] `tags`
  - [ ] `cache.capacity`
  - [ ] `cache.timeToLive`
  - [ ] `freshness.staleAfter`
  - [ ] `freshness.refresh`
  - [ ] `freshness.onInvalidate`
  - [ ] `placeholder`
  - [ ] `schema`
- [ ] Replace `flow.query` in final examples with `flow.resource`.
- [ ] Keep `flow.query` only as a migration alias if needed.
- [ ] Use Effect `Cache` terminology for lookup cache behavior: `lookup`, `capacity`, `timeToLive`.
- [ ] Keep Flow freshness as a separate UI semantic: `fresh`, `stale`, `invalidated`, `expired`.
- [ ] Support dynamic TTL from `Exit` and key if useful.

### Resource Snapshot

- [ ] Implement multi-axis `ResourceSnapshot`:
  - [ ] `availability`: empty, data, error with optional previous data
  - [ ] `activity`: idle, fetching, paused
  - [ ] `freshness`: fresh, stale, invalidated, expired
  - [ ] timestamps
  - [ ] placeholder flag
  - [ ] request id
  - [ ] serializable Cause projection
- [ ] Do not collapse resources to `loading | success | error`.
- [ ] Add resource helpers for pleasant rendering, but keep raw snapshots inspectable.

### ResourceStore Service

- [ ] Implement:
  - [ ] `get(ref)`
  - [ ] `subscribe(ref, listener)`
  - [ ] `ensure(ref)`
  - [ ] `refresh(ref)`
  - [ ] `invalidate(ref | tag | filter)`
  - [ ] `patch(ref, patch)`
  - [ ] `transaction(effect)`
- [ ] Use `Ref`/`SynchronizedRef` for concurrent updates.
- [ ] Use `FiberMap` for keyed fetch/refresh work.
- [ ] Use `Clock`/`DateTime` for timestamps.
- [ ] Consider Effect `Resource` internally for refreshable scoped values.
- [ ] Preserve serializable public snapshots; do not expose raw fibers, scopes, Contexts, or Cache maps.

### Resource Identity

- [ ] Decide key identity policy:
  - [ ] strictly serializable key parts
  - [ ] or support `PrimaryKey`, `Equal`, and `Hash` with separate serializable display keys
- [ ] Add collision/serialization tests for primitives, arrays, objects, branded IDs, and invalid keys.

Acceptance gate:

- [ ] Resource tests cover ensure, refresh, invalidate, patch, stale while visible, previous data on error, placeholder data, and subscriptions.
- [ ] A component can read a resource directly without starting a flow.

## Phase 3: Mutation Transactions

- [ ] Implement `flow.mutation` with:
  - [ ] schema-backed `input`
  - [ ] `run`
  - [ ] `optimistic`
  - [ ] `invalidates`
  - [ ] `concurrency`
- [ ] Implement `flow.run(mutation, handlers)` as the final flow-side transaction primitive.
- [ ] Treat older `flow.submit(...)` as migration sugar only.
- [ ] Normalize mutation input with `Option` internally:
  - [ ] `Option.some`
  - [ ] `Option.none`
  - [ ] `null`
  - [ ] `undefined`
- [ ] Preserve null only at React/JSON/persistence boundaries.
- [ ] Transaction receipts must include:
  - [ ] machine event
  - [ ] flow transition
  - [ ] mutation start
  - [ ] optimistic patch
  - [ ] Effect exit
  - [ ] rollback or commit
  - [ ] invalidation
  - [ ] final route
- [ ] Implement concurrency policies:
  - [ ] `reject-while-running`
  - [ ] `serialize`
  - [ ] `cancel-previous`
  - [ ] `allow`
- [ ] Add rollback tests for optimistic patches.

Acceptance gate:

- [ ] Project save conflict can route from `saving` to `conflict` while canonical project data remains in ResourceStore.
- [ ] A mutation can invalidate resources by ref, tag, and filter.

## Phase 4: OrchestratorSystem And Machine API

- [ ] Keep machine context for process state only:
  - [ ] drafts
  - [ ] selected tabs/steps
  - [ ] retry intent
  - [ ] conflict choices
  - [ ] pending approvals
  - [ ] child actor summaries
- [ ] Remove canonical API data from final flow context.
- [ ] Preserve pure transition style:
  - [ ] `guard`
  - [ ] `update`
  - [ ] `actions`
- [ ] Do not teach mutating context callbacks as the primary API.
- [ ] Implement or align:
  - [ ] `flow.ensure(resourceRef, handlers)`
  - [ ] `flow.observe(resourceRef)`
  - [ ] `flow.refresh(resourceRef)`
  - [ ] `flow.run(mutationRef, handlers)`
  - [ ] `flow.invalidate(target)`
  - [ ] `flow.patch(resourceRef, patch)`
- [ ] Enforce the core distinction:
  - [ ] `ensure = process dependency`
  - [ ] `observe = data dependency`
- [ ] Keep transition kernel deterministic:
  - [ ] select transition
  - [ ] evaluate guards
  - [ ] apply update
  - [ ] compute entry/exit
  - [ ] enqueue state-scoped work
- [ ] Effects, streams, resources, timers, and child flows run after transition selection through scoped Effect fibers.

Acceptance gate:

- [ ] Project Editor loads via `ensure`, views via `observe`, and refreshes without leaving semantic `viewing` unless the flow chooses to route.
- [ ] Flow context does not duplicate canonical project/comments data.

## Phase 5: Streams, Schedules, And Time

### Stream API

- [ ] Change `flow.stream` to use `Stream.Stream<A, E, R>` as the primary source.
- [ ] Keep async iterable only as an adapter via `Stream.fromAsyncIterable`.
- [ ] Replace example service APIs returning `AsyncIterable` with Effect `Stream`.
- [ ] Implement controlled streams with Effect `Queue` or `PubSub`.
- [ ] Preserve the test-facing handle:
  - [ ] `emit`
  - [ ] `fail`
  - [ ] `die`
  - [ ] `end`
  - [ ] `cancel`
  - [ ] `active`
  - [ ] `cancelled`
  - [ ] `events`
  - [ ] `state`

### Pressure

- [ ] Align pressure names with Effect where semantics match:
  - [ ] `suspend`
  - [ ] `dropping`
  - [ ] `sliding`
  - [ ] `unbounded`
  - [ ] `replay`
  - [ ] `sample`
- [ ] Treat keyed `sliding` or explicit sugar as the replacement for most `coalesce-latest` cases.
- [ ] Keep `sample` Schedule-based, not queue-overflow-based.
- [ ] Record emitted, coalesced, dropped, sampled, started, ended, failure, defect, and interrupt facts in snapshots/receipts.

### Schedule And Time

- [ ] Replace custom `FlowDurationInput` with Effect `Duration.Input`.
- [ ] Stop documenting `{ millis }`, `{ milliseconds }`, or any other object-shaped duration in Flow examples. Teach strings such as `"30 seconds"` and `"250 millis"` unless a low-level Effect interop test specifically needs object input.
- [ ] Use `Schedule` for retry, repeat, polling, sampling, and active resource refresh.
- [ ] Keep `flow.after.delay` as a one-shot `Duration.Input`.
- [ ] Use `Clock`/`DateTime` in Effect services and runtime internals.
- [ ] Implement `flowTest.advance` through `TestClock`.
- [ ] Keep `runtime.now()` only for synchronous pure reducer/update slots that need serializable time.
- [ ] Remove `Date.now()` from Effect service implementations.

Acceptance gate:

- [ ] Streaming Upload Manager uses `Stream`, Effect pressure names, cancellation, and deterministic time.
- [ ] No final example service exposes `AsyncIterable` as the primary API.
- [ ] Timer and stream tests use virtual time or controlled handles, not real sleeps.

## Phase 6: Schemas, Errors, Redaction, Persistence

### Schema

- [ ] Replace string-only `flow.schema` metadata with Effect `Schema`.
- [ ] Use `Schema.Class` for domain values crossing I/O, persistence, or docs boundaries.
- [ ] Use `Schema.TaggedErrorClass` for schema-backed typed failures.
- [ ] Use `Data.TaggedError`, `Data.TaggedClass`, or `Data.taggedEnum` for internal tagged values that do not need codecs.
- [ ] Use `Schema.brand`, `Brand`, or `Newtype` for domain IDs where type safety helps without drowning examples.

### Errors

- [ ] Preserve Effect `Exit` / `Cause` internally.
- [ ] Public issues expose serializable projections but must not erase:
  - [ ] typed failures
  - [ ] defects
  - [ ] interruptions
  - [ ] multiple Cause reasons
  - [ ] annotations when useful
- [ ] Use `Match`, `Effect.catchTag`, `Effect.catchTags`, `Effect.catchReason`, or `Effect.catchReasons` in service tests and failure handling.
- [ ] Preserve Flow's four outcome lanes: success, typed failure, defect, interrupt.

### Redaction And Persistence

- [ ] Use `Schema.Redacted`, `Redacted`, and `Config.redacted` for sensitive data.
- [ ] Use `Redacted.value` only at I/O boundaries.
- [ ] Keep Flow trace redaction callbacks as a safety net, not the only redaction story.
- [ ] Update `flow.persist` to support schema-backed select, decode, encode, migrate, and redact.
- [ ] Persisted snapshots must not include fibers, services, scopes, or in-flight Effect handles.

Acceptance gate:

- [ ] Checkout persistence decodes, migrates, and redacts through Schema.
- [ ] Agent traces demonstrate redacted values do not leak.
- [ ] Tests cover decode failure, migration, redaction, typed failure, defect, and interrupt.

## Phase 7: Views And React

- [ ] Make `flow.view` central in final examples.
- [ ] Views must be pure UI read models over resource snapshots and one or more flow snapshots.
- [ ] Views should combine multiple flows when a screen needs one coherent app-level render model.
- [ ] Views should significantly simplify runtime data before it reaches components.
- [ ] Views must not be treated as a thin alias for one machine snapshot.
- [ ] Views must not fetch, mutate, invalidate, or start workflow work.
- [ ] Implement or align React APIs:
  - [ ] `FlowProvider`
  - [ ] `flow.useResource(ref)`
  - [ ] `flow.use(flow, { input })`
  - [ ] `flow.useView(view)`
  - [ ] `flow.can(actorOrSnapshot, event)`
  - [ ] optional `match` helpers over snapshots
- [ ] Ensure dumb components can use ResourceStore directly.
- [ ] Ensure workflow screens can use a flow actor plus observed resources.
- [ ] Keep React boundary null-friendly where it improves rendering; normalize to `Option` internally.

Acceptance gate:

- [ ] Project breadcrumb reads `Project.byId(projectId)` without starting `Project.editor`.
- [ ] Project editor screen uses `Project.editor` and renders observed resources.
- [ ] Launch overview view combines project, readiness, assets, approval, assistant, and chat state into one UI model.
- [ ] Chat view exposes streamed text, interrupt state, and subscription/cleanup status without leaking raw stream internals.

## Phase 8: Test Harness

- [ ] Keep `flowTest(flow)` as the focused flow harness.
- [ ] Add `flowTest.app(App)` for resource + flow app-runtime tests.
- [ ] Harness exposes facts and controls only:
  - [ ] `.provide(layer)`
  - [ ] `.start(input)`
  - [ ] `.send(event)`
  - [ ] `.flush()`
  - [ ] `.settle(bounds)`
  - [ ] `.advance(duration)`
  - [ ] `.state()`
  - [ ] `.context()`
  - [ ] `.snapshot()`
  - [ ] `.can(event)`
  - [ ] `.resources()`
  - [ ] `.mutations()`
  - [ ] `.transactions()`
  - [ ] `.streams()`
  - [ ] `.timers()`
  - [ ] `.receipts()`
  - [ ] `.issues()`
  - [ ] `.trace()`
- [ ] Do not add `.expectState`, `.expectData`, `.expectResource`, or equivalent assertion wrappers.
- [ ] `flush()` drains work ready now only.
- [ ] `settle(bounds)` is broader and must fail with diagnostics when bounds are hit.
- [ ] `advance(duration)` uses Effect `TestClock`.
- [ ] Add direct Effect service tests with `@effect/vitest` where services/schemas are the behavior under test.

Acceptance gate:

- [ ] The flagship app has scenario tests with `flowTest` plus normal `expect(...)`.
- [ ] The flagship app uses no Flow-owned assertion helpers.

## Phase 9: Flagship Example App

Build one large cohesive example instead of rebuilding many small examples. The
working name is `examples/launch-workspace`.

Purpose: one realistic app that covers the full Flow API and Effect-native
patterns in a single product surface.

Product story:

```txt
Launch Workspace
  A team edits a launch project, tracks live readiness metrics, uploads launch
  assets, requests budget/legal approval, and runs an assistant that breaks work
  into child tasks.
```

The old examples map into one app:

| Old example              | Flagship use case                                                |
| ------------------------ | ---------------------------------------------------------------- |
| Todo List                | Launch checklist and pure local flow state.                      |
| React Basic              | App shell, provider, hooks, routes, and view rendering.          |
| Project Editor           | Project resource, comments resource, draft editor, save flow.    |
| Streaming Upload Manager | Launch asset upload stream with cancellation and pressure.       |
| Cached Dashboard         | Readiness dashboard resources with stale/refresh/invalidation.   |
| Checkout Approval Flow   | Budget/legal approval flow with permissions, schema persistence. |
| Agent Workspace          | Assistant run with child flows, progress stream, approval gates. |

### Prebuild Contract

Do not start implementation until the builder can check off this section. The
goal is to make `launch-workspace` feel like one product, with each feature
assigned to a real user workflow before code exists.

- [ ] Build mode decision:
  - [ ] this phase builds a fully wired API proving app, not a fully working product app
  - [ ] the app must compile and present final-looking module, service, resource, mutation, flow, view, test, and React hook patterns
  - [ ] runtime behavior may be fake, controlled, stubbed, or contract-only where the API is still being finalized
  - [ ] tests and code review are the main proof surface; UI polish is secondary
  - [ ] no real backend, auth, file upload service, LLM provider, production persistence, or polished product workflow is required in this phase
  - [ ] stubs are acceptable only when they preserve the final API shape and make missing runtime semantics explicit
- [ ] Package and route shape:
  - [ ] package path is `examples/launch-workspace`
  - [ ] primary route is one launch workspace shell, not a demo gallery
  - [ ] routes or tabs are `Overview`, `Editor`, `Assets`, `Approval`, `Assistant`, `Chat`, and `Trace`
  - [ ] a command bar uses `flow.can(...)` to enable/disable workflow commands
- [ ] Product entities:
  - [ ] `LaunchProject`
  - [ ] `LaunchComment`
  - [ ] `LaunchChecklistItem`
  - [ ] `ReadinessMetric`
  - [ ] `LaunchAsset`
  - [ ] `ApprovalRequest`
  - [ ] `AssistantRun`
  - [ ] `AssistantTask`
  - [ ] `ChatThread`
  - [ ] `ChatMessage`
  - [ ] `ChatToken`
  - [ ] `CurrentUser`
  - [ ] `Permissions`
- [ ] App services:
  - [ ] `SessionApi`
  - [ ] `ProjectApi`
  - [ ] `ReadinessApi`
  - [ ] `AssetApi`
  - [ ] `ApprovalApi`
  - [ ] `AssistantApi`
  - [ ] `ChatApi` or `LlmApi`
  - [ ] optional `FeatureFlags`
- [ ] Screen ownership:
  - [ ] `Overview` composes project, checklist, readiness, approval, and assistant summaries through a view
  - [ ] `Editor` owns draft editing flow and conflict handling
  - [ ] `Assets` owns upload stream flow and asset resource list
  - [ ] `Approval` owns permission-gated approval state, persistence, migration, and redaction
  - [ ] `Assistant` owns parent/child task orchestration and proposed action approval
  - [ ] `Chat` owns prompt input, streamed LLM text, stop/interrupt, offscreen subscriptions, and cleanup
  - [ ] `Trace` renders receipts for resources, mutations, streams, timers, and child flows
- [ ] Proof plan:
  - [ ] every public API in `reference-next/lib-api.md` is assigned to a module, screen, and test
  - [ ] every Effect feature below is assigned to a service, runtime path, or test
  - [ ] each screen has at least one scenario test before React polish
  - [ ] no feature is added only as a synthetic snippet that users cannot see in the app

### App Modules

- [ ] `Session` module:
  - [ ] current user resource
  - [ ] permissions resource
  - [ ] feature flags/config service if needed
- [ ] `Project` module:
  - [ ] `Project.byId` resource
  - [ ] `Project.comments` resource
  - [ ] `Project.save` mutation
  - [ ] `Project.editor` flow
  - [ ] `Project.editorView`
- [ ] `Checklist` module:
  - [ ] pure local checklist flow
  - [ ] no ResourceStore ceremony unless checklist is shared canonical data
  - [ ] shows simple guards, updates, selectors/views
- [ ] `Readiness` module:
  - [ ] metric panel resources
  - [ ] active refresh with `Schedule.spaced("30 seconds")` where useful
  - [ ] dashboard view projections
  - [ ] mutation that invalidates specific panels and global dashboard tags
- [ ] `Assets` module:
  - [ ] upload flow
  - [ ] Effect `Stream` progress source
  - [ ] pressure policy using Effect-aligned names
  - [ ] cancellation, failure, defect, interrupt routes
- [ ] `Approval` module:
  - [ ] approval flow
  - [ ] permissions and invariants
  - [ ] schema-backed persistence, migration, and redaction
  - [ ] budget/legal approval mutation if shared data changes
- [ ] `Assistant` module:
  - [ ] parent assistant flow
  - [ ] child task flow
  - [ ] progress stream
  - [ ] proposed action approval gate
  - [ ] trace/replay/devtools descriptors
- [ ] `Chat` module:
  - [ ] chat thread resource for persisted/seeded history
  - [ ] prompt composer flow with draft input and submit guard
  - [ ] LLM response flow that consumes an Effect `Stream` of text/token deltas
  - [ ] interrupt/stop event that interrupts the running stream fiber
  - [ ] offscreen behavior where UI subscriptions can detach without duplicating or leaking streams
  - [ ] cleanup receipts when the screen unmounts, actor is disposed, or the user stops generation
- [ ] `LaunchApp`:
  - [ ] `flow.app({ modules })`
  - [ ] `App.layer` live/test composition
  - [ ] React `FlowProvider`
  - [ ] app-level views that compose multiple modules

### Required API Coverage

- [ ] `flow.module`
- [ ] `flow.resource`
- [ ] `flow.mutation`
- [ ] `flow.machine`
- [ ] `flow.view`
- [ ] `flow.app`
- [ ] `App.layer`
- [ ] `flow.runtime`
- [ ] `flow.ensure`
- [ ] `flow.observe`
- [ ] `flow.refresh`
- [ ] `flow.run`
- [ ] `flow.patch`
- [ ] `flow.invalidate`
- [ ] `flow.stream`
- [ ] `flow.after`
- [ ] `flow.child`
- [ ] `flow.can`
- [ ] `flow.useResource`
- [ ] `flow.use`
- [ ] `flow.useView`
- [ ] `flowTest`
- [ ] `flowTest.app`
- [ ] `createControlledEffect`
- [ ] `createControlledStream`

### Required Effect Coverage

- [ ] `Context.Service` for all app services.
- [ ] `Layer` / `Layer.mergeAll` for live/test service composition.
- [ ] `ManagedRuntime` through Flow runtime internals.
- [ ] `Effect.fn("Name")` for service methods and resource/mutation operations.
- [ ] `Stream.Stream` as the primary stream API.
- [ ] `Queue` or `PubSub` for controlled stream tests.
- [ ] `Schedule` for refresh, polling, retry, or sampling.
- [ ] Human-readable `Duration.Input` strings like `"30 seconds"` and `"250 millis"`.
- [ ] `Clock` / `DateTime` in Effect services.
- [ ] `TestClock` through `flowTest.advance`.
- [ ] `Exit` / `Cause` internally and serializable public issue projections.
- [ ] `Schema`, `Schema.TaggedErrorClass`, and branded IDs where useful.
- [ ] `Option` internally for absence; null only at React/JSON/persistence boundaries.
- [ ] `Result` for pure synchronous validation where it can fail.
- [ ] `Redacted` / `Schema.Redacted` for sensitive approval/customer/assistant data.
- [ ] `Record` / `Array` helpers where they improve finite dashboard/checklist code.
- [ ] `RequestResolver` inside services if readiness metrics need batching.

### Feature Placement Matrix

The builder should fill any missing details before coding. A feature without a
home in this matrix is not covered.

| Feature                        | Product use                                                                                                                  | Proof point                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `flow.module`                  | `Session`, `Project`, `Checklist`, `Readiness`, `Assets`, `Approval`, `Assistant`                                            | module exports compile and compose in `LaunchApp`   |
| `flow.resource`                | current user, permissions, project, comments, readiness metrics, assets, approval, chat thread                               | ResourceStore tests and direct resource hooks       |
| `flow.mutation`                | save project, update checklist, update metric, commit upload, submit approval, approve assistant action, append chat message | transaction receipts                                |
| `flow.machine`                 | editor, checklist, upload, approval, assistant parent, assistant child, chat composer/response                               | scenario tests per flow                             |
| `flow.view`                    | overview read model, editor view, dashboard view, assistant view, chat transcript view                                       | view tests over resources + multiple flow snapshots |
| `flow.app` / `App.layer`       | `LaunchApp` live/test runtime composition                                                                                    | `flowTest.app(LaunchApp)` app-runtime tests         |
| `flow.runtime`                 | React provider bridge and direct service smoke path                                                                          | disposal and run boundary tests                     |
| `flow.ensure`                  | editor initial project load, overview initial workspace load                                                                 | opening project scenario                            |
| `flow.observe`                 | comments, readiness, assets, approval status while user remains in state                                                     | stale-while-visible scenario                        |
| `flow.refresh`                 | manual refresh in Overview and Editor command bar                                                                            | resource freshness/activity assertions              |
| `flow.run`                     | save, approval submit, asset commit, assistant approval                                                                      | mutation success/failure scenarios                  |
| `flow.patch`                   | optimistic project save and checklist toggle                                                                                 | rollback and receipt assertions                     |
| `flow.invalidate`              | save invalidates project/list; metrics mutation invalidates dashboard tags                                                   | invalidation tests by ref, tag, filter              |
| `flow.stream`                  | upload progress, assistant progress, and LLM token/text deltas                                                               | controlled stream tests                             |
| `flow.after`                   | upload-complete toast or approval reminder                                                                                   | virtual-time timer test                             |
| `flow.child`                   | assistant breaks a run into child tasks                                                                                      | parent cancellation interrupts children             |
| `flow.can`                     | command bar and approval buttons                                                                                             | permission/guard tests                              |
| `flow.useResource`             | breadcrumb, status chips, and summary widgets                                                                                | React smoke/build test                              |
| `flow.use`                     | workflow screens start editor/upload/approval/assistant/chat actors                                                          | React smoke/build test                              |
| `flow.useView`                 | Overview, Editor, and Chat projections                                                                                       | React smoke/build test                              |
| `flowTest`                     | focused flow scenarios                                                                                                       | normal Vitest `expect(...)` assertions              |
| `flowTest.app`                 | seeded resources plus multiple running flows                                                                                 | app-runtime integration test                        |
| `createControlledEffect`       | save conflict, approval failure, assistant action result                                                                     | controlled outcome-lane tests                       |
| `createControlledStream`       | upload, assistant progress, and chat token streams                                                                           | stream success/failure/defect/interrupt tests       |
| `Context.Service`              | all app APIs                                                                                                                 | direct Effect service tests                         |
| `Layer` / `Layer.mergeAll`     | `LaunchApp.Live` and `LaunchApp.Test`                                                                                        | layer composition type tests                        |
| `ManagedRuntime`               | Flow runtime internals                                                                                                       | runtime disposal test                               |
| `Effect.fn("Name")`            | service methods, resource lookup, mutation run                                                                               | stack/trace naming smoke                            |
| `Stream.Stream`                | upload, assistant, and chat APIs                                                                                             | no primary `AsyncIterable` in final app             |
| `Queue` / `PubSub`             | controlled stream handles                                                                                                    | deterministic stream handle tests                   |
| `Schedule`                     | readiness refresh, upload sampling, retries if needed                                                                        | virtual-time schedule tests                         |
| `Duration.Input` strings       | `"30 seconds"`, `"250 millis"`, `"5 seconds"` in docs/tests                                                                  | no object-shaped duration examples                  |
| `Clock` / `DateTime`           | service timestamps and persisted metadata                                                                                    | direct service test                                 |
| `TestClock`                    | `flowTest.advance("30 seconds")`                                                                                             | no real sleeps                                      |
| `Exit` / `Cause`               | typed failure, defect, interrupt issue projections                                                                           | issue/receipt tests                                 |
| `Schema` / branded IDs         | domain models, persistence, API payloads                                                                                     | decode/encode tests                                 |
| `Schema.TaggedErrorClass`      | project conflict, approval denial, upload failure                                                                            | typed failure tests                                 |
| `Option`                       | drafts, selected task, optional approval decision                                                                            | flow context assertions                             |
| `Result`                       | pure command/input validation                                                                                                | direct validation tests                             |
| `Redacted` / `Schema.Redacted` | approval customer/budget detail and assistant sensitive data                                                                 | trace redaction tests                               |
| `Record` / `Array`             | finite readiness/checklist transformations                                                                                   | pure view/update tests                              |
| `RequestResolver`              | batched readiness metrics lookup                                                                                             | service batching test                               |

### Flagship Scenarios

- [ ] Opening a launch project:
  - [ ] `Project.editor` uses `flow.ensure(Project.byId(id))`.
  - [ ] comments and metrics are observed without copying canonical data into flow context.
- [ ] Editing project details:
  - [ ] draft lives in flow context.
  - [ ] canonical project lives in ResourceStore.
  - [ ] save uses `flow.run(Project.save, ...)`.
  - [ ] conflict rolls back or preserves draft and routes to conflict state.
- [ ] Refreshing while viewing:
  - [ ] resource refresh changes resource activity/freshness.
  - [ ] flow stays in semantic `viewing` unless the product explicitly routes.
- [ ] Updating dashboard widgets:
  - [ ] mutation invalidates panel resources by ref, tag, and filter.
  - [ ] stale data remains visible while refetching.
  - [ ] view projection combines resource snapshots and multiple flow states when the screen needs them.
- [ ] Uploading launch assets:
  - [ ] upload progress is an Effect `Stream`.
  - [ ] state exit cancels the stream.
  - [ ] pressure counters are visible.
  - [ ] no real sleeps in tests.
- [ ] Requesting approval:
  - [ ] guards and permissions block invalid commands.
  - [ ] persisted snapshot decodes, migrates, and redacts through Schema.
  - [ ] sensitive fields do not leak into traces.
- [ ] Running assistant:
  - [ ] parent flow starts child flows.
  - [ ] progress stream updates through routed events.
  - [ ] proposed tool action enters approval state.
  - [ ] parent cancellation interrupts child streams.
  - [ ] trace/replay/devtools expose graph and receipts.
- [ ] Chatting with the launch assistant:
  - [ ] user prompt input lives in flow context until submitted.
  - [ ] submitted prompt appends a user message to the chat thread resource.
  - [ ] LLM response text arrives as an Effect `Stream` of token or text deltas.
  - [ ] partial assistant text is visible while the stream is active.
  - [ ] `STOP_GENERATION` interrupts the stream and records an interrupt, not a typed failure.
  - [ ] navigating away detaches React subscriptions without duplicating the stream on return.
  - [ ] closing the chat or disposing the actor interrupts active work and runs cleanup finalizers.
  - [ ] trace shows prompt submit, stream start, token deltas, interrupt/complete, resource patch, and cleanup receipts.
- [ ] App-level composition:
  - [ ] a route/screen reads a resource directly without starting the owning flow.
  - [ ] a workflow screen starts a flow and renders observed resources.
  - [ ] app-level view composes multiple module views.

### Testing Plan

- [ ] Direct Effect service tests:
  - [ ] service schemas
  - [ ] typed failures
  - [ ] redaction
  - [ ] RequestResolver batching if used
  - [ ] Clock/TestClock behavior
- [ ] ResourceStore tests:
  - [ ] ensure
  - [ ] refresh
  - [ ] invalidate
  - [ ] patch
  - [ ] stale while visible
  - [ ] previous data on error
  - [ ] placeholder data
  - [ ] subscriptions
- [ ] Flow scenario tests:
  - [ ] project load/edit/save/conflict
  - [ ] dashboard stale/refresh/invalidation
  - [ ] upload stream success/failure/defect/interrupt/cancel
  - [ ] approval permission/invariant/persistence
  - [ ] assistant child flow/progress/approval/replay
  - [ ] chat prompt/streamed-response/stop/offscreen-resubscribe/cleanup
- [ ] App-runtime tests:
  - [ ] `flowTest.app(LaunchApp)` can seed resources and start multiple flows.
  - [ ] traces correlate resources, mutations, flows, streams, timers, and child flows.
- [ ] React smoke tests or build checks:
  - [ ] provider/hook integration compiles.
  - [ ] view projections render without starting unnecessary flows.

### Builder Slice Order

- [ ] Slice 1: create the `examples/launch-workspace` skeleton and mark it as an API proving app in its README.
- [ ] Slice 2: write domain schemas, errors, branded IDs, service interfaces, fixtures, and fake live/test Layers.
- [ ] Slice 3: define all modules, resources, mutations, machines, views, and `LaunchApp` composition with final-looking APIs.
- [ ] Slice 4: write scenario tests as the primary review artifact, even where runtime behavior is stubbed or controlled.
- [ ] Slice 5: wire ResourceStore coverage with seeded project/session/readiness resources.
- [ ] Slice 6: wire Project editor flow, view, mutation transaction, conflict route, and tests.
- [ ] Slice 7: wire Readiness dashboard resources, refresh, invalidation, stale-while-visible view, and tests.
- [ ] Slice 8: wire Assets upload stream, pressure policy, cancellation, complete timer, and tests.
- [ ] Slice 9: wire Approval flow with permissions, persistence, migration, redaction, and tests.
- [ ] Slice 10: wire Assistant parent/child flows, progress stream, proposed action gate, trace, and tests.
- [ ] Slice 11: wire Chat prompt flow, LLM text stream, stop interrupt, offscreen subscription semantics, cleanup receipts, and tests.
- [ ] Slice 12: implement React shell, provider, hooks, tabs/routes, command bar, and thin screen renderers.
- [ ] Slice 13: review API ergonomics and code quality before filling in any heavy runtime semantics.
- [ ] Slice 14: update docs and retire or label old examples.

### Existing Example Retirement

- [ ] Decide whether old example folders remain as legacy snapshots or are retired.
- [ ] If retained, mark them as legacy in `apps/docs/src/pages/examples.md`.
- [ ] Do not update old examples to vNext one by one unless they become slices inside `launch-workspace`.
- [ ] Final docs should steer users to the flagship app as the canonical example.

Acceptance gate:

- [ ] `examples/launch-workspace` covers every final public API listed in `reference-next/lib-api.md`.
- [ ] Old example use cases are represented as coherent screens/flows in one app.
- [ ] The app feels like one product, not a disconnected demo gallery.
- [ ] Tests prove semantics before UI polish.

## Phase 10: Documentation Rebuild

- [ ] Keep `apps/docs/src/pages/reference-next/lib-api.md` as the quick API index.
- [ ] Update vNext docs when implementation choices change:
  - [ ] `reference-next/core.md`
  - [ ] `reference-next/effect-runtime.md`
  - [ ] `reference-next/streams-schedules.md`
  - [ ] `reference-next/tests-and-examples.md`
- [ ] Update `apps/docs/src/pages/examples.md` after the flagship app lands:
  - [ ] final API status
  - [ ] what the flagship app proves
  - [ ] what remains contract-only
  - [ ] links to tests
  - [ ] legacy/retired status for old examples
  - [ ] no stale old syntax
- [ ] Update old `apps/docs/src/pages/reference/*` only if those pages remain visible as current implementation docs.
- [ ] Remove or clearly label old snippets that teach:
  - [ ] `flow.query` as final API
  - [ ] numeric duration fields
  - [ ] primary `AsyncIterable` stream APIs
  - [ ] context-owned canonical API data
  - [ ] Flow-owned assertion helpers
  - [ ] mutating context callbacks

Acceptance gate:

- [ ] Docs nav exposes vNext overview, library API, core API, runtime, streams/schedules, and tests/examples.
- [ ] New docs and the flagship example agree on API names.

## Phase 11: Verification And Closeout

- [ ] After each runtime phase:
  - [ ] run targeted package tests
  - [ ] run type tests if public inference changed
  - [ ] run `pnpm check` when types may have shifted broadly
- [ ] After each flagship slice:
  - [ ] run `examples/launch-workspace` tests
  - [ ] run `examples/launch-workspace` build
  - [ ] run docs snippets/build if docs changed
- [ ] Before final closeout:
  - [ ] `pnpm check`
  - [ ] `pnpm test`
  - [ ] `pnpm build`
  - [ ] `pnpm docs:build`
  - [ ] `pnpm verify`
- [ ] Final review checks:
  - [ ] flagship app does not use `flow.query` except migration notes
  - [ ] flagship app does not use primary `AsyncIterable` stream APIs
  - [ ] flagship app does not use Flow-owned assertion helpers
  - [ ] flagship app does not duplicate canonical resource data in flow context
  - [ ] no final docs teach object-shaped durations; use strings like `"30 seconds"`
  - [ ] no Effect services use `Date.now()`
  - [ ] every advanced example has direct Effect service tests where appropriate
  - [ ] every example has Flow scenario tests

## Replacement Map

| Current / old shape                         | vNext replacement                                                    |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `flow.query` as final read API              | `flow.resource`                                                      |
| machine context owns API data               | ResourceStore owns canonical data; flow context owns process state   |
| `flow.submit` as primary mutation start     | `flow.mutation` definition plus `flow.run` transaction execution     |
| `number` duration fields                    | Human-readable `Duration.Input` strings like `"30 seconds"`          |
| `{ millis: number }` or `{ milliseconds }`  | Human-readable `Duration.Input` strings like `"250 millis"`          |
| primary `AsyncIterable` streams             | `Stream.Stream` primary, async iterable adapter only                 |
| custom pressure names only                  | Effect-aligned `suspend`, `dropping`, `sliding`, `unbounded`, sample |
| manual async iterable test helpers          | Queue/PubSub-backed controlled streams                               |
| manual `_tag` interfaces plus schemas       | `Schema.TaggedErrorClass`, `Schema.TaggedClass`, or `Data` helpers   |
| manual optional branching                   | `Option` internally; null at React/JSON boundaries                   |
| `Date.now()` in Effect code                 | `Clock` / `DateTime`                                                 |
| string-only `flow.schema`                   | Effect `Schema`                                                      |
| manual redaction over unknown values        | `Redacted` / `Schema.Redacted` plus trace redaction policy           |
| manual failure if-chains                    | `Match`, `catchTag(s)`, `catchReason(s)` where clearer               |
| full fake service required everywhere       | partial test layer with missing methods dying loudly                 |
| ad hoc polling/retry intervals              | `Schedule`                                                           |
| JSON stringify as unquestioned key identity | reviewed serializable key / PrimaryKey / Hash / Equal policy         |
| Flow-owned `.expect*` test helpers          | host test runner assertions over harness facts                       |
| mutating `set` callbacks                    | pure `update` reducers                                               |

## Final Definition Of Done

- [ ] One flagship example app is built and old examples are retired or clearly marked legacy.
- [ ] The flagship app compiles against the vNext public API.
- [ ] Runtime and docs use Effect-native names where Effect owns the concept.
- [ ] ResourceStore and OrchestratorSystem are sibling services in one runtime.
- [ ] Resource snapshots are multi-axis.
- [ ] Mutations are traceable transactions.
- [ ] Streams are Effect streams.
- [ ] Tests use `flowTest` plus normal assertions.
- [ ] Docs and flagship app agree.
- [ ] `pnpm verify` passes.
