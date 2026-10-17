---
name: to-spec
description: >-
  Record and check behavioral requirements, invariants, and test obligations in workflow Specs.
  Use to establish, revise, or supersede observable guarantees from agreed intent and findings.
  Implementation design sections are maintained by to-design.
metadata:
  kind: procedure
---

Use the `writing` skill before drafting or revising prose.

# To Spec

Create behavioral Invariants from Requirements and specify how to check them.
The `to-design` skill creates representation and algorithm Invariants in the same Spec.
Preserve those Invariants and implementation design during behavioral edits.
Use [author guidance](references/spec-author.md) to read, create, or revise the owning Spec.
Use the `check-spec` skill for contract completeness and coverage.

A bounded direct edit can use one author. Consequential proposals require independent checking.
For an author-only assignment, return the Spec and checking needs; leave independent checking
to its assigned owner.
Do not add correctness or composition design phases merely to write a Spec.
One Task may affect multiple modules; one module Spec may support multiple Tasks.

## 1. Establish the behavioral contract

Read agreed intent, existing Specs, relevant Plans and drafted Tasks, and supplied findings.
Identify observable inputs, outcomes, failures, side effects, and conditions.
Reuse existing guarantees. Separate intended behavior from observations of current code.
For missing facts, use
change-impact (Use the `change-impact` skill) within the assigned scope.
Return unresolved product choices to the user.
For large behavioral changes, recommend whether user approval is needed before implementation.
Consider compatibility, cross-module guarantees, and consequential new product commitments.
Preserve any agreed approval gate; routine contract clarification needs no user approval.

## 2. Record requirements, invariants, and tests

Write code-specific Invariants over concrete fields and states; define scope and observation points.
The author records sourced Requirements, behavioral Invariants, and public-boundary checks. Use the `design-for-verification` skill for observations and
diagnostics. Use the `testing-policy` skill for test boundaries and independent
expectations.
Keep provenance, open questions, and coverage needed to interpret the contract.
State temporal, failure, concurrency, and resource guarantees as behavior when relevant.
Do not prescribe internal types, algorithms, module layouts, composition flows, or realization. Use
the `to-design` skill for optional implementation-design questions.
They block contract work only when the required behavior itself cannot yet be settled.

## 3. Check and return

Check the actual Spec snapshot against intent, scenarios, invariants, and test obligations.
Route findings to the author and recheck affected passages. Keep unresolved obligations visible.
A planned test or valid document is not passing product evidence.
Return Spec paths, snapshot, provenance, verdict, required checks, and unresolved questions.
Recommend the next action and stop at the requested phase boundary. Execution needs authorization.
