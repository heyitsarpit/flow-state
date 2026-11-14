# T47 model expectations: sample for a Fable read (2026-11-14)

**Ask:** a different model family (Fable) reads every expectation T47's agents ruled and the model's cells the
pilots reach, against the core Specs, and says for each row whether the expectation follows from the cited rule.
The verdicts and their log are in section 3.

**Read first:** @task.V3.T47 (its comments name the rulings);
code:packages/flow-state-v3/conformance/dsl/lifecycle-rules.ts (Tables A, B and C, with their cited Invariants);
`wiki/specs/core/WriteLanes.spec`, `Actors.spec`, `Restore.spec`, `WriteAhead.spec`.

**How the sample was drawn:** the parts gate's and the held-out gate's 122 scripts (three pilots, usual and stress,
build seeds 1 to 6 and held-out seeds 101 to 112, and the stress app mix) played on production with the model's
tables recorded (`recording` in code:packages/flow-state-v3/conformance/parts/cells.ts). They read 59 of the 315
cells. All 59 are listed (above the 10 percent the Epic asks for), with every agent ruling T47 made.

## 1. Agent-ruled expectations

| #   | Ruling                                                                                         | Where                                    | Rule cited                  |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------- |
| R1  | A boot may restore a disposed identity's unbound Held head and park it, or leave it to the     | 974ad3a1, `dsl/lifecycle-incarnate.ts`,  | Actors R20, Restore R1      |
|     | adopting incarnation (AwaitRestore cause `unbound`, never due)                                 | `dsl/lifecycle-model.ts`                 |                             |
| R2  | An incarnation owes no restore to a Held head whose ending is already parked                   | c27dd707, `dsl/lifecycle-incarnate.ts`   | Restore I6                  |
| R3  | After a reload a local actor (machine not persisted) is gone: its Attempts Gone, endings       | c27dd707, `dsl/lifecycle-capture.ts`     | WriteAhead R3, Restore I6   |
|     | closed, nothing owed; a step where an end is heard may write a record                          | `#localGone`                             | WriteAhead R10, Actors R8   |
| R4  | A `Maybe` ending is owed nothing: a report or decline names the oldest owed ending, else the   | c27dd707, `dsl/lifecycle-lives.ts`,      | WriteLanes I15              |
|     | oldest `Maybe` one, else the newest                                                            | `dsl/lifecycle-owed.ts`                  |                             |
| R4b | A retry or cancel's computed key names that lane even when the model holds none (acted on by   | c27dd707, `dsl/lifecycle-owed.ts`        | WriteLanes R9, I14          |
|     | none), and `Every` only when the key is not computed                                           | (member targets)                         |                             |
| R5  | Forget, then a refused batch, never ends the Attempt: production's red, owed to T19            | `parts/play.ts#partsOwed` (seed 2)       | WriteAhead R13, Actors R20  |
| R6  | A re-send's retry count must be captured, so a boot cannot restore a spent count: owed to T19  | `parts/play.ts#partsOwed` (seed 109)     | WriteAhead R5, R7           |

## 2. Cells the pilots reach

Value is the cell's outcome (A), act (B) or life (C); count is reads over the 122 runs; the example is the first
script that read it (`bun conformance/runner/main.ts parts` plays these ids).

