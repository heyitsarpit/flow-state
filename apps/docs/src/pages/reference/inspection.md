# Inspection

Inspection APIs live on `@flow-state/inspect`. Runtime inspection handles
live on `flow.runtime(...)`.

Use these tools for understanding runtime behavior, tests, docs, or devtools.
Do not use them as the primary state model for product features.

## Imports

```ts
import { captureTrace, flowStories, graphOf, replayTrace } from "@flow-state/inspect";
```

## `graphOf(machine)`

Create a graph descriptor for a machine.

```ts
const graph = graphOf(workspaceMachine);
```

Use this for inspection UIs, graph exports, or tooling that wants the machine
shape without running it.

## `captureTrace(snapshot, options?)`

Capture a trace descriptor from a snapshot.

```ts
const trace = captureTrace(actor.snapshot());
```

The trace includes:

- The snapshot.
- The snapshot receipts.
- A derived trace report.
- Optional caller-provided metadata.

Use this when a failing scenario should produce a durable artifact for later
analysis.

## `replayTrace(machine, trace)`

Create a replay descriptor from a machine plus a captured trace.

```ts
const replay = replayTrace(workspaceMachine, trace);
```

This is useful for tooling, reports, or docs pages that want to show how a
machine behaved in a specific run.

It is not event replay or behavioral time travel. It re-derives analysis from
captured receipts.

## `flowStories(machine, stories)`

Create story descriptors for inspection or documentation surfaces.

```ts
const stories = flowStories(workspaceMachine, [
  { name: "conflict", start: "saveConflict" },
  { name: "assistant-running", start: "runningAssistant" },
]);
```

Use this for curated machine inspection views, not as a runtime branching
mechanism.

## Runtime Inspection

Every runtime exposes an inspection stream:

```ts
const entries = runtime.inspection.entries();
const unsubscribe = runtime.inspection.subscribe((event) => {
  console.log(event);
});
```

This is the best fit for live logging, debug panes, or devtools integrations.

For a guide that connects these inspection facts back to `flow.module`,
`flow.app`, and `App.layer`, read
[Ownership And Runtime Facts](/guide/ownership-and-runtime-facts).

## `test.model(machine)`

Testing also exposes a model-path surface:

```ts
const model = test.model(machine);
const paths = model.getShortestPaths();
```

Use it for guard-aware event path exploration. Use the normal harness when you
need real runtime behavior, resources, transactions, or timing.

## Related Actor And Harness Facts

Inspection helpers are most useful alongside the built-in runtime facts:

- `actor.receipts()`
- `actor.issues()`
- `actor.children()`
- `actor.serialize()`
- `harness.receipts()`
- `harness.issues()`
- `harness.transactions()`
- `harness.streams()`
- `harness.timers()`

## Warnings

- Inspection data is for debugging and tooling. Product logic should use routed
  events, snapshots, and resource data.
- Full cross-surface trace correlation is still partial. Expect machine facts to
  be strongest today, with broader correlation still evolving.
