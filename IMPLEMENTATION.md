# Flow State Implementation Plan

This plan is the contract for rebuilding `packages/flow-state` into a working library. The source of truth is the documented API surface in [API](apps/docs/src/pages/reference/api.md), [Resources](apps/docs/src/pages/reference/resources.md), [Runtime](apps/docs/src/pages/reference/runtime.md), [Transactions](apps/docs/src/pages/reference/transactions.md), [Machines](apps/docs/src/pages/reference/machines.md), [Streams And Time](apps/docs/src/pages/reference/streams-time.md), [Views And React](apps/docs/src/pages/reference/views-react.md), the current docs status in [Status](apps/docs/src/pages/reference/status.mdx), and the executable contract in [launchWorkspace.test.ts](examples/launch-workspace/src/launchWorkspace.test.ts). The current implementation is disposable unless it proves a useful behavior with a focused test.

The old `packages/flow-state/src` code has been deleted. The goal is to rebuild the runtime with small Effect-native modules, TDD each semantic slice, and keep the Launch Workspace example green as the acceptance proof.

## Current Decision

- [ ] Preserve the finalized API shape: `flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`, `flow.view`, `flow.app`, `App.layer`, `flow.runtime`, `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.run`, `flow.patch`, `flow.invalidate`, `flow.stream`, `flow.after`, `flow.child`, `flow.can`, `flow.useResource`, `flow.use`, `flow.useView`, `flowTest`, `flowTest.app`, `createControlledEffect`, and `createControlledStream`.
- [x] Rebuild `packages/flow-state/src/index.ts` as a barrel and small public assembly file, not as the implementation home.
- [ ] Use Effect as the runtime substrate: `Effect`, `Layer`, `Context.Service`, `ManagedRuntime`, `Scope`, `Stream`, `Schedule`, `Duration.Input`, `Clock`/`TestClock`, `Deferred`, `Queue`, `PubSub`, `Semaphore`, `Exit`, `Cause`, `Option`, `Schema`, `Data`, `Brand`, and `Redacted`.
- [ ] Use `@tanstack/store` as the internal synchronous store primitive for ResourceStore and actor snapshots.
- [ ] Wrap TanStack Store behind an internal selection source: `getSnapshot`, `subscribe`, `update`, selector/equality helpers, and scoped notification batching.
- [ ] Target React 18 and React 19 only. Import `useSyncExternalStore` from `react`; do not add `use-sync-external-store` unless the selected-source bridge fails its tests.
- [ ] Use the Zustand default bridge pattern for React: native `useSyncExternalStore(source.subscribe, source.getSnapshot, source.getServerSnapshot ?? source.getSnapshot)`.
- [ ] Use an internal selected source for selector equality, Zustand `subscribeWithSelector` style. Do not start with `useSyncExternalStoreWithSelector`.
- [ ] Reserve the TanStack Query observer bridge pattern for future rich observers that own lifecycle, optimistic results, suspense, or error-boundary behavior. Do not use it for simple resource or actor reads.
- [ ] Do not clone TanStack Store. Reuse it through a narrow adapter and keep library semantics above it.
- [ ] Do not Effect-wrap every TanStack Store operation. Plain synchronous `get`/`setState`/`subscribe` calls are fine inside the store service; service methods, mutations, scoped subscriptions, and lifecycle cleanup are the Effect boundary.
- [ ] Treat XState as the statechart behavior reference, not a package dependency or hidden runtime dependency.
- [ ] Keep `flow.view` advanced and sparing. Views are for significant projection, multi-machine joins, or stable UI read models. Normal UI should read resources and actor snapshots directly.
- [ ] Remove the legacy mutation surface. Do not implement `flow.mutation`, `flow.query`, `mutation-compat.ts`, `input`, `effect`, `optimistic`, or user-facing `mutation:*` receipts.
- [ ] Park offline queue/replay/undo as a future capability. Existing launch-workspace queue tests should be quarantined, skipped, or rewritten as future fixtures unless the API is intentionally restored.
- [ ] Keep the immediate integration target on a client-owned runtime boundary first. Flow State should run cleanly inside a Next.js App Router `"use client"` entry before wider SSR/RSC semantics are claimed.
- [ ] Reopen the previously deferred integration work that is now required by the flagship example follow-up: request-scoped runtime ownership, runtime serialization/rehydration, SSR hydration boundary, and a future RSC loader/runtime split. These belong to dedicated later phases, not ad hoc feature creep.
- [ ] `App.layer`, `flow.store.*`, and `flow.orchestrators.*` must either change runtime behavior materially or be narrowed so the docs stop implying semantics that the runtime ignores.
- [ ] Public/runtime/provider error surfaces should converge on one tagged diagnostic convention with stable ids, short summaries, help text, and preserved `Cause` details.
- [ ] Treat phase numbers as planning-only language. Durable filenames, internal helper modules, comments, and steady-state test titles should describe behavior or ownership instead.
- [ ] The first coding pass starts with the Effect abstraction design pass, then Phase 1 only: descriptor and public type surface. No ResourceStore, runtime behavior, actors, transactions, streams, timers, React hooks, or launch-workspace runtime fixes in that pass.

## Non-Negotiable Quality Bar

Use `skills/thermo-nuclear-code-quality-review/SKILL.md` as the review bar for every phase.

- [ ] No file drifts toward 1,000 lines.
- [ ] No Promise-first internal runtime where Effect can model the operation.
- [ ] No parallel dependency injection system beside Effect `Layer` and `Context.Service`.
- [ ] No erased `Effect<A, E, R>` channels at public or service boundaries.
- [ ] No thrown expected failures; typed failures stay in the Effect error channel.
- [ ] No `Date.now()` or real sleeps in tests.
- [ ] No unscoped fibers, streams, timers, subscriptions, or child actors.
- [ ] No React ownership of core runtime semantics.
- [ ] No global batching that can cross actor/resource transaction boundaries.
- [ ] No public `any`, `as never`, or broad `unknown` escape hatches.
- [ ] No public config surface whose documented options are silently ignored at runtime.
- [ ] No generic library-facing `throw new Error(...)` when a tagged Flow diagnostic can explain the failure with code, context, and help text.
- [ ] No accidental example/docs code in the published core bundle; keep package exports tree-shakeable and sourcemapped.
- [ ] No wrapper around Effect features unless the library adds resource, transaction, machine, trace, or UI read-model semantics.
- [ ] No Effect ceremony around local synchronous snapshot reads. Use `Effect.sync` and scoped finalizers where operations cross service, mutation, subscription, or lifecycle boundaries.

## Out Of Scope

These should not be implemented in the core rebuild unless a later document explicitly reopens them with tests, API rationale, and a user-facing need.

- [ ] `flow.mutation`, `flow.query`, `mutation-compat.ts`, `input`, `effect`, `optimistic`, and user-facing `mutation:*` receipts.
- [ ] Offline queue, replay-on-reconnect, undo queue, paused mutation queues, or background sync. Transactions should be live Effect operations first.
- [ ] A runtime-real implementation of every example concept. The example app should prove API usage and app-core behavior, not force every future feature into the first library pass.
- [ ] `xstate` as a runtime dependency, full XState compatibility, SCXML semantics, parallel states, history states, deep statechart serialization, or imported XState machines.
- [ ] Duplicating TanStack Store core, copying Alien Signals, global batch depth, action stores, or Promise-first async atoms.
- [ ] TanStack Query clone behavior: query keys, query observers, retry managers, stale-time defaults, focus/online managers, or cache garbage collection unless Flow resources need a narrower version.
- [ ] Full Suspense reads, Error Reset Boundary, generic Server Actions integration, or streaming pending promise hydration before request-scoped runtime boot and serialization are stable.
- [ ] React 16/17 compatibility shims for external stores.
- [ ] Devtools, timeline UI, browser inspection panels, persistence adapters, storage sync, broadcast-channel sync, or cross-tab coordination.
- [ ] Model-based browser/SUT runners, fuzzing, graph visualizers, or replay UI before simple path generation and trace receipts work.
- [ ] A separate `@flow-state/react` package split during the first rebuild. Keep the code modular enough to split later.
- [ ] Compatibility migrations for old docs/examples. Old surfaces should be deleted or marked historical, not kept working silently.

## Reopened Deferred Work

These items were previously deferred, but are now active follow-up work because the flagship example, docs honesty, and review findings need them.

