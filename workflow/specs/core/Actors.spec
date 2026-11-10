spec Actors
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      runtimeSetup, Runtime, actorRef, ensureActor, createActor, send, disposeActor,
              forget, dispose, unsettledWrites
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
                nonempty string that machines, operations and conditions never read. services is a 
                Layer typed by the machines' R; a missing service is a type error, and the boot 
                refuses, by machine, operation and service, an operation whose service it lacks. 
                Each service is acquired once per Runtime.

    R2  One readiness
        source  @plan.Runtime.O2.
        must    ready() is the one readiness Effect. The first call starts the bootstrap; 
                concurrent and later callers share its result, a failure included, with no implicit 
                retry. Interrupting one waiter interrupts only that wait.

    R3  Bootstrap order
        source  @plan.Runtime.O2.
        must    With persistence: claim scope ownership, acquire storage, then read and validate 
                persisted data before any app service starts. Then acquire the remaining services, 
                install the restored identities owed an ending (providers before consumers), keep 
                every other record a record, establish silent context baselines, and open the 
                Runtime to callers.

    R4  Bootstrap failure and early calls
        source  @plan.Runtime.O2.
        must    A service acquisition failure fails ready() with FlowError and its Cause, releases
                what was acquired in reverse order, and leaves no actor or evidence. Before ready
                succeeds, `ensureActor` and `createActor` reject with RuntimeNotReady.

                A send to a persisted actor before boot queues until boot within the boot bound;
                past it, or on a failed read, it reports StorageFailure, the Runtime runs without
                persistence and the queue is flushed. Disposing during bootstrap cancels it and
                closes admission; a service acquired late is released and no handle is exposed.

    R5  Identity
        source  @plan.Runtime.O3.
        must    An actor is its machine plus its input. A value-named machine is named by its input 
                fields, encoded with their Schemas in field-name order as strings, and is ensured 
                without input; a machine with no input is a singleton named by a literal string. 
                Two refs of one identity with different context reject with ConflictingActorRef and 
                change nothing. A local actor is (machine, input by Equal.equals).

    R6  ensureActor and createActor
        source  @plan.Runtime.O3.
        must    ensureActor(ref) returns the one shared actor for that identity, creating it from 
                its input or restoring it from the Runtime's copy of its record; a failed admission 
                leaves nothing behind. createActor always creates a new local actor that cannot 
                persist or be a send target and lives until disposed. A handle follows the 
                identity, not the incarnation.

    R7  Uses and work in flight
        source  @plan.Runtime.O3.
        must    A use is an attached consumer, a live snapshots subscription, a bound context 
                consumer, or Flow's hold for dehydrate and Hydrate; uses count per identity. 
                ensureActor alone, getSnapshot, lookups, views and sends are not uses. Work in 
                flight is an InFlight write lane, a read started in a turn handling the ending of 
                work in flight (transitively), and an ending owed at ready. Nothing else keeps an 
                actor alive.

    R8  The end
        source  @plan.Runtime.O3.
        must    A shared actor free of uses and work in flight for the grace (100 ms on the Runtime
                Clock) ends: a persisted actor's record is encoded in that step (the end waits while
                it cannot encode), its lanes move to the Runtime unbound, its schedules are
                cancelled, its placements and unkept reads stop, and each stopped read parks failure
                { Interrupted } for the identity.

                EndedWithWork is warned once per machine and kind of work. An ensure while it ends
                binds the next incarnation.

    R9  The return
        source  @plan.Runtime.O3.
        must    A persisted identity reached by an ensure, a subscription or a send returns as a new
                incarnation with a newly minted id, restored from the Runtime's copy. It receives
                its starting turn, its lanes' deliveries, the Interrupted endings its end parked,
                one `onContext` wave if a provider's selection changed, then the event that restored
                it.

                A non-persisted identity starts fresh. An ensure over an undecodable record starts
                fresh, reports RecordUndecodable (proposed name) and adopts the identity's lanes. A
                local actor remounted within its grace reuses that actor; a new incarnation of an
                equal local identity starting while an older one is kept only by work in flight
                disposes the older one and adopts its lanes.

    R10  Lanes follow identities
        source  @plan.Runtime.O3.
        must    A starting incarnation adopts only its own identity's unbound lanes, oldest first
                for equal local identities, and receives before any external event: the parked
                endings in saved order, then each Held head's unknown { Restored } once per
                incarnation, then an in-flight Attempt's ending when it lands.

                A lane binds to the live incarnation with its recorded subject path; with none its
                ending is parked for the path. No schedule, issue or send of an old incarnation
                reaches a new one.

    R11  Identity versions
        source  @plan.Runtime.O3.
        must    For a persisted value-named machine, adding, removing or renaming an input field, or
                changing a field's Schema on its type or encoded side, is a new version; other
                annotations are ignored (a custom filter with no representation and a transformation
                with unchanged sides are not seen: stated limits).

                Flow's version encodings carry a format tag, and an older format is read by
                recomputing the current Schema in that format (the runner's rulings). A saved record
                of another version is an old-version record; the boot handles it under the Restore
                Spec's R6.

    R12  Mailboxes
        source  @plan.Runtime.O4.
        must    Each actor processes one event at a time from one FIFO mailbox in admission order; 
                sends, call endings, stream deliveries, timer firings and onContext events queue 
                together. A call's ending is queued at settlement and mapped at admission.

    R13  Order across actors
        source  @plan.Runtime.O4.
        must    Follow-ups run first, up to 64 per admitted event; the turn that would add the 65th
                is refused, with an issue naming the chain (check's denial code for it is
                InvalidTurn). Otherwise one event runs from the next actor in rotation, oldest
                first.

                A send to an idle Runtime runs its turn before send returns; during a turn it
                queues. Slices decide when work runs, never what. A spin is never stopped; TurnStorm
                is evidence and decides nothing.

    R14  Admission bounds
        source  @plan.Runtime.O4.
        must    Each actor queues at most 1,024 pending events; an external send beyond that throws 
                AdmissionOverloaded and changes nothing. An internal, unknown or invalid event 
                throws InvalidEvent and starts no turn. Endings, schedule firings and context 
                updates are never dropped by this bound.

    R15  Refused deliveries are kept
        source  @plan.Runtime.O4.
        must    An ending whose turn is refused, or whose mapper throws at admission, is delivered
                once more after the mail already queued; the second refusal is final and its issue
                names the cause.

                A sent write's twice-refused ending stays parked on its lane, blocking its key until
                heard, cancelled, released or a local life ends; a read's answer is stranded until
                that life asks again, ends or a boot. A kept ending gets one try per boot or
                adoption.

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
                - a persisted actor during boot queues;
                - an actor being disposed drops with NoRecord;
                - a full target is AdmissionOverloaded.

                Reasons go to the sender and never roll back its turn. Several sends keep their
                order.

    R17  Complete cuts
        source  @plan.Runtime.O4.
        must    Every publication is one complete cut: no reader sees an actor's new snapshot with 
                old store data or the reverse. A new snapshots subscriber gets current truth first; 
                slow subscribers may skip intermediates. Snapshots expose no revision or raw Cause. 
                A subscription completes when its subscriber stops or after the terminal snapshot 
                of disposeActor, forget or Runtime disposal.

    R18  Context binding
        source  @plan.Runtime.O5.
        must    Provider.select reads one complete provider snapshot. A slot binds to one provider 
                for the consumer's lifetime; a bound consumer is a use of its provider. A cycle 
                (ContextCycle), a missing provider (MissingContextProvider) or an incompatible one 
                rejects at admission. Baselines are silent at admission, restore, adoption and 
                hydration.

    R19  Context waves
        source  @plan.Runtime.O5.
        must    When a provider changes, each affected consumer receives at most one update per
                wave, from the latest complete provider snapshots, never mixing new and stale values
                of one cause (diamonds included). Equal slots cause no update.

                A context update keeps its FIFO place. A throwing consumer selector keeps the last
                valid context, publishes one issue and retries only on a newer provider snapshot.
                Capture never observes a half-propagated wave.

    R20  disposeActor
        source  @plan.Runtime.O6.
        must    disposeActor removes the actor's record for every user, keeps its non-Idle lanes as 
                unbound lane records listed and reported at each boot until an adopting ensure or 
                its owner's cancel, and flushes the removal at once. It stops a send's restore only 
                once the removal is acknowledged. Disposing a provider with bound consumers rejects 
                with BlockedByDependents naming them. Actor and Runtime disposal are idempotent.

    R21  forget
        source  @plan.Runtime.O6.
        must    forget removes the identity's record so the next ensure starts fresh; its parked 
                and boot-queued endings become evidence. It drops no hold: a Held lane stays 
                unbound until its owner's cancel or an adopting ensure; a hold whose operation no 
                longer exists is dropped with HoldForgotten (proposed name). forget of a live actor 
                disposes it first.

    R22  Runtime disposal
        source  @plan.Runtime.O6.
        must    Runtime disposal closes admission first (later ready, ensureActor, createActor and
                runPromise reject RuntimeDisposed), then disposes consumers before providers. Queued
                events that have not started are dropped. Schedules cancel, placements stop and
                sessions release within 5 s (ReleaseOverdue).

                From its start nothing new is invoked and no lane is dropped: a never-sent queued
                commit ends NotSent { Disposed }; a call settling within 5 s is parked; past the
                bound an Attempt on the wire ends unknown { Disposed } and its late result is
                ignored. Where a lane's endings are delivered or parked together, the ending that
                leaves a hold comes last. An unknown keeps its head Held on disk; a definite ending
                drops it.

    R23  Disposal failure and the last write
        source  @plan.Runtime.O6.
        must    A cleanup failure rejects dispose with CleanupFailed, quarantines the ref (later
                ensures report the same failure) and keeps the full Cause; it is never success.

                Runtime disposal waits for the final persistence write within the same 5 s; a write
                still pending reports StorageFailure. The terminal snapshot keeps the last committed
                state and memory; disposal runs no machine event. dispose({ forget: true }) is the
                Restore Spec's R10.

    R24  Isolation and identity exhaustion
        source  @plan.Runtime.O7; @plan.Runtime.C2.
        must    Runtimes share no mutable state: actors, store, services, storage, clock or 
                evidence. A handle from one Runtime is rejected by another. Incarnation ids and 
                request generations never repeat within a Runtime or across restore; Attempt ids 
                follow the WriteLanes Spec's R5. Exhausting a counter refuses new work with 
                IdentityExhausted before any change.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  The prototype has no case or wrong runtime for RuntimeNotReady, a shared ready()failure, service acquisition 
        failure, ConflictingActorRef, the 1,024 bound, BlockedByDependents, CleanupFailed, RuntimeDisposed, context 
        propagation or isolation. outcome Phase 3 writes those cases and wrong runtimes first.

    Q3  Can one services Layer be acquired storage-first (@plan.Runtime.Q1)?
        outcome  If not, R3's order becomes "acquire the whole Layer, then validate"; record it 
                 here as a change.

model
    Use = an attached consumer, a live snapshots subscription, a bound context consumer, or a 
        dehydrate or Hydrate hold.

    WorkInFlight = an InFlight write lane, a kept read, or an ending owed at ready.

    Free = no Use and no WorkInFlight.

    Incarnation = one life of an identity in a Runtime, with a minted id.

    Unbound = a lane whose identity has no decoded actor record and no incarnation.

invariants
    I1  construct() performs no I/O, acquires no service and creates no actor. [@R1]

    I2  Each service is acquired at most once per Runtime. [@R1]

    I3  Every caller of ready() observes the same Exit; the bootstrap runs at most once.[@R2]

    I4  No app service is acquired before persisted data is read and validated. [@R3]

    I5  Before ready succeeds, no handle exists except React's pre-attach handles, andensureActor and createActor 
        reject. [@R4]

    I6  After a failed bootstrap, every acquired resource is released, in reverse order, and no actor or evidence 
        exists. [@R4]

    I7  identityKey(ref) depends only on the machine and the input fields' encoded strings, not on field order. [@R5]

    I8  At most one shared actor exists per identity per Runtime. [@R5, @R6]

    I9  A failed ensure leaves the Runtime as it was before the ensure. [@R6]

    I10  An actor ends only when Free has held for the whole grace on the Runtime Clock. [@R7, @R8]

    I11  While an actor has WorkInFlight it is not ended. [@R7]

    I12  At an end, a persisted actor's record equals its last committed state, and every lane it had remains with the 
         Runtime. [@R8]

    I13  Each incarnation id is fresh: never equal to an earlier incarnation's id, across restore too. [@R9, @R24]

    I14  A returning incarnation receives, in order: its starting turn, lane deliveries, parked Interrupted endings, at 
         most one onContext wave, then the triggering event. [@R9, @R10]

    I15  An incarnation binds only lanes of its own identity and subject path. [@R10]

    I16  Each parked ending is delivered at most once per incarnation, and unknown { Restored } at most once per Held 
         head per incarnation. [@R10]

    I17  No schedule firing, issue or send created by an ended incarnation reaches a later one. [@R10]

    I18  A record of another identity version is never restored as the current one. [@R11]

    I19  Within one actor, events are admitted in mailbox order and one at a time. [@R12]

    I20  At most 64 follow-ups run per admitted event. [@R13]

    I21  An actor with pending mail is served within one rotation of the other actors with mail. [@R13]

    I22  Pending external events per actor never exceed 1,024; a refused send changes nothing. [@R14]

    I23  No ending, schedule firing or context update is dropped by admission bounds. [@R14]

    I24  A refused ending is redelivered at most once per boot or adoption, and is never lost. [@R15]

    I25  A send never creates an actor and never counts as a use; its outcome follows R16's table. [@R16]

    I26  Every published cut pairs each actor snapshot with the store revision of the same commit. [@R17]

    I27  Per wave, each consumer gets at most one context update, computed from complete provider snapshots of one 
         revision each. [@R19]

    I28  A consumer's slot is bound to one provider for the consumer's lifetime, and the provider graph is acyclic. 
         [@R18]

    I29  After disposeActor or Runtime disposal, every non-Idle lane still exists. [@R20, @R22]

    I30  After disposal starts, no commit or read is invoked. [@R22]

    I31  Among the endings of one lane delivered or parked together, the hold-leaving ending is last. [@R22]

    I32  forget never removes a Held lane whose operation exists. [@R21]

    I33  A failed cleanup never reports success, and the full Cause is retained. [@R23]

    I34  Two Runtimes share no mutable object, and a handle is accepted only by its own Runtime. [@R24]

    I35  During Runtime disposal, a call on the wire at its start is never cut short within the 5 s bound: one that 
         settles less than 5 s after the start ends by its own result and the disposal does not end before it settles; 
         one still unsettled 5 s after the start ends unknown { Disposed }. Decision (user, 2026-11-10): "Q1 A", the 
         bound gets its own Invariant. [@R22]

    I36  A head whose call ends definitely during Runtime disposal leaves no hold: the next boot restores none for it. 
         Decision (user, 2026-11-10): "Q1 A"; an unknown keeping its head Held is I29's. [@R22]

composition
    flow
        Design note, proved by the prototype. The core step is a pure function of the world, one
        input and an environment (time, ids); it returns the next world, at most one publication and
        commands (packages/flow-state-v3/prototypes/round-14/step.ts).

        One impure driver owns the loop, the inbox and the fibers, and turns commands into Effects
        (round-14/driver.ts). Lifetime, the grace and the send table are decided in the step, so the
        conformance suite's lifetime wrong runtimes all edit step.ts.

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
        enforced_by  [@I5, @I6]
        open_by      [@Q1, @Q2]

    @R5
        enforced_by  [@I7, @I8]
        open_by      [@Q1, @Q2]

    @R6
        enforced_by  [@I8, @I9]
        open_by      [@Q1]

    @R7
        enforced_by  [@I10, @I11]
        open_by      [@Q1]

    @R8
        enforced_by  [@I10, @I12]
        open_by      [@Q1]

    @R9
        enforced_by  [@I13, @I14]
        open_by      [@Q1]

    @R10
        enforced_by  [@I14, @I15, @I16, @I17]
        open_by      [@Q1]

    @R11
        enforced_by  [@I18]
        open_by      [@Q1]

    @R12
        enforced_by  [@I19]
        open_by      [@Q1]

    @R13
        enforced_by  [@I20, @I21]
        open_by      [@Q1]

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
        enforced_by  [@I29]
        open_by      [@Q1, @Q2]

    @R21
        enforced_by  [@I32]
        open_by      [@Q1]

    @R22
        enforced_by  [@I29, @I30, @I31, @I35, @I36]
        open_by      [@Q1]

    @R23
        enforced_by  [@I33]
        open_by      [@Q1, @Q2]

    @R24
        enforced_by  [@I13, @I34]
        open_by      [@Q1, @Q2]

tests
    T1  Setup and readiness: construct with spies (no I/O); two concurrent ready calls and a third after a failing 
        service share one Exit; interrupting one waiter leaves the other waiting; ensure before ready rejects 
        RuntimeNotReady; acquired services release in reverse on failure. No prototype case (Q2). [@I1, @I2, @I3, @I5, 
        @I6]
    T2  Missing service refused by name at boot. Cases `R12-BOOT`, `R12-SERVICES`. [@I2]
    T3  Boot order and the boot send queue: restored endings run before live input; a send before boot waits; a dispose 
        at ready keeps boot mail. Cases `R10-BOOT-ORDER`, `R14-FIX-01`; lies `h.boot-order`, `h.restore-at-send`, 
        `k.send-ahead`; wrong runtime `boot.mail-lost-at-dispose`. [@I4, @I14]
    T4  Identity: a value names the actor and is its input; an equal value adopts the lane; a field reorder names the 
        same actor; refs with different context reject. Case `R14-ID-01`; wrong runtime `id.value-is-not-the-input`. 
        [@I7, @I8]
    T5  Uses and the grace on a controlled clock: two uses, one ending keeps it; ensure alone keeps nothing; mail does 
        not restart the grace; past the grace it ends. Cases `LIFE-02`, `LIFE-04`, `LIFE-08`, `LIFE-24`; wrong runtimes 
        `life.uses-not-counted`, `life.ensure-is-a-use`, `life.no-pending-use`, `life.no-grace`, 
        `life.grace-never-ends`, `life.mail-is-work`. [@I10]
    T6  Work in flight: an InFlight lane and a kept read keep the actor; a Held lane does not. Cases `LIFE-01`, 
        `LIFE-06`, `LIFE-11`, `LIFE-13`; wrong runtimes `life.inflight-keeps-nothing`, `life.held-keeps`, 
        `life.kept-read-keeps-nothing`, `life.every-read-keeps`. [@I11]
    T7  The end and the return: the record is kept at the end and dropped by dispose; an unencodable record delays the 
        end; the return delivers in R9's order and a restored head is heard once per incarnation. Cases `LIFE-12`, 
        `LIFE-17`, `LIFE-22`, `LIFE-23`; wrong runtimes `life.end-drops-record`, `life.dispose-keeps-record`, 
        `life.end-ignores-codec`, `life.restored-once-per-runtime`, `life.undecodable-is-no-record`. [@I12, @I14, @I16]
    T8  Lane adoption and order: parked endings in saved order; a local remount in the grace reuses the actor. Cases 
        `REV9-EDGE`, `LIFE-27`; lie `k.parked-reversed`; wrong runtimes `1b.r44-parked-reverse-order`, 
        `d5.remount-in-grace-is-fresh`, `life.no-remount`. [@I15, @I16, @I17]
    T9  Versions: an added field, an encoded-side change and a type-side change over the same encoded side are each a 
        new version; a description change is not. Case `R14-ID-02`; wrong runtimes `id.old-version-restored`, 
        `id.version-by-names-only`, `l1.version-by-printed-name`. [@I18]
    T10  Mailboxes and rotation: FIFO within an actor; a spin on one actor does not delay another's ending; 65 
         follow-ups are refused. Cases `REV9-LOOP`, `ORDER-04`; wrong runtime `d122.rota-not-rotated`. The prototype's 
         FIFO wrong runtime no longer applies to its code, so phase 3 writes one; the 64 and 1,024 bounds have no 
         prototype wrong runtime (Q2). [@I19, @I20, @I21, @I22]
    T11  Refused deliveries: a refused ending is kept, redelivered once, and heard at the next boot. Cases `REV8-KEPT`, 
         `REV9-KEPT`; lie `a4.refused-denied`; wrong runtimes `turn.refusal-keeps-asks`, 
         `1b.r8-refused-ending-not-redelivered`. [@I23, @I24]
    T12  The send table, one row per target state. Cases `LIFE-03`, `LIFE-09`, `LIFE-21`, `ORDER-01`; wrong runtimes 
         `life.send-no-restore`, `life.send-absent-silent`, `life.handle-not-identity`, 
         `d6.disposed-ending-is-evidence`. [@I25]
    T13  Complete cuts: a drain's two turns are one cut. Case `REV8-PINS`; wrong runtimes `d122.cut-splits-a-turn`, 
         `pinsa.drain-cut-mid-drain`. [@I26]
    T14  Context: a diamond and a chain each give one update per wave from latest values; a throwing selector is 
         isolated; a cycle and a missing provider reject at admission. No prototype case (Q2). [@I27, @I28]
    T15  disposeActor and forget: unbound lanes listed until adopted; forget keeps a held lane and turns parked endings 
         into evidence. Case `R15-01`; wrong runtimes `id.dispose-drops-lanes`, `audit-1.forget-is-a-no-op`, 
         `audit-1.forget-drops-the-queue`, `1b.forget-marks-held-lane`. [@I29, @I32]
    T16  Runtime disposal on a controlled clock: a call settling within 5 s is parked; past it unknown { Disposed }, 
         head kept Held; a definite ending drops the head; the queued NotSent { Disposed } precede the head's unknown; 
         nothing is invoked after the start; disposal ends only when its last fiber has ended. Cases `PAY-16`, 
         `R15-01`, `REV5-M1`; wrong runtimes `o6.dispose-interrupts-wire`, `o6.settled-in-bound-stays-held`, 
         `1b.disposal-definite-w-first`, `r15.past-bound-captured-inflight`, and for the last-fiber wait `o6.no-bound`. 
         [@I29, @I30, @I31, @I35, @I36]
    T17  Cleanup failure and isolation: a failing finalizer rejects CleanupFailed and later ensures repeat it; two 
         Runtimes from one setup share nothing and reject each other's handles; a counter at its limit refuses 
         IdentityExhausted. No prototype case (Q2). [@I13, @I33, @I34]
    T18  Failed admission leaves nothing: an ensure refused for a missing provider or an invalid
            input leaves no actor, lane, schedule or evidence beyond the failure, and a later ensure
            succeeds. No prototype wrong runtime; phase 3 writes one that leaves a half-admitted
            actor. [@I9]
