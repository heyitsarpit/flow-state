spec Stories
status        proposed
basis         A guide for the test tooling, written with skill:to-spec and skill:to-design for @task.V3.T63;
              revisable whenever building shows it wrong, each change logged in wiki/specs/spec-log.md.
location      packages/flow-state-v3/src/host/testing
derives_from  [@plan.Testing.O1, @plan.Testing.O2, @plan.Testing.O3, @plan.Testing.O4, @plan.Inspection.O1,
              @plan.Inspection.O4]
provides      Story, Fake, the run, checkpoints and the runtime cut

requirements
    R1  A Story is inert data
        source  @plan.Testing.O1.
        must    `Story.app(config, fakes, steps)` returns a plain value holding the app's Runtime configuration (every
                field but its services), its fakes and an ordered array of steps. Making a Story, a step or a fake
                starts no Runtime, fiber or fake and runs no handler factory. The Story keeps its own copy of the
                steps, so changing the caller's array afterwards changes no run.

    R2  run() is the one boundary
        source  @plan.Testing.O1, @plan.Testing.O2.
        must    `run()` takes no options and returns a Promise of a StoryRun: the steps, every evidence record in
                order, each checkpoint by name, and `end`, a cut after the last step. Each call runs in a fresh world:
                new fake state from each fake's factory, an empty store, a Runtime of its own, time 0. A fault of the
                script, not of the app, rejects the Promise with StoryFailed naming it: a wire or storage word that
                finds nothing held, a hold or refuse no call or write used by the run's end, a repeated checkpoint
                name, two fakes of one service, a page that does not boot, and a step after which the page is not
                idle.

    R3  The step words
        source  @plan.Testing.O1, @plan.Runtime.O3, @plan.Runtime.O6.
        must    attach(ref) adds one use of the shared actor, creating or restoring it; detach(ref) ends that use;
                forget(ref) forgets the identity and its record; send(ref, event) sends a public event to the actor,
                restoring it from its record but never creating one; disposeActor(ref) disposes the actor;
                disposeRuntime() runs the Runtime's disposal; advance(duration) moves the page's clock; reload()
                abandons the page and boots another; checkpoint(name) records a cut. Each does what the public
                Runtime does for the same input (@spec.Actors), through the production driver.

    R4  A step settles
        source  @plan.Testing.O2.
        must    Every step applies its input, then runs the page's queued tasks until none is left, before the next
                step. A step whose tasks exceed 100,000 fails the run (StoryFailed: the page never went idle). After
                every step the page is idle: no task queued and no input waiting in the driver. advance(d) moves the
                page's time to now plus d, waking each sleep due on the way in time order and settling after each;
                nothing else moves time. A run never yields to the host and arms no host timer. Stated limit: a fiber
                resumed by a host Promise (`Effect.promise`, a real `fetch`) resumes outside the run; fakes and
                fixtures answer synchronously, so none exists in a Story.

    R5  A fake answers through the service's own methods
        source  @plan.Testing.O3.
        must    `Fake.server(Service, () => handlers)` stands in for a service a fixture declares: the Story's Runtime
                gets a Layer of that same service, so the commit's own code runs. A handler is the service's own
                method, with its own arguments, returning an Exit of that method's own success and failure types;
                the factory runs once per run, so its state lasts across reloads. A call nobody scripted lands at
                once through its handler. Every call is recorded in order with its method, arguments, page and
                status.

    R6  The wire words
        source  @plan.Testing.O3.
        must    `hold(method)` holds that method's next call. On the oldest held call of the method: `release` lands
                it through its handler and answers with the handler's Exit; `dropRequest` loses it before the server,
                so the handler never runs and no answer comes; `dropResponse` lands it through its handler and loses
                the answer; `answer(method, exit)` answers it with the given Exit and never runs the handler, so the
                fake's state is unchanged. A call that gets no answer waits forever, so only the commit's own
                deadline ends it. Each word's method and Exit are typed by the service: an unknown method, or an
                Exit of another method's types, is a type error.

    R7  The storage words
        source  @plan.Testing.O3; code:packages/flow-state-v3/src/host/host.ts#Store.
        must    Every run has one fake store, shared by its pages. A write lands at once unless a storage word was
                given: `hold()` holds the next write until `release()`, which lands the oldest held write and answers
                it; `refuse()` makes the next write fail StoreRefused, landing nothing. Every write batch is recorded
                with its page, purpose, keys and status.

    R8  A checkpoint is a cut
        source  @plan.Testing.O4; @plan.Inspection.O1.
        must    A checkpoint, and `end`, hold the page's time, the evidence position, the runtime cut, every call each
                fake has received with its status, and the store's records and write batches, as values captured
                then: later steps change no earlier cut. The runtime cut is one read of the Runtime's state: every
                live actor's snapshot, every write lane with its head's phase and re-sends, every owed ending, every
                armed timer, the uses of each identity and the disposal phase; a lane's row is read through the
                snapshot, not stored beside it. It reads and changes nothing.

    R9  A reload abandons the page
        source  @plan.Testing.O3 (every tab and reload shares the fake server); @plan.Persistence.O1.
        must    reload() leaves the current page as it is, never runs its tasks or moves its clock again, and boots a
                new page over the same store and the same fake state, at the same time, then attaches again every
                actor the Story attached and has not detached, forgotten or disposed. Nothing from a dead page writes
                to the store or is answered afterwards: a held write of a dead page released later is aborted and
                lands nothing, and a held call of a dead page released later reaches its handler; in both cases the
                dead page's waiter is never completed, so no code of the dead page runs again.

    R10  A run is reproducible
        source  @plan.Testing.O2.
        must    A Story run twice gives equal evidence, checkpoints and end. Each page's session seed is fixed by its
                page number, and host time and randomness never choose an order.

    R11  The tooling is internal
        source  @phase.V3.P2 (stops: public entry-point names).
        must    Nothing of Story, Fake or the runtime cut is exported from a public route; the tooling is reached only
                by its path inside the package, `src/host/testing/index.ts` and `src/host/inspect.ts`.

