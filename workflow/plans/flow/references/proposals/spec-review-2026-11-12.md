# Runtime Spec review (2026-11-12)

Verdict: **not ready for builders as written.** The rewrite is faithful to consult round 3 Part 2 and W1 option B,
and most terms now have one owner. But nine blocking findings remain, and four of them break a guarantee the user
decided: option B's "origin is the key, never the name" does not survive a saved row (B1); a fragment's
release-on-leave can strand a Held lane for ever (B2); `admit` drops a `forget` silently (B3); and a check verdict
type contradicts itself (B6). All are small text fixes. None needs a redesign. Everything here is proposed; the user
decides.

Scope: commits 476c1519 and 673d0378 over `workflow/specs/core/` (WriteLanes, Actors, WriteAhead, Restore, Reads,
Turn, Codec) and `workflow/plans/flow/Operations.plan`, judged against
`fable-architecture-consult-3-2026-11-12.md` Part 2, `fable-wide-consult-2026-11-12.md` W1, the decisions in
`workflow/tasks/V3/log.task` (notes from 07:50 to 10:30) and the spec-log's last two sections. Four Haiku sidecars
ran at effort high: blind reader, cross-Spec contradictions, citations and adversary. Their findings were verified
line by line; the log is at the end. Paths below are relative to `workflow/specs/core/` unless they say otherwise.

## Blocking findings, most severe first

**B1. A saved row cannot tell an author's `Cancelled` from Flow's.** WriteLanes R3:46 makes `Flow.NotSent` "a
failure-channel ending", and a row stores only `(channel, reason, value)` (WriteLanes `model` Owed:362-366;
WriteAhead R5:70-72). So an author failure tagged `Cancelled` and `NotSent { Cancelled }` are both
`(failure, "Cancelled", {_tag: "Cancelled"})`. In memory the code could still tell them apart by the value's class.
After an encode and decode it cannot, so a reload routes one of them to the wrong mapper. That breaks I4 and the
user's W1 decision. Fix: the row's channel gets four values (`success`, `failure`, `notSent`, `unknown`), or the
row holds one tagged result now rather than "T18 may replace" it later (consult Part 2, Owed). Owner: T18, before
T29 is written.

**B2. Release on leave does not finish.** The cell (WriteLanes `model`:351-352) says "other phases stay", which
causes two problems:

- A Held head stays Held. I12:437 says a release on leave takes a lane out of Held, so the cell contradicts it.
- A Cancelling head that answers goes Held (cell :345-347). After that, nothing releases it. `start` skips
  Releasing lanes (:393), the fragment's members are typed only inside the fragment (Compile R11), and forget keeps
  a hold whose operation exists (Actors I32). The lane then blocks its key under reject for ever.

