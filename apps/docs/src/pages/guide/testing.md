# Testing

Flow State tests use the same descriptors as production and swap only the parts
that should be different: services, resources, clocks, streams, or runtime
installers.

## Choose The Right Harness

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

## Core Controls

| API                         | Use for                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `.with(...)`                | Install Layers, seed resources, load fixtures, set input, or override clock.  |
| `.run()`                    | Start the focused actor in the harness.                                       |
| `.send(event)`              | Drive the scenario.                                                           |
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
| `.issues()`                 | Inspect typed failures, defects, and interrupts.                              |

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
