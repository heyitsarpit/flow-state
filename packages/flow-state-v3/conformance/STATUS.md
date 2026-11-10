# Conformance suite status

## Round 1 (2026-11-09): layout, Port, prototype adapter, fake world, runner, first slice

Built: everything in the README's layout. The slice is two WriteLanes guarantees end to end:
`ending-channels` (I3) and `attempt-identity` (I6), each with two mutants, and the Pay cases `PAY-01`
to `PAY-05` ported with the same steps and expectations.

Latest numbers:

- `suite`: 5/5 on round-14, also with `--parallel 3`.
- `suite --runtime null`: 0/5 (every case states a failure).
- `falsify --parallel 4`: null runtime red, control green, 4/4 mutants caught by their own oracle.
- `nub run check`: no errors, no warnings (23 files).

### Verdict comparison with the old suite

Same cases, same wrong runtimes, old suite run as
`bun main.ts --round 14 --runtime <rt> --no-search --no-catalog --only <cases>` from
`prototypes/conformance/`. Runs by the runner sidecar; (b) and (d) re-run by the lead.

| Runtime                        | Old suite                                                                        | New suite                                                                                         | Reading                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| round-14                       | PAY-01..05 pass (PAY-01..16: 53/53)                                              | 5/5 pass                                                                                          | same                                                                                         |
| `k.failure-as-success`         | PAY-02 red by (j) "delivered as Confirmed, maps to PayNotSent"                   | PAY-02 red by `ending-channels`                                                                   | same verdict, same reason                                                                    |
| `mutant.still-unknown-dropped` | PAY-05 red by (h) "may be at the server, and no head on disk says so"            | PAY-05 red by `ending-channels` "ends unknown StillUnknown"                                       | same verdict; the old suite had no I3 oracle, only (h) noticed the lane released             |
| `mutant.resend-new-id`         | PAY-04 red by (h) on `att-1-1-again`                                             | PAY-04 red by `attempt-identity` "server received ...-again, runtime reported sending it 0 times" | same verdict, different oracle                                                               |
| `mutant.resend-new-input`      | PAY-04 red only by the recorded-output compare; with `--no-output` PAY-04 passes | PAY-04 red by `attempt-identity` "sent with two inputs"                                           | old-suite weakness: no named oracle for WriteLanes R5/I6 "every send carries the same input" |

No new-suite bug was found by the comparison.

### Sidecar log

All Haiku, effort high. The lead read every diff and re-ran every check.

| Sidecar                                          | Task                                                                                                | Result                                                                                                                                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runner                                           | Old suite on PAY-01..05 and PAY-01..16, control and the four mutants                                | Accepted. The lead re-ran mutants (b) and (d) and got the same lines. Noted: the old suite needs `--no-catalog` now (its catalog reads a deleted design file).                                                                 |
| Coder                                            | Lint fixes in `world/*`, `runner/child.ts`, `runner/run.ts`, `oracles/equality.ts`, `dsl/oracle.ts` | Accepted after reading the diff: `Storage.answer` and `Clock.nextDue` take and return `Option`; `RETURN_TYPE` reasons on exported factories; `sameData` split. The lead changed its one cross-file call site in `dsl/case.ts`. |
| Reviewer (one rule: test the spec, not the code) | The two oracles, the reference, the fact recording                                                  | 10 findings; see below.                                                                                                                                                                                                        |
| Reviewer (lint-bomb STYLE.md)                    | Every suite file                                                                                    | 18 findings; see below.                                                                                                                                                                                                        |

Spec-fidelity review, by finding:

1. Died call not checked as `unknown Defect` (R2). **Accepted**: `ending-channels` expects
   `unknown Defect` for `Die`.
2. An ending in a later step than its answer is not judged. **Rejected** as a change, kept as a
   stated limit in the oracle's doc: pairing across steps misjudges a cancel or timeout that ends
   the Attempt between an answer and a re-send; the ending ledger (`delivered-once`) owns "every
   send ends".
3. `mayHaveApplied` came from the runtime's own reports. **Accepted**: now from the server's log
   (an earlier send of the id never definitely answered).
4. The delivery check is consistency only for endings the server did not decide. **Accepted**:
   the doc says so.
