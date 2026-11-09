spec WriteAhead
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      persistence setup, actor and lane records, capture, durable Attempts
derives_from  [
              @plan.Persistence.O1, @plan.Persistence.O2, @plan.Persistence.O3,
              @plan.Persistence.O6, @plan.Persistence.D1, @plan.Persistence.V1,
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
        must    Enabled persistence requires an Effect KeyValueStore service; missing provision is 
                a type error, and untyped missing provision fails ready with StorageFailure. 
                construct() performs no I/O. Records are stored as JSON strings. The IndexedDB 
                Layer (layerIndexedDb) is specified with the host adapters, when that phase starts.

    R3  Selection
        source  @plan.Persistence.O2.
        must    persist is the machine's, declared on its definition, default false; refs carry no 
                persist. A local actor of a persisted machine is not persisted and writes no 
                record. resource({ persist: true }) selects confirmed resource data independently. 
                Transactions and streams have no persist option.

    R4  What an actor record holds
        source  @plan.Persistence.O2.
        must    A persisted actor's record holds its state, memory, exact context bindings, issues, 
                pending mapped outcomes, schedule deadlines (keyed timers by key with dueAt), 
                restartOn baselines, revisions, each history target's last child, resumable slices 
                (frozen ones with their schedules and parked Interrupted endings), .each copies by 
                key with their counters, a writing placement's reset value, each placement's last 
                mapped value, and stream bookmarks with their slice. Persisted Schemas encode and 
                decode synchronously without services; unsupported values fail encoding instead of 
                being coerced, omitted or stringified. Records obey the Codec Spec's bounds, so 
                memory past one of them (an array of more than 4,096 items, among others) never 
                persists: its capture is skipped with UnencodableValue and the last good capture 
                stays (a limit on apps).

    R5  Lane records
        source  @plan.Persistence.O2.
        must    Write lanes are records of the identity, never inside the actor record: every 
                non-Idle lane of a persisted identity, bound or unbound, under (identity with its 
                version, contract id, key), with its Attempts (retryCount, acknowledged), the 
                creating subject path, the releasing mark and parked endings stored raw and mapped 
                through the current definition at delivery. A local identity's lanes and one-off 
                read lanes never persist.

    R6  What never survives
        source  @plan.Persistence.O2.
        must    Only confirmed shared data survives: optimistic values and predictions never become 
                a saved baseline. Queued events, commands, executable work, services and stream 
                emission buffers do not survive. Context selections are recomputed from saved 
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
                newer committed state. Every actor and lane record carries Flow's record format (1 
                to 4).

    R10  When records are written
        source  @plan.Persistence.O3.
        must    A dirty plain record's capture is issued within 5 s, and at once on 
                visibilitychange to hidden and on pagehide. A batch that touches a lane or a send, 
                or a disposeActor removal, is issued at once with everything dirty, so a lane never 
                outruns its actor. A first send's capture and acknowledgement are one batch with 
                the turn that committed it. The durability of R13 cannot be coalesced away. Nothing 
                bounds the wait for storage to answer; a frozen page runs no task, deadline or 
                capture until a thaw; browser exit flushing is best effort, and on Safari a tab 
                close loses the last batch, so the loss window is the 5 s interval (stated limits).

    R11  Scope bounds
        source  @plan.Persistence.O3.
        must    A scope admits at most 4,096 records and 16 MiB of record data, dormant records 
                included. Over either bound a capture drops the oldest ended records that equal a 
                fresh start, with evidence; if that is not enough the capture is rejected and its 
                evidence names the oldest ended identities. A record holding anything a user did is 
                never dropped. An encoding failure keeps the last good capture.

    R12  The store contract
        source  @plan.Persistence.O3.
        must    The store's contract (agent-judged): batches are atomic and commit in issue order; 
                per key a later write wins whatever order answers arrive; one plain write per key 
                is out at a time; an awaited write waits for any plain batch of its actor still 
                out; a batch answers landed only if every request in it succeeded. An unanswered 
                write is pending, never "not sent"; StorageSilent names it after 10 s and decides 
                nothing. A record names the boot that wrote it, and no id minted after restore 
                equals an id on disk (WriteLanes Spec R5). Disposal waits for the last write within 
                its budget; a write still pending then reports StorageFailure.

    R13  Acknowledge before sending
        source  @plan.Persistence.O6.
        must    A persisted identity's remote commit cannot invoke its adapter until storage 
                acknowledges its Attempt (id and encoded input), once per Attempt per lane record; 
                the acknowledgement is one batch with the capture of the turn that committed it. A 
                persisted re-send waits for its lane record's capture. If acknowledgement fails the 
                adapter is not called and the commit ends NotSent { StorageRefused } with 
                StorageFailure evidence; a re-send whose capture fails returns to Held and delivers 
                unknown { StorageRefused }. A transient failure never downgrades a write to an 
                undurable one.

    R14  Honest uncertainty after a crash
        source  @plan.Persistence.O6.
        must    A crash after acknowledgement restores unknown { Restored } with the same Attempt; 
                a head whose own ending is parked restores as that ending. Flow never repeats a 
                remote write automatically. Saved mapped outcomes are delivered, not replaced by 
                unknown. A later Runtime never reuses an Attempt identity.

    R15  Non-persisted writes
        source  @plan.Persistence.O6.
        must    Non-persisted actors have no attempt durability: a local actor's write sent before 
                a reload has no lane afterwards, so its ending is not seen and its hold is lost (a 
                stated limit). There is no cross-tab exactly-once guarantee.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  The prototype has no case for scope bounds (4,096 records, 16 
        MiB),NonDurableContextProvider, or StorageSilent's 10 s. outcome Phase 3 writes those cases 
        and wrong runtimes.

    Q3  The 5 s interval runs only in the prototype's runtime-default pass.
        outcome  The new suite runs R10's cases at the default interval in its normal run.

