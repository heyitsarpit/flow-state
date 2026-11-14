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
