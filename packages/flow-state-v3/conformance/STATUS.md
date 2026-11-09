# Conformance suite status

## Round 1 (2026-11-09): layout, Port, prototype adapter, fake world, runner, first slice

Built: everything in the README's layout. The slice is two WriteLanes guarantees end to end:
`three-channels` (I3) and `attempt-identity` (I6), each with two lies, and the Pay cases `PAY-01`
to `PAY-05` ported with the same steps and expectations.

Latest numbers:

- `suite`: 5/5 on round-14, also with `--parallel 3`.
- `suite --runtime null`: 0/5 (every case states a failure).
- `falsify --parallel 4`: null runtime red, control green, 4/4 lies caught by their own oracle.
- `nub run check`: no errors, no warnings (23 files).

### Verdict comparison with the old suite

Same cases, same wrong runtimes, old suite run as
`bun main.ts --round 14 --runtime <rt> --no-search --no-catalog --only <cases>` from
`prototypes/conformance/`. Runs by the runner sidecar; (b) and (d) re-run by the lead.

| Runtime                     | Old suite                                                                        | New suite                                                                                         | Reading                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| round-14                    | PAY-01..05 pass (PAY-01..16: 53/53)                                              | 5/5 pass                                                                                          | same                                                                                         |
| `k.failure-as-success`      | PAY-02 red by (j) "delivered as Confirmed, maps to PayNotSent"                   | PAY-02 red by `three-channels`                                                                    | same verdict, same reason                                                                    |
| `lie.still-unknown-dropped` | PAY-05 red by (h) "may be at the server, and no head on disk says so"            | PAY-05 red by `three-channels` "ends unknown StillUnknown"                                        | same verdict; the old suite had no I3 oracle, only (h) noticed the lane released             |
| `lie.resend-new-id`         | PAY-04 red by (h) on `att-1-1-again`                                             | PAY-04 red by `attempt-identity` "server received ...-again, runtime reported sending it 0 times" | same verdict, different oracle                                                               |
| `lie.resend-new-input`      | PAY-04 red only by the recorded-output compare; with `--no-output` PAY-04 passes | PAY-04 red by `attempt-identity` "sent with two inputs"                                           | old-suite weakness: no named oracle for WriteLanes R5/I6 "every send carries the same input" |

No new-suite bug was found by the comparison.

### Sidecar log

All Haiku, effort high. The lead read every diff and re-ran every check.

| Sidecar                                          | Task                                                                                                    | Result                                                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runner                                           | Old suite on PAY-01..05 and PAY-01..16, control and the four lies                                       | Accepted. The lead re-ran lies (b) and (d) and got the same lines. Noted: the old suite needs `--no-catalog` now (its catalog reads a deleted design file).                                                                    |
| Coder                                            | Lint fixes in `world/*`, `runner/child.ts`, `runner/run.ts`, `oracles/equality.ts`, `oracles/oracle.ts` | Accepted after reading the diff: `Storage.answer` and `Clock.nextDue` take and return `Option`; `RETURN_TYPE` reasons on exported factories; `sameData` split. The lead changed its one cross-file call site in `dsl/case.ts`. |
| Reviewer (one rule: test the spec, not the code) | The two oracles, the reference, the fact recording                                                      | 10 findings; see below.                                                                                                                                                                                                        |
| Reviewer (lint-bomb STYLE.md)                    | Every suite file                                                                                        | 18 findings; see below.                                                                                                                                                                                                        |

Spec-fidelity review, by finding:

1. Died call not checked as `unknown Defect` (R2). **Accepted**: `three-channels` expects
   `unknown Defect` for `Die`.
2. An ending in a later step than its answer is not judged. **Rejected** as a change, kept as a
   stated limit in the oracle's doc: pairing across steps misjudges a cancel or timeout that ends
   the Attempt between an answer and a re-send; the ending ledger (`one-delivery`) owns "every
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
   `lie.resend-new-id` lie is still caught (re-checked).
9. `advance` did not fire a zero-delay timer armed at its end. **Accepted**: it fires every timer
   due by the end, including ones armed on the way.
10. I12 has no oracle; T1/T2 lies absent. **Accepted** as work-list items.

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

Take the ending ledger (`one-delivery`, WriteLanes I15, I16, I22) with the Pay cases that need it
(PAY-06 to PAY-16), which brings the fake world's `lateAnswer`, `landLate`, storage `hang` and
reload paths, and the lies `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`,
`e8.wa-failure`. Then `lane-cells`. Compare verdicts on PAY-01..16 against the old suite.

## Round 2 (2026-11-09): review fixes, Port additions, the ending ledger, PAY-06..16

Latest numbers:

- `suite`: 38/38 on round-14, every case under seeds 1 and 2 (31 Pay ids, 3 delivery cases,
  PAY-01..05).
