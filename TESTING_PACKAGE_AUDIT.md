# Testing Package Audit

This file audits `@flow-state/testing` as the most important package in the
repo's day-to-day development loop.

Companion files:

- [TESTING.md](/Users/arpit/Developer/flow-state/TESTING.md) for the concrete
  task list of what to build next.
- [HOW_TO_USE_FLOW_STATE.md](/Users/arpit/Developer/flow-state/HOW_TO_USE_FLOW_STATE.md)
  for the higher-level framework/AI-first usage model this library is trying to
  support.

The goal is not just to restate exported APIs. The goal is to answer:

- What tests can we write today?
- How do we structure frontend apps so those tests stay easy to write?
- Why is Effect carrying so much of the value here?
- What does Flow State testing do that plain XState does not do?
- What should we add, rename, tighten, or delete to make app developers more
  productive?

## Verdict

The testing package is already one of the strongest parts of the repo.

The real win is not "you can send events to a machine." XState can already do
that. The real win is that Flow State gives one test surface that can exercise:

- machine transitions
- Effect-powered services
- virtual time
- streams
- transactions
- preview patches and rollbacks
- resource invalidation
- child actors
- app fixtures
- runtime receipts and typed issues
- bounded quiescence diagnostics

That unified harness is the thing worth protecting.

The main weaknesses are API ergonomics, type slop, naming drift, and missing
"developer loop" helpers.

## What You Can Test Today

## 1. Machine Semantics

You can test the core machine behavior directly:

- accepted events
- rejected events
- guards
- transitions
- updates
- actions
- microsteps
- no-transition cases

Proof surface:

- [packages/flow-state/src/machine.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/machine.test.ts)
- [packages/flow-state/src/flow-test-model.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-model.test.ts:11)

This is the minimum bar that any state library should hit.

## 2. Guard-Aware Model Paths

`flowTest.model(machine)` already gives guard-aware path discovery with payload
candidates.

Proof:

- [packages/flow-state/src/testing/flow-model.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-model.ts:287)
- [packages/flow-state/src/flow-test-model.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-model.test.ts:11)

This is useful for:

- shortest-path scenario generation
- simple-path coverage exploration
- "what event sequence even reaches this state?" questions

## 3. Virtual Time

`advance(duration)` and `settle(bounds)` are real and already backed by
Effect `TestClock`.

Proof:

- [packages/flow-state/src/testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:1894)
- [packages/flow-state/src/flow-test-settle.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-settle.test.ts:31)
- [packages/flow-state/src/runtime-invokes.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-invokes.test.ts:28)

You can cover:

- delayed `flow.after(...)` transitions
- timer cancellation on state exit
- timer cancellation on actor dispose
- "flush is not time"
- bounded quiescence
- stuck timer diagnostics

## 4. Streams

The harness is already unusually strong here.

You can test:

- param resolution failures
- stream generations
- cancellation and stale emission ignoring
- done routes
- interrupt routes
- failure and defect lanes
- queued mailbox work triggered by stream values

Proof:

- [packages/flow-state/src/flow-test-streams.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-streams.test.ts:8)
- [packages/flow-state/src/flow-test-inspection.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-inspection.test.ts:34)
- [packages/flow-state/src/testing/controlled-stream.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/controlled-stream.ts:1)

This is already better than the typical "mock a callback and hope" story.

## 5. Transactions

This is where Flow State testing becomes meaningfully different from plain
state-machine testing.

You can test:

- success routes
- typed failure routes
- defect routes
- preview patches
- rollbacks
- invalidation
- retry/reset
- `serialize`
- `reject-while-running`
- `cancel-previous`
- `allow`
- stale-result ignoring
- shared concurrency scopes

Proof:

- [packages/flow-state/src/transactions.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transactions.test.ts:722)
- [packages/flow-state/src/transactions.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transactions.test.ts:1033)
- [packages/flow-state/src/transactions.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/transactions.test.ts:1652)

This is the single biggest testing advantage in the repo today.

## 6. Resource And App Scenarios

At the app layer you can seed shared resource state and module fixtures, then
run real scenarios against a machine.

Proof:

- [packages/flow-state/src/app-inventory.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/app-inventory.test.ts:119)
- [packages/flow-state/src/testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:1970)

You can cover:

- app fixture seeding
- input overrides
- shared resource setup
- app-owned machine scenarios
- module inventory-driven tests

## 7. Child Actors

You can test child lifecycle and pending child work.

Proof:

- [packages/flow-state/src/flow-test-inspection.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-inspection.test.ts:144)
- [packages/flow-state/src/orchestrator-system.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/orchestrator-system.test.ts)

You can cover:

