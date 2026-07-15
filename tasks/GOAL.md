# Copy-paste implementation and review goals

[Back to the roadmap](../TASK.md)

Each block is a complete `/goal` prompt. Copy one block wholesale into the code
agent. Implementation goals follow phase dependencies; the recurring review may
run against any current phase range at any time and never gates readiness.

## Recurring independent review

```text
/goal Independently review the current implementation. Review the code, not the
implementation process. Select the phase or contiguous phase range implicated by
the current diff and open defects; no roadmap or review status is required before
this audit can run.

Establish the relevant implementation diff from Git, inspect changed production
owners and their direct callers, and derive acceptance claims from TASK.md, the
selected phase manifests, applicable contracts, and tasks/BUGS.md. Do not inspect
transcripts unless a specific code decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify changed invariants with hostile deterministic repros rather than trusting
existing tests or implementation-derived models.

At changed type and async-ownership seams, explicitly probe absence versus present
`undefined`, failed and repeated cleanup, stale generations, invalid or non-finite
capacity, exact Effect A/E/R, public callback source types, and packed declarations.
Reject `any`/`unknown` erasure, bivariance, shadow descriptor families, casts, or
Promise bridges that make those proofs pass by weakening the contract.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed defects in
tasks/BUGS.md and reopen only contradicted implementation criteria; do not fix
product code. Run the verification scope needed to support the disposition and
report unrelated failures against their actual owners. This review has no status
gate, never promotes or blocks an implementation goal merely because it ran or did
not run, and remains available for future audits.
```

## Goal 1 — Identity, runtime ownership, and lifecycle

```text
/goal Complete Phase 1 in tasks/PHASE_1.md as one persistent goal. Work
autonomously through the phase until its executable exit criteria pass; choose the
implementation order, refactor scope, and commit cadence that best produce a
coherent result. Stay within Phase 1 and preserve unrelated work.

Treat TASK.md, tasks/PHASE_1.md, applicable tasks/BUGS.md entries and contracts,
production code, and deterministic tests as the authorities. Address open defects
that affect the code you change. Do not inspect transcripts unless a specific code
decision needs provenance.

Before coding, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Implement or restructure the
production owners freely, add or update deterministic tests for changed behavior,
and use focused checks while working.

Treat broad variance/type failures as design feedback, not permission to weaken a
public or semantic boundary. Preserve exact authored and packed Context/Event/State
and Effect A/E/R; do not escape through `any`/`unknown`, bivariant callbacks,
conditional erased shadows, restated descriptor families, casts, or Promise
conversion. Add negative source and packed-declaration witnesses, plus applicable
hostile cleanup/generation/capacity tests, for every changed boundary.

Before claiming Phase 1 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and the full affected
verification with no accepted Phase 1 failures. Update the roadmap truthfully,
mark Goal 1 Complete, and make only Goal 2 Ready.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Goal 2 — Transactions

```text
/goal Complete Phase 2 in tasks/PHASE_2.md as one persistent goal. Work
autonomously through the phase until its executable exit criteria pass; choose the
implementation order, refactor scope, and commit cadence that best produce a
coherent result. Stay within Phase 2 and preserve unrelated work.

Treat TASK.md, tasks/PHASE_2.md, applicable tasks/BUGS.md entries and contracts,
production code, and deterministic tests as the authorities. Address open defects
that affect the code you change. Do not inspect transcripts unless a specific code
decision needs provenance.

Before coding, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Implement or restructure the
production owners freely, add or update deterministic tests for changed behavior,
and use focused checks while working.

Treat broad variance/type failures as design feedback, not permission to weaken a
public or semantic boundary. Preserve exact authored and packed Context/Event/State
and Effect A/E/R; do not escape through `any`/`unknown`, bivariant callbacks,
conditional erased shadows, restated descriptor families, casts, or Promise
conversion. Add negative source and packed-declaration witnesses, plus applicable
hostile cleanup/generation/capacity tests, for every changed boundary.

Before claiming Phase 2 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and the full affected
verification with no accepted Phase 2 failures. Update the roadmap truthfully,
mark Goal 2 Complete, and make only Goal 3 Ready.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Goal 3 — Transitions and actor-owned asynchronous work

