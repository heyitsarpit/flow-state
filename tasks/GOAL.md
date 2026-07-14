# Copy-paste phase goals

[Back to the roadmap](../TASK.md)

Each block is a complete `/goal` prompt. Copy one block wholesale into the code
agent without a shared preamble or prompt override. Goal 0 and Review 0 are
complete, superseded by Recovery, and must not be rerun.

Implementation goals close existing defects or acceptance criteria in production
code. Review goals try to falsify that code. Process analysis and transcript
forensics are separate advisor work and are not prerequisites for either job.

## Goal R — Recovery

```text
/goal Complete the Recovery phase in TASK.md as one persistent goal, but execute
exactly one next unchecked Recovery slice per agent turn. If it is too large,
finish one coherent observable behavior and leave the slice and goal active.

Ground: At every turn start, re-read TASK.md, the active Recovery slice, only its directly
applicable linked contracts and inventories, relevant owners/callers, Git state,
and live baselines. Prior summaries are navigation only. Obey the Recovery lane,
correctness rules, exclusions, verification matrix, and exit criteria in TASK.md;
do not enter another phase.

Prepare: Before coding, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely and follow its required-reference routing for this slice. Reproduce the
real failure and add a deterministic failing proof only when coverage is missing.
Implement: Make the smallest production correction and affected tests, then run Red ->
Green -> Inspect -> Refactor. Preserve the supported public cutover contract, exact Effect A/E/R,
one semantic owner, scoped lifecycle, and unrelated work.

Review: After refactoring, re-read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and run its full review against
the changed code and tests. Fix every blocking or presumptive-blocker finding, then
repeat review -> fixes -> affected verification until the skill's approval bar
passes. Keep review-driven changes inside the selected slice.

Blocker: If authorities conflict or the fix requires another phase, record the exact
blocker in TASK.md and end the turn without guessing.

Close: On success, run the applicable checks from TASK.md and
`pnpm fmt && pnpm lint`, inspect the final diff, update only the
completed checkbox and next status, commit the verified slice, and end the turn to
avoid context degradation while keeping this /goal active. Do not start Review R
or Phase 1.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal R only when its executable exit
criteria pass; then mark Goal R Awaiting review, make only Review R Ready, and stop.
```

## Review R — Recovery review

```text
/goal Independently review the completed Recovery goal in TASK.md.
Implementation session ID(s): 019f5664-21f4-7c71-b5d2-fa05cd0fe538

Evidence: Re-read TASK.md, the Recovery scope, its applicable contracts, the
supplied transcript, all session commits and diffs, live production code/tests,
Git state, and focused baselines. Re-derive every claim from executable evidence;
summaries, checkboxes, and claimed commands are navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for this audit. Evaluate real progress, confusion, repeated or
pointless work, irrelevant metrics, shortcuts, weakened tests, hidden failures,
cross-phase drift, and false completion. Apply the review criteria already defined
by TASK.md and the Recovery contracts, and run only checks needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, mark Goal R Active, keep Review R incomplete, record the smallest Recovery
correction in TASK.md, commit necessary task cleanup, and stop. If it passes, mark
Goal R and Review R Complete, make only Goal 1 Ready, commit the minimal status or
task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened slice or blocker, and the only next ready goal. Complete this /goal
only after recording a truthful reopening or passing review disposition.
```

## Goal 1 — Identity, runtime ownership, and lifecycle

