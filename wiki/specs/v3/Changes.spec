spec Changes
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance and revisable whenever building shows it wrong; 
              each change and its reason is recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src/core
derives_from  [
              @plan.Machines.O1,
              @plan.Machines.O3,
              @plan.Machines.O5,
              @plan.Machines.O7,
              @plan.Machines.O8,
              @plan.React.O2,
              @plan.React.O3
              ]
provides      runTurn, reconcile, apply, locate, readsOf, tick

requirements
    R1  One event, one result
        source  @plan.Machines.O3.
        must    An accepted event, with everything it raises, notifies, exits, starts and ends, shows as exactly one
                publication. A refused, denied or unhandled event changes no state, memory, instance or emit, and a
                refusal shows as one issue.

    R2  What is shown matches the facts
        source  @plan.Machines.O1, @plan.Machines.O8.
        must    In every publication the live instances are exactly those the published state, lists and reset
                values want. Every frozen instance is a resumable instance whose place was left and whose reset
                value has not changed.

    R3  Nothing owed is lost
        source  @plan.Machines.O1.
        must    The ending of a write a fragment started is heard by a live instance of the same subject, or waits
                for one until the actor is forgotten. The ending of a read is heard by the instance that started it,
                or is recorded as evidence.

    R4  Nothing is made up
        source  @plan.Machines.O1.
        must    No handler or timer runs for an instance that is frozen or gone. An abandoned instance, live or
                frozen, is told once, in the turn that ends it, never for an exit or a freeze, and only while its
                host stays.

    R5  Nothing replays or crosses over
        source  @plan.Machines.O1, @plan.Machines.O3.
        must    A reload, restore or thaw fires no start, no `whenAbandoned` and no emit. An instance's id is never
                reused. A firing or a read's ending never reaches a later instance. A public event addresses a
                place, as a send addresses an identity.

    R6  Order is the mailbox's
        source  @plan.Machines.O3, @plan.Machines.O7.
        must    One actor's mail is served in admission order. The events a context or props update causes are
                served before anything else of that actor. An emit's handler sees its turn's snapshot or a later
                one.

    R7  A broken callback breaks only its own check
        source  @plan.Machines.O3.
        must    A throw before commit refuses the whole turn and delivers nothing of it. A throw in a reaction or a
                listener changes nothing else. A user read that throws follows the family rule (`rules`, family).

    R8  A props update writes only props
        source  @plan.Machines.O7, @plan.Machines.O8.
        must    A props update writes only props, in its place in the mailbox. An update whose every field is equal
                is silent: no publication, no reaction, no evidence.

    R9  Things end in order
        source  @plan.Machines.O3.
        must    Consumers end before their providers, and children before their hosts.

    R10  An event costs what it touches
        source  @plan.Machines.O3.
        must    Work per turn grows with the parts, instances and scopes the turn changes, not with the actors,
                copies or timers that exist.

    R11  One applier
        source  Problem class G1 (`Changes.md`).
        must    Every change to an actor is one value, `Change`, applied by one function, `apply`, in one fixed row
                order. Creation, a refusal, a context or props update, a firing that did not commit, a use returning
                and the actor's end are `Change`s, so none is a second applier. `why` is a function of the change's
                tag. Only `apply` constructs an `Incarnation`.

    R12  Instances settle inside the turn
        source  Problem class G2 (`Changes.md`); @plan.Machines.O3 as amended by `rules` (settling).
        must    `reconcile` runs inside the turn until nothing more ends, so no state is committed unsettled, no
                follow-up flag or follow-up turn exists, and a started instance exists in the publication that
                started it.

    R13  Instances by one function
        source  @plan.Machines.O1; problem class G3 (`Changes.md`).
        must    A fragment instance has no writer of its own. One pure function, `reconcile`, compares the stored
                instances with the ones the committed facts want and returns every start, end, freeze and thaw as
                data. The root is the instance at the empty address, so one holder table and one stale check serve
                the actor, its fragments and every `.each` copy.

    R14  The walk
        source  @plan.Machines.O3; problem class G7 (`Changes.md`).
        must    A turn's walk returns one `Turn`: the parts in walk order, one changer, one site per memory key,
                and a site reached again reads its own earlier writes. Two different sites writing one key, or two
                sites each with a target, refuse the turn.

    R15  Who a raise reaches
        source  @plan.Machines.O1; @plan.Machines.O3.
        must    A raise reaches the instances live after the source's own patch (W0). An `.each` raise reaches
                every live copy in list order and no frozen one; a plain slot that is frozen or absent refuses.

    R16  When `whenAbandoned` runs
        source  @plan.Machines.O1.
        must    The callbacks of `whenAbandoned` run only inside a turn, only for an instance ended by `Left`,
                `KeyGone` or `Reset`, and only into a host that stays. Releases apply at every end but an exit and
                a dropped slot.

    R17  Holders and the one stale check
        source  Problem class G3 (`Changes.md`).
        must    Work has one of two holders: a life (one instance, named by its id) or a subject (an address with
                its keys and reset values). `locate` is the one stale check. A life-held ending never reaches a
                later instance; a subject-held one reaches the next instance of its subject.

    R18  Ids that outlive what they name
        source  Problem class G8 (`Changes.md`).
        must    An instance's id is an `ActivationId`, minted by `apply` at `Start`, kept across `Freeze` and `Thaw`,
                never saved and never found by address. An ended instance's timers and reads cannot be found under
                its successor.

    R19  Emits
        source  @plan.Machines.O3, @plan.Machines.O8; problem class G4 (`Changes.md`).
        must    An emit is a field of a `PartRun` and nothing else. Its payload is checked by its codec in the walk.
                Listeners run at the publication that shows the turn, never before it, in turn order, each guarded
                by its own `Result.try`. A reload emits nothing.

    R20  Props
        source  @plan.Machines.O7, @plan.Machines.O8.
        must    Props are written only by `Begin` and by an `Inputs` change; a patch is merged when served, never
                when queued, never coalesced. An `Inputs` change runs no handler and has no `Turn`.

    R21  The mailbox and the drain
        source  @plan.Machines.O3, @plan.Machines.O7.
        must    One mailbox per actor with front mail, a queue and at most one context update. A change is served
                with its front mail in the same call, so no other mail, yield or host notify falls between a props
                or context change and the turns that repair it.

    R22  Callback inputs
        source  @plan.Machines.O1; problem class G4 (`Changes.md`).
        must    Every input of every user callback is built by one function, `readsOf(incarnation, scope, view)`;
                `check` builds the same record from a snapshot. Fragments read no context.

    R23  What each scope's schedules hear
        source  @plan.Machines.O5; @spec.Schedules.
        must    Every `Change` maps to the five schedule occasions per scope by one table (the applier's row C5).
                A scope is a state's activation or an instance; `decide` sees no scope. An instance's start is a
                creation: a bad delay is `Refused` with an issue and refuses no turn.

    R24  The actor's end
        source  @plan.Machines.O3.
        must    An actor's end is the `End` change of a live incarnation. What it does to the saved record and to
                mail differs by `how` (`Grace`, `Disposed`, `Forgotten`, `RuntimeDisposed`); the order of ends is
                one function, `endOrder`.

    R25  Indexes
        source  @plan.Machines.O3; problem class G6 (`Changes.md`).
        must    Each index is written by the function that writes its fact, in the same transition, and by nothing
                else; a rebuild from the facts equals every index (`indexDrift`).

    R26  A reload is quiet
        source  @plan.Machines.O1.
        must    An occasion that compares nothing (a restore, a thaw, a use returning) leaves every saved baseline
                and anchor as it is, and the comparing step for each kind it could have skipped runs right after it,
                in the same `apply`, without a condition.

open
    Q1  Nothing is built. Every check below is an obligation of @task.V3.T119, @task.V3.T109, @task.V3.T110, 
        @task.V3.T76, @task.V3.T127 and @task.V3.T128.
        outcome  Each Requirement is proven_by a named test below; each test is an obligation of those Tasks until
                 a check in the package runs.

    Q2  I5, I7, I9, I12, I13 and I15 to I17 have no mechanical check; the first model run covered other invariants on a 
        first draft only, and the revised tables were not run.
        outcome  The first failing checks of @task.V3.T119, as a package sequence test (`tests`, T1), not a model.

    Q3  A reset value's Schema: the slot's declaration names `resetOn`'s Schema, as a schedule's declaration names 
        `restartOn`'s. [decided: user 2026-11-22] Why: one rule with `restartOn`, and a `Date` or record value
        works. Reverse: a reset value is any value by `Equal.equals`.
        outcome  A reset value is encoded by the declared Schema and made canonical text; the type refuses a
                 `Date` without it.
        reasoning  For: one rule with `restartOn` (both compare a selection saved across a reload), and a `Date` or
            record value works. Against: one more declared field in user code. Test: a `Date` reset value
            compared across a reload is equal under the declared Schema and refused without it.

    Q4  Whether a hidden page is a core input. [decided: user 2026-11-22] It is not, in v1; timers keep their 
        deadlines. Why: an autosave keeps saving and no occasion is added. Reverse: a hidden input and a row in
        every scope's table. Also closes `Schedules` Q2.
        outcome  The host's edge reads `hidden()` for its capture only (`Host`).
        reasoning  Not a core input keeps a deadline the author wrote (an autosave keeps saving, throttled by the
            browser) and adds no occasion. A use change stops background work, but needs a hidden input and a
            row in every scope's table. Same question as `Schedules` Q2.

    Q5  Whether `Published` carries the incarnation and `why` has three values (`Begin`, `Turn`, `Other`; an end is 
        `Finished`). The public type that shows it is the host's.
        [decided: user 2026-11-22] Why: one record a rule reads holds state, memory, instances, props and issues.
        Reverse: a fourth `why` value `End`.
        outcome  Written in `algorithm` (applier): `Published` carries the incarnation.
        reasoning  For: one record a rule reads holds state, memory, instances, props and issues; an end already has
            `Finished`, so a fourth `why` would have no assigner. Against: the public face changes shape
            (`Host` owns it). Test: a rule over an instance's memory needs the incarnation; under the old shape
            it cannot be written.

    Q6  How a view addresses a fragment's public event: `Mail.Event.at` exists in the core, the public call that fills 
        it has no design.
        outcome  Not this Spec's: one home, `Host` Q6.

    Q7  A lazy fragment's adoption (@task.V3.T48): a fact `reconcile` reads that no `Turn` writes; it needs a tenth 
        `Change` whose reconcile can only return `Start`.
        outcome  Not designed here.

    Q8  A chain of dependent ends costs one reconcile per copy.
        outcome  Stated cost; the bench holds a case of it; no incremental reconcile is designed.

    Q9  Three proposed rules with no trace against them: the command order of a step (releases before starts), the 
        alarm kind order at one instant, and the wave skip when committed state and root memory are unchanged.
        outcome  A build-time choice in @task.V3.T119's description, with a test for each. This Spec owns the kind
                 order (it owns `tick`); `Operations` and `Schedules` state no order of their own.

model
    Segment = a record of slot and key
        slot: SlotName
        key: Option<KeyText>       // some exactly at an `.each` slot

    Address = ReadonlyArray<Segment>; the empty address is the root.

    AddressKey = string brand, built by `addressKey`, never parsed.

    SubjectKey = string brand: an address with each reset value.

    Anchor = a record of place and reset
        place: Option<ActivationId>   // the activation of the node it sits on: some only for a Live node trait
            // or subroutine slice
        reset: Option<KeyText>        // the reset value as a key; none: the slot has no `resetOn`

    Status = one of
        | Live
        | Frozen

    Instance = a record
        id: ActivationId          // its scope: schedules, owned work and the host's Owner are named by it
        address: Address
        anchor: Anchor
        status: Status
        memory: Values

    Applied = a brand whose constructor is private to `apply.ts`.

    Instances = Applied and a record, every instance but the root, in address order
        byAddress: ReadonlyMap<AddressKey, Instance>
        byId: ReadonlyMap<ActivationId, AddressKey>    // the index `locate` uses

    Incarnation = Applied and a record
        id: IncarnationId; started: number; actor: ActorId; state: string; activations: ActivationId list
        history: ReadonlyMap<string, string>; memory: Values; bound: ReadonlyMap<string, ActorId>
        baselines: Option<Selected> list
        props: Values                                   // NEW: every declared prop, decoded
        context: { values: Values, slots: ReadonlyMap<string, Selected> }       // CHANGED
        instances: Instances                            // NEW
        schedules: Schedules                            // CHANGED by `Schedules`
        outcomes: ReadonlyMap<string, { source: StoredSource, failure: Failure }>  // RENAMED from issues
        no grace field: the grace of a free actor is an alarm

    Site = a record of address and alternative: one alternative in one scope.

    PartCause = one of
        | Source
        | Raise{from: number}
        | Notify{from: number}
        | Exit{from: number}
        | Abandoned{of: Address}

    Emit = a record of address, name and payload.

    PartRun = a record
        part: Part; address: Address; cause: PartCause
        event: { tag: string, payload: Values }
        patch: Option<Values>
        emits: Emit list; actions: Resolved list

    EndCause = Exit, Left, KeyGone, Reset, HostEnded, ActorEnded or Dropped.

    InstanceStep = one of
        | Start{address: Address, reset: Option<KeyText>}
        | End{address: Address, cause: EndCause}
        | Freeze{address: Address}
        | Thaw{address: Address}

    ScopeWork = a record
        scope: Address; path: Option<string>           // an instance, or a state of it
        disarmed: string list                          // replaces the old arm and disarm
        started: { name: string, first: First } list   // First is `Schedules`'

    Repair = a record of an address and the keys dropped from its list.

    Turn = what one accepted turn decided; it holds no id, `apply` mints them
        context: Values; props: Values; now: number
        parts: PartRun list             // walk order; parts[0] is the source
        move: Option<Move>              // the one changer's move
        steps: InstanceStep list        // in the order applied
        memory: Values                  // the root's after memory
        memories: ReadonlyMap<AddressKey, Values>   // each written or started instance's after memory
        work: ScopeWork list            // per scope a part touched or the move entered
        repairs: Repair list
        skipped: Address list           // copies a fan-out raise found no handler in

    Change = one of
        | Begin{origin: Origin, steps: InstanceStep list, repairs: Repair list}
        | Turn{turn: Turn, trigger: Trigger}
        | Refused{source: IssueSource, failure: Failure, ending: Option<Owed>}
        | Unturned{row: Owed}
        | Inputs{context: Option<ContextRead>, props: Option<Values>, events: Queued list, failures: list}
        | Lanes{subject: Address}
        | Settled{firing: Firing, refusal: Option<Failure>}
        | Use{returned: boolean}
        | End{how: Grace, Disposed, Forgotten or RuntimeDisposed}

    Origin = Fresh{input, props} or Restored{record}.

    Why = Begin, Turn or Other; `whyOf(change)` is total and never assigned.

    OwnedBy = one of
        | Root
        | Scope{id: ActivationId}

    Audience = one of
        | Subject{subject: SubjectKey}
        | Life{incarnation: IncarnationId, scope: ActivationId}

    Where = one of
        | State{depth: number}
        | Instance{instance: Instance}
        | Gone

    Reconciled = a record of steps and repairs.

    Facts = what `reconcile` reads
        chain: { path: string, activation: Option<ActivationId> } list    // none: the state is entered by this turn
        memoryOf: Address -> Option<Values>   // the memory so far; a starting instance's initial memory; none: no scope
        exited: Option<Address>               // the slice whose own exit the turn took

    TurnInput = the existing fields and props: Values, instances: Instances, at: Address.

    Inventory = per state: values; owner and only writer; readers; how it survives a reload
        walk accumulator: Walking or Refused; `walk`, table W; one `runTurn` call; not saved
        the `Turn`: built once by `runTurn`; read by `apply`, then evidence; not saved
        control (state, activations, history): `apply` row C2; read by `runTurn`, `reconcile`, snapshot; state and
            history saved, activations minted again
        memory per scope: decoded `Values`, the root's and each instance's; `apply` row C2 from the `Turn`'s patches;
            every callback and the snapshot; whole, by the scope's codec
        props: every declared prop, decoded; `apply` row C2 from `Begin` and `Inputs`; never saved (only local
            actors take props)
        context (values, slots, baselines): `apply` row C2 from `Begin` and `Inputs`; the values record keeps identity
            while no slot changes; saved as before (`seen`, `baselines`)
        an instance's existence and status (absent, Live, Frozen): `apply` row C2 from `reconcile`'s steps; read by
            `walk`, `locate`, snapshot, the schedule owner; saved: status, reset value and memory, by address
        an instance's id: `apply` at `Start`, kept across `Freeze` and `Thaw`; not saved, minted again
        a source's last outcome (absent, or the failure of its last refused turn or failed reaction): `apply` row C2:
            a failure sets it, a clean run of that source clears it; read by `issuesOf`; not saved
        schedules per scope: `Schedules` by scope id; `decide`, called from row C5; saved as `Schedules` says
        the mailbox per actor (front mail, a queue, at most one context update): the `tx` mail functions; read by
            `drain` and the grace view; not saved
        owed rows (the audience names a subject or a life): the ledger, called from row C4; read by `serveEnding`
            and capture; subject-held rows saved as before, life-held never
        uses: `ensure` and `release`; read by `awake` and the grace view; not saved
        alarms: one heap of `Alarm`, a tagged union: `Schedule{scope, arming}`, `Grace{actor}`, `Bound{disposal}`,
            `Silent{ticket}`, `Collect{entry}`, `Release{call}`; at most one per owner fact; `tx.alarms.set` and
            `tx.alarms.clear`, called by the owner of each fact in the transition that writes the fact (the
            applier's row C5, the grace view, the disposal and ticket rows, the entry table of `Operations`); read
            by `tick` and the host's one wake; not saved (views)
        a listener set per actor identity: ordered listeners; `src/host/emits.ts`; read by the host's publication
            (`Host`); not saved
        indexes: see `realization`; the writer of each indexed fact; rebuilt by `indexDrift`

    Derived = never stored
        `Published.why`; whether a scope is awake (its actor is used and every instance on its address is Live); a
        copy's `item` (its host list's entry); the subject of an instance (the keys and reset values along its
        address); whether a context update is owed (`owes`); the snapshot's slices and keyed lists; the issues (a
        view of the outcomes); the grace of a free actor.

    CallbackInputs = each callback's inputs, the view it reads, and how a change in it reaches the callback
        a guard, and a key select inside a guard: state, memory, props, context, event, lanes (no time); view
            before, folded; read on each turn it is tried in
        `updateMemory`: memory, props, context, event, now, lanes; before, folded; read on its turn
        payload mappers (raise, notify, exit, emit): memory, props, context, event; before, folded; on their turn
        action selects, member keys, a send's ref and event: memory, props, context, event, now; after; read once, at
            row 7 of the turn
        `resetOn`, an `.each` list, an input filler: memory of the host scope, with `key` and `item` under `.each`;
            the memory so far; every `reconcile` of a turn whose host memory changed
        a schedule's delay, `keys`, reasons, `restartOn`: as `Schedules` says, with the scope's memory, props, `key`,
            `item`; committed; row C5 passes a scope whose inputs changed
        a context slot's select: its provider's reads; committed; a wave, then the consumer's context update
        `C.slot.change` and `P.prop.change` (`when`, mapper): the value now and before, memory, props; committed;
            the `Inputs` change that carries the new value
        an ending's mapper, a schedule's send mapper: the ending's value with `{ input, key }`, firing data; no
            view; not applicable
        an emit's handler (host): the payload and `{ key, keys }`; the world at the publication that shows the turn;
            once per emit, per listener, at that publication
        `memory` is the memory of the callback's own scope; `key` and `item` exist only under `.each`; fragments
        read no context. Lanes in a before view are the pre-turn lanes with the turn's own ending admitted; in a
        committed view they carry the turn's members. `resetOn` reads memory only, never props or context, so the
        instances are a function of the state and the scopes' memories, and only a `Begin`, a `Turn` or an `End`
        can change them.

