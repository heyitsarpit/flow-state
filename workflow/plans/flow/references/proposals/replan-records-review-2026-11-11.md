# Replan records review (2026-11-11)

**Bottom line:** not ready to build from as written, but close. Every replan point lands in the Tasks, the Specs
keep the pure core, and Plan coverage is complete. Two contradictions block acceptance, though not the first step:

- **B1:** the combination gate as written cannot pass in slice R or in any later slice.
- **B2:** T45's generators contradict Conformance R14 and R22, and they depend on T47's scripts, which come
  after T45.

A fresh builder can resume T45's first step (restore the `o6.settled-in-bound-stays-held` catch) today. B1 and B2
need one ruling each, and B1 is the user's, since it relaxes or reshapes a gate. The two rulings in check 4 were
not yet written in. This review wrote them (Compile R16, R17, I15, T8; Reads I21, T13; spec-log.md).

**Why now:** the run stops after this review, and the next agent builds from these records alone.

**Read first:** `replan-2026-11-11.md` (part 3), @spec.Conformance R14 to R23 and Q15, @task.V3.T45,
@task.V3.T51, @task.V3.T47. Read at `6147a26b`, cold, with no sidecars.

## Findings, ranked

### Blocking

**B1. The combination gate cannot pass as written.** T47's acceptance says the gate passes "over the pairs among
today's implemented codes". Conformance R18 waives a pair only when one of its codes belongs to a later slice. By
the replan's own rule, the 15 codes production has today make 74 interacting pairs. The three pilot parts reach
about 39 (replan question 11, accepted). 74 is exactly the replan's figure for "every part's base subset", the
alternative the user declined. Every later slice falls short in the same way:

| After slice | Interacting pairs among implemented codes | Replan's reached estimate |
| ----------- | ----------------------------------------- | ------------------------- |
| R           | 74                                        | 39                        |
| 1           | 124                                       | 102                       |
| 3           | about 298                                 | 269                       |
| 5           | about 527                                 | 489                       |
| 9           | 671                                       | 602                       |