- [x] Request-scoped runtime ownership for server-rendered app shells.
- [x] Public runtime snapshot serialization/rehydration for resources, actors, timers, streams, and child state.
- [x] SSR hydration boundary and a deliberate future RSC loader/runtime split.
- [x] Runtime-real `flow.ensure`, `flow.observe`, `flow.refresh`, and `flow.invalidate` for the supported subset.
- [x] Clear `App.layer`, `flow.store.*`, and `flow.orchestrators.*` semantics rather than nominal descriptors with ignored fields.
- [x] A dedicated error-quality phase for stable diagnostic codes, helpful messages, and preserved `Cause` detail.
- [ ] Do not reopen offline queue, replay, or undo in these phases.

## Target Module Layout

```txt
packages/flow-state/src/
  index.ts                         # exports only
  public/
    flow.ts                        # public flow namespace assembly
    types.ts                       # public types and branded ids
    keys.ts                        # createKey/createTag/state paths
  descriptors/
    resource.ts
    transaction.ts
    machine.ts
    stream.ts
    timer.ts
    child.ts
    view.ts
    module.ts
    app.ts
  services/
    resource-store.ts              # Context.Service interface
    orchestrator-system.ts         # Context.Service interface
    trace.ts
    host-signals.ts
  runtime/
    app-layer.ts                   # App.layer -> Effect Layer
    managed-runtime.ts             # flow.runtime/createRuntime
    lifecycle.ts                   # Scope, finalizers, disposal
  store/
    selection-source.ts            # Flow adapter over @tanstack/store
    selected-source.ts             # selector/equality wrapper over selection-source
    notification-batch.ts
    resource-store-memory.ts
    resource-snapshot.ts
    invalidation.ts
    hydration.ts
  orchestrator/
    actor.ts
    machine-runner.ts
    transition.ts
    guards.ts
    invokes.ts
    children.ts
    streams.ts
    timers.ts
    mailbox.ts
  transactions/
    transaction-runner.ts
    preview-patches.ts
    concurrency.ts
    receipts.ts
  testing/
    flow-test.ts
    controlled-effect.ts
    controlled-stream.ts
    inspectors.ts
    virtual-clock.ts
    model.ts
  react/
    provider.tsx
    use-resource.ts
    use-actor.ts
    use-view.ts
```

## React Bridge Decision

Use this source shape for every React-readable value:

```ts
type SelectionSource<T> = {
  getSnapshot: () => T;
  getServerSnapshot?: () => T;
  subscribe: (listener: () => void) => () => void;
};
```

The base hook uses React 18/19's native bridge:

```ts
function useSource<T>(source: SelectionSource<T>): T {
  return React.useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getServerSnapshot ?? source.getSnapshot,
  );
}
```

Selectors are implemented by wrapping a source, not by adding `use-sync-external-store` up front:

```ts
function selectSource<T, S>(
  source: SelectionSource<T>,
  selector: (value: T) => S,
  equal: (previous: S, next: S) => boolean = Object.is,
): SelectionSource<S> {
  let current = selector(source.getSnapshot());

  return {
    getSnapshot: () => current,
    getServerSnapshot: source.getServerSnapshot
      ? () => selector(source.getServerSnapshot!())
      : undefined,
    subscribe: (notify) =>
      source.subscribe(() => {
        const next = selector(source.getSnapshot());
        if (!equal(current, next)) {
          current = next;
          notify();
        }
      }),
  };
}
```

This is intentionally closer to Zustand's default bridge plus `subscribeWithSelector` than to TanStack Query's observer bridge. TanStack Query's observer pattern remains useful later for rich runtime observers that own optimistic results, suspense, error reset, or lifecycle policy.

## Effect Abstraction Design Pass

Before implementing Phase 1, spend one short design pass identifying the reusable Effect-native concerns that will keep the codebase small, testable, debuggable, and fast. This pass should produce tests or typed design sketches only; it should not build runtime behavior.

The intent is not to wrap every Effect API. The intent is to identify reusable internal concerns where the library adds semantics: resource state, actor lifetime, transactions, traces, test controls, and UI read models. Do not lock in names during this pass unless the implementation needs them.

Use `docs/codebases/effect-v4` as the local source for Effect API and test patterns when a design choice depends on Effect semantics. Do not rely on an external Effect skill for this implementation workflow.

- [ ] Decide the service pattern for internals: `Context.Service`/`Layer` for `ResourceStore`, `OrchestratorSystem`, trace, host signals, test clock/control services, and any runtime-owned registry.
- [ ] Decide how runtime-owned lifetimes are tracked: `Scope`, finalizers, fibers, child actors, stream subscriptions, timers, and runtime disposal. The result should make leaks hard and tests easy to assert.
- [ ] Decide how `@tanstack/store` is wrapped internally: selection source shape, update batching, selected sources, and scoped subscription cleanup without leaking TanStack types.
- [ ] Decide how `Exit`/`Cause` become the four runtime lanes: success, typed failure, defect, and interrupt.
- [ ] Decide how started Effect operations share scope handling, generation tokens, issue recording, receipts, interruption, and trace correlation.
- [ ] Decide how receipts, issues, and traces are stored and exposed for tests: cheap append, cheap inspection, operation correlation, and no ad hoc arrays scattered through modules.
- [ ] Decide how runtime registries work for resources, actors, children, streams, timers, and modules: duplicate detection, stable ids, lookup as `Option`, and typed not-found errors at the boundary.
- [ ] Decide how preview patches work: apply, commit, rollback, generation protection, and rollback receipts.
- [ ] Decide how concurrency policies map to Effect primitives such as `Semaphore`: reject, allow, serialize, and cancel-previous.
- [ ] Decide how time is represented: Effect `Clock`, `TestClock`, `Duration.Input`, `Schedule`, and tests that never reach real time accidentally.
- [ ] Decide how streams are driven: start in scope, route value/done/failure/defect/interrupt, enforce generation tokens, and always finalize.
- [ ] Decide how schema/redaction boundaries work: normalize external values through `Schema`, keep `Redacted` masked in traces, and return typed decode failures.
- [ ] Decide the test control surface: controlled Effect, controlled Stream, bounded `flush`, virtual-time `advance`, bounded `settle`, and fact inspectors. These controls should expose facts, not assertion DSLs.

Design constraints:

- [ ] Reuse these abstractions across phases instead of introducing one-off lifecycle, registry, receipt, or concurrency code.
- [ ] Keep each abstraction narrow. If it does not remove duplication or encode a concrete library semantic, do not build it.
- [ ] Keep TanStack Store synchronous and local; use Effect at service, operation, subscription, and lifecycle boundaries.
- [ ] Use `Effect.fn` for named operation runners where stack traces and telemetry help debugging.
- [ ] Use `Option` internally for absence and normalize to `null`/`undefined` only at React/JSON boundaries.
- [ ] Do not use `try/catch` inside `Effect.gen` for Effect failures; use `Effect.result`, `Effect.catchTag`, `Effect.catchAll`, `Exit`, or `Cause`.
- [ ] Use `return yield*` when failing or interrupting inside `Effect.gen` so termination is obvious.
- [ ] Avoid `as any`, `as never`, and broad `as unknown`; any unavoidable third-party boundary assertion must be isolated and explained.

## TDD Source Surfaces To Create

- [x] Create `packages/flow-state/src/public-api-types.test.ts` for public names, type inference, service requirements, and legacy-field rejection.
- [x] Create `packages/flow-state/src/resource-store.test.ts` for seed, get, patch, subscribe, ensure, refresh, invalidate, hydration, and snapshot axes.
- [x] Create `packages/flow-state/src/transactions.test.ts` for preview rollback, concurrency, invalidation, typed failures, and transaction receipts.
- [x] Create `packages/flow-state/src/orchestrator-system.test.ts` for actor registry, child lifecycle, stream disposal, failure bubbling, and retry behavior.
- [x] Create `packages/flow-state/src/runtime-invokes.test.ts` for `ensure`, `observe`, streams, stream generations, and timers.
- [x] Create focused machine, runtime, React, and harness tests as modules are added. Do not recreate one large `index.test.ts`.
- [x] `examples/launch-workspace/src/launchWorkspace.test.ts` is the flagship acceptance contract.
- [x] `examples/launch-workspace/src/launchWorkspaceServices.test.ts` protects Effect service patterns, schemas, redaction, typed failures, and batching.
- [ ] `docs/codebases/effect-v4` supplies Effect service, Layer, Scope, Clock/TestClock, Stream, Exit/Cause, Schema, Option, and test patterns.
- [ ] `docs/codebases/tanstack-query` supplies resource, transaction, hydration, lifecycle, observer, and mutation scenario patterns.
- [ ] `docs/codebases/tanstack-store` supplies selection source, selector equality, derived graph, batching, readonly, and React adapter scenario patterns.
- [ ] `docs/codebases/xstate` supplies machine transition, guards, actions, invokes, timers, child actors, rehydration, inspection, and model-testing scenario patterns.

