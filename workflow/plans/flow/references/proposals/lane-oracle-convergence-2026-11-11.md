# Lane oracle convergence (2026-11-11, proposed)

**Bottom line:** one shared definition, folded separately by each oracle. A new pure module, `dsl/lifecycle.ts`,
holds two closed variants and one total table each: an Attempt's lane phase, and an ending's delivery life. The lane
itself is derived from its Attempts, never stored. `lane-queue`, `delivered-once` and `disposal` each fold their own
copy and report only the refusals whose Invariant they own. `ending-channels` and `attempt-identity` stay independent
of it. Four common-mode defences catch a bug in the shared table:

- a refused move never changes the model;
- every table cell has a trace derived from the Spec;
- an automatic mutation of every cell must turn a trace red;
- the runtime mutants still run end to end.

The Port changes in four places:

- `Turn` reports the members it ran, with their lanes, and comes before its members' reports;
- `Issue` names the ending it refused;
- `Delivered` is reported on every admission;
- a keyed `Minted` without a key is a Port breach.

Everything here is proposed. Three Spec gaps from `DLV-04` go to the user as Q1 to Q3, and two smaller ones as Q4 and
Q5.

Written under skill:policy-convergence, steps 1 to 6, from the findings and the Specs. The oracle code was read only
after the design was written, to fill in "What the design drops".

## Root causes

- **RC1, unanchored claims:** the oracles assumed that a runtime report, or a count of reports, says which lane,
  head or ending it concerns. The Port did not carry that, so a claim was matched to the nearest candidate.
- **RC2, no closed lifecycle:** the oracles assumed an Attempt's life could be rebuilt per oracle from whichever facts
  that oracle reads. So each oracle grew its own partial phase set. A phase was invented when an entry was missing,
  and one life was spread over collections, flags and counters.
- **RC3, lane identity from the wrong facts:** the oracles assumed a lane can be named from a turn's event, the actor,
  or the first request. A lane is (actor, operation, key), and only a mint or a member names its key.
- **RC4, a turn is not one unit:** the oracles assumed a turn's effects can be told from its admission by their
  position. A `Turn` came after its own reports, so the cancel that anchors a `Released` arrived after the
  `Released`. Two baselines tried to patch that.

Every finding below falls under one of these, and most under RC1 with RC2.

## Requirements, together

From WriteLanes R1 to R17, Actors R15, R20 to R23, Restore R3, Conformance R1, R5, R6, R9 and R11, and the reviews:

1. **One life per Attempt:** one closed phase and one total `(phase, move)` table. No phase comes from a missing
   entry. A minted Attempt stays known for the whole case, across reloads.
2. **One life per ending:** one closed delivery life and one total table, apart from the Attempt's phase, because the
   two overlap. A Held Attempt can have a kept ending.
3. **The lane is derived:** its state is the phase of its addressable Attempt, and W is its Queued Attempts in mint
   order (WriteLanes model; AGENTS "store facts, derive views").
4. **Every lane-moving claim is anchored to a suite fact or to a member the reference lists.** This covers
   `Released`, `Superseded`, a `Sent` of a Held head, and a decline. A `Released` is anchored to the lane that a
   cancel named, in the turn that ran it.
