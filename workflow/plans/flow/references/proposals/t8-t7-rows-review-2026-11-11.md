# Review: T8 round 2, typed adapter failures, T7 rows round (`62bb4002..22af6e2e`), and T13's follow-ups in `c927e225`

Verdict: **not ready to close T8's Turn rows.** Most of the rows moved to T18 and T21 can be shown on round-14 now.
Round-14 already has compound states, subroutines, fragments, placements, child refusal, pending resets and
whenAbandoned, and the old suite still kills their wrong runtimes on round-14. The new catalog itself gained a
placed trait with `whenAbandoned` in this range (`Release`). That makes the T21 reason false as written. A ported
case already kills Turn I12's old wrong runtime, and the suite gives I12 no credit for it. The T7 rows round, the
refusal and schedule oracles, and the typed `Unreadable` failures are sound apart from the Mediums below. The suite
at `22af6e2e` is green: 101/101, coverage 56 of 183, 0 gaps, and the range's 11 new mutants are all caught
(re-run on a `git archive` copy).

Method: an archive of `22af6e2e` with `node_modules` symlinked. I re-ran the suite, coverage and falsify on the
range's mutants. I ran five probe mutants of my own. I ran the old suite on round-14, plus 22 of round-14's own
mutants against the new suite. Four Haiku sidecars ran read-only; their log is at the end. Paths are under
`packages/flow-state-v3/` unless they start with `workflow/`.

## Findings, ranked

### H1. The T18 and T21 rows: most reasons are false for round-14

The rule: the orchestrator's decision (`workflow/tasks/V3/log.task`, note 06:28) moves only rows that "round-14 cannot
show". Conformance R11 adds that every mutant the old suite kills on a ported case, the new suite kills. T18's
and T21's "May change" is `src/` only, so they cannot take on suite cases (STATUS.md:1291 admits this).

Several facts contradict the reasons in `conformance/not-yet.ts:20-33`:

- **T21's reason is false at its own revision.** It says "no catalog fixture has fragments or placements"
  (not-yet.ts:31). But `fixtures/one-lane.ts:112-158` (`Release`, `Lab/P1Rel`, added by `82d6833d`) places the
  trait `t` from HOST. Its `whenAbandoned` cancels `q`, and its events go to the part `["t"]`. LANE-12 runs
  this, and `selection` judges part-only turns.
- **Round-14 has each T21 feature, and the old suite cases them:**
  - I3, a child's refusal refuses the whole turn: `prototypes/round-14/turn.ts:321`; case FRAG-17
    (`prototypes/conformance/scenarios/frag.scenario.ts:861-873`).
  - I10, a pending reset runs as its own turn: case `FRAG-02/a-part-writing-the-key-is-a-pending-reset`
    (frag.scenario.ts:151-163).
  - I11, `whenAbandoned` runs in the leaving turn: `applyLeaving`, turn.ts:633-652; FRAG-02 and FRAG-01.
  - I24, a key change releases its placement: case `P1-S` (phase1s.scenario.ts:59-75).

  Turn.spec's own tests name these cases: T4 (FRAG-17), T13 (P1-S) and T20 (FRAG-02). Only I25, the value outcome
  of a placement, has no round-14 case, which Spec T22 admits.
- **Turn I4, I5 and I6 ("no compound state"):** round-14 has compound states and subroutines. Its exit and entry
  sets run through the common ancestor (turn.ts:186-196); see also the subroutine case in
  `fixpass.scenario.ts:68-80`.
  - I ran the old suite on round-14 with Spec T1's wrong runtime `a3.r14-explicit-reentry-keeps-activation`. It goes
    red on R14-FIX-01 and R15-01 with rule 15 failures.
  - Run against the new suite, none of the four I4/I5 wrong runtimes Spec T1 and T3 name goes red:
    `audit-1.r14-reentry-keeps-activation`, `a3.r14-explicit-reentry-keeps-activation`, `a3.r14-reenters-the-parent`
    and `1b.r14-history-reentry-keeps-activation`.
  - The limit is the catalog's flat fixtures (`fixtures/handlers.ts:71`), not round-14. I6 has no old case
    (Spec T2), but round-14 does implement exit and entry order.
- **I17 ("no pure turn"):** Spec T8 is a black-box test: the same scenario run twice with the same clock and
  seed must give equal turn records. The Port can do that today, and round-14's `step` is pure
  (`prototypes/round-14/step.ts:782`). Only the `seed` argument is missing.
