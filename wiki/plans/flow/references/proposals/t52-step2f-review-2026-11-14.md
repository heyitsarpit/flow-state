# T52 step 2f review (2026-11-14)

**Verdict: go on, nothing blocks.** Step 2f (81953e22), its triage 2g (a810d974) and T60's fix round (75a29363) hold
on clean copies of each revision. Six findings don't block; each becomes an owed row or a record fix (list at the
end). The one wrong claim is in a record: three of the five dropped pair owners are reached by Transfers and MIX-2,
not by Pay and Cells.

Range: 03501759..81953e22, plus a810d974 (the coordinator added it) and 75a29363. Reviewer: T52 step-2f reviewing
lead, with six Haiku sidecars (A to F, effort high, read-only). F was blind: it read only the Specs, the phase-out
plan and the code. Every gate below ran on a `git archive` copy in scratch, never in the builder's checkout.

## 1. Class gate (81953e22)

- Gates at 81953e22: class gate 268/268, parts 78/78, held-out 132/132, pairs 74/74.
- **A gate that faults nothing turns the class gate red.** With `plantedSweep`'s default gate set to `() => []`,
  1980 plants pass and the class gate fails. Its count line reads `-1712/268` because `verdict` counts fault lines
  against scripts. That is a cosmetic suite fault, owed row O4.
- **A sweep that ignores the gate's faults turns two tests red**, owed.test.ts "a gate that faults nothing" and "a
  rule that ignores an item's step". The class gate itself stays green, because a sweep that ignores its own gate
  passes vacuously. The unit test is the guard here, and it works.
