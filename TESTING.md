# Testing Expansion Plan

This file is the concrete backlog for the final `@flow-state/testing` package
contract.

It is the testing equivalent of `INSPECT.md`: pragmatic, phased, and focused on
what we should actually build or change next.

This file does not optimize for backwards compatibility. If the current surface
is sloppy, we should rename or redesign it.

It pairs with [HOW_TO_USE_FLOW_STATE.md](/Users/arpit/Developer/flow-state/HOW_TO_USE_FLOW_STATE.md),
which captures the broader AI-first, framework-like development model these
testing improvements are meant to support.

Decision locks for this backlog:

- Phase 1 is a hard prerequisite for later phases.
- The durable public surface should move to `flow.test(...)`.
- Keep one dominant builder flow instead of preserving several equal entry
  shapes. The preferred target is `flow.test(machine).with(...).run()` unless
  proof forces small naming adjustments.
- Expose the testing route through named module exports only. Users may choose
  either:
  - namespace import style such as
    `import * as test from "@flow-state/testing"`
  - direct named imports for the exact helpers they need
- Keep `cache()` for now because the current harness surface is a narrow cache
  inspector, not a full resource API.
- Remove `createControlledEffect(...)` unless a stronger, harness-integrated use
  case is proven later.
- Keep assertions owned by the host test runner. Do not grow a Flow-owned
  assertion DSL.
- Align with the broader core cleanup decisions:
  - no new `createRuntime` usage
  - prefer `flow.app({ modules })`
  - prefer `flow.module(id, inventory)`

## Scope

Today the testing package already gives us a strong base:

- `flowTest(machine)`
- `test.app(App).scenario(machine)`
- `test.model(machine)`
- `createControlledStream(...)`

And the harness already supports:

- `.provide(layer)`
- `.clock(now)`
- `.send(event)`
- `.flush()`
- `.advance(duration)`
- `.settle(bounds)`
- `.pendingWork()`
- `.transactions()`
- `.streams()`
- `.timers()`
- `.receipts()`
- `.issues()`

The goal now is not to invent value from scratch. The goal is to make this
surface clearer, sharper, faster to use, and better aligned with how we want AI
and humans to build apps in this repo.

## Guardrails

- Keep assertions owned by the host test runner.
- Keep raw facts inspectable.
- Prefer deterministic tests over sleeps and polling.
- Prefer Layer-based dependencies over ad hoc mocks.
- Prefer one obvious testing path over several overlapping ones.
- If an API shape is awkward, rename it instead of preserving it forever.

## Baseline We Already Have

- [x] Focused machine harnesses.
- [x] App-aware harnesses with seeded resources and module fixtures.
- [x] Guard-aware model-path generation.
- [x] Virtual time through Effect `TestClock`.
- [x] Bounded quiescence through `settle(bounds)`.
- [x] Stream lifecycle testing with controlled streams.
- [x] Transaction preview, rollback, retry, reset, and concurrency testing.
- [x] Pending-work diagnostics across timers, streams, transactions, and
      children.
- [x] Reusable Effect Layer injection through `.provide(...)`.

## Phase 1. Fix The Surface

- [x] Rename the main surface to `flow.test`.
      Keep `flowTest` only as a temporary migration alias if we need one during the
      transition, but do not treat that alias as the long-term ideal.
      Why: `flowTest` feels like an orphan export while the rest of the library
      lives under `flow.*`.

- [x] Replace the callable-object overload maze with one primary entry shape.
      Current shapes like `flowTest(machine)`, `flowTest.start(machine)`, and
      `flowTest.app(App).start(machine)...start()` are flexible but sloppy.
      Pick one dominant shape and make the others secondary or remove them.

- [x] Remove the double-start ergonomics.
      The current app-builder path can require:
      `flowTest.app(App).start(machine).provide(layer).start()`
      This is real, but awkward.

