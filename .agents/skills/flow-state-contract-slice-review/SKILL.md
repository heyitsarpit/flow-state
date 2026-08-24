---
name: flow-state-contract-slice-review
description: Read-only review of one packages/flow-state-rewrite coding bead against its exact active contract clauses, allowed files, production owner, proof IDs, failure lanes, and deletion obligations. Use after implementation and focused checks; do not use for general maintainability review or contract authoring.
---

# Flow State Contract Slice Review

Judge whether one implementation slice faithfully implements its Bead and the
active Incident Console contracts. This is an independent acceptance review,
not an implementation or lint-fix pass.

## Required inputs

Obtain before reviewing:

1. The exact Bead ID and `bd show <id> --json` output.
2. The implementer's explicit changed-file list and focused-check receipts.
3. The Bead's named clauses under
   `reference/incident-console/implementation/contracts/`.
4. `IMPLEMENTATION_WORKFLOW.md`, the applicable `PROOF_MATRIX.md` entries, and
   any deletion or retention IDs named by the Bead.

If the changed-file list is missing, stop with a blocker. Do not infer the
slice from the repository's full dirty diff.

## Authority and scope

- Active sibling contracts are semantic authority. Beads organize work but do
  not override contracts.
- Read provenance only when an active clause explicitly requires a fidelity
  comparison. Proposals, historical code, the frozen package, and unresolved
  registers are not implementation authority.
- Inspect only the Bead's allowed production files, its decisive tests, and the
  minimum directly called owners needed to verify behavior.
- Keep the review read-only. Do not edit source, tests, contracts, Beads, or
  generated output.

## Review procedure

1. **Reconcile scope.** Confirm every changed file is allowed, every required
   owner is represented, unrelated owners are untouched, and dependencies were
   closed before work began.
2. **Trace the law.** Map each acceptance statement and named contract clause to
   a production path and decisive proof. Tests that only restate implementation
   details do not count.
3. **Exercise every lane.** Review success, typed failure, defect,
   interruption, ownership, cleanup, ordering, and public/internal
   `Effect<A, E, R>`. Mark a lane `N/A` only when the contract or Bead makes that
   explicit.
4. **Check absence.** Search the reviewed boundary for deleted surfaces,
   compatibility aliases, secondary owners, deep routes, parser branches,
   hidden registries, casts, or test-only semantic substitutes forbidden by the
   Bead.
5. **Verify receipts.** Run the named focused commands when safe. A required
   runtime, type, packed-consumer, browser, or absence proof that did not run is
   a blocker, not an implied pass.

Contract ambiguity is a blocker assigned to the owning contract. Do not invent
a public name, field, error, lifecycle law, or test expectation to make code
reviewable.

## Finding standard

Report only findings that are reproducible from live files. Each finding must
contain:

```text
BLOCKER|ADVISORY — /absolute/path:line — CONTRACT-ID
Observed violation:
Failure scenario or missing proof:
Required resolution:
```

- `BLOCKER` means the Bead cannot close.
- `ADVISORY` is a concrete improvement outside the acceptance boundary and must
  not silently widen the Bead.
- Prefer a precise patch direction, but never apply it during this review.
- Do not report formatting, naming taste, or speculative risks without an
  executable failure scenario or violated clause.

## Handback

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

## Separation from other reviews

- This skill proves contract conformance and proof ownership.
- `effect-systems-design` separately judges Effect-native design and API choices;
  the `reviewer` entrypoint judges structural simplification and maintainability.
- `performance-quality-bug-hunt` separately searches for regressions, edge-case
  bugs, leaks, races, and performance risks not fully specified by the Bead.
- A minimalism/deletion review is a final independent pass; deleting required
  contract complexity is always a regression.
