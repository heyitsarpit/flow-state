# Agent Workflow

This page teaches the durable terminal workflow by job:

1. Declared facts
2. Path discovery
3. Reproducible execution
4. Runtime evidence

Use that order unless you already know you are entering in the middle with a
saved trace or a specific declared story.

This page organizes the jobs, then points you back to the owner pages for the
deeper contracts.

## 1. Declared Facts

Start here when the question is about the app's declared contract:

- which modules, machines, and stories exist?
- what does the behavior contract say today?
- what changed between two contract snapshots?

Use:

- `flow-state behavior build`
- `flow-state behavior render`
- `flow-state behavior diff`

This is the contract lane. It tells you what the app declares before you guess
at runtime behavior.

Read next:
[Behavior Contract](/reference/behavior),
[API Reference](/reference/api), and
[Current Status](/reference/status).

## 2. Path Discovery

Start here when you need a legal event sequence before running a live scenario.

Use:

- `flow-state story paths --strategy shortest`
- `flow-state story paths --strategy simple`
- `flow-state story paths --check`

This is the guard-aware path lane. It answers whether a sequence is legal and
which state it reaches, without turning path search into a second runtime trace
surface.

Read next:
[Testing Reference](/reference/testing) and
[Current Status](/reference/status).

## 3. Reproducible Execution

Start here when you want one declared scenario to run against the real harness
surface.

Use:

- `flow-state story list`
- `flow-state story describe <story-id>`
- `flow-state story run <story-id>`
- `flow-state story run <story-id> --check`
- `flow-state story run <story-id> --pending-work`
- `flow-state story run <story-id> --save-trace <path>`

This is the reproducible execution lane. It turns one declared story into a
deterministic run, expectation delta, pending-work diagnostic, and optional
saved trace artifact.

Read next:
[Testing Reference](/reference/testing),
[Behavior Contract](/reference/behavior), and
[Current Status](/reference/status).

## 4. Runtime Evidence

Start here when you already have a saved trace or proof input and need to
explain what happened.

Use:

- `flow-state trace summarize <trace-or-proof>`
- `flow-state trace summarize <trace-or-proof> --contextualize`
- `flow-state trace proof <trace-or-proof> --actor ...`
- `flow-state trace proof <trace-or-proof> --correlation ...`
- `flow-state trace proof <trace-or-proof> --issues`
- `flow-state trace proof <trace-or-proof> --timeline`
- `flow-state trace diff <left> <right>`

This is the runtime evidence lane. It owns whole-trace summaries,
machine-aware context, selector-first proof slices, and diffs over saved runs.

Read next:
[Inspection](/reference/inspection),
[Testing Reference](/reference/testing), and
[Current Status](/reference/status).

## One Rule

Prefer the smallest lane that can prove the fact:

- declared facts before scenario guesses
- path discovery before ad hoc event trial-and-error
- reproducible execution before terminal notes
- runtime evidence before prose explanations

## Public Jobs To Internal Helpers

Use the public job first, then drop to the lower-level helper only when you
need to write code, tests, or custom tooling around that surface.

| Public job or doorway                                          | Internal helpers underneath                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| declared app facts via `behavior build/render`                 | `.inventory()`, `buildBehaviorContract(...)`, `renderBehaviorContract(...)`, `renderBehaviorCoverage(...)`                             |
| declared contract comparisons via `behavior diff`              | `diffBehaviorContracts(...)`                                                                                                           |
| declared story discovery via `story list`                      | `flowStories(...)`                                                                                                                     |
| declared story docs via `story describe`                       | `describeStory(...)`, `storyToDoc(...)`                                                                                                |
| reproducible scenario execution via `story run`                | `runFlowStory(...)`, `receiptSummary()`, `issueSummary()`, `pendingWork()`                                                             |
| expectation delta via `story run --check`                      | `checkStory(...)`, `storyToTest(...)`                                                                                                  |
| path discovery via `story paths`                               | `test.model(machine)`, `graph.pathFromEvents(...)`                                                                                     |
| saved trace inputs for `trace summarize/proof`                 | `captureTrace(...)`, `summarizeTrace(...)`                                                                                             |
| whole-trace comparisons via `trace diff`                       | `diffTrace(...)`                                                                                                                       |
| machine-aware annotation via `trace summarize --contextualize` | `contextualizeTrace(...)`, `analyzeTrace(...)`                                                                                         |
| selector-first proof slices via `trace proof`                  | `createTraceProof(...)`, `createLocalInspectionProof(...)`                                                                             |
| helper-only inner-loop formatting in `flow-state/testing`      | `formatPendingWorkPretty(...)`, `formatScenarioTranscript(...)`, `formatTransactionEventsPretty(...)`, `formatHarnessTracePretty(...)` |

## Receipt-Backed Examples

These examples come from the current `examples/launch-workspace` proof app and
show the exact command shape plus a short excerpt of the observed output.

### Declared Facts Receipt

```text
$ flow-state behavior render --section coverage --project-root examples/launch-workspace
# LaunchWorkspace+Session+Launch+Project+Checklist+Readiness+Assets+Approval+Assistant+Chat+Trace Coverage

## Coverage Scope Note

- Scope: app LaunchWorkspace+Session+Launch+Project+Checklist+Readiness+Assets+Approval+Assistant+Chat+Trace.
- Coverage basis: live gateway stories plus `graph.storyCoverage(...)`; the canonical JSON remains the only committed artifact.
```

### Path Discovery Receipt

```text
$ flow-state story --project-root examples/launch-workspace paths --machine launch-workspace --strategy shortest --event '{"type":"RUN_ASSISTANT"}' --to-state runningAssistant
# Story Paths: launch-workspace
Strategy: shortest
Path count: 1
To state: runningAssistant
Event candidates: RUN_ASSISTANT
Paths:
- Reaches state "runningAssistant": RUN_ASSISTANT
```

### Reproducible Execution Receipt

```text
$ flow-state story --project-root examples/launch-workspace run assistant-running
# Story Run: assistant-running
Machine: launch-workspace
Title: Assistant running
Execution: story-run
Final state: runningAssistant
Receipt count: 9
Issue count: 0
Outcome kinds: success
Outcome sources: stream
```

### Runtime Evidence Receipt

```text
$ flow-state trace summarize "<saved-trace-path>"
# Trace Summary
Machine: launch-workspace
Source: story-run-trace
Final state: runningAssistant
Headline: launch-workspace ended in runningAssistant after RUN_ASSISTANT, ASSISTANT_PROGRESS with 1 outcome(s)
Receipt count: 9
Correlation count: 2
Issue count: 0
```