model
    Capture = one batch of actor records, lane records and resource records written as a whole.

    Acknowledged = storage answered landed for the batch holding the Attempt's record.

    Dirty = a record whose committed value differs from its last landed value.

invariants
    I1  With persistence off, no storage call happens during the Runtime's life. [@R1]

    I2  A record written under scope s is never read, overwritten or deleted by a Runtime of 
        another app or scope. [@R1]

    I3  A local identity never has an actor record or a lane record. [@R3, @R5]

    I4  A restored actor record round-trips: decode(encode(record)) equals the committed valuesR4 
        lists. [@R4]

    I5  Every non-Idle lane of a persisted identity has a lane record in the latest capture.[@R5, 
        @R7]

    I6  No capture contains an optimistic value, a prediction, a queued event or work. [@R6]

    I7  Every capture corresponds to one published cut: each actor record and its store writes come 
        from the same commit. [@R7]

    I8  A capture never starts an operation, emits an event or changes live state. [@R7]

    I9  A capture with a non-durable provider is not written; the previous capture remains.[@R8]

    I10  After any interruption, the readable scope equals some complete landed capture, and never 
         an older one than the latest landed. [@R9, @R12]

    I11  At every landed state, a lane record's actor record is at least as new as the turn that 
         created the lane. [@R10]

    I12  A dirty plain record's capture is issued within 5 s of the record becoming dirty, or at 
         once after hide, pagehide or a lane batch; nothing bounds when storage answers. [@R10]

    I13  Records counted in a scope never exceed 4,096 nor 16 MiB after a capture lands; a record 
         with user work is never the one dropped. [@R11]

    I14  A batch is reported landed only if all its requests succeeded. [@R12]

    I15  For a persisted identity, adapter invocation of an Attempt happens only after that Attempt 
         is Acknowledged. [@R13]

    I16  A refused acknowledgement leaves zero adapter calls for that Attempt. [@R13]

    I17  After a crash, every Acknowledged Attempt without a saved ending restores as unknown { 
         Restored } with the same id; no remote write is repeated. [@R14]

    I18  No Attempt or incarnation id minted after restore equals any id on disk. [@R12, @R14]

composition
    flow
        Design note, proved by the prototype. Write-ahead lives in the core: an Attempt reaches
        the disk as its lane's head, in a batch whose ticket lets it leave; a head on disk may
        have been sent, so it restores as unknown { Restored }
        (packages/flow-state-v3/prototypes/round-14/durable.ts). The storage edge, batching and
        flush timing live at the host edge (round-14/edge.ts).

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
        enforced_by  [@I4]
        open_by      [@Q1]

    @R5
        enforced_by  [@I3, @I5]
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
        enforced_by  [@I10]
        open_by      [@Q1]

    @R10
        enforced_by  [@I11, @I12]
        open_by      [@Q1, @Q3]

    @R11
        enforced_by  [@I13]
        open_by      [@Q1, @Q2]

    @R12
        enforced_by  [@I10, @I14, @I18]
        open_by      [@Q1, @Q2]

    @R13
        enforced_by  [@I15, @I16]
        open_by      [@Q1]

    @R14
        enforced_by  [@I17, @I18]
        open_by      [@Q1]

    @R15
        enforced_by  [@I3]
        open_by      [@Q1]

