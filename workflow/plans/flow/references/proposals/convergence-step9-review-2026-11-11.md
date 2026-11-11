# Convergence step 9 review (2026-11-11, `b2b51634..857873d8`, read at `857873d8`)

**Verdict: not yet. The suite is not correct enough for T16's Pay path to be judged by it. Fix H1 and H2 first.**
The convergence closed the member subclass: no reported member can now retarget, drop or unclaim what a row owes.
The perturbation test, PD and PH hold. But the class it was meant to close is "a report decides an obligation"
(RC1), and two other reports still decide one:

- **H1:** the turn's own header (event, from, to) picks the row. A runtime that drops every cancel and misreports
  `to` on those turns is caught by no oracle on the dropped cancel, in any of the 14 cases that catch the plain
  drop. Three of them are Pay cases. At `b2b51634` the same lie was caught.
- **H2:** a `Parked` report, plus a missing `Incarnated`, removes a delivery obligation. Two old runtime mutants
  that the old suite caught by Actors I29 in 18 cases now pass 15 of them outright. 13 of those are Pay cases.

Each step review found the next report field one step further on. The root is that what triggers an obligation
(which transition ran, whether the actor is live) comes from the runtime's claims. Members were one such claim.
The fix is one pass that anchors every trigger to a suite fact or a judged claim (see "What to do").

Everything else is Medium or Low:

- six cells and about ten trace cites follow round-14 or the tables, not the Spec. This is the common mode v2
  accepted. One cell refuses a runtime that follows Actors R21 (M1);
- STATUS overstates Run 7 and leaves five narrowings unlogged (M2);
- the build is 2.6 times v2's size estimate and larger than the code it replaced (M3).

Gates on a `git archive 857873d8` copy reproduce the builder's numbers (the copy has root configs, node_modules,
`apps`, `codebases`, `reference`, `scripts` and `packages/flow-state` linked):

- suite 87/87; null 0/87;
- `vp test` on `conformance/` 35/35; `vp check` zero;
- falsify `VERDICT pass 87/87 mutants caught, 3/3 probes hold`; coverage 36 of 186 checked, 0 gaps.

## How it was checked

- **Old lies on both trees.** These are every mutant in `prototypes/round-14/mutants-*.ts` plus every lie in
  `prototypes/conformance/falsify.ts` (the `lies` part), 1,035 unique edits. I ran each one's whole suite on a copy
  of each tree and kept each red case's oracle and Invariant (scratch `s9d/sweep.ts`, `s9d/diff.ts`).
  - At `b2b51634`, 180 do not apply (their text has changed since), and 98 turn some case red.
  - All 98 were run at `857873d8`. Every one is still red somewhere, and two no longer apply
    (`pay16.decline-not-delivered`, `lost.decline.mail`, already queued as the StaticCli/Port review's M3).
  - Five lost oracle catches in some cases (the table under H2 and L5).
- **The suite's own mutants on both trees.** That is 90 (the union of both commits'). Of the 83 that run on both,
  none lost an oracle catch in any case.
- **Probes.** These are edits to round-14, run on both trees (scratch `s9d/probes*.json`, results
  `s9d/pr-*.jsonl`):

| Probe (an edit to round-14)                         | `b2b51634`             | `857873d8`                         |
| --------------------------------------------------- | ---------------------- | ---------------------------------- |
| drop cancel and cancelAll, act and report (control) | 8 red, 7 by lane-queue | 14 red, all lane-queue I12/I20/I21 |
| the same, with `to: "Nowhere"` on each such turn    | 8 red, 7 by lane-queue | 14 red: 8 case-only, 6 a wrong I1  |
| the header lie alone, act unchanged                 | 5 red, I12             | 12 red, I12/I1/I15/I11/I20         |
| no `Incarnated` reported, act unchanged             | 0 red                  | DLV-04, DLV-05 (Actors I24, I15)   |
| no `Finished` reported                              | 0 red                  | 0 red (no case reaches grace end)  |
| park every unknown ending of a live actor           | 47 red, 16 by oracles  | 49 red, 20 by oracles              |
| every commit declines `NoPersistence`               | 67 red, all case-only  | 71 red, all case-only              |
| a reload drops queued commits with no ending        | 0 red                  | 0 red (unreached; Pay is `reject`) |

- **Reading.** Four Haiku sidecars, each verified (below), and my own reading of `dsl/lifecycle-step.ts`,
  `lifecycle-owed.ts`, `lifecycle-rules.ts` and `lifecycle-lanes.ts`, and `actors/disposal.ts`.
