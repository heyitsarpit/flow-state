spec Schedules
status        proposed
basis         Pre-coding analysis, to follow as best-guess guidance; revisable whenever building shows it wrong, with
              each change and its reason recorded in wiki/specs/specs.log.
location      packages/flow-state-v3/src/core
provides      decide, wake, Scheduled, Occasion, scheduleIssues, selectionCodec
derives_from  [@plan.Machines.O5, @plan.Machines.O8, @plan.Machines.V6, @plan.Persistence.O2, @plan.Persistence.O4]

requirements
    R1  Nothing owed is lost silently
        source  @plan.Machines.O5; the derived-issues rule (an issue is read from state, never stored).
        must    A firing that is owed is armed, or an issue shows for its timer or its schedule. Owed: a start cause
                occurred and none of these since: the timer's last step (`Done` or `Over`), a disarm, its scope's end,
                its key leaving, or its saved timer dropped by a definition edit (`algorithm`, decode table). A
                refused start is tried again on every occasion its scope hears, so a bad delay that becomes valid
                arms the timer at the next occasion and a reload changes nothing.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of when a refused start is
                tried again: on every occasion. This changes the derived-issues design's accepted rule that a
                refused start is retried only at a wake or a later start cause.

    R2  Nothing is made up
        source  @plan.Machines.O5.
        must    A timer fires only when a start armed it and nothing since stopped it. A first clean `restartOn` read
                is a baseline, never a change, whenever it comes (a new timer, a re-entry, a read after a throw).
                [decided: user 2026-11-21] answered "A, as recommended" to the question of a new timer whose first
                `restartOn` read throws: its first clean read is the baseline, silently.

    R3  A reload is invisible
        source  @plan.Machines.O5; @plan.Persistence.O4.
        must    A reload changes nothing a later view shows beyond what a quiet moment (an occasion that changes no
                input) would change. The saved record holds each timer as stored: its baseline, its reasons, its
                refused start and its firing failure included. A wake does not re-read `restartOn` for a timer that
                has a baseline; the owner raises `Context` after a wake when context or props differ from what the
                scope last heard, and that occasion compares.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of what a wake does to a saved
                baseline: nothing; `Context` after the wake compares. Reverse: the wake re-reads `restartOn` and takes
                a clean value silently (the Plan's older sentence).

    R4  A broken callback breaks only itself
        source  @plan.Machines.O5.
        must    A throw in `keys`, a reason or `restartOn` changes its own check and nothing else: its field is
                `Failed`, an issue shows, and every decision that needed the value is made as if the read had
                returned its last value (a new timer's is the neutral one: no key, no reason, no baseline). The
                next occasion reads again. Not such checks, each with its own row: a first delay that throws refuses
                the start, a next delay that throws ends the series, a `resume` that throws is `Broken` and fires once
                at its saved deadline. No callback runs after its scope's end.

    R5  An issue is a standing condition
        source  @plan.Machines.O8; the derived-issues rule.
        must    An issue shows while its check's last outcome is a failure, and goes when that check next reads clean
                or its timer goes. Issues are read from state by `scheduleIssues` and stored nowhere. A key that
                leaves, an exit and an actor's end take their timers' issues with them.

    R6  Held time does not count; time asleep does
        source  @plan.Machines.O5.
        must    A timer held by a reason keeps its time left and does not count; a frozen scope, an unused actor and
                a closed page keep `Due(dueAt)` and their time counts. A new run under a holding reason keeps its full
                delay. A firing happens at its start plus its delay plus the time its run was held, never earlier;
                later only while its scope was asleep.
                [decided: user 2026-11-21] answered "as designed here" to the question of departures from the
                concept designs: a frozen scope's clock runs.

    R7  Every change is compared once
        source  @plan.Machines.O5.
        must    A change in what a callback reads reaches it on the first occasion that can hear it. `keys` and the
                reasons are level checks read on every occasion; `restartOn` is the one edge check, compared with a
                baseline on `Turn` and `Context`, and on every occasion while it has no baseline. An occasion that
                does not compare leaves the baseline alone, so nothing is skipped.

    R8  Timers are independent
        source  @plan.Machines.O5.
        must    One timer's failure, firing or key never changes another's state. A committed firing leaves another
                key's send issue in place.

    R9  One decision per schedule per occasion
        source  Agreed by the user for the algorithm round: classes, not instances; one owner per state, one writer
                per field.
        must    A schedule's whole state in a scope is one value, `Scheduled`, and one pure function, `decide`, is the
                only code that builds it. Everything that wrote a timer from outside (a firing's next step, a restored
                run, a creation refusal, a reload's baseline) is an input to that function or a row of its tables.
                The six tables are total over the five occasions; the one impossible cell is named.

    R10  Each callback gets its own inputs
        source  @plan.Machines.O5.
        must    Each callback receives exactly the inputs of the table in `model`; `now` reaches only the delay.
                `keys`, the reasons and `restartOn` are functions of memory, context, props and lanes and never of
                the clock.
                [
                decided: agent orchestrator 2026-11-22
                ] `now` no longer reaches `restartOn`, the reasons and `keys` at run time (their public types
                never had it). Why: `readOf` hands `now` to all of them today, so a callback can read the clock its
                type hides, and a Story replay or a skipped pass would then differ. Reverse: put `now` back in
                `readOf` and in the three public types.

    R11  Starts, stops and steps
        source  @plan.Machines.O5.
        must    A disarm wins over every start in the same turn, a new key and an entry included, and is an event,
                not a state. A start wins over the firing's next step in the same turn. A turn's own arm (entry or
                `armOn`) with a bad delay refuses the turn; every later start (a new key, a restart, creation, an
                instance's start, a wake) is `Refused` with an issue and refuses no turn.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of a start whose first step
                fails: keep both rules.
                A computed delay is read once per start; no later change is tracked.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of a computed Effect Schedule
                after a reload: a stated limit; the series is planned again from the memory at wake and replayed to its
                saved attempt, and later delays differ when that memory differs from the arming turn's.
                A re-entered state's new timer inherits nothing.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of what a re-entered state's
                new timer inherits: nothing; its reasons start at `[]`.

    R12  Firings
        source  @plan.Machines.O5.
        must    A firing names an arming, never a key, so a new, restarted or removed timer cannot be taken for the one
                that fired; a firing whose arming is not live and due is dropped. A firing is one synchronous step: its
                next step is read, then its send runs as a turn; nothing commits between them. An overdue timer fires
                once after a wake, in due order. Equal deadlines fire in the order of the due order (deadline, actor
                admission, scope order outermost first, declaration order, key text in code-unit order), each as its
                own turn. A send that is neither committed nor refused (an unhandled or denied event) is the machine's
                answer, not a failure of the schedule; a refused send is the timer's firing failure.

    R13  Scope lifecycle maps onto five occasions
        source  @plan.Machines.O5.
        must    The same rule holds at every scope: a state's or an instance's. Enter, exit, instance start and end,
                freeze, thaw, restore, props and lane moves become occasions through one table (`algorithm`); no
                decision sees a scope. A re-entry is an exit then an entry: a new activation, nothing inherited. An
                ended activation's state cannot be found under the current one.

    R14  The saved form is the state
        source  @plan.Persistence.O2; @plan.Persistence.O4.
        must    One Schema is the source of both the record and the decoded timer. Every timer of a scope is saved,
                idle ones included. `wake` decodes saved state against the current definition by one table and invents
                nothing. A reload without `pausedBy`, with a reason renamed or with a key unreadable decodes to a valid
                state with a stated outcome.
                [decided: user 2026-11-21] answered "as designed here" to the question of departures from the concept
                designs: an undeclared saved reason drops that name and keeps the timer; a definition edit that makes
                a saved key unreadable, or changes keying, starts its keys again from step one, a disarmed key
                included.

    R15  Host views are derived from state
        source  @plan.Machines.O5; @plan.Machines.O8.
        must    Alarms, host cursors, issues and the due order are views of `Scheduled`: alarms equal the `Armed(Due)`
                runs of awake scopes by arming id and `dueAt`, and no other; a cursor is a cache keyed by arming id; a
                first step is taken on a fresh step function and kept nowhere, so a refused turn leaves nothing behind.
                The snapshot shows `{ dueAt }` while running and `{ left, pausedBy }` while held, never both.

    R16  Types derive from the declaration
        source  @plan.Machines.O5.
        must    The declaration `schedules: { name: { key?, pausedBy?, restartOn? } }` is the one source of a schedule's
                name, key type, reason names and selection type, and the body entry is checked against it. `key` has
                one derived type in every callback and is `undefined` in an unkeyed one; the snapshot's schedules
                carry the declared names, keys and reasons; one typed point of erasure builds the compiled schedule;
                every type test is two-sided (`realization`).
                [decided: user 2026-11-20] `key` and `pausedBy` are in the declaration.
                [decided: user 2026-11-21] answered "A, as recommended" to the question of where the `restartOn`
                selection gets its codec: the declaration names its Schema beside `key` and `pausedBy`; the body's
                `restartOn` returns that type and the baseline is saved as its canonical text.

    R17  Cost is in proportion to what changed
        source  Agreed by the user for the algorithm round: cheap operations over the graph.
        must    A scope with no schedule costs O(1) and allocates nothing; an unchanged timer, schedule or map is the
                same object; when an input did change the cost is O(T*P) callbacks over the scope's live timers, never
                the machine or the world. The table in `realization` states each operation's bound; the bench decides.

open
    Q1  The input gate is proposed: `pass` keeps the identities of memory, context, props and lanes from its last run 
        and skips a schedule only when all are the same, the occasion carries nothing for it, it is not a `Wake` and no
        timer of the schedule is `Refused`. It is a cache and lands only when the bench shows the reads matter. This is
        the gate's one home: `Changes` passes every scope that hears an occasion and builds no gate. [proposed]
        outcome  A build-time choice in @task.V3.T118's description: land it with a bench row, or leave it out.
                 Level 0 checks gated against ungated.

    Q2  A hidden page is no use change in v1: no schedule row mentions it, timers keep their deadlines, and a
        throttled wake fires each overdue timer once. [decided: user 2026-11-22] Why: an autosave keeps saving and no
        occasion is added. Reverse: a use change that clears alarms while hidden.
        outcome  Closed by `Changes` Q4: a hidden page is not a core input in v1.

    Q3  @plan.Machines.O5 still describes `name: Flow.keyed({ keys, ... })` and body-declared `restartOn`, `paused` and 
        `key`. The declared form replaces it, so the Plan needs an edit. [decided: user 2026-11-22] Why: the
        declared form is this Spec's. Reverse: keep `Flow.keyed` and the body-declared fields.
        outcome  @plan.Machines.O5 is edited to the declared form (2026-11-22).

    Q4  Scoped `armOn` and `disarmOn` are resolved by the walk in `Changes` (its own open item); either answer gives 
        the same inputs here.
        outcome  Closed: `Changes` resolves them in the walk (its algorithm, the arms of a turn).

    Q5  A next step past the limit and a throwing `resume` were not exercised by the scratch model of the tables.
        outcome  [
                 decided: agent orchestrator 2026-11-22
                 ] added to T1's closure as atoms. Why: both write `Refused` or a firing failure,
                 states no other atom reaches. Reverse: keep them one-shot Stories as T3 has them.

    Q6  A computed Effect Schedule is planned again from the memory at wake (R11's stated limit); a saved cursor would 
        end it.
        outcome  Revisit when a fixture reads what its `restartOn` does not select.

model
    Occasion = what one schedule hears: Turn, Context, Lanes, Settled or Wake. Its payload is data; nothing in it was
        written to a timer beforehand.

    Activation = one entry of a state, or one instance, minted on entry. The owner's map is keyed by it, so an ended
        activation's state cannot be looked up.

    StateInventory = "Saved" says how each state survives a reload. The type at each reader is under `realization`.
        key set (keyed schedule)  the timers' keys in key-text order. Owner and only writer: `decide`, table Keys.
            Readers: every table, the snapshot, the due order. Saved: as the timers; re-read at wake.
        `keys` outcome  `Clean` or `Failed`. Writer: `decide`, Keys. Reader: `scheduleIssues`. Saved: no; re-read.
        `selection` (per timer)  `Read(v)` or `Failed(f, last v)`; `v` may be `Unselected`. Writer: `decide`,
            Selection. Readers: Selection, `scheduleIssues`. Saved: whole, value and failure.
        `reasons` (per timer)  `Read(list)` or `Failed(f, last list)`. Writer: `decide`, Reasons. Readers: Timing, the
            snapshot's `pausedBy`, `scheduleIssues`. Saved: its value; the failure is re-read at wake.
        `arming` (per timer)  `Idle`, `Refused(f)` or `Armed(run)`. Writer: `decide`, Arming. Readers: Timing, the
            firing guard, the snapshot, issues. Saved: whole, but the two live fields.
        run timing  `Due(dueAt)` or `Held(left)`. Writer: `decide`: Arming makes it `Due`; only Timing moves it.
            Readers: the alarm view, the snapshot, the due order. Saved: whole.
        run cursor (live)  `Once`, `Stepping(series, output)` or `Broken(f)`. Writer: `decide` (Arming) and `wake`.
            Readers: the next step, the firing's metadata, issues. Saved: no; `reads.resume` at wake.
        arming id (live)  branded `ArmingId`. Writer: `decide`, from the mint. Readers: the firing guard, the alarm and
            cursor views. Saved: no; minted again at wake.
        `firing` (per timer)  `Clean` or `Failed(f)`. Writer: `decide`, Firing. Reader: `scheduleIssues`. Saved: whole.
        host alarm; host series cursor  at most one per live arming. Writers: the applier and the host stepper (views).
            Readers: the driver, the due index, the next-step read. Saved: no; views of `Armed` runs.
        schedule issues  derived; no writer; read by the snapshot, inspection and Stories. Saved: no.

    CallbackInputs = every input of every user callback, and the occasion that hears a change in it.
        `keys`: memory, lanes. Read on every occasion. A change reaches it by `Turn` (memory) and `Lanes`; `Wake`
            re-reads.
        each reason: key, memory, context, props, lanes. Read on every occasion. By `Turn`, `Context`, `Lanes`; `Wake`
            re-reads.
        `restartOn`: key, memory, context, props. Read on `Turn` and `Context`, and on every occasion while it has no
            baseline. By `Turn` (memory) and `Context` (context, props); after a `Wake` the owner raises `Context` if 
                context or
            props differ.
        `schedule` (the delay): key, memory, context, props, now. Read at a start, and by `resume` at wake. Read once
            per start; no later change is tracked.
        the send mapper: the firing's metadata. Read at a firing. A change in it does not apply.
        Today `readOf` hands one record with `now` and the context to all of them
        (code:packages/flow-state-v3/src/core/schedules.ts#readOf), though only the delay's public type has `now`; that
        leak goes. `props` is the planned input of the boundary design.

    Representation = target: TypeScript with Effect data types (`Data.TaggedEnum`, `Schema`, `Result`, `Brand`;
        `Option` for inputs only). No `Option` stands for a stored state; each lifecycle is a tagged union. The core's
        stored types hold `KeyText` and `Values`; the typed face is `TimersOf<D>` through `project` (`Types`).

        ```ts
        // existing: ArmingId, ActivationId, Failure, Series, Canonical     CHANGED: Tracked, Run, Timing, TimerKey
        // NEW: KeyText, Outcome, Checked, Selection, Cursor, Arming, Scheduled, Live, Decided
        type KeyText = string & Brand.Brand<"flow-state/KeyText">; // canonical text of the encoded key: identity, order
        type TimerKey = { readonly text: KeyText; readonly value: Values }; // CHANGED: text branded
        type Decided = Brand.Brand<"flow-state/Decided">; // its constructor is private to schedule-decision.ts
        type Outcome = Data.TaggedEnum<{ Clean: {}; Failed: { failure: Failure } }>;
        type Checked<A> = Data.TaggedEnum<{ Read: { value: A }; Failed: { failure: Failure; last: A } }>;
        type Selection = Data.TaggedEnum<{ Unselected: {}; Selected: { text: Canonical } }>; // Unselected: no baseline
        type Timing = Data.TaggedEnum<{ Due: { dueAt: number }; Held: { left: number } }>; // CHANGED: no host timer id
        type Stepping = { series: Series; output: unknown };
        type Cursor = Data.TaggedEnum<{ Once: {}; Stepping: Stepping; Broken: { failure: Failure } }>;
        type Live = { readonly arming: ArmingId; readonly cursor: Cursor }; // not saved; re-derived at wake
        type Run = Live & { readonly armedAt: number; readonly attempt: number; readonly timing: Timing }; // CHANGED
        type Arming = Data.TaggedEnum<{ Idle: {}; Refused: { failure: Failure }; Armed: { run: Run } }>;
        // CHANGED: one timer. Its type is the decoded side of the record's Schema, with `Live` beside a saved run.
        type Tracked = Decided & {
            readonly selection: Checked<Selection>;
            readonly reasons: Checked<ReadonlyArray<string>>;
            readonly arming: Arming;
            readonly firing: Outcome;
        };
        // NEW: one schedule's state in one scope. An unkeyed schedule has exactly one timer and no keys check.
        type Scheduled = Decided & Data.TaggedEnum<{
            Single: { timer: Tracked };
            Keyed: { keys: Outcome; timers: ReadonlyMap<KeyText, { readonly key: TimerKey } & Tracked> };
        }>;
        // CHANGED: the owner's map. A scope is one activation (a state's, or an instance's), minted on entry.
        type Schedules = ReadonlyMap<ActivationId, ReadonlyMap<string, Scheduled>>;
        ```

        Unwritable: an unkeyed schedule with two timers or a `keys` failure; two timers of one key; a timer armed and
        refused, or held with no run; a baseline of unknown type; a stored schedule issue (`Incarnation.outcomes` holds
        `Operations`' `StoredSource`, which has no `Schedule` member); a host timer id inside a timer; a timer built 
            outside `schedule-decision.ts` (handled at one
        point, a brand and a lint rule); the state of an ended activation found under the current one.
        Still writable, guarded by one writer and I3: a `Held` run whose reasons are empty.
        Stored though derivable, a stated trade: `Stepping.output`, which a replay to `attempt` gives back in 
            O(attempt).
        `output` and `Series` stay opaque. `Keyed.timers` iterates in key-text (code-unit) order.

    SavedForm = one Schema is the source of both sides: its encoded side is the record, and `Tracked`'s type is its
        decoded side with `Live` added to a saved run. A field added to a timer is added to the Schema or does not
        exist. The saved timer is `TimerShape` and the saved per-schedule value is `ScheduleShape`, one entry of 
            `Records`' `PositionShape["schedules"]`;
        `Records` owns every saved Schema name.

        ```ts
        // CHANGED: TimerShape is the Schema of a timer, not a name and six optional fields (`vocabulary.ts`);
        // its one spelling is `Records`' `TimerShape`. The decode rows below read it.
        ScheduleShape = TimerShape | ReadonlyArray<TimerShape>   // keyed: a list in key-text order
        ```

        Every timer of the scope is saved, idle ones included: an idle timer with a baseline is the debounce a reload
        must not forget, so `savedTimersOf`'s filter and its `armsOnEntry` scan go. Activation ids are not saved: the
        record holds each scope's schedules by its state path, and `wake` files them under the new activation.
        `Refused`, `firing` and a failed selection save their failure. [decided: agent orchestrator 2026-11-22] Why: R5 
            shows an issue
        while its check's last outcome failed; unsaved, a reload would clear an issue whose cause stands (R3).
        Reverse: save the arming only and re-read every check at wake. The JSON spelling, the format number
        and the step are `Records`'.

    OccasionTypes = the signatures, the occasions and the callback reads, in TypeScript.

        ```ts
        // existing: decide, Occasion, Turn, Context, Lanes, Seen. CHANGED: Schedule, the compiled record of `Types`
        // RENAMED: Fired -> Settled, Restore -> Wake, Reads -> ScheduleReads
        // NEW: wake, Env.mint, ScheduleReads.resume, Started, First, Next
        // CHANGED: Turn drops `exited`, renames `armed` to `started`; Firing carries `arming` and `next`; no `adds`
        decide(schedule: Schedule, before: Option<Scheduled>, occasion: Occasion, env: Env)
            : { after: Scheduled; raised: ReadonlyArray<Raised>; seen: ReadonlyArray<Seen> }
        wake(schedule: Schedule, saved: Option<ScheduleShape>, env: Env)               // decode, then Wake
            : { after: Scheduled; raised: ReadonlyArray<Raised>; seen: readonly [] }
        type Env = { reads: ScheduleReads<Values, string>; now: number; mint: () => ArmingId };

        type Occasion = Data.TaggedEnum<{
            Turn: { disarmed: boolean; started: Started; fired: Option<Firing> }; // a committed turn in its live scope
            Context: {}; // context or props changed outside a turn of this scope
            Lanes: {}; // a lane moved
            Settled: { firing: Firing; refusal: Option<Failure> }; // this schedule's firing, whose send did not commit
            Wake: {}; // restore, thaw, a use returning, hydration: silent
        }>;
        type Started = Data.TaggedEnum<{ No: {}; Given: { first: First } }>; // the turn's own arm, checked before 
            commit
        type First = Data.TaggedEnum<{ Complete: {}; Starts: { ms: number; cursor: Cursor } }>;
        type Firing = { readonly arming: ArmingId; readonly next: Next }; // names the arming; the next delay is data
        type Next = Data.TaggedEnum<{ Done: {}; Again: { ms: number; output: unknown }; Over: {} }>;

        // values are decoded by the schedule's codecs (`realization`); each callback gets only its inputs
        type ScheduleReads<Key, Why> = {
            keys: () => Result<ReadonlyArray<TimerKey>, string>; // decoded by the key Schema, repeats dropped
            selection: (key) => Result<Selection, string>; // encoded by the selection codec
            reasons: (key) => Result<ReadonlyArray<Why>, string>; // declaration order; no `paused`: []
            first: (key) => Result<First, string>;
            resume: (key, armedAt: number, attempt: number) => Result<Cursor, string>; // a saved run's cursor
        };
        ```

        Each occasion's payload is data; nothing in it was written to a timer beforehand. `before` is `none` exactly
        when the scope's activation has no entry for the schedule: its state just began, or the record lacks it.
        `Given` occurs only for an unkeyed schedule: `armOn` on a keyed one is a construction error
        (code:packages/flow-state-v3/src/compile-schedules.ts). Its `first` cannot be a failure: a turn's own arm with a
        bad delay refuses the turn before any occasion exists. A firing names an arming, not a key.

invariants
    I1  Owed implies armed or reported: a timer owed a firing is `Armed`, or an issue shows for it or its schedule. 
        Owed: a start cause occurred and none of these since: its last step (`Done` or `Over`), a disarm, its scope's
        end, its key leaving, or its saved timer dropped by a definition edit (decode table). [@R1]

    I2  Not owed implies not armed. [@R2]

    I3  Held exactly by its reasons: an `Armed` run is `Held` if and only if the value of `reasons` is not empty; when 
        the reasons read clean on this occasion, that value is what they read. [@R6]

    I4  A failed check is a failed field: a check that ran and threw has its field `Failed`; one that ran clean has it 
        `Read` or `Clean`. The shown issues are `scheduleIssues` of the state, by construction. [@R5]

    I5  The clock run out fires each armed timer at most once: one that is still armed, due and unheld when its own 
        firing is served, in the due order of the views, and nothing else. [@R2, @R12]

    I6  A reload equals a quiet occasion: under the same build, `wake(encode(s))` equals `decide(s, Lanes)` with no
        input changed and no evidence, but for arming ids. As a sequence property: replacing a reload by a lane move
        that changes nothing changes no later view. Needs no model. [@R3]

    I7  Timers do not touch each other: a timer's state after an occasion is a function of its own state before, the 
        occasion and its own reads. [@R8]

    I8  One writer: only `schedule-decision.ts` can construct `Tracked` or `Scheduled` (the `Decided` brand); a cast 
        around it is already a lint error; handled at one point (a brand and a lint rule). [@R9]

    I9  Host views match: alarms equal the `Armed(Due)` runs of awake scopes, by arming id and `dueAt`; host cursors 
        are a subset of live arming ids. [@R15]

    I10  A throwing check is a read of its last value. For `keys`, `restartOn` and the reasons: the decision where the 
         check throws equals the decision where it reads its previous value (a new timer's is the neutral one), in
        every field but that check's own tag. The delay is not such a check: a first step that throws refuses the
        start, and a next step that throws ends the series (both are today's rules). [@R4]

    I11  The record is the state: every saved timer decodes to exactly one arming shape; `decode(encode(t))` equals `t` 
         but for `Live`. [@R14]

    I12  Time is conserved: a firing happens at its start plus its delay plus the time its run was `Held`, never 
         earlier; later only while its scope was asleep. [@R6]

    I13  Every change is compared: after any occasion, a timer's baseline differs from what `restartOn` would read now 
         only if a `Turn` or `Context` for its scope is already owed (the lifecycle rule), or its read throws. [@R7]

    I14  Unwritable states stay unwritable: an unkeyed schedule has exactly one timer and no keys check; a keyed one 
         has at most one timer per key text, in key-text order; no timer is armed and refused at once or held with no
        run; no host timer id, no stored schedule issue and no baseline of unknown type is inside a timer. [@R9]

    I15  After a disarming turn, every timer of the disarmed schedule is `Idle`, a new key and an entry arming 
         included. [@R11]

    I16  A callback receives only its inputs: `keys` and the reasons and `restartOn` never receive `now`, and no 
         callback of a scope runs after that scope's end. [@R4, @R10]

    I17  A decision is scope-blind and an activation's state is reachable only under its own id: a re-entered state's 
         timers start with no baseline, no reasons and no run. [@R13]

    I18  An unchanged timer, schedule or map is the same object; `pass` on a scope with no schedule allocates nothing. 
         [@R17]

operations
    decide(schedule, before, occasion, env)
        requires  `before` is the scope's entry for this schedule or none; `occasion` is the one occasion this
                  schedule hears in this scope.
        ensures   Returns the only new state, `after`, with `raised` (the failures met, in the order firing, keys,
                  `restartOn`, arming, reasons) and `seen` (the evidence): the six tables run in order on every
                  occasion; an unchanged timer or schedule is the same object. A callback that throws is a value in
                  the reads and lands in its own field; `resume` gives `Once` for a Duration and for a series that
                  ends before `attempt`.
        fails     Only a defect throws, and it leaves the scope as it was: `pass` installs the new map last. The mint
                  advances even when a result is discarded; arming ids need only be unique.

    wake(schedule, saved, env)
        requires  `saved` is the saved entry for this schedule in this scope, or none.
        ensures   Decodes per entry by the decoder table, gives each saved run a new arming id and the cursor
                  `reads.resume` returns (or `Broken` when it throws), then runs `decide` with `Wake`; `seen` is empty.
        fails     A defect only.

    scheduleIssues(schedule, scheduled)
        ensures  Returns the issues read from state: the `keys` failure, then per timer the first of `firing`,
                 `selection`, the arming (`Refused`, or a `Broken` cursor), `reasons`. Stores nothing.

    pass(scope, occasionOf)
        ensures  Runs `decide` for each schedule declared at the scope on the occasion `occasionOf` gives, records
                 `seen` as evidence and `raised` in the trace, then reconciles alarms and cursors; the same map is
                 kept when nothing changed. A scope with no schedule and no entry returns at once.

    ended(scope)
        ensures  Drops the activation's entry and releases its armings: exit, instance end, actor end.

    sleep(scope)
        ensures  Clears the scope's alarms and changes no timer: freeze, the last use released.

    woke(scope)
        ensures  Runs `pass` with `Wake` (through `wake` on a restore), then `pass` with `Context` if context or props
                 differ from what the scope last heard, then enqueues a firing for each overdue `Armed(Due)` timer
                 in due order.

    fire(mail)
        requires  The mail names an arming that is live and due, else the mail is dropped.
        ensures   One synchronous step with no write before the send: reads `next`, then sends as a turn of the actor
                  carrying `fired = { arming, next }`; when the send does not commit, runs `pass` with `Settled` for
                  the fired schedule and `Lanes` for the rest.
        fails     A throwing send mapper refuses that turn; a next step that throws or is out of range is `Over`.

algorithm
    One decision handles one schedule on one occasion. For each timer the fields are decided in this order: Keys,

    Selection, Arming, Firing, Reasons, Timing. Every table runs on every occasion, `Settled` included. `p` is a

    field's value before: `Read(v)` gives `v`, `Failed(f, last)` gives `last`. "This timer's firing" means the

    occasion's `Firing.arming` is the arming id this timer had before the decision.

    Keys. A new timer is `{ selection: Read(Unselected), reasons: Read([]), arming: Idle, firing: Clean }`.
        `keys` reads lists `L`: timers after are, for each key in `L`, its timer before, else a new one; the rest go;
            the outcome is `Clean`.
        `keys` throws, or a bad key or shape: the timers before, unchanged in membership (none when `before` is none);
            the outcome is `Failed`.
        Unkeyed schedule: its one timer before, else a new one; no outcome.
        A timer that goes takes every field with it; the applier releases its arming. A throwing `keys` keeps the key
        set, removed keys included, until it reads again; its issue shows meanwhile.

    Selection. `compares` is true when the schedule declares `restartOn` and either `p` is `Unselected` or the
        occasion is `Turn` or `Context`. `restarts` is true when the occasion is `Context`, or a `Turn` that does not
        disarm. Rows, in order:
        `compares` no: `restartOn` not run; `selection` unchanged; no start cause.
        `compares`, `restartOn` throws: `Failed(f, last p)`; none.
        `compares`, `v`, `p` is `Unselected`: `Read(v)`; none, a first read.
        `compares`, `v` same as `p`: `Read(v)`; none.
        `compares`, `v` differs, `restarts`: `Read(v)`; a restart.
        `compares`, `v` differs, a disarming turn: `Read(v)`; none, silent.
        S-3: a first clean read is never a change, whenever it comes. A throw keeps `Unselected`.
        S-6: a timer with no baseline is still being created, so every occasion reads it, a lane change included.
            Reading it later would lose the restart of a selection that changes in the next turn.
        S-1, and one rule for every occasion that does not compare (`Lanes`, `Settled`, `Wake`): it leaves the baseline
            alone, so nothing is skipped; the change is still there for the next `Turn` or `Context`. A lane move or a
            settled firing changes no input of `restartOn`. A `Wake` may follow a change made while the scope slept, so
            the owner raises `Context` after it when context or props differ from what the scope last heard. A
            restore's owed context wave is one case of that rule; a thaw is the other.
        "Same" is one rule: equal canonical texts of the encoded selection (`realization`).

    Arming. The first row that matches wins. A start cause is any of: `Turn.started` is `Given`; table Selection said
        restart; the timer is new and its schedule is keyed or arms on entry
        (`Schedule.onEntry`); the arming is `Refused` (on any occasion
        its scope hears: a refused start is tried again every time). An instance's start is a creation: its bad delay
        is `Refused` with an issue and refuses no turn.
        A1  `Turn.disarmed`: delay not read; `arming` after `Idle`.
        A2  a start cause: first step `Starts`: `Armed` with a new id, `armedAt` now, attempt 0, `Due(now + ms)`;
            `Complete`: `Idle`; fails `f`: `Refused(f)`, and an armed run's time left is dropped.
        A3  the occasion carries this timer's firing: `next` is `Again`: same id, attempt + 1, `Due(now + ms)`;
            `next` is `Done` or `Over`: `Idle`.
        A4  none of the above: delay not read; unchanged.
        The first step is `Turn.started.first` when the turn gave one, else `reads.first(key)`. A delay is at least 0
        (code:packages/flow-state-v3/src/core/schedule-plan.ts#inRange); the next delay counts from now, the actual
        firing.

    Firing. The first row that matches wins. It runs after Arming, so a start that arms settles it. One failure is
        kept, the step past the limit before the refusal; both are in the trace.
        F1  row A2 armed this timer: `Clean`.
        F2  carries this timer's firing, `next` is `Over`: `Failed(InvalidTurn, its slot)`.
        F3  `Settled` for this timer's firing, with a refusal: `Failed(the refusal)`.
        F4  `Turn.fired` is this timer's firing: `Clean`.
        F5  anything else, a `Settled` with no refusal included: unchanged.

    Reasons, for every timer, armed or not. A new timer's `p` is `[]`, so a reason that throws on its first read does
        not hold the timer.
        list `r`: `Read(r)`.   throws `f`: `Failed(f, last p)`.

    Timing, for every `Armed` timer, last. `v` is the value of `reasons` after table Reasons. This is `timed`. Table
        Arming creates a run as `Due`; `timed` is the only place a run moves between `Held` and `Due`, so a new run
        under holding reasons keeps its full delay. Evidence is none on `Wake`.
        `Due(dueAt)`, `v` empty: unchanged; no evidence.
        `Due(dueAt)`, `v` not empty: `Held(max(dueAt - now, 0))`; `Paused`.
        `Held(left)`, `v` not empty: unchanged; no evidence.
        `Held(left)`, `v` empty: `Due(now + left)`; `Resumed`.

    The decoder. `wake` decodes per entry, then runs `decide` with `Wake`. Nothing is invented by the decode. Each
        row: saved against the definition; decode; after `Wake`.
        schedule not declared in an active scope: entry dropped; no timer.
        schedule declared, no saved entry: `none`; new: a keyed key or an entry arming starts with its full delay; any
            other stays `Idle`.
        keying changed, or a key the declared key Schema does not read: that entry or timer dropped; as no saved timer:
            a listed key is new and starts, a disarmed one included.
        a key `keys` no longer lists: kept; removed by table Keys.
        a saved reason name that is not declared: that name dropped; reasons read fresh; Timing frees a hold.
        a reason added: nothing; read fresh; holds silently if true.
        a selection the declared codec does not read, or `restartOn` no longer declared: `Read(Unselected)`; the first
            read is silent.
        `restartOn` edited: kept; unchanged; the next turn or wave compares.
        a saved `firing` failure: kept; unchanged.
        `Refused`: kept; row A2 tries the start again.
        `Armed`, `reads.resume` gives a cursor: that cursor, a new arming id; timing by table Timing.
        `Armed`, `reads.resume` throws `f`: cursor `Broken(f)`, timing kept; the issue shows now; the run fires at its
            saved deadline, then ends with F2; a later wake reads `resume` again. A `Broken` cursor's next step is
            `Over`: the run fires at its deadline once, and row A3 ends it.
        a format 5 timer: step: `dueAt` to `Due`, `left` to `Held`, neither to `Idle`, no baseline to `Unselected`; as
            the rows above. This replaces the rule "every timer read as `dueAt`" of the older Task, wrong for a format
            with `left`.

    Scope lifecycle onto occasions. `decide` is scope-blind. A scope is one activation: a state's, or an instance's.
        The owner translates scope events; the occasion list stays five.
        state entered, creation, instance start, reset's start, a copy appears: a new activation id, so `before` is
            `none`; occasion `Turn`.
        state exited, instance end, reset's end, a copy leaves, actor end: drops the activation's entry, releases its
            armings; no occasion.
        a committed turn of the actor (event, raise, ending, a firing's send): names what it disarmed and
            started in each scope; `Turn`, for every live scope.
        context changed outside a turn; or, after a `Wake`, context or props differ from what the scope last heard:
            nothing; `Context`.
        a lane moved, a denied or unhandled ending's admission included: nothing; `Lanes`.
        a firing whose send did not commit: nothing; `Settled` for its schedule; `Lanes` for the rest.
        freeze, the last use released: clears the scope's alarms; no timer changes; no occasion.
        thaw, restore, a use returning, hydration: decodes (restore only); after the decision, overdue timers fire
            once; `Wake`, then `Context` by the rule above.
        A hidden page is not a row (open item Q2, decided).
        Re-entry is exit then entry: a new activation id, no `exited` flag, nothing to inherit. Asleep is not a timer
        state: a frozen or unused scope keeps `Due(dueAt)`. Props are root-wide and reach every awake scope as 
            `Context`, never `Turn` (`Changes` R20). Lanes are not
        a row of the turn: they follow lane movement (code:packages/flow-state-v3/src/core/firings.ts#recheckLanes),
        so the turn walk's rule that a denied turn runs no later row does not conflict with the Plan's lane re-check.
        Scoped `armOn` and `disarmOn` are resolved by the walk in `Changes`; either answer gives the same inputs here.
        A firing is one synchronous step: nothing commits between reading `next` and the send's turn, and the arming
        id in `Firing` makes a break of that visible instead of wrong. The unconditional `Context` pass after a `Wake`
        that `Changes` implements and the 'differs' test here give the same views; the test is the specification.

    Views. Alarm: an awake scope has one alarm per `Armed(Due)` run, identified by its arming id and its `dueAt`, and
        no other. The applier sets the difference after each pass. An arming id present before and absent after is
        released: its alarm and its host cursor go together.
        Host cursor: a cache keyed by arming id. A first step is taken on a fresh step function and kept nowhere, so a
        refused turn leaves nothing behind. A later step replays from `armedAt` on a miss; replayed steps read `armedAt`
        as their time (code:packages/flow-state-v3/src/host/owners/schedule-steps.ts).
        Issues: `scheduleIssues(schedule, scheduled)`: the `keys` failure, then per timer the first of `firing`,
        `selection`, the arming (`Refused`, or a `Broken` cursor), `reasons`. `Operations` concatenates every source's
        issues; `scheduleIssues` is this module's part, memoized on the owner's map identity inside the core.
        Due order: deadline, actor admission, scope order (outermost first), declaration order, key text in code-unit
        order. Each firing is its own turn, and a turn may restart, hold or remove a timer whose firing was already
        queued: that firing is dropped by the arming-id guard.
        Overdue: `Armed(Due)` with `dueAt <= now`. After a `Wake` the owner fires each once in due order.

    Pseudo-code. Conceptual. `decide` is the six tables in order. Three things the tables do not say: `mine` (this
        timer's firing) is judged before table Arming changes the arming; a start cause is computed once, from table
        Selection's result; `raised` lists the failures met in the order firing, keys, `restartOn`, arming, reasons.

        ```ts
        wake(schedule, saved, env):                           // the only reader of ScheduleShape; the decoder table
            before = saved decoded per entry; each Due or Held run gets arming: env.mint() and
                cursor: env.reads.resume(key, armedAt, attempt), or Broken(f) when resume throws
            return decide(schedule, before, Wake, env)          // `seen` is empty: Wake records no evidence

        pass(scope, occasionOf):                              // the owner: one per scope per occasion (`schedules.ts`)
            declared = compiled.schedulesAt(scope)              // precomputed per state; no allocation
            mine = schedules.get(scope.activation)              // none for an activation minted on this occasion
            if declared is empty and mine is none: return
            for schedule in declared:
                { after, raised, seen } = decide(schedule, mine?.get(schedule.name), occasionOf(schedule), env)
                record seen as evidence and raised in the trace (tx.refuse); neither is state
            reconcile(scope); the same map is kept when nothing changed

        ended(scope) = drop the activation's entry and release its armings        // exit, instance end, actor end
        reconcile(scope):                                     // alarms and cursors are views
            release each arming id present before and absent after
            awake: set an alarm for each Armed(Due) whose (arming, dueAt) has none; asleep: clear the scope's alarms
        sleep(scope) = clear the scope's alarms               // freeze, last use released; no timer changes
        woke(scope)  = pass(scope, Wake), reading saved state through `wake` on a restore;
            then pass(scope, Context) if context or props differ from what the scope last heard;
            then enqueue a firing for each overdue Armed(Due) timer, in due order

        fire(mail):                                           // `firings.ts`; one synchronous step, no write before 
            the send
            (timer, run) = the live, due arming the mail names, else drop the mail
            next = run.cursor is Once ? Done : run.cursor is Broken ? Over
                : host.step(run.arming, run.cursor.series, run.attempt + 2) as Again, Done, or Over when it throws or
                    its delay is out of range
            sent = the send as a turn of the actor, carrying fired = { arming: run.arming, next }   // a throwing mapper
            if not sent.committed:                                                                  // refuses that turn
                pass(scope, schedule => schedule is the fired one ? Settled({ firing, refusal: sent.refused }) : Lanes)
        ```

composition
    flow
        Seams. The Offers and Needs lines are for `wk lint`'s seam check.

        - **Offers** `Scheduled`: one value per schedule per scope, in the owner's map by activation id.
        - **Offers** `Occasion`: the closed list of the operations and the lifecycle table.
        - **Offers** `ScheduleShape`: the Schema of the saved form and the decode table, for `Records`.
        - **Offers** `scheduleIssues`: this module's part of the issues; `Operations` owns `issuesOf`, the 
            concatenation of
            every source's issues. The memo is this module's, keyed by the owner's map identity, inside the core; the 
                host
            keeps no issue memo.
        - **Offers** the `Schedule` alarm kind: the applier is the only writer of `Schedule` alarms, and it writes them
            through `Host`'s `tx.alarms`. The due order of the views orders `Schedule` alarms that share a deadline; the
            order across kinds is `Changes`' (`tick`, its Q9).
        - **Offers** `selectionCodec`: Schema encode plus canonical text, with equality by that text. One rule: a value
            used as a key is encoded by its declared Schema, then made canonical text. This module's build defines it;
            `Operations` and `Records` adopt it for slots, props and `resetOn`.

        What each other Spec must provide.
        - `Changes` (turn walk, channels, fragments). An activation id per state entry and per instance. Per scope a 
            turn
            touches: the names it disarmed and started, with their first steps. One `pass` per scope in the turn's 
                schedule
            row, a restart decided before the arming it feeds. The firing's send carries `fired` into that row with no 
                write
            before the turn; the firing mail names the scope and the arming id. `Lanes` stays outside the turn's rows. 
                The
            call site of the `Context` after a `Wake`. Freeze clears alarms and changes no timer; the fragments' map 
                holds
            `Scheduled`. A total scope order, the due index, and whether the loop guard bounds an endless series of zero
            delays. A throwing `keys` or reason of a scope 
                that
            ended in the same turn is never run (the turn walk resolves arms only for scopes that did not end).
        - `Records`. One format step for every schedule field at once; it reads no definition, while `wake` does. The
            reference table gains the decode rows; the key and selection decode use the Schemas in `Compiled`; instance
            schedules are saved inside the instance's body.
        - `Operations`. A schedule issue's source (`IssueSource.Schedule`: name, key, at, as
            `Operations` spells it); `issuesOf`; a branded
            slot
            name; lane rows typed where `keys` and reasons read them.
        - `Types`. The declaration's types, `TimersOf<D>`, the evidence `Paused` and `Resumed` typed by declared name, 
            key and
            reasons, the one typed erasure; `Compiled` builds `schedulesAt`, `byName`, `rank`, `armedBy`, `disarmedBy`.
        - `Host`. The host stepper by arming id with a release; the alarm heap; the memo for the snapshot; a reporter 
            that
            records broken ids for inverted rows.

        Build order. [decided: user 2026-11-21] answered "the third row, as recommended" to the question of the build
        order: the declaration's runtime half first (the declaration object, its construction checks and the codecs in
        `Compiled`, about 70 lines plus the one typed erasure), then this module's build with one format step, then the
        public types, which change no runtime. @task.V3.T120 is the runtime half and @task.V3.T118 this module's build.

rules
    TableOrder       Keys, Selection, Arming, Firing, Reasons, Timing. Each table writes one field and reads only fields
                     decided before it, so I7 and I10 hold by the tables' shape; I3 holds because Timing runs last, for
                     every armed timer, on every occasion.
    ImpossibleCell   A firing whose arming id matches no timer of the schedule. The owner drops a firing whose arming
                     is not live and due; if one reaches `decide`, no row matches and nothing changes.
    DisarmIsAnEvent  A disarm wins over every start in the same turn, a new key and an entry included, and ends a
                     `Refused` arming with its issue. `Idle` after a disarm is the same `Idle` as after a last step, 
                     and a
                     later start cause arms it (the debounce). A start wins over the firing's next step: a restart or an
                     `armOn` in the firing's own turn begins at step one.
    UnansweredSend   A send that is neither committed nor refused (an unhandled or denied event) is the machine's
                     answer, not a failure of the schedule.
    ReEntry          A new activation id; the ended activation's state cannot be looked up; nothing is inherited (R11).
    ViewLifetime     An alarm and a host cursor live exactly as long as their `Armed(Due)` run's arming id; the applier
                     releases both when the id leaves the map.
    ThrowingRead     The family rule for a user read that throws changes only its own check. (1) Its field is
                     `Failed(f)`, and an issue names its slot. (2) Every decision that needed the value is made as if 
                     the
                     read had returned its last clean value; a subject with no clean value yet uses the neutral one. 
                     (3) The
                     next occasion reads again, and the first clean read after a failure is compared with the last clean
                     value, or becomes a silent baseline where there was none. (4) Inside a turn, a callback the 
                     turn must
                     run to compute its own result is the turn's check: the turn is `Refused`. I10 is this Spec's
                     statement of it for schedules.

realization typescript
    Types and the single point of erasure. Today the erased core meets the typed edge in two steps, and neither is
    typed: `machine` casts the whole body to `AnyBody` (code:packages/flow-state-v3/src/machine.ts#AnyBody); then
    `scheduleOf` (code:packages/flow-state-v3/src/compile-schedules.ts) wraps each callback with `erase`, whose input
    type is `never` (code:packages/flow-state-v3/src/handles.ts#erase), so it checks nothing. The public types are
    written by hand on the other side (code:packages/flow-state-v3/src/tokens.ts#ScheduleKey).

    The design: one point, derived from the declaration. The compiled schedule, `Schedule`, is built by one generic
    function from the declaration and the typed body entry. It holds the three codecs and the callbacks already
    decoded. Inward, `ScheduleReads` is built from it: a value that does not fit its codec is that check's failure.
    Outward, the snapshot's timers and issues, the evidence and the record are projected by generic functions over the
    same key and reasons. No field is cast. Today the container (`Incarnation`, `Compiled`) is erased, so the schedule
    types are instantiated at `Values` and `string`; when it becomes generic in the definition, they flow with no
    change. Each fact has one source, the declaration, and each requirement an owner.

    RT1  The declaration `schedules: { name: { key?, pausedBy?, restartOn? } }` is the one source of a schedule's name,
        key type, reason names and selection type. The body entry is checked against it exactly, by type and at
        construction. Today: names and reasons free in the body (`Record<string, ...>`, `tokens.ts`); selection
        `unknown`. Owner: the declared-schedules runtime half (@task.V3.T120); `Types` for the body's exactness.
    RT2  `key` has one derived type in every callback, the send mapper included, and is `undefined` in an unkeyed one.
        The two metadata types become one. Today: `ScheduleKey` in the send mapper, keyed or not, so `key.id`
        compiles and throws. Owner: @task.V3.T113. Turns the pin in `tests/types/schedules.test-d.ts`.
    RT3  `Snapshot<D>["schedules"]` is `TimersOf<D>`, with `pausedBy` the declared reasons. Today: `Timers`, written by
        hand; `pausedBy: ReadonlyArray<string>` (`src/host/snapshot.ts`). Owner: @task.V3.T113.
    RT4  One typed point of erasure: the compiled schedule is built from the typed entry and carries the codecs. The
        body cast and the unchecked `erase` stop standing before it. Owner: `Types` (`Compiled`).
    RT5  A schedule issue's source, and the evidence `Paused` and `Resumed`, are typed by declared name, key and
        reasons: a row of `EvidenceOf<D>` in `Types`, with `Operations` supplying the value `IssueSource.Schedule`.
        Today: text in `path`; `string` and `Values` in `evidence.ts`.
    RT6  Withdrawn: a metadata `output` derived from the body's `schedule` value did not compile in two typed shapes,
        so `output` stays `unknown`.
    RT7  Every type test is two-sided. Wrong-value probes: `pausedBy.includes("Vacaton")`, `key.id` in an unkeyed
        mapper, `snapshot.schedules.pol`, a `restartOn` result its Schema refuses, `now` in a reason, another
        definition's event as `send`. Today: one-sided pins.

    Kept wide, each with its reason: `Series` and a step's `output` (opaque to the core); memory, context and lane rows
    as `Values` (the container's erasure); a slot as `string`; the send's payload as `Values` (decoded at admission);
    `as Duration.Input` (`fromInput` checks it); the snapshot's one cast. 11 casts removed, 1 narrowed (a key as
    `Values`).

    Cost. By reading, not measured; the bench decides. No bench covers schedules today, so the build adds
    `turn.schedules.none`, `.one`, `.keyed-50` and a firing burst. Sizes: `S` schedules declared in the scope; `k`
    timers of one keyed schedule; `T` timers of the scope; `P` pause reasons; `C` context slots; `d` depth of the leaf;
    `N` states and `S_all` schedules of the machine; `W` host timers in the world; `D` timers due together; `I` open
    issues; `a` a series' attempt. After, against today:
        `pass`, scope with no schedule: O(1), no allocation. Today O(d*|leaf| + T + I): no fast path.
        `pass`, inputs unchanged (the gate): O(S). Today as below.
        `pass`, otherwise: O(S + the decisions). Today O(S*(T + I)) plus the decisions.
        `decide`: unkeyed O(P) callbacks; keyed O(k*P) callbacks and O(k) map work, O(k log k) only when the key set
            changes. Today O(k*(P + C)): a context record per read.
        a turn's arms and disarms: O(schedules listing the event). Today O(d*|leaf| + S*(armOn + disarmOn)), twice.
        a firing: O(log W) to take the due timers, one decision, one turn. Today O(W + D log D*(d*|leaf| + S)).
        `wake`, one scope: O(T) decode plus the decisions; O(a) per stepping timer. Today O(T*(C + a)) plus a pass.
        encode a scope's timers: O(T), only when the map's identity changed. Today O(T*(N + S_all)) per record write.
        snapshot timers and issues: O(T) per publication, memoized on the map's identity. Today O(k^2) per keyed
            schedule per read, plus sorts.

    Indexes computed once in `Compiled`: `schedulesAt` (the schedules of each state), `byName`, `rank` (a schedule's
    place in the due order), `armedBy` and `disarmedBy` (for each event tag, the schedules that list it). They are
    never written at run time and are checked by `indexDrift`. Kept at run time, each updated by its one writer in the
    same transition: `Keyed.timers` as a map by key text; the owner's map by activation id; the alarms, ordered by
    (deadline, admission, rank, key text), written only by the applier through the alarm heap.

    The input gate. `keys`, the reasons and `restartOn` are functions of the inputs of `model` and never of the clock.
    `pass` keeps the identities of memory, context, props and lanes from its last run. When all are the same, the
    occasion carries nothing for the schedule (no disarm, start or firing), it is not a `Wake`, and no timer of the
    schedule is `Refused`, the schedule is skipped. The delay reads `now`, and it runs only at a start, a retried
    `Refused` start included, which the gate never skips. It is a cache, so it lands only when the bench shows the reads
    matter; Level 0 checks gated against ungated (open item Q1). [proposed]

    In proportion to what changed: a scope with no schedule returns at once; an unchanged timer, schedule or map is
    the same object, so the record text and the snapshot memo are reused; when an input did change, the cost is
    O(T*P) callbacks over the scope's live timers, never the machine or the world.

    Principles held or traded, one line each. Classes, not instances: seven families, two members are named debt
    (open item Q6). One owner per state, one writer per field: `decide`, by the `Decided` brand. Store facts, derive
    views: issues, alarms, cursors, `adds` and overdue are derived; traded: `Held` and `Due` are stored though
    `reasons` gives the tag, because `left` and `dueAt` are facts, and `Stepping.output` is stored to keep a firing
    O(1). Total tables: six, one impossible cell, a model closed over them. Same rule at every scope: `decide` is
    scope-blind. A throw changes only its own check, except two kept rules (a turn's own arm with a bad delay refuses
    the turn; a next step that throws ends the series). Effect at the edges: the host steps with `Schedule.toStep`;
    the core holds data. Types derive from their source: held in this module's code (generic in key and reasons,
    `Tracked` from its Schema); traded until the single point of erasure exists, because the container erases.

coverage
    @R1    enforced_by [@I1, @I6]           proven_by [@T1, @T3, @T4]
    @R2    enforced_by [@I2, @I5]           proven_by [@T1, @T4]
    @R3    enforced_by [@I6, @I11, @I13]    proven_by [@T1, @T2, @T4, @T5]
    @R4    enforced_by [@I10, @I16]         proven_by [@T1, @T6]
    @R5    enforced_by [@I4]                proven_by [@T1, @T4]
    @R6    enforced_by [@I3, @I12]          proven_by [@T1, @T2]
    @R7    enforced_by [@I13]               proven_by [@T1, @T4]
    @R8    enforced_by [@I7]                proven_by [@T1, @T4]
    @R9    enforced_by [@I8, @I14]          proven_by [@T7, @T6]
    @R10   enforced_by [@I16]               proven_by [@T7]
    @R11   enforced_by [@I1, @I2, @I15]     proven_by [@T1, @T4]
    @R12   enforced_by [@I5, @I12]          proven_by [@T1, @T2]
    @R13   enforced_by [@I17]               proven_by [@T2, @T4]
    @R14   enforced_by [@I6, @I11]          proven_by [@T2, @T4]
    @R15   enforced_by [@I9]                proven_by [@T2]
    @R16   enforced_by [@I8]                proven_by [@T7]
    @R17   enforced_by [@I18]               proven_by [@T8]

tests
    T1  Level 0, pure and complete: `decide` and `wake`, one schedule, over every reachable state of the two-key 
        fixture, breadth first to closure, on abstract time. About 50,000 state and world pairs (history, not 
        acceptance: 22,464 for a
            Duration and 52,608 for a two-step series in a scratch model outside the repository, closed in 5 to 12 
                seconds). Catches the tables'
                faults for
            sequences of any length, not owner faults (`before` is given). I1 to I5, I7, I10 and I13 are checked at 
                every
            pair; I6 holds with no exception; the pseudo-code and the tables must never disagree. A next step past the
            limit and a throwing `resume` are atoms of this closure (Q5). [@I1, @I2, @I3, @I4, @I5, @I6, @I7, @I10, 
                @I13]
    T2  Level 1, Stories at depth 3: every 3-step sequence through public Stories and the snapshot, as 
        `tests/turn/schedule-sequences.test.ts`; 29 atoms, 24,389 rows plus the named rows. Catches the owner and the
            seams: the snapshot, the record, alarms, two schedules. Level 2: every 4-step sequence and seeded walks of 
                12,
            707,281 rows behind `FLOW_STRESS`. I9's alarm half is `Changes`' `alarmsMatch` (its T14), the one
            alarm sequence check, run after every step. [@I6, @I9, @I11, @I12, @I17]
    T3  The alphabet, from the inventory. Every writer, occasion and callback input appears. Two instances: two keys of 
        `t`, and a second schedule `u`. An edited build stays in force for the rest of its row. Freeze and thaw share
            `Wake`'s rows. A build that fixes a delay, a next step past the limit and a delay that throws at a wake are
            one-shot Stories, not atoms. Atoms by inventory item:
            Keys: `bad` appears; `bad` appears out of range; `bad` leaves; keys throw.
            Reasons, per key: A true, false, throws, for `good` and for `bad`.
            Selection: selection changes; throws; reads again; NEW context changes the selection; NEW `Stop` with a 
                changed
                selection.
            Firing, `Settled`: sends refused; sends accepted.
            Arming A1, exit and entry: `Stop`; NEW `Stop` while `bad` appears; re-entry.
            Firing, Arming A3: a minute passes: fires every due timer, `bad` before `good`.
            `Wake`: reload; reload without `paused`; NEW reload with A renamed; NEW reload after the context selection
                changed while away.
            `Lanes`: NEW a lane moves and lists `bad`; NEW a lane moves and drops `bad`.
            `Turn.started`, a second schedule: NEW `Go` arms the unkeyed `u` (`armOn`, reason B, two steps); NEW B true.
            20 existing atoms plus 9 new. [@I1, @I2, @I13, @I15]
    T4  Named rows and the Story of the wrong ending. Fixture as today: `t` keyed by `good` and `bad`, one minute,
            reason A per key, `restartOn` reading one number, `disarmOn: [Stop]`, `bad`'s delay out of range while 
                `far`.
            Letters are the steps' initials. Expected results are lookups in the tables.
            `plsk` Stop / selection throws / reload / selection changes: `good` restarts and fires once; the reload 
                kept the
                baseline (Selection; S-1).
            `lapk` selection throws / `bad` appears / Stop / selection changes: `good` restarts and fires; `bad` takes 
                its
                first clean read silently and stays idle (Selection row 3; S-3).
            `nroa` sends refused / minute / sends accepted / `bad` appears, then the clock: `bad`'s committed firing 
                leaves
                `good`'s send issue in place (F3, F5; I7).
            `etk` A `good` true / reload without `paused` / selection changes: the hold resumes at the reload; the 
                record
                decodes; one firing (decoder, Timing).
            B2 `bad` out of range / A `bad` throws / A `bad` false: the arming issue shows throughout (A2, Reasons).
            A `good` true / A `good` throws / re-entry: a new timer, armed, due, with the reason's issue; fires at 60 s.
            `bad` out of range / `bad` appears / reload: `bad` is `Refused` after the first step, arms at the second 
                step
                and fires; the reload changes nothing (A2; the retry rule).
            reload after the context selection changed while away: the owed wave restarts `good` once.
            `u` armed on a series, reload where its delay throws (one-shot): `u` keeps its deadline with its issue 
                showing,
                fires once, then is idle with the firing's issue.
            created with `u`'s entry delay out of range (one-shot): `Refused` with its issue, not a Creation issue.
            The Story, "the sign-out that never comes back": an idle sign-out whose `restartOn` reads the activity 
                counter,
                a playing video disarms it (`Stop`). The activity payload turns unreadable for one event (`restartOn`
                throws), the page reloads, and the user is active again. Right ending: the timer restarts and signs the 
                    user
                out after the idle delay. Wrong ending today: no baseline is saved, the reload's re-read throws, the 
                    next
                value is taken silently, and the session never signs out, with no issue shown. It is `plsk` on a 
                    fixture a
                reviewer can read. [@I1, @I2, @I6, @I7]
    T5  The oracle. Two parts, reported apart, so a wrong model rule cannot hide a broken property. Properties I1 to 
        I7, I12 and I13 are checked on every row from the snapshot, the world the test wrote and a five-line ledger of 
        owed
            firings; I6 and I7 compare two runs of the runtime with each other. Expected views are looked up in the 
                tables
            held as data, one row per cell: no second implementation. `tests/turn/schedule-ledger.ts` is amended before 
                any
            code: restore keeps the selection, value and failure (today it drops every baseline); a new timer's reasons
            start at `[]` (today it inherits its key's last reasons across a re-entry); restore keeps `firingFailed` and
            `selFailed` (today it clears them); the nine new atoms are added; the 375 lines of model are replaced by 
                the cell
            data and the five-line ledger. The count of red rows is an output, not a kept list: amend the oracle and 
                review
            it by a blind derivation of 30 rows; run all rows on today's code with a reporter that records, per failing 
                row,
            the first broken property or "table only", with no `it.fails`; rows red for "table only" are read by a 
                reviewer
            before they count; during the build an inverted row asserts its recorded broken id, and at the close the 
                red set
            is empty and the file is deleted. [@I6, @I7]
    T6  Planted faults. The nine existing plants on code that goes are re-pointed: the two `check-issue-*` plants to 
        table Selection, `firing-clears-every-key` and `firing-keeps-own-issue` to table Firing, `last-issue-wins` to
            `scheduleIssues`' order, `paused-ignored` and `restore-keeps-stale-hold` to table Timing,
            `throwing-reason-runs-new-run` and `idle-forgets-reasons` to table Reasons. The new faults, each with what 
                it
            plants and what catches it:
            `selection-dropped-at-wake`: the decoder gives `Unselected` for a saved selection; I6, `plsk`.
            `first-read-restarts`: `Unselected` counts as a change; I2, `lapk`.
            `wake-rebases`, `no-wave-after-wake`: `Wake` runs `restartOn` for a timer with a baseline, or the owner 
                skips the
                `Context` after a `Wake`; the row "reload after the context selection changed"; I13.
            `refused-start-goes-idle`: row A2's failure gives `Idle`; I1, B2.
            `refused-not-retried`: `Refused` is not a start cause; the row `bad` out of range / `bad` appears / reload; 
                I6.
            `gate-skips-refused`: the input gate skips a schedule that holds a `Refused` timer; the same row, gated 
                against
                ungated.
            `broken-resume-restarts`: a throwing `resume` decodes to `Refused`; the row "`u` armed on a series".
            `hold-skipped-without-reasons`, `restore-keeps-undeclared-reason`: table Timing skipped when no reason is
                declared; the decoder keeps an undeclared name; I3, `etk`.
            `reason-read-touches-arming`: table Reasons writes the arming; I10.
            `reentry-finds-old-state`: the owner looks a re-entered state up by name, not by activation; the re-entry 
                row.
            `disarm-loses-to-new-key`: row A2 runs before A1; the atom `Stop` while `bad` appears; I2.
            `next-step-applied-twice`, `firing-matched-by-key`: the owner writes the next step too; row A3 matches by 
                key;
                I5, I12; Level 0.
            `firing-clears-other-key`: table Firing writes every timer of the schedule; I7, `nroa`.
            `alarm-kept-after-arming-ends`, `alarm-missed-for-next-step`: the applier skips the release, or compares 
                ids and
                not `dueAt`; I9, I5.
            `ties-by-insertion-order`: due order drops the key-text step; I5.
            `schedule-issue-stored`, `timer-built-outside`: type pins: a `Schedule` source in `Incarnation.outcomes`; a
                `Tracked` literal in another file; the types. [@I1, @I2, @I3, @I5, @I6, @I7, @I8, @I9, @I10, @I13]
    T7  Types. Type tests are two-sided (RT7): wrong-value probes for each fact of the realization; the pins for the 
        `StoredSource` and `Decided` brands; a `Tracked` literal outside `schedule-decision.ts` fails to compile. [@I8,
            @I14, @I16]
    T8  Bench. The build adds `turn.schedules.none`, `.one`, `.keyed-50` and a firing burst; the input gate lands only 
        on a measured result. [@I18]
