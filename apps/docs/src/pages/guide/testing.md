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

`createControlledStream` remains available when you need explicit stream
emissions and completion. For manual async effect control, prefer native Effect
tools such as `Deferred`, `Queue`, or `PubSub`. `flowTest` also remains
available as a temporary alias while older tests move to
`test(...).with(...).run()`.

```ts
const tokens = createControlledStream<ChatToken, never>("chat.tokens");
```

These are testing tools, not product runtime concepts.

## Assertion Rule

Flow State exposes facts and controls. Your host test runner should own
assertions, diffs, reporters, snapshots, and property tests.

Do not build Flow-owned `.expect*` helpers around the harness.
