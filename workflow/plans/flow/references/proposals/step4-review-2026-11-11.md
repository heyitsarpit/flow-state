# Convergence step 4 review (2026-11-11, `3d03715c..cf825289`)

**Verdict: not yet. Fix H1 and M1 before T16's Pay path is judged by `lane-queue`.** The switch itself is sound:
every gate the builder claims reproduces, the new cases and mutants are caught for their reasons, Port change 2 breaks
no mutant's anchor, and the H1 and H2 fixes hold on the paths they name. But `lane-queue` lost two checks it made
before step 4, and the builder's diff does not list either loss:

- it no longer judges a cancel that the turn's event owes when the runtime leaves the member out of its report (H1);
- it no longer judges cancelAll's "head last" when the head ends first (M1).

Gates on a `git archive cf825289` copy (node_modules, `codebases`, `apps` and `reference` symlinked; `workflow index`
run):

- suite 86/86; null 0/86; coverage 34 of 186 checked, 0 gaps;
- `vp test` on `conformance/` 19/19; `vp check` zero; `effect-tsgo` exit 0;
- falsify `--sweep`: 73/74, with `lane.held-auto-resend` "no verdict: killed after 120 s";
- at `3d03715c` the same sweep is 68/68.

The builder's numbers match.

## How the verdict diff was checked

The sweep prints only each mutant's red set and its first reason. To diff the reasons, I ran every mutant's whole
suite on both trees and kept every oracle and Invariant named per case (scratch driver `driver/sweep.ts`, 4 slices per
mutant, PAY-22 skipped for `lane.held-auto-resend`). Then I diffed `3d03715c` against `cf825289` over the old cases.

- No case turned green under any mutant. Every old mutant is still caught by its own oracle.
- Each change the builder lists reproduces, with the cites it gives:
  - `lane.cancel-held-keeps`: I12 in PAY-03, PAY-08, PAY-14 and both PAY-20;
  - `lie.held-released-unguarded`: I12 in LANE-04 and both cancel-on-wire;
  - `mutant.superseded-claimed`: +I8;
  - LANE-03 loses I9;
  - `p1h.cancel-all-idle-declines` goes from I20 to I21.
- Four changes are not in the log (see M4).

## Findings, ranked

Paths are under `packages/flow-state-v3/conformance/` at `cf825289`.

### H1: a cancel the event owes is judged only if the runtime reports its member (RC1, a report anchors the obligation)

- **Where:**
  - `dsl/lifecycle-step.ts:190-212` (`anchoredMembers`). A turn whose reported members differ from its one row
    anchors nothing. A turn with no lane member matches without any row (`lane.length === 0 ||`, `:194`).
  - The design: v2 "Matching" (`lane-oracle-convergence-v2-2026-11-11.md:207-213`). A mismatched turn anchors
    nothing, and "its effects are then unanchored, and each is refused under its own Invariant". A runtime that also
    skips the act has no effects to refuse.
  - The old oracle judged a cancel from the turn's event and the reference: `policy.cancels[turn.event]` (old
    `lane-queue.ts:175-200`). It used `mayCancel` for releases (`:221-248`). Neither field is read by the lifecycle
    or the new `lane-queue`.
- **Rule broken:**
  - WriteLanes R14 and R15, enforced by I12, I20 and I21;
  - the lifecycle review's RC1: a report alone anchors nothing, and a missing report must not discharge what is owed.
- **Probe:** round-14 drops every `cancel` and `cancelAll` member from both its act and its report (one edit at
  `prototypes/round-14/turn.ts:695`, `part.alt.members.filter(...)`).
  - At `3d03715c`, `lane-queue` fails 8 cases for the right reason:
    - LANE-03, LANE-09: I12, "no Released was reported";
    - LANE-04, LANE-10: I21, the queue left;
    - PAY-12 and PAY-15 cancel-on-wire, LANE-04: I20, the wire not ended;
    - LANE-08: I20, sent after the cancel.
  - At `cf825289`, `lane-queue` names none of these cases. The cases' own expectations catch them.
  - Where `lane-queue` does fail (PAY-03, PAY-08, PAY-14, PAY-20, PAY-21), it fails with I1, "place minted ... with
    no commit member of its lane". That is only because the `[pay.cancel, place.commit]` row no longer matches, so
    the attribution is wrong.
- **History:** STATUS carries this as the step-4 reviewer's item (5), "needs a call at step 9", for the mismatch case
  only. It does not say the old oracle caught it, and it does not cover the turn with no members.
