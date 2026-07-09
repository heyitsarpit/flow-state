# CLI Output Tastefulness Review

Purpose: complement `CLI_OUTPUT_COMPRESSION_REVIEW.md` with a review-only pass on
default human text output shape. The goal is not smaller labels. The goal is
more beautiful, more scannable, more AI-readable CLI text that still preserves
the repo's real meanings.

Grounded in the existing review/runbook plus live receipts under
`tmp/cli-output-compression/outputs/`, especially:

- `behavior-render-coverage.txt`
- `story-run-assistant-running-pretty.txt`
- `story-run-assistant-running-check.txt`
- `story-run-assistant-running-pending-work.txt`
- `trace-summarize.txt`
- `trace-summarize-contextualized.txt`
- `trace-proof-correlation.txt`
- `trace-diff.txt`

## Design Goals

- Lead with the answer, not the plumbing.
- Make the default text feel like a polished developer-facing product, not a
  debug dump.
- Keep meaningful labels such as `Final state`, `Receipt count`, and
  `Correlation count`.
- Prefer structural wins: dedupe empty rows, suppress empty blocks, reuse shared
  summaries, and group related facts.
- Stay grep-friendly and copy-paste-friendly.
- Keep JSON as the full machine-readable mode; do not invent a second pseudo-JSON
  dialect in text mode.

## Reference Patterns From Real CLIs

- `gh` formatting: composable tables and multi-table views show that dense text
  can still feel intentional when headers are used sparingly and each row earns
  its place.
  Source: <https://cli.github.com/manual/gh_help_formatting>
- `kubectl`: keep a human-readable default, then branch into richer or more
  targeted shapes depending on intent: `get` for overview, `describe` for
  detail, `-o json|yaml|wide|name` for alternate views.
  Source: <https://kubernetes.io/docs/reference/kubectl/>
- `terraform plan`: lead with a verdict and proposed effect first; make
  `no changes` a first-class outcome, not a wall of empty sections.
  Source: <https://developer.hashicorp.com/terraform/cli/commands/plan>
- `pytest`: omit identical noise, keep a short summary, and tell the user when a
  more verbose mode would show more.
  Source: <https://docs.pytest.org/en/stable/how-to/output.html>
- `git log --stat` and `--compact-summary`: pair a terse headline with a compact
  delta view instead of forcing full detail every time.
  Source: <https://git-scm.com/docs/git-log>
- `cargo tree`: use tree structure only when parent-child relationships are the
  point, and dedupe repeated branches by default.
  Source: <https://doc.rust-lang.org/cargo/commands/cargo-tree.html>

## Proposed Formatting Principles

- Put the verdict line near the top. A human or model should understand the
  outcome in the first screenful.
- Treat the first block as an executive summary: command identity, primary
  subject, final or changed state, counts, and one headline sentence.
- Use sections only when they introduce a new kind of information. Do not keep
  headers for empty subsections.
- Collapse repeated empties upward:
  `Other machines: none` is good.
  Eight machine rows that each say `none` are not.
- Modifier variants should append a delta block, not re-render the full base
  summary with one extra line.
- When a headline already states the event or state transition, do not repeat
  that fact in a second label unless it adds precision.
- Use tree-like structure only for causality, pathing, or ownership. Do not add
  box art just to look fancy.
- Keep text mode semantic and stable. JSON remains the place for exhaustive
  structure.

## Proposed Shapes

### Behavior Coverage

Default behavior coverage should read like a coverage briefing, not an exhaustive
matrix dump.

Recommended shape:

```text
# Behavior Coverage
Scope: LaunchWorkspace+...
Coverage basis: live gateway stories plus graph.storyCoverage(...)
Honesty note: story coverage over curated stories, not proof of full behavior.

## Covered Now
- States: launch-workspace -> ready, runningAssistant
- Transition: launch-workspace ready --RUN_ASSISTANT--> runningAssistant
- Child supervision: launch-workspace runningAssistant -> Assistant.task
- Resource query lifecycle: ready -> ensure launch.project, launch.permissions; observe launch.readiness, launch.assets, launch.approval
- Stream lifecycle: runningAssistant -> Assistant.progress

## Still Unproved
- States: requestingApproval, saveConflict, saving
- Transaction outcomes: launch.save-project success/failure; launch.request-approval success/failure
- Error-path states: launch-workspace saveConflict; Project.editor conflict
- Other covered machine rows: none
```

Notes:

- Keep the scope and honesty preamble because it carries real meaning.
- Group by information value, not by every internal lane category.
- Omit empty categories entirely in default text.
- If a section is mostly empty except for one machine, name the meaningful
  machine and collapse the rest.

### Story Run / Story Check Variants

`story run` should have one durable summary shape. Variants should add only what
they uniquely prove.