Also, an Unsent, Acknowledging or Resending head is still invoked after the leaving turn (R8:152), which sends a
write that nobody will hear. This existed before the rewrite, but the rewrite repeated it. Fix: a Releasing lane's
Held head is released (evidence Released) when the cell runs and again when a later ending lands; a never-sent
head ends as evidence (the same as cancel's NotSent, not delivered); a waiting re-send goes back to Held and is
released. Owner: T18.

**B3. `admit` drops calls whose callers think they took effect.** In Actors `model`:345, Release, DisposeActor and
Forget are dropped outside Open. So a `forget()` while Booting resolves, the record survives, and the next boot
restores it. Fix: Forget and DisposeActor reject RuntimeNotReady in Inert, Booting and Failed; Forget rejects
RuntimeDisposed in Disposing and Disposed. DisposeActor may drop there, since disposal is idempotent (R20). Owner:
T55.

**B4. A send during boot both queues and is rejected.** R4:48 and R16:196 say a send queues. The admit table
(:342-343) rejects it RuntimeNotReady, and I42 says the table alone decides. This is conflict 3 below.

**B5. unknown { Restored } is both "stored nowhere" and saved.** Restore R3:50 says "stored nowhere". WriteLanes
`start`:393 *owes* it, and an owed row is an Identity row, so WriteAhead I20:278 requires it in `owed/<identity>`.
A builder can satisfy one rule or the other, not both. Fix: say that it is derived at the Start, from then on is a
row like any other and is saved; Restore R3's "unless a row for its Attempt is owed" already removes the duplicate.
Owner: T54 (step A3).

**B6. `check` returns two verdict types.** Turn R26:221 says "`check` returns the same verdict type"
(Accepted/Unhandled/Denied/Refused). R13:78-80 and T6:480 say check returns Allowed, Denied or Unhandled, and
Denied with InvalidTurn for a turn the runtime would reject. Fix (agent's recommendation, small public API): keep
check's public Allowed/Denied/Unhandled. R26 then says check is computed by the same evaluation and maps Accepted to
Allowed and Refused to Denied (InvalidTurn). The same fix gives the rule one word: the runtime's verdict is Refused,
and R8 and I14 say "refused", not "rejected". Owner: T54 (step A4).

**B7. The rule for which identities wake at boot is undefined.** Restore `model` Owing:165 says "a lane record in
flight at capture". WriteAhead R5:64 has `inFlight` "once acknowledged", but never says whether a Held head clears
it. Actors T23:672 expects a head held at disposal not to wake its identity, so the boot depends on a field nobody
defines. Fix: Owing is an identity with an owed record, or with a lane record whose head is not Held (Acknowledging
to Cancelling on disk); `inFlight` is false for a Held head. Also finish the rename: Restore T1:271 and
composition:221 still say "Owed". Owner: T20.

**B8. When the unknown hold is released under the cancel policy.** WriteLanes R4:77-79 releases a not-retained
unknown when its turn ends "under the cancel concurrency policy". R8:153 says an unknown holds the lane "until retry
resolves it or cancel releases it", with no exception. `@plan.Operations.O3`:238 says "Under reject, latest and
serialize". Fix: copy the plan's qualifier into R8 and I12. Owner: T18.

**B9. What the disposal's final write contains.** R22 and R23 hold "the final write" as a ticket, but no rule says
when it is issued or what it carries. The endings the bound produces (unknown { Disposed }, at exactly 5 s) can
never be inside a write that must land within the same 5 s. Scenario 5 below shows the effect: they never reach
disk, and the reload hears unknown { Restored } instead. That is honest, but unstated. Fix: the final write is the
batch issued once disposal's start cells ran, plus whatever is still dirty; endings made at the bound are not
written (a stated limit); a refused final write reports StorageFailure exactly as a pending one does (R23 covers
only pending). Owner: T55 and T19.

## Non-blocking findings

1. **Step versus drain.** WriteAhead R10 writes "that step's one list", Actors T13:637 makes "a drain's two turns
   one cut", and Actors composition:468 calls a step "one input". Whether a follow-up turn in another actor is in
   the same write list decides scenario 4. Define it once in WriteAhead R10. (T19)
2. **retryCount across a crash.** WriteAhead R13:178 captures "the `retryCount` that re-send will carry". A crash
   after that capture lands and before the invoke restores a count one above the invoked re-sends, against
   WriteLanes I7:423. Add a restart to I7's exceptions, or capture the count only after the invoke. (T19)
3. **A field nobody stores.** WriteAhead R12:168 says "A record names the boot that wrote it", but neither R5 nor
   Codec R5 ("exactly the fields") has that field. Drop the sentence or add the field. (T20)
4. **The as-built list.** WriteAhead R5:66-67 omits the subject path and the releasing mark that R5:64-65 and
   R7:98 require. (T20)
5. **The Releasing exception is stated once only.** Only WriteLanes `start`:393 skips Releasing lanes; Actors
   R10:120 and Restore R3:47-49 omit it. Cite `start` from both instead of restating it.
6. **"Unbound" means two things.** Actors `model`:317 says "no decoded actor record and no incarnation", but R8:89
   unbinds the lanes of an ended actor whose record is kept. Use "no incarnation". (T9)
7. **`Flow.Unknown.Interrupted` has no producer.** It is in W1, but no write rule makes it (R14 makes Cancelled,
   the bound makes Disposed). Name the producer, or note that it is reserved for an interruption that does not come
   from cancel. (T18)
8. **A local actor's Kept row.** Actors R15:177 closes it when "a local life ends", but `suspend`:389-390 closes
   only Life rows, and a write's row is an Identity row. Add the local case to `suspend`. (T9)
9. **Who "its owner" is.** In Actors R20:235 and R21:246, it is undefined for an unbound lane (scenario 2). (T9)
10. **Restore T2:273 is stale.** It still says "held lanes restore in creation order"; R3 says record-key order.
    Phase 2 also decided "no creation-order keys" (log.task, 10:30), so Codec R5:64, WriteAhead R5:80 and Restore
    R3:54 should stop deferring them to T20.
11. **The plan has drifted.** `@plan.Operations.O3`:201-205 still says "Every admitted commit has an exported
    Attempt ... mayHaveApplied says an earlier send ended unknown". WriteLanes R5 says a declined commit has none
    and that the field is derived from "sent before". The user allowed plan edits to match decisions.
12. **A design risk that is written down.** A Kept row on its try at a start blocks nothing (R6:119-121). A commit
    can mint in that window, and a second refusal then leaves a Kept row beside a live head. This is allowed, but
    T26 should include that case.
13. **Seed entropy is unchecked.** I28 says 128 random bits; T22 checks only the width. A counter-filled seed
    passes. Consider an entropy test or a host contract. (T54)

## The author's decisions

- **The `admit` cells, Start and BootFailed: accept with changes.** The Life moves match consult Part 2. Changes:
  B3; B4 as conflict 3 resolves it; and state that ready's waiters see RuntimeDisposed when Boot is rejected after
  a dispose (R2 already implies it).
- **`start` skips Releasing lanes and walks lane-id order: accept.** The skip follows from I15 ("a releasing lane
  delivers nothing"). Lane-id order equals record-key order only if the lane id's text is the record key's suffix;
  T20 must say so. Fix Restore T2 and finding 5.
- **A Refused ending's turn leaves its row to the retry: accept.** It restates `tryOne`. Unhandled and Denied
  closing as Delivered matches I15 and T21. The wording fix is B6's.
- **A commit beside a Kept row declines Rejected under latest and serialize: accept.** Consult Part 2 puts
  "`commit` declines `Rejected` before the table when `keptOn`" with no policy limit, so this is faithful, not new.
  Consequence for T17: Rejected can now occur under every policy, so StaticCli's "NotSent unmapped where it can
  occur" (:102) must count it.
- **`Owing`: accept the rename,** with B7's definition and the rename finished.
- **Reads' `stopped:` and `Flow.ReadStopped`: accept as proposed.** The substance is the user's (Q1 A); the names
  are T21's. Add two lines: `stopped:` is optional (unmapped, it leaves the slot's tag and an issue, as R9 already
  says in general), and a throwing `stopped:` mapper reports an issue and closes the row as Recorded instead of
  ending as Defect again.

## The three conflicts the author left

1. **Restore R8, a gone operation is both quarantined and moved.** A lane is (identity, contract id, key) with no
   operation name (WriteLanes R6), and SharedContract allows at most one write operation per contract. So:
   - if the contract still has its write operation, rewrite the record's `operation` (OpRenamed);
   - if the contract has none, quarantine the lane.

   A rename cannot collide, so LaneRekeyCollision belongs only to R6's identity-version re-key. Owner: T56 and T20.
2. **Turn T4 against I14 and I3.** A child's refusal rejects the whole turn (R8), so it publishes exactly I14's one
   issue-only snapshot and no transition. Reword I3 to "publishes no transition of its own" and T4 to "a child's
   refusal publishes only the issue-only snapshot". Before editing, check what FRAG-17
   (`packages/flow-state-v3/conformance/turn/parts.scenarios.ts`) expects; this review did not run it. Owner: T54.
3. **Actors I25 against R16's boot queue.** The real clash is I42 (`admit` alone decides) against R4 and R16. Keep
   `admit` as the one table. Until T9, Send while Booting rejects RuntimeNotReady, and R4:48 and R16:196 are
   marked "(@task.V3.T9, proposed; until then RuntimeNotReady)". When T9 builds the queue, the cell becomes Run for
   a persisted target only. Actors T3's "a send before boot waits" stays pending until then. I25 itself needs no
   change.

## Contradictions with the static and conformance Specs

| Where                                                       | What                                                         | For |
| ----------------------------------------------------------- | ------------------------------------------------------------ | --- |
| Compile R11:104                                             | lists `cancelAll` as a typed member; WriteLanes R15 retired  | T17 |
| StaticCli R10:104                                           | requires ReservedReason; WriteLanes R3 and I4 retired it     | T17 |
| StaticCli R10:102                                           | "NotSent unmapped": now the `notSent:` key, and Rejected can | T17 |
|                                                             | occur under every policy (the Kept decision above)           |     |
| Conformance Q14:557                                         | counts Codec 6 Invariants; Codec I7 makes 7                  | T52 |
| Conformance Q13:552                                         | cites Reads I18, which does not exist (dangling before this  | T52 |
|                                                             | rewrite too)                                                 |     |
| `conformance/write-lanes/lane-queue.ts`:27, 273, and        | judge retired WriteLanes I21                                 | T52 |
| `lane-queue.mutants.ts`:151, 159, 189                       |                                                              |     |
| `conformance/write-lanes/lane-policies.scenarios.ts`:115,   | cite retired WriteLanes R15                                  | T52 |
| 134, 150, 161; `conformance/dsl/lifecycle-members.traces.ts`|                                                              |     |
| :160                                                        |                                                              |     |
| `conformance/write-lanes/ending-delivery.scenarios.ts`:145  | "WriteLanes I8: the kept ending holds its lane", the reverse | T52 |
|                                                             | of the new I8                                                |     |

Diagnostics has no contradiction. Compile R9 and I11 ("each unknown target is a Flow.uncertain event") still match
the plan and option B: the record form's targets are still events. Some citations are probably still apt but
should be re-checked by their owners, since the rule's meaning moved: about 26 citing WriteLanes R10 (delivery is
now from the ledger), 20 citing R4 (`notSent:`), and the stored `mayHaveApplied` in the prototype-side
payment-retry mutants.

## Comprehension test

My answers come from the seven Specs alone. The blind-reader sidecar answered independently; each disagreement is
judged at the end of its scenario. "Undecided" items count as buildability findings (12 in all, listed at the end).

**1. A serialize write is OnWire at reload.**

- Boot: the lane record has the Attempt with `inFlight`, so the identity is Owing and wakes (Restore R1, B7).
- `start` rebuilds the acknowledged head as Held, then delivers in this order (WriteLanes `start`; Restore R3, I5;
  Actors R10), all before any external event (Restore I7):
  1. the owed rows, in owed order;
  2. each queued commit's NotSent { Restored }, but only once T18 saves queues; until then commits queued before
     the reload vanish with no ending;
  3. the head's unknown { Restored }, unless a row for its Attempt is owed.
- Writes: the lane record's new phase is a touched lane, so it is written Later (WriteAhead R10, I21). Whether the
  Restored row is saved is B5.
- A new commit is admitted at once and appended to W (cell "commit under serialize"). It is invoked only after a
  retry resolves the head or a cancel releases it ("an unknown, a retry and a restore never promote"). It declines
  Rejected only if the Restored turn is refused twice and becomes Kept.
- Undecided: B5, and B7 (does the record wake the identity).
- Sidecar: agrees, and also flags the wake rule. No disagreement.

**2. A Kept success, then `disposeActor`, then the identity is recreated.**

- The success write was applied at settlement (R1, I32); only the event is kept.
- `disposeActor` calls `suspend`. Only Queued and Retrying rows move, so the Kept row stays Kept. The owed record
  survives the removal of the actor record (Actors R20; WriteAhead R5). The lane is usually Idle, since the head
  resolved and promoted. The Kept row still blocks the key: commits decline Rejected (R6, I33).
- Recreate: an ensure is an Adoption Start. `start` moves Kept to Retrying, and the row gets one try before any
  external event, routed as current from the active leaf (Turn R20, "adopted").
  - Accepted, Unhandled or Denied: it closes Delivered.
  - Refused: it goes back to Kept.
- Not persisted: the row is never saved but lives in memory, and the recreate in the same Runtime delivers it the
  same way. A reload loses it.
- Undecided: who may cancel the Kept row while there is no incarnation ("its owner", finding 9); and a local
  actor's Kept row (finding 8).
- Sidecar: agrees, and raised the "owner" question independently.

**3. A latest write settles with success, and a cancel for its key is admitted, "in the same step".**

- A step is one input (Actors composition), and settlement and a turn are different inputs, so there is no "same
  step". The order of the two inputs decides.
- Settlement first: the success is applied and owed, and W's commit is promoted (cell "answered"). The cancel then
  finds the lane as the success left it (R14, I32):
  - with W empty, the lane is Idle and the cancel does nothing;
  - with a promoted commit, the cancel hits *that* commit: it goes Withdrawing, or ends NotSent { Cancelled }.

  The machine hears the success, then possibly the newer commit's NotSent.
- Cancel first: OnWire goes Cancelling. The answer then owes unknown { Cancelled } "instead", and the lane goes Held
  (cell; I20, by history). The machine hears unknown { Cancelled }. The success write is not applied (I2), although
  the server did it.
- So the design's claim holds only for a cancel admitted after the settlement step. Even then the race survives in
  the host: a fiber can complete while its Settled input waits behind a turn that cancels it.
- These are rules working as written, not a contradiction. Two points go to the user as semantics:
  - a cancel aimed at the request on the wire can cancel the newer queued one instead;
  - a completed fiber can still end unknown { Cancelled }.
- Sidecar: the same two orders and outcomes, but it calls order B a contradiction with R14:239. Rejected: R14 and
  I32 speak only of a cancel after settlement, and I20 decides order B. The sidecar misread it; the Spec could say
  so in one line.

**4. A hears an ending and sends to B in the same turn; B's turn persists; a crash lands one batch.**

- A's turn closes its row Delivered; that row leaves `owed/` only in the batch with A's record (WriteAhead I22).
  The send queues in B's mailbox (Actors R13). Queued events never survive (WriteAhead R6).
- Batches are atomic, one is out at a time, they commit in issue order, and each holds everything dirty (R12, I23).
  So no reload can show B's record without A's (T17).
- If B's turn ran in a later step while A's batch was out, a crash after batch 1:
  - shows A's change and B's old record;
  - the send is lost and never repeated (no replay: Restore R1).
- A crash before batch 1: A's row is restored, A re-hears the ending at its Start, and its turn sends to B again.
  This is a new turn, not a replay.
- Undecided: whether A's and B's turns are one step (finding 1).
- Sidecar: assumes they are one step and so one batch. That is the disagreement, and the cause is the unclear Spec
  (finding 1), not a misread.

**5. Runtime dispose with one head Acknowledging (its batch out) and one OnWire; the bound passes; the final write
is refused.**

- DisposeRuntime moves Open to Disposing.
- Start cells:
  - the Acknowledging head ends NotSent { Disposed } and its head goes;
  - any W commits end NotSent { Disposed };
  - OnWire stays.
- The rows are owed to the identity and suspended to Waiting. Reports: Ended, then Parked (I34).
- The Acknowledging batch's late answer reaches no cell (WriteLanes `model`). But if that batch landed, disk holds
  a lane record for a never-sent Attempt.
- At 5 s from the call to dispose (I43), OnWire ends unknown { Disposed } and goes Held. The hold-leaving ending
  comes last (Actors I31). StorageFailure is reported for the final write, and Life goes Disposed with a
  RuntimeDisposed act.
- A refusal after that is dropped (`admit`: Stored and Refused drop in Disposed).
- On disk: the last landed capture, plus the Acknowledging lane record if its batch landed. Neither Disposed row is
  on disk. Reload:
  - the OnWire head hears unknown { Restored };
  - a landed Acknowledging record also gives unknown { Restored } for an Attempt never sent (I3 allows it);
  - NotSent { Disposed } is lost.
- Undecided: B9 (the final write's contents and timing, and whether a refusal reports).
- Sidecar: agrees on the reports and the disk, and raised B9's "refused, not pending" gap independently. It missed
  the landed acknowledgement; that is its omission, not the Spec's.

**6. A key is Held after an unknown; the machine commits on that key, and separately retries.**

- **reject:** the commit declines NotSent { Rejected } (to `notSent:`, no `attempt`) and its transition runs. The
  retry re-sends the same Attempt (Recapturing, then Resending, then OnWire, retryCount + 1). Its ending is the
  Attempt's: a definite failure arrives as StillUnknown.
- **latest:** the commit queues (one slot; a second replaces it, Superseded). The retry re-sends the head. The
  queued commit is promoted only on a definite ending; another unknown holds it.
- **serialize:** the same as latest, with a FIFO of up to 64.
- **cancel:** by R4 the premise does not hold. A not-retained unknown is released when its own turn ends, so the
  key is Held only during that turn. After it, the retry gets NothingToResend and the commit mints. Inside that
  turn, a commit releases the head (evidence Released) and mints, and a later retry gets evidence InFlight.
- Undecided: B8 (R8 contradicts R4 for the cancel policy).
- Sidecar: answers cancel as if the key stays Held. That disagreement comes from B8; the Spec is unclear.

**7. A read is in flight when its incarnation ends; a new incarnation starts.**

- The read is not work in flight, or the actor would not have ended (Actors R7). It is one of the "unkept reads":
  it stops, and owes `Flow.ReadStopped` Interrupted to the identity (Actors R8; Reads R6).
- Life audience (the lookup's own ending): if the shared request still answers later, `owe` closes the row Recorded
  at once (WriteLanes `owe`; Reads T14). The new incarnation hears nothing.
- Identity audience (Interrupted): the row is suspended to Waiting, saved if the identity persists, and heard once
  at the next Start through `stopped:`.
- Undecided:
  - "unkept reads" is undefined;
  - whether "stop" interrupts the shared request or only this actor's wait (Reads R10 suggests only the wait).
- Sidecar: agrees, and flags "unkept".

**8. Boot finds an owed row whose operation no longer exists.**

- The row: its fate is T20's (WriteAhead R5:80). By the current rules, the identity is Owing and wakes if its actor
  record restores (operations are not part of the saved shape, Restore R7). `start` queues the row, and `tryOne`
  finds no mapping and closes it Recorded.
- The lane: conflict 1 decides it.
- The identity: restored live only to record evidence, which is waste but harmless.
- Undecided: the row (T20), and the lane (conflict 1).
- Sidecar: agrees, and adds that a quarantined Held head has no `start` rule. Accepted: `start` should skip
  quarantined lanes, or say that they are heard.

**9. During Booting: `ready()`, `send` and `dispose()`.**

- `ready()`: Start drops while Booting; the caller shares the bootstrap's Exit.
- `send`: rejected RuntimeNotReady; the host throws it. R4 and R16 say it queues (B4).
- `dispose()`: DisposeRuntime goes straight to Disposed, and the host closes the Scope. The Boot that follows is
  rejected, so `ready()` fails, with RuntimeDisposed by R2.
- Undecided: B4.
- Sidecar: agrees, including the contradiction.

**10. An author's commit fails with its own error tagged `Cancelled`.**

- Run time: the fiber's Exit is a Fail, so the channel is failure (R2). The cell "answered" owes it and promotes.
  At admission, the row maps through `failure: { Cancelled }` (R4, I4). Flow's Cancelled can only arrive as
  NotSent { Cancelled } through `notSent:`, or as unknown Cancelled through `unknown:`.
- After an earlier unknown send of the same Attempt, the author's failure arrives as
  `Flow.Unknown.StillUnknown { failure }`. It routes by Flow's tag StillUnknown (to `otherwise`), never to
  `unknown.Cancelled`.
- Records: B1. NotSent is "failure-channel", so a saved row cannot tell the two apart.
- Reports: I37 names an ending by Attempt id; the report's reason field is unspecified, so the same ambiguity can
  appear there.
- `flow check`: StaticCli R10:104 still requires ReservedReason, which would wrongly refuse the tag (T17).
- Undecided: B1; the report fields.
- Sidecar: says that Flow's rows have "channel notSent or unknown". That contradicts R3:46, so the Spec misled it.
  This is B1's evidence. It also calls StillUnknown a collision; rejected, since routing is by Flow's tag.

**Count of undecided steps (buildability findings):** B1, B4, B5, B7, B8, B9, finding 1, finding 8, finding 9,
"unkept reads", read stop scope, quarantined head at `start`: 12, of which 6 are blocking.

## Sidecar log

| #   | Finding (sidecar)                                                      | Ruling   | Why                                                   |
| --- | ---------------------------------------------------------------------- | -------- | ----------------------------------------------------- |
| S1  | R16/R17 release applies later endings vs I23 (blind 1)                 | changed  | R17 is a planned placement release; folded into B2    |
| S2  | Release cell "other phases stay" invokes never-sent heads (blind 2,    | accepted | B2                                                    |
|     | adversary 4, 5)                                                        |          |                                                       |
| S3  | I24 "never lost" vs stranded read (blind 3, contra F8)                 | changed  | minor wording: a Life row closing is not loss         |
| S4  | R4 vs R8 cancel-policy hold (blind 4, contra F1)                       | accepted | B8                                                    |
| S5  | check Denied vs Refused (blind 5, contra b)                            | accepted | B6; also Allowed vs Accepted, found by me             |
| S6  | 65th follow-up vs "spin never stopped" (blind 6, contra F7)            | changed  | minor: a spin means rotation, not follow-ups; reword  |
| S7  | R14 throws vs R16 reason (blind 7)                                     | rejected | R16 names a reason to the sender; R14 the throw; both |
|     |                                                                        |          | external, the same code                               |
| S8  | Replaced Acknowledging head vs Operations.plan:495 (blind 8)           | rejected | plan text predates; the cell covers it (refused ends  |
|     |                                                                        |          | StorageRefused)                                       |
| S9  | Success during Cancelling and I2 (blind 9)                             | rejected | Cancelling owes unknown, so I2 applies no write;      |
|     |                                                                        |          | consistent                                            |
| S10 | Kept row's try blocks nothing (blind 10, adversary 6)                  | changed  | stated deliberately; finding 12                       |
| S11 | "in flight" undefined; Owing (blind 11, adversary 13)                  | accepted | B7                                                    |
| S12 | Releasing Held at Start only in WriteLanes (blind 12)                  | accepted | finding 5                                             |
| S13 | Lane fields; boot-name field (blind 13, contra F12)                    | accepted | findings 3, 4; "inFlight is a flag" rejected (a       |
|     |                                                                        |          | record field, as spec-log says)                       |
| S14 | Plan says every commit has an Attempt (blind 14)                       | accepted | finding 11                                            |
| S15 | Format "(1 to 4)" with no current number (blind 15, contra F14)        | changed  | minor; T20 names it                                   |
| S16 | Lane-only changes publish, PreTurn (blind 16)                          | rejected | I15 covers it; PreTurn includes the admitted ending   |
| S17 | Mixed Cause classification table (blind 17)                            | rejected | pre-existing, unchanged by the rewrite; out of scope  |
| S18 | Interrupted has no producer (blind 18, contra F13, adversary 18)       | accepted | finding 7                                             |
| S19 | No Schemas for cause, failure, error (blind 19, adversary 23)          | changed  | deferred to T20 in writing; phase 2 decided "encoded  |
|     |                                                                        |          | by the commit's Schema or dropped"; not blocking      |
| S20 | Unencodable key vs InvalidKey (blind 20, contra F9)                    | rejected | key rules are reads' admission; commit key encoding   |
|     |                                                                        |          | is R12; different layers, both stated                 |
| S21 | Record queues, domain writes undefined (blind 21)                      | rejected | Q3 defers them to phase 5 in writing                  |
| S22 | Partial-key idle edge cases (blind 22, adversary 9)                    | rejected | I13 states the Kept input; pre-existing               |
| S23 | Key-less cancel rules only in plan (blind 23)                          | rejected | R9 states it; the plan adds detail                    |
| S24 | Ensure has no "triggering event" (blind 24)                            | rejected | wording; an ensure has none, the list ends earlier    |
| S25 | Turn says "as the source states" (blind 25)                            | rejected | by design: the Machines plan is the source; not       |
|     |                                                                        |          | rewritten here                                        |
| S26 | Boot bound value, flush destination (blind 26)                         | changed  | folded into conflict 3 (T9)                           |
| S27 | "its owner" undefined (blind 27)                                       | accepted | finding 9                                             |
| S28 | identityTag, "taken" (blind 28)                                        | rejected | T56/T20 own Restore R6; pre-existing                  |
| S29 | Shape stamp, structural (blind 29)                                     | rejected | pre-existing, unchanged                               |
| S30 | Scope bound drop order (blind 30)                                      | rejected | pre-existing, Q2                                      |
| S31 | Old-version hold ending (blind 31)                                     | rejected | pre-existing                                          |
| S32 | Freshness written when built (blind 32)                                | rejected | stated deferral                                       |
| C1  | Evidence counted as ending (contra F2)                                 | changed  | wording only; R10 counts evidence as the one ending   |
| C2  | forget closes as evidence vs "none disappears" (contra F3)             | rejected | evidence closes count per R10 and I27                 |
| C3  | Unbound definition (contra F4)                                         | accepted | finding 6                                             |
| C4  | Shared words with two meanings (contra F5)                             | changed  | Refused/rejected folded into B6; Life overload is     |
|     |                                                                        |          | named in WriteLanes Audience already                  |
| C5  | Turn T15 vs R21 queued behind Held (contra F6)                         | rejected | T15 says beside a Held head with no queued commit;    |
|     |                                                                        |          | R21 covers the queue; consistent                      |
| C6  | Mapper throw outcomes (contra F10)                                     | rejected | admission throw (refusal) and read mapper throw are   |
|     |                                                                        |          | stated separately                                     |
| C7  | Owed row `current` not saved (contra F11)                              | changed  | true; T17 owns `current`; noted, not blocking         |
| C8  | Compile Flow.uncertain vs option B (contra S1)                         | rejected | targets are still events; the plan keeps the rule     |
| C9  | cancelAll, ReservedReason in static Specs (contra S2, S3; cite 5)      | accepted | table above                                           |
| C10 | Conformance counts and Reads I18 (contra S4)                           | accepted | table above; I18 pre-existing                         |
| C11 | Restore T2 creation order (contra S5, cite 3, adversary 24)            | accepted | finding 10                                            |
| C12 | Owed vs Owing leftovers (contra S6)                                    | accepted | B7                                                    |
| C13 | Restore cites Turn I28 for silent baseline (contra gaps)               | changed  | Restore I19's note names I28 for onContext baselines, |
|     |                                                                        |          | which I28 is; fine                                    |
| X1  | Retired I21/R15 cited in conformance code (cite 1)                     | accepted | table above                                           |
| X2  | DLV-06 I8 label (cite 2)                                               | accepted | table above                                           |
| X3  | Stored mayHaveApplied in prototype mutants (cite 4)                    | changed  | prototype side; noted for owners                      |
| X4  | "re-check" citation lists (cite 6)                                     | accepted | noted for owners                                      |
| A1  | Forget/DisposeActor dropped outside Open (adversary 3)                 | accepted | B3                                                    |
| A2  | Boot reject leaves ready's Exit unnamed (adversary 2)                  | accepted | the `admit` ruling                                    |
| A3  | T26 names no policy (adversary 8)                                      | changed  | Q5 already open; T26 should list reject, latest,      |
|     |                                                                        |          | serialize                                             |
| A4  | Seed entropy (adversary 10)                                            | accepted | finding 13                                            |
| A5  | mayHaveApplied for ack-only Attempt (adversary 11)                     | rejected | R5 defines it by phase; an acknowledged head restored |
|     |                                                                        |          | Held may have been sent; consistent                   |
| A6  | Success writes apply once (adversary 12)                               | rejected | R1 and I32 apply at settlement, once; a refused turn  |
|     |                                                                        |          | does not re-apply                                     |
| A7  | Restored "stored nowhere" vs I20 (adversary 14)                        | accepted | B5                                                    |
| A8  | A reset removes stopped reads (adversary 15)                           | accepted | minor: Restore R7:107 should keep owed rows; the      |
|     |                                                                        |          | stopped read's Interrupted is a row now               |
| A9  | `stopped:` required? throw in stopped (adversary 16)                   | accepted | the stopped: ruling                                   |
| A10 | User cancel on a one-off read has no ending (adversary 17)             | changed  | minor, T21                                            |
| A11 | Kill inside a write (adversary 19)                                     | changed  | T17 should also inject a torn write; the Store        |
|     |                                                                        |          | contract states atomicity                             |
| A12 | Refused-but-landed write (adversary 20)                                | rejected | R12 makes it a Store contract breach, not a Flow case |
| A13 | retryCount after crash (adversary 21)                                  | accepted | finding 2                                             |
| A14 | -0 key (adversary 22)                                                  | changed  | minor: the plan says -0 equals 0; Reads R2 should     |
|     |                                                                        |          | say canonical text normalises it                      |
| A15 | Later-owed row heard before an earlier retried one (adversary 7)       | rejected | stated: a retry goes behind queued mail; order is per |
|     |                                                                        |          | try, not per owe                                      |
