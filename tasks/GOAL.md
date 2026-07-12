# Phase goals

[Back to the roadmap](../TASK.md)

The correctness plan runs as separate phase-scoped goals. An implementation
goal may continue across several fresh turns, but every turn completes only one
small code slice. After the implementation goal reaches its executable exit
criteria, the user starts the matching review goal in a new session. The review
must pass before the next phase goal starts.

## Goal sequence

| Implementation goal | Scope                                            | Required follow-up               |
| ------------------- | ------------------------------------------------ | -------------------------------- |
| Goal 0              | Phase 0 contracts and proof foundation; complete | Review 0; superseded by Recovery |
| Goal R              | Recovery repairs                                 | Review R                         |
| Goal 1              | Phase 1 identity, runtime ownership, lifecycle   | Review 1                         |
| Goal 2              | Phase 2 transaction semantics                    | Review 2                         |
| Goal 3              | Phase 3 transitions, streams, timers, children   | Review 3                         |
| Goal 4              | Phase 4 testing, React, server, inspection, CLI  | Review 4                         |
| Goal 5              | Phase 5 deletion and final correctness           | Review 5                         |

## Implementation-goal contract

Every implementation goal follows this contract without adding overrides:

- Work only inside the named phase and its valid completed dependencies.
- At the start of each continuation, re-read `TASK.md` and the active phase
  manifest. Prior summaries are navigation, not status or test evidence.
- Complete one observable behavior, public type invariant, ownership seam, or
  lifecycle family per turn. If a listed slice is too large, finish a coherent
  subset and leave the phase goal active.
- Read only contracts and inventories directly applicable to the slice.
- Implement production code and deterministic affected tests. Do not create
  receipts, planning artifacts, artificial red states, or unrelated cleanup.
- Run only verification justified by the changed surface, review the diff once,
  update the next-slice marker, commit the verified slice, and end the turn.
- Mark the implementation goal complete only when the phase exit criteria pass.
  Set the phase to `Awaiting review`; do not start the review or next phase.

Start an implementation goal with:

```text
/goal Execute Goal <ID> from tasks/GOAL.md and only its named phase in TASK.md.
Use one small correctness slice per turn, commit the verified code and tests,
then end the turn for context health while keeping this phase goal active.
Complete the goal only when the phase exit criteria pass and TASK.md is marked
Awaiting review.
```

## Review-goal contract

The user runs a review goal after each implementation goal. It performs the same
kind of independent audit used to repair this roadmap:

1. Read the completed phase goal, its agent transcript, commits, diff, production
   code, affected tests, and live verification results.
2. Re-derive claims from the repository. Do not trust completion summaries,
   checkboxes, or prior command claims without evidence.
3. Evaluate whether the agent made real code progress, became confused, repeated
   work, optimized irrelevant metrics, weakened tests, took unsafe shortcuts, or
   crossed into another phase.
4. Check observable correctness, public compatibility, exact Effect `A/E/R`,
   ownership, Scope/finalizers, generations, atomicity, failure lanes, and the
   absence of duplicate semantic engines.
5. Identify bad, contradictory, redundant, or non-correctness requirements in
   `TASK.md` and `tasks/`; delete or correct them cleanly rather than working
   around them in prompts.
6. Run focused checks needed to verify review findings. Do not rerun passing
   suites without a relevant change and do not do size or timing analysis.
7. If a correctness problem remains, mark the same implementation goal active,
   list the smallest corrective slice in `TASK.md`, and stop. Do not open the
   next phase.
8. If the phase is correct, mark its review complete and the next implementation
   goal ready. Commit only necessary roadmap/procedure or planning-test cleanup.
   Product-code defects reopen the implementation goal rather than being fixed
   inside the review goal.

Start a review goal with:

```text
/goal Execute Review <ID> from tasks/GOAL.md for the just-completed phase.
Implementation session ID(s): <session-id-or-ids>.
Audit the agent transcript and live code/tests for real correctness, confusion,
pointless work, shortcuts, cross-phase drift, and false completion claims.
Correct bad task requirements in the repository itself, never through prompt
overrides. Reopen the same phase if blocking correctness remains; otherwise mark
the review complete and make only the next phase goal ready.
```

## Goal R — Recovery

Lane: only the Recovery slices in `TASK.md` and code/tests directly affected by
the recorded regressions. Phase 1-5 design work is out of scope.

Exit: affected runtime and Launch Workspace tests pass with canonical app-bound
ownership, no duplicate actor/test engine, and complete finalizer/lease proof.

## Review R — Recovery review

Focus: whether compatibility was restored without weakening canonical identity,
whether every repaired caller uses registered ownership, and whether lifecycle
claims are supported by deterministic tests rather than accepted failures.

## Goal 1 — Identity, runtime ownership, and lifecycle

Lane: [PHASE_1.md](./PHASE_1.md). Do not implement transaction policy, stream
policy, timers, children, React, hydration adapters, inspection, CLI, or docs
beyond the minimal seams Phase 1 owns.

Exit: canonical resource and actor owners, collision-safe identity, exact Layer
typing, scoped shutdown, bounded evidence, and production/test delegation pass
their affected tests.

## Review 1 — Phase 1 review

Focus: duplicate registries/stores, forged or ambiguous identity, activation
races, Scope/finalizer completeness, erased Layer requirements, and Phase 2 work
that leaked into foundations.

## Goal 2 — Transactions

Lane: [PHASE_2.md](./PHASE_2.md). Use Phase 1 owners; do not redesign streams,
timers, children, adapters, or documentation.

Exit: transaction generation, overlap policies, atomic preview, restore,
canonical facts, and exact public typing pass deterministic/model tests.

## Review 2 — Phase 2 review

Focus: stale completion, synchronous completion ordering, admission before work,
queue ownership, atomic preview rollback, typed failure/defect/interruption, and
whether tests use an independent oracle.

## Goal 3 — Transitions and actor-owned asynchronous work

Lane: [PHASE_3.md](./PHASE_3.md). Use Phase 1/2 owners; do not implement React,
server, inspection, CLI, or documentation work.

Exit: transition differential, stream lifecycle/pressure, timer lifecycle, and
child supervision/restore pass with exact generations and finalizers.

## Review 3 — Phase 3 review

Focus: production versus test-owner parity, stale emissions/fires/completions,
bounded pressure, TestClock use, child generation/restore, and no duplicated
stream/timer/child engines.

## Goal 4 — Adapters

Lane: [PHASE_4.md](./PHASE_4.md). Adapters must consume established production
owners; they may not repair core semantics by implementing substitutes.

Exit: testing, React, server/hydration, inspection, and CLI behavior agree with
production semantics and their environment/compatibility matrices pass.

## Review 4 — Phase 4 review

Focus: render purity, leases and Strict Mode, request isolation, hostile decode,
atomic attach/dehydrate, evidence projection, CLI exit behavior, and any adapter
that became a semantic owner.

## Goal 5 — Deletion and final correctness

Lane: [PHASE_5.md](./PHASE_5.md). Delete displaced code, prove packed/public
compatibility, align user documentation, and run final affected verification.
No new architecture or feature family is introduced here.

Exit: one owner per capability, no obsolete engines or exports, source and
packed contracts agree, supported behavior is documented, and the full affected
workspace verification passes.

## Review 5 — Final review

Focus: the entire finished codebase and all phase transcripts. Re-derive public
API, types, ownership, lifecycle, behavior, and compatibility from executable
evidence; identify any remaining shortcuts, false claims, dead code, duplicated
owners, or planning requirements that survived without protecting correctness.
Only this review may mark the roadmap complete.
