# Copy-paste phase goals

[Back to the roadmap](../TASK.md)

Each block is a complete `/goal` prompt. Copy one block wholesale into the code
agent without a shared preamble or prompt override. Goal 0 and Review 0 are
complete, superseded by Recovery, and must not be rerun.

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
/goal Complete Phase 1 in tasks/PHASE_1.md as one persistent goal, but execute
exactly one next Phase 1 subsection or one coherent smaller slice per agent turn.
Keep the goal active across fresh continuations until all Phase 1 exit criteria pass.

Ground: At every turn start, re-read TASK.md, tasks/PHASE_1.md, only the selected slice's
directly applicable contracts and inventories, relevant owners/callers, Git state,
and live baselines. Prior summaries are navigation only. Obey the phase lane,
correctness rules, exclusions, verification matrix, and exit criteria in the live
task files; do not enter Phase 2-5.

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

Blocker: If authorities conflict or the fix belongs to another phase, record the
exact blocker in TASK.md and end without guessing.

Close: On success, run the applicable checks and `pnpm fmt && pnpm lint`, inspect
the final diff, update only the truthful next
slice/status marker, commit the verified slice, and end the turn to avoid context
degradation while keeping this /goal active. If Goal 1 was Ready, include its move
to Active in the first code-slice commit. Do not start Review 1 or Phase 2.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal 1 only when its executable exit
criteria pass; then mark Goal 1 Awaiting review, make only Review 1 Ready, and stop.
```

## Review 1 — Phase 1 review

```text
/goal Independently review the completed Phase 1 goal in TASK.md.
Implementation session ID(s): 019f56b3-4132-79f0-8ee9-05c5d424dc46,

Evidence: Re-read TASK.md, tasks/PHASE_1.md, applicable contracts, the supplied
transcript, all session commits and diffs, live production code/tests, Git state,
and focused baselines. Re-derive every claim from executable evidence; summaries,
checkboxes, and claimed commands are navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for this audit. Evaluate real progress, confusion, repeated or
pointless work, irrelevant metrics, shortcuts, weakened tests, hidden failures,
cross-phase drift, and false completion. Apply the review criteria in the live task
files and run only checks needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, mark Goal 1 Active, keep Review 1 incomplete, record the smallest Phase 1
correction in TASK.md, commit necessary task cleanup, and stop. If it passes, mark
Goal 1 and Review 1 Complete, make only Goal 2 Ready, commit the minimal status or
task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened slice or blocker, and the only next ready goal. Complete this /goal
only after recording a truthful reopening or passing review disposition.
```

## Goal 2 — Transactions

```text
/goal Complete Phase 2 in tasks/PHASE_2.md as one persistent goal, but execute
exactly one next Phase 2 subsection or one coherent smaller slice per agent turn.
Keep the goal active across fresh continuations until all Phase 2 exit criteria pass.

Ground: At every turn start, re-read TASK.md, tasks/PHASE_2.md, only the selected slice's
directly applicable contracts and inventories, relevant owners/callers, Git state,
and live baselines. Prior summaries are navigation only. Obey the phase lane,
correctness rules, exclusions, verification matrix, and exit criteria in the live
task files; do not enter Phase 3-5.

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

Blocker: If authorities conflict or the fix belongs to another phase, record the
exact blocker in TASK.md and end without guessing.

Close: On success, run the applicable checks and `pnpm fmt && pnpm lint`, inspect
the final diff, update only the truthful next
slice/status marker, commit the verified slice, and end the turn to avoid context
degradation while keeping this /goal active. If Goal 2 was Ready, include its move
to Active in the first code-slice commit. Do not start Review 2 or Phase 3.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal 2 only when its executable exit
criteria pass; then mark Goal 2 Awaiting review, make only Review 2 Ready, and stop.
```

## Review 2 — Phase 2 review

```text
/goal Independently review the completed Phase 2 goal in TASK.md.
Implementation session ID(s): <session-id-or-ids>

