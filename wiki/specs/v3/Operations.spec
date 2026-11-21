spec Operations
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance; revisable whenever building shows it wrong, with
              each change and its reason recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src
provides      entries, issuesOf, IssueSource, StoredSource, CATALOG, ENDINGS, SavedEnding, failureOf, door, made, intake
derives_from  [@plan.Operations.O2, @plan.Operations.O3, @plan.Operations.O5, @plan.Operations.O7,
              @plan.Diagnostics.O1, @plan.Diagnostics.O2, @plan.Diagnostics.O3, @plan.Diagnostics.O4,
              @plan.Persistence.O2, @plan.Persistence.O6, @plan.Runtime.O6, @plan.Machines.O5]

requirements
    R1  One idempotency key, one write
        source  @plan.Operations.O3; @plan.Persistence.O6.
        must    Flow never sends two different writes under one idempotency key, in this Runtime or a later one. The
                Attempt id is the key and is minted only with the boot's seed, which differs for every boot; a restored
                Attempt keeps its saved id, and a re-send of it carries the same key.

    R2  Every answer is heard once
        source  @plan.Operations.O3; @plan.Operations.O7.
        must    Every answer to an Attempt is heard exactly once, as success, a failure tag, not sent or unknown. A
                timeout is never a definite failure: a write whose Effect times out ends as unknown. An unknown may be
                followed by the real answer, never the reverse, and an unknown not yet heard is dropped when the real
                answer arrives first. An ending mapper takes `(value, { input, key })`: the row's value, the row's
                input and its key.
                [decided: user 2026-11-20] answered that ending mappers take `(value, { input, key })`.
                A persisted write declares its `output` and error Schemas, so an ending saved with a value comes back
                as itself and not as unknown `Restored` (open Q7).

    R3  Equal contract and input share one request
        source  @plan.Operations.O2.
        must    Equal contract and input share one request on the wire: a read's key is its whole input, an entry holds
                at most one call outside `releasing`, and at most one trailing request is wanted.

    R4  Fresh data stays fresh, written data stays written
        source  @plan.Operations.O2; @plan.Operations.O5.
        must    A read's success never carries data Flow knew to be stale when it delivered it, and written data is
                never replaced by an answer asked before the write. Written data is fresh and answers every waiter.

    R5  Every wait ends once
        source  @plan.Operations.O2; @plan.Operations.O7.
        must    Every lookup a live machine waits on ends exactly once, a freeze included: no loading state is stuck by
                Flow. A machine that has ended hears nothing. A failing server is never called in a loop: no cell
                starts a request because the last one failed.

    R6  An issue is a view of its cause
        source  @plan.Diagnostics.O1; the derived-issues rule (an issue is read from state, never stored).
        must    An issue is shown exactly while its cause exists. Two keys of one operation never share or erase one.
                Every issue is a view over its owner's state through one function, `issuesOf`.

    R7  Row before publish
        source  @plan.Operations.O3.
        must    The snapshot published after an ending's turn already shows what that turn did to the ending's row: a
                refused ending's refusal is on its row before the publication, and nothing publishes inside the try.

    R8  A released call stays visible
        source  @plan.Operations.O7; @plan.Runtime.O6.
        must    A call that was told to stop and has not can be seen until it ends (inspection, evidence, and the issues
                of whoever holds its key), and it never delays a turn.

    R9  One failure for a crossing of cleanup
        source  @plan.Diagnostics.O3.
        must    `dispose()` and `runPromise` reject with one `FlowError` that names every failure, the primary one
                first, and keeps every Cause. An interruption stays an interruption.

    R10  Public calls are doors
        source  @plan.Diagnostics.O1; @plan.Diagnostics.O4.
        must    No public call throws anything but a `FlowError`, and a copy of a value is never taken for one Flow
                made. Every outside value is read once into a copy and decoded; a body that gets a value gets the taken
                copy or one with no readable member.
                [decided: user 2026-11-21] answered "B" to how a Flow-made value is recognised: `Symbol.for(
                "flow-state/Made")` on one shared frozen prototype, plus the owner compare. Reverse: a `WeakMap`.
                [decided: user 2026-11-19] a core invariant failure raises `InvariantViolation`.

    R11  A throw changes only its own check
        source  @plan.Machines.O5; @plan.Operations.O2.
        must    A throw in a user callback changes only its own check: a mapper's throw refuses its own row's turn and
                the row is tried once more and then Kept with its issue; a reset selection's throw is that slot's
                issue; a placement's select that throws is `Failed` and keeps its last key; a `lookup` or `commit`
                that throws synchronously is a Defect result.

    R12  A reload shows saved reads as stale
        source  @plan.Persistence.O2; @plan.Operations.O2.
        must    After a reload, saved read data is shown as stale and never served as fresh; data older than `gcTime`
                starts missing. Positions and call ids are never saved.

    R13  One catalog
        source  @plan.Diagnostics.O2.
        must    Every code, class, issue set, report set and reason list derives from one catalog; a fact named twice
                has one name. One rule classifies a diagnostic.

    R14  Cost in proportion to what changed
        source  The project's cheap-operations principle.
        must    A lookup, refetch or cancel finds its slot and entry by key without scanning every read; the end of a
                life costs its own slots; owed rows are written once per pass; each index is written by the owner of
                its fact in the same step.

    R15  Retry guards read one view
        source  @plan.Operations.O3.
        must    `O.x.idle` and `O.x.retryable({ times })` (keyed and keyless) keep their public shape and read one
                view of a lane, derived from its head: `Idle`, `InFlight` or `Held { retryCount }`. A guard in a
                fragment reads its own copy's lane, and reads the lanes as they were before the turn.

