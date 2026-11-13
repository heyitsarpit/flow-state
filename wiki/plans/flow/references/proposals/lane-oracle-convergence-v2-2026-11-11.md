# Lane oracle convergence, v2 (2026-11-11, proposed)

**Bottom line:** one lifecycle, folded once per Case. It has three total tables and one list of obligations:

- Table A: an Attempt's progress, 8 phases;
- Table B: the lane's members, keyed by the head's phase and the member;
- Table C: an ending's delivery, 8 lives;
- obligations: what a turn, boot or cancel still owes, kept beside the phases.

The lane is derived, never stored. A refused claim never moves the model. The lifecycle oracles (`lane-queue`,
`delivered-once`, `disposal`) read the one fold and report the refusals whose Invariant they own.

Common mode is accepted on purpose. It is paid for by four things:

- Spec-derived traces, with a mutation of every cell and every guard value;
- the refused-move rule;
- the independent judges: `ending-channels`, `attempt-identity`, `disposal`'s server-log check of I30, and the case
  expectations;
- the runtime mutants.

The Port changes in seven places. The one new tag is a pair of incarnation reports. Eleven Spec questions go to the
user (CQ1 to CQ11). Everything here is proposed.

This file revises `lane-oracle-convergence-2026-11-11.md` (v1, kept as prior art). It applies every finding of
`lane-oracle-convergence-review-2026-11-11.md` at once (skill:policy-convergence, step 8). The direction is
unchanged: one closed life per Attempt and per ending, a derived lane, members on `Turn`, `Issue` naming its ending,
and `Minted` checked at the boundary.

## What changed from v1, by finding

- **H1:**
  - phases record progress only; position is derived;
  - what a turn, boot or cancel awaits is an `Obligation`;
  - `Leaving` and `Cancelling` go;
  - promotion is one derived rule.
- **H2:**
  - the seven refused-but-legal cells are fixed;
  - new moves `Incarnated`, `Finished` and `Adopt`;
  - `Restored` is counted per incarnation.
- **H3:** three tables, each keyed by (phase or life, move, the named guard inputs), with an explicit cell for every
  key and no "otherwise".
- **H4:**
  - one fold per Case, not three equal folds;
  - common mode is stated as accepted;
  - every distinction that no cell reads is merged, so every mutant can be killed;
  - guard values are mutated too;
  - the separate reach check is dropped.
- **H5:**
  - the mint, delivery and decline notes carry `actor`, and the mint also carries `key`;
  - this lands before the `Turn` reorder;
  - Risk 3 is corrected.
- **M1:** `Member` gains the kind `release` and a `target` (one lane, a key, or every lane). `Issue.ending` is
  `None` for firings and module mail. Module deliveries are excluded by name.
- **M2:**
  - a delivery during disposal is judged for every life;
  - an ending decided during disposal parks at the reload;
  - the four I35 violations are stated;
  - the adoption check covers Held heads only, gated on a reported incarnation;
  - every verdict change is listed.
- **M3:** findings that wait on a Spec answer are marked pending. T6 L7, L10 and L11, S2 L5 and Restore I6's lower
  bound are now mapped.
- **M4:**
  - the questions are renumbered CQ1 to CQ11, with citations fixed;
  - Superseded promotion is CQ7;
  - a row mismatch is no longer called I10;
  - the idle cancelAll check is WriteLanes I21's.
- **L1:** 8 phases and 8 lives. `GoneWhy` has three values, and `Heard`, `Recorded` and `Orphaned` are one sink.
- **L2:**
  - tied rows are chosen by a guard the suite can compute, where one exists;
  - Risk 6 is corrected;
  - `LaneId`'s missing version is a stated limit;
  - R10's evidence list is cited, not restated.

## Root causes (unchanged from v1)

- **RC1, unanchored claims:** a report, or a count of reports, was taken to say which lane, head or ending it
  concerns.
- **RC2, no closed lifecycle:** each oracle rebuilt an Attempt's life from its own facts, so phases were invented
  from missing entries and lives were spread over collections.
- **RC3, lane identity from the wrong facts:** only a mint or a member names a lane's key.
- **RC4, a turn is not one unit:** a `Turn` came after its own reports.

v1 added a fifth by mistake, which the review named. It mixed **position, progress and obligation** in one variant.
The rule for v2: a phase says how far an Attempt has got, the lane derives where it stands, and an obligation says
what is still owed and by when.

## Requirements, together

v1's twelve requirements still hold. These are added or sharpened:

1. **Position is derived:**
   - the head is the first addressable Attempt of a lane in mint order;
   - W is the lane's `Queued` Attempts in mint order;
   - addressable means `Unsent`, `Resending`, `OnWire`, `Interrupted`, `Held` or `Restoring { head }`;
   - at most one is addressable by construction (WriteLanes I9).
2. **Progress moves only on the report that shows it.** A member's effect is an obligation until its report arrives.
   An unmet obligation is a refusal at its deadline, and the phase stays where the runtime left it.
3. **Promotion is one rule:** when a lane's head leaves (its phase becomes `Gone`), the lane's first `Queued` Attempt
   that owes nothing becomes `Unsent` (WriteLanes I11). It is not a table cell. It is tested by traces and by its own
   mutants (promote never, promote the second, promote one that owes something).
4. **Actor life is in the model:** an incarnation begins, ends at its grace or is disposed, and an unbound lane is
   adopted (Actors R8, R9, R10, R20, R21). `Restored` once per incarnation (Restore I6, WriteLanes I15) and a kept
   ending's try (Actors R15, I24) are judged per incarnation.