- `suite --runtime null`: every case fails; `--json` exits 1.
- `falsify --parallel 5`: every oracle has a lie, null red, control green, 9/9 lies caught by their
  own guarantee's oracle.
- `nub run check`: no errors, no warnings (30 files).

Round 1 review findings, by item:

- M1 **done**: `three-channels` requires an answered live send to end, under its id, in that step
  (live: the newest request of the id, a send reported and no ending since). Lie
  `lie.ending-without-id` (the send's ending names no Attempt): caught by `three-channels` on
  PAY-01.
- M2 **done**: `suite.ts` holds `guarantees` (each oracle with its lies); falsify fails an oracle
  with no lie for the runtime it runs on. A verdict names every oracle that failed the step, so a
  lie is judged by its own oracle even when another also fires.
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

Built: `oracles/one-delivery.ts` (WriteLanes I15, I16, I22: the ending ledger) and four lies;
`scenarios/delivery.ts` (DLV-01..03, built so the lies' triggers fire: two endings owed to one
actor at a boot, two actors' endings at a boot, a failure ending with a second live shopper); the
`cells` fixture; fake-world late answers, late landings, uninterruptible calls, answers at once,
storage `hang` and `landNoAck`; `falsify --sweep`.

### Verdict comparison with the old suite (PAY-01..16)

Old suite: `bun main.ts --round 14 --runtime <rt> --no-search --no-catalog --no-output --only
PAY-01,...,PAY-16` (53 case items). New suite: `falsify --sweep` (38 cases). Runner sidecar runs;
the lead re-ran the control and `lie.ending-without-id` (53/53 and 12/53, the same).

| Runtime                                                              | Old suite                                                                                                                                                          | New suite                                                                        | Reading                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| round-14                                                             | 53/53                                                                                                                                                              | 38/38                                                                            | same                                                                                                          |
| `lie.ending-without-id`                                              | 41 red, by (j) "an ending reached nobody" (3 by S4 or a vanished mint)                                                                                             | 30 red, every one by `three-channels` (and `one-delivery`)                       | same verdict on every ported case with a write ending                                                         |
| `a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released` | 53/53 green: the trigger (other mail when an ending is admitted) never fires on Pay traces (sidecar instrumented the copies: `tx.w.mail` empty at all 818 entries) | green on Pay; red on DLV-01/DLV-02, built to fire the trigger, by `one-delivery` | not a weakness of either suite on Pay; the old suite caught them on DRV-02, MED-01 and others, not ported yet |
| `e8.wa-failure`                                                      | 1 red, PAY-12/shuffle, by (j) "delivered to the wrong recipient"                                                                                                   | red on DLV-03 by `one-delivery`                                                  | PAY-12/shuffle (scheduler shuffle) is not ported; DLV-03 drives the same trigger directly                     |

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

| Sidecar                  | Task                                                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder A                  | PAY-06..09                                                 | Accepted after reading the diff; the lead ported `ack-stored-confirmation-lost` (added storage `landNoAck`) and restored the `LateMayNotLeave` assertion (added `Denied`). Its failure report on late-may-not-leave was right: a missing `Denied` outcome in the oracle.                                                                                                                                                                                                                 |
| Coder B                  | PAY-10..13                                                 | Changed: only PAY-10 was portable then; the lead added the `cells` fixture and ported PAY-12/defect, sync, cancel-on-wire, and restored PAY-10's storage evidence (added `StorageFailure`, `StorageSilent`).                                                                                                                                                                                                                                                                             |
| Coder C                  | PAY-14, PAY-15                                             | Accepted; its fixture switch for the non-`AbortPay` variants is kept (`cells` is `pay` plus `AbortPay`); the lead ported the two `AbortPay` variants on `cells`.                                                                                                                                                                                                                                                                                                                         |
| Coder D                  | PAY-16                                                     | Accepted; its stale-send-fenced failure was right (an oracle refinement, above). The lead restored "older was interrupted" through the server's request phases. Its skip of rejected-is-delivered is logged as a gap.                                                                                                                                                                                                                                                                    |
| Runner                   | Old suite on PAY-01..16, control and five lies             | Accepted; re-ran two of its runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Reviewer (test the spec) | `one-delivery`, the changed checks, attribution, DLV cases | 19 findings. Accepted: 2 (a disposal excuse ended by a re-ensure), 3 (an unknown owner is never excused), 4 (an `ignored` record needs the mapping's cause), 8 (a let-go pays a parked ending), 18 (DLV doc overclaimed). Rejected 1 as stated (e8 is caught by `one-delivery`: B's IDLE root handles `Declined`, so a turn runs in B; falsify shows it) but kept its point as a stated limit: `Unhandled`/`Denied` match by event. Notes kept as limits: 6, 7, 9, 11. Others are notes. |

### For round 3

`lane-cells` (WriteLanes I8, I9, I11, I12, I20, I21) with its lies and the remaining Pay cases
(PAY-17..20), and the Port's runtime disposal so PAY-13 and the disposal variants port. Then
`members`.

## Round 3 (2026-11-09): lane-cells, Runtime disposal, PAY-13 and PAY-17..20

Latest numbers:

- `suite`: 61/61 on round-14, every case under seeds 1 and 2 (48 Pay ids, 10 lane cases, 3
  delivery cases).
- `suite --runtime null`: every case fails.
- `falsify --parallel 6`: every oracle has a lie, null red, control green, 21/21 lies caught by
  their own guarantee's oracle (12 of them lane-cells').
- `nub run check`: zero errors and warnings on the round's own code before the lint scope was
  widened (commit 46488541); after it, 74 `no-unknown`, 2 `no-object-type` and 3
  `no-optional-domain-properties` remain, all from the widened scope. They are round 4's first
  item (typing the Port per fixture with generics, the user's direction); nothing is waived.

Built:

- `oracles/lane-cells.ts`: a model of each unkeyed lane from the runtime's reports, checked
  after each turn and step against the fixture's reference and the suite's facts: the queue
  bound per policy (I8), one addressable Attempt (I9), promotion only past a resolved or released
  head (I11), Held left only by retry, cancel or release (I12), `Superseded` only under latest
  (R7), cancel by the head's history (I20), and `cancelAll`'s queue in mint order with a held
  head delivered last (I21). A cancel is judged over the reports from its turn to the end of its
  step, so the verdict does not depend on where a runtime reports `Turn`.
- Twelve lies (`oracles/lane-cells.lies.ts`): seven with the old suite's names and edits, five
  written from WriteLanes' text (`lane.latest-as-serialize`, `lane.fresh-mint-on-held` (the map's
  "fresh mint on a Held lane"), `lane.unknown-promotes`, `lane.cancel-held-keeps`,
  `lane.cancel-wire-as-never-sent`). Each was confirmed caught by lane-cells for its own reason.