Evidence: Re-read TASK.md, tasks/PHASE_2.md, applicable contracts, the supplied
transcript, all session commits and diffs, live production code/tests, Git state,
and focused baselines. Re-derive every claim from executable evidence; summaries,
checkboxes, and claimed commands are navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for this audit. Evaluate real progress, confusion, repeated or
pointless work, irrelevant metrics, shortcuts, weakened tests, hidden failures,
cross-phase drift, and false completion. Apply the review criteria in the live task
files and run only checks needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, mark Goal 2 Active, keep Review 2 incomplete, record the smallest Phase 2
correction in TASK.md, commit necessary task cleanup, and stop. If it passes, mark
Goal 2 and Review 2 Complete, make only Goal 3 Ready, commit the minimal status or
task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened slice or blocker, and the only next ready goal. Complete this /goal
only after recording a truthful reopening or passing review disposition.
```

## Goal 3 — Transitions and actor-owned asynchronous work

```text
/goal Complete Phase 3 in tasks/PHASE_3.md as one persistent goal, but execute
exactly one next Phase 3 subsection or one coherent smaller slice per agent turn.
Keep the goal active across fresh continuations until all Phase 3 exit criteria pass.

Ground: At every turn start, re-read TASK.md, tasks/PHASE_3.md, only the selected slice's
directly applicable contracts and inventories, relevant owners/callers, Git state,
and live baselines. Prior summaries are navigation only. Obey the phase lane,
correctness rules, exclusions, verification matrix, and exit criteria in the live
task files; do not enter Phase 4-5.

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

Blocker: If authorities conflict or the fix belongs to another phase, record the
exact blocker in TASK.md and end without guessing.

Close: On success, run the applicable checks and `pnpm fmt && pnpm lint`, inspect
the final diff, update only the truthful next
slice/status marker, commit the verified slice, and end the turn to avoid context
degradation while keeping this /goal active. If Goal 3 was Ready, include its move
to Active in the first code-slice commit. Do not start Review 3 or Phase 4.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal 3 only when its executable exit
criteria pass; then mark Goal 3 Awaiting review, make only Review 3 Ready, and stop.
```

## Review 3 — Phase 3 review

```text
/goal Independently review the completed Phase 3 goal in TASK.md.
Implementation session ID(s): <session-id-or-ids>

Evidence: Re-read TASK.md, tasks/PHASE_3.md, applicable contracts, the supplied
transcript, all session commits and diffs, live production code/tests, Git state,
and focused baselines. Re-derive every claim from executable evidence; summaries,
checkboxes, and claimed commands are navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for this audit. Evaluate real progress, confusion, repeated or
pointless work, irrelevant metrics, shortcuts, weakened tests, hidden failures,
cross-phase drift, and false completion. Apply the review criteria in the live task
files and run only checks needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, mark Goal 3 Active, keep Review 3 incomplete, record the smallest Phase 3
correction in TASK.md, commit necessary task cleanup, and stop. If it passes, mark
Goal 3 and Review 3 Complete, make only Goal 4 Ready, commit the minimal status or
task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened slice or blocker, and the only next ready goal. Complete this /goal
only after recording a truthful reopening or passing review disposition.
```

## Goal 4 — Adapters

```text
/goal Complete Phase 4 in tasks/PHASE_4.md as one persistent goal, but execute
exactly one next Phase 4 subsection or one coherent smaller slice per agent turn.
Keep the goal active across fresh continuations until all Phase 4 exit criteria pass.

Ground: At every turn start, re-read TASK.md, tasks/PHASE_4.md, only the selected slice's
directly applicable contracts and inventories, relevant owners/callers, Git state,
and live baselines. Prior summaries are navigation only. Obey the phase lane,
correctness rules, exclusions, verification matrix, and exit criteria in the live
task files; do not enter Phase 5.

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

Blocker: If authorities conflict or the fix belongs to another phase, record the
exact blocker in TASK.md and end without guessing.

Close: On success, run the applicable checks and `pnpm fmt && pnpm lint`, inspect
the final diff, update only the truthful next
slice/status marker, commit the verified slice, and end the turn to avoid context
degradation while keeping this /goal active. If Goal 4 was Ready, include its move
to Active in the first code-slice commit. Do not start Review 4 or Phase 5.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal 4 only when its executable exit
criteria pass; then mark Goal 4 Awaiting review, make only Review 4 Ready, and stop.
```

## Review 4 — Phase 4 review

```text
/goal Independently review the completed Phase 4 goal in TASK.md.
Implementation session ID(s): <session-id-or-ids>

