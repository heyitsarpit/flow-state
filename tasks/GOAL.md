# Copy-paste phase goals

[Back to the roadmap](../TASK.md)

Each fenced block below is a complete `/goal` prompt. Copy one block wholesale
into the code agent; do not prepend a shared procedure or add corrective prompt
overrides. The repository contains the authority, scope, and status. An
implementation goal remains active across fresh continuations, but each agent
turn completes and commits only one small correctness slice. After a phase
reaches its executable exit criteria, run its matching review goal in a new
session before starting the next phase.

Goal 0 and Review 0 are complete and superseded by Recovery. They are retained
in `TASK.md` as history and must not be rerun.

## Goal R — Recovery

```text
/goal Complete the Recovery phase in TASK.md as one persistent goal, but execute
exactly one next unchecked Recovery slice per agent turn. If that slice is too
large to finish safely, execute one coherent observable behavior within it and
leave the slice and this goal active.

At the start of every turn, re-read TASK.md, its Recovery section, only the
contracts and inventories directly applicable to the selected slice, relevant
production owners and callers, Git state, and live focused baselines. Re-derive
status from live files and tests; prior-turn summaries are navigation only.
Work strictly inside Recovery. Do not implement or redesign Phase 1-5 work.

For the selected slice, reproduce the observable failure with an existing
focused test and add a deterministic regression only when coverage is missing.
Then run Red -> Green -> Inspect -> Refactor -> thermo-nuclear review -> fix every
blocking finding -> full affected verification. The thermo-nuclear review must
adversarially inspect the changed code and tests for observable behavior, public
compatibility, exact Effect A/E/R, one semantic owner, app-bound ownership,
Scope and finalizers, generations, atomicity, failure lanes, weakened assertions,
casts at public seams, duplicate engines, and unrelated changes.

Implement the smallest production correction and directly affected tests.
Preserve supported calls, exports, aliases, wire vocabulary, exact Effect/Stream/
Layer channels, canonical resource and actor ownership, scoped lifecycle, and
unrelated work. Never treat a known failure, narrow green test, static check,
checkbox, or prior command claim as proof that a required red behavior passes.
Do not manufacture a failing test, accept a red baseline, weaken an assertion,
or build a second runtime/test engine to make callers pass.

If a semantic authority conflicts or the fix requires out-of-Recovery work,
do not guess or cross the phase boundary. Record the exact blocker and smallest
needed decision in TASK.md, make no speculative code change, and end the turn
with this goal active. Do not create receipts, command transcripts, planning
artifacts, prose-presence tests, package-size math, timing analysis, history
proofs, generated status reports, or unrelated cleanup. Do not rerun unrelated
passing suites.

On a successful slice, run the surface-based checks required by TASK.md, then
run `pnpm fmt && pnpm lint`, inspect the final diff, fix all blocking findings,
and rerun affected checks. Update only the completed Recovery checkbox and the
truthful next-slice/status marker in TASK.md, commit the verified code and tests
with that minimal status change, and end the agent turn to avoid context
degradation while keeping this /goal active. Do not start Review R or Phase 1.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal R complete only when every Recovery exit criterion passes without
accepted failures; then mark Goal R Awaiting review, make only Review R Ready,
and end the turn. The next user session will run Review R.
```

## Review R — Recovery review

