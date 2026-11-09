---
name: workflow-cli
description: >-
  Use the Workflow CLI to find work, inspect blockers, create and update Plans, Tasks, and Specs,
  link records, and validate changes.
metadata:
  kind: procedure
---

# Workflow CLI

The `workflow` command line tool reads and writes the project's Plans, Epics, Tasks, and Specs,
links them together, and validates the result. Other skills decide what belongs in those records;
this one covers the commands and the file syntax.

## First step

Run from the project root, or add `--root DIR`:

```sh
workflow --help
```

Use command help for unfamiliar options. If project setup is authorized and records are missing,
run `workflow init` to create the directories and index. Initialization does not create work
records.

## Commands or direct edits

Use commands for creation, short edits, whole-field replacements (`--text FIELD=TEXT` or
`--file FIELD=PATH`), notes and comments, marking decisions read, opening a phase, queries, and
links, and add `--json` when a program will read the output. Edit the files directly for what the
commands cannot do well: structural changes, surgical prose edits in any field, Plan objects, and
edits within a Spec body. `workflow edit --help` lists which fields `--file` can replace. Read what
is there before replacing it, and keep IDs, nesting, and unrelated work intact. For the grammar,
read [the syntax starter](syntax.md) or a valid existing record, and never invent schema fields.

## Core CLI workflow

### 1. Find and inspect work

```sh
workflow list task --ready
workflow list task --status=in_progress
workflow next --epic Example
workflow show @task.Example.T1 --why
workflow show @epic.Example --tree
```

