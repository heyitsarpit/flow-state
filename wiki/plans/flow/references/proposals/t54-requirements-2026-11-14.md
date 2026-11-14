# T54 requirements (2026-11-14)

**Result:** T54 has 33 requirements: A-1 to A-19 from the brief, three for production's self-proof (S-1 to S-3),
three owed bugs (O-1 to O-3), and eight more that the acceptance, the Approach and the owned Invariants need (X-1 to
X-8). Each is a check that fails today, or a check green today whose wrong runtime is red. Every acceptance item,
Approach item and gap comment of @task.V3.T54 maps to one or more of them (the table at the end). Proposed until
step 1's review confirms the mapping. Step 1's review
(code:wiki/plans/flow/references/proposals/t54-step1-review-2026-11-14.md) is applied: F1 in A-2, F2 in A-7, F3
and the S-2 scope in the rulings below.

Edit (agent: T54 building lead, @task.V3.T54, 2026-11-14): this file. Why: step 1, requirements first (Epic V3,
Testing). Reverse: delete the file.

**Read first:** `wk brief @task.V3.T54` (the comment "Requirements (from core-task-briefs-2026-11-12.md)" holds A-1
to A-19 in full; they are cited here, not restated),
code:wiki/plans/flow/references/proposals/fable-architecture-consult-3-2026-11-12.md (C2, C3, C9, Part 2),
code:wiki/plans/flow/references/proposals/t54-build-log-2026-11-14.md (sidecar log, resume list).

Columns: **Red today** says which of the two first states holds (check red, or check green with its wrong runtime
red). **Step** is the step that turns it green. "Harden" lists the adversary's extra inputs folded into the check,
each a way a wrong build passes the brief's check as written.

## The brief's requirements

| Id   | Source rule                                     | Check (where)                                 | Red today          | Step |
| ---- | ----------------------------------------------- | --------------------------------------------- | ------------------ | ---- |
| A-1  | WriteLanes I31, R10; WriteLanes T24             | new case, Pay lane refused twice twice        | check red          | A1   |
| A-2  | Actors I41, R8; WriteLanes `suspend`; Actors T22 | new case, laneless ending queued at disposal | check red          | A1   |
| A-3  | Actors T23, R22; Restore I1, R1                 | new case, Recapturing head at disposal        | check red          | A2   |
| A-4  | Actors R22, I29; Actors T23                     | new case, never-sent head at disposal         | check red          | A3   |
| A-5  | Actors I24, R15; WriteLanes `start`             | new case, Kept row across two Starts          | check red          | A1   |
| A-6  | WriteLanes I32, R10; WriteLanes T25             | new case, cancel between settle and turn      | check red          | A1   |
| A-7  | WriteLanes I33, R6; WriteLanes T26              | new case, Retrying and on-try rows            | wrong runtime red  | A1   |
| A-8  | WriteLanes I29, I30, I34; WriteLanes T23        | oracle `owed-rows` (new), every part          | check red (no oracle) | A1 |
| A-9  | WriteLanes I27                                  | oracle `delivered-once` extended to declines  | check red          | A1   |
| A-10 | WriteLanes I35, R5; WriteLanes T27              | new case, ids with and without other mints    | check red          | A1   |
| A-11 | WriteLanes I36, R5                              | stored flag equals `sentBefore`, every step   | wrong runtime red  | A1   |
| A-12 | Actors I40, R10, I14; Restore R1, R3; Actors T21 | new case over reload, return, adoption       | check red          | A2   |
| A-13 | Codec I7, R5; WriteAhead I20, R5; WriteLanes I39 | store contents after each step, every part   | check red          | A3   |
| A-14 | WriteAhead I21, R10                             | reload equivalence at every crash point       | wrong runtime red  | A3   |
| A-15 | WriteAhead I22, I23, R12; WriteAhead T16        | drop each batch whole, boot, A-9's count      | wrong runtime red  | A3   |
| A-16 | Turn I36, R26; Turn T24                         | report stream at A3 byte-equal after A4       | owed to A3's record | A4  |
| A-17 | WriteLanes I37; WriteLanes T28                  | scan of reports, snapshots, rows, every part  | wrong runtime red  | A1   |
| A-18 | WriteLanes I28, R5; WriteLanes T22              | host test of seed width; two boots' ids       | check red          | A1   |
| A-19 | WriteLanes `algorithm` `cell`                   | table test, one row per existing cell         | wrong runtimes red | A1   |

