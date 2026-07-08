# How To Use Flow State

Flow State is a package-first framework for building apps as declared facts,
reproducible workflows, and runtime evidence.

Use this page as the present-tense guide to the current public surface.

For the canonical command tree, use [cli.txt](/Users/arpit/Developer/flow-state/cli.txt).
For the implementation and proof backlog, use
[TOOLS_AND_DOCS.md](/Users/arpit/Developer/flow-state/TOOLS_AND_DOCS.md).

## Start With Four Jobs

Most work in Flow State starts in one of these jobs:

1. Declared facts
2. Path discovery
3. Reproducible execution
4. Runtime evidence

Those jobs map to the durable CLI families:

- `flow-state behavior ...`
- `flow-state story ...`
- `flow-state trace ...`

That is the public interaction surface. Repo-local scripts stay secondary and
non-canonical.

## Declared Facts

Start with `behavior` when you need the app-level declared contract:
modules, machines, resources, stories, coverage, and diffable contract output.

The concrete behavior-contract loop is:

- `flow-state behavior build`
- `flow-state behavior render`
- `flow-state behavior diff`

Scaffolds stay future, opt-in, and non-canonical.

Use this lane when the question is:

- what does the app declare today?
- which stories and machines exist?
- what changed in the shared contract?

For the current behavior brief, use
[Behavior Contract](/reference/behavior).

## Path Discovery

Start with `story paths` when you need a legal event sequence before running a
live scenario.

Use:

- `flow-state story paths --strategy shortest`
- `flow-state story paths --strategy simple`
- `flow-state story paths --check`

This lane owns guard-aware path discovery and exact-sequence validation.
It does not replace live execution or trace evidence.

Use this lane when the question is:

- can this event sequence happen?
- what is the shortest legal path to this state?
- which path should I replay in a deterministic test?

## Reproducible Execution

Start with `story` when you need one declared scenario to run against the real
testing/runtime surface.

Use:

- `flow-state story list`
- `flow-state story describe <story-id>`
- `flow-state story run <story-id>`
- `flow-state story run <story-id> --check`
- `flow-state story run <story-id> --pending-work`
- `flow-state story run <story-id> --save-trace <path>`

This lane owns declared story discovery, scenario execution, expectation
checking, and saved trace generation.

Use this lane when the question is:

- which declared story should I run?
- does this story satisfy its expected state and facts?
- what pending work is still blocking progress?
- which trace file should I carry into later debugging?

## Runtime Evidence

Start with `trace` when you already have a saved trace or proof input and need
to explain what happened.

Use:

- `flow-state trace summarize <trace-or-proof>`
- `flow-state trace summarize <trace-or-proof> --contextualize`
- `flow-state trace proof <trace-or-proof> --actor ...`
- `flow-state trace proof <trace-or-proof> --correlation ...`
- `flow-state trace proof <trace-or-proof> --issues`
- `flow-state trace proof <trace-or-proof> --timeline`
- `flow-state trace diff <left> <right>`

This lane owns whole-trace summaries, machine-aware contextualization,
selector-first proof slices, and trace-to-trace diffs.

Use this lane when the question is:

- what happened in this run?
- why did the graph and the trace disagree?
- which actor, correlation, or issue slice should I inspect?
- how did one run differ from another?

## One Practical Loop

For most AI-assisted workflow work, the stable loop is:

1. Use `flow-state behavior render` to see the declared facts.
2. Use `flow-state story paths` to discover or validate a legal path.
3. Use `flow-state story run` to execute one declared scenario.
4. Save the trace with `--save-trace` when you need durable evidence.
5. Use `flow-state trace summarize`, `--contextualize`, or `trace proof` to
   analyze that evidence.

That is the preferred flow:

- declared facts first
- path discovery second
- reproducible execution third
- runtime evidence last

## Choose The Real Owner

The CLI is a package-owned composition layer over existing primitives. It is
not a second debugging engine.

The durable implementation lives under
`packages/flow-state/src/cli/**`, with wrapper-driven verification under
`packages/flow-state/src/cli-test/**`.
Repo-local scripts under `packages/flow-state/scripts/**` remain secondary and
non-canonical.

Use the CLI when you want stable commands and stable output shapes.

Use the library owners directly when you are writing code:

- `flow-state` for resources, transactions, machines, app assembly, and runtime
- `flow-state/testing` for deterministic scenario execution and model traversal
- `flow-state/inspect` for graph, trace, diff, proof, and semantic projection
- `flow-state/react` and `flow-state/server` for host integration

For deeper owner pages, continue with:

- [API Reference](/reference/api)
- [Testing Reference](/reference/testing)
- [Inspection](/reference/inspection)
- [Supported Today](/reference/status)

## What Flow State Encourages

Flow State works best when the app stays explicit:

- resources hold canonical shared data
- machines hold workflow state
- transactions make writes traceable
- streams, timers, and child flows stay declared
- views keep UI state thin
- tests and traces stay cheap to rerun

The goal is not ceremony for its own sake.

The goal is a codebase that stays legible to humans and agents under change:

- structure first
- proof early
- implementation in the open

## One Rule

If a fact can be expressed as a declared contract, a reproducible story, or a
saved trace, prefer that over hidden component logic or one-off terminal notes.
