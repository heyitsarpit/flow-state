# Launch Workspace User-Facing Feature Eval

This is a throwaway evaluation lane for figuring out what the current
user-facing behavior, inspect, and debugging surfaces actually print.

It is intentionally separate from the Goal 8 implementation files so it can
move in parallel with the main behavior-contract work.

## Fast Path

From the repo root:

```bash
bash examples/launch-workspace/scripts/run-user-facing-eval.sh
```

That writes a timestamped artifact folder under:

```txt
examples/launch-workspace/.eval-artifacts/<timestamp>/
```

Start with these files:

- `cli/behavior-brief.txt`
- `cli/behavior-coverage-launchworkspace.txt`
- `cli/behavior-diff-launchworkspace-vs-docs.txt`
- `cli/inspect-buffer.txt`
- `cli/inspect-trace.txt`
- `function-outputs/manifest.json`

## What This Covers

- `behavior build`
  - Writes the canonical contract JSON for Launch Workspace.
- `behavior render`
  - Prints the shared brief a human or model would read first.
- `behavior render --section coverage --module LaunchWorkspace`
  - Prints the current coverage and proof-obligation view for the main module.
- `behavior diff --module LaunchWorkspace`
  - Prints both human-readable and structured diff output against the committed docs contract.
- `inspect-cli buffer`
  - Prints the pretty event timeline from a local inspection proof.
- `inspect-cli trace`
  - Prints the higher-level trace summary and correlation timeline.
- `inspect-cli trace <proof> <actorId>`
  - Prints the actor-focused JSON slice.
- `inspect-cli failures`
  - Prints a failure-only summary.
- `function-outputs/*`
  - Writes function-to-output pairs for the testing helpers, inspect helpers, behavior helper functions, and `.inventory()` surfaces.

## Manual Commands

If you want to run them one by one:

```bash
node packages/flow-state/scripts/behavior-cli.mjs behavior build \
  --project-root examples/launch-workspace \
  --gateway examples/launch-workspace/src/app/behavior.ts \
  --output /tmp/launch-workspace-behavior-contract.json
```

```bash
node packages/flow-state/scripts/behavior-cli.mjs behavior render \
  --input /tmp/launch-workspace-behavior-contract.json
```

```bash
node packages/flow-state/scripts/behavior-cli.mjs behavior render \
  --section coverage \
  --project-root examples/launch-workspace \
  --gateway examples/launch-workspace/src/app/behavior.ts \
  --module LaunchWorkspace
```

```bash
node packages/flow-state/scripts/behavior-cli.mjs behavior diff \
  --left-input /tmp/launch-workspace-behavior-contract.json \
  --right-input apps/docs/src/generated/behavior-contract.json \
  --module LaunchWorkspace
```

```bash
node packages/flow-state/scripts/behavior-cli.mjs behavior diff \
  --left-input /tmp/launch-workspace-behavior-contract.json \
  --right-input apps/docs/src/generated/behavior-contract.json \
  --module LaunchWorkspace \
  --format json
```

```bash
node examples/launch-workspace/scripts/generate-inspect-proof.mjs \
  /tmp/launch-workspace-inspect-proof.json
```

```bash
node packages/flow-state/scripts/inspect-cli.mjs buffer \
  /tmp/launch-workspace-inspect-proof.json
```

```bash
node packages/flow-state/scripts/inspect-cli.mjs trace \
  /tmp/launch-workspace-inspect-proof.json
```

```bash
node packages/flow-state/scripts/inspect-cli.mjs trace \
  /tmp/launch-workspace-inspect-proof.json \
  launch-workspace.eval.inspect.machine
```

```bash
node packages/flow-state/scripts/inspect-cli.mjs failures \
  /tmp/launch-workspace-inspect-proof.json
```

## Function-Output Pairs

The bundled collector writes one artifact per helper or surface under:

```txt
function-outputs/
```

The index is:

```txt
function-outputs/manifest.json
```

That includes outputs for:

- `.inventory()` on the app and selected modules
- `buildBehaviorContract`, `sliceBehaviorContract`, `renderBehaviorContract`, `renderBehaviorCoverage`, `diffBehaviorContracts`, `renderBehaviorDiff`
- `flowStories`, `storyToDoc`, `runFlowStory`, `storyToTest`
- `formatHarnessTracePretty`, `formatPendingWorkPretty`, `formatScenarioTranscript`, `formatTransactionEventsPretty`
- `graphOf`, `captureTrace`, `analyzeTrace`, `diffTrace`, `exportTraceArtifact`, `importTraceArtifact`, `compressTraceArtifact`, `decompressTraceArtifact`, `summarizeTrace`
- `createInspectionBufferSink`, `attachInspectionSink`, `createLocalInspectionProof`
- `formatInspectionEvent`, `formatInspectionEventPretty`, `formatInspectionTimeline`, `formatInspectionTimelinePretty`, `formatTrace`, `formatTracePretty`
- `inspectTransition`, `inspectMicrosteps`, `inspectActions`, `whyNoTransition`
- `formatNoTransitionSummary`, `formatResourceFreshnessReport`, `formatTransactionOverlapSummary`, `formatRehydrationSummary`

## Known Current Reality

- The existing `packages/flow-state/scripts/inspect-local-proof.mjs` script is
  currently stale against the package export shape.
- The existing `packages/flow-state/scripts/inspect-feature-receipts.mjs`
  script is also stale for the same reason.
- This eval lane avoids editing those in-flight or stale scripts and instead
  gives us a fresh minimal probe under `examples/launch-workspace`.

## What `.inventory()` Is

`.inventory()` is the descriptor-owned summary surface for a module or assembled
app.

- `SomeModule.inventory()` tells you what that module declares:
  resources, machines, views, fixtures, dependencies, screens, and similar
  inventory facts.
- `SomeApp.inventory()` rolls those module facts up into one app-level view:
  modules, resources, actors, views, screen-to-view mappings, fixtures, and
  other assembly facts.

In this eval lane, those outputs are captured as artifacts so you can see the
exact shapes instead of guessing from the types.

## Why The Inspect Proof Is Tiny

The proof machine is intentionally tiny and not Launch Workspace-specific. Its
job is to make the inspect CLI outputs legible quickly.

It exercises:

- one no-transition event
- one successful transition into `running`
- one successful transition into `done`

That is enough to see timeline, correlation, actor-tree, and failure-summary
shapes without depending on broader app runtime setup.