- **I32 ("timer order left to the host"):** round-14 orders firings by arm order (`prototypes/round-14/timers.ts`,
  `driver.ts:163-171`). The suite's clock breaks ties the same way (`conformance/world/clock.ts:6`). So the Spec
  order can be observed now. It may be red, which would be a deviation to record, not a reason to move the row.
- **I35:** round-14 has no memory-keyed schedule, but `.each` copies arm and reap per key, with `listRepair`
  (turn.ts:581-598). This holds in part.
- **WriteLanes I28:** Spec T22 says phase 3 writes the case and its wrong runtime. The case can still be written
  on round-14: the adapter mints `att-<sessionSeed>-n`, as `adapters/prototype.ts:401-406` shows. No runtime
  mutant can break it, so only the mutant is beyond reach.
- **Truly not showable on round-14:** I18 (no `check`), I28 (no `onContext`), I31 (issues are not in snapshots;
  `publish.ts:31-36`), I33 (no multi-step Schedule) and I34 (no `restartOn`).
- **I1** is moot through the Port, which reports one leaf name (`publish.ts:34`). I16's reason, that post-commit
  defects come only from module hooks, is accurate.
- STATUS.md:1291 says "round-14 and the flat fixtures cannot show them". not-yet.ts mixes the two kinds of reason
  row by row.

Fix: keep I3, I4, I5, I6, I10, I11, I12, I17, I24, I32 and I35's `.each` half as T8's (or a P3 Task's). Port the old
fixtures (form, room, the subroutine fixtures). Register Spec T1, T3, T4, T13 and T20's wrong runtimes. Move only
I18, I28, I31, I33, I34 and I25's placement half. The remainders show the same pattern:
- `turn/remainders.ts:58-62` owes I27's subroutine exits to T21, but R14-FIX-01 has
  `audit-a-late-turn-may-not-leave-an-active-subroutine`.
- `turn/remainders.ts:43-47` owes I22's overdue-on-restore half to T18, but Spec T11 names LIFE-14 and FRAG-18.

### H2. A ported case already kills Turn I12's old wrong runtime; I12 gets no credit

The T18 row says I12 needs "a Port view of a callback's reads" (not-yet.ts:21). Spec T5's wrong runtime,
`pay16.schedule-reads-pre-transition-memory` (`prototypes/round-14/mutants-lifetime-pay16.ts:10`), goes red in the
new suite on `PAY-16/schedule-reads-after-memory` (`write-lanes/payment-retry.scenarios.ts:107-116`). The failure is
the state expectation "expected WAITING, got PAYING", and `TURN-01/schedule-refused` goes red too.

So I12's "a schedule reads After" clause can be seen through the Port today. The case does not cite Turn I12, and
the mutant is not registered. This breaks Conformance R11 and the coverage rule that a checked Invariant is counted.
Fix: add a `CaseCovered` row for Turn I12, with a remainder for the guard and mapper reads, and register the mutant.

### M1. `evidence-kinds` (WriteLanes I4) judges only the runtime's own label, and its one mutant proves nothing extra

- The check runs only when the runtime reports an `Ended` whose reason is an evidence kind
  (`write-lanes/evidence-kinds.ts:42-46`). Round-14 never does this for a superseded or released Attempt: it calls
  `tellEnded` with `"superseded"`, with no `noteEnding` (`prototypes/round-14/lane.ts:289-292`). On the real
  runtime the check never arms.
- `lane.superseded-delivered` (`evidence-kinds.mutants.ts:16-18`) declines `a`, the new commit's arguments, not the
  superseded `x`. Its `says` is wrong.
- When I ran it, `ending-channels` (I3) and `delivered-once` (I15) both went red as well. Relabelled `Overloaded`,
  my probe mutant is missed by `evidence-kinds` and caught by `delivered-once`.

So I4's own check is a report-consistency check with no independent anchor (skill:policy-testing, "Excuse only
what the harness observed" and "Make every check able to fail"). Fix: mark I4 as checked in part, with a remainder:
"a superseded or released ending delivered under any label is delivered-once's". Correct the mutant's edit (`x`)
and its `says`. Separately, `port.ts:79-86` adds `StorageFailure` and `StorageSilent` to Spec R3's list of evidence
kinds.

### M2. `c927e225`'s Compile row repeats the T13 error for I10

not-yet.ts says round-14 "has no ... SharedContract ... check" (the T17 row, edited in `c927e225`). In fact:
- round-14's `flow check` has that check (`prototypes/round-14/cli/check.ts:313-318`, fixture `cli/broken.ts:188`);
- the new suite runs it on round-14 as CLI-06 (`static-cli/cli.cases.ts:93-97`).

What round-14 lacks is the construction-time refusal (Compile R9 and T3), and a second placement of one writing
fragment (round-14 STATUS limit n2). Fix: reword the reason. Then decide whether CLI-06 shows Compile I10 in part.

### M3. Spec conflict: WriteLanes I15 against R10 and `@plan.Pending.D4`

- WriteLanes I15 (WriteLanes.spec:291-300) lists "an ending whose admission refused its turn (outcome mapper throw,
  InvalidTurn) is delivered once more". This reads as any `InvalidTurn`.
