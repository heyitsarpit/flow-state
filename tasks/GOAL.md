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

Before claiming Phase 4 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and the full affected
verification with no accepted Phase 4 failures. Update the roadmap truthfully,
mark Goal 4 Complete, and make only Goal 5 Ready.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Goal 5 — Deletion and final correctness

```text
/goal Complete Phase 5 through P5.4 in tasks/PHASE_5.md as one persistent goal.
Work autonomously through the phase until its executable exit criteria pass;
choose the implementation order, refactor scope, and commit cadence that best
produce a coherent result. Stay within Phase 5 and preserve unrelated work.

Treat TASK.md, tasks/PHASE_5.md, applicable tasks/BUGS.md entries and contracts,
production code, deterministic tests, packed consumers, and documentation as the
authorities. Address open defects that affect the code you change. Do not inspect
transcripts unless a specific code decision needs provenance.

Before changing code or documentation, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Delete, migrate, restructure, and
correct the implementation freely, update deterministic proof for changed behavior,
and use focused checks while working.

Before claiming Phase 5 complete, re-read and apply the full thermo-nuclear skill
to the final diff, fix every blocking or presumptive-blocker finding, and explicitly
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and `pnpm verify` with no
accepted failures. Update the roadmap truthfully and mark Goal 5 and the roadmap
Complete.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```
