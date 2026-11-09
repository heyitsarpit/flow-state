spec WriteLanes
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/plans/flow/references/proposals/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      transaction, Outcome, Attempt, O.x.commit, O.x.retry, O.x.cancel, O.x.cancelAll,
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
                after memory and the event. The operation's writes option applies only on success,
                before its ending's event, even after the issuing state exits; invalid success
                writes apply nothing and report InvalidWrite while the commit still succeeds; a
                success write never overwrites data that landed after the commit started and marks
                that entry stale instead.

    R2  Three channels
        source  @plan.Operations.O3.
        must    A commit ends success, failure (this send definitely did not do it) or unknown (it
                may have happened), as the commit function classifies it with Outcome; a plain error
                is a failure; a throw or die is unknown { Defect } with the Cause and an actor 
                issue.
                The runtime classifies each send from the fiber's Exit and whole Cause, outside that
                fiber, Flow's own knowledge first, then most cautious first. The ending delivered is
                the Attempt's: a definite failure after an unknown send of the same Attempt is
                unknown StillUnknown { failure }.

    R3  Flow's reserved reasons
        source  @plan.Operations.O3.
        must    Flow's endings are the failure NotSent { why } (Cancelled, Restored, Rejected,
                Overloaded, StorageRefused, Disposed, NoPersistence, OldVersion, Unencodable,
                ModuleDisabled) and the unknowns Cancelled, Restored, Interrupted, Defect,
                StillUnknown { failure }, StorageRefused, Disposed and Abandoned. Superseded,
                NothingToResend, InFlight and Released are evidence, never endings. There is no
                timeout reason. An author tag equal to a Flow reason is refused (ReservedReason,
                proposed name).

    R4  Mapping endings
        source  @plan.Operations.O3.
        must    The operation maps success:, failure: (exhaustive over the commit's failure tags,
                NotSent optional) and unknown: (one event, or a record by tag over the commit's own
                unknown tags and Flow's) onto declarer events; mappers receive (value, { input,
                attempt, progress, key }). A bare operation maps nothing: its endings are evidence.
                An unknown that is not retained (bare, ignored, or a cancel's own turn end) is
                released, and the store hears Released.

    R5  The Attempt
        source  @plan.Operations.O3.
        must    Every admitted commit has an Attempt { id, operation, key, input, retryCount,
                mayHaveApplied }. Flow mints id, random, when the write starts; every send of that
                write carries the same id and input. retryCount counts invoked re-sends;
                mayHaveApplied says an earlier send ended unknown. A definite failure resolves the
                Attempt; trying again is a new write with a new id.

    R6  The lane
        source  @plan.Operations.O3.
        must    A write lane is (identity with its version, contract id, key), owned by the Runtime,
                created by work and removed when Idle. Its states are Idle, InFlight (one 
                addressable
                Attempt waiting to be invoked or on the wire) and Held (a retained unknown), each
                with queued commits W: none under reject, at most one under latest, a FIFO of at 
                most
                64 under serialize. A turn's members apply to lanes in action order in validation.

    R7  Concurrency cells
        source  @plan.Operations.O3.
        must    commit on Idle mints an Attempt. On InFlight or Held: reject ends NotSent {
                Rejected } and the transition runs; latest queues one commit, ending a previous
                queued commit or a never-invoked head Superseded (evidence); serialize appends to W
                and past 64 ends NotSent { Overloaded }; cancel interrupts the previous Attempt,
                whose ending is evidence.

    R8  Retry, holds and promotion
        source  @plan.Operations.O3.
        must    retry(k?) re-sends a Held Attempt with its id and input unchanged; on InFlight it
                is evidence InFlight, on Idle or resolved NothingToResend. When the addressable
                Attempt is resolved or released, W's head is promoted; an unknown, a retry and a
                restore never promote. Every Attempt minted, promoted or re-sent is invoked after 
                its
                turn ends, once its acknowledgement and record queues allow. An unknown holds the
                lane until retry resolves it or cancel releases it: no quiet release, no automatic
                retry. A kept ending blocks its key until heard or let go.

    R9  Members and keys
        source  @plan.Operations.O3.
        must    idle(k?) denies InFlight on InFlight and Uncertain on Held; a partial key passes
                only when every lane it matches is Idle. retryable(k?, { times }) passes in Held 
                while
                retryCount < times, else RetryLimit { retryCount }, and denies InFlight or
                NothingToResend. On an unkeyed operation a key-less member names its one lane. On a
                keyed operation retry, retryable and cancel may omit the key only in a handler of an
                event that operation alone maps, naming that ending's own Attempt; elsewhere a
                key-less member is KeyRequired. idle and get always take a key on a keyed operation.

    R10  Exactly one delivery
        source  @plan.Operations.O3.
        must    Every commit, and every retry that sends, delivers exactly one ending to a live
                incarnation of its identity with the lane's subject path, or parked for it. A 
                re-send
                whose lane-record capture is refused delivers a second ending of the same Attempt,
                unknown { StorageRefused }; re-parking is not a second delivery. A settled ending is
                never rewritten. A throw from the outcome mapper at admission refuses the turn, and
                the ending is redelivered once after queued mail.

    R11  Old-version holds
        source  @plan.Operations.O3.
        must    A lane of an older identity version or an older key fingerprint is an old-version
                hold: until it ends, every commit of that operation for that identity declines
                NotSent { OldVersion } under every policy, and a keyed idle denies. previous: [{ key
                }] gives O.x.previous[i].retry, cancel and retryable, which name only previous[i]'s
                lanes; a current member never names an old-version lane; a previous key equal to the
                current one is refused (PreviousIsCurrent, proposed name).

    R12  Values with no form and missing persistence
        source  @plan.Operations.O3.
        must    A commit whose input or key cannot encode declines NotSent { Unencodable }; its
                transition runs and its mapper receives the value the turn asked to send. A
                persisted identity's commit in a Runtime without persistence ends NotSent {
                NoPersistence }. A reset of the actor's record keeps its lanes, holds and parked
                endings unbound until an adopting ensure.

    R13  Domain writes at the lane
        source  @plan.Operations.O3.
        must    A domain write's store effects publish at settlement, before its ending is queued.
                A commit past its lane's queue, a record queue, or a many key array past 4,096 items
                ends NotSent { Overloaded } with no prediction and no partial join, its transition
                and other actions running. A domain write joins its record queues when its Attempt
                heads its lane, never at commit. A store module's defect declines a joining write
                NotSent { ModuleDisabled } until reload. The record queue's own rules belong to the
                entity store's Spec.

    R14  cancel
        source  @plan.Operations.O7.
        must    O.x.cancel(k?) acts on the addressable Attempt by its history. On the wire it
                interrupts the fiber; unknown { Cancelled } is queued when the fiber exits and
                retained (Held). Waiting to be invoked: never sent, NotSent { Cancelled } and the 
                next
                queued commit is promoted; a re-send returns to Held and is released. Held: released
                (evidence) and promoted. Idle: nothing, with evidence. While a never-sent Attempt's
                acknowledgement is being written, cancel waits for storage: stored ends NotSent {
                Cancelled }, refused NotSent { StorageRefused }; that wait is unbounded (stated
                limit). A pending cancel is never lost to a later replacement.

    R15  cancelAll
        source  @plan.Operations.O7.
        must    O.x.cancelAll(k?) ends every queued commit NotSent { Cancelled } in mint order, then
                acts on the head as cancel does, promoting nothing; a Held lane ends Idle; the 
                head's
                ending, which leaves a hold, is delivered last.

    R16  Release on leave
        source  @plan.Operations.O7.
        must    A key-less O.x.cancel in whenAbandoned marks every lane of that operation for the
                ending incarnation's subject path releasing, interrupts an Attempt on the wire, ends
                queued commits as evidence, and applies later endings to the lane and store without
                delivering them. A release wins over cancelAll in the same transition. This is the
                only case where cancel drops a queued commit without an ending.

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

    Q2  RetryLimit, a release winning over cancelAll, and Superseded as evidence have no
        prototype wrong runtime.
            outcome Phase 3 writes them.

    Q3  R13's domain-write rules are tested with the entity store (phase 5).
        outcome  Until then R13 is covered only by DRV-03's ModuleDisabled cases.

