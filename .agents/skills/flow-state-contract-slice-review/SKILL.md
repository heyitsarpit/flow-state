---
name: flow-state-contract-slice-review
description: Read-only review of one packages/flow-state-rewrite coding bead against its exact active contract clauses, frozen changed-file inventory, production owner, proof IDs, failure lanes, and deletion obligations. Use after implementation and focused checks; do not use for general maintainability review or contract authoring.
---

# Flow State Contract Slice Review

Use this skill for one implemented `packages/flow-state-rewrite` coding Bead.
It is an independent, read-only acceptance review against the Bead and the
active Incident Console contracts. Use it after implementation and focused
checks. Do not use it for implementation, lint fixes, general maintainability,
Effect API design, bug hunting, or contract authoring.

## Load the slice record

Read only the material needed for this review:

- Exact Bead ID and `bd show <id> --json` output.
- The implementer's explicit changed-file list and focused-check receipts.
- The Bead's named clauses under
  `reference/incident-console/implementation/contracts/`.
- Proof, deletion, or retention references named by the Bead or an active
  contract. Read only the named sections.

If the changed-file list is missing, stop with a blocker. Do not infer the
slice from the repository's full dirty diff. Do not require unrelated
historical workflow documents or registers.

## Use the right authority

- Active sibling contracts are semantic authority. Beads organize work but do
  not override contracts.
- Read provenance only when an active clause explicitly requires a fidelity
  comparison.
  Proposals, historical code, the frozen package, and unresolved registers are
  not implementation authority.
- The frozen coder inventory bounds the changed-file review. Starting points
  describe responsibilities; they are not an allowlist.
- Treat a production owner, its relevant callers, and the minimum directly
  called owners needed to verify behavior as the implementation path. Include
  recombination or integration edits when the Bead outcome or active contract
  requires them. Do not reject an outcome-required integration edit solely
  because it was absent from the starting points.

Keep the review read-only. Do not edit source, tests, contracts, Beads, or
generated output. Do not implement findings or create commits.

## Route the review

Select the routes required by the Bead and its named contracts. There is no
universal review sequence.

### Scope and ownership

- Compare the actual changed-file inventory with the frozen coder inventory.
- Confirm every change serves the Bead outcome or an active contract.
- Confirm the required production owner is represented.
- Inspect decisive tests and relevant callers, the minimum directly called
  owners needed to verify behavior, required recombination, untouched
  unrelated owners, and dependencies closed before work began.

### Contract law and proof IDs

- Map every acceptance statement and named contract clause to a production
  path and decisive proof.
- Keep proof IDs and their evidence attached to the clause they prove.
- Tests that only restate implementation details do not count as decisive
  proof.

### Failure and lifecycle lanes

Review every lane below, plus any additional lanes named by the Bead or
contract:

- success
- typed failure
- defect
- interruption
- ownership
- cleanup
- ordering
- public and internal `Effect<A, E, R>`

Mark a lane `N/A` only when the Bead or contract makes that explicit.

### Deletion, retention, and absence

When deletion or retention is named, check the reviewed boundary for:

- deleted surfaces and required retention
- compatibility aliases
- secondary owners
- deep routes
- parser branches
- hidden registries
- casts
- test-only semantic substitutes forbidden by the Bead

Preserve every deletion obligation and its evidence. A minimalism or deletion
review is a final independent pass; deleting required contract complexity is a
regression.

### Focused receipts

Run named focused commands when safe. A required runtime, type,
packed-consumer, browser, or absence proof that did not run is a blocker, not
an implied pass.

Contract ambiguity is a blocker assigned to the owning contract. Do not invent
a public name, field, error, lifecycle law, or test expectation to make code
reviewable.

## Report findings

Report only findings reproducible from live files. Use this format for each
finding:

```text
BLOCKER|ADVISORY — /absolute/path:line — CONTRACT-ID
Observed violation:
Failure scenario or missing proof:
Required resolution:
```

- `BLOCKER` means the Bead cannot close.
- `ADVISORY` is a concrete improvement outside the acceptance boundary. It
  must not silently widen the Bead.
- Prefer a precise patch direction, but never apply it during this review.
- Do not report formatting, naming taste, or speculative risks without an
  executable failure scenario or violated clause.

## Hand back the evidence

Return exactly these sections:

```text
Verdict: PASS | BLOCKED
Contract IDs:
Changed files reviewed:
Focused checks:
Behavior lanes reviewed:
Blocking findings:
Advisory findings:
Evidence limits:
```

`PASS` requires complete contract mapping, no blocking finding, and all
required focused proof receipts. A clean typecheck or source scan alone never
proves runtime behavior.

## Keep review boundaries clear

- This skill proves contract conformance and proof ownership.
- `effect-systems-design` separately judges Effect-native design and API
  choices.
- The `reviewer` entrypoint judges structural simplification and
  maintainability.
- `performance-quality-bug-hunt` separately searches for regressions,
  edge-case bugs, leaks, races, and performance risks not fully specified by
  the Bead.
