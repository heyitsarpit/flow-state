---
name: principle-fix-root-causes
description: >-
  Trace a reproduced symptom to its demonstrated failure mechanism before choosing a repair, and
  question the shared premise when two fixes fail the same check. Apply when debugging crashes,
  regressions, restart failures, recurring workarounds, or repeated failed fixes.
metadata:
  kind: principle
  applies: [policy-records, policy-testing]
---

# Fix Root Causes

When debugging, trace the problem to its demonstrated failure mechanism. For an authorized repair,
fix that cause where it lives: in the component that owns the failing state or transition, or at the
boundary that should have enforced the requirement.

**Why:** Symptom fixes accumulate. Each workaround makes the system harder to reason about, and
the real bug remains. Root-cause fixes can cost more upfront but reduce total debugging work.

## Pattern

- **Reproduce first.** Keep the inputs, conditions, and observed failure.
- **Ask "why" until evidence connects** the symptom to the failing owner, transition, or boundary.
  Distinguish an observed mechanism from a hypothesis; a plausible story is not confirmation.
- **Do not add guards merely to silence a crash.** Validation that enforces a real boundary or
  invariant may be the correct repair; prove why it belongs there.
- **A long workaround explanation is a signal to investigate,** not proof that the code or comment
  is wrong. Preserve documented compatibility and operational constraints.
- **Check for the pattern, not just the instance.** Search related paths. Repair within agreed
  scope and record other affected paths, with their evidence, as follow-up work rather than silently
  expanding the task.
- **When stuck, instrument.** Read the actual error and observe the relevant state; do not guess.
- **When something fails after a restart, suspect persistent state before code:** configuration,
  caches, lock files, serialized values. Never delete the user's state or treat a reset alone as
  proof of the cause.

## Question the premise

When two or more fixes that share one premise fail the same check, suspect the premise, not just
the fixes. Each failure under a shared premise is evidence about that premise.

- **Write the premise down:** the one sentence every failed fix assumed, and the check that still
  fails. Keep the attempts and their evidence.
- **Get a discriminating observation before the next fix:** one whose result separates the
  competing causes. Do not start another fix under the same premise until you have it. If the
  observation is blocked, report what is needed.
- **Keep the next experiment bounded** in scope and resources. If evidence changes the objective or
  an agreed constraint, return that decision to the user rather than silently relaxing the check.

Questioning a premise challenges a fact the design assumes; it does not require rebuilding the whole
design, and failure alone does not authorize a reversal. State the premise's source, the failed
attempts, the discriminating observation, and the proposed implication. When the premise is recorded
intent (a Plan decision, Spec guarantee, or Task approach), keep the failed attempts and
discriminating evidence in the Task while proposing a change. An unrecorded hypothesis is not an
agreed commitment. `diagnose` holds techniques for choosing discriminating observations, including a
per-worker census for uneven load or failures.

## Record and verify

Check whether the demonstrated cause violates a Plan decision, Spec guarantee, or Task commitment,
and keep the reproduction and causal evidence in the Task. Report the reproduction, demonstrated
cause, affected guarantee, and proposed repair. Use regression evidence that meets `policy-testing`.
For a missing guarantee, propose the property that prevents the failure family and who would enforce
it; proposing it does not establish an agreed contract. Preserve the causal evidence and its limits
even when the repair needs no Spec change.
