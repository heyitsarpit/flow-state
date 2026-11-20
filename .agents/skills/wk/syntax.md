# Syntax starter

These examples demonstrate syntax, not project decisions or completed verification.
Use spaces for indentation. Preserve existing IDs when editing.
Plans live at `wiki/plans/ID.plan`. Tasks live inside `wiki/tasks/EPIC/PHASE.task`.
Specs live under `wiki/specs/` (`wiki/specs/**.spec`); only the records folder is read, and there is no index file.
An ID mentioned in another file can be a citation. Read the owning record before editing.
Task references use `@task.Epic.Task`; omit the phase ID even when the file lives in a phase folder.

## Plan

```text
plan Example
title Example work
goal
    Deliver the agreed outcome.
outcomes
    O1 The user can complete the agreed operation.
questions
    Q1 Which failure cases must the operation handle?
verification
    V1 Complete the agreed operation
        Establish @O1 by performing the operation and observing its required result.
        Executable check not yet implemented; retain this as an unverified obligation.
```

Author titled Verification entries directly, with scenarios, pass conditions, and executable paths.
Use `@V1` within its Plan and `@plan.Example.V1` in supported provenance fields.
Task `satisfies` targets only Outcomes.
Link a Task to an existing outcome with `satisfies`: `@task.Example.T1` to `@plan.Example.O1`.

## Epic loop and phase card

Epic loop fields follow the contract fields in this order, each at most once: `skill`, `run`,
`instructions`, `cadence`, `stops`. Notes go in `log.task` beside it, as `note TIMESTAMP` entries
(timestamps never decrease). A phase has `title`, optional `description`, `comment TIMESTAMP` entries, then `tasks`.

```text
epic Example
title Example work
status active
skill workflow@abc1234
run
    Take `wk next --epic Example`; build it.
stops
    A guarantee change.
```

Its notes, in `log.task` in the same Epic folder (a dangling link here is a warning, not an error):

```text
log Example
note 2026-11-09T03:15:00Z
    The user: keep going.
note 2026-11-09T04:00:00Z
    [decided: agent builder 2026-11-09] Build the delay before the queue (@task.Example.T1).
    Why: the queue calls it.
    Reverse: stub the delay in the queue.
```

The phase lives in the same Epic folder, in `P1.task`:

```text
phase P1
title Delivery
description
    Class: build. Gates: suite.
comment 2026-11-09T03:15:00Z
    Opened after @task.Example.T0 landed.
tasks
    T1
        title Deliver the slice
```

Links in any prose: `@task.Example.T1`, `code:src/example.ts#admit`, `code:src/example.ts:42`,
`skill:policy-testing`, `skill:policy-testing#audit-a-suite` (every anchor is checked against the
heading slugs).
Code spans and fences are not links. Prefer `wk edit` for notes and comments
(`--now --text note="..."`).

`skill LIBRARY@REVISION` pins the loop: LIBRARY is the folder name of a `skills` root below
(`workflow`), REVISION a commit of its git repository.

List fields are written `[a, b]` in a file (`labels [backend, recovery]`); on the command line any
of `--set labels=a --set labels=b`, `--set labels=[a, b]` or `--set labels=a,b`.

`skill:NAME` resolves through `wiki/config.json`, an ordered array of skill-library roots
(absolute or relative to the repository root); the first root holding `NAME/SKILL.md` wins:

```json
{ "skills": ["/path/to/skills/suites/workflow", "/path/to/another/library"] }
```

## Markdown record

Any `.md` file under `wiki/` with frontmatter, here `wiki/proposals/2026-11-20-rules.md`. The kind
(`proposal`) must be declared in `wiki/config.json` with its status list. Links work anywhere in
the prose; tags follow a heading or bold lead term.

````md
---
proposal rules
status accepted user 2026-11-20
    proposed 2026-11-19
supersedes @proposal.rules-cohesion
---
# Rules on machines

**Bottom line:** every run judges the rules written beside a machine (@task.Example.T1).

- **Two rule kinds** [decided: user 2026-11-20]: `invariants` and `turns`.
- **Retry GET only** [decided: agent builder 2026-11-20]. Why: a POST can charge twice.
  Reverse: retry every request.
- **Coverage view** [deferred: user 2026-11-20]. Reopen if: a team asks for it outside the CLI.
- **Subjects on pairs** [open: 2026-11-20; recommend A]
````

```json
{
  "skills": ["/path/to/skills/suites/workflow"],
  "kinds": { "proposal": { "status": ["draft", "proposed", "accepted", "partial", "rejected",
    "superseded", "merged", "withdrawn"] }, "convention": {} },
  "areas": ["Example", "Proposal", "Wiki"]
}
```

Tag verbs: `proposed`, `decided`, `accepted`, `rejected`, `deferred`, `reopened`, `answered`,
`dropped`, `open`. A commit names the records it touches in a trailer:
`Refs: @proposal.rules @task.Example.T1`.

## Proposed Spec

For `create spec --file body=PATH`, supply only sections below the metadata header.
Edit body sections directly after creation. Preserve the supported example's section order.
Use each operation field once; put multiple guarantees in its indented text block.
Every coverage row needs `enforced_by`, including proposed mechanisms; retain unresolved `open_by`.

```text
spec Example
status proposed
basis Supplied brief
location src/example
requirements
    R1 Complete the agreed operation
        source Supplied brief.
        must The user must be able to complete the agreed operation.
open
    Q1 Implement and verify the operation.
invariants
    I1 Success is reported only after the agreed operation completes. [@R1]
coverage
    @R1
        enforced_by [@I1]
        open_by [@Q1]
tests
    T1 Planned behavior check for the agreed operation.
```

Use `spec-trace` from `@spec.Example` to an existing Plan or Task reference.
To trace this module Spec to two existing Tasks, run:

```sh
wk link @spec.Example @task.Example.T1 --type spec-trace
wk link @spec.Example @task.Example.T2 --type spec-trace
```

Top-level and owner invariants are both legal in one Spec; Invariant IDs are unique across both
placements.
Use local references such as `@R1` inside a Spec. Use qualified references across files.
Keep pending coverage `open_by` while status is `proposed`.
A test declaration does not establish that the test ran or passed.
