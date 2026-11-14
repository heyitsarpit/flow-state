# T52 build review: step-1 fixes and step 2 so far (2026-11-14)

**Verdict: go on.** No finding blocks under the stopping rule. B1 and B4 are real fixes. The gates match the
build log, apart from one red fewer in the full vitest run. D14 was right: both reds were the suite's. But the
build log triages three of the five open reds wrongly. Cells-stress-1, -9 and -8 are production's known
retry-count bug (@task.V3.T19), not "one retry of three" and not the `Held·Cancel` cell. Pay-stress-12 and
cells-stress-11 are false reds of the selection oracle, which assumes a capture that never landed. Three
step-1 findings have no red check (Q3, Q33, Q34). D13 is recorded only in prose. The owed rows can hide a
second failure in 39 of Pay's and Cells' stress runs. Reviewed at fcfc330d and 0552b546, range f748d2f2..0552b546
(8f3aa448 included). No code was changed.

**Read first:** code:wiki/plans/flow/references/proposals/t52-build-log-2026-11-14.md,
code:wiki/plans/flow/references/proposals/t52-step1-review-2026-11-14.md, @spec.WriteLanes R14 (retryable).

## Triage of the five open reds (replayed and shrunk at fcfc330d)

- **cells-stress-1 and -9: production is wrong, RETRY_COUNT (@task.V3.T19).** The minimal run is: dispose, answer
  pay ok, then five reloads with acks. `place` is sent once and retried three times. Then a fourth `PlaceUnsure[0]`
  passes `retryable({ times: 3 })`. Owe it in a row like the transfers rows.
- **cells-stress-8: production is wrong, the same class on `void` (@task.V3.T19).** The minimal run is: pay ok,
  Leave, three reloads, end of case. Production ran `VoidUnsure[0]` a fourth time. The model takes `[1]` (cancel),
  so `Await Released` is unmet (I12).
- **pay-stress-12: the suite is wrong (T52 builder, `turn/anchor.ts`).** The minimal run is two pays, then five
  reloads with no ack after step 8. Storage last landed PAYING, yet after a kill the oracle allows only UNSURE.
- **cells-stress-11: the suite is wrong (T52 builder).** The minimal run is: ensure, PayRequested, reload, twice,
  then PayRequested. Nothing ever landed, yet after the second kill the oracle allows only PAYING.

- The sidecar claim behind cells-stress-8 is **rejected**. It said the selection oracle marks a send step's cancel
  current, which would break Turn R20. The shrunk run has no cancel member and no `AbortPay`. The red's cancel is
  the model's own row choice: retryable guards are left to the lane oracles (D14), so the reported Invariant is
  I12 rather than the guard. Turn R20 is not reached.
- The RETRY_COUNT rows will hold by `lane-queue` and `WriteLanes I12`, the same as `PART-transfers-stress-3`.

## Fix range (B1 to B4, M1 to M5, routed items)

- **B1 holds, and the clash is not hidden.** Two parts with one machine id can no longer share a mix: `mixOf`
  calls `oneMachineEach`, and `referenceFor`, `handlersFor` and `rowsFor` go through `distinct`
  (`parts/generate.ts:362`, `fixtures/fixture.ts:153-163`). The refusal tests (`parts/reference.test.ts:146-152`)
  were red when they were added. D12 only keeps Pay out of the mix, so nothing runs Pay beside the other pilots.
  That is scope, not a hidden clash. Left over: `actorView` (`dsl/actor.ts:68`) does not check that its fixture
  is in the case, so a Cells actor in a Pay-only case would use Pay's table. No such case exists yet.
- **B4 holds.** A golden rebuilt from the derived reference cannot pass. `pay-golden.ts` hashes to the pin
  (`parts/golden.test.ts:40`, `89041be5…`), byte for byte the hand `fixtures/pay.ts` at f748d2f2. Any rebuild or
  edit changes the bytes. Its import closure reaches no `src/`, `parts/` or `fixtures/pay/`. Limit: both sides
  share `classifyWith`, `Empty` and the row Schemas from `rowFor` (`parts/reference.ts:3-11`, `pay-golden.ts:5-18`).
  A bug there moves both sides together. Folds are not compared, by D6.
- **B2 and B3 are built as reds only.** Q27b's reds are red (`citations.test.ts`). But Q27b names the form
  "WriteLanes R15 (retired)", while the test accepts only "Retired WriteLanes R15" (`citations.test.ts:21, 63`).
  The regex also misses a second id in a list ("WriteLanes R14, R15"; build-log resume 4 knows this). Q24's red
  covers Kept and Refused (`dsl/lifecycle.test.ts:186-194`), not Owed outside disposal or Delivering.
- **No red check for M1, M3 or Q3.** Q33 (unfolded hand guards) and Q34 (a Task cannot close while rows name it)
  name `coverage.test.ts`, which does not exist. Q3's planted production classify is absent. The Epic says a
  review finding lands as a failing check before its fix.
