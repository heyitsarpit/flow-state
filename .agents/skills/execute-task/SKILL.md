---
name: execute-task
description: >-
  Implement one ready workflow Task, or an authorized set, as mergeable code with its own checks:
  features, behavior-preserving refactors, integration changes, and repairs. Keeps repairing and
  rechecking within the authorized scope. Independent acceptance is check-task's job.
metadata:
  kind: procedure
  applies:
    - policy-code-composition
    - policy-code-correctness
    - policy-testing
    - policy-records
    - policy-authority
    - principle-fix-root-causes
    - principle-claim-only-what-you-checked
---

# Execute Task

This skill takes a ready Task and turns it into working, mergeable code: implemented, tested,
linted, and recorded. You check your own work as you go, but your checks are not the Task's
acceptance: when the Task requires independent acceptance, that is a separate step through
`check-task`.

## Before you start

Find the Task the request refers to and read what it promises: its acceptance, the Plan Verification
targets behind it, and the Spec Requirements and Invariants it must keep. Then check that it is
really ready. Its blockers are done, and the actual Git base and uncommitted changes match what the
Task assumes. Resolve the prerequisites you are authorized to resolve, and account for existing
uncommitted work before you start. A Task that matches by name is not ready if a prerequisite is
still missing. When existing changes overlap your write paths, work out who owns them and whether
they are compatible. Report blockers and conflicting state you cannot resolve instead of working
around them, and leave unrelated work alone.

If no Task matches, say what is missing; never pick up a different ready Task instead. Use
`change-impact` when boundaries or pivotal facts are unclear. Before building against existing
verification suites, run the survey before adding: confirm from their coverage records that they
still cover the change and still match the code (skill:policy-verification#maintain); report a
suite that does not, instead of building on its verdict.

When the impact assessment shows a low-impact change with unchanged contracts and settled
assumptions, reuse the existing design and start. Otherwise raise behavioral gaps before touching
the affected code, and never quietly change an agreed guarantee. Use `to-design` when the
implementation shape needs deciding. Take conflicts about the objective to the user, and carry on
with the parts they do not affect.

## Steps

1. **Build in small, complete slices.** Get a walking skeleton (one narrow path, end to end)
   working early, and check it against the acceptance criteria before you widen it. Work against
   the Task, the current contracts, any reproduction or cause findings, the allowed write paths,
   and the exact base. Update the code that consumes your change, within scope. When several agents
   work at once, one of them owns each shared file, record, or Git operation, so writes never
   collide.

2. **For a behavior-preserving refactor,** capture a baseline of current behavior first, or reuse
   one, and check it after each move. Type checks alone do not prove behavior was kept.

3. **For an internal API replacement,** list every caller, migrate them all, and remove the old
   path inside the migration's boundary. Keep external compatibility. A temporary adapter needs a
   condition for its removal, and that cleanup belongs in the acceptance. Declare which intermediate
   failures are permitted while callers migrate, so they are not mistaken for regressions, and
   require the final static and runtime checks to pass once the migration is complete.

4. **For a repair,** fix the demonstrated cause where it lives. Use `diagnose` only when the cause
   is still unknown, and reuse a reproduction that already exists. If two fixes built on the same
   assumption have failed, question the assumption before trying a third.

5. **Write the missing tests.** If assigned behavior tests are still missing, write them as part of
   the work: repeatable, and through the public interfaces real consumers use. Run the assigned
   checks on the final code. A successful build does not prove the behavior.

6. **Lint and format.** Read the configured commands from `setup-workflow`'s tools record. Run the
   formatter (if the configured command only checks, run the formatter's write mode or apply the
   changes it reports, then read the diff), then lint,
   and fix every error and warning within your write scope. Run both again after repairs. Passing
   means the formatter succeeds and lint shows zero errors and zero warnings; read the output, not
   just the exit code. Never suppress a diagnostic or weaken a rule; a hidden warning becomes the
   next regression. Report failures outside your
   scope. If no commands are recorded, report lint and formatting as blocked.

7. **Repair what the checks find.** When acceptance checking returns findings, fix product defects
   and missing assigned tests yourself, but raise contract gaps and objective conflicts instead of
   working around them. Keep the acceptance as it is. If a defect slipped past existing checks,
   strengthen those checks before trusting them again (skill:policy-verification). Rerun the
   affected checks after every repair:
   a changed patch, base, or dependency invalidates the results it touched, so the final verdicts
   must come from the final code.

8. **Record it.** Put findings, the revision, commands, conditions, verdicts, and status in the
   Task's supported fields. If a Plan procedure your change affects is now out of date, update it
   through `to-plan` when it is within your scope; otherwise report the edit needed and where. For
   each changed record, run `workflow format PATH --write` with its real path, then
   `workflow check`, and read the diff.

Mark the Task done only when every gate it requires has passed, including any independent
acceptance, review, or integration it names. Until then, completion stays pending.

## What to return

The patch and its revision, the commands you ran and their results, the conditions, the acceptance
you checked, where the records are, the defects found, and anything blocked or not run. Keep going
through repairs, review, integration, and verification within the authorized scope without asking
each time. Stop when the work is complete, a time, attempt, or resource limit in the assignment runs
out, the user says hold, or a real decision needs the user.
