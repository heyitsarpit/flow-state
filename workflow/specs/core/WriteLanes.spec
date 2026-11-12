spec WriteLanes
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in workflow/specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
location      packages/flow-state-v3/src
provides      Outcome, Attempt, Flow.NotSent, Flow.Unknown, O.x.commit, O.x.retry, O.x.cancel,
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

    R3  Flow's own endings
        source  @plan.Operations.O3.
        must    Flow's endings are two values, each a `Data.TaggedEnum` discriminated by `_tag`
                (never by a `why` field), so Effect's `Match.tag` works on them, and each also a
                `Schema` tagged union, which is how an owed row's ending is encoded:

                - `Flow.NotSent`, a failure-channel ending Flow makes when a commit was never sent,
                with tags Cancelled, Restored, Rejected, Overloaded, StorageRefused, Disposed,
                NoPersistence, OldVersion, Unencodable and ModuleDisabled (proposed name);
                - `Flow.Unknown`, every unknown-channel ending, with tags Outcome { error } (the
                commit said `Outcome.unknown(error)`), StillUnknown { failure }, Defect { cause },
                Cancelled, Restored, Interrupted, StorageRefused and Disposed.

                These Specs write `NotSent { Rejected }` for the first's Rejected tag and
                `unknown { Restored }` for the second's Restored tag. Superseded, NothingToResend,
                InFlight and Released are evidence, never endings. There is no timeout reason. An
                author's failure tag is the author's alone and may spell any name, a Flow tag's
                included: the origin of an ending is its key and type, never its name. Decision
                (the user, 2026-11-12): wide consult W1, option B; ReservedReason is retired and
                the proposed unknown Abandoned is dropped (spec-log.md).

    R4  Mapping endings
        source  @plan.Operations.O3.
        must    The operation maps four keys onto declarer events:

                - `success:`, one event;
                - `failure:`, a record exhaustive over the commit's own failure tags and nothing
                else;
                - `notSent:`, optional, one event whose mapper receives a `Flow.NotSent`;
                - `unknown:`, one event, or a record over any of `Flow.Unknown`'s tags with a
                required `otherwise`; either mapper receives a `Flow.Unknown`, in which the
                commit's own unknown error arrives as Outcome { error }.

                Mappers receive (value, { input, attempt, progress, key }); `attempt` is absent for
                a declined commit, which has none. An unmapped `notSent` is evidence (R10).
                Decision (the user, 2026-11-12): wide consult W1, option B (spec-log.md).

                A bare operation maps nothing: its endings are evidence. An unknown that is not
                retained (bare, ignored, or under the cancel concurrency policy once its own
                ending's turn ends) is released, and the store hears Released. The O.x.cancel
                member's unknown { Cancelled } is retained (R14).

    R5  The Attempt
        source  @plan.Operations.O3.
        must    Every admitted commit that is not declined has an Attempt { id, operation, key,
                input, retryCount } from the moment it becomes a head (a queued commit gets its
                Attempt when promoted); a declined commit (NotSent before its cell, or
                by its cell) has none. Flow mints id when the write starts.

                The id is unique across devices and scopes and never reused within a scope, because
                a server may use it as its idempotency key; the mint draws on entropy the host
                supplies as data at boot (a random session seed of at least 128 bits), so the core stays deterministic
                given its inputs and replays exactly (the runner's ruling). Every boot asks the host
                for a fresh seed; a seed is never restored from disk or carried to a later boot, so
                ids stay unique across restore without reading every id off disk. Decision (agent,
                2026-11-11): audit gap G4 (spec-log.md, T42). Attempts have their own counter, so
                minting any other id never changes an Attempt id.

                Every send of that write carries the same id and input. The commit author puts id on
                the wire where the API expects it; Flow sends nothing itself and derives no other
                key. `retryCount` counts invoked re-sends; `mayHaveApplied` says the Attempt was
                sent before, and is derived, never stored on the head or in a record: `retryCount`
                is above 0, or the head is Held or waiting to re-send (Recapturing, Resending). A
                definite failure resolves the Attempt; trying again is a new write with a new id.

    R6  The lane
        source  @plan.Operations.O3.
        must    A write lane is (identity with its version, contract id, key), owned by the Runtime,
                created by work and removed when Idle. Its states are
                Idle, InFlight (one addressable Attempt waiting to be invoked or on the wire) and
                Held (a retained unknown), each with queued commits W: none under reject, at most
                one under latest, a FIFO of at most 64 under serialize.

                A lane holds its Attempt's state and nothing else. An ending is never lane state: it
                is applied to its lane in the step its call settles, and from then on it is a row of
                the owed ledger (R10). A row names its lane by (identity, contract id, key) whether
                or not that lane has a head. A Kept row (Actors Spec R15) does not make a lane
                exist, but blocks the key it names: while a row is Kept, a commit on that key
                declines NotSent { Rejected } before its cell under reject, latest and serialize
                (cancel is Q5). No other row blocks a key; a Kept row taking its one try at a start
                is Retrying and blocks nothing until it is refused again, the same exposure as the
                first refusal (nothing is lost, since the try is served in that step's drain). Decision (orchestrator, 
                2026-11-12): consult round 3 and T54's
                decisions 1 and 2, replacing ruling CQ3 (spec-log.md).

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
                resolves it or cancel releases it: no quiet release, no automatic retry. A Kept
                row blocks its key until the row closes (R6; Actors Spec R15).

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
        must    Every commit, and every retry that sends, owes its identity one ending, exactly as
                I15 counts. The ending is applied to its lane in the step its call settles and is
                from then on one row of the owed ledger (`model`), the only place an ending is held:
                a row is never rewritten, and only its close removes it. A row is delivered to a
                live incarnation of its identity with the lane's subject path, or waits (reported
                Parked) for that identity's next start (Actors Spec R10). The mailbox holds a
                reference to the row, and a reference whose row is closed delivers nothing. A row's
                reports come from the row alone (I34), and no report, snapshot or public value names
                a row's id, a lane id or a row's Delivery (I37). Decision (orchestrator,
                2026-11-12): consult round 3, Part 2 (spec-log.md).

                An ending whose turn is refused, a throw from its outcome mapper at admission
                included, is tried once more after queued mail; a second refusal keeps it (Kept)
                until the next start, each of which gives it one try (Actors Spec R15). Every kept
                ending is its own row: a second one on the same lane replaces nothing. Decision
                (agent, 2026-11-11): ruling CQ1 (spec-log.md, T42).

                Every admitted commit ends: it waits (to be invoked, on the wire, or queued) or is
                Held until it gets exactly one ending, delivered, parked or recorded as evidence;
                none disappears without one. A declined commit has no Attempt and no lane; its
                ending is a row like any other.

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
                NoPersistence }. A reset of the actor's record keeps its lanes, holds and owed 
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

                A cancel that comes after the call settled finds the lane as that ending left it and
                never changes the ending: a known success stays a success (I32). Beside its cell, a
                cancel closes every Kept row that names its lane, recorded letGo.

    R15  cancelAll (retired)
        source  @plan.Operations.O7.
        must    Retired 2026-11-12 (the user; wide consult W1, K0): `cancelAll` is deferred, since
                neither reference app uses it. Nothing builds or tests it. Its rule and prior art
                are in workflow/plans/flow/references/proposals/revisit.md (`cancelAll`); the old
                text is at commit ae48afa4.

    R16  Release on leave
        source  @plan.Operations.O7.
        must    A key-less O.x.cancel in whenAbandoned marks every lane of that operation for the 
                ending incarnation's subject path releasing, interrupts an Attempt on the wire, 
                ends queued commits as evidence, and applies later endings to the lane and store 
                without delivering them. This
                is the only case where cancel drops a queued commit without an ending.

    R17  Cleanup
        source  @plan.Operations.O7.
        must    Planned release interrupts the fiber and runs finalizers once, without interrupt 
                endings. cancel on a one-off read releases the operation's wait, not the shared 
                request. Cleanup failure reports an issue without undoing a published transition. 
                After cleanup, late results cannot change data, lanes, endings or replacement work. 
                disposeActor invokes nothing new and drops no lane; Runtime disposal invokes nothing
                new and drops only a head whose ending is definite (Actors Spec R20, R22).

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  RetryLimit and Superseded as evidence have no prototype wrong runtime. outcome Phase 3 writes them.

    Q3  R13's store-side rules (record queues, their bounds, ModuleDisabled) moved to the entity store area.
        outcome  They are written with the entity store's Spec in phase 5.

    Q4  The prototype mints counters floored at boot (round-14/durable.ts, round-14/step.ts), which are unique only per 
        scope and do not meet R5.
        outcome  Phase 4 builds the seeded mint; phase 3 writes the wrong runtime, a counter that 
                 collides across two devices.

    Q5  The model has no ruling for a cancel-policy commit on a key whose lane has a Kept row, with the lane Idle or 
        its head still Held.
        outcome  Slice 1 (@task.V3.T18) rules both before it builds the cancel policy; consult round 3 hands it
                 over as "close the lane's Kept rows, then mint" (proposed). Until then no fixture drives them.