- Red first holds. The new test fails on the old excused-flag sweep, which is the same reading as the plant above.
- **The unplanted check has no red check (O1).** Deleting `if (faultsWith([]).length > 0) …`
  (code:packages/flow-state-v3/conformance/parts/sweep.ts#plantedSweep) leaves every test and gate green. No
  script fails unplanted today, so nothing is lost now. If one ever did, the sweep would count
  every plant on it as caught.
- The sweep calls `partFaults` with scope `{id}` and open = the owners named in its rows. The parts gate passes
  `playedScope()` and `openTasks()`. So the sweep never checks for ghost scripts or rows owed to closed Tasks, but
  the parts gate does, so the sweep's faults are a subset of the parts gate's. That gap is latent and acceptable.
- `plantedSweep` repeats `judgedWith` with the gate injected (O5, one fact in two places; T60's close review
  flagged it too).

## 2. MIX stress-10: which side is wrong

I replayed and shrank the run independently, before reading a810d974. I agree with the builder's triage.

- **WriteLanes I26 is the suite's.** It shrinks to 9 steps: acct-2 Send t1, ack, Send t2, Lost, Resend t1, acct-1
  Send t2, ack. The retry at step 7 writes no batch while acct-2's acknowledgement is still out. The step-8 batch
  is acct-1's acknowledgement. The old `capturedAfter` counted any batch written after the retry as its capture.
  Production writes the recapture at step 9, once the earlier batch lands, and re-sends exactly once at step 11,
  when that capture lands. That follows WriteAhead R13 ("a persisted re-send waits for its lane record's capture").
- **Turn I12 is the suite's.** The sync client (`persist: false`) is used at step 1, the page reloads, a fresh
  ensure follows at step 87 (production incarnates the client again), and the client is released at step 103. The
  `schedules` oracle kept the step-1 use across the reload, though `anchor` drops uses there. So it owed a firing
  to an unused actor, which Turn R17 forbids ("schedules fire only while their actor is used"). Clearing uses at a
  reload removes every Turn I12 line.
- **The remaining reds are production's T19 RETRY_COUNT.** I replayed the builder's shrunk run on a810d974: Send,
  ack, Lost, Resend, ack, ack, reload, Resend, ack. The model refuses the second Resend (`times: 1`, already
  spent), but production accepts it and sends att-10000-3 a third time (WriteLanes I12). This matches the run's
  step 80-81 trace and sidecar F's blind finding that the capture carries the count from before the invoke.
- **Naming the actor in Turn I12** changes only `play.ts`'s production `excuse`. Every falsify, catch-matrix,
  mutant and liar path passes `excuse: () => false` or reads only check and Invariant (sidecar B, re-checked).
  Overdue lines were already unique within a step, so dropping their de-duplication changes nothing. The
  too-soon Turn I12 path still has no subject (O6).

## 3. The two oracle changes in a810d974

Each one is right by the rules it cites. Neither loosens a catch. A wrong reading of each turns a check red.

| Plant | Result |
| --- | --- |
| lane-queue: any later batch captures (the old reading) | play.test.ts I26 test red |
| lane-queue: later `capture` only | falsify misses `lane.retry-members-dropped`, `prod.retry-not-owed` |
| lane-queue: own step only, later `capture` dropped | **all green (O2)** |
| schedules: uses kept at a reload (the old reading) | play.test.ts Turn I12 test red |
| schedules: every use dropped at a reload | two pilot tests in play.test.ts red |

- On a810d974: parts 78/78, held-out 132/132, class gate 268/268. The I26 mutants are caught 2/2 on round-14 and
  1/1 on production. The schedules mutants are caught 5/5. The liar gate turns those 7 mutants red on round-14
  and `prod.retry-not-owed` red on production, both with a green control.
- **O2:** no check guards the "later `capture` batch" clause. Without it, a runtime that never re-sends after a
  recapture written in a later step would escape I26. That is exactly the shrunk run's shape.
- **O3:** the lane-queue check now trusts `Purposed`, a runtime answer and a stated limit, to decide whether a
  later batch is a capture. A runtime that labels its capture `flush` escapes I26. The liar gate can't catch that,
  because it replays a correct runtime's purposes.
- The schedules rule keeps a persisted actor's uses across a reload and drops a local one's. The P5 plant shows
  persisted uses must be kept. No Spec line says outright that a local actor's use ends with the page; owed
  clarification in Turn R17 (O6).

## 4. Pairs

- 74/74 at 81953e22. Only the five owners were removed. du+sr (T19) and du+ma (T9) stay owed, unreached, with
  open Tasks.
- Who reaches the five pairs (passing gate scripts at 81953e22):
  - du+wa and du+rl: Pay usual 1 and 3 to 6, Cells usual 1 to 6, and cells-stress-5.
  - rt+sr and un+sr: transfers-stress-2, -4 and -5, and MIX-2.
  - lk+sr: MIX-2 alone, and only through the mix rule.
- So the record's "Pay and Cells reach them" is wrong for three of the five. The drops are still right.
- lk+sr hangs on one script (O5's note).

## 5. T60 fix round (75a29363)

- **B1 holds.** The new `judgeProbe(probe, [defect])` assertion fails on the parent's falsify.ts. I ran it with
  the old line restored. It is red against the old code in the same commit, not in a commit of its own.
- **The six triage rows are stale.** Each went from `NO-ORACLE` to `killed` in core-mutants.tsv. Sidecar D listed
  them by line, and the totals agree: NO-ORACLE 15 to 9, killed 60 to 66.
- **Unexplained count change:** 13 more killed rows changed their killer to a keyless case catch with a blank
  reason. Blank-reason rows went from 0 to 19, and neither the commit nor the review names that change. The rule
  for explaining moved counts didn't exist yet, so this is a record fix (R2).
- **PAY-07 really catches `turn.root-first` under the liar:** 1/1 red, with a green control at a810d974. The
  catching check is a WriteLanes check, not Turn I2. That is acceptable, because the control proves the red is
  the mutant's.

## 6. Standing angles

- No `src/` change, no new throw in `src/`, no new outside read, no temporary string, no shell edit seen.
- `wk check` is valid. log.task has no line over 120 characters at a810d974; the long line was rewrapped.
- Owed reasons in owed.ts were inline strings naming a triage status. a810d974 removed the two that said so.

## Sidecar results

- **A, gate equivalence:** accepted. The baseline gap was re-run (plant M2 green), and the duplication was read.
- **B, subject readers:** accepted. Turn I12 changes only the production excuse; dedupe is a no-op.
- **C, pairs:** changed. Its inference that Pay or Cells supply all five pairs was rejected by a run (section 4).
- **D, T60 fixes:**
  - B1 accepted (re-run).
  - "Not red first" changed to "red against the old code, in one commit".
  - The 13 changed killers accepted (R2).
  - Its worry that PAY-07 catches through unrelated machinery rejected (liar control green).
  - The gates.json revision labels are noted as plausible but not re-run.
- **E, blind:** changed.
  - Its unchecked capture batch is the I26 false red, now fixed in a810d974.
  - Its reload during an in-flight re-send is T19's RETRY_COUNT, confirmed by the shrunk run.
  - Its `mayHaveApplied` note is out of range.
- **F, hygiene:**
  - Inline reasons and duplicated keys in OWED_SUBJECTS accepted as O5.
  - The long log line rejected (fixed at a810d974).
  - "Orchestrator decisions lack the user's acceptance" rejected (small amendments are delegated).

## Owed rows (for a later suite Task) and record fixes

- O1: a red check for the sweep's unplanted guard: a gate that faults the bare script must yield "fails the gate
  with nothing planted".
- O2: a red check for lane-queue's later-`capture` clause, built from the 9-step shrunk run with the capture
  delayed.
- O3: list lane-queue's reliance on `Purposed` among the runtime-answer limits, and say what checks it.
- O4: the class gate's count line counts plants, not scripts (`-1712/268`).
- O5: `plantedSweep` should reuse `judgedWith`; OWED_SUBJECTS should not repeat the owing triple; lk+sr rests on
  MIX-2 alone.
- O6: subject on the too-soon Turn I12 path; state in Turn R17 that a local actor's use ends with the page.
- R1: correct the 2f records (P4 comment, build log): rt+sr, un+sr and lk+sr are reached by Transfers and MIX-2.
- R2: note the 13 core-mutant rows whose killer changed silently in 75a29363.