Harden, from the adversary sidecar (each lands as an assertion of the line's check):

- A-1: reload between the two keeps and count hearings after the next Start; one of the two rows is heard (a
  hearing closes one row, WriteLanes `close`) and the other is still heard after (an id minted from actor and lane
  would close both). Not by cancel: a cancel closes every Kept row of the lane.
- A-2: exactly one hearing over the whole run, with a reload between disposal and the next Start (Actors I40: a boot
  delivers nothing; `delivered-once` leaves a Waiting row unjudged at case end). Over all three suspend moments
  (Actors I41, T22; step-1 review F1): an incarnation's end, `disposeActor` and Runtime disposal. A decline's
  ending owed to the identity goes Waiting and is heard exactly once; a read's ending owed to the gone incarnation
  alone gives exactly one Recorded. Today `serve.ts:267-272` drops both. The mail gets there through X-4's backlog
  or a turn that declines and ends its actor. The wrong runtime is applied at an incarnation's end.
- A-3: after the boot the head reads Held; an `ensure` then hears `unknown { Restored }` (Actors R10) and a `retry`
  gives one invocation with `retryCount` n+1, n the saved value (WriteLanes I26).
- A-4: given the final write lands, count every ending of the head after the reload (no extra
  `unknown { Restored }`), and no `lane/` key stays.
- A-5: count refusals per row per Start from the guard's calls (Actors R15, WriteLanes I31), not the final state.
- A-6: a commit queued behind the settling head is promoted in the settlement step, also when the success's turn is
  refused (WriteLanes R10 "never stops a promotion"); its invocation still waits for its turn and storage.
- A-7: every blocking assertion on an Idle lane (under reject an InFlight or Held lane declines anyway); Kept on lane
  X and a commit on lane Y of one identity; a laneless Kept row blocks no key; a commit admitted while a Start's try
  is queued is not declined (WriteLanes R6). A Rejected decline from the lane table (step-1 review F2;
  `lane-moves.ts:207-218` gives it a lane today): refuse its turn twice, let the head resolve, then commit on the
  key, which mints (WriteLanes R10: a declined commit has no Attempt and no lane). The opposite case: a
  never-sent Attempt's NotSent row keeps its lane and, when Kept, blocks (born laneless while Open today,
  `lane-moves.ts:103-107`).
- A-8: the `owed-rows` oracle reads the ledger and the mail at each step's end (a waker is mail state, which no
  report shows), not only the reports; a Kept row closed by cancel (`letGo`) and by `forget` each gives one
  Recorded; suspend then start with a Queued row hears it once (no second mail reference).
- A-9: two identical declines in one step get two endings. Red today through F1's drop paths and the oracle's
  missing decline count (`delivered-once.ts:42-54`), not through a decline lacking an ending.
- A-8 has a behaviour red: `park` emits Ended on every re-park, Retrying and Kept rows included (`persist.ts:178`,
  `disposal.ts:27`, `serve.ts:271`).
- A-10: an `owe` (an ending) minted between the two commits, not only timers and tickets.
- A-11: the table written from WriteLanes I36's text (Held, Recapturing, Resending, `retryCount > 0`), not from
  `sentBefore` itself. Core mutants that edit a stored `mayHaveApplied` are rewritten against `sentBefore` in A1,
  since a mutant A1 breaks is not a kill (step-1 review, Item 1).
- A-12 (step-1 review, Item 2): assert Restore R3's order, owed order across lanes, then each Held head's
  unknown { Restored } in lane-id order; equality among the three paths alone passes by construction.
- A-6's promotion line cannot be reached under reject (`CommitReject` declines beside every head phase,
  `cells.ts:180-191`): owed to T18 (latest, serialize).
- A-12: compare the sequence of delivered endings (Actors T21), not whole reports: a return adds an `onContext` wave,
  an adoption runs creation, and incarnation ids are new each time. Lanes created in reverse lane-id order, rows
  interleaved across two lanes; at the boot's end no ending is in a mailbox (read from the World, not reports).
- A-13: set equality over every key (no stray `kept/` or `parked/`), a `notSent` row's `channel` and each kept row's
  mark checked; compared per landed batch against the step that issued it (the interval and refusals move landing).
- A-14: crash points after every Store write, against the A0 baseline plus X-1's named entries (A2's boot fixes are
  named entries, not regressions).
- A-15: drop points from the store's own issue log; after the boot every commit in the last landed state ends
  exactly once, and a row heard in the dropped batch is heard again exactly once (WriteAhead I22); the splitting
  mutant needs a part with a two-record batch.
- A-16: one whole-Runtime stream in act order, compared byte for byte, never sorted or grouped.
- A-17: scan for every minted row id, lane id, `lane/`, `actor/` and `owed/` key, ticket and timer, and for the
  Delivery tags Queued, Retrying, Waiting and Kept by name; and the positive rule: a report names an ending by its
  Attempt id, or by actor, operation and order (WriteLanes I37).
- A-18: the value reaching `Env.seed` is checked, not the entropy call; two boots with the same world seed still get
  their own seeds and mint no equal Attempt id.