- **Lifecycle traces.** I traced two runs on a debug copy that prints each applied move (`s9d/dbg.ts`).

## Findings, ranked

Paths are under `packages/flow-state-v3/conformance/` at `857873d8`. Root-cause classes:

- RC1: a report decides an obligation;
- RC2: a cell or trace follows round-14, or the table, rather than the Spec;
- RC3: a check lost without a record;
- RC4: the verification record;
- RC5: size and simplicity.

### H1: the turn header chooses the row, so a lying header voids every owed member (RC1)

- **Where:**
  - `dsl/lifecycle-owed.ts:161-166`: `chosenRow` filters rows by `turn.event` and by `fromMatches(row, turn.from,
    turn.to)`;
  - `:177-188`: releases on leave are owed by the reported (event, from, to);
  - `dsl/lifecycle-step.ts:130-131`: the heard ending is found by `turn.event`.
  - No oracle compares `Turn.from` or `Turn.to` with anything the suite owns. `static-cli/graph-names.ts` reads
    part names only, and snapshots feed only case expectations.
- **Probe:** drop every cancel and cancelAll (as `mutant.cancel-members-dropped` does), and on those turns report
  `to` as a state no row names.
  - No oracle catches the dropped cancel in any of the 14 cases.
  - Eight fail only on their expectations: PAY-12/cancel-on-wire, PAY-15/cancel-on-wire, PAY-22, LANE-03, LANE-04,
    LANE-08, LANE-09 and LANE-10.
  - The other six fail by lane-queue WriteLanes I1, but that I1 refuses the row's own correct mint, which the
    voided row no longer anchors. It is not a catch of the cancel.
  - At `b2b51634`, the old `lane-queue` (which never read the header) caught 7 of its 8 red cases on the same
    probe. This is a regression the step-by-step diffs could not show, because no mutant lies about the header.
- **Same root, by reading:**
  - `Unhandled` and `Denied` (`lifecycle-step.ts:203-204`) and a second `InvalidTurn` (`lifecycle-rules.ts:437-442`,
    `Kept`) each dispose of a delivered ending with no `Turn`. So a runtime that says "unhandled" for an event
    whose row owes a cancel owes nothing.
  - Turn I2 (selection) is judged by nothing until T8 (`not-yet.ts`, "the Turn area is not built").
- **Rule broken:** the recorded decision "what a turn owes comes only from the reference and the turn's facts"
  (STATUS, Run 7, rule). Its claim "Nothing else of it is read" is not true. Also Conformance R4: the header is a
  claim, judged here against nothing the suite owns.
- **Why the gates miss it:** `lifecycle-perturbations.ts` perturbs `Turn.members` only. Each perturbation runs on
  the row's reference turn with the header fixed, so the test cannot see this.
- **Fix (proposed):**
  - Choose the row from anchored facts:
    - `from` is the actor's state carried by the suite from its previous anchored turn (or the reference model T8
      ports);
    - `event` is the suite's driven event, or the heard ending's mapped event;
    - the computed guard.
  - A reported `to` that differs from the chosen row's target is a refusal. It never unchooses the row.
  - An `Unhandled`, `Denied` or second `InvalidTurn` while a row matches and its guard passes owes that row's
    members anyway.
  - T8's `selection` oracle is the natural judge. The lifecycle should consume its anchored choice instead of the
    raw header. T16 already waits on T8.
  - Keep the header probe as a mutant (WriteLanes I12; PAY-12/cancel-on-wire, LANE-09).

### H2: `Parked` and a missing `Incarnated` remove a delivery obligation (RC1, RC3)

- **Where:**
  - Table C admits `Owed` → `Parked` with no condition (`dsl/lifecycle-rules.ts:445-450`), and `StepEnds` and
    `Reload` keep `Parked` (`:473-490`);
  - only `Incarnated` or the suite's `Adopt` (an unbound actor only) opens a parked ending
    (`dsl/lifecycle-fold.ts:43-45`, `dsl/lifecycle-step.ts:217-245`);
  - a restore owed at a reload is discharged by the decision alone (`dsl/lifecycle.ts:222`), not by delivery;
  - an unretained unknown's `Await Released` falls due only once its ending closes (`dsl/lifecycle.ts:451-459`).
    A parked ending never closes, so the release is never due, and `bootOwes` skips a head that owes a release
    (`:356-369`).
