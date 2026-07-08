# CLI Output Compression Review

This document records a review-only pass over the real public CLI surface using
the live help tree plus receipts captured from `examples/launch-workspace`.

This is not an implementation slice.
The goal is to decide what should be compressed before any CLI output contract
changes are made.

## Command Inventory

Derived from the live help tree under
`tmp/cli-output-compression/help`.

### Top Level

- `flow-state behavior`
- `flow-state story`
- `flow-state trace`

### Behavior Commands

- `flow-state behavior build`
- `flow-state behavior render`
- `flow-state behavior diff`

### Story Commands

- `flow-state story list`
- `flow-state story describe <story-id>`
- `flow-state story run <story-id>`
- `flow-state story paths`

### Trace Commands

- `flow-state trace summarize <trace-or-proof>`
- `flow-state trace diff <left> <right>`
- `flow-state trace proof <trace-or-proof>`

## Commands Run

These commands were run through the local CLI wrapper:
`node packages/flow-state/scripts/flow-state-cli.mjs`

### Help Sweep

```bash
$CLI --help
$CLI behavior --help
$CLI behavior build --help
$CLI behavior render --help
$CLI behavior diff --help
$CLI story --help
$CLI story list --help
$CLI story describe --help
$CLI story run --help
$CLI story paths --help
$CLI trace --help
$CLI trace summarize --help
$CLI trace diff --help
$CLI trace proof --help
```

### Behavior Receipts

```bash
$CLI behavior build --project-root "$PROJECT_ROOT" --output "$ARTIFACT_ROOT/behavior-contract.json"
$CLI behavior render --input "$ARTIFACT_ROOT/behavior-contract.json"
$CLI behavior render --input "$ARTIFACT_ROOT/behavior-contract.json" --format json
$CLI behavior render --project-root "$PROJECT_ROOT" --section coverage
$CLI behavior render --project-root "$PROJECT_ROOT" --section coverage --module Chat --format json
$CLI behavior diff --left-input "$ARTIFACT_ROOT/behavior-contract.json" --right-input "$ARTIFACT_ROOT/behavior-contract.json"
$CLI behavior diff --left-input "$ARTIFACT_ROOT/behavior-contract.json" --right-input "$ARTIFACT_ROOT/behavior-contract.json" --format json
```

### Story Receipts

```bash
$CLI story --project-root "$PROJECT_ROOT" list
$CLI story --project-root "$PROJECT_ROOT" list --format json
$CLI story --project-root "$PROJECT_ROOT" describe assistant-running
$CLI story --project-root "$PROJECT_ROOT" describe assistant-running --format json
$CLI story --project-root "$PROJECT_ROOT" run assistant-running
$CLI story --project-root "$PROJECT_ROOT" run assistant-running --format compact
$CLI story --project-root "$PROJECT_ROOT" run assistant-running --format json
$CLI story --project-root "$PROJECT_ROOT" run assistant-running --check
$CLI story --project-root "$PROJECT_ROOT" run assistant-running --pending-work
$CLI story --project-root "$PROJECT_ROOT" run assistant-running --save-trace "$ARTIFACT_ROOT/assistant-running.trace.json"
$CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --strategy shortest
$CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --strategy simple
$CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --to-state runningAssistant --format json
$CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --check --from-state runningAssistant --event '{"type":"ASSISTANT_DONE"}' --to-state ready --format json
```

### Trace Receipts

```bash
$CLI story --project-root "$PROJECT_ROOT" run overview-ready --save-trace "$ARTIFACT_ROOT/overview-ready.trace.json"
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json"
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" --format json
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" --contextualize --project-root "$PROJECT_ROOT"
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" --contextualize --project-root "$PROJECT_ROOT" --format json
$CLI trace diff "$ARTIFACT_ROOT/overview-ready.trace.json" "$ARTIFACT_ROOT/assistant-running.trace.json"
$CLI trace diff "$ARTIFACT_ROOT/overview-ready.trace.json" "$ARTIFACT_ROOT/assistant-running.trace.json" --format json
$CLI trace diff "$ARTIFACT_ROOT/overview-ready.trace.json" "$ARTIFACT_ROOT/assistant-running.trace.json" --section event-sequence
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" --actor Assistant.task
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" --issues --format json
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" --timeline
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" --correlation "$CORRELATION_ID"
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" --correlation "$CORRELATION_ID" --format json
```

### Failure Guidance Receipts

```bash
$CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --check
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" --project-root "$PROJECT_ROOT"
$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json"
```

## Surface Drift Notes

- The live help tree is the source of truth for this review.
- Older planning text mentioned `story run --transcript`,
  `story run --transactions`, `story run --save-proof`, and
  `trace summarize --format compact`, but those are not part of the live public
  help surface and were excluded from the judged receipt set.

## Findings By Command Family

### Behavior

- `behavior render` is the biggest compression opportunity: the coverage output repeats full machine matrices, transition lists, and many `none` rows that can be collapsed into a few change-hunting summaries.
- `behavior render --section coverage` should keep the covered/uncovered split, but it can drop most per-machine empty rows and keep only machines with real coverage holes or covered facts.
- `behavior diff` is already naturally compact; the main win is to retain only changed sections and a short equality/inequality verdict, not the full comparison payload.
- Coverage text should preserve the distinction between story coverage and proof coverage, because this output explicitly says it is not proof of full behavioral coverage.

