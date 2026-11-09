---
name: playbook-specify
description: >-
  Write module Specs for planned work: ground in current code, record Requirements, Invariants,
  and test obligations, explore implementation shape to test feasibility, reconcile the two, and
  get an independent Spec check. Stops before code. Use after a Plan and Tasks exist, or to design
  a module when both its requirements and its implementation shape are wanted.
metadata:
  kind: playbook
  uses: [change-impact, to-spec, to-design, performance, prototype, check-spec, to-task]
  applies:
    - principle-design-for-verification
    - principle-design-for-performance
    - policy-code-correctness
    - policy-code-composition
    - policy-testing
    - policy-records
    - policy-authority
    - policy-delegation
    - policy-verification
---

# Specify

This playbook writes the contracts that planned work will be built against: module Specs with
their Requirements, Invariants, and test obligations, checked by someone other than their author,
and Tasks refined to match. It stops before any code is written.

Aim for exhaustive Invariants. A good Invariant rules out a whole family of bugs at once, which is
far cheaper than finding those bugs one at a time after the code exists. For the same reason, the
independent check should actively try to show the contract is incomplete, not confirm that it
reads well.

You read the approved Plan, the drafted Tasks, existing Specs, and the current code. You write
module Specs, refined Tasks, and notes on the work's Epic, if it runs as a loop.

This page is an outline. Most steps name a skill that holds the actual method. Before such a step,
open that skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`) and
follow it, along with the principles and policies in its `metadata.applies`. A step run from this
outline alone misses most of what makes it work.

## Steps

1. **Ground in the code.** Run `change-impact` to find the current callers, existing contracts,
   reusable code, affected owners, and compatibility constraints. Reuse findings that are still
   current.

2. **Specify behavior.** Run `to-spec` to record Requirements, Invariants, and test obligations
   from the agreed intent. Keep unresolved choices visible as open questions. You need enough
   behavior to guide design, not a finished contract: do not invent implementation choices to fill
   gaps. If the contract currently lives in exploration notes, move it into the Spec; the notes
   remain as supporting material.

3. **Explore the implementation.** When the shape of the implementation matters, run `to-design`
   against that Spec snapshot. Exploring representations, algorithms, and enforcement is how you
   find out whether the contract can actually be met. When a workload or budget shapes the choice,
   run `performance` in modeled mode; when only an experiment can settle a question, offer a
   `prototype`. Write design notes only when they help, and keep proposals separate from binding
   obligations. A complete Spec does not need code or internal representations. If the user asked
   for an implementation design, though, it must cover state ownership, the algorithm with its
   failure paths, and how the parts compose; a Spec without them does not answer that request.

4. **Reconcile behavior and design.** Exploration often shows that a guarantee is unclear or cannot
   be met. Use `to-spec` to clarify it, or to propose a change the user can decide on, keeping the
   agreed intent and approval gates intact. After any contract change, revisit the affected design.
   Repeat until behavior and design agree, or an open decision blocks the work. For a large
   behavioral change, recommend whether the user should approve the Spec before implementation.

5. **Check independently.** Run `check-spec` in a fresh context, never by the Spec's author, since
   an author reads what they meant rather than what they wrote. Send each finding back to the step
   that owns it, and recheck the affected sections after the repair.

6. **Refine the Tasks.** Run `to-task` to align each Task's acceptance and readiness with the
   checked Specs. A Task that touches an unresolved contract stays draft.

7. **Record progress.** If the work runs as a loop, append a note to its Epic with the Spec paths
   once `check-spec` returns PASS for
   the contract, and PASS or NOT APPLICABLE for the design. Any ISSUES or BLOCKED verdict, including
   one on the design alone, leaves the step open; note what blocks it.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Give the Spec paths and the snapshot they describe, the behavioral and design verdicts, each
Task's readiness, the obligations still unresolved, and the validation output. Say plainly that a
valid Spec or a passing design review is not evidence the product works. Recommend
`playbook-build` for the ready Tasks, and stop there without starting it.