- **Evidence from old runtime mutants.** Two of them lose catches: `k.drop-row` (prototype `falsify.ts` lies, "a
  boot deletes every actor that has a restored ending in its mail") and `q1a.unchanged-resets`
  (`mutants-lifetime.ts`).
  - At `b2b51634` both were caught by `disposal` Actors I29 in these cases. At `857873d8`, 15 are green outright and
    3 are held only by case expectations:
    - PAY-05;
    - PAY-12/defect and PAY-12/cancel-on-wire;
    - PAY-15/press-pay-while-held, /retry-budget, /cancel-on-wire, /dead-activation-timer and /dispose-held (case);
    - PAY-16/timeout-per-send, /superseded-read, /disposal-ends-with-the-last-fiber, /read-defect-issue,
      /dispose-waiting-resend and /settled-during-disposal-parked (case);
    - DISP-02, DISP-04, DISP-05 and LANE-04.
  - Both mutants are still caught in 17 or 18 other cases, so Conformance R11's per-mutant rule holds and falsify
    stays green. Per case, the Pay path lost the check. STATUS does not log either mutant.
  - The trace (`k.drop-row`, PAY-05, the end-of-case reload) is `Reload` → `End att-2000-1 unknown { Restored }`
    (discharging the `AwaitRestore`) → `Parked` → `BootSettles` → `StepEnds`. There is no `Incarnated` and no
    refusal. The runtime deleted the actor's record, and the case passes.
- **Rule broken:**
  - Restore R1: "an identity whose captured lanes owe it an ending … is restored live at ready";
  - Actors R10 (a starting incarnation receives each Held head's `unknown { Restored }`);
  - Restore I6 and WriteLanes I15 (delivered once to a live incarnation).
  - The model takes "the actor is not live" from the runtime's `Parked`, and "an incarnation began" only from its
    `Incarnated`.
- **What does hold:** suppressing `Incarnated` alone, with the act unchanged, is caught where a kept ending is
  delivered (DLV-04 and DLV-05, Actors I24 and I15). The hole is the lie of omission: park, and say nothing.
- **Fix (proposed):**
  - Liveness from suite facts. At a `Reload`, each identity with a Held head or a parked ending owes an incarnation
    in that boot step (Restore R1), so its restore ending must be delivered by `StepEnds`, not merely decided.
  - A `Parked` is admitted only when the suite's facts make the actor not live: an unbound record, no held use, or
    disposing. Otherwise it is I15.
  - An unretained unknown's release falls due when its ending is parked, as it does when it closes unheard.
  - Make `k.drop-row` a `disposal` or `delivered-once` mutant on PAY-05 (Restore I6 or Actors I29, whichever the
    fix names). Log the 18 cases under Conformance R11.

### M1: cells and traces that follow round-14 or the table, not the Spec (RC2)

v2 Risk 1 said the traces would be read against the Spec at step 9. Read that way, these cells are wrong or
unsupported, and each has a trace that encodes it, so the cell-mutation gate passes while the cell is wrong:

- **a. forget's parked endings recorded as evidence are refused** (`dsl/lifecycle-rules.ts:467`, `RecordedOther`
  on `Parked`/`Owed` → I15; trace rows at `dsl/lifecycle-lives.traces.ts:235-245`). Actors R21 says forget's
  "parked and boot-queued endings become evidence", and the Port has `Recorded { why: "evidence" }`. Round-14
  reports `letGo` instead, and only `letGo` passes (`lifecycle-lives.ts:128-134`). A runtime that follows R21 to
  the letter is refused. It is not on the Pay path.
- **b. A restored queued commit with no ending closes silently** (`lifecycle-rules.ts:154`). The trace "the boot
  settles" (`dsl/lifecycle.traces.ts:382-388`) cites Restore R3 for the opposite of what R3 says ("each queued
  commit's NotSent { Restored } first"). The probe is red in no case on either tree. Pay is `reject` (W is 0),
  so Pay cannot reach it. It was carried to T11 as step 6 L2; the cite is new.
- **c. An interruptible call still `Interrupted` at a step's end is WriteLanes I20** (`lifecycle-rules.ts:161`,
  the `Unstoppable` fact, traces `lifecycle.traces.ts:403-416` citing "today's rule"). No Spec text names
  interruptibility, and I20 says "never on timing". Reading the step's end as quiescence ("when the fiber exits",
  R14) is defensible. State it as that reading with its R14 cite, or ask the user.