- [x] Make the builder terminology more explicit.
      Good candidate vocabulary:
  - `flow.test(machine).with(...)`
  - `flow.test.app(App).scenario(machine)`
  - `flow.test(machine).run()`

- [x] Tighten `provide(...)` typing from `unknown` to a Layer-oriented type.
      Why: the implementation is already Layer-based; the public type is lazier than
      the runtime truth.

- [x] Keep `cache()` as the public term unless the harness grows into a richer
      resource-oriented API.
      Why: today the surface is a narrow snapshot inspector, so `cache()` is the
      more honest name.

- [x] Add typed fixture-name support for `seedModuleFixtures(...)`.
      Why: stringly fixture names are easy to mistype and should be derivable from
      app metadata.

## Phase 2. Improve The Developer Loop

- [x] Add `until(...)` helpers.
      Candidates:
  - `untilState(predicate | stateName, bounds?)`
  - `untilReceipt(predicate, bounds?)`
  - `untilIssue(predicate, bounds?)`
  - `until(predicate, bounds?)`
    Why: developers often want to wait for a fact, not manually alternate
    `flush`, `advance`, and `settle`.

- [x] Add `advanceToNextTimer()`.
      Why: it is a common operation and less error-prone than counting millis.

- [x] Add `advanceUntilIdle(bounds?)` or equivalent.
      Why: there is room between "flush ready work" and full bounded settle.

- [x] Add harness-level trace helpers.
      Candidates:
  - `.trace()`
  - `.captureTrace()`
  - `.traceFor(correlationId)`
    Why: users should not need to switch mental modes and imports just to turn a
    harness scenario into a trace artifact.

- [x] Add pretty-print helpers for common testing outputs.
      Candidates:
  - `formatPendingWorkPretty(...)`
  - `formatHarnessTracePretty(...)`
  - `formatTransactionEventsPretty(...)`
    Why: raw facts should stay canonical, but humans should not have to read walls
    of receipts during the inner development loop.

- [x] Add transcript-style rendering for scenarios.
      Example shape:
      event -> transition -> preview patch -> invalidation -> route -> issue
      Why: this would make failing tests much easier to understand quickly.

## Phase 3. Make Scenario Coverage Stronger

- [x] Add property-test support built around Effect and Schema.
      Example targets:
  - event-sequence fuzzing
  - transaction concurrency laws
  - invalidation/refetch laws
  - stale-result suppression laws

- [x] Add model-to-scenario bridges.
      Example:
      take a `flow.test.model(...)` path and replay it through the live harness.
      Why: graph/path discovery and runtime proof should reinforce each other.

- [x] Add scenario combinators for common app flows.
      Example targets:
  - start in seeded state
  - run event sequence
  - assert receipts/issues summary
    Why: we should reduce repetitive test scaffolding without adding assertion DSL
    slop.

- [ ] Add first-class support for rehydration scenarios in the testing surface.
      Why: restore and boot behavior is important enough to deserve a cleaner
      testing path than ad hoc runtime setup.

- [ ] Add richer child-work testing helpers.
      Example targets:
  - child tree snapshot
  - child outcome summary
  - child supervision assertions

## Phase 4. Push The Frontend Story Further

- [ ] Add a first-party testing recipe for "maximally testable frontend apps".
      It should explain:
  - thin UI
  - Effect Layer-based I/O
  - resource-backed render state
  - declarative timers/streams/transactions
  - fixture-driven scenarios

- [ ] Add browser-level testing recipes that pair with the harness.
      Example tool pairings:
  - `flow.test(...)` for domain/runtime behavior
  - Vitest browser or Playwright component tests for DOM behavior
  - MSW for network interception

- [ ] Add SSR and shell-render recipes for React usage.
      Why: the current repo already tests shell-to-live actor behavior, but the
      testing guidance should make this an explicit pattern.