5. **A guarded cancel is checked both ways:** a turn whose alternative runs a cancel must release. One that runs none
   must not release. This holds also when a cancel and a retry share event, from and to (`void`'s `VoidUnsure`).
6. **A keyed Attempt has its lane from its mint**, and the key agrees with its requests' key fields.
7. **I15's refusal exception without counting:** each refusal names its ending. Actors R15 and I24 allow one try per
   boot or adoption.
8. **Held survives a reload.** A boot sends nothing (Restore R3, I2). A restore ending comes once per incarnation
   (Restore I6).
9. **The disposal ledger is a view of the same life**, with the bound's timing kept by `disposal` alone (Actors I35).
10. **Common-mode safety (the simplicity review's warning):** a bug in a shared model must not blind every oracle at
    once.
11. **Per-pair kill accounting (Conformance R6):** each Invariant has one judge among the lifecycle oracles, and each
    pair keeps a mutant.
12. **The oracles judge at different instants:** at turn close, at step end, at boot end and at the disposal bound.
    The shared part fixes the transition, and each oracle fixes its instant.

Requirements 1 and 10 pull apart: one definition, but no single point of failure. The design settles it with one
definition plus separate folds and the defences below.

## The decision: shared definition, separate folds

**Share the definition and the table, not the state.** The simplicity review warned against one shared state object:
a fold that fails makes every oracle fail with it, and oracles judge at different instants. The T7 review asked for
one lifecycle, because four hand-rolled models each failed in their own way. Both are met as follows:

- `dsl/lifecycle.ts` exports the types, the two tables, `resolve` (a step's facts into ordered moves) and `advance`
  (a model and a move into the next model plus refusals). It is pure and synchronous, with no Effect.
- Each oracle keeps its own `Model` in its own state, folds it with `advance`, and reports a refusal only when the
  refusal's Invariant is in its `guarantee`. Its own views and obligations (W bounds, delivery order, the disposal
  window) stay in the oracle.
- The `Judge` contract does not change: no Case-level shared fold, and no change to `dsl/oracle.ts`.

**How a bug in the shared table is still caught:**

1. **A refused move never moves the model.** When a claim is refused (an unanchored `Released`, say), the model keeps
   the runtime's last anchored state. A lie caught by one oracle therefore leaves the others judging the true lane.
   This is what T7 M1 lacked: the ledger settled `pi1` as `Claimed`, so I29 stopped requiring it. Here `pi1` stays
   `Held`, and `disposal` keeps requiring it.
2. **Every table cell has a trace derived from the Spec.** `dsl/lifecycle.traces.ts` holds hand-written traces, each
   citing its rule. They are derived from the Spec without running any runtime (Conformance R5). `lifecycle.test.ts`
   checks that every cell is reached by at least one trace.
3. **The cells are mutated automatically.** The tables are data. The test replaces each cell, in turn, with every
   other outcome (each other next phase, `Refuse`, `Ignore`). Each replacement must turn at least one trace red. This
   is policy-convergence step 9's "check that can fail", applied to the suite's own model, and it runs in
   `nub run test`.
4. **Independent judges stay independent:**
   - `ending-channels` (WriteLanes I3) reads answers through `endingOf` and the server log, not the lifecycle;
   - `attempt-identity` (I6, now also the key check) reads the server log;
   - case expectations read rows and counts;
   - the runtime mutants still run through the whole stack. If a table bug blinds an oracle, its pair's mutant
     survives falsify.

A unit test also checks that every `Refuse` Invariant in the tables is in exactly one lifecycle oracle's `guarantee`.

## The Port changes

1. **`Turn.members`** (T7 M1, M2; S2 H1; RC1, RC3):
   - `members: ReadonlyArray<Member>`, with `Member = { operation; kind; key: Option<Json> }`;
   - `kind` is one of `commit`, `retry`, `cancel` and `cancelAll`;
   - `key` is the lane the member acted on.
2. **`Turn` order** (RC4): a `Turn` is reported once its alternative is chosen, before the reports its members
   cause.
3. **`Issue.ending`** (T7 M4): `ending: Option<EndingRef>`, with
   `EndingRef = { operation; attempt: Option<string>; actor: Option<ActorRef> }`, set on a delivery's
   `InvalidTurn` or `UnmappedEnding`.
4. **`Delivered` on every admission** (T7 M4): the redelivery after a refusal and a kept ending's try are reported
   too, and the old Gotcha goes.
5. **`Minted` decoded at the boundary** (T7 M3; S2 M1): a keyed `Minted` with `key` `None`, or any `Minted` with
   `actor` `None`, is a `Defect` naming the field, not a verdict on behaviour.

- **The Spec's own vocabulary (Conformance R1):** members are WriteLanes R6's "a turn's members", an issue naming its
  cause is Actors R15's, and a delivery is an admission.
- **No new tag.**
- **Round-14 meets all five with small edits to the notes it already writes.** This is a recommendation, because
  every new check needs a prototype mutant (Conformance R6, the T41 gate):
  - `turn.ts` chooses the alternative before its actions run, so the `turn` note can move ahead of them and carry
    them;
  - the refusal site (`turn.ts:1277`) has the refused `item` in hand;
  - the mint has the key (`world.ts` `byAttempt`, per the S2 review).
- **Fallback:** declared gaps in `not-yet.ts`, with the dependent pairs unjudged on round-14.

## The reference

`OperationReference.cancels` and `mayCancel` are replaced by one table per machine: the alternatives that run lane
members. Each row is written by hand from the fixture source and typed by its events, states and operations (T7 L7).

```ts
type Alternative<Event, State, Operation> = {
  readonly event: Event;
  readonly from: State | "any"; // "any": a root handler; a state's own row shadows it
  readonly to: State | "same";
  readonly members: ReadonlyArray<{ readonly operation: Operation; readonly kind: MemberKind }>;
};
```

Pay's rows (`prototypes/conformance/typed/pay.ts`), each with its line cited:

- `PayRequested`: any→same `[pay.commit]` and any→PAYING `[pay.commit]`.
- `Leave`: any→LEFT `[void.commit]` and any→LEFT `[]`.
- `Confirmed`:
  - LEFT→same `[void.commit]` and IDLE→PLACING `[place.commit]`;
  - in PAYING: PAYING→PLACING `[place.commit]`, and PAYING→CARD `[]`.
- `PlaceUnsure`: any→same `[place.retry]` and any→STUCK `[]`.
- `VoidUnsure`: any→same `[void.retry]` and any→same `[void.cancel]`.
- `RetryNow`: WAITING→PAYING `[pay.commit]` and WAITING→same `[]`.
- `IntentRead`: UNSURE→PLACING `[pay.cancel, place.commit]`, UNSURE→PAYING `[pay.retry]` and UNSURE→same `[]`.
- `OrderSeen`: UNSURE→PAID `[pay.cancel]` and UNSURE→same `[]`. `intent.cancel` is a read's, not a lane member.

**Matching rule:** a `Turn` anchors its members only when exactly one row matches its event, from and to, and the
row's members by operation and kind equal the reported members in order. The reported members choose between rows
that share event, from and to (`VoidUnsure`, `Leave`). The row is the anchor; the reported `key` names the lane. A
`Turn` whose event has no row must report no members. Anything else is a WriteLanes I10 violation (proposed new
claim for `lane-queue`), and the turn anchors nothing.

## The lifecycle

### Types

```ts
type LaneId = { readonly actor: ActorRef; readonly operation: string; readonly key: Option<Json> };

type Phase = Data.TaggedEnum<{
  Queued: {};                                    // in W, behind the head
  Waiting: {};                                   // addressable, never sent, not yet invoked
  Cancelling: { storage: boolean };              // never sent, cancel taken; awaits NotSent Cancelled
                                                 // (or StorageRefused when `storage`, R14)
  Resending: {};                                 // sent before, retry admitted, not yet invoked
  OnWire: {};                                    // invoked, no ending yet
  Interrupting: {};                              // on the wire, cancel taken; only unknown Cancelled ends it
  Held: {};                                      // its last ending was a retained unknown
  Leaving: { evidence: "Released" | "Superseded" }; // a cell requires this evidence in this turn
  Flushing: {};                                  // never sent, Runtime disposal began; awaits NotSent Disposed
  Restoring: { was: "queued" | "head" };         // never sent at a reload; awaits its restore ending
  Gone: { why: GoneWhy };                        // left its lane; kept so later facts are judged
}>;

type GoneWhy =
  | { _tag: "Resolved"; inDisposal: boolean }    // definite ending (I36 reads inDisposal)
  | { _tag: "Released" } | { _tag: "Superseded" }
  | { _tag: "Replaced" }                         // interrupted by a later commit under `cancel`; ending is evidence
  | { _tag: "NotSent"; why: string }
  | { _tag: "Unborn" };                          // killed before its batch landed (Restore R3): no lane, no ending

type Attempt = { readonly id: string; readonly lane: LaneId; readonly phase: Phase };

type Life = Data.TaggedEnum<{
  Owed: {};                                      // decided, deliverable now or parkable
  OwedAtDisposal: {};                            // decided during Runtime disposal: must park (I15)
  Evidence: {};                                  // evidence by declaration: must be recorded, never delivered
  Parked: {};
  Delivering: { attempt: "first" | "again" | "kept" };
  Refused: {};                                   // first refusal: owed one redelivery after queued mail
  Kept: {};                                      // refused at its last try; blocks its key (Q3)
  KeptOpen: {};                                  // a boot or adoption opened one try
  LettingGo: {};                                 // a let-go cause happened; awaits Recorded letGo
  Orphaned: {};                                  // owed when its page died; the boot's endings replace it
  Heard: {};
  Recorded: { why: RecordedWhy };
}>;

type Ending = {
  readonly attempt: Option<string>;              // None: a decline
  readonly operation: string;
  readonly actor: ActorRef;
  readonly channel: Channel;
  readonly reason: string;
  readonly boot: number;                         // the page it was decided on (Restore I6: once per incarnation)
  readonly life: Life;
};

type Mode = Data.TaggedEnum<{ Running: {}; Disposing: {} }>;
type Record = Data.TaggedEnum<{                  // per actor; Unbound after disposeActor or forget until adoption
  Bound: {};
  Unbound: { by: "disposeActor" | "forget" };    // I29 or I32 at adoption
}>;

type Model = {
  readonly boot: number;
  readonly mode: Mode;
  readonly actors: ReadonlyArray<{ readonly actor: ActorRef; readonly record: Record }>;
  readonly attempts: ReadonlyArray<Attempt>;     // mint order; never shrinks
  readonly endings: ReadonlyArray<Ending>;       // decision order; never shrinks
};

type Cell = Data.TaggedEnum<{
  To: { phase: Phase; queue: "keep" | "promote" | "cancelAll" | "flush" | "restore" };
  Refuse: { invariant: InvariantId; text: string }; // the phase stays
  Ignore: { judgedBy: string };                     // the phase stays; an independent oracle judges it
}>;
```

- **The lane's derived view:** the lane is Idle iff it has no addressable Attempt, where addressable means `Waiting`,
  `Cancelling { storage }`, `Resending`, `OnWire`, `Interrupting`, `Held` or `Leaving`. It is InFlight when the head
  is in any of these but `Held`, and Held when the head is `Held`. W is its `Queued` Attempts in mint order. Under
  Q3's proposal, a lane with a `Kept`, `KeptOpen` or `LettingGo` ending is not Idle either.
- **Facts kept as values, never as side maps:**
  - nothing in the model is a counter, a `Set` or a sentinel;
  - "at most one restore per incarnation" is derived from `endings` by `boot`;
  - nothing is deleted.

### Moves and how `resolve` orders them

`resolve(model, reference, step facts)` turns one step's facts into moves in order. Where a phase depends on a lane,
it looks the lane up; a lookup that finds nothing is its own row (`Unminted`), never a default phase.

- **`Turn`:**
  - becomes `TurnOpens`, then one move per anchored member, in action order: `Commit { policy }`, `Retry`, `Cancel`
    or `CancelAll`, each on the lane its `key` names;
  - each later report applies after those members;
  - the turn closes (`TurnCloses`) at the next `Delivered`, `Turn` or `Reloaded`, or at step end.
- **Reports that are moves:**
  - `Minted` is the effect of a `Commit`; a `Minted` with no open commit member on its lane is I1;
  - a decline's `Ended` is the other effect of a `Commit`;
  - `Sent` becomes `Send`;
  - an Attempt's `Ended` becomes `End { channel, reason }`;
  - `Evidence Released` and `Evidence Superseded` are moves; `InFlight` and `NothingToResend` are not judged here.
- **Suite facts that are moves:**
  - `DisposingRuntime` becomes `DisposalStarts`;
  - `Reloaded` becomes `Reload`, then `BootSettles` at that step's end;
  - `Disposed` and `Forgot` unbind the actor's record;
  - an `Ensured` of an unbound actor becomes `Adopt`.
- **Delivery facts are moves on an ending's life:** `Delivered`, `Issue` (via `ending`), `Parked`, `Unparked`,
  `Recorded`, a `Turn`, `Unhandled` or `Denied` of the delivering actor (the delivery's own turn), and step end.

### The Attempt table

Each phase lists every move. A move not listed for a phase is `Refuse` with the Invariant named in "otherwise", so
the table is total. "⇒ promote" makes the lane's first `Queued` Attempt `Waiting`.

**Idle lane (no addressable Attempt), for lane moves:**

- `Commit` with a `Minted` → the new Attempt is `Waiting`.
- `Commit` with a decline → allowed only for reasons no policy gives (`Unencodable`, `NoPersistence`, `OldVersion`).
  `Rejected` or `Overloaded` there → Refuse I8.
- `Cancel` → nothing. Under Q3, a kept ending of the lane → `LettingGo`.
- `CancelAll` → nothing. A decline `NotSent Cancelled` → Refuse I20 (`p1h.cancel-all-idle-declines`).
- `Retry` → nothing judged (`NothingToResend` is evidence).

**A `Commit` on a busy lane, by policy (R7):**

- `reject`: a decline `Rejected` and no `Minted`. A `Minted` → Refuse I8. This is the S2 M1 probe.
- `latest`:
  - a never-invoked head (`Waiting`) → `Leaving { Superseded }`, and the new Attempt is `Queued`, promoted when the
    head leaves;
  - otherwise a previous `Queued` → `Leaving { Superseded }`, and the new Attempt is `Queued`;
  - a second `Queued` left → Refuse I8;
  - a `Cancelling` head is never superseded (R14's last sentence).
- `serialize`: the new Attempt is `Queued`. A 65th `Queued` → Refuse I8. The 65th must be a decline `Overloaded`.
- `cancel`: the head → `Gone { Replaced }` (its later ending is evidence), and the new Attempt is `Waiting`.

**Per phase:**

- **`Queued`:**
  - promote → `Waiting`;
  - `CancelAll` → `Cancelling { storage: false }`, in mint order (I21);
  - `Reload` → `Restoring { queued }`;
  - `DisposalStarts` → `Flushing`;
  - `Send` → Refuse I11 (promoted while its head stayed: `lane.fresh-mint-on-held`);
  - otherwise Refuse I11.
- **`Waiting`:**
  - `Send` → `OnWire`;
  - `Cancel` → `Cancelling { storage: true }`;
  - `CancelAll` → the queue first, then the same as `Cancel`;
  - `End NotSent { StorageRefused }` → `Gone { NotSent }` ⇒ promote;
  - `Reload` → `Restoring { head }`;
  - `DisposalStarts` → `Flushing`;
  - `End` success, failure or unknown → Ignore (`ending-channels`, I3: no answer for a never-sent Attempt; see Q4);
  - otherwise Refuse I1.
- **`Cancelling { storage }`:**
  - `End NotSent { Cancelled }`, or `{ StorageRefused }` when `storage` → `Gone { NotSent }` ⇒ promote (but not
    under `CancelAll`);
  - `Send` → Refuse I20 (a pending cancel lost to an invoke);
  - `Reload` → `Restoring { head }`;
  - `DisposalStarts` → stays (carried; see Risks);
  - otherwise Refuse I20.
- **`Resending`:**
  - `Send` → `OnWire`;
  - `Cancel` → `Leaving { Released }` (R14: a re-send returns to Held and is released);
  - `CancelAll` → the queue, then `Leaving { Released }`, with no promotion;
  - `Retry` → stays;
  - `Reload` → `Held` (Restore R3: acknowledged, so unknown Restored);
  - `DisposalStarts` → `Held` (R22: nothing new is invoked; a reading, Risks);
  - otherwise Refuse I12.
- **`OnWire`:**
  - `End` success or failure → `Gone { Resolved { inDisposal: mode is Disposing } }` ⇒ promote;
  - `End` unknown, retained → `Held`;
  - `End` unknown, not retained (bare, ignored, or the `cancel` policy's own turn, R4) → `Leaving { Released }`;
  - `Cancel` → `Interrupting`;
  - `CancelAll` → the queue, then `Interrupting`;
  - `Retry` → stays (`InFlight` evidence);
  - `DisposalStarts` → stays (`disposal` judges the bound);
  - `Reload` → `Held` (the fiber died; unknown Restored is owed);
  - `Send` → Refuse I1 (`mutant.double-invoke`);
  - `End NotSent` → Refuse I20;
  - otherwise Refuse I1.
  - In `Disposing`, every `Send` cell is Ignore: `disposal` judges Actors I30 from the server log alone, which keeps
    that check independent of the table.
- **`Interrupting`:**
  - `End unknown { Cancelled }` → `Held` (R14);
  - any other `End` → Refuse I20. This covers T6 M4 and T7 L1: the server's answer cannot move it;
  - step end still `Interrupting` → Refuse I20, unless a `Unstoppable` fact for its operation came by the step's
    end (as today);
  - `Cancel` and `CancelAll` → stay;
  - `Reload` → `Held`;
  - `DisposalStarts` → stays;
  - `Send` → Refuse I1;
  - otherwise Refuse I20.
- **`Held`:**
  - `Retry` → `Resending`;
  - `Cancel` → `Leaving { Released }`;
  - `CancelAll` → the queue, then `Leaving { Released }`, with no promotion; the lane ends Idle;
  - `End unknown { Restored }` → stays, only between a `Reload` and its `BootSettles`, and only if this Attempt has
    no `Restored` ending of this `boot`;
  - `Reload` and `DisposalStarts` → stay. Held survives a reload (S2 M2);
  - `Send` → Refuse I12 (`lane.held-auto-resend`, `mutant.boot-resends-held`);
  - `Evidence Released` → Refuse I12 (T6 H1, S2 H1, T7 M1);
  - any other `End` → Refuse I16;
  - otherwise Refuse I12.
- **`Leaving { evidence }`:**
  - the matching `Evidence` → `Gone { Released | Superseded }` ⇒ promote (but not under `CancelAll`);
  - `TurnCloses` → Refuse I12 for `Released` (T7 M2: the guarded cancel kept its hold) or I8 for `Superseded`.
    The Attempt goes back to the phase it had before the cell, its last anchored state;
  - otherwise Refuse I12.
- **`Flushing`:**
  - `End NotSent { Disposed }` → `Gone { NotSent }`;
  - `Send` → Ignore (`disposal`'s server-log check catches `mutant.disposal-dispatches` as Actors I30);
  - `RuntimeDisposed` or `Reload` while `Flushing` → Refuse. Its Invariant is Q5; today Actors I29 (T7 L8);
  - otherwise stays.
- **`Restoring { was }`:**
  - `queued` with `End NotSent { Restored }` → `Gone { NotSent }`;
  - `head` with `End unknown { Restored }` → `Held`;
  - `BootSettles` with no ending → `Gone { Unborn }` (Restore R3: killed before its batch landed). See Risks: the
    suite cannot yet tell this from a lost restore ending;
  - `Send` → Refuse I1. This is T7 M3's never-sent replay at boot (Restore I2);
  - otherwise Refuse I1.
- **`Gone { why }`:**
  - `Replaced` or `Superseded` with one `End` → stays; its life is `Evidence` (R10: "a replaced never-sent commit",
    "the interrupted Attempt under concurrency cancel");
  - `Resolved { inDisposal: true }` with `End unknown { Restored }` at a later boot → Refuse Actors I36;
  - any other `End` → Refuse I16;
  - `Send` → Refuse I1;
  - `Evidence Released` → Refuse I12;
  - otherwise stays.
- **`Unminted` (a report about an id never minted):** `Sent` → Refuse I1. `Ended` → Ignore (`ending-channels`).
- **`Unstoppable`:** a `Cancel` on `OnWire` of an operation marked `Unstoppable` by the step's end is carried as
  today (see What the design drops).

### The ending table

An `Ended` makes one `Ending`. Its first life is:

- `Evidence` when the reference or the Attempt's phase declares it evidence (R10's list: bare, `Flow.ignore`,
  `Gone { Replaced }`, a releasing lane);
- `OwedAtDisposal` while `Disposing`;
- `Owed` otherwise.

**Per life:**

- **`Owed`:**
  - `Delivered` → `Delivering { first }`;
  - `Parked` → `Parked`;
  - `Recorded { letGo }` after a let-go cause → `Recorded`;
  - any other `Recorded` → Refuse I15 (`a2.deliv-fail-samemail`, `d154.moved-fail-released`, `lie.released`);
  - step end still `Owed` → Refuse I15 (as today: an ending is disposed of in the step that decided it);
  - `Reload` → `Orphaned`, a terminal life: what survives on disk comes back as the endings the boot decides,
    which the restore oracle owns (Restore I5, I6). This is today's rule, now a cell.
- **`OwedAtDisposal`:** `Parked` → `Parked`. `Delivered` → Refuse I15 (`mutant.delivered-during-disposal`).
- **`Evidence`:** `Recorded` → `Recorded`. `Delivered` → Refuse I15 (`mutant.replaced-delivered`).
- **`Parked`:**
  - `Delivered` (at a boot or an adoption) → `Delivering { first }`;
  - `Recorded { letGo }` after `forget` → `Recorded` (R21);
  - `Delivered` mapped to another ending's event → Refuse Actors I29. The event is compared through `mappedEvent`,
    by channel and reason (T6 M1, T7 L3).
- **`Delivering { attempt }`:**
  - the delivering actor's `Turn`, `Unhandled` or `Denied` on the mapped event → `Heard`;
  - an `Issue` naming this ending: `InvalidTurn` with `first` → `Refused`, with `again` or `kept` → `Kept`;
    `UnmappedEnding` → `Kept` at once (final, as today: there is no mapping to try again);
  - another `Delivered` → Refuse I15;
  - step end still `Delivering` → Refuse I15 (a delivery is run, refused, unhandled or denied in its step).
- **`Refused`:**
  - `Delivered` → `Delivering { again }`;
  - step end still `Refused` → Refuse I15 (`1b.r8-refused-ending-not-redelivered`);
  - `Reload` → `Kept`.
- **`Kept`:**
  - `Reload`, then the actor's first incarnation, or `Adopt` → `KeptOpen`;
  - a let-go cause (Q3: a cancel or cancelAll on its lane, `forget`, a local life's end, a releasing lane) →
    `LettingGo`;
  - `Delivered` → Refuse Actors I24 (T7 M4's leniency 3: no boot or adoption since its last try).
- **`KeptOpen`:** `Delivered` → `Delivering { kept }`. Step end with no try → Refuse Actors I24 ("never lost").
- **`LettingGo`:** `Recorded { letGo }` → `Recorded`. Step end → Refuse I15 (`lost.letgo-silent`).
- **`Heard` and `Recorded`:** `Delivered` → Refuse I15 (twice). `Recorded` → Refuse I15 (both).

A step with two pending deliveries is no longer ambiguous, because each `Issue` names its ending (T7 M4's leniency 4).
Another `InvalidTurn` in the step names another ending, so it excuses nothing (leniency 1).

## Which oracle judges what

- **`lane-queue`:**
  - guarantee: WriteLanes I1, I8, I9, I10 (proposed), I11, I12, I20 and I21;
  - folds its own model;
  - its own views: W bounds, and the order of members' effects (I10, I21);
  - judges at turn close and at step end.
- **`delivered-once`:**
  - guarantee: WriteLanes I15 and I16, and Actors I24 (proposed; it moves out of `not-yet.ts`);
  - folds its own model;
  - judges at step end and at boot end.
- **`disposal`:**
  - guarantee: Actors I29, I30, I31, I32, I35 and I36;
  - folds its own model;
  - its own state: `Window { since, onWire }` and the clock;
  - judges at boot end, at the bound and at `RuntimeDisposed`.
- **`ending-channels`:** WriteLanes I3, with no model. Unchanged.
- **`attempt-identity`:** WriteLanes I6, with no model. It adds one check: `Minted.key` against its requests' key
  fields.

**`disposal` without a ledger:**

- **I29 and I32:** at each `BootSettles` after a disposal or forget (bound actors), and at each `Adopt` (unbound ones),
  every Attempt of that actor in a non-Idle phase shows its lane. It shows either one `unknown Restored`, or its parked
  ending delivered as that ending's mapped event.
- **I30:** as today, from the server log alone. No request, write or read, reaches the server between
  `DisposalStarts` and the next reload. This keeps the check independent of the table.
- **I31:** the order within one lane's deliveries or parkings in a group, with the hold-leaving ending last.
- **I35:** each Attempt in `onWire` at the start is open while the model has it `OnWire` with no `Answered`, settled
  while it is `OnWire` with an `Answered` (through `endingOf`), and done once it leaves `OnWire`. The window stores
  only `since` and the ids. The rest is derived.
- **I36:** the `Gone { Resolved { inDisposal } }` refusal.

## Earlier findings, mapped

New case and mutant names are proposed. "kept" means an existing mutant still proves the fix.

- **T6 H1, S2 H1 (quiet `Released`):**
  - removed by: `Held` + `Evidence Released` → Refuse I12; only `Leaving` admits it;
  - proved by: `lie.held-released-unguarded`, `lie.release-on-guarded-read` (kept).
- **T6 M1, T7 L3 (parked ending's channel):**
  - removed by: `Parked` compares the event through `mappedEvent`; no lenient `onNone`;
  - proved by: new `mutant.parked-delivered-as-other-tag` (DISP-06), Actors I29.
- **T6 M2, M3 (disposal machines, ledger table):**
  - removed by: ledger and kept lanes deleted; one table; `Window` stores facts only;
  - proved by: existing disposal mutants (kept).
- **T6 M4, T7 L1 (cancel on the wire):**
  - removed by: `Interrupting` admits only `unknown Cancelled`;
  - proved by: `lane.cancel-wire-as-never-sent` (kept); new `mutant.wire-cancel-answer-wins` (LANE-04), I20.
- **T6 M6 (`Never`):**
  - removed by: `endingOf` stays the one rule; I35 derives settled from `Answered`;
  - proved by: `mutant.short-disposal-bound` (kept).
- **S2 M1 (keyed lanes after first send):**
  - removed by: `Minted.key` required; `Commit` under `reject` refuses a `Minted`;
  - proved by: new `lane.reject-queues` (PAY-02), I8.
- **S2 M2, T7 M5 (reload drops `Held`; rejoin):**
  - removed by: `Held` + `Reload` → `Held`; Attempts never leave the model;
  - proved by: `mutant.boot-resends-held` (kept); round-14's revived head now judged.
- **S2 M4, T7 M4 (refusal counted):**
  - removed by: `Issue.ending`; `Delivered` per admission; `Refused` → `Kept` → `KeptOpen`;
  - proved by: `1b.r8-refused-ending-not-redelivered` (kept); new `1b.r8-third-try` (DLV-04), I15; new
    `mutant.kept-retried-without-boot` (DLV-04), Actors I24; new case DLV-05 (an unrelated `InvalidTurn` and two
    pending deliveries in one step).
- **S2 M5 (in-place state):**
  - removed by: `advance` is pure; the model is immutable;
  - proved by: unit test: `advance` leaves its input equal.
- **T7 M1 (a cancel of one lane anchors another):**
  - removed by: `Cancel` moves only the lane its member's key names;
  - proved by: new case PAY-17 (two intents, one Held); new `lie.release-other-lane`, I12.
- **T7 M2 (guarded cancel one way; `void`):**
  - removed by: the row anchors; `Leaving` must release by `TurnCloses`; members choose `VoidUnsure`'s row;
  - proved by: new `lane.guarded-cancel-keeps` (PAY-03), I12; new case PAY-18 (`void` lost four times); new
    `lie.void-retry-releases`, I12.
- **T7 M3 (`Minted.key` not enforced):**
  - removed by: boundary breach; `Restoring` + `Send` → I1; key checked against requests;
  - proved by: new case PAY-19 (reload before the first send); new `mutant.boot-replays-never-sent`, I1; new
    `mutant.mint-key-differs`, I6.
- **T7 L2 (unknown at request time in the minting step):**
  - removed by: moves follow report order (`Sent` before `Ended`), not `Requested`;
  - proved by: new trace in `lifecycle.traces.ts`.
- **T7 L6 (sentinels, duplicate owners):**
  - removed by: no counters, sentinels or default policy; the owner comes from `Ending.actor`;
  - proved by: lint and review.
- **T7 L7 (`Transition` untyped):**
  - removed by: rows typed by the fixture's events, states and operations;
  - proved by: `nub run check`.
- **T7 L8 (I29 for a never-sent at disposal):**
  - removed by: `Flushing` at `RuntimeDisposed` or `Reload` → Refuse; its Invariant is Q5;
  - proved by: `mutant.disposal-skips-never-sent` (kept).
- **T7 L9 (unknown ending of a never-sent Attempt):**
  - removed by: `Waiting` + `End unknown` → Ignore, judged by `ending-channels` (Q4);
  - proved by: new `mutant.unsent-ends-unknown`, I3.
- **T6 L9, S2 L1 (keyless cancel guesses):**
  - removed by: members carry the resolved key;
  - proved by: PAY-17.
- **S2 L2 (`idleCancel` across actors):**
  - removed by: the lane includes the actor;
  - proved by: trace.
- **S2 L8 (cross-actor decline owner):**
  - removed by: `Ending.actor` is required for a decline's life;
  - proved by: trace.
- **S2 L9 (repeated `Minted` silent):**
  - removed by: a second `Minted` of a known id → Refuse I1 (no open commit member);
  - proved by: trace.
- **T7 M5 (RC2 threshold):**
  - removed by: this design;
  - proved by: the cell-mutation test and the traces.

S2 M3 and the record-drift Lows (RC4) are process items. This design adds one: the migration's log, below.

## Spec gaps for the user (from DLV-04)

Each question has options, before and after, and a recommendation. A change to an Invariant's text is a **guarantee
change** and needs the user's yes.

**Q1. WriteLanes I15 says "a second refusal is final"; Actors R15 and I24 give a kept ending one try per boot or
adoption.**

- **The clash:** I15 counts "per incarnation", and a boot starts a new incarnation. So a kept ending's boot try is
  the first delivery of that incarnation. If it is refused, I15's exception would grant another redelivery after
  queued mail. That breaks I24's "at most once per boot or adoption".
- **A (guarantee change):** reword I15's clause.
  - Before: "an ending whose admission refused its turn … is delivered once more after queued mail, and a second
    refusal is final".
  - After: "… is delivered once more after queued mail; a second refusal ends its tries until the next boot or
    adoption, which each give it exactly one try, with no redelivery after a refusal (Actors R15, I24)".
- **B:** keep the text, and have `delivered-once` read "final" per boot. The oracle then judges something the
  Invariant does not say (T6 M5's kind of drift).
- **Recommendation: A.**

**Q2. Does the first refusal raise an issue?** Actors R15 says only that the second refusal's issue "names the
cause".

- **A (Requirement change, no Invariant change):** each refusal reports one `InvalidTurn` issue that names the ending
  and the cause.
  - After, in Actors R15: "each refusal reports an issue naming the ending and its cause; the second refusal is
    final".
  - For: round-14 already raises both. Without the first one, the redelivery has no visible cause. It is also what
    lets the suite judge I15 without counting.
- **B:** only the final refusal raises an issue. The first refusal is then visible only as a missing turn, and the
  oracle must count again.
- **Recommendation: A.** The Port change above assumes it.

**Q3. A kept ending's lane state, how it is let go, and whether it keeps its actor alive.**

- **Q3a, lane state:**
  - **A (guarantee change to I8):** the kept ending is a value on the lane, apart from the lane's state. The state
    follows its Attempt (Idle after a definite ending, Held after an unknown). The lane exists and blocks its key
    while the kept ending stands. `idle` denies (I13 already says so), and a commit on the key acts as on a non-Idle
    lane: `reject` declines `Rejected`, `latest` and `serialize` queue, and the queue is promoted when the ending is
    heard or let go.
    - Before, I8: "A lane exists iff it is not Idle; …".
    - After: "A lane exists iff it is not Idle or holds a kept ending; …".
  - **B:** a fourth lane state, `Kept`, in R6's list and every cell. This is a larger change for the same behaviour.
  - **Recommendation: A.**
- **Q3b, letting go (Requirement change to R14, no Invariant change):** a kept ending is let go, recorded as
  `Recorded { letGo }`, with the queue's head promoted, by any of:
  - a cancel or cancelAll on its lane (R14 gains: "a kept ending: let go, with no ending");
  - `forget` (R21 already makes parked endings evidence);
  - the end of a local actor's life;
  - a releasing lane (R16).

  Heard means its try's turn ran. **Recommendation: adopt.**
- **Q3c, does a kept ending keep its actor alive?**
  - **A (no Spec change; one clarifying sentence in R15):** no. Actors' WorkInFlight is "an InFlight write lane, a
    kept read, or an ending owed at ready", which does not include a kept write ending. A local actor with no use
    ends at its grace, and its kept ending is let go. A persisted actor ends, and the ending stays parked on its
    lane for the next boot or adoption (R17: disposal drops no lane).
  - **B:** make a kept ending WorkInFlight. Its tries come only at a boot or an adoption, so this would pin a local
    actor forever.
  - **Recommendation: A.**

**Q4. Which Invariant forbids an unknown or definite ending of an Attempt that was never sent (T7 L9)?** None states
it. T6 M5 proposed rewording I3 so that it covers endings without an answer ("without an answer only unknowns and
Flow's declines"); that is a guarantee change, still open. **Recommendation:** take T6 M5's I3 rewording, and add
"an Attempt never sent ends only NotSent, or unknown Restored at a boot". `ending-channels` judges it.

**Q5. R22's "a never-sent queued commit ends NotSent { Disposed }" has no Invariant (T7 L8).**

- **A (guarantee change):** add a sentence to Actors I29, "and every never-sent commit of it ends NotSent { Disposed }
  before the disposal ends".
- **B:** a new Invariant.
- **Recommendation: A.** Then `mutant.disposal-skips-never-sent` names the clause it breaks.

## What the design drops

The oracle code at `f85aa15e` (2,853 lines in the nine files below) was read only after the sections above were
written.

**Files deleted:**

- `write-lanes/lane-model.ts` (418 lines):
  - its `Phase` (`Queued | Waiting | Wire | Held { at } | Replaced`);
  - `Known` with its optional `lane`;
  - `CancelPending { from }`, `drivenTurns`, `permittedResend` and `placedBySend`;
  - `joined`, `without`, `superseded` and `end`;
  - the default policy for a missing `Known`.

  `Held { at }` and `drivenTurns` existed to tell a retry's re-send from an automatic one. The `Resending` phase does
  that, set by an anchored retry member. `CancelPending { from }` is the history that `Cancelling` and
  `Interrupting` now carry as phases.
- `write-lanes/ending-lives.ts` (136): `Owed { inDisposal, lastTry }` becomes `Owed`, `OwedAtDisposal` and
  `Delivering { attempt }`. `Refused { event }` becomes `Refused`, with the event derived through `mappedEvent`.
  `Kept` is split into `Kept`, `KeptOpen` and `LettingGo`.
- `write-lanes/written-attempts.ts` (104): `Written`'s `sent`, `decided` and `replaced` flags (`none | maybe | sure`)
  are the Attempt's phase. "maybe" existed only because keys were unknown until the first send.
- `actors/disposal-ledger.ts` (346):
  - its phases (`Minted | OnWire | ReWire | Held` and `Answered | EndedUnsent | Cancelled | Claimed`), its move table
    and its mutable `Map`;
  - `Claimed`, which settled a head on any `Released` or `Superseded`; that is what T7 M1 exploited.
- `actors/disposal-kept.ts` (224): `KeptLane` becomes `Dropped`, `Gone { Resolved { inDisposal: true } }` until a
  later Attempt of the lane, and `Unbound`, the actor's `Record.Unbound { by }`.

**Changed:**

- `write-lanes/lane-queue.ts`:
  - goes:
    - the pending-turn baseline ("judge a cancel from the model at the step's previous `Turn`");
    - the reload baseline;
    - `cancelOne`'s "one addressable head of the actor's operation";
    - `unanchoredReleases` ("any turn of the owner on a cancel or may-cancel event");
    - `idleCancel`'s window scan;
  - kept as views over the lifecycle: `queueEnded` and `holdLast` (I21's order), `unended` (I20 on an interruptible
    wire cancel at step end, with `Unstoppable`) and `bounds` (I8);
  - claims I10 (proposed).
- `write-lanes/delivered-once.ts`:
  - goes:
    - `Pending` and the `secondRefusals` path;
    - "an `InvalidTurn` with nothing pending counts as a second refusal";
    - "a `Delivered` with none owed takes a kept one";
    - `withCause`'s replacement guess;
    - the lookup that finds the owner twice;
  - kept as cells, with the same rules: the step-end "nothing owed" check, the disposal park rule, `UnmappedEnding`
    as final, a reload orphaning what is owed, and `forget` excusing a record;
  - claims Actors I24.
- `actors/disposal.ts`:
  - goes: `Life.Disposing`'s per-call `Call` state;
  - becomes: the window `{ since, onWire }` with call states derived;
  - kept: I30 from the server log, I36's row read (`Read` not `uncertain`), I31's order and the bound's clock;
  - now judged: a re-send on the wire at the disposal's start (the old Gotcha said it was not told apart);
  - changed: I29's held set comes from the lifecycle, no longer from the server's answers (see Risks).
- `dsl/domain.ts`: `laneAtSend` goes, since a keyed lane comes from its mint. `LaneId`, `sameLane`, `laneOf`,
  `endingOf` and `mayHaveApplied` stay. `attemptKey`'s template string goes (S2 L3), because the model keys nothing
  by string.
- `fixtures/reference.ts` and `fixtures/pay.ts`: `cancels`, `mayCancel` and the untyped `Transition` give way to the
  typed alternatives table.

**Stated limits removed:**

- keyed lanes judged after the first send;
- the reload baseline;
- "two pending deliveries make a refusal unattributable";
- "another `InvalidTurn` excuses a missing redelivery";
- "a third try in the same step is not seen";
- "a lost kept ending passes";
- the `void` Gotcha (no transition can express its cancel);
- "a re-send on the wire at the disposal's start is not told apart".

**Stated limits kept:**

- `Unhandled` and `Denied` carry no actor, so they settle a delivery by event;
- a parked ending still parked at the case's end is not checked;
- the end of a case re-attaches with `ensureExisting`, which reads as an adoption (T6 L8);
- causes the fragment fixtures will show (a releasing lane, an ended fragment's lookup);
- time is counted per step.

**Size:** the nine files hold 2,853 lines. The estimate after migration is about 1,400:

- `dsl/lifecycle.ts`, about 450;
- `lane-queue`, about 300;
- `delivered-once`, about 250;
- `disposal`, about 300;
- `domain.ts`, about 120;
- the traces and the test, about 400 more, in test code.

## Migration order

Each step lands with `suite`, `suite --runtime null`, the falsify sweep diff and `nub run check`. Every changed verdict
is logged with its rule (Conformance R11), and a reviewer sidecar checks each oracle change.

1. **`dsl/lifecycle.ts`, `lifecycle.traces.ts` and `lifecycle.test.ts`**, with the cell-mutation test. No oracle uses
   them yet. The gate: every cell is reached, and every cell mutation is killed. Cells that wait on Q1, Q3 or Q4 are
   marked pending in the traces.
2. **The additive Port fields:** `Turn.members`, `Issue.ending`, and decoding `Minted.key` at the boundary. Then the
   round-14 notes and the adapter. This step is verdict-neutral: the old oracles ignore the new fields.
3. **The reference rows** replace `cancels` and `mayCancel`, typed. A change-detector test (labelled as one) compares
   the rows with the Compiled transitions that carry lane members.
4. **`lane-queue` on the lifecycle, together with the `Turn` reorder** (the old baselines depend on the old order),
   plus `lane.guarded-cancel-keeps`, `lie.release-other-lane`, `lane.reject-queues`, `mutant.boot-replays-never-sent`,
   and cases PAY-17, PAY-18 and PAY-19.
5. **`delivered-once` on the lifecycle, together with `Delivered` on every admission**, plus Actors I24 in its
   guarantee (with the `not-yet.ts` row removed), DLV-05, `1b.r8-third-try` and `mutant.kept-retried-without-boot`.
6. **`disposal` on the lifecycle:** `disposal-ledger.ts` and `disposal-kept.ts` are deleted, and
   `mutant.parked-delivered-as-other-tag` is added.
7. **`attempt-identity`'s key check**, with `mutant.mint-key-differs`.
8. **The old models are deleted** (listed below), and the README, STATUS and mutant headers are updated.
9. **policy-convergence step 7:** one adversarial review of this proposal and the code. Then one revision, into a new
   proposal.

## Risks

- **Common mode remains for the table's definition.** The four defences reduce it but do not remove it: a trace
  derived wrongly from the Spec defends a wrong cell. The adversarial review in step 9 should read the traces against
  the Spec, not against the table.
- **Reported member keys are claims.** Suppose a runtime evaluates a key selector wrongly and reports that wrong key
  consistently. The lane oracles then judge the lane it names, and only case expectations on rows catch the wrong
  key. A commit's key is checked against the requests' key fields, but a cancel's key is checked against nothing.
- **Reordering `Turn` in round-14 may move `find` strings** that existing mutants edit. Every mutant must still apply
  exactly once (falsify reports "not applied" otherwise, which is loud). If the note cannot move, the adapter buffers
  a turn's notes, which is riskier.
- **`Restoring` + `BootSettles` → `Unborn`** cannot tell an Attempt whose batch never landed from one whose restore
  ending was lost. The fix is a suite storage fact (`Stored`) in the timeline, which needs a Conformance R1 reading of
  what a storage fact may say. Until then, this is a stated limit.
- **Readings to confirm against the Spec in step 9:**
  - `Resending` + `DisposalStarts` → `Held`;
  - `Cancelling` + `DisposalStarts` stays;
  - when a `KeptOpen` try must come (the boot step's end).
- **`disposal` now trusts `Ended`.** Its held set used to come from the server's answers. Now it comes from the
  lifecycle, which moves on the runtime's `Ended`. A runtime that ends a call falsely (success with no answer, say)
  drops that lane from I29's view. `ending-channels` (I3) catches that lie first and independently, so the case
  still fails, but by another pair. A mutant written for I29 must not depend on a false `Ended`.
- **Verdicts change on purpose** in steps 4 to 6. The R11 log must list each change.
- **I10 is a new claim.** It needs its own mutant (a turn's members applied out of action order) before T41's gate
  counts it.
