# Convergence step 6 review (2026-11-11, `48109efd..ee896e0d`)

**Verdict: step 6 is sound; the range is not yet done. Fix H1 before `lane-queue` judges T16's Pay path.**
`disposal` on the fold loses no check: every mutant is caught where it was, and the two lies moved to I15 are moved
rightly. But a reported `Nothing` target still voids the members a row owes (H1). That breaks the recorded decision
"what a turn owes comes only from its row". It is not a regression: `2ab39d18` behaves the same.

- Every gate the builder claims reproduces.
- The verdict diffs for Run 4 and Run 5 match the log row for row. One reading is missing (L1).
- An owed `retry` is judged by no oracle at all (M1). So the member-mismatch gap was retired for cancels only.
- An unknown-operation member still unclaims Pay's claimed `Leave` row, though the H1 fix says it drops only itself
  (M2).
- Actors I29's boot path is still caught, but no kept mutant expects it any more (M3).

Gates on a `git archive ee896e0d` copy, with node_modules, `apps`, `codebases`, `reference`, `scripts` and
`packages/flow-state` linked:

- suite 87/87; null 0/87 (every case `Fail`);
- coverage 36 of 186 checked, 0 gaps;
- `vp test` on `conformance/` 30/30;
- `vp check` zero; `effect-tsgo` exit 0.

## How the verdict diff was checked

I ran every runtime mutant's whole suite on `2ab39d18` (before step 6) and on `ee896e0d`, kept each red case's
oracle and Invariant, and diffed them. This is the step 5 reviewer's driver (`s5d/sweep.ts`, `s5d/diff.ts`).

- 81 mutants before and 83 after. There were no errors and no unapplied edits. Each mutant is caught by its own
  oracle and Invariant in at least one case (83/83, 81/81).
- Step 6 and the H1 fix: the diff equals the log. These are `lie.boot-says-disposed` and `lie.boot-drops-held` (−I29
  in 26 cases, I15 kept), `mutant.adoption-skips-parked` (DISP-06 −I29), and the I29 and I35 gains. They also
  include `lie.release-member-claimed` turning green in six cases, and the two new mutants.
- Run 4: I diffed the step 5 reviewer's `48109efd` sweep against `2ab39d18`. It equals the log:
  `mutant.ending-without-id` loses lane-queue I1 in five cases, LANE-04 regains I21, and DLV-05 only widens red sets.
- No case turned green under any mutant except the six of `lie.release-member-claimed`, which are logged.

Probes, each an edit to round-14's `turn.ts`, run on both trees (scratch `s6d/p*.json`):

| Probe | Edit                                                            | `2ab39d18`                 | `ee896e0d` |
| ----- | --------------------------------------------------------------- | -------------------------- | ---------- |
| PDC   | drop every cancel and cancelAll from act and report (control)   | 14, lane-queue I12/I20/I21 | same       |
| PD    | the same, but report each dropped cancel with target `nothing`  | 10, case only; 4 green     | same       |
| PF    | drop every `retry` member from act and report                   | 9, case only               | same       |
| PG    | report the turn's members in reverse order (act unchanged)      | 0                          | 0          |
| PH    | report one extra member of an unknown operation (act unchanged) | 3, lane-queue I1           | same       |

`mutant.delivered-during-disposal`, run alone on `ee896e0d`, shows why it gains I29 (L1).

## Findings, ranked

Paths are under `packages/flow-state-v3/conformance/` at `ee896e0d`. Root-cause classes:

- RC1: a report discharges an obligation;
- RC2: a gap recorded as closed;
- RC3: a check with no mutant;
- RC4: the verification record.

### H1: a reported `Nothing` target voids an owed member (RC1)

- **Where:**
  - `dsl/lifecycle-step.ts:233` (`owedMembers`): an owed member takes the report's whole target (`said.target`).
  - `dsl/lifecycle-lanes.ts:125`: `Nothing` on a cancel, retry or cancelAll names no lane, so nothing is owed.
  - The doc at `dsl/lifecycle-step.ts:484` says "the report confirms the row and gives a member's key". The code
    lets the report choose the target, `Nothing` and `Every` included.
- **Rule broken:**
  - the orchestrator's decisions in `log.task` (00:36 and 01:30): "obligations come from the reference rows,
    reports only confirm"; "what a turn owes comes only from its row";
  - WriteLanes R14 and R15, through I12, I20 and I21.
