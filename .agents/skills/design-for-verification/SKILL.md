---
name: design-for-verification
description: >-
  Make goals and material claims verifiable from early planning onward.
  Apply when establishing outcomes, designing behavior or skills, or preparing optimization.
metadata:
  kind: principle
---

# Design for Verification

Turn every material claim into something that can be assessed against evidence.
Begin once the goal and initial direction are clear, including when taking over an existing plan.
Design verification and diagnostics before substantial implementation.
Explicit targets remove ambiguity and let an agent hillclimb toward the goal.

Goals name the intent; outcomes state what must work; decisions record the chosen approach.
Correctness targets state the conditions that must hold: Plan Verification targets for system
outcomes,
Spec Invariants for module Requirements. Tests and other checks supply evidence for these targets.

## Apply during design

1. **Define the target.** Translate goals into observable outcomes, invariants, failure conditions,
   and relevant resource budgets.
   Define pass conditions before implementation, with inputs and independently expected results.
   Include meaningful failures and state that must remain unchanged.
   Distinguish success, regression, failure, and inconclusive results.
2. **Define the observation.** Choose representative workloads, environments, instruments,
   and repeatable observation procedures. Check the claimed behavior, not a convenient proxy.
   Tie evidence to its revision and conditions. State which changes invalidate it.
3. **Make failure explainable.** Expose the state and events needed to distinguish causes.
   Use reproducible inputs, bounded replay, traces, or profiles where the risk warrants them.
   Missing checks and diagnostic tools are work to build. Tests alone may not explain failure.
4. **Expose remaining ambiguity.** For human judgments, define the evidence and decision criteria.
   Do not invent a numerical proxy. Keep unresolved judgments visible.

Ask: could agreed behavior still be wrong while every check passes? Close gaps or expose them.
Judge the assembled result against all required targets for the agreed scope and conditions.
Accept only the scope and conditions covered by the evidence.
Coverage limits the evidence claim, not the agreed guarantee.

Scale the apparatus to the claim and its consequences. Reuse valid instruments.
Keep instruments representative and maintained as behavior changes.
When conditions or goals change, revisit the target and evidence before relying on comparisons.

For skill development, define realistic user requests, observable success and failure cases, and
diagnostic evidence before drafting.
Valid Markdown does not prove agent behavior.

Runtime verification (Use the `runtime-verification` skill) owns setup, driving, and
cleanup when
executing runtime checks or auditing recipes. This principle defines their targets and evidence.
