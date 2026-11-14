# T52 close review (2026-11-14)

**Verdict: PASS. T52 closes; nothing blocks.** Every gate recorded at 0eba05a1 reproduces at f349968f on a clean
copy, every acceptance item has a passing check, and Q24 to Q26 hold by the Specs. The one real lost catch (five Pay
cases no longer catch `prod.actor-never-saved` on production) predates T52: all five are already green under the
mutant at T52's first revision, 1c4168da, so it is a suite gap owed to @task.V3.T61, not a T52 defect. It must be
fixed before T53 thins Pay's hand cases by production catches alone (O1).

Range: @task.V3.T52, 55a857f0..f349968f in full, plus the acceptance as a whole (earlier reviews covered up to
5e6d0faf). Reviewer: T52 close reviewing lead, with five Haiku sidecars (S1 to S5, effort high, read-only); S1 was
blind. Every gate, replay and plant ran on `git archive` copies in scratch, never in the checkout. Not an
independent self-check: the lead did not build T52.

## Acceptance (check-task, at f349968f)

1. **Pay and Cells generated parts, Pay's hand rows one frozen golden: PASS.** Parts 78/78, held-out 132/132, class
   gate 268/268; `parts/golden.test.ts` green (pinned bytes, import walk).
2. **`referenceOf` equals the hand rows: PASS.** `parts/golden.test.ts` and `parts/reference.test.ts` green in the
   conformance tests (44 files, 288/288).
3. **`not-yet.ts` gone, duplicated traces gated and held for T61, step mutants killed: PASS.** The file is absent;
   `lifecycle.test.ts` runs every trace and holds the 57 by name; `lifecycle-step.test.ts` records each killer.
4. **The four validations: PASS.** V1: falsify 154/154 and 18/18, and the prototype sweep loses no catch; V2:
   coverage identical, matrix 265/265; V3: the golden; V4: `parts/static.test.ts`.

Gates reproduced at f349968f: suite 124/124 and 78/78; falsify 154/154 (4/4 probes) and 18/18; coverage 74 checked,
42 in part, 136 owed, 0 gaps, `coverage-standings.txt` byte-identical; parts 78/78; held-out 132/132; matrix
265/265; pairs 74/74; model mutation 327/327; class gate 268/268; regressions production 4/4; crash 732/735 with the
three owed points; `nub run check` zero errors, zero warnings (format 270 files, lint 261, effect-tsgo, plan
coverage). Not re-run: bench, liar, limits, round-14 regressions, core mutants (unchanged in range).

## Item 7's decisions

**Q24 holds: the narrowing is right.** Restore R3 owes the Held head's `unknown { Restored }` "unless a row for its
Attempt is owed", and I6 forbids both only when a row is owed; both read the rows after the reload. Table C's
StepEnds refuses a live Owed and a Refused row (`dsl/lifecycle-rules.ts`, `deny(15)`), so neither is ever in a
step-end capture: they exist only mid-step, and the kill loses them. Table C's Reload closes them, so exempting their
head would leave the Attempt with no ending at all; the builder's reason is right. Actors R20 explains the one Owed
row the reload keeps (owed rows in a disposal "stay owed"), and Restore R1 restores from the saved record only.
Actors I24 ("never lost") is not broken, since the closed rows were never saved. An incarnation with no reload
counts every owed row (`ownsRow`), which is consistent: there the rows are live and will be delivered.

**Q25 holds and loses no catch.** WriteLanes' cancel cell reads "Recapturing, Resending and Held release it
(evidence Released)"; `ReleaseHead` (`dsl/lifecycle-lanes.ts`) owes the `Released` evidence, sets the head Gone and
promotes in the turn. Prototype sweep 5e6d0faf to f349968f: of 18,788 shared rows none goes from caught to
uncaught. A fresh sweep of `lane.cancel-held-keeps` and `mutant.cancel-members-dropped` on round-14 gives the
committed 248 rows byte for byte. Planted without the `Released` evidence, the same two mutants fall from 18 caught
rows to 2 (only LANE-03 keeps its catch), so the correction is load-bearing, as the build log says.

**Q26 holds; its red is shown only by an API change.** WriteAhead R10 makes a batch carry its step's one list, and
`wrote` now captures the step's end (`dsl/lifecycle-capture.ts`); no `least` remains in the lifecycle model. But
`lifecycle-capture.test.ts` calls the new `wrote(model, "flush")`: on the parent it fails by the changed signature,
and with the old `least` set to the same model the old code also restores each row exactly, so "red under the old
bound" was never shown (O2). The checks do refuse a Maybe-everywhere plant by reading. Non-blocking: the semantics
only narrow `Maybe` to the exact life, and production passes parts, held-out, crash and regressions under it.

## Owed rows

