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
Explore feasibility and missing correctness decisions; return design findings or optional Spec notes.
Implementation design is optional; it does not require a separate design file.

## 1. Ground the choice

Read the request, relevant Plan, Spec, Task, current code, and supplied findings.
Identify the implementation decision to resolve. Reuse adequate existing design.
Architecturally significant decisions concern structure, dependencies, interfaces, or enforcement
whose alternatives materially affect outcomes, failure behavior, ordering, ownership, compatibility,
or resource guarantees.
Use this term to prioritize design exploration, not to exclude behavioral obligations. Use the
`change-impact` skill when boundaries or pivotal facts are unclear.
Surface missing behavioral decisions.
Use the `to-spec` skill when recording them is in scope.

## 2. Develop the shape

For a chosen target, read its realization guide before writing concrete design:
[TypeScript](references/realization/typescript.md), [Effect](references/realization/effect.md),
or [Rust](references/realization/rust.md). Apply it throughout the Spec, not only under `realization`.
Verify concrete APIs against installed versions; label conceptual pseudocode explicitly.

When an architecturally significant decision needs stronger methods or evidence, use deepen (Use the `deepen` skill)
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

For each candidate representation, derive its implementation invariants:

- Identify state, identities, ownership, relationships, and resource accounting.
- Derive independent predicates needed to enforce the behavioral contract, including cross-owner
  and operation interactions; name each predicate's scope and validity points.
- Establish them at initialization and show preservation through mutations, failure, interruption,
  retry, and competing operations where relevant. Keep unresolved cases explicit.

Reconcile the findings into one shape. Revisit affected methods when their assumptions conflict.
For unsettled architecturally significant decisions, compare distinct viable shapes. Use arena (Use the `arena`
skill) for independent candidates or prototype (Use the `prototype` skill) for
empirical uncertainty when the user chooses the experiment.

## 3. Record the design

Use the `writing` skill before drafting or revising design prose.
Use the `workflow-cli` skill for artifact mechanics. Read the owning Spec before editing.
Keep multiple owners in one module Spec when they implement a coherent contract.
When recording design notes, distinguish optional proposals from normative obligations.
Do not require code or these sections to complete a behavioral Spec:

- `model`: concrete types and states; owner sections: state authority and scoped Invariants.
- `operations`: signatures, preconditions, postconditions, and failures.
- `algorithm`: pseudocode with branches, loops, updates, failure, and interruption.
- `rules`: shared ordering and lifetime constraints, referenced rather than repeated.
- `composition`: boundaries, exchanged values, and dependency contracts.
- `realization` for remaining target-specific mappings and constraints; do not duplicate other sections.

Define guarantees once and reference their IDs. Record rationale when alternatives change
enforcement, coordination, compatibility, or resource costs; leave other implementation details in code.
A chosen mechanism becomes a normative constraint only when explicitly agreed.
For implementation notes, write precise predicates over the chosen representation and name their scope.
Include important internal representation, ownership, and algorithm properties, not only public ones.
Keep normative Invariants about contract state; record private design properties in design prose
unless the representation is an agreed constraint. Preserve stable IDs and unrelated content.
Explain how they enforce behavioral guarantees; distinguish design choices from Requirements.
For examples, read [Spec syntax](references/example.md) or
[Invariants](references/invariant-examples.md) as needed.
Return missing or changed guarantees through the `to-spec` skill when recording is in scope.
Review-only assignments return findings without editing the Spec.

Use the `design-for-verification` skill to define checks and observations for material design claims.

## 4. Challenge and return

Check the combined shape against the behavioral contract and the selected methods' criteria.
During design review, independently derive required implementation properties and challenge them
with violating states and execution sequences. Report missing properties and preservation gaps,
even when the recorded predicates hold; a design may still fail to enforce the contract.
Check every code fragment and algorithm against the selected realization, including models,
operations, and composition. Reject contradictory representations or lifecycle semantics.
Keep required checking independent of authors. Resolve findings and repeat affected checks.
Design judgment does not establish passing implementation evidence.
Report behavioral contract changes and objective conflicts; do not silently change agreed intent.

After edits, format each changed Spec and run `workflow check`; inspect the diff.
Return Spec paths and snapshot, chosen shape, rationale, tradeoffs, checks, and unresolved risks.
For a review, return findings and a snapshot-bound PASS, ISSUES, or BLOCKED verdict.
Stop at the assigned boundary. This method does not automatically start implementation.
