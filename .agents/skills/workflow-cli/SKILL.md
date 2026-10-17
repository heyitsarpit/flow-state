---
name: workflow-cli
description: >-
  Use the Workflow CLI to find work, inspect blockers, create and update Plans, Tasks, and Specs,
  link records, and validate changes.
metadata:
  kind: procedure
---

# Workflow CLI

Read and maintain Workflow records using supported commands and artifact syntax.

## First step

Run from the project root, or add `--root DIR`:

```sh
workflow --help
```

Use command help for unfamiliar options. If project setup is authorized and records are missing,
run `workflow init` to create the directories and index. Initialization does not create work
records.

## Preferred route

Use commands for creation, short field edits, queries, and relationships.
Prefer `--json` when parsing results.
Edit files directly for structural and surgical prose changes, Plan objects, and Spec bodies.
Read existing content before replacing it. Preserve IDs, nesting, and unrelated work.
For artifact grammar, read [the syntax starter](syntax.md) or a valid existing artifact.
Do not invent schema fields.

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
Read Plans directly. Find Specs with `workflow list spec`; inspect their links with
`workflow refs @spec.Example`.

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

Inspect the current record before updating it. Status and assignee edits are not an atomic claim.
Mark done only after the work's required gates pass. Use the actual timestamp and authored comment.
Comments require both the timestamp and body. Repeated `labels` values replace the entire list.
Repeat other fields only when command help permits it.

`--file FIELD=PATH` replaces a whole supported field; paths resolve from the working directory.
Use `--file FIELD=-` with a quoted heredoc for stdin. Only one field can read stdin per command.
Do not weaken acceptance or remove detail to work around a refused edit.

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

Replace the example path; repeat formatting for each changed artifact. Review the diff.
Preserve formatter-produced continuation whitespace. Keep notes, tables, and resources in
supported text blocks.
For read-only work, use `workflow check` or `workflow format PATH --check`.
Skip write-mode formatting.
Validation checks artifact and graph integrity, not completion or execution readiness.

## Index, recovery, and transfer

- After moving a Spec or changing its ID directly, run `workflow index`, then `workflow check`.
- If invalid records block queries, inspect diagnostics and source files. Repair within write scope.
- After a refused write, inspect files before retrying; do not assume the edit persisted.
  If a valid field edit remains refused, edit the field directly, then format and check.
- Use `workflow export --output backup.json` for an artifact export.
  Preview import with `workflow import --dry-run < backup.json` before applying it.
  Preview cleanup and reference migration with `--dry-run` too.
