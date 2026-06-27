# Flow State vNext Rebuild TODO

Goal: rebuild the runtime, docs, and flagship example app around the vNext mental
model in `apps/docs/src/pages/reference-next`.

```txt
Resources model what the app knows.
Flows model what the app is doing.
Views model what the user sees.
Modules make product domains discoverable and composable.
The orchestrator is the actor runtime that keeps long-lived work sane.
```

The current examples are API pressure tests, not syntax authority. Preserve the
problems they prove, but fold them into one cohesive app that teaches the final
API shape: `flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`,
`flow.view`, `flow.app`, `App.layer`, and `flowTest`.

Current implementation note: the package still exposes executable compatibility
through `flow.mutation`, `input`, `effect`, and `flow.run`. New docs and examples
should name the target concepts as `transaction`, `params`, `commit`, `preview`,
`subscribe`, and `unsubscribe`.

## Ground Rules

- [x] Treat `apps/docs/src/pages/reference-next` as the product contract.
- [x] Keep canonical API data in ResourceStore; keep process state in flows; keep render derivation in views.
- [x] Expose Effect-native objects at client-facing call sites where they improve type safety: `Effect`, `Layer`, `Context.Service`, `ManagedRuntime`, `Stream`, `Schedule`, `Duration.Input`, `Clock`, `TestClock`, `Exit`, `Cause`, `Schema`, `Option`, `Result`, `Redacted`, `Queue`, `PubSub`, `Cache`, `RequestResolver`.
- [x] Prefer ergonomic Effect-native examples. For durations, teach strings such as `"30 seconds"`, `"5 minutes"`, and `"250 millis"`.
- [x] Do not create Flow wrappers around Effect concepts just to make the namespace feel uniform.
- [x] Keep Flow-owned names for integration semantics: resource snapshots, flow snapshots, receipts, traces, transactions, `ensure`, `observe`, `patch`, `invalidate`, `commit`, `preview`.
- [x] Preserve bare `guard`, pure `update`, and synchronous `actions` slots for machine ergonomics.
- [x] Do not add Flow-owned assertion helpers such as `.expectState()` or `.expectData()`. Use `flowTest(...)` plus Vitest or `@effect/vitest` assertions.
- [x] Keep the flagship example contract-first and UI-thin. Prove semantics with tests before React polish.
- [x] Use direct Effect service tests for services, schemas, redaction, batching, and typed failures; use Flow scenario tests for resource/orchestrator integration.
- [x] Keep docs, examples, and tests in lockstep after every phase.
- [x] Run targeted checks after each phase; run `pnpm verify` before final closeout.

## Current Done State

These are complete enough to treat as real baseline, not aspiration.

- [x] vNext docs are updated with the current decisions:
  - [x] `flow.transaction` is the target name for writes.
  - [x] `params` is the target schema/input field name.
  - [x] `commit` is the target write function name.
  - [x] `preview` replaces `optimistic`.
  - [x] `flow.stream` source semantics are described as `subscribe`.
  - [x] subscriptions have an explicit `unsubscribe` cleanup.
  - [x] `dispose` is reserved for broader runtime/service/actor lifetime cleanup.
  - [x] OrchestratorSystem is documented as the actor runtime, not a vague helper.
  - [x] Module shape is formalized as a named domain bundle.
- [x] Runtime supports `preview` as the primary patch field.
- [x] Runtime keeps deprecated `optimistic` compatibility while examples move to `preview`.
- [x] Transaction inspector exposes `previewPatches(...)`.
- [x] Launch Workspace exists as `examples/launch-workspace`.
- [x] Launch Workspace has an API inventory that maps target names to current executable compatibility.
- [x] Launch Workspace uses target naming in local domain helpers:
  - [x] `saveProjectTransaction`
  - [x] `saveLaunchProjectParams`
  - [x] `commitLaunchProject`
  - [x] `preview`
  - [x] `subscribeUpload`
  - [x] `subscribeTokens`
  - [x] `unsubscribe`
  - [x] `dispose`
- [x] Launch Workspace has focused scenario tests.
- [x] Launch Workspace package tests pass.
- [x] Launch Workspace package build passes.
- [x] Full workspace `pnpm verify` passed after the preview/commit naming pass.

Still important: much of the target API is contract-shaped or compatibility
backed. The next phases should turn the useful shapes into real, ergonomic APIs.

## Phase 0: Spec Alignment And API Inventory