## Phase 0: Cleanup And First Failing Tests

- [x] Delete all examples except `examples/launch-workspace`.
- [x] Delete the old `packages/flow-state/src` implementation and tests.
- [x] Complete the Effect abstraction design pass and capture any resulting typed sketches or tests before Phase 1 implementation.
- [x] Recreate the first package test as a failing public API/type test.
- [x] Move or rewrite tests that encode deprecated API names: `flow.mutation`, `flow.query`, `input`, `effect`, `optimistic`, `mutation:*`.
- [x] Park offline queue tests behind a future marker. Do not let queue/replay/undo block the core runtime rebuild.
- [x] Rebuild tests by ownership. Do not recreate the old package-level monolith.
- [x] Create a failing-first checklist from the launch-workspace tests, sorted by module ownership.
- [x] Add a phase gate comment to skipped/future tests explaining why they are not part of the first implementation.

Acceptance:

- [x] The remaining active tests describe the intended core, not the old migration surface.
- [x] The future/offline queue decision is visible in tests and docs.
- [x] `examples/` contains only `examples/launch-workspace`.
- [x] `packages/flow-state` contains package metadata and build config, but no old `src` implementation.
- [x] `rg -n "flow.mutation|flow.query|optimistic|input:|effect:|mutation:" packages/flow-state examples/launch-workspace apps/docs/src/pages` has only intentional historical/status hits.

## Phase 1: Public Builders And Descriptor Model

- [x] Replace the monolithic implementation with public builders and descriptor modules.
- [x] Implement descriptor construction for resources, transactions, machines, views, streams, timers, children, modules, and apps.
- [x] Preserve literal ids and inference across module/app composition.
- [x] Validate duplicate ids, missing refs, invalid module entries, and app inventory errors.
- [x] Delete `flow.mutation` rather than carrying a compatibility alias.
- [x] Keep `flow.view` pure: no fetching, mutation, invalidation, timers, streams, or actor starts.

Test scenarios:

- [x] `flow.resource` preserves id, key, params, schema, lookup Effect requirement, and snapshot type.
- [x] `flow.transaction` accepts `params`, `preview`, `commit`, `invalidates`, `routes`, and `concurrency`.
- [x] `flow.transaction` rejects legacy `input`, `effect`, and `optimistic` in type tests.
- [x] `flow.machine` preserves states, events, context factory, guards, actions, invokes, streams, timers, and children.
- [x] `flow.app` collects module descriptors without executing runtime work.
- [x] `App.layer` has the correct Effect `Layer` type even before runtime behavior is implemented.

Acceptance:

- [x] `pnpm --filter @flow-state/core test -- --run public-api-types`
- [x] No runtime behavior is faked just to satisfy descriptor tests.
- [x] No `@tanstack/store`, `ManagedRuntime`, actor runner, transaction runner, stream runner, timer runner, or React hook implementation is introduced in Phase 1.

## Phase 2: Selection Source And ResourceStore

- [x] Implement the internal `SelectionSource<T>` shape on top of `@tanstack/store`.
- [x] Implement `getSnapshot`, `subscribe`, `update`, selector equality, and scoped notification batching.
- [x] Keep state visible immediately after update while subscribers receive one final notification per scoped transaction.
- [x] Implement `ResourceStore` as an Effect service.
- [x] Use stable resource refs/keys; do not key only by string id.
- [x] Model resource snapshots with availability, activity, freshness, data, previous data, metadata, typed failure, and placeholder state.
- [x] Use `Option` internally for absence; expose `undefined`/`null` only at public React/JSON boundaries if the public API requires it.
- [x] Implement seed, get, patch, subscribe, ensure, refresh, invalidate, and resource inspector facts.

TanStack Store scenarios to adapt:

- [x] Selector equality prevents rerenders when ignored fields change.
- [x] Subscription cleanup removes listeners exactly once.
- [x] Readonly sources cannot be updated through writable APIs.
- [x] Derived/view diamond graphs compute once per input change and do not create stale intermediate reads.
- [x] Scoped batching reports the final value once, without global ambient batch depth.

TanStack Query scenarios to adapt:

- [x] Resource state transitions are reducer-like and deterministic.
- [x] `ensure` returns cached data when fresh and starts lookup when missing/stale.
- [x] `invalidate` marks matching resources stale and optionally schedules refresh.
- [x] Previous successful data remains available during background refresh failure.
- [x] Newer resource data wins over older hydration or refresh results.
- [x] Invalid hydration input is ignored or fails closed; it never corrupts the store.

Acceptance:

- [x] `ResourceStore` tests pass without actors, React, or launch-workspace.
- [x] TanStack Store remains hidden behind the internal adapter; no public API exposes `@tanstack/store` types.

## Phase 3: Effect Runtime And App Layer

- [x] Implement `App.layer` as real Effect `Layer` composition.
- [x] Install `ResourceStore`, `OrchestratorSystem`, trace, host-signal, and test services through Effect services.
- [x] Implement `flow.runtime(layer)` with `ManagedRuntime`.
- [x] Expose host-safe handles: `runPromise`, `runPromiseExit`, `resources`, `orchestrators`, `dispose`.
- [x] Preserve service requirements through runtime methods.
- [x] Close runtime scope on dispose.
- [x] Interrupt runtime-owned refresh fibers, dispose runtime-owned actors, and release runtime-owned subscriptions on dispose.
  - Later stream, timer, and child-actor cleanup remains tracked in Phase 5 and Phase 6 where those owners are introduced.
- [x] Make dispose idempotent.

TanStack Query scenarios to adapt:

- [x] Provider/runtime mount starts lifecycle subscriptions once.
- [x] Unmount/dispose decrements lifecycle and tears down subscriptions exactly once.
- [x] Host focus/online signals are injectable services, not direct globals.
- [x] Notification scheduling is test-overridable and deterministic.

Acceptance:

- [x] Runtime tests prove service requirements stay typed.
- [x] Runtime dispose has finalizer coverage.
- [x] No React import is required to create or dispose a runtime.

## Phase 4: Machine Transition Core

- [x] Implement a documented subset of `flow.machine`; do not embed all of XState.
  - [x] Separate pure transition planning from action/invoke execution.
  - [x] Implement initial state, state transitions, guarded transitions, action order, context updates, and `can(event)`.
  - Verified so far: initial state, state transitions, guarded transitions, partial context updates, deterministic exit -> transition -> entry action order, unhandled-event stability, action-only transitions, and `can(event)` agreement in `flowTest` and runtime-owned actor shells.
  - Documented subset now includes flat-state `always` follow-up microsteps after matched events, with fixed bounds and traceable receipts. Deferred: initial eventless resolution, raised events, and nested/parallel eventless graphs before submit/invoke execution.
- [x] Keep guards pure and fail closed when required resources/context are missing.
- [x] Preserve typed event inference and state-specific legal event checks.
  - Verified so far: keyed `on.EVENT` transitions narrow `event` to the matching event object, and `FlowEventForState<Event, typeof config.states, "state">` exposes compile-time legal-event sets from a `FlowMachineConfig` literal.
- [x] Emit receipts/traces for event, transition, guard, update, action, and no-transition decisions.
  - Verified so far: machine transitions emit those facts into snapshot receipts, and runtime-owned actors mirror newly produced machine receipts into `TraceLog` in event order.

XState scenarios to adapt:

- [x] Pure transition planning computes the next snapshot without running actions.
- [x] First matching guarded transition wins.
- [x] Unknown or unresolved guards fail closed.
- [x] Parameterized guards receive context, event, and resource facts.
- [x] `update`/assign merges partial context atomically.
- [x] Unhandled events preserve state and context.
- [x] Entry, exit, and transition actions run in deterministic order.
- [x] Action-only transitions count as allowed for `can(event)`.
- [x] `flow.can` and `send` agree for seeded and missing resources.
- [x] Internal microsteps are bounded and inspectable before adding richer eventless transitions.
  - Current bound: 100 matched `always` follow-up steps per external event, with `machine:microstep` and `machine:microstep-limit` receipts mirrored into runtime trace.