```text
/goal Complete Phase 1 in tasks/PHASE_1.md. Use the live roadmap and phase file to
select exactly one next coherent implementation slice from the current criterion.
The slice may implement missing behavior, refactor or migrate existing code, or
correct a production invariant, but it must materially advance that criterion
across every affected caller and public surface.

Before scoping the slice, inspect every BUG linked to the criterion and every open
BUG whose production owner or callers overlap the proposed change. Treat those
affected BUGs as mandatory acceptance conditions, prioritized by severity inside
the slice; do not select an unrelated BUG as the work item. One coherent slice may
close multiple BUGs when they share the same owner and correction. A new test,
fixture, oracle, task bullet, or partial lane is not a completed slice.

Read TASK.md status, the owning Phase 1 subsection, all affected BUG entries, and
the production owner plus direct callers. Open a linked contract only when it
resolves a semantic ambiguity. Do not inspect transcripts or reread unrelated
inventories.
Before designing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Use it to choose the simplest
Effect-native owner and structure before writing code.

Implement the selected behavior or refactor at the production owner. Reproduce
every affected known defect and add or update the smallest deterministic
table-driven regression that proves the slice. Carry exact Effect A/E/R,
authorization and identity, generation/stale publication, absence versus
undefined, boundedness, finalization, public source types, and packed declarations
only where the changed seam requires them. Do not build a second model or source-
text architecture test when behavior or type checking can prove the invariant.

After Green -> Inspect -> Refactor, re-read and apply the thermo-nuclear skill
completely to the final diff. Produce its ordered code-quality findings, fix every
blocking or presumptive-blocker finding, and repeat the review after fixes until
the Approval Bar passes. Explicitly assert why the resulting code meets that bar;
correct behavior alone is not approval. This is one mandatory self-review at
work-item close, not a review after every test command.

Use focused tests while iterating. When the coherent slice and all of its affected
BUG acceptance conditions are actually closed, run affected package tests/type
checks/build, `pnpm fmt`, and `pnpm lint` once, inspect the diff, update only the
proven BUG statuses and phase progress, and make one commit. Check the criterion
only when all of its acceptance requirements are complete. Do not commit proof-only
partial work. Run `pnpm verify` only at Phase 1 close. Report the implemented slice,
affected BUGs closed or remaining, criterion progress, thermo-nuclear disposition,
commit, failed commands, and next existing slice. Do not start Review 1 or Phase 2.
```

## Review 1 — Phase 1 code review

```text
/goal Perform an independent code review of Phase 1. Review implementation, not
the implementation process.
Implementation session ID(s): 019f5fb8-d216-7dd2-a656-e09d7bbe8e2d

Establish the implementation diff base, then inspect every changed production
file and its direct callers before trusting tests or status. Read the Phase 1
criteria, linked BUG entries, and applicable contract clauses only to derive
claims to attack. Session transcripts are optional provenance for a specific
suspicious decision; do not audit command counts, agent behavior, or ceremony.

Before auditing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its Output Expectations determine
finding order and its Approval Bar governs the review; behavioral correctness
alone cannot pass.

Try to falsify the implementation with focused repros for cross-app authority,
same-ID/different-instance identity, Proxy and mutable inputs, absence versus
undefined, failed and repeated cleanup, stale generations, unbounded ownership,
exact Effect A/E/R, public source types, and packed declarations. Existing green
tests and implementation-derived models are not independent proof.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed findings in
tasks/BUGS.md and reopen the exact Phase 1 checkbox/status; do not fix product code.
Treat every skill Approval Bar violation as a presumptive blocker. Pass only if no
blocker/high finding remains, the code explicitly satisfies the complete Approval
Bar, and one final `pnpm verify` passes. State the thermo-nuclear code-quality
disposition with concrete structural and Effect-native evidence. On pass, mark
Review 1 complete and only Goal 2 ready. Keep status edits minimal.
```

## Goal 2 — Transactions

