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

## Review Rule

This review should optimize for real token savings, not cosmetic shortening.

Good compression:

- remove repeated `none` rows
- suppress whole empty sections
- avoid restating the same base summary in modifier variants
- hide low-signal detail behind verbose or JSON modes

Bad compression:

- replacing meaningful labels with terse abbreviations
- collapsing readable field names into dense key-value shorthand
- deleting words that help an AI understand what a count or state refers to
- turning multi-line output into one line when the same words still appear

## Findings By Command Family

### Behavior

- `behavior render --section coverage` is the highest-value compression target in the whole CLI surface because it repeats large matrices full of `none`, `no covered facts`, and empty lane sections.
- The real win is structural: collapse repeated empty machine rows into shared lines like `Other machines: none` or suppress an entire section when every machine is empty.
- Empty lane sections such as covered issue lanes, covered outcome lanes, blocked stories, mismatch stories, and empty final-state matrices should be merged or omitted when they contain no information beyond `none`.
- `behavior diff` is already close to the right size; only changed sections or explicit `no differences` verdicts should appear by default.
- Coverage text must keep its honesty note because it explains the difference between curated story coverage and actual execution proof.

Must survive compression:

- Coverage scope is story coverage over curated stories, not proof of full behavior.
- Covered vs uncovered state/transition split.
- Explicit holes for blocked or unproved lanes.
- Any machine that has actual covered facts, especially `launch-workspace`.

### Story

- `story list` should stay small, but the meaningful gain is dropping low-signal repeated defaults like `start=default` or repeated seed boilerplate from the list view, not shortening labels.
- `story describe` is mostly declarative metadata; it can move richer setup details out of `story list` instead of forcing both surfaces to repeat them.
- `story run --check` and `story run --pending-work` currently reprint the full base run summary and then add a very small suffix. The best compression is to reuse the base summary once and append only the modifier-specific section.
- `story paths` should prefer reachability results and a short path sample by default; large path enumerations should be reserved for JSON or an explicitly verbose mode.
- Do not shorten fields like `Final state` or `Receipt count` just to save a few characters. Those labels are useful and the real savings are elsewhere.

Must survive compression:

- Story id and machine.
- Expected or final state.
- Receipt count, issue count, and outcome.
- Modifier-specific facts like `check`, `pending-work`, and saved trace behavior.

### Trace

- `trace summarize` should keep the full human-readable labels, but default text can drop low-signal supporting blocks like `Receipt types` when they are long and rarely the first thing an AI needs.
- `trace summarize --contextualize` currently prints three empty semantic subreports. Suppressing those empty blocks is a real compression win because it deletes whole sections, not just words.
- `trace proof` should keep selector, headline, and the selector-specific facts, but it can omit fields that simply restate the headline. For example, `Event: RUN_ASSISTANT` may be redundant when the headline already says `RUN_ASSISTANT: ready -> runningAssistant`.
- `trace diff` is already compact enough; the default should stay centered on `Matches` plus `Changed sections`, not on cosmetic shortening.
- The review should explicitly reject recommendations like `Correlation count` -> `correlations`; that saves almost nothing while making the output less self-explanatory.

Must survive compression:

- Final state.
- Headline or event story.
- Receipt count, correlation count, and issue count.
- Selector choice for proof output.
- Whether the summary was contextualized.

### Failure Guidance

- These failures are already close to the ideal size: short, explicit, and rule-based.
- They should only be changed if we can make them more consistent without removing exact requirements.
- Failure guidance is not a priority compression target compared with behavior coverage or modifier-variant duplication.
- If a future change touches them, it should preserve exact flag or selector requirements verbatim.

Must survive compression:

- The exact missing flag or selector rule.
- The command family that failed.
- The fact that these are hard requirements, not optional hints.

## Before / After Examples

### Behavior

Before:

```text
## Covered States By Machine
- launch-workspace: ready, runningAssistant
- Project.editor: none
- Checklist.checklist: none
- Assets.upload: none
- Approval.flow: none
- Assistant.run: none
- Assistant.task: none
- Chat.composer: none
```

After:

```text
## Covered States By Machine
- launch-workspace: ready, runningAssistant
- Other machines: none
```

Why this is better:

- It removes seven repeated empty rows.
- It keeps the meaningful machine-specific fact.
- It preserves the section name and the human-readable labels.