```text
/goal Independently review the completed Recovery goal in TASK.md. This review
must evaluate the implementation session rather than continue its coding work.
Implementation session ID(s): <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, the Recovery scope, only its
applicable contracts and inventories, the complete supplied session transcript,
all commits made by that session, the live worktree and diff, relevant production
owners/callers, affected tests, and current focused baselines. Prior summaries,
checkboxes, receipts, and claimed command results are navigation only; re-derive
every completion claim from code, tests, Git, and live verification.

Audit whether the agent made real correctness progress, became confused, repeated
or abandoned work, optimized irrelevant metrics, weakened tests, hid failures,
took shortcuts, crossed into Phase 1-5, or declared completion from narrow proof.
Adversarially inspect compatibility, exact Effect A/E/R and Layer requirements,
canonical app/resource/actor ownership, Scope/finalizers, attachment leases,
generations, atomic publication, failure/defect/interruption lanes, casts at public
seams, and duplicate production or test engines. Confirm every repaired caller
uses registered ownership and every lifecycle claim has a deterministic proof.

Run only focused checks needed to verify findings; do not repeat passing suites
without a relevant reason. Do no package-size math, timing analysis, command-log
production, history archaeology, or prose-presence testing. If TASK.md or tasks/
contains a contradictory, redundant, misleading, or non-correctness requirement,
correct or delete it in the repository itself rather than compensating through a
prompt override. Preserve unrelated work.

Do not fix product-code defects inside this review goal. If blocking correctness
remains, mark Goal R Active, add or refine only the smallest truthful corrective
Recovery slice in TASK.md, keep Review R incomplete, commit any necessary task
correction, and stop without opening Phase 1. If Recovery is genuinely correct,
mark Goal R Complete, mark Review R Complete, make only Goal 1 Ready, commit the
minimal roadmap correction, and stop.

End with at most five short bullets: review verdict, evidence and exact command
exits, review commit SHA if any, reopened corrective slice or remaining blocker,
and the only next ready goal. Complete this /goal only after the repository records
either a truthful Recovery reopening or a passing Review R disposition.
```

## Goal 1 — Identity, runtime ownership, and lifecycle

```text
/goal Complete Phase 1 in tasks/PHASE_1.md as one persistent goal, but execute
exactly one next Phase 1 subsection or one smaller coherent correctness slice per
agent turn. Keep this goal active across fresh continuations until the complete
Phase 1 exit criteria pass. If TASK.md currently marks Goal 1 Ready, include its
change to Active in the first verified code-slice commit; do not make a separate
status-only commit.

At the start of every turn, re-read TASK.md, tasks/PHASE_1.md, only the contracts
and inventory rows directly applicable to the selected slice, completed Recovery
dependencies, relevant production owners and callers, Git state, and live focused
baselines. Re-derive status from live files and tests; prior-turn summaries are
navigation only. Work only on canonical identity, resource/actor ownership,
lifecycle, the Effect host, facts, and evidence owned by Phase 1. Do not implement
transaction policy, streams, timers, children, React, server/hydration, inspection,
CLI, or documentation work assigned to later phases.

For the selected slice, reproduce the observable failure with an existing focused
test and add a deterministic regression only when coverage is missing. Then run
Red -> Green -> Inspect -> Refactor -> thermo-nuclear review -> fix every blocking
finding -> full affected verification. The thermo-nuclear review must adversarially
inspect observable behavior, public compatibility, exact Effect A/E/R and Layer
requirements, collision-safe identity, one ResourceStore and actor owner, registry
authority before activation, Scope/finalizers, leases, exact eviction, bounded
evidence, observer isolation, casts, duplicate engines, and unrelated changes.

Implement the smallest production correction and directly affected tests.
Preserve supported calls, exports, aliases, wire vocabulary, exact Effect/Stream/
Layer channels, scoped lifecycle, and unrelated work. Never treat a known failure,
narrow green test, static check, checkbox, or prior command claim as proof that a
required red behavior passes. Do not manufacture red, accept failures, weaken
assertions, erase requirements, or build test-owned substitutes for production
semantics.

If a semantic authority conflicts or the fix belongs to a later phase, do not
guess or cross the boundary. Record the exact blocker and smallest needed decision
in TASK.md, make no speculative code change, and end the turn with this goal active.
Do not create receipts, command transcripts, planning artifacts, prose-presence
tests, package-size math, timing analysis, history proofs, generated reports, or
unrelated cleanup. Do not rerun unrelated passing suites.

On a successful slice, run the surface-based checks required by TASK.md, then run
`pnpm fmt && pnpm lint`, inspect the final diff, fix all blocking findings, and
rerun affected checks. Update only the truthful Phase 1 next-slice/status marker
in TASK.md, commit the verified code and tests with that minimal status change,
and end the agent turn to avoid context degradation while keeping this /goal
active. Do not start Review 1 or Phase 2.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal 1 complete only when all Phase 1 exit criteria pass; then mark Goal 1
Awaiting review, make only Review 1 Ready, and end the turn. The next user session
will run Review 1.
```

## Review 1 — Phase 1 review