- [x] Read and pin the vNext contract:
  - [x] `apps/docs/src/pages/reference-next.md`
  - [x] `apps/docs/src/pages/reference-next/lib-api.md`
  - [x] `apps/docs/src/pages/reference-next/core.md`
  - [x] `apps/docs/src/pages/reference-next/effect-runtime.md`
  - [x] `apps/docs/src/pages/reference-next/streams-schedules.md`
  - [x] `apps/docs/src/pages/reference-next/tests-and-examples.md`
- [x] Reconcile existing exported APIs in `packages/flow-state/src/index.ts` against the docs.
- [x] Mark public API names as final, compatibility, or contract-only in Launch Workspace inventory.
- [x] Choose the vNext terminology:
  - [x] `resource.lookup`
  - [x] `transaction.commit`
  - [x] `stream.subscribe`
  - [x] `preview`
  - [x] `params`
  - [x] `unsubscribe`
- [ ] Add package-level type tests for target names before large runtime rewrites.
- [ ] Keep old `apps/docs/src/pages/reference/*` pages as legacy implementation docs unless intentionally updating them.

Acceptance gate:

- [x] A short export/API inventory exists.
- [x] No new example slice starts before final target names are chosen.
- [ ] Type tests fail if target names drift.

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

- [x] Ship descriptor-level shapes for `flow.app`, `App.layer`, stores, orchestrators, modules, resources, transactions, machines, and views.
- [ ] Make those shapes runtime-real:
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
- [ ] Add type tests proving a service-requiring resource/transaction/stream cannot run without a compatible Layer.

### Services

- [x] Launch Workspace services are written around Effect services and Layers.
- [x] Launch Workspace uses named service operations for lookup/commit/subscribe helpers.
- [ ] Add `createPartialTestLayer` or update `createTestLayer` to support partial service fakes that `Effect.die` on missing methods.
- [ ] Add direct service tests for service schemas, typed failures, redaction, and batching where used.

Acceptance gate:

- [ ] A minimal app with one resource, one transaction, one flow, one service Layer, and one React provider smoke path compiles against runtime-real APIs.
- [ ] Runtime disposal has at least one test.

## Phase 2: ResourceStore

### Resource Definition

- [x] `flow.resource` exists and is used by docs/examples.
- [x] Resource definitions use `key`.
- [x] Resource definitions use `lookup`.
- [x] Resource definitions distinguish `key` identity from `tag` invalidation groups.
- [x] Resource examples use `freshness.staleAfter`, `freshness.onInvalidate`, and placeholders where useful.
- [ ] Implement or verify full runtime support for:
  - [ ] `cache.capacity`
  - [ ] `cache.timeToLive`
  - [ ] `freshness.refresh`
  - [ ] dynamic TTL from `Exit` and key if useful
  - [ ] `schema`
- [x] Replace `flow.query` in final Launch Workspace docs/examples.
- [ ] Keep `flow.query` only as a migration alias if needed.
- [ ] Use Effect `Cache` terminology for lookup cache behavior: `lookup`, `capacity`, `timeToLive`.
- [ ] Keep Flow freshness as a separate UI semantic: `fresh`, `stale`, `invalidated`, `expired`.

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
- [ ] Preserve serializable public snapshots; do not expose raw fibers, scopes, Contexts, or Cache maps.

### Resource Identity

- [ ] Decide key identity policy:
  - [ ] strictly serializable key parts
  - [ ] or support `PrimaryKey`, `Equal`, and `Hash` with separate serializable display keys
- [ ] Add collision/serialization tests for primitives, arrays, objects, branded IDs, and invalid keys.

Acceptance gate:

- [ ] Resource tests cover ensure, refresh, invalidate, patch, stale while visible, previous data on error, placeholder data, and subscriptions.
- [ ] A component can read a resource directly without starting a flow.

## Phase 3: Transaction API

Target API:

```ts
flow.transaction({
  params,
  commit,
  preview,
  invalidates,
  concurrency,
});
```

Current implementation compatibility: executable code still uses
`flow.mutation({ input, effect, preview })`.