- child start
- child success
- child failure
- child stop
- child retry
- child pending/stuck diagnostics

## 8. Stuck-Test Diagnostics

`pendingWork()` plus `settle(bounds)` is a real debugging surface, not just a
test helper.

Proof:

- [packages/flow-state/src/testing/pending-work.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/pending-work.ts:1)
- [packages/flow-state/src/flow-test-inspection.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-inspection.test.ts:34)
- [packages/flow-state/src/flow-test-settle.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/flow-test-settle.test.ts:45)

You can answer:

- Is work ready right now?
- Is a timer the blocker?
- Is a stream still running?
- Is a transaction still pending?
- Is a child actor preventing quiescence?

## 9. React-Level Render Safety

This is not in the testing package itself, but the repo already tests frontend
render contracts well enough that it should be part of the testing story.

Proof:

- [packages/flow-state/src/react/use-resource.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-resource.test.ts)
- [packages/flow-state/src/react/use-view.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-view.test.ts)
- [packages/flow-state/src/react/use-actor.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/react/use-actor.test.ts)

You can cover:

- render/subscribe races
- SSR-safe reads
- shell-to-live actor swap
- rerender suppression via equality
- hook-owned actor lifecycle

## 10. Rehydration And Runtime Facts

Again, this is broader than `flowTest`, but it matters because a good testing
story should let app developers prove restore behavior.

Proof:

- [packages/flow-state/src/runtime-rehydration.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-rehydration.test.ts)
- [packages/flow-state/src/runtime-inspection.test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/runtime-inspection.test.ts:328)

You can cover:

- actor serialization
- runtime boot payloads
- rehydrated timers
- interrupted work on restore
- trace correlation after restore

## How To Write Maximally Testable Frontend Apps

If we want frontend apps to be easy to test, the code should be written so
`flowTest` is the natural proof surface, not a rescue tool.

## 1. Keep UI Thin

Components should render snapshots and views, not own business logic.

Prefer:

- `flow.useView(actor, view)`
- `flow.useResource(ref)`
- pure view selection

Avoid:

- `useEffect` as the main workflow engine
- UI-local caches that duplicate runtime state
- hidden timers in components

## 2. Push I/O Into Effect Services

Represent network/database/host dependencies as Effect services and install test
layers with `.provide(...)`.

Why this helps:

- one fake layer can drive many scenarios
- service behavior stays typed
- success/failure/interrupt paths stay explicit

## 3. Keep Machine Context Small And Serializable

Machine context should hold workflow state, not entire canonical resource
objects.

Why this helps:

- easier snapshot assertions
- easier model traversal
- easier rehydration
- less duplication between resource store and machine state

## 4. Represent Long-Running Behavior Declaratively

Use:

- `flow.after(...)` for timers
- `flow.stream(...)` for streaming work
- `flow.transaction(...)` for commits and optimistic updates
- `flow.child(...)` for owned child workflows

Avoid:

- ad hoc async logic hidden in callbacks
- implicit race handling in the UI

These declarative boundaries are exactly what make the harness useful.

## 5. Use Module Fixtures For Shared Product Setups

If many screens need the same seeded domain state, declare fixtures on modules
and use `flowTest.app(App).seedModuleFixtures(...)`.

Why this helps:

- fewer copy-pasted test builders
- more realistic scenario setup
- docs/tests share the same seeds

## 6. Add Browser-Level Tests Only At The Right Layer

Most workflow correctness should stay in harness tests.

Then add browser/component tests for:

- focus and keyboard behavior
- actual DOM semantics
- drag/drop
- upload inputs
- real browser rendering behavior
- integration with real request interception

Good companion tools:

- Vitest browser component testing: `https://vitest.dev/guide/browser/component-testing`
- Playwright component testing: `https://playwright.dev/docs/test-components`
- MSW for request interception: `https://mswjs.io/docs/`

## Why Effect Is So Useful Here

Effect is doing a lot of the heavy lifting.

## 1. TestClock Makes Time Honest

The harness can move virtual time deterministically because it builds on Effect
`TestClock`.

Repo proof:

- [packages/flow-state/src/testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:1894)

Effect references:

- local docs mirror: [docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts)

## 2. Layers Make Dependency Swaps Cheap

App developers can install fake services, test repos, or controlled APIs with
real Layer composition instead of bespoke mocking frameworks.

Effect references:

- local docs mirror: [docs/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts)

## 3. Streams, Queues, And Fibers Fit The Runtime

Controlled streams are built with real Effect `Stream`, `Queue`, and finalizers,
not hand-rolled callback lists only.

Repo proof:

- [packages/flow-state/src/testing/controlled-stream.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/controlled-stream.ts:1)

This is why stream tests can model:

- buffering
- completion
- failure
- interruption
- replay to later subscribers

## 4. Failure Modeling Is Better

Flow State already distinguishes:

- success
- typed failure
- defect
- interrupt

Effect makes that distinction natural instead of bolted on.

## 5. Property Testing Is A Real Path

Effect's test stack already points toward property-style tests via
`@effect/vitest` and effect-aware property helpers.

Effect reference:

- local docs mirror: [docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts)

This suggests a good future direction for Flow State:

- property tests over event sequences
- property tests over transaction concurrency
- property tests over resource invalidation rules

## What XState Can Do, And What Flow State Adds

## What XState Already Does Well

Current XState has good support for:

- pure transitions
- inspection events
- microstep/action visibility
- graph/path utilities

References:

- pure transitions: `https://stately.ai/docs/pure-transitions`
- local graph code: [docs/codebases/xstate/packages/core/src/graph/index.ts](/Users/arpit/Developer/flow-state/docs/codebases/xstate/packages/core/src/graph/index.ts)
- local inspect code: [docs/codebases/xstate/packages/core/src/inspection.ts](/Users/arpit/Developer/flow-state/docs/codebases/xstate/packages/core/src/inspection.ts)

## What Plain XState Does Not Give You Out Of The Box

This is the careful version of the claim:

XState can do a lot, but plain XState does not give you one built-in unified
harness for all of the following at once:

- seeded resource cache state
- transaction preview patches and rollback inspection
- invalidation receipts
- module fixtures
- app inventory-driven setup
- bounded settle across timers, streams, transactions, and children
- one issue/receipt vocabulary across runtime subsystems
- Effect Layer-based service swaps

You can assemble equivalents with multiple libraries. But Flow State's test
surface is trying to make that one coherent contract.

## The Strongest "XState Can't Do This" Claims

These claims should be read as "not natively, not as one unified package
contract":

- XState does not natively own a resource store with invalidation/freshness
  semantics like Flow State.
- XState does not natively own optimistic transaction preview and rollback as a
  first-class workflow/testing surface.
- XState does not natively own app/module fixtures and inventory-aware seeding.
- XState does not natively own a bounded quiescence helper that reasons across
  streams, timers, transactions, and child actors together.

Those are the places where Flow State has a genuine wedge.

## What Exists Elsewhere That We Should Learn From

## Effect

Borrow or reinforce:

- direct Effect service tests with `@effect/vitest`
- shared test layers
- property tests
- deeper TestClock-first recipes

Sources:

- [docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/10_effect-tests.ts)
- [docs/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts](/Users/arpit/Developer/flow-state/docs/codebases/effect-v4/ai-docs/src/09_testing/20_layer-tests.ts)

## XState

Borrow:

- stronger pure-inspection APIs
- graph/path utilities promoted as first-class
- explicit microstep/action explanation surfaces

Sources:

- `https://stately.ai/docs/pure-transitions`
- [docs/codebases/xstate/packages/core/src/graph/index.ts](/Users/arpit/Developer/flow-state/docs/codebases/xstate/packages/core/src/graph/index.ts)
- [docs/codebases/xstate/packages/core/src/inspection.ts](/Users/arpit/Developer/flow-state/docs/codebases/xstate/packages/core/src/inspection.ts)

## Vitest

Borrow:

- browser component testing guidance
- stronger fake-timer and project-level recipe docs

Sources:

- `https://vitest.dev/guide/mocking/timers`
- `https://vitest.dev/guide/browser/component-testing`

## Playwright

Borrow:

- component testing recipes for real browser interactions
- trace-driven debugging ideas for failing UI scenarios

Source:

- `https://playwright.dev/docs/test-components`

## MSW

Borrow:

- first-class request interception recipes
- GraphQL/SSE/WebSocket/mock service recipes in docs

Source:

- `https://mswjs.io/docs/`

## Productivity Improvements We Should Add

## Highest ROI

- [ ] Add `flow.test` as a first-class alias to `flowTest`.
      Why: it matches the rest of the API better and reduces the "special orphan
      export" feel.

- [ ] Keep `flowTest` as a compatibility alias for now.
      Why: renaming without a transition path would cause churn.

- [ ] Remove the double-start ergonomics.
      Current examples like `flowTest.app(App).start(machine).provide(layer).start()`
      are real but clunky.
      Better shapes would be one of:
  - `flow.test(machine).with(...).run()`
  - `flow.test.app(App).scenario(machine).with(...).start()`
  - `flow.test(machine, options).provide(...).start()`

