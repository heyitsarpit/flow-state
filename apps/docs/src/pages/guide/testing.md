# Testing

Flow State tests use the same descriptors as production and swap only the parts
that should be different: services, resources, clocks, streams, or runtime
installers.

## Choose The Right Harness

Start with the narrowest proof surface that owns the behavior.

| If the behavior lives in...                                                           | Use...                                            | Example                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Effect services, schemas, typed failures, redaction, batching, or clocks              | direct `@effect/vitest` tests with a shared Layer | `examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts` |
| Flow/runtime orchestration, resources, transactions, timers, streams, or child actors | `flow.test(...)` / `flowTest.app(...)` harnesses  | `examples/launch-workspace/src/launchWorkspace.test.ts`                |
| Browser rendering, hydration, and DOM interaction                                     | DOM/component tests in `happy-dom` or the browser | `examples/launch-workspace/src/launchWorkspaceShell.test.tsx`          |

## Testing Scenarios Matrix

Use the first row that matches the fact you actually need to prove.

| Scenario                | Start here                                                                    | Reach for it when you need to prove...                                           | Current proof surface                                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| machine semantics       | `flow.test(machine).run()`                                                    | transitions, guards, actions, and state-owned projections                        | `examples/launch-workspace/src/launchWorkspace.test.ts`                                                                          |
| timers                  | `flow.test(...)` plus `advance(...)`, `advanceToNextTimer()`, or `until(...)` | delayed transitions, retries, timer generations, or virtual time boundaries      | `packages/flow-state/src/flow-test-timers.test.ts` and `packages/flow-state/src/flow-test-developer-loop.test.ts`                |
| streams                 | `flow.test(...)` plus `createControlledStream(...)`                           | stream emissions, interrupts, stale-generation suppression, done/failure routing | `examples/launch-workspace/src/launchWorkspace.test.ts` and `packages/flow-state/src/flow-test-streams.test.ts`                  |
| transactions            | `flow.test(...)` plus `transactions()`                                        | preview patches, rollback, retries, concurrency, or typed failure lanes          | `examples/launch-workspace/src/launchWorkspace.test.ts`                                                                          |
| children                | `flow.test(...)` plus `children()` or `childSummary()`                        | lifecycle, supervision, retry, or nested child snapshots                         | `examples/launch-workspace/src/launchWorkspace.test.ts` and `packages/flow-state/src/flow-test-child-helpers.test.ts`            |
| fixtures                | `test.app(App).scenario(machine).with({ fixtures: [...] }).run()`             | seeded resource graphs and typed app-owned fixture names                         | `examples/launch-workspace/src/launchWorkspace.test.ts` and `packages/flow-state/src/app-inventory.test.ts`                      |
| rehydration             | `test.rehydrate(...)` or `test.app(App).rehydrate(...)`                       | restore behavior, resumed timers, and seeded runtime resources after boot        | `packages/flow-state/src/flow-test-rehydration.test.ts`                                                                          |
| SSR                     | `renderToString(...)` plus `hydrateRoot(...)` around the client shell         | server markup, hydration safety, and post-hydration event wiring                 | `examples/launch-workspace/src/launchWorkspaceShell.test.tsx`                                                                    |
| browser component tests | plain-prop panel renders or a browser/component runner                        | rendered text, layout, click wiring, and shell composition                       | `examples/launch-workspace/src/launchWorkspacePanels.test.tsx` and `examples/launch-workspace/src/launchWorkspaceShell.test.tsx` |
| request interception    | MSW plus a browser/component runner                                           | real HTTP shapes, loading states, or failure UI at the browser edge              | guide-only today                                                                                                                 |
| property tests          | the host runner plus FastCheck/Schema arbitraries and `flow.test(...)`        | event-sequence laws, fuzzed scenarios, and timer/resource invariants             | `packages/flow-state/src/flow-test-property-support.test.ts`                                                                     |

Request interception is guide-only today: when the app already moved I/O into
an Effect Layer, prefer Layer injection. Reach for MSW only when the browser
test still crosses a real fetch boundary.

## Maximally Testable Frontend Apps

The easiest frontend apps to test in Flow State keep ownership boring and
explicit.

