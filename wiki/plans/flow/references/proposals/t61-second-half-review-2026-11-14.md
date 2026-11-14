# T61 second half review, 065529e6..24432df4 (2026-11-14)

**Verdict: PASS, no blocking finding.** I shrank 18 owed breaks from 16 scripts the builder didn't trace. Every
one roots in one of the two known bugs: T19's retry count and T54's unbound restore. No new production bug and no
suite error is excused. One row has the wrong owner (N1). The O1 pin is right for the suite's world, but it rests
on a report that production can't emit for the final write (N2). Usual and stress scripts are byte-identical.
Each planted generator that ignores a varied option turns a check red. `late-results` names the right Attempt.

Review by an Opus reviewer, @task.V3.T61. The range is read with 065529e6 included (the O1 fix). Nothing after
24432df4 was judged.

## Checks

1. **The 147 owed rows (@task.V3.T61, `code:packages/flow-state-v3/conformance/parts/owed-varied.ts`).** All
   rows are keyed by exact subject: an Attempt id, or `subject@step` once (transfers-varied-101). I took 12
   untraced scripts, shrank each to its first break (the excuses for that script were removed), and traced the
   shrunk script. Then I ran 6 targeted shrinks on rows labelled retry in scripts mostly labelled unbound.
   - Retry (budget re-spent across reloads): transfers-varied-2, -102 and -105 (Send, ack, reload, Resend, ack,
     reload, Resend, ack); cells-varied-1, cells-varied-103 and MIX+pay-stress-101 (place or void re-sent at
     each boot past `times`, "Await Released … not met"); MIX+pay-stress-1 I12; pay-varied-11 I1; cells-varied-110
     late-results; transfers-varied-101 I8 (each shrinks to the retry I12 first).
   - Unbound (a disposed identity's Held head ended unknown Restored and parked at a boot): pay-varied-1, -11,
     -109 and -103 (I29); cells-varied-7; MIX+pay-stress-1 and -5. Each shrinks to 5 steps: ensure,
     PayRequested, ack, reload or a lost answer, dispose.
2. **The generator's belief.** It is Spec-backed for disposeActor: lanes stay as unbound records until an
   adopting ensure, and owed rows wait (Actors R20, Restore R1). It drifts from the Spec for forget, lookups and a
   release inside the grace (N6). The belief only chooses steps: `scriptOf` returns steps, and the Spec model's
   oracles judge each run. No move is withheld. It doesn't steer away from the bugs: both families appear more
   often under varied.
3. **O1.** The rule is correct for the suite's world: the fake store lands every flush write at once
   (`code:packages/flow-state-v3/conformance/world/storage.ts#makeStorage`), so a disposal's final write always
   lands. `prod.actor-never-saved` is caught on PAY-05 by Turn I2 at the end-of-case reload (`falsify --runtime
   production --mutant prod.actor-never-saved --sweep`, no file written). It was green in the sweep at
   065529e6^. Limits are in N2.
4. **Varied inputs.** The 288 usual and stress scripts (every part plus the mix, build and held-out seeds) hash
   the same under the 065529e6 and 24432df4 generators. Plants on a scratch copy, each run with the range's
   `varied.test.ts`:
   - timer offsets ignored: the new-cell test goes red;
   - neighbour ignored: the payload and new-cell tests go red;
   - `laterMoves` off: the out-of-order test goes red.
5. **`late-results`.** `id` is the Attempt in both branches. The change is a relabel plus a dedupe per id. No
   verdict changes.
6. **Standing angles.** Nothing re-creates an Effect feature, and nothing new reads the clock, randomness, env
   or the filesystem. I found no shell edits to project files: the logged `sed -i` touched a scratch file. N4,
   N7 and N8 are minor.

## Findings (none blocking)

- **N1, mis-owned row.** The `PART-pay-varied-11|lane-queue|WriteLanes I12` row is labelled retry (T19), but
  att-11000-12's break roots in T54's bug. The 9-step shrink is Start, PayRequested, ack, pay ok, ack, dispose,
  reload, ack. The boot ends the disposed identity's Held place unknown Restored and parks it. It then delivers
  PlaceUnsure, whose retry member re-sends: "Held got Send (at ack)". The same attempt is on that script's
  unbound I15 row. The other rows that share an attempt across both roots are probably the same, but I didn't
  verify them: pay-varied-103 (att-103000-34), cells-varied-2 (att-2004-32) and MIX+pay-stress-1
  (att-1001-13). Fix: take each attempt's root from its first break, split mixed rows, and re-own them to T54.
  No ending is lost (the bug is real and owned), but T19's close would trip on rows it can't turn green.
- **N2, O1 trusts a report that production can't emit for the final write.** `Disposal Done` is emitted in the
  DisposingRuntime step (`code:packages/flow-state-v3/src/core/disposal.ts#disposalEnds`). The flush runs after
  it (`code:packages/flow-state-v3/src/host/driver.ts`, `dispose`), and Stored and Refused are dropped while
  Disposing (`code:packages/flow-state-v3/src/core/step.ts`). A flush timeout is an `Issue`, which selection
  ignores. R23 and I43 say a refused final write reports StorageFailure before the disposal ends. A refused or
  lost final write can't happen in the suite world, and my probe (refuse after `disposeRuntime`) found no held
  batch. The unit test plants StorageFailure before `Disposal`, an order production never emits. A second
  DisposingRuntime also resets `refused` (`code:packages/flow-state-v3/conformance/turn/final-write.ts#disposing`,
  and case.ts has no guard). I43 says a later dispose restarts nothing. Proposed:
  - pin only after the world shows the flush batch landed after DisposingRuntime;
  - give the store a refusable final write;
  - route production's order (Done before the write) to the orchestrator; its owner is open.
- **N3, weak varied tests.** The timer `it` asserts only constants; a generator ignoring offsets was caught only
  because the reach test happened to depend on it. Neighbour does nothing for sync and sign-in (no id-like
  payloads), and transfers has no timers. The out-of-order `it` counts generated `answerLater` steps, not played
  ones. Proposed: assert a generated `advance` lands at deadline ±1, and count played `answerLater` steps.
- **N4.** `VARIED_OWED` maps every root other than `unbound` to retry (`owed-varied.ts`, the decode). A typo
  silently moves a row to T19. Decode the root with a Schema literal.
- **N5.** `late-results` doesn't dedupe `late`, so two Answered facts with one key in a step double the
  violation line (no verdict effect). No test pins the subject: the mutant is caught by check and Invariant only.
- **N6, belief gaps (step choice only).** The belief parks lookup endings after a dispose, though Life rows
  close (Actors I41). It replays parked endings after forget, which closes them (R21). It has no grace for a
  released actor (R8).
- **N7.** The thin-answer check divides all skips, `answerLater` included, by `answer` steps only
  (`code:packages/flow-state-v3/conformance/parts/play.ts`, `thin`). It could print BAD for an unowed varied
  script. It isn't red now.
- **N8, not the builder's.** The orchestrator's slice-order edit at `wiki/tasks/V3/epic.task:242-245` carries
  the user's decision but no Edit label. Doc comments sit on unexported consts (`ROWS`, `neighbour`,
  `laterMoves`), as elsewhere in the suite.

