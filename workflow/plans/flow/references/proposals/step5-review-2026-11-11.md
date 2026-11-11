# Convergence step 5 review (2026-11-11, `1186683d..48109efd`)

**Verdict: not yet. Fix H1 before `lane-queue` judges T16's Pay path, and M1 and M2 before `delivered-once` does.**
Step 5 itself is sound:

- every gate the builder claims reproduces;
- no case verdict changed under any mutant;
- `delivered-once` on the fold catches everything the old ledger caught on the 74 old mutants;
- the new mutants are caught for their reasons.

The probes add two things:

- the H1 fix can be undone by the runtime's report: a release member in a turn that does not leave voids every
  member the row owes (H1);
- `delivered-once` claims Restore I6, but owes no restore for an acknowledged head that was never sent (M1).

HEAD (`2ab39d18`) still has H1's gate (`lifecycle-step.ts:281-291`).

Gates on a `git archive 48109efd` copy (node_modules linked; `workflow`, `codebases`, `apps` and `reference` linked
for coverage):

- suite 86/86; null 0/86 (every case `Fail`);
- coverage 35 of 186 checked, 0 gaps;
- `vp test` on `conformance/` 30/30;
- `vp check` zero; `effect-tsgo` exit 0.

The builder's numbers match.

## How the verdict diff was checked