open
    Q1  A read's key is its whole input. For a `resource`, `key` orders the input's fields for partial-key matching and 
        names every field. Trace of the alternative (a partial key with the input stored on the entry): two
        lookups with `{ account, currency }` and key `["account"]` share one entry and the second gets the first
        currency's answer as a success. [decided: user 2026-11-22] Why: equal keys with different inputs would race.
        Reverse: B, a partial key with the input stored on the entry.
        outcome  A: a read's key is its whole input.

    Q2  No `Trigger` cue: a request starts by itself only at a placement, an invalidate and a clear. A refetch on focus 
        or on an interval is a schedule that runs `O.x.refetch()`. This departs from @plan.Operations.O2 ("focus
        regained and connection restored refetch"). The alternative is a host occasion (focus, online) as a new input
        and a new row. [decided: user 2026-11-22] Why: a refetch on focus or interval needs no new input, only a
        schedule. Reverse: B, a host occasion as a new input.
        outcome  A: no `Trigger`; @plan.Operations.O2 is edited to match (2026-11-22).

    Q3  A life's end and a disposal owe waiters nothing: each waiter's row would close at once as evidence, since its 
        life is gone; a freeze still parks one `Interrupted` row per waiting lookup. This departs from the Plan's
        "the Interrupted ending a freeze or an actor's end parks". [decided: user 2026-11-22] Why: a gone life's
        rows would close at once as evidence. Reverse: B, a row per waiter at an end.
        outcome  A: a freeze parks `Interrupted`; the Plan sentence is edited to match (2026-11-22).

    Q4  `failureOf` gives one `FlowError` per crossing and one diagnostic per cleanup. Today a defect plus a cleanup 
        failure is a `Die` holding the error (`close.ts:282-296`); the defect is in `cause` here and its diagnostic is
        classed Defect. [decided: user 2026-11-22] Why: one error per crossing keeps the defect in `cause`. Reverse:
        B keeps the `Die`.
        outcome  A: one `FlowError` per crossing, one diagnostic per cleanup.

    Q5  A write's `Cause.TimeoutError` is unknown and a type error: `commit: (i) => 
        api.pay(i).pipe(Effect.timeout(...))` stops compiling; the form the fixtures write (`Effect.timeoutOrElse` with 
        `Outcome.unknown`) stays. No fixture
        writes the first. For a read, `TimeoutError` stays in the contract's `E` and the `failure` mapping names the
        tag by the ordinary exhaustive check. [decided: user 2026-11-22] Why: an unknown must not look like a typed
        error; no fixture writes the first form. Reverse: allow `Effect.timeout` on a write.
        outcome  A: confirmed.

    Q6  A made value's internals sit under a second registered symbol on the value, off the face, so two loaded copies 
        of Flow read each other's values; a `WeakMap` beside the brand would refuse a second copy's values.
        outcome  Answered by R10's user decision of 2026-11-21: registered symbols on one shared frozen prototype,
                 not a `WeakMap`; the internals symbol follows from it.

    Q7  A persisted write declares its `output` and error Schemas, required when the app persists. Today an ending that 
        cannot be saved becomes unknown `Restored`, so a success turns into "unsure" on reload. The alternative keeps
        the fallback. [decided: user 2026-11-22] Why: a success must not turn into "unsure" on reload. Reverse: B
        keeps the fallback.
        outcome  A: a persisted write declares `output` and error Schemas.

    Q8  The rename of saved text for a store refusal (`StorageRefused` to `StorageFailure`, in `reason` and `why`) is 
        one step of `Records`' format plan, and the rename of the codes' constructors is accepted.
        [decided: user 2026-11-22] Why: one format step in `Records`. Reverse: keep `StorageRefused`.
        outcome  A: confirmed.

    Q9  Models are narrower than the text: `besideOf` (an interrupt beside two other reasons) was fixed after the last 
        run and not re-run; a Clear on a Running entry that has lost its holds mid-step starts a call from `again`
        that the step's end then releases (about 150 times in 900,000 steps: wasteful, not wrong, not fixed); the data
        layer's holds, `install`, `intake`, the issue view and I14 are in no model. Blocks the entries Task's build.
        outcome  Run the model again, with these, before `entries.ts`.

    Q10  The types were not compiled: `MapperContext<I, K>` through `outcomes`, the `resource` key rule and the
        excluded `TimeoutError`. Blocks build. `Types` owns the proof.
        outcome  Closed by `Types`' spike.

    Q11  Not every source was read in full: callers of `life.ts`, `frozen.ts`, `same.ts` and `operation-checks.ts` were
        not swept. Plan sentences found uncovered and not designed: `value` firing by `Equal.equals`, `InvalidWrite`
        (@plan.Operations.O2, O3), a placement "released within the disposal bound".
        outcome  Sweep before the entries Task; design each sentence or edit the Plan.

    Q12  Placements are unchanged and unattacked; streams and sessions have no design (`releasing` is shaped to take
        them). Blocks the placements Task.
        outcome  A build-time choice in @task.V3.T123's description: attack the placement table first.

    Q13  Hydrate against restore.
        outcome  Answered in `Records`; nothing open here.

    Q14  `CleanupFailed` as a lasting issue is minor: a quarantined ref (`driver.ts:81`) is host state; whether the
        snapshot shows it through `issuesOf` or beside it was not traced.
        outcome  [decided: agent orchestrator 2026-11-22] not an issue: the catalog row is `issue: false, report:
                 true`, and an issue needs a standing cause in core state (R6), while a quarantined ref is host
                 state shown by inspection. Reverse: make the row `issue: true` and give the ref a core fact.

    Q15  `persist: true` with `gcTime: 0` saves an entry that never installs. Minor: a construction finding, or another
        bound for a saved entry's age.
        outcome  A build-time choice in @task.V3.T124's description.

    Q16  The door table was attacked once, on paper. Blocks the doors Task. Where internals live is answered (Q6):
        the surface walk skips the one internals symbol.
        outcome  A build-time choice in @task.V3.T131's description: attack the hostile table first.

    Q17  Starvation under endless invalidation is minor: invalidations that never pause for one round trip starve the
        waiters, and no bound is designed. One answer is also thrown away when an invalidate arrives mid-flight and
        nobody waits.
        outcome  A bound only if a bench or a Story shows it.

    Q18  An entry's `last` is shown to a slot that joined after the failure (shared entry state). A per-slot fact
        would be one more field. Minor.
        outcome  Keep until a fixture needs it per slot.

    Q19  The public event a view sends for `refetch`.
        outcome  Not this Spec's: one home, `Host` Q6.

    Q20  The lane policy table (`core/lanes.ts`) is in no design; it is written from the code. Blocks the Spec of the
        operation-endings Task.
        outcome  Write the table from `core/lanes.ts`; run the alarm order in a model.

model
    Operations = one `transaction` (a write, with a lane) or one `resource` (a read, with entries) of a contract;
        its ending reaches the machine as an event through its `outcomes` mapping.

    Position = the Runtime's one order. Every `next` is larger than every earlier one; never saved.

    Entry = one per (contract id, key text) per Runtime. It holds the key, the landed data, the last Invalidate,
        Written or Clear as a position, its one request, whether one trailing request is wanted, the last landed
        non-success ending, and the time it lost its last hold.

    ReadSlot = one per (life, operation): the entry it points at, its owner and whether it waits. A slot has one wait.

    Releasing = a call the core told to stop and has not heard end.

    FaultModel = mistakes, not attacks. A wrong value, a copy, another definition's token, a throwing getter and a
        second loaded copy of Flow are handled; a value built by hand on Flow's prototype is unsupported, as in Effect.
        [decided: user 2026-11-21] answered "B" to how a Flow-made value is recognised (see R10).

    StateInventory = every state of this module, its only writer, its readers and what survives a reload. Positions
        and call ids are never saved. The clock is `tx.env.now`, the one clock of a step; every `at` and `since` is
        that value.
        Lane, displaced head  today's (`world.ts:331-408`). Owner and only writer: `cells.ts#table` through
            `lane-moves`. Readers: as today. Saved: as `Records` says for a head.
        Owed row  today's, plus `input` and `refusal`. Writer: `ledger.ts`. Readers: `serveEnding`, the issue view,
            capture. Saved: `input` yes; `refusal` never.
        Entry  Idle or Running, current or behind. Writer: `entries.ts#apply` (the entry table). Readers: slots,
            `entryView`, the issue view. Saved: data and `at`, when `persist`.
        Read slot  absent, served, waiting. Writer: `entries.ts` (the slot rules). Readers: the entry table, the issue
            view. Saved: never.
        Placement  unchanged from today's design of placements. Writer: `placements.ts#decide`. Readers: the entry
            table (`placed`, holds). Saved: never.
        Releasing call  present from the interrupt to the call's end. Writer: `entries.ts` (Release, the dispatch).
            Readers: the issue view, inspection. Saved: never.
        A source's last outcome `outcomes` of `Changes`. Writer: the applier, row C2. Reader: the issue view. Saved: no.
        Issues  none: derived. Writer: `issues-of.ts`, a pure read. Readers: snapshot, inspection, rules. Saved: never.
        Catalog  static. Owner: `error.ts#CATALOG`. Readers: every code union.
        Public registry  absent, a door, a made value of a kind. Writer: `entry.ts` (write once). Readers: `madeOf`,
            the surface walk.
        Trust of an outside value  `Unread`, taken, refused. Writer: `intake.ts#intake`. Readers: door bodies.

    CallbackInputs = what each user callback receives and what its throw becomes. No callback of this module receives
        the clock, a position or an id other than `attempt.id`.
        `commit(input, { attempt })`  the taken input; the Attempt (`core/compiled.ts:322-329`). A throw, synchronous
            or a die: `CallResult.Defect`, an unknown ending.
        `lookup(input)`  the taken input, which is the entry's key. A throw: `CallResult.Defect`, the read's `Defect`
            ending.
        an ending mapper  `(value, { input, key })`: the row's value, the row's `input`, its key. A throw: the row's
            `Refusal { InvalidTurn, slot }`; the turn is refused, nothing else changes.
        a `Defect` or `Interrupted` mapper, `notSent`  `(undefined, { input, key })`; `notSent` gets `{ why }`. A
            throw: as above.
        a placement's `select`  `readsOf(incarnation, scope, "committed")` of `Changes`. A throw: `Placement.select`
            is `Failed`, keeping the last key.
        an input selector of a member  `readsOf(..., "after")`. A throw: the turn's refusal, as today (`turn.ts:158`).
        a release (an Effect finalizer)  Effect's own arguments. A throw: a failed cleanup; its Owner hears the
            Cause, which reaches `failureOf`.

    Representation = target: TypeScript with Effect data types. Core types hold plain data; the typed face is built
        by `Types`.

        ```ts
        // NEW: Position. Never saved.
        type Position = number & Brand.Brand<"Position">;

        // existing (`core/tx.ts:188-191`): `att-<seed>-<n>`. The rule is new: the seed differs for every boot.
        type AttemptId = string & Brand.Brand<"AttemptId">;

        // NEW: one per (contract id, key text), per Runtime. world.entries: Map<contract, Map<keyText, Entry>>
        type EntryId = { readonly contract: string; readonly keyText: string }; // a name, valid after removal
        type Request = Data.TaggedEnum<{ Idle: {}; Running: { call: CallId; asked: Position } }>;
        type Entry = {
            readonly key: Values;                      // the taken input: a read's key is its whole input
            readonly data: Option.Option<{ value: unknown; at: number; asked: Option.Option<Position> }>;
            readonly staleAt: Position;                // the last Invalidate, Written or Clear
            readonly request: Request;
            readonly again: boolean;                   // one trailing request is wanted
            readonly last: Option.Option<ReadFailure>; // the last landed ending, when not a success
            readonly unheldSince: Option.Option<number>;
        };

        // NEW: one per (life, operation). world.slots: Map<ActivationId, Map<operation, ReadSlot>>
        type ReadSlot = { readonly entry: EntryId; readonly owner: OwnedBy; readonly waiting: boolean };

        // NEW: world.releasing: Map<CallId, Releasing>. A call the core told to stop and has not heard end.
        type Releasing = { readonly entry: EntryId; readonly since: number };

        // NEW on the row. `refusal` is written only by the ledger's `afterTry`.
        type Refusal = { readonly code: RefusedCode; readonly slot: Option.Option<SlotName> };
        type Owed = ExistingOwed & { readonly input: Values; readonly refusal: Option.Option<Refusal> };
        type Heard = Data.TaggedEnum<{ Unmapped: {}; Heard: {}; Refused: { refusal: Refusal } }>;

        // CHANGED: an issue's source names the state that holds its cause. Only the first three can be stored.
        type StoredSource = Data.TaggedEnum<{
            Event: { tag: string; at: Address };
            Reaction: { slot: SlotName };
            Slot: { at: Address; slot: SlotName }; // a context slot, a prop, or an instance's reset selection
        }>;
        type IssueSource = StoredSource | Data.TaggedEnum<{
            Schedule: { name: string; key: Option.Option<string>; at: Address };       // Schedules
            Ending: { operation: string; key: string; attempt: Option.Option<AttemptId> };
            Entry: { operation: string; key: string };
            Placement: { path: string };
            Call: { operation: string; key: string };
            Record: { key: RecordKey };                                                 // Records
        }>;

        // NEW: what failureOf is fed. `cause` is whole; `at` is the owner path of the task that ended.
        type Cleanup = { readonly at: Path; readonly cause: Cause.Cause<unknown> };
        type Overdue = { readonly at: Path };
        ```

        `SlotName` is the branded slot name `Schedules` asked for; an operation's own name keys a read slot and is not
        one. A mapper's context is `Types`' one `MapperContext<I, K>`, with `K` the picked key record,
        `Pick<I, Key[number]>`.

    DerivedTypes = each public type and its source.
        a mapper's `value`  the contract's `commit` or `lookup` return: `A`, `FailureOf<E, T>` (`contract.ts:84`).
        a mapper's `{ input, key }`  the contract's `input` fields and its `key` tuple: `{ input: I; key: Pick<I, K> }`.
        `ReadFailure`, `NotSentWhy`, `IssueCode`, `ReportCode`, `Reason`  `CATALOG` and `ENDINGS`.
        a read's `key`  its `input`: for a `resource`, `K` is every field of `I` (open Q1).
        a `transaction`'s `E`  `commit`'s error, with `Cause.TimeoutError` excluded by a conditional type (open Q5).

    ProblemClasses = a family is removed only where a type or signature cannot express a member.
        A. An answer for something that moved on (a settle after a clear, after a collect, after a disposal; a
            superseded lookup; today's fall-through to lanes): one point, the dispatch. The Settled cell takes a
            Running entry, so "Settled on Idle" has no cell.
        B. A fact stored beside what determines it (the `overdue` flag, the collect timer id, `waiting.after` and
            `Trigger`, `landedAt`, a read's `concurrency`, issues by operation name, `FlowError.code`,
            `Origin.HeldAtStart`): removed; the fields do not exist. Overdue, collectable, current and fresh are
            functions.
        C. Two writers of one publication (publish inside `tryOne`): one point; the applier's row C4 moves the row,
            row C6 publishes.
        D. One fact, several names or lists (the `overdue` flag; five names for a store refusal; five code lists; two
            classification rules; `InvalidKey` and `InvalidInput`): removed for codes, every union derives from
            `CATALOG`; saved text has one rename table.
        E. A failure crossing cleanup (squashed Causes; `CleanupOverdue`; the count in a summary string): one point,
            `failureOf`.
        F. A check apart from the use; trust by mark: removed where the body gets `Unread` or the taken copy; the
            door list itself is one point.
        G. Scans for per-step questions (`interruptReads`, `retire`; owed rows rewritten per row): removed; the maps
            are keyed by the question.
        H. Ids and positions across boots: removed; `Option<Position>` on restored data; an Attempt id cannot be
            minted without the boot's seed.
        I. A throw in a user callback (a mapper; `resetOn` under `Begin`; a `lookup` or `commit` that throws
            synchronously; a placement's select): one point each, all read by the issue view.
        Debt, still one by one: the ending reasons Flow itself writes (`Restored`, `Defect`, `Interrupted`) are a
        hand-written list in the catalog; the list of doors is found by the surface walk, not by a type; the `throw`
        sites become values one by one (`driver.ts:396`, `schedule-steps.ts:27`), and the lint that keeps them out is
        `Types`'.

invariants
    I1  `again` only while Running and behind. At most one trailing request. [@R3]

    I2  A waiter implies Running; behind with a waiter implies `again`. [@R5]

    I3  Running implies a hold. [@R3, @R5]

    I4  Every call the host has open for a read is in exactly one home: one entry's request or `releasing`. [@R8]

    I5  For an entry that exists, `unheldSince` is some exactly when it has no hold. [@R5]

    I6  At most one call per entry outside `releasing`. [@R3]

    I7  Landed data's `asked` never decreases, and no request asked before a Written lands after it. [@R4]

    I8  Each ask through a slot ends exactly once: one row, or one evidence line. Never two rows for one wait, and no 
        row is queued for a life that is gone. [@R5]

    I9  A success row carries fresh data, a Written value, or the result of a request current at its settle. [@R4]

    I10  Quiescence: with no call open outside `releasing` and no cue pending, no slot waits. [@R5]

    I11  A call reads as overdue exactly while it is in `releasing` past the bound. [@R8, @R6]

    I12  An unheld entry is removed by the first Collect due at or after `unheldSince + gcTime` unless a hold arrived; 
         a held entry is removed only at Runtime ends. [@R5]

    I13  A row in a live incarnation that is Kept has a refusal; a row that exists has an `Ending` issue exactly while 
         its `refusal` is some. [@R6]

    I14  No `Published` follows an ending's turn before that row's move. [@R7]

    I15  At most one unheard unknown row per Attempt; no unknown row for an Attempt is added after its final row. [@R2]

    I16  An Attempt id minted in one boot is minted by no other. [@R1]

    I17  `failureOf`'s diagnostics are `head ++ cleanups ++ overdue`; its error's `cause` holds every reason of every
        input Cause once; an interrupted body's result still has its interrupt. [@R9]

    I18  Every code union is a subset of `Code`; a stored issue's source is a `StoredSource`. [@R13, @R6]

    I19  Every function reachable from a public value's face is a door's, and a door's body never holds an argument it 
         did not take. [@R10]

    I20  The lane table is unchanged (`cells.ts`'s own table test). [@R2]

    I21  A guard reads a lane only through `lanes.viewOf`, found by the part's subject, the operation and the key's 
         canonical text; the view is derived from the lane's head and stored nowhere. [@R15]

    I22  Alarms match: for this module, one `Collect` alarm per entry that is Idle, unheld and has `gcTime` above 0, 
         one `Release` alarm per call in `releasing`, and no other of these kinds. [@R8, @R5]

    I23  A throw in a user callback of this module changes only its own check (a mapper: its row's turn is refused and 
         nothing else changes; a placement's select: `Failed`, last key kept). [@R11]

    I24  A restored entry is never fresh (`asked` none), and an entry whose age is at least `gcTime` starts missing. 
         [@R12]

    I25  An ask, a refetch and a cancel reach their slot by `slots[life][operation]` and their entry by 
         `entries[contract][key]`; no operation scans every read. [@R14]

operations
    settled(call, result)
        requires  The host settles each call it started exactly once (`owners.ts:197` ends a task of a closing Owner
                  as `Interrupted`).
        ensures   Routes the result by where the call is; this is the one place that decides who hears an answer.
                  In `releasing`: removed from it, its alarm cleared, evidence `Released`. An entry's `Running`
                  request: that entry's Settled cell. A lane head on the wire, or a displaced head: the lane's rule,
                  unchanged (`lanes.ts#settle`). Nowhere: `defect`. A released call's answer is dropped; a Fail or Die
                  its cleanup left is not (the Owner hears it through `judge`).
        fails     `defect`: the host settled a call the core never started, or twice.

    lookup(life, operation, input, owner)
        requires  `life` is live.
        ensures   `intake` takes the input; on refusal one `Defect` row, evidence `InvalidInput`, nothing else. Else
                  the entry is created if absent, the slot points at it (First hold arrives if it was unheld) and Ask
                  Lookup runs; a slot on another entry ends its old wait as `Superseded` and leaves that entry. Any Ask
                  through a slot that already waits keeps its one wait; the older ask is evidence `Superseded` and is
                  never owed. An ask first lets go a Kept row of that slot (`ledger.letGo`).

    refetch(life, operation)
        ensures  With a slot: Ask Refetch on its entry. Without one: nothing; evidence only.

    cancelRead(life, operation)
        ensures  The slot is dropped, no row; a Kept row of that slot is let go. With no slot: nothing.

    place(life, path, key); unplace(life, path)
        ensures  `place` creates the entry if absent, First hold arrives, Ask Lookup by nobody; `unplace` drops the
                 hold. Called by `placements.ts#decide`: unplaces at an exit, a freeze and a life's end, places at an
                 entry and a thaw.

    freeze(life); end(life)
        ensures  Called from the applier's row C4 of `Changes`. Freeze: a waiting slot stops waiting and one
                 `Interrupted` row is owed, which waits; the hold stays. End: every slot is dropped with no row; a
                 life's queued and waiting rows close as evidence.

    invalidate(contract, partialKey); written(contract, key, value); clear(contract, partialKey)
        ensures  Apply the Invalidate, Written and Clear cells to every entry the (partial) key names.

    install(contract, key, data, at)
        ensures  Once per saved entry at boot or adoption, by the install table.

    collectDue(entry); releaseDue(call)
        ensures  The handlers `tick` calls for `Alarm.Collect` and `Alarm.Release`. `releaseDue` writes no state of
                 this module: it records evidence `ReleaseOverdue` once and marks each incarnation that holds the
                 call's key as touched, so the host's `publish` derives the issue with no host code.

    stepEnds()
        ensures  Called by the last row of the core's `step`: judges "Last hold left" for touched entries.

    runtimeEnds()
        ensures  Runs after `End` for every life; removes every entry, releasing any running call, and owes nothing.

    settledRead(call, result): boolean
        ensures  The first two rows of the dispatch.

    owe(ending, origin?): OwedId
        ensures  The ledger's one writer of a new row (`ledger.ts`). One unknown per Attempt (the unknown table).

    tried(actor, id): Option<Owed>
        ensures  The ledger's `tried`: the row a mail reference may try; replaces `tryOne`'s head. A Waiting or Kept 
                 row is not tried.

    afterTry(row, heard: Heard): void
        ensures  The ledger's `afterTry`: the row's move, by the refusal table. Called from the applier's row C4, 
                 before C6.

    letGo(row): void
        ensures  The ledger's `letGo`: closes a Kept row; a read slot's ask or cancel calls it.

    issuesOf(world, compiled, incarnation, now): ReadonlyArray<Issue>
        ensures  A concatenation; each part reads one owner's state and nothing else. Stores nothing.

    failureOf(body, cleanups, overdue, primary): Exit<A, FlowError>
        requires  `primary(cause)` gives the Finding for a body that failed or died.
        ensures   The table of the failure crossing. The caller awaits each cleanup's Exit or lists it as overdue and
                  never drops a race's loser.

    door(name, args, run)
        ensures  Every public function is a door. An argument's schema is a Schema or `Unread`; `run` gets the taken
                 copy, or a value with no readable member. Too few arguments fail the Schema like any wrong value. A
                 refused door returns nothing, registers nothing and raises one `FlowError`.

    made(kind, face, internals); madeOf(kind, owner)(value)
        ensures  `made` is the only constructor of a value Flow hands out. `madeOf` is the brand table.

    intake(schema, at)(value)
        ensures  Lift then decode: one walk reads each own property once into a copy, catches a throwing getter or
                 trap as one `Defect` finding and never calls a function; one Schema decodes the copy. Returns
                 `Result<S["Type"], NonEmptyReadonlyArray<Finding>>`.

    viewOf(subject, operation, keyText)
        ensures  `lanes.viewOf`: the one reader of a lane for a guard, a member (`retry`, `cancel`) and `O.x.get`; the 
                 `LaneView` of
                 the guard table.

algorithm
    Moves inside one cell run in the order written. Invariants hold at the end of every step.

    Dispatch of a settled call. `answers.ts#settled` routes it.
        in `releasing`: removed from it; its alarm is cleared; evidence `Released`.
        an entry's `Running` request: that entry's Settled cell.
        a lane head on the wire, or a displaced head: the lane's rule, unchanged (`lanes.ts#settle`).
        nowhere: `defect`: the host settled a call the core never started, or twice.
        A call has one home from its start to its end. Release is the only move from an entry to `releasing`, and it
        makes the entry Idle in the same step, so a late answer cannot find an entry that is not waiting for it. A
        released call's answer is dropped; a Fail or Die its cleanup left is not: the call's Owner hears it through
        `judge` (`owners.ts:53`) and reports it as today (`Input.CleanupFailed`, the host's report), and from there it
        reaches `failureOf`.

    Entry table. Derived, never stored:
        current: Running and `request.asked > staleAt`. behind: Running and not current.
        fresh at `now`: data is some, `data.asked` is some and `>= staleAt`, and `0 <= now - data.at < staleTime`.
        holds: the slots and placements that point at the entry, plus the data layer's holds.
        placed: a placement points at it. waiters: its slots with `waiting`.
        collectable at `now`: no hold, Idle, and `now - unheldSince >= gcTime`.

        The moves:
        Start: mint a call and a position p; `request := Running { call, asked: p }`; `Command.Lookup` with the
            entry's key as input. The host forks it under the Runtime's Owner, since a request belongs to an entry.
        Serve: owe the asking slot a success with the data; no request.
        Owe: one row to a waiter's life, with the entry's key as `input`; its `waiting` becomes false.
        Release: `releasing[call] := { entry, since: now }`; `Command.Interrupt`;
            `tx.alarms.set(Alarm.Release { call }, now + bound)`; `request := Idle`.
        Remove: the entry is deleted. Its `EntryId` still names it in `releasing`.
        An asker is a slot, which waits, or nobody (a placement being placed; the data layer's `Refresh`).

        The cells, by cue and phase (Idle | Running, current | Running, behind):
        Ask Lookup, Idle: fresh: Serve the slot. Else Start; the slot waits.
        Ask Lookup, Running current: the slot waits.
        Ask Lookup, Running behind: `again := true`; the slot waits.
        Ask Refetch, Idle: Start; the slot waits.
        Ask Refetch, Running current: the slot waits.
        Ask Refetch, Running behind: `again := true`; the slot waits.
        Invalidate, Idle: `staleAt := next`; if placed: Start.
        Invalidate, Running (current or behind): `staleAt := next`; if a waiter exists or placed: `again := true`.
        Written(value), every phase: `p := next`; data is `{ value, at: now, asked: p }`; `staleAt := p`; `last :=
            none`; `again := false`. When Running: then Owe every waiter a success with `value`.
        Clear, Idle: data and `last` none; `staleAt := next`; if placed: Start.
        Clear, Running (current or behind): `w :=` a waiter exists, placed or `again`; the same data changes; Release;
            if `w`: Start, `again := false`.
        Settled(result), Idle: no cell (the dispatch).
        Settled(result), Running current: a success lands: data is `{ value, at: now, asked }`, `last` none; any other
            result sets `last`. Owe every waiter the result. Idle.
        Settled(result), Running behind: nothing lands, nobody is owed: evidence `Superseded`. If `again`: Start,
            `again := false`. Else Idle.
        Last hold left, Idle: `unheldSince := now`; `gcTime` 0: Remove; else
            `tx.alarms.set(Alarm.Collect { entry }, now + gcTime)`.
        Last hold left, Running (current or behind): Release; `again := false`; then as Idle.
        First hold arrives, Idle: `unheldSince := none`; `tx.alarms.clear(Alarm.Collect { entry })`. Running: not
            reachable (I3).
        Collect due, Idle: collectable: Remove. Else nothing. Running: nothing.
        Install(data, at), every phase: nothing: the entry in memory is newer.
        Runtime ends, Idle: Remove. Running (current or behind): Release; Remove.

        A request that went behind never lands and serves nobody: what a waiter is owed comes from a request that was
        current when it settled, from a Written value, or from fresh data. Written answers everyone: the written data
        is fresh, so a waiter gets it as a lookup of a fresh entry would. An automatic start exists in three cells only
        (Invalidate, Clear and a placement's Ask). No cell starts a request because the last one failed, so a failing
        server is never called in a loop.
        Last hold left is judged at the end of the step that removed the hold (@plan.Operations.O1: "at the next turn
        boundary after the last hold ends"; a step is that boundary). A hold that leaves and returns inside one step
        changes nothing: an actor that ends while another starts on the same key in that step hands the running call
        over. Runtime ends runs after `End` for every life, so no slot is left to point at a removed entry, and it owes
        nothing: a row owed to a life that is gone closes as evidence (`ledger.ts:267`).

    Slot cells. A slot has one wait. By cue (No slot | Slot on this entry | Slot on another entry):
        lookup, input refused by `intake`: one `Defect` row, evidence `InvalidInput`; nothing else. The slot is kept.
        lookup(input): No slot: the entry is created if absent, the slot points at it (First hold arrives if it was
            unheld); Ask Lookup. This entry: Ask Lookup. Another entry: the old wait ends as `Superseded`; the slot
            leaves that entry (its hold is judged at the step's end); then as "No slot".
        refetch: No slot: nothing; evidence only. This entry: Ask Refetch. Another: n/a, refetch names the slot's own.
        cancel: No slot: nothing. This entry: the slot is dropped, no row.
        Freeze of its life: No slot: nothing. This entry: waiting: `waiting := false`, one `Interrupted` row, which
            waits (`Changes`, the owed rows). The hold stays.
        End of its life: No slot: nothing. This entry: dropped, no row.
        A placement is the same with no wait. An entry is always created by its first hold, so it is born held. At a
        life's `End` its queued and waiting rows close as evidence; no new row is owed.

    Releases. `overdue(call, now)` is: `releasing` has the call and `now - since >= bound`
        (`RuntimeDefaults.disposalBound`). Nothing stores it. The alarm `Alarm.Release { call }` at `since + bound`
        fires once and writes no state of this module: it records evidence `ReleaseOverdue` and marks the holders.
        Release, not in `releasing`: added, with `now`. In `releasing`: not reachable (Release reads a Running call).
        The call ends, not in `releasing`: the dispatch's other rows. In `releasing`: removed; the alarm is cleared
            with `tx.alarms.clear(Alarm.Release { call })`.
        The alarm, not in `releasing`: nothing. In `releasing`: evidence once; one publish.
        Who sees it: inspection lists every releasing call with its age; evidence has the one line; an incarnation
        shows one issue per key it holds that has an overdue call, however many such calls there are, under
        `Call { operation, key }` with its own slot's operation. A released call whose key nobody holds is in no
        snapshot; inspection, evidence and `dispose()` show it.
        One fact, one name:
        a call told to stop is still running past the bound: `ReleaseOverdue`; inspection; evidence; an issue for
            holders of its key; `failureOf`'s `overdue`.
        a release that ended in failure: `CleanupFailed`; evidence when found; `failureOf`'s `cleanups`.
        the Runtime's own close still running at its bound: `ReleaseOverdue`; `failureOf`'s `overdue` list, at the
            path of the Owner still closing.
        `CleanupOverdue` (`close.ts:181`) is deleted. A cleanup that fails after `dispose()` already listed it overdue
        goes to the host's report, as today. A write's `Cancelling` head is not in `releasing`: the lane row is the
        write's own signal.

    Rows. The refusal is on the row. Only `afterTry` writes it. By the row's delivery and the try
        (Heard | Unmapped | Refused { refusal }):
        Queued: closed Delivered | closed, evidence | Retrying, `refusal` set, queued once more.
        Retrying: closed Delivered | closed, evidence | Kept, `refusal` set.
        Waiting, Kept: not tried; `tried` returns none (not in the mailbox) for all three.
        Other writers leave `refusal` as it is: a start adopts a Kept row to Retrying for its one try; a suspend makes
        it Waiting; letting go closes it. A restored row has none until its try in this process. A closed row is gone,
        and its issue with it.
        One unknown per Attempt, at one point, `ledger.owe`. Owed for Attempt a, with no unheard unknown row for a:
        the row is added. With an unheard unknown row for a: an unknown adds nothing (the slot holds one); a success,
        failure or not sent closes that unknown row as evidence `Replaced`, then the row is added. An unknown after a
        final answer is not reachable: a final answer removes the head, and only a head on the wire or held is
        answered. The head stays `Held` and the row is its unknown, so the saved head's unknown encodes one row and is
        not a projection. `Origin.HeldAtStart` (`ledger.ts:140`) and its once-guard go: `Records`' own `admit` derives
        the `Restored` unknown. Four inverted tests wait on this (`restore.test.ts:86, 98`,
        `cells/structure.test.ts:25`, `transfers/bank-app.test.ts:79`).
        The Attempt id stays `att-<seed>-<n>`. `Host.sessionSeed` is fresh for every boot (`host.ts:25`; at least 128
        random bits in a browser, the tab's name and open count in a Story, `testing/run.ts:132`). A restored Attempt
        keeps its saved id. What `Records` still owes is two tabs of one store (@task.V3.T28).
        Row before publish. An ending's turn is computed first and applied as one of `Changes`' changes; the
        applier's row C4 calls `afterTry` and row C6 publishes. `serveEnding` publishes nothing itself. Change `Turn`
        with an ending: row C2 as `Changes`; C4 `afterTry(row, Heard)`. `Refused` with `ending` some: row C2 writes
        nothing; C4 `afterTry(row, Refused { refusal })`. `Unturned`: C2 none; C4 `afterTry(row, Unmapped)`.
        Timeout. `resultOf` maps a failure whose error is a `Cause.TimeoutError` (`Cause.isTimeoutError`) to
        `CallResult.Unknown` for a write. For a read, `Cause.TimeoutError` stays in the contract's `E`, so the
        `failure` mapping names the tag `TimeoutError` by the ordinary exhaustive check; `ENDINGS.failure` is
        unchanged.
        Taken unchanged: `Bound<"read">` without `concurrency`; a Compiled operation lists its services, and the boot
        fails `MissingService`, naming operation and service, when the Runtime's Context lacks one.

    Guards read one view. `lanes.viewOf` (`core/lanes.ts:355`) stays the only reader of a lane for a guard, a member
        (`retry`, `cancel`) and `O.x.get`. Its lane is found by the part's subject (`subjectOf` of `Changes`), the
        operation and the key's canonical text, so a guard in a fragment reads its own copy's lane. The view is derived
        from the lane's head (`HeadShape` of `Records`) and stored nowhere. They exist in the code
        (`src/tokens.ts:127-136`, `src/core/turn.ts:186-195`) and keep their public shape.
        no lane: `Idle`; `idle` passes; `retryable({ times })` declines, `NothingToResend`.
        head `"Out"` (every phase but `Held`): `InFlight`; `idle` declines, `InFlight`; `retryable` declines,
            `InFlight`.
        head `"Held"` (its one unknown, heard or not): `Held { retryCount }`; `idle` declines, `Uncertain`;
            `retryable` passes when `retryCount < times`, else declines, `RetryLimit`.
        `retryCount` is the head's saved count (`HeadShape.retryCount`); each resend adds one (`lane-moves.ts:280`), so
        it survives a reload. `retryable` has a keyed form and a keyless form (`tokens.ts:128-135`); both read the
        same view. A guard reads the lanes as they were before the turn: `runTurn` writes nothing, and a turn's own
        actions land in row C3. A key callback that throws is row W7 of `Changes` (`GuardDefect`, the guard's slot).

    Occasions that do not compare.
        Restore (a boot): no entry, slot or releasing call exists; a saved entry is installed with `asked: none`. The
            first Ask sees it: not fresh, so it starts a request.
        Adoption: a saved entry whose key is already in memory is ignored; none needed, memory is newer.
        Time passing: nothing is written when data ages past `staleTime`; the next Ask or `entryView` reads `fresh` at
            its own `now`.
        The release alarm: writes no state; the publish it raises derives `ReleaseOverdue`.
        Freeze: a frozen life's slots keep their holds; no key is re-read; Thaw queues the rows that waited and the
            machine asks again. A read's request belongs to its entry and runs on while any hold remains, a frozen
            slot's hold included; a life's own held calls are interrupted and each of its waiting lookups is owed one
            `Interrupted` row.
        Thaw, wake: no slot is re-asked; the turn that hears the row sees it.

    Issue view. `issuesOf` is a concatenation; each part reads one owner's state and nothing else.
        a refused event turn: `Event`; `outcomes`; gone at that source's next clean turn.
        a failed reaction: `Reaction`; `outcomes`; gone at its next clean run.
        a slot's read threw (context, prop, `resetOn`): `Slot`; `outcomes`; gone at its next clean read.
        a schedule's refusal or failed read: `Schedule`; `Schedules`' `Scheduled`; gone by `Schedules`.
        a refused ending: `Ending`; `Owed.refusal` of the actor's rows; gone when the row closes.
        a read's `Defect`, or a failure with no mapping: `Entry`; `Entry.last`, for a slot of this incarnation; gone at
            the next landed success, a Clear, or when the slot leaves.
        a placement's select failed, `SelectedNoKey`: `Placement`; `Placement.select`; gone at its next clean run or
            when the placement leaves.
        `ReleaseOverdue`: `Call`; `releasing` and `now`, for keys this incarnation holds; gone when the key's last
            overdue call ends.
        `RecordUndecodable`, `StorageFailure`: `Record`; `world.quarantined`, `world.withheld` (as today); gone by
            `Records`.
        A `resetOn` that throws under `Begin` is `outcomes[Slot { at, slot: "resetOn" }]`; the slot keeps its last
        value. `IssueSource.Creation` (`incarnations.ts:42`) and `IssueSource.Operation` are deleted. `StoredSource`
        cannot hold `Ending`, `Schedule`, `Entry`, `Placement`, `Call` or `Record`: a stored copy of a derived issue
        does not type-check. An entry's state is shared by its holders, as its data is: a slot that joins a key whose
        last answer failed shows that failure until a success lands. The view takes `now` for one row only. No row of
        `Changes`' applier compares issue lists.

    Catalog. One catalog, in `error.ts`; every other list is a derived type.

        ```ts
        // NEW: class and surfaces per code.   existing: the codes.   dropped: DIAGNOSTIC_OF, snapshot.ts#issueOf's rule
        const CATALOG = {
            Defect:             { class: "Defect",  issue: true,  report: false, reasons: [] },
            InvalidTurn:        { class: "Failure", issue: true,  report: false, reasons: [] },
            GuardDefect:        { class: "Defect",  issue: true,  report: false, reasons: [] },
            StorageFailure:     { class: "Failure", issue: true,  report: true,
                reasons: ["quota", "closed", "aborted", "failed", "silent"] },
            CleanupFailed:      { class: "ByCause", issue: false, report: true,  reasons: [] },
            ReleaseOverdue:     { class: "Failure", issue: true,  report: true,  reasons: [] },    // NEW
            RecordUndecodable: { class: "Failure", issue: true,  report: true,  reasons: [/* Records' Reason tags */] },
            InvariantViolation: { class: "Defect",  issue: false, report: false, reasons: [] },    // NEW
            // InvalidConfiguration: reasons is `keyof typeof CHECKS` of `Types`, derived, never copied
            // ... one row per code of today's `Code`; `Changes`' list repair is one more row with `report: true`
        } as const;
        type Code = keyof typeof CATALOG;
        type IssueCode = { [C in Code]: (typeof CATALOG)[C]["issue"] extends true ? C : never }[Code];
        type ReportCode = { [C in Code]: (typeof CATALOG)[C]["report"] extends true ? C : never }[Code];

        // NEW: every reason an ending can carry that Flow itself writes; the contract's own tags join by type.
        const ENDINGS = {
            unknown: ["Defect", "Interrupted", "Restored", "StorageFailure", "TimeoutError"],
            notSent: ["Rejected", "Cancelled", "StorageFailure", "Disposed", "Restored", "Unencodable", 
                "NoPersistence"],
            failure: ["Defect", "Interrupted"],                                   // a read's ReadFailure
        } as const;
        ```

        Classification has one rule, `CATALOG[code].class`; `ByCause` reads the diagnostic's own Cause (a die is a
        Defect, a fail a Failure, interrupts only an Interruption). `error.ts#classify` (80-86) and
        `snapshot.ts#issueOf` (150) become it. A literal that names a store refusal appears once (`StorageFailure`);
        the lane's evidence kinds and the port's error reuse it by type. The rename table for saved text, handed to
        `Records` as data and applied by a format step that reads no definition: `{ StorageRefused: "StorageFailure" }`
        for `reason` and `why` (`stories/storage.test.ts:54` pins the old text).
        `SavedEnding`, per contract, the exact union the ledger emits: `{ success, value }` by the contract's `output`
        codec; `{ failure, reason: tag, value }` by its error codec; `{ unknown, reason }` and `{ notSent, why }` by
        `ENDINGS`, with no value. A contract with no declared codec keeps today's canonical form and its fallback to
        unknown `Restored` (`record.ts:107`); see open Q7.

    A failure crossing cleanup. `failureOf(body, cleanups, overdue, primary)`. `judge` (`owners.ts:53`, called at
        `:212`) stays the one classifier of an Exit, in its order: any interrupt is Interrupted, else any die is Died,
        else Failed. Every reason it finds beside an interrupt that is not an interrupt is, together, one cleanup, the
        first one (`besideOf`; today's `cleanupOf` keeps that Cause whole). The caller awaits each cleanup's Exit or
        lists it as overdue, and never drops a race's loser. `cleanups` are in phase order (work, forget, services),
        and inside a phase in the Owner tree's close order (children first), never in the order they happened to end.
        "Cleanups" below includes the one `judge` found beside an interrupt.
        Body Done: no cleanup failed, none overdue: the success. Otherwise: fail `[cleanups..., overdue...]`.
        Body Failed with a FlowError: no cleanup, none overdue: the body, unchanged. Otherwise: fail
            `[its diagnostics..., cleanups..., overdue...]`.
        Body Failed with another: no cleanup, none overdue: fail `[primary]`. Otherwise `[primary, cleanups...,
            overdue...]`.
        Body Died: no cleanup, none overdue: fail `[primary]`, classed Defect. Otherwise `[primary, cleanups...,
            overdue...]`.
        Body Interrupted: no cleanup, none overdue: the interruption, untouched. Otherwise: the body's interrupts
            combined with fail `[cleanups..., overdue...]`.
        Count: one `CleanupFailed` per failed cleanup and one `ReleaseOverdue` per overdue release, each at its own
        path. `Cause.combine` drops equal reasons, so the count is never read from a Cause, and no summary holds a
        number.
        The error's `cause`: `Cause.combine(b, c1, c2, ...)`, where `b` is the body's Cause for Failed and Died, a
        FlowError body's own `cause`, and nothing for Done and Interrupted. Body first, then the cleanups in the order
        above: Effect's own order for a finalizer (`causeCombine(exit.cause, finalizer)`). Every reason of every input
        is in it once. `evidence` is none; T100 adds the field.
        Class: each diagnostic is classed from its own Cause, not from the whole.
        The interrupt row: the result is `Exit.failCause(Cause.combine(interruptsOf(body), Cause.fail(error)))`, so
        `Cause.hasInterrupts` is still true and the FlowError is still found.
        Callers: `close.ts` (body `driver.ended`, `primary` a `Defect` at `dispose`), `run-promise.ts` (`primary`
        `RunFailed`), and an Owner's end.

    Construction trust.
        One door. Every public function is `door(name, args, run)` (see the operation).
        `made` is the only constructor of a value Flow hands out. Its face is deeply frozen data; a function anywhere
        in a face that no door registered is an `InvariantViolation` at construction. What the core calls (`textOfKey`,
        `call`, `make`) is off the face, under a second registered symbol that no enumeration shows. `made`, `madeOf`
        and `intake` are internal; `render` and `renderAll` are T100's.
        The brand: `Symbol.for("flow-state/Made")` on one shared frozen prototype. A spread or a JSON round trip drops
        the prototype. `madeOf(kind, owner)(value)`, called on a lifted value, by whether `MadeTypeId in value`:
        the read throws: one `Defect` finding at the path.
        false: `WrongKind`. true, another kind: `WrongKind`.
        true, this kind, another definition's owner: `ForeignToken` (today's owner compare).
        true, this kind, this owner: the internals.
        `intake` is lift then decode. Today's `boundary.ts#admitted` reads `given[n]` again after `walk.is`
        (`boundary.ts:528-541`), so it is replaced, not reused. The same `intake` checks a lookup's input, a commit's
        input and, with `output`, a call's value. A contract's `staleTime` and `gcTime` are durations of zero or more,
        checked by its door's Schema.
        `InvariantViolation` from the core stops the Runtime, as today's `defect` does through the driver.
        Order: T98a (before T113's `derive.ts` and T109): `door`, `made`, `madeOf`, the testing route, marks removed.
        T98b (first in P5): `intake` and one Schema per door. T100: the catalog, `failureOf`, the renderer.
        @task.V3.T98's text still says `WeakMap`; it needs the brand wording when it is split.
        `Flow.private` means "left out of outside snapshots". It does not mean "not saved": it is saved in clear text
        (a value that must not be stored comes from host context).

    Entry store. A `resource({ persist: true })` saves `{ contract, key, value, at }` when data lands (`Records`'
        `CacheShape`); it requires its `output`. `install` runs once per saved entry at boot or adoption:
        its key is already in memory: ignored.
        does not decode by `output`: starts missing; no quarantine.
        `now - at >= gcTime`: starts missing; the record is deleted.
        otherwise: an unheld Idle entry: data `{ value, at, asked: none }`, `unheldSince := now`, a
            `tx.alarms.set(Alarm.Collect { entry }, now + gcTime)`.
        `asked: none` is never fresh, so the first Ask starts a request and the view shows the data as stale. A clock
        that moved back makes the age negative: the entry installs, still stale.

    Alarms. One heap of `Alarm`, set and cleared through `tx.alarms` by the owner of each fact in the transition
        that writes the fact. This module owns two kinds: `Collect { entry }` and `Release { call }`. `tick` dispatches
        by a total match: `Release` to `entries.releaseDue(call)` and `Collect` to `entries.collectDue(entry)`. The
        kind order at one instant is `Changes`' (`tick`, its Q9); no trace found here depends on it. `stepEnds` runs 
            before the step's `Wake` command, because it may set a `Collect` alarm.

    Pseudo-code.

        ```
        settled(call, result):                                  -- answers.ts
            if releasing.has(call): releasing.delete(call); alarms.clear(Release { call }); evidence Released; return
            match callHome.get(call):
                some(entry): entries.apply(entry, Settled(result))
                none:        lanes.settle(call, classify(result)) or defect

        lookup(life, operation, raw, owner):                    -- entries.ts
            input = intake(operation.input)(raw)
            if failure: ledger.owe(Defect row to life, input: {}); evidence InvalidInput; return
            e = entryOf(operation.contract, keyText(input)) or create
            s = slots[life][operation]
            letGoKeptOf(s)
            if s and s.entry != e.id: leave(s)                    -- Superseded; the old entry is touched
            point(s, e)                                           -- First hold arrives if e was unheld
            apply(e, AskLookup(s))

        apply(e, cue):                                          -- the table above, total over Request x currency
            cell = TABLE[cue._tag][phaseOf(e)]                    -- phaseOf: Idle | Current | Behind, derived
            for move of cell(e, cue, now): perform(move)          -- Start, Serve, Owe, Release, Remove, field writes
            maintain callHome, slotsOfEntry, placementsOfEntry    -- indexes, in the same step

        stepEnds():                                             -- once per step, the last row of `step`
            for e of touched entries with holds(e) = 0 and unheldSince none: apply(e, LastHoldLeft)

        an ending's mail:                                       -- serve.ts
            row = ledger.tried(actor, id); none -> return
            payload = mapping.from(row.value, { input: row.input, key: pick(row.input, keyFields) })   -- callSlot
            throw   -> apply(Change.Refused { source: Ending{..}, failure, ending: some(row) })
            else    -> runTurn(...) -> Change.Turn | Change.Refused | Change.Unturned, each with the row
            -- the applier: C2, C3, C4 (ledger.afterTry), C5, C6 publish, C7

        issuesOf(world, compiled, inc, now):
            [...outcomes(inc), ...scheduleIssues(inc), ...rows(owed[inc.actor]).filter(refusal),
                ...slotsOf(inc).flatMap(entryIssue), ...placementIssues(inc),
                ...keysHeldBy(inc).filter(k => releasingOf(k).some(overdue(now))).map(callIssue), ...recordIssues(inc)]

        failureOf(body, cleanups, overdue, primary):            -- host/failures.ts
            j = judge(body); cs = [...toArray(besideOf(body) at body's path), ...cleanups] -- every non-interrupt reason
            tail = [...cs.map(cleanupFailed), ...overdue.map(releaseOverdue)]
            match j.ending:
                Done              -> head = [];              b = empty
                Interrupted       -> head = [];              b = empty
                Failed(FlowError) -> head = e.diagnostics;   b = e.cause
                Failed, Died      -> head = [primary(body.cause)]; b = body.cause
            if tail is empty and j.ending is Done, Interrupted or Failed(FlowError): return body
            error = FlowError(head ++ tail, cause: combine(b, ...cs.map(c => c.cause)))
            return j.ending is Interrupted ? failCause(combine(interruptsOf(body.cause), fail(error))) : fail(error)
        ```

composition
    flow
        Seams. The Offers and Needs lines are for `wk lint`'s seam check.

        - **Offers** `entries`: the three read states, written only by `entries.ts`.
        - **Offers** `issuesOf`, with `IssueSource` and `StoredSource`: the concatenation of every source's issues.
            `Schedules` owns `scheduleIssues`, its part, with its memo keyed by its map's identity inside the core;
            the host keeps no issue memo.
        - **Offers** `CATALOG` and `ENDINGS`; `Code`, `IssueCode`, `ReportCode`. `Types` owns `CHECKS` (the reasons of
            findings); `CATALOG.InvalidConfiguration.reasons` is `keyof typeof CHECKS`, derived, never copied.
        - **Offers** `SavedEnding` and the rename table, to `Records`.
        - **Offers** `failureOf`, `door`, `made`, `intake`.
        - **Offers** the `Collect` and `Release` alarm kinds: this module is the only writer of these two kinds,
            through `tx.alarms`.

        What each other Spec must provide.
        - `Schedules`: `selectionCodec` is the key text and the equality of a read's key (key text is by it, not by
            `sameValue`); a schedule's issue source is `Schedule`; the branded `SlotName`.
        - `Changes`: reads keyed by life (`slots` is `readsOf`'s index); lanes keyed by subject (a lane's `At` names it;
            no cell changes); `Freeze` and `End` call `entries.freeze` and `entries.end` from row C4; placements
            unplaced at `Freeze` and placed at `Thaw`; `issuesOf` reads `outcomes`; a `resetOn` that throws is
            `StoredSource.Slot`; the list repair's report code is a catalog row; `tick` calls `releaseDue` and
            `collectDue` by a total match over `Alarm`; `step` calls `stepEnds` as its last row, before the `Wake`
            command, and `stepEnds` may set a `Collect` alarm; `releaseDue` marks holders touched and the host
            publishes as for any step. Request: three cells of the applier change, for an ending's `Turn` (C4 calls
            `afterTry(row, Heard)`), for `Refused` (C4 calls `afterTry(row, Refused { refusal })` and C2 writes no
            outcome) and for `Unturned` (C4 calls `afterTry(row, Unmapped)`); without them the issue is keyed by
            source again and issues of two keys of one operation collide. These are accepted into `Changes`' rows.
        - `Records`: its answers to this module: `SavedEnding` by the catalog (`ENDINGS` and the contract's codecs);
            one unknown per Attempt (the unknown table); the install table for saved entries; the Attempt id rule (the
            seed differs for every boot), with two tabs of one store left to @task.V3.T28; hydrate against restore is
            not answered here. The `HeadShape` unknown encodes one row.
        - `Types` (handed): a mapper's `(value, { input, key })` infers from the contract through `outcomes`;
            `Bound<"read">` without `concurrency`, a `resource`'s `K` equal to its input's fields, and
            `Cause.TimeoutError` excluded from a `transaction`'s `E`; the door's public types from `derive.ts`, the
            surface walk over both routes and the `throw` lint; the evidence `EvidenceOf<D>` that carries a schedule's
            declared name, key and reasons (this module supplies the value `IssueSource.Schedule`).
        - `Host`: the run rule "a published snapshot's issues equal `issuesOf` of inspection's state"; the generator
            of the tests and an abort-ignoring fake for reads; the Story clock driving the two alarms; `flow explain`
            and inspection showing `releasing`, entries and a row's refusal; the host calling nothing for the release
            alarm (the step's last row and the holders' touch derive the publish); the public event a view sends for
            `refetch` (`Host` Q6); the rule judge is `Host`'s (`host/judge.ts`); this Spec keeps only 
                `owners.ts#judge`, under its name.
        - Tasks: @task.V3.T21's acceptance still says `{ value, input, key, attempt }`; the user's decision is
            `(value, { input, key })`. No Task's scope is changed here. Doors are @task.V3.T131 (T98a); `intake` is
            @task.V3.T132 (T98b); the catalog and renderer are @task.V3.T100; operation endings, retry guards and
            lane policies are @task.V3.T121; entries and read slots (the dispatch, the entry table, slots, `Collect`)
            are @task.V3.T122; placements and release (`Release`, `ReleaseOverdue`) are @task.V3.T123; persisted
            resources (install, cache rows, the persisted `output`) are @task.V3.T124; hydration is @task.V3.T115.

rules
    OneHome            A call has one home from its start to its end: an entry's request, `releasing`, or a lane head.
                       Release is the only move from an entry to `releasing`, and it makes the entry Idle at once.
    OneWait            A slot has one wait. An Ask through a waiting slot keeps it; the older ask is evidence
                       `Superseded` and is never owed.
    NoRetryLoop        An automatic start exists in three cells only (Invalidate, Clear, a placement's Ask). No cell
                       starts a request because the last one failed.
    StepBoundary       Last hold left is judged at the end of the step. A hold that leaves and returns inside one step
                       changes nothing; the running call is handed over.
    BornHeld           An entry is created by its first hold, so it is born held; it exists only while held or
                       within `gcTime` of its last hold.
    RowBeforePublish   The applier's row C4 moves the row before row C6 publishes; `serveEnding` publishes nothing.
    TimeoutIsUnknown   A write whose Effect fails with `Cause.TimeoutError` is `CallResult.Unknown`, never a failure;
                       the type of `transaction` excludes it from `E`. For a read it is an ordinary failure tag.
    RetryInsideCommit  Inside `commit`, `Effect.retry` is immediate only (`times`, `while`): one Attempt and one call.
                       A retry after a delay is a machine schedule that runs `O.x.retry`. No type can check what a
                       commit's Effect does, so this is guidance, not a rule of the core.
                       [decided: user 2026-11-21] answered "A": immediate re-sends only; every delay goes to the
                       machine.
    ThrowingRead       The family rule for a user read that throws changes only its own check. (1) Its field is
                       `Failed(f)`, and an issue names its slot. (2) Every decision that needed the value is made as if
                       the read had returned its last clean value; a subject with no clean value yet uses the neutral
                       one (no key, no reason, no baseline, the slot as the record gave it). (3) The next occasion
                       reads again, and the first clean read after a failure is compared with the last clean value, or
                       becomes a silent baseline where there was none. (4) Inside a turn, a callback the turn must run
                       to compute its own result (a guard, a mapper, a patch, a payload, a `resetOn` or list read on
                       the turn's memory) is the turn's check: the turn is `Refused` and nothing else changes; what it
                       was owed is kept (an ending's row is tried once more and then Kept with its issue, and the
                       slot's next lookup or cancel lets it go). Members here: a placement's `select` and an ending's
                       mapper. A mapper bug leaves the machine in its loading state with the issue naming the mapper's
                       slot, until it asks again; a `Defect` mapper that throws needs this rule anyway.
    FreezeAndCalls     A freeze interrupts a life's own held calls and owes each of its waiting lookups one
                       `Interrupted` row; a read's request belongs to its entry and runs on while any hold remains, a
                       frozen slot's hold included.
    OneCatalog         Every code union derives from `CATALOG`; a store refusal is named once; one rule classifies.
    GuardsOneView      A guard reads a lane through `lanes.viewOf` only, as the lanes were before the turn.

realization typescript
    Casts and unknowns in the area, today and after:
        `contract.ts:247` `trusted` (`input as A`): a read's input is "checked by type only" today; removed:
            `intake` returns the typed copy, for a commit and a lookup alike.
        `contract.ts:256` `trustedAttempt`: restores `Attempt<I, K>` from `Compiled`; kept, justified: one of the
            erasures `Types` owns.
        `contract.ts:60` `context: unknown`: no mapper reads it; removed: `MapperContext<I, K>`.
        `contract.ts:70` `ErasedEnding = Ending<never>`: every `Ending<V>` assigns to it; kept, justified: the one
            restore is `serveEnding`'s call of `from`.
        `handles.ts:30` `erase`: restores the callback's parameter; kept, justified: `Types`.
        `entry.ts:46` `wrapped as F`: the door's public type; kept, the one cast of a door; the type comes from
            `Types`' `derive.ts`.
        `Owed.value: unknown`, `Entry.data.value`: a call's value; kept: decoded by the contract's `output` at the
            boundary when declared.
        `Bound`'s defaults `R = unknown`, `I = Values`: erased in `Compiled`; kept; `Bound<"read">` loses
            `concurrency` (`compiled-parts.ts:74`).

    Cost. Sizes: W waiters of one entry, S slots and placements of one life, Q rows of one identity. By reading, not
    measured; the bench decides. After, against today:
        lookup, refetch, cancel: O(1): `slots[life][operation]`, `entries[contract][key]`. Today O(all reads):
            `lanes.ts:125-133`.
        the end of a life: O(S). Today O(all reads): `incarnations.ts:301-302`.
        a settled read: O(W): one row per waiter. Today O(1) plus a drop.
        invalidate or clear by a partial key: O(entries of that contract). n/a today.
        `issuesOf`: O(Q + S), plus the releasing calls of held keys. Today a stored list.
        disposal: O(lives x S) through `End`; lanes unchanged. Today `reads` replaced (`disposal.ts:85`); all lanes.
        owed rows at a start or end: O(Q): one write per pass. Today O(Q^2): one `setRows` per row
            (`ledger.ts:328-411`).
        Indexes, each written by the owner of its fact in the same step and checked by `Changes`' `indexDrift`:
        `callHome` (call to entry), `slotsOfEntry`, `placementsOfEntry`, `releasingOfEntry`, and the two nested maps of
        the types. Holds are the sum of two set sizes and the data layer's count. Hot-path allocations: an Ask of a
        fresh entry allocates one row; a join allocates nothing. The lane queue's spread per enqueue
        (`lane-moves.ts:230`) and per dequeue (`:189`) stays: O(queue), and the bench decides.

    Principles held or traded:
        One owner per state: held; `entries.ts` for the three read states; the ledger for rows; `failureOf` for the
            crossing.
        Store facts, derive views: held; no stored overdue, timer id, waiter position, issue or count. `again`,
            `waiting` and `unheldSince` are facts (a want, a wait, a time), each with one writer; I1, I2 and I5 tie
            them to the rest.
        Explicit states: held; `Request`, `Heard`, `Refusal`; currency is derived and named.
        Total tables: held; the entry table has no empty cell; "not reachable" cells are I3 and the dispatch.
        Survives a reload: held; positions and calls are never saved.
        Same rule at every scope: held; a slot is keyed by a life (root, instance, fragment).
        One equality and one codec per fact: held; key text by `Schedules`' `selectionCodec`.
        A throw changes only its own check: held; `CallbackInputs`.
        Simple: held, by cutting: `Trigger`, `landedAt`, `waiting.after`, the trailing input, the release table's 
            states.
        Effect at the edges: held; timeout, retry, interruption and Cause combination are Effect's.
        Types derive from their source: held as stated; not compiled (open Q10).
        Cheap operations: traded: invalidate by partial key is O(entries of the contract) and `issuesOf` reads every
            row per publish; a prefix index and the memo land with a bench row.
        Every Cause kept: traded: `Cause.combine` drops equal causes; the diagnostic keeps one of each.
        General: checked against the fixtures: shop pay (a write whose answer is lost is unknown, polled by a read
            every 3 seconds; a lookup slower than the poll still gets its answer); transfers (`balance` keyed by
            `account`, its whole input; a 30 second deadline by `timeoutOrElse`); sync and lanes (a fake that cancels
            over the connection in `Effect.onInterrupt` is the failing release); sign-in (`me`'s value holds a refresh
            token that lands in `Flow.private` memory, saved in clear); command-palette, home, player, session (writes
            only; the lane is unchanged; `home`'s schedule guard reads a write's row, which stays a lane read). Every
            read in the fixtures sets `staleTime: 0, gcTime: 0` and keys by its whole input: an entry is shared only
            while a call runs and is removed with its last hold.

coverage
    @R1    enforced_by [@I16]                                    proven_by [@T3, @T4, @T5]
    @R2    enforced_by [@I15, @I20]                              proven_by [@T3, @T4]
    @R3    enforced_by [@I1, @I3, @I6]                           proven_by [@T1, @T2, @T4]
    @R4    enforced_by [@I7, @I9]                                proven_by [@T1, @T2, @T4]
    @R5    enforced_by [@I2, @I3, @I5, @I8, @I10, @I12, @I22]    proven_by [@T1, @T2, @T4]
    @R6    enforced_by [@I11, @I13, @I18]                        proven_by [@T4, @T5]
    @R7    enforced_by [@I14]                                    proven_by [@T3, @T4, @T5]
    @R8    enforced_by [@I4, @I11, @I22]                         proven_by [@T1, @T2, @T4]
    @R9    enforced_by [@I17]                                    proven_by [@T3, @T4, @T5]
    @R10   enforced_by [@I19]                                    proven_by [@T5, @T6]
    @R11   enforced_by [@I23]                                    proven_by [@T4, @T6]
    @R12   enforced_by [@I24]                                    proven_by [@T4, @T5]
    @R13   enforced_by [@I18]                                    proven_by [@T6]
    @R14   enforced_by [@I25]                                    proven_by [@T7]
    @R15   enforced_by [@I21]                                    proven_by [@T4, @T5]

tests
    T1  Reads model, Level 0, pure: the entry table, the slot rules, releases and the dispatch, coded literally, with a 
        fake host that settles in any order, late or never: 2 lives, 2 operations on one contract, 2 keys, placements,
            `staleTime` 0 or 5, `gcTime` 0 or 10. Alphabet: lookup, refetch, cancel, freeze, end of a life, place, 
                unplace,
            invalidate, written, clear, a tick, Collect due, the settle of any open call (success, failure, 
                Interrupted),
            Runtime ends. The oracle is the fake host's own log (calls opened and settled, versions) and the rows, never
            the table. History, not acceptance: a scratch model outside the repository passed 20,000 runs (899,873 
                steps) for I1 to I12, caught two planted mutations
            (no Owe in Written; no Release at the last hold), and passed 80,000 runs over three seeds with Written 
                clearing
            `again`. The generator lives in `tests/generated` before `entries.ts` exists. Not in any model: the data
            layer's holds, `install`, `intake`, doors, the issue view (open Q9). I20 is `cells.ts`'s own table test,
            kept; I22 is `Changes`' `alarmsMatch` (its T14) run after each step of this model. [@I1, @I2, @I3, @I4,
            @I5, @I6, @I7, @I8, @I9, @I10, @I11, @I12, @I20, @I22]
    T2  Reads with steps: the same model with a step of 1 to 3 cues and Last hold left judged at the step's end: 40,000 
        runs, 1.8 million steps, I1 to I12 held at every step's end. A key handed over inside one step kept its
            running call about 6,600 times per seed, with no Interrupt; the same cues in separate steps do interrupt.
            [@I1, @I2, @I3, @I4, @I5, @I6, @I7, @I8, @I9, @I10, @I11, @I12]
    T3  Rows and `failureOf`: 744 combinations (12 bodies, 31 cleanup lists, 0 or 1 overdue) and 20,000 random row 
        sequences; the tables and the pseudo-code agree everywhere; I13, I15 and I17 pass. A body with an interrupt
            beside both a fail and a die was not re-run after `besideOf` took every non-interrupt reason (open Q9).
            [@I13, @I15, @I17]
    T4  The Story of the wrong ending. Each is red on today's code unless noted. 1. Two keys: A's `pay` ending is 
        refused twice and Kept; B's is heard. The snapshot must still show A's issue.
            Cancel A: gone in that publish (I13).
            2. A poll every 3 seconds against a server that answers in 4: the machine must hear an answer.
            3. Two actors look up one key; one ends: the call stays open. Both end: it is interrupted.
            4. A lookup, an invalidate, then the old answer: the machine hears the trailing request's answer, not the 
                old
                one.
            5. A fake ignores the abort of a read whose key the machine then looks up again: no issue before the bound,
                one after, none once the call ends (I11). `ShopFakeSteadfast` does this for a write today; reads need 
                    the
                same.
            6. `dispose()` with two failing cleanups whose errors are equal: two `CleanupFailed` diagnostics, one 
                reason.
            7. A reload, then a new payment: its idempotency key differs from every key the server saw (I16). This 
                should
                pass today; no test states it.
            8. A guard in a fragment reads its own copy's lane; `retryable({ times: 2 })` declines `RetryLimit` after 
                two
                resends, also after a reload (`home/machines/room.ts:93`, `shop/machines/cart.ts:142`,
                `transfers/machines/transfers.ts:59`, `command-palette/machines/palette.ts:168`,
                `services/shop/machines/pay.ts:281`, keyless).
            The four inverted restore tests wait on the one-unknown rule (`restore.test.ts:86, 98`,
            `cells/structure.test.ts:25`, `transfers/bank-app.test.ts:79`). Tests that pin a changed behaviour:
            `cleanups.test.ts:313-334, 368`, `close.test.ts:206-227` (`CleanupOverdue` goes), `close.test.ts:192-204` 
                (the
            codes of a dispose with a forget), `cleanups.test.ts:435-491` (a defect plus a cleanup failure),
            `payment-retry.test.ts:153` (a lookup no longer interrupts the one before it), `rules/commits.ts:146-155` (a
            replaced lookup's evidence), `stories/storage.test.ts:54` (the rename). T99's rules (unbound lanes, 
                consumers
            before providers, `RuntimeDisposed`) are untouched. [@I11, @I13, @I16, @I21, @I23, @I24]
    T5  Planted faults: an issue cleared by another key's ending; a refusal kept after its row closes; publish before 
        the row moves; a behind result that lands; a join when behind; two calls for one entry; no release at the last
            hold; overdue early or kept after the end; a second unknown row for one Attempt; an Attempt id without the
            seed; a lookup input unchecked; a timeout mapped as a failure; a cleanup's Cause squashed; a race's loser
            dropped; a function on a made face; a body that reads the raw argument again; `guard-reads-other-subject` 
                (the
            lookup ignores the subject); `retryable-ignores-count`. Faults that target deleted code go with it:
            `newer-lookup-unsuperseded` (`rule-faults.ts:163`). [@I4, @I7, @I11, @I13, @I14, @I15, @I16, @I17, @I19,
            @I21]
    T6  Types and doors: two-sided type tests for the mapper's inference through `outcomes`, a read's key naming every
            input field, `Cause.TimeoutError` excluded from a write's `E`, and a stored `Ending`, `Schedule`, `Entry`,
            `Placement`, `Call` or `Record` source that does not compile; the hostile table for doors (a copy, another
            definition's token, a throwing getter, a second loaded copy, a function on a face, a body that re-reads its
            argument). [@I18, @I19, @I23]
    T7  Bench: lookup, refetch and cancel against many reads; the end of a life; invalidate by a partial key over many 
        entries; `issuesOf` per publish; owed rows at a start and an end. The catalog's step 4 fixtures (`subscribe`,
            `refetch`, `invalidate`, `setData`, `clear`) come before the entries Task, or the table is tested by the
            generator alone. [@I25]
