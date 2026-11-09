---
name: playbook-build
description: >-
  Build ready Tasks: implement, self-check, run independent acceptance and review, repair, and
  record evidence. Handles one Task, a set in dependency order, parallel slices, refactors, visual
  parity, and long "keep working" runs. Stops at checked, uncommitted code unless delivery was
  requested. Use for "execute T3", "build the ready Tasks", or "keep going until done".
metadata:
  kind: playbook
  uses: [execute-task, check-task, review, check-runtime, diagnose, change-impact, to-task, to-spec]
  applies:
    - principle-claim-only-what-you-checked
    - principle-fix-root-causes
    - policy-code-composition
    - policy-code-correctness
    - policy-testing
    - policy-records
    - policy-authority
    - policy-verification
    - policy-delegation
---

# Build

This playbook turns ready Tasks into working code that someone other than its author has checked.
It ends when every authorized Task passes its required gates at the final revision, or when a
limit, a blocker, or a decision for the user stops the work. Code stays uncommitted unless the user
asked for commits; publishing and landing belong to `playbook-ship`.

You read the ready Tasks, the Plan Verification targets they cover, their Specs, and the
repository state. You write code inside each Task's write scope, Task evidence, and
notes on the work's Epic, if it runs as a loop (skill:to-loop).

Every code change needs a ready Task that owns it, because the Task is where its acceptance and
evidence live. If there is none, go back to `playbook-plan`, or for a small and clear change, draft
one with `to-task`.

This page is an outline. Most steps name a skill that holds the actual method. Before such a step,
open that skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`) and
follow it, along with the principles and policies in its `metadata.applies`. A step run from this
outline alone misses most of what makes it work.

## Steps

1. **Confirm readiness.** Check each Task against its Specs, its Plan Verification targets, its
   blockers, and the actual Git state. Valid records and a plausible design are not evidence that
   anything works. Resolve a missing contract through `to-spec`, or report it, and refine the
   affected Tasks after any change. Survey the existing verification suites the Tasks will be built
   against (skill:policy-verification#maintain): a suite that no longer covers the change, or whose
   record predates a change to the code it checks, is extended and proven again first.

2. **Build a walking skeleton first.** Before building broadly, make one narrow path work end to
   end for a real consumer, so that a wrong assumption surfaces while it is cheap to fix. This is
   the first slice of real work, meant to grow, not a separate prototype. Take it from the first
   ready Task in dependency order that delivers consumer behavior (Tasks that only build
   verification tools come before it but do not count as the path). Run `execute-task` for just
   that path, and accept it with `check-runtime` on the real interface. If current evidence already
   shows a complete path working, reuse it and skip ahead.

3. **Implement.** Run `execute-task` for each Task: the implementation, its tests, lint, and the
   author's own checks. Keep tightly coupled work with one author. Run independent ready Tasks in
   parallel only when their write scopes separate cleanly, per
   skill:policy-delegation#parallel-slices.

4. **Check acceptance independently,** in proportion to what is at stake. Run `check-task` in a
   fresh context, never by the author, against the actual patch and its evidence. Where
   complete-path evidence on the real interface is missing, get it with `check-runtime`. Run
   `review` when the Task or the user calls for an independent review.

5. **Repair.** Send product failures back to the author, contract or design gaps to the Spec's
   owner, and failures with an unclear cause to `diagnose`. After a repair, rerun the checks whose
   results the change could invalidate. Release dependent Tasks only once their prerequisites pass
   at the current revision.

6. **Assemble and verify.** When several Tasks combine, check the assembled revision against every
   required verification target in the authorized scope. A required target that was deferred,
   failed, blocked, or never exercised rules out a completion verdict.

7. **Record.** Store verdicts and evidence in the Tasks. Mark a Task done only after its required
   gates pass at the final revision; if the work runs as a loop, append a note to its Epic.

If you delegate a step, apply skill:policy-delegation and hand over the installed skill paths,
not the names. Product questions go to the user; technical findings go back to the agents that
wrote the code, to repair.

## Kinds of build work

| Situation                                                | Also read                                    |
|----------------------------------------------------------|----------------------------------------------|
| Change structure, keep behavior                          | [refactoring](references/refactoring.md)     |
| Match an agreed appearance                               | [visual parity](references/visual-parity.md) |
| "Keep working until done", many Tasks, or a long program | [long runs](references/long-runs.md)         |

## What to return

Say what now works for the user and why you chose this approach. Then give the Task paths, the
revision, the verdict for each gate, where the evidence lives, the gates still open, and the next
boundary the user must authorize. Recommend `playbook-ship` if the user wants the work published.