```text
/goal Independently review the completed Phase 1 goal in TASK.md. This review
must evaluate the implementation session rather than continue its coding work.
Implementation session ID(s): <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, tasks/PHASE_1.md, only its applicable
contracts and inventories, the complete supplied session transcript, all commits
made by that session, the live worktree and diff, relevant production owners and
callers, affected tests, and current focused baselines. Treat summaries, checkboxes,
and claimed commands as navigation only; re-derive completion from executable
evidence.

Audit real progress, confusion, repeated or abandoned work, irrelevant metrics,
weakened tests, hidden failures, unsafe shortcuts, false completion, and leakage
into Phase 2-5. Adversarially inspect supported compatibility, collision-safe
identity, duplicate registries or stores, activation races, exact Effect A/E/R and
Layer requirements, canonical resource/actor ownership, Scope and finalizers,
attachment and keep-alive leases, exact eviction, bounded facts/evidence, observer
isolation, casts at public seams, and production/test delegation.

Run only focused checks needed to verify findings. Do no package-size math, timing
analysis, command-log production, history archaeology, prose-presence tests, or
unrelated suite reruns. Correct or delete bad correctness-plan requirements in the
repository itself, never through prompt overrides, and preserve unrelated work.

Do not fix product-code defects inside this review goal. If blocking correctness
remains, mark Goal 1 Active, record only the smallest truthful corrective Phase 1
slice in TASK.md, keep Review 1 incomplete, commit necessary task corrections,
and stop without opening Phase 2. If Phase 1 is genuinely correct, mark Goal 1 and
Review 1 Complete, make only Goal 2 Ready, commit the minimal roadmap correction,
and stop.

End with at most five short bullets: verdict, evidence and exact command exits,
review commit SHA if any, reopened slice or blocker, and the only next ready goal.
Complete this /goal only after recording either a truthful Phase 1 reopening or a
passing Review 1 disposition.
```

## Goal 2 — Transactions

```text
/goal Complete Phase 2 in tasks/PHASE_2.md as one persistent goal, but execute
exactly one next Phase 2 subsection or one smaller coherent correctness slice per
agent turn. Keep this goal active across fresh continuations until the complete
Phase 2 exit criteria pass. If TASK.md currently marks Goal 2 Ready, include its
change to Active in the first verified code-slice commit; do not make a separate
status-only commit.

At the start of every turn, re-read TASK.md, tasks/PHASE_2.md, only the contracts
and inventory rows directly applicable to the selected slice, completed Phase 1
owners, relevant production callers, Git state, and live focused baselines.
Re-derive status from live files and tests; prior-turn summaries are navigation
only. Work only on transaction generation, overlap policies, atomic preview and
restore, canonical transaction facts, and public transaction typing. Do not
redesign streams, timers, children, React, server, inspection, CLI, or docs.

For the selected slice, reproduce the observable failure with an existing focused
test and add a deterministic regression or independent model proof only when
coverage is missing. Then run Red -> Green -> Inspect -> Refactor -> thermo-nuclear
review -> fix every blocking finding -> full affected verification. Adversarially
inspect synchronous completion ordering, authority before work, generations,
allow/cancel/reject/serialize overlap, queue ownership, atomic preview/rollback,
stale completion, exact Effect A/E/R, typed failure/defect/interruption, independent
test oracles, public compatibility, casts, duplicate engines, and unrelated changes.

Implement the smallest production correction and directly affected tests using
the established Phase 1 owners. Preserve supported calls, exports, aliases, wire
vocabulary, exact Effect/Stream/Layer channels, scoped lifecycle, and unrelated
work. Never infer success from known failures, narrow green tests, static checks,
checkboxes, or prior claims. Do not manufacture red, weaken assertions, collapse
failure lanes, or create a second transaction/resource owner.

If a semantic authority conflicts or the fix belongs outside Phase 2, do not guess
or cross the boundary. Record the exact blocker and smallest needed decision in
TASK.md and end the turn with this goal active. Do not create receipts, command
transcripts, planning artifacts, prose-presence tests, package-size math, timing
analysis, history proofs, generated reports, or unrelated cleanup. Do not rerun
unrelated passing suites.

On a successful slice, run the surface-based checks required by TASK.md, then run
`pnpm fmt && pnpm lint`, inspect the final diff, fix all blocking findings, and
rerun affected checks. Update only the truthful Phase 2 next-slice/status marker
in TASK.md, commit the verified code and tests with that minimal status change,
and end the agent turn to avoid context degradation while keeping this /goal
active. Do not start Review 2 or Phase 3.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal 2 complete only when all Phase 2 exit criteria pass; then mark Goal 2
Awaiting review, make only Review 2 Ready, and end the turn. The next user session
will run Review 2.
```