tests
    T1  Off by default: a Runtime without persistence runs the reference scenarios with a storage 
        spy that sees zero calls; a scope-less persistent setup is a type error and an untyped one 
        rejects before construction. [@I1]
    T2  Selection: a definition with no persist is not persisted; a local identity of a persisted 
        machine writes nothing. Cases `R15-01`, `R14-ID-03`; wrong runtimes 
        `r15d.persist-default-true`, `r15d.local-persisted`, `r15.definition-persist-ignored`. [@I3]
    T3  Record round trip: memory, bookmark, frozen slice and a bigint key survive a reload. Cases 
        `SPIKE-02`, `SPIKE-04`, `P1-S`; wrong runtimes `p1s.last-not-saved`, 
        `p1s.heard-not-restored`. [@I4, @I6]
    T4  Capture cuts: a hide flushes every actor; poison lanes go ahead of the record; plain writes 
        coalesce to the newest. Cases `REV8-PINS`, `REV6-CAPTURE`; wrong runtimes 
        `pinsa.hide-flushes-one-actor`, `pinsa.poison-holds-lanes`, `pinsa.poison-lets-deletes-go`. 
        [@I7, @I11]
    T5  The 5 s interval on a controlled clock: the default is 5 s; hidden issues at once; a kill 
        before any flush loses only plain memory; disposal flushes; with fake storage that never 
        answers, the capture is still issued on time and nothing else waits on it. Case `REV7-D80`; 
        wrong runtimes `e-debounce`, `e-hidden-waits`, `e-hide-noop`, `edge.hide-first-scope-only`, 
        `durable.deadline-not-now`. [@I12]
    T6  Atomic fallback: a failed write survives a reload as the last good capture; a lost clock 
        does not strand a flush. Cases `REV6-M7`, `REV7-EDGE`; storage silence: wrong runtime 
        `e-no-silent`. [@I10, @I14]
    T7  Acknowledge before send: a refused acknowledgement calls no adapter and ends 
        StorageRefused; a refused re-send capture returns Held with unknown { StorageRefused }; a 
        head on disk is the request that starts. Cases `PAY-09`, `PAY-16`, `REV8-H1`, `REV7-H1`; 
        wrong runtimes `lane.ackout-false`, `durable.head-off-disk-on-the-wire`, 
        `durable.ticket-not-fenced`, `1b.r17-refused-resend-silent`, 
        `pay16.refused-capture-spends-budget`, and `lane.promote-skips-durable` (a promoted head 
        sent with no acknowledgement). [@I15, @I16]
    T8  Crash after acknowledgement: kill at each point between acknowledgement and the adapter's 
        answer; every reload hears unknown { Restored } with the same id and the server sees one 
        call. Case `PAY-16`; wrong runtime `pay16.restore-forgets-may-have-applied`; the global 
        oracle (h) in the prototype harness checks it on every step. [@I17, @I18]
    T9  Bounds and providers: a scope at 4,096 records and one past; a non-durable provider rejects 
        the capture and keeps the previous one. No prototype case (Q2). [@I9, @I13]
    T10  Scope isolation: two apps and two scopes over one fake KeyValueStore; no Runtime reads, 
         writes or deletes another's keys, forget included. No prototype case; phase 3 writes this 
         test and its wrong runtime. [@I2]
    T11  Every non-Idle lane is captured: lanes bound, unbound after disposeActor, and Held after 
         an end each appear in the next landed capture. Case `R15-01`; phase 3 writes the wrong 
         runtime that skips unbound lanes. [@I5]
    T12  Capture is passive: with spies on operations, mailboxes and the clock, a capture starts no 
         operation, enqueues no event and changes no snapshot. No prototype wrong runtime; phase 3 
         writes one that refetches during capture. [@I8]
    T13  Codec bounds on records: memory holding a 4,097-item array skips its capture with 
         UnencodableValue and the last good capture restores. No prototype case; phase 3 writes 
         this test. [@I4]
