---
name: principle-design-for-verification
description: >-
  Decide how you will know something works before you build it: turn every goal and material
  claim into a target that evidence can settle. Apply when setting outcomes, designing behavior or
  skills, or preparing optimization, from early planning onward.
metadata:
  kind: principle
---

# Design for Verification

Before you build something, decide how you will know it works. Turn every material claim into a
target that evidence can settle, and design the checks and diagnostics that will produce that
evidence before the substantial implementation starts. Start as soon as the goal and the initial
direction are clear, including when you take over an existing plan.

**Why:** An explicit target removes ambiguity and lets every change be compared against the same
expected outcome. Without one, "done" means "it looks right", and nobody can tell a working system
from a lucky demo.

The pieces fit together like this. The goal names the intent; outcomes say what must work; decisions
record the chosen approach. Correctness targets state the conditions that must hold: Plan
Verification targets (the `verification` entries in the project's Plan) for the system's outcomes,
and Spec Invariants (in each module's Spec) for that module's Requirements. Tests and other checks
are the evidence for those targets.

## While designing

1. **Define the target.** Turn each goal into observable outcomes, invariants, failure conditions,
   and the resource budgets that matter. Define the pass conditions before implementation, with
   concrete inputs and expected results worked out independently of the code. Include the failures
   that matter and the state that must stay unchanged. Judge each result against the target as a
   success (meets it), a failure (misses it), or inconclusive (the evidence cannot decide).
   Separately, flag any regression: something that used to pass and now fails or got worse. A result
   with a regression is never a success, even when the target is met.

2. **Define the observation.** Choose representative workloads, environments, instruments, and a
   repeatable way to observe. Check the behavior you claim, not a convenient stand-in for it. Tie
   each piece of evidence to the revision and conditions it came from, and say which changes would
   invalidate it.

3. **Make failure explainable.** Expose the state and events you would need to tell causes apart.
   Use reproducible inputs, bounded replay, traces, or profiles where the risk justifies them. A
   test can tell you something failed without telling you why. Missing checks and diagnostic tools
   are work to build, not gaps to accept.

4. **Keep judgment calls visible.** Where a human has to judge the result, define the evidence and
   the criteria they will judge by. Do not invent a number to stand in for that judgment, and keep
   unresolved judgments visible.

## Checking the whole

Ask one question of every set of checks: could the agreed behavior still be wrong while every check
passes? Close that gap, or expose it. Judge the assembled result against every required target for
the agreed scope and conditions, and accept only what the evidence covers. Limited coverage limits
the claim you can make; it never lowers the agreed guarantee.

Choose checks that match the claim and the cost of being wrong, and reuse instruments that are still
valid. Keep them representative, and maintain them as the behavior changes. When conditions or goals
change, revisit the target and the evidence before relying on any comparison.

## For skills

When you write or change a skill, define realistic requests, observable success and failure cases,
and the diagnostic evidence that would explain a failure, before drafting. Valid Markdown does not
prove that agents will behave as intended.

Running checks against a live system (setup, driving it, and cleanup) and auditing run recipes is
`check-runtime`'s job; this principle decides what those checks must show.
