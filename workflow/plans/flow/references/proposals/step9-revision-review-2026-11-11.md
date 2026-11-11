# Step 9 revision review (2026-11-11, `857873d8..62bb4002`, read and probed at `62bb4002`)

**Verdict: not yet. The WriteLanes and disposal oracles are good enough to judge T16's Pay path. Turn selection is
not: fix H1 and H2 first.** Both are the step 9 review's root cause (RC1) again: the runtime's own report decides what
gets judged. This time the report field is the Turn header, through two doors that the H1 fix left open:

- **H1. With no root part, the runtime's `to` picks the alternative.** A runtime can leave out its root part and
  report `to` as a sibling alternative's leaf. `selection` then judges nothing, and the lifecycle owes that sibling's
  row. Probe p5 drops every cancel, reports `to = from` and leaves out the root part on those turns: `selection`
  fires in 0 cases. In six Pay cases (PAY-03, PAY-08/reloadDuringCharge, PAY-14, PAY-20 ×2, PAY-21) the catch
  moves from the dropped cancel (I12) to an unrelated I1 on the `place` commit. A cancel-only alternative such as
  `OrderSeen` UNSURE→PAID has no such I1 to fall back on. Probe p2 (root-first on `CheckTick`, root part left out)
  is caught by `selection` in 0 cases. The same edit with the root part reported (p2r) is caught by it in 24.
  Code: `turn/selection.ts:92, 116-117`. It contradicts the oracle's own doc ("the reported `to` is judged, never
  trusted", `:415`) and STATUS 1132.
- **H2. After a reload or disposal, `from` and the route come from the report.** `Stored` drops the leaf
  (`turn/phases.ts`). `routeOf` returns `either` for a non-Live actor before it checks the restored set
  (`turn/anchor.ts:76` before `:81`), and `from` is the reported one (`selection.ts:80-81, 228`). Probe p4 runs
  root-first only on restored endings. `selection` catches it in 1 case (DLV-01). In three it goes red on a case
  expectation alone (PAY-13/waiting-flushed, PAY-16/settled-during-disposal-parked, PAY-08/reload-while-reconciling:
  the leaf alternative's move to CARD or PLACING never happens). T16's Pay path crosses exactly this window:
  reload in the middle of a payment, then restored endings. That breaks Turn R20 (a restored ending is current)
  and I2.

**What to do (proposed):** close both with one rule. The header is judged from suite facts or not at all.
(1) A Turn of a handled event with no root part breaks I2, and an alternative is never chosen by `to`.
(2) `Stored` keeps the leaf it was carried at, since a restore keeps it unless the definition changed, which no
Pay case does. The restored check runs before the Live check, so restored endings route `current` from the carried
leaf. Add p2, p4 and p5 as `selection` mutants (each one expects Turn I2, or I26 for p4).

## Gates (a `git archive 62bb4002` copy, node_modules linked; scratch `h62`)

- suite **92/92**; null **0/92**; falsify **`VERDICT pass 113/113 mutants caught, 3/3 probes hold`**;
  coverage **43 of 183 checked (17 in part), 0 gaps**.
- The step 9 review's H2 is closed. In a sweep, `k.drop-row` is red in 36 cases, 19 of them by `disposal` (Actors
  I29). `q1a.unchanged-resets` is red in 39, 20 by `disposal`.
- The step 9 review's H1, as stated (`to: "Nowhere"`), is closed. Both header mutants are red in 16 cases, all 16
  by `selection` and 9 by `lane-queue`. H1 above is the same lie with the root part left out.
- Probes are edits to round-14 run with `suite --runtime` (scratch `edits/*.json`, `tools/mk.ts`, `tools/run.sh`):

