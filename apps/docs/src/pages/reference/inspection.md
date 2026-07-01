# Inspection

Inspection APIs live on `@flow-state/inspect`. Runtime inspection handles
live on `flow.runtime(...)`.

Use these tools for understanding runtime behavior, tests, docs, or devtools.
Do not use them as the primary state model for product features.

## Imports

```ts
import {
  analyzeTrace,
  attachInspectionSink,
  captureTrace,
  createLocalInspectionProof,
  createInspectionBufferSink,
  compressTraceArtifact,
  decompressTraceArtifact,
  diffTrace,
  exportTraceArtifact,
  formatInspectionTimelinePretty,
  formatNoTransitionSummary,
  formatRehydrationSummary,
  formatResourceFreshnessReport,
  formatTrace,
  formatTracePretty,
  formatTransactionOverlapSummary,
  flowStories,
  graphOf,
  importTraceArtifact,
  summarizeTrace,
  whyNoTransition,
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

## `formatTrace(trace)` and `formatTracePretty(trace)`

Render an existing structured trace into stable terminal-oriented text.

```ts
const compact = formatTrace(trace);
const pretty = formatTracePretty(trace);
```

The captured trace stays canonical. These formatters are just optional views
for terminals, docs, CI logs, or quick debugging notes. `formatTrace(...)`
keeps the output compact, while `formatTracePretty(...)` expands the actor tree,
correlation timeline, bucket counts, and issue summary.

## Semantic summaries

Render higher-level explanations when even a pretty trace is still too dense.

```ts
const why = whyNoTransition(machine, snapshot, { type: "SAVE" });
const noTransition = why && formatNoTransitionSummary(why);
const freshness = formatResourceFreshnessReport(trace);
const overlap = formatTransactionOverlapSummary(trace);
const rehydration = formatRehydrationSummary(trace);
```

Use these when the goal is the answer itself:
"why did this event do nothing?", "which resources ended invalidated?", "where
did transaction overlap happen?", or "what resumed during restore?".

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

## `attachInspectionSink(inspection, sink, options?)`

Bridge runtime inspection into a transport-neutral sink.

```ts
const sink = createInspectionBufferSink<string>();
const detach = attachInspectionSink(runtime.inspection, sink, {
  includeHistory: true,
  filter: { family: "machine" },
  redact: (event) => ({
    type: event.type,
    sequence: event.sequence,
  }),
  serialize: ({ type, sequence }) => `${sequence}:${type}`,
});

const messages = sink.messages();
detach();
```

Use this when the destination is not "the current callback in this process":
in-memory buffers, terminal sessions, browser `postMessage` bridges, files, or
websocket publishers. The sink stays grounded in the structured inspection event
model, while `filter`, `redact`, and `serialize` let transports project the
payload they actually need.

## `formatInspectionEvent*` and `formatInspectionTimeline*`

Render live inspection entries as stable text without replacing the underlying
structured event contract.

```ts
const sink = createInspectionBufferSink();
const detach = attachInspectionSink(runtime.inspection, sink);
const prettyTimeline = formatInspectionTimelinePretty(sink.messages());
detach();
```

Use the compact helpers when you want one-line event summaries, and the pretty
helpers when a terminal, docs page, or debugging session should show richer
actor, snapshot, and correlation detail.

## `createLocalInspectionProof(trace, events?)`

Bundle the key local-debugging surfaces into one CLI-friendly object.

```ts
const trace = captureTrace(actor.snapshot(), { includeSnapshots: true });
const proof = createLocalInspectionProof(trace, runtime.inspection.entries());
```

The proof includes:

- actor tree
- live event timeline
- correlation detail
- trace artifact export
- pretty terminal text for the trace and event timeline

For a first-party local proof run, use:

```sh
pnpm --silent --filter @flow-state/core inspect:local-proof > /tmp/inspect-proof.json
pnpm --silent --filter @flow-state/core inspect:cli buffer /tmp/inspect-proof.json
pnpm --silent --filter @flow-state/core inspect:cli trace /tmp/inspect-proof.json inspect.local-proof.machine
pnpm --silent --filter @flow-state/core inspect:cli failures /tmp/inspect-proof.json
```

`buffer` prints the pretty event timeline, `trace` prints the full pretty trace
or an actor-scoped bundle, and `failures` groups non-success correlations by id.

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