```text
/goal Complete Phase 3 in tasks/PHASE_3.md as one persistent goal. Work
autonomously through the phase until its executable exit criteria pass; choose the
implementation order, refactor scope, and commit cadence that best produce a
coherent result. Stay within Phase 3 and preserve unrelated work.

Treat TASK.md, tasks/PHASE_3.md, applicable tasks/BUGS.md entries and contracts,
production code, and deterministic tests as the authorities. Address open defects
that affect the code you change. Do not inspect transcripts unless a specific code
decision needs provenance.

Before coding, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Implement or restructure the
production owners freely, add or update deterministic tests for changed behavior,
and use focused checks while working.

Treat broad variance/type failures as design feedback, not permission to weaken a
public or semantic boundary. Preserve exact authored and packed Context/Event/State
and Effect A/E/R; do not escape through `any`/`unknown`, bivariant callbacks,
conditional erased shadows, restated descriptor families, casts, or Promise
conversion. Add negative source and packed-declaration witnesses, plus hostile
cleanup/generation/capacity tests where applicable, for every changed boundary.

Before claiming Phase 3 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and the full affected
verification with no accepted Phase 3 failures. Update the roadmap truthfully,
mark Goal 3 Complete, and make only Goal 4 Ready.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Goal 4 — Adapters

```text
/goal Complete Phase 4 in tasks/PHASE_4.md as one persistent goal. Work
autonomously through the phase until its executable exit criteria pass; choose the
implementation order, refactor scope, and commit cadence that best produce a
coherent result. Stay within Phase 4 and preserve unrelated work.

Treat TASK.md, tasks/PHASE_4.md, applicable tasks/BUGS.md entries and contracts,
production code, and deterministic tests as the authorities. Address open defects
that affect the code you change. Do not inspect transcripts unless a specific code
decision needs provenance.

Before coding, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Implement or restructure the
production owners and adapters freely, add or update deterministic tests for
changed behavior, and use focused checks while working.

Treat broad variance/type failures as design feedback, not permission to weaken a
public or semantic boundary. Preserve exact authored and packed Context/Event/State
and Effect A/E/R; do not escape through `any`/`unknown`, bivariant callbacks,
conditional erased shadows, restated descriptor families, casts, or Promise
conversion. Add negative source and packed-declaration witnesses, plus applicable
hostile cleanup/generation/capacity tests, for every changed boundary.

Before claiming Phase 4 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and the full affected
verification with no accepted Phase 4 failures. Update the roadmap truthfully,
mark Goal 4 Complete, and make only Goal 5 Ready.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Goal 5 — Deletion and final correctness (closed)

Phase 5 closed by explicit scope transfer on 2026-07-15. Its unresolved final
review and verification queue moved to Goal 6 `P6.0`; do not restart this retired
goal or interpret its completion state as a clean alpha-readiness gate.

## Goal 6 — Experimental alpha preparation

```text
/goal Complete Phase 6 through P6.4 in tasks/PHASE_6.md as one persistent goal.
Work autonomously through its ordered slices until the experimental alpha
candidate meets the executable exit criteria. Stay within Phase 6 and preserve
unrelated work.

Treat TASK.md, tasks/PHASE_6.md, applicable contracts and tasks/BUGS.md entries,
the live packages/flow-state implementation, and the maintained examples as the
authorities. The library and examples are source truth while the onboarding and
reference documentation are rewritten around the settled alpha API.

Begin with `P6.0`: correct `BUG-4`, `BUG-26`, `BUG-30`, and `BUG-80` through
`BUG-94`, complete the deferred independent Review 5.9, and restore every broad
gate with no accepted failures. Do not begin `P6.1` until that queue is clean.

Before changing code or documentation, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references.

Preserve exact Context/Event/State and Effect A/E/R across source and packed
declarations. Record confirmed defects in tasks/BUGS.md before fixing them, add
deterministic regressions at the semantic owner, and keep adapters on the existing
runtime rather than introducing parallel engines or Promise-owned lifecycle.

Before claiming Phase 6 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, `pnpm verify`, the alpha
tarball consumer matrix, and the flagship acceptance suite with no accepted
failures. Prepare the release candidate and report the explicit publish command,
but do not publish or create an external release without user authorization.

Report the outcome, verification, alpha limits, thermo-nuclear disposition,
residual blockers, release artifact, and commits.
```