- [x] Choose `transaction` as the target name for write operations.
- [x] Choose `params` as the target field for validated commit input.
- [x] Choose `commit` as the target field for the write Effect.
- [x] Choose `preview` as the target name for rollbackable local patches.
- [x] Update docs with transaction/params/commit/preview naming.
- [x] Update Launch Workspace examples to use transaction/params/commit/preview terminology around current runtime compatibility.
- [x] Implement `preview` in runtime.
- [x] Keep deprecated `optimistic` compatibility.
- [x] Add rollback tests for preview patches.
- [ ] Implement `flow.transaction` as the primary exported builder.
- [ ] Keep `flow.mutation` as migration alias or compatibility layer.
- [ ] Rename runtime/event labels from mutation to transaction where user-facing.
- [ ] Normalize absence with `Option` in core/runtime where useful, and expose `Option` to client-side code.
- [ ] Transaction receipts must include:
  - [ ] machine event
  - [ ] flow transition
  - [ ] transaction start
  - [ ] preview patch
  - [ ] Effect exit
  - [ ] rollback or commit
  - [ ] invalidation
  - [ ] final route
- [ ] Implement concurrency policies:
  - [ ] `reject-while-running`
  - [ ] `serialize`
  - [ ] `cancel-previous`
  - [ ] `allow`

Acceptance gate:

- [ ] Project save conflict routes from `saving` to `conflict` while canonical project data remains in ResourceStore.
- [ ] A transaction can invalidate resources by ref, tag, and filter.
- [ ] New examples do not teach `input`, `effect`, or `optimistic` as final names.

## Phase 4: Make OrchestratorSystem Useful

Current problem: "orchestrator" is documented, but not yet valuable enough as a
public concept. It should become the actor runtime that owns long-lived flows,
state-scoped Effect work, subscriptions, child actors, deterministic queues, and
cleanup.

### Public Value

- [x] Document OrchestratorSystem as the actor runtime.
- [ ] Define the user-facing reason to reach for it:
  - [ ] start a machine actor by stable id
  - [ ] send events through a serialized mailbox
  - [ ] read snapshots without knowing machine internals
  - [ ] subscribe/unsubscribe to actor snapshots
  - [ ] keep selected actors alive while UI routes detach
  - [ ] dispose actors and interrupt scoped work
  - [ ] supervise child actors
  - [ ] expose receipts/issues/traces for actor-owned work
- [ ] Decide if public docs should keep `OrchestratorSystem` or introduce a friendlier public alias such as `ActorSystem` while keeping internals named orchestrator.

### Ergonomic API Sketch

- [ ] Add `flow.orchestrators.live({ retention, supervision, tracing })`.
- [ ] Add `flow.orchestrators.test({ clock, scheduler, deterministicIds })`.
- [ ] Add an actor handle shape:
  - [ ] `id`
  - [ ] `send(event)`
  - [ ] `snapshot()`
  - [ ] `subscribe(listener): unsubscribe`
  - [ ] `dispose()`
  - [ ] `children()`
  - [ ] `receipts()`
  - [ ] `issues()`
- [ ] Add runtime entrypoints:
  - [ ] `runtime.orchestrators.start(machine, { id, params, policy })`
  - [ ] `runtime.orchestrators.get(id)`
  - [ ] `runtime.orchestrators.stop(id)`
  - [ ] `runtime.orchestrators.snapshot(id)`
- [ ] Add retention policies:
  - [ ] `while-subscribed`
  - [ ] `keep-alive`
  - [ ] `route-scoped`
  - [ ] `manual`
- [ ] Add supervision policies:
  - [ ] interrupt children on parent dispose
  - [ ] bubble child failure as parent issue
  - [ ] restart child stream/effect when explicitly configured

### Runtime Semantics

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
- [ ] Implement or align:
  - [ ] `flow.ensure(resourceRef, handlers)`
  - [ ] `flow.observe(resourceRef)`
  - [ ] `flow.refresh(resourceRef)`
  - [ ] `flow.run(transactionRef, handlers)`
  - [ ] `flow.invalidate(target)`
  - [ ] `flow.patch(resourceRef, patch)`
  - [ ] `flow.child(machine, options)`
- [ ] Enforce the distinction:
  - [ ] `ensure = process dependency`
  - [ ] `observe = data dependency`
- [ ] Effects, streams, resources, timers, and child flows run after transition selection through scoped Effect fibers.

Acceptance gate:

- [ ] Project Editor loads via `ensure`, views via `observe`, and refreshes without leaving semantic `viewing` unless the flow chooses to route.
- [ ] Flow context does not duplicate canonical project/comments data.
- [ ] Disposing a parent actor interrupts active streams, timers, transactions, and child actors.
- [ ] React route detach can unsubscribe without necessarily disposing the actor.

## Phase 5: Make Modules Useful