- R10 says this only for a mapper throw. D4 calls round-14's redelivery of any refused ending a prototype
  deviation.
- `TURN-01/schedule-refused` (`turn/refusal.scenarios.ts:27-36`) drops the issue count to pass on round-14.

Until I15 is reworded, or D4 notes that I15 needs that change, the case has no Spec-derived count, and D4's
"Proven by" cites a Spec that disagrees with itself. Fix: one spec-log entry that settles I15's wording, then assert
the count in TURN-01, as a known red on round-14 if need be.

### M4. Two excuses rest on the runtime's own reports (audit rule: "Excuse only what the harness observed")

- `turn/refusal.ts:144-151`: any `Turn` or `Incarnated` of the actor anywhere in the step excuses a changed
  publication. A runtime can report `Delivered`, then `InvalidTurn`, then a `Turn` after the issue, outside the
  span, then publish new memory, and pass `refusal`. `selection` then checks only that the header is plausible.
  The gotcha at refusal.ts:211-212 states this, but the rule forbids it. Fix: excuse only a `Turn` whose event
  the suite drove or that ends another delivered ending, and judge the refused ending's own `Turn` anywhere in the
  step.
- `turn/schedules.ts:49-60` (`wasSent`): a runtime's `Delivered` of the same event name excuses a firing. It is
  consistency-checked by `delivered-once`, so the risk is Low.

### M5. Missing remainders, and lost clauses

- **I9** (`turn/publication.ts:117`): only a move to another leaf must publish. An accepted turn that stays on its
  leaf, with `updateMemory` or `self`, is never required to publish. `turn/remainders.ts:28-32` lists only "at most
  one".
- **I20** has no `disarmOn` anywhere: `fixtures/handlers.ts:45-51` has no field, and grep finds none in
  `conformance/`. Round-14 has it (turn.ts:831) and Spec T10 names it. The I20 remainder (remainders.ts:43-47)
  leaves out both disarm and the arming id, which schedules.ts:207-208 concedes.
- **I27 after a reload:** the Activation bump drops calls minted before the boot from the pending set (STATUS.md
  T8, reviewer item 6). This is stated in STATUS but not in the I27 remainder (remainders.ts:58-62).
- **I15's "counts as delivered"** clause is not judged and is not in its remainder (remainders.ts:38-41).

### M6. Implicit state machines (AGENTS.md, "Don't write any implicit state machines")

- `turn/schedules.ts:14-47, 76`: an actor's arming phase (Unknown, or an Armed list) is split across the
  `armed` Map and the `unknown` Set. `judgeFiring` reads `unknown` first.
- `turn/anchor.ts:32-40, 131-184`: an Attempt's routing state is spread over `open`, `owners`, `held` and
  `restored`.
- The per-actor reset on reload, `Incarnated` and `Finished` is copied across four oracles: refusal.ts:166-177,
  publication.ts:55-69, schedules.ts:36-47 and `dsl/lifecycle-fold.ts:38-41`.

### Lows

- L1. `turn/selection.ts:428` (in this range) now credits every `Drove` as a root send, whatever its address.
  A root turn of an event that was sent only to a part is admitted. No fixture shares an event name between a root
  and a part, so nothing goes red. Fix: credit the address.
- L2. `write-lanes/lane-queue.ts:64-68` labels "more than one addressable Attempt" as WriteLanes I9. That is R6's
  rule, while I9 is about which Attempt a retry or cancel acts on. I9 stays owed (not-yet.ts:16), but README.md:285
  lists `lane-queue` as I9's check, "with no mutant".
- L3. `idle-guard` has no mutant for the "taken over a busy lane" direction, and `idleIn` ignores keys and kept
  endings (idle-guard.ts:21-27). Both are stated in the I13 remainder.
