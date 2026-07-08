# CLI Output Compression Runbook

This runbook exists so the CLI output-compression review does not miss part of
the real surfaced command tree.

Use the live help output as the source of truth for what to run.
Use `cli.txt` only as a secondary drift check after the live help walk.

## Goal

Capture the current public CLI outputs against `examples/launch-workspace`,
then hand those receipts to a separate judging subagent that proposes tighter,
less repetitive, more AI-readable formats in
`CLI_OUTPUT_COMPRESSION_REVIEW.md`.

Do not change CLI output contracts in the same slice as this review.

## Setup

Run from the repo root:

```bash
cd /Users/arpit/Developer/flow-state
pnpm --dir packages/flow-state build

export CLI="node packages/flow-state/scripts/flow-state-cli.mjs"
export PROJECT_ROOT="examples/launch-workspace"
export REVIEW_ROOT="tmp/cli-output-compression"
export ARTIFACT_ROOT="$REVIEW_ROOT/artifacts"
export HELP_ROOT="$REVIEW_ROOT/help"
export OUTPUT_ROOT="$REVIEW_ROOT/outputs"

mkdir -p "$ARTIFACT_ROOT" "$HELP_ROOT" "$OUTPUT_ROOT"
```

## 1. Capture The Live Help Tree

Save every surfaced help page before running example commands:

```bash
$CLI --help > "$HELP_ROOT/root.txt"

$CLI behavior --help > "$HELP_ROOT/behavior.txt"
$CLI behavior build --help > "$HELP_ROOT/behavior-build.txt"
$CLI behavior render --help > "$HELP_ROOT/behavior-render.txt"
$CLI behavior diff --help > "$HELP_ROOT/behavior-diff.txt"

$CLI story --help > "$HELP_ROOT/story.txt"
$CLI story list --help > "$HELP_ROOT/story-list.txt"
$CLI story describe --help > "$HELP_ROOT/story-describe.txt"
$CLI story run --help > "$HELP_ROOT/story-run.txt"
$CLI story paths --help > "$HELP_ROOT/story-paths.txt"

$CLI trace --help > "$HELP_ROOT/trace.txt"
$CLI trace summarize --help > "$HELP_ROOT/trace-summarize.txt"
$CLI trace diff --help > "$HELP_ROOT/trace-diff.txt"
$CLI trace proof --help > "$HELP_ROOT/trace-proof.txt"
```

Before moving on, confirm every public command named by those help pages has a
matching run receipt below. If the help output has changed, extend this
runbook before doing the review.

## 2. Capture Real Example Receipts

### Behavior Family

```bash
$CLI behavior build \
  --project-root "$PROJECT_ROOT" \
  --output "$ARTIFACT_ROOT/behavior-contract.json" \
  > "$OUTPUT_ROOT/behavior-build.txt"

$CLI behavior render \
  --input "$ARTIFACT_ROOT/behavior-contract.json" \
  > "$OUTPUT_ROOT/behavior-render-contract.txt"

$CLI behavior render \
  --input "$ARTIFACT_ROOT/behavior-contract.json" \
  --format json \
  > "$OUTPUT_ROOT/behavior-render-contract.json"

$CLI behavior render \
  --project-root "$PROJECT_ROOT" \
  --section coverage \
  > "$OUTPUT_ROOT/behavior-render-coverage.txt"

$CLI behavior render \
  --project-root "$PROJECT_ROOT" \
  --section coverage \
  --module Chat \
  --format json \
  > "$OUTPUT_ROOT/behavior-render-coverage-chat.json"

$CLI behavior diff \
  --left-input "$ARTIFACT_ROOT/behavior-contract.json" \
  --right-input "$ARTIFACT_ROOT/behavior-contract.json" \
  > "$OUTPUT_ROOT/behavior-diff-self.txt"

$CLI behavior diff \
  --left-input "$ARTIFACT_ROOT/behavior-contract.json" \
  --right-input "$ARTIFACT_ROOT/behavior-contract.json" \
  --format json \
  > "$OUTPUT_ROOT/behavior-diff-self.json"
```

Note:
the required realistic baseline for `behavior diff` is a no-change comparison
against the real Launch Workspace contract. If a later review wants a changed
diff shape, capture that as an appendix instead of replacing the real-app
baseline.

### Story Family