| Keep this thin or declarative...                            | Put the real behavior here instead...                             | Launch Workspace proof                                          |
| ----------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| React components and event handlers                         | Effect Layers plus Flow resources, views, and actors              | `src/launchWorkspaceShell.tsx`, `src/launchWorkspacePanels.tsx` |
| direct network or storage calls from components             | service interfaces such as `ProjectApi` / `ApprovalApi`           | `src/services.ts`                                               |
| ad hoc render-state bookkeeping in component state          | resource-backed snapshots and joined `flow.view` models           | `src/launchWorkspaceViews.ts`, `src/launchWorkspaceAssembly.ts` |
| manual timers, retries, stream wiring, or optimistic writes | declarative timers, streams, and `flow.transaction(...)`          | `src/launchWorkspace.ts`, `src/launchWorkspaceAssembly.ts`      |
| bespoke test setup per screen                               | fixture-driven harness scenarios with seeded resources and Layers | `src/launchWorkspace.test.ts`                                   |

That structure gives you a clean split:

- service tests prove schemas, typed failures, clocks, redaction, batching, and Layer wiring
- harness tests prove resources, transactions, timers, streams, child actors, and joined view models
- browser or shell tests prove rendering, hydration, and user-visible DOM behavior

If a frontend test feels hard to write, treat that as an ownership smell first.
The usual fix is to move I/O into a Layer, move durable render state into a
resource or `flow.view`, and keep the component focused on rendering plus event
routing.

## Flagship AI-First TDD Loop

Launch Workspace is the repo's flagship proof for the authoring loop we want
Flow State to encourage:

1. define the machine states, events, resources, transactions, and views first
2. write the scenario test next
3. fill in only the Effect services and procedures that test now demands
4. keep the UI thin enough that most new work never has to start in the browser

The first executable proof should usually be a harness scenario, not a UI test.

```ts
const harness = test
  .app(LaunchWorkspaceApp)
  .scenario(launchWorkspaceMachine)
  .with({
    resources: launchWorkspaceSeed,
    provide: LaunchWorkspaceTestServices,
    clock: () => 42_000,
  })
  .run();

harness.send({ type: "SAVE_PROJECT" });
expect(harness.state()).toBe("saving");

await harness.flush();
expect(harness.state()).toBe("ready");
```

That exact shape already lives in
`examples/launch-workspace/src/launchWorkspace.test.ts`.

Once the scenario is real, split the remaining pressure by owner:

- keep validation, redaction, clocks, and service overrides in direct Effect tests such as `examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts`
- keep panel rendering in plain-prop tests such as `examples/launch-workspace/src/launchWorkspacePanels.test.tsx`
- go to shell or hydration tests only when the user-visible boundary itself changes, as in `examples/launch-workspace/src/launchWorkspaceShell.test.tsx`

This is the AI-first part: ask the AI to fill the smallest missing Layer,
transaction, or procedure after the scenario exists, instead of asking it to
invent the workflow shape from scratch.

Repeat that same loop for each feature slice:

- change the state graph first
- extend the harness scenario
- fill in one service boundary at a time
- add a panel or shell proof only if the DOM contract changed

## Browser-Level Pairings

Pair browser-facing tests with the Flow harness instead of asking one tool to
prove everything.

| Prove this fact...                                                  | Prefer this tool...                                        | Why                                                    |
| ------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| resource, transaction, timer, stream, actor, or view-model behavior | `flow.test(...)` / `flow.test.app(...)`                    | the runtime owns these facts                           |
| rendered text, focus, click wiring, hydration, or shell composition | `happy-dom`, Vitest Browser, or Playwright component tests | the DOM owns these facts                               |
| real network behavior at the browser boundary                       | MSW plus a browser/component runner                        | this keeps HTTP shape concerns out of the Flow harness |

Use the narrowest browser tool that matches the proof:

- `happy-dom` is enough for the current shell-render and hydration recipes in this repo
- Vitest Browser or Playwright component tests are the next step when DOM APIs or browser behavior exceed `happy-dom`
- MSW is useful only when the browser test still crosses a real fetch boundary; if the app already moved I/O into an Effect Layer, prefer Layer injection instead

The pairing rule is simple: let the harness prove runtime facts, and let the
browser runner prove user-visible behavior.

## Combined Testing Recipes

Most feature slices should combine two or three testing tools with clear
ownership, not force one giant test to prove everything.