open
    Q1  Cut from @plan.Testing for this first slice.
        outcome  Story.machine and Story.fragment, tabs, together, setContext, hydration, frames, the address scheme,
                 typed checkpoint keys, the wire word duplicate, Fake.Lost and the transport binding, discovery, trace
                 export, redaction, the turn limit and the finishing horizon are not built; each returns with its
                 Task or phase.

    Q2  Batches out are the persistence edge's, not the world's.
        outcome  The runtime cut shows no batch out; the fake store's batch log shows each held write.

    Q3  Run rules and the reload sweep are @task.V3.T64's.
        outcome  This Spec's checks are Story tests; the rules over every run arrive with T64.

model
    Page = one boot: its own task list, its own TestClock and one Runtime over the run's store and fakes.

    DeadPage = a page a reload abandoned.

    Call = one invocation of a fake's method, with status held, landed, responseDropped, requestDropped or answered.

    Batch = one store write, with status held, landed, refused or aborted.

    Cut = time, runtime cut, calls, store records and batches, captured at one step's end.

invariants
    I1  Building a Story, a step or a fake runs no handler factory and starts no Runtime; the first factory call 
        happens inside run(). [@R1]

    I2  After Story.app(c, f, s) returns, mutating s changes neither the Story's steps nor any later run. [@R1]

    I3  For every completed step, the current page has no queued task and its driver no waiting input. [@R4]

    I4  During run(), no host setTimeout, setInterval or setImmediate is called. [@R4]

    I5  A page's time changes only by advance; a reload's new page starts at the dead page's time. [@R4, @R9]

    I6  Every call to a fake's method is recorded exactly once, in arrival order, whatever word later acts on it. [@R5]

    I7  A handler runs once for a landed, released or response-dropped call, and never for a request-dropped or 
        answered call. [@R5, @R6]

    I8  A held call is answered at most once, by release or answer, and only while its page is alive. [@R6, @R9]

    I9  A held write lands only on release while its page is alive; a refused write changes no record. [@R7, @R9]

    I10  After reload(), no record of the store changes because of a dead page, and no evidence comes from it: a step 
         that releases a dead page's held call or write leaves the evidence position, the store and the runtime cut
        as they were. [@R9]

    I11  A cut, once taken, never changes. [@R8]

    I12  Two runs of one Story give equal evidence, checkpoints and end. [@R10]

    I13  Every hold and refuse given is used by a call or a write before the run ends; every wire or storage word that 
         acts on a held item finds one. [@R2, @R6, @R7]

