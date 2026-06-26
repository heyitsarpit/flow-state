# Runtime Semantics

Status: implementation guide.

This page defines the runtime semantics Flow State should study, copy conceptually, reimplement, and improve with Effect v4. The goal is not to wrap XState forever. The goal is to build an Effect-native statechart runtime that learns from XState, TanStack Query, and TanStack Store while making testing, tracing, typed failures, scopes, cache, and streams first-class.

## Core Position

Flow State should own its runtime.

XState remains the statechart semantics benchmark. TanStack Query remains the cache lifecycle benchmark. TanStack Store remains the subscription and selector benchmark. Effect v4 is the substrate.

```txt
XState        -> statechart and actor semantics to study
Effect v4     -> runtime, services, scopes, fibers, failure, time, streams
TanStack Query -> cache, observers, stale/gc, invalidation, mutations
TanStack Store -> subscriptions, selectors, batching, derived state
Flow State    -> synthesis with machine-owned Effect/cache/test semantics
```

## Mental Model

Flow State is not a synchronous state library with Effect bolted on. Flow State is an Effect-native runtime with a deterministic transition kernel.

```txt
compiled machine graph
  -> actor mailbox
  -> deterministic macrostep
  -> Effect-owned scopes, fibers, queries, mutations, streams, timers
  -> atomic public snapshot
  -> React/test/devtools adapters
```

The transition kernel stays deterministic so the runtime can preserve run-to-completion, prevent impossible intermediate snapshots, and make tests exact. Async work stays Effect-first through named runtime primitives, not through ambiguous async actions.

## Why Not Just Wrap XState?

Wrapping XState is useful for learning and maybe interop, but it weakens the final product.

If XState is the engine, Flow State has to tunnel Effect features through XState actor and promise boundaries. That means our best testing and tracing ideas become adapters around opaque runtime internals.

Owning the runtime lets us make these native:

- Effect `Scope` as actor and state lifetime.
- `Exit` and `Cause` as success, typed failure, defect, and interruption representation.
- `Layer` and `Context` as service and mock injection.
- `Schedule` and `TestClock` as deterministic time and retry.
- `Stream`, `Queue`, and `PubSub` as subscription and event sources.
- Cache writes, invalidations, mutation transactions, and stream interruption as traceable receipts.
- Semantic test coverage over states, transitions, failures, effects, cache contracts, and streams.

## Use XState As Reference, Not Dependency

We should study XState deeply for algorithms and edge cases.

What to copy conceptually:

- State node tree normalization.
- Event selection and transition priority.
- Run-to-completion transition loop.
- Internal event queue.
- Entry and exit action ordering.
- Invoked actor lifecycle.
- Child actor supervision.
- Delayed transitions.
- Snapshot shape.
- Graph traversal for tests and visualization.

What not to copy blindly:

- Full SCXML compatibility.
- Every actor type.
- Full persistence edge cases before we need them.
- Visual editor compatibility.
- History state semantics until examples demand them.
- Promise-first failure routing.

Code reuse note: XState is MIT, so direct reuse may be legally possible with attribution, but the better architectural path is to reimplement the required algorithms in Effect-native terms.

## Runtime Features

### State Node Tree

Purpose: represent atomic, compound, parallel, final, and later history states.

XState lesson:

- A machine is a tree of state nodes.
- Compound states have one active child.
- Parallel states have multiple active child regions.
- Final states complete their parent region.

Effect-native implementation:

```txt
State tree metadata -> immutable compiled structure
Active state value  -> Ref/SynchronizedRef inside actor runtime
Graph metadata      -> static graph artifact for docs/tests
```

Effect primitives:

- `Effect` for compile/validation steps if they can fail.
- `Schema` later for validating persisted snapshots.
- `Ref` or `SynchronizedRef` for actor runtime state.

Testability requirements:

- Assert initial active state.
- Assert nested and parallel state resolution.
- Detect unreachable state nodes.
- Detect invalid transition targets.

Implementation status:

- Atomic and compound states are first implementation targets.
- Final states should be stubbed in graph metadata and implemented if cheap.
- Parallel and history states stay in the product surface as graph stubs until their algorithms are copied and tested against XState fixtures.
- Active state should be modeled as active leaf nodes internally, not only as a string path.

## Event Queue and Run-To-Completion

Purpose: make event ordering deterministic.

Problem:

Events can arrive from UI, raised internal events, delayed timers, invoked Effect results, streams, and child actors. Without a queue, the runtime becomes racey.

Required semantics:

- One transition macrostep runs to completion before the next event is processed.
- External events enter the actor mailbox.
- Raised events are internal and should run before later external events.
- Invoked work completions enqueue result events.
- Stream values enqueue mapped events or value receipts.
- Infinite `always` or raised-event loops must be detected.

Effect-native implementation:

```txt
Actor mailbox     -> Queue
Runtime loop      -> Effect.forever / scoped fiber
Internal queue    -> in-memory queue inside a macrostep
Loop protection   -> max internal event count per macrostep
Trace receipts    -> event received, transition selected, event processed
```

Effect primitives:

- `Queue` for actor mailbox.
- `Fiber` for actor process.
- `Scope` for actor lifetime.
- `Ref` / `SynchronizedRef` for snapshot mutation.
- `Cause` for runtime defects.

Testability requirements:

- Test ordering between external events and raised events.
- Test invoked Effect completion during an active transition.
- Test loop detection for recursive `always` transitions.
- Test no intermediate impossible snapshot leaks to subscribers.

## Transition Selection

Purpose: choose the correct transition for an event.

XState lesson:

- Transition selection is a real algorithm, not a dictionary lookup.
- Nested states, parent fallback, guards, transition order, and parallel regions all matter.

Required semantics:

- Match event type against active state nodes from deepest to parent.
- Evaluate guarded transitions in declaration order.
- Select enabled transitions.
- Compute exit set and entry set.
- Run exit actions, assignments, entry actions, and invoked work in deterministic order.

Effect-native implementation:

```txt
Pure selection algorithm -> deterministic function
Action execution         -> Effect steps in transition transaction
Assignments              -> atomic context update
Trace                    -> selected transition and guard outcomes
```

Effect primitives:

- Pure TypeScript for selection where possible.
- `Effect` for effectful actions only if allowed.
- `Ref` / `SynchronizedRef` for atomic snapshot update.

Testability requirements:

- Guard branch coverage.
- Transition priority coverage.
- Parent fallback coverage.
- Parallel conflict coverage when parallel states exist.

Open decision:

- `flow.action` should be synchronous transition work.
- Critical async workflow work should enter through `flow.effect`, `flow.query`, `flow.mutation`, `flow.stream`, `flow.after`, or `flow.child`.
- This keeps Effect central while preserving deterministic transition commits.

## Raised Events

Purpose: let a transition enqueue internal follow-up events.

Example:

```txt
SaveSuccess -> raise InvalidateProject -> process invalidation transition
```

Why it matters:

- Keeps public UI events small.
- Lets the runtime decompose internal behavior.
- Helps generated tests and traces show internal decisions.

Effect-native implementation:

```txt
raise(event) -> append to macrostep internal queue
```

Effect primitives:

- Local macrostep queue.
- Trace receipt for raised events.

Testability requirements:

- Raised events run before later external events.
- Raised event loops fail with clear diagnostics.
- Raised events appear in traces but can be marked internal.

Implementation status:

- The internal queue is required for runtime correctness even before public `flow.raise` is complete.
- Public `flow.raise(...)` can start as a stub that records intent and trace shape.

## Delayed Transitions

Purpose: transition after time passes.

Examples:

```txt
saved --after 2 seconds--> viewing
idle --after 5 minutes--> expired
retrying --after backoff--> loading
```

Effect-native implementation:

```txt
State entry schedules timer fiber in state scope.
State exit interrupts timer fiber.
Timer completion enqueues delayed event.
```

Effect primitives:

- `Clock` for runtime time.
- `TestClock` for deterministic tests.
- `Schedule` for retry/backoff.
- `Scope` and `Fiber` for timer lifecycle.

Testability requirements:

- Advance test clock without real waiting.
- Leaving state cancels delayed transition.
- Reentering state creates a fresh timer.
- Trace records scheduled, cancelled, fired.

Implementation status:

- Keep `flow.after` in the API surface.
- Stub metadata first.
- Implement with `Clock` and `TestClock` as soon as an example needs auto-dismiss, timeout, retry, or debounce.

## Invoked Effects

Purpose: run typed Effect work when a state is entered.

Required semantics:

- Enter state -> start Effect in that state's scope.
- Success -> enqueue success result.
- Typed failure -> enqueue failure result.
- Defect -> enqueue defect result or fail actor depending policy.
- Exit state -> interrupt Effect unless configured as detached/cache-owned.

Effect-native implementation:

```txt
Effect invocation -> Effect.forkScoped
State lifetime    -> Scope
Outcome           -> Exit
Failure details   -> Cause
Runtime services  -> Layer / Context
```

Effect primitives:

- `Effect`
- `Scope`
- `Fiber`
- `Exit`
- `Cause`
- `Layer`
- `Context`
- `Runtime`

Testability requirements:

- Inject fake services with `Layer`.
- Assert success, typed failure, defect, interruption.
- Assert cleanup on state exit.
- Assert no raw promise escapes.
- Assert in-flight Effect receipts in trace.

Important distinction:

```txt
Expected failure -> typed data -> issue + failure route
Defect           -> Cause.Die / unexpected -> issue + defect route or runtime failure
Interrupt        -> Cause.Interrupt -> cancellation receipt
```

## Invoked Streams

Purpose: subscribe to pushed values while a state is active.

Examples:

- Upload progress.
- Agent run events.
- Websocket messages.
- SSE updates.
- Live dashboard feed.

Required semantics:

- Enter state -> start stream in state scope.
- Stream value -> enqueue mapped event or update stream slot.
- Stream failure -> typed failure route.
- Stream end -> optional completion route.
- Exit state -> interrupt stream and run cleanup.

Effect primitives:

- `Stream`
- `Scope`
- `Fiber`
- `Queue`
- `PubSub`
- `Exit`
- `Cause`

Testability requirements:

- Controlled stream emits values.
- State exit cancels stream.
- Stream failure is typed.
- Stream values appear in trace.
- No subscription leak after state exit.

Implementation status:

- Needed for upload and agent examples.
- Stub pressure policy first.
- Keep simpler than full query streaming.

## Child Actors

Purpose: allow machines to supervise child machines or long-lived actors.

XState lesson:

- Child actors have identity, lifecycle, mailbox, snapshots, and parent communication.

Effect-native implementation:

```txt
Child actor process -> scoped fiber
Child mailbox       -> Queue
Parent scope        -> owns child unless detached
Snapshot tree       -> parent includes child summaries
```

Effect primitives:

- `Scope`
- `Fiber`
- `Queue`
- `Ref`
- `PubSub` for subscriptions

Testability requirements:

- Child starts when expected.
- Child stops on parent state exit.
- Parent receives child completion/failure.
- Snapshot includes child actor state.

Implementation status:

- Keep `flow.child` in the planned surface.
- Stub parent/child graph metadata first.
- Implement only the machine child actor path before copying any broader actor zoo.

## Invoke Cleanup

Purpose: guarantee resources release when a state or actor exits.

Examples:

- Abort fetch.
- Close websocket.
- Stop polling.
- Cancel upload.
- Release file handle.
- Remove observer subscription.

Effect-native implementation:

```txt
Every state owns a Scope.
Every invoked Effect/Stream/timer is forked in that Scope.
Exiting the state closes the Scope.
```

Effect primitives:

- `Scope`
- `Effect.scoped`
- `Effect.acquireRelease`
- `Effect.onInterrupt`
- `Fiber.interrupt`

