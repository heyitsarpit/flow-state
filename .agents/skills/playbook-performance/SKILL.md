---
name: playbook-performance
description: >-
  Make something faster or lighter against a named workload and budget: one measured improvement,
  or a hillclimb of repeated measured attempts toward a target. Use for "make X faster", a
  performance phase of an Epic, or sustained tuning toward a number.
metadata:
  kind: playbook
  uses: [to-task, performance, hillclimb, check-benchmark, execute-task, to-spec, reimagine-speed]
  applies:
    - principle-design-for-performance
    - principle-explain-measurements
    - principle-claim-only-what-you-checked
    - policy-testing
    - policy-records
    - policy-authority
    - policy-delegation
    - policy-verification
---

# Performance

This playbook makes something faster or lighter against a named workload and budget, and proves
the gain with checked measurements. It ends when the target is proved, the bounded pass is done,
or the budget runs out. Code stays uncommitted unless the user asked; publishing belongs to
`playbook-ship`.

You read the Plan's budgets, the Specs, the owning Task, and current measurements. You write
measurements, only the changes the user authorized, and Task evidence.

This page is an outline. Most steps name a skill that holds the actual method. Before such a step,
open that skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`) and
follow it, along with the principles and policies in its `metadata.applies`. A step run from this
outline alone misses most of what makes it work.

## Pick the mode

- **One improvement:** a single named slowness or resource problem. Measure, change one thing, and
  prove it helped.
- **Hillclimb:** repeated rounds toward a measurable target, such as latency, throughput, a score,
  or a pass rate.

If there is no target, propose one from the baseline. For an ambitious target, recommend
`playbook-reimagine` or `reimagine-speed` first.

## Steps

1. **Open the Task.** Before measuring anything, create or reuse the owning Task with `to-task`.
   Record the workload, the metric, the behavior to preserve, the budget, the stopping condition,
   and the acceptance. A target nobody has agreed yet is recorded as proposed.

2. **Take a baseline.** Capture a representative baseline and vet it with `check-benchmark`.
   Record the work actually done and any errors, not only the time, since a fast run that skipped
   work is not a baseline. Reuse an existing baseline only if its conditions match.

   For a hillclimb, settle the target now. Unless it is already agreed, show the user the checked
   baseline and your proposed target, and wait for agreement before the first change, so every
   attempt has a stable success condition.

3. **Find the cost and choose an attempt.** Run `performance` in measured mode to find what limits
   the result, and choose one attempt the evidence justifies. State the work it removes, the costs
   it adds, and its effects on correctness, freshness, and memory. If the attempt would change a
   guarantee in a consequential way, take it through `to-spec` before any work depends on it.

4. **Make the change.** Make the bounded change with `execute-task`. Do not stack changes you have
   not measured, because then nobody can say which one helped, and leave unrelated edits alone.

5. **Measure independently.** A checker who is not the author compares the complete path at the
   baseline and final revisions, under comparable conditions, with `check-benchmark`. The checker
   confirms that every promised result, ordering, and persisted state still holds and that nothing
   regressed. Keep a gain only when the evidence justifies it. Send product failures and missing
   tests back to the author, harness defects to whoever wrote the harness, and contract gaps back
   to step 3. Recheck each repaired revision.

6. **For a hillclimb, repeat.** Use `hillclimb` to run repeated attempts and record each result,
   reusing the checked baseline and harness from steps 2 and 5. The first attempt from steps 3 to 5
   is the ledger's first entry. After that, make one isolated attempt at a time, each measured
   against the accepted baseline. Rejected and inconclusive attempts never advance the baseline. A
   change to a guarantee goes back to the Spec before tuning that depends on it continues.

7. **Close.** Stop at the target, at the budget, when the user holds the work, or at a dead end you
   can demonstrate. Never quietly change the metric, and report an unmet target honestly. Save the
   attempt ledger in the Task before removing scratch files; if the work runs as a loop, append a
   note to its Epic.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Give the workload; the baseline and final numbers with units; the work completed; the correctness
results; the tradeoffs; for a hillclimb, how many attempts were kept, rejected, and inconclusive;
the revisions; the Task ledger; the evidence; and the gap that remains to the target.
