# Inspection

Inspection APIs live on `@flow-state/inspect`. Runtime inspection handles
live on `flow.runtime(...)`.

Use these tools for understanding runtime behavior, tests, docs, or devtools.
Do not use them as the primary state model for product features.

## Imports

```ts
import {
  analyzeTrace,
  captureTrace,
  compressTraceArtifact,
  decompressTraceArtifact,
  diffTrace,
  exportTraceArtifact,
  flowStories,
  graphOf,
  importTraceArtifact,
  summarizeTrace,
} from "@flow-state/inspect";
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

## `analyzeTrace(machine, trace)`

Create a machine-aware analysis descriptor from a machine plus a captured trace.

```ts
const analysis = analyzeTrace(workspaceMachine, trace);
```

This is useful for tooling, reports, or docs pages that want to compare a
captured run with the current machine graph.

It is not event replay or behavioral time travel. It pairs the captured trace
report with machine graph facts for later analysis.

## `diffTrace(left, right)`

Compare two captured traces section-by-section.

```ts
const diff = diffTrace(beforeTrace, afterTrace);
```

Use this for regression debugging when you want to compare machine-event
sequence plus semantic state changes, resource freshness, transaction outcomes,
stream outcomes, child outcomes, and timer behavior without jumping straight to
a handwritten incident report.

## `exportTraceArtifact(trace)`

Create a versioned JSON-friendly artifact from a captured trace.

```ts
const artifact = exportTraceArtifact(trace);
const json = JSON.stringify(artifact);
```

Use this when a trace should move between CI, local repro, docs, or bug
reports without depending on a live runtime.

## `importTraceArtifact(value)`

Validate and rehydrate a captured artifact back into a trace descriptor.

```ts
const imported = importTraceArtifact(JSON.parse(json));
```

This returns `undefined` when the artifact version or shape is not recognized.

## `compressTraceArtifact(trace)` and `decompressTraceArtifact(bytes)`

Roundtrip a versioned trace artifact through gzip bytes.

```ts
const bytes = await compressTraceArtifact(trace);
const imported = bytes && (await decompressTraceArtifact(bytes));
```

Use this when JSON artifacts should be smaller before they move between local
files, CI attachments, or debugging tools.

## `summarizeTrace(trace)`

Build a concise shareable incident summary from a captured trace.

```ts
const summary = summarizeTrace(trace);
```

Use this when CI, docs, or debugging notes should answer "what happened?"
without attaching raw receipts first.

## `flowStories(machine, stories)`

Create story descriptors for inspection or documentation surfaces.

```ts
const stories = flowStories(workspaceMachine, [
  {
    id: "save-conflict",
    title: "Save conflict",
    start: {
      kind: "setup",
      description: "Restore the saved request boot and seed the workspace fixture first.",
    },
    seed: {
      fixtures: ["workspaceSeed"],
      boot: savedRequestBoot,
      actorId: "workspace",
    },
    events: [{ type: "SAVE" }],
    expectedState: "conflict",
    tags: ["docs", "failure"],
  },
]);

const result = await runFlowStory(WorkspaceApp, workspaceMachine, stories.stories[0]!);
const doc = storyToDoc(stories.stories[0]!);
const coverage = graphOf(workspaceMachine).storyCoverage(stories);
```

Use this for curated machine inspection views, not as a runtime branching
mechanism. The story schema is typed, and stories can now declare seeded
resources, fixture names, and boot payloads directly. Snapshot-backed,
default-start, and setup-described stories with runnable seeds can be executed
through `runFlowStory(...)` on `@flow-state/testing`, including the app-aware
overload for fixture-backed stories. `storyToDoc(...)` turns the same story
into a docs-friendly descriptor with normalized start, seed, event, and
expectation labels. `graph.storyCoverage(...)` shows which states and
transitions those stories already cover, plus which declared failure lanes
appear in the curated set.

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