| Cell                                 | Value                       | Count | Example                              |
| ------------------------------------ | --------------------------- | ----- | ------------------------------------ |
| A Send·Unsent·open                   | Move OnWire                 | 956   | PART-sync-usual-1                    |
| A Send·Resending·open                | Move OnWire                 | 16    | PART-transfers-stress-1              |
| A Send·Held·always                   | Refuse WriteLanes I12       | 1     | MIX-sync+transfers+sign-in-stress-109 |
| A EndDefinite·OnWire·running         | Move Gone closed            | 546   | PART-sync-usual-1                    |
| A EndNotSent·Unsent·pendingCancel    | Move Gone closed            | 1     | PART-transfers-stress-110            |
| A EndNotSent·Unsent·storageRefused   | Move Gone closed            | 9     | PART-transfers-stress-5              |
| A EndNotSent·Unsent·disposed         | Move Gone closed            | 4     | MIX-sync+transfers+sign-in-stress-102 |
| A EndUnknown·OnWire·retained         | Move Held                   | 109   | PART-sync-stress-1                   |
| A EndUnknown·OnWire·disposed         | Move Held                   | 158   | PART-sync-usual-1                    |
| A EndUnknown·Interrupted·cancelled   | Move Held                   | 16    | PART-transfers-usual-2               |
| A EndUnknown·Held·owedRestore        | Stay                        | 195   | PART-transfers-usual-2               |
| A EndUnknown·Restoring·headRestored  | Move Held                   | 1     | PART-transfers-stress-107            |
| A Released·Held·awaited              | Move Gone closed            | 14    | PART-transfers-usual-2               |
| A Reload·Unsent·always               | Move Restoring head         | 8     | PART-transfers-stress-4              |
| A Reload·OnWire·always               | Move Held                   | 132   | PART-sync-stress-1                   |
| A Reload·Held·always                 | Stay                        | 352   | PART-sync-usual-1                    |
| A Reload·Restoring·always            | Stay                        | 3     | PART-transfers-stress-107            |
| A Reload·Gone·always                 | Stay                        | 1530  | PART-sync-usual-1                    |
| A BootSettles·Held·always            | Stay                        | 240   | PART-transfers-usual-1               |
| A BootSettles·Restoring·always       | Move Gone closed            | 8     | PART-transfers-stress-4              |
| A BootSettles·Gone·always            | Stay                        | 1777  | PART-sync-usual-1                    |
| A DisposalStarts·Unsent·always       | Stay                        | 4     | MIX-sync+transfers+sign-in-stress-102 |
| A DisposalStarts·OnWire·always       | Stay                        | 158   | PART-sync-usual-1                    |
| A DisposalStarts·Held·always         | Stay                        | 85    | PART-transfers-usual-2               |
| A DisposalStarts·Gone·always         | Stay                        | 715   | PART-sync-usual-1                    |
| A RuntimeDisposed·Held·always        | Stay                        | 243   | PART-sync-usual-1                    |
| A RuntimeDisposed·Gone·always        | Stay                        | 719   | PART-sync-usual-1                    |
| A StepEnds·Unsent·always             | Stay                        | 839   | PART-transfers-usual-1               |
| A StepEnds·Resending·always          | Stay                        | 43    | PART-transfers-stress-1              |
| A StepEnds·OnWire·always             | Stay                        | 9329  | PART-sync-usual-1                    |
| A StepEnds·Held·always               | Stay                        | 4295  | PART-sync-usual-1                    |
| A StepEnds·Gone·always               | Stay                        | 25041 | PART-sync-usual-1                    |
| B Idle·reject·always                 | Admit Mint                  | 979   | PART-sync-usual-1                    |
| B Idle·Cancel·none                   | Quiet WriteLanes I20        | 50    | PART-transfers-usual-4               |
| B Unsent·reject·always               | Admit Decline               | 20    | MIX-sync+transfers+sign-in-stress-1  |
| B Unsent·Cancel·always               | PendingCancel               | 3     | MIX-sync+transfers+sign-in-stress-2  |
| B OnWire·reject·always               | Admit Decline               | 404   | PART-transfers-usual-1               |
| B OnWire·Cancel·always               | Interrupt                   | 16    | PART-transfers-usual-2               |
| B Held·reject·always                 | Admit Decline               | 135   | PART-transfers-stress-1              |
| B Held·Retry·always                  | Resend                      | 16    | PART-transfers-stress-1              |
| B Held·Cancel·always                 | AwaitRelease                | 14    | PART-transfers-usual-2               |
| C Delivered·Owed·running             | Live Delivering, no retry   | 1516  | PART-sync-usual-1                    |
| C Heard·Delivering·always            | Live Closed                 | 1516  | PART-sync-usual-1                    |
| C Parked·Owed·always                 | Live Parked                 | 354   | PART-sync-usual-1                    |
| C Unparked·Parked·always             | Live Owed                   | 4     | MIX-sync+transfers+sign-in-stress-102 |
| C Unparked·ParkedOpen·always         | Live Owed                   | 269   | PART-sync-usual-1                    |
| C Opens·Parked·neverSentInDisposal   | Stay                        | 4     | MIX-sync+transfers+sign-in-stress-102 |
| C Opens·Parked·other                 | Live ParkedOpen             | 269   | PART-sync-usual-1                    |
| C Opens·Closed·always                | Stay                        | 1880  | PART-sync-usual-1                    |
| C Opens·Maybe·always                 | Stay                        | 16    | PART-transfers-stress-2              |
| C StepEnds·Parked·free               | Stay                        | 702   | PART-sync-usual-1                    |
| C StepEnds·Closed·always             | Stay                        | 46626 | PART-sync-usual-1                    |
| C StepEnds·Maybe·always              | Stay                        | 123   | PART-transfers-stress-2              |
| C Reload·Parked·always               | Stay                        | 100   | PART-transfers-usual-1               |
| C Reload·Closed·always               | Stay                        | 2773  | PART-sync-usual-1                    |
| C Reload·Maybe·always                | Stay                        | 14    | PART-transfers-stress-2              |
| C DisposalStarts·Parked·always       | Stay                        | 8     | PART-transfers-usual-4               |
| C DisposalStarts·Closed·always       | Stay                        | 1350  | PART-sync-usual-1                    |
| C DisposalStarts·Maybe·always        | Stay                        | 5     | PART-transfers-stress-2              |