Acceptance:

- [x] Machine tests pass without transactions, streams, timers, or React.
- [x] `flowTest.flush()` drains only ready work; it does not pretend to settle timers or streams.
  - Current executable boundary: harnesses and runtime actors share a small ready-work queue; `flush()` drains currently enqueued continuations, nested ready work included, and later promise/timer/stream work needs a later `flush()` or a future `advance`/`settle` surface.

## Phase 5: OrchestratorSystem And Actor Lifecycle

- [x] Implement `OrchestratorSystem` as an Effect service.
- [x] Implement actor start, get, stop, subscribe, snapshot, keep-alive, and dispose.
  - Current executable slice: `start` rejects duplicate live ids by default, reattaches detached keep-alive actors by stable actor id plus machine id, `get`/`stop`/`subscribe`/`snapshot`/`dispose` are covered in `orchestrator-system.test.ts`, and retained actors are disposed exactly once when the orchestrator scope closes.
- [x] Make actor ids stable and scoped by app/module/machine ownership.
  - Current executable slice: explicit actor ids still win, bare `OrchestratorSystem.start(machine)` still falls back to `machine.id`, and app-backed runtimes now derive default ids from `app/module/machine` ownership so same-`machine.id` actors from different modules can coexist.
- [x] Keep child actors parent-owned.
- [x] Stop children on parent stop/dispose and on parent state exit when state-owned.
  - Current executable slice: state-owned child actors are registered under parent-scoped ids, parent snapshots stay in sync if a child is stopped through the system, state exit unregisters active children, and parent dispose clears nested child actor ids while retaining `stopped` child receipts in the disposed parent snapshot.
- [x] Bubble typed child failures to parent issues/routes.
- [x] Retry only failed children.
- [x] Remove completed or stopped children from snapshots unless retained by explicit policy.
  - Current executable slice: live parent snapshots drop completed children as soon as an explicitly `type: "final"` child emits `child:success` and is unregistered from the system, while parent-dispose coverage still retains `stopped` children on the disposed snapshot as the current explicit retention policy.
- [x] Record lifecycle receipts without making product logic depend on receipt parsing.

XState scenarios to adapt:

- [x] Invoked children are registered with the actor system.
- [x] Stopped children are unregistered.
- [x] Parent disposal cleans nested children.
- [x] Reentering a state re-registers state-owned children once.
- [x] Child completion, failure, and stop are distinguishable.
- [x] Actor snapshots expose current children and stable refs.

Acceptance:

- [x] `orchestrator-system.test.ts` passes after being split into actor lifecycle slices.
  - Current actor-registry slice passes with `actor:start`, first-attach `actor:subscribe`, last-detach `actor:unsubscribe`, keep-alive reattachment across a fresh machine descriptor with the same machine id, ownership-scoped default actor ids in app-backed runtimes, and `actor:dispose` mirrored into `TraceLog`.
  - Current child-snapshot slice passes with state-owned children appearing on entry, disappearing on state exit, and persisting as `stopped` on parent dispose.
  - Current child-registry slice passes with parent-scoped child actor ids, re-registration across invoking-state switches plus explicit `reenter: true` self-transitions, nested cleanup, and direct child-stop snapshot sync.
  - Current child-ref slice passes with parent snapshots exposing stable child `actorId` values, promoting explicit `type: "final"` child completion to `child:success` before removing the completed child from the live parent snapshot and actor registry, surfacing child stream failure as `status: "failure"` with `child:failure`, and mirroring live child actor state changes while the child remains active.
- [x] No child actor survives parent dispose.

## Phase 6: Invokes, Resources, Streams, And Time

- [x] Implement invokes in this order: `ensure`, `observe`, `refresh`, `patch`, `invalidate`, `run`, `child`, `stream`, `after`.
- Current executable slice: `ensure`, `observe`, and `refresh` now start through `ResourceStore`, append `query:start` receipts, and surface typed failure or interrupt issues on actors; `refresh` now forces a state-owned lookup even when cached data is already fresh. State-owned `patch` and `invalidate` commands now execute synchronously through `ResourceStore`, append `resource:patch` / `resource:invalidate` receipts, and resync mirrored actor resource snapshots for direct refs plus already-known matching tag targets. State-owned `run` invokes now start through the transaction runner on runtime actors, route success/failure/defect/interrupt completion through machine events, and preserve the documented ready-work `flush()` boundary. State-owned streams start through Effect `Stream` subscriptions, stay owned by the active actor/state scope, route explicit `done` / typed `failure` / `defect` / `interrupt` outcomes deterministically through runtime actors and `flowTest`, record generations/emission counts, drop post-cancel replay so stale controlled-stream tokens from a prior generation are ignored after reentry, and interrupt on state exit, actor stop, and runtime dispose while preserving the last usable value on failure/interrupt snapshots. State-owned `after` timers now use Effect `Clock` / `TestClock`, fire deterministically through runtime actors and `flowTest`, cancel on state exit plus actor stop, and record explicit scheduled/fired/interrupt timer snapshots plus timer receipts on actor and harness inspection surfaces. `flowTest.settle(bounds)` now performs bounded quiescence separately from `flush()`: it drains ready work, advances virtual time to the next delayed transition when possible, and fails with explicit `maxTicks` / `maxFibers` diagnostics when async work stays live.
- [x] Route invoke outcomes through explicit success, typed failure, defect, and interrupt lanes.
- [x] Keep stream ownership in actor scope.
- [x] `flow.stream` consumes Effect `Stream`.
- [x] Record stream generation tokens and ignore stale events after reentry/dispose.
- [x] Interrupt streams on state exit and actor/runtime dispose.
- [x] `flow.after` accepts `Duration.Input` and uses Effect `Clock`.
- [x] Implement `flowTest.advance(duration)` with virtual time.
- [x] Implement bounded `settle(bounds)` separately from `flush()`.

TanStack Query scenarios to adapt:

- [x] Pending work has explicit lifecycle state.
- [x] Stale async result cannot overwrite newer data.
- [x] Error/interrupt lanes preserve previous usable data where appropriate.

XState scenarios to adapt:

- [x] Delayed events use injected/test clocks.
- [x] Timers cancel on state exit and actor stop.
- [x] Child actors inherit or receive scoped clock services.
- [x] Invoke success/error/snapshot routing is deterministic.
- [x] Observables/streams cleanup on stop and do not emit after disposal.

Acceptance:

- [x] `runtime-invokes.test.ts` passes with virtual time.
- [x] No test uses real sleep.
- [x] `flush`, `advance`, and `settle` have distinct documented behavior.

## Phase 7: Transactions

- [x] Implement transactions as a separate runner, not as hidden machine logic.
- [x] Support `params`, `preview`, `commit`, `invalidates`, `routes`, and explicit concurrency.
- [x] Implement preview patches with generation-aware rollback.
- [x] Ensure overlapping previews cannot resurrect stale state.
- [x] Route success, typed failure, defect, and interrupt distinctly.
- [x] Invalidate resources after successful commits.
- [x] Add an `AbortSignal` integration in the commit function to cancel fetch calls.
- [x] Record transaction receipts and issues.
- [x] Implement initial concurrency policies: `reject-while-running`, `allow`, `serialize`, and `cancel-previous`.
- [x] Keep offline queue/replay/undo out of the core acceptance path until the API is intentionally restored.