- **Routed items:** the `pending.test.ts` flips, `LOST` import and Q19 list are done. `model-mutation.test.ts:42`
  ("the field gate passes") is still green and contradicts D5; it goes with Q20.

## D13 and D14

- **D14: both reds were the suite's.** Production's own reports settle it. `RetryNow`'s turn reports a `pay`
  commit keyed `{ intentId: "pi1" }` (PART-pay-usual-1, -2, -4), so WriteLanes I1 holds and a `null` key was the
  fold's. `on.Leave[0]` runs only when `authorized` is true, and the `Confirmed` alternatives set it
  (`fixtures/pay/machine.ts:233-251`), so Turn I2 holds and the fold lost the field. Planting a fold that reads
  only the first select did not turn PART-pay-usual-1 to 3 red. The unit check at `parts/reference.test.ts:91`
  is the only guard.
- **D14's limits break its own rule.** An unknown key is a bare `null` that consumers read as `Some(null)`
  (`parts/derived-folds.ts:310`; `dsl/lifecycle-owed.ts:128`). An unknown delay becomes `0`
  (`derived-folds.ts:367-372`), which `turn/schedules.ts:154` reads as due now. That is a false Turn I12 red, never a
  silent pass, but it is not "computes nothing". No count shows how many guards a run left undecided.
- **D13 hides no Spec rule, but breaks the routed-gap rule.** Cancel of a call on the wire still runs on
  production: PAY-12/cancel-on-wire passes, and transfers' `abandon` is generated. But the belief's flaw
  (`parts/belief.ts:118-122` frees a lane on any cancel) is written down only in the requirements prose, with no
  owed row, limit or pending check and no owner. The move from PAYING to UNSURE also dropped the only run of a T19
  bug: PART-cells-stress-105, "lane admits the next commit" (I8). Its root cause stays owed through
  `PART-transfers-stress-5-shrunk` (Actors I38), but nothing checks the I8 symptom now.

## The T54 owed class

The class is a real owed row. A green run fails it (`limits.ts` `verdictOfLimit` gives `held: false` on Pass),
and cells-stress-8's full run shows the doubled ending: `att-8001-13` ends unknown `Restored` and is delivered
`PayUnsure` twice. But the hold reads only the check and Invariant, and a run stops at its first failure
(`parts/play.ts:139-147`). So the rows on 22 Pay and 17 Cells stress seeds excuse any I15 failure, and nothing
after it is judged. RETRY_COUNT is already hidden this way in Pay's stress runs. This is build-log resume 3,
reviewer item 9.

## Gates at fcfc330d (re-run on a scratch copy)

| Gate | Build log | Here |
| --- | --- | --- |
| suite round-14, production | 124/124, 78/78 | 124/124, 78/78 |
| falsify round-14, production | 154/154 (4/4 probes), 18/18 | 154/154 (4/4), 18/18 |
| catch matrices | unchanged | byte-equal to f748d2f2 |
| coverage | — | 75 of 211, 0 gaps |
| vitest, `packages/flow-state-v3` | 8 failed, 229 passed | 7 failed, 230 passed |

Falsify on round-14 printed one `BAD coverage` line. The cause was the scratch copy: `wk` could not resolve
`codebases/`. Coverage passed alone once `codebases/` was linked. The seven failing tests are Q20 (3), Q27b (2),
Q24 (1) and `play.test.ts` on cells-stress-1. Which of the builder's eight failures is missing here is unknown.

## Routed and noted

For the T52 builder unless another owner is named:

- Re-triage cells-1, -9 and -8 as RETRY_COUNT owed rows. Fix the oracle behind pay-12 and cells-11 (resume 1).
- Add the Q33, Q34 and Q3 reds before building them. Widen Q24's red to Owed and Delivering.
- Q27b: one retired form in both the requirement and the test, and a regex for compound cites (resume 4).
- Owe D13 as a generator-limit row with an owner. Check whether the belief's on-wire cancel also affects
  transfers (a sidecar's claim; not run).
- An owed check for the cells-105 class (I8 after a refused batch): @task.V3.T19.
- An owed row holds only by its own failure, and the run is judged after it (resume 3).
- Unknown keys and delays as `Option` in `Folds`, and a count of undecided guards per run.
- `coreOutcome` maps a run with no verdict to SURVIVED, against its doc (`runner/mutate.ts:70-90`). The core
  control passes over zero cases (Q22, Q29).
- Tie `actorView` to the case's fixtures.
- Noted for the generator's owner: stress faults hit only the first ok or fail answer, and `Die` is never
  generated (`parts/generate.ts:128-146`).

## Standing angles

No `src/` change and no throw outside a defect: `SharedMachineId` and `PolicyMismatch` are documented defects. No
Effect feature is re-created. `fixture.ts:154`'s duplicate finder and `derived-folds.ts:87`'s `Object.entries`
filter are minor. No expected value is copied from round-14. `rows.test.ts` comparing the golden with round-14's
compiled Pay is D15 and was there before. Both P4.task changes carry `Edit (agent: …)` lines. The 04:19 comment and
the build log quote gate counts, which the notes rule discourages. The build log has 39 lines over 120
characters. No new outside import: fixtures import only `src/index.ts`, and `golden.test.ts` reads the golden's own
source. Nothing apart from the logged `sed -i` looks shell-written. `UNKNOWN` (`derived-folds.ts:35-38`) is a
shape sentinel that a real JSON value could collide with.

## What the builder's checks missed, and why

The open reds were triaged from their first failing line. None was shrunk, so the retry count was read off the
whole script, and the shape of the selection oracle's red was missed. The cause is a weak check: triage without a
minimal run. Separately, three step-1 findings became requirements without reds. The cause is gathering: the fix
commit counted reds per Q, not per finding.

## Missed requirements (found only by the blind sidecar)

- `coreOutcome` treats a run with no verdict as SURVIVED, so triage could excuse it (Q22's scope).
- `referenceOf` keeps only the first `idle` and `retryable` guard of an alternative, and drops their key slots
  (`parts/reference.ts:57-59, 102-107`). The golden agrees today, so this is noted for the next part with two.
- Pay's commits run `classify` only for `IntentBusy` and `OrderExists`, and `voidAuthorization` never runs it
  (`fixtures/pay/contracts.ts:168, 193, 207`). This is consistent today, but the only proof is Q3, which is unbuilt.

## Sidecar log

Five Haiku sidecars (effort high, read-only): blind, fix-range, derived folds, generator limits, standing angles.
The lead replayed and shrank every red, re-ran the gates and read each cited line.

| Sidecar | Item | Result |
| --- | --- | --- |
| blind | 1, 2 golden frozen; shared helpers | accepted (hash re-read; imports verified) |
| blind | 3 folds not compared | changed: settled by D6, noted |
| blind | 4 `releasesOnLeave: []`, first idle and retryable only | accepted as a missed requirement (noted) |
| blind | 5 probes, delay 0, classify `{}` labels | changed: delay and key verified; probe blind spots noted |
| blind | 6 classify not via `served` | accepted (contracts read), Q3 unbuilt |
| blind | 7 one machine id | accepted |
| blind | 8 fault breadth, `Die`, belief `mayHaveApplied` | noted for the generator's owner |
| blind | 9 owed hold by check only; one verdict per run | accepted (`play.ts:139-147`) |
| blind | 9 seeds 7-11 outside the gate | noted: the owed test judges them |
| blind | 10 empty-input gates; `coreOutcome` empty → SURVIVED | accepted (`mutate.ts:70-90` read) |
| blind | 11 field gate ignores owes | rejected: Q20's intended red state |
| blind | 12 core mutants drop non-unique lines | noted, earlier than T52 |
| blind | 13 PRODUCTION_ONLY on round-14 | rejected: earlier than T52 (D1) |
| fix-range | 1, 3 B2 not applied; retired form mismatch | accepted (`citations.test.ts:21, 63`) |
| fix-range | 2 compound-cite regex | accepted, known (resume 4) |
| fix-range | 4 run-time cites partly unwalked; `.md` skipped | noted |
| fix-range | 5 no check for round-14-only LANE cases | noted, with Q27b |
| fix-range | 6 Q24 narrower | accepted |
| fix-range | 7 Q23 label parsing live | accepted, deferred by the list |
| fix-range | 8 `model-mutation.test.ts:42` still green | accepted |
| fix-range | 9 no red for M1, M3, Q3 | accepted (grep at fcfc330d) |
| fix-range | 10, 11 B1, B4 hold; `actorView` gap | accepted (code read) |
| fix-range | 12 routed list | accepted |
| folds | 1 unknown key `null`, delay `0`, no count | accepted (lines read) |
| folds | 2 probe blind spots (throws, first-probe keys) | noted: no Pay closure reaches them |
| folds | 3 key falls back to every select silently | noted |
| folds | 4 both D14 reds the suite's | accepted, confirmed from production's reports |
| folds | 4 caveat: update fold unchanged after 0b45f63d | accepted: the fix was in 0b45f63d itself |
| folds | 5 no throw, no Effect re-creation | accepted |
| generator | 1, 2 offers; on-wire cancel coverage | accepted (PAY-12/cancel-on-wire passes on production) |
| generator | 3 D13 only in prose | accepted |
| generator | 4 belief flaw affects transfers | noted as a claim, not run |
| generator | 5 no Pay cross-machine run | accepted, D12 scope |
| generator | 6 cells-105 (I8) row dropped | changed: root cause still owed via transfers-stress-5 |
| standing | 1 minor Effect helpers | accepted, minor |
| standing | 2 throws are defects | accepted |
| standing | 3 no round-14 copies | accepted |
| standing | 4 Approach edit unlabelled | rejected: the 04:19 comment's Edit line names it |
| standing | 4 gate counts in notes; long lines | accepted, minor |
| standing | 5, 6 imports and shell edits | accepted |
| standing | 7 `UNKNOWN` sentinel, doc comments on locals | accepted, minor |
| build log | cells-stress-8: selection oracle breaks Turn R20 | rejected: the shrunk run has no cancel |