Current problem: a module can look like "just an object." It should become the
domain manifest that makes apps discoverable, testable, composable, and toolable.

### Public Value

- [x] Document module shape as a named domain bundle.
- [x] Launch Workspace groups resources, transactions, machines, streams, and views into product modules.
- [ ] Define module guarantees:
  - [ ] stable module id/name
  - [ ] typed namespace for public resources, transactions, machines, streams, views
  - [ ] dependency declaration
  - [ ] module-level tags
  - [ ] module-level schemas/errors
  - [ ] module-level test fixtures
  - [ ] module-level permissions/policies where useful
- [ ] Explain when modules help:
  - [ ] app composition
  - [ ] code search and docs generation
  - [ ] devtools grouping
  - [ ] test fixture setup
  - [ ] feature ownership
  - [ ] preventing id/tag collisions
  - [ ] generating typed refs and hooks later

### Ergonomic API Sketch

- [ ] Keep object-literal modules for simple cases:

```ts
const Project = flow.module("Project", {
  resources,
  transactions,
  machines,
  streams,
  views,
});
```

- [ ] Consider a builder form only if it improves inference:

```ts
const Project = flow.module("Project", ({ resource, transaction, machine, view }) => ({
  resources: {
    byId: resource(projectById),
  },
  transactions: {
    save: transaction(saveProject),
  },
  machines: {
    editor: machine(projectEditor),
  },
  views: {
    editor: view(projectEditorView),
  },
}));
```

- [ ] Expose module refs ergonomically:
  - [ ] `Project.resources.byId`
  - [ ] `Project.transactions.save`
  - [ ] `Project.machines.editor`
  - [ ] `Project.views.editor`
  - [ ] `Project.tags.project(projectId)`
- [ ] Make `flow.app({ modules })` validate:
  - [ ] duplicate module ids
  - [ ] duplicate resource keys/tags where statically visible
  - [ ] missing dependencies
  - [ ] invalid module dependency cycles where applicable
- [ ] Add module-driven docs/devtools inventory:
  - [ ] list resources by module
  - [ ] list transactions by module
  - [ ] list actors by module
  - [ ] list views by screen
  - [ ] list tests/fixtures by module

Acceptance gate:

- [ ] A new reader can open Launch Workspace and understand feature ownership from module exports.
- [ ] `flowTest.app(LaunchApp)` can seed module fixtures without hand-wiring every resource.
- [ ] Devtools/docs can render a useful app map from module metadata.

## Phase 6: Streams, Schedules, And Time

### Stream API

- [x] Choose `subscribe` as the target source name.
- [x] Choose `unsubscribe` as the cleanup returned by a subscription.
- [x] Keep `dispose` for larger runtime/service/actor lifetimes.
- [x] Launch Workspace stream helpers use `subscribe*` naming around current runtime compatibility.
- [ ] Change `flow.stream` to use `Stream.Stream<A, E, R>` as the primary source.
- [ ] Keep async iterable only as an adapter via `Stream.fromAsyncIterable`.
- [ ] Replace final example service APIs returning `AsyncIterable` with Effect `Stream`.
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
- [x] Stop documenting object-shaped duration examples in vNext docs.
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

## Phase 7: Schemas, Errors, Redaction, Persistence

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

- [ ] Checkout/approval persistence decodes, migrates, and redacts through Schema.
- [ ] Agent traces demonstrate redacted values do not leak.
- [ ] Tests cover decode failure, migration, redaction, typed failure, defect, and interrupt.

## Phase 8: Views And React

- [x] Launch Workspace uses `flow.view` style read models as the intended UI boundary.
- [ ] Make `flow.view` central in runtime-real examples.
- [ ] Views must be pure UI read models over resource snapshots and one or more flow snapshots.
- [ ] Views should combine multiple flows when a screen needs one coherent app-level render model.
- [ ] Views should significantly simplify runtime data before it reaches components.
- [ ] Views must not fetch, mutate, invalidate, or start workflow work.
- [ ] Implement or align React APIs:
  - [ ] `FlowProvider`
  - [ ] `flow.useResource(ref)`
  - [ ] `flow.use(machine, { params })`
  - [ ] `flow.useView(view)`
  - [ ] `flow.can(actorOrSnapshot, event)`
  - [ ] optional `match` helpers over snapshots
- [ ] Ensure dumb components can use ResourceStore directly.
- [ ] Ensure workflow screens can use a flow actor plus observed resources.
- [ ] Let React boundary code use `Option` and other Effect-native objects directly when that reduces conversion noise.