The moves stand. WriteAhead I21 and I22 are whole rows of @task.V3.T19 (`owes.ts`), beside WriteAhead I1 to I19,
which T19 already owns as the WriteAhead area; no oracle claims them with a mutant yet. The WriteLanes I10 clause
row is gone and coverage reads I10 checked by `mutant.members-reversed` (6 catches); the two removed clauses
(cancel-then-commit on a Held lane, the same-turn cancel's release) are now model behaviour with traces
(`dsl/lifecycle-turns.traces.ts`) and caught cancel mutants (`lane.cancel-held-keeps`, 9 catches). No owed row in
`conformance/` names T52; `parts/records.ts` names it only in a slice map and a doc. Re-owned cells match: 9
cancelAll cells to T53, 18 unforgeable refusal cells to T61 (`parts/model-owes.ts`).

## The production sweep

**A real oracle gap, but older than T52.** The mutant drops the actor's durable write (`src/core/persist.ts`). Traced
on PAY-05 (`trace --case PAY-05` on a mutated copy): the turn to UNSURE at step 10 writes no batch, the end-of-case
Runtime disposal writes none, and after the end-of-case reload the actor runs `PayUnsure` from PAYING. A correct
runtime has written UNSURE by the end of its disposal (the unmutated trace writes at steps 10 and 12), so these cases
should catch it. The selection oracle now treats every reload like a kill: with no batch seen after the turn, it
allows the older leaf; the disposal oracle does not require the dirty actor's write in these cases. Run under the
mutant at 1c4168da, 438349ec, 3219be11 and f349968f, all five cases pass; at 56ef0856 (the T45 sweep) PAY-05 fails
by Turn I2. So the loss came between 56ef0856 and 1c4168da (T45 or T47), outside T52. The mutant stays killed (24
catches, DISP-01 and DISP-07 among them) and the gate matrix is unchanged. Owed to T61 (O1).

## Q18 deferred to T53

**Sound, with one condition.** The 47 reproduces as a greedy deletion, latest first (46 earliest first), the same
method as the trace gate; S5's 23 and 51 are other counts. Keeping the cases claims nothing false: no coverage
standing rests on a PAY case (no CaseChecked line names one), falsify counts mutants, and the matrix keeps 87 PAY
rows that are true catches. The deferral is recorded as proposed in @task.V3.T53 (P5.task) and in the log. The
condition: T53 would judge the Pay cases by production catches alone, and O1 shows production's selection oracle
misses a stale restore after a clean shutdown; thinning before O1 is fixed would delete cases on a weakened oracle.

## The gates.json diff

Every changed count is listed and true: coverage 75/43 to 74/42 (retired I21 uncounted; I10 whole); parts, held-out
and bench (Pay and Cells parts); regressions production 8 to 4 (five pass-only GEN-pay deleted in 9922d53a, the
shrunk cells-105 added in cb17846b, so "kept" means added); round-14 8 to 2 (the six deletions); class gate new;
crash fail to pass with three owed points (1fa04e5c); core mutants 60/35 to 66/29 (75a29363 drops six triage rows,
whose mutants are now killed). Not in gates.json and not explained: 238 prototype sweep rows went from `red` to
`failed uncaught` (`cmp.commit-runs-at-construction` 102, `cmp.compiler-emits-bare-guard` 86,
`cmp.operation-dropped` 47, `life.ends-while-used` 3). They are T60's caught rule (196edbff) naming an uncited
failure; each mutant keeps its caught row, so no catch is lost (O6).

## Standing angles

- Effect re-creation: none. Throws in `src/`: the range does not touch `src/`.
- Outside reads: only `runner/trace.test.ts` makes an `os.tmpdir()` scratch directory (T61's test).
- Unlabelled record edits: none in T52's records. The build log's item 7 is covered by its blanket label (line 9);
  the requirements, Conformance.spec (spec-log lines), P4 and P5 edits are labelled. Outside T52: log.task's
  orchestrator note says 19 re-owned cells, the code has 18.
- Temporary strings: Task ids in two trace names ("WriteLanes I10, T17", a rule citation); "retires round-14" in
  `parts/model-owes.ts`. Stale text: `lifecycle-incarnate.ts`'s doc still says only a parked ending blocks a restore,
  though the code reads every owed row (O4); README and Task text still name `not-yet.ts` and `Remainder` (prior
  review N6).
- Shell-written files: the three the build log records; no residue in committed files. This review edited one of its
  own scratch scripts with `sed -i`, against the Write-only rule.

## Owed rows for @task.V3.T61 (proposed)

1. **O1** `prod.actor-never-saved` lost in PAY-05, PAY-06/uninterruptible, PAY-12/cancel-on-wire,
   PAY-15/cancel-on-wire, PAY-16/restore-keeps-mayHaveApplied: bisect 56ef0856..1c4168da; after a completed Runtime
   disposal and its acks, a reload's leaf is pinned (or the disposal oracle owes every dirty actor's write). Before
   T53's Pay thinning.
2. **O2** Q26's capture checks red with the old `least` bound planted, not by a signature change.
3. **O3** `keepsRow` omits `Maybe`, which the reload keeps; a trace for a Held head with a Maybe row (latent: no
   run found that reaches it).
4. **O4** a trace pinning that an adopting incarnation owes no restore to a Held head with a Kept or Refused row;
   the stale doc in `lifecycle-incarnate.ts`.
5. **O5** the redundancy gate's `HELD` list is an exact list, so any mutant change fails it rather than deciding.
6. **O6** the sweep's `red` to `failed uncaught` relabel recorded with its cause (T60) in the sweep's notes.

## Sidecar log

| By | Finding | Result |
| -- | ------- | ------ |
| S1 | 1 Refused and live Owed rows restore at a reload, weakened (R5, I6) | rejected: StepEnds refuses both rows |
| S1 | 2 incarnation reads every owed row, reload only kept ones | rejected: no reload, the rows are live |
| S1 | 3 a refused ending at reload rests on CQ10, no Spec rule | changed: I24 holds, the row was never saved |
| S1 | 4 `keepsRow` matches Actors R10, Restore I6 | accepted |
| S1 | 5 capture exact, no `least` in the lifecycle | accepted, verified |
| S1 | 6 `turn/anchor.ts` `wrote` keeps a `least` bound | noted: outside the range; the Q26 edit says so |
| S1 | 7 `landed` keeps an older capture on equal counts | noted: unchanged in range, not reproduced |
| S1 | 8 `ReleaseHead` correct | accepted, planted (18 to 2 catches) |
| S1 | 9 held traces still run; exact list | accepted (O5) |
| S1 | 10 no owed row names T52 | accepted, grep re-run |
| S1 | 11 PAY-22@16 owner unchecked | rejected: prior review traced it to RETRY_COUNT (T19) |
| S1 | 12 no throws, retries, dates | accepted |
| S2 | 1-3 Q24 against I6's text | changed: the narrowing reads rows after the reload; right by R3 |
| S2 | 2 the narrowing reverses an accepted ruling | rejected: an agent item; the edit is labelled |
| S2 | 4 `Maybe` omitted from `keepsRow` | accepted as latent (O3) |
| S2 | 5 adoption path untraced; stale doc | accepted (O4) |
| S2 | 6 Kept and Delivering red to green; Refused, live Owed changed expectation | accepted |
| S2 | 7, 9, 11 Q25 matches the cancel cell; traces red on the parent | accepted |
| S2 | 8 no Recapturing phase in the model | rejected for T52: older; the Spec releases both alike |
| S2 | 10 CancelAll keeps AwaitRelease | accepted: retired, owed to T53 |
| S2 | 12 Q26 matches R10 | accepted |
| S2 | 13 Q26 red by API only | accepted, verified on the parent code (O2) |
| S2 | 14 a test named "still owed" asserts a delivery is allowed | rejected: owed means the delivery is allowed |
| S2 | 15 Q26 edit keeps I21, I22 owed | rejected: agent requirement, labelled; owed to T19 is right |
| S3 | gates.json table matches every changed verdict | accepted, re-derived |
| S3 | regressions: cells-105 is an addition | accepted, wording only |
| S3 | core mutants: six became killed | accepted |
| S3 | production: five lost catches, 54 added rows | accepted, re-counted |
| S3 | prototype: zero lost, 238 red to failed uncaught | accepted, cause traced to 196edbff (O6) |
| S3 | I10 checked by one mutant only | changed: cancel mutants and traces cover the removed clauses |
| S4 | T52 only in `records.ts` slice map | accepted |
| S4 | row moves, I21 and I22 to T19, I10 gone | accepted |
| S4 | 9 and 18 re-owned cells | accepted, re-counted |
| S4 | build log edits under a blanket label | accepted as covered |
| S4 | t61 build log append unlabelled | rejected: labelled in its next line, and T61's record |
| S4 | log.task says 19 | accepted, orchestrator's note |
| S4 | stale `not-yet.ts` text | accepted, prior review N6 |
| S4 | `trace.test.ts` tmpdir read; Task ids in trace names | accepted, standing angles |
| S4 | wrote two temp files under `/tmp` | noted: sidecar process breach, removed by it |
| S5 | the mutant's edit and the five cases | accepted, re-run |
| S5 | only PAY-16 reloads | rejected: every case ends with a reload after the Runtime disposal (`dsl/case.ts`) |
| S5 | cause in `turn/selection.ts` or `anchor.ts` | changed: bisected, all five green at 1c4168da (O1) |
| S5 | Q18's 47 does not reproduce (23 or 51) | rejected: greedy deletion gives 47 latest first |
| S5 | no CaseChecked line names a PAY case | accepted |