| Probe                                                       | Result                                     |
| ----------------------------------------------------------- | ------------------------------------------ |
| p1ctl: leave out every root part, run unchanged             | 12 red, all false Turn I30 (see M4)        |
| p1: root-first on every event, no root part                 | 38 red; `selection` catches driven events  |
| p2r: root-first on `CheckTick`, root part reported          | 24 red, all by `selection` I2              |
| p2: the same with no root part                              | 22 red, **0 by an oracle** (case only)     |
| p4: root-first on restored endings only                     | 4 red, **1 by `selection`**, 3 case only   |
| p5c: drop cancels (control)                                 | 14 red, all `lane-queue` I12/I20/I21       |
| p5: drop cancels, `to = from`, no root part on those turns  | 14 red, **0 by `selection`**, 6 by wrong I1 |
| p6c: decline reports with no actor                          | 0 red (correct: the open turn names it)    |
| p6: the same plus an undelivered decline                    | 4 red, all `delivered-once` I15            |

## The three suspected Highs from the partial review

- **a1, Evidence clears every Await of its Attempt** (`dsl/lifecycle.ts:219-220`): **changed to Medium (M1).** The
  code is wrong. `discharge` drops every `Await` of the Attempt, and `waitingOn` (`lifecycle-lanes.ts:174-180`)
  can owe a superseded queued commit both `Superseded` and `NotSentCancelled`, so either ending passes. But that
  needs one alternative with a superseding commit and a `cancelAll` on the same lane. No fixture has one: `All` in
  `one-lane.ts` is cancelAll alone, and Pay has no cancelAll. Fix: discharge only the `Await` whose `report`
  matches the move.
- **a2, a reported Parked skips a boot's restore** (`dsl/lifecycle.ts:371-382`): **rejected as a High (L1).** The
  exemption is the Spec's (Restore I6: the parked ending is the restore's delivery). A held actor's `Parked`
  is refused at the step's end (`lifecycle-rules.ts:480`, I15), and `StepEnds` turns a free one into `Kept`. So
  `parked` sees only a parked-open ending or an owed one decided in disposal. Both H2 mutants are now caught by
  their oracle. What is left is that an un-held actor's park is the runtime's word, which the Spec allows.
- **a5/U4, U1, c-f, the header or routing taken from the report:** **accepted, as H1 and H2.**

## Other findings, each verified (accepted, changed or rejected)

Medium:

- **M1** a1 above.
- **M2** `Unhandled`/`Denied` close the first `Delivering` ending of any actor (`lifecycle-step.ts:61-69, 203-204`),
  while `selection` declines to attribute one when two actors hold credit (`selection.ts:278-300`). **Accepted;**
  Medium because no case delivers one event to two actors in one step (PAY-21's endings come in separate steps).
- **M3** an actor-less `Delivered` admits its event for every actor (`selection.ts:149-160`) and decides the route
  for every actor. **Accepted;** round-14 always names the actor. Fix: an actor-less `Delivered` admits nothing.
- **M4** I30 is gated by the reported parts (`turn/publication.ts:22, 41`). p1ctl shows the gate works both ways:
  leaving out a root part turns a correct runtime red, and a runtime that reports an updating part is never
  checked for copies. `Published.state` is never judged, and `memoryId 0` skips both checks (`:62`). **Accepted.**
- **M5** `unknown { Restored }` for a never-sent Attempt is accepted outside a boot. `ending-channels.ts:350-352`
  has no reload condition, and `EndUnknown`/`Unsent` is `always(stay)` (`lifecycle-rules.ts:117`), so the Attempt
  stays sendable. This breaks WriteLanes I3 ("at a boot"). No mutant targets the branch. **Accepted** (sidecar
  b's F4 plus a's N4).
- **M6** Coverage overclaims. Turn I2, I26, I29, I30 and Actors I38 count as wholly checked, yet the oracles'
  own docs name unjudged clauses: Unhandled/Denied that can't be attributed, part-level alternatives, a reload's
  first `from`, I26's "iff", non-memory snapshot parts, equal-content patches, and I38's delivery to the next
  incarnation (`lifecycle-rules.ts` gotcha). `remainders` holds construction and CLI rows only (`suite.ts:113`).
  The README says such a check is "in part". **Accepted.**
- **M7** No oracle judges policy decline reasons (`lifecycle-lanes.ts:323-333`, `NO_POLICY` for any commit). The
  step 9 probe "every commit declines NoPersistence" was red only on case expectations, and that still holds.
  **Accepted** (carried).

Low:

- **L1** a2 above. **L2** a6: the reported reason decides `retained` (old L2, carried). **L3** a7: `retryable`
  counts reported Sends (carried). **L4** a8/a9: `Incarnated` gated by a `Drove` alone, and `Finished` written
  unjudged (stated in STATUS). **L5** a11: a claimed `Cancelled` excuses I35 timing (old L3, carried).
  **L6** c-U5 to U7 and c-1e: driven credit outranks a delivery for routing, and the owner's liveness follows the
  table's `enters` flag for a self transition. Both are reading-dependent, with no Pay pass shown.
- **L7** `disposal`'s window keeps an `AttemptLife` snapshot (`actors/disposal.ts:41, 74, 170`), so an Attempt
  interrupted inside the window still reads as on the wire. Only the strict direction (a false red). **Accepted.**
- **Rejected:** N1, a decline with no actor dropped (p6c and p6: inside a turn the open turn names it, and the
  undelivered decline is caught). N8, a queued commit closed at boot with no `NotSent { Restored }`: true, but
  already logged as unreachable (Pay is `reject`). c-1j, a second root part: the Spec does not allow one.

Lost checks against `857873d8` (sidecar b, re-read):

- The once-per-step `Incarnated` guard (`lifecycle-step.ts:220-223`) lost its only test with the `incarnation`
  field. **Accepted, Low:** add one `step()` test.
- `lanesOf` sends a key-less keyed commit to the keyless lane in `guardHolds` (`lifecycle-owed.ts:121`). It is a
  behaviour change but was logged as a rename, and no trace reaches it. **Accepted, Low.**
- `cmp.guard-runs-at-construction` was removed. Compile I1 no longer names a guard, and CMP-01's guard check
  cites R1. **Rejected:** the Spec backs it.
- `mutant.disposal-skips-never-sent` moved from Actors I29 to I38, and the CQ1 ruling flipped a twice-refused
  never-sent ending to `Kept`. Both are logged. **Accepted as logged.** The trace "a Held head's parked ending
  delivered meets its restore" now reaches `owed 0` with no `AwaitRestore` created. Its cite should say so (Low).
- No other lie or mutant was removed, and no case list shrank. Falsify is 113/113.

STATUS and README drift (Low): STATUS 1285 says root-first is "caught on endings too", but 1315 says "only on
driven and scheduled". STATUS 1158 says "12 cases" against `cases: ["PAY-03"]` (a sweep count, not labelled).
README 295, 297 and 304 claim Invariants and mutants that no `.ts` file has (`w.row-in-place`, a `late-routing`
oracle). The `selection` doc's "never trusted" is H1.

## Size and code quality (sidecar d at `62bb4002`, spot-checked)

- Production lifecycle, turn, disposal and lanes code: 3,740 code lines, up from 3,665 at `42451e51`
  (publication +73).
- Recurring: `mode` is a string plus an `afterDisposal` flag, compared at about 12 sites. The turn's phase is two
  `Option`s. The Root owner is a string sentinel, and `key.split(" ")` recovers an actor
  (`selection.ts:297`). There are five head derivations and eight Attempt-by-id lookups. 83 lines are over 120
  characters (30 in production, 9 of them in `disposal.ts`). Review-round tags sit in doc comments, and 13
  exports are used nowhere else.
- None of this changes a verdict. Fold it into the convergence pass that fixes H1 and H2, not into a separate
  pass.

## How it was checked

Four Haiku sidecars ran read-only: (a) report-driven holes, (b) lost checks, (c) Turn oracles against the Spec,
(d) quality and size. I verified each lead above by a probe or by reading the cited lines. Sidecar b wrote three
temp files outside the repo by mistake (`/var/folders/.../T/old-step.ts`, `names-857873d8.txt`,
`names-62bb4002.txt`). They are harmless and were left for the coordinator.
