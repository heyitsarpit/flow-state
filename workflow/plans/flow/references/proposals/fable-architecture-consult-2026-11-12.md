# Architecture consult: owed endings, ownership of checks, review stops (2026-11-12)

**Status: proposed, nothing here is decided.** Recommendation in one line: split the Attempt's life (the lane)
from the ending's delivery (one ledger of owed endings, keyed by ending id), persist both as separate facts
written by diff, and make `start(actor)` the only place a reload or adoption delivers. Read-only consult; no code
or record changed, no gates run. Evidence is from `packages/flow-state-v3/src/core/` at fe474ea1.

## The root cause

Two lifecycles share one set of cells. An **Attempt** is sent, waits, is held, is re-sent. An **ending** is known,
queued, refused, kept, heard. Today the second is stored as a side effect of the first, in five places:

| Fact about an ending       | Where it lives now                                         | Keyed by |
| -------------------------- | ---------------------------------------------------------- | -------- |
| queued, and how many tries | `Mail.Ending` with `Tries` (`world.ts`)                    | position |
| waiting for an incarnation | `World.parked` (`persist.ts` `park`)                       | lane     |
| twice refused              | `World.kept`, one entry per lane (`persist.ts:134`)        | lane     |
| owed `unknown Restored`    | derived from a Held head, at boot and again at each start  | lane     |
| "wake this identity"       | the lane record's `inFlight` (`record.ts` `encodeLane`)    | lane     |

Every listed bug is an ending whose fate needed a lane to hold it, or a copy that was not updated:

- kept overwrite: the kept map is keyed by lane, so two endings on one lane collide;
- lane-less ending lost on its second refusal, and dropped at disposal (`disposal.ts:25-26`): no lane, no home;
- Keep on a Held head needing a cell: a delivery fact routed through the Attempt's table;
- `inFlight: true` left on disk: a stored projection of `phase`, written by some moves and not others;
- I29 against R22: "the lane" stands for both the Attempt and the ending it owes.

## A1. One ledger of owed endings: yes, with the Attempt left in the lane

**Recommendation (proposed).** The lane owns an Attempt until it has a result. From the result on, the ending is a
row in one ledger, and nothing else stores it. Lanes read the ledger; they never hold endings.

```ts
// NEW: Delivery, Owed, OwedId, World.owed      existing: every Ending field
// DROPPED: Tries, Parked, World.parked, World.kept, Cue.Keep, Move.Keep, the Kept row, keptRecordKey
export type Delivery = Data.TaggedEnum<{
  Settled: {}; //                  result known; its lane has not moved; first try queued (today Tries.First)
  Queued: { refused: boolean }; // lane moved; a try is queued; refused = one refusal so far
  Waiting: {}; //                  no incarnation to hear it (today the parked map)
  Kept: {}; //                     twice refused; one try per boot or adoption (today the kept map)
}>;

export type Owed = {
  readonly id: OwedId; //          minted; the only handle mail and records use
  readonly to: "identity" | { readonly life: string }; // a write's ending, or a read's (dies with its life)
  readonly actor: ActorId;
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly lane: Option.Option<string>;
  readonly channel: Channel;
  readonly reason: string;
  readonly value: unknown;
  readonly owner: number;
  readonly current: boolean;
  readonly delivery: Delivery;
};

// World: owed: ReadonlyMap<OwedId, Owed>   (insertion order is creation order)
// Mail:  Ending: { actor: ActorId; id: OwedId }   (a reference, never the ending itself)
```

Five functions are the only code that touches `owed`:

- `owe(ending)`: adds a row. With a live incarnation it is `Settled` plus a mail reference; with none it is
  applied to its lane and `Waiting`.
- `tryOne(id)`: a mail reference whose row is gone does nothing. `Settled` applies the lane's cell first, which
  fixes the payload (StillUnknown, Cancelled). Accepted: `close(Delivered)`. Refused: `Queued { refused: true }`
  and a new reference after queued mail; refused again: `Kept`.
- `suspend(actor)`: a life's end, `disposeActor` and Runtime disposal. Every `Settled` or `Queued` row of the
  identity becomes `Waiting` (applied first if `Settled`); a life's rows close as evidence. No lane is needed.
