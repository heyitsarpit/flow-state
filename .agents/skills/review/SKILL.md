---
name: review
description: >-
  Independently review a change against what was agreed and against the project's documented
  standards, and return evidenced findings with a verdict for that exact revision. Use for a
  branch, a diff, or work in progress. Review judges; it does not fix or merge.
metadata:
  kind: procedure
  applies:
    - policy-records
    - policy-testing
    - principle-claim-only-what-you-checked
    - policy-code-composition
    - policy-code-correctness
---

# Review

Check a change against its agreed intent and the project's documented standards, confirm every
finding against the real code, and end with a verdict for the exact revision you saw. Review the
integrated result, the code as it will actually merge, not the workers' own reports about it.
It stays read-only throughout. Reviewers can write temporary output for isolated checks, but never
edit source or workflow records.

Finding nothing is a fine outcome. A clean review is not permission to merge.

## Who reviews

Reviewers work independently of the author and of each other. Use the harness's delegation tools and
the configured models. Give every reviewer the same packet, the same method, and the same rubric:
the two lenses below. For consequential changes, use different models where available, but do not
invent a model roster that does not exist. Run reviewers in parallel or one after another, as the
assignment says. One reviewer acts as the lead: it merges and judges the findings in step 4. If a
required independent review cannot happen, the verdict is **blocked**. For consequential specialist
questions, assign focused coverage with [the lens guide](references/specialist-lenses.md), keeping
the same packet and one lead.

## Steps

1. **Set the review target.** Settle the comparison base and the target revision. For work
   in progress, include staged, unstaged, and relevant untracked changes, and capture that snapshot
   so later edits are distinguishable. Use the base you were given or the one the repository
   establishes; ask when it is materially unclear.

2. **Gather the intent.** State what the change is meant to do, from the request, the Plan, the
   Task's acceptance, and the Spec's guarantees, and read the actual code alongside them. A missing
   Spec limits what you can say about contracts; do not write one just to review. If requirements
   conflict, surface it instead of picking a side. Build the packet: the diff, the surrounding code
   that matters, existing impact findings, checks with their conditions, and the documented
   standards. Keep discovery to what bears on consequential claims. Keep two kinds of limit apart:
   the assignment's write limits govern what you, the reviewer, may edit; the project's standards
   govern the code under review.

3. **Review through both lenses.** Each reviewer reads the packet and returns findings separately
   for each lens:
   - **Intent and contracts.** Missing or partial outcomes, broken invariants, unintended behavior,
     integration failures, and acceptance claims the evidence does not support. Follow real
     consumers beyond the diff.
   - **Project standards.** Cite the documented rule and the code that violates it. Separate hard
     violations from design judgment; a preferred style or an invented convention is not a
     violation.

   Trace the execution path behind a suspected bug. Look at root causes, state and resource
   lifetimes, shared protocols, failure behavior, and security where they matter; a small change
   does not need every one of these specialist angles, but both lenses always apply. A structural
   concern needs a concrete consequence, not "I would do it differently". Judge whether the checks
   exercise the claimed boundary at this revision and whether their failures can be reproduced and
   explained; passing checks say nothing about guarantees they never test. Reuse impact evidence
   that exists, and run `change-impact` only for consequential downstream questions still open.

   Each finding names:
   - its lens and the code location;
   - the requirement or rule it breaks;
   - the conditions that trigger it and its consequence;
   - the evidence.

   Keep demonstrated defects apart from unverified
   risks, and suggest a bounded repair only when the evidence supports one. No praise, generic
   advice, or findings forced to fill space.

4. **Assess the findings.** The lead reads the packet and every finding, merges duplicates within
   each lens, and keeps both labels when one issue affects both lenses. Investigate lone findings
   and disagreements against the sources, and against real execution where that helps; votes are not
   proof, and a credible defect does not need a second reviewer to count. Sort each finding as **Act
   on** (concrete defects, binding-rule violations, evidence missing for acceptance), **Consider**
   (evidenced tradeoffs), or **Dismissed** (preferences, impossible paths, claims the actual context
   contradicts), with the reason. Never dismiss a defect only because it existed before, if this
   change exposes it or relies on it. When findings touch recorded commitments or require
   reconciling evidence, cite the Plan object, Spec contract, or Task acceptance and state the
   implication (`policy-records`).

## What to return

The target and its intent, which reviewers covered each lens, and the findings under **Intent and
contracts** and **Project standards**, keeping each lens's conclusion visible: passing one does not
cancel failing the other. Include material dismissals, unresolved disagreements, the checks run, and
the gaps in evidence. Then a verdict for this snapshot: **changes required**, **no blocking
findings**, **inconclusive** when the evidence cannot settle acceptance, or **blocked** when a
required independent review could not run.

Recommend the next step for repairs and contract gaps. Conflicts about the objective go to the user,
because only the user decides what the change is for. After repairs, review the changed snapshot and
treat affected evidence as stale. Learning from the review and merging happen elsewhere.