Acceptance gate:

- [ ] Project breadcrumb reads `Project.byId(projectId)` without starting `Project.editor`.
- [ ] Project editor screen uses `Project.editor` and renders observed resources.
- [ ] Launch overview view combines project, readiness, assets, approval, assistant, and chat state into one UI model.
- [ ] Chat view exposes streamed text, interrupt state, and subscription/cleanup status without leaking raw stream internals.

## Phase 9: Test Harness

- [x] Keep `flowTest(flow)` as the focused flow harness.
- [x] Launch Workspace uses focused scenario tests as the main proof surface.
- [ ] Add `flowTest.app(App)` for resource + flow app-runtime tests.
- [ ] Harness exposes facts and controls only:
  - [ ] `.provide(layer)`
  - [ ] `.start(params)`
  - [ ] `.send(event)`
  - [ ] `.flush()`
  - [ ] `.settle(bounds)`
  - [ ] `.advance(duration)`
  - [ ] `.state()`
  - [ ] `.context()`
  - [ ] `.snapshot()`
  - [ ] `.can(event)`
  - [ ] `.resources()`
  - [ ] `.transactions()`
  - [ ] `.streams()`
  - [ ] `.timers()`
  - [ ] `.receipts()`
  - [ ] `.issues()`
  - [ ] `.trace()`
- [x] Do not add `.expectState`, `.expectData`, `.expectResource`, or equivalent assertion wrappers.
- [ ] `flush()` drains work ready now only.
- [ ] `settle(bounds)` is broader and must fail with diagnostics when bounds are hit.
- [ ] `advance(duration)` uses Effect `TestClock`.
- [ ] Add direct Effect service tests with `@effect/vitest` where services/schemas are the behavior under test.

Acceptance gate:

- [ ] The flagship app has app-runtime scenario tests with `flowTest.app`.
- [x] The flagship app uses no Flow-owned assertion helpers.

## Phase 10: Launch Workspace Baseline

Purpose: one realistic app that covers the full Flow API and Effect-native
patterns in a single product surface.

```txt
Launch Workspace
  A team edits a launch project, tracks live readiness metrics, uploads launch
  assets, requests budget/legal approval, and runs an assistant that breaks work
  into child tasks.
```

### Prebuild Contract

- [x] Build mode decision:
  - [x] this phase builds a fully wired API proving app, not a fully working product app
  - [x] the app must compile and present final-looking module, service, resource, transaction, flow, view, test, and React hook patterns
  - [x] runtime behavior may be fake, controlled, stubbed, or contract-only where the API is still being finalized
  - [x] tests and code review are the main proof surface; UI polish is secondary
  - [x] no real backend, auth, file upload service, LLM provider, production persistence, or polished product workflow is required in this phase
  - [x] stubs are acceptable only when they preserve the final API shape and make missing runtime semantics explicit
- [x] Package and route shape:
  - [x] package path is `examples/launch-workspace`
  - [x] primary route is one launch workspace shell, not a demo gallery
  - [x] routes or tabs are `Overview`, `Editor`, `Assets`, `Approval`, `Assistant`, `Chat`, and `Trace`
  - [x] a command bar models `flow.can(...)` style enable/disable semantics
- [x] Product entities exist in domain code.
- [x] App services exist for the launch-workspace product surface.
- [x] Screen ownership is documented.
- [x] Every public API in the vNext inventory is assigned to a module, screen, and test or marked contract-only.
- [x] Each screen has scenario coverage before React polish.

### App Modules

- [x] `Session` module is represented.
- [x] `Project` module is represented.
- [x] `Checklist` module is represented.
- [x] `Readiness` module is represented.
- [x] `Assets` module is represented.
- [x] `Approval` module is represented.
- [x] `Assistant` module is represented.
- [x] `Chat` module is represented.
- [x] `LaunchApp` composition is represented.
- [ ] Promote module representations from descriptor/proof shape to runtime-real module APIs.

### Required API Coverage

- [x] `flow.module`
- [x] `flow.resource`
- [x] `flow.transaction` target name through `flow.mutation` compatibility
- [x] `flow.machine`
- [x] `flow.view`
- [x] `flow.app`
- [x] `App.layer`
- [x] `flow.runtime`
- [x] `flow.ensure`
- [x] `flow.observe`
- [x] `flow.refresh`
- [x] transaction execution through current `flow.run`
- [x] `flow.patch`
- [x] `flow.invalidate`
- [x] `flow.stream`
- [x] `flow.after`
- [x] `flow.child`
- [x] `flow.can`
- [x] `flow.useResource`
- [x] `flow.use`
- [x] `flow.useView`
- [x] `flowTest`
- [ ] `flowTest.app`
- [x] `createControlledEffect`
- [x] `createControlledStream`