- **Fix (proposed):** when exactly one row matches the turn's event, from, to and guard, the row's members are owed,
  whatever was reported. The row's cancel creates its `Await Released`, `PendingCancel` or `Await NotSentCancelled`
  as Table B does. A reported member list that differs from the row is refused, under I10 or as an unanchored effect,
  by a rule v2 states. This is a v2 Matching change. The design's lead can decide it as a correctness fix, since it
  restores a check the suite had (P3's exit criterion: it kills what the old suite kills).

### M1: cancelAll's "head last" is judged only when the head ends after the queue (a view lost its turn window)

- **Where:** `write-lanes/lane-queue.ts:186-189` (`stillOnWire`), used at `:204`. The view scans the whole step's
  moves. To skip a head that ended before the cancelAll, it keeps only a head that had not ended when the queued
  commit ended. The old view judged inside the cancelAll turn's window (old `lane-queue.ts:71-85`).
- **Rule broken:** WriteLanes I21 ("queued `NotSent { Cancelled }` in mint order, then the head's ending") and R15
  ("the head's ending ... is delivered last").
- **Evidence:** `lane.cancel-wire-as-never-sent` on LANE-04. At `3d03715c` it fails with I20 and I21 ("cancelAll
  delivered the head att-1000-1's hold-leaving ending before the queued att-1000-2, att-1000-3"). At `cf825289` it
  fails with I20 only. A runtime that acts on the head before the queue and delivers the head's ending first is no
  longer I21.
- **Fix:** anchor the view to the cancelAll's turn. The head is the lane's addressable Attempt when that turn opens.
  Judge the deliveries from that turn's open, wherever the head's ending falls. The reviewer's earlier concern (a head
  that ended before the cancelAll) is then excluded by the anchor.

### M2: H2 holds for a turn that hears the ending, not for one heard by `Unhandled` or `Denied` (same class as H2)

- **Where:**
  - `dsl/lifecycle.ts:392-398`: an `Await` with `heard` is due at the next `TurnCloses` of any actor;
  - `dsl/lifecycle-model.ts:111-116`: `Await` stores `heard: boolean` and names no ending or turn.
  - The doc (`dsl/lifecycle.ts:377-380`) and STATUS say that an `Await` heard with no turn is due "at the step's end".
- **Rule broken:** WriteLanes R4, as the builder reads it for F3. It is also H2's class, a deadline that names no turn:
  the verdict depends on an unrelated actor's turn.
- **Probe:** a step test on `step` (scratch, removed) over R15Switch: `Ended(Lost)`, `Delivered(Unsure)`,
  `Unhandled(Unsure)`, a `Turn` of another actor, `Unhandled`, `Released`. It gives I12 twice. The same facts without
  the other actor's turn give nothing.
- **Checked as holding:**
  - H2's own probe: one step and the same facts split over two steps both give `[]`;
  - H1's probe: a Held `void`, a turn with a `void.release` member, `Released`, gives I12.
- **Root:** the `Await` stores a flag instead of naming the ending that owes it. STATUS's carried items (2), (4) and
  (10) share this root: an `Await` flipped by a later ending of the same Attempt, an `Await` that is never due, and
  `Resend` dropping an unheard `Await`.
- **Fix:** `Await` names its ending. It is due at the close of the turn that hears that ending, or at `StepEnds` when
  the ending is heard with no turn. Whether it was heard is read from the ending's life.

### M3: PAY-21 depends on an order the Spec does not give (the case follows the runtime)

- **Where:**
  - `write-lanes/lane-anchors.scenarios.ts:47-58`. Both pay answers come at one instant, so both shoppers' rereads
    fall due together at `advance(REREAD_MS)`.
  - Both shoppers read intent `pi1` (`CART`, `fixtures/pay-steps.ts:15`).
  - `c.answer("intent", …)` takes the oldest open request (`dsl/case.ts:268-272`).
- **Rule broken:** Conformance R5: an expected value comes from a cited rule. No Spec orders timers that fall due at
  the same instant across actors (grep of `workflow/specs/core`).
  - A correct runtime that fires shopper-2's reread first gets the "captured" answer for shopper-2.
  - The case then fails "one released" and "two still held".
- **Fix:** advance between the two pay answers so that one reread falls due first, or give the shoppers distinct
  intents and answer by input.

### M4: the verdict diff is incomplete, and two new verdicts cite a rule that does not give them

- **Not in the builder's log** (Conformance R11 asks for every verdict change):
  - `lane.cancel-wire-as-never-sent`: LANE-04 loses `lane-queue` I21 (M1);
  - `mutant.ending-without-id`: `lane-queue` I1 in PAY-06/uninterruptible, PAY-12 and PAY-15 cancel-on-wire,
    PAY-16/stale-send-fenced and LANE-04, "pay declined TimedOut with no commit member";
  - `d154.moved-fail-released`: `lane-queue` I12 in LANE-04, "att-1000-2 (Gone) got Released";
  - `lane.unknown-promotes`: both PAY-20 cases now first fail with `lane-queue` I12, "Await att-1000-1 was not met by
    TurnCloses", instead of `disposal` Actors I29.
- **Cites that do not fit:** WriteLanes I1 is "no commit is invoked except ...". The fold uses it as a catch-all for
  reports that are not invocations:
  - a decline outside a turn, or with no commit member (`dsl/lifecycle-lanes.ts:374`, `:389`);
  - a second mint of one id (`:316`; I6 gives it: "no two writes share an id");
  - a move on an Attempt never minted (`dsl/lifecycle.ts:354`).
  - `ending-without-id`'s new I1 is the first of these.
- **Diagnostic:** `due` prints `Await <id>` without the report it awaited (`dsl/lifecycle.ts:405-408`). The PAY-20
  message does not say whether a `Released`, a `Superseded` or a `NotSentCancelled` was missing.
- **Fix:** add the four rows to STATUS's reach changes. Give each catch-all refusal the rule that states it, or a
  named "unanchored report" refusal that a Spec rule backs. Put the awaited report in the `due` text.

### Low

- **L1. Dead code and two copies of one fact (class E).**
  - `write-lanes/lane-model.ts` (418 lines) has no importer.
  - `OperationReference.mayCancel` is read by nothing. `cancels` is read only by `actors/disposal-ledger.ts:219`.
  - v2 says the rows replace both, so the reference states the cancel alternatives twice.
  - H1's fix may want `cancels` back as the owed-cancel source. Decide that first, then delete the rest.
- **L2. The I9 view cannot fire.** Every move that would make a second addressable head is refused (I11, I12), so
  `bounds`' `heads > 1` (`lane-queue.ts:61-68`) never sees one. LANE-03 lost its I9 this way.
  - Coverage still says I9 "not yet" (T7), which is honest.
  - The doc (`lane-queue.ts:222`) lists I9 among the refusals.
  - I8 is also judged at the step's end only (old: at each turn); `latest`'s bound of 1 is seen only there.
- **L3. H1's fix is per operation, not per leave.**
  - `releasesOnLeave` anchors a release member on any turn (`dsl/lifecycle-step.ts:203-207`). R16 allows only the
    `whenAbandoned` turn.
  - No fixture declares one, and no trace is positive (carried).
  - A release on an operation that is not leaving voids the whole turn, so the turn's commit mints as I1. This is
    `lie.release-member-claimed` failing with I1 beside I12 in 6 cases.
- **L4. `isWrite` (`dsl/lifecycle-step.ts:67-68`).**
  - It matches the name across all machines.
  - It restates `operationNamed` (`fixtures/reference.ts`).
  - Its early return (`:231`) also skips a read's `Delivered`, so a read's delivery no longer closes the open turn.
- **L5. Docs and names.**
  - `lane-queue.ts:222-233` has three errors: I9 is listed as a refusal; "a retry's resolution" owes `Released`
    (none does; `Resend` clears it); and Tables A and B are said to be in `lifecycle-step.ts` (they are in
    `lifecycle-rules.ts`).
  - `lifecycle-model.ts:104-105` says "`heard` says that turn is open", which is false on the `Unhandled` path.
  - Review ids appear in code text: `lifecycle.ts:381`, `lifecycle-step.ts:412`, `lane-anchors.scenarios.ts:24,32`,
    `lane-queue.mutants.ts:26`.
  - The trace "owes nothing at the step's end" expects `owed: 1` (`lifecycle-obligations.traces.ts:91-97`).
  - F3's step-end half is cited as R4's text, not as a reading (`lifecycle-obligations.traces.ts:77`,
    `lifecycle.ts:381`).
  - PAY-21's doc cites R9 and I12, while its `cites` add R14 and I10.
  - Two exported `LifeStep` types exist (`lifecycle-lives.ts:19`, `lifecycle-step.ts:45`).
  - `lifecycle-turns.traces.ts:44` and STATUS cite `turn.ts:752-757`, which is now `757-762`.
- **L6.** The serialize bound appears twice: `BOUND` (`lane-queue.ts:28-33`) and `MAX_WAITING`
  (`lifecycle-lanes.ts:31`).
  An undeclared operation defaults to `reject` (`lane-queue.ts:52`).
- **L7.** A dead arm: `last === undefined` (`dsl/lifecycle-step.ts:382-384`) cannot hold, because `StepEnds` was just
  pushed.
- **L8. Records.**
  - Step 4 is noted in STATUS only, not on the T7 Task.
  - `workflow format --check` flags `workflow/tasks/V3/log.task` at `cf825289`: the coordinator's notes have lines
    over 120 characters.
- **Resolved after the range (not re-verified):** the sweep has no bound per case, so `lane.held-auto-resend` on
  PAY-22 runs past the child's 120 s (Conformance R9, R10).
  - Seen alone: killed by my 45 s alarm.
  - In my per-case run without PAY-22 it is caught on LANE-03 and PAY-15/press-pay-while-held.
  - `2dec83cb` says it adds a bound per case.

## Answers to the brief's checks

- **Does every verdict change cite a rule that gives it?** The listed ones do. The `p1h` move to I21 rests on R15
  ("acts on the head as cancel does") with R14's Idle clause, and R15 is enforced by I21. That is defensible, and v2
  intended it. The unlisted I1 rows do not (M4).
- **Is anything `lane-queue` judged before step 4 no longer judged?** Yes:
  - a cancel the event owes, judged without its member (H1);
  - head-last when the head ends first (M1);
  - I9 as a second cite (L2, harmless);
  - the bound at each turn (L2).
- **Do the H1 and H2 fixes hold?** Yes on their probes. H2's class survives on the `Unhandled` and `Denied` path (M2).
  H1's leave check is per operation (L3).
- **Does Port change 2 break an old-suite mutant's anchor?** No.
  - An applicability diff of every round-14 `mutants-*.ts` edit is identical between `3d03715c` and `cf825289`
    (1,005 edits).
  - The only old-suite edit inside `finish` is `turn.timers-not-reaped`, whose order is unchanged.
  - `lie.release-on-guarded-read` and `lie.release-other-lane` are anchored at `tx.touchedActors.add(w.a.key)`. They
    now release after the turn note, and both are still caught as I12.
- **Do PAY-21 and PAY-22 test the Spec?**
  - PAY-22 does. Its retries come from R9's `retryable` with `times: 3`, and its release from R14. The notice is the
    fixture app's own memory update, the suite's convention.
  - PAY-21's values come from R14 and R9, but which shopper is released depends on runtime order (M3).
- **Code quality:** M2's root, L1, L4 to L7.
- **The builder's log:** the gates are accurate; the reach changes are incomplete (M4); H1's regression is carried
  under-described (H1).

## Sidecar results (each verified; accepted, changed or rejected)

- **(a) code quality:**
  - accepted: 1 (L1), 6 (L6), 10 (L5), 13 (L7), 16 (L5);
  - changed: 2 → M2's root, since the flag is the cause of the H2 residual, not only of style;
  - changed: 8 → L3 (the I1 attribution is seen in the sweep); 4 and 5 → L4 and L1 (transitional while steps 5 to 7
    move the other oracles);
  - rejected: 3 ("a runtime-invented operation passes"; reads are what the skip removes, as the old oracle did);
    7 (`fixtures/reference.ts:5` says the reference is written by hand; the missing positive trace is carried);
    9 (refusals outside the guarantee wait for steps 5 to 7, and `delivered-once` still judges I15 and I16 on its own
    ledger, so nothing judged before is lost); 17 (harness, not core; the suite runs in 3 s); the rest are style Lows
    not repeated here.
- **(b) types, comments, lint:**
  - accepted: 1 (L1), 2, 3, 4, 5, 7, 8, 9 (L5), 10 (L4);
  - rejected: 11 (import order; `vp check` is clean), 12 (the prototype is outside lint).
  - It found no casts, `!` or disables in production code, and I agree.
- **(c) `lane-queue` against WriteLanes:**
  - accepted: F1 (H1, reproduced by probe), F7 (L2), F9 (into M4), F10 (L3), F11 (L5), F12 (L1), F13 (M2's root);
  - changed: F6 → L4;
  - rejected: F8 (the builder's rejection holds: a retry in its own ending's turn is legal under R15Switch, and
    `lane.held-auto-resend` is still caught by I12).
  - Noted, outside the range: F2 (Table A's `Unsent` cells are pending CQ5), F3 and F5 (Table A cells unchanged since
    the lifecycle review; latent).
  - Its old-to-new table missed M1, which the reason diff found.
- **(d) cases, mutants, Port:**
  - accepted: 2 (resolved after the range), 3 (M3), 6 (L5), 11 (L5);
  - changed: 4 (re-run: both still caught as I12, so no finding);
  - rejected: 1 (the notice comes from the fixture app, not the runtime), 5 (see the `p1h` answer above), 10 (I10 is
    order-only by design);
  - noted: 7 (the shared `pi1` feeds M3), 8 (`lie.*` names edit the act too; naming only), 9 (R13 holds by
    construction; this predates the range).

## Method notes

The scratch files are in this session's scratchpad: the `cf` and `b4` archive copies, and `driver/sweep.ts`,
`driver/probe.ts`, `driver/applies.ts`.

- I edited nothing in the live tree except this file.
- Every command ran under a `perl alarm` with stdin from `/dev/null`. No process of mine is left.
- Two `falsify` processes running from `scratchpad/base` and `scratchpad/new` are not mine, so I left them running.
