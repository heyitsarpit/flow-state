---
name: playbook-plan
description: >-
  Plan a feature or project: interview the user, record outcomes, decisions with their reasons,
  and verification targets in the Plan (the project's ADR), offer prototypes for unsettled
  choices, and break the approved Plan into Tasks. Stops before Specs and code.
  Use for "plan X", a new feature, or an idea that needs shaping.
metadata:
  kind: playbook
  uses: [interview, to-plan, prototype, to-task, change-impact]
  applies:
    - principle-design-for-verification
    - principle-design-for-performance
    - policy-records
    - policy-authority
    - policy-delegation
---

# Plan

This playbook turns an idea into a Plan the user has approved and a set of drafted Tasks. The Plan
is the project's Architecture Decision Record (`policy-records`): it keeps every decision with its
reason and consequences for the life of the project, so a reader months later can tell what was
chosen and why. Nothing here writes Specs or code; planning stops once the work is broken down.

You read the request, existing Plans, Tasks, and Specs, and the code where it matters. You write
the Plan, its drafted Tasks, and notes on the work's Epic, if one already exists.

This page is an outline. Most steps name a skill that holds the actual method. Before such a step,
open that skill's `SKILL.md` in the folder beside this one (`<skills-root>/NAME/SKILL.md`) and
follow it, along with the principles and policies in its `metadata.applies`. A step run from this
outline alone misses most of what makes it work.

Not everything needs a Plan. A mechanical, bounded change has nothing to decide; say so, and
recommend `playbook-build` with a single Task instead.

## Steps

1. **Settle intent.** Run `interview` for the outcomes, constraints, and product choices that are
   still open. Reuse what the records or the conversation already settled, and look up facts you
   can discover with `change-impact` rather than asking the user for them.

2. **Record the Plan.** Run `to-plan`. Each decision becomes an ADR entry: the choice, its reason,
   its consequences, and the alternatives rejected. Record only what the user decided; a proposal
   stays a question until they decide it. Give every in-scope outcome Verification targets, each
   with a scenario and a pass condition. When an outcome is performance-sensitive, its workload and
   budget are Verification targets too, so the budget is checked rather than hoped for.

3. **Offer prototypes for choices a run can settle.** Some open choices are empirical: two candidate
   behaviors or approaches where observing them would decide the matter. Offer a `prototype` with
   the question it answers, a time estimate, and your recommendation, and build it only if the user
   takes the offer. Reuse settled direction and earlier prototype evidence that still holds; do not
   rerun an experiment whose answer is still valid. Run every candidate through the same recipe,
   with the same inputs and conditions, so the comparison is fair. If the constraints change
   afterwards, recheck only the affected observations with the smallest probe the budget allows, and
   keep the failed evidence. Ask the user about product preferences, not about facts a run can
   establish. Record results that change the Plan through `to-plan`.

4. **Get the Plan approved.** Present it and wait for approval before drafting Tasks. Approval of
   content that has not changed still stands; do not ask twice.

5. **Draft Tasks.** Run `to-task` on the approved Plan. Split Tasks around complete consumer
   behavior rather than architectural layers, so each one demonstrates a usable result when it is
   checked. Each Task names its acceptance, write scope, where its evidence goes, and only its real
   blockers. Assign each required Verification target to a Task, or record in the Plan why it is
   deferred, so no target silently drops out. When a target needs a verification tool that does not
   exist yet, building it is a Task as well. Drafting Tasks needs no approval. If the user also
   asked for module contracts, recommend `playbook-specify` before the Tasks are refined.

6. **Record progress.** If the work runs as a loop, append a note to its Epic with the Plan's
   path. Otherwise, for work that needs more than this playbook, recommend skill:to-epic next: it
   writes the Epic from this Plan and orders the rest (usually Specify, Build, a performance pass
   when the Plan has budgets, and Ship), and skill:to-loop then writes the loop.

If you delegate a step, apply skill:policy-delegation and hand over the installed
skill paths, not the names.

## What to return

Give the paths of the Plan and its Tasks (and the Epic, if one exists); the open questions and
the gates
still waiting on the user; any prototype results; and the validation output. Recommend the next
step, and stop there without starting it: skill:to-epic when the work needs more than one
playbook or a long run (the Epic, then skill:to-loop for the loop), otherwise usually
`playbook-specify`.