## Review 2 — Phase 2 review

```text
/goal Independently review the completed Phase 2 goal in TASK.md. This review
must evaluate the implementation session rather than continue its coding work.
Implementation session ID(s): <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, tasks/PHASE_2.md, only its applicable
contracts and inventories, the complete supplied session transcript, all commits,
the live worktree and diff, relevant production owners/callers, affected tests,
and focused baselines. Re-derive every claim from executable evidence rather than
summaries, checkboxes, or claimed command results.

Audit real progress, confusion, repeated work, irrelevant metrics, weakened tests,
hidden failures, shortcuts, false completion, and leakage into Phase 3-5. Inspect
generation authority before synchronous work, stale completion, allow/cancel/
reject/serialize semantics, admission before work, queue ownership, atomic preview
and rollback, restore validation, exact Effect A/E/R, typed failure/defect/
interruption, public typing, independent model coverage, casts, and duplicate owners.

Run only focused checks needed to verify findings. Do no package-size math, timing
analysis, command logs, history archaeology, prose-presence tests, or unrelated
suite reruns. Correct or delete bad task requirements in the repository itself,
never through prompt overrides, and preserve unrelated work.

Do not fix product-code defects inside this review goal. If blocking correctness
remains, mark Goal 2 Active, record only the smallest corrective Phase 2 slice in
TASK.md, keep Review 2 incomplete, commit necessary task corrections, and stop
without opening Phase 3. If Phase 2 is genuinely correct, mark Goal 2 and Review 2
Complete, make only Goal 3 Ready, commit the minimal roadmap correction, and stop.

End with at most five short bullets: verdict, evidence and exact command exits,
review commit SHA if any, reopened slice or blocker, and the only next ready goal.
Complete this /goal only after recording either a truthful Phase 2 reopening or a
passing Review 2 disposition.
```

## Goal 3 — Transitions and actor-owned asynchronous work

```text
/goal Complete Phase 3 in tasks/PHASE_3.md as one persistent goal, but execute
exactly one next Phase 3 subsection or one smaller coherent correctness slice per
agent turn. Keep this goal active across fresh continuations until the complete
Phase 3 exit criteria pass. If TASK.md currently marks Goal 3 Ready, include its
change to Active in the first verified code-slice commit; do not make a separate
status-only commit.

At the start of every turn, re-read TASK.md, tasks/PHASE_3.md, only the contracts
and inventory rows directly applicable to the selected slice, completed Phase 1/2
owners, relevant production callers, Git state, and live focused baselines.
Re-derive status from live files and tests; prior-turn summaries are navigation
only. Work only on transition parity, stream lifecycle/pressure, timers, children,
supervision, generations, restore, and their public typing. Do not implement React,
server, hydration, inspection, CLI, or documentation work.

For the selected slice, reproduce the observable failure with an existing focused
test and add deterministic differential, TestClock, controlled-stream, or lifecycle
proof only when coverage is missing. Then run Red -> Green -> Inspect -> Refactor ->
thermo-nuclear review -> fix every blocking finding -> full affected verification.
Adversarially inspect production/test transition parity, stale emissions/fires/
completions, stream pressure and overflow, timers without real sleeps, child
generation/restore/supervision, exact Effect and Stream A/E/R, Scope/finalizers,
public compatibility, casts, duplicate engines, and unrelated changes.

Implement the smallest production correction and directly affected tests using
the established Phase 1/2 owners. Preserve supported calls, exports, aliases, wire
vocabulary, exact channels, scoped lifecycle, and unrelated work. Never infer
success from known failures, narrow green tests, static checks, checkboxes, or prior
claims. Do not manufacture red, weaken assertions, use timing luck, or implement a
second stream/timer/child engine in tests or adapters.

If a semantic authority conflicts or the fix belongs outside Phase 3, do not guess
or cross the boundary. Record the exact blocker and smallest needed decision in
TASK.md and end the turn with this goal active. Do not create receipts, command
transcripts, planning artifacts, prose-presence tests, package-size math, timing
analysis, history proofs, generated reports, or unrelated cleanup. Do not rerun
unrelated passing suites.

On a successful slice, run the surface-based checks required by TASK.md, then run
`pnpm fmt && pnpm lint`, inspect the final diff, fix all blocking findings, and
rerun affected checks. Update only the truthful Phase 3 next-slice/status marker
in TASK.md, commit the verified code and tests with that minimal status change,
and end the agent turn to avoid context degradation while keeping this /goal
active. Do not start Review 3 or Phase 4.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal 3 complete only when all Phase 3 exit criteria pass; then mark Goal 3
Awaiting review, make only Review 3 Ready, and end the turn. The next user session
will run Review 3.
```