```bash
$CLI story --project-root "$PROJECT_ROOT" list \
  > "$OUTPUT_ROOT/story-list.txt"

$CLI story --project-root "$PROJECT_ROOT" list \
  --format json \
  > "$OUTPUT_ROOT/story-list.json"

$CLI story --project-root "$PROJECT_ROOT" describe assistant-running \
  > "$OUTPUT_ROOT/story-describe-assistant-running.txt"

$CLI story --project-root "$PROJECT_ROOT" describe assistant-running \
  --format json \
  > "$OUTPUT_ROOT/story-describe-assistant-running.json"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  > "$OUTPUT_ROOT/story-run-assistant-running-pretty.txt"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  --format compact \
  > "$OUTPUT_ROOT/story-run-assistant-running-compact.txt"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  --format json \
  > "$OUTPUT_ROOT/story-run-assistant-running.json"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  --check \
  > "$OUTPUT_ROOT/story-run-assistant-running-check.txt"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  --pending-work \
  > "$OUTPUT_ROOT/story-run-assistant-running-pending-work.txt"

$CLI story --project-root "$PROJECT_ROOT" run assistant-running \
  --save-trace "$ARTIFACT_ROOT/assistant-running.trace.json" \
  > "$OUTPUT_ROOT/story-run-assistant-running-save-trace.txt"

$CLI story --project-root "$PROJECT_ROOT" paths \
  --machine launch-workspace \
  --strategy shortest \
  > "$OUTPUT_ROOT/story-paths-shortest.txt"

$CLI story --project-root "$PROJECT_ROOT" paths \
  --machine launch-workspace \
  --strategy simple \
  > "$OUTPUT_ROOT/story-paths-simple.txt"

$CLI story --project-root "$PROJECT_ROOT" paths \
  --machine launch-workspace \
  --to-state runningAssistant \
  --format json \
  > "$OUTPUT_ROOT/story-paths-running-assistant.json"

$CLI story --project-root "$PROJECT_ROOT" paths \
  --machine launch-workspace \
  --check \
  --from-state runningAssistant \
  --event '{"type":"ASSISTANT_DONE"}' \
  --to-state ready \
  --format json \
  > "$OUTPUT_ROOT/story-paths-check-assistant-done.json"
```

### Trace Family

First capture one second trace for diff:

```bash
$CLI story --project-root "$PROJECT_ROOT" run overview-ready \
  --save-trace "$ARTIFACT_ROOT/overview-ready.trace.json" \
  > "$OUTPUT_ROOT/story-run-overview-ready-save-trace.txt"
```

Then capture the trace surfaces:

```bash
$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" \
  > "$OUTPUT_ROOT/trace-summarize.txt"

$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --format json \
  > "$OUTPUT_ROOT/trace-summarize.json"

$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --contextualize \
  --project-root "$PROJECT_ROOT" \
  > "$OUTPUT_ROOT/trace-summarize-contextualized.txt"

$CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --contextualize \
  --project-root "$PROJECT_ROOT" \
  --format json \
  > "$OUTPUT_ROOT/trace-summarize-contextualized.json"

$CLI trace diff \
  "$ARTIFACT_ROOT/overview-ready.trace.json" \
  "$ARTIFACT_ROOT/assistant-running.trace.json" \
  > "$OUTPUT_ROOT/trace-diff.txt"

$CLI trace diff \
  "$ARTIFACT_ROOT/overview-ready.trace.json" \
  "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --format json \
  > "$OUTPUT_ROOT/trace-diff.json"

$CLI trace diff \
  "$ARTIFACT_ROOT/overview-ready.trace.json" \
  "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --section event-sequence \
  > "$OUTPUT_ROOT/trace-diff-event-sequence.txt"

$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --actor Assistant.task \
  > "$OUTPUT_ROOT/trace-proof-actor.txt"

$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --issues \
  --format json \
  > "$OUTPUT_ROOT/trace-proof-issues.json"

$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --timeline \
  > "$OUTPUT_ROOT/trace-proof-timeline.txt"
```

Then derive one real correlation id from the saved summary and capture the
correlation slice:

```bash
export CORRELATION_ID="$(
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); console.log(p.summary.correlations[0].correlationId);' \
    "$OUTPUT_ROOT/trace-summarize.json"
)"

$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --correlation "$CORRELATION_ID" \
  > "$OUTPUT_ROOT/trace-proof-correlation.txt"

$CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json" \
  --correlation "$CORRELATION_ID" \
  --format json \
  > "$OUTPUT_ROOT/trace-proof-correlation.json"
```

## 3. Capture Focused Failure Guidance

These failures are part of the product surface too. Capture at least one
helpful fail-closed example per family:

```bash
($CLI story --project-root "$PROJECT_ROOT" paths --machine launch-workspace --check) \
  > "$OUTPUT_ROOT/story-paths-check-missing-event.txt" 2>&1 || true

($CLI trace summarize "$ARTIFACT_ROOT/assistant-running.trace.json" --project-root "$PROJECT_ROOT") \
  > "$OUTPUT_ROOT/trace-summarize-missing-contextualize.txt" 2>&1 || true

($CLI trace proof "$ARTIFACT_ROOT/assistant-running.trace.json") \
  > "$OUTPUT_ROOT/trace-proof-missing-selector.txt" 2>&1 || true
```

If the live help tree exposes an additional fail-closed path that looks
user-facing and high-volume, add it before judging the outputs.

## 4. Judge Pass

Hand only the captured receipts to a separate judging subagent.

The judge should answer:

1. Which outputs repeat the same context, warnings, or headings more than once?
2. Which text blocks are helpful for humans but wasteful for an AI reader?
3. Which command families could share one tighter envelope or one shorter
   default text shape?
4. Which details are genuinely decision-critical and must not be compressed
   away?

The judge must write findings to `CLI_OUTPUT_COMPRESSION_REVIEW.md` with:

- the exact help-derived command inventory
- the exact commands that were run
- short findings grouped by command family
- paired before/after examples for every proposed compression
- explicit notes about what information must survive unchanged

## 5. Stop Rule

Do not implement any output changes in this runbook slice.

The output of this runbook is evidence plus proposed before/after examples for
review. A later slice may implement the approved compressions.
