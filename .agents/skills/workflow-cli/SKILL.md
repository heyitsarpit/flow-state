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

Use commands for creation, short edits, whole-field replacements (`--file FIELD=PATH`), queries, and
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
Graph readiness requires an open Task, an active Epic, and satisfied blockers.
Use `--why` to explain readiness and `--tree` to inspect hierarchy. Do not combine them.
Read Plans directly. Find Specs with `workflow list spec`.
`workflow status` is the home view: each Epic with its loop skill and last three notes, decisions
waiting for the user's read, ready Tasks, and counts of dangling links and orphans.

### Links and backlinks

Prose may link records with `@plan.ID[.O1]`, `@epic.ID`, `@task.EPIC.T1` and `@spec.ID[.R1]`, files
with `code:PATH` or `code:PATH#TEXT`, and skills with `skill:NAME` or `skill:NAME#heading`
(resolved through the ordered skills roots in `workflow/config.json`). `workflow check` fails on a
link that resolves to nothing. Code spans and fences are not links. Renaming a Plan, Epic or Task
rewrites its prose links.

```sh
workflow refs @task.Example.T1        # every link to it, with file and line
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

When execution is authorized, activate the Epic and open the Task before starting work:

```sh
workflow edit @epic.Example --set status=active
workflow edit @task.Example.T1 --set status=open
workflow show @task.Example.T1 --why
```

Proceed only when the Task is ready. The following commands illustrate progress updates;
run each when the corresponding change has occurred. Prepare `note.md` for the comment.

```sh
workflow edit @task.Example.T1 --set priority=high
workflow edit @task.Example.T1 --set status=in_progress --set assignee=worker-a
workflow edit @task.Example.T1 --set labels=backend --set labels=recovery
workflow edit @task.Example.T1 --set comment=2026-10-17T00:00:00Z --file comment=note.md
workflow edit @task.Example.T1 --set status=done
```

Inspect the current record before updating it. Setting status and assignee does not lock the Task:
another worker can claim it between your read and your write. Mark done only after the work's
required gates pass. Use the actual timestamp and authored comment. Comments require both the
timestamp and body. Repeated `labels` values replace the entire list. Repeat other fields only when
command help permits it.

`--file FIELD=PATH` replaces a whole supported field; paths resolve from the working directory.
Use `--file FIELD=-` with a quoted heredoc for stdin. Only one field can read stdin per command.
Do not weaken acceptance or remove detail to work around a refused edit.

### Epic loop and phase notes

An Epic can carry its loop: `skill` (`NAME@REVISION`), the text sections `run`, `instructions`,
`cadence` and `stops`, then dated `note TIMESTAMP` entries. A phase can carry a `description`
and dated `comment` entries. Notes are append-only: their timestamps never decrease and a note has
a body. Prepare `loop-run.md` and `note.md` first.

```sh
workflow edit @epic.Example --set skill=workflow@abc1234 --file run=loop-run.md
workflow edit @epic.Example --set note=2026-11-09T04:00:00Z --file note=note.md
workflow edit @phase.Example.P1 --file description=card.md
workflow edit @phase.Example.P1 --set comment=2026-11-09T04:00:00Z --file comment=note.md
```

`--set note=` and `--set comment=` need their `--file` body; a note is always appended.
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