### Builder Slice Order

- [x] Slice 1: create `examples/launch-workspace` skeleton and mark it as an API proving app in its README.
- [x] Slice 2: write domain schemas, errors, branded IDs, service interfaces, fixtures, and fake live/test Layers.
- [x] Slice 3: define modules, resources, transactions, machines, views, and `LaunchApp` composition with final-looking APIs.
- [x] Slice 4: write scenario tests as the primary review artifact.
- [x] Slice 5: wire ResourceStore coverage with seeded project/session/readiness resources.
- [x] Slice 6: wire Project editor flow, view, transaction, preview rollback, conflict route, and tests.
- [ ] Slice 7: wire Readiness dashboard resources, refresh, invalidation, stale-while-visible view, and tests.
- [ ] Slice 8: wire Assets upload stream, pressure policy, cancellation, complete timer, and tests.
- [ ] Slice 9: wire Approval flow with permissions, persistence, migration, redaction, and tests.
- [ ] Slice 10: wire Assistant parent/child flows, progress stream, proposed action gate, trace, and tests.
- [ ] Slice 11: wire Chat prompt flow, LLM text stream, stop interrupt, offscreen subscription semantics, cleanup receipts, and tests.
- [x] Slice 12: implement React shell, provider-shaped hooks, tabs/routes, command bar, and thin screen renderers.
- [x] Slice 13: review API ergonomics and code quality before filling in heavy runtime semantics.
- [x] Slice 14: update docs and label old examples/status where needed.

Acceptance gate:

- [x] `examples/launch-workspace` covers every final public API listed in the vNext inventory.
- [x] Old example use cases are represented as coherent screens/flows in one app.
- [x] The app feels like one product, not a disconnected demo gallery.
- [x] Tests prove current semantics before UI polish.
- [ ] Runtime-real implementations exist for the contract-only surfaces.

## Phase 11: Advanced API Pressure Features

These features are intentionally more ambitious than the current baseline. They
should be built TDD-first in Launch Workspace to force the underbaked APIs to
become useful.

### Feature 1: Background Chat Lifecycles

Why first: it stresses streams, orchestrator retention, subscriptions, cleanup,
interrupts, receipts, and React route detach in one understandable workflow.

- [ ] Test first:
  - [ ] starting assistant reply creates one stream actor
  - [ ] navigating away unsubscribes React without stopping the actor
  - [ ] navigating back reuses the same actor and does not duplicate tokens
  - [ ] `STOP_GENERATION` interrupts the stream and records interrupt, not typed failure
  - [ ] closing chat disposes the actor and runs cleanup finalizers
- [ ] Build:
  - [ ] actor retention policy for chat response
  - [ ] stream generation id/deduping
  - [ ] `subscribe`/`unsubscribe` receipts
  - [ ] `dispose` receipts
  - [ ] chat view showing partial text, active state, and cleanup state
- [ ] API pressure:
  - [ ] `flow.stream`
  - [ ] `stream.subscribe`
  - [ ] `unsubscribe`
  - [ ] OrchestratorSystem actor retention
  - [ ] `flow.use`
  - [ ] `flowTest.streams()`
  - [ ] `flowTest.issues()`

### Feature 2: Offline Save Queue With Undo

- [ ] Test first:
  - [ ] editing offline applies a `preview` patch
  - [ ] commit is queued while offline
  - [ ] undo before reconnect rolls back preview and removes queued commit
  - [ ] reconnect serializes queued commits
  - [ ] conflict preserves draft and exposes a typed issue
- [ ] Build:
  - [ ] offline queue service
  - [ ] transaction receipt per queued commit
  - [ ] rollback path independent from server commit
  - [ ] conflict lane in editor view
- [ ] API pressure:
  - [ ] `flow.transaction`
  - [ ] `params`
  - [ ] `commit`
  - [ ] `preview`
  - [ ] concurrency policy
  - [ ] ResourceStore transaction/patch
  - [ ] typed failures

### Feature 3: Assistant Run Supervisor

