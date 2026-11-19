spec Restore
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in wiki/specs/specs.log.
              Written from the merged flow plans (proposed).
location      packages/flow-state-v3/src
provides      restore at ready, record formats, versions at the boot, saved-shape resets,
              quarantine, forgetting a scope
derives_from  [
              @plan.Persistence.O4, @plan.Persistence.O5, @plan.Persistence.V4,
              @plan.Persistence.V6, @plan.Persistence.V9
              ]

requirements
    R1  Records stay records
        source  @plan.Persistence.O4.
        must    ready() restores a compatible scope before actor work starts. Restored records stay
                records until an ensure, a subscription or a send reaches them, except an Owing
                identity (`model`: an owed record, a lane record whose `inFlight` is true, or a lane
                record holding a queue or displaced Attempts, whose endings the boot derives), which
                is restored live at ready and kept as work in flight until those turns run.

                The boot decodes the records, sorts them by record key so that the store's load
                order decides nothing, and picks whom to wake. It delivers nothing and parks nothing
                itself: each woken identity's start delivers (R3; @spec.Actors.R10). Decision
                (agent: the orchestrator, 2026-11-12): consult round 3, Part 2. Why: one delivery
                point gives a reload, a return and an adoption the same order. Reverse: restore R1
                from commit `9405af2f`.

                An Owing identity whose actor record is quarantined (R5) or reset (R7) at that boot,
                or absent because disposeActor removed it, is not restored live: its lanes stay
                unbound and its owed rows stay Waiting, and the incarnation an adopting ensure
                starts receives them. Decision (agent, 2026-11-11): audit C17. Why: R5's and R7's
                adopting ensure already handles such lanes, and waking a fresh actor nobody asked for
                would be invented state. Reverse: wake them fresh (spec-log.md, T42).

                A restored record is a new incarnation with new ids for the actor and every fragment
                incarnation. Restore never runs creation again or replays input or turns.

    R2  Context and resets at restore
        source  @plan.Persistence.O4.
        must    Saved context bindings select the same providers, the ones a consumer starts
                included, and set a silent baseline from each slot's saved last-seen value: a
                slot whose current value equals it gets no onContext event, so a reload of a
                consistent saved world hears none; one that differs gets the one wave of
                @spec.Actors.R9, at a reload as at a return. Each reaction's baseline is read again
                from its slot's saved value (@spec.Turn.R22). A writing 
                placement whose re-taken reset value differs from the
                recorded one resets as a pending reset, the first turn after restore, before the
                owed rows and the lane deliveries of R3 (round-14/step.ts, "a reset lost by the
                reload runs first"). I19 is this Requirement's check.

    R3  Delivery order at restore
        source  @plan.Persistence.O4.
        must    The incarnation's Start delivers (@spec.Actors `model`), the same way whatever began
                it. A pending reset (R2) runs before all of it. Then come the identity's owed rows, in the order they 
                were owed across all its
                lanes. Then, lane by lane in lane-id order, which is record-key order
                (@spec.WriteLanes `model`, Lane), come each queued commit's NotSent { Restored },
                when the lane record holds a queue, and last the Held head's unknown { Restored },
                once, unless a row for its Attempt is owed. So on every lane the ending that leaves
                a hold comes last. unknown { Restored } is derived at the Start; from then on it is
                a row like any other, owed to the identity and saved with its owed record
                (@spec.WriteAhead.R5). A lane record holds its queue and the Attempts of
                displaced heads whose endings are owed; the boot ends each queued commit NotSent {
                Restored } and each such displaced Attempt unknown { Restored }. A Releasing lane's Held head is 
                released at the Start instead of heard
                (@spec.WriteLanes `algorithm`, start).

                An Attempt acknowledged once ends unknown { Restored } even if its re-send was
                waiting or it was never invoked; a head with an owed row for its own Attempt hears
                that row, once. These come after readiness, before new external events and before
                continuing placements reconcile. A kill before a first send's batch lands restores
                the state before that turn, with no lane and no ending.

    R4  Data and placements after restore
        source  @plan.Persistence.O4.
        must    Restored resource data starts stale; key-only entries stay passive until a live
                placement supplies input, and input is never reconstructed from a key. Unobserved
                restored entries start gcTime at ready (collection itself is @spec.Reads.Q2, not yet specified). A live 
                placement re-opens from its restored
                input; old emissions never replay, and late results from old work cannot affect
                restored work. Finite resource requests never resume their old execution.

    R5  Record formats and undecodable records
        source  @plan.Persistence.O5.
        must    Restore is per record. Corrupt scope data that no record can be read from falls back
                to the last good capture, or starts fresh, and ready succeeds; a fresh start loses
                the scope's acknowledged Attempts and their holds (a stated limit).

                Each older record format reaches the current one by a pure step at the boot; a
                newer, null or non-integer format is quarantined, its lane still holding by its id.
                Format 3 is current. Format 2's step turns each baseline's own memory copy into a
                shared one. Format 1's step reads each tagged last-seen value back through its slot's
                Schema (one the Schema refuses, or saved unknown, was never selected) and reads each
                reaction's baseline again from the record's own slots and memory; a form no release
                wrote quarantines the record. Saved baselines that do not match the machine's
                reactions in number are read the same way. A Schema whose decode throws quarantines
                its record as a refusal does; the boot goes on.
                A text that is not the record's canonical encoding (@spec.Codec.R3) is quarantined
                too. Each record names an identity in its content; it is read only when that
                identity is one a ref of its identity version could give (never a local actor's
                name, @spec.WriteAhead.I3; a name that identity decodes and whose input names it
                back), its machine is declared, and its key is the key that identity's record of
                this kind is saved under. A lane's key also carries its operation, which the machine
                declares, and its key text, which reads by that operation's key fields and names
                itself back, and is the text a Held head's input gives. An owed row's operation is
                its machine's, and a lane it names is that identity's lane of that operation. Any
                other record is quarantined, so no record speaks for an identity its key does not
                name. An owed row naming an Attempt the identity never made cannot be told from a
                real one. A quarantined record keeps its bytes
                until the identity writes that record again: an actor's first save, an owed record's next change, a 
                lane's cancel. Until
                then a quarantined lane or owed record is reported RecordUndecodable at each boot;
                its head and rows cannot be read, so none is heard, and the report stands in for
                them.

                An actor record that does not decode is quarantined:

                - it reads lifecycle quarantined with its issue;
                - an ensure starts fresh, reports RecordUndecodable (proposed name) and adopts the
                identity's lanes;
                - when that fresh start is itself refused, the actor has no snapshot (`getSnapshot()`
                is none), RecordUndecodable names it, and a Story's read of it fails the test;
                - the fresh actor's first save overwrites the quarantined bytes (the runner's
                ruling).

                Lane records decode by their contract's input pick, independent of the actor record.

    R6  Versions at the boot
        source  @plan.Persistence.O5; identity versions as @spec.Actors.R11 defines them.
        must    A saved actor record of another identity version is listed (OldVersionActor,
                proposed name), never renamed, and removed by forget; its lanes are re-keyed to
                key#identityTag (LaneRekeyed, proposed name), kept, blocking nothing, and listed
                UnboundLane (proposed name) at each boot.

                A release that makes the old identity current again hands the key's lane back unless
                it is taken; the old identity's unknown hold (held when that identity was current;
                re-keyed, it blocks nothing, @spec.WriteLanes.R11) has no user exit and ends only by
                its own ending (a stated limit). A lane of an older key fingerprint is an old-version
                hold, reported at each boot as OldVersionLane, and declines its operation's commits
                for that identity NotSent { OldVersion }.

    R7  Saved-shape resets
        source  @plan.Persistence.O5.
        must    Each definition's records are reset automatically, decided per record (the runner's
                ruling), when the saved shape (state ids, memory fields with their Schema versions,
                fragments' under their id) differs incompatibly. Incompatible means a field both
                keep with another Schema version, or a saved state or fragment the release lacks
                (round-14/durable.ts, shapeReset); an added or dropped field or an added state is
                compatible. When incompatible, the record is removed at the boot
                with its deadlines, reported as one RecordShapeChanged (proposed name) per
                definition with its count. Its owed rows, a stopped read's Interrupted included,
                stay owed (@spec.WriteLanes.R12).

                The identity check comes first; a record with no shape stamp never resets. Any
                structural Schema change to a stored field is another Schema version, so it resets
                the record, a harmless validation change included (the runner's ruling; a stated
                price). Its writes in flight are
                kept, and each boot reports a head whose record was reset or does not read as
                HoldWithoutRecord (proposed name).

                A field the record has and the release lacks is dropped with FieldDropped (proposed
                name) once the record is known to restore, and the record is rewritten at that boot.

    R8  Lane quarantine
        source  @plan.Persistence.O5.
        must    A lane whose key no longer decodes, or whose path the placement cannot produce, is
                quarantined: it keeps its id and hold, a commit on its key declines NotSent {
                Rejected }, it is listed and reported at each boot, and a cancel on that key clears
                it. Such a lane's record still reads, so its Held head is heard at a start like any
                other head (@spec.WriteLanes `algorithm`, start); one R5 quarantines is not read.

                A lane is (identity, contract id, key) and names no operation (@spec.WriteLanes.R6),
                and a contract has at most one write operation (SharedContract). The lane record
                still stores the operation's name as data, which is not part of the lane's identity.
                So when a lane record's `operation` is gone, the boot rewrites it to the contract's write operation
                (OpRenamed, proposed name) if the contract still has one; a rename cannot collide.
                If the contract has none, the lane is quarantined, and forget drops its hold with
                HoldForgotten (proposed name). LaneRekeyCollision (proposed name) belongs only to
                R6's identity-version re-key: a re-key onto an existing record is refused, the mover
                quarantined and nothing overwritten.

                Actor records for a machine no entry declares are discarded with a diagnostic and
                their lanes quarantined (the runner's ruling). There is no key-equality adoption.

    R9  Storage failures
        source  @plan.Persistence.O5.
        must    A storage read failure reports StorageFailure and disables persistence for that
                Runtime, so unread saved data is never overwritten. A failed write keeps live
                committed state and the last good capture, never fails a committed turn, and a later
                publication retries the newest state.

                Memory that cannot encode skips its batch with UnencodableValue, decided at the Capture. Failures reach
                diagnostic observers; a failing inspection sink cannot interrupt persistence.

    R10  Forgetting a scope
        source  @plan.Persistence.O5.
        must    runtime.dispose({ forget: true }) waits until the scope's data is unrestorable and
                deleted before releasing ownership; a failed deletion reports StorageFailure and
                never claims success; so does a forget while the disposal's own write is still
                unanswered, since that write may land after the deletion, and so does, with no I/O,
                a forget by a Runtime that never booted or whose load failed (R9), which never owned
                what it would delete. Ordinary disposal keeps saved data. A Runtime without
                persistence performs no forget I/O.

open
    Q1  Executable checks are not built.
        outcome  Each test below is written, when its slice is built, as the cheapest check that fully
                 covers it (a compile-time test, a run rule applied to every Story run, a Story test or
                 a pure core test) in packages/flow-state-v3/tests/, and each rule gets a planted fault
                 in tests/faults.ts that `nub run faults` must catch. Until then every Requirement's evidence
                 is open.

    Q2  OpRenamed, LaneRekeyCollision, the undeclared-machine discard and FieldDropped's rewrite have no planted fault 
        yet.
        outcome  Each gets a planted fault when built.

    Q3  I19's check was listed under @task.V3.T20, but resets are @task.V3.T56's since the split.
        outcome  @task.V3.T56 builds I19's check (Spec test T5).

model
    Boot = one ready() of a persistent Runtime: read, upgrade formats, check versions and shapes,
        quarantine, then install.

    Owing = an identity with an owed record, with a lane record whose head is not Held (Acknowledging to
        Cancelling on disk: its `inFlight` is true, @spec.WriteAhead.R5), or with a lane record holding a queue or
        displaced Attempts, whose endings the boot derives (R3). A lane record of a Held head with neither wakes no
        one.

    HoldLeaving = an ending after which its lane stays Held (unknown).

invariants
    I1  After ready, the live incarnations restored from records are exactly the Owing identities whose actor record 
        restores at that boot; an Owing identity whose record is quarantined or reset has no live incarnation and its
        endings stay parked until an adopting ensure; every other record is still only a record. [@R1]

    I2  No restore, return or adoption re-runs a turn. (Creation is @spec.Compile.I8's; re-sends are 
        @spec.WriteLanes.I1's.) [@R1, @R4]

    I5  Per lane, deliveries at restore follow: that lane's owed rows in the order they were owed, then queued NotSent 
        { Restored }, then at most one HoldLeaving ending, last; across lanes, every owed row comes before any ending
        derived at the Start. [@R3]

    I6  An Acknowledged Attempt with no owed row is delivered unknown { Restored } exactly once per incarnation; one 
        with an owed row for its Attempt is delivered that row's ending, never also unknown { Restored }. [@R3]

    I7  Restore deliveries precede every external event admitted after ready. [@R3]

    I8  A Runtime killed before a first send's batch landed restores with no lane for it. [@R3]

    I9  Restored resource data is stale, and no input is ever built from a key. [@R4]

    I10  One record failing to decode never prevents another from restoring, and ready succeeds. [@R5]

    I11  A quarantined record's bytes are unchanged until a fresh actor of that identity saves. [@R5]

    I12  A record of a non-current identity version is never restored as current and never renamed. [@R6]

    I13  Lanes are never dropped by a version, shape or quarantine rule; only cancel, an adopting ensure, forget of a 
         gone operation's hold, or R5's stated fresh start ends them. [@R5, @R6, @R7, @R8]

    I14  A reset record is removed with its deadlines; records of other definitions and stamp-less records are 
         untouched. [@R7]

    I15  A quarantined lane's key admits no new commit until it is cleared. [@R8]

    I16  After a read failure, no write to that scope happens in that Runtime. [@R9]

    I17  A storage failure never changes committed live state. [@R9]

    I18  dispose({ forget: true }) resolves success only after deletion is confirmed. [@R10]

    I19  A writing placement whose re-taken reset value differs from its recorded one runs its reset as the first turn 
         after restore, before any owed row or lane delivery of that incarnation. (A silent context baseline is
        @spec.Turn.R22's.) [@R2]

    I20  A lane record whose `operation` is gone is rewritten to its contract's write operation when the contract has 
         one, and quarantined otherwise; no such rewrite overwrites or collides with another lane. [@R8]

composition
    flow
        Design note, proved by the prototype. Restore is per record and runs in the core at
        the boot: format steps, version and shape checks, quarantine, then installation of the
        Owing identities (packages/flow-state-v3/prototypes/round-14/durable.ts); the step
        decides which records wake (round-14/step.ts).

        Boot and start, design agreed by the user, 2026-11-12 (consult round 3, Part 2). The
        boot decodes, sorts by record key and wakes each Owing identity; it parks nothing. The
        ledger's start (@spec.WriteLanes `algorithm`) is the one delivery point for reload,
        return and adoption, and derives unknown { Restored } there.

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I19]
        open_by      [@Q1, @Q3]

    @R3
        enforced_by  [@I5, @I6, @I7, @I8]
        open_by      [@Q1]

    @R4
        enforced_by  [@I2, @I9]
        open_by      [@Q1]

    @R5
        enforced_by  [@I10, @I11]
        open_by      [@Q1]

    @R6
        enforced_by  [@I12, @I13]
        open_by      [@Q1]

    @R7
        enforced_by  [@I13, @I14]
        open_by      [@Q1, @Q2]

    @R8
        enforced_by  [@I13, @I15, @I20]
        open_by      [@Q1, @Q2]

    @R9
        enforced_by  [@I16, @I17]
        open_by      [@Q1]

    @R10
        enforced_by  [@I18]
        open_by      [@Q1]

tests
    T1  Records stay records: a plain record stays a record at ready; an Owing one is woken, and a lane record of a 
        Held head alone wakes no one.
            Planted faults: ready wakes every record; ready leaves an Owing one asleep. [@I1]
    T2  Delivery order: a reload hears each queued commit before the Held head; owed rows come first, then lanes in 
        record-key order; parked endings keep saved order.
            Planted faults: the head restored before its queued commit; lanes restored newest first; a Held head
            whose queued commit hears nothing. [@I5]
    T3  Restored endings: an acknowledged head restores unknown { Restored }, a queued commit NotSent { Restored }, a 
        parked ending as itself, each once.
            Planted faults: a head restored NotSent; a queued commit restored unknown; a parked ending turned into
            Restored; an adopted ending heard twice. [@I6, @I7]
    T4  Kill points: kill before and after a first send's batch lands; before, no lane and the state before the turn; 
        after, unknown { Restored }. [@I8]
    T5  Stopped reads and resets after reload: a stopped read is heard after a reload; a reset a reload lost runs at 
        the boot. Planted fault: a reload that drops the stopped read. [@I2, @I19]
    T6  Record formats: every record states its format; an older format restores through the pure step, its timers read 
        as `dueAt`; the current format restores as written, a `left` timer included; a newer, null,
            fractional or string format is quarantined and its lane still holds.
                Planted faults: a null format read as 1; a fraction floored; a string coerced; a newer format read; an
                old timer read as `left`.
                [@I10, @I13]
    T7  Undecodable records: memory that cannot decode is quarantined; the fresh actor over it is saved. Planted 
        faults: undecodable memory kept; the fresh actor never saved. [@I10, @I11]
    T8  Versions: an old-version record is listed, not restored; a release that changes a key keeps the old-version 
        hold with LaneRekeyed evidence.
            Planted faults: an old-version record taken as undecodable; a rekey with no evidence. [@I12, @I13]
    T9  Saved-shape resets: only the changed definition resets; a removed state resets and an ensure adopts the hold; a 
        record with no stamp never resets.
            Planted faults: a removed state ignored; a retired record not reset; an unstamped record that resets;
            an unchanged or compatible definition that resets; every definition resets; a hold with no record that
            is silent. [@I14]
    T10  Lane quarantine: a quarantined lane declines commits on its key and a cancel clears it; it is not erased at 
         the boot. Planted faults: a cancel that keeps the quarantine; a quarantined lane erased at the boot. [@I15]
    T11  Storage failures: a failed read runs empty and writes nothing. A failed write keeps live state; a later 
         publication retries the newest. [@I16, @I17]
    T12  Forgetting a scope: deletion confirmed before success; a failing deletion, or a forget over the disposal's 
         unanswered write, reports StorageFailure. Planted faults: a forget that deletes nothing; a forget over an
             unanswered write. [@I18]
    T13  Fresh ids after restore: after a reload, every incarnation id and Attempt id minted differs from every id in 
         the restored records. Planted fault: a mint floor set from the head only. [@spec.Actors.I13,
             @spec.WriteLanes.I6]
    T14  Restored data is stale: a restored resource entry reads stale, a live placement refetches it with its own 
         input, and a key-only entry starts nothing. A planted fault is written with this test.
             [@I9]
    T15  A renamed operation: a lane record whose operation name is gone, over a contract that still has a write 
         operation, restores under it with OpRenamed; over a contract with none, it is quarantined and forget drops
             its hold. No planted fault yet (Q2). [@I20]