Testability requirements:

- Cleanup receipt appears in trace.
- Controlled Effect observes interruption.
- Controlled Stream observes cancellation.
- Cache-owned query behavior is explicitly different from state-owned Effect behavior.

Open decision:

- Queries may detach into cache instead of being interrupted on state exit.
- That needs a clear policy.

## Actor Snapshots

Purpose: expose current runtime state for rendering, tests, devtools, and future persistence.

Snapshot should include:

- Actor id.
- Current state value.
- Context.
- Status.
- Tags.
- Active invokes.
- Child actor summaries.
- Resource states.
- Mutation states.
- Last event.
- Version.

Should not blindly include:

- Raw fibers.
- Raw service instances.
- Sensitive Effect inputs/outputs unless trace redaction allows it.
- Non-serializable runtime internals.

Effect-native implementation:

```txt
Snapshot Ref      -> latest public snapshot
Trace receipts    -> explain how snapshot changed
Schema later      -> persisted snapshot validation/migration
```

Effect primitives:

- `Ref`
- `Schema`
- `Exit` encoding for outcomes

Testability requirements:

- Snapshot updates are atomic.
- No impossible intermediate snapshots.
- Snapshot can be inspected without subscribing.
- Snapshot can feed semantic tests and view projections.

## Persistence

Purpose: save and restore actor/cache state.

Examples:

- Restore editor draft after refresh.
- Restore checkout progress.
- Restore long-running agent task view.

Hard parts:

- Machine versioning.
- Context migrations.
- Child actors.
- In-flight Effects.
- Streams.
- Cache entries.
- Sensitive data redaction.

Effect-native implementation:

- Use `Schema` for persisted shape.
- Use explicit `version`.
- Use migration functions.
- Persist only stable public state, not fibers/scopes.

Implementation status:

- Keep persistence in the product map.
- Stub snapshot version, redaction, and migration metadata.
- Do not persist fibers, scopes, service instances, or raw Effect internals.

## Graph Semantics

Purpose: make the machine inspectable as a graph.

Uses:

- Visualizing flows.
- Generating model tests.
- Finding unreachable states.
- Detecting invalid transitions.
- Semantic coverage.
- PR graph diffs.
- AI-readable explanations.

Graph artifact should include:

- States.
- Transitions.
- Events.
- Guards.
- Invoked Effects.
- Invoked queries.
- Mutations.
- Streams.
- Typed failure routes.
- Cache invalidation contracts.

Effect-native implementation:

```txt
Compile config -> static graph metadata
Runtime trace  -> dynamic graph execution receipts
```

Testability requirements:

- Generate shortest path to each state.
- Generate coverage report for states/transitions/guards/failures/cache.
- Detect dead states.
- Detect unhandled failure paths where possible.

Implementation status:

- Build enough graph metadata for tests early.
- Stub visualization and PR graph diff consumers on top of graph metadata.

## TanStack Query Lessons

Cache is not a map.

Cache is:

- Key hashing.
- Observer lifecycle.
- Active/inactive state.
- Stale timestamps.
- Garbage collection.
- Fetch status.
- Retry state.
- Invalidation policy.
- Dedupe.
- Cancellation.
- Mutation transactions.
- Optimistic rollback.

Required cache semantics to design:

- Deterministic key hashing.
- Serializable object key parts.
- Exact key matching.
- Prefix matching.
- Predicate matching.
- Tag matching.
- Mark stale only.
- Refetch active observers.
- Refetch inactive entries.
- Cancel in-flight work.
- Keep previous data.
- Placeholder data stance.
- Failure count and last error.
- `status` separate from `fetchStatus`.

Effect implementation map:

| Cache concept    | Effect primitive                              |
| ---------------- | --------------------------------------------- |
| Query table      | `Ref` / `SynchronizedRef`                     |
| In-flight dedupe | `Deferred`, `Fiber`, `Ref`                    |
| TTL and GC       | `Clock`, `TestClock`, `Schedule`              |
| Retry            | `Schedule`                                    |
| Cancellation     | `Scope`, `Fiber.interrupt`, `Cause.Interrupt` |
| Query work       | `Effect`                                      |
| Typed result     | `Exit`                                        |
| Validation       | `Schema`                                      |