Before: full `Covered States By Machine` and `Uncovered Transitions By Machine` matrices with repeated `none` rows.
After: `launch-workspace: covered ready/runningAssistant; uncovered saveConflict/saving; key gaps: Assistant.run, Assistant.task, Chat.composer`.

Before: `behavior diff` style output with all matching sections expanded.
After: `behavior diff: changed sections = X, Y; identical contract = yes/no`.

Must survive compression:

- Coverage scope is story coverage over curated stories, not proof of full behavior.
- Covered vs uncovered state/transition split.
- Explicit holes for blocked or unproved lanes.
- Any machine that has actual covered facts, especially `launch-workspace`.

### Story

- `story list` is a discovery surface, so it should stay tiny: story id, machine, title, expected state, and tags are the only stable decision aids.
- `story describe` can compress hard because it is mostly declarative metadata and a single event/expectation chain.
- `story run` is the most important story surface: it should keep final state, receipt count, issue count, outcome, related ids, and any run modifiers like `--check` or `--pending-work`.
- `story paths` is path-explosion-prone; compression should focus on shortest path examples plus state reachability, not every enumerated path.

Before: `story list` shows the full story rows with seed details inline.
After: `assistant-running [launch-workspace] -> runningAssistant | tags: docs, assistant`.

Before: `story run` emits a long receipt inventory and multiple modifier-specific variants.
After: `final=runningAssistant; receipts=9; issues=0; outcome=success; related=launch-workspace, Assistant.progress, Assistant.task; check=pass`.

Must survive compression:

- Story id and machine.
- Expected or final state.
- Receipt count, issue count, and outcome.
- Modifier-specific facts like `check`, `pending-work`, and saved trace behavior.

### Trace

- `trace summarize` should preserve the headline, final state, receipt count, correlation count, issue count, and related ids; everything else is supporting detail.
- `trace summarize --contextualize` must keep the fact that contextualization happened and the graph summary added `initial`, `states`, and `transitions`, because that is the only new information beyond the base summary.
- `trace proof` is selector-driven, so compression must keep which selector was used and the selector-specific headline or slice.
- `trace diff` is already compact; it mainly needs the changed sections list and a clear match/no-match verdict.

Before: base trace summary with all standard metadata and receipt types.
After: `launch-workspace ended in runningAssistant after RUN_ASSISTANT, ASSISTANT_PROGRESS; receipts=9; correlations=2; issues=0`.

Before: contextualized trace summary with long explanatory blocks.
After: `contextualized=yes; graph=launch-workspace initial=ready states=5 transitions=16`.

Must survive compression:

- Final state.
- Headline or event story.
- Receipt count, correlation count, and issue count.
- Selector choice for proof output.
- Whether the summary was contextualized.

### Failure Guidance

- These failures are useful as negative examples and should survive compression because they explain required flag combinations, not just user error.
- `story paths --check` must keep the fact that it requires at least one `--event <json>` input.
- `trace summarize --contextualize` must keep the fact that `--project-root`, `--gateway`, and `--machine` are required together.
- `trace proof` must keep the fact that exactly one selector is required.

Before: raw error text with no context.
After: `story paths --check: add at least one --event <json>`.

Before: raw error text for missing contextualize flags.
After: `trace summarize --contextualize requires --project-root, --gateway, and --machine`.

Must survive compression:

- The exact missing flag or selector rule.
- The command family that failed.
- The fact that these are hard requirements, not optional hints.

## Before / After Examples

### Behavior

- Before: a full coverage table with many `none` rows and every transition listed.
- After: a one-line coverage summary plus only the uncovered gaps that matter.

### Story

- Before: a full story row or run receipt block with repeated metadata.
- After: a compact story card with `story-id`, `machine`, `expected/final state`, and `outcome`.

### Trace

- Before: a base summary followed by long contextualization blocks or selector slices.
- After: a single trace headline with the selector/context modifier called out explicitly.

### Failure Guidance

- Before: a bare parser error with no usage context.
- After: a short rule reminder that names the required flag set or selector constraint.

## Facts That Must Survive Any Compression

- `behavior` is about declared facts and coverage, not execution proof.
- `story run assistant-running` ends in `runningAssistant` with 9 receipts, 0 issues, and `launch-workspace`, `Assistant.progress`, and `Assistant.task` as related ids.
- `trace summarize` reports `launch-workspace` ending in `runningAssistant` after `RUN_ASSISTANT, ASSISTANT_PROGRESS`, with `receipt count=9`, `correlation count=2`, and `issue count=0`.
- `trace summarize --contextualize` adds `contextualized: yes` and `Graph: launch-workspace initial=ready states=5 transitions=16`.
- `trace proof` is selector-first and requires exactly one of `--actor`, `--correlation`, `--issues`, or `--timeline`.
- `story paths --check` requires at least one `--event <json>` input.
- The review should keep the live help tree as the source of truth and should not resurrect excluded options like `story run --transcript`, `story run --transactions`, `story run --save-proof`, or `trace summarize --format compact`.