## Suggested T61 comment

Review of 065529e6..24432df4: PASS, nothing blocking
(code:wiki/plans/flow/references/proposals/t61-second-half-review-2026-11-14.md). I shrank 18 breaks in 16
untraced scripts, and all root in T19's retry count or T54's unbound restore. N1: the pay-varied-11 I12 row (and
probably three more that share an attempt) belongs to T54, not T19. N2: O1 holds only because the fake store
always lands the final write; pin on the world and add a refusable final write. N3 to N7 are minor. Reverse: delete
this comment.

## Sidecar log

Five Haiku sidecars (effort high, read-only). A was blind (Specs, the survey and the code only). I re-checked each
finding before using it.

| Sidecar | Finding | Result |
| --- | --- | --- |
| A blind | lanes kept on dispose and forget, parking after a dispose: Spec-backed | accepted, R20, Restore R1 |
| A blind | lookups parked, replay after forget, no grace on release | accepted as N6 |
| A blind | belief feeds no expected result; no move withheld | accepted, read `scriptOf` and the oracle path |
| A blind | thin check mixes `answerLater` skips with `answer` steps | accepted as N7, read play.ts |
| A blind | usual and stress unchanged | accepted, confirmed by the 288-script hash |
| A blind | stale busy keys after a reload; `ms < 0` timer guard | rejected: not in range, and the hashes match |
| B late-results | `id` is the Attempt in both branches; argument order right | accepted, read both files |
| B late-results | duplicate `late` ids double a line; no test pins the subject | accepted as N5 |
| B late-results | an Attempt row excuses every break on it | changed: T60's agreed granularity, not new |
| C varied | neighbour no-op for sync and sign-in; transfers has no timers | accepted, checked the fixture payloads |
| C varied | timer test vacuous; out-of-order test counts generated steps | accepted as N3; plants run |
| C varied | no golden pins usual or stress scripts | accepted; the hash comparison covers it |
| D standing | unknown root decodes to retry | accepted as N4, owed-varied.ts decode |
| D standing | `refused` boolean beside `disposal` is an implicit machine | rejected: one fact while an Option is Some |
| D standing | profile names repeated in four places | rejected: a type, a list and two id patterns; minor |
| D standing | unlabelled record edits | changed: the orchestrator's, not the builder's (N8) |
| E O1 | Done before the final write; refusals dropped while Disposing | accepted as N2, read the three files |
| E O1 | a reload can come before the final write is issued | rejected: the flush is written in that step |
| E O1 | a second dispose resets `refused` | accepted into N2 |
| E O1 | PAY-05 is caught only through the pin | accepted, falsify run and the 065529e6^ sweep row |
