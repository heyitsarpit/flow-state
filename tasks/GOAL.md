# Copy-paste phase goals

[Back to the roadmap](../TASK.md)

Each block is a complete `/goal` prompt. Copy one block wholesale into the code
agent. Completed goals are recorded in `TASK.md` and Git history rather than kept
as dead prompts here.

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
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and `pnpm verify` with no
accepted failures. Update the roadmap truthfully, mark Goal 1 Awaiting review and
Review 1 Ready, then stop without starting Phase 2.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Review 1 — Phase 1 code review

```text
/goal Independently review the completed Phase 1 implementation. Review the code,
not the implementation process.

Establish the implementation diff from Git, inspect changed production owners and
their direct callers, and derive acceptance claims from tasks/PHASE_1.md, applicable
contracts, and tasks/BUGS.md. Do not inspect transcripts unless a specific code
decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify changed invariants with hostile deterministic repros rather than trusting
existing tests or implementation-derived models.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed defects in
tasks/BUGS.md and reopen the owning Phase 1 status; do not fix product code. Pass
only when no blocker/high finding or skill violation remains and `pnpm verify`
passes. On pass, mark Review 1 Complete and only Goal 2 Ready.
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
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and `pnpm verify` with no
accepted failures. Update the roadmap truthfully, mark Goal 2 Awaiting review and
Review 2 Ready, then stop without starting Phase 3.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Review 2 — Phase 2 code review

```text
/goal Independently review the completed Phase 2 implementation. Review the code,
not the implementation process.

Establish the implementation diff from Git, inspect changed production owners and
their direct callers, and derive acceptance claims from tasks/PHASE_2.md, applicable
contracts, and tasks/BUGS.md. Do not inspect transcripts unless a specific code
decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify changed invariants with hostile deterministic repros rather than trusting
existing tests or implementation-derived models.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed defects in
tasks/BUGS.md and reopen the owning Phase 2 status; do not fix product code. Pass
only when no blocker/high finding or skill violation remains and `pnpm verify`
passes. On pass, mark Review 2 Complete and only Goal 3 Ready.
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
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and `pnpm verify` with no
accepted failures. Update the roadmap truthfully, mark Goal 3 Awaiting review and
Review 3 Ready, then stop without starting Phase 4.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Review 3 — Phase 3 code review

```text
/goal Independently review the completed Phase 3 implementation. Review the code,
not the implementation process.

Establish the implementation diff from Git, inspect changed production owners and
their direct callers, and derive acceptance claims from tasks/PHASE_3.md, applicable
contracts, and tasks/BUGS.md. Do not inspect transcripts unless a specific code
decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify changed invariants with hostile deterministic repros rather than trusting
existing tests or implementation-derived models.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed defects in
tasks/BUGS.md and reopen the owning Phase 3 status; do not fix product code. Pass
only when no blocker/high finding or skill violation remains and `pnpm verify`
passes. On pass, mark Review 3 Complete and only Goal 4 Ready.
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
assert its Approval Bar. Run `pnpm fmt`, `pnpm lint`, and `pnpm verify` with no
accepted failures. Update the roadmap truthfully, mark Goal 4 Awaiting review and
Review 4 Ready, then stop without starting Phase 5.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Review 4 — Phase 4 code review

```text
/goal Independently review the completed Phase 4 implementation. Review the code,
not the implementation process.

Establish the implementation diff from Git, inspect changed production adapters,
their semantic owners, and direct callers, and derive acceptance claims from
tasks/PHASE_4.md, applicable contracts, and tasks/BUGS.md. Do not inspect transcripts
unless a specific code decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify changed invariants with hostile deterministic repros rather than trusting
existing tests or implementation-derived models.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed defects in
tasks/BUGS.md and reopen the owning Phase 4 status; do not fix product code. Pass
only when no blocker/high finding or skill violation remains and `pnpm verify`
passes. On pass, mark Review 4 Complete and only Goal 5 Ready.
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
accepted failures. Update the roadmap truthfully, mark Goal 5 Awaiting review and
Review 5 Ready, then stop.

Report the outcome, verification, thermo-nuclear disposition, residual blockers,
and commits.
```

## Review 5 — Final code review

```text
/goal Perform the final independent code review of the completed roadmap. Review
the shipped implementation and public package, not the implementation process.

Establish the phase diffs from Git, inspect changed production owners and direct
callers, and derive acceptance claims from TASK.md, every phase manifest,
applicable contracts, tasks/BUGS.md, source consumers, and packed consumers. Do not
inspect transcripts unless a specific code decision needs provenance.

Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its finding order and complete
Approval Bar govern this review; behavioral correctness alone cannot pass. Try to
falsify cross-phase invariants with hostile deterministic repros rather than
trusting existing tests, prior review labels, or implementation-derived models.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning phase. Record confirmed defects in
tasks/BUGS.md and reopen the earliest owning phase; do not fix product code. Pass
only when no blocker/high finding or skill violation remains and `pnpm verify`
passes for source and packed consumers. On pass, mark Review 5 and the roadmap
Complete.
```