model
    Lane = (identity with version, contract id, key) -> { phase, W, displaced, mode }. mode is Delivering, or
        Releasing after R16's release. A lane in phase Idle is not stored.

    State = Idle | InFlight | Held (R6). InFlight is every Phase from Acknowledging to Cancelling. A lane
        has a head or is Idle; an ending, kept or not, is never a lane state.

    Head = the addressable Attempt: the one retry and cancel name.

    Phase = where the head stands, one tag per history and wait, never a flag:
        - Idle: no head, W empty;
        - Acknowledging: never sent; its acknowledgement batch is out (WriteAhead Spec R13);
        - Unsent: never sent; acknowledged or not persisted; waits for its turn's end and record queues;
        - Withdrawing: never sent; a cancel came while it was Acknowledging and waits for storage (R14);
        - Recapturing: sent before; its re-send waits for the lane record's capture;
        - Resending: sent before; its re-send waits for its turn's end and record queues;
        - OnWire: invoked, with no ending yet;
        - Cancelling: on the wire, and interrupted by a cancel;
        - Held: its last ending is a retained unknown, and it is not on the wire.

    Displaced = an earlier Attempt the cancel policy replaced while it waited or was on the wire. Its ending is
        delivered when a cancel was pending on it (Withdrawing, Cancelling), and is evidence otherwise (R7, R10).

    Promote = W's head becomes the head, minted as Acknowledging when its identity persists, else Unsent; with W
        empty the lane goes Idle. A Kept row never stops a promotion: the head resolved at settlement, before any
        refusal. An unknown, a retry and a restore never promote.

    Cell = lane(phase, input) -> phase, endings, evidence: one total function. Every (phase, input) pair below has
        exactly one cell; a pair marked impossible is a defect in Flow. The declines R11 and R12 give under every
        policy (OldVersion, Unencodable, NoPersistence), and R6's Rejected on a key with a Kept row, come before the
        cell. A cell reads and changes lane state only; none reads the ledger. A boot rebuilds lanes from records
        (Restore Spec R3), not through cells. A store's answer for a ticket no head awaits (a late answer after a
        disposal) reaches no cell and is not a defect. By input:
        - commit under reject: Idle mints; every other phase declines NotSent { Rejected } (R7).
        - commit under latest: Idle mints; Acknowledging and Unsent queue it, end the head Superseded (evidence)
            and promote; every other phase queues it, ending a queued commit Superseded. Withdrawing's head is not
            superseded, since a pending cancel is never lost (R7, R8, R14).
        - commit under serialize: Idle mints; every other phase appends it to W, and past 64 it declines NotSent {
            Overloaded } (R7).
        - commit under cancel: Idle mints (a key with a Kept row is Q5). Acknowledging and Unsent end the head 
            Superseded
            (evidence); Recapturing, Resending and Held release it (evidence Released); OnWire interrupts it and
            displaces it, its ending evidence; Withdrawing and Cancelling displace it with its ending owed. In each,
            the commit then mints (R7, R14).
        - retry: Held goes Recapturing when its identity persists, else Resending, and the re-send is owed (I26);
            Idle gives evidence NothingToResend; every other phase gives evidence InFlight (R8).
        - cancel: Idle does nothing and gives no ending (its lane's Kept rows are closed by R14, outside the cell);
            Acknowledging goes Withdrawing; Unsent ends NotSent { Cancelled } and promotes; Recapturing,
            Resending and Held are released (evidence Released) and promote; OnWire is interrupted and goes
            Cancelling; Withdrawing and Cancelling stay (R14).
        - invoked, after the turn with every wait met: Unsent and Resending go OnWire, and a re-send adds one to
            retryCount; impossible elsewhere (R5, R8).
        - stored, its batch landed: Acknowledging goes Unsent; Recapturing goes Resending; Withdrawing ends NotSent
            { Cancelled } and promotes; impossible elsewhere (R14; WriteAhead Spec R13).
        - refused, its batch refused: Acknowledging and Withdrawing end NotSent { StorageRefused } and promote;
            Recapturing goes Held and delivers unknown { StorageRefused }; impossible elsewhere (WriteAhead Spec
            R13).
        - answered with success or failure, one input in the step the call settles: OnWire owes it and promotes;
            Cancelling owes unknown { Cancelled } instead and goes Held (I20); impossible elsewhere (R2). No later
            input applies the ending again when its turn is admitted.
        - answered with unknown, an interruption included: OnWire owes it and goes Held; Cancelling owes unknown {
            Cancelled } and goes Held; impossible elsewhere (R2, R14).
        - the turn of a not-retained unknown ends (R4): Held is released (evidence Released) and promotes; nothing
            elsewhere.
        - release on leave (R16): mode goes Releasing; W's commits end as evidence; OnWire goes Cancelling; other
            phases stay; later endings apply to the lane and store as evidence.
        - Runtime disposal starts (Actors Spec R22): Acknowledging, Unsent and Withdrawing end NotSent { Disposed
            }; Recapturing and Resending go Held; W's commits end NotSent { Disposed }; OnWire, Cancelling, Held
            and Idle stay.
        - the disposal bound passes: OnWire and Cancelling end unknown { Disposed } and go Held; nothing elsewhere. 
            Where a lane's endings are owed together, the one that leaves a hold comes last (Actors Spec R22).

    Delivered = for an Attempt a, the endings of a delivered to an incarnation, parked endings
        counted once.

    Owed = one row of the owed ledger: an ending, from the step its call settles (or its commit declines) until its
        close. A row names its identity, its audience, its operation, its Attempt and lane when it has them (a
        decline has neither) and the ending (channel, reason, value); it also carries the owning activation and
        whether it is current (Turn Spec R20), unchanged until @task.V3.T17. The ledger keeps each identity's rows
        in the order they were owed, and is the only place an ending is held.

    Audience = who a row is owed to, chosen by the code that owes it: Identity (any incarnation of the identity;
        saved when the identity persists) or Life (one incarnation's life, not the Runtime's Life of the Actors Spec; 
            never saved; closed as evidence when that
        incarnation ends). A write's ending, a decline included, and a stopped read's Interrupted are owed to the
        Identity; a lookup's ending is owed to the Life that asked (Reads Spec R6). An audience is live when the
        identity has a live incarnation (Identity) or that incarnation is alive (Life).

    Parked = the report word for a row that is Waiting; Unparked for one that leaves Waiting. Where these Specs say
        an ending is parked, they mean its row is Waiting.

    Delivery = where a row stands, one tag: Queued (a try is in the mailbox); Retrying (refused once; its second
        try is in the mailbox, behind the mail queued at the refusal); Waiting (nothing can hear it now; reported
        Parked); Kept (refused twice; one try at the next start; blocks its lane's key).

    LedgerFunctions = the only five that build, move or remove a row:
        - owe: the row is born already applied to its lane; Queued with a mail reference when the Runtime's Life
            is Open (Actors Spec `model`) and its audience is live, else Waiting; a Life row whose incarnation is gone 
                closes Recorded at once.
        - tryOne: a mail reference to a missing row does nothing. With no mapping the row closes Recorded; an
            accepted turn closes it Delivered; a refusal moves Queued to Retrying, with a new reference behind queued
            mail, and Retrying to Kept.
        - suspend, at an incarnation's end, disposeActor and for each identity at Runtime disposal: Queued and
            Retrying rows go Waiting, rows with no lane included; Life rows close Recorded.
        - start, the one delivery point of every Start (Actors Spec `model`, R10): Waiting goes Queued and Kept
            goes Retrying, in the order the rows were owed; then, lane by lane in lane-id order (the record-key
            order), each Held head with no row for its Attempt is owed unknown { Restored }, unless its lane is
            Releasing (I15). A boot rebuilds every acknowledged head as Held (Restore Spec R3). Once a queue is
            saved (@task.V3.T18), a lane's queued commits are owed NotSent { Restored } before its head's row.
        - close: the only removal, Delivered or Recorded (as evidence, or letGo for a Kept row).

    Blocked = keptOn(identity, lane): some row of that identity that names that lane is Kept. It is the only read of
        the ledger a commit makes (R6).

invariants
    I1  No commit is invoked except one admitted by an accepted action's member, or promoted, or re-sent by retry. 
        [@R1, @R8]

    I2  No success write is applied unless its commit succeeded, and none is applied after that ending's event is 
        admitted. Reworded 2026-11-11 from "iff" (audit C9). [@R1]

    I3  Every delivered ending is exactly one of success, failure and unknown; an Attempt that ever ended unknown never 
        delivers a definite failure; and an Attempt never sent ends only NotSent, or unknown { Restored } at a boot. 
        Decision (agent, 2026-11-11): ruling CQ5 (spec-log.md, T42). [@R2]

    I4  No delivered ending is an evidence kind. A failure mapper receives only the commit's own failure, a notSent 
        mapper only a Flow.NotSent and an unknown mapper only a Flow.Unknown, whatever the author's tags are named.
        Reworded 2026-11-12 (the user, wide consult W1 option B): "no author tag equals a Flow reason" is retired
        with ReservedReason. [@R3, @R4]

    I5  A not-retained unknown leaves no Held lane. (Its mapped target is Compile Spec I11's.) [@R4]

    I6  All sends of one Attempt carry the same id and the same input. No two writes share an id: within a Runtime, 
        across restore, or across Runtimes on different devices or scopes given different session seeds. Given the same 
        inputs and seed, the mint gives the same ids. [@R5]

    I7  retryCount equals the number of invoked re-sends of that Attempt. [@R5]

    I8  A lane exists iff it has a head, and a Kept row makes none exist; its W length is 0 under reject, at most 1 
        under latest, at most 64 under serialize. Reworded 2026-11-12 (consult round 3, replacing ruling CQ3). [@R6, 
        @R7]

    I9  Every retry and cancel on a lane acts on one Attempt: the one the lane's last send carried, or, before any 
        send, the head waiting to be invoked. Reworded 2026-11-11 (audit). [@R6]

    I10  A turn's members apply in action order, each to the lane state the previous one left. [@R6, @R9]

    I11  W's head is promoted only when the addressable Attempt is resolved, released or superseded. Decision (agent, 
         2026-11-11): ruling CQ7 (spec-log.md, T42). [@R8]

    I12  A Held lane leaves Held only by a retry's resolution, a cancel, a release on leave, forget of a hold whose 
         operation is gone (HoldForgotten, Actors Spec R21), or Restore Spec R5's stated fresh start. [@R8, @R14, @R15, 
         @R16]

    I13  idle(k) passes iff every lane matching k is Idle and no Kept row names a lane matching k. Reworded 2026-11-12 
         (consult round 3). [@R6, @R9]

    I14  A key-less member on a keyed operation names only the ending's own Attempt. [@R9]

    I15  Per Attempt and per incarnation, each ending is either delivered once (to a live incarnation, or parked for it 
         and delivered once) or recorded as evidence only, never both and never twice, with these exceptions written 
         out: a re-send whose lane-record capture is refused adds a second ending of the same Attempt, unknown { 
         StorageRefused }; unknown { Restored } is delivered at most once per incarnation, so once again after each 
         reload or return (Restore Spec I6); an ending whose turn is refused (InvalidTurn, an outcome mapper throw at 
         admission included) is delivered once more after queued mail, and a second refusal ends its tries until the
        next start (a reload, a return or an adoption), each of which gives it exactly one try with no redelivery after 
            a refusal there (Actors
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

    I21  Retired 2026-11-12 with R15: `cancelAll` is deferred (revisit.md, `cancelAll`). It ordered cancelAll's 
         endings, queue first and the head's last. [@R15]

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
         ending. Declines count: commits admitted equal Attempts minted, plus declines, plus commits queued or ended 
         while
        queued, and each decline has exactly
        one ending. Added 2026-11-11 (audit G1, @plan.Operations.O3); declines 2026-11-12. [@R8, @R10]

    I28  Every boot mints from a seed the host supplied for that boot, never from a seed restored from disk or used by 
         an earlier boot; the seed has at least 128 random bits. Added 2026-11-11 (audit G4); the width added
        2026-11-12 (wide consult, question 3). [@R5]

    I29  Only a close removes a row, and a row is closed at most once. Every open row has a waker: a mail reference for 
         Queued and Retrying, the next start of its identity for Waiting and Kept; at every step's end the
        mail's ending references are exactly the Queued and Retrying rows. Added 2026-11-12 (consult round 3). [@R10]

    I30  A mail reference whose row is closed delivers nothing. Added 2026-11-12 (consult round 3). [@R10]

    I31  Kept rows never replace one another: every twice-refused ending is its own row, two on one lane included, and 
         each gets one try at every start until it is heard or let go. Added 2026-11-12 (consult round 3). [@R6,
        @R10]

    I32  An ending is applied to its lane in the step its call settles, before any turn hears it, and nothing after 
         settlement changes it: a cancel admitted between a success's settlement and its turn leaves it a success.
        Added 2026-11-12 (T54's decision 1). [@R10, @R14]

    I33  A commit under reject, latest or serialize declines NotSent { Rejected } before its cell exactly when a row 
         naming its key's lane is Kept at that moment; a Queued, Retrying or Waiting row blocks no key, a Kept row
        on its try at a start included, and no cell reads the ledger.
        Added 2026-11-12 (T54's decision 2). [@R6]

    I34  A row's life is reported from the row and nowhere else: Ended once at its birth, Parked each time it goes 
         Waiting, Unparked each time it leaves Waiting, and exactly one of Delivered or Recorded at its close. The
        ledger adds no report kind. Added 2026-11-12 (consult round 3, C7). [@R10]

    I35  Attempt ids come from their own counter: minting any other id never changes an Attempt id. Added 2026-11-12 
         (consult round 2, B8). [@R5]

    I36  An Attempt's `mayHaveApplied` equals "its retryCount is above 0, or its head is Held, Recapturing or 
         Resending"; no head and no record stores it. Added 2026-11-12 (consult round 3). [@R5]

    I37  No report, snapshot, row of `O.x.get` or value handed to user code carries a row's id, a lane id, a ticket, a 
         timer, a record key or a Delivery. A report names an ending by its Attempt id, or by actor, operation and
        order when it has none. Added 2026-11-12 (consult round 3, C7). [@R10]

    I38  Flow.NotSent and Flow.Unknown are discriminated by `_tag`, and each value round-trips through its Schema: 
         decode(encode(v)) has the same tag and fields. Added 2026-11-12 (the user, wide consult W1). [@R3]

composition
    flow
        Design note, proved by the prototype. The lane is a table as data: a row (lane state)
        and a column (phase, with "by history" as one bit) pick one action
        (packages/flow-state-v3/prototypes/round-14/lane.ts). The commit fiber's Exit is
        classified in the driver, outside the fiber (round-14/driver.ts).

        Production (@task.V3.T51, proposed): `lane(phase, input)` is one total function written
        from the cell table in `model`, an exhaustive match over Phase and the input, so a new
        policy adds cells, not branches. Phase variants replace the head's `sent` and
        `cancelled` flags and the ending booleans; a lane's id and key text are derived, never
        stored. Only reject concurrency is built.

        Production realization (@task.V3.T51, consolidated by @task.V3.T54 from consult round 3, Part 2).
        `src/core/cells.ts` holds the table: `cell(state, cue)` is one exhaustive match over the
        cue and then the lane state (Idle, or a head's Phase), returning a `Move` as data; a pair
        the table marks impossible returns `Impossible`, which the applier raises as a defect.
        `LaneState` is `Idle | Head`: there is no Kept row, no `Keep` cue and no cell for a kept
        ending, so @task.V3.T18 adds cells over Idle and head phases only.

        Production phases: Acknowledging, Unsent, Withdrawing, Recapturing, Resending, OnWire,
        Cancelling and Held, as in `model`. Production's Unsent and Resending wait for their
        turn's end (cue TurnEnded), which takes them to Acknowledging or Recapturing when the
        identity persists, else to the wire; a landed batch invokes at once, so the model's
        acknowledged Unsent and captured Resending pass in that one cue. A settled call is one
        cue, `Answered`: it is classified by the phase it found (Cancelling gives unknown
        Cancelled), applied to the lane in that step, and owed. Not the rule, only the way
        back: if backlog shows a real problem with a lane moving before its machine hears,
        @task.V3.T54 may keep a fourth `Delivery` state, `Settled`, and an `Ended` cue, and
        must then rewrite R10 and I32 and say so to the user.

        Shared terms. This Spec owns ending (R2, R3), Attempt (R5), lane (R6) and owed row
        (`model`); the Actors Spec owns Start, Adoption and Life (its `model`); the WriteAhead
        Spec owns the records (R4, R5); the Reads Spec owns the read slot. Other Specs cite
        these and do not restate them.

        The owed ledger (`src/core/ledger.ts`) is the World's only holder of endings. It is
        opaque outside that module: `owe`, `tryOne`, `suspend`, `start` and `close` are the only
        code that builds, moves or removes a row, and `keptOn` is the only blocking read. Mail
        carries a reference to a row (its id), never the ending. A move issues no write and no
        report: there is no `persist`, `park`, `keep` or `emit` to call. Records are projected
        from what the step touched (WriteAhead Spec R5, R10), and every report is built by
        `evidenceOf(act)` in `src/core/evidence-of.ts`, the only builder of an Evidence, from
        the step's acts in act order: a lane's cue with its states before and after, a row's
        change, a turn's verdict with its parts and members, a call, an incarnation, the
        Runtime's life. A step returns `{ world, life, commands, acts }`.

        Effect features: `Data.taggedEnum` for Phase, Cue, Move, Delivery, Audience and Act
        (exhaustive `$match` is the table's totality check); `Brand` for `OwedId`, `AttemptId`
        and `LaneId`; `Option` for an absent lane, Attempt or row. Skipped:
        `Match` (taggedEnum's `$match` already gives exhaustiveness at no cost), `HashMap` and
        `Data` structs per lane (a turn's hot path; plain maps cost less), `Effect` itself (the
        core is pure), a linear `OwedId` and typestate on the World (a missing row is a no-op
        by rule). In the host: `Deferred` for dispose waiting on the core's disposal before
        `Scope.close`; `FiberMap`, `Clock` and `Scheduler` as before. The final write's share of
        the disposal's 5 s moves into the core with @task.V3.T55 (Actors Spec R23); until then
        the host's `Effect.timeout` holds it.

coverage
    @R1
        enforced_by  [@I1, @I2, @I24]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3, @I25]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I38]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I4, @I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I6, @I7, @I28, @I35, @I36]
        open_by      [@Q1]

    @R6
        enforced_by  [@I8, @I9, @I10, @I31, @I33]
        open_by      [@Q1]

    @R7
        enforced_by  [@I8]
        open_by      [@Q1, @Q5]

    @R8
        enforced_by  [@I1, @I11, @I12, @I26, @I27]
        open_by      [@Q1]

    @R9
        enforced_by  [@I10, @I13, @I14]
        open_by      [@Q1, @Q2]

    @R10
        enforced_by  [@I15, @I16, @I27, @I29, @I30, @I31, @I32, @I34, @I37]
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
        enforced_by  [@I12, @I20, @I32]
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
    T2  The Attempt: every send has one id; a definite failure then a new write mints a new id; after a restore, new 
        ids never equal a restored one (a fresh seed each boot, R5). Cases `PAY-04`, `PAY-15`; wrong runtime 
        `durable.mint-floor-head-only`. [@I6, @I7]
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
    T10  Retired 2026-11-12 with R15 and I21 (`cancelAll` is deferred; revisit.md). Not written for production; the ids 
         below are the prototype's. It read: queue first in mint order, head last; idle does nothing. Case
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
    T16  Origins and unknown targets: an operation whose author failure tag is named Cancelled, with `notSent` and an 
         `unknown` record mapping Cancelled and `otherwise`; the author's failure reaches only the failure mapper, a
             declined commit only `notSent`, a cancelled send only `unknown.Cancelled`, and the commit's own unknown
             error reaches `otherwise` as Outcome { error }. A type test: a missing failure tag and a `failure.NotSent`
             key are errors. A bare operation's unknown leaves no Held lane (UnknownNotUncertain is Compile Spec T3's).
             Written by @task.V3.T18; wrong runtime: Flow's Cancelled routed to the author's Cancelled tag. [@I4, @I5]
    T17  Member order: one turn listing cancel then commit on a Held lane, and one listing commit then cancel; each 
         member applies to the state the previous one left. No prototype wrong runtime; phase 3 writes one that applies 
         members to the pre-turn lane. [@I10]
    T18  Ids across devices: two Runtimes with different session seeds, each on its own storage, mint writes to one 
         fake server keyed by Attempt id; no id repeats, and replaying one Runtime with its seed gives the same ids. 
         Phase 3 writes the wrong runtime of Q4. [@I6]
    T19  Definite endings come from answers: a commit whose Effect never completes (`Effect.never`), one that succeeds 
         and one that fails with a tagged failure; a success or author failure is delivered only for the two that 
         answered, and a runtime that turns a missing answer into a failure is caught. Phase 3 writes the wrong 
         runtime. [@I25]
    T20  An owed retry re-sends: retry on a Held lane, with and without a later cancel in the same turn and with a 
         refused re-send capture; the adapter spy sees exactly one re-send with the same id only in the first case. 
         Phase 3 writes the wrong runtime that drops the re-send. [@I26]
    T21  Every commit ends: generated member sequences over every policy; at quiescence each admitted commit is 
         waiting, Held or has exactly one ending, and each settled call has its Attempt's ending. Phase 3 writes the 
         wrong runtime that drops a queued commit. [@I27]
    T22  A seed per boot: two boots of one scope with a host spy; each boot asks for its own seed and no Attempt id of 
         the second equals one on disk. Phase 3 writes the wrong runtime that saves and reuses its seed. The real
             host's seed is checked for its width, failing first on the 32-bit seed (@task.V3.T54). [@I28]
    T23  The ledger's rows: generated member sequences with refused turns; at every step's end the mail's ending 
         references are exactly the Queued and Retrying rows, every row closes at most once, and each row's reports
             are one Ended, then Parked and Unparked in pairs, then one Delivered or Recorded. Design mutants, written
             before the code (@task.V3.T54): a close with no report; a stale mail reference that delivers again. [@I29,
             @I30, @I34]
    T24  Two kept endings on one lane: two endings of one lane are each refused twice, and the jam stays on across the 
         next start; each gets exactly one try there, and both are heard once the jam clears at a later start.
             Pending in the suite until @task.V3.T54; design mutants: a keep that replaces, a start that skips Kept
             rows. [@I31]
    T25  Applied at settlement: a call succeeds and a cancel is admitted before the success's turn; the machine hears 
         the success and the lane is as the success left it. Red until one `Answered` cue lands (@task.V3.T54). [@I32]
    T26  Only Kept blocks: a commit on a key whose lane has a Kept row declines Rejected; the same commit beside a 
         Queued, a Retrying and a Waiting row mints. [@I33]
    T27  Attempt ids keep their numbers: one script run with and without other ids minted between its commits gives the 
         same Attempt ids; each invoked Attempt's `mayHaveApplied` equals its derivation, and no lane record
             holds the field. Failing first (@task.V3.T54, step A0). [@I35, @I36]
    T28  Nothing internal crosses: over every production case, no report, snapshot or `O.x.get` row has a field holding 
         a row id, a lane id, a ticket, a timer, a record key or a Delivery tag; an ending with no Attempt
             is matched by actor, operation and order. Wrong runtime: a Delivered report carrying its row's id. [@I37]
    T29  Flow's values: every Flow.NotSent and Flow.Unknown tag is built, matched with `Match.tag`, encoded and decoded 
         by its Schema, and comes back with the same tag and fields; an owed row saved with each survives a
             reload as that value. Wrong runtime: a value discriminated by `why`. Written by @task.V3.T18. [@I38]