I ran every mutant's whole suite on `1186683d` and on `48109efd`, kept each oracle and Invariant named per case, and
diffed them (scratch `s5d/sweep.ts`, `s5d/diff.ts`; the step 4 reviewer's driver).

- 74 old mutants and 77 new ones, with no errors and no unapplied edits.
- No case turned green under any mutant. The only case that turned red is `d6.disposed-ending-is-evidence` in
  DISP-05, which is listed.
- Each old mutant is still caught by its own oracle, in the same cases.
- Six reach changes are not in the log (M3).

Probes (scratch `s5d/p*.json`, each run on both trees):

| Probe | Edit to round-14                                      | `1186683d`                   | `48109efd`                                |
| ----- | ----------------------------------------------------- | ---------------------------- | ----------------------------------------- |
| P1    | drop Leave's `void.commit` from act and report        | PAY-19 ×2, case only         | same                                      |
| P2    | never report `Unparked` (boot, adopt, thaw)           | 33 cases, delivered-once I15 | 0 red                                     |
| P3    | no `unknown { Restored }` for a head that is not Held | 7, all case only             | 5 delivered-once Restore I6, 2 case only  |
| P4    | drop cancels, and report a release in their place     | not run                      | 14 red; lane-queue only I1, misattributed |
| P5b   | adoption delivers no parked ending, silently          | 3, disposal I29/I32          | same, plus delivered-once I15             |
| P5d   | boot delivers no parked ending                        | 14, disposal I29             | 16, plus I15 and DLV-04 Actors I24        |
| P5c   | a thaw delivers no parked ending                      | 0 red                        | 0 red                                     |

## Findings, ranked

Paths are under `packages/flow-state-v3/conformance/` at `48109efd`.

### H1: a release member in the report voids the members the row owes (RC1: a report discharges an obligation)

- **Where:** `dsl/lifecycle-step.ts:276-288` (`anchoredMembers`).
  - `owed` is computed from the chosen row, as the H1 fix intends.
  - The return then needs `leaving`: every reported `release` member must be on a `releasesOnLeave` transition.
    If not, it returns `[]`, and nothing in the turn is anchored, the owed members included.
  - The same line also needs `members.every(Option.isSome)`. A reported release, or any reported member of an
    operation the reference does not know, voids the turn the same way.
- **Rule broken:**
  - WriteLanes R14 and R15, through I12, I20 and I21;
  - the H1 fix's own contract (STATUS, Run 3: "its members are owed whatever the runtime reports");
  - the lifecycle review's RC1: a report alone must not discharge what is owed.
- **Probe P4:** round-14 drops every `cancel` and `cancelAll` member, as `mutant.cancel-members-dropped` does, and
  reports a `release` member of the same operation in its place.
  - `mutant.cancel-members-dropped` alone is caught by `lane-queue` in 14 cases:
    - I12 in LANE-03, LANE-09, PAY-03, PAY-08, PAY-14, PAY-20 ×2, PAY-21 and PAY-22;
    - I20 in LANE-04, LANE-08 and both cancel-on-wire cases;
    - I21 in LANE-03, LANE-04 and LANE-10.
  - With the false release, `lane-queue` names none of these.
  - LANE-03, -04, -08, -09, -10, PAY-12 and PAY-15 cancel-on-wire, and PAY-22 fail only on their case
    expectations.
  - PAY-03, PAY-08, PAY-14, PAY-20 and PAY-21 fail as I1, "place minted ... with no commit member of its lane".
    That is the misattribution the step 4 review's H1 described: the whole turn, `place.commit` included, anchors
    nothing.
- **Fix (proposed):** keep the row's owed members whatever releases are reported.
  - Anchor a reported release only when its transition leaves. An unleaving release anchors nothing, so a
    `Released` that follows is refused as I12 on its own.
  - An unknown-operation member drops only itself.
  - Add P4 as a mutant (I12, LANE-09, PAY-03).

### M1: Restore I6's lower bound skips an acknowledged head that was never sent (a lifecycle reading narrower than the Spec)

- **Where:**
  - `dsl/lifecycle.ts:351-353` (`bootOwes`: Held heads only);
  - its Gotcha at `dsl/lifecycle.ts:469`: "a never-sent or on-wire Attempt cannot show one";
  - `dsl/lifecycle-rules.ts:154`: `BootSettles` closes `Restoring` silently, so a restored unsent head (Table A's
    `Reload` × `Unsent` → `Restoring { head: true }`) that never gets its ending owes nothing.
- **Rule broken:**
  - Restore R3: "An Attempt acknowledged once ends unknown { Restored } even if its re-send was waiting or it was
    never invoked";
  - Restore I6, which `delivered-once` now claims (`write-lanes/delivered-once.ts:7`), and which `not-yet.ts:39`
    drops from T11's row.
- **Probe P3:** round-14 decides no `unknown { Restored }` for a head that is not Held.
  - DLV-01, DLV-02, PAY-08, PAY-14 and PAY-16/restore-keeps-mayHaveApplied are now caught as Restore I6.
  - PAY-09/ack-stored-confirmation-lost (the never-sent head this case exists for) and PAY-18 fail only on their
    state expectations.
- **Not round-14:** round-14 restores that head (`prototypes/round-14/durable.ts:499-511`). The narrowing is the
  lifecycle's own.
- **Fix (proposed):**
  - a reload owes an `AwaitRestore` for a `Restoring { head: true }` head too;
  - `BootSettles` refuses it if it is still owed;
  - P3 becomes a mutant (Restore I6, PAY-09).

### M2: the `claimed` exception is judged only by PAY-19's expectations (a report-chosen row, no mutant)

- **Is it a hole?** Not an unjudged one. It is narrower than STATUS says, and nothing pins it.
- **What `claimed` covers:** Pay's `Leave` row owes `void.commit`, not a cancel (`fixtures/pay.ts:117`). Its
  uncomputed guard is the row's own `memory.authorized && memory.receipt === null`
  (`prototypes/conformance/typed/pay.ts:286`). The sibling is the member-less fallthrough `{ target: LEFT }`
  (`:289`).
  - `fixtures/reference.ts:132-135` says the reverse: "a sibling ... runs other lane members behind a guard the
    suite does not compute".
- **Probe P1** (drop `void.commit` on `Leave` from act and report):
  - no oracle fails, on either tree;
  - PAY-19/place-answers-first fails its state expectation, "LEFT" against "PAID" (cites Turn R20, R21);
  - PAY-19/void-answers-first throws `NoHeldRequest`.
  - No kept mutant holds it, so a future edit to PAY-19 loses the catch silently.
- **Rule:**
  - v2 Risk 2: tied rows are a runtime claim, judged by case expectations. That holds here only through PAY-19.
  - Conformance R6: no mutant holds the check.
- **Not a regression:** both trees give 2/2 on P1.
- **The derivation is loud:** `fixtures/rows.test.ts:97-105`, `:133` fails on any new tie, so no other row becomes
  `claimed` silently. Its easy fix is a one-line `claimed(...)`, though.
- **Fix (proposed):**
  - keep P1 as a case-expectations mutant on PAY-19, citing WriteLanes R14 or Turn R20;
  - correct the doc;
  - consider choosing tied rows by `Turn.parts` (each alternative's `definition` and `at`) rather than by members.
    A runtime that names the alternative it ran and skips its member would then owe the member.

### M3: the reach diff in the log misses six mutants (verification record, as step 4's M4)

Each change has a rule, and none changes a red set. Conformance R11 asks that every difference be recorded with its
reading.

- `k.failure-as-success` (ending-channels I3): also delivered-once I15 in 23 cases. Cause: F2, the event against
  its mapping.
- `mutant.success-then-failure`: loses delivered-once I15 in 18 cases (PAY-01, PAY-03, LANE-01, DLV-04 and others)
  and keeps I16. Cause: a refused `End` records no ending, so nothing is owed for it. This is right, but it is a
  lost cite.
- `lane.unknown-promotes`: the first catch moves to Restore I6 in PAY-15/reload-holds-exactly-once and PAY-08/
  reload-while-reconciling (was a case expectation), and in DISP-05 (was disposal Actors I32, now masked by the
  earlier step).
- `lane.fresh-mint-on-held` (PAY-15/press-pay-while-held) and `lie.serialize-as-latest` (LANE-02): also
  delivered-once I15.
- `mutant.boot-resends-held`: also I16 and I15 in PAY-07/late-may-not-leave.
- The log says "seven lane mutants" and names six.

### Low

- **L1, a check `delivered-once` made before step 5 and no longer makes (P2):**
  - The old ledger refused a parked ending delivered with no `Unparked` ("delivered with no ending owed"). P2 makes
    33 cases red at `1186683d` and none at `48109efd`.
  - v2's Table C admits `Delivered` on `Parked` by design (`dsl/lifecycle-rules.ts:427`). The old check was
    consistency only (Conformance R4), and the substantive half (a turn of a live actor runs it) is kept by
    `Heard` and the `Delivering` step-end refusal.
  - Record the loss in v2's "Earlier findings, mapped" or in STATUS.
- **L2, silent skips:**
  - A report naming no actor and no known ending applies nothing (`dsl/lifecycle-step.ts:350-357, 359-382`): a
    decline's `Ended` with `actor: None` outside a turn, and a `Delivered`, `Parked`, `Unparked` or `Recorded` that
    `lifeNamed` cannot name.
  - `applyLife`'s doc (`dsl/lifecycle-lives.ts:262-264`) says such a report is refused as I15. The old ledger
    counted these.
  - Round-14 always names the actor, so only a T16 runtime using the Port's `None` reaches this.
- **L3, Port change 5 breaks one old-suite anchor:**
  - `d123.delivered-silent-at-boot` (`prototypes/round-14/mutants-r9b.ts:45`) now applies 0 times. Its find string
    was the deleted condition at `turn.ts:1241`.
  - An applicability diff of all 1,005 round-14 `mutants-*.ts` edits differs in this one line only. It is not
    logged.
  - Its intent (a redelivery not reported) is now caught by Table C's `Refused` × `StepEnds` (I15). Record it under
    R11.
- **L4, the restore's incarnation is never read:**
  - `AwaitRestore.incarnation` is set (`dsl/lifecycle.ts:360, 497`) but never read by `due` or the discharge (the
    discharge comes at decision, Table A `Held` × `owedRestore`).
  - STATUS's "owes ... to the actor's next incarnation" is really "decided by the reload step's end". Delivery to
    that incarnation is carried by the ending's life (I15).
- **L5, the CQ6 Gotcha mis-cites:** `dsl/lifecycle-rules.ts:419-421` says "no Invariant says it must". WriteLanes I15
  and R10 do. The conflict is with Actors R22 ("a definite ending drops it", so nothing is on disk to deliver). Cite
  both. Leaving the cell unjudged while CQ6 is open is acceptable.
- **L6, one mistake now draws two cites:**
  - F2 makes a mapping mistake both ending-channels I3 and delivered-once I15.
  - So `mutant.parked-delivered-as-other-tag` proves F2's cell, not I15's delivery count.
  - Say so in its header, or give I15 a mutant of its own that counts deliveries.
- **L7, mutants v2 planned that the probes show are cheap:**
  - P5b is v2's `mutant.adoption-skips-parked` (T6 L11's proof): I15 via `ParkedOpen` in DISP-01, -05 and -06.
  - P5d gives Actors I24 in DLV-04: a kept ending's try is lost at a boot.
  - HEAD's `4ee99037` adds "the rest of step 5's mutants"; check whether these are among them.
- **L8, loose guard types:** `Guard` returns `string` and Table C's guard keys are `Record<string, Fate>`
  (`dsl/lifecycle-lives.ts:111`, `dsl/lifecycle-rules.ts:380-382`). A misspelled guard such as
  `neverSentInDisposal` compiles, and fails only at run time as `MissingLifeCell`.
- **L9, docs:**
  - `dsl/lifecycle-lives.ts:43-46` puts the Attempt's actor first. The code (`:66-67`) takes the reported actor
    first.
  - `write-lanes/delivered-once.ts:18-19` places the tables in `lifecycle-step.ts`; they are in
    `lifecycle-rules.ts`.
  - Review tags ("review F2", "step 4 review H1") sit in doc comments and test names.
  - `dsl/lifecycle-lives.ts:20` exports an unused `LifeStep` tuple whose name clashes with
    `dsl/lifecycle-step.ts:48`.
- **L10, report order:** `ParkedOpen` accepts `Unparked` before or after `Incarnated`, but `port.ts` states neither
  order. State that both are allowed.
- **L11, uncounted catches:** `mutant.cancel-members-dropped` expects I12 only. Its I20 and I21 catches show in the
  kept mutant's own run (my sweep: LANE-04, LANE-08, LANE-10 and both cancel-on-wire cases), not only in throwaway
  copies, but falsify counts I12.
- **L12, an unreached path:** no case reaches a thaw (P5c: 0 red on both trees). This predates the range.
- **L13, two rules for one set:** `bootOwes` excludes a Held head that owes its release (`dsl/lifecycle.ts:352`);
  `incarnate` does not (`:484-487`), though its Gotcha says the same rule. Use one helper.

## Answers to the brief's checks

- **Is anything `delivered-once` judged before step 5 no longer judged?**
  - On the 74 old mutants: no. Each is caught where it was, and only cites move (M3).
  - On old-style lies: one consistency-only check (L1) and the no-actor paths (L2).
  - The fold now catches lost parked deliveries the old ledger missed (P5b, P5d).
- **Does every verdict change cite a rule?** No case verdict changed. The reach changes have rules, but six are not
  logged (M3).
- **The three calls:**
  1. *A reload owes the restores.* It follows the Spec. Restore I6 counts per incarnation, and R3 does not fix when
     the boot decides the ending. Round-14's order only times the obligation; it is not used as a rule. Two gaps:
     the narrowing in M1 (the lifecycle's, not round-14's), and the incarnation field nothing reads (L4).
  2. *`ParkedOpen`.* A tolerance of report order, not a rule. It keeps v2's step-end deadline (T6 L11) and accepts
     either order (L10). Fine.
  3. *CQ6 left parked.* This is round-14's behaviour held open as an exemption cell. It is acceptable only because
     R22 and I15 conflict and the call is with the user. Its Gotcha mis-cites (L5).
- **Is the claimed exception for Pay's `Leave` a hole?** It is judged, but only by PAY-19's expectations, with no
  mutant (M2). The worse hole is H1's: any release member in the report unclaims every row.
- **Null gate and `Timeout`:** correct.
  - `runner/main.ts:251-254` needs every case to be `Fail`.
  - `runner/falsify.ts:129-168` never counts a `Timeout` as a catch.
  - `runner/falsify.test.ts` pins both.
- **The builder's log:**
  - the gates are accurate;
  - H1's sweep claim reproduces (14 cases, I12, I20, I21);
  - the reach diff is incomplete (M3);
  - L3 and L1 are unlogged.

## Sidecar results (each verified; accepted, changed or rejected)

- **(a) code quality:**
  - accepted: 1 (L13), 5 (noted: today every `rowTraces` lists `ParkedOpen`), 9 and 10 (into M2), 12 (style),
    17 (style);
  - changed: 4 (`ParkedOpen` as a tag): it is a design call, and the tag keeps Table C exhaustive. Noted, not a
    finding;
  - rejected for this range: 2 and 3, since `dsl/lifecycle-fold.ts` is unchanged in the range;
  - 6, 7, 8, 11, 13 to 16, 18: Lows not repeated here; 7's dead files are step 8's.
- **(b) types, comments, lint:**
  - accepted: 1, 11, 12 (L9), 2 (into M2), 3 (L8);
  - noted as style: 4 to 8, 9 (L9), 10 (step 8), 13 (the `(unmapped)` sentinel: F2 never compares it, since an
    unmapped ending has no expected event), 14;
  - confirmed: no casts, `!` or suppressions added; Port change 5's doc matches `turn.ts:1241`.
- **(c) `delivered-once` and Table C:**
  - accepted: F4 (M1, reproduced by P3), F9 (L4), F6 (L5, reworded: R22 against I15, not "no rule");
  - changed: F1 to L2 (the round-14 path always names the actor); F2 to L1 (v2's design, and the delivery still
    needs a heard turn);
  - rejected: F3 ("superseded evidence records refused"). Superseded comes as `Evidence`, with no ending to record,
    and concurrency `cancel` uses Table B's `Replace` (`Gone { evidence }`). No probe or case shows a false
    refusal.
  - noted, stated or pending: F5 (predates the range), F7 (CQ8), F8 (CQ1, CQ2, CQ10).
  - Its old-to-new table missed L3 and the masking in M3.
- **(d) the H1 fix, `claimed` and Port change 5:**
  - accepted: 1 (M2, with a correction: P1 is caught by PAY-19's expectations, not left unjudged), 2 (M2's doc),
    6 (L3), 8 (L11);
  - changed: 3 to noted (v2's Matching says a mismatch is no violation, and the code follows it); 4(a) to noted
    (unreached by any fixture, and documented);
  - rejected: 5 ("`Every` over-owes"). A correct runtime reports its members, so `Every` arises only for a report
    that omits one, and is actor-scoped (`dsl/lifecycle-lanes.ts:120`).
  - It did not find H1: its trace stopped at `chosenRow`.

## Method notes

- Scratch, in this session's scratchpad: `s5r` (`48109efd`), `s5old` (`1186683d`), `s5d` (drivers, probe edits,
  `old.json`, `new.json`, `sweepdiff.txt`, `ap-*.txt`).
- I edited nothing in the live tree except this file.
- Every command ran under a `perl alarm` with stdin from `/dev/null`. No process of mine is left.
