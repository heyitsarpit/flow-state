---
name: to-design
description: >-
  Choose or review implementation shapes through correctness, composition, and target realization.
  Use for consequential algorithms, state ownership, module boundaries, or implementation choices.
  Behavioral requirements, invariants, and test obligations belong to to-spec.
disable-model-invocation: true
metadata:
  kind: procedure
---

# To Design

Develop an implementation shape against supplied behavioral contracts and existing code.
Return a proposal or review findings. This is optional; no design file is required.

## 1. Ground the choice

Read the request, relevant Plan, Spec, Task, current code, and supplied findings.
Identify the implementation decision to resolve. Reuse adequate existing design.
Use [change-impact](../change-impact/SKILL.md) when boundaries or pivotal facts are unclear.
Surface missing behavioral decisions. Use [to-spec](../to-spec/SKILL.md)
when recording them is in scope.

## 2. Develop the shape

When a consequential choice needs stronger methods or evidence, use [deepen](../deepen/SKILL.md)
to propose a stronger investigation brief within the agreed scope.

Apply only methods needed by the decision:

- [Correctness](../code-correctness/SKILL.md) for representations, algorithms, state ownership,
  and resource lifetimes.
- [Composition](../code-composition/SKILL.md) for boundaries, protocols, and dependency contracts.
- [Performance design](../design-for-performance/SKILL.md) when workload or resource budgets
  affect the shape.

Reconcile the findings into one shape. Revisit affected methods when their assumptions conflict.
For consequential unsettled choices, compare distinct viable shapes. Use
[arena](../arena/SKILL.md) for independent candidates or [prototype](../prototype/SKILL.md)
for empirical uncertainty when the user chooses the experiment.

## 3. Challenge and return

Check the combined shape against the behavioral contract and the selected methods' criteria.
Keep required checking independent of authors. Resolve findings and repeat affected checks.
Design judgment does not establish passing implementation evidence.
Report behavioral contract changes and objective conflicts; do not silently change agreed intent.

Return the chosen shape, rationale, tradeoffs, verification approach, and unresolved risks.
For a review, return findings and a snapshot-bound PASS, ISSUES, or BLOCKED verdict.
Stop at the assigned boundary. This method does not automatically start implementation.
