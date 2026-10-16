---
name: to-task
description: >-
  Turn a request or agreed Plan into Tasks with clear deliverables, acceptance, and dependencies.
  Use to break work into pieces that can be implemented and verified independently.
disable-model-invocation: true
metadata:
  kind: procedure
---

# To Task

Break the Plan into Tasks that each deliver a complete, verifiable result.
Show what each Task delivers, how to check it, and what must happen first.

## First step

Run from the project root, or pass `--root DIR`:

```sh
workflow --help
```

Read the request, relevant Plans, and existing Epics and Tasks before creating new work.
Inspect code where needed. Surface conflicting commitments before recording a new one.

## Preferred route

Use the CLI for creation, short field edits, and dependency links. Read command help for syntax.
Edit files directly for substantial prose. Use an existing valid Task as a format reference.

## Core workflow

1. **Split into complete results.** Make each Task a narrow path to working behavior.
   "Create a note and read it back" includes the storage, API, and UI needed to demonstrate it.
   Separate database, API, and UI Tasks leave that behavior unfinished until they come together.
   Split work that cannot be implemented and checked independently in one focused effort.

2. **Define completion.** Apply [design-for-verification](../design-for-verification/SKILL.md).
   State the observable result, important failure cases, and the check with its expected result.
   Include relevant conditions or resource targets; use existing Plan Verification targets where
   available.
   Assign missing checks or diagnostic tools alongside implementation work.
   A verification-tool Task must show reliable observations and detection of relevant failures.
   It may finish with product checks failing; product Tasks retain those correctness obligations.
   Name what this slice establishes and which integrated obligations remain for later Tasks.
   Name permitted write paths and evidence locations so each Task can be executed independently.
   Add ordered work steps where settled, pairing behavior changes with checks.

3. **Connect prerequisites.** Add blockers only when another Task must finish first; explain why.
   Parent grouping and list order do not create dependencies.
   Note shared-interface or resource conflicts that prevent parallel work.

4. **Review the breakdown.** Show a numbered list with each Task's deliverable, acceptance, and
   blockers. Check scope, acceptance, and dependencies; repair gaps before recording.
   Check every in-scope Plan outcome has a Task's `satisfies` reference or an explicit deferral.
   Assign every required Plan Verification check to work; retain explicit deferrals as unverified
   obligations.
   Task creation needs no user approval. Ask only about unresolved consequential choices.

5. **Record and validate.** Save the Tasks using the fields below, then run:
   Replace `PATH` with an actual changed artifact path; repeat formatting for each changed artifact.

   ```sh
   workflow format PATH --write
   workflow check
   workflow next
   ```

   Inspect the diff. For unexplained readiness, use `workflow show @task.Epic.Task --why`.
   An open Task, an active Epic, and satisfied blockers are required for graph readiness.
   Before execution, also resolve applicable contract gaps and approval gates.
   Successful validation alone does not establish execution readiness.

## What belongs in a Task

| Field                  | Content                                                              |
|------------------------|----------------------------------------------------------------------|
| `description`          | Deliverable, scope, settled work steps, and prerequisite rationale.  |
| `acceptance`           | Observable completion criteria and required checks.                  |
| `derives_from`         | Plan Decisions, Constraints, Questions, or Verification targets.        |
| `satisfies`            | References to Plan outcomes delivered by the Task.                   |
| `blocked_by`, `parent` | Prerequisite Tasks, and grouping within the same Epic, respectively. |

Work steps describe actions; acceptance defines done. Keep them separate.
Write short, concrete descriptions using the project's names.
Reference the Plan instead of copying it.

## Rules

- Reuse existing work, Epic and phase organization, and stable IDs. Preserve unrelated content.
- Keep unresolved choices visible and affected Tasks draft. Module Specs can follow Task drafting;
  do not invent implementation details to complete a Task description.
- For migrations, preserve the agreed compatibility and verification boundary when choosing slices.
- Use supported fields and references. Do not invent schema fields or relationships.

## Result

Return saved Task paths, ready work, unresolved questions, and validation results.
Recommend the next useful action and stop.