- [ ] Tighten `provide(...)` typing from `unknown` to `Layer.Any` or a properly
      generic Layer constraint.
      Why: the public type is currently too loose.
      Proof:
      [packages/flow-state/src/public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:361)
      and
      [packages/flow-state/src/testing/flow-test.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/testing/flow-test.ts:1943)

- [ ] Add typed fixture names for `seedModuleFixtures(...)`.
      Why: stringly fixture names are easy to mistype.

- [ ] Decide whether `cache()` should stay `cache()` or become
      `resources()` / `resourceCache()`.
      Why: app setup talks about resources, but the harness exposes cache.

## Debugging And Loop Speed

- [ ] Add `until(...)` helpers.
      Examples:
  - `untilState(...)`
  - `untilReceipt(...)`
  - `untilIssue(...)`
  - `until(predicate, bounds)`

- [ ] Add `advanceToNextTimer()` and `advanceUntilIdle()` helpers.
      Why: these are common developer-loop actions and less error-prone than manual
      millis.

- [ ] Add `trace()` or `captureTrace()` directly on the harness.
      Why: today users have to remember to import inspect helpers separately.

- [ ] Add pretty printing for `pendingWork()`, transaction events, and failing
      settle diagnostics.

- [ ] Add a terminal transcript renderer for harness scenarios.
      Example:
      event -> transition -> preview patch -> invalidation -> route -> issue

## Scenario Coverage And Generation

- [ ] Add property-test helpers built on Effect and Schema.
      Examples:
  - random event sequences
  - concurrency stress
  - invalidation laws
  - no-stale-success laws for restartable transactions

- [ ] Add model-to-scenario bridges.
      Example: take a `flowTest.model(...)` path and run it through the live harness
      automatically.

- [ ] Add browser integration recipes.
      Example:
      use `flowTest` for domain/runtime correctness, then pair it with
      Vitest browser or Playwright component tests plus MSW for DOM-level proofs.

## Docs And Examples

- [ ] Add a testing-scenarios matrix to the docs.
      Rows should cover:
      machine, time, streams, transactions, children, fixtures, rehydration, SSR,
      browser component tests, network interception, and property tests.

- [ ] Add "maximally testable app structure" guidance to docs.
      This should explain:
      thin UI, Layer-based I/O, fixture seeding, serializable context, and explicit
      event routing.

- [ ] Add direct `@effect/vitest` service-test examples to docs.
      Flow State should not pretend every test belongs in `flowTest`.

## Bugs, Drift, And Sloppy API Behavior

## Real Findings

- [ ] `FlowStartedTestBuilder.provide` is typed as `unknown` even though the
      surface is Layer-oriented.

- [ ] `TODO.md` is stale about testing.
      It still marks `advance(duration)` and `settle(bounds)` as unimplemented even
      though they exist and are tested.
      It also mentions `.resources()` in the harness gate while the public harness
      exposes `.cache()`.
      Proof:
      [TODO.md](/Users/arpit/Developer/flow-state/TODO.md:471)
      [TODO.md](/Users/arpit/Developer/flow-state/TODO.md:553)
      [TODO.md](/Users/arpit/Developer/flow-state/TODO.md:559)
      [packages/flow-state/src/public/app-types.ts](/Users/arpit/Developer/flow-state/packages/flow-state/src/public/app-types.ts:333)

- [ ] `createControlledEffect` looks unfinished or under-integrated.
      It is exported, but I could not find meaningful internal usage beyond export
      surface tests.
      That makes it a candidate for either:
  - better integration and docs
  - or deletion

- [ ] The callable-object API is clever but slightly sloppy.
      All of these shapes exist:
  - `flowTest(machine)...`
  - `flowTest.start(machine)...`
  - `flowTest.app(App).start(machine)...`
    That is flexible, but it makes the mental model harder than it needs to be.

## What I Would Do Next

If we want the biggest productivity gain for app developers writing tests, I
would do these next:

1. Add `flow.test` alias and begin de-emphasizing bare `flowTest`.
2. Tighten `provide(...)` typing.
3. Replace the double-start ergonomics with a clearer scenario/run shape.
4. Add `until(...)`, `advanceToNextTimer()`, and harness-level `trace()`.
5. Add typed fixture names.
6. Add docs for service tests with `@effect/vitest`, browser tests with
   Vitest/Playwright, and network tests with MSW.
7. Decide whether `createControlledEffect` should be integrated or removed.

## Verification

Local proof commands run during this audit:

- `pnpm exec vitest run packages/flow-state/src/flow-test-model.test.ts packages/flow-state/src/flow-test-settle.test.ts packages/flow-state/src/flow-test-streams.test.ts packages/flow-state/src/flow-test-inspection.test.ts packages/flow-state/src/runtime-invokes.test.ts`
  Result: `5` test files passed, `20` tests passed.