model
    Lane = (identity with version, contract id, key) -> { state, head?, W }.

    State = Idle | InFlight | Held.

    Head = the addressable Attempt: the one retry and cancel name.

    Cell = (lane state, member or ending) -> next state, endings, evidence; the table of
        machine-design 2.7.13.

    Delivered = for an Attempt a, the endings of a delivered to an incarnation, parked endings 
        counted
        once.

invariants
    I1  No commit is invoked except one admitted by an accepted action's member, or promoted, or
        re-sent by retry. [@R1, @R8]

    I2  A success write is applied iff the commit succeeded, and it is applied before the
        ending's event is admitted. [@R1]

    I3  Every delivered ending is exactly one of success, failure and unknown, and an Attempt
        that ever ended unknown never delivers a definite failure. [@R2]

    I4  No delivered ending is an evidence kind, and no author tag equals a Flow reason. [@R3]

    I5  Every mapped unknown targets a Flow.uncertain event or Flow.ignore; a not-retained
        unknown leaves no Held lane. [@R4]

    I6  All sends of one Attempt carry the same id and the same input; distinct writes have
        distinct ids within a Runtime and across restore. [@R5]

    I7  retryCount equals the number of invoked re-sends of that Attempt. [@R5]

    I8  A lane exists iff it is not Idle; its W length is 0 under reject, at most 1 under
        latest, at most 64 under serialize. [@R6, @R7]

    I9  A lane has at most one addressable Attempt. [@R6]

    I10  A turn's members apply in action order, each to the lane state the previous one left.
        [@R6, @R9]

    I11  W's head is promoted only when the addressable Attempt is resolved or released. [@R8]

    I12  A Held lane leaves Held only by a retry's resolution, a cancel or cancelAll, or a
        release on leave. [@R8, @R14, @R15, @R16]

    I13  idle(k) passes iff every lane matching k is Idle and holds no kept ending. [@R9]

    I14  A key-less member on a keyed operation names only the ending's own Attempt. [@R9]

    I15  For every Attempt a: the count of Delivered for a is 1, plus one more only for a refused 
         re-send
        capture. [@R10]

    I16  A settled ending is never replaced by another. [@R10]

    I17  While an old-version hold exists for (identity, operation), every commit of it declines
        OldVersion, and no current member names that lane. [@R11]

    I18  A commit that cannot encode never fails its turn. [@R12]

    I19  A domain write's store effects precede its ending in the mailbox. [@R13]

    I20  A cancel's result depends only on the head's history, never on timing. [@R14]

    I21  cancelAll delivers queued NotSent { Cancelled } in mint order, then the head's ending;
        it promotes nothing. [@R15]

    I22  A releasing lane delivers no ending afterwards. [@R16]

    I23  After cleanup no late result changes data, lanes or endings. [@R17]