| Recipe                         | Tool split                                                                                                                              | Reach for it when...                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| service plus scenario          | `@effect/vitest` proves service contracts; `flow.test(...)` proves workflow behavior                                                    | the workflow depends on validation, clocks, redaction, batching, or typed failures        |
| scenario plus browser          | `flow.test(...)` proves runtime facts; Vitest Browser, Playwright, or `happy-dom` proves DOM facts                                      | the workflow is already explicit and the UI change is mostly render or event wiring       |
| browser edge with interception | `flow.test(...)` proves business flow; browser runner proves UI; MSW owns the remaining HTTP boundary                                   | the app still performs a real browser fetch that has not moved behind an Effect Layer yet |
| full layered slice             | `@effect/vitest` for service rules, `flow.test(...)` for the machine, browser tests for the shell, MSW only for browser-owned I/O seams | a feature crosses service, workflow, and UI boundaries at once                            |

The Launch Workspace proof app already shows most of this split:

- `examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts` owns service rules
- `examples/launch-workspace/src/launchWorkspace.test.ts` owns runtime scenarios
- `examples/launch-workspace/src/launchWorkspacePanels.test.tsx` and `examples/launch-workspace/src/launchWorkspaceShell.test.tsx` own UI proofs

MSW is the optional edge tool in that stack. Prefer Layer injection first, and
add MSW only when a browser test still needs to cross a real fetch boundary on
purpose.

For a single feature, the combined loop usually looks like this:

1. add or tighten the direct `@effect/vitest` service proof if the data or clock contract changed
2. extend the `flow.test(...)` scenario until the workflow fact is explicit
3. add a panel, shell, or browser proof only if the rendered contract changed
4. add MSW only if the browser still owns the HTTP seam you need to observe

## SSR And Shell-Render Recipes

The current repo React testing story has three distinct proof steps:

1. render the client shell in a DOM runner such as `happy-dom`
2. render server markup with `renderToString(...)` and hydrate it with `hydrateRoot(...)`
3. when server boot is part of the contract, create one request-scoped page payload and hydrate that exact page output

The repo already proves all three in
`examples/launch-workspace/src/launchWorkspaceShell.test.tsx`.

```tsx
// @vitest-environment happy-dom

const serverMarkup = renderToString(createElement(LaunchWorkspaceClient));
container.innerHTML = serverMarkup;

await act(async () => {
  hydrateRoot(container, createElement(LaunchWorkspaceClient));
  await Promise.resolve();
});

expect(recordedErrors).toEqual([]);
expect(container.textContent).toContain("Launch Workspace");
```

Use this recipe when the thing you need to prove is one of these:

- the shell can render without a live browser runtime first
- hydration does not produce provider or markup mismatch errors
- the post-hydration UI still routes events into the live actor/runtime boundary
- one request-scoped boot payload can be rendered on the server and restored on the client

Keep the boundary narrow:

- use `flow.test(...)` for runtime semantics before or alongside the shell test
- use shell tests for render, hydration, and client-boundary behavior
- use the server runtime only to create the boot payload actually needed for first paint

For the runtime side of that handoff, see
`apps/docs/src/pages/guide/server-hydration.md`.

## Test The View, Not The Machine

Once a screen already has a stable view model, test the dumb component with
plain props instead of rebuilding the whole actor graph in every DOM test.

The split looks like this:

- one test proves the view projection with `selectView(actor.snapshot(), view)`
- a separate component test renders the dumb panel from the resulting selection object

The repo now does that directly for Launch Workspace panels in
`examples/launch-workspace/src/launchWorkspacePanels.test.tsx`.

```tsx
const overview: LaunchOverviewSelection = {
  projectId: LaunchProjectId("launch-1"),
  projectResourceStatus: "success",
  readinessResourceStatus: "success",
  assetResourceStatus: "refreshing",
  approvalResourceStatus: "success",
  saveTransactionStatus: "pending",
  activeChildIds: ["assistant:launch"],
  streamIds: ["Chat.tokenStream"],
  issueCount: 2,
  receiptCount: 11,
};

const markup = renderToStaticMarkup(
  <LaunchWorkspaceOverviewPanel overview={overview} workspace={workspace} />,
);
```

Here `workspace` is just the stable shell-summary prop fixture that the panel
already expects, and `LaunchProjectId(...)` keeps the example aligned with the
real branded ID type.

Reach for this recipe when:

- the component mostly formats text, lists, badges, or layout from an existing selection
- the behavior under test is presentation logic, not resource loading or actor orchestration
- the full machine test already exists and the DOM test only needs the projected shape

Go back to a harness or shell test only when the DOM proof depends on live
events, hydration, or runtime-owned behavior.

Use focused flow tests when the behavior is only workflow state.

```ts
const harness = test(projectEditorMachine).with({ provide: ProjectTestLayer }).run();

harness.send({ type: "EDIT_PROJECT", draft });
expect(harness.state()).toBe("editing");
```

Use app harnesses when resources, transactions, fixtures, or module inventory
matter.

```ts
const harness = test
  .app(App)
  .scenario(projectEditorMachine)
  .with({
    resources: seed,
    fixtures: ["projectSeed"],
    provide: ProjectTestLayer,
  })
  .run();
```

## Direct Effect Service Tests

Not every test should start a Flow harness. When the behavior lives in an
Effect service, test it directly with `@effect/vitest` and a shared `Layer`.

```ts
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";

layer(ProjectTestLayer)("project service", (it) => {
  it.effect("loads the project", () =>
    Effect.gen(function* () {
      const project = yield* loadProject(projectId);
      expect(project.id).toBe(projectId);
    }),
  );
});
```

This keeps service requirements, typed failures, `TestClock`, and other Effect
test services in the native Effect lane instead of routing every proof through
`flow.test(...)`. The concrete example in this repo lives at
`examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts`.

Do not widen a service-level proof into a Flow or DOM test unless the behavior
crosses that boundary. Likewise, use DOM tests for rendered output and
hydration facts, not to re-prove schema or Layer behavior that already has a
smaller owner.

## Layer-Centric Patterns

When most service tests share the same dependencies, put the common graph at
the suite boundary and override only the service that changes.

```ts
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";

layer(ProjectTestLayer)("project service", (it) => {
  it.layer(ProjectApiTestOverride)("single-service overrides", (it) => {
    it.effect("reuses the shared suite Layer", () =>
      Effect.gen(function* () {
        const project = yield* loadProject(projectId);
        expect(project.name).toBe("Layer override project");
      }),
    );
  });

  it.effect("uses TestClock instead of wall-clock time", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(1_700_000_000_000);
      const project = yield* loadProject(projectId);
      expect(project.updatedAt).toBe(1_700_000_000_000);
    }),
  );
});
```

Here `ProjectApiTestOverride` is just a `Layer.succeed(ProjectApi,
ProjectApi.of(...))` override for the one service that changes in that nested
suite.

Use this pattern when you need one of these moves:

- share one Layer across a whole suite
- override one service without rebuilding the rest of the graph
- prove clock-driven behavior with `TestClock.setTime(...)` or `TestClock.adjust(...)`

The concrete repo example is again
`examples/launch-workspace/src/launchWorkspaceServices.effect.test.ts`.

## Scenario Combinators

When the setup is the point, start the harness and drive the first event
sequence in one step.

```ts
const harness = test
  .app(App)
  .scenario(projectEditorMachine)
  .with({
    fixtures: ["projectSeed"],
  })
  .run([{ type: "EDIT_PROJECT", draft }, { type: "SUBMIT" }]);
```

For follow-up batches, keep using the live harness:

```ts
harness.sendAll([{ type: "RESET" }, { type: "EDIT_PROJECT", draft: secondDraft }]);
```

And when a test only cares about the high-level facts, assert summaries rather
than hand-slicing receipts each time:

```ts
expect(harness.receiptSummary()).toMatchObject({
  receiptTypes: expect.arrayContaining(["machine:event", "machine:transition"]),
});
expect(harness.issueSummary()).toEqual([]);
```

## Rehydration Scenarios

Use the rehydration helpers when restore behavior itself is under test. This
path runs through a real runtime, so timers, child registries, and restored
receipts resume from the provided snapshot instead of being reconstructed by the
focused harness.

```ts
const restored = test.app(App).rehydrate(projectEditorMachine, {
  snapshot,
  fixtures: ["projectSeed"],
});

await restored.advance("1 second");
expect(restored.state()).toBe("done");

await restored.dispose();
```

The restored helper keeps the same event-driving and summary helpers
(`send(...)`, `sendAll(...)`, `receipts()`, `receiptSummary()`, `issues()`,
`issueSummary()`), and also exposes `.actor` plus `.runtime` when a test needs
to inspect the underlying registry or resource store directly.

