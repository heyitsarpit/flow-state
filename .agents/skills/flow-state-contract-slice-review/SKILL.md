---
name: flow-state-contract-slice-review
description: Read-only review of one rewrite Workflow Task against its Plan commitments,
  Task acceptance, changed-file scope, proof IDs, failure lanes, and deletion obligations.
  Use after implementation and focused checks; do not use for general maintainability review
  or contract authoring.
---

# Flow State Contract-Slice Review

Use this skill for one implemented coding Task in `packages/flow-state-rewrite`.
It is an independent, read-only acceptance review against the Task and its
referenced Workflow Plans. Use it after implementation and focused checks. Do
not use it for implementation, lint fixes, general maintainability, Effect API
design, bug hunting, or authoring Plan/Task commitments.

## Load the Workflow record

Read only the material needed for this review:

- Exact Workflow Task ID and its current record. Check its readiness and
  blockers with the Workflow CLI when relevant.
- The Plan sections named by the Task's references and acceptance.
- The implementer's explicit changed-file list, final snapshot, and focused
  check receipts, recorded in the Task's supported progress fields.
- Historical contract or Bead receipts only when a Plan or Task explicitly
  cites them as provenance. Read them without changing their records.

If the changed-file list or final snapshot is missing, stop with a blocker. Do
not infer the slice from the repository's full dirty diff. Historical receipts
describe their recorded snapshots; they do not establish current checkout
behavior unless the reviewed snapshot matches.

## Use the right authority

- Referenced Workflow Plans define current behavior commitments. The Workflow
  Task defines acceptance, work scope, blockers, and required evidence. A
  conflict or gap between them is a blocker; do not choose one silently.
- Old contract documents, Beads, archived revisions, proposals, audits,
  research, the reference package, and historical fixtures are provenance only.
  They do not override Plan commitments or Task acceptance.
- Read historical provenance only when a Plan or Task requires a fidelity
  comparison or receipt. Keep the source record unchanged.
- The Task's allowed paths and the coder's frozen changed-file inventory bound
  the review. Starting points describe responsibilities; they are not an
  allowlist. Include outcome-required recombination or integration edits even
  when they were absent from starting points.
- Treat a production owner, its relevant callers, and the minimum directly
  called owners needed to verify behavior as the implementation path. Include
  required integration edits. Do not inspect unrelated owners.

Keep the review read-only. Do not edit source, tests, Workflow records,
historical contracts, Beads, or generated output. Do not implement findings or
create commits.

## Route the review

Select the routes required by the Task and its referenced Plans. There is no
universal review sequence.

### Scope and ownership

- Compare the actual changed-file inventory with the Task's allowed paths and
  the coder's frozen inventory.
- Confirm every change serves Task acceptance or a referenced Plan commitment.
- Confirm each required production owner is represented.
- Inspect decisive tests and relevant callers, the minimum directly called
  owners needed to verify behavior, required recombination, untouched unrelated
  owners, and prerequisites resolved before work began.

### Plan commitments and proof IDs

- Map every Task acceptance statement and referenced Plan commitment to a
  production path and decisive proof.
- Keep proof IDs and their evidence attached to the commitment they prove.
- Tests that only restate implementation details do not count as decisive
  proof.
- When a Plan or Task names a legacy contract ID, use it for lineage only; do
  not treat the historical source as current acceptance authority.

### Failure and lifecycle lanes

Review every lane below, plus any additional lanes named by the Task or Plan:

- success
- typed failure
- defect
- interruption
- ownership
- cleanup
- ordering
- public and internal `Effect<A, E, R>`

Mark a lane `N/A` only when the Task or Plan makes that explicit.

### Deletion, retention, and absence

When deletion or retention is named, check the reviewed boundary for:

- deleted surfaces and required retention
- compatibility aliases
- secondary owners
- deep routes
- parser branches
- hidden registries
- casts
- test-only semantic substitutes forbidden by the Task

Preserve every deletion obligation and its evidence. A minimalism or deletion
review is a final independent pass; deleting required complexity is a
regression.

### Focused receipts

Run named focused commands when safe. A required runtime, type,
packed-consumer, browser, or absence proof that did not run is a blocker, not an
implied pass. `workflow check` verifies Workflow record integrity; it does not
prove implementation behavior.

A Plan/Task ambiguity is a blocker assigned to its owning record. Do not invent
a public name, field, error, lifecycle law, or test expectation to make code
reviewable.

## Report findings

Report only findings reproducible from live files. Use this format for each
finding:

```text
BLOCKER|ADVISORY — /absolute/path:line — @task.Epic.Task / @plan.Name.Ref
Observed violation:
Failure scenario or missing proof:
Required resolution:
```

- `BLOCKER` means the Task cannot be marked done.
- `ADVISORY` is a concrete improvement outside the acceptance boundary. It
  must not silently widen the Task.
- Prefer a precise patch direction, but never apply it during this review.
- Do not report formatting, naming taste, or speculative risks without an
  executable failure scenario or violated commitment.

## Hand back the evidence

Return exactly these sections:

```text
Verdict: PASS | BLOCKED
Workflow Task:
Plan commitments reviewed:
Historical receipts consulted:
Changed files reviewed:
Focused checks:
Behavior lanes reviewed:
Blocking findings:
Advisory findings:
Evidence limits:
```

`PASS` requires complete Task and Plan mapping, no blocking finding, and all
required focused proof receipts. A clean typecheck or source scan alone never
proves runtime behavior.

## Keep review boundaries clear

- This skill proves conformance to Workflow Plan commitments and Task
  acceptance, including proof ownership.
- `effect-systems-design` separately judges Effect-native design and API
  choices.
- The `reviewer` entrypoint judges structural simplification and
  maintainability.
- `performance-quality-bug-hunt` separately searches for regressions,
  edge-case bugs, leaks, races, and performance risks not fully specified by
  the Task or its Plans.
