# Flow State Implementation Plan

This plan is the contract for rebuilding `packages/flow-state` into a working library. The source of truth is the documented API surface in [API](apps/docs/src/pages/reference/api.md), [Resources](apps/docs/src/pages/reference/resources.md), [Runtime](apps/docs/src/pages/reference/runtime.md), [Transactions](apps/docs/src/pages/reference/transactions.md), [Machines](apps/docs/src/pages/reference/machines.md), [Streams And Time](apps/docs/src/pages/reference/streams-time.md), [Views And React](apps/docs/src/pages/reference/views-react.md), the current docs status in [Status](apps/docs/src/pages/reference/status.md), and the executable contract in [launchWorkspace.test.ts](examples/launch-workspace/src/launchWorkspace.test.ts). The current implementation is disposable unless it proves a useful behavior with a focused test.

The old `packages/flow-state/src` code has been deleted. The goal is to rebuild the runtime with small Effect-native modules, TDD each semantic slice, and keep the Launch Workspace example green as the acceptance proof.

## Current Decision

- [ ] Preserve the finalized API shape: `flow.module`, `flow.resource`, `flow.transaction`, `flow.machine`, `flow.view`, `flow.app`, `App.layer`, `flow.runtime`, `flow.ensure`, `flow.observe`, `flow.refresh`, `flow.run`, `flow.patch`, `flow.invalidate`, `flow.stream`, `flow.after`, `flow.child`, `flow.can`, `flow.useResource`, `flow.use`, `flow.useView`, `flowTest`, `flowTest.app`, `createControlledEffect`, and `createControlledStream`.
- [ ] Rebuild `packages/flow-state/src/index.ts` as a barrel and small public assembly file, not as the implementation home.
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
- [ ] Defer React 19/RSC/Suspense/server integration beyond the core rebuild, except for the minimal client-hook subscription shape needed by the current example app.
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
- [ ] Suspense reads, Error Reset Boundary, SSR hydration boundary, RSC loader/runtime split, Server Actions integration, or streaming pending promise hydration.
- [ ] React 16/17 compatibility shims for external stores.
- [ ] Devtools, timeline UI, browser inspection panels, persistence adapters, storage sync, broadcast-channel sync, or cross-tab coordination.
- [ ] Model-based browser/SUT runners, fuzzing, graph visualizers, or replay UI before simple path generation and trace receipts work.
- [ ] A separate `@flow-state/react` package split during the first rebuild. Keep the code modular enough to split later.
- [ ] Compatibility migrations for old docs/examples. Old surfaces should be deleted or marked historical, not kept working silently.

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

- [ ] Create `packages/flow-state/src/public-api-types.test.ts` for public names, type inference, service requirements, and legacy-field rejection.
- [ ] Create `packages/flow-state/src/resource-store.test.ts` for seed, get, patch, subscribe, ensure, refresh, invalidate, hydration, and snapshot axes.
- [x] Create `packages/flow-state/src/transactions.test.ts` for preview rollback, concurrency, invalidation, typed failures, and transaction receipts.
- [x] Create `packages/flow-state/src/orchestrator-system.test.ts` for actor registry, child lifecycle, stream disposal, failure bubbling, and retry behavior.
- [ ] Create `packages/flow-state/src/runtime-invokes.test.ts` for `ensure`, `observe`, streams, stream generations, and timers.
- [ ] Create focused machine, runtime, React, and harness tests as modules are added. Do not recreate one large `index.test.ts`.
- [ ] `examples/launch-workspace/src/launchWorkspace.test.ts` is the flagship acceptance contract.
- [ ] `examples/launch-workspace/src/launchWorkspaceServices.test.ts` protects Effect service patterns, schemas, redaction, typed failures, and batching.
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
- [ ] Rebuild tests by ownership. Do not recreate the old package-level monolith.
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
- [ ] Preserve literal ids and inference across module/app composition.
- [ ] Validate duplicate ids, missing refs, invalid module entries, and app inventory errors.
- [x] Delete `flow.mutation` rather than carrying a compatibility alias.
- [x] Keep `flow.view` pure: no fetching, mutation, invalidation, timers, streams, or actor starts.

Test scenarios:

- [ ] `flow.resource` preserves id, key, params, schema, lookup Effect requirement, and snapshot type.
- [x] `flow.transaction` accepts `params`, `preview`, `commit`, `invalidates`, `routes`, and `concurrency`.
- [x] `flow.transaction` rejects legacy `input`, `effect`, and `optimistic` in type tests.
- [ ] `flow.machine` preserves states, events, context factory, guards, actions, invokes, streams, timers, and children.
- [x] `flow.app` collects module descriptors without executing runtime work.
- [x] `App.layer` has the correct Effect `Layer` type even before runtime behavior is implemented.