- [ ] Test first:
  - [ ] parent assistant actor starts child task actors
  - [ ] child typed failure becomes parent issue
  - [ ] retry starts only the failed child
  - [ ] parent dispose interrupts all children
  - [ ] approval gate pauses proposed tool action
- [ ] Build:
  - [ ] child actor registry
  - [ ] supervision receipts
  - [ ] retry/approval events
  - [ ] assistant graph view
- [ ] API pressure:
  - [ ] `flow.child`
  - [ ] OrchestratorSystem supervision
  - [ ] nested snapshots
  - [ ] `issues()`
  - [ ] `receipts()`

### Feature 4: Multi-Actor Launch Room

- [ ] Test first:
  - [ ] two user actors observe one project resource
  - [ ] local draft stays local to each editor actor
  - [ ] remote comment stream patches shared resource
  - [ ] permission update disables an action through `flow.can`
  - [ ] disposing one actor does not clear shared ResourceStore data
- [ ] Build:
  - [ ] launch room fixture with two current users
  - [ ] shared resources and per-actor process state
  - [ ] remote comment subscription
  - [ ] permissioned command bar
- [ ] API pressure:
  - [ ] ResourceStore shared cache
  - [ ] OrchestratorSystem multiple actors
  - [ ] module tags
  - [ ] `flow.can`
  - [ ] `flow.useResource`

### Feature 5: Cross-Resource Readiness Graph

- [ ] Test first:
  - [ ] project, assets, approval, support, and metrics feed one readiness view
  - [ ] invalidating one tag refreshes only affected nodes
  - [ ] stale data remains visible while refresh runs
  - [ ] duplicate graph node lookups dedupe through cache
- [ ] Build:
  - [ ] readiness dependency graph
  - [ ] tag/ref/filter invalidation examples
  - [ ] stale-visible dashboard
  - [ ] graph receipts
- [ ] API pressure:
  - [ ] `key` vs `tag`
  - [ ] cache sharing
  - [ ] freshness
  - [ ] invalidation filters
  - [ ] `flow.view`

### Feature 6: Permissioned Approval Ledger

- [ ] Test first:
  - [ ] requester, approver, and viewer see different redacted snapshots
  - [ ] denied command records permission reason
  - [ ] approval snapshot persists and migrates
  - [ ] trace never leaks redacted budget/customer data
- [ ] Build:
  - [ ] permission service
  - [ ] schema-backed approval ledger
  - [ ] redacted trace projection
  - [ ] approval receipts
- [ ] API pressure:
  - [ ] `Schema`
  - [ ] `Redacted`
  - [ ] persistence
  - [ ] `flow.can`
  - [ ] receipt redaction

### Feature 7: Virtual-Time Upload Failure Lab

- [ ] Test first:
  - [ ] upload stalls, retries, samples progress, and eventually succeeds
  - [ ] typed upload failure routes to retryable state
  - [ ] defect routes to issue lane
  - [ ] cancel interrupts stream and timers
  - [ ] tests use no real sleeps
- [ ] Build:
  - [ ] controlled upload stream
  - [ ] retry schedule
  - [ ] pressure counters
  - [ ] virtual-time lab screen in Trace or Assets
- [ ] API pressure:
  - [ ] `Stream`
  - [ ] `Schedule`
  - [ ] `Duration.Input`
  - [ ] `TestClock`
  - [ ] `flow.after`
  - [ ] interrupt vs failure lanes

### Feature 8: Persistent Workspace Restore

- [ ] Test first:
  - [ ] browser refresh restores serializable resources and selected actor snapshots
  - [ ] fibers, scopes, streams, timers, and service handles are not persisted
  - [ ] stale restored resources can refresh after boot
  - [ ] schema migration upgrades older snapshots
- [ ] Build:
  - [ ] snapshot schema/version
  - [ ] app/module persistence manifest
  - [ ] restore boot path
  - [ ] migration and redaction tests
- [ ] API pressure:
  - [ ] modules as persistence manifests
  - [ ] ResourceStore serialization
  - [ ] actor snapshot serialization
  - [ ] runtime disposal
  - [ ] schema migration

Acceptance gate:

- [ ] Every advanced feature starts with failing tests.
- [ ] Each feature has at least one API improvement or hard limitation documented.
- [ ] OrchestratorSystem and modules are exercised by real workflows, not only definitions.

## Phase 12: Documentation Rebuild