- Current executable slice: runtime actors and `flowTest` now share the same user-visible transaction contract for `flow.run(...)` and transition `submit`: `params` are resolved from the live snapshot, preview patches apply immediately, typed success/failure/defect/interrupt lanes emit `transaction:*` receipts, typed failures mark handled transaction issues when routed, and preview patches roll back on non-success completion. Preview rollback is now generation-aware across overlapping writes to the same resource: when an older transaction fails or is interrupted after a newer preview has already applied, both runtimes remove only the failed generation and replay any newer preview layers instead of resurrecting stale data. Runtime actors now capture the full app-layer service context inside `OrchestratorSystem`, so transaction commits can actually use app-provided Effect services. Transaction commit effects can also observe Effect-managed `AbortSignal`s directly through `Effect.promise(...)`, `Effect.tryPromise(...)`, or `Effect.callback(...)`: `cancel-previous` aborts the replaced commit signal immediately in both runtime actors and `flowTest`, and actor disposal aborts any still-active commit signal so fetch-style work can stop with the transaction. Successful commits now apply configured invalidations in both runtime actors and `flowTest`, including mirrored `resource:invalidate` receipts and stale-cache snapshots for direct refs or known tag matches. Failed or interrupted transaction snapshots now stay visible until callers explicitly `retryTransaction(id)` or `resetTransaction(id)`, and retries reuse the last resolved params under the same concurrency rules instead of erasing the prior failure fact implicitly. The flagship `launch-workspace` example now routes `REQUEST_APPROVAL` through `submit: requestApprovalTransaction`, so approval requests exercise the same transaction runner as project saves, and both approval denial plus project-save conflict now route through typed failure lanes instead of falling back to defects. Offline save queue, reconnect replay, and undo are no longer active example behavior: while that API family remains parked, the example fail-closes `SAVE_PROJECT` when disconnected and tracks the old queue scenarios as explicit future markers instead of hidden skipped tests. Concurrency now covers all four Phase 7 local policies: `serialize` queues later submits by transaction id by default, or by a shared public `scope.id` when a transaction opts into scoped serialization, preserves call-time params, emits `transaction:queue` / `transaction:dequeue`, and resumes the next commit only after the prior one settles; `cancel-previous` interrupts the active same-id transaction, rolls back its preview patches before applying the latest preview, aborts the replaced commit signal, and ignores stale completion from the canceled commit; `allow` starts same-id transactions in parallel while keeping the latest generation as the owner of public transaction snapshot state and routed outcome events, so stale older completions cannot overwrite newer machine state. Offline queue/replay/undo remain pending.

TanStack Query mutation scenarios to adapt:

- [x] Pending, success, failure, rollback, and cleanup are observable.
- [x] Scoped serialization runs one transaction at a time per scope.
- [x] Different scopes may run concurrently.
- [x] Cancellation prevents stale completion from mutating state.
- [x] Retry/reset is explicit and does not erase typed failure facts.

Launch-workspace scenarios to preserve or update:

- [x] Preview transaction rollback on typed failure.
- [x] Permission/conflict failures use typed lanes.
- [x] Transaction receipts use `transaction:*`, not user-facing `mutation:*`.
- [x] Offline queue/undo/reconnect tests are parked or rewritten as future tests.

Acceptance:

- [x] `packages/flow-state/src/transactions.test.ts` passes after queue scenarios are parked as future markers.
- [x] Transaction runner has unit tests independent of React and launch-workspace.

## Phase 8: Views And Read Models

- [x] Keep views pure and readonly.
- [x] Views may combine resources, actor snapshots, transaction state, stream state, timers, children, receipts, and issues.
- [x] Views must not fetch, mutate, invalidate, start actors, start streams, or schedule timers.
- [x] Prefer direct resource/actor reads in examples unless projection materially transforms or joins data.
- [x] Implement derived graph caching only if the simple selector source becomes insufficient.

TanStack Store scenarios to adapt:

- [x] Diamond and complex-diamond view graphs recompute deterministically.
- [x] Readonly views cannot be written through mutation APIs.
- [x] Selector equality prevents view consumers from rerendering when selected output is stable.
- [x] Views unsubscribe from all source stores when disposed.

Acceptance:

- [x] View tests prove sparing, pure projection semantics.
- [x] Launch-workspace uses views only where they join or significantly transform data.

## Phase 9: React Adapter

- [x] Keep React in `src/react/*` and public barrel wiring only.
- [x] Implement provider/context as typed runtime transport, not as canonical data storage.
- [x] Implement `flow.useResource` with native React `useSyncExternalStore` over `SelectionSource<T>`.
- [x] Implement `flow.use` as a render-safe React actor hook: return a shell actor on first render, create the live actor after render, rerender on snapshot updates, and dispose the hook-owned actor on unmount without disposing the runtime.
- [x] Implement `flow.useView` for advanced projections.
- [x] Read optimistic snapshot before subscribing, then reconcile after subscription to avoid missed updates.
- [x] Unsubscribe exactly once on unmount.
- [x] Do not start streams, timers, or transactions from hook render.

TanStack Query and Store scenarios to adapt:

- [x] No missed update between initial read and subscription.
- [x] Selector equality suppresses rerenders for unchanged selected values.
- [x] Selected sources notify only when `equal(previousSelected, nextSelected)` is false.
- [x] Selected sources compute from the latest source snapshot, not from stale closure state.
- [x] Selected sources unsubscribe from the base source exactly once.
- [x] The selected-source bridge satisfies the React adapter tests cleanly; do not add `use-sync-external-store/with-selector` in this phase.
- [x] Provider unmount disposes subscriptions but not necessarily the runtime unless provider owns it.
- [x] Nested provider override works when intentionally supported.
- [x] Hooks throw a clear error when runtime/provider is missing.

Acceptance:

- [x] React hook tests pass with deterministic store updates.
- [x] Core package tests still pass without React behavior.

## Phase 10: Launch Workspace Integration

- [x] Split `examples/launch-workspace/src/launchWorkspace.ts` by module ownership before expanding behavior.
  - [x] Extract the `Project`, `Approval`, `Assistant`, and `Chat` families into dedicated module files, move the `Launch` / `Trace` view-only modules into `launchWorkspaceViews.ts`, and group the smaller `Session` / `Checklist` / `Readiness` / `Assets` modules into `launchWorkspaceSupport.ts`, with re-export coverage from `launchWorkspace.ts`.
  - [x] Move the top-level workspace machine/app/runtime/descriptor family into `launchWorkspaceAssembly.ts`, leaving `launchWorkspace.ts` as a pure re-export barrel.
- [x] Keep `launchWorkspace.test.ts` as the end-to-end contract for real app usage.
- [x] Preserve API coverage tests.
- [x] Preserve module/app/layer/runtime inventory tests.
- [x] Preserve typed Effect service failure tests.
- [x] Preserve redaction and schema boundary tests.
- [x] Preserve seeded ResourceStore startup tests.
- [x] Preserve `flow.can` permission gate tests.
- [x] Preserve fail-closed missing-resource guard tests.
- [x] Preserve assistant child lifecycle, failure bubbling, retry-only-failed-child, and approval gate tests.
- [x] Preserve chat stream keep-alive, detach, explicit dispose, interrupt lane, and stale token rejection tests.
- [x] Preserve module fixture seeding.
- [x] Preserve graph/trace/replay/model/story descriptor tests as descriptors first, then behavior later.
- [x] Remove or mark offline queue tests as future unless the API is restored.

- Current executable slice: `flow.module(...).inventory()` and `flow.app(...).inventory()` are now live descriptor facts instead of doc-only claims, using shared inventory summarization for module/app coverage tests. `flowTest.app(...).seedModuleFixtures(name)` now loads fixture arrays exported by modules, and `.start(machine, { input })` now merges partial initial context overrides as documented by the harness type contract. The flagship `launchWorkspace.test.ts` inventory and fixture-seeding checks are back on the executable path without hand-wiring resources into machine context.

Acceptance:

- [x] `pnpm --filter @flow-state/launch-workspace test -- --run`
- [x] `pnpm --filter @flow-state/launch-workspace build`

## Phase 11: Model Testing, Replay, And Trace

- [x] Implement simple path generation before richer browser/SUT adapters.
- [x] Filter generated events through `flow.can`.
- [x] Capture event -> transition -> resource/transaction/stream/child/timer receipts.
- [x] Add replay reports that preserve success, typed failure, defect, and interrupt lanes.
- [x] Add rehydration tests that restore snapshots without replaying entry/exit actions or restarting side effects.

XState scenarios to adapt:

- [x] Shortest/simple path generation.
- [x] Guarded transition coverage.
- [x] Dynamic event cases.
- [x] Rehydration preserves `can(event)` and active children.
- [x] Restored snapshots do not duplicate receipts.
- [x] Inspection events include source/target actor ids and correlation ids.

Acceptance:

- [x] `flowTest.model` is useful for launch-workspace command graphs.
- [x] Replay reports are deterministic and do not require real time.

## Phase 12: Documentation And Status

- [x] Update docs only after behavior is implemented or intentionally marked future.
- [x] Keep docs professional and final-feeling; do not describe unfinished internals as available.
- [x] Update reference pages for any API decisions made during the rebuild.
- [x] Keep views demoted to advanced read models.
- [x] Keep offline queue out of public docs unless it is reintroduced with working tests.
- [x] Remove docs/examples for `flow.query`, `flow.mutation({ input, effect })`, and `optimistic`; mention them only as historical removals if needed.
- [x] Update `TODO.md` only after implementation gates prove the new status.