5. **Every cell input is a named field of the move or the phase.** No cell reads anything else.
6. **Each distinction in a type is read by at least one cell or one named oracle view.** Otherwise it is merged.

## The decision: fold once per Case

**One fold, computed by the Case. The state is shared knowingly.** v1's three separate folds of one pure `advance`
were equal at every step, so they added no independence. What stops one oracle's caught lie from blinding another is
the refused-move rule, and that works with one fold too.

- **The contract (`dsl/oracle.ts`):** `Judge.step(state, step, requests, lives)`. Here
  `lives: LifeStep = { before: Model; after: Model; applied: ReadonlyArray<Applied> }`, and
  `Applied = { move: Move; refusals: ReadonlyArray<Refusal> }`.
- **The fold:** the Case runs `lifecycle.step(model, reference, facts)` once per step, before the oracles.
- **Who uses it:**
  - each lifecycle oracle reports the refusals whose Invariant is in its `guarantee`, and reads `before`, `after`
    and `applied` for its own views;
  - `ending-channels` and `attempt-identity` ignore `lives`.
- **Why:** three equal folds cost three times as much and bought nothing. This is S1's step-fold contract, with one
  shared derived view, and the simplicity review's "share the pattern, not the state" is overridden on purpose. T7
  M5 showed that four hand-rolled models failed four ways, and one model with stated defences fails less.
- **To reverse:** give each Judge its own fold of the same `step`. The contract goes back to three arguments, and
  nothing else changes.

**Common mode, stated plainly.** A wrong cell is wrong for every lifecycle oracle at once. It is caught by:

1. **Traces and mutation.**
   - `dsl/lifecycle.traces.ts` holds traces derived from the Spec. Each one cites its rule and gives the expected
     refusals, and includes lies.
   - `lifecycle.test.ts` replaces each cell, at each guard value, with every other outcome of its table. That
     includes each other phase or life, each `Refuse` Invariant, and stay.
   - It also mutates the deadline table and the promotion rule.
   - The gate: every mutant is killed by some trace. A cell no trace reaches cannot be killed, so the old separate
     reach check goes.
   - Only cells excluded by type are not mutated (see "unreachable" below).
2. **The refused-move rule:** a refused move leaves the model at the runtime's last anchored state, so a lie one
   oracle catches does not blind another.
3. **The independent judges:**
   - `ending-channels`: WriteLanes I3, from the server's answers and `endingOf`;
   - `attempt-identity`: WriteLanes I6, plus each mint's key against its requests' key fields;
   - `disposal`: Actors I30 from the server log alone;
   - the case expectations: rows, counts and state.
4. **The runtime mutants:** they run through the whole stack, so a table bug that blinds a pair shows as a mutant
   that survives.

A unit test checks that every `Refuse` Invariant and every deadline Invariant is in exactly one lifecycle oracle's
`guarantee`.

## The Port changes

Round-14 can meet all of them. Each one names its site.

1. **`Turn.members: ReadonlyArray<Member>`:**
   - `Member = { operation; kind; target }`;
   - `kind` is one of `commit`, `retry`, `cancel`, `cancelAll` and `release`;
   - `target` is `Only` (an unkeyed operation's one lane), `Key { key }`, or `Every` (a key-less cancel outside an
     ending, which acts on every lane of the operation for that actor: `turn.ts:752-757`);
   - `lookup` and `module` members are not reported;
   - members are known before any cell runs (`turn.ts:667`). A key-less member in an ending names its own Attempt's
     lane, which is fixed, so the note can resolve it early.
2. **`Turn` before its members' reports:** the `turn` note moves above `applyMembers` (`turn.ts:954`). This lands
   after change 3.
3. **Every note carries `actor`:**
   - the mint note carries `actor` and `key` from `CellArgs` (`lane.ts:178-181`; `byAttempt` does not hold the key at
     mint, since `world.ts:425-430` writes it later);
   - the delivery note carries `actor` from `deliver()` (`turn.ts:1202-1206`), and so does a decline's ending;
   - the adapter's next-`Turn` attribution (`prototype-observations.ts:191-201`) goes;
   - this closes Conformance Q3's decision 10.
4. **`Issue.ending: Option<EndingRef>`:**
   - `EndingRef = { operation; attempt: Option<string>; actor: ActorRef }`;
   - it is `Some` on an `InvalidTurn` or `UnmappedEnding` of an operation's ending (the refused `item` at
     `turn.ts:1276`), and `None` for a schedule firing, module mail and every other issue;
   - plumbed through `prototype.ts:85`, `:361` and `port.ts:172`.
5. **`Delivered` on every admission of an operation's ending:**
   - this includes the ordinary redelivery after a refusal; a kept ending's try is already reported
     (`turn.ts:1206`, `|| item.kept`);
   - module deliveries are not operation endings and stay unreported, by name;
   - round-14's `d123.delivered-silent-at-boot` (`mutants-r9b.ts:45`) needs a new anchor.
6. **`Minted` decoded at the boundary:** an `actor` of `None`, or a keyed operation's `key` of `None`, is a `Defect`
   naming the field.
7. **New: `Incarnated { actor }` and `Finished { actor }`:**
   - an incarnation began (created, restored at a boot, returned, or adopting), or ended at its grace;
   - round-14 already notes both (`step.ts:397`, `:455`, `:691`, `:710` `incarnation`; `:592` `ended`; `:644`
     `returned`);
   - `Incarnated` is anchored: it counts only after a suite `Ensured`, `Drove` or `Reloaded` of that actor in the
     same step, and an unanchored one opens nothing;
   - `Finished` is a claim that unbinds lanes. It is cross-checked by the suite's uses (a held use plus `Finished`
     is not ours to judge; it is Actors I11's, owned elsewhere).
   - Why a tag: grace end and return cannot be derived from suite facts. Work in flight includes reads the model
     does not track (Actors R7).