invariants
    I1  Settled: after every `apply`, for every live incarnation, `reconcile(instances, its facts)` returns no step. 
        [@R2, @R12, @R13]

    I2  A tree: every instance's host is present; a `Live` instance's host is `Live`; every descendant of a `Frozen` 
        instance is `Frozen`. [@R2, @R13]

    I3  Ids: no two of an incarnation's activations and instance ids are equal; an id minted in a world is never minted 
        again in it; no saved body holds one. [@R5, @R18]

    I4  One writer: only `apply.ts` constructs an `Incarnation` or an `Instances` (the `Applied` brand); a cast around 
        it is a `typescript/no-unsafe-type-assertion` error. [@R1, @R11]

    I5  One publication: an `apply` records at most one `Published`; a `Turn` exactly one, with `why` `"Turn"`, after 
        its record, with no other turn's record of that actor between. [@R1, @R19]

    I6  The walk: no part's site is on its own path from the part that began its walk; at most one site has a target; 
        each key of a scope is written by one site. [@R1, @R14]

    I7  The mailbox: at most one context update per actor; front mail is empty between served items. [@R6, @R21]

    I8  Abandoned exactly once: for each `End` in a `Turn` whose cause is `Left`, `KeyGone` or `Reset`, the `Turn` has 
        one `Abandoned` part per callback its `whenAbandoned` lists; no other cause and no other change has
        one. [@R4, @R16]

    I9  Holders: after every `apply`, a row in a mailbox has a `Live` audience; a life-held row whose instance is gone 
        is closed; a subject-held row is heard only by an instance whose subject equals its audience.
        [@R3, @R5, @R17]

    I10  Scopes are live: every part but an `Abandoned` one has the address of an instance that was `Live` after W0; 
         every part's own scope has not been ended earlier in its turn; no schedule callback of a scope runs
        after that scope's `End` in the same turn. [@R4, @R23]

    I11  Rounds end: after the walk, `reconcile` runs at most once more than the instances live after W0. [@R1, @R12]

    I12  Alarms match: the heap holds exactly one alarm per live owner fact and no other: `Schedule` per `Armed(Due)` 
         run of an awake scope, `Grace` per free actor, `Bound` per disposal in progress, `Silent` per awaited
        ticket, `Collect` per entry that is Idle, unheld and has `gcTime > 0`, `Release` per call in `releasing`.
        [@R4, @R23]

    I13  Indexes match: every index in `realization` equals its rebuild from the facts. [@R10, @R25]

    I14  A reload is quiet: `Begin` from the record of a settled incarnation, under the same build, gives the same 
         state, memories, statuses and reset values, new ids, no `Start` or `End` step, no part and no emit.
        [@R5, @R19, @R26]

    I15  Refusal is whole: after a `Refused`, `Unturned` or `Settled` change, state, memories, props and instances are 
         the ones before. [@R1, @R7]

    I16  Props move alone: only `Begin` and `Inputs` change `props`; an `Inputs` change writes no memory and no 
         instance. [@R8, @R20]

    I17  Order of ends: in `endOrder`, a consumer precedes each provider it is bound to and a child precedes its host. 
         [@R9, @R24]