Acceptance:

- [x] `pnpm --filter @flow-state/core test -- --run public-api-types`
- [ ] No runtime behavior is faked just to satisfy descriptor tests.
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
- [ ] Readonly sources cannot be updated through writable APIs.
- [ ] Derived/view diamond graphs compute once per input change and do not create stale intermediate reads.
- [x] Scoped batching reports the final value once, without global ambient batch depth.

TanStack Query scenarios to adapt:

- [ ] Resource state transitions are reducer-like and deterministic.
- [x] `ensure` returns cached data when fresh and starts lookup when missing/stale.
- [ ] `invalidate` marks matching resources stale and optionally schedules refresh.
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

- [ ] Keep views pure and readonly.
- [x] Views may combine resources, actor snapshots, transaction state, stream state, timers, children, receipts, and issues.
- [ ] Views must not fetch, mutate, invalidate, start actors, start streams, or schedule timers.
- [ ] Prefer direct resource/actor reads in examples unless projection materially transforms or joins data.
- [ ] Implement derived graph caching only if the simple selector source becomes insufficient.

TanStack Store scenarios to adapt:

- [ ] Diamond and complex-diamond view graphs recompute deterministically.
- [ ] Readonly views cannot be written through mutation APIs.
- [ ] Selector equality prevents view consumers from rerendering when selected output is stable.
- [ ] Views unsubscribe from all source stores when disposed.

Acceptance:

- [ ] View tests prove sparing, pure projection semantics.
- [ ] Launch-workspace uses views only where they join or significantly transform data.

## Phase 9: React Adapter

- [ ] Keep React in `src/react/*` and public barrel wiring only.
- [ ] Implement provider/context as typed runtime transport, not as canonical data storage.
- [ ] Implement `flow.useResource` with native React `useSyncExternalStore` over `SelectionSource<T>`.
- [ ] Implement `flow.use` for actor snapshots with selector/equality support by composing `selectSource(source, selector, equal)` before calling `useSyncExternalStore`.
- [ ] Implement `flow.useView` for advanced projections.
- [ ] Read optimistic snapshot before subscribing, then reconcile after subscription to avoid missed updates.
- [ ] Unsubscribe exactly once on unmount.
- [ ] Do not start streams, timers, or transactions from hook render.

TanStack Query and Store scenarios to adapt:

- [ ] No missed update between initial read and subscription.
- [ ] Selector equality suppresses rerenders for unchanged selected values.
- [ ] Selected sources notify only when `equal(previousSelected, nextSelected)` is false.
- [ ] Selected sources compute from the latest source snapshot, not from stale closure state.
- [ ] Selected sources unsubscribe from the base source exactly once.
- [ ] If the selected-source bridge is buggy or cannot satisfy React adapter tests cleanly, decide in this phase whether to add `use-sync-external-store/with-selector`.
- [ ] Provider unmount disposes subscriptions but not necessarily the runtime unless provider owns it.
- [ ] Nested provider override works when intentionally supported.
- [ ] Hooks throw a clear error when runtime/provider is missing.

Deferred for later:

- [ ] Suspense resource reads.
- [ ] Error reset boundary.
- [ ] SSR hydration boundary.
- [ ] RSC loader/runtime split.

Acceptance:

- [ ] React hook tests pass with deterministic store updates.
- [ ] Core package tests still pass without React behavior.

## Phase 10: Launch Workspace Integration

- [ ] Split `examples/launch-workspace/src/launchWorkspace.ts` by module ownership before expanding behavior.
- [ ] Keep `launchWorkspace.test.ts` as the end-to-end contract for real app usage.
- [ ] Preserve API coverage tests.
- [x] Preserve module/app/layer/runtime inventory tests.
- [ ] Preserve typed Effect service failure tests.
- [ ] Preserve redaction and schema boundary tests.
- [ ] Preserve seeded ResourceStore startup tests.
- [ ] Preserve `flow.can` permission gate tests.
- [ ] Preserve fail-closed missing-resource guard tests.
- [ ] Preserve assistant child lifecycle, failure bubbling, retry-only-failed-child, and approval gate tests.
- [ ] Preserve chat stream keep-alive, detach, explicit dispose, interrupt lane, and stale token rejection tests.
- [x] Preserve module fixture seeding.
- [ ] Preserve graph/trace/replay/model/story descriptor tests as descriptors first, then behavior later.
- [ ] Remove or mark offline queue tests as future unless the API is restored.

- Current executable slice: `flow.module(...).inventory()` and `flow.app(...).inventory()` are now live descriptor facts instead of doc-only claims, using shared inventory summarization for module/app coverage tests. `flowTest.app(...).seedModuleFixtures(name)` now loads fixture arrays exported by modules, and `.start(machine, { input })` now merges partial initial context overrides as documented by the harness type contract. The flagship `launchWorkspace.test.ts` inventory and fixture-seeding checks are back on the executable path without hand-wiring resources into machine context.