- A-19: the product of today's phases and cues, impossible pairs a defect, endings and reports per cell; T18's pairs
  (Cancelling answered, cancel with a handle, release on leave) listed as owed; the `keptOn` decline through
  `commit`, not `cell`.

## Production's self-proof (added by the user, 2026-11-14)

Source: code:wiki/plans/flow/references/proposals/suite-leverage-survey-2026-11-14.md item 5.

| Id  | Requirement                                                     | Check                                | Red today | Step  |
| --- | --------------------------------------------------------------- | ------------------------------------ | --------- | ----- |
| S-1 | every behaviour the prototype's liar mutants plant that T54's code holds (the owed ledger, lanes, records, reports) has a production mutant, red under the liar gate with its own reports swapped out | `liar --runtime production` lists each as killed | missing mutants | A0, then each step |
| S-2 | T54's 11 owed core-mutant gaps are killed by a named check, and their triage rows go | `mutate` gate, `core-mutants-triage.ts` | 11 owed | the step that touches the line |
| S-3 | the coverage gate counts production's mutants: an Invariant proved by a production mutant is not "Unproven" | `coverage` gate, a planted Invariant proved only by a production mutant | check red | A0 |

S-1's scope is T54's code only, and S-2's is T54's 11 of the 29; the rest stay with their owners (orchestrator,
2026-11-14). S-2 is green today because `mutate.ts:192-195` excuses owed rows; its red form is "red with its triage
row dropped".

## Owed to T54

| Id  | Item                                                                                  | Rows today                      | Step |
| --- | ------------------------------------------------------------------------------------- | ------------------------------- | ---- |
| O-1 | a boot restores and parks a disposed identity's unbound Held head (Restore R1, Actors I40, I29) | `GEN-pay-search-25-shrunk` (`parts/owed.ts` regressionsOwed), 85 stress rows `UNBOUND_RESTORE` (`parts/owed.ts`), crash `DISP-02@6`, `DISP-06@5` (`runner/crash-owed.ts`) | A2 |
| O-2 | a StillUnknown hold keeps the saved lane's `inFlight` true (`lane-moves.ts:303`; WriteAhead T18, I24; Restore R1's Owing) | `PAY-05/held-head-sleeps-at-boot` (`runner/gates.ts` productionOwed), core triage `lane-moves.ts:303` | A3 |
| O-3 | the T54 row of `owes.ts` (WriteLanes I28 to I37, I39, Actors I40, I41, WriteAhead I20 to I22, I24, Codec I7, Turn I36) | one `whole` row | each Invariant's step |

Each row is removed when its item goes green; the suite fails an owed row whose item stops failing.

## Further requirements (acceptance, Approach, owned Invariants)

