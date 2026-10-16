---
name: fix-root-causes
description: >-
  Trace a reproduced symptom to its failure mechanism before choosing a repair.
  Apply when debugging crashes, regressions, restart failures, or recurring workarounds;
  verify the bounded repair rather than merely suppressing the symptom.
disable-model-invocation: true
metadata:
  kind: principle
---

# Fix Root Causes

When debugging, trace the problem to its demonstrated failure mechanism.
For an authorized repair, fix that cause at its responsible owner or boundary.
For material diagnosis findings, apply
[keep-intent-aligned](../keep-intent-aligned/SKILL.md): compare the cause with recorded commitments
and keep reproduction and causal evidence in the Task.

**Why:** Symptom fixes accumulate. Each workaround makes the system harder to reason about,
and the real bug remains. Root-cause fixes can cost more upfront but reduce total debugging work.

**Pattern:**

- Reproduce first. Keep the inputs, conditions, and observed failure.
- Ask "why" until the evidence connects the symptom to the failing owner, transition, or boundary.
  Distinguish an observed mechanism from a hypothesis; a plausible story is not confirmation.
- Do not add guards merely to silence a crash. Validation that enforces a real boundary or
  invariant may be the correct repair; prove why it belongs there.
- A long workaround explanation is a signal to investigate, not proof that the code or comment
  is wrong. Preserve documented compatibility and operational constraints.
- Check for the pattern, not just the instance. Search related paths; repair within agreed scope
  and return wider instances as evidenced work rather than silently expanding the task.
- When stuck, instrument. Read the actual error and observe the relevant state; do not guess.

## Restart bugs: suspect state before code

When something fails after restart, inspect persistent state: configuration, caches, lock files,
and serialized values. If resetting an isolated copy restores behavior, prioritize state validation
as a hypothesis. Do not delete the user's state or treat a reset alone as proof of the cause.

## Verify the repair

Apply [testing-policy](../testing-policy/SKILL.md) to regression evidence.
Report the reproduction, demonstrated cause, affected guarantee, and proposed repair.
For a missing guarantee, propose the property that prevents the relevant failure family and
who would enforce it; proposing it does not establish an agreed contract.
Preserve the causal evidence and limits even when the repair needs no Spec change.
