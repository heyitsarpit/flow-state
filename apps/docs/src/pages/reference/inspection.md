# Inspection

Inspection APIs live on `flow-state/inspect`. Runtime inspection handles
live on `flow.runtime(...)`.

Use these tools for understanding runtime behavior, tests, docs, or devtools.
Do not use them as the primary state model for product features.

For the canonical package ownership table, use
[API Reference: Import Paths](/reference/api#import-paths).

Today `flow-state/inspect` is best understood as two sub-surfaces shipped from
one package:

1. machine analysis: graph, trace, story, and semantic explanation helpers
2. live runtime inspection: subscriptions, sinks, local proof bundles, and CLI helpers

## Supported Today

- machine analysis helpers such as `graphOf(...)`, `captureTrace(...)`,
  `analyzeTrace(...)`, `diffTrace(...)`, and durable trace artifact export
- semantic explainers and text formatters that sit on top of captured traces
- live runtime inspection through `runtime.inspection.entries()`,
  `runtime.inspection.subscribe(...)`, transport-neutral sinks, and local proof
  bundles
- first-party CLI helpers for local inspection proofs

For the exact proof boundary, use [Supported Today](/reference/status).

## Start With Three Questions

- What happened?
  Start with `captureTrace(...)`, `summarizeTrace(...)`,
  `formatTracePretty(...)`, or the local proof and CLI commands later on this
  page.
- Why did it happen?
  Start with `analyzeTrace(...)`, `whyNoTransition(...)`, and the semantic
  summary helpers such as `formatResourceFreshnessReport(...)`,
  `formatTransactionOverlapSummary(...)`, and `formatRehydrationSummary(...)`.
- How do I reproduce it?
  Start with `flowStories(...)`, `runFlowStory(...)`, `test.model(machine)`,
  and the local proof bundle so a failing path can move between docs, tests,
  and terminal repro.

## Still Partial Or Future

- `analyzeTrace(...)` is analysis-only; it is not event replay or time travel
- full cross-surface trace correlation is still evolving
- browser/devtools adapters stay in future-work territory; the first-party path
  today is local proof plus CLI inspection

## Cross-Package Ownership

`flow-state/inspect` is intentionally a composition layer, not the owner of
every debugging surface.

| Capability                                       | Real owner                                                                                       | `flow-state/inspect` role                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Live inspection stream, retention, and filtering | `flow.runtime(...).inspection`                                                                   | sink adapters, formatters, and local proof bundles                                                            |
| Resource snapshots and hydration facts           | `runtime.resources.inspect()`, `runtime.resources.hydrate(...)`, `runtime.resources.dehydrate()` | traces and summaries consume the resource facts without owning cache state                                    |
| Story execution and model traversal              | `flow-state/testing` via `runFlowStory(...)` and `test.model(machine)`                           | `flowStories(...)`, `storyToDoc(...)`, and `graph.storyCoverage(...)` shape those facts for docs and analysis |
| Ownership metadata and app assembly              | `flow.module(...)`, `flow.app(...)`, and `App.layer(...)`                                        | graph overlays and inspection labels reuse that ownership metadata                                            |
| Pure graph, trace, and semantic projections      | `flow-state/inspect`                                                                             | owns the read-only analysis helpers themselves                                                                |

That split is deliberate: when a capability already lives in runtime, testing,
store, or descriptors, inspect should project it instead of cloning it.

## Prefer Promoted Facts Over Parallel Inspect State

- Resource inspection should start from `runtime.resources.inspect()`,
  `runtime.resources.hydrate(...)`, and `runtime.resources.dehydrate()`.
  Inspect traces and summaries should consume those facts instead of growing a
  second resource-state model.
- Path traversal should start from `test.model(machine)` and
  `runFlowStory(...)` on `flow-state/testing`. Inspect can explain and format
  those paths, but it should not fork a separate path engine.
- Boot and restore should start from `runtime.dehydrateBoot()` and
  `runtime.hydrateBoot(...)`, then reuse restore-aware facts such as
  `actor:restore` and `resource:hydrate` inside traces and summaries.
- Ownership labels should start from `flow.module(...)`, `flow.app(...)`, and
  `App.layer(...)`. Inspect should surface `moduleId`, `appId`, and owner paths
  from those descriptors instead of inventing parallel label registries.

This page documents those two surfaces separately on purpose.

## Imports

```ts
import {
  analyzeTrace,
  attachInspectionSink,
  buildBehaviorContract,
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
  sliceBehaviorContract,
  summarizeTrace,
  whyNoTransition,
} from "flow-state/inspect";
```

## Behavior Contract Owner Map

- Descriptors own app/module identity, fixtures, screens, inventory, and app
  assembly through `flow.module(...)` and `flow.app(...)`.
- Screen metadata stays coarse inventory; do not pretend it is precise
  screen-to-view or component routing truth.
- `graphOf(machine)` owns machine shape, transition ids, child facts, timed
  transitions, and eventless traversal.
- `flow-state/testing` owns live scenario execution and model replay through
  `runFlowStory(...)` and `test.model(machine)`.
- A behavior-contract builder should project those surfaces into shared JSON
  without becoming a second execution engine.
- Keep app-validation claims honest: selective duplicate module/resource
  ownership proof is real today, but broad cross-module descriptor collision
  proof is not.

## Machine Analysis Surface

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
through `runFlowStory(...)` on `flow-state/testing`, including the app-aware
overload for fixture-backed stories. `storyToDoc(...)` turns the same story
into a docs-friendly descriptor with normalized start, seed, event, and
expectation labels. `graph.storyCoverage(...)` shows which states and
transitions those stories already cover, plus which declared failure lanes
appear in the curated set.

## Live Runtime Inspection Surface

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
pnpm --silent --filter flow-state inspect:local-proof > /tmp/inspect-proof.json
```

That command prints a first-party local inspection proof JSON bundle containing
the actor tree, event timeline, correlation detail, trace artifact export, and
pre-rendered text snapshots for local debugging.

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