Acceptance:

- [x] `pnpm docs:build`

## Phase 13: Durable Names, Real-World Scenarios, And Integration Follow-Up

- [x] Remove implementation-plan names from durable repo surfaces.
  - [x] Rename `packages/flow-state/src/phase0-design.ts` to a behavior- or ownership-based internal module name, and update imports/exports that still point at it.
  - [x] Replace `describe("Phase X ...")` titles with behavior-first names across package tests.
  - [x] Remove durable comments, `@ts-expect-error` labels, and helper names that still refer to rebuild phase numbers after the behavior is stable.
- [x] Backfill the highest-value missing resource lifecycle scenarios.
  - [x] Add explicit `onInvalidate: "lazy"` and `onInvalidate: "never"` tests beside the existing `"active"` coverage.
  - [x] Add invalidate-during-in-flight lookup coverage and lock in whether active observers refetch immediately or only on next demand.
  - [x] Add same-ref `ensure` / `refresh` dedupe coverage so concurrent callers cannot create ambiguous duplicate work.
  - [x] Add a source-level read-then-subscribe race test for `selected-source`, so the no-missed-update guarantee is proven below the React hook layer too.
- [x] Decide whether `FlowResourceActivity = "paused"` is real behavior or dead public API.
  - [x] If it stays, implement and test offline-on-first-fetch, offline-during-refetch, reconnect resume, and preservation of last good data while paused.
  - [ ] If it does not stay, remove `paused` from public types, docs, and scenario matrices rather than leaving a contract-only state that real code cannot observe.
- [x] Prove stream pressure semantics at runtime, not only in descriptor coverage.
  - [x] Add `runtime-streams.test.ts` coverage for `pressure: { strategy: "queue" }` bounded behavior.
  - [x] Add `runtime-streams.test.ts` coverage for `pressure: { strategy: "coalesce-latest" }` keyed-latest behavior and stale-emission suppression after reentry or dispose.
- [x] Extend transaction cancellation coverage from policy behavior to transport teardown.
  - [x] Add exact-once `AbortSignal` tests for actor stop and runtime dispose, not just `cancel-previous`.
  - [x] Prove late success from an aborted commit cannot leak back into public transaction or machine state.
- [x] Split hydration into explicit tracks instead of one vague deferred bucket.
  - [x] Keep resource cache hydration semantics covered in `resource-store.test.ts`.
  - [x] Keep actor/runtime snapshot restore semantics covered in `runtime-rehydration.test.ts`, and extend restore coverage for post-restore continue/final-state behavior where needed.
  - [x] Track SSR hydration boundary and RSC runtime split separately as real integration follow-up, not as if they were the same feature as cache or actor rehydration.
- [x] Make intentionally deferred XState-style semantics explicit.
  - [x] Decide whether root/nested final-state completion, `onDone`, `parallel`, `history`, and broader eventless resolution are future targets or permanent non-goals.
  - [x] Either add executable tests for the chosen subset or mark them as future with explicit rationale in docs and acceptance tests.
- [ ] Split large ownership-heavy files if they keep obscuring module boundaries during the remaining closeout work.
  - [x] Split `packages/flow-state/src/public/types.ts` into dedicated `public/*-types.ts` modules and keep the export hub covered by `durable-names.test.ts`.
  - [ ] Split `packages/flow-state/src/testing/flow-test.ts` if the next closeout slice needs to touch it again.

Acceptance:

- [x] Durable code and test names read like product/library semantics rather than rebuild bookkeeping.
- [x] Resource invalidation, stream pressure, cancellation teardown, hydration, and any remaining deferred statechart semantics each have executable coverage or an intentional removal/deferral decision.
- [x] The remaining open semantics are explicit product decisions, not accidental contract drift.

## Phase 14: Observable Runtime, Deterministic Controls, Semantic Layers, And Truth Surfaces

- [ ] Make the deferred resource descriptors runtime-real before widening semantics again.
  - [ ] Implement the supported live subset of `flow.ensure`, `flow.observe`, `flow.refresh`, and `flow.invalidate` so Launch Workspace and core tests stop depending on descriptor-only promises.
  - [ ] Keep resource snapshots multi-axis (`status`, `availability`, `activity`, `freshness`) and lock in stale-visible, previous-data-on-error, in-flight dedupe, cancel/revert, and observer mount/unmount ownership with focused tests.
  - [ ] Decide whether host `online` / `focus` signals stay in the active runtime contract now or remain future, and either prove pause/resume/refetch behavior or narrow the docs accordingly.
- [ ] Make deterministic runtime control a first-class test surface instead of an internal best effort.
  - [ ] Introduce a mailbox contract with pre-start deferral and stable flush order across external sends, child sends, stream callbacks, and delayed work.
  - [ ] Move delayed work behind a restorable scheduler / virtual clock surface rather than one-off timer bookkeeping, and prove cancel, restore, and restart behavior with runtime tests.
  - [x] Expose pending-work inspection in `flowTest` so bounded-settle failures identify which mailboxes, timers, streams, transactions, or children stayed live instead of only timing out.
- [ ] Split debugger inspection from product receipts and make traces explain causality.
  - [ ] Add a system-level inspection stream for actor registration, sends, snapshots, actions or microsteps, resources, transactions, streams, children, and timers.
  - [x] Keep receipts as product-facing evidence, and derive trace tooling from correlated inspection facts rather than only prefix-based grouping.
  - [x] Add receipt, issue, and trace assertions that let tests point at unresolved runtime work without reducing failures to final snapshot mismatches.
- [ ] Make `App.layer`, `flow.store.*`, and `flow.orchestrators.*` materially semantic or intentionally narrower.
  - [ ] Every documented `store` / `orchestrators` option either changes installed services/runtime behavior or is removed, renamed, or explicitly future-marked in docs.
  - [ ] Stop ignoring descriptor config fields inside `flow.app(...).layer(...)`; use explicit installers for the supported modes and option branches.
  - [ ] Derive one `FlowRuntimePolicy` service inside `App.layer` so `ResourceStore` and `OrchestratorSystem` consume explicit policy instead of inferring behavior from `mode` alone.
  - [ ] Keep status docs, runtime docs, and Launch Workspace assembly aligned with the exact executable subset of app-layer behavior.
- [ ] Pay down the review-backed structural debt before expanding more public surface area.
  - [ ] Lock the known public/runtime/provider `any` seams behind type-only gates first, using `unknown`-based existential helpers where needed before moving logic around.
  - [ ] Split `packages/flow-state/src/services/orchestrator-transactions.ts` into owned modules for preview overlays, invalidation, concurrency, retry/queue policy, completion lanes, and receipt routing.
  - [ ] Move queue/generation/owner registries behind focused helpers so overlap checks stop being inline policy code.
  - [ ] Keep the controller under roughly 250 lines and keep new helpers under roughly 350 lines unless a later review explicitly approves a larger owned module.
  - [ ] Remove `AnyFlowTransactionDefinition` and the known public/internal `any` seams in `flow.run`, `flow.runtime`, `FlowProvider`, `App.layer`, and `OrchestratorSystem`.
  - [ ] Preserve typed `Effect<A, E, R>` channels end-to-end instead of erasing them at public or service boundaries.
- [x] Turn status honesty into a generated, machine-readable contract.
  - [x] Create one typed surface-status registry that drives docs status tables, Launch Workspace coverage, and any API inventory or phase tracking that claims executable support.
  - [x] Publish machine-readable status output for agent and tool consumption, and add invariant tests so docs cannot claim runtime coverage that the codebase does not prove.
  - [x] Add explicit rename or redirect notes when a surface moves, collapses, or stays future so historical names do not linger silently in docs.
- [ ] Make Launch Workspace prove inspection and operator quality-of-life, not only editor authoring.
  - [x] Surface the existing Overview and Trace projections in the shell with live runtime, resource, transaction, stream, child, and issue summaries.
  - [x] Add a thin debug panel for pending work, recent receipts, and active runtime facts so the example demonstrates debuggability with real library data.
  - [x] Stop treating the UI shell as one throwaway component; split the visible app into owned view components so the proof app reads like a realistic product surface rather than a single-file demo.
  - [ ] Keep the shell intentionally thin and implementation-proof-oriented; do not turn this phase into a production-polish detour.