- [ ] Add "test the view, not the machine" recipes for dumb components.
      Why: once a screen has a stable view model, many frontend tests should not
      need to know the entire workflow graph.

## Phase 5. Strengthen Effect-Native Testing

- [ ] Add direct `@effect/vitest` service-test examples to docs and examples.
      Why: not every test should go through the Flow harness.

- [ ] Make service-test and harness-test boundaries explicit.
      Suggested rule:
  - service logic -> test directly with Effect
  - workflow/runtime orchestration -> test with Flow harness
  - DOM behavior -> test in browser/component layer

- [ ] Add more Layer-centric helper patterns.
      Example targets:
  - override one service
  - shared layer per suite
  - real-vs-test clock recipes

- [ ] Add controlled helpers only where Effect-native tools are insufficient.
      Why: the testing package should not drift into duplicating half of Effect.

## Phase 6. Clean Up Sloppy Or Underused APIs

- [x] Remove `createControlledEffect(...)` and clean up stale docs/claims around
      it.
      Why: the current implementation is under-integrated, weaker than the docs
      imply, and not earning its place in the public surface.

- [x] Audit docs and contracts for stale testing claims.
      Resolved drift included:
  - `TODO.md` now reflects `advance(duration)`, `settle(bounds)`, `trace()`, and
    `.cache()`
  - older exploratory docs that still mention `.resources()` or chained
    `.expect*()` helpers are explicitly labeled historical, not current contract

- [x] Remove redundant entry shapes once the preferred testing API is chosen.
      Why: too many "also valid" paths create explanation overhead for both humans
      and AI.
      Remaining migration alias is narrow: `flowTest(machine).start()`. App and
      model entrypoints live only on `test.app(...).scenario(...)` and
      `test.model(...)`.

- [x] Keep test controls as facts and actions, not an assertion DSL.
      This is a reaffirmation task, not new functionality.
      Current contract keeps assertions in the host test runner and exposes only
      facts/actions such as `state()`, `context()`, `cache()`, `receipts()`,
      `issues()`, `trace()`, `send(...)`, `flush()`, `advance(...)`, and
      `settle(...)`.

## Phase 7. Build Better Docs And Proof Surfaces

- [ ] Add a testing-scenarios matrix.
      Rows should include:
  - machine semantics
  - timers
  - streams
  - transactions
  - children
  - fixtures
  - rehydration
  - SSR
  - browser component tests
  - request interception
  - property tests

- [ ] Add one flagship "AI-first TDD loop" example.
      The example should show:
  1. define state graph and transitions first
  2. write tests next
  3. fill in services and procedures under test pressure
  4. keep the UI thin and testable throughout

- [ ] Add recipes that combine:
  - `flow.test`
  - `@effect/vitest`
  - Vitest browser or Playwright
  - MSW

- [ ] Add a testing reference page that clearly distinguishes:
  - service tests
  - harness scenario tests
  - model/path tests
  - browser/component tests

## Suggested Order

This order is binding for Goal 2.

- [x] Start with Phase 1.
      Reason: naming and shape cleanup remove friction from every test written after.

- [x] Then Phase 2.
      Reason: developer-loop helpers give immediate daily productivity wins.

- [x] Then Phase 6.
      Reason: deleting or clarifying sloppy edges is easier before we add more
      surface area.

- [ ] Then Phase 3 and Phase 5.
      Reason: they deepen capability without needing docs polish first.

- [ ] Then Phase 4 and Phase 7.
      Reason: these are where the "how to build apps this way" story becomes clear.

## Exit Criteria

- [ ] A new app developer has one obvious way to start writing tests.

- [ ] The testing surface feels like part of `flow`, not a sidecar.

- [ ] The harness can explain failing scenarios quickly through facts,
      transcripts, and traces.

- [ ] The docs clearly show when to use Effect tests, harness tests, and
      browser tests.

- [ ] The package actively reinforces the AI-first TDD workflow we want the
      library to encourage.