```text
/goal Complete Phase 2 in tasks/PHASE_2.md. Use the live roadmap and phase file to
select exactly one next coherent implementation slice from the current criterion.
The slice may implement missing transaction behavior, refactor or migrate an
existing path, or correct a production invariant, but it must materially advance
that criterion across every affected caller and public surface.

Before scoping the slice, inspect every BUG linked to the criterion and every open
BUG whose production owner or callers overlap the proposed change. Treat those
affected BUGs as mandatory acceptance conditions, prioritized by severity inside
the slice; do not select an unrelated BUG as the work item. One coherent slice may
close multiple BUGs when they share the same owner and correction. A new test,
fixture, oracle, task bullet, or partial outcome lane is not a completed slice.

Read TASK.md status, the owning Phase 2 subsection, all affected BUG entries, and
the production owner plus direct callers. Open a linked contract only when it
resolves a semantic ambiguity. Do not inspect transcripts or reread unrelated
inventories.
Before designing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Use it to choose the simplest
Effect-native owner and structure before writing code.

Implement the selected behavior or refactor at the production owner. Reproduce
every affected known defect and add or update the smallest deterministic
table-driven regression that covers all affected success, failure, defect,
interruption, rejection, and stale lanes. Check atomic preview/rollback,
generation ownership, scoped queues, exact Effect A/E/R, public source types, and
packed declarations where affected. Do not create one fixture, oracle, or commit
per outcome lane, and do not copy production logic into a model.

After Green -> Inspect -> Refactor, re-read and apply the thermo-nuclear skill
completely to the final diff. Produce its ordered code-quality findings, fix every
blocking or presumptive-blocker finding, and repeat the review after fixes until
the Approval Bar passes. Explicitly assert why the resulting code meets that bar;
correct behavior alone is not approval. This is one mandatory self-review at
work-item close, not a review after every test command.

Use focused tests while iterating. When the coherent slice and all of its affected
BUG acceptance conditions are actually closed, run affected package tests/type
checks/build, `pnpm fmt`, and `pnpm lint` once, inspect the diff, update only the
proven BUG statuses and phase progress, and make one commit. Check the criterion
only when all of its acceptance requirements are complete. Do not commit proof-only
partial work. Run `pnpm verify` only at Phase 2 close. Report the implemented slice,
affected BUGs closed or remaining, criterion progress, thermo-nuclear disposition,
commit, failed commands, and next existing slice. Do not start Review 2 or Phase 3.
```

## Review 2 — Phase 2 code review

```text
/goal Perform an independent code review of Phase 2. Review implementation, not
the implementation process.
Implementation session ID(s): 019f5aea-2118-7670-8ef8-569324934b8f, 019f5b5c-a74e-76c0-a808-8c6c1e344f8b

Establish the implementation diff base, then inspect every changed production
file and its direct callers before trusting tests or status. Read the Phase 2
criteria, linked BUG entries, and applicable contract clauses only to derive
claims to attack. Session transcripts are optional provenance for a specific
suspicious decision; do not audit command counts, agent behavior, or ceremony.

Before auditing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its Output Expectations determine
finding order and its Approval Bar governs the review; behavioral correctness
alone cannot pass.

Try to falsify the implementation with focused repros for two parameterized refs
of one descriptor, atomic preview and rollback, stale and replacement generations,
scoped serialize queues, capacity, external side effects after cancellation,
success/failure/defect/interruption parity, exact Effect A/E/R, public source
types, and packed declarations. Existing green tests and implementation-derived
models are not independent proof.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed findings in
tasks/BUGS.md and reopen the exact Phase 2 checkbox/status; do not fix product code.
Treat every skill Approval Bar violation as a presumptive blocker. Pass only if no
blocker/high finding remains, the code explicitly satisfies the complete Approval
Bar, and one final `pnpm verify` passes. State the thermo-nuclear code-quality
disposition with concrete structural and Effect-native evidence. On pass, mark
Review 2 complete and only Goal 3 ready. Keep status edits minimal.
```

## Goal 3 — Transitions and actor-owned asynchronous work