5. Declines pair in order per operation. **Accepted** as a stated limit in the doc.
6. Any failure reason fell back to the `NotSent` event. **Accepted**: only Flow's decline reasons
   (WriteLanes R3's closed list) map through `NotSent`.
7. `attempt-identity` claimed full anchoring. **Accepted**: the doc says which side is the
   server's.
8. Sent-equals-received per step is stricter than the Spec (a reported send may die before the
   server). **Accepted**: a received send must have been reported, not the reverse. The
   `mutant.resend-new-id` mutant is still caught (re-checked).
9. `advance` did not fire a zero-delay timer armed at its end. **Accepted**: it fires every timer
   due by the end, including ones armed on the way.
10. I12 has no oracle; T1/T2 mutants absent. **Accepted** as work-list items.

Style review, by finding:

1. Request liveness rebuilt from phase plus page. **Accepted**: `Orphaned` phase set at a kill;
   the page comparison is gone. The continuation stays out of the log (a capability, not a fact):
   that part **rejected**.
2. `answer` not total over phase. **Accepted**: non-open requests are refused (`RequestNotOpen`).
3. Visibility flag. **Accepted**: `seen | hidden` with `hide` and `show`.
4. Attempt states as set membership in the oracles. **Rejected**: these are per-check
   projections over the log, recomputed each time, not stored state; each oracle needs a
   different projection.
5. `"null"` runtime as a magic string. **Accepted**: `RuntimeChoice` matched once.
6. Hand-decoded prototype reports. **Accepted**: decoded once with Schema; an unreadable report of
   a known kind stops the case (`PrototypeReportUnreadable`).
7. `Channel` and `EvidenceKind` declared twice. **Accepted**: `Schema.Literals` in `port.ts`.
8. Same as spec finding 6. **Accepted**.
9. Falsify's file reads not classified. **Accepted**: a failing read or write is `NotApplied`.
10. Unknown fixture names dropped. **Accepted**: `UnknownFixture` and `NoReference` stop the case.
11. Doc comments narrating history. **Accepted**: reworded.
12. A doc naming an oracle that does not exist. **Accepted**: reworded.
13. `advance` repeating `act`. **Accepted**.
14. `getOrUndefined` in scenarios. **Rejected**: expectations compare plain values, as the old
    cases did; an absent row reads `undefined`.
15. `Option.map` for effects; a consuming lookup. **Accepted**.
16. Untyped memory reads. **Rejected for now**: memory Schemas belong with the fixtures, which
    move here with phase 4's public API (README decision 4).
17. `ok` computed twice. **Accepted**.
18. A child's unreadable verdicts dropped silently. **Accepted**: `NoVerdicts` carries why; falsify
    counts the null runtime and the control only from verdicts a child stated.

### For round 2

Take the ending ledger (`delivered-once`, WriteLanes I15, I16, I22) with the Pay cases that need it
(PAY-06 to PAY-16), which brings the fake world's `lateAnswer`, `landLate`, storage `hang` and
reload paths, and the mutants `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`,
`e8.wa-failure`. Then `lane-queue`. Compare verdicts on PAY-01..16 against the old suite.

## Round 2 (2026-11-09): review fixes, Port additions, the ending ledger, PAY-06..16

Latest numbers:

- `suite`: 38/38 on round-14, every case under seeds 1 and 2 (31 Pay ids, 3 delivery cases,
  PAY-01..05).
- `suite --runtime null`: every case fails; `--json` exits 1.
- `falsify --parallel 5`: every oracle has a mutant, null red, control green, 9/9 mutants caught by their
  own guarantee's oracle.
- `nub run check`: no errors, no warnings (30 files).

Round 1 review findings, by item:

- M1 **done**: `ending-channels` requires an answered live send to end, under its id, in that step
  (live: the newest request of the id, a send reported and no ending since). Mutant
  `mutant.ending-without-id` (the send's ending names no Attempt): caught by `ending-channels` on
  PAY-01.
- M2 **done**: `suite.ts` holds `guarantees` (each oracle with its mutants); falsify fails an oracle
  with no mutant for the runtime it runs on. A verdict names every oracle that failed the step, so a
  mutant is judged by its own oracle even when another also fires.
- M3 **done**: the planned Port is in the README; built now: `release` and `use` on
  `ensure`/`ensureExisting`, actor on `Minted`, decline `Ended` and `Delivered`, `Parked`,
  `Unparked`, `Recorded`, `Unhandled`, `Denied`, storage evidence, `Boot.sessionSeed`.
- M4 **done** as a stated prototype limit (README decision 8): the suite supplies the seed;
  round-14 asks its host for each id, so its adapter derives them from the seed. The seed cases and
  their wrong runtime are phase 4 builds.
- M5 **done**: the carry table in the README.
- Lows **done**: `advance` capped at 100,000 firings; `--json` sets the exit code; `--parallel`
  fails ids a child stated no verdict for; Spec ids out of doc comments (`guarantee` fields keep
  them); seeds 1 and 2; `StillUnknown` keeps its tag when the runtime reports it (round-14 does
  not: stated limit); `a3.like-row-hidden` moved to the cases row.

Built: `write-lanes/delivered-once.ts` (WriteLanes I15, I16, I22: the ending ledger) and four mutants;
`write-lanes/ending-delivery.scenarios.ts` (DLV-01..03, built so the mutants' triggers fire: two endings owed to one
actor at a boot, two actors' endings at a boot, a failure ending with a second live shopper); the
`cells` fixture; fake-world late answers, late landings, uninterruptible calls, answers at once,
storage `hang` and `landNoAck`; `falsify --sweep`.

### Verdict comparison with the old suite (PAY-01..16)

Old suite: `bun main.ts --round 14 --runtime <rt> --no-search --no-catalog --no-output --only
PAY-01,...,PAY-16` (53 case items). New suite: `falsify --sweep` (38 cases). Runner sidecar runs;
the lead re-ran the control and `mutant.ending-without-id` (53/53 and 12/53, the same).

| Runtime                                                              | Old suite                                                                                                                                                          | New suite                                                                          | Reading                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| round-14                                                             | 53/53                                                                                                                                                              | 38/38                                                                              | same                                                                                                          |
| `mutant.ending-without-id`                                           | 41 red, by (j) "an ending reached nobody" (3 by S4 or a vanished mint)                                                                                             | 30 red, every one by `ending-channels` (and `delivered-once`)                      | same verdict on every ported case with a write ending                                                         |
| `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released` | 53/53 green: the trigger (other mail when an ending is admitted) never fires on Pay traces (sidecar instrumented the copies: `tx.w.mail` empty at all 818 entries) | green on Pay; red on DLV-01/DLV-02, built to fire the trigger, by `delivered-once` | not a weakness of either suite on Pay; the old suite caught them on DRV-02, MED-01 and others, not ported yet |
| `e8.wa-failure`                                                      | 1 red, PAY-12/shuffle, by (j) "delivered to the wrong recipient"                                                                                                   | red on DLV-03 by `delivered-once`                                                  | PAY-12/shuffle (scheduler shuffle) is not ported; DLV-03 drives the same trigger directly                     |

No new-suite bug from the comparison. Two findings from the port, both oracle refinements that
the old cases' expectations confirmed: PAY-07/late-may-not-leave delivers a late ending that the
actor's guards deny (`Denied` was not an accepted outcome of a delivery: added, with the case's
`LateMayNotLeave` assertion restored); PAY-16/stale-send-fenced answers an older send late after
a re-send (the live-send check now applies only to the newest request of an id).

### Ported Pay variants and gaps

Ported (31): PAY-06/interruptible, uninterruptible; PAY-07/leaveMidCharge, late-in-a-new-PAYING,
late-may-not-leave; PAY-08/reloadDuringCharge, reload-while-reconciling; PAY-09/ack-not-stored,
ack-stored-confirmation-lost; PAY-10/refuse, hang; PAY-12/defect, sync, cancel-on-wire; PAY-14;
PAY-15/press-pay-while-held, busy-then-new-write, reload-holds-exactly-once,
dead-activation-timer, retry-budget, cancel-idle, cancel-on-wire; PAY-16/restore-keeps-
mayHaveApplied, timeout-per-send, resend-refused-capture, retry-count-persists, stale-send-fenced,
schedule-reads-after-memory, read-defect-issue, superseded-read.

Not ported (17), each waiting on a planned Port part: PAY-11 (5 variants: slot and module
faults), PAY-12/duplicate (a duplicated completion), PAY-12/shuffle (scheduler shuffle), PAY-13 (3:
runtime disposal), PAY-15/dispose-held and PAY-16/settled-during-disposal-parked,
on-the-wire-at-the-bound-ends-unknown-disposed, dispose-waiting-resend,
disposal-ends-with-the-last-fiber (runtime disposal), PAY-16/parked-success-is-delivered (yield
injection), PAY-16/cancelled-does-not-stick (an `interrupted` answer), PAY-16/rejected-is-delivered
(dropped by its coder: both assertions read internals; to be re-expressed on `Delivered` and
`Turn`), the hook-throw and core-throw variants (module and core faults: never a Port part; the
Spec-level refusals they cover are the `refusal` oracle's).

Dropped assertions (internals the Port does not show): lane cells, `fence`, `interrupt`,
`initial`, boot frames, `replay`, `outside` except as the server's own request phases.

### Sidecar log (round 2)

| Sidecar                  | Task                                                         | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Coder A                  | PAY-06..09                                                   | Accepted after reading the diff; the lead ported `ack-stored-confirmation-lost` (added storage `landNoAck`) and restored the `LateMayNotLeave` assertion (added `Denied`). Its failure report on late-may-not-leave was right: a missing `Denied` outcome in the oracle.                                                                                                                                                                                                                   |
| Coder B                  | PAY-10..13                                                   | Changed: only PAY-10 was portable then; the lead added the `cells` fixture and ported PAY-12/defect, sync, cancel-on-wire, and restored PAY-10's storage evidence (added `StorageFailure`, `StorageSilent`).                                                                                                                                                                                                                                                                               |
| Coder C                  | PAY-14, PAY-15                                               | Accepted; its fixture switch for the non-`AbortPay` variants is kept (`cells` is `pay` plus `AbortPay`); the lead ported the two `AbortPay` variants on `cells`.                                                                                                                                                                                                                                                                                                                           |
| Coder D                  | PAY-16                                                       | Accepted; its stale-send-fenced failure was right (an oracle refinement, above). The lead restored "older was interrupted" through the server's request phases. Its skip of rejected-is-delivered is logged as a gap.                                                                                                                                                                                                                                                                      |
| Runner                   | Old suite on PAY-01..16, control and five mutants            | Accepted; re-ran two of its runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Reviewer (test the spec) | `delivered-once`, the changed checks, attribution, DLV cases | 19 findings. Accepted: 2 (a disposal excuse ended by a re-ensure), 3 (an unknown owner is never excused), 4 (an `ignored` record needs the mapping's cause), 8 (a let-go pays a parked ending), 18 (DLV doc overclaimed). Rejected 1 as stated (e8 is caught by `delivered-once`: B's IDLE root handles `Declined`, so a turn runs in B; falsify shows it) but kept its point as a stated limit: `Unhandled`/`Denied` match by event. Notes kept as limits: 6, 7, 9, 11. Others are notes. |

### For round 3

`lane-queue` (WriteLanes I8, I9, I11, I12, I20, I21) with its mutants and the remaining Pay cases
(PAY-17..20), and the Port's runtime disposal so PAY-13 and the disposal variants port. Then
`members`.

## Round 3 (2026-11-09): `lane-queue`, Runtime disposal, PAY-13 and PAY-17..20

Latest numbers:

- `suite`: 61/61 on round-14, every case under seeds 1 and 2 (48 Pay ids, 10 lane cases, 3
  delivery cases).
- `suite --runtime null`: every case fails.
- `falsify --parallel 6`: every oracle has a mutant, null red, control green, 21/21 mutants caught by
  their own guarantee's oracle (12 of them `lane-queue`').
- `nub run check`: zero errors and warnings on the round's own code before the lint scope was
  widened (commit 46488541); after it, 74 `no-unknown`, 2 `no-object-type` and 3
  `no-optional-domain-properties` remain, all from the widened scope. They are round 4's first
  item (typing the Port per fixture with generics, the user's direction); nothing is waived.

Built:

- `write-lanes/lane-queue.ts`: a model of each unkeyed lane from the runtime's reports, checked
  after each turn and step against the fixture's reference and the suite's facts: the queue
  bound per policy (I8), one addressable Attempt (I9), promotion only past a resolved or released
  head (I11), Held left only by retry, cancel or release (I12), `Superseded` only under latest
  (R7), cancel by the head's history (I20), and `cancelAll`'s queue in mint order with a held
  head delivered last (I21). A cancel is judged over the reports from its turn to the end of its
  step, so the verdict does not depend on where a runtime reports `Turn`.
- Twelve mutants (`write-lanes/lane-queue.mutants.ts`): seven with the old suite's names and edits, five
  written from WriteLanes' text (`lane.latest-as-serialize`, `lane.fresh-mint-on-held` (the map's
  "fresh mint on a Held lane"), `lane.unknown-promotes`, `lane.cancel-held-keeps`,
  `lane.cancel-wire-as-never-sent`). Each was confirmed caught by `lane-queue` for its own reason.
- `write-lanes/lane-policies.scenarios.ts`: `LANE-01` to `LANE-10` on three lab machines (`serialize`, `latest`,
  `cancel` from the prototype's typed fixtures) and Pay's `AbortPay`.
- The Port: `Runtime.disposeRuntime()`, `Observation.RuntimeDisposed`; the timeline facts
  `DisposingRuntime`, `Drove`, `Unstoppable`; the fake network's `FailButLanded`; the reference's
  `keyFields` and `cancels`; the prototype adapter loads fixture factories and serves `Api.call`.
- `delivered-once`: from a Runtime disposal to the next reload an ending may stay owed and counts
  as parked at the reload; a delivery in that span is a violation; parked endings stay parked
  across a reload; a re-park is not a second delivery.
- Ported: `PAY-13` (3), `PAY-15/dispose-held`, `PAY-16` disposal variants (4), `PAY-18`,
  `PAY-19` (2), `PAY-20` (2). Not ported: `PAY-17` (5 variants, module and core faults, never a
  Port part), `PAY-16/parked-success-is-delivered` (a yield fault).
- Spec changes (`workflow/specs/spec-log.md`, round 3): WriteLanes R14's Idle cell, and three
  wrong-runtime moves (`lane.promote-skips-durable` to WriteAhead T7, `lost.letgo-silent` to T6,
  T10's idle mutant).

### Verdict comparison with the old suite

Old suite: full suite (1,080 cases) on an edited copy per mutant; new suite: `falsify --sweep`.
Runner sidecar's runs; the lead re-ran the new side.

| Mutant                                   | Old suite (red cases, how)                         | New suite (red; by `lane-queue`) | Reading                                                                           |
| ---------------------------------------- | -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| control                                  | 1,080/1,080; PAY-13..20, P1-H, R15-01: 114/114     | 61/61                            | same                                                                              |
| `lie.serialize-as-latest`                | 9, by (j) "superseded ... (serialize)"             | 3; 3                             | same verdict; the old falsify entry's edit no longer applies to round-14 (rotted) |
| `lane.queue-unbounded`                   | 1, REV8-PINS by the case's own assertion           | 1; 1                             | old-suite weakness: no oracle for I8's bound                                      |
| `lane.latest-as-serialize`               | 3, case assertions                                 | 1; 1                             | old-suite weakness: no oracle for R7 under latest                                 |
| `lane.fresh-mint-on-held`                | 16, case assertions                                | 2; 1                             | same verdict; new catches it by I11 on an unkeyed lane only (keyed limit)         |
| `lane.unknown-promotes`                  | 273, (h) and assertions                            | 20; 1                            | same verdict; old (h) sees the dropped head on disk, new I11 sees the promotion   |
| `lane.cancel-held-keeps`                 | 60, assertions                                     | 3; 1                             | same verdict                                                                      |
| `lane.cancel-wire-as-never-sent`         | 21, (h) and DRV-01                                 | 3; 1                             | same verdict; new names I20                                                       |
| `1b.cancel-all-queue-reversed`           | 1, P1-H assertion                                  | 1; 1                             | old-suite weakness: order checked by one case only                                |
| `1b.cancel-all-promotes-before-emptying` | 2, R15-01 assertions                               | 1; 1                             | same verdict                                                                      |
| `1b.cancel-all-wire-held-at-once`        | 1, P1-H assertion                                  | 1; 1                             | same verdict                                                                      |
| `audit-1.cancel-all-leaves-the-head`     | 3, assertions (with this suite's re-anchored edit) | 1; 1                             | old-suite weakness: the old mutant's edit no longer applies to round-14 (rotted)  |
| `p1h.cancel-all-idle-declines`           | 1, P1-H assertion                                  | 1; 1                             | same verdict                                                                      |

Every mutant is caught by both suites; no new-suite bug was found. Where the old suite caught a mutant
only by one case's assertion, the new suite catches it by a named oracle on every step
(WriteLanes I8, I11, I20, I21). Two old wrong runtimes no longer apply to round-14 and would show
as never red there. The new suite's breadth is smaller (61 cases against 1,080), so its red
counts are smaller on every mutant. On Pay (keyed) lane mutants are red by case assertions and other
oracles, not `lane-queue`: the keyed-lane limit.

### Sidecar log (round 3)

| Sidecar                       | Task                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder A                       | PAY-18..20 (`write-lanes/payment-late-answers.scenarios.ts`)  | Accepted after reading the diff and re-running its cases (5/5; null 0/5). Changed: the doc comment (no history, names the Pay read-first rule), PAY-18 gains "no send before an acknowledgement is heard" (review finding 7). Its Turn R20/R21 cite kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Coder B                       | Disposal cases (`actors/runtime-disposal.scenarios.ts`)       | Accepted; its report of 4 failures (`unparked, never parked` at the reload) was right: `delivered-once` forgot parked endings at a reload. Fixed in the oracle (parked endings survive a reload; disposal's owed endings become parked), not in the cases. Changed: `waiting-flushed` asserts disposal's end after the pending write (Actors R23), cites WriteAhead R14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Runner                        | Old suite: control and the twelve lane mutants; rot check     | Accepted; the lead re-ran the new side (`falsify --sweep`). Its rot counts (two old edits match 0 times) were confirmed by grep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reviewer (test the spec)      | `lane-queue`, mutants, LANE cases, disposal, `delivered-once` | 19 findings. Accepted: 2 (cancel judged over the step, not the batch before `Turn`), 3 (I21's held head delivered last: added; no wrong runtime yet), 4 (a re-park is no second delivery), 5, 7, 8, 12, 13 (an Idle cancel may record evidence), 14 (the step defined in the doc), 16 (map rows moved), 17, 18, 19. Rejected: 10 (a write has no abort signal at the fake server by design; the replaced Attempt's ending being evidence is checked), 11 (R14 says unknown Cancelled on fiber exit, whatever the answer), 15 (falsify shows the mutant caught: the held head never ends). Kept as limits: 1 (a parked ending still parked at a case's end), 6 (reworded), 9 (a `delivered-once` mutant for the disposal rule: round 4).                                                                                                                  |
| Reviewer (lint-bomb STYLE.md) | the round's diff                                              | 17 findings. Accepted: 3 (as above), 9 (one `addressable` helper), 11 (docs say the contract, not history, where they narrated), 16 (`Option.isNone` on a row), 17 (order); 1 in part (the "remove" outcome is a named `held` or `gone`, not an empty Option; the one total transition is round 4's, with the generic Port). Rejected: 2 (Runtime disposal is idempotent, Actors R20, so a repeat is no violation; the phase now lives beside the ledger, not on it), 4 (I21 says "in mint order"), 5 (`Disposed` is round-14's runtime-level note, step.ts finishDisposal; an actor's dispose notes `disposed`), 6 (a replaced Attempt leaves at its ending), 7 (the lane holds the reference's object, not a copy), 10, 12 (`RETURN_TYPE` is the lint's own mechanism), 13 (the fixture API's optional third argument is the fixtures' shape), 14, 15. |

### For round 4

1. The widened lint scope: type the Port per fixture with generics (the user's direction), so
   the 79 findings close with no waivers; drop `readonly` inside `Data.TaggedEnum` members (done
   this round).
2. The Attempt's key on `Minted` (production reports it; the prototype adapter cannot), so
   `lane-queue` judges keyed lanes and Pay.
3. `members` (WriteLanes I10, I13, I14), with the releasing-lane fixture `p1Rel` for
   `audit-1.cancel-all-release-also-cancels-head` and I22.
4. A `delivered-once` mutant for the disposal rule, and the `disposal` oracle (Actors I29-I31).

Round 3 style review, reasons for the rejections the log above left bare:

- 10 (`mint` returned nothing while `sent`, `end` and `evidence` returned violations; closure
  `let`s in `judgeStep`): the model is a projection rebuilt inside one check, not owned state.
  Round 4 changed the half that mattered: `mint` now returns its violations like the others.
- 14 (the `"(decline)"` sentinel in a space-joined ledger key): the key is a ledger-local label,
  also printed in messages; operation names are fixture identifiers with no spaces. Revisit if
  operation names ever become user-supplied text.
- 15 (reason and channel literals matched in several places): `Channel` is a Schema literal
  union, so channel comparisons are type-checked; reasons are an open set (Flow's declines plus
  author tags), whose closed part is `FLOW_DECLINES` in `fixtures/reference.ts`.

## Round 4 (2026-11-09): services, typed fixtures, review fixes

Latest numbers:

- `suite`: 61/61 on round-14 under seeds 1 and 2; `--runtime null`: every case fails.
- `falsify --sweep --parallel 6`: every oracle has a mutant, null red, control green, 25/25 mutants
  caught by their own oracle (21 old, 4 new).
- `nub run check`: zero errors, zero warnings (40 files; the 79 findings round 3 left are gone,
  none waived).

### The restructure (commit c7f72a9c) and its parity proof

README decisions 6 (rewritten) and 11 (new) record the shape: `Runtime`, the world's hosts
(`WorldClock`, `Page`, `Storage`, `Network`, `World`), `Timeline` and `Case` are
`Context.Service`s with Layers; `PrototypeRuntime.layer` and `NullRuntime.layer` implement
`Runtime`, scoped (boot is acquire, disposal is release, a reload interrupts the boot's scope and
builds the Layer again); scenarios are `Effect.gen` values that `yield* Case`; the Port carries
`Schema.Json`; `Case.actor(Pay, id)` is a view typed by the fixture's Schemas (events, payloads,
input, memory, row keys, rows by policy, states). Oracles stay pure.

Parity: before the restructure, `suite --json`, `suite --runtime null --json` and
`falsify --sweep` were saved; after it all three were byte-identical (every verdict and every
`why`, every mutant's red set and caught-by set on every case). After this round's review fixes the
suite and null outputs are still byte-identical, and every old mutant's red and caught sets are
unchanged; the sweep differs only by the four new mutants.

Slips: the lead edited `world/network.ts` once with a Python script before switching to
Write/Edit (the change was the Json retyping, then rewritten whole with Write); coder B edited
`write-lanes/delivered-once.mutants.ts` with a Python heredoc (its text was checked by the lead in the diff);
coder 1 (round-4 restructure) briefly wrote a file under `/tmp` and removed it.

### Independent review fixes (runner's review of rounds 2-4)

- H1 done: `delivered-once` excuses a recorded ending only from suite-visible facts (under
  `cancel`, an Attempt still undecided when a later commit of its actor and operation was minted;
  under `latest`, one still unsent then); the runtime's `Superseded` only words the message. Mutant
  `mutant.superseded-claimed` (a failure ending recorded as Superseded): caught by `delivered-once` on
  DLV-03.
- H2 done: `lane-queue` judges a Held head's re-send (permitted only after a suite-driven turn of
  its actor in a later step; limit in README). Mutant `lane.held-auto-resend`: caught on LANE-03 and
  PAY-15/press-pay-while-held.
- M1 done: an `InvalidTurn`/`UnmappedEnding` issue settles a delivery only when it is the one
  pending in its step (stated limit: `Issue` carries no event or actor).
- M2 done: only endings decided after the disposal began count as parked at the reload. Mutant
  `mutant.delivered-during-disposal`: caught on PAY-16/settled-during-disposal-parked.
- M3 done: a `Minted` with no actor is a violation in `lane-queue` and `delivered-once`; round-14's
  adapter still attributes actors (decision 10, a prototype limit).
- M4 done: the row is `Option<Json>` at the Port and decoded per policy by the fixture (Reads
  R14: reject/latest, serialize with `outstanding`, cancel without `uncertain`/`waiting`).
  Round-14 publishes every field R14 requires; it has no idle row (stated limit).
- M5 done: `PageKilled` removed (a reload interrupts the scope, Effect's own exit); the unused
  `WorldClock.effect` and `Page.effect` removed; README states what phase 4 must add instead of
  claiming no shim.
- Lows: actor `state` typed by the fixture's states; `cancels` typed by the fixture's events;
  empty payloads take only `{}` (`Empty`); one decode per report; `attempt-identity` keys
  Attempts by operation and id (mutant `mutant.sent-under-another-operation`, caught by the same
  oracle's count check, so the naming check has no isolating mutant: stated limit); Minted.key docs.
  `ending-channels` StillUnknown strictness: not changed, kept as a stated limit (strict turns
  PAY-05 and PAY-16/restore-keeps-mayHaveApplied red; the adapter will not invent the failure).

### Sidecar log (round 4)

All Haiku, effort high; the lead read every diff and re-ran every check (suite, null, sweep,
check).

| Sidecar                             | Task                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder 1                             | pay-06-09, pay-10-13 to the Case service       | Accepted; 14/14 pass, null texts identical.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Coder 2                             | pay-14-15, pay-16                              | Accepted; its inlined `onWire` on Cells kept (same steps).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Coder 3                             | pay-17-20, disposal                            | Changed: its `repeatedKeys` replaced `appliedTwice` with a different count; the lead added `Case.landedKeys` and restored the exact check.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Coder 4                             | lanes, delivery                                | Changed: its `string \| undefined` helper returns failed the nullish-contract lint; the lead typed the three affected `eq` calls instead.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Reviewer (STYLE services)           | c7f72a9c                                       | 14 findings. Accepted: 1 and 4 (README wording; became M5), 3 (Timeline returns a copy), 7 (`Layer.fresh` per boot), 9 (`lifecycle.ts` renamed `page.ts`). Rejected: 2 (thrown errors in synchronous host primitives are defects by design), 3's storage half (its map is replaced, never mutated), 5 (became a stated limit), 10, 11, 12 (behaviour-preserving restructure: no semantic change), 13 (generator bodies defer synchronous code, STYLE §4), 14 (the failure is the wire protocol's tagged value the fixtures' code matches). 6 confirmed the release exits. |
| Reviewer (types, comments)          | c7f72a9c                                       | 12 findings. Accepted: 1 (empty payloads, `Empty`), 2 (export shapes checked before the cast), 7, 8, 10 in part (narrating doc lines). Deferred to round 5: 3 (shared scenario helpers), 5 (`keyFields` restates the key Schema; to drop when the key is on `Minted`), 11 (one attempt-key helper). Rejected: 4 (round 1's decision: expectations compare plain values), 6 (a per-check projection), 9 became a decode, 12 is decision 11's stated drift.                                                                                                                 |
| Reviewer (spec, oracles and runner) | c7f72a9c                                       | 11 findings. Accepted as stated limits: 1, 2 (teardown disposal unjudged and repeated), 4 (prototype sink swallows a throw), 5 (non-JSON request bodies die), 7, 8. Notes 3, 6, 9, 10, 11 confirmed the change. The teardown disposal becomes a judged step in round 5.                                                                                                                                                                                                                                                                                                   |
| Coder A                             | `lane-queue` H2, M3, mutant                    | Accepted after the lead read the diff and re-ran the mutant (caught for its reason).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Coder B                             | `delivered-once` H1, M1, M2, M3, two mutants   | Accepted; both mutants re-run by the lead, caught for their reasons. Slip logged above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Coder C                             | Row per Reads R14, typed states, typed cancels | Accepted, including its forced `dsl/case.ts` edit (the `Row` import).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Coder D                             | `ending-channels`, attempt-identity            | Accepted the attempt-identity change; StillUnknown strictness rejected for round-14 as above.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### For round 5

1. A judged Runtime disposal at every case's end, with the `disposal` oracle (Actors I29-I31).
2. `members` (WriteLanes I10, I13, I14) with the releasing-lane fixture `p1Rel`
   (`audit-1.cancel-all-release-also-cancels-head`, I22), and a mutant for "a held head is
   delivered last" (I21).
3. Keyed lanes once a runtime reports `Minted.key`; drop `keyFields` then.
4. Shared scenario helpers (one module for Pay's shopper steps).

## Round 5 (2026-11-09): services reverted

The user: the scenarios had to `yield*` every step, noise that turned simple code into noisy
code; revert the `Context.Service` change specifically. Round 4's restructure (`c7f72a9c`, with
`3097ea3c`'s fixes) is reverted to the round 3 shape (`714ace7a`): a `Port` whose `boot` returns
a plain `Runtime` record; the world plain owned state (`makeWorld`, `makeClock`, `makePage`,
`makeStorage`, `makeNetwork`, `makeTimeline`) with synchronous steps; `openCase` builds a plain
`Case`; a scenario's `run` is `(c: Case) => void`, steps and reads are plain calls that throw
`Violated` or `Mismatch`. README decision 6 records it.

- Kept from round 4: fixtures typed by their Schemas, typed actor views, the JSON Port, the review
  fixes H1 to M5 and their mutants, rows per Reads R14, actors required on `Minted`, `page.ts`'s name.
- Effect stays where it was before round 4: the runner and loading the prototype, and Schema at the
  adapter boundary.
- One behaviour change, not judged: the Runtime is no longer disposed at a case's end (round 4's
  scope release did it after the last judged step). README's stated limit says so; for round 5's
  item 1 it is now an open item.
- Parity: the suite `--json`, null `--json` and `falsify --sweep --parallel 5` outputs are
  byte-identical to HEAD before the change (61/61; 61 null failures with the same texts; 25/25
  mutants caught). `nub run check`: zero errors, zero warnings, nothing waived. `yield*` in
  `scenarios/`: 0 (736 before).
- Lint: two findings fixed with reasons on the line: `runner/run.ts`'s thrown-value `unknown`
  (`FLOW_STATE_ALLOW_UNKNOWN:`) and `runtimeOf`'s return type (`RETURN_TYPE:`).
- Scenario files were rewritten by hand with Write from a mechanical preview (a script that
  printed the converted text, writing no file).

## T6 (2026-11-10): judged Runtime disposal at every case's end; `@effect/tsgo` in check

Built: `playCase` ends every case with judged steps (dispose the Runtime, answer held writes,
advance past the 5 s bound, answer again, expect the disposal ended, reload); the `disposal`
oracle (Actors I29 for Runtime disposal, I30) with four mutants; `nub run check:effect`
(`effect-tsgo tsc`, `@effect/tsgo` 0.61.0) inside `nub run check`.

Latest numbers:

- `suite`: 61/61 on round-14 (0.36 s, 155 MB peak RSS), also with `--parallel 4`.
- `suite --runtime null`: 0/61.
- `falsify --parallel 6`: null red, control green, 29/29 mutants caught by their own oracle;
  `--sweep` 29/29.
- `nub run check`: zero errors, zero warnings; a planted `unknownInEffectCatch` fails it.

Mutants and why each is caught (re-run by the lead, each red for the expected reason):

- `lie.boot-says-disposed`, `lie.boot-drops-held` (PAY-15/dispose-held): `disposal` I29 at the
  reload, the Held `pay` head delivered nothing (`delivered-once` also fires).
- `mutant.disposal-skips-never-sent` (PAY-13/waiting-flushed): I29, a never-sent commit got no
  ending from the disposal.
- `mutant.disposal-dispatches` (PAY-07/late-may-not-leave): I30 at the end-of-case `ack`: the
  server received `pay` after the disposal began. The case's own disposal does not reach it; the
  end-of-case disposal does.
- `o6.dispose-interrupts-wire`, `o6.no-bound`, `o6.settled-in-bound-stays-held`: caught by the
  disposal cases' expectations (Actors R22), never by an oracle; R22's bound has no Invariant.
  Kept unregistered (`disposalBoundMutants`) for the user's decision. A new expectation, "a definite
  ending drops the head" (PAY-16/settled-during-disposal-parked, from Actors R22), catches the third.

### Sidecar log

All Haiku, effort high. The lead verified each finding against the code and the Specs, and re-ran
every gate after the fixes.

| Sidecar                      | Task                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer (test the spec, R4) | `03098b28`             | 9 findings. Accepted: 1 (a never-sent commit dropped silently: now judged, mutant added), 2 (a request the next boot makes is no longer counted), 3 (StillUnknown keeps a head Held), 4 (an answer to a dead page's request decides nothing), 5 and 6 (runtime claims named in the docs), 9 (guarantee names the Runtime-disposal half). Rejected: 7 (the end's expectation cites its rules in its label), 8 (rows read `None` for a gone lane: the stated idle-row limit, Q9). Q5 confirmed.                                                                                                                                                                 |
| Reviewer (lint-bomb STYLE)   | `f8b92e7b`, `03098b28` | 10 findings. Accepted: 1 (one phase per Attempt, not three sets), 2 (a `Live`/`Disposing` union), 3 (one `usesHeld` in `dsl/oracle.ts`, used by the Case and the oracle; the oracle's copy ignored the use kind), 6 (stale mutants doc), 9 (one `ackAll`; `driven` for the Case). Rejected: 4 (keyed lanes by design; `lane-queue` is unkeyed by its stated limit), 5 (`ending-channels` reads reports, this reads the server's answers), 7 (mutant names keep the old suite's ids, README decision), 8 (kept for the Invariant decision, said in its doc), 10 (the installed TypeScript is pinned in `package.json`; the plant shows the Effect rules fire). |

### T6's last change (2026-11-10): Actors I35 and I36, the disposal bound

The user approved the guarantee change (Q1 A). Actors I35 (a call on the wire at the disposal's
start is not cut short within 5 s; one settling earlier ends by its own result and the disposal
waits for it; one unsettled at 5 s ends unknown { Disposed }) and I36 (a definite ending during the
disposal leaves no hold) were added with to-spec (two, not one: they fail apart), and the
`disposal` oracle judges both. The timeline gained `Advanced { ms }` (the suite's clock) and
`Read` (a row the case read; reads now run every oracle). The three `o6.*` mutants are registered:

- `o6.dispose-interrupts-wire` (PAY-16/on-the-wire-at-the-bound-ends-unknown-disposed): I35, it
  ended unknown Interrupted 0 ms in, before its call settled and before the bound.
- `o6.no-bound` (PAY-16/disposal-ends-with-the-last-fiber): I35, it ended unknown Disposed 0 ms in.
- `o6.settled-in-bound-stays-held` (PAY-16/settled-during-disposal-parked): I36, after the next
  boot its row reads uncertain.

Numbers: suite 61/61; null 0/61; falsify --parallel 6 32/32 caught; `nub run check` at zero.

| Sidecar                      | Task             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reviewer (test the spec, R4) | the I35/I36 diff | 10 findings. Accepted: 1 (a restore after the reload's step was missed: an unknown ending of a dropped head is now judged at any later step), 2 (a call settled within the bound must end on the channel its commit gives the answer), 3 (definiteness from the suite's classification of the answer, not the runtime's channel), 5 (the boundary pinned in the Spec: "less than 5 s", "5 s after the start"), 9 (the doc names every runtime report used). Rejected: 4 (per-step clock: a stated limit; stamping reports with the clock is a timeline change for later), 6 (a Held head cannot end definitely during disposal: admission is closed, so no retry), 7 (a wire call's ending always names its Attempt; `ending-channels` judges a missing id), 8 (a re-send after boot is I30's and I1's, not I36's), 10 (`RuntimeDisposed` is the disposal's only public end signal; named in the doc). |

### T6 review fixes (2026-11-10)

The orchestrator's verified findings from the hourly review of `f8b92e7b` and `03098b28` (M1, M2,
L1 to L11), done as one commit. Built: the `disposal` oracle split into `actors/disposal.ts` and
its ledger `actors/disposal-ledger.ts`; it now judges Actors I29 (both halves), I30, I31, I32, I35
and I36. `forget` is on the Port. Cases `DISP-01` to `DISP-05` (`actors/lane-keeping.scenarios.ts`).
Every mutant names the Invariant it breaks (`expects`) and falsify counts a kill only by its
oracle's violation naming it (Conformance Q5, narrowed).

Numbers: suite 66/66; null 0/66; falsify --parallel 6 37/37 caught, each by its named Invariant;
`nub run check` at zero.

- M1 accepted: I31 judged at the boot after a Runtime disposal (`mutant.disposal-hold-first`,
  DISP-03); disposeActor's half (`id.dispose-drops-lanes`, DISP-02); I32 with `forget` on the Port
  (`1b.forget-marks-held-lane`, DISP-05). Changed: `1b.disposal-definite-w-first` is not ported:
  its expectation is mint order (a definite head's ending before its queue's NotSent), which no
  Invariant states (I31 orders only the hold-leaving ending); open for the user.
- M2 accepted: the end-of-case reload attaches every actor that minted a write; DISP-01 releases an
  actor with a Held head; `mutant.release-drops-held`. A `Released` claim settles a head only while
  the suite holds a use of its actor (an actor with no use runs no handler).
- L1 changed: a kept lane needs a delivery plus either unknown { Restored } at the boot or an
  ending the disposal reported; `Delivered` carries no channel, so a parked ending's channel is
  not compared (stated limit).
- L2 accepted (`expects`, Conformance Q5). L3 accepted (`Ensured.use`). L4 accepted (closed
  transition tables; `Settled` terminal). L6 accepted (`mutant.disposal-rereads`, DISP-04). L7, L8
  accepted. L9 accepted (`disposalBoundMs` in `dsl/oracle.ts`). L10 accepted (`LaneId` compared
  with `sameJson`). L11 accepted (`let life` gone with the cleanup; `stepName` has no sentinel;
  arrays are not read as keyed inputs); `judge` keeping the first violation per oracle per step is
  noted, not changed.
- L5: the probe mutant (a head held by an unknown also reported `Released`; edit in `lane.ts`
  `hold`) is caught by no oracle, only by the case expectations that count `Released` (PAY-03,
  LANE-03, LANE-09). Not registered.

| Sidecar                      | Task               | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer (test the spec, R4) | the T6 review diff | 10 findings. Accepted: 1 (adoption requires a delivery only for a Held head, not one on the wire), 2 (`Superseded` settles only a never-sent Attempt), 5 (a dropped head's lane is judged until a new commit of that operation), 8 (adoption must not re-send: the server log is checked). Rejected: 3 (owners come from `Minted`, the only report naming who committed; stated), 4 (a boot's parked delivery carries no channel; stated limit), 6 and 7 (each `expects` names the Invariant its oracle catches it under: I29 for a lane missing at the next boot, I15 for a delivery during disposal, I20 for cancelAll's head, which R15 says acts as cancel), 9 (latent: no case disposes without re-ensuring; noted), 10 (first violation per oracle per step: noted, pre-existing). |

## T7 (2026-11-10): first step, then parked for T40

Committed: H5 in `ending-channels` (a success or commit failure ends only in a step where the
server answered one of its sends; an answer given at request time counts; only unknowns and Flow's
own failures end without one), its mutant `mutant.success-without-answer` (PAY-16, caught as
WriteLanes I3), and case `DISP-06` (a disposed actor's ending parks and the next ensure hears it;
Actors R20, WriteLanes R10). Numbers: suite 67/67; null 0/67; falsify --parallel 6 38/38;
`nub run check` at zero.

Parked, not committed, by the orchestrator's call (lane-queue, lane-model and delivered-once are
rewritten from the Spec in T7's S2 after @task.V3.T40): the H1 keyed lanes in `lane-queue`, the H2
I16 check, the H3 replaced-delivery check and the H4 dropped disposal excuse in `delivered-once`,
and their mutants `mutant.replaced-delivered` (LANE-07, I15), `mutant.success-then-failure`
(PAY-01, I16) and `d6.disposed-ending-is-evidence` (DISP-06, I15), each seen caught for its reason
on the parked patch. They are the rewrite's acceptance list. Also found: with no key on `Minted`, a
keyed lane can be named from the request's input (the server log), as `disposal-ledger.ts`
`laneOf` does; the rewrite should do that rather than guess.

| Sidecar                      | Task              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reviewer (test the spec, R4) | the H1 to H5 diff | 7 findings. Accepted: 2 (Flow's reasons exempt only failures from the answer rule), 7 (the doc lists the answer rule and request-time answers). Carried to the rewrite with the parked code: 1 (name a keyed lane from the request input, not a fresh lane), 3 (the replaced excuse ignores keys), 4 and 5 (docs of parked code). Rejected: 6 (WriteLanes I3 is the Invariant that enforces R2 in the coverage block, and the oracle names it; a made-up success breaks R2's three-channel classification). |

## T40 (2026-11-10): suite simplified (first pass)

Each item landed alone; gates from `packages/flow-state-v3`: `suite --json`, `suite --runtime null
--json`, `falsify --sweep --parallel 6`, compared sorted with the item before.

| Commit                 | Item                                                                                                                                                      | Gate                                                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `a6063da3`             | S5: one `attemptKey`, `writeNamed`, `LaneId`/`sameLane`/`laneOf` in `dsl/domain.ts`                                                                       | byte-identical                                                                                                                      |
| `4f597c6f`             | S7: key fields derived from the key Schema; `CHANNEL` gone                                                                                                | byte-identical                                                                                                                      |
| `fad7296e`, `aa3d56ca` | S6: `Storage.entries`, `Page.tasks`, `WorldClock.armed`, `World.seed`, `Request.page`/`at` gone                                                           | byte-identical                                                                                                                      |
| `83c50e8f`             | S1: oracles are pure step folds (`Judge`, `oracle`, typed `Violation`, `InvariantId` guarantees); the Case folds only new facts and keeps every violation | per case: verdict kind, oracles, first Invariant identical; sweep red and caught-by sets identical (texts now list every violation) |
| `fade76e0`             | S3 (part): `landLate`, storage `match`, `answerWhere`/`where`, `ensureWith` gone                                                                          | byte-identical                                                                                                                      |
| `0b1a65f0`             | S4: `fixtures/pay-steps.ts`; `REREAD_MS` and `PAY_TIMEOUT_MS` named from the fixture                                                                      | byte-identical                                                                                                                      |
| (this)                 | S5: one `mayHaveApplied` from the server log, used by `ending-channels` and `disposal`                                                                    | byte-identical: no verdict changed                                                                                                  |

Numbers at the end: suite 67/67; null 0/67; falsify sweep 38/38 caught; `nub run check` at zero.

Rejected or changed: S7's "drop `Fixture`'s 4 generic parameters" rejected: they are the lint's
sanctioned place for `Schema.Codec<unknown, unknown>`, and `Schema.Top` does not give the
encoders the requirement-free Codec they need. S7's `attempts` flag kept: dropping it touches
`lane-model` and `delivered-once`, which T7 rewrites. Not done yet: S3's split of `openCase`,
`Driver`, the inlined timeline, counters and `reportsOf`; S8's runner items.
