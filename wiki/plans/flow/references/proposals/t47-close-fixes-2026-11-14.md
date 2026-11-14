# T47 close-review fixes (2026-11-14)

**Result:** the open close-review items are fixed (findings 4, 6, 8 to 12, the T54 and T17 notes), each as a red
check first. Widening the stress profile found two classes of red: production's retry-count bug, owed to T19, and
one selection-oracle bug, fixed. The model's expectations had a Fable read; its log is in
code:wiki/plans/flow/references/proposals/t47-expectations-sample.md.

**Read first:** code:wiki/plans/flow/references/proposals/t47-close-review-2026-11-12.md; @task.V3.T47.

## 1. First-contact reds of the wider stress profile

Usual went from 28 to 40 moves and stress from 40 to 100. Stress now also draws applied answers whose response is
lost, failures that applied, and requests never answered (catalogue section 5). Each red was shrunk and replayed.

| Red                                                       | Wrong side                                                       | Now                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| `lane-queue` WriteLanes I12: a Held head got Send at ack, | production: the re-send's retryCount is not re-captured, so a    | five generated ids in `partsOwed` and   |
| after Resend, ack, reload, Resend (five scripts)          | spent `retryable({ times: 1 })` passes again (WriteAhead R13,    | `PART-transfers-stress-111-shrunk`,     |
|                                                           | WriteLanes I7)                                                   | owed to @task.V3.T19                    |
| `disposal` Actors I38: forget, then a refused batch, then | production: the forgotten actor's unacknowledged Attempt is never | `PART-transfers-stress-5-shrunk`, owed  |
| Runtime disposal finds the head Unsent                    | ended (WriteAhead R13, Actors R21, WriteLanes I27)                | to @task.V3.T19                         |
| `selection` Turn I2 at an ensure: a local actor ensured   | the suite: selection kept the old leaf, but a non-persisted       | fixed: unknown leaf after a whole grace |
| after its grace runs from its initial leaf                | identity starts fresh (Actors R9)                                 | free; within the grace it keeps its own |

The two owed rows of 2026-11-12 (seeds 2 and 109) named scripts the new profile no longer draws; their bugs are the
first two rows above. Part regressions run on production only (Conformance R22): the round-14 `regressions` mode
and the hand generator's set skip them.

## 2. Reviewer sidecar log (oracle, generator and owed rows, commit 8976113f)

One Haiku reviewer (effort high), one rule: a change must not excuse a wrong runtime.

| #     | Item                                                                     | Result                                                              |
| ----- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1     | A stale `mayHaveEnded` after a forget hides a fresh restart within grace | accepted, fixed (5950a0ed): the rule reads time free since last use |
| 2     | Aging ignores work in flight (Actors R7)                                 | rejected: R9 starts a fresh one even while an older is kept by work |
| 3     | Cites R6, where the text is R9                                           | accepted, fixed                                                     |
| 5     | `returned` skipped for a machine with no initial                         | noted: every fixture has one                                        |
| 6, 7  | Owed rows match their failures; a pass turns them red                    | confirmed; the lead re-ran both gates                               |
| 9, 10 | Owed held-out ids are played only by the held-out gate                   | noted: `play.test.ts` replays every owed row                        |
| 13    | `gates.json` stale                                                       | rejected for this step: every gate is re-run before review          |
| 15    | Non-owed kept part scripts skip the skipped-answer rule                  | noted: both kept part scripts are owed today                        |

## 3. Core-mutant triage (orchestrator ruling, 2026-11-14)

**Result:** of the 38 core mutants no named oracle killed at 1881595c, 4 are equivalent and 34 are owed checks, each
owed by the Task whose Spec rule it hits. The rows live in code:packages/flow-state-v3/conformance/core-mutants-triage.ts;
the core-mutant gate now fails on a mutant that is neither killed nor triaged, and on a row whose mutant is killed.
"Case only" means a case fails by its state or case expectation or a defect, never by a named oracle.