## The reference

`OperationReference.cancels` and `mayCancel` give way to a typed table per machine of the alternatives that run lane
members (v1's rows, unchanged), with two additions:

- **`guard`:** a row may carry a guard the suite can compute. Today that is only `retryable: n`, counted from the
  server log's sends of the head Attempt. Such a row is chosen by the suite, not by the reported members.
  - Pay's `VoidUnsure` rows become `[void.retry]` with `retryable: 3`, and `[void.cancel]` otherwise.
  - Pay's `IntentRead` UNSURE→PAYING row carries `retryable: 3`.
- **`unknown`:** each operation's unknown mapping is stated as one of an event name, `"ignore"` or `"bare"`. Together
  with `concurrency` this gives `End.retained` (WriteLanes R4). The missing mappings that v1's cells read are now
  data.

**Matching:**

- A `Turn` anchors its members when exactly one row matches its event, from and to, and its guard (where it has one),
  and the row's members equal the reported ones by operation and kind, in order.
- A mismatched `Turn` anchors nothing. Its effects are then unanchored, and each is refused under its own
  Invariant.
- The mismatch itself is no Invariant violation (v1 wrongly called it I10).
- WriteLanes I10 is judged only as order: the reports a turn's members cause come in member order.

## The lifecycle

### Types

```ts
type LaneId = { readonly actor: ActorRef; readonly operation: string; readonly key: Option<Json> };

type Phase = Data.TaggedEnum<{
  Queued: {};                       // in W; never invoked
  Unsent: {};                       // addressable once it is the head; never invoked
  Resending: {};                    // sent before; a retry admitted its re-send; not invoked yet
  OnWire: {};                       // invoked; no ending yet
  Interrupted: {};                  // on the wire, cancelled; ends unknown Cancelled (or Disposed past the bound)
  Held: {};                         // its last ending was a retained unknown
  Restoring: { head: boolean };     // never sent when its page died; awaits its restore ending
  Gone: { why: "closed" | "evidence" | "settledInDisposal" };
}>;

type Obligation = Data.TaggedEnum<{
  Await: { attempt: string; report: "Released" | "Superseded" | "NotSentCancelled" };  // by TurnCloses
  PendingCancel: { attempt: string; ends: "NotSent" | "UnknownCancelled" };            // by its ending (R14)
  AwaitRestore: { attempt: string; incarnation: number; cause: Cause };                // by StepEnds
  AwaitLetGo: { ending: number };                                                      // by StepEnds
}>;
type Cause = "plain" | "runtimeDisposal" | "disposeActor" | "forget";

type Life = Data.TaggedEnum<{
  Owed: {};
  Parked: {};
  Delivering: { retry: boolean };   // retry: a redelivery or a kept try, whose refusal keeps it
  Refused: {};
  Kept: {};
  KeptOpen: {};
  Evidence: {};                     // evidence by declaration (WriteLanes R10, I15)
  Closed: {};                       // heard, recorded, or orphaned at a reload
}>;

type Ending = {
  readonly attempt: Option<string>; // None: a decline
  readonly operation: string;
  readonly actor: ActorRef;
  readonly channel: Channel;
  readonly reason: string;
  readonly incarnation: number;     // the actor's incarnation when it was decided
  readonly inDisposal: boolean;     // decided during Runtime disposal
  readonly life: Life;
};

type Model = {
  readonly mode: "running" | "disposing";
  readonly actors: ReadonlyArray<{
    readonly actor: ActorRef;
    readonly record: "bound" | "grace" | "disposeActor" | "forget"; // the last three: unbound, and why
    readonly incarnation: number;   // the ordinal of its latest anchored `Incarnated`
  }>;
  readonly attempts: ReadonlyArray<{ readonly id: string; readonly lane: LaneId; readonly phase: Phase }>;
  readonly endings: ReadonlyArray<Ending>;
  readonly obligations: ReadonlyArray<Obligation>;
  readonly releasing: ReadonlyArray<LaneId>; // WriteLanes R16; endings on these lanes are Evidence
};
```

- **Counting:** v1 claimed no counters, which was wrong. The model holds ordinals (an actor's incarnation number,
  and the incarnation an ending belongs to). These are facts the suite numbers as they happen, not counts kept
  beside a list. Nothing is a `Set`, a sentinel or deleted.
- **What each distinction is for (requirement 6):**
  - `Restoring.head`: which restore ending is allowed;
  - `Gone.why`: `evidence` admits one late `End`, `settledInDisposal` makes a later `Restored` an Actors I36
    violation, and `closed` admits only an ending a pending cancel owes;
  - `Delivering.retry`: whether a refusal is the first;
  - `Ending.inDisposal`: Table C's reload cell;
  - `record`: which Invariant an `AwaitRestore` reports.
- **The model's moves:**
  - from the Port: `Send`, `End`, `Evidence`, members (Table B), `Delivered`, `Issue`, `Parked`, `Unparked`,
    `Recorded`, `Incarnated` and `Finished`;
  - from the suite: `DisposalStarts`, `RuntimeDisposed`, `Reload`, `Disposed`, `Forgot` and `Adopt` (an `Ensured`
    of an unbound actor);
  - at instants: `TurnCloses` (at the next `Delivered`, `Turn` or `Reloaded`, or at step end), `BootSettles` and
    `StepEnds`.
- **`Heard`:** the delivering actor's `Turn`, `Unhandled` or `Denied` on the mapped event. It moves only a
  `Delivering` life.

### Table A: an Attempt's progress, by (move, phase)

Cells: a phase name moves there, `=` stays, and `!X` refuses with Invariant X (WriteLanes unless prefixed `A-` for
Actors). `⇑` means the head left, so the promotion rule runs. Superscripts name guards, defined below the table.

```text
move \ phase        Queued   Unsent   Resend   OnWire   Interr   Held     Restor   Gone
Send                !I11     OnWire¹  OnWire   !I1      !I1      !I12     !I1      !I1
End success|failure !I11     =²       !I16     Gone⇑³   !I20     !I16     !I16     !I16
End NotSent         Gone⁴    Gone⇑⁵   !I16     !I20     !I20     !I16     Gone⁶    =⁷
End unknown         !I11     =²       Held⁸    Held⁹    Held¹⁰   =¹¹      Held⁶    =⁷
Evidence Released   !I12     !I12     Gone⇑¹²  !I12     !I12     Gone⇑¹²  !I12     =¹³
Evidence Superseded Gone¹²   Gone⇑¹²  !I8      !I8      !I8      !I8      !I8      !I8
Reload              Restor   Restor   Held     Held     Held     =        =        =
BootSettles         =        =        =        =        =        =        Gone     =
DisposalStarts      =        =        Held     =        =        =        =        =
RuntimeDisposed     !A-I29¹⁴ !A-I29¹⁴ =        =        =        =        =        =
StepEnds            =        =        =        =        =¹⁵      =        =        =
```

The guards are inputs named on the move. Each value is its own cell for mutation.

1. `Send.cancelPending`: with a `PendingCancel` → `!I20` (a cancel lost to an invoke, WriteLanes R14).
2. A never-sent Attempt ending with no answer. The lifecycle stays; `ending-channels` judges it. Pending CQ5.
3. `End.mode`: `Gone{closed}` when running, `Gone{settledInDisposal}` when disposing.
4. Queued, by `End.reason` and the obligations:
   - `Cancelled` with an `Await NotSentCancelled` (cancelAll) → `Gone{closed}`;
   - `Disposed` while disposing → `Gone{closed}`;
   - any other reason → `!I11`.
5. Unsent, by reason:
   - `Cancelled` or `StorageRefused` with a `PendingCancel` → discharged;
   - `StorageRefused` (its acknowledgement was refused);
   - `Disposed` while disposing;
   - else `!I20`.
6. Restoring:
   - `head: false` allows `NotSent { Restored }`, or `NotSent { Cancelled }` with a `PendingCancel`;
   - `head: true` allows `unknown { Restored }` → `Held` (Restore R3: acknowledged once);
   - anything else → `!I16`.
7. Gone, by `why`:
   - `evidence`: its first `End` → `=` (its life is Evidence);
   - `closed` with the `PendingCancel` that this `End` meets → `=` (discharged);
   - `settledInDisposal` with `unknown { Restored }` → `!A-I36`;
   - otherwise `!I16`.
8. Resending: `unknown { StorageRefused }` → `Held` (WriteLanes I15's re-send exception; round-14 `lane.ts:508-513`).
   Any other ending → `!I16`.
9. OnWire, by `End.retained`:
   - retained → `Held`;
   - not retained (bare, ignored, or the `cancel` policy's own turn) → `Held` plus `Await Released` (WriteLanes R4).
     If no `Released` comes, it stays `Held`, which is what the runtime did;
   - `unknown { Disposed }` only while disposing (`disposal` judges the bound).
10. Interrupted: `unknown { Cancelled }` → `Held`. `unknown { Disposed }` while disposing → `Held` (Actors R22: past
    the bound). Else `!I20`.
11. Held, `unknown { Restored }`:
    - with an `AwaitRestore` for this incarnation → discharged;
    - a second in one incarnation → `!I15` (WriteLanes I15, Restore I6);
    - any other `End` → `!I16`.
12. Only with the matching `Await`. Without one, the row's default applies (`!I12` or `!I8`).
13. `Gone{evidence}` → `=`: a replaced Attempt's release under `cancel` (WriteLanes R4), pending a round-14 trace.
    Else `!I12`.
14. A never-sent commit left as it was when the disposal ends. Pending CQ6; the mutant expects Actors I29 today.
15. `StepEnds.unstoppable`: an interruptible call still `Interrupted` at step end → `!I20`. Once `Unstoppable` is
    known, it stays (today's rule).

### Table B: the lane's members, by (head, member)

The head is derived (requirement 1), so this table's rows exclude `Queued` and `Gone` by type, and these cells are
not mutated.

```text
head \ member  reject  latest  serialize  cancel  Retry    Cancel     CancelAll   Release
Idle           mint    mint    mint       mint    =        =ᵃ         =ᵇ          =
Unsent         decl    supH    queue      repl    =        PCancel    Q→NS+PC     mark
Resending      decl    supQ    queue      repl    =        AwRel      Q→NS+AwRel  mark
OnWire         decl    supQ    queue      repl    =        Interr     Q→NS+Int    mark
Interrupted    decl    supQ    queue      replC   =        =          Q→NS        mark
Held           decl    supQ    queue      repl    Resend   AwRel      Q→NS+AwRel  mark
Restoring      decl    supQ    queue      repl    =        PCancel    Q→NS+PC     mark
```

- **`mint`:** a `Minted` on this lane → a new `Unsent`. A decline is allowed only for a reason no policy gives
  (`Unencodable`, `NoPersistence`, `OldVersion`); `Rejected` or `Overloaded` → `!I8`.
- **`decl`:** a decline `NotSent { Rejected }` is owed in this turn. A `Minted` → `!I8` (S2 M1's probe).
- **`supH`:**
  - a head with no `PendingCancel` owes `Await Superseded`, and the new commit is `Queued`, promoted when the head
    leaves (CQ7);
  - a head with a `PendingCancel` acts as `supQ` (WriteLanes R14).
- **`supQ`:** the previous `Queued` owes `Await Superseded`, and the new commit is `Queued`. W is at most 1 at
  `TurnCloses` (I8).
- **`queue`:** the new commit is `Queued`. A 65th owes a decline `Overloaded`; a `Minted` → `!I8`.
- **`repl`:** the head → `Gone{evidence}` at once, anchored by the new `Minted` (WriteLanes R7: the interrupted
  Attempt's ending is evidence). The new commit is `Unsent`.
- **`replC`:** the head → `Gone{closed}` with `PendingCancel{UnknownCancelled}`. A head with a `PendingCancel` does
  the same with its own `ends`. A pending cancel is never lost (WriteLanes R14; CQ9).
- **`Retry`:** `=` with evidence `InFlight` or `NothingToResend`, which is not judged. On `Held` → `Resending`.
- **`PCancel`:** `PendingCancel{NotSent}` (WriteLanes R14: never sent, so it ends NotSent Cancelled, or StorageRefused
  while its acknowledgement is written).
- **`AwRel`:** `Await Released`. The phase moves on the report (Table A, guard 12). WriteLanes R14 covers both
  Resending and Held.
- **`Interr`:** → `Interrupted`.
- **`Q→NS`:** each `Queued` owes `Await NotSentCancelled`. Those reports come in mint order, before the head's
  (I21). Nothing is promoted, because every `Queued` owes something.
- **`ᵃ` (an Idle cancel):** a decline → `!I20` (WriteLanes R14: "nothing, and no ending"). A kept ending on the lane
  → `AwaitLetGo`, pending CQ3.
- **`ᵇ` (an Idle cancelAll):** a decline `NotSent { Cancelled }` → `!I21`. The mutant moves from I20 to I21 (a
  verdict change).
- **`Every`:** applies the column to every lane of the operation for that actor.
- **`mark`:** adds the lane to `releasing` (WriteLanes R16). Its later endings are Evidence. A `Released` of its
  head is anchored. Everything else in R16 is a stated limit until T8's fragment fixtures.
- **A `Minted` with no commit member** of its lane in the open turn → `!I1`. This is a rule of `step`, with traces
  and a mutant of its own (S2 L9: a repeated id is one).

### Obligation deadlines

- **`Await Released`:** discharged by the matching `Evidence` by `TurnCloses`; unmet → WriteLanes I12.
- **`Await Superseded`:** discharged by the matching `Evidence` by `TurnCloses`; unmet → WriteLanes I8.
- **`Await NotSentCancelled`:** discharged by its `End`, in mint order, by `TurnCloses`; unmet → WriteLanes I21.
- **`PendingCancel`:** discharged by its `End`, with no deadline (WriteLanes R14); another `End` → WriteLanes I20.
- **`AwaitRestore`:** discharged by `unknown { Restored }` or its parked ending delivered, by `StepEnds`. Unmet, by
  cause:
  - `plain` → Restore I6 (CQ11);
  - `runtimeDisposal` or `disposeActor` → Actors I29;
  - `forget` → Actors I32.
- **`AwaitLetGo`:** discharged by `Recorded { letGo }` by `StepEnds`; unmet → WriteLanes I15.

- **An `AwaitRestore` is created** when an anchored `Incarnated` or `Adopt` begins an incarnation of the actor, for
  each of its `Held` Attempts. Its cause is the actor's `record`, or `runtimeDisposal` after a disposal.
- **Only Held heads.** A never-sent or on-wire Attempt cannot show a restore ending (M2). An unreached actor reports
  no `Incarnated`, so it owes nothing; this is the attachment gate.
- **The deadline table is data,** and it is mutated like the cells.

### Table C: an ending's life, by (move, life)

```text
move \ life       Owed       Parked   Deliv(r)   Refused  Kept      KeptOpen  Evidence  Closed
Delivered         Deliv(f)ᵈ  Deliv(f)ᵈ !I15      Deliv(t)ᵈ !A-I24   Deliv(t)ᵈ !I15     !I15
Issue InvalidTurn !I15       !I15     Ref|Keptᵉ  !I15     !I15      !I15      !I15      !I15
Issue Unmapped    !I15       !I15     Closedᶠ    !I15     !I15      !I15      !I15      !I15
Heard             —          —        Closed     —        —         —         —         —
Parked            Parked     =        !I15       !I15     !I15      !I15      !I15      !I15
Unparked          !I15       Owed     !I15       !I15     =         =         !I15      !I15
Recorded letGo    Closedᵍ    Closedᵍ  !I15       !I15     Closedᵍ   Closedᵍ   Closed    !I15
Recorded other    !I15       !I15     !I15       !I15     !I15      !I15      Closed    !I15
Opens             =          Owed     =          =        KeptOpen  =         =         =
StepEnds          !I15ʰ      =        !I15       !I15     =         !A-I24ⁱ   !I15      =
Reload            Closed|Parkedʲ =    !I15       Closedᵏ  =         Kept      Closed    =
DisposalStarts    =          =        =          =        =         =         =         =
```

- **`Opens`:** an anchored `Incarnated` or `Adopt` of the ending's actor. A parked ending is then owed to that
  incarnation, and must be delivered by step end (T6 L11).
- **`—`:** `Heard` is attributed only to a `Delivering` life, so these cells are excluded by type.
- **`ᵈ`:** `Delivered.mode` disposing → `!I15` in every life (today's rule, kept for all of them).
- **`ᵉ`:** a first refusal → `Refused`; a retry → `Kept`. Pending CQ1 and CQ2.
- **`ᶠ`:** today's rule: final, with no key blocked and no try. CQ10 asks whether that should change.
- **`ᵍ`:** only with an `AwaitLetGo`, or when the actor's record is `forget`. Else `!I15`.
- **`ʰ`:** unless `inDisposal` (it parks at the reload).
- **`ⁱ`:** the try comes in the step its incarnation begins. Actors R10 puts parked endings before any external
  event. A reading; CQ8.
- **`ʲ`:** `inDisposal` → `Parked`. Otherwise `Closed`: what survives on disk comes back as the boot's own endings
  (today's rule).
- **`ᵏ`:** today's rule (dropped). v1 had `Kept`. CQ10.
- **The Invariant for a kept ending's second delivery without an `Opens`** is Actors I24 (T7 M4's leniency 3).
- **Matching:** a report names (operation, attempt, actor). It concerns the Attempt's oldest ending that is not
  `Closed`; for a decline, the oldest not-`Closed` decline of (actor, operation). If every one is `Closed`, it
  concerns the newest, and the cell refuses.

## Which oracle judges what

- **`lane-queue`:**
  - guarantee: WriteLanes I1, I8, I9, I10 (order only), I11, I12, I20 and I21;
  - its own views: W bounds at `TurnCloses`, and I10's member order.
- **`delivered-once`:** WriteLanes I15 and I16, plus Actors I24 and Restore I6 (both proposed). It has no views
  beyond the fold.
- **`disposal`:**
  - guarantee: Actors I29, I30, I31, I32, I35 and I36;
  - its own views: the window, the clock and the server log.
- **`ending-channels`:** WriteLanes I3. Independent of the fold, and unchanged.
- **`attempt-identity`:** WriteLanes I6. Independent of the fold; it adds the key check.

**`disposal`:**

- **The window:** `{ since: ms; calls: ReadonlyArray<string> }`, the Attempts that were `OnWire` or `Interrupted`
  at the start. A call is open while it is in that phase with no answer, settled once it is answered (through
  `endingOf`), and done once it leaves.
- **I35's four violations:**
  1. a call leaves its phase before it is answered and before the bound (`o6.dispose-interrupts-wire`);
  2. an `End` that is not `endingOf(answer)` by channel and reason (T6 L7);
  3. past the bound, an unsettled call that ends other than `unknown { Disposed }`, or not by the step that reaches
     the bound (`mutant.short-disposal-bound`);
  4. `RuntimeDisposed` before the bound while a call is open (`o6.no-bound`).
- **I30:** the server log alone, from `DisposalStarts` to the next reload.
- **I31:** among one lane's endings delivered or parked in one group, the one that leaves a hold comes last. A second
  delivery of the same ending is I15's, not I31's (T6 L10).
- **I36:**
  - Table A's `settledInDisposal` cell;
  - the `Read` row check, which stays: not `uncertain` until a newer Attempt on the lane.
- **I29 and I32:** the `AwaitRestore` deadlines, plus Table A's `RuntimeDisposed` cell (pending CQ6).
- **`HoldForgotten` (Actors R21):** no fixture removes an operation, so this is a stated limit.

## Earlier findings, mapped

"pending" means the cell exists but its rule waits on a CQ answer. "kept" means an existing mutant still proves the
fix.

- **T6 H1, S2 H1 (quiet `Released`):**
  - removed by: `Held` + `Released` without `Await` → `!I12`;
  - proved by: `lie.held-released-unguarded` and `lie.release-on-guarded-read` (kept).
- **T6 M1, T7 L3 (parked ending's channel):**
  - removed by: the mapped event checked at `Delivered`; Table C matching;
  - proved by: new `mutant.parked-delivered-as-other-tag` (DISP-06), Actors I29.
- **T6 M2, M3 (disposal machines, ledger):**
  - removed by: the ledger and kept lanes deleted; the window stores ids only;
  - proved by: the disposal mutants (kept).
- **T6 M4, T7 L1 (cancel on the wire):**
  - removed by: `Interrupted` admits `unknown { Cancelled }`, or `unknown { Disposed }` past the bound;
  - proved by: `lane.cancel-wire-as-never-sent` (kept); new `mutant.wire-cancel-answer-wins` (LANE-04), I20.
- **T6 M6 (`Never`):**
  - removed by: `endingOf` in the window;
  - proved by: `mutant.short-disposal-bound` (kept).
- **T6 L7 (I35's reason):**
  - removed by: I35 violation 2;
  - proved by: new `mutant.bound-ending-wrong-tag` (PAY-16), Actors I35.
- **T6 L10 (`holdLast` mixes I15 into I31):**
  - removed by: I31 counts distinct endings only;
  - proved by: a trace.
- **T6 L11 (settled while unbound, owed at adoption):**
  - removed by: Table C `Parked` + `Opens` → `Owed`, then the step-end refusal;
  - proved by: new `mutant.adoption-skips-parked` (DISP-06), I15.
- **S2 M1 (keyed lanes after the first send):**
  - removed by: Port change 6; Table B `decl`;
  - proved by: new `lane.reject-queues` (PAY-02), I8.
- **S2 M2, T7 M5 (reload drops `Held`):**
  - removed by: `Reload` keeps `Held`, and Attempts are never removed;
  - proved by: `mutant.boot-resends-held` (kept).
- **S2 L5 (two `Restored`; the re-send's `StorageRefused`):**
  - removed by: Table A guards 8 and 11;
  - proved by: new `mutant.restored-twice` (PAY-09), I15, and a trace for guard 8.
- **S2 M4, T7 M4 (refusals counted):**
  - removed by: Port changes 4 and 5, and Table C; pending CQ1 and CQ2;
  - proved by: `1b.r8-refused-ending-not-redelivered` (kept); new `1b.r8-third-try`, I15; new
    `mutant.kept-retried-without-boot`, Actors I24; new case DLV-05.
- **S2 M5 (in-place state):**
  - removed by: a pure `step`;
  - proved by: a unit test.
- **T7 M1 (one lane's cancel anchors another):**
  - removed by: members name their `target`;
  - proved by: new case PAY-17; new `lie.release-other-lane`, I12.
- **T7 M2 (guarded cancel one way; `void`):**
  - removed by: the row anchors and `Await Released` meets its deadline; `VoidUnsure` is chosen by `retryable: 3`;
  - proved by: new `lane.guarded-cancel-keeps` (PAY-03), I12; new case PAY-18; new `lie.void-retry-releases`, I12.
- **T7 M3 (`Minted.key` not enforced):**
  - removed by: Port change 6; `Restoring` + `Send` → `!I1`; the key checked against requests;
  - proved by: new case PAY-19; new `mutant.boot-replays-never-sent`, I1; new `mutant.mint-key-differs`, I6.
- **T7 L2 (an unknown at request time in the minting step):**
  - removed by: moves follow report order;
  - proved by: a trace.
- **T7 L6, L7 (sentinels; untyped `Transition`):**
  - removed by: ordinals instead of counters, and typed rows;
  - proved by: `nub run check`.
- **T7 L8 (I29 for a never-sent at disposal):**
  - removed by: Table A's `RuntimeDisposed` row; **pending CQ6**;
  - proved by: `mutant.disposal-skips-never-sent` (kept, Actors I29 until CQ6).
- **T7 L9 (an unknown ending of a never-sent Attempt):** **deferred to CQ5**. Guard 2 stays `=`, and
  `ending-channels` gains the rule only when CQ5 is answered, with new `mutant.unsent-ends-unknown`, I3.
- **Restore I6's lower bound:**
  - removed by: `AwaitRestore { plain }`; delivered-once claims Restore I6 (CQ11);
  - proved by: new `mutant.boot-skips-restored` (PAY-09), Restore I6.
- **T6 L9, S2 L1, L2, L8 (lane guesses):**
  - removed by: `target`, `LaneId` including the actor, and `Ending.actor`;
  - proved by: PAY-17 and traces.
- **T7 M5 (the RC2 threshold):**
  - removed by: this design;
  - proved by: the mutation gate.

## Spec questions for the user

Each question is marked **guarantee change** (an Invariant's text) or **wording change** (a Requirement's text, no
Invariant). The cells that depend on one stay pending until it is answered. "WL" is WriteLanes.

1. **CQ1, I15's "final" against one try per boot — guarantee change (WL I15).**
   - A kept ending's boot try is the first delivery of a new incarnation, so I15's exception would grant it another
     redelivery. That breaks Actors I24 ("at most once per boot or adoption").
   - Proposed I15 clause: "… delivered once more after queued mail; a second refusal ends its tries until the next
     boot or adoption, which each give exactly one try, with no redelivery after a refusal (Actors R15, I24)".
   - Recommendation: adopt.
2. **CQ2, does the first refusal raise an issue? — wording change (Actors R15).**
   - Proposed: "each refusal reports an issue naming the ending and its cause; the second is final".
   - Round-14 already does this, and Port change 4 assumes it.
   - Recommendation: adopt.
3. **CQ3, a kept ending's lane — guarantee change (WL I8).**
   - Proposed: the kept ending is a value on its lane. The lane exists while it stands, and commits on its key act as
     on a non-Idle lane.
   - I8: "A lane exists iff it is not Idle or holds a kept ending; …".
   - Letting go is already in WL R8, WL I13 and Actors R15 ("until heard, cancelled, released or a local life ends").
     Only `forget` and the `Recorded { letGo }` report are new: a wording change to Actors R21.
   - Recommendation: adopt both.
4. **CQ4, does a kept ending keep its actor alive? — no change.** Actors R7's work in flight does not include it. A
   local actor ends at its grace and lets it go, and a persisted actor's ending stays parked (Actors R22, WL R17).
   Recommendation: confirm.
5. **CQ5, an ending of a never-sent Attempt — guarantee change (WL I3).**
   - Take T6 M5's I3 rewording, and add "an Attempt never sent ends only NotSent, or unknown Restored at a boot".
   - Recommendation: adopt. It unblocks T7 L9.
6. **CQ6, Actors R22's never-sent `NotSent { Disposed }` has no Invariant — guarantee change (Actors I29).**
   - Add: "and every never-sent commit of it ends NotSent { Disposed } before the disposal ends".
   - Recommendation: adopt.
7. **CQ7, is `Superseded` a promotion trigger? — guarantee change (WL I11).**
   - I11: "promoted only when the addressable Attempt is resolved, released or superseded". Without that, a lane
     whose never-invoked head is superseded under `latest` stalls (WL R7).
   - Recommendation: adopt.
8. **CQ8, when a kept ending's try must come — no change (a reading).** The reading: in the step its incarnation
   begins, before any external event (Actors R10, R15). Recommendation: confirm.
9. **CQ9, a pending cancel against a `cancel`-policy replacement — wording change (WL R7).**
   - Reading of WL R14's "never lost to a later replacement": the replaced Attempt still ends with its cancel's
     ending, delivered, not as evidence.
   - Proposed R7 cancel line: "… interrupts the previous Attempt, whose ending is evidence unless a cancel is pending
     on it".
   - Recommendation: adopt.
10. **CQ10, refusals across a reload, and `UnmappedEnding` — wording change (Actors R15).**
    - Today a once-refused ending is dropped at a reload, and `UnmappedEnding` is final with nothing kept. v1 changed
      both silently.
    - Recommendation: keep today's behaviour and say so in R15: "a refusal pending at a page's death is the restore's
      to deliver; an unmapped ending is final and keeps nothing".
11. **CQ11, who judges Restore I6's lower bound? — no change (a claim).** Today only case expectations do.
    Recommendation: `delivered-once` claims Restore I6, with `mutant.boot-skips-restored`.

## What the design drops

This is v1's list, corrected.

**Files deleted:** `lane-model.ts`, `ending-lives.ts`, `written-attempts.ts`, `disposal-ledger.ts` and
`disposal-kept.ts`.

**Changed:**

- `lane-queue`, `delivered-once` and `disposal` read `lives`;
- `dsl/oracle.ts` and `dsl/case.ts` fold once (the contract's fourth argument);
- `dsl/domain.ts` loses `laneAtSend` and `attemptKey`'s template string;
- the reference gains the typed rows, `guard` and `unknown`.

**Verdict changes, intended (Conformance R11):**

- `p1h.cancel-all-idle-declines` expects WriteLanes I21, not I20 (M4);
- a `Minted` with no actor is a `Defect`, not a WriteLanes I15 violation;
- a `Released` of a replaced Attempt under `cancel` passes (Table A guard 13), pending its trace;
- three new claims: WriteLanes I10 (order), Actors I24 and Restore I6;
- delivery during disposal is judged for every life, as today. v1 had narrowed it, and that is reverted;
- the adoption check covers Held heads only, as today. v1 had widened it, and that is reverted;
- a refusal across a reload and `UnmappedEnding` behave as today (v1's silent changes reverted; CQ10).

**Stated limits removed:** as in v1, plus "a re-send on the wire at the disposal's start is not told apart" (the
window holds `Interrupted` and re-sends).

**Stated limits kept or added:**

- `Unhandled` and `Denied` carry no actor. `Heard` is attributed to the one `Delivering` life of that event;
- a parked ending still parked at the case's end;
- the end-of-case `ensureExisting` reads as an adoption (T6 L8);
- `HoldForgotten`;
- WriteLanes R16 beyond `mark`;
- per-step time;
- new: `LaneId` has no identity version or contract id, so old-version holds (WL R11, I17) are not told apart;
- new: `PendingCancel` admits `StorageRefused` whether or not an acknowledgement was being written. The suite has no
  storage fact.

**Size:** about 1,400 lines of production code, plus about 450 of traces and test. That is 1,850 against 2,853,
about 35% less.

## Migration order

Each step lands with `suite`, `suite --runtime null`, the falsify sweep diff and `nub run check`, with each changed
verdict logged (Conformance R11) and a reviewer sidecar on every oracle change.

1. **`dsl/lifecycle.ts`** (tables, deadlines, promotion, `step`), with its traces and the mutation test. No oracle
   uses it yet. Cells that wait on a CQ answer are pending.
2. **Port changes 3, 4, 6 and 7, and change 1's field:** the notes carry `actor` and `key`, the adapter's
   attribution goes, and `Issue.ending`, `Incarnated`, `Finished` and the boundary decode are added. This is
   verdict-neutral, because the old oracles read `actor` from the same places. The gate is a byte-identical sweep.
3. **The reference rows, with `guard` and `unknown`.** A change detector (labelled as one) compares them with the
   Compiled transitions.
4. **Fold once in `dsl/case.ts`,** add `lives` to the contract, and move `lane-queue` onto it. Do this together with
   Port change 2 (the reorder), plus PAY-17, PAY-18, PAY-19 and their mutants.
5. **`delivered-once` onto `lives`,** with Port change 5, its three new claims, DLV-05 and its mutants.
6. **`disposal` onto `lives`.** The ledger and kept lanes go, and its new mutants are added.
7. **`attempt-identity`'s key check.**
8. **Deletions,** and the README, STATUS and mutant headers.
9. **A short review of the build against this proposal and the answered CQs.** The policy allows one revision, and
   this is it.

## Risks

1. **Common mode is accepted.** A trace derived wrongly from the Spec defends a wrong cell. The traces are read
   against the Spec at step 9, not against the tables.
2. **Claims that choose:**
   - a cancel's or retry's `target` key, and a tied row with no computable guard, are runtime claims;
   - only case expectations on rows catch a wrong key;
   - `Finished` is a claim that unbinds lanes.
3. **Attribution, not `find` strings:** Port change 3 must land before change 2. If it does not, every `Minted`
   becomes a `Defect`. Step 2's byte-identical gate checks this.
4. **`Restoring` + `BootSettles` → `Gone`** cannot tell an Attempt whose batch never landed from one whose restore
   ending was lost. The fix is a suite storage fact.
5. **Guards computed in `step`** (retention, `retryable`, matching) are code, not cells. Each has its own traces and
   mutants, but they are checked less exhaustively than the cells.
6. **`disposal`'s held set** comes from the lifecycle. The ledger already moved on an unknown `Ended`. The change is
   that a definite `Ended` now moves it too, and `ending-channels` (I3) guards that a definite ending matches the
   answer.
7. **Port change 7 adds a tag.** If the user prefers no new tag, return and grace end must be derived from uses, the
   clock and work in flight. That derivation misses reads (Actors R7), so it would be a stated limit.
