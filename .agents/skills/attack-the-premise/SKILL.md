---
name: attack-the-premise
description: >-
  Challenge a shared assumption when two or more fixes have failed the same gate.
  Write the premise and choose an observation that distinguishes causes before another patch;
  for imbalances, count which actors hold them and inspect how roles are assigned.
metadata:
  kind: principle
---

# Attack the Premise

When two or more fixes sharing one premise fail the same gate, suspect the premise, not just
the fixes. Each failure under a shared premise is evidence about that premise.
When the challenged premise affects recorded intent, apply keep-intent-aligned (Use the
`keep-intent-aligned` skill): identify its Plan decision, Spec guarantee,
or Task approach; retain the failed attempts and discriminating evidence in the Task while
considering a proposed reversal. An unrecorded hypothesis is not an agreed commitment.

**Pattern:**

- **Write the premise down.** State the one sentence every failed fix assumed and the gate that
  still fails. Keep the attempts and their evidence available.
- **Take a census before the next fix.** For an imbalance, count it per actor across comparable
  runs. The census shows which actors hold the imbalance, not merely its total size. Make it
  rerunnable in accordance with Build the Lever (Use the `build-the-lever` skill). For
  another failure shape, choose an observation whose result distinguishes the competing causes.
- **Read the skew.** If the same few actors hold most of the imbalance on every run, inspect what
  assigns them that role. Confirm the assignment mechanism before calling it the cause, in
  accordance with Fix Root Causes (Use the `fix-root-causes` skill).
- **Remove the asymmetry instead of compensating for it** when the role assignment is confirmed
  as the cause. Rotating, randomizing, or moving the role may address it. A shared pool, batched
  hand-off, or periodic rebalance may leave the assignment intact and add work on every run.
  Preserve required ordering, fairness, and ownership; a proposed alternative still needs proof.

**Stop:**

- Do not start another fix under the same premise before writing it down and obtaining the
  discriminating observation. If observation is blocked, report what is needed.
- An even census does not support the persistent-skew hypothesis. Look elsewhere and retain
  the census as evidence; it does not prove every assumption correct.
- Keep the next experiment bounded in scope and resources. If evidence changes the objective or an
  agreed constraint,
  return that decision to the human rather than silently relaxing the gate.

This principle questions a fact the current design assumes. It does not require rebuilding
the whole design. State the premise's source, failed attempts, discriminating observation,
and proposed implication; failure alone does not authorize a reversal.