`next` reports the highest-priority ready Task; it does not reserve it or change its assignee.
An in-progress Task is shown first (`In progress: ...`). With nothing ready it says why: the task
count by status, how many are blocked by an unresolved blocker, and which Epics are not active (a
draft Epic's Tasks are never ready). An unknown `--epic` or `--status` is an error, not an empty
result. Graph readiness requires an open Task, an active Epic, and satisfied blockers.
`show` prints a record readably: a Task's line `@task.EPIC.T1 [status priority] title (phase)`, its
file, set fields (assignee, labels, ...), description, acceptance and comments; an Epic's
description, loop and last three notes (`--notes N` or `--notes all` for more); a Plan's goal and objects (`show @plan.ID`); a phase's card,
comments and Tasks. `list task` prints each Task with its phase and ends with `Total: N tasks.`;
`--blocked` adds each Task's unresolved blockers; `--ready` with nothing ready says why, as
`next` does. An unknown `--epic`, `--phase` or `--status` is an error.
Use `--why` to explain readiness and `--tree` to inspect hierarchy. Do not combine them.
Find Specs with `workflow list spec`.
`workflow status` is the home view: each Epic with its in-progress Tasks first, its loop skill and
last three notes; warnings; decisions waiting for the user's read, each at the `file:line` of its
`Decision (` lead; ready Tasks; and counts of dangling links and orphans. `workflow status
--decisions` prints each pending decision in full under its `file:line`.

When the user has read a decision, mark it; `User's read: pending` becomes `done` in place (the
one in-place edit a note permits), and `status` stops listing it:

```sh
workflow read workflow/tasks/Example/epic.task:42   # the line status prints
workflow read 2026-11-09T04:00:00Z                  # the Epic note holding one pending decision
workflow read 2026-11-09T05:00:00+01:00             # any valid timestamp; compared as an instant
```

It is refused when the target is not a decision pending the user's read.

### Links and backlinks

Prose may link records with `@plan.ID[.O1]`, `@epic.ID`, `@task.EPIC.T1` and `@spec.ID[.R1]`, files
with `code:PATH` or `code:PATH#TEXT`, and skills with `skill:NAME` or `skill:NAME#heading`
(resolved through the `skills` array in `workflow/config.json`: ordered skill-library roots, the first
holding `NAME/SKILL.md` wins; a root that is not a directory fails `workflow check`). `workflow check` fails on a
link that resolves to nothing. Code spans and fences are not links. There is no rename command:
to rename a record, change every link to it (find them with `workflow refs`), then check.

```sh
workflow refs @task.Example.T1        # every link to it, once each, at the line it is written on
workflow refs @phase.Example.P1       # links to any Task of the phase
workflow refs @epic.Example           # links to the Epic and to any of its Tasks
workflow refs @spec.Example --links   # a Spec's typed relationships by default; --links lists all
workflow refs code:src/turn.ts#admit
workflow refs skill:policy-testing
workflow refs --dangling              # links to nothing; exits 1 when any
workflow refs --orphans               # objects nothing links to; a report only
```

### 2. Create records

Create only the records needed for the assigned work. A Task needs an existing Epic and phase.
Replace example IDs and paths. Prepare `goal.md`, `acceptance.md`, and `spec-body.txt` as inputs.
The Spec body file contains body sections, without the metadata header.

```sh
workflow create plan --id Example --set title="Example work" --file goal=goal.md
workflow create epic --id Example --set title="Example work" --set status=draft
workflow create phase --epic Example --id P1 --set title="Delivery"
workflow create task --epic Example --phase P1 --id T1 \
  --set title="Deliver the slice" --set status=draft --set priority=medium \
  --file acceptance=acceptance.md
workflow create task --epic Example --phase P1 --id T2 \
  --set title="Follow-up slice" --set status=draft --set priority=low \
  --file acceptance=acceptance.md
workflow create spec --id Example --path src/example.spec \
  --set status=proposed --set basis="Agreed requirements" --set location=src/example \
  --file body=spec-body.txt
```

These examples leave work proposed or draft. Creation does not grant approval to execute.
Spec creation updates `workflow/spec.index` automatically.

Add this Outcome inside `workflow/plans/Example.plan` for the relationship example below.
If an `outcomes` section exists, add O1 there rather than creating another section.

```text
outcomes
    O1 The example completes.
```

### 3. Update fields and record progress

When execution is authorized, activate the Epic and open the Task, or every draft Task of a phase,
before starting work:

```sh
workflow edit @epic.Example --set status=active
workflow edit @task.Example.T1 --set status=open
workflow open @phase.Example.P1        # every draft Task of P1 becomes open; reports how many
workflow show @task.Example.T1 --why
```

`workflow open` is refused unless the Epic is `active`: a draft Epic waits for the user's approval.

Proceed only when the Task is ready. The following commands illustrate progress updates;
run each when the corresponding change has occurred.

```sh
workflow edit @task.Example.T1 --set priority=high
workflow edit @task.Example.T1 --set status=in_progress --set assignee=worker-a
workflow edit @task.Example.T1 --set labels=[backend, recovery]
workflow edit @task.Example.T1 --now --text comment="Gates pass; see @task.Example.T2."
workflow edit @task.Example.T1 --set status=done
```

Inspect the current record before updating it. Setting status and assignee does not lock the Task:
another worker can claim it between your read and your write. Mark done only after the work's
required gates pass. A comment needs a time, `--now` (the current UTC time) or
`--set comment=TIMESTAMP` (never earlier than the comment before it, at most 5 minutes ahead), and
a body, `--text comment=TEXT` or `--file comment=PATH`.

List fields (`labels`, `blocked_by`, `derives_from`, `parent`, `satisfies`) take one syntax in
`create` and `edit`: repeated `--set labels=a --set labels=b`, `--set labels=[a, b]` or
`--set labels=a,b`; the value replaces the entire list. A Task's relationships can be edited this
way (`--set blocked_by=[@T2, @T3]`) or with `workflow link`. Items have no spaces. An empty value
is refused: `--clear FIELD` empties a list or removes an optional field (assignee, defer_until,
description, acceptance, deleted_at, deletion_reason). Repeat other fields only when command
help permits it.

`--text FIELD=TEXT` gives a text field inline; `--file FIELD=PATH` reads it from a file. Either
replaces a whole supported field; paths resolve from the working directory.
Use `--file FIELD=-` with a quoted heredoc for stdin. Only one field can read stdin per command.
Only check diagnostics your edit introduces refuse it; each names the flags of the field it
comes from (`(--set blocked_by)`, `(--set note, --text note)`), or a real line of a file on disk.
Diagnostics the repository already had are a warning on stderr and do not block. Refusals go to
stderr; with `--json`, results and usage errors are JSON on stdout. Do not weaken acceptance or
remove detail to work around a refused edit.

### Epic loop and phase notes

An Epic can carry its loop: `skill` (`LIBRARY@REVISION`), the text sections `run`,
`instructions`, `cadence` and `stops`, then dated `note TIMESTAMP` entries. A phase can carry a
`description` and dated `comment` entries. Notes are append-only: their timestamps never decrease
and a note has a body. Prepare `loop-run.md` first.

```sh
workflow edit @epic.Example --set skill=workflow@abc1234 --file run=loop-run.md
workflow edit @epic.Example --now --text note="Paused: the user asked for a review."
workflow edit @epic.Example --set note=2026-11-09T04:00:00Z --file note=note.md
workflow edit @phase.Example.P1 --file description=card.md
workflow edit @phase.Example.P1 --now --text comment="Opened after @task.Example.T0 landed."
```

A note or comment needs a time (`--now` or `--set note|comment=TIMESTAMP`) and a body (`--text`
or `--file`); it is always appended. The `skill` pin names the library, the folder name of a root
in `workflow/config.json`'s `skills` (`workflow` for `.../suites/workflow`), and a commit of its
git repository; `workflow check` refuses a pin that resolves to nothing or a revision that is not
a commit, and warns when the library is outside git or git cannot run.
Missing Epic fields are inserted in order. Field order, note order and empty notes are checked.

### 4. Connect records

Both endpoints must exist. Here, T2 waits for T1; T1 delivers O1; the Spec traces to T1.

```sh
workflow link @task.Example.T2 @task.Example.T1 --type blocked-by
workflow link @task.Example.T1 @plan.Example.O1 --type satisfies
workflow link @spec.Example @task.Example.T1 --type spec-trace
```

Use `parent` for Task grouping and `derives-from` for supported provenance.
Grouping and file order do not create blockers. `satisfies` targets Plan Outcomes.
Use `workflow unlink` with the same arguments to remove a relationship.
Each call accepts one source-target pair; grouped-reference shorthand is not accepted.

### 5. Validate changed files

After a coherent batch of writes, format each changed artifact, then validate the repository:

```sh
workflow format workflow/tasks/Example/P1.task --write
workflow check
```

Replace the example path; repeat formatting for each changed artifact. Review the diff. Preserve
formatter-produced continuation whitespace. Keep notes, tables, and resources in supported text
blocks. For read-only work, use `workflow check` or `workflow format PATH --check`. Skip write-mode
formatting. Validation checks artifact and graph integrity and resolves every link, not completion or
execution readiness.

## Index, recovery, and transfer

- After moving a Spec or changing its ID directly, run `workflow index`, then `workflow check`.
- If invalid records block queries, inspect diagnostics and source files, and repair only the files
your assignment lets you change.
- After a refused write, inspect files before retrying; do not assume the edit persisted.
  If a valid field edit remains refused, edit the field directly, then format and check.
- Use `workflow export --output backup.json` for an artifact export.
  Preview import with `workflow import --dry-run < backup.json` before applying it.
  Preview cleanup and reference migration with `--dry-run` too.

## What to return

Return the records you changed, the commands you ran, and the `workflow check` result. Stop when
the assigned record work is done and validates. If validation fails only on records outside your
write scope, return those diagnostics and stop with validation marked blocked.
