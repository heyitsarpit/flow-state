# Agent Workflow

This page teaches the durable terminal workflow by job:

1. Declared facts
2. Path discovery
3. Reproducible execution
4. Runtime evidence

Use that order unless you already know you are entering in the middle with a
saved trace or a specific declared story.

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