- L4. Typed failures: sound. Every `Unreadable` comes from a decode or a missing field. The runner labels it apart
  from a defect (`runner/run.ts:33-38`). `stopIfUnread` runs before a settle failure is rethrown
  (`dsl/case.ts:268-272`). I found no defect relabelled as `Unreadable`, and no `Unreadable` swallowed. One gap: a
  wrong Schema in a suite fixture also reads as "the runtime broke the Port's contract", which is acceptable since
  the fixtures are the contract (decision 4).
- L5. Code quality, verified sample:
  - memory equality uses `JSON.stringify` where `port.ts` already exports `sameJson` (publication.ts:35, 44, 78;
    refusal.ts:102);
  - `keyOf` is duplicated in four files;
  - `memoryId 0` is a sentinel for "no identity" (publication.ts:76);
  - `"actor" in began.value` is always true (refusal.ts:173);
  - `retry-count.ts:7-12` re-probes a row the adapter already decoded.

## Old-suite comparison claims (STATUS.md, T7 "Rows round")

- "25 old lies are red on a ported PAY case": reproduced (25 files in `prototypes/conformance/lie-cases/` name a
  ported PAY case). "The new suite kills 24 by an oracle": not reproducible, because the scratch script was not
  committed. Reading `w.patch-in-place` and `k.no-boot-ev+boot-order` as recorded differences fits R11.
- R11 also covers round-14's own mutants, which that pass did not run. I ran the 18 that name a ported PAY case
  (`pay16.*`, `audit-1`, `1b.*`, `o6.*`):
  - every one is killed, re-anchored, or a recorded unported variant (`pay16.resend-inherits-cancel`, STATUS.md:69;
    `1b.disposal-definite-w-first`, STATUS.md:231);
  - the exception is H2: `pay16.schedule-reads-pre-transition-memory` is killed by a case's state expectation and
    credited to no Invariant.

## Rows round claims checked

- `retry-count` (I7) catches its mutant first; I ran it whole-suite and it went red on 6 cases. Sidecar (c)'s
  attribution doubt is rejected.
- `turn.late-leaves-work` is caught by `selection` as I27 on PAY-07 and PAY-19 (I ran it). Sidecar (b) item 13 is
  rejected.
- LANE-11 and LANE-12 cite R4, R16 and I15. No round-14 output file holds either id, so neither was copied.

## Sidecar log

- (a) moved rows against round-14. **Accepted** the findings for I3, I4, I5, I10, I11, I24, I28, I31, I33 and I34.
  I verified the code for each, and ran the old suite for I5. **Changed** I12: it is stronger than reported (H2).
  **Changed** WriteLanes I28: the case can be written, the mutant cannot. **Accepted** I32 and I35, with I32
  reworded as "observable, possibly red". **Accepted** its I11 rule-6 exemption as a question for Turn I11's
  wording; it is not a finding against this range.
- (b) Turn checks. **Accepted** 1 and 2 (M4), 5, 6 and 8 (M5), 9 (M5), 10 (in part, for "counts as delivered"),
  and 15 (L1, downgraded: no fixture reaches it). **Rejected** 3: refusal.ts:70-78 drops an `Unhandled` whose
  sources name two actors, which matches its doc, and selection's different rule is a separate judgement.
  **Rejected** 13 (I ran it: `selection` catches I27). **Rejected** 11 as "copied": the mapper count comes from R10.
  Folded into M3. **Accepted** 12 as trivia; 8000 ms is a fixture fact. **Accepted** 7 as a stated limit; the
  opaque-guard allowance is in handlers.ts's doc, but not in the I2 remainder.
- (c) T7 checks. **Accepted** 1 (M1, verified by probe), 2 (L2), 3 (L3), 9 (H1), and 10 (in part: "24" cannot be
  reproduced, while "no new-suite gap" holds with the recorded readings). **Rejected** 7 (attribution, by running
  it). **Accepted** 4 and 5 as already stated in remainders or STATUS. **Rejected** 6 and 8 as non-findings.
- (d) code quality. **Accepted** 1, 2, 4, 8, 9, 13, 14, 15 and 16 (M6, L5), each checked at its line. **Rejected**
  28 as a finding: the Case's failure DSL throws typed classes, as `Violated` and `Mismatch` do, and it keeps the
  labels apart (L4). **Accepted** the rest as Lows not worth listing; they are long message strings and doubled
  helpers.