Recommended base shape:

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
```

Variant add-ons:

```text
## Check Result
- pass (2 checks, 0 failures)
```

```text
## Pending Work
- Active child: Assistant.task
- Mailboxes, timers, streams, transactions: none
```

```text
## Saved Artifacts
- Trace: tmp/cli-output-compression/artifacts/assistant-running.trace.json
```

Notes:

- `Execution: story-run` adds little in default text and can move to JSON.
- `Receipt types` is often too long for the default first screenful; keep it for
  verbose or JSON unless it is the main point of the command.
- `story list` should be closer to `kubectl get`: overview first, setup detail
  second. Repeated `start=default` and seed boilerplate belong in
  `story describe`, not in every list row.

### Trace Summary / Contextualized Summary

`trace summarize` should feel like a strong incident summary: outcome first,
explanation second, optional context third.

Recommended base shape:

```text
# Trace Summary
Machine: launch-workspace
Final state: runningAssistant
Headline: launch-workspace ended in runningAssistant after RUN_ASSISTANT, ASSISTANT_PROGRESS with 1 outcome(s)
Receipt count: 9
Correlation count: 2
Issue count: 0
Related ids: launch-workspace, Assistant.progress, Assistant.task
```

Contextualized variant:

```text
## Context
Graph: launch-workspace initial=ready states=5 transitions=16
No resource freshness, transaction overlap, or rehydration activity detected.
```

Notes:

- `Contextualized: yes` is useful, but it can be implied by the presence of a
  `Context` block if the team prefers one less line.
- Empty semantic subreports should collapse into one sentence, like `pytest`
  collapsing identical detail and `terraform plan` making `no changes` explicit.

### Trace Proof Or Diff

`trace proof` should be selector-first. `trace diff` should be verdict-first.

Recommended proof shape:

```text
# Trace Proof: correlation
Machine: launch-workspace
Selector: launch-workspace:event:1
Headline: RUN_ASSISTANT: ready -> runningAssistant; 1 outcome(s)
Receipt count: 7
Issue count: 0
Outcome count: 1
State change: ready -> runningAssistant
Related ids: launch-workspace, Assistant.progress, Assistant.task
```

Recommended diff shape:

```text
# Trace Diff
Left: launch-workspace (story-run-trace)
Right: launch-workspace (story-run-trace)
Matches: no
Changed sections: event-sequence, transitions, state-changes, stream-outcomes, child-outcomes
```

Notes:

- In proof output, `Event: RUN_ASSISTANT` is redundant when the headline already
  says `RUN_ASSISTANT: ready -> runningAssistant`.
- `trace proof --timeline` should keep its current restraint. `Event count: 0`
  plus `(no inspection events)` is already close to ideal.
- If `trace diff` later expands beyond one line of changed sections, borrow from
  `git --compact-summary`: keep the top verdict short and make detail a compact
  follow-on block, not a second headline.

## Before / After Examples Grounded In Local Receipts

### Behavior Coverage

Before, from `behavior-render-coverage.txt`:

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
## Covered States
- launch-workspace: ready, runningAssistant
- Other machines: none
```

This is the right kind of change: structural, honest, and high-signal.

### Story Run With Check

Before, from `story-run-assistant-running-check.txt`:

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

This keeps the meaning and removes the feeling of "full report plus tiny suffix."

### Contextualized Trace Summary

Before, from `trace-summarize-contextualized.txt`:

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
## Context
Graph: launch-workspace initial=ready states=5 transitions=16
No resource freshness, transaction overlap, or rehydration activity detected.
```

This reads like a finished product, not three empty stubs.

### Correlation Proof

Before, from `trace-proof-correlation.txt`:

```text
Correlation: launch-workspace:event:1
Headline: RUN_ASSISTANT: ready -> runningAssistant; 1 outcome(s)
Event: RUN_ASSISTANT
Receipt count: 7
Issue count: 0
Outcome count: 1
State change: ready -> runningAssistant
```

After:

```text
Selector: launch-workspace:event:1
Headline: RUN_ASSISTANT: ready -> runningAssistant; 1 outcome(s)
Receipt count: 7
Issue count: 0
Outcome count: 1
State change: ready -> runningAssistant
```

This trims redundancy without deleting any real proof fact.

## Do Not Over-Design

- Do not add ASCII boxes, separators, or decorative trees everywhere.
- Do not replace meaningful labels with terse abbreviations.
- Do not make every output a table; some command families want a summary block,
  not columns.
- Do not hide key facts behind "compact" magic that changes semantics.
- Do not flatten proof-oriented output into one-line soup just because it is
  shorter.
- Do not delete the repo's caveats. The honesty notes are part of the product.

## Recommended Implementation Order

1. Collapse empty contextual trace blocks into one compact summary sentence.
2. Refactor `story run` variants so they share one base summary and append only
   delta sections for `--check`, `--pending-work`, and saved artifacts.
3. Rework `behavior render --section coverage` to aggregate repeated `none` rows
   and omit entirely empty subsections.
4. Tighten `trace proof` so selector-specific output keeps the headline and
   proof facts but drops redundant restatements.
5. Revisit `story list` and `story paths` only after the higher-value structural
   wins land.
