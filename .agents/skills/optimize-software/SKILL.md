---
name: optimize-software
description: >-
  Find performance costs, select justified candidates, and validate bounded improvements.
  Use for slow software, performance reviews, optimization plans, or hardware-aware tuning.
  Hillclimb owns sustained experiments; design-for-performance owns architectural judgment.
disable-model-invocation: true
metadata:
  kind: procedure
---

# Optimize Software

Remove work at the limiting cost, then measure the complete path.
Preserve the required result; prove requested improvements.

## 1. Establish the objective

Read the supplied Task, commitments, current changes, and measurements. Stay within the assigned
analysis or implementation scope.
Confirm the metric, target, workload, environment, guarantees, run budget, and stopping condition.
Return consequential missing choices to the human. For unresolved
architecture or resource budgets, apply
[design-for-performance](../design-for-performance/SKILL.md); reuse settled design decisions.
Reuse settled targets and evidence; do not change the metric.
Apply [design-for-verification](../design-for-verification/SKILL.md) to targets and evidence.

## 2. Locate the limiting cost

Trace data flow and profile representative workloads.
Distinguish computation, memory latency/bandwidth, I/O, allocation, coordination, and excess work.
Use [diagnose](../diagnose/SKILL.md) for missing causal evidence.
Label unmeasured architectural costs as predictions.
Use [benchmark-checklist](../benchmark-checklist/SKILL.md) before relying on a comparison.

## 3. Derive candidates from structure

When candidate selection needs stronger methods or evidence, use [deepen](../deepen/SKILL.md)
to propose a stronger investigation brief within the agreed scope.

Identify ordering, repetition, bounded values, selective predicates, and actual field access.
Use [work reduction](../work-reduction/SKILL.md) to derive and compose
reductions before consulting the catalogue.
Follow measured limits; do not apply every technique.

| Limiting cost or opportunity | Read |
|---|---|
| Excess work or query structure | [Formulation](references/formulation.md) |
| Repeated searches or poor scaling | [Algorithms](references/algorithms.md) |
| Allocation, copying, or locality | [Memory and lifetimes](references/memory.md) |
| I/O, scheduling, or contention | [Execution and concurrency](references/execution.md) |
| Measured CPU kernel costs | [Kernels](references/kernels.md) |
| Build, compiler, or runtime settings | [Configuration](references/configuration.md) |
| Loading, rendering, or interaction | [Frontend](references/frontend.md) |

For each candidate, state trigger, work removed, work added, invariant, and validation metric.
Rank by expected impact, evidence, and implementation cost. Choose one bounded next attempt.
Expose consequential contract proposals before dependent implementation.
Verify version-specific techniques against [relevant sources](references/sources.md).

## 4. Execute the requested work

For a review or plan, return ranked candidates and unresolved evidence; stop before implementation.
For authorized implementation, make one bounded change using
[implementation guidance](../execute-task/references/implementer.md), including configured lint.
Use [Task acceptance checks](../execute-task/references/task-checker.md) on the final snapshot.
Keep required checking independent; unmet acceptance gates remain open.
Apply work-reduction's composition checks when combining candidates.
Apply [testing-policy](../testing-policy/SKILL.md)
and [specialized checks](references/validation.md); separate diagnostic builds from performance
runs.
Reject complexity without demonstrated benefit unless an explicit architectural contract requires
it.

## 5. Report and reconcile

Report comparisons using [benchmark-checklist](../benchmark-checklist/SKILL.md).
Add correctness results, tradeoffs, and limits; label unmeasured recommendations as hypotheses.
Reconcile material findings through [keep-intent-aligned](../keep-intent-aligned/SKILL.md).
Include evidence locations in the result. Update Task records only within the authorized scope.