operations
    runTurn(input: TurnInput) -> TurnResult
        argument  The result is Accepted{turn}, Denied, Unhandled or Refused. It is pure and mints nothing.
        ensures  Writes nothing; an accepted turn carries the walk of `algorithm` (walk, rounds) and no id; a
                 defect leaves the world as it was. [@R1, @R14]

    reconcile(compiled, stored: Instances, facts: Facts) -> Result<Reconciled, Failure>
        argument  Pure; owns the table of `algorithm` (instances).
        fails    Only when `resetOn`, an input filler or a list read throws: the slot that threw. In a turn that is
                 row W7. Under `Begin` the family rule holds: the slot keeps what the record gave it, its field is
                 `Failed(f)`, its issue's source is the `StoredSource.Slot` of `Operations`, and the next occasion
                 that reads the slot reads it again.
        ensures  Returns every start, end, freeze and thaw as data; after applying them `reconcile` returns no
                 step. [@R12, @R13]

    wanted(compiled, facts: Facts, address: Address) -> Result<Wanted, Failure>
        ensures  Absent, Live or Frozen with a reset value, by the wanted table. [@R13]

    locate(incarnation, scope: ActivationId) -> Where
        ensures  State, Instance or Gone; it is the one stale check. [@R17]

    readsOf(incarnation, scope: Address, view: before | after | committed) -> Reads
        ensures  The one builder of every callback input; `check(s, event)` builds the same record from a
                 snapshot. [@R22]

    begin(compiled, origin: Origin) -> Change
        ensures  `Change.Begin`; pure; builds the same data a turn would (the entered chain, the started
                 instances). [@R11]

    inputsOf(incarnation, given: { context, props }) -> Option<Change>
        ensures  `Change.Inputs`; none when equal. [@R8, @R20]

    apply(tx, before: Option<Incarnation>, change: Change) -> void
        requires  `before` is none exactly for `Begin`.
        ensures   The only writer of `Incarnation`; the only minter of activations and instance ids; it installs the
                  incarnation in one `put`, so a defect leaves the actor as it was. [@R1, @R11, @R18]

    whyOf(change: Change) -> Option<Why>
        ensures  None: the change publishes nothing. Total over the tags. [@R11]

    turnsOf(batch: Evidence list) -> { actor, turn: Turn, after: Published } list
        ensures  The turns of a batch, in turn order, for the host's emit delivery. [@R19]

    endOrder(world) -> ordered ends
        ensures  The order of `algorithm` (the actor's end). [@R9, @R24]

    tick(tx) -> void
        ensures  Takes the alarms due at `env.now`, once, in the order of `takeDue`; an alarm armed during the step
                 waits for the next tick. [@R10, @R23]

algorithm
    The tables below are the one statement of each rule; the pseudo-code at the end restates them. Three things the

    tables do not say: the source's guards run before any part; `apply` reads the incarnation again after C3,

    because flushing lanes may move them; a `Refused` found in C1 restarts `apply` with the `Refused` change and

    nothing of the turn written.

    The walk. Owner: `walk`, called by `runTurn`. One accumulator: the parts, the changer's site, the keys written per
        scope with the site that wrote each, and the instances the turn has ended. Every row starts from Walking;
        "refused" means `Refused(InvalidTurn, slot)` unless a code is given.
        W1  a part that has no target: Walking
        W2  a part with a target, and no changer set or its own site is the changer: Walking, its site is the
            changer
        W3  a part with a target, and another site is the changer: refused, one state changer. A second site with a
            target refuses the turn even when both sites name the same state: a turn's move has one owner (I6).
        W4  a part that writes a key of its scope that another site wrote: refused, one site per key
        W5 a part that writes a key its own site wrote earlier in this turn: Walking, the write folds (views and the 
            fold)
        W6  a part at a site already on its own path from the part that began its walk: refused, a walk must end
        W7  a part with a guard, mapper, patch, `resetOn`, input filler or list read that throws:
            `Refused(GuardDefect or Defect, slot)`
        W8  a part with a payload its codec refuses, or a patch naming a field it may not write: refused
        W9  a raise into a plain slot with no `Live` instance, with no handler or with only declines: refused
        W10 a raise into an `.each` slot: one part per `Live` copy, in list order, by three rows
            a copy with a handler that accepts: its part joins
            a copy with no handler on its path: skipped; its address goes to `Turn.skipped` (`Unhandled` evidence)
            a copy whose alternatives all decline: refused
        W11 a part that notifies a callback: the host's filling joins; an optional, unfilled callback is ignored
        W12 a part that takes an exit: the host's exit filling joins and is the changer (W2, W3)
        W13 anything, once Refused: Refused, unchanged; the first refusal stands

        Within one part: its patch, its emits, its raises in written order (each child part and everything it
        reaches, depth first), its notifies, its exit. Parts are recorded in that order. An `.each` raise with no
        `Live` copy is recorded and does nothing, and a `Frozen` copy is not reached. A raised event selects in the
        child's scope as the source does, the implicit "self" included. `armOn` and `disarmOn` match each part's own
        event in that part's scope: that is `Turn.work`. The source is selected in the scope the trigger is for,
        `TurnInput.at`. A trait's scope has one level; the root's scope has today's route from the leaf up,
        subroutine states included. W6 is the bound: a path holds each site once, so it is no longer than the sites
        that exist; siblings may share a site: that is a fan-in, and it folds.

    Instances: wanted against stored. Owner: `reconcile`, pure; `apply` turns its steps into the next `Instances`;
        nothing else adds, removes or re-statuses an instance. Wanted is derived top-down, hosts before their
        children, from `Facts`:
        root trait: Live while its reset value is present; never Frozen; anchor compared: reset
        node trait: Live while its node is on the chain and its reset value is present; never Frozen; anchor: the
            node's activation, reset
        resumable node trait: Live as a node trait; Frozen while its node is off the chain and reset is present;
            anchor: reset
        subroutine slice: Live while its state is on the chain and its reset value is present; never Frozen; anchor:
            the state's activation, reset
        a fragment's child trait: Live while its host is Live and its reset value is present; never Frozen of itself;
            anchor: reset
        `.each` copy: Live while its slot's row holds and its key is in the repaired list; Frozen as its slot's row;
            anchor: its slot's row

        A slot with no `resetOn` always has a present reset value. A reset value is a key: a value encoded by the
        Schema its slot declares (Q3), then made canonical text, as `Schedules` encodes a key; null or undefined is
        absent. The repaired list: the host field's entries by `by`, a repeated key keeping its first position, keys
        past `max` dropped. Each drop is a `Repair` (`listRepair` evidence, written by `apply`); a repair never
        refuses. A key dropped past `max` becomes a copy when an earlier key leaves. List order is the host list's
        order. Address order is hosts before children, slots in declaration order, copies in list order; a copy whose
        key left the list keeps the position it had. Starts and thaws are emitted in address order; ends children
        first, siblings forward. `reconcile` does not look below a `Frozen` instance: its descendants were frozen
        with it and stay as they are.

        The one table, `a` and `b` anchors, equal when every compared component is:
        stored absent:   wanted Absent: nothing; Live(b): `Start`; Frozen(b): nothing (a frozen instance is only
            ever a kept one)
        stored Live(a):  wanted Absent: `End(cause)`; Live(b): a = b keep, else `End(cause)` then `Start`;
            Frozen(b): a = b `Freeze`, else `End(Reset)`
        stored Frozen(a): wanted Absent: `End(cause)`; Live(b): a = b `Thaw`, else `End(Reset)` then `Start`;
            Frozen(b): a = b keep, else `End(Reset)`

        `End`'s cause is the first that applies: `ActorEnded` (the actor ends), `Dropped` (the definition no longer
        declares the slot), `HostEnded` (its host ends in this reconcile), `Exit` (it is `Facts.exited`), `Left` (its
        node or state left the chain, or was entered again), `KeyGone`, `Reset` (the reset value changed or went
        absent). `End` and `Freeze` take the whole subtree: a host's `End` gives each descendant `End(HostEnded)`
        first; a `Freeze` freezes each descendant. A `Thaw` thaws the instance and then its descendants, in address
        order, in the same reconcile; their anchors have no place, so they compare equal. A `Thaw` keeps the
        instance's id and memory. A `Start` after an `End` is another instance: a new id, fresh memory. A resumable
        trait reset while frozen ends there; a new one starts when its node is next entered. A "keep" under `Begin`
        from a record is the same cell: the saved instance stays, with a new id; a saved node trait or slice takes
        the restored activation of its node as its place, so it compares equal.

        What an `End` runs, by cause (`whenAbandoned` callbacks as parts; releases):
        Exit: no; no
        Left, KeyGone, Reset: yes, inside a turn; yes
        HostEnded: no (its host, where the filling lives, ends too); yes
        ActorEnded: no (no turn runs); yes
        Dropped: no; no (its lanes are `Retired`, see `Operations`)

    Rounds, reconcile inside the turn. `reconcile` runs at two points with the same table and the facts as they stand.
        W0, after the source's patch: facts are the pre-turn chain and the memory with the source's patch; steps
            applied: every `End` and every `Start`.
        rounds, after the walk: facts are the chain after the changer's move and the memory with every patch so
            far; steps applied: every `End`, each round; then, once stable, every `Start`, `Freeze` and `Thaw`.
        W0 decides which instances the source's raises reach: a copy its patch added is reached, a copy its patch
        removed is not, and a trait its patch reset is the new one. A started instance's before view is its initial
        memory. Only W0 and the rounds change who is live: a copy whose key a notify removed in mid-walk is still
        reached by a raise already under way. After the walk, the `Abandoned` parts owed by W0's ends are visited
        first, in step order, each with everything it notifies. Then a round: `reconcile`; for each new `End` whose
        cause runs callbacks, its `Abandoned` parts. If their patches or the changer's move changed the facts,
        another round follows. An ended instance's memory stays readable to its own `whenAbandoned` mappers until
        the turn returns. After the walk every `reconcile` but the last ends at least one instance and none starts
        one, so there are at most as many as the instances live after W0, plus one. A key that returns to a list
        after its copy ended is a `Start` of a new instance in the stable round. `Turn.steps` holds every step in
        the order applied: W0's, each round's ends, then the stable ones.

    Holders: what each step does to work and to its owed rows, queued or waiting. Owner: the ledger and the lanes
        owner, called from row C4.
        Start: life-held work: nothing. Subject-held work: the subject's lanes are adopted; its waiting rows queue,
            in owed order; a kept row takes its one try; a `Held` head with no row is owed unknown `Restored`
            (`ledger.start`, per subject)
        Freeze: life-held: its life-held calls are interrupted, and each of its waiting lookups is owed one
            `Interrupted` row; a read's request belongs to its entry and runs on while any hold remains, a frozen
            slot's hold included (`Operations`); each `Interrupted` row and each row already queued waits.
            Subject-held: untouched, lanes stay on the wire; every row already queued leaves the mailbox and waits
        Thaw: life-held and subject-held: waiting rows queue, in owed order
        End: life-held: its calls end (`EndWork`); its rows, queued or waiting, close as evidence. Subject-held:
            lanes named by a release are cancelled; the rest stay; queued rows leave the mailbox and wait for the
            next `Start` at the subject (`ledger.suspend`)

        What a trigger does, by where its target is. A firing and a life-held row name a scope id, found by
        `locate`; a subject-held row names a subject, found by its address and compared by its reset values; a public
        event names an address. This is the one stale check.
        an event: Live: its turn; Frozen: `Unhandled`, never parked; gone: `Unhandled`
        a firing: Live: its turn, if the arming is live and due; Frozen: dropped, it fires once at thaw; gone: dropped
        a row, subject-held: Live: its turn, late if its owner's activation left; Frozen: waits; gone: waits for the
            next `Start` at the subject
        a row, life-held: Live: its turn, late if its owner's activation left; Frozen: waits; gone: closed as
            evidence
        a raise: Live: a part; Frozen: not reached (`.each`) or W9; gone: not reached (`.each`) or W9
        a context or props update: Live: the root's `Inputs` change; Frozen: not applicable (the root only); gone:
            dropped with the mailbox
        A raise into a frozen plain slot refuses the turn (W9) while a public event to the same target is
        `Unhandled`: a raise is part of its sender's turn and a turn is whole (I15); a public event is its own turn
        and changes nothing either way.

        A row is heard when its audience's instance is `Live`. It is routed from its owner's activation when that is
        still on the chain, else late from the nearest surviving ancestor, never above the instance's own scope. The
        late-turn rule (`LateMayNotLeave`) is unchanged. A public event addresses a place, as a send addresses an
        actor's identity: a copy that left and came back hears an event sent to its key. Only work is named by id.
        A life-held ending never reaches a later instance; a subject-held one reaches the next instance of the same
        subject. A row whose subject never returns waits until the actor is forgotten, as an identity's row does
        today. A reload ends every life: life-held rows are not saved; a restored row is routed current, so no saved
        row holds an id. A one-off lookup forks under its scope's Owner in the host; shared calls stay under the
        Runtime's.

    The applier. Owner: `apply`. It runs rows C1 to C7 in order, each once, for every `Change`; "none" means the row
        does nothing for that change.
        C1 Guard: `Turn`: loop guard on its sends; past it, the change becomes `Refused`. Every other change: none.
        C2 Write:
            Begin: the incarnation, created or restored, with its steps applied
            Turn: control, memories, the steps applied with ids minted; its source's outcome cleared
            Refused: its source's outcome is set; nothing is written when the change carries an ending
            Unturned: none
            Inputs: props, context values, baselines; the reactions' outcomes
            Lanes, Settled, Use: none
            End: the live incarnation is dropped; its terminal snapshot is kept
        C3 Members: `Turn` only: each part's members in walk order, owned by the part's scope; the turn's record
            before their reports; lanes flushed. `Unturned`: none, its lane cell was applied at admission.
        C4 Holders:
            Begin: `Start` for the root and each kept `Live` instance
            Turn: each step, in order (Holders); `afterTry(row, Heard)` when the trigger is an ending
            Refused: `afterTry(row, Refused{refusal})` when the change carries an ending, else none
            Unturned: `afterTry(row, Unmapped)`
            End: `End` for each instance, children first, the root last
            Inputs, Lanes, Settled, Use: none
        C5 Schedules:
            Begin, Turn: per scope (schedules)
            Inputs: `Context`; Lanes: `Lanes`; Settled: `Settled`, and `Lanes` (`Schedules`)
            Use: wake or sleep (schedules); End: every scope dropped; Refused, Unturned: none
        C6 Publish: Begin once; Turn once, always; Refused once; Unturned once, its lane's change; Inputs once if the
            value differs; Settled once if it differs; Use once if it differs; Lanes none; End `Finished`
        C7 Mail:
            Begin: the owed context update; overdue firings, if used
            Turn: the wave to its consumers; its sends in walk order; overdue firings of thawed scopes
            Inputs: its reaction events, at the front
            Use: overdue firings, on a return
            End: its providers released; mail as in the actor's end
            Refused, Unturned, Lanes, Settled: none

        `why` is derived: `Begin` gives "Begin", `Turn` gives "Turn", every other publishing change "Other".
        `publish` has one call site, row C6. An actor's end publishes nothing; `Finished` stands for it. "Differs" is
        one comparison of the incarnation before and after, by the identity of its fields; no row compares issue
        lists. `Published` carries the incarnation by reference: `{ actor, incarnation, why }`; it is immutable, so a
        rule, a Story or the host's publication reads state, every scope's memory, props and instances from one
        value. How the public evidence type shows it is the host's (Q5). An ending is heard (`Act.Heard`), its lane
        cell applied and its lateness tested before `runTurn`; the lane a refused or unturned ending moved raises its
        own `Lanes` change. The firing is a trigger like any event: its turn carries `fired` (`Schedules`), and
        nothing is written before it; a send that does not commit is the `Settled` change. Creation is `Begin`;
        a delay refused at creation is the `Refused` arming of `Schedules`. A denied or unhandled event that is not an
        ending applies nothing: it is evidence, not a `Change`. An `Inputs` change that changed props records
        `PropsChanged` before its `Published`. The step returns its work commands releases first (`Interrupt`,
        `EndWork`), then starts (`Invoke`, `Lookup`), each group in the order made [proposed, Q9]. State exits and
        entries keep `moveOf`'s order; rows C4 and C5 follow the steps' order. The last two rows of a step are
        `entries.stepEnds()` and `command(Wake { at: alarms.next() })`.

    Occasions that do not compare. Four kinds of comparison exist: a props patch against the props, a context slot
        against a reaction's baseline, a reset value or a list against the stored instances, and `restartOn`. Three
        occasions compare nothing themselves; the comparing step for each kind runs right after, in the same
        `apply`:
        instances: after a restore, `reconcile` against the record, no callbacks; after a thaw, the thaw is itself a
            step of a `reconcile`; after a use returning, none (a use changes no fact)
        schedules: after a restore, `Wake` then `Context` per scope; after a thaw, `Wake` then `Context` for the
            thawed scopes; after a use returning, `Wake` then `Context`
        context reactions: after a restore, the owed context update (`owes`), by row C7; after a thaw and a use
            returning, none (a fragment reads no context; slots kept reading)
        props reactions: none in all three (props are never saved; a fragment declares no `onProps`)
        Each step changes nothing when nothing changed, so it needs no "differs from what the scope last heard"
        test and no stored copy of what was heard. The answered rule of `Schedules` (a `Context` pass only when
        context or props differ) and this rule give the same views: the "differs" test is the specification, the
        unconditional pass is its implementation.

    Mail and the drain. Owner: the `tx` mail functions. One mailbox per actor.
        `enqueue(mail)`: the back of its actor's queue; an actor whose mailbox was empty joins the rotation last
        `owe(actor)`: no context update waits: enqueue one; one waits: it keeps its place and follows whichever of
            the two loop-guard chains has counted more sends (`tx.ts` rule unchanged)
        `front(actor, events)`: the reaction events of an `Inputs` change, in declaration order
        take: front mail first, then the queue, oldest first
        a context update whose providers still have mail: not taken; its actor is passed over this rotation, and
            mail behind it stays behind it
        serve one item: its turn or change; then that actor's front mail, in the same call
        drain: one item per actor in rotation, then the follow-ups it enqueued, oldest first; yields after
            `drainYield` items, never between an item and its front mail
        dispose, runtime disposal: the actor's mailbox, or every mailbox, removed with its references
        `Mail.Event` gains `at: Address`: the scope it is for; a send between actors and a reaction's event name the
        root. `Mail.Firing` names the scope id and the arming id, with no `track`. `Mail.Props` carries one decoded
        patch and follows a chain as an event does. Only an `Inputs` change makes front mail, at most one event per
        reaction, so the call is bounded. A raise is a part, not mail, so the loop guard counts sends only.

    Props. Owner: `apply`, row C2, from `Begin` and `Inputs`. A reaction is `P.prop.change({ when?, event })`; its
        "before" is the props before the patch; no baseline is stored. What the Plan calls a props turn is the
        `Inputs` change; it has no `Turn` because no handler runs.
        `Input.Create` with props: every Schema default, overlaid with the decoded given fields; part of `Begin`
        `Input.Props` for a live local actor: `Mail.Props`, at the back of its queue
        a patch that fails a prop's Schema: refused at `setProps` in the host (`InvalidProps`): no input, no mail
        `Mail.Props`, some field differs under `sameValue`: an `Inputs` change: props merged; each reaction on a
            changed prop, in order
        `Mail.Props`, every field equal: no change: no publication, no reaction, no evidence
        a reaction's `when` true or absent: its event is mapped and goes to the front of the mailbox
        a reaction's `when` false: nothing
        a reaction's `when` or mapper throws: no event; the failure is that reaction's outcome until it next runs
            clean
        any other mail: never changes props
        Schedules hear `Context` for a props change: a non-disarming `Turn` and a `Context` have the same cells, so
        one occasion serves a change with no handler.

    Emits. An emit is a field of a `PartRun` and nothing else. The turn's record is `{ actor, from, to, turn,
        members }`, as an act and as evidence; the public `Emit` evidence is projected from it in `evidence-of.ts`,
        one record per emit in walk order, after the turn's `Published`. An emit's payload is checked by its codec
        in the walk; a refusal refuses the turn (W8); a refused turn has no `Turn`, so nothing of it is delivered.
        Entry, exit, a `Begin`, an `Inputs` change and an `End` have no part, so they emit nothing. An instance that
        ends in the turn still emits: the emit holds its address by value. `src/host/emits.ts` owns the listener
        sets. The host's `publish` calls it once per publishing slice, after the snapshot listeners, with the turns
        of every step since the last publication, in turn order. Each call sits in its own `Result.try`: a throw is
        one host report, the listener stays and the next one runs; the inspector sink gets the same guard. Emits are
        in the `Turn` before the turn's sends are served; listeners run at the publication that shows the turn,
        never before it.

    The actor's end. An end is the `End` change of a live incarnation; it drops the incarnation. A later `ensure` of
        the identity is a `Begin`, from the record when one was kept.
        Grace: precondition: free (unused, no lane in flight, no mail; the record encodes); record kept; subject-held
            rows wait; mail none (it was free); `Finished` now
        Disposed: no precondition; record removed; subject-held rows wait, for an adopting `ensure`; mail dropped;
            `Finished` now
        Forgotten: no precondition; record removed; subject-held rows closed, as evidence or let go; mail dropped;
            `Finished` now
        RuntimeDisposed: the Runtime is `Open`; record saved; rows wait; every mailbox cleared; `Finished` when the
            disposal ends
        The order of ends is one function, `endOrder(world)`: identities each after every live consumer bound to it,
        the oldest ready one first (`consumersFirst`); inside an identity, instances children first, siblings in
        address order, the root last; after them entries and sessions (`Operations`), then the tab lock (`Host`).
        `EndWork.owners` is that list, so a runtime disposal ends instances by the same rows as an actor's end.

    What each scope's schedules hear. A scope is a state's activation or an instance. `Schedules`' map is keyed by
        the scope's id, and `decide` sees no scope. Row C5 is the one caller of `Schedules`' `pass`, once per scope;
        the order of a restart and the arming it feeds is inside `decide`.
        a state entered; `Begin` from input: `before` is none; a turn's own arm is `Given`; occasion `Turn`
        an instance's `Start`: `before` is none; nothing is `Given`; occasion `Turn`
        a state exited; an instance's `End`; the actor's `End`: drops the scope's entry, releases its armings;
            no occasion
        a `Turn` that touched the scope's inputs, or named it in `Turn.work`: passes `disarmed`, `started` and
            `fired`; occasion `Turn`
        `Inputs`, props changed: every awake scope; `Context`
        `Inputs`, context changed: every awake state scope of the root; `Context`
        `Lanes`: the subject's scope, and its state scopes; `Lanes`
        `Settled`: the firing's scope; `Settled`, and `Lanes` for the rest
        `Freeze`; the last use released: clears the alarms of each scope that fell asleep; no timer changes; none
        `Thaw`; `Begin` from a record; the first use returning: for each scope that woke, sets alarms, then fires
            each overdue timer once; `Wake`, then `Context`
        An instance's start is a creation: its entry arms are decided after commit; a bad delay is `Refused` with an
        issue and never refuses the host's turn. A state's entry and `armOn` keep the rule of `Schedules`. A scope's
        inputs are its memory record, its `item`, the props, the context values (root scopes) and its lanes. Row C5
        passes every scope that hears the occasion by the rows above; the input gate, if it lands, is `Schedules`'
        (its open item Q1), and a skipped pass would change nothing. The scope order: state scopes outermost first, 
            then instance
        scopes in address order. Schedule names are scoped: the map is by scope id, then name; the record keeps them 
            by state path, then name
        (`Records`' `PositionShape`). Evidence and issues
        name a timer by address and name. Asleep is not a status: a scope is awake when its actor is used and every
        instance on its address is `Live`. A hydration reaches the core as a `Begin` from a record. A hidden page
        does not reach the core in v1: the host's edge reads `hidden()` for its capture only (`Host`, Q4). A trait
        that pauses its host's schedules (the catalog's `RateLimit`) needs no new channel: its handler notifies a
        callback, the host's filling patches a host field in the same turn, and the host's reason reads that field in
        row C5. A zero delay cannot wedge a step: `tick` takes the alarms due at its start, once; the host sends the
        next tick after a yield; the loop guard does not count firings.

    Views and the fold. Every guard, patch and payload mapper of a part reads the before view of its own scope: the
        pre-turn memory, or a started instance's initial memory. Row 7 and everything after commit read the after
        view. A site is one alternative at one address. For each key of a scope:
        no one wrote it this turn: a site writes it; accepted; the site owns the key
        the same site wrote it: accepted, in walk order; its before view shows its own writes
        another site wrote it: the turn is refused (W4)
        So a site reached again, by a second copy's notify or by a raise written twice, reads the memory its earlier
        runs left in the keys it owns, and the pre-turn memory in every other key. The after memory is the before
        memory with every patch applied in walk order; since one site owns each key, that order is the site's own.
        The changer follows the same rule (W2, W3): a target is fixed per alternative, so one site reached twice
        names one move. This replaces "disjoint memory keys": under that rule a list cleared with two copies in it
        is refused whenever each copy's leaving patches one host field. Two different sites still may not write one
        key. A source that patches a list, with a filling that patches the same list, is refused every time it
        runs: a shape, not a matter of counts, and a `flow check` finding.

    Settling. Instances settle inside the turn, in rounds, not in a follow-up turn: `resetOn` is read again after the
        walk. This departs from "a pending reset ... runs first as its own follow-up turn" of @plan.Machines.O3.

    Abandoned callbacks run only inside a turn, and only into a host that stays. A reconcile under `Begin` or `End`
        appends no part, whatever the cause. An instance that is frozen when it is abandoned is told like a live
        one: the callback's mapper reads its memory, and the filling runs in its host. This narrows the Plan's
        "ends other than by its own exit or a freeze" by the host's own end.

    Family rule: a user read that throws changes only its own check. (1) Its field is `Failed(f)`, and an issue
        names its slot. (2) Every decision that needed the value is made as if the read had returned its last clean
        value; a subject with no clean value yet uses the neutral one (no key, no reason, no baseline, the slot as
        the record gave it). (3) The next occasion reads again, and the first clean read after a failure is
        compared with the last clean value, or becomes a silent baseline where there was none. (4) Inside a turn, a
        callback the turn must run to compute its own result (a guard, a mapper, a patch, a payload, a `resetOn` or
        list read on the turn's memory) is the turn's check: the turn is `Refused` and nothing else changes; what it
        was owed is kept (an ending's row is tried once more and then Kept with its issue). Members here: `resetOn`,
        input fillers and list reads under `Begin`. Not members: a first delay that throws refuses the start, a next
        delay that throws ends the series, and a `resume` that throws is `Broken(f)`.

    Why the invariants hold. I1 holds from `Begin` (its steps come from the same `reconcile`) and through every
        change: only `Turn`, `Begin` and `End` alter the facts `reconcile` reads, and each applies the stable steps.
        I2 holds because `End` and `Freeze` take the subtree and `Start` is emitted hosts first. I10's second half
        holds because a filling lives in the host, callbacks run only for the root of an ended subtree, and a host
        that ended earlier took its children with it.

    Index layer. An index is written by the function that writes its fact, in the same transition, and by nothing
        else. A reader never holds a world across a step: a stepped world is spent, so the publication compares
        incarnations, never worlds.

    Pseudo-code, conceptual.
        serve(mail):                                  // serve.ts; one item, then its actor's front mail
            Event(actor, at, tag)   -> the instance at `at` is Live ? turn(Trigger.Event, at) : Unhandled
            Firing(scope, arming)   -> locate(scope) is Live and the arming is live and due
                ? turn(Trigger.Firing { fired }, scope's address) : drop
            Ending(row)             -> its audience is Live ? tryOne(row, hear) : it waits
            Context | Props         -> change = inputsOf(incarnation, ...); if some: apply(change)
        turn(trigger, at):
            result = runTurn({ ...readsOf(incarnation, at, "before"), instances, at, trigger })
            Accepted(turn) -> apply(Change.Turn { turn, trigger })
            Refused(f)     -> trigger is a firing ? apply(Change.Settled { fired, refusal: f })
                : apply(Change.Refused { source, failure: f, ending })
            Denied | Unhandled -> evidence; an ending: apply(Change.Unturned { row }); a firing: apply(Change.Settled)

        runTurn(input):                               // pure; walk, write rule, rounds
            source = select(input.at, input.tag)        // today's route and guards; none -> Denied or Unhandled
            acc = { parts: [], changer: none, written: Map<scope, Map<key, Site>>, memory: before,
                live: input.instances, steps: [], owed: [] }     // owed: ends whose Abandoned parts are to run
            visit(acc, source, Source, input.event, path = [])
            settle(acc, facts(the pre-turn chain, acc.memory), starts = true)                    // W0
            walkOut(acc, parts[0], path = [source's site])
            loop:                                       // after the walk
                for end in acc.owed, in step order: for callback in its whenAbandoned:
                    part = visit(acc, the host's filling, Abandoned { of: end.address }, payload, path = [])
                    walkOut(acc, part, path = [its site])
                acc.owed = []
                settle(acc, facts(the chain after acc.changer, acc.memory), starts = false)        // a round
                if it ended nothing: break
            append the Start, Freeze and Thaw of that last, stable reconcile to acc.steps
            refuse if acc is Refused                                                              // W13
            after = acc.memory; resolve each part's actions and sends on `after`; resolve a part's scope's arms and
                disarms on `after` only when no instance on that scope's address ended in this turn (no `End` for it or
                for a host of it in `acc.steps`; an ended scope hears nothing); a state left and entered again is a new
                activation and is not an `End` step, so its entry arms are resolved as before          // row 7
            return Accepted({ parts, move: moveOf(acc.changer), steps: acc.steps, memory, memories, work, repairs,
                skipped })
        settle(acc, facts, starts):                   // one reconcile, applied to the working view
            r = reconcile(acc.live, facts)              // a throw is W7
            for each End in r.steps: remove it from acc.live, keeping its memory readable; append it to acc.steps;
                if its cause is Left, KeyGone or Reset: append it to acc.owed
            if starts: for each Start in r.steps: add it to acc.live with its initial memory; append it to acc.steps
        visit(acc, site, cause, event, path):         // one part
            W6: site is in path -> refuse
            view = readsOf(before) overlaid with the keys acc.written says `site` owns
            patch = site.update(view); W4, W5, W8; acc.memory[scope] = merge
            if site.target: W2, W3
            emits = site.emits.map(payload(view)); W8
            push PartRun
        walkOut(acc, part, path):                     // W9 to W12; children get path + [their site]
            for raise in part.raises: for target in liveTargets(acc.live, raise.slot):
                child = select(target, raise.event); visit(acc, child, Raise { from }, ...); walkOut(acc, child, ...)
            for notify in part.notifies: filling = the host's filling; visit(acc, filling, Notify { from }, ...);
                walkOut(...)
            if part.exit: filling = the host's exit filling; visit(acc, filling, Exit { from }, ...); walkOut(...)

        apply(tx, before, change):                    // apply.ts; rows C1 to C7
            C1 if change is Turn and its sends would pass the loop guard: return apply(tx, before, Refused(...))
            C2 next = the Applied incarnation: mint an activation per entered state and an id per Start; give each
                Live node trait and slice its node's activation as its place; tx.putIncarnation(next)   // one put
            C3 for part in turn.parts: for member in part.actions: lanes.apply(member, owner = scope of part)
                insert the turn's record before the members' reports; flush lanes
            C4 for step in the change's steps, in order: the holder table
            C5 for each scope: schedules.pass(scope, occasion); drop ended scopes; sync alarms
            C6 if whyOf(change) is some and (the change publishes always or next differs from before): act(Published)
            C7 the change's mail, by its column

        tick(tx):                                     // step.ts; replaces `fired`
            due = alarms.takeDue(env.now)               // by (at, kind in the order below, the kind's own order)
            for alarm in due: Alarm.$match(alarm, {     // total by type: a new kind does not compile until handled
                Bound: as today;  Silent: as today;
                Release:  entries.releaseDue(call)        // writes no state, marks the call's holders touched
                Collect:  entries.collectDue(entry)
                Grace:    apply(End Grace)
                Schedule: enqueue Mail.Firing })          // among themselves in `Schedules`' due order
            step(tx, input): ...; entries.stepEnds(); command(Wake { at: alarms.next() })   // the last two rows

        `reconcile` is the wanted table, then the status table, per address in address order; it visits only the
        slots `realization` names. `runTurn` writes nothing, and `apply` installs the incarnation in one put, so a
        defect leaves the actor as it was.

composition
    flow
        Offers `Change`: the nine variants and the applier's rows; every later writer is a variant or a patch
        inside one.
        Offers `Turn`: the one record of an accepted turn, with `turnsOf`.
        Offers `Instances`: status and address order, with `locate` and `subjectOf`.
        Offers `Holder`: the two holders and the table of `algorithm` (holders), per subject and per life.
        Offers `readsOf`: the one builder of callback inputs.
        Offers `alarms`: the heap, `tick` and the one wake; the alarm writes of `Schedules`, `Operations` and the
        grace, disposal and ticket rows go through it.
        Offers `indexLayer`: the rule of `realization` and `indexDrift` over every index.

        Needs `Records`: an `instances` partition in the actor record: per address, the status, the reset value,
        the memory by the fragment's codec and the saved schedules of `Schedules`; no id and no place. The decode
        gives the `Dropped` row for a slot the definition lacks. Lanes and rows in the `work` record carry their
        subject. `apply` marks every record a change touches within that change, and the instances sit inside the
        actor record, so a batch is a whole number of changes and no instance can land apart from its memory;
        whichever batch lands, aborted or flushed, `Begin` reconciles it.
        Needs `Operations`: reads keyed by scope id, with the `readsOf` index; lanes keyed by subject; the interrupt
        of life-held calls at `Freeze`; placements released at `Freeze` and placed at `Thaw`; `issuesOf` over
        `outcomes`, a failed reaction and a failed slot (`StoredSource.Slot`); the `ReportCode` list opened for
        `listRepair`; the entry table's `collectDue`, `releaseDue` and `stepEnds`.
        Needs `Schedules`: `decide`, `pass`, `fire`, the occasions, `Wake`, `Context`; the answered rule of
        `Occasion` selection.
        Needs `Host`: the derived rows of `Types`; `Compiled.slots`, `fragments`, `emits`, `props` and the indexes of
        `realization`; how a view addresses a fragment's public event (`Mail.Event.at`, `Host` Q6); `onEmit`, `setProps`
        and props at `Create`; the public face of `Published.incarnation` and the publication built from it; the
        machine-rule fold in `verdictOf` reading the run's evidence (`Turn` and `Finished`; `Host`); the Story clock on
        `Tick`; the host's Owner per scope; a hydration as a `Begin` from a record; the host's publication calling
        `src/host/emits.ts` once per publishing slice.
        Needs `Types`: the derived rows of `realization` (types), `derive.ts` (no body capture, `Types` Q19).
        Lazy features (@task.V3.T48) are not designed here (Q7).

rules
    fold       a site reached again reads its own earlier writes; two sites writing one key refuse the turn
    settling   instances settle inside the turn, in rounds; no follow-up turn and no pending flag exists
    abandoned  `whenAbandoned` callbacks run only inside a turn, only into a host that stays, never for an exit
    stale      one stale check: `locate`; a public event addresses a place, work is named by id
    family     a user read that throws changes only its own check, by the four-part family rule
    order      a consumer ends before its provider, a child before its host
    index      an index is written by the function that writes its fact, in the same transition, by nothing else
    views      before view for guards, patches and mappers; after view for row 7 and everything after commit

realization typescript
    Cost, by reading, not measured; the bench decides. The build adds `turn.fragments.none`, `.copies-100`,
    `.fanout-100`, a wave to 100 consumers and a mailbox of 1,000. Sizes: A live actors; M one mailbox; k follow-ups
    of one drain; C consumers of a provider; L lanes of an actor; d depth of the leaf; W alarms in the world; D
    alarms due together; p parts of a turn; n copies of a slot; s slots a turn's change touches.
        a turn with no slot and one part: one `Turn`, one `PartRun`, one put (today: about ten allocations; `chainOf`
            about 8 times, O(d^2) characters)
        a turn, otherwise: O(p + s + the scopes passed), times its rounds
        `reconcile`: O(1) with no slot; else O(changed lists' lengths + `resetOn` slots of scopes whose memory
            changed + slots on entered and exited nodes)
        enqueue, take, front: O(1) amortised (today O(M) per step and per `shift`; O(M^2) to drain)
        a drain's follow-ups: O(k) (today O(k^2))
        the wave: O(C) (today O(C log C + C*M))
        a tick: O(D log W + D log D) (today O(W + D log D * S) per firing)
        arm, disarm: O(log W); one host wake in all (today one host fiber per timer)
        an actor's end: O(its instances + its reads) (today O(all reads))
        the late-owner question: O(L), only on a late turn
        the context record of a turn: O(1), `context.values`
        A turn's rounds each reconcile the lists that changed, so a chain in which each ended copy's callback removes
        the next one costs one reconcile per copy: quadratic in the chain (Q8). `draft` copies a map on its first
        write in a step only when the step does not own it; in a run of steps each map is copied once. What recurs
        per step in production is the mailbox array.

    The index layer. Each index, the fact it indexes, and its writer:
        `lanesOfActor`, `laneOfWait`, `silenceOf`: lanes, timers; as today; sets appended in place, not copied
        `consumers`, in start order: `Incarnation.bound`; `tx.putIncarnation`
        the mailbox's update position: the context update in the queue; `tx.owe`, take
        the mailbox: two stacks and a head index; the `tx` mail functions
        `alarms`: a heap by deadline, lazy deletes: schedule runs, free actors, tickets, entries, calls; row C5, the
            grace view, `tx`
        `Instances.byId`: instances; `apply`, row C2
        `readsOf`, by scope id: `World.reads`; the read owner of `Operations`
        the identities with a queued row: owed rows in a mailbox; the ledger, where a row enters or leaves a mailbox
        the retrying scopes, per incarnation: scopes holding a `Refused` timer; row C5
        the host's fork keys: forked tasks; `owners.fork`, `cancel`
        Computed once in `Compiled`: each state's `chain` and `depth`; `fieldsByName` and the private-field set;
        `slotsAt(node)` and the root's slots; `listOf(field)`, the `.each` slot a memory field feeds; each slot's
        fillings by callback; `schedulesAt`, `armedBy` and `disarmedBy`, per scope.

    One host wake. `Command.Arm` and `Command.Disarm` become `Command.Wake { at }`, sent when the earliest alarm
        changes, and `Input.Fired { timer }` becomes `Input.Tick`. The host keeps one sleeping task instead of one
        per alarm, so the host-alarms-match property is a function of the world and a disarm is a map delete. Alarms
        due together are sorted when taken, by `Schedules`' due order, so the heap needs only the deadline. The kind
        order at one instant (`Bound`, `Silent`, `Release`, `Collect`, `Grace`, `Schedule`) is proposed (Q9).
        In proportion to what changed: a machine with no slot pays one size check per turn; a copy's own turn touches
        its scope and its host's lists only when it notified; the wave is skipped when the committed state and root
        memory are the same objects as before [proposed, Q9].

    Types. Each fact has one source, the declaration; `Host` and `Types` own the means (`derive.ts`; no body
        capture, `Types` Q19).
        props: `definition.props`; `props` in every callback of `model` (callback inputs); `Snapshot.props`; the patch
            of `setProps`: all `PropsOf<D>`
        an emit's name and payload: `emits` of the root and each fragment; `emits.X.from`'s return; the handler tree
            of `onEmit`; the Story's `emits([...])`
        an instance's memory: the fragment's `memory`; `memory` in its callbacks; the snapshot's slice under its slot
            name
        a copy's key and `item`: the `.each` slot's `by` and `of`; `key` and `item` in the fragment's callbacks;
            `{ key, keys }` of an emit's handler
        a slot's name and kind: `traits` and subroutine states; `E.slot.X` raise tokens; the snapshot row: optional
            slice, or a keyed list under `.each`
        a reset value: the slot's `resetOn` and its declared Schema (Q3); the `key` of the filling's parts
        the callback inputs of `model`: one `Reads<D, Scope, View>`; every callback signature in `src/tokens.ts`
        `EndCause`, `Why`, `Change`, `InstanceStep`: the unions of `model`; closed unions in evidence and the trace
        Each new snapshot field is a derived row of `SnapshotFields`, not a new type parameter. The erased core
        stays erased: `Values` is the memory of every scope, restored to its declared type at the snapshot. The
        design adds no cast and no `unknown`; `Applied` is a brand with a private constructor. Kept casts:
        `tx.ts` `branded` (the one mint), `draft` (a generic indexed map field), a send's ref and envelope
        (the application's value, checked there). The step's own mailbox array cast is removed: the mailbox is a
        structure `tx` owns.

coverage
    @R1    enforced_by [@I5, @I15]                   proven_by [@T2, @T4, @T5, @T13]
    @R2    enforced_by [@I1, @I2]                    proven_by [@T3, @T4]
    @R3    enforced_by [@I9]                         proven_by [@T3, @T4, @T7, @T8]
    @R4    enforced_by [@I8, @I10]                   proven_by [@T3, @T4, @T10, @T13]
    @R5    enforced_by [@I3, @I9, @I14]              proven_by [@T3, @T4, @T8, @T13]
    @R6    enforced_by [@I7]                         proven_by [@T4]
    @R7    enforced_by [@I15]                        proven_by [@T1]
    @R8    enforced_by [@I16]                        proven_by [@T13]
    @R9    enforced_by [@I17]                        proven_by [@T13]
    @R10   enforced_by [@I13]                        proven_by [@T13]
    @R11   enforced_by [@I4, @I5]                    proven_by [@T2, @T13]
    @R12   enforced_by [@I1, @I11]                   proven_by [@T1, @T6]
    @R13   enforced_by [@I1, @I2]                    proven_by [@T1]
    @R14   enforced_by [@I6]                         proven_by [@T5, @T6, @T12]
    @R15   enforced_by [@I10]                        proven_by [@T9]
    @R16   enforced_by [@I8]                         proven_by [@T10]
    @R17   enforced_by [@I9]                         proven_by [@T8]
    @R18   enforced_by [@I3]                         proven_by [@T4]
    @R19   enforced_by [@I5, @I14]                   proven_by [@T11, @T13]
    @R20   enforced_by [@I16]                        proven_by [@T13]
    @R21   enforced_by [@I7]                         proven_by [@T13]
    @R22   enforced_by `readsOf`, the one builder    proven_by [@T15]
    @R23   enforced_by [@I10, @I12]                  proven_by [@T14]
    @R24   enforced_by [@I17]                        proven_by [@T13]
    @R25   enforced_by [@I13]                        proven_by [@T13]
    @R26   enforced_by [@I14]                        proven_by [@T11]

tests
    T1  Level 0, the tables as data. `reconcile`, the walk's write rule, the rounds, the holder table and `Begin` from 
        a record run as plain functions over small values with no runtime; a closure over every sequence of the
            alphabet (T3) to depth 3 from three starts and depth 4 from the fresh one (behind `FLOW_STRESS`). It is the
            package's first check, over the real functions; it must fail first on the nine cells of the instances
            table. The first failing checks include I5, I7, I9, I11, I12, I13 and I15 to I17. [@R7, @R12, @R13]
    T2  Level 1, Stories. The alphabet of T3 on fixture `desk` through the public runtime with the oracle of T4. Owner 
        faults (a second applier, a stale index, a yield before front mail) can only show here. [@R1, @R11]
    T3  The alphabet, from the inventory. Fixture `desk`: a root trait with `resetOn`; a node trait and a resumable 
        node trait with `resetOn` on `EDITING`, the resumable one with a child trait; a root `.each` (`max` 3) whose
            fragment nests a trait and owns one write and one read; a subroutine whose slice nests an `.each`; one
            schedule in each scope; one reaction on a context slot and one on a prop. Keys are `a`, `b`, `c`. Atoms:
            lists: add `k`; remove `k`; clear; reorder; add a duplicate; add past `max`, then remove one
            reset values: set to `x`; set to `y`; set absent; each also while the resumable trait is frozen
            control: leave and enter `EDITING`; enter the subroutine; take its exit; abandon it; enter it again
            the walk: a fan-out whose copies notify a patching filling; a source that removes a key and raises; a
                source that adds a key and raises; a copy's own event that makes the host remove it; an abandoned
                callback that removes another key, re-adds its own, or moves the state; a part of instance `k` enters a
                state with a computed `after` while its own event's patch removes key `k`: the turn is accepted, `k`
                ends, its delay is never called
            holders: a write's ending and a read's ending for a copy: live, frozen, gone, gone and re-added; a row 
                queued
                when its instance freezes or ends
            schedules: a firing for a live, a frozen and a re-added copy
            inputs: a props patch: changed, equal; a context change
            uses: the last use released; a use returning, with a frozen trait
            reload: under the same build; with a slot dropped; with `max` lowered
            end: `disposeActor`; the grace
            About 40 atoms from three starts (fresh; inside the subroutine with the resumable trait frozen; restored):
            64,000 sequences per start at depth 3. Each atom maps to a row of the inventory. [@R2, @R3, @R4, @R5]
    T4  The oracle, apart from any model, so it cannot share the tables' mistakes. Wanted from scratch: after every 
        step a function of about fifteen lines written from the wanted table reads the published state and memories
            and lists what should be live and what may be frozen; the published live instances must equal the first
            list; every frozen one must be in the second. Ledgers: every id ever published (never twice for two
            instances); every `End` with its cause against the `Abandoned` parts seen; every owed row against its close
            (heard by an equal subject, or evidence, once). Two metamorphic checks: replacing a reload by a turn that
            changes nothing changes no later view but ids; removing two live copies' keys in one turn and in two turns
            gives the same instances and the same `Abandoned` parts (it does not hold for a key parked past `max`, which
            the first removal promotes). The existing run rules `publishedOnce` and `mailboxOrder` stay on every Story
            run. [@R1, @R2, @R3, @R4, @R5, @R6, @R18]
    T5  Level 2, generated walks: small compiled trees (depth to 3, up to 3 copies) check I5 and I6 and that the after 
        memory is the before memory with the patches folded in walk order. [@R14, @R1]
    T6  `desk/clear-two`, the Story of the wrong ending. Two copies whose `whenAbandoned` notifies `onGone`; the
            source empties the list; the host's filling appends to `gone`. Expected: one publication, no copy left,
            `gone` holds both, two `Abandoned` parts. Under one write per key the turn is refused and the list can never
            be cleared; under a follow-up turn a publication shows a copy whose key is not in the list. [@R12, @R14]
    T7  `desk/frozen-ending`: a write ends while its copy's host is frozen; nothing is heard; the thaw hears it once. 
        [@R3]
    T8  `desk/key-comes-back`: `r1` is removed with a read and a write in flight, then added again. The read's ending 
        is evidence; the write's ending is heard by the new `r1`. [@R3, @R5, @R17]
    T9  `desk/raise-after-add`: a handler adds a key and raises into the slot; the new copy's part is in the `Turn`. 
        [@R15]
    T10  `desk/reset-while-frozen`: a resumable trait's reset value changes in `PREVIEW`; it ends there, its host hears 
         `whenAbandoned` once, its child's callbacks do not run, and `Back` starts a new one. [@R4, @R16]
    T11  `desk/reload-is-quiet`: I14 on a frozen resumable trait with an armed timer and a waiting row. [@R19, @R26]
    T12  The five-part turn stays the parts-table test, with `Turn.steps` empty. [@R14]
    T13  Planted faults; each must fail a named row or invariant. Existing faults that move (the 15 on `serve.ts`, 17 
         on `incarnations.ts` and 21 on `context.ts`) edit code that becomes `apply.ts` or a pure decider; each keeps
             its test and takes a new `find`.
             `settle-as-follow-up` (ends applied by a later turn): I1, T6
             `r0-ends-untold` (an end decided at W0 runs no `Abandoned` part): I8
             `fold-reads-before` (a site's second run reads the pre-turn key): T6
             `second-site-overwrites` (two sites write one key): I6
             `abandoned-on-exit`, `abandoned-skipped-on-keygone`, `abandoned-at-actor-end`, `abandoned-with-host`: I8,
                 I10, T10
             `id-kept-on-reset`, `restore-keeps-ids`: I3, the id ledger
             `thaw-fresh-memory`, `freeze-moves-timer`, `thaw-skips-context`: T11, I12
             `fanout-reaches-frozen`, `fanout-sorted-order`, `copy-denial-skips`: I10, rows W10
             `child-outlives-host`, `started-host-starts-no-child`: I2, I1
             `life-row-reaches-next`, `queued-row-stays-on-freeze`, `ending-heard-while-frozen`,
                 `frozen-kept-adopts-at-restore`: I9, T8
             `emit-before-publish`, `emit-on-refused`, `emit-replayed-on-restore`: I5, I14, the emit product table
             `listener-detached-on-throw`: the listener-set table
             `props-coalesced`, `props-equal-publishes`, `props-turn-writes-memory`: I16
             `front-mail-yields` (the drain yields before front mail): I7
             `second-applier` (an incarnation spread outside `apply.ts`): a type test (I4)
             `index-stale:<name>`, one per index: I13
             `ends-out-of-order`: I17
             [@R1, @R4, @R5, @R8, @R9, @R10, @R11, @R19, @R20, @R21, @R24, @R25]
    T14  Alarm kinds: each of the six kinds of `Alarm` set, cleared and taken by `tick`; a new kind does not compile 
         until `tick`'s match handles it. The one alarm sequence check, `alarmsMatch`: after every step of T1 and of
             every Story run, the heap equals the alarms derived from the owner facts (I12); `Schedules` I9 and
             `Operations` I22 are its rows for their kinds and cite it. [@R23]
    T15  Callback inputs: for every callback of fixture `desk`, `check` builds from a snapshot the record `readsOf` 
         builds from the incarnation; a fragment's record has no context. Planted fault `reads-built-twice` (a second
             builder for one callback) fails it. [@R22]
