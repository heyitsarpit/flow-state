# Testing

Flow State tests use the same descriptors as production and swap only the parts
that should be different: services, resources, clocks, streams, or runtime
installers.

## Choose The Right Harness

Use focused flow tests when the behavior is only workflow state.

```ts
const harness = flowTest(projectEditorMachine).provide(ProjectTestLayer).start();

harness.send({ type: "EDIT_PROJECT", draft });
expect(harness.state()).toBe("editing");
```

Use app harnesses when resources, transactions, fixtures, or module inventory
matter.

```ts
const harness = flowTest
  .app(App)
  .seedResources(seed)
  .start(projectEditorMachine)
  .provide(ProjectTestLayer)
  .start();
```

## Core Controls

| API                         | Use for                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| `.provide(layer)`           | Install Effect services and test Layers.                                     |
| `.seedResources(seed)`      | Seed canonical shared data for app-level tests.                              |
| `.seedModuleFixtures(name)` | Load fixtures declared on modules.                                           |
| `.start(machine, options)`  | Start a focused actor in the harness.                                        |
| `.send(event)`              | Drive the scenario.                                                          |
| `.flush()`                  | Drain ready work only.                                                       |
| `.advance(duration)`        | Move virtual time for delayed transitions.                                   |
| `.settle(bounds)`           | Run bounded quiescence across ready work and known delayed work.             |
| `.pendingWork()`            | Inspect live pending mailboxes, timers, streams, transactions, and children. |
| `.transactions()`           | Inspect transaction status, preview patches, rollbacks, and receipts.        |
| `.streams()`                | Inspect stream lifecycle, generation, emissions, and receipts.               |
| `.timers()`                 | Inspect timer lifecycle, due time, cancellation, and receipts.               |
| `.receipts()`               | Inspect the timeline of runtime facts.                                       |
| `.issues()`                 | Inspect typed failures, defects, and interrupts.                             |

## Model Paths

Use `flowTest.model(machine)` when you want event-path exploration rather than a
running scenario harness.

```ts
const model = flowTest.model(machine);
const paths = model.getShortestPaths({
  events: [{ type: "TYPE_NAME", name: "Atlas" }, { type: "SUBMIT" }],
});
```

This is useful for guard-aware path generation. It is not a replacement for
runtime scenario tests.

## `flush()` vs `advance()` vs `settle()`

These do different jobs:

- `flush()` drains work that is already ready.
- `advance(duration)` moves virtual time forward.
- `settle(bounds)` keeps draining ready work and advancing to known delayed
  boundaries until it reaches quiescence or fails with diagnostics.

The common mistake is expecting `flush()` to behave like `settle()`.

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

## Controlled Helpers

`createControlledEffect` and `createControlledStream` still exist for tests and
migration support.

```ts
const tokens = createControlledStream<ChatToken, never>("chat.tokens");
```

They are useful testing tools, not product runtime concepts.

## Assertion Rule

Flow State exposes facts and controls. Your host test runner should own
assertions, diffs, reporters, snapshots, and property tests.

Do not build Flow-owned `.expect*` helpers around the harness.