- [x] Keep `apps/docs/src/pages/reference-next/lib-api.md` as the quick API index.
- [x] Update vNext docs when implementation choices changed:
  - [x] `reference-next/core.md`
  - [x] `reference-next/effect-runtime.md`
  - [x] `reference-next/streams-schedules.md`
  - [x] `reference-next/tests-and-examples.md`
- [x] Update `apps/docs/src/pages/examples.md` or example-local docs after Launch Workspace naming changes.
- [ ] Update old `apps/docs/src/pages/reference/*` only if those pages remain visible as current implementation docs.
- [ ] Remove or clearly label old snippets that teach:
  - [ ] `flow.query` as final API
  - [ ] numeric duration fields
  - [ ] primary `AsyncIterable` stream APIs
  - [ ] context-owned canonical API data
  - [ ] Flow-owned assertion helpers
  - [ ] mutating context callbacks
  - [ ] `input`/`effect`/`optimistic` as final transaction names

Acceptance gate:

- [ ] Docs nav exposes vNext overview, library API, core API, runtime, streams/schedules, and tests/examples.
- [ ] New docs and the flagship example agree on API names.

## Phase 13: Verification And Closeout

- [x] After the preview/commit naming pass:
  - [x] `pnpm --filter @flow-state/launch-workspace test -- --run`
  - [x] `pnpm --filter @flow-state/launch-workspace build`
  - [x] `pnpm verify`
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

| Current / old shape                         | vNext replacement                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `flow.query` as final read API              | `flow.resource`                                                        |
| machine context owns API data               | ResourceStore owns canonical data; flow context owns process state     |
| `flow.submit` as primary write start        | `flow.transaction` definition plus state-side transaction execution    |
| `flow.mutation` as final write API          | `flow.transaction`, with `flow.mutation` as compatibility if kept      |
| `input` on transactions                     | `params`                                                               |
| `effect` on transactions                    | `commit`                                                               |
| `optimistic`                                | `preview`                                                              |
| stream source field named `stream`          | `subscribe`                                                            |
| stream cleanup hidden or informal           | explicit `unsubscribe`; actor/runtime cleanup uses `dispose`           |
| `number` duration fields                    | human-readable `Duration.Input` strings like `"30 seconds"`            |
| `{ millis: number }` or `{ milliseconds }`  | human-readable `Duration.Input` strings like `"250 millis"`            |
| primary `AsyncIterable` streams             | `Stream.Stream` primary, async iterable adapter only                   |
| custom pressure names only                  | Effect-aligned `suspend`, `dropping`, `sliding`, `unbounded`, `sample` |
| manual async iterable test helpers          | Queue/PubSub-backed controlled streams                                 |
| manual `_tag` interfaces plus schemas       | `Schema.TaggedErrorClass`, `Schema.TaggedClass`, or `Data` helpers     |
| manual optional branching                   | `Option` where helpful, including client-side code                     |
| null-only React boundary policy             | Effect-native objects are allowed when they reduce conversion noise    |
| `Date.now()` in Effect code                 | `Clock` / `DateTime`                                                   |
| string-only `flow.schema`                   | Effect `Schema`                                                        |
| manual redaction over unknown values        | `Redacted` / `Schema.Redacted` plus trace redaction policy             |
| manual failure if-chains                    | `Match`, `catchTag(s)`, `catchReason(s)` where clearer                 |
| full fake service required everywhere       | partial test layer with missing methods dying loudly                   |
| ad hoc polling/retry intervals              | `Schedule`                                                             |
| JSON stringify as unquestioned key identity | reviewed serializable key / PrimaryKey / Hash / Equal policy           |
| Flow-owned `.expect*` test helpers          | host test runner assertions over harness facts                         |
| mutating `set` callbacks                    | pure `update` reducers                                                 |

## Final Definition Of Done

- [ ] One flagship example app is built and old examples are retired or clearly marked legacy.
- [ ] The flagship app compiles against the vNext public API.
- [ ] Runtime and docs use Effect-native names where Effect owns the concept.
- [ ] ResourceStore and OrchestratorSystem are sibling services in one runtime.
- [ ] OrchestratorSystem is useful as an actor runtime, not just a descriptor.
- [ ] Modules are useful as domain manifests, not just arbitrary objects.
- [ ] Resource snapshots are multi-axis.
- [ ] Transactions are traceable commits with preview/rollback semantics.
- [ ] Streams are Effect streams with explicit subscribe/unsubscribe lifecycle.
- [ ] Tests use `flowTest` plus normal assertions.
- [ ] Docs and flagship app agree.
- [ ] `pnpm verify` passes.