## Review 3 — Phase 3 review

```text
/goal Independently review the completed Phase 3 goal in TASK.md. This review
must evaluate the implementation session rather than continue its coding work.
Implementation session ID(s): <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, tasks/PHASE_3.md, applicable contracts
and inventories, the complete supplied session transcript, all commits, the live
worktree and diff, relevant owners/callers, affected tests, and focused baselines.
Re-derive completion from executable evidence rather than summaries, checkboxes,
or claimed command results.

Audit real progress, confusion, repetition, irrelevant metrics, weakened tests,
hidden failures, shortcuts, false completion, and leakage into Phase 4/5. Inspect
production/test transition parity, stale emissions/fires/completions, bounded
stream pressure, TestClock use, timer disposal, child supervision/generation/
restore, exact Effect and Stream A/E/R, Scope/finalizers, public typing, casts,
and duplicate transition/stream/timer/child engines.

Run only focused checks needed to verify findings. Do no package-size math, timing
benchmarks, command logs, history archaeology, prose-presence tests, or unrelated
suite reruns. Correct or delete bad task requirements in the repository itself,
never through prompt overrides, and preserve unrelated work.

Do not fix product-code defects inside this review goal. If blocking correctness
remains, mark Goal 3 Active, record only the smallest corrective Phase 3 slice in
TASK.md, keep Review 3 incomplete, commit necessary task corrections, and stop
without opening Phase 4. If Phase 3 is genuinely correct, mark Goal 3 and Review 3
Complete, make only Goal 4 Ready, commit the minimal roadmap correction, and stop.

End with at most five short bullets: verdict, evidence and exact command exits,
review commit SHA if any, reopened slice or blocker, and the only next ready goal.
Complete this /goal only after recording either a truthful Phase 3 reopening or a
passing Review 3 disposition.
```

## Goal 4 — Adapters

```text
/goal Complete Phase 4 in tasks/PHASE_4.md as one persistent goal, but execute
exactly one next Phase 4 subsection or one smaller coherent correctness slice per
agent turn. Keep this goal active across fresh continuations until the complete
Phase 4 exit criteria pass. If TASK.md currently marks Goal 4 Ready, include its
change to Active in the first verified code-slice commit; do not make a separate
status-only commit.

At the start of every turn, re-read TASK.md, tasks/PHASE_4.md, only the contracts
and inventory rows directly applicable to the selected slice, completed production
owners from Phase 1-3, relevant adapter callers, Git state, and live focused
baselines. Re-derive status from live files and tests; prior summaries are
navigation only. Work only on testing/Scenario, React/views, server/hydration,
inspection, CLI, and Launch Workspace adapter behavior assigned to Phase 4.
Adapters must consume production semantics and may not repair core behavior by
implementing substitutes.

For the selected slice, reproduce the observable failure with an existing focused
test and add a deterministic regression only when coverage is missing. Then run
Red -> Green -> Inspect -> Refactor -> thermo-nuclear review -> fix every blocking
finding -> full affected verification. Adversarially inspect adapter delegation,
render purity, external-store semantics, Strict Mode leases, request isolation,
hostile decode/versioning, atomic attach/dehydrate, inspection projection, CLI
exit behavior, exact Effect A/E/R, public/packed compatibility, casts, duplicate
semantic owners, and unrelated changes.

Implement the smallest adapter correction and directly affected tests. Preserve
supported calls, exports, aliases, wire vocabulary, exact Effect/Stream/Layer
channels, scoped lifecycle, SSR/client boundaries, and unrelated work. Never infer
success from known failures, narrow green tests, static checks, checkboxes, or prior
claims. Do not manufacture red, weaken assertions, perform side effects during
render, share request state, or create adapter-owned runtime engines.

If a semantic authority conflicts or the fix requires changing an established
core owner outside Phase 4, do not guess or cross the boundary. Record the exact
blocker and smallest needed decision in TASK.md and end the turn with this goal
active. Do not create receipts, command transcripts, planning artifacts,
prose-presence tests, package-size math, timing analysis, history proofs, generated
reports, or unrelated cleanup. Do not rerun unrelated passing suites.

On a successful slice, run the surface-based checks required by TASK.md, including
only affected package/example/packed/docs checks, then run `pnpm fmt && pnpm lint`,
inspect the final diff, fix all blocking findings, and rerun affected checks.
Update only the truthful Phase 4 next-slice/status marker in TASK.md, commit the
verified code and tests with that minimal status change, and end the agent turn to
avoid context degradation while keeping this /goal active. Do not start Review 4
or Phase 5.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal 4 complete only when all Phase 4 exit criteria pass; then mark Goal 4
Awaiting review, make only Review 4 Ready, and end the turn. The next user session
will run Review 4.
```