| Id  | Requirement and source                                                                 | Check                              | Red today | Step |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------- | --------- | ---- |
| X-1 | differential baseline: per step the reports, commands and store contents, every production case and generated part, both world seeds; a difference only by a named entry citing the pending case it flips (C3 item 2) | a baseline file and a compare mode | missing | A0, each step |
| X-2 | cost baseline: turn cost, `ready()` with 64 queued declines, 500 keyed lanes on S16 (C3 item 7; S08 is T18's) | `bench/bench.ts` scenarios, run alone | missing | A0, A4 |
| X-3 | `World.owed` is the only holder of endings; `World.parked`, `World.kept`, `Tries`, `LaneState.Kept`, `Cue.Settled`, `Cue.Ended`, `Cue.Keep`, `persist`, `park`, `keep`, `tx.emit`, `insertEvidence` are gone, and with them (consult 3, Added and dropped) `unpark`, `unkeep`, `Move.Queue`, `Move.Park`, `Move.Keep`, `Move.LetGo`, `Head.mayHaveApplied`, `deliverRestored` (`Disposal` stays, T55's); only `ledger.ts` builds, moves or removes a row; only `evidence-of.ts` builds an Evidence (acceptance) | a source scan test plus the skeleton's opacity type test | check red | A1, A3, A4 |
| X-4 | the Approach's guard "`unpark` is safe only because one step drains the mail", read against the Spec: no rule says one step drains (WriteAhead R10 allows a backlog; `serve.ts` caps a drain at 10,000), so the check forces a backlog and asserts suspend and unpark lose or double no row (WriteLanes I29) | a backlog case with a suspend inside it | wrong runtime red | A0 |
| X-5 | dropping the stored `mayHaveApplied` for `sentBefore` changes no report or command (Approach A0 guard) | X-1's baseline with the stored flag ignored | wrong runtime red | A0 |
| X-6 | Flow.NotSent and Flow.Unknown, which share the tags Cancelled, Restored, StorageRefused and Disposed, are told apart by channel after a reload: the owed row saves `channel` `notSent` and the origin picks the mapper (WriteLanes I39, R3; Codec R5; WriteLanes T29). I38's Schema round trip is T18's | case over saved rows of every tag on both channels | check red (`Channel` has no `notSent`, `vocabulary.ts:31`) | A3 |
| X-7 | a landed lane record's `inFlight` is true from Acknowledging to Cancelling and false for Held, in the step that wrote it (WriteAhead I24, R5, T18) | store contents check of A-13 | check red (O-2) | A3 |
| X-8 | one Persist list per step, landing whole, compared with the step's dirty set; one batch out at a time (WriteAhead T17). The clause "one stream across identities" of WriteAhead I23 is T19's | store issue log over every part | check red today for cross-identity batches; T54's clause wrong runtime red | A3 |

Owned Invariants routed away (orchestrator rulings, applied in `owes.ts` at b810c6f2 and on resume):
WriteLanes I40, I41 and I38 to @task.V3.T18; Reads I22 to @task.V3.T21 (T54 routes read endings through `owe`);
Restore I20 to @task.V3.T20; WriteAhead I23 to @task.V3.T19 (a part row once A-15 checks T54's clause);
WriteAhead I21, I22 and WriteLanes I28 to T54. A pending case already green on today's code is recorded as met, not
forced red; its design mutant must be red. O-2's model gap (the Spec model accepts the wake) is an owed row for the
suite, not T54's.

## Spec findings (sidecar 1, verified by the lead)

- Actors R10 says an owed row carries its subject path; WriteAhead R5 and Codec R5 list no path. T54 follows the
  brief (R5's lists; the path is T17's). No Spec edit.
- Actors R15's "stranded read" has no ledger state; it is a read slot, T21's. No Spec edit.
- Turn R26 cites R9 for closing a row; the rule is Turn I15. A citation fix, made when Turn is next touched.
- Codec I7 forbids old keys, and step A1 keeps writing them: A-13 is red from A0 to A3 by design.
- From the expected-results read: WriteAhead I24 calls an Acknowledging head never sent while R5 and T18 want its
  `inFlight` true; WriteAhead R5 gives two lane field lists. Both owed Spec fixes, made in A3 with a spec-log line.

## Expected-results read (fresh Opus, high effort, 2026-11-14)

Verdict: 9 lines matched; X-4 and X-6 were wrong, A-12, A-6 and A-19 overreached, A-14 clashed with A2's fixes, and
A-2, A-8, A-13, A-15, A-17, X-7, X-8 and S-1 were lenient. All accepted and folded in above; the lead re-read X-4
(`serve.ts` drain cap, WriteAhead R10 backlog), X-6 (WriteLanes R3 tags) and A-12 (Actors T21) against the source.

## Mapping: every acceptance item, Approach item and gap comment

| Record item                                                          | Requirements                         |
| -------------------------------------------------------------------- | ------------------------------------ |
| Acceptance 1: A0 lands first (pending cases, baseline, crash-point reload equivalence, conservation with declines, torn batch, design mutants and one per cell, cost baseline) | A-1 to A-5, X-1, A-14, A-9, A-15, A-8, A-19, X-2 |
| Acceptance 2: the settlement check red before `Cue.Answered`, green after | A-6                              |
| Acceptance 3: `World.owed` the only holder; the names gone; one builder each | X-3                              |
| Acceptance 4: only Kept rows block a key                             | A-7                                  |
| Acceptance 5: one `start`; `boot` parks nothing                      | A-12, O-1                            |
| Acceptance 6: three record kinds with `format`                       | A-13, X-6, X-7                       |
| Acceptance 7: pending cases green, baseline equal bar named entries, A4 byte-equal | A-1 to A-6, X-1, A-16  |
| Acceptance 8: every step's gates no worse, `nub run check` at zero   | every row; the gate list in the build log |
| Acceptance 9: cost baseline re-run after A4                          | X-2                                  |
| Approach A0: checks red, baselines, the two guard checks             | A-1 to A-19, X-1, X-2, X-4, X-5      |
| Approach A1: the ledger, `Answered`, `Keep` and Kept row gone, Attempts' counter | A-1, A-2, A-5 to A-11, A-18, A-19, X-3 |
| Approach A2: one `start`; `boot` parks nothing                       | A-3, A-12, O-1                       |
| Approach A3: diff-written records, three kinds                       | A-4, A-13 to A-15, O-2, X-6 to X-8   |
| Approach A4: acts into `evidenceOf`, byte-equal stream               | A-16, A-17, X-3                      |
| Added scope (the user, 2026-11-14): production's self-proof          | S-1, S-2, S-3                        |
| Gap comment 2026-11-12T07:28 (128-bit seed)                          | A-18                                 |
| Gap comment 2026-11-14T01:58 (GEN-pay-search-25)                     | O-1                                  |
| Lead brief: `lane-moves.ts:303`, owed rows naming T54                | O-2, O-3                             |
| Handoff comments (T18 to T21, T55): close-out items, not checks      | close-out comment                    |