- `start(actor)`: the one delivery point for reload and adoption. `Waiting` becomes `Queued { refused: false }`,
  `Kept` becomes `Queued { refused: true }`, in creation order; then each Held head with no row for its Attempt
  gets a new row `unknown Restored`.
- `close(id, how)`: the only removal, with `how` one of Delivered, Recorded, LetGo. It emits exactly one report.

**Why lost and twice are impossible.** Twice: delivery reads the row by id and `close` removes it, so a duplicate
or stale reference is a no-op (an idempotent consumer keyed by message id). Lost: only `close` removes a row, and
every open state has a named waker: a mail reference (`Settled`, `Queued`), the next `start` (`Waiting`, `Kept`).
One harness Invariant checks the first: mail references equal the rows in `Settled` or `Queued`.

**Where the rest fits.**

- **Held** stays lane state: it says the Attempt is still addressable by retry and cancel. The unknown that made it
  Held is a separate row. A kept unknown beside a Held head is two facts in two places, so no cell is needed.
- **Blocking.** A key is busy when its lane has a head, or the ledger has an undelivered ending of a sent write on
  that lane (`!isDecline`). This replaces the Kept row and makes `idle(k)` right by construction (I13's remainder).
  It also closes a window today: after a first refusal the lane is already Idle and a queued event can commit
  again before the machine hears the first ending. A turn hearing an ending does not count that ending as busy.
- **Q5** falls out: a commit under `cancel` closes the lane's undelivered endings as evidence (LetGo) unless a
  cancel is pending on that Attempt, then mints. Same rule as its displaced head (R7).
- **Keyed lanes**: the row carries its lane id; a partial-key `idle` reads lanes and rows that match.
- **cancelAll, I21, I31**: the lane emits endings in the order it owes them (queue in admission order, the
  hold-leaving one last); the ledger keeps creation order per identity. Order is decided once, at `owe`.
- **Reads**: same ledger, `to: { life }`. Never persisted; closed as evidence when the life ends or a newer lookup
  supersedes it. R15's "stranded" is `Kept` on a life row, and gets its report for free.
- **Lane-less write endings** (declines): rows with `lane: None`. The minted `kept-…` lane id goes away.

**What it keeps from today:** a lane's view (Idle, InFlight, Held) changes only in a turn of its own identity, so
guards are stable between turns and I20 holds. That is why `Settled` exists: the result is known but not applied.

**Would prove it wrong:**

- a T18 policy needs an ending's content to change after it is applied to its lane (the ledger assumes it is final
  at the first try);
- a measured cost: the busy check reads the ledger on every commit. Rows are few; index by lane only if measured;
- a case where one ending needs two fates at once (delivered late to one path and kept for another);
- busy-while-owed breaks a real flow: a success handler's follow-up commit on the same key must still mint.

## A2. Persist both facts; derive only what a boot can always rebuild

**Recommendation (proposed).** Lane records hold what was sent; owed records hold an answer known but unheard.
Neither is derived from the other, because a boot cannot rebuild either: a saved success is not in the lane, and an
Attempt's id and input are not in the ending.

- **Records.** `lane/<id>` as now. `owed/<id>` replaces `parked/<lane>` and `kept/<lane>`: the ending, its order
  key and `kept`. Only `Waiting` and `Kept` rows have a record; `Settled` and `Queued` are heard within the step,
  and a crash there restores `unknown Restored`, which is honest (WriteAhead R14).
- **Written by diff, not by each move.** The step compares `encodeLane(before)` with `encodeLane(after)` and
  `encodeOwed` likewise, and emits the writes, as `evidenceOf(before, cue, after)` does for reports. No move can
  forget its write, so a Recapturing head that goes Held at disposal is rewritten Held.
- **Derived at boot, never stored:** `unknown Restored`, tries (a boot grants them), mailbox position, who to wake
  (an identity with an owed record, or a lane record not Held).
- **Reload and adoption are one path.** `boot` only decodes and picks whom to wake; it parks nothing. `start`
  delivers (A1). Today `boot` parks `Restored` and `deliverRestored` derives it again; one of them goes.