- **d. A delivery during the Runtime's disposal is I15** (`lifecycle-rules.ts:403`), cited as "WriteLanes R17
  (today's rule)". R17 is Cleanup. Actors R22 is the rule ("a call settling within 5 s is parked").
- **e. An unknown `Disposed` while running is Actors I35** (`lifecycle-rules.ts:123`). I35 is about the Runtime's
  disposal only.
- **f. Cites that do not say the expected outcome** (Conformance R5):
  - I11 for a queued Attempt's send or ending (`lifecycle-rules.ts:82, 89, 116`; the invoke rule is I1);
  - I16 as the default for phases with no settled ending (`:88, 115, 118`);
  - the commit deadline as I15 (`:207`; R10 is the rule, and I15 counts endings that exist);
  - `AwaitRestore`'s causes as Actors I29 and I32, which state no restore lower bound (`:202-204`);
  - WriteLanes R17 cited for disposal parking (`lifecycle-lives.traces.ts:139, 194, 283, 292, 307`);
  - the Port cited as a rule (`lifecycle-turns.traces.ts:53-54`);
  - "Actors R21: forget lets every kept ending go" (`lifecycle-lives.traces.ts:332`; R21 does not say that).

### M2: the verification record overstates Run 7 and misses five narrowings (RC4, RC3)

- **Run 7's claims.**
  - "The report is a claim … Nothing else of it is read" is not true: event, from and to choose the row (H1).
  - "the guarded rows stay exclusive whatever was reported" is not quite true either: `retryable` counts this step's
    reported `Send`s (`lifecycle-step.ts:103-107`). `attempt-identity` bounds the count against the server log, so
    this is Low.
- **Narrowings with no STATUS line** (sidecar b, each checked in code):
  - an Idle cancel's I20 now fires only on a decline in the same turn on that lane (`lifecycle-lanes.ts:391-395`).
    Before, any ending of the operation in the step fired it;
  - cancelAll's head-last now takes any addressable head, and only queued commits that ended `Cancelled` count
    (`lane-queue.ts:194-233`). STATUS logs only the "ended before" half;
  - Actors I29's never-sent check now counts mints made during the disposal, and an ending after `RuntimeDisposed`
    no longer excuses (`lifecycle-rules.ts:158-159`). STATUS L2 logs the instant only;
  - forget's evidence (M1a);
  - the 18 cases of H2.

### M3: size is 2.6 times v2's estimate, and larger than the code it replaced (RC5)

- **Size** (my counts; "code" is non-blank, non-comment lines):
  - production (the eight `dsl/lifecycle*.ts` and the three lifecycle oracles): 3,634 lines (2,504 code), against
    v2's "about 1,400";
  - the code it replaced at `b2b51634` (`lane-queue`, `lane-model`, `delivered-once`, `disposal`, `disposal-ledger`,
    `disposal-kept`): 2,453 lines (1,764 code);
  - that is 48% more, where v2 promised 35% less (v2's 2,853 baseline included two files that do not exist at
    `b2b51634`);
  - traces, tests and their support: 3,901 lines (3,484 code), against "about 450".
- **Distinctions no rule reads** (v2 requirement 6):
  - `Ending.incarnation` and `actors[].incarnation` are written (`lifecycle.ts:253, 496`, `lifecycle-lanes.ts:361`)
    and read only by test assertions. Per-incarnation judging is done by the `ParkedOpen`/`KeptOpen` toggles
    instead;
  - `Adopt` folds exactly as `Incarnated` does (`lifecycle-fold.ts:43-45`);
  - the causes `runtimeDisposal` and `disposeActor` have one deadline (`lifecycle-rules.ts:202-203`);
  - the `PendingCancel` deadline's Invariant can never be emitted (`by: "never"`).
- **Duplication:**
  - the head is derived in six places;
  - a member's target is turned into lanes three times, and the three differ (`lifecycle-lanes.ts:112-125`,
    `lifecycle-owed.ts:32-38`, `lane-queue.ts:74-82`);
  - `lane-queue`'s member-order cursor (`:113-169`) re-derives `OpenTurn.rest`.
- **Implicit state:** `mode` with `afterDisposal`; the `Parked`/`ParkedOpen` and `Kept`/`KeptOpen` toggles; and
  `hearing` (an index) with the ending's life.
- None of this blocks T16. It is the cost of the design as built, and the redesign under "What to do" should
  shrink it.

### Low

