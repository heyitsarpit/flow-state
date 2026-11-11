spec WriteLanes
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      Outcome, Attempt, O.x.commit, O.x.retry, O.x.cancel, O.x.cancelAll,
              O.x.idle, O.x.retryable, O.x.get
derives_from  [
              @plan.Operations.O3, @plan.Operations.O7, @plan.Operations.V6,
              @plan.Operations.V8
              ]

requirements
    R1  Commit admission
        source  @plan.Operations.O3.
        must    Only an accepted action admits O.x.commit(select, { optimistic? }); activation,
                restore, hydration and state re-entry never replay a commit. select reads the turn's
                after memory and the event.

                The operation's writes option applies only on success, before its ending's event,
                even after the issuing state exits; invalid success writes apply nothing and report
                InvalidWrite while the commit still succeeds; a success write never overwrites data
                that landed after the commit started and marks that entry stale instead.

    R2  Three channels
        source  @plan.Operations.O3.
        must    A commit ends success, failure (this send definitely did not do it) or unknown (it
                may have happened), as the commit function classifies it with Outcome; a plain error
                is a failure; a throw or die is unknown { Defect } with the Cause and an actor
                issue. Flow never makes up a definite ending: a success, or a failure other than
                Flow's NotSent, is always the classification of an answer a send of that Attempt
                received. Decision (agent, 2026-11-11): ruling M5 (spec-log.md, T42).

                The runtime classifies each send from the fiber's Exit and whole Cause, outside that
                fiber, Flow's own knowledge first, then most cautious first. The ending delivered is
                the Attempt's: a definite failure after an unknown send of the same Attempt is
                unknown StillUnknown { failure }.

    R3  Flow's reserved reasons
        source  @plan.Operations.O3.
        must    Flow's endings are the failure NotSent { why } (Cancelled, Restored, Rejected,
                Overloaded, StorageRefused, Disposed, NoPersistence, OldVersion, Unencodable,
                ModuleDisabled (proposed name)) and the unknowns Cancelled, Restored, Interrupted,
                Defect, StillUnknown { failure }, StorageRefused, Disposed and Abandoned (proposed
                name).

                Superseded, NothingToResend, InFlight and Released are evidence, never endings.
                There is no timeout reason. An author tag equal to a Flow reason is refused
                (ReservedReason, proposed name).

    R4  Mapping endings
        source  @plan.Operations.O3.
        must    The operation maps success:, failure: (exhaustive over the commit's failure tags,
                NotSent optional) and unknown: (one event, or a record by tag over the commit's own
                unknown tags and Flow's) onto declarer events; mappers receive (value, { input,
                attempt, progress, key }).

                A bare operation maps nothing: its endings are evidence. An unknown that is not
                retained (bare, ignored, or under the cancel concurrency policy once its own
                ending's turn ends) is released, and the store hears Released. The O.x.cancel
                member's unknown { Cancelled } is retained (R14).

    R5  The Attempt
        source  @plan.Operations.O3.
        must    Every admitted commit has an Attempt { id, operation, key, input, retryCount,
                mayHaveApplied }. Flow mints id when the write starts.

                The id is unique across devices and scopes and never reused within a scope, because
                a server may use it as its idempotency key; the mint draws on entropy the host
                supplies as data at boot (a random session seed), so the core stays deterministic
                given its inputs and replays exactly (the runner's ruling). Every boot asks the host
                for a fresh seed; a seed is never restored from disk or carried to a later boot, so
                ids stay unique across restore without reading every id off disk. Decision (agent,
                2026-11-11): audit gap G4 (spec-log.md, T42).

                Every send of that write carries the same id and input. The commit author puts id on
                the wire where the API expects it; Flow sends nothing itself and derives no other
                key. `retryCount` counts invoked re-sends; `mayHaveApplied` says an earlier send
                ended unknown. A definite failure resolves the Attempt; trying again is a new write
                with a new id.

    R6  The lane
        source  @plan.Operations.O3.
        must    A write lane is (identity with its version, contract id, key), owned by the Runtime,
                created by work and removed when Idle and holding no kept ending. Its states are
                Idle, InFlight (one addressable Attempt waiting to be invoked or on the wire) and
                Held (a retained unknown), each with queued commits W: none under reject, at most
                one under latest, a FIFO of at most 64 under serialize.

                A kept ending (Actors Spec R15) is a value on its lane: the lane exists while it
                stands, and commits on its key act as on a non-Idle lane. Decision (agent,
                2026-11-11): ruling CQ3 (spec-log.md, T42).

                A turn's members apply to lanes in action order in validation.

    R7  Concurrency cells
        source  @plan.Operations.O3.
        must    commit on Idle mints an Attempt.

                On InFlight or Held:

                - reject ends NotSent { Rejected } and the transition runs;
                - latest queues one commit, ending a previous queued commit or a never-invoked head
                Superseded (evidence);
                - serialize appends to W and past 64 ends NotSent { Overloaded };
                - cancel interrupts the previous Attempt, whose ending is evidence unless a cancel
                is pending on it (R14). Decision (agent, 2026-11-11): CQ9 (spec-log.md, T42).

    R8  Retry, holds and promotion
        source  @plan.Operations.O3.
        must    retry(k?) re-sends a Held Attempt with its id and input unchanged; on InFlight it is
                evidence InFlight, on Idle or resolved NothingToResend. A retry accepted on a Held
                lane is owed: it re-sends exactly once, unless a later member of its turn, a
                release, a disposal or a refused lane-record capture (WriteAhead Spec R13) ends or
                holds the head first.

                When the addressable Attempt is resolved, released or superseded (R7's latest), W's
                head is promoted; an unknown, a retry and a restore never promote. Decision (agent,
                2026-11-11): rulings CQ7 and the owed retry (spec-log.md, T42).

                Every Attempt minted, promoted or re-sent is invoked after its turn ends, once its
                acknowledgement and record queues allow. An unknown holds the lane until retry
                resolves it or cancel releases it: no quiet release, no automatic retry. A kept
                ending blocks its key until heard or let go.

    R9  Members and keys
        source  @plan.Operations.O3.
        must    idle(k?) denies InFlight on InFlight and Uncertain on Held; a partial key passes
                only when every lane it matches is Idle. retryable(k?, { times }) passes in Held
                while `retryCount` < times, else RetryLimit { retryCount }, and denies InFlight or
                NothingToResend.

                On an unkeyed operation a key-less member names its one lane. On a keyed operation
                retry, retryable and cancel may omit the key only in a handler of an event that
                operation alone maps, naming that ending's own Attempt; elsewhere a key-less member
                is KeyRequired. idle and get always take a key on a keyed operation.

    R10  Exactly one delivery
        source  @plan.Operations.O3.
        must    Every commit, and every retry that sends, delivers its ending to a live incarnation
                of its identity with the lane's subject path, or parks it for that incarnation,
                exactly as I15 counts. A settled ending is never rewritten. An ending whose turn
                is refused, a throw from its outcome mapper at admission included, is redelivered
                once after queued mail; a second refusal ends its tries until the next boot or adoption, each
                of which gives one try (Actors Spec R15). Decision (agent, 2026-11-11): ruling CQ1
                (spec-log.md, T42).

                Every admitted commit ends: it waits (to be invoked, on the wire, or queued) or is
                Held until it gets exactly one ending, delivered, parked or recorded as evidence;
                none disappears without one.

                Evidence by declaration: a replaced never-sent commit, a released lookup, a declined
                retry, a bare write's endings, an ending mapped to Flow.ignore, the interrupted
                Attempt under concurrency cancel with no cancel pending on it, a fragment's lookup whose incarnation 
                ended, and a
                releasing lane's endings and queued commits.

    R11  Old-version holds
        source  @plan.Operations.O3.
        must    A lane of an older key fingerprint is an old-version hold: until it ends, every
                commit of that operation for that identity declines NotSent { OldVersion } under
                every policy, and a keyed idle denies.

                A lane of an older identity version is not a hold: the boot re-keys it and it blocks
                nothing (Restore Spec R6). previous: [{ key }] gives O.x.previous[i].retry, cancel
                and retryable, which name only previous[i]'s lanes; a current member never names an
                old-version lane; a previous key equal to the current one is refused
                (PreviousIsCurrent, proposed name); on a fragment operation another path's Rejected
                comes before OldVersion.

    R12  Values with no form and missing persistence
        source  @plan.Operations.O3.
        must    A commit whose input or key cannot encode declines NotSent { Unencodable }; its 
                transition runs and its mapper receives the value the turn asked to send. A 
                persisted identity's commit in a Runtime without persistence ends NotSent { 
                NoPersistence }. A reset of the actor's record keeps its lanes, holds and parked 
                endings unbound until an adopting ensure.

    R13  Domain writes at the lane
        source  @plan.Operations.O3.
        must    A domain write's store effects publish at settlement, before its ending is queued, 
                so store effects never depend on whether the ending routes current or late. The 
                record queue, its Overloaded bounds (the record queue and the 4,096-item many key) 
                and ModuleDisabled belong to the entity store's Spec (phase 5).

    R14  cancel
        source  @plan.Operations.O7.
        must    O.x.cancel(k?) acts on the addressable Attempt by its history. On the wire it
                interrupts the fiber; unknown { Cancelled } is queued when the fiber exits and
                retained (Held). Waiting to be invoked: never sent, NotSent { Cancelled } and the
                next queued commit is promoted; a re-send returns to Held and is released.

                Held: released (evidence) and promoted. Idle: nothing, and no ending. While a
                never-sent Attempt's acknowledgement is being written, cancel waits for storage:
                stored ends NotSent { Cancelled }, refused NotSent { StorageRefused }; that wait is
                unbounded (stated limit). A pending cancel is never lost to a later replacement.

    R15  cancelAll
        source  @plan.Operations.O7.
        must    O.x.cancelAll(k?) ends every queued commit NotSent { Cancelled } in admission order
                (W's order; a queued commit has no Attempt id yet), then acts on the head as cancel
                does, promoting nothing; a Held lane ends Idle; the 
                head's ending, which leaves a hold, is delivered last.

    R16  Release on leave
        source  @plan.Operations.O7.
        must    A key-less O.x.cancel in whenAbandoned marks every lane of that operation for the 
                ending incarnation's subject path releasing, interrupts an Attempt on the wire, 
                ends queued commits as evidence, and applies later endings to the lane and store 
                without delivering them. A release wins over cancelAll in the same transition. This 
                is the only case where cancel drops a queued commit without an ending.

    R17  Cleanup
        source  @plan.Operations.O7.
        must    Planned release interrupts the fiber and runs finalizers once, without interrupt 
                endings. cancel on a one-off read releases the operation's wait, not the shared 
                request. Cleanup failure reports an issue without undoing a published transition. 
                After cleanup, late results cannot change data, lanes, endings or replacement work. 
                Actor disposal invokes nothing new and drops no lane (Actors Spec).

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  RetryLimit, a release winning over cancelAll, and Superseded as evidence have no prototype wrong 
        runtime. outcome Phase 3 writes them.

    Q3  R13's store-side rules (record queues, their bounds, ModuleDisabled) moved to the entity store area.
        outcome  They are written with the entity store's Spec in phase 5.

    Q4  The prototype mints counters floored at boot (round-14/durable.ts, round-14/step.ts), which are unique only per 
        scope and do not meet R5.
        outcome  Phase 4 builds the seeded mint; phase 3 writes the wrong runtime, a counter that 
                 collides across two devices.

model
    Lane = (identity with version, contract id, key) -> { state, head?, W }.

    State = Idle | InFlight | Held.

    Head = the addressable Attempt: the one retry and cancel name.

    Cell = (lane state, member or ending) -> next state, endings, evidence; the table of 
        machine-design 2.7.13.

    Delivered = for an Attempt a, the endings of a delivered to an incarnation, parked endings 
        counted once.

invariants
    I1  No commit is invoked except one admitted by an accepted action's member, or promoted, or re-sent by retry. 
        [@R1, @R8]

    I2  No success write is applied unless its commit succeeded, and none is applied after that ending's event is 
        admitted. Reworded 2026-11-11 from "iff" (audit C9). [@R1]

    I3  Every delivered ending is exactly one of success, failure and unknown; an Attempt that ever ended unknown never 
        delivers a definite failure; and an Attempt never sent ends only NotSent, or unknown { Restored } at a boot. 
        Decision (agent, 2026-11-11): ruling CQ5 (spec-log.md, T42). [@R2]

    I4  No delivered ending is an evidence kind, and no author tag equals a Flow reason. [@R3]

    I5  A not-retained unknown leaves no Held lane. (Its mapped target is Compile Spec I11's.) [@R4]

    I6  All sends of one Attempt carry the same id and the same input. No two writes share an id: within a Runtime, 
        across restore, or across Runtimes on different devices or scopes given different session seeds. Given the same 
        inputs and seed, the mint gives the same ids. [@R5]

    I7  retryCount equals the number of invoked re-sends of that Attempt. [@R5]

    I8  A lane exists iff it is not Idle or holds a kept ending; its W length is 0 under reject, at most 1 under 
        latest, at most 64 under serialize. Decision (agent, 2026-11-11): ruling CQ3 (spec-log.md, T42). [@R6, @R7]

    I9  Every retry and cancel on a lane acts on one Attempt: the one the lane's last send carried, or, before any 
        send, the head waiting to be invoked. Reworded 2026-11-11 (audit). [@R6]

    I10  A turn's members apply in action order, each to the lane state the previous one left. [@R6, @R9]

    I11  W's head is promoted only when the addressable Attempt is resolved, released or superseded. Decision (agent, 
         2026-11-11): ruling CQ7 (spec-log.md, T42). [@R8]

    I12  A Held lane leaves Held only by a retry's resolution, a cancel or cancelAll, a release on leave, forget of a 
         hold whose operation is gone (HoldForgotten, Actors Spec R21), or Restore Spec R5's stated fresh start. [@R8, 
         @R14, @R15, @R16]

    I13  idle(k) passes iff every lane matching k is Idle and holds no kept ending. [@R9]

    I14  A key-less member on a keyed operation names only the ending's own Attempt. [@R9]

    I15  Per Attempt and per incarnation, each ending is either delivered once (to a live incarnation, or parked for it 
         and delivered once) or recorded as evidence only, never both and never twice, with these exceptions written 
         out: a re-send whose lane-record capture is refused adds a second ending of the same Attempt, unknown { 
         StorageRefused }; unknown { Restored } is delivered at most once per incarnation, so once again after each 
         reload or return (Restore Spec I6); an ending whose turn is refused (InvalidTurn, an outcome mapper throw at 
         admission included) is delivered once more after queued mail, and a second refusal ends its tries until the 
         next boot or adoption, each of which gives it exactly one try with no redelivery after a refusal there (Actors 
         Spec R15); a releasing lane delivers nothing; evidence-only endings (a bare operation, Flow.ignore, 
         Superseded, the interrupted Attempt under concurrency cancel when no cancel is pending on it, a released 
         lookup) are recorded, never delivered. Re-parking is not a second delivery. Decision (agent, 2026-11-11): 
         rulings CQ1 and CQ9 (spec-log.md, T42). [@R10, @R16]

    I16  After a success or failure of an Attempt is delivered, no other ending of it is delivered. Reworded 2026-11-11 
         (audit). [@R10]

    I17  While an old-version hold (an older key fingerprint) exists for (identity, operation), no commit of it is 
         invoked: each declines NotSent { OldVersion }, or NotSent { Rejected } where R11 puts another path's Rejected 
         first; no current member names that lane; a lane of an older identity version declines nothing. [@R11]

    I18  A commit that cannot encode never fails its turn. [@R12]

    I19  A domain write's store effects precede its ending in the mailbox. [@R13]

    I20  A cancel's result depends only on the head's history, never on timing. [@R14]

    I21  cancelAll delivers queued NotSent { Cancelled } in admission order, then the head's ending; it promotes 
         nothing. [@R15]

    I23  After cleanup no late result changes data, lanes or endings. [@R17]

    I24  When a commit succeeds, its valid success write is applied, except over data that landed after the commit 
         started, which it marks stale instead; an invalid one applies nothing and reports InvalidWrite while the 
         commit still succeeds. Added 2026-11-11 (audit C9). [@R1]

    I25  A delivered success, or a delivered failure other than Flow's NotSent, matches an answer that a send of that 
         Attempt received from its adapter. Decision (agent, 2026-11-11): ruling M5 (spec-log.md, T42). [@R2]

    I26  A retry accepted on a Held lane is followed by exactly one invocation of that Attempt, with the same id and 
         input, unless a later member of its turn, a release, a disposal or a refused lane-record capture ends or holds 
         the head first. Decision (agent, 2026-11-11): the owed-retry ruling (spec-log.md, T42). [@R8]

    I27  Every admitted commit, at every quiescent point, is waiting (to be invoked, on the wire, or queued), Held, or 
         has exactly one ending delivered, parked or recorded as evidence; and a call that settles gives its Attempt an 
         ending. Added 2026-11-11 (audit G1, @plan.Operations.O3). [@R8, @R10]

    I28  Every boot mints from a seed the host supplied for that boot, never from a seed restored from disk or used by 
         an earlier boot. Added 2026-11-11 (audit G4). [@R5]

composition
    flow
        Design note, proved by the prototype. The lane is the 2.7.13 table as data: a row (lane
        state) and a column (phase, with "by history" as one bit) pick one action, and a pair
        the table says cannot occur raises an issue
        (packages/flow-state-v3/prototypes/round-14/lane.ts). The commit fiber's Exit is
        classified in the driver, outside the fiber (round-14/driver.ts).

coverage
    @R1
        enforced_by  [@I1, @I2, @I24]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3, @I25]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I6, @I7, @I28]
        open_by      [@Q1]

    @R6
        enforced_by  [@I8, @I9, @I10]
        open_by      [@Q1]

    @R7
        enforced_by  [@I8]
        open_by      [@Q1]

    @R8
        enforced_by  [@I1, @I11, @I12, @I26, @I27]
        open_by      [@Q1]

    @R9
        enforced_by  [@I10, @I13, @I14]
        open_by      [@Q1, @Q2]

    @R10
        enforced_by  [@I15, @I16, @I27]
        open_by      [@Q1]

    @R11
        enforced_by  [@I17]
        open_by      [@Q1]

    @R12
        enforced_by  [@I18]
        open_by      [@Q1]

    @R13
        enforced_by  [@I19]
        open_by      [@Q1, @Q3]

    @R14
        enforced_by  [@I12, @I20]
        open_by      [@Q1]

    @R15
        enforced_by  [@I21]
        open_by      [@Q1]

    @R16
        enforced_by  [@I15]
        open_by      [@Q1, @Q2]

    @R17
        enforced_by  [@I23]
        open_by      [@Q1]

