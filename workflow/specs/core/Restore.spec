spec Restore
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
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
                records until an ensure, a subscription or a send reaches them, except an identity
                whose captured lanes owe it an ending (a lane InFlight at capture, or a parked
                ending), which is restored live at ready and kept as work in flight until those
                turns run.

                An owed identity whose actor record is quarantined (R5) or reset (R7) at that boot
                is not restored live: its lanes stay unbound with their endings parked, and the
                incarnation an adopting ensure starts receives them. Decision (agent, 2026-11-11):
                audit C17 (spec-log.md, T42).

                A restored record is a new incarnation with new ids for the actor and every fragment
                incarnation. Restore never runs creation again or replays input or turns.

    R2  Context and resets at restore
        source  @plan.Persistence.O4.
        must    Saved context bindings select the same providers and set a silent baseline, with no 
                onContext event. A writing placement whose re-taken reset value differs from the 
                recorded one resets as a pending reset, the first turn after restore, before the 
                lane deliveries.

    R3  Delivery order at restore
        source  @plan.Persistence.O4.
        must    Per lane in creation order, the incarnation receives the parked endings in saved
                order; on a reload, each queued commit's NotSent { Restored } first, then a Held
                head's unknown { Restored } once (unless its outcome was saved), so the ending that
                leaves a hold comes last.

                An Attempt acknowledged once ends unknown { Restored } even if its re-send was
                waiting or it was never invoked; a head whose own ending is parked restores as that
                ending, once. These come after readiness, before new external events and before
                continuing placements reconcile. A kill before a first send's batch lands restores
                the state before that turn, with no lane and no ending.

    R4  Data and placements after restore
        source  @plan.Persistence.O4.
        must    Restored resource data starts stale; key-only entries stay passive until a live 
                placement supplies input, and input is never reconstructed from a key. Unobserved 
                restored entries start gcTime at ready. A live placement re-opens from its restored 
                input; old emissions never replay, and late results from old work cannot affect 
                restored work. Finite resource requests never resume their old execution.

    R5  Record formats and undecodable records
        source  @plan.Persistence.O5.
        must    Restore is per record. Corrupt scope data that no record can be read from falls back
                to the last good capture, or starts fresh, and ready succeeds; a fresh start loses
                the scope's acknowledged Attempts and their holds (a stated limit).

                Each older record format reaches the current one by a pure step at the boot; a
                newer, null or non-integer format is quarantined, its lane still holding by its id.

                An actor record that does not decode is quarantined:

                - it reads lifecycle quarantined with its issue;
                - an ensure starts fresh, reports RecordUndecodable (proposed name) and adopts the
                identity's lanes;
                - the fresh actor's first save overwrites the quarantined bytes (the runner's
                ruling).

                Lane records decode by their contract's input pick, independent of the actor record.

    R6  Versions at the boot
        source  @plan.Persistence.O5; identity versions as the Actors Spec's R11 defines them.
        must    A saved actor record of another identity version is listed (OldVersionActor,
                proposed name), never renamed, and removed by forget; its lanes are re-keyed to
                key#identityTag (LaneRekeyed, proposed name), kept, blocking nothing, and listed
                UnboundLane (proposed name) at each boot.

                A release that makes the old identity current again hands the key's lane back unless
                it is taken; the old identity's unknown hold has no user exit and ends only by its
                own ending (a stated limit). A lane of an older key fingerprint is an old-version
                hold, reported at each boot as OldVersionLane, and declines its operation's commits
                for that identity NotSent { OldVersion }.

    R7  Saved-shape resets
        source  @plan.Persistence.O5.
        must    Each definition's records are reset automatically, decided per record (the runner's
                ruling), when the saved shape (state ids, memory fields with their Schema versions,
                fragments' under their id) differs incompatibly: the record is removed at the boot
                with its deadlines and stopped reads, reported as one RecordShapeChanged (proposed
                name) per definition with its count.

                The identity check comes first; a record with no shape stamp never resets. Any
                structural Schema change to a stored field resets the record, a harmless validation
                change included (the runner's ruling; a stated price). Its writes in flight are
                kept, and each boot reports a head whose record was reset or does not read as
                HoldWithoutRecord (proposed name).

                A field the record has and the release lacks is dropped with FieldDropped (proposed
                name) once the record is known to restore, and the record is rewritten at that boot.

    R8  Lane quarantine
        source  @plan.Persistence.O5.
        must    A lane whose key no longer decodes, whose operation is gone, or whose path the
                placement cannot produce is quarantined: it keeps its id and hold, a commit on its
                key declines NotSent { Rejected }, it is listed and reported at each boot, and a
                cancel on that key clears it (with no operation, forget drops its hold with
                HoldForgotten, proposed name).

                A lane whose operation name is gone moves to the one write operation over its
                contract (OpRenamed, proposed name); a move onto an existing record or another move
                is refused with LaneRekeyCollision (proposed name), the mover quarantined and
                nothing overwritten.

                Actor records for a machine no entry declares are discarded with a diagnostic and
                their lanes quarantined (the runner's ruling). There is no key-equality adoption.

    R9  Storage failures
        source  @plan.Persistence.O5.
        must    A storage read failure reports StorageFailure and disables persistence for that
                Runtime, so unread saved data is never overwritten. A failed write keeps live
                committed state and the last good capture, never fails a committed turn, and a later
                publication retries the newest state.

                Memory that cannot encode skips its batch with UnencodableValue. Failures reach
                diagnostic observers; a failing inspection sink cannot interrupt persistence.

    R10  Forgetting a scope
        source  @plan.Persistence.O5.
        must    runtime.dispose({ forget: true }) waits until the scope's data is unrestorable and 
                deleted before releasing ownership; a failed deletion reports StorageFailure and 
                never claims success. Ordinary disposal keeps saved data. A Runtime without 
                persistence performs no forget I/O.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  OpRenamed, LaneRekeyCollision, the undeclared-machine discard, FieldDropped's rewrite and dispose({ forget: 
        true }) have no prototype wrong runtime.
        outcome  Phase 3 writes them.

model
    Boot = one ready() of a persistent Runtime: read, upgrade formats, check versions and shapes, 
        quarantine, then install.

    Owed = an identity with a lane InFlight at capture or a parked ending.

    HoldLeaving = an ending after which its lane stays Held (unknown).

invariants
    I1  After ready, the live incarnations restored from records are exactly the Owed identities whose actor record 
        restores at that boot; an Owed identity whose record is quarantined or reset has no live incarnation and its 
        endings stay parked until an adopting ensure; every other record is still only a record. Reworded 2026-11-11 
        (audit C17). [@R1]

    I2  No restore, return or adoption re-runs a turn. (Creation is Compile Spec I8's; re-sends are WriteLanes Spec 
        I1's.) [@R1, @R4]

    I5  Per lane, deliveries at restore follow: parked endings in saved order, then queuedNotSent { Restored }, then at 
        most one HoldLeaving ending, last. [@R3]

    I6  An Acknowledged Attempt with no saved outcome is delivered unknown { Restored } exactly once per incarnation; 
        one with a parked outcome is delivered that outcome, never also unknown { Restored }. [@R3]

    I7  Restore deliveries precede every external event admitted after ready. [@R3]

    I8  A Runtime killed before a first send's batch landed restores with no lane for it.[@R3]

    I9  Restored resource data is stale, and no input is ever built from a key. [@R4]

    I10  One record failing to decode never prevents another from restoring, and ready succeeds. [@R5]

    I11  A quarantined record's bytes are unchanged until a fresh actor of that identity saves. [@R5]

    I12  A record of a non-current identity version is never restored as current and never renamed. [@R6]

    I13  Lanes are never dropped by a version, shape or quarantine rule; only cancel, an adopting ensure, forget of a 
         gone operation's hold, or R5's stated fresh start ends them. [@R5, @R6, @R7, @R8]

    I14  A reset record is removed with its deadlines; records of other definitions and stamp- less records are 
         untouched. [@R7]

    I15  A quarantined lane's key admits no new commit until it is cleared. [@R8]

    I16  After a read failure, no write to that scope happens in that Runtime. [@R9]

    I17  A storage failure never changes committed live state. [@R9]

    I18  dispose({ forget: true }) resolves success only after deletion is confirmed. [@R10]

    I19  A writing placement whose re-taken reset value differs from its recorded one runs its reset as the first turn 
         after restore, before any lane delivery of that incarnation. Added 2026-11-11: R2's reset rule, once the cut 
         I4 left R2 with no Invariant (a silent context baseline is Turn Spec I28's). [@R2]

composition
    flow
        Design note, proved by the prototype. Restore is per record and runs in the core at
        the boot: format steps, version and shape checks, quarantine, then installation of the
        Owed identities (packages/flow-state-v3/prototypes/round-14/durable.ts); the step
        decides which records wake (round-14/step.ts).

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I19]
        open_by      [@Q1]

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
        enforced_by  [@I13, @I15]
        open_by      [@Q1, @Q2]

    @R9
        enforced_by  [@I16, @I17]
        open_by      [@Q1]

    @R10
        enforced_by  [@I18]
        open_by      [@Q1, @Q2]

tests
    T1  Records stay records: a plain record stays a record at ready; an Owed one is woken. Case `LIFE-18`; wrong 
        runtimes `life.ready-all-live`, `life.ready-owed-sleeps`. [@I1]
    T2  Delivery order: a reload hears each queued commit before the Held head; held lanes restore in creation order; 
        parked endings keep saved order. Cases `R15-02`, `R14-FIX-01`, `REV9-EDGE`, `REV5-H5H6`; wrong runtimes 
        `1b.r44-restore-head-before-w`, `audit-1.restore-lanes-newest-first`, `misc.held-head-w-hears-nothing`. [@I5]
    T3  Restored endings: an acknowledged head restores unknown { Restored }, a queued commit NotSent { Restored }, a 
        parked ending as itself, each once. Cases `PAY-15`, `PAY-16`, `REV8-H1`, `R14-FIX-01`; wrong runtimes 
        `durable.head-restores-not-sent`, `durable.w-restores-unknown`, `pay16.parked-ending-becomes-restored`, 
        `misc.adopted-ending-twice`. [@I6, @I7]
    T4  Kill points: kill before and after a first send's batch lands; before, no lane and the
            state before the turn; after, unknown { Restored }. Case `PAY-09`. [@I8]
    T5  Stopped reads and resets after reload: a stopped read is heard after a reload; a reset a reload lost runs at 
        the boot. Cases `LIFE-13`, `REAL-04`; wrong runtime `d1.reload-drops-stopped`. [@I2, @I19]
    T6  Record formats: every record states its format; format 1 restores as it was; a newer, null, fractional or 
        string format is quarantined and its lane still holds. Case `P1-M`; wrong runtimes `m1.null-format-as-1`, 
        `m1.fraction-format-floors`, `m1.string-format-coerced`, `m1.newer-format-read`. [@I10, @I13]
    T7  Undecodable records: memory that cannot decode is quarantined; the fresh actor over it is saved. Cases `P1-M`, 
        `REV8-PINS`; wrong runtimes `p1m.undecodable-memory-kept`, `m1.fresh-never-saved`. [@I10, @I11]
    T8  Versions: an old-version record is listed, not restored; a release that changes a key keeps the old-version 
        hold with LaneRekeyed evidence. Cases `R14-ID-02`, `REV6-H5`, `R12-KEYS`; wrong runtimes 
        `audit-1.old-version-record-as-undecodable`, `d78-no-evidence`. [@I12, @I13]
    T9  Saved-shape resets: only the changed definition resets; a removed state resets and an ensure adopts the hold; a 
        record with no stamp never resets. Case `P1-M`; wrong runtimes `m2.q1-state-gone-ignored`, 
        `m2.q1-retired-record-not-reset`, `m2.q1-unstamped-record-resets`, `q1a.unchanged-resets`, 
        `q1a.compatible-resets`, `q1a.every-definition-resets`, `p1m.hold-without-record-silent`. [@I14]
    T10  Lane quarantine: a quarantined lane declines commits on its key and a cancel clears it; it is not erased at 
         the boot. Wrong runtimes `m1.quarantine-cancel-keeps`, `m1.quarantined-lane-erased-at-boot`. [@I15]
    T11  Storage failures: a failed read runs empty and writes nothing. Case `REV7-M2`. A failed write keeps live 
         state; a later publication retries the newest. [@I16, @I17]
    T12  Forgetting a scope: deletion confirmed before success; a failing deletion reports StorageFailure. No prototype 
         case (Q2). [@I18]
    T13  Fresh ids after restore: after a reload, every incarnation id and Attempt id minted differs from every id in 
         the restored records. Case `REV8-PINS`; wrong runtime `durable.mint-floor-head-only`. [@spec.Actors.I13, 
         @spec.WriteLanes.I6]
    T14  Restored data is stale: a restored resource entry reads stale, a live placement refetches it with its own 
         input, and a key-only entry starts nothing. No prototype case; phase 3 writes this test and its wrong runtime. 
         [@I9]
