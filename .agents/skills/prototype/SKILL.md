---
name: prototype
description: >-
  Build an isolated throwaway artifact to settle one design or empirical choice through observation.
  Use for uncertain layouts, interactions, behavior, or technical approaches before production work.
metadata:
  kind: procedure
---

# Prototype a decision

Build the smallest disposable instrument that answers one question. Return observations,
alternatives, and a recommended direction. The artifact is throwaway, not production implementation.
Offer the question, estimated time, and recommendation before building unless already authorized.

## 1. Bound the choice

Name the decision, relevant constraints, evidence needed, and time or attempt budget. Use the
`design-for-verification` skill to choose a discriminating
observation.
Investigate discoverable facts; reserve product preferences and objective choices for the human.
If no decision needs an experiment, report that finding instead of building a prototype.

## 2. Build in isolation

Use an owned scratch directory separate from production source and shared runtime state.
Choose the lightest available tool that exercises the question; reuse installed dependencies.
Do not add production abstractions, change project configuration, or install packages without scope.
For competing viable shapes, build at least two distinct alternatives under comparable conditions.
Label visual variants and provide a switcher when useful; gather prior art only when direction is
open.

## 3. Observe

Drive the relevant surface. For visual choices, inspect rendered states and exercise interactions.
For behavioral choices, run the path and inspect its outputs. For timing choices, apply
benchmark-checklist (Use the `benchmark-checklist` skill) before relying on a comparison.
Capture inputs, conditions, results, and limitations. A screenshot does not prove interaction
behavior. Use the `testing-policy` skill if durable tests are warranted; scaffolding is
optional.
Stop at a settled empirical question or the budget; report unresolved preferences and uncertainty.

## 4. Report the findings

Return the question, variants, evidence, tradeoffs, recommendation, and scratch artifact path.
State which production assumptions remain unverified. Prototype results do not prove finished
behavior.
Use the `keep-intent-aligned` skill when findings affect recorded
commitments.
State unresolved objective choices and recommend the next action. Production work requires its
own authorization.
Clean up owned runtime resources; preserve useful artifacts for review or remove them when no longer
needed.