- **No loss, no double across a crash.** An owed record is removed in the batch that captures the turn that heard
  it: same scope, and batches are atomic (WriteAhead R12). A crash before the batch lands restores the old state
  with the record, and it is delivered again to that old state. Today `unpark` runs at `start`, before the
  delivery, and is safe only because the same step drains.
- **I26's void** is a lane move, not an ending: Recapturing or Resending goes Held, the diff writes the record, and
  no row is owed. The next incarnation hears `unknown Restored` from `start`, and may retry again.
- **I29 against R22 (decide: R22's reading).** A never-sent head ends `NotSent { Disposed }`: the head goes, the
  ending is a `Waiting` row with a record. Reword I29 to "every Held head and every owed ending still exists".
- **disposeActor and forget** are `suspend`, then `close` over the identity's rows: forget closes all (Recorded,
  LetGo for kept); `disposeActor` of an identity that does not persist closes its rows (recheck route 6).

**Would prove it wrong:** a store that cannot put the owed record's removal in the hearing turn's batch; a boot
that must deliver before any incarnation starts; a need for a saved ending to survive without its order key.

## A3. One list of what is owed, with slice and README derived

**Recommendation (proposed).** The coverage gate already has the right rule (`coverage.ts`: a row expires, its
owner must be open). The drift comes from five stores of one fact. Keep one hand-written fact and derive the rest:

```ts
// NEW: Owes (replaces NotYet, Remainder and Feature.owed)
export type Owes = {
  readonly invariant: InvariantId; //  or a Plan feature id where no Invariant exists yet
  readonly clause: "all" | string; //  "all" is today's NotYet row; text is today's Remainder
  readonly task: TaskRef;
  readonly why: string;
};
```

- Each check keeps declaring its Invariants (`Oracle.guarantee`, `Mutant.expects`); an `Owes` row sits in the
  module where its check will be written, so it becomes that check in place.
- Derived, never written: the slice (from the Task record), the README's guarantee map (printed by the gate, or a
  generated block), `features.ts`'s `owed`, and a Task's list (`coverage --task T18`). Task comments cite the
  command and state no ownership.
- Gate, as now plus one: every Invariant is claimed or owed; an owed row's Task is open; a Task cannot close with
  rows naming it.

**Would prove it wrong:** ownership that cannot be keyed by an Invariant or feature id (then the Spec lacks an
Invariant, which is the real gap); or the generated map going unread. Not traced: how each `features.ts` row maps
to Invariants.

## A4. Stopping rule for reviews

**Recommendation (proposed).** The blind reviewer finds something each round because the Spec is wider than the
Task: in T51 nearly all its late items were "present at T51's start". Separate finding defects from finding
backlog.