- **L1, decline reasons no policy gives are trusted (RC1):** `Unencodable`, `NoPersistence`, `OldVersion` and
  `ModuleDisabled` discharge a commit on any lane (`lifecycle-lanes.ts:338-349`), and `ending-channels` accepts
  any Flow decline. The probe is red in 71 cases, all case-only, on both trees. Case expectations hold Pay.
- **L2, retention follows the reported reason** (`fixtures/reference.ts:56-58`): under `cancel`, an unknown
  reported `Cancelled` is retained with no cancel member. R4 says retention is by origin. Pay has no `cancel`
  operation.
- **L3, I35 exempts an `Interrupted` call's `unknown { Cancelled }` at any instant** (`actors/disposal.ts:72-75,
  90-92`). An uninterruptible interrupted call ended `Cancelled` at the disposal's start, without its answer,
  passes. The exemption is logged; the timing blindness is not. PAY-06/uninterruptible is near it.
- **L4, `Finished` is an unanchored claim** that unbinds lanes and selects the I29, I32 or Restore I6 cause
  (`lifecycle-step.ts:228`). No case reaches a grace end (the probe is 0 red), so it is untested end to end.
- **L5, old-lie catches lost and accepted:**
  - `d26-capture-plain-write` lost lane-queue I12 in PAY-07/late-may-not-leave. The trace shows the re-send is an
    anchored `void.retry` heard from the parked `unknown { Disposed }`. That is legal by WriteLanes R8 (the step 4
    reviewer's rejected item 4). Its real fault, sending before capture, is WriteAhead's, and case expectations
    still catch it in five cases;
  - `r15.definition-persist-ignored` lost I29 in two PAY-16 cases, and `d90-delete-keeps-bucket` in DISP-06. These
    look like H2's mechanism (not traced). Both are still caught in 44 and 32 cases.
- **L6, small:**
  - `bootOwes` and `incarnate` can owe one restore twice, so there are two refusals if it is unmet;
  - `Resend` discharges every `Await Released` of the head (`lifecycle-lanes.ts:179-185`; latent, Run 2's F6);
  - a `Send` of a `Resending` head that owes its release cites I12 (`lifecycle-rules.ts:84`);
  - the claimed-row tie-break ("most members") departs from v2's "exactly one row" (logged in Run 7);
  - style: sentinels (`?? 0`, `?? "bound"`, `findIndex` -1), 21 lines over 120 characters, review tags in doc
    comments, and `sameAttempt` exported twice with different signatures.

## The pending items

- **CQ1 and CQ2:**
  - the code follows Actors R15 (a sent write's twice-refused ending is kept, with one try per boot) against
    WriteLanes I15's "a second refusal is final";
  - each is marked in `lifecycle-rules.ts:412-415`, and DLV-05 judges it on Pay;
  - answer CQ1 before T16, because production must pick one.
- **CQ6:**
  - a never-sent commit's disposal ending stays `Parked`, unjudged (`lifecycle-rules.ts:470`);
  - PAY-10/hang and PAY-13/waiting-flush-lost are Pay cases, so a production runtime may lose those endings
    unseen;
  - answer before T16.
- **R9:** a key-less member outside an ending follows round-14 (`lifecycle-owed.ts:65-73`, marked). Pay does not
  reach it. Fine as pending.
- **The retry gap:**
  - an owed retry that never re-sends is judged only by case expectations (falsify's PF: PAY-04, PAY-22; nine cases
    in the step 6 review);
  - it is marked only in STATUS and `lifecycle-perturbations.ts`, not in the cells;
  - recommendation for the user: a `Resending` head owes its `Send` by the step's end, as an Invariant. That is a
    guarantee change (WriteLanes R8 has no Invariant behind it).
- **Stated limits:**
  - claimed rows (Run 7 rule 7), a commit's key, and `LaneId` without a version are honestly stated;
  - "a parked ending still parked at the case's end is not judged" is stated, but it hides more than it says
    (H2).

## Answers to the brief's checks

- **A report that discharges an obligation:** yes, through the header (H1) and through `Parked` with no
  `Incarnated` (H2). Members no longer can, apart from the stated claimed-row limit (PD, PG and PH hold).
- **A check the pre-convergence oracles made that is gone:** per mutant, none; every old lie red at `b2b51634` is
  red at `857873d8`. Per case, two old mutants lost 18 cases, 13 of them Pay cases (H2), and `d26` lost one
  (accepted, L5).
- **A cell or rule that copies round-14:** M1a to M1e, plus the CQ-pending cells, which are marked.
- **Can the perturbation test and the cell mutations pass while a cell is wrong:** yes.
  - The perturbation test compares perturbed reports with the correct report on the same `step`, with the header
    fixed. It proves report-independence of members, not correctness, and it cannot see H1.
  - The cell mutations are killed by traces whose expectations the builder wrote. Where a trace follows round-14
    (M1a, M1b, M1c), the wrong cell is the one that survives.
- **Size against v2's estimate:** 2.6 times in lines and 1.8 times in code, and 48% larger than what it replaced
  (M3).
- **Did the design close the class?** It closed the subclass it targeted. The class remains, because obligation
  triggers are still read from claims (H1, H2, L1, L2, L4).

## What to do (proposed)

The policy allows one revision, and this is the point for it. Rather than fix H1 and H2 one at a time, run one pass
over the question "what anchors each obligation's trigger", and answer it for every trigger together:

- which row ran (H1, with T8's `selection` as the judge);
- whether an event or ending was disposed of with no turn (H1);
- whether the actor is live (H2);
- whether an incarnation began or ended (H2, L4);
- whether a decline reason applies (L1);
- whether an unknown is retained (L2).

Each trigger comes from a suite fact or a judged claim, never from the claim it judges. The same pass can merge the
distinctions in M3. Then put the header probe and `k.drop-row` in as mutants, fix M1's cells and cites, log M2's
rows, and get CQ1 and CQ6 answered before T16.

## Sidecar results (each verified; accepted, changed or rejected)

- **(a) report-driven holes:**
  - accepted: 1 and 2 (H2, confirmed by `k.drop-row`'s trace), 4 (H1, reproduced by the header probe), and 3 and 6
    (H1, by reading);
  - changed to Low: 5 (L2; Pay has no `cancel` operation), 7 (L4; the probe reaches no case), 9 (L1; the probe is
    case-only on both trees) and 11 (L3);
  - noted: 8 (the retry gap), 10 (a mislabelled operation; not checked further), and "a" (the reported `Send`s
    count, M2).
- **(b) lost checks:**
  - accepted: the table, which matches my reading where I checked it (rows 4, 29, 50, 51 and 53);
  - unlogged rows 1, 3, 4 and 7 → M2; 29c → M1a;
  - changed: 6 (row 50) and row 51 to notes, since Restore R1 supports deciding at the boot and STATUS L3 states
    the timing;
  - noted: 2 (row 19, CQ5) and 3 (rows 29b and 30, not on Pay).
- **(c) tables against the Specs:**
  - accepted: 1 (M1b), 5 and 6 (M1c), 15 (M1d), 18 (M1e), 19 to 28 (M1f) and 24 (M1f);
  - pending, as marked: 2, 3, 4, 8, 9, 10, 11, 17 (CQ10, CQ6, CQ1, CQ9, R9, rule 7, CQ2) → "The pending items";
  - changed: 7 to a note (Reload's `Owed` → `Closed` reads Restore's "what survives comes back as the boot's
    endings"); 12, 13, 16 and 31's tie-break to L6; 14 to a note (lenient, not wrong);
  - not reproduced: 29 (silent).
- **(d) simplicity and size:**
  - accepted: the size table (my counts match); 2.1 to 2.4 (M3, `incarnation` checked by grep); 4.1, 4.3 and 4.14
    (M3); 5.x (M3); 6.x (L6);
  - rejected: 4.3 as a bug. With no lane, the guard fails and the unguarded alternative is taken, consistently. It
    stays a duplication.
  - noted: 3.4 (`Applied.on`), 6.7 (two mutation mechanisms) and 7 (unimported exports).

## Method notes

- Scratch, in this session's scratchpad:
  - `s9-b2b51634` and `s9-857873d8` (archives);
  - `s9-dbg` (a debug copy whose `case.ts` prints the moves);
  - `s9d` (`list.ts`, `sweep.ts`, `diff.ts`, `one.ts`, `dbg.ts`, `probes*.json`, `old-lies.json`,
    `ol-*.jsonl`, `sm-*.jsonl`, `pr-*.jsonl`, `d26.log`, `kdr.log`, `falsify.txt`).
- I edited nothing in the live tree except this file.
- Every command ran under a `perl alarm` with stdin from `/dev/null`. The first background sweep was killed by me
  (my own pids, after checking the parent chain); no process of mine is left.