## Review 4 — Phase 4 review

```text
/goal Independently review the completed Phase 4 goal in TASK.md. This review
must evaluate the implementation session rather than continue its coding work.
Implementation session ID(s): <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, tasks/PHASE_4.md, applicable contracts
and inventories, the complete supplied session transcript, all commits, the live
worktree and diff, relevant production owners/adapters, affected tests, and focused
baselines. Re-derive completion from executable evidence rather than summaries,
checkboxes, or claimed command results.

Audit real progress, confusion, repetition, irrelevant metrics, weakened tests,
hidden failures, shortcuts, false completion, and leakage into Phase 5. Inspect
testing delegation, bounded progress, render purity, external-store behavior,
leases and Strict Mode, request isolation, hostile decode/versioning, atomic
attach/dehydrate, evidence projection, CLI exits, exact Effect A/E/R, environment
and packed compatibility, casts, and every adapter that may have become a semantic
owner.

Run only focused checks needed to verify findings. Do no package-size math, timing
analysis, command logs, history archaeology, prose-presence tests, or unrelated
suite reruns. Correct or delete bad task requirements in the repository itself,
never through prompt overrides, and preserve unrelated work.

Do not fix product-code defects inside this review goal. If blocking correctness
remains, mark Goal 4 Active, record only the smallest corrective Phase 4 slice in
TASK.md, keep Review 4 incomplete, commit necessary task corrections, and stop
without opening Phase 5. If Phase 4 is genuinely correct, mark Goal 4 and Review 4
Complete, make only Goal 5 Ready, commit the minimal roadmap correction, and stop.

End with at most five short bullets: verdict, evidence and exact command exits,
review commit SHA if any, reopened slice or blocker, and the only next ready goal.
Complete this /goal only after recording either a truthful Phase 4 reopening or a
passing Review 4 disposition.
```

## Goal 5 — Deletion and final correctness