## Child Work

When a scenario owns child actors, the harness now exposes three levels of
child facts:

```ts
const children = harness.children();
const tree = harness.childTree();
const summary = harness.childSummary();
```

Use `children()` for the raw direct child snapshots, `childTree()` for a nested
shape that is easier to diff, and `childSummary()` when the test only needs the
current child statuses plus receipt-derived child outcomes such as starts,
stops, successes, or failures.

## Core Controls

| API                         | Use for                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `.with(...)`                | Install Layers, seed resources, load fixtures, set input, or override clock.  |
| `.run(events?)`             | Start the harness, and optionally dispatch the first event sequence.          |
| `.send(event)`              | Drive the scenario.                                                           |
| `.sendAll(events)`          | Drive a whole event sequence without repeating `send(...)`.                   |
| `.children()`               | Inspect direct child snapshots, including supervision and nested snapshots.   |
| `.childTree()`              | Inspect a simplified nested child tree for easier structure assertions.       |
| `.childSummary()`           | Inspect live child statuses plus receipt-derived child outcome lanes.         |
| `.flush()`                  | Drain ready work only.                                                        |
| `.advance(duration)`        | Move virtual time for delayed transitions.                                    |
| `.advanceToNextTimer()`     | Jump to the nearest scheduled timer boundary without counting millis.         |
| `.advanceUntilIdle(bounds)` | Drain ready work and timer boundaries until timer-driven work is idle.        |
| `.settle(bounds)`           | Run bounded quiescence across ready work and known delayed work.              |
| `.untilState(...)`          | Wait for a target state or state predicate through the bounded progress loop. |
| `.untilReceipt(...)`        | Wait for a matching receipt instead of hand-rolling `flush` and `advance`.    |
| `.untilIssue(...)`          | Wait for a matching issue when failure lanes are the fact you care about.     |
| `.until(...)`               | Wait for any harness predicate when the fact is more specific than state.     |
| `.pendingWork()`            | Inspect live pending mailboxes, timers, streams, transactions, and children.  |
| `.transactions()`           | Inspect transaction status, preview patches, rollbacks, and receipts.         |
| `.streams()`                | Inspect stream lifecycle, generation, emissions, and receipts.                |
| `.timers()`                 | Inspect timer lifecycle, due time, cancellation, and receipts.                |
| `.receipts()`               | Inspect the timeline of runtime facts.                                        |
| `.receiptSummary()`         | Collapse the receipt timeline into assertable fact summaries.                 |
| `.issues()`                 | Inspect typed failures, defects, and interrupts.                              |
| `.issueSummary()`           | Collapse issues into concise facts for host-runner assertions.                |

## Model Paths

Use `test.model(machine)` when you want event-path exploration rather than a
running scenario harness.

```ts
const model = test.model(machine);
const paths = model.getShortestPaths({
  events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
});
```

This is useful for guard-aware path generation. It is not a replacement for
runtime scenario tests, but it can now hand one discovered path back to the
live harness.

```ts
const path = model.getShortestPaths({
  events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
})[0]!;

const harness = model.replay(path);
expect(harness.state()).toBe("submitted");
```

From there, use the normal harness controls such as `flush()`, `advance(...)`,
or `settle(bounds)` if the live scenario needs to progress beyond the direct
event path.

## Property Tests With Effect Schema

Keep property-based coverage in the host test runner, and use Effect's Schema
plus FastCheck support to generate legal event payloads for the Flow harness.

```ts
import { Schema } from "effect";
import { FastCheck } from "effect/testing";

const EditorEvent = Schema.Union([
  Schema.Struct({ type: Schema.Literal("TYPE_NAME"), name: Schema.String }),
  Schema.Struct({ type: Schema.Literal("CLEAR") }),
  Schema.Struct({ type: Schema.Literal("SUBMIT") }),
]);

FastCheck.assert(
  FastCheck.property(
    FastCheck.array(Schema.toArbitrary(EditorEvent), { maxLength: 12 }),
    (events) => {
      const harness = test(editorMachine).run();

      for (const event of events) {
        harness.send(event);
      }

      expect(harness.issues()).toEqual([]);
    },
  ),
  { numRuns: 50 },
);
```