Implementation status:

- Do not clone all TanStack Query options.
- Copy lifecycle contracts.
- Keep user API machine-owned.

## TanStack Store Lessons

TanStack Store is useful as an internal design reference.

Features to copy conceptually:

- Tiny store core.
- Subscriptions.
- Derived values.
- Batching.
- Selectors.
- Equality comparison.
- Framework adapters using stable external-store semantics.

Features not to expose directly:

- A separate public store vocabulary.
- Standalone atom/store API unless examples prove it is needed.

Effect implementation map:

| Store concept | Flow State implementation                  |
| ------------- | ------------------------------------------ |
| Store state   | actor snapshot `Ref`                       |
| Derived state | view projection / selectors                |
| Subscription  | `PubSub` or external-store adapter         |
| Batching      | transition macrostep notification batching |
| Equality      | selector comparator                        |
| React adapter | `useSyncExternalStore` style hook          |

Testability requirements:

- Render-count tests.
- Selector stability tests.
- Batched notification tests.
- Structural sharing tests where relevant.

## Testing Requirements

Runtime semantics are only real if testable.

Core tests we need:

- Event queue ordering.
- Run-to-completion.
- Guard selection.
- Parent fallback.
- Entry/exit action ordering.
- Invoked Effect success/failure/defect/interruption.
- Stream value/failure/interruption.
- Delayed transition with `TestClock`.
- Cache hit/miss/stale/refetch/invalidate.
- Mutation success/failure/rollback/concurrency.
- Snapshot atomicity.
- Selector equality and batching.
- Graph coverage.

Test API should expose:

- `flush()` for currently ready continuations. It must not wait forever for still-running Effects,
  timers, or streams.
- Bounded `settle()` for quiescence with diagnostics.
- Controlled Effects.
- Controlled Streams.
- Fake `Layer`s.
- `TestClock`.
- Cache probes.
- Lifecycle receipts.
- Trace inspection.

## Stubbed Or Research Semantics

Keep these in the implementation guide, but do not pretend the semantics are settled:

- History states.
- Full parallel state semantics.
- Full persistence.
- Full graph visualization.
- PR graph diffs.
- Router integration.
- Permissions.
- AI explanation output.
- Infinite query clone.
- Broadcast/persisted query cache.
- Full XState actor zoo.

## Avoid Copying

Avoid:

- Promise-first failure semantics.
- Giant Query option surface.
- Public store API as a separate mental model.
- SCXML compatibility as a goal.
- Visual editor compatibility as a design constraint.
- Devtools-first architecture before trace semantics are stable.

## Implementation Sequence

1. Build Project Editor as the API pressure test.
2. Define the statechart subset explicitly.
3. Implement Effect runtime and `fromEffectResult`.
4. Implement actor mailbox and run-to-completion.
5. Implement state entry/exit scopes and invoke cleanup.
6. Implement delayed transitions with `Clock` and `TestClock`.
7. Implement stream invocation.
8. Implement cache v0 with observer lifecycle, stale/gc, dedupe, invalidation, timestamps, and failure count.
9. Implement mutation v0 with variables, mutation key/scope, rollback context, and invalidation awaiting.
10. Implement React hooks with selector equality and batched notifications.
11. Implement test harness with controlled Effects, controlled Streams, fake Layers, cache probes, and trace receipts.
12. Add graph metadata for semantic coverage.
13. Stub devtools, persistence, router, and graph diff against trace/snapshot contracts before implementing their full behavior.

## Design Rule

Every runtime feature should answer four questions:

1. What is the XState or TanStack semantics benchmark?
2. Which Effect primitive owns the implementation?
3. What trace receipt proves it happened?
4. How does the test harness control or assert it?

If we cannot answer those, the feature is not ready for implementation.