```text
/goal Complete Phase 5 in tasks/PHASE_5.md through P5.4 as one persistent goal,
but execute exactly one next Phase 5 subsection or one smaller coherent correctness
slice per agent turn. Keep this goal active across fresh continuations until the
complete Phase 5 exit criteria pass. If TASK.md currently marks Goal 5 Ready,
include its change to Active in the first verified code-slice commit; do not make
a separate status-only commit.

At the start of every turn, re-read TASK.md, tasks/PHASE_5.md, only the contracts
and inventories directly applicable to the selected slice, completed Phase 1-4
owners and adapters, relevant public/packed consumers, Git state, and live focused
baselines. Re-derive status from live files and tests; prior summaries are
navigation only. Work only on deleting displaced implementations, proving source
and packed compatibility, aligning user documentation with executable behavior,
and final correctness verification. Introduce no new architecture or feature
family.

For the selected slice, establish the live executable baseline and add a focused
proof only when coverage is missing. Then run Red when a real defect exists ->
Green -> Inspect -> Refactor -> thermo-nuclear review -> fix every blocking finding
-> full affected verification. Adversarially inspect one owner per capability,
obsolete engines and exports, exact Effect A/E/R, Scope/finalizers, source versus
packed declarations/runtime behavior, supported public compatibility, documentation
truth, weakened tests, casts, dead code, and unrelated changes.

Implement the smallest deletion, compatibility correction, documentation update,
or test correction required by the slice. Preserve supported calls, exports,
aliases, wire vocabulary, exact channels, scoped lifecycle, and unrelated work.
Never infer success from known failures, narrow green tests, static checks,
checkboxes, or prior claims. Do not manufacture red, keep duplicate implementations
for convenience, weaken assertions, or change public behavior accidentally.

If a semantic authority conflicts or the work reveals an unclosed earlier-phase
correctness defect, do not mask it in deletion/docs. Record the exact blocker and
smallest earlier-phase corrective slice in TASK.md, reopen that phase for review,
and end the turn without claiming Phase 5 progress. Do not create receipts, command
transcripts, planning artifacts, prose-presence tests, package-size math, timing
analysis, history proofs, generated reports, or unrelated cleanup. Do not rerun
unrelated passing suites.

On a successful slice, run the surface-based checks required by TASK.md, including
affected source, packed consumer, example, and docs checks, then run
`pnpm fmt && pnpm lint`, inspect the final diff, fix all blocking findings, and
rerun affected checks. Update only the truthful Phase 5 next-slice/status marker
in TASK.md, commit the verified changes with that minimal status change, and end
the agent turn to avoid context degradation while keeping this /goal active. Do
not start Review 5.

End each turn with at most five short bullets: slice and goal status, full commit
SHA, exact verification commands and exits, remaining blockers, and next slice.
Mark Goal 5 complete only when P5.1-P5.4 and the Phase 5 exit criteria pass; then
mark Goal 5 Awaiting review, make only Review 5 Ready, and end the turn. Only
Review 5 may complete the roadmap.
```

## Review 5 — Final review

```text
/goal Independently perform Review 5, the final correctness review of the entire
roadmap in TASK.md. This review must audit the finished implementation rather than
continue its coding work.
Implementation session ID(s) for Goal 5: <session-id-or-ids>
Earlier phase and review session ID(s), if available: <session-id-or-ids>

At the start, re-read TASK.md, tasks/GOAL.md, every completed phase manifest, only
the contracts and inventories needed to verify final claims, the supplied session
transcripts, all phase commits, the live worktree/history/diff, production owners,
public and packed consumers, tests, examples, documentation, and current baselines.
Treat summaries, checkboxes, receipts, and claimed commands as navigation only;
re-derive completion from code and executable evidence.

Audit whether the whole plan produced real correctness, where agents became
confused or repetitive, whether work was abandoned or duplicated, whether tests
were weakened, whether irrelevant metrics displaced correctness, whether shortcuts
or cross-phase drift survived, and whether any completion claim is false. Inspect
the supported API and wire vocabulary, exact Effect/Stream/Layer A/E/R, one semantic
owner per capability, identity and generations, concurrency and atomicity, Scope/
finalizers/leases, typed failure/defect/interruption, adapter delegation, request
isolation, source and packed compatibility, documentation truth, dead code, casts
at public seams, and duplicate production/test engines.

Run the full affected workspace verification needed to prove the final state, but
do no package-size math, timing analysis, command-log production, history theater,
or prose-presence tests. Do not rerun an unrelated expensive check without a
correctness reason. Correct or delete contradictory, redundant, misleading, or
non-correctness task requirements in the repository itself, never through prompt
overrides, and preserve unrelated work.

Do not fix product-code defects inside this review goal. If any blocking defect
remains, reopen its owning implementation goal, record only the smallest truthful
corrective slice in TASK.md, keep Review 5 and the roadmap incomplete, commit any
necessary task correction, and stop. If the codebase satisfies every final
definition-of-done claim, mark Goal 5 and Review 5 Complete and mark the correctness
roadmap Complete; commit the minimal final status correction and stop.

End with at most five short bullets: final verdict, evidence and exact command
exits, review commit SHA if any, reopened owner/slice or remaining blocker, and
whether the roadmap is complete. Complete this /goal only after the repository
records a truthful reopening or a fully evidenced final closure.
```
