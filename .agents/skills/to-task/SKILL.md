---
name: to-task
description: >-
  Turn an approved Plan or a clear request into Tasks: each one a complete, checkable piece of
  work with its acceptance criteria, its real prerequisites, and where its evidence goes. Use to
  break work into pieces that can be built and verified one at a time.
metadata:
  kind: procedure
  applies:
    - policy-writing
    - principle-design-for-verification
---

# To Task

A Task is one piece of work someone can pick up, finish, and prove done once its listed
prerequisites are finished. This skill turns a Plan (or a small, clear request) into those pieces:
what each delivers, how to check it, and what has to happen first. It does not write code and it
does not decide product questions; it records the work so the next person can start.

## Before you start

Work from the project root (or pass `--root DIR`). Start with `workflow --help`, and use the help
for a specific command whenever its syntax is unfamiliar. Then read the request, the relevant Plans,
and the Epics and Tasks that already exist. You are adding to an existing picture, so reuse what is
there, and look at the code where it affects how the work splits. If the new work conflicts with
something already recorded, say so before writing anything.

Use the CLI to create Tasks, make short field edits, and link dependencies. For longer prose, edit
the file directly, using an existing Task as your format reference.

## Steps

1. **Split by complete behavior.** Each Task should end with something that works, not with one
   layer of it. "Create a note and read it back" includes the storage, the API, and the screen
   needed to show it working. Separate database, API, and UI Tasks would each be "done" while the
   feature still does not work. Split further only when a piece can be built and checked on its
   own in one focused effort.

2. **Say what done means**, following `principle-design-for-verification`. For each Task, write the
   observable result, the failure cases that matter, the check that proves it with the result you
   expect, and any conditions or resource targets (time, memory, data size) the result depends on.
   Use the Plan's Verification targets where they exist. If the check or a diagnostic tool does not
   exist yet, building it is work too: give it a Task, or put it in the same Task. A Task that only
   builds a verification tool is done when the tool gives reliable observations and detects the
   failures it is meant to catch, even if the product still fails it; product Tasks must still pass
   those checks. In the `description`, state what this Task proves, what later Tasks still owe,
   which files it may change, and where its evidence goes. Where the steps are already settled, list
   them, each change paired with its check.

3. **Add only real blockers.** Add a `blocked_by` link only when another Task truly has to finish
   first, and say why in the description. Being in the same group, or coming later in the list,
   is not a dependency. If two Tasks would fight over the same interface or resource, note it in
   both descriptions so nobody runs them in parallel.

4. **Review the breakdown before you save it.** Show a numbered list: each Task's deliverable, its
   acceptance, and its blockers. Fix gaps now. Then check coverage: every in-scope Plan outcome is
   `satisfies`-linked from some Task or explicitly deferred, and every required Verification
   target is assigned to a Task or explicitly deferred. Write each deferral into
   the affected Task's or Epic's description; it stays visible as unverified work. You do not need
   the user's approval to create Tasks; ask only about choices that would change what the Tasks are.

5. **Save and validate.** Save the Tasks with the fields below. For each file you changed, run
   `workflow format PATH --write` with its real path, then `workflow check` and `workflow next`, and
   read the diff. If a Task you expected to be ready is not, or the reverse,
   `workflow show @task.Epic.Task --why` explains why.

## What goes in a Task

| Field | Holds |
|---|---|
| `description` | The deliverable, its scope, settled steps, and why any blocker exists |
| `acceptance` | The acceptance criteria: the observable result and the checks that prove it |
| `derives_from` | The Plan decisions, constraints, questions, or Verification targets behind it |
| `satisfies` | The Plan outcomes it delivers |
| `blocked_by`, `parent` | Tasks that must finish first, and its group within the Epic |

Steps say what to do; acceptance says when it is done. Keep them apart. Write descriptions under
`policy-writing`: short, concrete, in the project's own names, pointing to the Plan instead of
copying it.

### The five-line block

In an Epic written by skill:to-epic, label each Task with its phase's class and kind labels (a
non-verifiable Task has no kind label), and end its description with this block, after a blank
line:

```text
False pass: <how it could pass on the wrong thing> → caught by <the check>.
Gates: <the gates it relies on, the mutants each kills, where the mutants live>.
Budget: <iterations, time or usage>.
Stops: <only what can't go on without the user, or "none">.
User's read: <decisions pending the user's read, or "none">.
```

A false pass is a check that passes on wrong behavior; mutants and the other terms are defined in
skill:to-epic#terms.

## Example

```text
    T3
        title        Rules can be listed by tag with rulesByTag
        status       open
        priority     medium
        derives_from @plan.RuleTags.{D1,D2}
        satisfies    [@plan.RuleTags.O1]
        blocked_by   [@task.RuleTags.T2]
        description
            Export rulesByTag(tag) from src/index.ts, reading tags from each rule's meta.
            Blocked by T2, which adds the meta.tags field this reads.
            Proves: listing by one tag. Later: CLI listing (deferred in the Plan).
            May change: src/index.ts, test/tags.test.ts. Evidence: this Task's comments.
        acceptance
            rulesByTag("effect") returns exactly the rules whose meta lists "effect".
            Check: node --test test/tags.test.ts passes, including an unknown tag returning [].
```

## Watch out for

- **Layer Tasks.** Splitting by file or layer feels tidy but leaves nothing working until the last
  one lands.
- **Inventing details.** If a choice is still open, leave the Task in draft and the question
  visible. Module Specs can come after Tasks; do not make up implementation to fill a description.
- **Trusting a green check.** `workflow check` and `workflow next` validate structure and graph
  readiness: an open Task, an active Epic, finished blockers. They do not mean the Task is ready
  to build. Open contract questions and approval gates still have to be resolved first.
- **Breaking existing structure.** Reuse existing Epics, phases, and IDs, and leave unrelated
  content alone. Use only supported fields and relationships. For a migration, keep the agreed
  compatibility and verification boundary when you choose the slices.

## What to return

The saved Task paths, which Tasks are ready, the open questions, and the validation results.
Recommend the next step, usually `playbook-specify` or `playbook-build`, and stop.