tests
    T1  Three channels and the Attempt's ending: success, failure and unknown each map to their event; a definite 
        failure after an unknown send is StillUnknown. Cases `STORE-01`, `STORE-02`, `STORE-03`, `PAY-05`; lies 
        `k.failure-as-success`, `e8.wa-failure`. [@I3]
    T2  The Attempt: every send has one id; a definite failure then a new write mints a new id; restored lanes floor 
        the mints. Cases `PAY-04`, `PAY-15`; wrong runtime `durable.mint-floor-head-only`. [@I6, @I7]
    T3  Concurrency cells, one per policy: reject declines beside a Held head; latest supersedes a never-sent head; 
        serialize declines the 65th; cancel interrupts the wire. Cases `PAY-15`, `MED-01`, `REV8-PINS`, `R15-01`; lie 
        `lie.serialize-as-latest`; wrong runtimes `lane.queue-unbounded`, `d118.commit-beside-kept`. [@I8, @I9]
    T4  Retry and promotion: retry keeps id and input; a refused head promotes what waits; an unknown never promotes. 
        Cases `PAY-04`, `REV8-H1`; wrong runtimes written in phase 3 (`lane.unknown-promotes`, 
        `lane.fresh-mint-on-held`, `lane.cancel-held-keeps`). RetryLimit has no prototype wrong runtime (Q2). [@I11, 
        @I12]
    T5  Key-less members: on an unkeyed operation outside an ending; in a keyed success handler a key-less cancel does 
        nothing; a key-less idle denies a kept ending. Cases `R15-02`, `REV9-EDGE`; wrong runtimes 
        `d123.keyless-idle-heads-only`, `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`. 
        [@I13, @I14]
    T6  Exactly one delivery, across refusal, reload and parking. Cases `DRV-02`, `PAY-15`; lies 
        `a2.deliv-fail-samemail`, `d154.moved-fail-released`, and `lost.letgo-silent` (a kept ending let go with no 
        record). [@I15, @I16]
    T7  Old-version holds: a release that adds a key field declines every commit until the old hold ends; another actor 
        is not held; previous[i] names only its own lanes; a release that changes the identity version re-keys the lane 
        and declines nothing. Cases `R13-KEYS`, `P1-H`, `REV6-H5`; wrong runtimes `p1m.old-version-any-actor`, 
        `p1m.current-names-old`, `p1m.previous-names-nothing`, `p1m.previous-is-current-allowed`, 
        `audit-1.old-version-declines-under-reject-only`, `1b.old-version-idle-passes`, and for the re-key 
        `d78-no-evidence`. [@I17]
    T8  Unencodable: a commit whose input cannot encode declines and its transition runs; the mapper gets the value 
        asked. Cases `REV9-M1`, `REV7-M9`; wrong runtime `d114.input-not-replaced`. [@I18]
    T9  cancel by history: on the wire, waiting never sent, a waiting re-send, Held, Idle. Cases `PAY-03`, `PAY-12`, 
        `PAY-15`, `STORE-05`; wrong runtime written in phase 3 (`lane.cancel-wire-as-never-sent`). [@I12, @I20]
    T10  cancelAll: queue first in mint order, head last; idle does nothing; beside a release the release wins. Case 
         `P1-H`; wrong runtimes `1b.cancel-all-queue-reversed`, `1b.cancel-all-promotes-before-emptying`, 
         `audit-1.cancel-all-leaves-the-head`, `p1h.cancel-all-idle-declines`, 
         `audit-1.cancel-all-release-also-cancels-head`. [@I21]
    T11  Release on leave: the wire is interrupted and nothing delivered; a reload of a releasing lane delivers 
         nothing. Case `FRAG-06`; lies `d154.moved-save-released`, `lie.released`. [@I15]
    T12  Store effects before the ending: a domain write's store effects are visible in the cut before its ending's 
         turn, whether the ending routes current or late. No prototype wrong runtime; phase 3 writes one that queues 
         the ending first. [@I19]
    T13  Late results after cleanup: release a placement and a commit, then land their results; data, lanes and endings 
         are unchanged. No prototype wrong runtime. [@I23]
    T14  Members only: restore, hydration, activation and re-entry of a state whose earlier activation committed invoke 
         no commit; an adapter spy counts one invocation per minted, promoted or re-sent Attempt. No prototype wrong 
         runtime; phase 3 writes one that replays a commit on re-entry. [@I1]
    T15  Success writes: a success write is applied before its ending's event and never on failure or unknown; an 
         invalid write reports InvalidWrite and the commit still succeeds; a write over data that landed later marks it 
         stale instead. No prototype case; phase 3 writes this test and its wrong runtime. [@I2, @I24]
    T16  Reserved reasons and unknown targets: a failure tag named NotSent or Disposed is refused ReservedReason; a 
         bare operation's unknown leaves no Held lane (UnknownNotUncertain is Compile Spec T3's). The prototype's 
         front-end pins check the first two; phase 3 writes the wrong runtimes. [@I4, @I5]
    T17  Member order: one turn listing cancel then commit on a Held lane, and one listing commit then cancel; each 
         member applies to the state the previous one left. No prototype wrong runtime; phase 3 writes one that applies 
         members to the pre-turn lane. [@I10]
    T18  Ids across devices: two Runtimes with different session seeds, each on its own storage, mint writes to one 
         fake server keyed by Attempt id; no id repeats, and replaying one Runtime with its seed gives the same ids. 
         Phase 3 writes the wrong runtime of Q4. [@I6]
    T19  Definite endings come from answers: a fake adapter that never answers, one that answers success and one that 
         answers a failure tag; a success or author failure is delivered only for the two that answered, and a runtime 
         that turns a missing answer into a failure is caught. Phase 3 writes the wrong runtime. [@I25]
    T20  An owed retry re-sends: retry on a Held lane, with and without a later cancel in the same turn and with a 
         refused re-send capture; the adapter spy sees exactly one re-send with the same id only in the first case. 
         Phase 3 writes the wrong runtime that drops the re-send. [@I26]
    T21  Every commit ends: generated member sequences over every policy; at quiescence each admitted commit is 
         waiting, Held or has exactly one ending, and each settled call has its Attempt's ending. Phase 3 writes the 
         wrong runtime that drops a queued commit. [@I27]
    T22  A seed per boot: two boots of one scope with a host spy; each boot asks for its own seed and no Attempt id of 
         the second equals one on disk. Phase 3 writes the wrong runtime that saves and reuses its seed. [@I28]