composition
    flow
        Design note. A Story's run boots page 0 at time 0 and applies the steps in order. A step drives the page's
        Runtime through the internal seam (`code:packages/flow-state-v3/src/host/testing.ts#testing`), so attach is
        a use and the Runtime's bounded disposal is reachable; then the page settles. The run, not a page, owns the
        fake state, the call log and the store, so a reload keeps them and only the page is new. A dead page is
        never closed, as a killed tab is not; it is only never drained again.

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
    - Held calls and writes: `Deferred` per held item, completed with `Deferred.doneUnsafe` by the step that
        answers it; a dropped or dead answer is never completed.
    - Fakes: `Layer.succeed(Service, service)` per page over the run's handlers; handlers return `Exit`, the
        service's own outcome type.
    - Faults of the script: `Data.TaggedError` (StoryFailed), the run's Promise rejects with it.
    - Skipped: `ManagedRuntime` and `Effect.runPromise` for the run (a page is driven by `Effect.runForkWith` on its
        own scheduler, then settled); `FiberMap` and `Scope` for pages (a dead page is never closed); `it.effect`
        (a run is a Promise and the Story test is a plain test).

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I13]
        open_by      [@Q1]

    @R3
        enforced_by  [@I3], the step-word Story tests
        open_by      [@Q1]

    @R4
        enforced_by  [@I3, @I4, @I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I6, @I7]
        open_by      [@Q1]

    @R6
        enforced_by  [@I7, @I8, @I13]
        open_by      [@Q1]

    @R7
        enforced_by  [@I9, @I13]
        open_by      [@Q1]

    @R8
        enforced_by  [@I11]
        open_by      [@Q1, @Q2]

    @R9
        enforced_by  [@I5, @I8, @I9, @I10]
        open_by      [@Q1]

    @R10
        enforced_by  [@I12]
        open_by      [@Q1]

    @R11
        enforced_by  lint's import rules and the package's public routes
        open_by      [@Q1]

tests
    T1  Inert: a fake whose factory counts its calls is wrapped in a Story; the count is 0 after building and 1 after 
        run(); pushing a step onto the caller's array after Story.app leaves the run's steps and endings as
            before. [@I1, @I2]
    T2  Script faults: run() rejects with StoryFailed for release with nothing held, a hold never used, a refuse never 
        used, a repeated checkpoint name and two fakes of one service, each beside a control that lands a transfer;
            a commit that yields forever fails its step as never idle. [@I3, @I13]
    T3  Step words, each on the transfers fixture with its expected result from @spec.Actors and @spec.WriteLanes: 
        attach and send land a transfer; detach ends the use, so no schedule fires (Turn I23); forget removes the
            actor's record from the store; disposeActor removes the actor from the cut; disposeRuntime moves the cut's
            disposal to Disposed, and with a call on the wire ends it unknown Disposed at the 5 s bound (Actors
            I35); a call nobody scripted lands through its handler; advance fires the nudge at 20 s and the deadline at 
                30 s, in that order, and not a
            millisecond before; reload re-attaches; a checkpoint holds time, cut, calls and store. [@I3, @I5]
    T4  Wire words: hold then release lands the call once and delivers success; dropRequest leaves the handler unrun 
        and the deadline ends the write unknown; dropResponse runs the handler once and the deadline ends the
            write unknown; answer with the method's own failure delivers that failure through the commit's mapping and
            leaves the fake's state unchanged. The words' types: an unknown method and another method's Exit are type
            errors. [@I6, @I7, @I8]
    T5  Storage words: while the acknowledging write is held no call reaches the fake (@spec.WriteAhead.R13), and 
        release lets the transfer go; a refused acknowledgement ends the write NotSent and no call is made; both
            batches are recorded. [@I9]
    T6  Dead page: a write held across a reload and released after it is aborted; a call held across a reload and 
        released after it lands at the fake once; either release leaves the evidence position, the store and the
            runtime cut equal to the checkpoint just before it (planted fault: the release completes the waiter);
            advancing after the
            reload fires no deadline of the dead page. [@I8, @I9, @I10]
    T7  Reproducible and timer-free: every fixture Story run twice gives equal evidence, checkpoints and end, with host 
        setTimeout, setInterval and setImmediate never called. [@I4, @I12]
    T8  Pay across a reload, captures written at once (captureMs 0): a confirm held, then dropResponse, so the shop's 
        handler runs and its answer is lost; 61 s, past the commit's 60 s deadline; a reload. The payment's row
            reads uncertain and not pending, its saved lane is Held, its endings are unknown TimedOut then unknown
            Restored (@spec.Restore.R3, @spec.Restore.I6), and the confirm handler ran exactly once; still once 10 s
            later, when the reconcile has read the intent as `requires_capture` and placed the order, which re-sends
            nothing. [@I6, @I10]
    T9  The long transfers Story (about 100 steps over two accounts with reloads) runs, and every request of one 
        transfer carries one idempotency key (@spec.WriteLanes.R5, @spec.WriteLanes.I6). [@I12]