## 3. Fable's read

**Verdict (Fable, 2026-11-14):** 54 of 59 cells and 5 of 7 rulings follow from the Specs. Two contradicted
them; both came from round-14 allowances and are now fixed, each a red trace first. Three more findings are routed.
Fable read the Specs and the model code and ran nothing.

| Row                                 | Fable                           | Lead's decision                                                                     |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| R1 boot-park branch                 | disagrees: Restore R1, Act. I40 | accepted, fixed: the boot owes an unbound head no restore; GEN-pay-search-25 is     |
|                                     |                                 | production's red again, owed to @task.V3.T54 (A2, one `start`); round-14 re-saved   |
| C Opens·Parked·neverSentInDisposal  | disagrees: Actors I38 (CQ6)     | accepted, fixed: the cell goes ParkedOpen, guard removed; production passes         |
| A EndDefinite·Interrupted (outside) | disagrees: WriteLanes R14 Q2 B  | accepted, fixed: Gone closed (settledInDisposal when disposing); two traces         |
| R2 (`parked` misses a Kept row)     | agrees, too narrow              | routed to @task.V3.T52: no pilot reaches a Kept life; Fable's case 3               |
| R4 and the four `Maybe` cells       | unclear (permissive)            | noted: a stated bound (WriteAhead I21, I22), never a false fail; T52 to cite them   |
| R6 (kill before invoke)             | agrees, edge                    | routed to @task.V3.T19 with its owed row (seed 109)                                 |
| Member order in one turn            | finding                         | routed to @task.V3.T52: cancel then commit on a Held lane; `Resend` drops a release |
| The other 54 cells and 4 rulings    | agrees                          | accepted                                                                            |

## 4. Reviewer sidecar log (diff of the fixes, 2026-11-14)

One Haiku reviewer (effort high) read the diff against "test the spec, not the code".

| #   | Item                                                     | Result                                                                     |
| --- | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1-3 | The three model changes follow from their cited lines    | accepted; the refusal's cite (Restore I6, WriteLanes I15) added            |
| 3   | `Interrupted` phase doc stale                            | accepted, fixed                                                            |
| 4   | Round-14 signature of GEN-pay-search-25 not re-run       | rejected: the lead ran `regressions` on round-14, 8/8 fail as saved        |
| 6   | Seed 109 was seen before the held-out gate               | noted: found by step 3's held-out run, kept as an owed row                 |
| 7   | LANE-11's exemption dropped without a cite               | rejected: WriteLanes I4 now derives from R3 and R4, so LANE-11 reaches P17 |
| 8   | `gates.json` revisions mixed                             | rejected for this step: every gate is re-run before review                 |