```text
/goal Complete Phase 3 in tasks/PHASE_3.md. Use the live roadmap and phase file to
select exactly one next coherent implementation slice from the current criterion.
The slice may implement missing transition, stream, timer, or child behavior,
refactor or migrate an existing path, or correct a production invariant, but it
must materially advance that criterion across every affected caller and surface.

Before scoping the slice, inspect every BUG linked to the criterion and every open
BUG whose production owner or callers overlap the proposed change. Treat those
affected BUGs as mandatory acceptance conditions, prioritized by severity inside
the slice; do not select an unrelated BUG as the work item. One coherent slice may
close multiple BUGs when they share the same owner and correction. A new test,
fixture, oracle, task bullet, or partial outcome lane is not a completed slice.

Read TASK.md status, the owning Phase 3 subsection, all affected BUG entries, and
the production owner plus direct callers. Open a linked contract only when it
resolves a semantic ambiguity. Do not inspect transcripts or reread unrelated
inventories.
Before designing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Use it to choose the simplest
Effect-native owner and structure before writing code.

Implement the selected behavior or refactor at the production owner. Reproduce
every affected known defect and add or update the smallest deterministic
table-driven regression that covers the affected outcome and lifecycle lanes.
Check transition ordering, stale generation publication, child/timer/stream Scope,
bounded pressure, flush ownership, present undefined, exact Effect A/E/R, public
source types, and packed declarations where affected. Extend an existing oracle
instead of creating one per interleaving, and keep any model independent of the
production decisions it checks.

After Green -> Inspect -> Refactor, re-read and apply the thermo-nuclear skill
completely to the final diff. Produce its ordered code-quality findings, fix every
blocking or presumptive-blocker finding, and repeat the review after fixes until
the Approval Bar passes. Explicitly assert why the resulting code meets that bar;
correct behavior alone is not approval. This is one mandatory self-review at
work-item close, not a review after every test command.

Use focused tests while iterating. When the coherent slice and all of its affected
BUG acceptance conditions are actually closed, run affected package tests/type
checks/build, `pnpm fmt`, and `pnpm lint` once, inspect the diff, update only the
proven BUG statuses and phase progress, and make one commit. Check the criterion
only when all of its acceptance requirements are complete. Do not commit proof-only
partial work. Run `pnpm verify` only at Phase 3 close. Report the implemented slice,
affected BUGs closed or remaining, criterion progress, thermo-nuclear disposition,
commit, failed commands, and next existing slice. Do not start Review 3 or Phase 4.
```

## Review 3 — Phase 3 code review

```text
/goal Perform an independent code review of Phase 3. Review implementation, not
the implementation process.
Implementation session ID(s): 019f5b7c-f936-7250-9946-e32b2c4c6492, 019f5c55-60ad-7eb1-9168-fdd5a7f8008a, 019f5ce1-2112-7c32-a839-e106f01823d0, 019f5d45-741d-7990-850b-77b6bf314801, 019f5e93-55ea-7621-a6a0-fbfb037fb2da

Establish the implementation diff base, then inspect every changed production
file and its direct callers before trusting tests or status. Read the Phase 3
criteria, linked BUG entries, and applicable contract clauses only to derive
claims to attack. Session transcripts are optional provenance for a specific
suspicious decision; do not audit command counts, agent behavior, or ceremony.

Before auditing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its Output Expectations determine
finding order and its Approval Bar governs the review; behavioral correctness
alone cannot pass.

Try to falsify transition ordering, synchronous completion, stale replacement,
stream capacity and unique-key coalescing, emitted undefined, child incarnation
and retry/stop flush ownership, timer restore ownership, finalizers, exact Effect
A/E/R, public source types, and packed declarations. Compare any differential
model with its imports and reject shared decision logic as an oracle. Existing
green tests are not independent proof.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed findings in
tasks/BUGS.md and reopen the exact Phase 3 checkbox/status; do not fix product code.
Treat every skill Approval Bar violation as a presumptive blocker. Pass only if no
blocker/high finding remains, the code explicitly satisfies the complete Approval
Bar, and one final `pnpm verify` passes. State the thermo-nuclear code-quality
disposition with concrete structural and Effect-native evidence. On pass, mark
Review 3 complete and only Goal 4 ready. Keep status edits minimal.
```

## Goal 4 — Adapters

