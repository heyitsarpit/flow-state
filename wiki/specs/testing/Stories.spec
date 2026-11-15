spec Stories
status        proposed
basis         A guide for the test tooling, written with skill:to-spec and skill:to-design; revisable whenever
              building shows it wrong, each change logged in wiki/specs/specs.log.
location      packages/flow-state-v3/src/host/testing
derives_from  [@plan.Testing.O1, @plan.Testing.O2, @plan.Testing.O3, @plan.Testing.O4, @plan.Inspection.O1,
              @plan.Pending.D5, @plan.Pending.D6, @plan.Pending.D7, @plan.Pending.D8]
provides      Story, Story.Step, Fake.server, Fake.call, Fake.control, Fake.world, Fake.Lost, Fake.storage, the run,
              checkpoints, the runtime cut inspect(runtime)

requirements
    R1  A Story is an inert chain
        source  @plan.Testing.O1.
        must    `Story.app(setup, { id, fixtures, world })` takes the app's own `runtimeSetup` and returns a Story
                with no steps. Each step word (R3) returns a new Story with one more step; the Story it was called
                on is unchanged, so a prefix can branch into several Stories. Building a Story, a step, a fake server
                or a fixture starts no Runtime, fiber, page or fake and builds no Layer. `id` is a nonempty string.

    R2  Story.Step is the chain's data form
        source  @plan.Testing.O1; @plan.Pending.D5.
        must    `story.steps` is the Story's ordered array of `Story.Step` values, one per chained step, each tagged
                with its step word's name and holding that word's arguments as data. `run({ steps })` runs the
                Story's setup, fixtures and `world` over the given array in place of the Story's own steps;
                `run()` is `run({ steps: story.steps })`.

    R3  The step words
        source  @plan.Testing.O1; @plan.Runtime.O3; @plan.Runtime.O6; @plan.Pending.D6.
        must    `ensure(ref)` attaches one use of the actor, creating or restoring it; `detach(ref)` ends one use;
                `send(ref, event)` sends a public event, restoring the actor from its record but never creating one;
                `dispose(ref)` is `disposeActor`, and `dispose(ref, { how: "forget" })` is forget, which forgets the
                identity and its record; `disposeRuntime()` runs the Runtime's public `dispose()`;
                `world(...words)` applies fake controls, wire words and storage words in order; `advance(duration)`
                moves time (R5); `reload()` abandons the page and boots another (R13); `checkpoint(name)` records a
                cut (R12). Each Runtime word does what the public Runtime does for the same input
                (@spec.Actors.R20, R21, R22), through the production driver. After `disposeRuntime()`, an ensure,
                detach, send or dispose before the next reload fails the run with StoryFailed.

    R4  run() is the one boundary
        source  @plan.Testing.O1, @plan.Testing.O2.
        must    `run()` returns a Promise of a StoryRun: `steps`, `evidence` (every Runtime evidence record in
                order, every operation ending among them with its operation, Attempt, channel and reason), 
                `checkpoints` by
                name and `end`, a cut after the last step. Each call runs in a fresh world: an empty store, the
                server registry at each server's `initial`, a Runtime of its own, time 0. A fault of the script, not
                of the app, rejects the Promise with StoryFailed naming it: a wire or storage word that finds nothing
                held, a hold, drop or refuse that no call or write used by the run's end, a repeated checkpoint name
                in a step array, a handler or control that throws, a page that does not boot (a fixture's Layer
                fails to build, or the Runtime's boot fails), and a step R3 forbids after `disposeRuntime()`.

    R5  A step settles; time moves only by advance
        source  @plan.Testing.O2.
        must    Every step applies its input, then runs the page's queued tasks until none is left, before the next
                step. After every step the page is idle: no task queued and no input waiting in the driver.
                `advance(d)` moves the page's time to now plus d, waking each sleep due on the way in time order and
                settling after each; nothing else moves time. A run never yields to the host and arms no host
                timer. Precondition: no fixture resumes a fiber from a host Promise (`Effect.promise`,
                `Effect.tryPromise`, a real `fetch`); such a fiber resumes outside the settle, so a run that has
                one is outside this Spec (Q3).

    R6  The turn limit
        source  @plan.Testing.O2.
        must    Each step may run 10,000 turns per instant; past that the run rejects with StoryTurnLimit, reason
                Turns, naming the step and the instant and carrying the evidence up to the 10,000th turn; later steps
                do not run. A settle that does not end within 100,000 tasks rejects with StoryTurnLimit, reason
                Settle, carrying the evidence so far.

    R7  Fixtures replace the setup's services
        source  @plan.Testing.O1, @plan.Testing.O3.
        must    `fixtures` are Effect Layers that together provide every service the app's contracts list; a
                missing service is a type error at `Story.app`, with no `Layer<any>` or cast. Two fixtures of one
                service are a type error too, since merged Layers would build both before either wins. A Story never 
                builds
                the setup's own services or store: each page gets the fixtures and `Fake.storage` instead, and
                every other field of the setup as it is. A fixture may require only the run's server registry
                (`Fake.world`), which the run provides. The only path from the app to a fake server is a fixture
                that is a Layer of the app's own service (a port fake); a fake server provides no app service.

    R8  A fake server holds truth, endpoints and controls
        source  @plan.Testing.O3; @plan.Pending.D7.
        must    `Fake.server(name, { truth, initial, endpoints, controls })` declares a server whose truth is a
                value of the `truth` Schema, starting at `initial`. An endpoint is
                `Fake.call({ request, success, failure, handle })`: `handle(truth, request)` is pure and synchronous
                and returns `{ truth, exit }`, the next truth and an Exit typed by `success` and `failure`. Called
                from a port fake, an endpoint answers `Effect<success, failure | Fake.Lost>`. A control is
                `Fake.control(fields, (truth, input) => truth)`, used as a `world` word. Truth lives in the run's
                registry, created on first use and shared by every page, reload and port fake of the run.
                `Fake.world` is that registry as a Layer, so a port fake also runs outside a Story (a contract
                test), where each server starts at `initial`. An Exit of other types, an unknown endpoint or control,
                or a control input of the wrong shape is a type error.

    R9  The wire words
        source  @plan.Testing.O3.
        must    Wire words are `world` words on an endpoint. `hold({ at })` holds that endpoint's next call:
                at "request" (the default) before the server, so the handler runs only on release; at "response"
                after the handler ran, holding its answer. `release()` acts on the endpoint's oldest held call: it
                runs the handler if it has not run, and answers with the handler's Exit. `drop({ at })` makes the
                endpoint's next call fail with `Fake.Lost` at once: at "request" (the default) the handler never
                runs; at "response" it runs once and its answer is lost. A held call never released is never
                answered, so only the commit's own deadline ends it. When that deadline interrupts the waiter, the
                call stays held: a later `release()` acts on it, runs the handler if it has not run, and completes
                nothing. There is no word that answers with a given Exit: every
                answer is a handler's, and a different answer comes from a control that changes truth. The port
                fake maps `Fake.Lost` to the port's own error.

    R10  Every call is logged with what happened to it
        source  @plan.Testing.O3, @plan.Testing.O4.
        must    Every call of an endpoint is logged in arrival order with its request, page and status: held or
                dropped at request, handled, held at response, dropped at response, or answered. A call reaches the
                server, and changes truth, only when its handler runs. A call no wire word acts on is handled and
                answered at once.

    R11  The storage words
        source  @plan.Testing.O3; code:packages/flow-state-v3/src/host/host.ts#Store.
        must    Every run has one `Fake.storage`, shared by its pages. A write lands at once unless a storage word
                was given: `Fake.storage.hold()` holds the next write until `Fake.storage.release()`, which lands the
                oldest held write and answers it; `Fake.storage.refuse()` makes the next write fail StoreRefused,
                landing nothing. Every write batch is logged with its page, purpose, keys and status: held, landed,
                refused or aborted.

    R12  A checkpoint is a cut
        source  @plan.Testing.O4; @plan.Inspection.O1; @plan.Pending.D8.
        must    A checkpoint, and `end`, hold the page's time (`now`), `inspection`, the result of
                `inspect(runtime)` at the step's end, every call each endpoint has logged with its status, each
                server's truth, and the store's records and write batches, as values captured then. Tests read a
                cut only through `read(ref)` (the actor's snapshot, or undefined), `read(server)` (its truth),
                `read(endpoint)` (each call it logged, with its status), `records` (`stored`, the store's records,
                and `batches`, its write batches), `inspection` and `now`, and a run's endings through `run.evidence`. 
                Checkpoint names are 
                typed: a duplicate name, a widened
                string or reading an unknown name is a type error. `inspect(runtime)` is the runtime cut of
                @plan.Inspection.O1: one passive read of the last committed state, starting no work and emitting
                no evidence. Its lanes carry the definition's `operation` name, the `contract` id and `state`
                (InFlight or Held; an Idle lane is not listed); its `lifecycle` is Open, Disposing or Disposed.

    R13  A reload abandons the page
        source  @plan.Testing.O3 (every tab and reload shares the fake server); @plan.Persistence.O1.
        must    `reload()` leaves the current page as it is, never runs its tasks or moves its clock again, and
                boots a new page over the same store and registry, at the same time, then ensures again every actor
                the Story ensured and has not detached, forgotten or disposed. Nothing from a dead page writes to the
                store or is answered afterwards. Releasing a dead page's held write aborts it and lands nothing.
                Releasing a dead page's held call runs the handler if it has not run, so truth and the call's log
                entry may change. In both cases the dead page's waiter is never completed, so no code of the dead
                page runs again: evidence, store records and `inspection` are equal before and after the release.

    R14  A run is reproducible
        source  @plan.Testing.O2.
        must    A Story run twice gives equal evidence, checkpoints and end. Each page's session seed is the Plan's
                tab seed (run seed, tab name, open count) with one tab, so page n's seed is fixed by n, and host
                time and randomness never choose an order.

    R15  Not exported yet
        source  @plan.Package.O1; @plan.Testing.O1 (one public Story for apps and Flow's own tests).
        must    Story, Fake and `inspect(runtime)` are the design of the public `flow-state/testing` and
                `flow-state/inspect` routes, and Flow's own tests use that same tooling by its path inside the
                package. No public route exports them before @task.V3.T29 exports `flow-state/testing` and
                @task.V3.T49 exports `flow-state/inspect`.

open
    Q1  Cut from @plan.Testing for this first slice.
        outcome  Story.machine and Story.fragment, tabs, together, setContext, hydration, frames, the address
                 scheme, the `storage` and `seed` options, the wire word duplicate and `times`, the cut reads
                 `state`, `memory`, `lane`, `attempt`, `entity`, `operations` and `schedules`, `run.frames` and
                 `run.payloads`,
                 Fake.http, Fake.Refused and Fake.Closed, the Plan's finer error names (StoryFakeError,
                 UnusedWireRule, DuplicateFixture, in place of StoryFailed's reasons), discovery, trace export,
                 redaction, the finishing horizon, cleanup at the end of a run and the advance limit (StoryTurnLimit
                 reason Advance, more than 100,000 deadlines in one advance) are not built.

    Q2  Batches out are the persistence edge's, not the world's.
        outcome  The runtime cut shows no batch out; the fake store's batch log shows each held write.

    Q3  A fiber resumed by a host Promise.
        outcome  Proposed: R5's precondition stands, and the settle moves to @plan.Testing.O2's microtask drain
                 when the first Promise-based adapter runs in a Story (Fake.http, an SDK). Until then a breach parks
                 the fiber outside the settle, so its commit ends at its own deadline (a TimedOut the world did not
                 cause) or never ends; the Plan's detector for a fiber still parked, HostTimeWait (@plan.Testing.O2),
                 is deferred with the finishing horizon.

    Q4  Run rules and the reload sweep are their own Spec's.
        outcome  This Spec's checks are Story tests; the rules over every run arrive with the sweep.

model
    Page = one boot: its own task list, its own clock and one Runtime over the run's store and registry.

    DeadPage = a page a reload abandoned.

    Registry = the run's fake servers' truth, one per server, created on first use.

    Call = one call of an endpoint, with a status of @R10.

    Batch = one store write, with status held, landed, refused or aborted.

    Cut = now, inspection, calls, truth, store records and batches, captured at one step's end.

invariants
    I1  Building a Story, chaining a step, or declaring a server, endpoint, control or fixture builds no Layer and 
        starts no Runtime; the first Layer is built inside run(). [@R1, @R7]

    I2  Chaining a step onto a Story leaves that Story's `steps` unchanged, so two Stories chained from one prefix 
        share it and differ only after it. [@R1, @R2]

    I3  For every Story s, `s.run()` and `s.run({ steps: s.steps })` give equal evidence, checkpoints and end. [@R2]

    I4  For every completed step, the current page has no queued task and its driver no waiting input. [@R5]

    I5  During run(), no host setTimeout, setInterval or setImmediate is called. [@R5]

    I6  A page's time changes only by advance; a reload's new page starts at the dead page's time. [@R5, @R13]

    I7  No step runs a 10,001st turn in one instant; the run rejects with StoryTurnLimit instead, and evidence up to 
        the 10,000th turn survives. [@R6]

    I8  A handler runs at most once per call: once for a call handled, held at response, dropped at response or 
        released from request, and never for a call dropped at request or held at request and not released. [@R9,
        @R10]

    I9  A server's truth changes only by a handler's returned truth or a control, never by a dropped-at-request call. 
        [@R8, @R10]

    I10  A held call is answered at most once, only by release, and only while its page is alive. [@R9, @R13]

    I11  Every ending in `run.evidence` comes from a handler's Exit through the commit's own mapping, a `Fake.Lost` 
         through the port fake, the commit's own deadline, or a lifecycle step; no Story word supplies an
        ending. [@R9]

    I12  Every call of an endpoint appears exactly once in `read(endpoint)`, in arrival order, with the status of R10 
         at the cut. [@R10]

    I13  A held write lands only on release while its page is alive; a refused write changes no record. [@R11, @R13]

    I14  After reload(), no store record changes because of a dead page and no evidence comes from it: a step that 
         releases a dead page's held call or write leaves the evidence, the store records and `inspection` equal to
        the cut just before it; only the call's log entry and truth may change. [@R13]

    I15  A cut, once taken, never changes; reading it starts no work and changes no later cut. [@R12]

    I16  Taking `inspection` adds no evidence and changes no Runtime state: two reads at one point are equal. [@R12]

    I17  Every hold, drop and refuse given is used by a call or a write before the run ends; every release finds a held 
         item. [@R4, @R9, @R11]

    I18  Two runs of one Story give equal evidence, checkpoints and end. [@R14]

    I19  A Story's pages are built from its fixtures and `Fake.storage` only: no Layer from the setup's own services 
         and no external store is built in a run. [@R7]

composition
    flow
        Design note. A Story's run boots page 0 at time 0 and applies the steps in order. A step drives the page's
        Runtime through the production driver (`code:packages/flow-state-v3/src/host/testing.ts#testing` for
        ensure, until the Runtime has a public use), then the page settles. The run, not a page, owns the registry,
        the call log and the store, so a reload keeps them and only the page is new. A dead page is never closed,
        as a killed tab is not; it is only never drained again.

realization typescript
    Effect prior art, checked against the installed effect 4.0.5 with the `effect-api-documentation` skill:

    - Time: `TestClock.layer` (effect/testing), built per page with `warningDelay` infinite so no live timer is
        armed; `TestClock.adjust` wakes sleeps in timestamp order and waits for each woken fiber to suspend;
        `TestClock.setTime` starts a reloaded page at the old page's time. Used: it replaces both hand clocks
        (`code:packages/flow-state-v3/src/host/testing/page.ts#pageOver` and the bridge's).
    - Event loop: `Scheduler.MixedScheduler` with its host hook replaced by a push onto the page's task list;
        TestClock's layer wraps it and provides it as the page's Scheduler, which every Runtime fiber inherits.
        Draining the list is settling. Effect has no run-to-idle call and needs none: only scheduler hops queue
        tasks.
    - Held calls and writes: `Deferred` per held item, completed by the step that releases it; a dropped answer,
        or one whose page is dead, is never completed.
    - Fakes: a fake server is a Context key whose service, built from the registry, gives each endpoint as a
        function returning an Effect; a port fake is a plain `Layer.effect` of the app's service over it.
        Endpoints return `Exit`, the port's own outcome type.
    - Faults of the script: `Data.TaggedError` (StoryFailed, StoryTurnLimit); the run's Promise rejects with it.
    - Skipped: `ManagedRuntime` and `Effect.runPromise` for the run (a page is driven by `Effect.runForkWith` on its
        own scheduler, then settled); `FiberMap` and `Scope` for pages (a dead page is never closed); `it.effect`
        (a run is a Promise and the Story test is a plain test).

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I2, @I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4], the step-word Story tests
        open_by      [@Q1]

    @R4
        enforced_by  [@I17], the script-fault Story tests
        open_by      [@Q1]

    @R5
        enforced_by  [@I4, @I5, @I6]
        open_by      [@Q3]

    @R6
        enforced_by  [@I7]
        open_by      [@Q1]

    @R7
        enforced_by  [@I1, @I19], the type of `Story.app`
        open_by      [@Q1]

    @R8
        enforced_by  [@I9], the types of `Fake.server`, `Fake.call` and `Fake.control`
        open_by      [@Q1]

    @R9
        enforced_by  [@I8, @I10, @I11, @I17]
        open_by      [@Q1]

    @R10
        enforced_by  [@I8, @I9, @I12]
        open_by      [@Q1]

    @R11
        enforced_by  [@I13, @I17]
        open_by      [@Q1]

    @R12
        enforced_by  [@I15, @I16], the type of `checkpoints`
        open_by      [@Q1, @Q2]

    @R13
        enforced_by  [@I6, @I10, @I13, @I14]
        open_by      [@Q1]

    @R14
        enforced_by  [@I18]
        open_by      [@Q1]

    @R15
        enforced_by  lint's import rules and the package's public routes
        open_by      [@Q1]

tests
    T1  Inert chain: a fixture whose Layer counts its builds is in a Story; the count is 0 after building the Story and 
        two branches from one prefix, and one per page after run(); the prefix's `steps` are unchanged by the
            branches; `run({ steps: story.steps })` equals `run()`. A setup whose own services Layer counts its
            builds runs in a Story with that count 0, and no external store is opened. [@I1, @I2, @I3, @I19]
    T2  Types, checked by `nub run check` with `@ts-expect-error`: a missing fixture for a contract service, two 
        fixtures of one service, a
            duplicate, widened or unknown checkpoint name, an endpoint Exit of other types, an unknown endpoint or
                control, a control input of the wrong shape, and an `answer` word on an endpoint; no cast in fixtures or
                tests (grep). [@R7, @R8, @R9, @R12]
    T3  Script faults: run() rejects with StoryFailed for a release with nothing held, an unused hold, drop, storage 
        hold and refuse, a repeated checkpoint name in a step array, a throwing handler, a fixture whose Layer
            fails to build (the page does not boot) and a send after disposeRuntime; each beside a control that lands
            a transfer. [@R4, @I17]
    T4  Step words, each on the transfers fixture with its expected result from @spec.Actors and @spec.WriteLanes: 
        ensure and send land a transfer; detach ends the use, so no schedule fires (@spec.Turn.I23); dispose with `how: 
        "forget"` removes
            the actor's record from the store (@spec.Actors.R21); dispose removes the actor from `inspection`
            (@spec.Actors.R20); disposeRuntime moves `inspection`'s lifecycle to disposed, and with a call on the wire
            ends it unknown Disposed at the 5 s bound (@spec.Actors.I35); world applies a control; advance fires the
            nudge at 20 s and the deadline at 30 s, in that order, and not at 19,999 or 29,999 ms; reload ensures
            again; a checkpoint holds now, inspection, calls, truth and store. [@I4, @I6]
    T5  Settle and turn limit: a machine that sends itself an event every turn rejects with StoryTurnLimit naming the 
        step and instant, with 10,000 turns in the evidence; a commit that yields forever rejects with
            StoryTurnLimit reason Settle; a schedule due every millisecond, advanced past 100,000 deadlines in one
            step, rejects with StoryTurnLimit reason Advance. [@R6, @I4, @I7]
    T6  Fake server: a control changes truth and the next call is answered by the handler's rule (a limit control makes 
        the next transfer Declined); `read(server)` shows truth after each; the transfers port fake passes the
            bank contract test over `Fake.world`, outside a Story. [@I9]
    T7  Wire words: hold at request then release runs the handler once at the release and delivers success; hold at 
        response runs the handler at once and release delivers its answer; drop at request leaves truth unchanged
            and the port's NoResponse ends the write unknown; drop at response changes truth once and ends the write
            unknown; hold at response never released ends the write unknown TimedOut at the commit's deadline; each
            call's status in `read(endpoint)` matches, and a release after that deadline runs no code of the
            commit. [@I8, @I10, @I11, @I12]
    T8  Storage words: while the acknowledging write is held no call reaches the fake (@spec.WriteAhead.R13), and 
        release lets the transfer go; a refused acknowledgement ends the write NotSent and no call is made; both
            batches are logged. [@I13]
    T9  Dead page: a write held across a reload and released after it is aborted; a call held at request across a 
        reload and released after it is handled once; either release leaves the evidence, the store records and
            `inspection` equal to the checkpoint just before it (planted fault: the release completes the waiter);
            advancing after the reload fires no deadline of the dead page. [@I10, @I13, @I14]
    T10  Reproducible and timer-free: every fixture Story run twice gives equal evidence, checkpoints and end, with 
         host setTimeout, setInterval and setImmediate never called; reading `inspection` twice at one
             checkpoint gives equal values and the evidence position is unchanged. [@I5, @I15, @I16, @I18]
    T11  Pay across a reload, captures written at once (captureMs 0): a confirm held at response and never released, so 
         the shop's handler runs and the confirm is never answered; 61 s, past the commit's 60 s deadline; a reload.
             The payment's row reads uncertain and not pending, its lane is Held, its endings in `run.evidence` are
             unknown TimedOut then unknown Restored (@spec.Restore.R3, @spec.Restore.I6), and `read(endpoint)` shows
             one confirm, held at response; still one
             10 s later, when the reconcile has read the intent as `requires_capture` and placed the order, which
             re-sends nothing. [@I8, @I14]
    T12  The long transfers Story (about 100 steps over two accounts with reloads) runs, and every request of one 
         transfer carries one idempotency key (@spec.WriteLanes.I6). [@I18]
    T13  Not exported: no public route of the package re-exports `src/host/testing` or `inspect(runtime)` (grep of the 
         routes); Flow's tests reach them by path. [@R15]