| Mutant (file:line, change)                                    | Verdict     | Owner | Rule           | Shown today by       |
| ------------------------------------------------------------- | ----------- | ----- | -------------- | -------------------- |
| answers.ts:36 `incarnation !== undefined \|\|`                | owed        | T54   | Reads I9       | PAY-03, case only    |
| answers.ts:36 `incarnation.id === read.incarnation`           | owed        | T54   | Reads I9       | PAY-03, case only    |
| answers.ts:36 `&&`                                            | equivalent  |       |                | reads die with their incarnation |
| answers.ts:46 channel `!==`                                   | owed        | T54   | Reads R9       | PAY-03, case only    |
| answers.ts:62 `read === undefined`                            | owed        | T54   | WriteLanes R10 | PAY-01, defect       |
| answers.ts:70 Defect issue route `!==`                        | owed        | T54   | WriteLanes R2  | PAY-12, case only    |
| answers.ts:77 Silent timers `&& !==`                          | owed        | T54   | WriteAhead R12 | none: two batches out |
| answers.ts:77 Silent timers `\|\| ===`                        | owed        | T54   | WriteAhead R12 | none                 |
| disposal.ts:34 Schedule `&&` Grace                            | owed        | T55   | Actors R22     | none                 |
| evidence-of.ts:84 Held `!==`                                  | owed        | T18   | WriteLanes R8  | none: InFlight evidence |
| incarnations.ts:58 Schedule `&& !==`                          | owed        | T18   | Turn R14       | PAY-21, defect       |
| incarnations.ts:58 Schedule `\|\| ===`                        | owed        | T55   | Actors R8      | PAY-21, defect       |
| incarnations.ts:192 `\|\|` due                                | owed        | T18   | Turn I32       | none: host-driver only |
| incarnations.ts:262 dispose keeps own reads                   | owed        | T54   | Reads R6       | none                 |
| incarnations.ts:298 mail `!==`                                | equivalent  |       |                | graces run on an empty mailbox |
| incarnations.ts:301 Grace `&& !==`                            | owed        | T55   | Actors I10     | PAY-08, defect       |
| incarnations.ts:301 Grace `\|\| ===`                          | owed        | T55   | Actors R8      | none                 |
| incarnations.ts:304 `busy \|\| timing`                        | owed        | T55   | Actors R8      | none: no step in the grace |
| incarnations.ts:305 Grace `&& !==`                            | owed        | T55   | Actors I10     | PAY-08, defect       |
| incarnations.ts:305 Grace `\|\| ===`                          | owed        | T55   | Turn R14       | PAY-08, defect       |
| lane-moves.ts:77 `lane === undefined`                         | owed        | T54   | WriteLanes R7  | PAY-01, defect       |
| lane-moves.ts:85 `lane !== undefined`                         | owed        | T54   | WriteLanes R8  | PAY-01, defect       |
| lane-moves.ts:303 Hold `\|\|`                                 | owed        | T54   | WriteAhead T18 | none; the unmutated line breaks T18 |
| lane-moves.ts:359 Withdrawing `!==`                           | owed        | T18   | WriteLanes R14 | LANE-08, case only   |
| lanes.ts:58 `lane !== undefined`                              | owed        | T18   | WriteLanes R14 | PAY-15, defect       |
| lanes.ts:121 `&&` encodes                                     | owed        | T18   | WriteLanes R12 | none: non-key field  |
| lanes.ts:127 persist `!== true`                               | owed        | T18   | WriteLanes R12 | none: no Runtime without persistence |
| lanes.ts:170 read cancel `\|\|`                               | owed        | T54   | WriteLanes R17 | none                 |
| lanes.ts:271 `lane !== undefined`                             | owed        | T54   | Actors R15     | DLV-04, defect       |
| persist.ts:107 `&&`                                           | owed        | T54   | WriteAhead I3  | none                 |
| record.ts:270 `\|\|`                                          | owed        | T54   | Restore I1     | none                 |
| serve.ts:112 root `===`                                       | owed        | T18   | Turn I26       | none                 |
| serve.ts:277 drain `\|\|`                                     | owed        | T9    | WriteAhead R10 | none: no turn storm  |
| serve.ts:277 drain `<=`                                       | equivalent  |       |                | slices decide when, never what |
| step.ts:76 send restores `!==`                                | owed        | T9    | Actors R16     | none                 |
| step.ts:76 `\|\|`                                             | equivalent  |       |                | ensure with no use is a no-op |
| turn.ts:248 delay `> 0`                                       | owed        | T18   | Turn T6        | none; needs a ruling |
| tx.ts:123 persisted `\|\|`                                    | owed        | T54   | WriteAhead R3  | none                 |

Two rows go beyond a missing check. `lane-moves.ts:303`: the unmutated code leaves a Held head's saved `inFlight`
true after a StillUnknown, against WriteAhead T18, so production is the wrong side there. `turn.ts:248`: Turn T6
refuses a zero-length schedule, but production arms a computed 0 ms delay; the user rules which reading stands.

## 4. Fable's T52 items as owed checks (orchestrator ruling, 2026-11-14)

- `parked` misses a Kept row: a pending trace (`pendingTraces` in
  code:packages/flow-state-v3/conformance/dsl/lifecycle-actor-lives.traces.ts), red today by an AwaitRestore the
  model owes; the lifecycle test fails once it holds.
- Member order in one turn: a WriteLanes I10 remainder owed to T52 (the expected result needs the Spec's ruling on
  when a cancelled Held head is released).
- `Maybe`: WriteAhead I21 and I22 move from T54's row to a T52 row in `not-yet.ts`.

## 5. Triage sidecar log

Four Haiku sidecars (effort high), red triage, one file group each; each argued equivalence or a broken rule from
the code and the Specs, ran nothing. The lead read the source lines behind every equivalence and the conflicts.

| Group | Items                                    | Result                                                                    |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------- |
| A     | answers.ts, disposal.ts, evidence-of.ts  | accepted; answers.ts:36 `&&` equivalence checked at incarnations.ts:242, 262 |
| B     | incarnations.ts                          | accepted; the :298 equivalence checked at step.ts:94-95 (graces after drain) |
| C     | lane-moves.ts, lanes.ts, persist.ts      | accepted; :303 changed to an owed check with production as the wrong side  |
| D     | record.ts, serve.ts, step.ts, turn.ts, tx.ts | accepted, but serve.ts:277 `\|\|` changed: not a conflict, it breaks R10's backlog step; turn.ts:248 kept as a ruling |

Side findings the sidecars raised, not triaged here: production's lane record still holds `mayHaveApplied`
(WriteAhead R5) and a settled answer while Cancelling becomes unknown Cancelled (WriteLanes I41); both are T54's
rewrite.
