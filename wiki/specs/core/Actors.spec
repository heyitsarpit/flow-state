spec Actors
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in wiki/specs/specs.log.
              Written from the merged flow plans (proposed).
location      packages/flow-state-v3/src
provides      runtimeSetup, Runtime, actorRef, ensureActor, createActor, send, disposeActor,
              forget, dispose, unsettledWrites, runPromise
derives_from  [
              @plan.Runtime.O2, @plan.Runtime.O3, @plan.Runtime.O4, @plan.Runtime.O5,
              @plan.Runtime.O6, @plan.Runtime.O7, @plan.Runtime.C2, @plan.Runtime.V2,
              @plan.Runtime.V3, @plan.Runtime.V4, @plan.Runtime.V5, @plan.Runtime.V6,
              @plan.Runtime.V7
              ]

requirements
    R1  Inert setup and services
        source  @plan.Runtime.O2.
        must    runtimeSetup(...).construct() is synchronous and inert. scope is an optional
                nonempty string that machines, operations and conditions never read (persistence
                requires it, @spec.WriteAhead.R1). services is a
                Layer typed by the machines' R; a missing service is a type error, and the boot
                refuses, by machine, operation and service, an operation whose service it lacks.
                Each service is acquired once per Runtime.

    R2  One readiness
        source  @plan.Runtime.O2.
        must    ready() is the one readiness Effect. The first call starts the bootstrap;
                concurrent and later callers share its result, a failure included, with no implicit
                retry. Interrupting one waiter interrupts only that wait. Once disposal has started,
                ready rejects RuntimeDisposed (R22).

    R3  Bootstrap order
        source  @plan.Runtime.O2.
        must    With persistence: claim scope ownership (a Runtime refused it runs as
                @spec.WriteAhead.R16 states), acquire storage, then read and validate
                persisted data before any app service starts. Then acquire the remaining services,
                install the Owing identities (@spec.Restore.R1), providers before consumers, keep
                every other record a record, establish silent context baselines, and open the
                Runtime to callers.

    R4  Bootstrap failure and early calls
        source  @plan.Runtime.O2.
        must    A service acquisition failure fails ready() with FlowError and its Cause, releases
                what was acquired in reverse order (the services Layer is built in the Runtime's
                Scope, so its finalizers do this), and leaves no actor or evidence. Before ready
                succeeds, `ensureActor` and `createActor` reject with RuntimeNotReady.

                A send to a persisted actor before boot queues until boot within the boot bound;
                past it, or on a failed read, it reports StorageFailure, the Runtime runs without
                persistence and the queue is flushed (@task.V3.T9, proposed; until then
                RuntimeNotReady). Disposing during bootstrap cancels it and closes admission; a
                service acquired late is released and no handle is exposed.

                The Runtime's life is one value in the core, Life (`model`). One total table,
                `admit` (`algorithm`), says whether an input runs, is dropped (a late host answer or
                timer) or is rejected with RuntimeNotReady or RuntimeDisposed; the host keeps no
                flag of its own. A dispose while Inert or Booting goes straight to Disposed, and
                the Boot that follows is rejected, so ready fails with RuntimeDisposed. Decision
                (user, 2026-11-12): @task.V3.T55, from consult round 3. Why: the host's four flags
                disagreed on early and late calls. Reverse: restore R4 from commit `9405af2f`.

    R5  Identity
        source  @plan.Runtime.O3.
        must    An actor is its machine plus its input. A value-named machine is named by its input
                fields, encoded with their Schemas in field-name order as strings, and is ensured
                without input; a machine with no input is a singleton named by a literal string that does
                not start with `~`, the prefix of local actors.
                Two refs of one identity with different context reject with ConflictingActorRef and
                change nothing, wherever the ref sits: an ensure whose provider graph names a live
                identity with other context is refused the same way. A local actor is (machine,
                input by Equal.equals).

    R6  ensureActor and createActor
        source  @plan.Runtime.O3.
        must    ensureActor(ref) returns the one shared actor for that identity, creating it from
                its input or restoring it from the Runtime's copy of its record; a failed admission
                leaves nothing behind. createActor, given optional props, always creates a new
                local actor that cannot persist or be a send target and lives until disposed.
                Only local actors take props; ensureActor and actorRef take none, and actorRef on
                a machine that declares props is a type error and InvalidConfiguration at
                construction. A handle follows the identity, not the incarnation.

    R7  Uses and work in flight
        source  @plan.Runtime.O3.
        must    A use is an attached consumer, a live snapshots subscription, a bound context
                consumer, or Flow's hold for dehydrate and Hydrate; uses count per identity.
                ensureActor alone, getSnapshot, lookups, views, sends and emit listeners are not
                uses. Work in
                flight is an InFlight write lane, a read started in a turn handling the ending of
                work in flight (transitively), and an ending owed at ready. Nothing else keeps an
                actor alive.

    R8  The end
        source  @plan.Runtime.O3.
        must    A shared actor free of uses and work in flight for the grace (`RuntimeDefaults.freeGrace` on
                the Runtime's Effect Clock) ends at the grace's end: a persisted actor's record is kept and captured at
                once (the end waits while it cannot encode, reported UnencodableValue, and never ends
                on the last good capture of @spec.WriteAhead.R4), its lanes move to the Runtime unbound,
                its schedules are cancelled, its placements and unkept reads stop, and each stopped
                read owes its Interrupted ending (@spec.Reads.R9) to the identity. Its owed rows are
                suspended (@spec.WriteLanes `algorithm`, ledger): those in its mailbox wait for the
                identity's next start, and those owed to that incarnation alone close as evidence.

                EndedWithWork is warned once per machine and kind of work. An ensure while it ends
                binds the next incarnation. Decision (agent, 2026-11-11): the end is owed, not only
                allowed (audit gap G3). Why: an actor that may never end holds memory and services
                for ever. Reverse: drop I37 (spec-log.md, T42).

    R9  The return
        source  @plan.Runtime.O3.
        must    A persisted identity reached by an ensure, a subscription or a send returns as a new
                incarnation with a newly minted id, restored from the Runtime's copy. It receives
                its starting turn, R10's deliveries (the Interrupted endings its end parked are among
                its owed rows, in the order they were owed), one `onContext` wave if a provider's
                selection differs from the last-seen value its record saved (in this Runtime or
                across a reload; a reload of a consistent saved world differs in nothing), then the
                event that restored it. Its starting turn publishes once, with its providers'
                current selections; the wave re-runs only its reactions against the saved values,
                and publishes only a changed slot or issue. A slot never selected before differs
                from any selection. Each reaction's baseline is read again from the inputs it was
                last read from (R18), so it is the one it had, a baseline a defect kept included.

                A non-persisted identity starts fresh. An ensure over an undecodable record starts
                fresh, reports RecordUndecodable (proposed name) and adopts the identity's lanes. A
                local actor remounted within its grace reuses that actor; a new incarnation of an
                equal local identity starting while an older one is kept only by work in flight
                disposes the older one and adopts its lanes.

    R10  Lanes follow identities
        source  @plan.Runtime.O3.
        must    A starting incarnation adopts only its own identity's unbound lanes, oldest first
                for equal local identities. Its start is the one point where a reload, a return and
                an adoption deliver. Before any external event it runs a pending reset, if any
                (@spec.Restore.R2), then receives its owed rows in the order they were owed (each
                Waiting row, and each Kept row for its one try), then, lane by lane, each queued
                commit's NotSent { Restored } where a lane record holds a queue, and each Held head's
                unknown { Restored } once per incarnation unless a row for that head's Attempt is
                owed (@spec.Restore.R3), then an in-flight Attempt's ending when it lands. A boot delivers nothing and 
                parks nothing itself. Decision (agent: the
                orchestrator, 2026-11-12): consult round 3, Part 2. Why: one delivery point gives a
                reload, a return and an adoption the same order. Reverse: restore R10 from commit
                `9405af2f`.

                A lane binds to the live incarnation with the subject path its record holds
                (@spec.WriteAhead.R5: required of the record, not built yet); with none its ending
                waits as an owed row, which holds no path, for the identity's next start.
                No schedule, issue or send of an old incarnation reaches a new one.

    R11  Identity versions
        source  @plan.Runtime.O3.
        must    For a persisted value-named machine, adding, removing or renaming an input field, or
                changing a field's Schema on its type or encoded side, is a new version; other
                annotations are ignored (a custom filter with no representation and a transformation
                with unchanged sides are not seen: stated limits).

                Flow's version encodings carry a format tag, and an older format is read by
                recomputing the current Schema in that format (the runner's rulings). A saved record
                of another version is an old-version record; the boot handles it under
                @spec.Restore.R6.

    R12  Mailboxes
        source  @plan.Runtime.O4.
        must    Each actor processes one event at a time from one FIFO mailbox in admission order;
                sends, call endings, stream deliveries, timer firings, onContext events and props
                updates queue together. A call's ending is owed and queued at settlement and mapped at admission.
                The mailbox holds a reference to the ending's owed row, never the ending; a reference
                whose row is closed does nothing.

    R13  Order across actors
        source  @plan.Runtime.O4.
        must    Follow-ups (the events and context updates a served event's turns enqueue) run first,
                oldest first within each actor. The loop guard: one count per admitted event, shared
                by every follow-up it starts and every consumer its context updates reach; up to
                `RuntimeDefaults.loopGuard` events sent by turns count, the sends of the turns of
                the `onContext` events among them; a turn that would send one more is refused
                InvalidTurn and undone, its issue naming the guard and the admitted event. A context
                update a later wave joins while it waits follows whichever count is higher. The
                context updates and the onContext events themselves are never counted, and never
                refused for being enqueued, since ContextCycle bounds a context chain; a turn of an
                onContext event that would send past the guard is refused like any other. Endings
                and firings are not counted either, and each is an admitted event of its own.
                Otherwise one event runs from the
                next actor in rotation, oldest first. The guard counts the events one admitted
                event's turns send, a chain inside one admission, not how often events are admitted.
                A step serves at most `RuntimeDefaults.drainYield` mail items, then yields to the
                host and serves the rest in a later step: a fairness yield that decides when mail
                runs, never whether.

                A send to an idle Runtime runs its turn before send returns; during a turn it
                queues. Slices decide when work runs, never what. A spin, events admitted again and
                again one after another (a call that fails and is asked again, say), is never
                stopped by the scheduler; TurnStorm is evidence and decides nothing. What bounds a
                chain started by a listener is Q4.

    R14  No mailbox cap
        source  @plan.Runtime.O4.
        must    A mailbox has no cap: an external send to a live actor is admitted however many
                events wait, and none is refused for the mailbox's size (@plan.Pending.D24). An
                internal, unknown or invalid event throws InvalidEvent and starts no turn. A send
                admits a payload its Schema's type side accepts, narrowed to the payload's declared
                fields: a key the Schema does not declare is dropped, so a handler reads only
                declared fields (a nested value is kept as given). Endings,
                schedule firings, context updates and props updates are never dropped. Before
                attach, a local actor holds one replaceable pending props update.

    R15  Refused deliveries are kept
        source  @plan.Runtime.O4.
        must    An ending whose turn is refused, or whose mapper throws at admission, is delivered
                once more after the mail already queued. Each refusal reports an issue naming the
                ending and its cause; the second keeps it (a Kept row) until the next start.
                Decision (agent, 2026-11-11): rulings CQ1 and CQ2. Why: a refusal may be transient,
                and retrying without bound would spin. Reverse: restore the pre-T42 text
                (spec-log.md, T42).

                A kept ending is a row of the owed ledger, never lane state (@spec.WriteLanes.R6,
                @spec.WriteLanes.R10). A sent write's Kept row blocks its lane's key until heard,
                cancelled, released or a local life ends; a second kept ending on the same lane is a
                second row and replaces nothing; a kept ending with no lane (a declined commit's)
                blocks nothing. A read's answer is stranded until that life asks again, ends or a
                boot. A Kept row gets one try at each start: a reload, a return or an adoption.
                Decision (agent: the orchestrator, 2026-11-12): consult round 3. Why: a kept ending
                as a row survives its lane and needs no lane state. Reverse: restore R15 from commit
                `9405af2f`.

    R16  The send table
        source  @plan.Runtime.O4.
        must    A send never creates an actor or adopts a lazy entry and is not a use.

                By target:

                - live is delivered;
                - ending and persisted queues for the next incarnation;
                - ending and not persisted drops with SendTargetAbsent { NoRecord };
                - ended with a decodable record restores and delivers;
                - an undecodable record drops with RecordUndecodable;
                - no record drops with NoRecord;
                - a lazy entry not adopted drops with NotAdopted;
                - a persisted actor during boot queues (@task.V3.T99, proposed; until then
                RuntimeNotReady, by `admit`);
                - an actor being disposed drops with NoRecord, never restored.

                A drop is SendTargetAbsent evidence naming its sender (none for a handle's send) and
                never rolls back the sender's turn. A machine's send checks its ref's name and its
                event by the target's own Schemas, as a handle's send does; a bad one refuses the
                sender's turn InvalidTurn. Several sends keep their order.

    R17  Complete cuts
        source  @plan.Runtime.O4.
        must    Every publication is one complete cut: no reader sees an actor's new snapshot with
                old store data or the reverse. A new snapshots subscriber gets current truth first;
                slow subscribers may skip intermediates. Snapshots expose no revision or raw Cause.
                A subscription completes when its subscriber stops or after the terminal snapshot
                of disposeActor, forget or Runtime disposal.

    R18  Context binding
        source  @plan.Runtime.O5.
        must    Provider.select(schema, selector) reads one complete provider snapshot (the Schema is
                proposed, @plan.Pending.D20). Each selection passes once through the Schema's JSON
                form, a -0 written as 0; the value read back is what the consumer reads, compares and
                saves, live and after a reload alike. A selection the Schema refuses, whose encoding
                never ends, or whose JSON has no canonical form, is its selector's defect (R19); a
                selection of any size is read and saved (@spec.Codec.R1). A slot binds to one provider
                for the consumer's lifetime; a bound consumer is a use of its provider, and a provider
                it starts binds the overrides its own ref gave, again at a return or a reload. A cycle
                (ContextCycle), a missing provider (MissingContextProvider) or an incompatible one
                rejects at admission. A record saves each bound slot's last-seen selection (none for
                one never selected), each reaction's baseline inputs (the slots its select read, and
                the memory fields it read in one copy shared by every baseline read from the same
                memory, kept only where it differs from the record's memory) and the bindings of every
                provider up its graph. Every slot value and baseline input is saved, so a reload loses
                no change a consumer has not heard and makes none up. Baselines are silent at
                admission, adoption,
                hydration and a reload restore; `keys` and `paused` are re-evaluated silently at the
                same points and on a return;
                a return restored from the Runtime's copy gets R9's one wave when a
                provider's selection changed meanwhile. Decision (agent, 2026-11-11): audit C13.
                Why: a reload restores a consistent saved world, while a return may have missed
                provider changes. Reverse: make the return silent too (spec-log.md, T42).

    R19  Context waves
        source  @plan.Runtime.O5.
        must    When a provider changes, each affected consumer receives at most one update per
                wave, from the latest complete provider snapshots, never mixing new and stale values
                of one cause (diamonds included). Equal slots cause no update: slots compare by
                Equal.equals over the values their Schema reads back (R18).

                A context update keeps its FIFO place. A throwing consumer selector keeps the last
                valid context, publishes one issue and retries only on a newer provider snapshot.
                Capture never observes a half-propagated wave.

    R20  disposeActor
        source  @plan.Runtime.O6.
        must    disposeActor removes the actor's record for every user, keeps its non-Idle lanes as
                unbound lane records listed and reported at each boot until an adopting ensure or
                its owner's cancel, and flushes the removal at once; a send to it drops NoRecord
                (R16) whether or not the removal is acknowledged. Disposing a provider with bound consumers rejects
                with BlockedByDependents naming them. Actor and Runtime disposal are idempotent.
                The identity's owed rows are suspended and stay owed: its owed record is not removed
                with its actor record (@spec.WriteAhead.R5).

                Proposed (the T99 lead, 2026-11-19): the removal also drops the identity's queued mail,
                so none reaches a later incarnation (R10), and the boot's quarantine of its actor record,
                so a send drops NoRecord and an ensure starts fresh unreported while a batch is out. Each
                boot reports every unbound lane record as UnboundLane (proposed name, @spec.Restore.R6),
                naming its record, until an adopting ensure or its owner's cancel ends it.

    R21  forget
        source  @plan.Runtime.O6.
        must    forget removes the identity's record so the next ensure starts fresh; every owed row
                of the identity is closed, recorded as evidence, or as letGo for a Kept row
                (@spec.WriteLanes `algorithm`, ledger, close). It drops no hold: a Held lane stays
                unbound until its owner's cancel or an adopting ensure; a hold whose operation no
                longer exists is dropped with HoldForgotten (proposed name). forget of a live actor
                disposes it first.

    R22  Runtime disposal
        source  @plan.Runtime.O6.
        must    Runtime disposal closes admission first (later ready, ensureActor, createActor and
                runPromise reject RuntimeDisposed, by R4's `admit`), then disposes consumers before
                providers. Queued events that have not started (sends, stream deliveries, timer
                firings, context updates) are dropped, and with them the mailbox's references to
                owed rows (R12); the rows themselves are suspended in the same step and stay owed, so no
                ending is lost. Schedules cancel, placements stop and sessions release within the
                disposal bound, `RuntimeDefaults.disposalBound` (ReleaseOverdue).

                From its start nothing new is invoked, and no Held head and no owed ending is
                dropped. A never-sent commit (queued, or a head waiting for its acknowledgement or
                to be invoked) ends NotSent { Disposed } before the disposal ends: its head goes,
                and its ending is parked and delivered to the identity's next incarnation. A head
                waiting to re-send goes Held, and its record says so. A call settling within the bound is
                applied to its lane and its ending parked; past the bound an Attempt on the wire
                ends unknown { Disposed } and its late result is ignored. Each identity's owed rows
                are suspended in the disposal's order, an ending with no lane included. Where a
                lane's endings are delivered or parked together, the ending that leaves a hold comes
                last. An unknown keeps its head Held on disk; a definite ending drops its head and
                stays owed. Decision (agent, 2026-11-11): ruling CQ6 and audit gap G5. Why: a
                never-sent commit must still end, and the next incarnation is the only one left to
                hear it. Reverse: restore the pre-T42 text (spec-log.md, T42).

                Proposed (the T99 lead, 2026-11-19): the order is one plan the host runs. The core's
                disposal ends with each live identity's terminal evidence (Finished), every consumer
                before its providers (@plan.Inspection.O3); then the host interrupts every call and
                awaits it, and only then releases the services, so an interrupt cleanup never runs on
                released services.

    R23  Disposal failure and the last write
        source  @plan.Runtime.O6.
        must    A cleanup failure rejects dispose with CleanupFailed, quarantines the ref (later
                ensures report the same failure) and keeps the full Cause; it is never success.
                At Runtime disposal a cleanup is a services finalizer or the interrupt cleanup of
                any fiber the close interrupts (a call, a store write, a runPromise Effect), and
                the close waits for each stage (fibers, then services) at most the disposal
                bound: a stage still running then is a failed cleanup too. Each failure is also
                reported as an Issue CleanupFailed, which carries no Cause
                (@spec.Diagnostics.R9), and every call to dispose gets the same rejection; a
                forget's StorageFailure is kept beside it. At an actor's disposal, a read whose
                interrupt cleanup dies quarantines its ref: every later ensure throws
                CleanupFailed with that Cause until a disposeActor of the ref lifts it. Decision
                (user, 2026-11-19): "Q8 A"; the rest proposed (the T99 lead, 2026-11-19).

                Runtime disposal waits for its writes within the same bound, measured from the call to
                dispose. Its first write is issued as soon as disposal's start cells have run, once
                any batch still out has answered (@spec.WriteAhead.R12), and holds every record dirty
                at that moment, the start cells' NotSent { Disposed } rows and Held heads included.
                Each later step that changes a record within the bound (a call settling) has its
                changes captured in one more batch, one batch out at a time; the disposal's write is the last
                batch it issued, a ticket the core holds while Disposing. The disposal ends when
                nothing is on the wire and that write has landed. That write refused, or still
                unanswered at the bound, reports StorageFailure and the disposal ends. An earlier
                batch refused once a later one was issued reports nothing: its records go with that
                later write, so ending on it would cut the write that carries them. At the bound
                the disposal ends in the same step, so the endings made there are not written: a
                reload hears unknown { Restored } for such a head, once. The bound is the core's:
                the host sends the disposal, waits for the life to read Disposed, then closes its
                Scope. The terminal snapshot keeps the last committed state and memory; disposal
                runs no machine event. dispose({ forget: true }) is @spec.Restore.R10.
                Decision (agent: the T55 lead, 2026-11-16): the disposal keeps writing within the
                bound, replacing the orchestrator's one try (2026-11-12). Why: one try turned a call
                that settled within the bound into unknown Restored at reload, a known ending lost.
                Reverse: issue one batch at the start and write nothing after it.

    R24  Isolation and identity exhaustion
        source  @plan.Runtime.O7; @plan.Runtime.C2.
        must    Runtimes share no mutable state: actors, store, services, storage, clock or
                evidence. A handle from one Runtime is rejected by another. Incarnation ids and
                request generations never repeat within a Runtime or across restore; Attempt ids
                follow @spec.WriteLanes.R5. No IdentityExhausted code exists: counters are numbers per
                open that would need 2^53 mints, and every id carries the session seed, so a restore
                repeats none.

    R25  A defect stops the Runtime
        source  @plan.Runtime.O3.
        must    A defect inside a step ends the Runtime's life Stopped, a final Life: no input runs
                again, so the step's half-written world is never stepped. The defect is the
                Runtime's failure: `ready()` fails with it when the boot step failed, and
                `dispose()` finishes and fails with it. A throw from the admit hook is also given
                back to the caller whose call ran it, as a FlowError Defect, and `dispose()` still
                fails with it; a throw while a step's work is performed is not given back, as a
                step's defect is not. Every later public call is refused
                RuntimeDisposed, every snapshot reads lifecycle stopped, and nothing more is written,
                so a reload restores the last landed state. The Runtime's Scope closes. Decision
                (the user, 2026-11-17, Q21 A).

    R26  unsettledWrites
        source  @plan.Runtime.O6.
        must    runtime.unsettledWrites() lists, by identity, exactly the non-Idle lanes, each
                identity saying whether its lanes are bound (it has an incarnation or a decoded actor
                record) or unbound (neither, R20 and R21, @plan.Runtime.O6), for a host's beforeunload. An unbound lane 
                is listed at
                every boot until an adopting ensure or its owner's cancel ends it. A Story's
                checkpoint reads it as `unsettled`. Proposed (the T99 lead, 2026-11-19): one entry
                per identity, `{ actor, bound, lanes }`, each lane naming its operation.

    R27  runPromise
        source  @plan.Runtime.O2; @plan.Runtime.O6; @plan.Diagnostics.O3.
        must    runtime.runPromise(effect, { signal }) runs an Effect with the app's installed
                services in the Runtime's Scope. Admission is `admit`'s: before ready it rejects
                RuntimeNotReady, once disposal starts RuntimeDisposed, and it runs nothing then.
                A failure, defect or interruption rejects with a FlowError coded RunFailed that
                keeps the whole Cause (@spec.Diagnostics.R8); an aborted signal interrupts the
                Effect, and a Runtime disposal interrupts it too. Decision (user, 2026-11-19):
                "Q7 A".

open
    Q1  Executable checks are not built.
        outcome  Each test below is written, when its slice is built, as the cheapest check that fully covers
                 it (a compile-time test, a run rule applied to every Story run, a Story test or a pure core
                 test) in `packages/flow-state-v3/tests/`, and each rule gets a planted fault in
                 `tests/faults.ts` that `nub run faults` must catch. Until built, every Requirement's
                 evidence is open.

    Q2  No Story test or planted fault exists yet for RuntimeNotReady, a shared ready() failure, service acquisition 
        failure, ConflictingActorRef, BlockedByDependents, CleanupFailed, RuntimeDisposed, context
        propagation or isolation.
        outcome  The slices write those checks and faults first.

    Q3  Can one services Layer be acquired storage-first (@plan.Runtime.Q1)?
        outcome  If not, R3's order becomes "acquire the whole Layer, then validate"; record it
                 here as a change.

    Q4  Is a chain of sends or ensures started from a snapshots listener ever stopped (R13 says a spin is never 
        stopped)? The prototype drops, as evidence, a listener-originated send or ensure once the chain passes
        64, and reports TurnStorm once (prototypes/round-14/driver.ts, `notifyChain`).
        Case: a listener that sends one event on every snapshot.
        outcome  Either a send past the loop guard in that chain is dropped with TurnStorm, or every send runs
                 and TurnStorm only reports. The first loses an event the caller sent; decide with the user, then
                 fix R13. With no queue caps (@plan.Pending.D24), every send runs today.

model
    Use = an attached consumer, a live snapshots subscription, a bound context consumer, or a
        dehydrate or Hydrate hold.

    WorkInFlight = an InFlight write lane, a read started in a turn handling the ending of work in
        flight (transitively, R7), or an ending owed at ready (the identity's row list is not empty at
        the boot). A Kept row (R15) that has had its try is not work in flight.

    Free = no Use and no WorkInFlight.

    Incarnation = one life of an identity in a Runtime, with a minted id.

    Unbound = a lane whose identity has no decoded actor record and no incarnation.

    Start = the step in which an incarnation begins, whatever began it: a fresh creation, a reload (the boot woke
        the identity), a return (R9) or an ensure. It is the one point where owed rows are delivered (R10): every
        Start runs the ledger's start (@spec.WriteLanes `algorithm`) once, and with no row and no Held head it
        delivers nothing.

    Adoption = a Start that finds lanes or owed rows of its identity that no incarnation held (an ensure after
        disposeActor, a reset or a quarantine; an equal local identity). It is a Start like any other.

    Life = the Runtime's life, one value in the core: Inert (constructed, nothing started), Booting, Open, Failed
        (the bootstrap failed), Disposing (nothing new is invoked; calls on the wire and the disposal's write, held
        as a ticket, wait for the bound), Disposed, or Stopped (a step failed with a defect; final, R25).

    Verdict = admit(life, input): Run, Drop (the input changes nothing) or Reject with RuntimeNotReady or
        RuntimeDisposed.

invariants
    I1  construct() performs no I/O, acquires no service and creates no actor. [@R1]

    I2  Each service is acquired at most once per Runtime. [@R1]

    I3  Every caller of ready() before disposal starts observes the same Exit, and the bootstrap runs at most once; a 
        ready() called after disposal starts rejects RuntimeDisposed. [@R2]

    I4  No app service is acquired before persisted data is read and validated. [@R3]

    I5  Before ready succeeds, no handle exists except React's pre-attach handles, and ensureActor and createActor 
        reject. [@R4]

    I6  After a failed bootstrap, every acquired resource is released, in reverse order, and no actor or evidence 
        exists. [@R4]

    I7  identityKey(ref) depends only on the machine and the input fields' encoded strings, not on field order. [@R5]

    I8  At most one shared actor exists per identity per Runtime. [@R5, @R6]

    I9  A failed ensure leaves the Runtime as it was before the ensure. [@R6]

    I10  An actor ends only when Free has held for the whole grace on the Runtime Clock. [@R7, @R8]

    I12  At an end, a persisted actor's record equals its last committed state, and every lane it had remains with the 
         Runtime. [@R8]

    I13  Each incarnation id is fresh: never equal to an earlier incarnation's id, across restore too. [@R9, @R24]

    I14  A returning incarnation receives, in order: its starting turn, its owed rows in the order they were owed (the 
         Interrupted endings its end parked among them), each Held head's unknown { Restored }, at most one onContext
        wave, then the triggering event. [@R9, @R10]

    I15  An incarnation binds only lanes of its own identity and subject path. [@R10]

    I17  No schedule firing, issue or send created by an ended incarnation reaches a later one. [@R10]

    I19  Within one actor, events are admitted in mailbox order and one at a time. [@R12]

    I20  At most `RuntimeDefaults.loopGuard` events sent by turns run as follow-ups of one admitted event. [@R13]

    I21  An actor with pending mail is served within one rotation of the other actors with mail. [@R13]

    I22  An external send of a valid event to a live actor is admitted and runs its turn once, however many events wait 
         in its mailbox. [@R14]

    I23  No ending, schedule firing or context update is dropped. [@R14]

    I24  A refused ending is redelivered once after its first refusal and then at most once per start, and is never 
         lost: its row stands until it is heard, let go by a cancel, released, closed by R21's forget, or closed with
        the one life it was owed to (R15's stranded read, also dropped at a boot). A second kept ending never
        replaces a first. [@R15]

    I25  A send never creates an actor and never counts as a use; its outcome follows R16's table. [@R16]

    I26  Every published cut pairs each actor snapshot with the store revision of the same commit. [@R17]

    I27  Per wave, each consumer gets at most one context update, computed from complete provider snapshots of one 
         revision each. [@R19]

    I28  A consumer's slot is bound to one provider for the consumer's lifetime, and the provider graph is acyclic. 
         [@R18]

    I29  After disposeActor, every non-Idle lane still exists. After Runtime disposal, every Held head and every owed 
         ending still exists: a never-sent head and a head whose call ended definitely are gone, and their endings
        are owed. [@R20, @R22]

    I30  After disposal starts, no commit or read is invoked. [@R22]

    I31  Among the endings of one lane delivered or parked together, the hold-leaving ending is last. [@R22]

    I32  forget never removes a Held lane whose operation exists. [@R21]

    I33  A failed cleanup never reports success, and the full Cause is retained. [@R23]

    I34  Writes through Runtime A never change Runtime B's store, lanes, storage or snapshots, and B rejects A's 
         handles. [@R24]

    I35  During Runtime disposal, a call on the wire at its start is never cut short within the disposal bound: one 
         that settles before the bound ends by its own result and the disposal does not end before it settles,
        unless a refusal of the disposal's write ends it first (R23, I43); one still unsettled at the bound ends
        unknown { Disposed }. Decision (user, 2026-11-10): "Q1 A", the bound gets its own Invariant. [@R22, @R23]

    I36  A head whose call ends definitely during Runtime disposal, within the bound, leaves no hold once the 
         disposal's write lands: the next boot restores none for it and delivers its own ending. An Attempt ended at
        the bound restores as unknown { Restored } (R23). Decision (user, 2026-11-10): "Q1 A"; an unknown keeping its
        head Held is I29's. [@R22, @R23]

    I37  A shared actor that stays Free for the whole grace on the Runtime Clock has ended by the grace's end, unless 
         its record cannot encode (R8). [@R8]

    I38  Every commit not yet sent when Runtime disposal starts (queued, or a head waiting for its acknowledgement or 
         to be invoked) ends NotSent { Disposed } before the disposal ends; when the disposal's write lands, that 
         ending is
        delivered once to the identity's next incarnation, and a refusal of the disposal's write reports StorageFailure
        (R23).
        Decision (agent, 2026-11-11): ruling CQ6 with audit gap G5, as in R22. [@R22, @R23]

    I39  A persisted value-named machine's identity version changes exactly when an input field is added, removed or 
         renamed, or a field's Schema changes on its type or encoded side; other annotations never change it. [@R11]

    I40  An owed row is delivered only from the mailbox of its identity's live incarnation, and it leaves Waiting or 
         Kept only by a start of its identity or a close: a boot queues nothing and parks nothing. [@R10]

    I41  When an incarnation ends, at disposeActor, and for every identity at Runtime disposal, each of the identity's 
         Queued and Retrying rows goes Waiting, a row with no lane included, and each row owed to that incarnation
        alone closes as evidence; none is dropped. [@R8, @R20, @R22]

    I43  The disposal bound runs from the first call to dispose (the start I35 counts from) and covers its writes: a 
         disposal's write still unanswered at the bound, or refused, reports StorageFailure and the disposal ends then,
        however late within the bound a call on the wire settled; a later call to dispose restarts nothing. [@R23]

    I44  The disposal's first write holds every record dirty when its start cells have run, and every change made 
         within the bound is written in a later batch; a reload after the disposal's write landed restores exactly
        the state before the bound. [@R23]

    I45  unsettledWrites names an identity exactly when it has a non-Idle lane, as bound exactly when it has an 
         incarnation or a decoded actor record. [@R26]

    I46  runPromise runs its Effect only on `admit`'s Run, and each rejection is a FlowError keeping the whole Cause. 
         [@R27]

owner Life
    lifetime  one Runtime. Design, agreed by the user, 2026-11-12 (@task.V3.T55, consult round 3, Part 2); I42
              moved here from `invariants`, id kept.
    state     Life and the `admit` table (`algorithm`)

    invariants
        I42  `admit` gives every (Life, input) pair exactly one verdict, and admission follows it alone: no host flag 
             decides whether an input runs. [@R4, @R22]

algorithm
    Design, agreed by the user, 2026-11-12 (@task.V3.T55, consult round 3, Part 2); moved here from `model`. The
        cells round 3 left unstated are the agent's: Decision (agent: the orchestrator, 2026-11-12): BootFailed,
        Stored and Refused while Disposing, Send while Booting. Why: the table must be total. Reverse: drop those
        cells and leave the pairs impossible. A line here that a Requirement cites is binding, and a clash between
        the two is a Spec bug.

    admit(life, input) -> Verdict: one total table, every (Life, input) pair has exactly one verdict. Life moves only
        on a Run: Start takes Inert to Booting, Boot takes Booting to Open, BootFailed takes Booting to Failed,
        DisposeRuntime takes Open to Disposing and Inert, Booting or Failed straight to Disposed, and Disposing
        goes Disposed when no call is on the wire and the disposal's write has landed, when that write is refused
        (StorageFailure, R23), or at the bound. A step that throws a defect leaves any life Stopped (R25); Stopped
        drops every input but the public calls, which it rejects RuntimeDisposed, naming the stop; dispose()'s
        DisposeRuntime drops too, since dispose() fails with the defect (R25). By
        input:
        - Start (the first ready): Inert runs; Booting, Open and Failed drop (the caller shares the bootstrap's
            Exit); Disposing and Disposed reject RuntimeDisposed.
        - Boot: Booting runs; Disposing and Disposed reject RuntimeDisposed, so ready's waiters fail with
            RuntimeDisposed (R2); elsewhere drops.
        - BootFailed: Booting runs; elsewhere drops.
        - Ensure, Create and Send: Open runs; Inert, Booting and Failed reject RuntimeNotReady (R4's boot queue for a
            send, when @task.V3.T9 builds it, makes Send run while Booting for a persisted target only; a Send
            input names its target, so its machine's persistence is part of the input and the table stays a
            function of (life, input)); Disposing and Disposed reject RuntimeDisposed.
        - Forget: Open runs; Inert, Booting and Failed reject RuntimeNotReady; Disposing and Disposed reject
            RuntimeDisposed, so a caller never thinks a forget took effect.
        - DisposeActor: Open runs; Inert, Booting and Failed reject RuntimeNotReady; Disposing and Disposed drop
            (disposal is idempotent, R20).
        - Release: Open runs; elsewhere drops.
        - DisposeRuntime: Inert, Booting, Open and Failed run; Disposing and Disposed drop (idempotent).
        - Settled and Fired: Open and Disposing run; elsewhere drops (a late result is ignored).
        - Stored and Refused: Open and Disposing run (while Disposing they answer the disposal's write; an answer
            for a ticket nothing awaits changes nothing); elsewhere drops.
        - Capture: Open and Disposing run (it reads the World and writes nothing but its batch,
            @spec.WriteAhead.R10); elsewhere drops, so a stopped Runtime writes nothing more.
        - Run (runPromise, R27): the call row, Open runs; proposed, and its Booting cell waits on the user's
            read of runPromise. The core changes nothing for it.
        - Closed (the host closed the Scope after the disposal, with its count of failed cleanups): Disposed
            runs, emitting one Issue CleanupFailed per failure (R23); elsewhere drops. Proposed (the T99 lead,
            2026-11-19).

composition
    flow
        Design note, proved by the prototype. The core step is a pure function of the world, one
        input and an environment (time, ids); it returns the next world, at most one publication and
        commands (packages/flow-state-v3/prototypes/round-14/step.ts).

        One impure driver owns the loop and the inbox, and turns commands into Effects
        (round-14/driver.ts). In production (src/host/) the inbox stays one synchronous loop,
        since Inspection O3 delivers at the end of each step; the fibers are a FiberMap owned by
        the Runtime's one Scope, which also holds the services Layer, so closing it interrupts
        every call and releases every service. Dispose runs the core's disposal (its bound
        included), then interrupts and awaits every fiber, then closes the Scope, so an interrupt
        there settles into a closed core and its cleanup runs on live services (R22, R23).

        Owed rows. An incarnation's end, `disposeActor` and Runtime disposal call the ledger's
        `suspend`; reload, return and adoption call its `start`; forget closes the identity's
        rows (@spec.WriteLanes `algorithm`). The boot only decodes, sorts and picks whom to wake.

realization typescript
    Design, agreed by the user, 2026-11-12 (@task.V3.T55, consult round 3, Part 2); moved here from `composition`.
    `Life` and `admit` live in `src/core/life.ts`; `admit` is one total table, as `cells.ts` is for lanes, and the
        step runs an input only on its Run. The host decides by the life only through `admit` and `isDisposed`;
        inspection reports its name through `lifecycleOf`, which decides nothing, and no host module reads
        `life._tag` itself.
    The host keeps what needs Effect: the Scope, the services Layer and one Deferred that shares the bootstrap's
        Exit. It runs commands, turns a fiber's Exit into a call result, decodes a sent event at the boundary, calls
        `admit` and throws the FlowError a Reject names. `dispose` sends DisposeRuntime, waits for the step's `life`
        to read Disposed, then closes the Scope. The persistence edge answers a ticket with nothing left to write as
        landed.
    The World is opaque outside the core, so the host reads no World field and builds no report: the Runtime's life
        reports through its act (RuntimeDisposed, and the disposal's StorageFailure). The capture window stays in
        the host (T54's decision 4).
    Admission is decided in `src/core/life.ts`; the grace and the send table in `src/core/step.ts`, so a planted
        fault for any of them edits that one file (`tests/faults.ts`).

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3]
        open_by      [@Q1, @Q2]

    @R3
        enforced_by  [@I4]
        open_by      [@Q1, @Q3]

    @R4
        enforced_by  [@I5, @I6, @I42]
        open_by      [@Q1, @Q2]

    @R5
        enforced_by  [@I7, @I8]
        open_by      [@Q1, @Q2]

    @R6
        enforced_by  [@I8, @I9]
        open_by      [@Q1]

    @R7
        enforced_by  [@I10]
        open_by      [@Q1]

    @R8
        enforced_by  [@I10, @I12, @I37, @I41]
        open_by      [@Q1]

    @R9
        enforced_by  [@I13, @I14]
        open_by      [@Q1]

    @R10
        enforced_by  [@I14, @I15, @I17, @I40]
        open_by      [@Q1]

    @R11
        enforced_by  [@I39]
        open_by      [@Q1]

    @R12
        enforced_by  [@I19]
        open_by      [@Q1]

    @R13
        enforced_by  [@I20, @I21]
        open_by      [@Q1, @Q4]

    @R14
        enforced_by  [@I22, @I23]
        open_by      [@Q1, @Q2]

    @R15
        enforced_by  [@I24]
        open_by      [@Q1]

    @R16
        enforced_by  [@I25]
        open_by      [@Q1]

    @R17
        enforced_by  [@I26]
        open_by      [@Q1]

    @R18
        enforced_by  [@I28]
        open_by      [@Q1, @Q2]

    @R19
        enforced_by  [@I27]
        open_by      [@Q1, @Q2]

    @R20
        enforced_by  [@I29, @I41]
        open_by      [@Q1, @Q2]

    @R21
        enforced_by  [@I32]
        open_by      [@Q1]

    @R22
        enforced_by  [@I29, @I30, @I31, @I35, @I36, @I38, @I41, @I42]
        open_by      [@Q1]

    @R23
        enforced_by  [@I33, @I43, @I44]
        open_by      [@Q1, @Q2]

    @R24
        enforced_by  [@I13, @I34]
        open_by      [@Q1, @Q2]

    @R25
        enforced_by  [@I42]
        open_by      [@Q1]

    @R26
        enforced_by  [@I45]
        open_by      [@Q1]

    @R27
        enforced_by  [@I46]
        open_by      [@Q1]

tests
    T1  Setup and readiness: construct with spies (no I/O); two concurrent ready calls and a third after a failing 
        service share one Exit; interrupting one waiter leaves the other waiting; ensure before ready rejects
            RuntimeNotReady; acquired services release in reverse on failure. No test yet (Q2). [@I1, @I2, @I3, 
                @I5,
            @I6]
    T2  Missing service refused by name at boot. [@I2]
    T3  Boot order and the boot send queue: restored endings run before live input; a send before boot waits (once 
        @task.V3.T9 builds the queue; until then it rejects RuntimeNotReady); a dispose at ready keeps boot mail.
            Planted faults: a boot order that runs live input first; a send ahead of restore; mail lost at dispose.
            [@I4, @I14]
    T4  Identity: a value names the actor and is its input; an equal value adopts the lane; a field reorder names the 
        same actor; refs with different context reject.
            Planted fault: an identity that is not the input. [@I7, @I8]
    T5  Uses and the grace on a controlled clock: two uses, one ending keeps it; ensure alone keeps nothing; mail does 
        not restart the grace; past the grace it ends.
            Planted faults: uses not counted; ensure counted as a use; no grace; a grace that never ends; mail
            counted as work. [@I10]
    T6  Work in flight: an InFlight lane and a read started handling such work's ending keep the actor; a Held lane and 
        a kept ending do not.
            Planted faults: in-flight work that keeps nothing; a Held lane that keeps; reads that keep nothing or
            all keep. [@I10]
    T7  The end and the return: the record is kept at the end and dropped by dispose; an unencodable record delays the 
        end; the return delivers in R9's order and a restored head is heard once per incarnation.
            Planted faults: an end that drops the record; a dispose that keeps it; an end that ignores the codec; a
            head heard once per runtime; an undecodable record taken as none. [@I12, @I14,
            @spec.WriteLanes.I15]
    T8  Lane adoption and order: parked endings in saved order; a local remount in the grace reuses the actor. Planted 
        faults: parked endings in reverse order; a remount in the grace that is fresh; no remount.
            [@I15, @I17]
    T9  Versions: an added field, an encoded-side change and a type-side change over the same encoded side are each a 
        new version; a description change is not.
            Planted faults: an old version restored; a version by field names only; a version by printed name.
            [@I39]
    T10  Mailboxes and rotation: FIFO within an actor; a spin on one actor does not delay another's ending; 20,000 
         sends to one actor in one burst are each admitted and served; follow-ups past the loop guard are refused,
             once the send action is built. Planted faults: a rotation that does not rotate; a mailbox that is not FIFO;
                 a mailbox that refuses sends past a size (`mailbox-capped`). [@I19, @I20, @I21, @I22]
    T11  Refused deliveries: a refused ending is kept, redelivered once, and heard at the next Start. Planted faults: a 
         refusal reported as a denial; a refusal that keeps asks; a refused ending not redelivered.
             [@I23, @I24]
    T12  The send table, one row per target state. Planted faults: a send that does not restore; a send to an absent 
         actor that is silent; a handle that is
             not the identity; a disposed ending taken as evidence. [@I25]
    T13  Complete cuts: a drain's two turns are one cut. Planted faults: a cut that splits a turn; a cut in the middle 
         of a drain. [@I26]
    T14  Context: a diamond and a chain each give one update per wave from latest values; a throwing selector is 
         isolated; a cycle and a missing provider reject at admission. No test yet (Q2). [@I27, @I28]
    T15  disposeActor and forget: unbound lanes listed until adopted; forget keeps a held lane and turns parked endings 
         into evidence.
             Planted faults: a dispose that drops lanes; a forget that does nothing; a forget that drops the queue;
             a forget that marks a held lane. [@I29, @I32]
    T16  Runtime disposal on a controlled clock: a call settling within the disposal bound is parked; past it unknown { 
         Disposed }, head kept Held; a definite ending drops the head; the queued NotSent { Disposed } precede the 
         head's unknown;
             nothing is invoked after the start; disposal ends only when no call is on the wire, or at the bound.
             Planted faults: a disposal that interrupts the wire; a call settled in the bound that stays held; a
             definite ending parked before the queued commits' NotSent { Disposed }; a capture past the bound that 
                 stays in flight; a wait on the
             wire with no bound.
             [@I29, @I30, @I31, @I35, @I36]
    T17  Cleanup failure and isolation: a failing finalizer rejects CleanupFailed and later ensures repeat it; two 
         Runtimes from one setup share nothing and reject each other's handles; a counter at its limit refuses
             IdentityExhausted. No test yet (Q2). [@I13, @I33, @I34]
    T18  Failed admission leaves nothing: an ensure refused for a missing provider or an invalid input leaves no actor, 
         lane, schedule or evidence beyond the failure, and a later ensure succeeds. No planted fault yet; its
             slice
                 plants one that leaves a half-admitted actor. [@I9]
    T19  Free actors end: on a controlled clock, an actor whose last use detaches with no work in flight has ended at 
         exactly the grace, and one whose record cannot encode waits. Planted fault: an actor that never ends
             while Free. [@I37]
    T20  Never-sent commits at disposal: a queued commit and a head waiting for its acknowledgement when disposal 
         starts each end NotSent { Disposed } before it ends, and the next incarnation after a reload hears each once.
             Planted fault: a disposal that skips the never-sent commits. [@I38]
    T21  One delivery point: a reload, a return and an adoption of one identity with the same owed rows and Held heads 
         each deliver the same endings in the same order; after a boot and before any start no ending is in a
             mailbox. [@I14, @I40]
    T22  Suspended rows: endings in the mailbox, a declined commit's with no lane among them, when an incarnation ends, 
         at disposeActor and at Runtime disposal are each heard once by the identity's next incarnation. Planted
             fault: a suspend that skips rows with no lane. [@I41]
    T23  Disposal by R22's reading: after Runtime disposal a never-sent head has no lane and its NotSent { Disposed } 
         is heard once after a reload; a head held from Recapturing at disposal is saved Held, so the boot does not
             wake its identity. [@I29, @I38]
    T24  The admit table: every (Life, input) cell with its expected verdict; ready after dispose rejects 
         RuntimeDisposed; a dispose while Booting makes ready fail with RuntimeDisposed; a forget while Booting
             rejects RuntimeNotReady and the record survives the next boot. [@I3, @I42]
    T25  The bound from the call: a call on the wire answers 3 s after the call to dispose and the disposal's write 
         never answers; StorageFailure is reported at the disposal bound from that call. The same with a write that is 
         refused at
             1 s. [@I43]
    T26  The disposal's writes: dispose with one head Acknowledging and one on the wire; the first write holds the 
         NotSent { Disposed } row and the lane record of the head on the wire, and a reload hears that NotSent
             { Disposed } and the head's own ending if it answered within the bound, unknown { Restored } if it was
             still on the wire at the bound. Planted fault: a disposal that writes only at its start. [@I44, @I36]
