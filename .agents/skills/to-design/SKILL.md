---
name: to-design
description: >-
  Choose or review implementation shapes through correctness, composition, and target realization.
  Use for consequential algorithms, state ownership, module boundaries, or implementation choices.
  Own representation and algorithm invariants; to-spec owns behavioral guarantees and tests.
metadata:
  kind: procedure
---

# To Design

Develop an implementation shape against supplied behavioral contracts and existing code.
Record consequential implementation choices in the owning `.spec`, or return review findings.
Implementation design is optional; it does not require a separate design file.

## 1. Ground the choice

Read the request, relevant Plan, Spec, Task, current code, and supplied findings.
Identify the implementation decision to resolve. Reuse adequate existing design. Use the
`change-impact` skill when boundaries or pivotal facts are unclear.
Surface missing behavioral decisions.
Use the `to-spec` skill when recording them is in scope.

## 2. Develop the shape

For a chosen target, read its realization guide before writing concrete design:
[TypeScript](references/realization/typescript.md), [Effect](references/realization/effect.md),
or [Rust](references/realization/rust.md). Apply it throughout the Spec, not only under `realization`.
Verify concrete APIs against installed versions; label conceptual pseudocode explicitly.

When a consequential choice needs stronger methods or evidence, use deepen (Use the `deepen` skill)
to propose a stronger investigation brief within the agreed scope.

Apply only methods needed by the decision:

- Correctness (Use the `code-correctness` skill) for representations, algorithms, state
  ownership,
  and resource lifetimes.
- Composition (Use the `code-composition` skill) for boundaries, protocols, and
  dependency contracts.
- Performance design (Use the `design-for-performance` skill) when workload or resource
  budgets
  affect the shape.

Reconcile the findings into one shape. Revisit affected methods when their assumptions conflict.
For consequential unsettled choices, compare distinct viable shapes. Use arena (Use the `arena`
skill) for independent candidates or prototype (Use the `prototype` skill) for
empirical uncertainty when the user chooses the experiment.

## 3. Record the design

Use the `writing` skill before drafting or revising design prose.
Use the `workflow-cli` skill for artifact mechanics. Read the owning Spec before editing.
Keep multiple owners in one module Spec when they implement a coherent contract.
Record only consequential choices in supported sections:

- `model`: concrete types and states; owner sections: state authority and scoped Invariants.
- `operations`: signatures, preconditions, postconditions, and failures.
- `algorithm`: pseudocode with branches, loops, updates, failure, and interruption.
- `rules`: shared ordering and lifetime constraints, referenced rather than repeated.
- `composition`: boundaries, exchanged values, and dependency contracts.
- `realization` for remaining target-specific mappings and constraints; do not duplicate other sections.

Define guarantees once and reference their IDs. Keep prose for rationale and preservation arguments;
leave routine implementation details in code.
Write code-specific Invariants over concrete fields and states; define scope and observation points.
Include important internal representation, ownership, and algorithm properties, not only public ones.
Record them under top-level or owner `invariants`, preserving unique stable IDs and unrelated content.
Explain how they enforce behavioral guarantees; distinguish design choices from Requirements.
For examples, read [Spec syntax](references/example.md) or
[Invariants](references/invariant-examples.md) as needed.
Return missing or changed guarantees through the `to-spec` skill when recording is in scope.
Review-only assignments return findings without editing the Spec.

## 4. Challenge and return

Check the combined shape against the behavioral contract and the selected methods' criteria.
Check every code fragment and algorithm against the selected realization, including models,
operations, and composition. Reject contradictory representations or lifecycle semantics.
Keep required checking independent of authors. Resolve findings and repeat affected checks.
Design judgment does not establish passing implementation evidence.
Report behavioral contract changes and objective conflicts; do not silently change agreed intent.

After edits, format each changed Spec and run `workflow check`; inspect the diff.
Return Spec paths and snapshot, chosen shape, rationale, tradeoffs, checks, and unresolved risks.
For a review, return findings and a snapshot-bound PASS, ISSUES, or BLOCKED verdict.
Stop at the assigned boundary. This method does not automatically start implementation.