Reference directions to adapt in this phase:

- [ ] TanStack Query: keyed refresh ownership, cancel or revert semantics, timestamp-aware hydration, host signal managers, and cache inspection events.
- [ ] XState: mailbox ordering, virtual clock plus restorable scheduler state, child stop/start invariants, and a parallel inspection stream.
- [ ] TanStack Store: source-first selector guarantees, explicit flush boundaries, and graph-topology tests for derived or observed snapshots.
- [ ] TanStack Docs: one typed truth source, machine-readable status routes, and tiny invariant tests that prevent documentation drift.

Acceptance:

- [x] `flow.ensure`, `flow.observe`, `flow.refresh`, and `flow.invalidate` each have at least one runtime-real Launch Workspace slice plus focused core coverage.
- [x] `flowTest` can explain bounded-settle failures in terms of pending mailboxes, timers, streams, transactions, or children.
- [x] Trace and inspection tooling can correlate an event with the transition, resource work, transaction work, stream work, and child or timer effects it caused.
- [ ] `App.layer`, `flow.store.*`, and `flow.orchestrators.*` either change runtime behavior materially or the unused public options are gone.
- [ ] Transaction ownership is split into named modules, and the closeout path no longer relies on the known `any` escape hatches from the current review.
- [x] Docs status, Launch Workspace coverage, and executable proofs cannot drift silently from one another.
- [x] Launch Workspace exposes Overview, Trace, and debug surfaces powered by real runtime data.

## Phase 15: Error Quality, Diagnostics, Bundle Size, And Performance

- [ ] Establish one Rust-like diagnostic convention for library-facing failures.
  - [ ] Define tagged Flow diagnostics with stable domain-prefixed codes such as `FLOW-APP-*`, `FLOW-STORE-*`, `FLOW-ORCH-*`, `FLOW-TXN-*`, and `FLOW-REACT-*`.
  - [ ] Build a Effect.Schema for all error schemas, keep the error data and printing logic separate so multiple printers and customizable functions can operate on serializable data.
  - [ ] Render diagnostics in one stable shape: code, short title, concise “what happened” summary, “why” explanation, “help” section, and structured debug metadata.
  - [ ] Keep expected product/runtime failures typed with `Schema.TaggedErrorClass`, `Data.TaggedError`, or an equivalent small wrapper; reserve raw defects for truly impossible states.
  - [ ] Replace generic public/runtime/react/descriptors `throw new Error(...)` sites with tagged diagnostics or fail-closed defects that preserve `Cause`, relevant ids, and current runtime context.
  - [ ] Use `FlowProvider is missing a runtime`, duplicate actor ids, invalid module inventory, missing runtime details, and unsupported descriptor combinations as the first exemplar cases.
  - [ ] Reserve a separate `bug[...]` lane for invariant failures so impossible states do not look like expected user/runtime errors.
- [ ] Make diagnostics actionable without bloating hot paths.
  - [ ] Add error snapshot tests that lock codes, message shapes, and helpful remediation text.
  - [ ] Add an opt-in pretty-printer for docs, tests, and local debugging without forcing expensive string formatting on every success path.
  - [ ] Ensure pending-work, issue, and trace failures include the ids and recent facts needed to fix the problem without opening five files.
- [ ] Tighten the published package for tree shaking, source maps, and bundle hygiene.
  - [ ] Keep the public entry side-effect free, review the export map, and add `package.json` metadata needed for modern bundlers to tree shake safely.
  - [ ] Verify `@flow-state/core` build output includes usable source maps and sourcemapped runtime stack traces in local smoke tests.
  - [ ] Require emitted `.map` files to keep relative `../src/*` sources, include `sourcesContent`, and avoid leaking absolute filesystem paths.
  - [ ] Add a small bundle smoke check that proves examples/docs code does not leak into the published core build.
- [ ] Remove avoidable runtime costs from hot paths before layering on more inspection.
  - [ ] Audit provider/runtime entrypoints, subscriptions, and selected-source updates for unnecessary object churn, repeated sync reads, or always-on debug work.
  - [ ] Keep formatting, pretty-printing, and optional inspection assembly lazy when they are not needed for the current path.
  - [ ] Measure update hot paths before and after the new diagnostics work so “nicer errors” do not quietly become a performance regression.
  - [ ] Add a regression bench for transaction overlap checks, actor `send` plus `flush`, and resource patch plus notify so doubling N from 1k to 2k stays under roughly 2.5x wall time and preserves receipt counts plus leak-free dispose.

Acceptance:

- [ ] Public/runtime/provider diagnostics follow one stable code/help format and are snapshot-tested.
- [ ] `@flow-state/core` exports are tree-shakeable, sourcemapped, and free of example/docs leakage.
- [ ] Core bundle growth stays flat or under roughly 5% for this phase unless a new exported surface is intentional and documented.
- [ ] No new debug surface forces always-on heavy string formatting or regresses the measured hot paths.

## Phase 16: Next.js App Router Launch Workspace And Client Runtime Fit

- [ ] Convert `examples/launch-workspace` from the current Vite bootstrap to the current stable Next.js App Router release at implementation time, and record the verified exact version in the package and docs.
  - [ ] Replace `index.html` / `createRoot(...)` bootstrapping with `app/layout.tsx`, `app/page.tsx`, one `LaunchWorkspaceClient` entry marked `"use client"`, and app-owned global CSS.
  - [ ] Keep the current proof surface intact inside that client entry: `FlowProvider`, `flow.use(launchWorkspaceMachine)`, `flow.useResource(...)`, `flow.useView(...)`, `flow.can(...)`, and the split shell remain the flagship contract rather than a redesign.
  - [ ] Preserve Overview, Trace, and debug surfaces from Phase 14 when the shell moves to App Router; do not regress back to a static rail.
- [ ] Make the example UI feel like a realistic app shell instead of one monolithic component.
  - [ ] Split the visible React surface into at least 4-5 owned files such as `LaunchWorkspaceClient`, `WorkspaceRail`, `WorkspaceHeader`, `RuntimeStatusStrip`, `OverviewPanel`, `EditorPanel`, `TracePanel`, or equivalent feature-owned components.
  - [ ] Keep runtime and domain logic in the existing logic modules, but move rendering structure, tab shells, cards, lists, and command surfaces into dedicated component files so the example is easier to extend and inspect.
  - [ ] Avoid fake complexity: each extracted component should own a real product-facing slice or layout boundary, not just wrap a `<div>`.
  - [ ] Add a small local component/read-model layer where needed so visible UI composition does not force more logic back into one root file.
- [ ] Add a few richer but still honest product-facing slices so the app looks meaningfully complex.
  - [ ] Make at least three sections feel real with distinct live data and interactions: `Overview`, `Editor`, and `Trace` are the minimum; `Assets`, `Approval`, `Assistant`, or `Chat` can follow if they stay backed by real runtime data.
  - [ ] Add realistic shell features such as active-tab switching, summary cards, issue or receipt lists, checklist/readiness snippets, and a compact command area that surfaces `flow.can(...)` and transaction status clearly.
  - [ ] Keep every visible enhancement tied to the executable contract; do not add decorative panels that are disconnected from resources, actor snapshots, or trace facts.
- [ ] Replace singleton example runtime ownership with route-safe runtime factories.
  - [ ] Stop rendering through one exported process-global runtime instance; create an example-local runtime factory so App Router gets a fresh runtime per mounted client boundary.
  - [ ] Use `LaunchWorkspaceAppLayer` for the browser example and keep `LaunchWorkspaceTestAppLayer` for deterministic tests; do not anchor the user-facing example to the test runtime.
  - [ ] Keep `app/page.tsx` thin and serializable: pass fixture ids, route params, and seed payloads into the client boundary, not live runtimes, actors, or callbacks.
- [ ] Build only the core-library additions needed for clean `"use client"` mode now.
  - [ ] Keep runtime creation, `FlowProvider`, `flow.use`, `flow.useResource`, transactions, streams, timers, and command handling robust on the client without forcing SSR semantics yet.
  - [ ] Add any missing route-scope lifecycle helpers needed to avoid leaking actors, subscriptions, or timers across App Router navigation.
  - [ ] Keep docs honest about what is client-only versus what is future SSR/RSC support.
- [ ] Update test and build gates around the converted example.
  - [ ] Keep Launch Workspace contract tests green after the migration.
  - [ ] Add `next build` and any necessary example smoke gates to the package scripts and closeout loop.
  - [ ] Keep core build-first workflows explicit if the example still resolves `@flow-state/core` through built `dist`.