- A finding **blocks** only if all three hold: it is in the Task's range or its requirement list; it has a check
  that is red on the current code (the reviewer's probe); it is a lost, doubled, made-up or wrong ending, a hang,
  or a broken acceptance item.
- Everything else is routed in the same round as an owed check or row (A5) and never reopens the Task.
- One full review with the blind sidecar per step. After fixes, a **re-check** reads only the fix range and
  confirms each new check was red for the stated reason. No second blind sweep of the same range.
- **Stop:** the Task closes on the first review or re-check with zero blocking findings. Two rounds in a row with a
  blocking finding of one root cause trigger the existing convergence pass, not a third round.
- The blind sweep's convergence is judged per area at close-out: stop when a sweep adds no blocking-class item.

**A different model family: yes, on expected results only.** The risk is correlated misreading: one family writes
the Spec, the expected results, the code and the review. Once per Task, at step 1 (requirements as failing
checks), before any build: it reads every expectation that rests on an agent ruling plus a sample of the rest (at
least 10, or 15%), each beside its cited rule, and answers "does the rule give this result, and would another
reading give another?". Once more at area close-out, on rulings only. Its findings are advice.

**Would prove it wrong:** blocking defects found after close that the rule called non-blocking; or three Tasks in
which the other family finds no wrong expectation, in which case drop it to close-out only.

## A5. Routed gaps become owed checks at once: yes

**Recommendation (proposed).** A gap routed to a later Task lands in the suite in the same fix round, not as a
comment. The suite already has the mechanism (`holds: "pending"`, `limits.ts`); this extends it to cases.

- Expressible today: the reviewer's probe lands as a pending case with its `Owes` row. Pending cases are counted
  apart and never fail the gate while red; a pending case that goes green fails until its mark is removed (the
  strict expected-failure rule).
- Not expressible yet (needs an unbuilt fixture): an `Owes` row with the clause text only.
- No rule to cite, or two rules that disagree: no check; it goes through A6 first.
- Expected results follow test-the-spec: derived from the cited rule without running the code, marked proposed.

For T18 this means the six bugs in this note's brief enter as pending cases before the rewrite starts.

**Would prove it wrong:** pending cases that rot (expectations nobody trusts when the Task starts), or a reviewer's
cost per finding rising enough that findings go unreported.

## A6. A Spec contradiction found mid-Task

**Recommendation (proposed).** The building lead decides in the Task; the next review checks the decision.

1. Write it as one concrete case with the two results, each citing its rule. Stop that cell only.
2. Classify. Internal only, or a small observable edge (which ending, what order): the lead decides. A change to a
   guarantee an app relies on (a delivery count, data kept or lost): a numbered question to the user, and work
   continues elsewhere on the conservative side, the one that keeps the ending and the hold.
3. Decide in this order: no lost ending and no made-up definite ending; no double; one fact in one place; the
   user's decisions over agents', later over earlier, a rule with a check over prose; then cost. Tie-break: the
   reading that states as one Invariant with no exception clause (WriteLanes I15 carries six).
4. Record once, in one commit: the Spec is edited so the losing text is gone, `spec-log.md` gets the decision, its
   judge, the reason and how to reverse it, and the case becomes a check citing the new rule.
5. Never build one side silently, satisfy both by a hybrid, or mark the cell impossible (`Keep.Held` in T51).

**Would prove it wrong:** decisions reversed at review more often than they stand, which would mean the lead lacks
the context and the question should go to a Spec owner first.

## Broad implications

- **Table and static analysis:** the lane table loses a row (Kept) and a cue (Keep); T18's policies add cells over
  head phases only. Compiled data and the ending-to-event mapping are unchanged.
- **Conformance:** `delivered-once` becomes conservation over one stream: each owed id has at most one close, and
  at quiescence every open row is listed. The Port gains one read, `owed()`. I15's exceptions become states.
- **Stories and CLI:** `flow trace` and `flow explain` can print one table per actor (ending, state, lane); a
  Story checkpoint can assert on it. Reports gain `Owed` and one close report per row, derived by `evidenceOf`.
- **Records:** `parked/` and `kept/` become `owed/`; a format step at boot, or a reset since nothing has shipped.
- **Core rules:** plain maps, ids from the mint, no clock; the ledger adds no allocation to a turn without endings.

## Prior art borrowed

- **Transactional outbox and inbox, idempotent consumer** (Richardson, microservices.io): the message is its own
  row with its own id; delivery dedupes by id. Borrowed for the row, the reference in mail and `close`.
- **Kafka consumer offsets in the producer's transaction** (KIP-98, read-process-write): exactly-once is
  at-least-once plus committing "heard" atomically with the consumer's state. Borrowed for the record's removal
  riding the hearing turn's batch.
- **Temporal:** an activity's result is an event in history before the workflow hears it, and a failed workflow
  task does not consume it. Borrowed for `Settled` before delivery and for refusal never closing a row.
- **Dead-letter queues with redrive** (SQS `maxReceiveCount`): poison messages are set aside per message and
  retried on an explicit trigger. Borrowed for `Kept` per ending, with boot or adoption as the redrive.
- **XState v5:** endings arrive as mailbox events, but a restored invoked actor is started again from its
  snapshot. Not borrowed: for a write that is a re-send, which Flow never does on its own.
- **Strict expected failures** (pytest `xfail(strict=True)`, Chromium TestExpectations): borrowed for A5.

## Least sure

Whether a key should be busy for every undelivered ending of a sent write, not only kept ones. It removes the Kept
row and the first-refusal window, but it changes behaviour T18's `latest` and `serialize` cells have not ruled:
promotion would wait for the ending to be heard, not only applied. If that is wrong, keep the ledger and let only
`Kept` rows block; nothing else in A1 or A2 depends on it.