Acceptance:

- [ ] `pnpm --filter @flow-state/launch-workspace test -- --run`
- [ ] `pnpm --filter @flow-state/launch-workspace build`

## Phase 11: Model Testing, Replay, And Trace

- [ ] Implement simple path generation before richer browser/SUT adapters.
- [ ] Filter generated events through `flow.can`.
- [ ] Capture event -> transition -> resource/transaction/stream/child/timer receipts.
- [ ] Add replay reports that preserve success, typed failure, defect, and interrupt lanes.
- [ ] Add rehydration tests that restore snapshots without replaying entry/exit actions or restarting side effects.

XState scenarios to adapt:

- [ ] Shortest/simple path generation.
- [ ] Guarded transition coverage.
- [ ] Dynamic event cases.
- [ ] Rehydration preserves `can(event)` and active children.
- [ ] Restored snapshots do not duplicate receipts.
- [ ] Inspection events include source/target actor ids and correlation ids.

Acceptance:

- [ ] `flowTest.model` is useful for launch-workspace command graphs.
- [ ] Replay reports are deterministic and do not require real time.

## Phase 12: Documentation And Status

- [ ] Update docs only after behavior is implemented or intentionally marked future.
- [ ] Keep docs professional and final-feeling; do not describe unfinished internals as available.
- [ ] Update reference pages for any API decisions made during the rebuild.
- [ ] Keep views demoted to advanced read models.
- [ ] Keep offline queue out of public docs unless it is reintroduced with working tests.
- [ ] Remove docs/examples for `flow.query`, `flow.mutation({ input, effect })`, and `optimistic`; mention them only as historical removals if needed.
- [ ] Update `TODO.md` only after implementation gates prove the new status.

Acceptance:

- [ ] `pnpm docs:build`

## Scenario Matrix

| Area                | Reference Library              | Scenarios To Copy                                                              | Flow State Target                                                 |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Resource lifecycle  | TanStack Query                 | state reducer, stale/fresh, cache update, invalidation, previous data on error | `ResourceStore`, `flow.ensure`, `flow.refresh`, `flow.invalidate` |
| Runtime lifecycle   | TanStack Query                 | mount count, focus/online managers, cleanup                                    | `flow.runtime`, `App.layer`, host-signal services                 |
| Observer bridge     | TanStack Query, TanStack Store | optimistic read, subscribe, reconcile, selector equality                       | `flow.useResource`, `flow.use`, `flow.useView`                    |
| Mutation lifecycle  | TanStack Query                 | pending/success/failure, retry/reset, scoped serialization, cancellation       | `flow.transaction`                                                |
| Store selection     | TanStack Store                 | `get`/`subscribe`, selector equality, readonly sources, batching               | `SelectionSource`, resource/actor snapshots                       |
| Derived graph       | TanStack Store                 | diamond recomputation, complex derived graph cleanup                           | `flow.view` only where projection is significant                  |
| Machine transitions | XState                         | pure transition, guards, assign/update, action order, `can(event)`             | `flow.machine`, `flow.can`, `flowTest`                            |
| Invokes             | XState                         | success/error/snapshot routing, cleanup                                        | `flow.ensure`, `flow.run`, `flow.stream`, child actors            |
| Time                | XState                         | delayed events, custom clock, cancel-on-stop                                   | `flow.after`, `flowTest.advance`, `TestClock`                     |
| Children            | XState                         | registration, stop, completion, retry, parent cleanup                          | `flow.child`, `OrchestratorSystem`                                |
| Rehydration         | XState, TanStack Query         | newer data wins, no replayed entry actions, active children restored           | resource hydration, actor snapshot restore                        |
| Inspection          | XState                         | actor/event/snapshot/action/microstep inspection                               | receipts, issues, traces, replay                                  |

## Command Gates

Run focused gates while building:

```sh
pnpm --filter @flow-state/core test -- --run
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

- [ ] `packages/flow-state` is decomposed into owned modules.
- [ ] Core runtime behavior is Effect-native.
- [ ] ResourceStore, OrchestratorSystem, transactions, streams, timers, testing, and React hooks are separately testable.
- [ ] The launch-workspace example runs against real library behavior, not contract-only stubs.
- [ ] Views are advanced and sparing.
- [ ] Offline queue is either removed from the active contract or reintroduced with working tests.
- [ ] The docs describe only implemented or intentionally future-marked behavior.
- [ ] The thermo-nuclear review finds no blocking architectural issues.
- [ ] `pnpm verify` passes.