Before:

```text
Resource freshness report
  (no resource freshness activity)

Transaction overlap summary
  (no transaction overlap detected)

Rehydration summary
  (no rehydration activity detected)
```

After:

```text
No resource freshness, transaction overlap, or rehydration activity detected.
```

Why this is better:

- It deletes three empty subsections.
- It keeps the same semantic claim with much lower token cost.

### Story

Before:

```text
# Story Run: assistant-running
Machine: launch-workspace
Title: Assistant running
Execution: story-run
Final state: runningAssistant
Receipt count: 9
Issue count: 0
...
Check: pass (2 checks, 0 failures)
```

After:

```text
# Story Run: assistant-running
Machine: launch-workspace
Title: Assistant running
Final state: runningAssistant
Receipt count: 9
Issue count: 0
Outcome kinds: success
Outcome sources: stream
Related ids: launch-workspace, Assistant.progress, Assistant.task

## Check Result
- pass (2 checks, 0 failures)
```

Why this is better:

- It avoids restating the full base summary in a modifier variant.
- It keeps the useful labels and the explicit check result.
- It compresses by removing duplication, not by shortening words.

Before:

```text
- assistant-running [launch-workspace] Assistant running
  start=default | expectedState=runningAssistant | tags=docs,assistant | seed=fixtures: launchWorkspaceSeed
```

After:

```text
- assistant-running [launch-workspace] Assistant running
  expectedState=runningAssistant | tags=docs,assistant
```

Why this is better:

- It removes repeated low-signal defaults from the list view.
- It pushes richer setup detail to `story describe`, where it belongs.

### Trace

Before:

```text
Contextualized: yes
Graph: launch-workspace initial=ready states=5 transitions=16

Resource freshness report
  (no resource freshness activity)

Transaction overlap summary
  (no transaction overlap detected)

Rehydration summary
  (no rehydration activity detected)
```

After:

```text
Contextualized: yes
Graph: launch-workspace initial=ready states=5 transitions=16
```

Why this is better:

- It removes three whole empty blocks.
- It keeps the one contextualization fact that actually changed the output.

Before:

```text
Correlation: launch-workspace:event:1
Headline: RUN_ASSISTANT: ready -> runningAssistant; 1 outcome(s)
Event: RUN_ASSISTANT
Receipt count: 7
Issue count: 0
Outcome count: 1
State change: ready -> runningAssistant
Receipt types: ...
Related ids: ...
```

After:

```text
Correlation: launch-workspace:event:1
Headline: RUN_ASSISTANT: ready -> runningAssistant; 1 outcome(s)
Receipt count: 7
Issue count: 0
State change: ready -> runningAssistant
Related ids: launch-workspace, Assistant.progress, Assistant.task
```

Why this is better:

- It removes fields that simply restate the headline.
- It keeps the selector, the state change, and the related ids.
- It avoids pointless label-shortening.

### Failure Guidance

Before:

```text
`story paths --check` requires at least one `--event <json>` input.
```

After:

```text
`story paths --check` requires at least one `--event <json>` input.
```

Why this is better:

- No change recommended. This is already compact and precise.
- Failure guidance should not be shortened just for style.

## Facts That Must Survive Any Compression

- `behavior` is about declared facts and coverage, not execution proof.
- `story run assistant-running` ends in `runningAssistant` with 9 receipts, 0 issues, and `launch-workspace`, `Assistant.progress`, and `Assistant.task` as related ids.
- `trace summarize` reports `launch-workspace` ending in `runningAssistant` after `RUN_ASSISTANT, ASSISTANT_PROGRESS`, with `receipt count=9`, `correlation count=2`, and `issue count=0`.
- `trace summarize --contextualize` adds `contextualized: yes` and `Graph: launch-workspace initial=ready states=5 transitions=16`.
- `trace proof` is selector-first and requires exactly one of `--actor`, `--correlation`, `--issues`, or `--timeline`.
- `story paths --check` requires at least one `--event <json>` input.
- The review should keep the live help tree as the source of truth and should not resurrect excluded options like `story run --transcript`, `story run --transactions`, `story run --save-proof`, or `trace summarize --format compact`.
- Compression should favor deleting repeated empty structures and duplicated summaries over shortening meaningful labels.