```text
/goal Complete Phase 4 in tasks/PHASE_4.md. Use the live roadmap and phase file to
select exactly one next coherent adapter implementation or refactor slice from the
current criterion. The slice must materially advance that criterion by delegating
to the production semantic owner across every affected caller and public surface.

Before scoping the slice, inspect every BUG linked to the criterion and every open
BUG whose adapter, production owner, or callers overlap the proposed change. Treat
those affected BUGs as mandatory acceptance conditions, prioritized by severity
inside the slice; do not select an unrelated BUG as the work item. One coherent
slice may close multiple BUGs when they share the same owner and correction. A new
test, fixture, oracle, task bullet, or partial adapter is not a completed slice.

Read TASK.md status, the owning Phase 4 subsection, all affected BUG entries, and
the adapter plus its production owner and direct callers. Open a linked contract
only when it resolves a semantic ambiguity. Do not inspect transcripts or reread
unrelated inventories. Before designing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Use it to choose the simplest
Effect-native owner and structure before writing code.

Implement the selected adapter behavior or refactor through its production owner.
Reproduce every affected known defect and add or update the smallest deterministic
table-driven regression. Check that Flow Test, React, server,
inspection, CLI, hydration, and packed consumers do not copy semantic decisions,
execute client code during probing/render, fork identity, leak Scope, or widen
public types where affected. Prefer behavior/type proof over source-text assertions.

After Green -> Inspect -> Refactor, re-read and apply the thermo-nuclear skill
completely to the final diff. Produce its ordered code-quality findings, fix every
blocking or presumptive-blocker finding, and repeat the review after fixes until
the Approval Bar passes. Explicitly assert why the resulting code meets that bar;
correct behavior alone is not approval. This is one mandatory self-review at
work-item close, not a review after every test command.

Use focused tests while iterating. When the coherent slice and all of its affected
BUG acceptance conditions are actually closed, run affected package tests/type
checks/build, `pnpm fmt`, and `pnpm lint` once, inspect the diff, update only the
proven BUG statuses and phase progress, and make one commit. Check the criterion
only when all of its acceptance requirements are complete. Do not commit proof-only
partial work. Run `pnpm verify` only at Phase 4 close. Report the implemented slice,
affected BUGs closed or remaining, criterion progress, thermo-nuclear disposition,
commit, failed commands, and next existing slice. Do not start Review 4 or Phase 5.
```

## Review 4 — Phase 4 code review

```text
/goal Perform an independent code review of Phase 4. Review implementation, not
the implementation process.
Implementation session ID(s): <session-id-or-ids>

Establish the implementation diff base, then inspect every changed production
adapter and the production owner it should delegate to before trusting tests or
status. Read the Phase 4 criteria, linked BUG entries, and applicable contract
clauses only to derive claims to attack. Session transcripts are optional
provenance for a specific suspicious decision; do not audit agent behavior.

Before auditing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its Output Expectations determine
finding order and its Approval Bar governs the review; behavioral correctness
alone cannot pass.

Try to falsify Flow Test/runtime parity, React aborted render and Strict Mode
cleanup, inert probing, hydration all-or-nothing validation, cross-owner boot
barriers, inspection bounds/redaction, CLI behavior, exact Effect A/E/R, public
source types, and packed declarations. Search for copied semantic logic and
adapter-owned caches/interpreters. Existing green tests are not independent proof.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning criterion. Record confirmed findings in
tasks/BUGS.md and reopen the exact Phase 4 checkbox/status; do not fix product code.
Treat every skill Approval Bar violation as a presumptive blocker. Pass only if no
blocker/high finding remains, the code explicitly satisfies the complete Approval
Bar, and one final `pnpm verify` passes. State the thermo-nuclear code-quality
disposition with concrete structural and Effect-native evidence. On pass, mark
Review 4 complete and only Goal 5 ready. Keep status edits minimal.
```

## Goal 5 — Deletion and final correctness