Use `FastCheck.asyncProperty(...)` when the scenario needs `advance(...)`,
`until...`, `settle(bounds)`, or other async progress controls.

## `flush()` vs `advance()` vs `settle()`

These do different jobs:

- `flush()` drains work that is already ready.
- `advance(duration)` moves virtual time forward.
- `advanceToNextTimer()` jumps exactly to the nearest timer boundary.
- `advanceUntilIdle(bounds)` drains ready work and timer boundaries, but does
  not wait for every long-lived stream, transaction, or child actor to finish.
- `settle(bounds)` keeps draining ready work and advancing to known delayed
  boundaries until it reaches quiescence or fails with diagnostics.

The common mistake is expecting `flush()` to behave like `settle()`.

## Wait For Facts

When the next assertion depends on scheduler progress, prefer the bounded wait
helpers over open-coded `flush()` / `advance(...)` loops.

```ts
await harness.untilState("done");
await harness.untilReceipt((receipt) => receipt.type === "timer:fire");
await harness.until((current) => current.context().ticks === 1);
```

These helpers fail with the same pending-work facts you already inspect through
`pendingWork()`.

## Trace And Transcript Outputs

You can capture trace artifacts directly from the harness without switching to a
different package surface first.

```ts
const trace = harness.trace();
const captured = harness.captureTrace({ includeSnapshots: true });
const focused = harness.traceFor(trace.report.correlations[0]!.correlationId);
```

Use the formatter helpers when raw receipts are too dense for the inner loop:

```ts
formatPendingWorkPretty(harness.pendingWork());
formatHarnessTracePretty(trace);
formatTransactionEventsPretty(trace.receipts);
formatScenarioTranscript(trace.receipts);
```

## Inspect Failures Directly

Transactions, streams, timers, and children all expose focused facts.

```ts
expect(harness.transactions().rollbacks("launch.save-project")).toHaveLength(1);
expect(harness.issues()).toEqual([
  expect.objectContaining({ kind: "failure", source: "transaction" }),
]);
```

This is usually clearer than asserting only on end state.

## Debug A Stuck Test

If the test does not progress:

1. Check `pendingWork()`.
2. If work is ready, call `flush()`.
3. If a timer boundary is waiting, call `advance(...)`.
4. If the scenario depends on several delayed steps, use `settle(bounds)`.

`pendingWork()` is the fastest way to see whether the runtime is waiting on a
timer, a stream, a transaction, or a child actor.

## Controlled Streams And Native Effect Tools

Prefer native Effect tools first, and reach for Flow-owned controlled helpers
only when the test is proving a Flow/runtime boundary that Effect does not own
by itself.

| If you need to control...                                                      | Prefer...                            | Use a Flow helper only when...                                          |
| ------------------------------------------------------------------------------ | ------------------------------------ | ----------------------------------------------------------------------- |
| one-shot async completion or gating                                            | `Deferred`                           | the fact is actor/runtime-owned rather than service-owned               |
| ordered async hand-off or fanout                                               | `Queue` / `PubSub`                   | the test must prove Flow stream routing, generation, or cancellation    |
| service-level batching                                                         | `RequestResolver`                    | never: batching is already an Effect concept                            |
| time                                                                           | `TestClock`                          | the test must advance Flow timers through the harness boundary          |
| explicit stream emissions, completion, and cancellation events                 | `createControlledStream`             | you need to prove stream ownership across actors or runtime generations |
| runtime scheduling across actors, resources, transactions, timers, or children | `test(...).with(...).run()` controls | the behavior is no longer a plain Effect service test                   |

`createControlledStream` remains available for the last two cases. For manual
async effect control, keep using native Effect tools such as `Deferred`,
`Queue`, `PubSub`, `RequestResolver`, and `TestClock`.

```ts
const tokens = createControlledStream<ChatToken, never>("chat.tokens");
```

See `examples/launch-workspace/src/launchWorkspace.test.ts` for a paired
example that uses `Deferred` for one-shot async control and
`createControlledStream` only for stream-lifecycle facts.

These are testing tools, not product runtime concepts. `flowTest` also remains
available as a temporary alias while older tests move to
`test(...).with(...).run()`.

## Assertion Rule

Flow State exposes facts and controls. Your host test runner should own
assertions, diffs, reporters, snapshots, and property tests.

Do not build Flow-owned `.expect*` helpers around the harness.