Evidence: Re-read TASK.md, tasks/PHASE_4.md, applicable contracts, the supplied
transcript, all session commits and diffs, live production code/tests, Git state,
and focused baselines. Re-derive every claim from executable evidence; summaries,
checkboxes, and claimed commands are navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for this audit. Evaluate real progress, confusion, repeated or
pointless work, irrelevant metrics, shortcuts, weakened tests, hidden failures,
cross-phase drift, and false completion. Apply the review criteria in the live task
files and run only checks needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, mark Goal 4 Active, keep Review 4 incomplete, record the smallest Phase 4
correction in TASK.md, commit necessary task cleanup, and stop. If it passes, mark
Goal 4 and Review 4 Complete, make only Goal 5 Ready, commit the minimal status or
task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened slice or blocker, and the only next ready goal. Complete this /goal
only after recording a truthful reopening or passing review disposition.
```

## Goal 5 — Deletion and final correctness

```text
/goal Complete Phase 5 in tasks/PHASE_5.md through P5.4 as one persistent goal,
but execute exactly one next Phase 5 subsection or one coherent smaller slice per
agent turn. Keep the goal active across fresh continuations until all Phase 5 exit
criteria pass.

Ground: At every turn start, re-read TASK.md, tasks/PHASE_5.md, only the selected slice's
directly applicable contracts and inventories, relevant owners/callers/consumers,
Git state, and live baselines. Prior summaries are navigation only. Obey the phase
lane, correctness rules, exclusions, verification matrix, and exit criteria in the
live task files; introduce no new architecture or feature family.

Prepare: Before changing code or docs, read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely and follow its required-reference routing for this slice. Establish the
real baseline and add deterministic proof only when coverage is missing. Implement
Implement: Make the smallest deletion or correction and affected tests/docs, then run Red -> Green
when a real defect exists -> Inspect -> Refactor. Preserve the supported public
cutover contract, exact Effect A/E/R, one semantic owner, scoped lifecycle, and
unrelated work.

Review: After refactoring, re-read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and run its full review against
the changed code, tests, and documentation. Fix every blocking or
presumptive-blocker finding, then repeat review -> fixes -> affected verification
until the skill's approval bar passes. Keep review-driven changes inside the
selected slice.

Blocker: If authorities conflict or an earlier phase remains incorrect, reopen its
owning goal in TASK.md and end without masking the defect.

Close: On success, run the applicable checks and `pnpm fmt && pnpm lint`, inspect
the final diff, update only the truthful
next slice/status marker, commit the verified slice, and end the turn to avoid
context degradation while keeping this /goal active. If Goal 5 was Ready, include
its move to Active in the first code-slice commit. Do not start Review 5.

Report: End with at most five short bullets: slice/status, full commit SHA, exact command
exits, blockers, and next slice. Complete Goal 5 only when P5.1-P5.4 and its exit
criteria pass; then mark Goal 5 Awaiting review, make only Review 5 Ready, and stop.
```

## Review 5 — Final review

```text
/goal Independently perform Review 5, the final correctness review of TASK.md.
Goal 5 implementation session ID(s): <session-id-or-ids>
Earlier implementation/review session ID(s), if available: <session-id-or-ids>

Evidence: Re-read TASK.md, every phase manifest, applicable contracts, the
supplied transcripts, phase commits and diffs, live production code/tests, public
and packed consumers, Git state, and current baselines. Re-derive every completion
claim from executable evidence; summaries, checkboxes, and claimed commands are
navigation only.

Audit: Read and apply
`/Users/arpit/Developer/flow-state/skills/thermo-nuclear-code-quality-review/SKILL.md`
completely, follow its required-reference routing, and use its ordered findings and
approval bar for the final audit. Evaluate the full roadmap for real correctness,
confusion, repeated or pointless work, irrelevant metrics, shortcuts, weakened
tests, hidden failures, cross-phase drift, false completion, dead code, and
duplicate owners. Apply the final review and definition-of-done criteria in the
live task files and run the full affected verification needed to prove findings.

Disposition: Correct or delete bad task requirements in the repository itself, never through a
prompt override. Do not fix product-code defects in this review. If correctness is
blocked, reopen the owning implementation goal, record its smallest correction in
TASK.md, keep Review 5 incomplete, commit necessary task cleanup, and stop. If it
passes, mark Goal 5 and Review 5 Complete, mark the roadmap Complete, commit the
minimal final status or task cleanup, and stop.

Report: End with at most five short bullets: verdict, evidence/command exits, review commit
SHA, reopened owner/slice or blocker, and roadmap status. Complete this /goal only
after recording a truthful reopening or fully evidenced final closure.
```