```text
/goal Complete Phase 5 through P5.4 in tasks/PHASE_5.md. Use the live roadmap and
phase file to select exactly one next coherent deletion, migration, or final
correctness slice from the current criterion. The slice must materially advance
that criterion across source, packed output, consumers, and docs.

Before scoping the slice, inspect every BUG linked to the criterion and every open
BUG whose obsolete path, production owner, or consumers overlap the proposed
change. Treat those affected BUGs as mandatory acceptance conditions, prioritized
by severity inside the slice; do not select an unrelated BUG as the work item. One
coherent slice may close multiple BUGs when they share the same owner and
correction. Evidence-only work is not a completed slice.

Read TASK.md status, the owning Phase 5 subsection, all affected BUG entries, and
the production owner plus direct consumers. Open a linked contract only when it
resolves a semantic ambiguity. Do not inspect transcripts or reread unrelated
inventories. Before designing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Use it to choose the simplest
Effect-native owner and structure before writing code.

Establish the live baseline, implement the selected deletion, migration, or
correction, and reproduce every affected known defect. Add or update only the
smallest regression needed to prove the slice. Check dead aliases and owners,
source/packed parity, exact Effect A/E/R, public declarations, examples, docs, and
repository searches where affected. Do not preserve obsolete paths to keep stale
source-text tests green, and do not introduce a new architecture in cleanup.

After Inspect -> Refactor, re-read and apply the thermo-nuclear skill completely
to the final diff. Produce its ordered code-quality findings, fix every blocking
or presumptive-blocker finding, and repeat the review after fixes until the
Approval Bar passes. Explicitly assert why the resulting code meets that bar;
correct behavior alone is not approval. This is one mandatory self-review at
work-item close, not a review after every test command.

Use focused tests while iterating. When the coherent slice and all of its affected
BUG acceptance conditions are actually closed, run affected package tests/type
checks/build, `pnpm fmt`, and `pnpm lint` once, inspect the diff, update only the
proven BUG statuses and phase progress, and make one commit. Check the criterion
only when all of its acceptance requirements are complete. Do not commit proof-only
partial work. Run `pnpm verify` only at Phase 5 close. Report the implemented slice,
affected BUGs closed or remaining, criterion progress, thermo-nuclear disposition,
commit, failed commands, and next existing slice. Do not start Review 5.
```

## Review 5 — Final code review

```text
/goal Perform the final independent code review of the completed roadmap. Review
the shipped implementation and public package, not the implementation process.
Goal 5 implementation session ID(s): <session-id-or-ids>
Earlier implementation/review session ID(s), if needed: <session-id-or-ids>

Establish phase commit ranges, inspect changed production owners and their direct
callers, and test the source and packed public surfaces before trusting phase
status. Use phase criteria, BUG entries, and contracts to derive claims to attack.
Transcripts are optional provenance for a specific suspicious decision; do not
spend review time measuring model behavior, command counts, or task ceremony.

Before auditing, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, including its required references. Its Output Expectations determine
finding order and its Approval Bar governs the review; behavioral correctness
alone cannot pass.

Try to falsify cross-phase identity/authority, atomicity, stale generations,
Scope/finalizers, bounded collections, absence versus undefined, synchronous
completion, adapter delegation, hydration, exact Effect A/E/R, source/packed type
parity, and removal of obsolete owners. Search for duplicate semantic engines and
self-referential oracles. Existing green tests and prior review labels are not
independent proof.

Report findings first, ordered by severity, with file/line, mechanism, executable
evidence, missing regression, and owning phase. Record confirmed findings in
tasks/BUGS.md and reopen the earliest owning checkbox/status; do not fix product
code. Treat every skill Approval Bar violation as a presumptive blocker. Pass only
if no blocker/high finding remains, the code explicitly satisfies the complete
Approval Bar, and one final `pnpm verify` passes against both source and packed
consumers. State the thermo-nuclear code-quality disposition with concrete
structural and Effect-native evidence. On pass, mark Review 5 and the roadmap
complete with only minimal status edits.
```