- **Probe PD:** the runtime drops every cancel and cancelAll, as `mutant.cancel-members-dropped` does, and reports
  them with target `nothing`.
  - With the member simply omitted (PDC), `lane-queue` catches it in 14 cases.
  - With `nothing` reported, no oracle fails anywhere. Ten cases fail only on their expectations.
  - PAY-08/reloadDuringCharge, PAY-14 and both PAY-20 cases go green.
  - So a wrong runtime does better by reporting a member than by omitting it. That is the H1 class of the last
    two reviews.
- **Same mechanism, by reading:**
  - A reported `Key` of another lane redirects the owed member to that lane.
  - A guarded row's guard reads the reported target (`guardHolds`, `:154-156`). A `Nothing`, `Every` or wrong `Key`
    fails the guard, so no row is chosen and nothing is owed (sidecar d F1, F2).
- **Not tied to R9:** the builder carried this as waiting on R9's `Only`/`Every` question. It does not wait on it.
  - On a correct round-14 run, no owed member in any fixture is reported `nothing`. Pay's cancels and retries in
    other operations' endings carry their own key (`O.pay.cancel(intent)`, `O.pay.retry(intent)`), and an
    unencodable key is a commit's.
  - So refusing the report's target on an owed member changes no correct verdict. Check this by the suite staying
    87/87.
- **Root:** a row does not say how its member names its lane: an own key expression, the heard ending's Attempt
  (I14), or unkeyed. So the fold falls back to the report.
- **Fix (proposed):**
  - Give each `RowMember` how it names its lane (`own key`, `ending`, `only`), derived by the change detector from
    the compiled member (`mem.key`).
  - Owe the target from the row. Take only the `Key` value from the report, and only for an `own key` member.
  - A report whose target disagrees with the row's kind is refused as I10's report check, or dropped. It never
    replaces what is owed.
  - Keep PD as a mutant (I12; PAY-03, PAY-14).

### M1: an owed `retry` is judged by no oracle, so the member-mismatch gap is retired for cancels only (RC2)