composition
    flow
        Design note, proved by the prototype. The lane is the 2.7.13 table as data: a row (lane
        state) and a column (phase, with "by history" as one bit) pick one action, and a pair
        the table says cannot occur raises an issue
        (packages/flow-state-v3/prototypes/round-14/lane.ts). The commit fiber's Exit is
        classified in the driver, outside the fiber (round-14/driver.ts).

coverage
    @R1
        enforced_by  [@I1, @I2]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I6, @I7]
        open_by      [@Q1]

    @R6
        enforced_by  [@I8, @I9, @I10]
        open_by      [@Q1]

    @R7
        enforced_by  [@I8]
        open_by      [@Q1]

    @R8
        enforced_by  [@I1, @I11, @I12]
        open_by      [@Q1]

    @R9
        enforced_by  [@I10, @I13, @I14]
        open_by      [@Q1, @Q2]

    @R10
        enforced_by  [@I15, @I16]
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
        enforced_by  [@I22]
        open_by      [@Q1, @Q2]

    @R17
        enforced_by  [@I23]
        open_by      [@Q1]

tests
    T1  Three channels and the Attempt's ending: success, failure and unknown each map to
            their event; a definite failure after an unknown send is StillUnknown. Cases `STORE-01`,
            `STORE-02`, `STORE-03`, `PAY-05`; lies `k.failure-as-success`, `e8.wa-failure`. [@I3]
    T2  The Attempt: every send has one id; a definite failure then a new write mints a new
            id; restored lanes floor the mints. Cases `PAY-04`, `PAY-15`; wrong runtime
            `durable.mint-floor-head-only`. [@I6, @I7]
    T3  Concurrency cells, one per policy: reject declines beside a Held head; latest
            supersedes a never-sent head; serialize declines the 65th; cancel interrupts the wire.
            Cases `PAY-15`, `MED-01`, `REV8-PINS`, `R15-01`; lie `lie.serialize-as-latest`; wrong
            runtimes `lane.queue-unbounded`, `d118.commit-beside-kept`. [@I8, @I9]
    T4  Retry and promotion: retry keeps id and input; a refused head promotes what waits; an
            unknown never promotes. Cases `PAY-04`,
            `REV8-H1`; wrong runtime `lane.promote-skips-durable`. RetryLimit
            has no prototype wrong runtime (Q2). [@I11, @I12]
    T5  Key-less members: on an unkeyed operation outside an ending; in a keyed success handler
            a key-less cancel does nothing; a key-less idle denies a kept ending. Cases `R15-02`,
            `REV9-EDGE`; wrong runtimes `d123.keyless-idle-heads-only`, 
                `d123.keyless-cancel-nothing`,
            `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`. [@I13, @I14]
    T6  Exactly one delivery, across refusal, reload and parking. Cases `DRV-02`, `PAY-15`;
            lies `a2.deliv-fail-samemail`, `d154.moved-fail-released`. [@I15, @I16]
    T7  Old-version holds: a release that adds a key field declines every commit until the old
            hold ends; another actor is not held; previous[i] names only its own lanes. Cases
            `R13-KEYS`, `P1-H`; wrong runtimes `p1m.old-version-any-actor`, `p1m.current-names-old`,
            `p1m.previous-names-nothing`, `p1m.previous-is-current-allowed`,
            `audit-1.old-version-declines-under-reject-only`, `1b.old-version-idle-passes`. [@I17]
    T8  Unencodable: a commit whose input cannot encode declines and its transition runs; the
            mapper gets the value asked. Cases `REV9-M1`, `REV7-M9`; wrong runtimes
            `d114.decline-no-input`, `d114.input-not-replaced`. [@I18]
    T9  cancel by history: on the wire, waiting never sent, a waiting re-send, Held, Idle.
            Cases `PAY-03`, `PAY-12`, `PAY-15`, `STORE-05`; wrong runtimes `d118.let-go-keeps`,
            `lost.letgo-silent`. [@I12, @I20]
    T10  cancelAll: queue first in mint order, head last; idle does nothing; beside a release
            the release wins. Case `P1-H`; wrong runtimes `1b.cancel-all-queue-reversed`,
            `1b.cancel-all-promotes-before-emptying`, `audit-1.cancel-all-leaves-the-head`,
            `audit-1.cancel-all-idle-silent`, `audit-1.cancel-all-release-also-cancels-head`.
            [@I21]
    T11  Release on leave: the wire is interrupted and nothing delivered; a reload of a
            releasing lane delivers nothing. Case `FRAG-06`; lies `d154.moved-save-released`,
            `lie.released`. [@I22]
    T12  ModuleDisabled: a disabled store declines what would join and holds its queue. Case
            `DRV-03`. [@I19]
    T13  Late results after cleanup: release a placement and a commit, then land their results;
            data, lanes and endings are unchanged. No prototype wrong runtime. [@I23]