Acceptance:

- [ ] Launch Workspace builds and runs as a stable Next.js App Router example with no user-facing `createRoot` path left.
- [ ] `Open`, `Edit`, `Save`, Overview, Trace, and debug surfaces still work after hydration with no provider/runtime mismatch errors.
- [ ] The visible app is split across multiple owned component files instead of one monolithic React shell, and at least three sections present distinct live runtime-backed views.
- [ ] The browser example uses the live app layer while deterministic tests keep using the test app layer.
- [ ] Docs do not overclaim SSR/RSC support before the later server phases land.

## Phase 17: Request-Scoped SSR, Serialization, Rehydration, And Server Handoff

- [ ] Add request-scoped runtime boot APIs for server-rendered app shells.
  - [ ] Create explicit server/runtime boot helpers that construct one runtime per request rather than one process-global singleton.
  - [ ] Keep request-created runtimes disposable and isolated so server work cannot leak subscriptions, children, timers, or cached resources across requests.
  - [ ] Make the supported request-scope story clear for Node and document any unsupported runtimes explicitly.
- [ ] Expose public, JSON-safe runtime serialization and rehydration for the supported subset.
  - [ ] Add public resource-cache dehydrate/hydrate APIs with newer-data-wins conflict rules.
  - [ ] Add public actor/app snapshot serialize/restore APIs that preserve executable state without replaying entry/exit actions or restarting side effects during hydration.
  - [ ] Version the payload shapes and keep them small, serializable, and explicit about what is omitted.
- [ ] Define the SSR hydration boundary deliberately before widening into broader server features.
  - [ ] Allow a server page or loader to preload seed data, hand off a serializable boot payload, and let one client runtime hydrate it without duplicate work.
  - [ ] Keep the initial supported boundary narrow: seeded resources, actor snapshot restore, and request-owned runtime boot first.
  - [ ] Do not widen into generic Suspense reads, Error Reset Boundary flows, or Server Actions integration until this narrower path is proved.
- [ ] Split server preload concerns from client runtime concerns in the public API.
  - [ ] Keep server components and loaders responsible for data loading and payload construction, while the client boundary owns live actors, subscriptions, streams, timers, and commands.
  - [ ] Clarify which parts of `flow.ensure`, `flow.observe`, `flow.refresh`, and `flow.invalidate` are required for server-capable resource observation and preload behavior.
  - [ ] Make `App.layer` semantics explicit for server vs client installers, host signals, and request scope so the runtime contract is no longer nominal.
- [ ] Keep RSC follow-up deliberate rather than accidental.
  - [ ] Track a future RSC loader/runtime split as an explicit follow-on once request scope, serialization, and hydration are solid.
  - [ ] Keep passing live actors, runtimes, or callbacks across the server boundary out of scope.

Acceptance:

- [ ] A request-scoped server boot path can preload resources, serialize a boot payload, and hydrate one client runtime without replaying side effects.
- [ ] Public serialization/rehydration APIs are executable, documented, and tested for the supported subset.
- [ ] `App.layer` semantics are explicit for client, test, and request-scoped server usage.
- [ ] The docs describe the exact supported SSR boundary and keep full RSC/Suspense/server-action ambitions future-marked until they are real.

## Scenario Matrix

| Area                | Reference Library              | Scenarios To Copy                                                                                                                                    | Flow State Target                                                  |
| ------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Resource lifecycle  | TanStack Query                 | state reducer, stale/fresh, cache update, invalidation, previous data on error, `active`/`lazy`/`never` invalidation policy, paused/offline decision | `ResourceStore`, `flow.ensure`, `flow.refresh`, `flow.invalidate`  |
| Runtime lifecycle   | TanStack Query                 | mount count, focus/online managers, cleanup                                                                                                          | `flow.runtime`, `App.layer`, host-signal services                  |
| Observer bridge     | TanStack Query, TanStack Store | optimistic read, subscribe, reconcile, selector equality, read-before-subscribe race                                                                 | `flow.useResource`, `flow.use`, `flow.useView`, `selected-source`  |
| Mutation lifecycle  | TanStack Query                 | pending/success/failure, retry/reset, scoped serialization, cancellation                                                                             | `flow.transaction`                                                 |
| Store selection     | TanStack Store                 | `get`/`subscribe`, selector equality, readonly sources, batching                                                                                     | `SelectionSource`, resource/actor snapshots                        |
| Derived graph       | TanStack Store                 | diamond recomputation, complex derived graph cleanup                                                                                                 | `flow.view` only where projection is significant                   |
| Machine transitions | XState                         | pure transition, guards, assign/update, action order, `can(event)`                                                                                   | `flow.machine`, `flow.can`, `flowTest`                             |
| Invokes             | XState                         | success/error/snapshot routing, cleanup, stale-emission suppression, post-stop teardown                                                              | `flow.ensure`, `flow.run`, `flow.stream`, child actors             |
| Time                | XState                         | delayed events, custom clock, cancel-on-stop                                                                                                         | `flow.after`, `flowTest.advance`, `TestClock`                      |
| Children            | XState                         | registration, stop, completion, retry, parent cleanup                                                                                                | `flow.child`, `OrchestratorSystem`                                 |
| Rehydration         | XState, TanStack Query         | newer data wins, no replayed entry actions, active children restored, post-restore continue, hydration-boundary split                                | resource hydration, actor snapshot restore, SSR boundary follow-up |
| Inspection          | XState                         | actor/event/snapshot/action/microstep inspection                                                                                                     | receipts, issues, traces, replay                                   |

## Command Gates

Run focused gates while building:

```sh
pnpm --filter @flow-state/core test -- --run
pnpm --filter @flow-state/core pack
pnpm --filter @flow-state/launch-workspace test -- --run
pnpm --filter @flow-state/launch-workspace build
pnpm docs:build
git diff --check
```

Run the final gate before calling the rebuild complete:

```sh
pnpm verify
```

Search for accidental legacy or non-deterministic behavior:

```sh
rg -n "flow.mutation|flow.query|optimistic|input:|effect:|mutation:|AsyncIterable|Date.now|setTimeout|expectState|expectData|\\{ millis" apps/docs/src/pages examples/launch-workspace packages/flow-state/src
```

Intentional migration/future/status hits are allowed only when explicitly documented.

## Completion Definition

- [x] `packages/flow-state` is decomposed into owned modules.
- [x] Core runtime behavior is Effect-native.
- [x] ResourceStore, OrchestratorSystem, transactions, streams, timers, testing, and React hooks are separately testable.
- [x] The launch-workspace example runs against real library behavior, not contract-only stubs.
- [x] Views are advanced and sparing.
- [x] Durable filenames, helper names, and test titles no longer leak rebuild phase bookkeeping.
- [x] Offline queue is either removed from the active contract or reintroduced with working tests.
- [x] Resource invalidation policy, stream pressure, transaction abort teardown, and hydration boundaries are either executable or intentionally removed/deferred.
- [x] The docs describe only implemented or intentionally future-marked behavior.
- [x] The thermo-nuclear review finds no blocking architectural issues.
- [ ] Resource observation and explicit refresh or invalidation descriptors are runtime-real for the supported subset.
- [ ] Deterministic mailbox and scheduler ownership, plus pending-work diagnostics, are executable through `flowTest`.
- [ ] Trace, inspection, and issue tooling explain causal runtime behavior rather than only grouping receipts.
- [ ] `App.layer`, `flow.store.*`, and `flow.orchestrators.*` are materially semantic or intentionally narrowed.
- [ ] Public/runtime/provider surfaces no longer rely on the known `any` escape hatches, and oversized ownership files are split back under the quality bar.
- [ ] Public diagnostics follow the tagged code/help convention with preserved `Cause` details and sourcemapped stacks.
- [ ] `@flow-state/core` remains tree-shakeable, sourcemapped, and free of example/docs bundle leakage.
- [ ] Status surfaces are generated from one typed registry with invariant tests.
- [ ] Launch Workspace proves Overview, Trace, and debug workflows in addition to editor authoring.
- [ ] Launch Workspace runs as the stable Next.js App Router proof app in `"use client"` mode.
- [ ] Request-scoped SSR boot, runtime serialization/rehydration, and hydration-boundary semantics are executable for the supported subset.
- [x] `pnpm verify` passes.