The numbers come from a script over the catalogue's channel table, using the rule in 5B, and they are estimates.
The catalogue's feed-back rule closes such gaps: raise a command weight, add an operation to the nearest
composite, or add a pair-sweep cell (5A, "Feeding unreached pairs back"). No Task and no Spec contains it. 5B's 26
fragment-with-entity pairs, waived "until a real app shape wants them", have no waiver R18 allows. **Fix (the
user's call):** either write the feed-back rule into R18 and into each slice's "Covered" line, or let the gate
waive an unreached pair with a dated feed-back owner. In slice R, either build the base subsets (question 11's
other answer) or have the gate report pairs until slice 1.

**B2. T45's generators fall outside the Spec and depend on T47.** Three statements conflict:

- T45's first acceptance line: "on round-14 with the suite's mutants, generated runs alone kill at least as many
  as the hand cases"; T45 also owns Conformance T32, regressions shrunk "to a script in `regressions/`".
- Conformance R14: a generated run is "the replay of a script (R15)". R15's scripts come from parts, and Q15
  gives "parts, scripts, the player" to T47, which runs after T45 and T51.
- R22: round-14 "runs only the frozen hand cases".

A builder must either break R22 or build the script format and player ahead of T47. If it builds them, T47 may
build a second generator. **Fix (the orchestrator can rule):**

- R22 and R14 allow T45's hand-fixture generators on round-14: a crash at every step, the exhaustive search and
  seeded sequences;
- one record owns the script Schema, the player and the shrinker. Either T45 owns them and T47 reuses them, or
  T45's regression form is provisional and T47 replaces it.

### High: fix before the Task starts

**H1. T51 misses the dispose gap it was given.** Log 2026-11-11T12:58:40Z sends "production's dispose skipping
the core's disposal (Actors R22)" to T51. T51's text does not mention it, and the Actors composition note still
reads "Proposed".

**H2. T51's acceptance is pinned to the wrong revision.** It fixes production 75/75, falsify 18/18 and liar
13/13, which are counts from before T45. T45 changes the suite just before T51 starts. The acceptance should read
"as at T45's close". It also leaves out:

- the production crash generator, where the Held-head bug shows as 26 production-only points;
- Reads I21 (new), the seam lint and the Spec-id lint, which appear only in its Approach.

**H3. A fresh T45 builder lacks its plan and its Spec.**

- STATUS.md T45 says its working plan is "in the lead's scratchpad", which is gone.
- Read first omits @spec.Conformance R19 to R22: the model's five limits, the generic compare, facts only and
  the limits list.
- Nothing says that the Spec model is the existing `dsl/lifecycle*.ts` modules.

**H4. A fresh T47 builder lacks its Spec and its inputs.**

- Read first omits @spec.Conformance R15 to R23, which were written for T47, and the 265-feature list
  (`plan-task-coverage-2026-11-11.md`).
- T47 does not list the codes production implements today, which it must declare.
- Conformance T31, T33 to T36, T38, T39 and T43 say "Slice R writes this" and name no Task. Model mutation (R19,
  T39) and the generic compare (T38) fall between T45 and T47.

### Medium

**M1. WriteLanes Q5 cuts across T51 and T18.** Q5 gives T18 two rulings: a cancel commit on a Kept lane, and a
kept unknown on a Held head. T18 says "Spec check first (no change expected)". T51's "one total function" must
also handle those two open cells. It should say how: refuse them as a defect, or show they cannot be reached under
`reject`.

**M2. WriteAhead Q4 is in neither slice 2 Task.** Q4 says the KeyValueStore has no batch, and Q4 gives the store
service to slice 2. Neither T19 nor T20 names Q4, and T19's R2 Invariant depends on it.

**M3. M66 lost its owner in the split.** M66 is the rule that freeze releases placements, an owed Turn R18 check
from T8's scope. It belonged to T21, whose fragments moved to T17, and T17's row list skips it.

**M4. Some Epic and phase text is stale.**

- Stage B's exit says "green on both runtimes", against R22.
- P4 is still titled "Pay path".
- P14 and P15 carry the parts and model template, though slice 6 has no parts.

**M5. Conformance Q15 lists the liar mode as unbuilt and gives it to T45.** T44 built it: liar 13/13 on
production.

### Low

- **L1.** The bench is recorded as "a measurement, not a gate" (T47), but the replan said "a turn-time budget in
  the fast gates now". No log note records the change.
- **L2.** T47 says it corrects the catalogue's section 1 and P tiers, but the replan says the catalogue file is
  not edited.
- **L3.** T35 is not narrowed to proving the bench runner the slices built. Its text defers drafting to P8.
- **L4.** T9, T15 and T46 are open while blocked by drafts, and the other later Tasks are draft.
- **L5.** Conformance R17 lists "hand case" as a fixture kind, but T47 and replan question 4 do not.
- **L6.** T9 does not list T8's actor rows. T8's comment points to STATUS.md, T8.
- **L7.** `workflow format --write` rewrapped the 12:58:40Z note in log.task. Only whitespace changed.

## The five checks

1. **Do the replan points land in the Tasks? Yes.** Slices R and 1 to 10 are in the Epic's order and in one
   blocker chain: T45, T51, T47, T18, T19, T20, T17, T9, T21, T22, T15, T23, T25, T24, T27, T48, T28, T49, T29,
   T31.
   - Merges: T7 into T18, T10 into T19, T11 and T26 into T20, T12 into T21, T14 into T45.
   - Splits: T18 to T9 and T17; T21's fragments to T17.
   - T8 is closed as moved.
   - The one-lead order is in the Epic and in T47.
   - The progressive mechanism is in T47 and R16, and the combination gate is in T47 and R18.
   - Guards are on every slice Task: first-contact reds, held-out seeds and a second model family.
   - The bench is measurement only, with a fingerprint gate.
   - The user stop for the pair list is on T47.

   Gaps are B1, M3, L1 and L3.
2. **Can a fresh builder start T45, then T51, then T47? Only T45's first step.** Its Resume line in STATUS.md is
   clear. Missing: B2, H3; for T51, H1, H2 and M1; for T47, B1 and H4.
3. **Do the Specs agree with the Tasks and with each other? Mostly.** The disagreements are B2, M1, M2, M5 and
   L5. **Do the Effect-pass changes keep the pure-core rule? Yes.**
   - Fibers, FiberMap, Scope, Clock and Scheduler appear only in host composition notes (Turn, Actors,
     WriteAhead, StaticCli).
   - The core uses only Data and Schema error types (Diagnostics R1, R2).
   - WriteAhead R12's "the store is an Effect" is the host service.
   - Conformance R1's Effect hosts are the world serving production's host, as the replan's sidecar b ruled.
4. **Were the two rulings written in? No. This review added them** under the orchestrator's ruling, with
   skill:to-spec at `e74b0e2`:
   - Compile R16 gains a paragraph: functions Flow derives from a declared Schema sit on Compiled, are not Slots,
     and the data view omits them. R17, I15 and T8 are widened to match.
   - Reads gains I21, "no lookup's context carries an Attempt", added to R6's coverage, with test T13.
   - Both are logged in `workflow/specs/spec-log.md`, and `workflow check` is valid.
5. **Is any Plan feature or catalogue code unplaced?** `bun tools/plan-coverage/check.ts` reports that all 81
   Plan outcomes are satisfied or deferred. All 62 catalogue codes are placed. The 12 that production already
   builds are covered only by T47's "today's implemented codes" (H4). Every one of the 123 newly scoped feature
   rows has a Task. The exceptions:
   - M66's owed check (M3);
   - L03 holds only through T48's area name;
   - the catalogue's one unplaced variation (Lazy row 7) is recorded in T48.