- `scenarios/lanes.ts`: `LANE-01` to `LANE-10` on three lab machines (`serialize`, `latest`,
  `cancel` from the prototype's typed fixtures) and Pay's `AbortPay`.
- The Port: `Runtime.disposeRuntime()`, `Observation.RuntimeDisposed`; the timeline facts
  `DisposingRuntime`, `Drove`, `Unstoppable`; the fake network's `FailButLanded`; the reference's
  `keyFields` and `cancels`; the prototype adapter loads fixture factories and serves `Api.call`.
- `one-delivery`: from a Runtime disposal to the next reload an ending may stay owed and counts
  as parked at the reload; a delivery in that span is a violation; parked endings stay parked
  across a reload; a re-park is not a second delivery.
- Ported: `PAY-13` (3), `PAY-15/dispose-held`, `PAY-16` disposal variants (4), `PAY-18`,
  `PAY-19` (2), `PAY-20` (2). Not ported: `PAY-17` (5 variants, module and core faults, never a
  Port part), `PAY-16/parked-success-is-delivered` (a yield fault).
- Spec changes (`specs/spec-log.md`, round 3): WriteLanes R14's Idle cell, and three
  wrong-runtime moves (`lane.promote-skips-durable` to WriteAhead T7, `lost.letgo-silent` to T6,
  T10's idle lie).

### Verdict comparison with the old suite

Old suite: full suite (1,080 cases) on an edited copy per lie; new suite: `falsify --sweep`.
Runner sidecar's runs; the lead re-ran the new side.

| Lie                                      | Old suite (red cases, how)                         | New suite (red; by lane-cells) | Reading                                                                           |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| control                                  | 1,080/1,080; PAY-13..20, P1-H, R15-01: 114/114     | 61/61                          | same                                                                              |
| `lie.serialize-as-latest`                | 9, by (j) "superseded ... (serialize)"             | 3; 3                           | same verdict; the old falsify entry's edit no longer applies to round-14 (rotted) |
| `lane.queue-unbounded`                   | 1, REV8-PINS by the case's own assertion           | 1; 1                           | old-suite weakness: no oracle for I8's bound                                      |
| `lane.latest-as-serialize`               | 3, case assertions                                 | 1; 1                           | old-suite weakness: no oracle for R7 under latest                                 |
| `lane.fresh-mint-on-held`                | 16, case assertions                                | 2; 1                           | same verdict; new catches it by I11 on an unkeyed lane only (keyed limit)         |
| `lane.unknown-promotes`                  | 273, (h) and assertions                            | 20; 1                          | same verdict; old (h) sees the dropped head on disk, new I11 sees the promotion   |
| `lane.cancel-held-keeps`                 | 60, assertions                                     | 3; 1                           | same verdict                                                                      |
| `lane.cancel-wire-as-never-sent`         | 21, (h) and DRV-01                                 | 3; 1                           | same verdict; new names I20                                                       |
| `1b.cancel-all-queue-reversed`           | 1, P1-H assertion                                  | 1; 1                           | old-suite weakness: order checked by one case only                                |
| `1b.cancel-all-promotes-before-emptying` | 2, R15-01 assertions                               | 1; 1                           | same verdict                                                                      |
| `1b.cancel-all-wire-held-at-once`        | 1, P1-H assertion                                  | 1; 1                           | same verdict                                                                      |
| `audit-1.cancel-all-leaves-the-head`     | 3, assertions (with this suite's re-anchored edit) | 1; 1                           | old-suite weakness: the old mutant's edit no longer applies to round-14 (rotted)  |
| `p1h.cancel-all-idle-declines`           | 1, P1-H assertion                                  | 1; 1                           | same verdict                                                                      |

Every lie is caught by both suites; no new-suite bug was found. Where the old suite caught a lie
only by one case's assertion, the new suite catches it by a named oracle on every step
(WriteLanes I8, I11, I20, I21). Two old wrong runtimes no longer apply to round-14 and would show
as never red there. The new suite's breadth is smaller (61 cases against 1,080), so its red
counts are smaller on every lie. On Pay (keyed) lane lies are red by case assertions and other
oracles, not lane-cells: the keyed-lane limit.

### Sidecar log (round 3)

| Sidecar                       | Task                                                   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coder A                       | PAY-18..20 (`scenarios/pay-17-20.ts`)                  | Accepted after reading the diff and re-running its cases (5/5; null 0/5). Changed: the doc comment (no history, names the Pay read-first rule), PAY-18 gains "no send before an acknowledgement is heard" (review finding 7). Its Turn R20/R21 cite kept.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Coder B                       | Disposal cases (`scenarios/disposal.ts`)               | Accepted; its report of 4 failures (`unparked, never parked` at the reload) was right: one-delivery forgot parked endings at a reload. Fixed in the oracle (parked endings survive a reload; disposal's owed endings become parked), not in the cases. Changed: `waiting-flushed` asserts disposal's end after the pending write (Actors R23), cites WriteAhead R14.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Runner                        | Old suite: control and the twelve lane lies; rot check | Accepted; the lead re-ran the new side (`falsify --sweep`). Its rot counts (two old edits match 0 times) were confirmed by grep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Reviewer (test the spec)      | lane-cells, lies, LANE cases, disposal, one-delivery   | 19 findings. Accepted: 2 (cancel judged over the step, not the batch before `Turn`), 3 (I21's held head delivered last: added; no wrong runtime yet), 4 (a re-park is no second delivery), 5, 7, 8, 12, 13 (an Idle cancel may record evidence), 14 (the step defined in the doc), 16 (map rows moved), 17, 18, 19. Rejected: 10 (a write has no abort signal at the fake server by design; the replaced Attempt's ending being evidence is checked), 11 (R14 says unknown Cancelled on fiber exit, whatever the answer), 15 (falsify shows the lie caught: the held head never ends). Kept as limits: 1 (a parked ending still parked at a case's end), 6 (reworded), 9 (a one-delivery lie for the disposal rule: round 4).                                                                                                                            |
| Reviewer (lint-bomb STYLE.md) | the round's diff                                       | 17 findings. Accepted: 3 (as above), 9 (one `addressable` helper), 11 (docs say the contract, not history, where they narrated), 16 (`Option.isNone` on a row), 17 (order); 1 in part (the "remove" outcome is a named `held` or `gone`, not an empty Option; the one total transition is round 4's, with the generic Port). Rejected: 2 (Runtime disposal is idempotent, Actors R20, so a repeat is no violation; the phase now lives beside the ledger, not on it), 4 (I21 says "in mint order"), 5 (`Disposed` is round-14's runtime-level note, step.ts finishDisposal; an actor's dispose notes `disposed`), 6 (a replaced Attempt leaves at its ending), 7 (the lane holds the reference's object, not a copy), 10, 12 (`RETURN_TYPE` is the lint's own mechanism), 13 (the fixture API's optional third argument is the fixtures' shape), 14, 15. |

### For round 4

1. The widened lint scope: type the Port per fixture with generics (the user's direction), so
   the 79 findings close with no waivers; drop `readonly` inside `Data.TaggedEnum` members (done
   this round).
2. The Attempt's key on `Minted` (production reports it; the prototype adapter cannot), so
   lane-cells judges keyed lanes and Pay.
3. `members` (WriteLanes I10, I13, I14), with the releasing-lane fixture `p1Rel` for
   `audit-1.cancel-all-release-also-cancels-head` and I22.
4. A one-delivery lie for the disposal rule, and the `disposal` oracle (Actors I29-I31).
