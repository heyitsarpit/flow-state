spec WriteAhead
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in wiki/specs/specs.log.
              Written from the merged flow plans (proposed).
location      packages/flow-state-v3/src
provides      persistence setup, actor and lane records, capture, durable Attempts
derives_from  [
              @plan.Persistence.O1, @plan.Persistence.O2, @plan.Persistence.O3,
              @plan.Persistence.O6, @plan.Persistence.O7, @plan.Persistence.D1, @plan.Persistence.V1,
              @plan.Persistence.V2, @plan.Persistence.V3, @plan.Persistence.V5,
              @plan.Persistence.V6, @plan.Persistence.V8, @plan.Persistence.V9
              ]

requirements
    R1  Persistence is opt-in and scoped
        source  @plan.Persistence.O1.
        must    Without persistence Flow acquires no storage and performs no restore, capture or
                storage I/O. Persistence requires the setup's scope: its absence is a type error
                and rejects untyped setups before construction. There is no app-wide or manual
                version. Different apps and scopes never read, overwrite or delete each other's
                data.

    R2  The storage service
        source  @plan.Persistence.O1.
        must    Enabled persistence requires Flow's own `Store` service, which has two members:
                `load`, giving every record of the scope, and `write(batch)`, one atomic batch of
                record writes and removals. Missing provision is a type error, and untyped missing
                provision fails ready with StorageFailure. construct() performs no I/O. Records are
                stored as JSON strings. Flow is to ship `layerIndexedDb` and `layerMemory` (neither is built
                yet); it offers no adapter over Effect's KeyValueStore, whose per-key writes cannot
                be one atomic batch. The IndexedDB Layer is specified with the host adapters, when
                that phase starts. Decision (user, 2026-11-12): wide consult, question 4. Why: the user's
                answer. Reverse: restore R2 from commit `9405af2f`.

    R3  Selection
        source  @plan.Persistence.O2.
        must    persist is the machine's, declared on its definition, default false; refs carry no
                persist. A local actor of a persisted machine is not persisted and writes no
                record. resource({ persist: true }) selects confirmed resource data independently.
                Transactions and streams have no persist option.

    R4  What an actor record holds
        source  @plan.Persistence.O2.
        must    A persisted actor's record holds its state, memory, exact context bindings, issues,
                schedule deadlines (keyed timers by key with dueAt), restartOn baselines, revisions,
                each history target's last child, resumable slices (frozen ones with their
                schedules), .each copies by key with their counters, a writing placement's reset
                value, each placement's last mapped value, and stream bookmarks with their slice.
                It holds no ending: an ending not yet heard, a stopped read's Interrupted included,
                is a row of the identity's owed record (R5).

                Persisted Schemas encode and decode synchronously without services; unsupported
                values fail encoding instead of being coerced, omitted or stringified.

                Records obey @spec.Codec's bounds, so memory past one of them (an array of more
                than 4,096 items, among others) never persists: its capture is skipped with
                UnencodableValue and the last good capture stays (a limit on apps).

    R5  Lane records
        source  @plan.Persistence.O2.
        must    Write lanes are records of the identity, never inside the actor record: every
                non-Idle lane of a persisted identity, bound or unbound, under (identity with its
                version, contract id, key), with its Attempt (`retryCount`, and `inFlight`), the
                creating subject path and the releasing mark. `inFlight` is true while the head is
                acknowledged and not Held (Acknowledging to Cancelling: it may be on the wire), and
                false for a Held head. A lane record holds no ending and no `mayHaveApplied`.

                Built so far (`encodeLane`, src/core/record.ts): `format`, `machine`, `name`, `operation`,
                `attempt`, `input`, `retryCount` and `inFlight`, which R5 requires, and also
                `mayHaveApplied`, which R5 and @spec.Codec.R5 forbid and is still to go. Not built yet,
                though R5 requires them: the creating subject path and the releasing mark.

                An identity's unheard endings are one record of their own, `owed/<identity>`:
                `format`, `machine`, `name` and its rows in the order they were owed, each with its
                `operation`, `attempt`, `lane`, `channel`, `reason`, `value` (stored raw and mapped
                through the current definition at delivery) and `kept`. `channel` is `success`,
                `failure`, `notSent` or `unknown`, and names the ending's origin, so an author's
                failure and Flow's NotSent stay distinct after a reload (@spec.WriteLanes.R3,
                @spec.WriteLanes.I39). Every row of a persisted identity that is owed to the
                identity and alive at a step's end is in it, a derived unknown { Restored } once
                owed included; a row owed to one incarnation is never saved; with no row the record
                is removed. It is not inside the actor record, which `disposeActor` removes while
                the endings stay, nor inside a lane record, since an ending can outlive its lane or
                never have one.

                So the record kinds are `actor/<identity>`, `lane/<lane>` and `owed/<identity>`.
                Decision (agent: the orchestrator, 2026-11-12): consult round 3, C9. Why: an ending
                outlives both its lane and its actor record. Reverse: restore R5 from commit
                `9405af2f`. The encoded shapes are @spec.Codec.R5; what a reset or quarantine does
                to a row whose operation is gone is open.

                A local identity's lanes never persist, and a read has no lane and no record
                (@spec.Reads.R6).

    R6  What never survives
        source  @plan.Persistence.O2.
        must    Only confirmed shared data survives: optimistic values and predictions never become
                a saved baseline. Queued events, commands, executable work, services and stream
                emission buffers do not survive. A lane's queued commits are not these commands: a
                saved queue, once built, is restored as NotSent { Restored } (@spec.Restore.R3).
                Context selections are recomputed from saved
                providers. Saved values are exact, sensitive ones included (@plan.Persistence.D1).

    R7  Consistent capture
        source  @plan.Persistence.O3.
        must    A capture sees only whole publications: never part of a turn, or an actor without
                its store writes. It never starts operations, emits context events or changes live
                state. It includes every non-Idle lane of a persisted identity; a releasing mark is
                captured no later than the actor record that drops the incarnation.

    R8  Durable context providers
        source  @plan.Persistence.O3.
        must    Every selected consumer requires its transitive context providers to be durable; a
                missing, local or non-durable provider rejects the whole capture, keeps the
                previous complete scope, and reports NonDurableContextProvider with every failing
                path. Incomplete propagation delays capture and retries when settled.

    R9  Atomic scope
        source  @plan.Persistence.O3.
        must    A scope is saved atomically: after interruption or a torn write, reload sees one
                complete capture, falling back to the last good one. Older writes never replace
                newer committed state. Every actor, lane and owed record carries Flow's one record
                format number, today 1 (@spec.Codec.R5).

    R10  When records are written
        source  @plan.Persistence.O3.
        must    A dirty plain record's capture is issued within 5 s, or once the batch still out
                answers if that is later (R12), and at once on visibilitychange to hidden and on
                pagehide. A step whose head starts to wait for storage (a first send's
                acknowledgement, a re-send's capture), that removes an actor record or that ends an
                incarnation is issued at once with everything dirty, so a lane never outruns its
                actor; any other lane or owed change may wait for the interval, since no send
                depends on it. A first send's capture and acknowledgement are one batch with the
                turn that committed it.

                A step is one input to the core and the mail drain it runs: every turn served before
                the core returns, follow-ups and other actors' mail included; mail still queued when
                the core returns (a backlog) is served in a later step. Records are written from what a step
                touched, never by a move: the step notes the lanes and identities it changed, and at
                its end each one whose entry changed is projected into its record (or its removal);
                those writes are that step's one list, for the whole Runtime. The list says how soon
                it must go (at once and awaited, at once, or within the interval); when a batch is
                issued it carries that list and everything else still dirty (R12). A row leaves the
                owed record in the batch that carries the turn that heard it. Decision (agent: the
                orchestrator, 2026-11-12): consult round 3, Part 2. Why: records derived from what
                changed cannot drift from the world. Reverse: restore R10 from commit `9405af2f`.

                The durability of R13 cannot be coalesced away. Nothing bounds the wait for storage
                to answer; a frozen page runs no task, deadline or capture until a thaw; browser
                exit flushing is best effort, and on Safari a tab close loses the last batch, so the
                loss window is the 5 s interval (stated limits).

    R11  Scope bounds
        source  @plan.Persistence.O3.
        must    A scope admits at most 4,096 records and 16 MiB of record data, dormant records
                included. Over either bound a capture drops the oldest ended records that equal a
                fresh start, with evidence; if that is not enough the capture is rejected and its
                evidence names the oldest ended identities. A record holding anything a user did is
                never dropped. An encoding failure keeps the last good capture.

    R12  The store contract
        source  @plan.Persistence.O3.
        must    The store's contract (agent-judged):

                - batches are atomic and commit in issue order;
                - there is one batch stream per Runtime, never one per actor: one batch is out at a
                time, the next waits for its answer, and each batch holds every record dirty in the
                Runtime when it is issued;
                - so an awaited write waits for the batch still out, and per key a later write wins;
                - a batch answers landed only if every request in it succeeded.

                Decision (user, 2026-11-12): one stream per Runtime (wide consult, question 4);
                Decision (agent, 2026-11-12): "one out at a time" is the agent's reading of it. Why:
                with one batch out, issue order is commit order. Reverse: allow overlapping batches
                with per-key ordering.

                The store is an Effect: a batch's write succeeds when the whole batch landed and fails
                with a typed refusal when none of it did; an interrupted write is unanswered, as a hung
                one is. An unanswered write is pending, never "not sent"; StorageSilent names it after
                10 s and decides nothing. A record names the boot that wrote it, and no id minted
                after restore equals an id on disk (@spec.WriteLanes.R5). Disposal waits for its
                final write within its budget (@spec.Actors.R23); a final write still pending then,
                or refused, reports StorageFailure.

    R13  Acknowledge before sending
        source  @plan.Persistence.O6.
        must    A persisted identity's remote commit cannot invoke its adapter until storage
                acknowledges its Attempt (id and encoded input), once per Attempt per lane record;
                the acknowledgement is one batch with the capture of the turn that committed it.

                A persisted re-send waits for its lane record's capture, which carries the
                `retryCount` that re-send will carry. If acknowledgement fails
                the adapter is not called and the commit ends NotSent { StorageRefused } with
                StorageFailure evidence; a re-send whose capture fails returns to Held and delivers
                unknown { StorageRefused }. A transient failure never downgrades a write to an
                undurable one.

    R14  Honest uncertainty after a crash
        source  @plan.Persistence.O6.
        must    A crash after acknowledgement restores unknown { Restored } with the same Attempt;
                a head with an owed row for its own Attempt hears that row instead. Flow never repeats
                a remote write automatically. Saved endings are delivered, mapped at delivery, not
                replaced by unknown. A later Runtime never reuses an Attempt identity.

    R15  Non-persisted writes
        source  @plan.Persistence.O6.
        must    Non-persisted actors have no attempt durability: a local actor's write sent before
                a reload has no lane afterwards, so its ending is not seen and its hold is lost (a
                stated limit). There is no cross-tab exactly-once guarantee.

    R16  Scope ownership
        source  @plan.Persistence.O7.
        must    Only one Runtime owns a scope's saved data. A Runtime the host reports at boot as not
                owning its scope (another tab or Runtime owns it) runs without restore, capture,
                writes or deletion for its whole life, reports SecondTabNoPersistence, and ends a
                persisted identity's commit NotSent { NoPersistence } with its transition running
                (@spec.WriteLanes.R12). How ownership is claimed and released (the Web Lock, a
                disposing owner in the same document, browsers without locks) is the multi-tab
                Spec's, in phase 5. Decision (agent, 2026-11-11): the core half of O7 is a core
                rule (audit G2). Why: two owners overwrite each other's data. Reverse: move R16 to
                the multi-tab Spec (spec-log.md, T42).

open
    Q1  Executable checks are not built.
        outcome  When its slice is built, each test below is written as the cheapest check that fully
                 covers it (a compile-time test, a run rule applied to every Story run, a Story test
                 or a pure core test) in `packages/flow-state-v3/tests/`, and each rule gets a
                 planted fault in `tests/faults.ts` that `nub run faults` must catch; until then
                 every Requirement's evidence is open.

    Q2  No Story test or planted fault exists yet for scope bounds (4,096 records, 16 MiB), NonDurableContextProvider, 
        or StorageSilent's 10 s.
        outcome  Those cases are written with their planted faults (Q1).

    Q3  The 5 s interval ran only in the prototype's runtime-default pass.
        outcome  R10's cases run at the default 5 s interval in a normal run.

    Q4  No test covers R15's lost-hold limit.
        outcome  Open: a local actor's write sent before a reload has no lane afterwards, so its ending is not seen and
                 its hold is lost; the test that shows this, and where it lives, is not written.

model
    Capture = one batch of actor records, lane records, owed records and resource records written as a whole.

    Acknowledged = storage answered landed for the batch holding the Attempt's record.

    Dirty = a record whose committed value differs from its last landed value.

    Step = one input to the core and the mail drain it runs (R10).

invariants
    I1  With persistence off, no storage call happens during the Runtime's life. [@R1, @R2]

    I2  A record written under scope s is never read, overwritten or deleted by a Runtime of another app or scope. [@R1]

    I3  A local identity never has an actor record or a lane record. [@R3, @R5, @R15]

    I4  A restored actor record round-trips: decode(encode(record)) equals the committed values R4 lists. [@R4]

    I5  Every non-Idle lane of a persisted identity has a lane record in the latest capture. [@R5, @R7]

    I6  No capture contains an optimistic value, a prediction, a queued event or work. [@R6]

    I7  Every capture corresponds to one published cut: each actor record and its store writes come from the same 
        commit. [@R7]

    I8  A capture never starts an operation, emits an event or changes live state. [@R7]

    I9  A capture with a non-durable provider is not written; the previous capture remains. [@R8]

    I10  After any interruption, the readable scope equals some complete landed capture, and never an older one than 
         the latest landed. [@R9, @R12]

    I11  At every landed state, a lane record's actor record is at least as new as the turn that created the lane. 
         [@R10]

    I12  A dirty plain record's capture is issued within 5 s of the record becoming dirty or once the batch still out 
         answers, whichever is later, and at once after hide, pagehide or a step R10 issues at once, under the same
        one-batch-out rule (R12); nothing bounds when storage answers. [@R10, @R12]

    I13  Records counted in a scope never exceed 4,096 nor 16 MiB after a capture lands; a record with user work is 
         never the one dropped. [@R11]

    I14  A batch is reported landed only if all its requests succeeded. [@R12]

    I15  For a persisted identity, adapter invocation of an Attempt happens only after that Attempt is Acknowledged. 
         [@R13]

    I17  After a crash, every Acknowledged Attempt without a saved ending restores as unknown { Restored } with the 
         same id, and Flow never re-sends it on its own: only a user's retry re-sends it, with that id
        (@spec.WriteLanes.R8). @spec.Restore.R5's stated fresh start, which loses such Attempts, is the one
        exception. [@R14]

    I19  A Runtime refused its scope's ownership makes no storage read, write or delete during its life, and every 
         commit of a persisted identity in it ends NotSent { NoPersistence }. [@R16]

    I20  At every step's end, a persisted identity's owed record lists exactly its rows owed to the identity, in the 
         order they were owed, kept ones marked, each with the channel of its origin, and is absent when it has none;
        a row owed to one incarnation is in no record, and no ending is in an actor or lane record. [@R4, @R5]

    I22  A row leaves the owed record only in the batch that carries the actor record of the turn that heard it: a 
         crash before that batch lands restores the row together with the state that had not heard it. [@R9, @R10]

    I23  Every batch is one Store write, and it holds every record dirty in the Runtime when it is issued: no 
         identity's record lands without the records the same step changed, another identity's included, and at most
        one batch is out at a time. [@R2, @R12]

    I24  At every landed state, a lane record's `inFlight` is true exactly when its head was acknowledged and not Held 
         in the step that wrote it. [@R5]

owner Records
    lifetime  one Runtime. Design, agreed by the user, 2026-11-12 (consult round 3, Part 2); I21 moved here from
              `invariants`, id kept.
    state     each step's touched lanes and identities, and its write list

    invariants
        I21  Every lane and identity whose entry a step changed has its record written or removed in that step's write 
             list (issued when R10 says), and no move writes a record: a boot from any landed state behaves as the
            world of the last landed step. [@R5, @R10]

composition
    flow
        Design note, proved by the prototype. Write-ahead lives in the core: an Attempt reaches
        the disk as its lane's head, in a batch whose ticket lets it leave; a head on disk may
        have been sent, so it restores as unknown { Restored }
        (packages/flow-state-v3/prototypes/round-14/durable.ts). The storage edge, batching and
        flush timing live at the host edge (round-14/edge.ts).

realization typescript
    Design, agreed by the user, 2026-11-12 (consult round 3, Part 2; wide consult, question 4 and W2); moved here
        from `composition`.

    In src/host/edge.ts a capture's wait is a keyed fiber sleeping on Effect's Clock in the Runtime's FiberMap
        (src/host/fibers.ts, which the edge forks through), and an urgent batch is a Scheduler yield, not a second task 
            queue; the store's load and write are Effects.

    The core has no `persist` call: the step's setters note touched lanes and identities, and at the step's end each
        is projected (`encodeActor`, `encodeLane`, `encodeOwed`) if its entry changed by identity, never by
        comparing maps or bytes. `encodeLane` matches every Phase, so a new phase forces a decision on what is
        saved.

    The writes leave as that step's one Persist command, a flat list for the whole Runtime, with `Due` derived:
        Awaited when a touched head entered Acknowledging or Recapturing, Now when an actor record is removed or an
        incarnation ended, else Later (R10). The capture window (when a Later list is issued, and the flush on hide)
        stays in the host (T54's decision 4).

    `Store` is its own service with `load` and `write(batch)`; the edge keeps one stream state for the Runtime, not
        one per actor.

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I1], type tests
        open_by      [@Q1]

    @R3
        enforced_by  [@I3]
        open_by      [@Q1]

    @R4
        enforced_by  [@I4, @I20]
        open_by      [@Q1]

    @R5
        enforced_by  [@I3, @I5, @I20, @I21, @I24]
        open_by      [@Q1]

    @R6
        enforced_by  [@I6]
        open_by      [@Q1]

    @R7
        enforced_by  [@I5, @I7, @I8]
        open_by      [@Q1]

    @R8
        enforced_by  [@I9]
        open_by      [@Q1, @Q2]

    @R9
        enforced_by  [@I10, @I22]
        open_by      [@Q1]

    @R10
        enforced_by  [@I11, @I12, @I21, @I22]
        open_by      [@Q1, @Q3]

    @R11
        enforced_by  [@I13]
        open_by      [@Q1, @Q2]

    @R12
        enforced_by  [@I10, @I12, @I14, @I23]
        open_by      [@Q1, @Q2]

    @R13
        enforced_by  [@I15]
        open_by      [@Q1]

    @R14
        enforced_by  [@I17]
        open_by      [@Q1]

    @R15
        enforced_by  [@I3]
        open_by      [@Q1, @Q4]

    @R16
        enforced_by  [@I19]
        open_by      [@Q1]

tests
    T1  Off by default: a Runtime without persistence runs the reference scenarios with a storage spy that sees zero 
        calls; a scope-less persistent setup is a type error and an untyped one rejects before construction. [@I1]
    T2  Selection: a definition with no persist is not persisted; a local identity of a persisted machine writes 
        nothing.
            Planted faults: persist defaulting to true; a local identity persisted; a definition's persist
            ignored. [@I3]
    T3  Record round trip: memory, bookmark, frozen slice and a bigint key survive a reload. Planted faults: the last 
        write not saved; a heard ending not restored. [@I4, @I6]
    T4  Capture cuts: a hide flushes every actor; poison lanes go ahead of the record; plain writes coalesce to the 
        newest.
            Planted faults: a hide that flushes one actor; a poison that holds lanes; a poison that lets deletes
            go. [@I7, @I11]
    T5  The 5 s interval on a controlled clock: the default is 5 s; hidden issues at once; a kill before any flush 
        loses only plain memory; disposal flushes; with fake storage that never answers, the capture is still issued on
            time and nothing else waits on it.
            Planted faults: a debounce; a hidden state that waits; a hide that does nothing; a hide that flushes
            the first scope only; a deadline that is not now. [@I12]
    T6  Atomic fallback: a failed write survives a reload as the last good capture; a lost clock does not strand a 
        flush. Storage silence: planted fault: a write that never reports silence. [@I10, @I14]
    T7  Acknowledge before send: a refused acknowledgement calls no adapter and ends StorageRefused; a refused re-send 
        capture returns Held with unknown { StorageRefused }; a head on disk is the request that starts.
            Planted faults: an acknowledgement reported false; a head off disk on the wire; a ticket not fenced; a
            refused re-send that is silent; a refused capture that spends the budget; a promoted head sent with no
            acknowledgement. [@I15]
    T8  Crash after acknowledgement: kill at each point between acknowledgement and the adapter's answer; every reload 
        hears unknown { Restored } with the same id and the server sees one call. Planted fault: a restore that forgets 
        the
            call may have applied; a run rule applied to every Story run checks it after every
            step. [@I17, @spec.WriteLanes.I6, @spec.WriteLanes.I28]
    T9  Bounds and providers: a scope at 4,096 records and one past; a non-durable provider rejects the capture and 
        keeps the previous one. No test yet (Q2). [@I9, @I13]
    T10  Scope isolation: two apps and two scopes over one fake Store; no Runtime reads, writes or deletes another's 
         keys, forget included. No test yet; phase 3 writes this test and its planted fault. [@I2]
    T11  Every non-Idle lane is captured: lanes bound, unbound after disposeActor, and Held after an end each appear in 
         the next landed capture. Phase 3 writes the planted fault that skips unbound lanes. [@I5]
    T12  Capture is passive: with spies on operations, mailboxes and the clock, a capture starts no operation, enqueues 
         no event and changes no snapshot. No planted fault yet; phase 3 writes one that refetches during
             capture. [@I8]
    T13  Codec bounds on records: memory holding a 4,097-item array skips its capture with UnencodableValue and the 
         last good capture restores. No test yet; phase 3 writes this test. [@I4]
    T14  A second owner: boot a Runtime whose host reports the scope owned elsewhere, over a fake Store holding 
         records; it restores nothing, a storage spy sees no call, it reports SecondTabNoPersistence, and a persisted
             commit ends NotSent { NoPersistence } with its transition run. Phase 3 writes the planted fault that still
             captures. [@I19]
    T15  Owed records: after each step of a run with refused, parked and kept endings, the store's owed record of each 
         identity lists its rows in owed order with kept ones marked and each row's channel, is absent when none is
             owed, and holds no row owed to one incarnation; no actor or lane record holds an ending; a derived unknown 
                 {
             Restored } is in it once owed. [@I20]
    T16  Reload equivalence and torn batches: at every crash point, boot and compare the reports and snapshots after 
         the boot with the baseline's; drop each batch whole, boot, and check that every admitted commit still ends
             once. Planted faults: a batch split in two; a lane changed with no record written (a Recapturing head held 
                 at
             disposal). [@I21, @I22]
    T17  One stream: actor A hears an ending and sends to actor B in one step, and the Runtime is killed after each 
         Store write; no reload shows B's record without A's, and a spy sees one write at a time, each a single call.
             Planted fault: one batch per actor. [@I23]
    T18  inFlight on disk: a head saved Acknowledging, OnWire and Cancelling has inFlight true and wakes its identity 
         at the next boot; a head saved Held has it false and does not. Planted fault: inFlight left true after an
             unknown. [@I24]