- **Where:**
  - STATUS, Run 3 ("This retires the member-mismatch item: the owed members' effects are judged under I12, I20
    and I21");
  - `log.task` 00:36 ("the 'dropped member' guarantee gap is withdrawn, since existing Invariants cover it").
- **Probe PF:** the runtime drops every `retry` member from act and report.
  - No oracle fails, on either tree. PAY-04, PAY-05, PAY-15/retry-budget, PAY-16 ×5 and PAY-22 fail only on their
    expectations.
  - Why: an owed retry makes the head `Resending` (Table B), and nothing is due for a `Resending` head that never
    sends. A head left Held breaks no Invariant. I12 forbids leaving Held, and I7 counts only invoked re-sends.
  - The guard makes it worse on Pay's `IntentRead` UNSURE→PAYING row. With the member unreported, `owedTarget`
    gives `Every`, because the heard ending is the read's. `guardHolds` then finds no lane (`:140`), so the row
    is never chosen.
- **Rule:** WriteLanes R8 says "retry(k?) re-sends a Held Attempt". No Invariant states it, so the gap the user
  was told about in Run 2 stands for `retry`.
- **Fix (proposed):**
  - Restore the gap for the user, scoped to `retry`: add an Invariant that an accepted retry member re-sends, or
    give `Resending` a send deadline.
  - Correct STATUS and the log.
  - Fixing H1's member kinds also lets the `IntentRead` guard read its own lane.

### M2: an unknown-operation member still unclaims the claimed row (RC1, H1 fix incomplete)

- **Where:** `dsl/lifecycle-step.ts:244` and `:250`. `sameMembers` compares the raw reported list, unknown
  operations included, against a `claimed` row. The doc at `:489-490` says such a member "drops only itself.
  Neither ever cancels what the row owes".
- **Probe PH:** one extra reported member of an operation no fixture knows, with the act unchanged.
  - PAY-07/late-may-not-leave and both PAY-19 cases fail as `lane-queue` WriteLanes I1, "void minted ... with no
    commit member of its lane".
  - That is a correct mint, misattributed: `Leave`'s owed `void.commit` was voided by the report.
  - Combined with a dropped `void.commit`, it would pass silently.
- **Rule:** the H1 fix's own contract (above), and Conformance R4: a report-only mismatch is not a violation.
- **Fix (proposed):**
  - Drop unknown-operation members, through `laneMemberOf`, before `sameMembers` in `chosenRow` and in
    `anchoredMembers`.
  - Keep PH as a mutant that must stay green, or as a step example.

### M3: Actors I29's boot path lost its mutant (RC3)

- **The move is right.** `lie.boot-says-disposed` and `lie.boot-drops-held` still decide `unknown { Restored }`:
  `noteEnding` runs and `setLane` revives the head Held, as in `prototypes/round-14/durable.ts:499-511`. They drop
  only the mail.
  - Actors I29 says "every non-Idle lane still exists", and here the lane exists.
  - The `AwaitRestore` is discharged at the decision (`dsl/lifecycle.ts:222`, Table A `Held` × `owedRestore`).
  - The undelivered ending is WriteLanes I15's.
  - The old oracle read "delivered" as "survived". That over-read I29; the move is not a narrowing.
  - Sidecar c's F1 (that only a `Delivered` discharges it) is wrong: `lifecycle.ts:222` discharges at the `End`.
  - The lies' `DisposeStart` note is read by nothing, on either tree, so the "says disposed" half was always a
    no-op.
- **What it leaves:** the `AwaitRestore { runtimeDisposal }` deadline (`dsl/lifecycle-rules.ts:202`) is now held
  only by the lifecycle unit tests.
  - `mutant.boot-skips-restored` drops both the decision and the mail. It is caught as Actors I29 in
    PAY-15/dispose-held and 20 other cases, but it expects Restore I6, so falsify never counts those catches.
  - No `disposal` mutant expects I29 at a boot.
  - A later edit that weakens that cell keeps falsify green. Step 5's M2 (PAY-19) had the same shape.
- **Rule:** Conformance R6, a check held by a mutant.
- **Fix (proposed):** add a `disposal` mutant from `mutant.boot-skips-restored`'s edits, case PAY-15/dispose-held,
  expecting Actors I29.

### Low

- **L1, the verification record (RC4):**
  - `mutant.delivered-during-disposal` gains I29 in two PAY-16 cases with no reading. The reason is that the
    delivered ending's turn mints `place` during the disposal, and `RuntimeDisposed` finds it `Unsent`
    ("place att-1000-2 (Unsent) got RuntimeDisposed"; Actors R22, "a never-sent queued commit ends NotSent {
    Disposed }"). The old oracle saw only commits never sent at the start.
  - The step 5 review's L2, L3 and L6 to L13 have no disposition in STATUS or the Task. L2 (silent skips),
    L10 (report order), L11 and L13 still apply at `ee896e0d`.
- **L2, a check moved to a later instant:**
  - The never-sent check now fires only at `RuntimeDisposed` (`dsl/lifecycle-rules.ts:156-160`).
  - A reload with no `RuntimeDisposed` turns the commit into `Restoring` and closes it silently (`:146-154`). The
    old oracle judged it at the reload.
  - The end of every case requires one `RuntimeDisposed` (`dsl/case.ts:456-465`), so this is a case expectation,
    not a hole. Mid-case disposals are judged only that way.
  - Pre-existing and related: Restore R3's "each queued commit's NotSent { Restored }" at a reload has no cell.
    `BootSettles` closes `Restoring` with nothing owed.
- **L3, a timing assumption now carries I29:**
  - The old oracle judged survival only for re-attached owners. The fold owes every Held head's restore by the
    reload step's end (`dsl/lifecycle.ts:356-372`), whether or not the actor attaches.
  - A runtime that decides restores when an actor wakes would fail Actors I29. The step 5 review accepted this
    timing for Restore I6 (its call 1); step 6 extends it to I29.
  - State it in `disposal`'s Gotchas.
- **L4, two I35 paths disagree on an `Interrupted` call:**
  - `cutShort` exempts its own `unknown { Cancelled }` (`actors/disposal.ts:72-75`, `:91-92`).
  - `pastBound` (`:104-113`) flags the same call if its `Cancelled` arrives in a step after the bound.
  - No case reaches it.
- **L5, carried and pre-existing:**
  - `endsAs` accepts any reason when the answer has none (`actors/disposal.ts:68-70`), so an in-bound `Lost`
    answer ending `unknown { Disposed }` passes I35.
  - I31's "parked" half is unjudged.
  - Both are as before step 6.
- **L6, a release on leave is never owed unless reported (RC1, latent):** `anchoredMembers` takes releases only
  from the report (`dsl/lifecycle-step.ts:276`). Every fixture's `releasesOnLeave` is empty, so no case reaches
  it. This is the same root as H1: the row does not carry it.
- **L7, docs and dead code:**
  - README's `disposal` row (`README.md:303`) still lists both moved lies and omits
    `mutant.bound-ending-wrong-tag`. Its I15/I16 row (`:267`) lacks them and the step 5 mutants.
  - `cancels` (`fixtures/reference.ts:22-34`), `laneAtMint` and `laneAtSend` (`dsl/domain.ts:53-78`) have no
    reader. They are on step 8's list.
  - `ending-delivery.scenarios.ts:21` still says "ending ledger".
  - `case.ts:109-110` says `answerTo` matches key fields, but it takes any fields.
  - `disposal.mutants.ts:10-11` groups `o6.dispose-interrupts-wire` under "edit the disposal's bound".
  - Review tags remain in doc comments and test names (sidecar b items 5 and 6).
- **L8, style (lint-bomb STYLE.md):**
  - `actors/disposal.ts:254` `UNBOUND` shares its name with a different set at `dsl/lifecycle-step.ts:412`.
  - `actors/disposal.ts:218-220` uses a `findIndex` `-1` sentinel.
  - `opened` falls back with `?? []` on a move the step always pushes (`:164-169`).
  - `lie.cancels-reported-as-release` passes state between two edits through `(w as any).said`
    (`write-lanes/lane-queue.mutants.ts:422`, `:428`).

## Answers to the brief's checks

- **Can a report still discharge an obligation?** Yes. A `Nothing` target (H1), or a wrong `Key` or `Every` on a
  guarded member (H1, by reading), voids what the row owes. An unknown-operation member unclaims `Leave` (M2).
  Reordered reports are harmless (PG: 0 red); act order is I10's view.
- **Is anything `disposal` judged before step 6 no longer judged?**
  - No mutant lost a catch.
  - I36's non-`Restored` unknowns moved to I16 (`delivered-once`), which Actors I36's wording supports.
  - The never-sent check fires later (L2), and the I29 boot path lost its mutant (M3).
  - The window now includes re-sends on the wire, which I35's "a call on the wire at its start" supports.
- **Is the move of the two lies right?** Yes, under I29's text (M3). It is not a narrowing, but it needs a
  replacement I29 mutant.
- **Does every verdict change cite a rule?** All but one (L1).
- **The builder's log:**
  - the gates and both verdict diffs are accurate;
  - the member-mismatch retirement overclaims (M1);
  - the step 5 Lows' disposition is missing (L1);
  - H1's carry as "tied to R9" is not right (H1).

## Sidecar results (each verified; accepted, changed or rejected)

- **(a) code quality:**
  - accepted: 1 and 2 (L7), 5 and 9 (L8), 15 (L8);
  - noted as pre-existing (outside the range): 3 (`mode` plus `afterDisposal`), 4 (`Walk.reloaded`), 6 (step 5's
    L13, carried in L1), 7, 8, 10 to 13;
  - 14 (line widths) noted: `vp check` passes.
- **(b) types, comments, lint:**
  - accepted: 3 (L7), 7, 8, 14, 5 and 6 (L7), 1 and 2 (L7);
  - noted: 4 (the README's mailbox row claims I24, now `delivered-once`'s; fold into L7's README fix), 10 to 13
    and 15 (types and duplication, pre-existing).
  - Confirmed: no casts, `!` or suppressions added outside mutant edit strings.
- **(c) `disposal` against Actors:**
  - accepted: the old-to-new table, which matches my reading; F3 (L2); F4 (L4); F5 (L5); F7 (L5);
  - changed: F2 to L3 (a timing assumption; no case shows a false refusal, 87/87); F6 to a note (I36's wording
    is about restores, and the rest is I16, still judged); F8 noted (logged by the builder);
  - rejected: F1. The `End` discharges the `AwaitRestore` (`dsl/lifecycle.ts:222`); the diff and PAY-15/dispose-held
    confirm it. F9, F11: the same as before step 6, and stated in the Gotchas.
- **(d) report-driven holes and the verdict diff:**
  - accepted: F1, F2, F3 (H1, reproduced by PD); F8 (M2, reproduced by PH); X1 and X2 (L6);
  - changed: F5 to no finding (PG: 0 red; act order is I10's); F6 and F9 noted (known, v2 Risk 2); F4 noted (no
    fixture reports an encodable commit key as `nothing`); R1 to R7 into L1 (step 5's L2, pre-existing);
  - verdict-diff rows: accepted for `mutant.delivered-during-disposal` (L1). Rejected the "NO RULE" for step 5's
    M3 rows: the step 5 review gives their causes, and STATUS repeats them.

## Method notes

- Scratch, in this session's scratchpad: `s6r` (`ee896e0d`), `s6o` (`2ab39d18`), `s6g` (gates), `s6d` (drivers,
  probe edits, `old.json`, `new.json`, `diff.txt`, `diff-run4.txt`, the probe outputs).
- I edited nothing in the live tree except this file.
- Every command ran under a `perl alarm` with stdin from `/dev/null`. No process of mine is left.
