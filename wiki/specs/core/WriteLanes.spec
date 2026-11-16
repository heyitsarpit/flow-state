spec WriteLanes
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in wiki/specs/specs.log.
              Written from the merged flow plans (proposed).
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
        must    A send ends success, failure (this send definitely did not do it) or unknown (it
                may have happened), as the commit function classifies it with Outcome; Flow adds a
                fourth channel, notSent, for a commit never sent (R3). A plain error
                is a failure; a throw or die is unknown { Defect } with the Cause and an actor
                issue. Flow never makes up a definite ending: a success, or a failure other than
                Flow's NotSent, is always the classification of an answer a send of that Attempt
                received. Decision (agent, 2026-11-11): ruling M5. Why: an invented definite
                ending would let an app act on a write that may have happened. Reverse: drop the
                sentence and I25 (spec-log.md, T42).

                The runtime classifies each send from the fiber's Exit and whole Cause, outside that
                fiber, Flow's own knowledge first, then most cautious first. The ending delivered is
                the Attempt's: a definite failure after an unknown send of the same Attempt is
                unknown StillUnknown { failure }.

    R3  Flow's own endings
        source  @plan.Operations.O3.
        must    Flow's endings are two values, each a `Data.TaggedEnum` discriminated by `_tag`
                (never by a `why` field), so Effect's `Match.tag` works on them, and each also a
                `Schema` tagged union, which is how an owed row's ending is encoded:

                - `Flow.NotSent`, the definite ending Flow makes when a commit was never sent, with
                tags Cancelled, Restored, Rejected, Overloaded, StorageRefused, Disposed,
                NoPersistence, OldVersion, Unencodable and ModuleDisabled (proposed name); like a
                failure it says the write did not happen, but its origin is Flow's: it is routed
                and saved on its own channel, `notSent`, never as the author's `failure`;
                - `Flow.Unknown`, every unknown-channel ending, with tags Outcome { error } (the
                commit said `Outcome.unknown(error)`), StillUnknown { failure }, Defect { cause },
                Cancelled, Restored, Interrupted, StorageRefused and Disposed. The cause of Defect { cause }
                lives in process only (@spec.Diagnostics.R9): a saved Defect row keeps the tag and no cause.

                These Specs write `NotSent { Rejected }` for the first's Rejected tag and
                `unknown { Restored }` for the second's Restored tag. Superseded, NothingToResend,
                InFlight, Released and CancelMissed (proposed name) are evidence, never endings.
                There is no timeout reason. An author's failure tag is the author's alone and may
                spell any name, a Flow tag's included: the origin of an ending is its key and type,
                never its name, and a saved row keeps that origin (`model`, Owed). Decision (user,
                2026-11-12): "option B" (wide consult W1); ReservedReason is retired and the
                proposed unknown Abandoned is dropped. Why: the user's answer. Reverse: restore R3
                from commit `9405af2f`.

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
                a declined commit, which has none. An unmapped `notSent` is evidence (R10; whether it also leaves an 
                issue is Q6) at run time; `check` reports it as an
                error where it can occur (@spec.StaticCli.R10).
                Decision (user, 2026-11-12): "option B" (wide consult W1). Why: the user's answer.
                Reverse: restore R4 from commit `9405af2f`.

                A bare operation maps nothing: its endings are evidence. An unknown that is not
                retained (bare, ignored, or under the cancel concurrency policy once its own
                ending's turn ends) is released, and the store hears Released. The O.x.cancel
                member's unknown { Cancelled } is retained (R14).

    R5  The Attempt
        source  @plan.Operations.O3.
        must    Every admitted commit that is not declined has an Attempt { id, operation, key,
                input, retryCount, handle } from the moment it becomes a head (a queued commit gets
                its Attempt when promoted); a declined commit (NotSent before its cell, or by its
                cell) has none. Flow mints id when the write starts.

                The id is unique across devices and scopes and never reused within a scope, because
                a server may use it as its idempotency key; the mint draws on entropy the host
                supplies as data at boot (a random session seed of at least 128 bits), so the core
                stays deterministic given its inputs and replays exactly (the runner's ruling).
                Every boot asks the host for a fresh seed; a seed is never restored from disk or
                carried to a later boot, so ids stay unique across restore without reading every id
                off disk. Decision (agent, 2026-11-11): audit gap G4. Why: a restored or shared seed
                repeats ids a server has already seen. Reverse: drop the seed sentences and I28
                (spec-log.md, T42). Attempts have their own counter, so minting any other id never
                changes an Attempt id.

                `handle` (proposed name `Attempt.Handle`) names the Attempt for user code without
                exposing it: typed by its operation (a handle of another operation is a type
                error), unreadable (no id, key or field), and unforgeable (no public constructor;
                only Flow's Schema for it decodes one, so memory may hold it). It names that one
                Attempt for the Attempt's whole life, across incarnations and restore, since
                Attempt ids never repeat; a queued commit has no Attempt and so no handle. The row
                view carries the head's handle (@spec.Reads.R14).
                Decision (user, 2026-11-12): "Q1 B", an exact cancel target (R14).

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
                or not that lane has a head. A Kept row (@spec.Actors.R15) does not make a lane
                exist, but blocks the key it names: while a row is Kept, a commit on that key
                declines NotSent { Rejected } before its cell under reject, latest and serialize;
                under cancel the newer commit wins, so the lane's Kept rows close, recorded letGo,
                and the commit meets its cell. Decision (agent: the T18 lead, 2026-11-16): Q5 ruled
                as consult round 3 handed it over. Why: cancel exists so the newest commit runs.
                Reverse: decline Rejected under cancel too. No other row blocks a key; a Kept row taking its one try at 
                a start
                is Retrying and blocks nothing until it is refused again, the same exposure as the
                first refusal (nothing is lost, since the try is served in that step's drain).
                Decision (agent: the orchestrator, 2026-11-12): consult round 3 and T54's decisions
                1 and 2, replacing ruling CQ3. Why: a twice-refused ending must be heard before
                newer work on its key (@plan.Operations.O3), and only a Kept row waits that long.
                Reverse: restore R6 from commit `9405af2f`.

                A turn's members apply to lanes in action order in validation.

    R7  Concurrency cells
        source  @plan.Operations.O3.
        must    commit on Idle mints an Attempt.

                On InFlight or Held:

                - reject ends NotSent { Rejected } and the transition runs;
                - latest queues one commit, ending a previous queued commit or a never-invoked head
                Superseded (evidence), except a head with a cancel pending on it (Withdrawing),
                which stays (R14);
                - serialize appends to W and past 64 ends NotSent { Overloaded };
                - cancel interrupts the previous Attempt, whose ending is evidence unless a cancel
                is pending on it (R14). Decision (agent, 2026-11-11): ruling CQ9. Why: R14's "a
                pending cancel is never lost" is the author's explicit request. Reverse: make the
                interrupted Attempt's ending always evidence (spec-log.md, T42).

    R8  Retry, holds and promotion
        source  @plan.Operations.O3.
        must    retry(k?) re-sends a Held Attempt with its id and input unchanged; on InFlight it is
                evidence InFlight, on Idle or resolved NothingToResend. A retry accepted on a Held
                lane is owed: it re-sends exactly once, unless a later member of its turn, a
                release, a disposal or a refused lane-record capture (@spec.WriteAhead.R13) ends or
                holds the head first.

                When the addressable Attempt is resolved, released or superseded (R7's latest), W's
                head is promoted; an unknown, a retry and a restore never promote. Decision (agent,
                2026-11-11): ruling CQ7 and the owed retry. Why: a superseded head is gone, so
                nothing else would promote what waits; a retry the turn accepted must not vanish.
                Reverse: drop "or superseded" and I26 (spec-log.md, T42).

                Every Attempt minted, promoted or re-sent is invoked after its turn ends, once its
                acknowledgement and record queues allow. Under reject, latest and serialize an
                unknown holds the lane until retry resolves it or cancel releases it: no quiet
                release, no automatic retry. A not-retained unknown is released as R4 says, under
                any policy. A Kept row blocks its key until the row closes (R6; @spec.Actors.R15).

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
                Parked) for that identity's next start (@spec.Actors.R10). The mailbox holds a
                reference to the row, and a reference whose row is closed delivers nothing. A row's
                reports come from the row alone (I34), and no report, snapshot or public value names
                a row's id, a lane id or a row's Delivery (I37). Decision (agent: the orchestrator,
                2026-11-12): consult round 3, Part 2. Why: one holder of endings makes "exactly
                once" one place to check. Reverse: restore R10 from commit `9405af2f`.

                An ending whose turn is refused, a throw from its outcome mapper at admission
                included, is tried once more after queued mail; a second refusal keeps it (Kept)
                until the next start, each of which gives it one try (@spec.Actors.R15). Every kept
                ending is its own row: a second one on the same lane replaces nothing. Decision
                (agent, 2026-11-11): ruling CQ1. Why: a refusal may be transient, and retrying
                without bound would spin. Reverse: restore the pre-T42 text (spec-log.md, T42).

                Every admitted commit ends: it waits (to be invoked, on the wire, or queued) or is
                Held until it gets exactly one ending, delivered, parked or recorded as evidence;
                none disappears without one. A declined commit has no Attempt and no lane; its
                ending is a row like any other.

                Evidence by declaration: a replaced never-sent commit, a released lookup, a declined
                retry, a bare write's endings, an ending mapped to Flow.ignore, the interrupted
                Attempt under concurrency cancel with no cancel pending on it, a fragment's lookup
                whose incarnation ended, and a releasing lane's endings and queued commits.

    R11  Old-version holds
        source  @plan.Operations.O3.
        must    A lane of an older key fingerprint is an old-version hold: until it ends, every
                commit of that operation for that identity declines NotSent { OldVersion } under
                every policy, and a keyed idle denies.

                A lane of an older identity version is not a hold: the boot re-keys it and it blocks
                nothing (@spec.Restore.R6). previous: [{ key }] gives O.x.previous[i].retry, cancel
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
                and ModuleDisabled belong to the entity store's Spec, to be written in phase 5.

    R14  cancel
        source  @plan.Operations.O7.
        must    O.x.cancel(k?, { attempt? }) acts on the addressable Attempt by its history. Without
                `attempt` it acts on the head of the lane k names, whatever that head is now. With
                `attempt`, a handle (R5), it acts only when that handle names the addressable head
                of a lane k names (a partial key included); otherwise the lane, its queue and every
                ending stay as they are, nothing is promoted, and the cancel is recorded as evidence
                CancelMissed (proposed name). So a handle from an Attempt that already ended, was
                displaced, or is on another key's lane cancels nothing. Decision (user, 2026-11-12):
                "Q1 B", key cancel stays the default and an exact target is optional.

                On the wire it interrupts the fiber, and the ending is whichever the fiber's Exit
                shows: a success or failure the call answered first is delivered as it is (its
                success write applied, R1), with the cancel recorded as evidence CancelMissed, and
                promotes; the interruption gives unknown { Cancelled }, queued when the fiber exits and
                retained (Held); an
                unknown or defect the call itself gave is delivered as it is and holds the lane.
                Decision (user, 2026-11-12): "Q2 B", a definite answer beats the cancel. The call's
                own unknown or defect is the agent's reading of Q2 B, for the user's read
                (spec-log.md, 2026-11-12 review fixes). Waiting to
                be invoked: never sent, NotSent { Cancelled } and the next queued commit is
                promoted; a re-send returns to Held and is released.

                Held: released (evidence) and promoted. Idle: nothing, and no ending. While a
                never-sent Attempt's acknowledgement is being written, cancel waits for storage:
                stored ends NotSent { Cancelled }, refused NotSent { StorageRefused }; that wait is
                unbounded (stated limit). A pending cancel is never lost to a later replacement.

                A cancel that comes after the call settled finds the lane as that ending left it and
                never changes the ending: a known success stays a success (I32). Beside its cell, a
                cancel closes every Kept row that names its lane, recorded letGo.

    R15  cancelAll (retired)
        source  @plan.Operations.O7.
        must    None: retired (reason).
        reason  Retired 2026-11-12 (the user; wide consult W1, K0): `cancelAll` is deferred, since
                neither reference app uses it. Nothing builds or tests it. Its rule and prior art
                are in wiki/plans/flow/references/proposals/revisit.md (`cancelAll`); the old
                text is at commit ae48afa4.

    R16  Release on leave
        source  @plan.Operations.O7.
        must    A key-less O.x.cancel in whenAbandoned marks every lane of that operation for the
                ending incarnation's subject path releasing, and finishes each: an Attempt on the
                wire is interrupted, a Held head is released (evidence Released), a never-sent head
                ends as evidence (as cancel's NotSent, never delivered), a head waiting to re-send
                returns to Held and is released, and queued commits end as evidence. Later endings
                apply to the lane and store without being delivered, and a head one of them would
                leave Held is released. This is the only case where cancel drops a queued commit
                without an ending.

    R17  Cleanup
        source  @plan.Operations.O7.
        must    Planned release interrupts the fiber and runs finalizers once, without interrupt
                endings. cancel on a one-off read releases the operation's wait, not the shared
                request. Cleanup failure reports an issue without undoing a published transition.
                After cleanup, late results cannot change data, lanes, endings or replacement work.
                disposeActor invokes nothing new and drops no lane; Runtime disposal invokes nothing
                new and drops only a head whose ending is definite (@spec.Actors.R20,
                @spec.Actors.R22).

open
    Q1  Executable checks are not built.
        outcome  Each test below is written, when its slice is built, as the cheapest check that fully covers it (a
                 compile-time test, a run rule applied to every Story run, a Story test or a pure core test) in
                 packages/flow-state-v3/tests/, and each rule gets a planted fault in tests/faults.ts that
                 `nub run faults` must catch; until then every Requirement's evidence is open.

    Q2  RetryLimit and Superseded as evidence have no prototype wrong runtime.
        outcome  Their checks and planted faults are written with their slices.

    Q3  R13's store-side rules (record queues, their bounds, ModuleDisabled) moved to the entity store area.
        outcome  They are written with the entity store's Spec, which does not exist yet (phase 5).

    Q4  The prototype mints counters floored at boot (round-14/durable.ts, round-14/step.ts), which are unique only per 
        scope and do not meet R5.
        outcome  Phase 4 builds the seeded mint; its planted fault is a counter that collides across two devices.

    Q6  Does an ending with no mapping leave an issue as well as evidence? Case: an operation maps `success:` only and 
        a commit declines NotSent { Rejected }. The core's ledger closes the row Recorded as evidence and emits no
        issue (src/core/serve.ts, src/core/ledger.ts tryOne); the Operations plan O3 says an unmapped failure leaves
        its tag and an issue, and the prototype issues UnmappedEnding (round-14/turn.ts, deliver).
        outcome  Reading A: evidence only (R4 as written). Reading B: evidence plus one UnmappedEnding issue, as in
                 Reads R9. The user decides; a plan's guarantee is at stake.

    Q7  Under cancel, a displaced Attempt whose call outlives its lane (the new head ends first) is in no lane record, 
        so a reload loses its unknown { Restored }, which @plan.Operations.O3 and @plan.Persistence.O6 promise.
        outcome  Pinned by an `it.fails` in tests/write-lanes/policy-cells.test.ts; @task.V3.T20 (restore) owns
                 the fix.

model
    Lane = (identity with version, contract id, key) -> { phase, W, displaced, mode }. mode is Delivering, or
        Releasing after R16's release. A lane in phase Idle is not stored. A lane's id is the text after `lane/`
        in its record key (@spec.Codec.R5), so lane-id order and record-key order are one order.

    State = Idle | InFlight | Held (R6). InFlight is every Phase from Acknowledging to Cancelling. A lane
        has a head or is Idle; an ending, kept or not, is never a lane state.

    Head = the addressable Attempt: the one retry and cancel name.

    Phase = where the head stands, one tag per history and wait, never a flag:
        - Idle: no head, W empty;
        - Acknowledging: never sent; its acknowledgement batch is out (@spec.WriteAhead.R13);
        - Unsent: never sent; acknowledged or not persisted; waits for its turn's end and record queues;
        - Withdrawing: never sent; a cancel came while it was Acknowledging and waits for storage (R14);
        - Recapturing: sent before; its re-send waits for the lane record's capture;
        - Resending: sent before; its re-send waits for its turn's end and record queues;
        - OnWire: invoked, with no ending yet;
        - Cancelling: on the wire, and interrupted by a cancel;
        - Held: its last ending is a retained unknown, and it is not on the wire.

    Displaced = an earlier Attempt the cancel policy replaced while it waited or was on the wire. Its ending is
        delivered when a cancel was pending on it (Withdrawing, Cancelling), and is evidence otherwise (R7, R10);
        a displaced Cancelling Attempt that answers definitely delivers that answer, with CancelMissed (R14).

    Promote = W's head becomes the head, minted as Acknowledging when its identity persists, else Unsent; with W
        empty the lane goes Idle. A Kept row never stops a promotion: the head resolved at settlement, before any
        refusal. An unknown, a retry and a restore never promote.

    Delivered = for an Attempt a, the endings of a delivered to an incarnation, parked endings
        counted once.

    Owed = one row of the owed ledger: an ending, from the step its call settles (or its commit declines) until its
        close. A row names its identity, its audience, its operation, its Attempt and lane when it has them (a
        decline has neither) and the ending (channel, reason, value). The channel is success, failure (the
        author's own), notSent (Flow's NotSent) or unknown, and it records the origin: a reload routes an
        author's failure tagged Cancelled to `failure:` and Flow's NotSent { Cancelled } to `notSent:`, as before
        the reload (I39). A row also carries the owning activation and whether it is current
        (@spec.Turn.R20), unchanged until @task.V3.T17. The ledger keeps each identity's rows in the order they
        were owed, and is the only place an ending is held.

    Audience = who a row is owed to, chosen by the code that owes it: Identity (any incarnation of the identity;
        saved when the identity persists) or Life (one incarnation's life, not the Runtime's Life of
        @spec.Actors; never saved; closed as evidence when that incarnation ends). A write's ending, a decline
        included, and a stopped read's Interrupted are owed to the Identity; a lookup's ending is owed to the Life
        that asked (@spec.Reads.R6). An audience is live when the identity has a live incarnation (Identity) or
        that incarnation is alive (Life).

    Parked = the report word for a row that is Waiting; Unparked for one that leaves Waiting. Where these Specs say
        an ending is parked, they mean its row is Waiting.

    Delivery = where a row stands, one tag: Queued (a try is in the mailbox); Retrying (refused once; its second
        try is in the mailbox, behind the mail queued at the refusal); Waiting (nothing can hear it now; reported
        Parked); Kept (refused twice; one try at the next start; blocks its lane's key).

    Blocked = keptOn(identity, lane): some row of that identity that names that lane is Kept. It is the only read of
        the ledger a commit makes (R6).

invariants
    I1  No commit is invoked except one admitted by an accepted action's member, or promoted, or re-sent by retry. 
        [@R1, @R8]

    I2  No success write is applied unless its commit succeeded, and none is applied after that ending's event is 
        admitted. [@R1]

    I3  Every delivered ending is exactly one of success, failure, notSent and unknown; an Attempt that ever ended 
        unknown never delivers a definite failure; and an Attempt never sent ends only NotSent, or unknown { Restored }
        at its identity's start (a boot, a return or an adoption). A crash before a failure was saved rolls the
        identity back to its last landed capture (@spec.WriteAhead.I21), which forgets the failure: the Attempt
        restores as unknown { Restored } (@spec.WriteAhead.I17) and its later endings are judged afresh. A
        restored Attempt counts as perhaps sent from then on, so a re-send's refused capture may end it unknown {
        StorageRefused } (I15).
        Decision (agent, 2026-11-11): ruling CQ5. Why: an Attempt with no send can only be known not sent, unless a
        crash hid whether it was. Reverse: drop the last clause (spec-log.md, T42).
        Decision (agent, 2026-11-16): "at a boot" widened to every start, and the unsaved-failure case written out.
        Why: generated runs show an acknowledged, unsent Attempt restored again at a return after disposal (I15 allows
        once per incarnation), and a failure delivered then lost by a crash before it was saved. Reverse: restore
        "at a boot" and treat both as breaches. [@R2]

    I4  No delivered ending is an evidence kind. A failure mapper receives only the commit's own failure, a notSent 
        mapper only a Flow.NotSent and an unknown mapper only a Flow.Unknown, whatever the author's tags are named.
        [@R3, @R4]

    I5  A not-retained unknown leaves no Held lane. (Its mapped target is @spec.Compile.I11's.) [@R4]

    I6  All sends of one Attempt carry the same id and the same input. No two writes share an id: within a Runtime, 
        across restore, or across Runtimes on different devices or scopes given different session seeds. Given the same
        inputs and seed, the mint gives the same ids. [@R5]

    I7  retryCount equals the number of invoked re-sends of that Attempt. [@R5]

    I8  A lane exists iff it has a head, and a Kept row makes none exist; its W length is 0 under reject, at most 1 
        under latest, at most 64 under serialize. [@R6, @R7]

    I9  Every retry and cancel on a lane acts on one Attempt: the one the lane's last send carried, or, before any 
        send, the head waiting to be invoked. [@R6]

    I10  A turn's members apply in action order, each to the lane state the previous one left. [@R6, @R9]

    I11  W's head is promoted only when the addressable Attempt is resolved, released or superseded. Decision (agent, 
         2026-11-11): ruling CQ7, as in R8. [@R8]

    I12  A Held lane leaves Held only by a retry's resolution, a cancel, a release on leave, the end of a not-retained 
         unknown's turn (R4), forget of a hold whose operation is gone (HoldForgotten, @spec.Actors.R21), or
        @spec.Restore.R5's stated fresh start. [@R8, @R14, @R15, @R16]

    I13  idle(k) passes iff every lane matching k is Idle and no Kept row names a lane matching k. [@R6, @R9]

    I14  A key-less member on a keyed operation names only the ending's own Attempt. [@R9]

    I15  Per Attempt and per incarnation, each ending is either delivered once (to a live incarnation, or parked for it 
         and delivered once) or recorded as evidence only, never both and never twice, with these exceptions written
        out: a re-send whose lane-record capture is refused adds a second ending of the same Attempt, unknown {
        StorageRefused }; unknown { Restored } is delivered at most once per incarnation, so once again after each
        reload or return (@spec.Restore.I6); an ending whose turn is refused (InvalidTurn, an outcome mapper throw at
        admission included) is delivered once more after queued mail, and a second refusal ends its tries until the
        next start (a reload, a return or an adoption), each of which gives it exactly one try with no redelivery
        after a refusal there (@spec.Actors.R15); a releasing lane delivers nothing (a crash before its release was
        saved undoes the release, @spec.WriteAhead.I21); evidence-only endings (a bare
        operation, Flow.ignore, Superseded, the interrupted Attempt under concurrency cancel when no cancel is
        pending on it, a released lookup) are recorded, never delivered. Re-parking is not a second delivery.
        Decision (agent, 2026-11-11): rulings CQ1 and CQ9, as in R10 and R7. [@R10, @R16]

    I16  After a success or failure of an Attempt is delivered, no other ending of it is delivered, except, in a later 
         incarnation after a crash that came before that delivery was saved, unknown { Restored }
        (@spec.WriteAhead.I17, @spec.WriteAhead.I21) or the same saved ending once more (I15 counts per
        incarnation).
        Decision (agent, 2026-11-16): the crash exception written out. Why: R14 restores an acknowledged Attempt
        with no saved ending as unknown { Restored }, and generated runs deliver a success, lose its save to a
        crash, and restore it. Reverse: make the delivery wait for the save. [@R10]

    I17  While an old-version hold (an older key fingerprint) exists for (identity, operation), no commit of it is 
         invoked: each declines NotSent { OldVersion }, or NotSent { Rejected } where R11 puts another path's Rejected
        first; no current member names that lane; a lane of an older identity version declines nothing. [@R11]

    I18  A commit that cannot encode never fails its turn. [@R12]

    I19  A domain write's store effects precede its ending in the mailbox. [@R13]

    I20  A cancel's move depends only on the head's history and, with a handle, on whether the handle names the head, 
         never on timing. A cancelled call on the wire ends by whichever its fiber's Exit shows: an answer the call gave
        first, delivered as it is, or the interruption, unknown { Cancelled }. [@R14]

    I21  Retired with R15 (revisit.md, `cancelAll`): it ordered cancelAll's endings, queue first and the head's last. 
         [@R15]

    I23  After cleanup no late result changes data, lanes or endings. [@R17]

    I24  When a commit succeeds, its valid success write is applied, except over data that landed after the commit 
         started, which it marks stale instead; an invalid one applies nothing and reports InvalidWrite while the
        commit still succeeds. [@R1]

    I25  A delivered success, or a delivered failure other than Flow's NotSent, matches an answer that a send of that 
         Attempt received from its adapter. Decision (agent, 2026-11-11): ruling M5, as in R2. [@R2]

    I26  A retry accepted on a Held lane is followed by exactly one invocation of that Attempt, with the same id and 
         input, unless a later member of its turn, a release, a disposal or a refused lane-record capture ends or holds
        the head first. Decision (agent, 2026-11-11): the owed-retry ruling, as in R8. [@R8]

    I27  Every admitted commit, at every quiescent point, is waiting (to be invoked, on the wire, or queued), Held, or 
         has exactly one ending delivered, parked or recorded as evidence; and a call that settles gives its Attempt an
        ending. Declines count: commits admitted equal Attempts minted, plus declines, plus commits queued or ended
        while queued, and each decline has exactly one ending. [@R8, @R10]

    I28  Every boot mints from a seed the host supplied for that boot, never from a seed restored from disk or used by 
         an earlier boot; the seed has at least 128 random bits. [@R5]

    I31  Kept rows never replace one another: every twice-refused ending is its own row, two on one lane included, and 
         each gets one try at every start until it is heard or let go. [@R6, @R10]

    I32  An ending is applied to its lane in the step its call settles, before any turn hears it, and nothing after 
         settlement changes it: a cancel admitted between a success's settlement and its turn leaves it a success.
        [@R10, @R14]

    I33  A commit under reject, latest or serialize declines NotSent { Rejected } before its cell exactly when a row 
         naming its key's lane is Kept at that moment; a Queued, Retrying or Waiting row blocks no key, a Kept row on
        its try at a start included, and no cell reads the ledger. [@R6]

    I34  A row's life is reported from the row and nowhere else: Ended once at its birth, Parked each time it goes 
         Waiting, Unparked each time it leaves Waiting, and exactly one of Delivered or Recorded at its close. The
        ledger adds no report kind. [@R10]

    I37  No report, snapshot, row of `O.x.get` or value handed to user code carries a row's id, a lane id, a ticket, a 
         timer, a record key or a Delivery. A report names an ending by its Attempt id, or by actor, operation and
        order when it has none. [@R10]

    I38  Flow.NotSent and Flow.Unknown are discriminated by `_tag`, and each value round-trips through its Schema: 
         decode(encode(v)) has the same tag and fields. [@R3]

    I39  A saved row keeps its ending's origin: after any reload, a row saved from an author's failure reaches only the 
         failure mapper and a row saved from a Flow.NotSent only the notSent mapper, whatever their tags are named.
        [@R3, @R4]

    I40  A cancel with a handle changes a lane only when the handle names that lane's addressable head, and the lane is 
         one the cancel's key names; otherwise the lanes, their queues and the ledger are unchanged, no ending is
        added, and CancelMissed is recorded. [@R14]

    I41  A success or failure a call answered while its head was Cancelling is delivered as it is, never as unknown { 
         Cancelled }, and its success write is applied; unknown { Cancelled } is delivered only for a call whose Exit
        is the interruption. [@R14]

owner Ledger
    lifetime  one Runtime. Design, agreed by the user, 2026-11-12 (consult round 3, Part 2); I29 and I30 moved here
              from `invariants`, ids kept.
    state     the owed rows and the mailbox's references to them (`algorithm`, ledger)

    invariants
        I29  Only a close removes a row, and a row is closed at most once. Every open row has a waker: a mail reference 
             for Queued and Retrying, the next start of its identity for Waiting and Kept; at every step's end the
            mail's ending references are exactly the Queued and Retrying rows. [@R10]
        I30  A mail reference whose row is closed delivers nothing. [@R10]

owner Attempts
    lifetime  one Runtime. Design, agreed by the user, 2026-11-12 (consult rounds 2 and 3); I35 and I36 moved here
              from `invariants`, ids kept.
    state     the Attempt counter and each head's phase and retryCount

    invariants
        I35  Attempt ids come from their own counter: minting any other id never changes an Attempt id. [@R5]
        I36  An Attempt's `mayHaveApplied` equals `sentBefore(head)`: its retryCount is above 0, or its head is Held, 
             Recapturing or Resending; no head and no record stores it. [@R5]

algorithm
    Design, agreed by the user, 2026-11-12 (consult round 3, Part 2; T54's decisions); moved here from `model`.
        It shows how the Requirements are met; the Requirements and the Invariants are the contract. A line here
        that a Requirement cites is binding, and a clash between the two is a Spec bug.

    cell(phase, input) -> phase, endings, evidence: one total function. Every (phase, input) pair below has exactly
        one cell; a pair marked impossible is a defect in Flow. The declines R11 and R12 give under every policy
        (OldVersion, Unencodable, NoPersistence), and R6's Rejected on a key with a Kept row, come before the cell.
        A cell reads and changes lane state only; none reads the ledger. A boot rebuilds lanes from records
        (@spec.Restore.R3), not through cells. A store's answer for a ticket no head awaits (a late answer after a
        disposal, or after a release ended its head) reaches no cell and is not a defect. By input:
        - commit under reject: Idle mints; every other phase declines NotSent { Rejected } (R7).
        - commit under latest: Idle mints; Acknowledging and Unsent queue it, end the head Superseded (evidence)
            and promote; every other phase queues it, ending a queued commit Superseded. Withdrawing's head is not
            superseded, since a pending cancel is never lost (R7, R8, R14).
        - commit under serialize: Idle mints; every other phase appends it to W, and past 64 it declines NotSent {
            Overloaded } (R7).
        - commit under cancel: Idle mints (a key's Kept rows close first, R6). Acknowledging and Unsent end the head
            Superseded (evidence); Recapturing, Resending and Held release it (evidence Released); OnWire interrupts
            it and displaces it, its ending evidence; Withdrawing and Cancelling displace it with its ending owed. In
            each, the commit then mints (R7, R14).
        - retry: Held goes Recapturing when its identity persists, else Resending, and the re-send is owed (I26);
            Idle gives evidence NothingToResend; every other phase gives evidence InFlight (R8).
        - cancel: Idle does nothing and gives no ending (its lane's Kept rows are closed by R14, outside the cell);
            Acknowledging goes Withdrawing; Unsent ends NotSent { Cancelled } and promotes; Recapturing,
            Resending and Held are released (evidence Released) and promote; OnWire is interrupted and goes
            Cancelling; Withdrawing and Cancelling stay (R14).
        - cancel with a handle: when the handle names the head, the cancel cell above; otherwise no change and
            evidence CancelMissed (R14, I40).
        - invoked, after the turn with every wait met: Unsent and Resending go OnWire, and a re-send adds one to
            retryCount; impossible elsewhere (R5, R8).
        - stored, its batch landed: Acknowledging goes Unsent; Recapturing goes Resending; Withdrawing ends NotSent
            { Cancelled } and promotes; impossible elsewhere (R14; @spec.WriteAhead.R13).
        - refused, its batch refused: Acknowledging and Withdrawing end NotSent { StorageRefused } and promote;
            Recapturing goes Held and delivers unknown { StorageRefused }; impossible elsewhere
            (@spec.WriteAhead.R13).
        - answered with success or failure, one input in the step the call settles: OnWire owes it and promotes;
            Cancelling owes it as it is, records evidence CancelMissed and promotes (I41); impossible elsewhere
            (R2, R14). No later input applies the ending again when its turn is admitted. A failure after an
            unknown send of the same Attempt is classified unknown StillUnknown first (R2) and takes the next cell.
        - answered with unknown: OnWire owes it and goes Held; Cancelling owes unknown { Cancelled } when the
            fiber's Exit is the interruption, else the call's own unknown, and goes Held; impossible elsewhere (R2,
            R14).
        - the turn of a not-retained unknown ends (R4): Held is released (evidence Released) and promotes; nothing
            elsewhere.
        - release on leave (R16): mode goes Releasing; W's commits end as evidence; Acknowledging, Unsent and
            Withdrawing end as evidence (never sent, not delivered); Recapturing and Resending go Held and are
            released (evidence Released); Held is released (evidence Released); OnWire goes Cancelling; Cancelling
            stays. In a Releasing lane every later ending applies to the lane and store as evidence, and a head it
            would leave Held is released (evidence Released), so the lane ends Idle.
        - Runtime disposal starts (@spec.Actors.R22): Acknowledging, Unsent and Withdrawing end NotSent { Disposed
            }; Recapturing and Resending go Held; W's commits end NotSent { Disposed }; OnWire, Cancelling, Held
            and Idle stay.
        - the disposal bound passes: OnWire and Cancelling end unknown { Disposed } and go Held; nothing elsewhere.
            Where a lane's endings are owed together, the one that leaves a hold comes last (@spec.Actors.R22).

    ledger: the only five functions that build, move or remove a row.
        - owe: the row is born already applied to its lane; Queued with a mail reference when the Runtime's Life
            is Open (@spec.Actors `model`) and its audience is live, else Waiting; a Life row whose incarnation is
            gone closes Recorded at once.
        - tryOne: a mail reference to a missing row does nothing. With no mapping the row closes Recorded; an
            Accepted, Unhandled or Denied turn closes it Delivered (@spec.Turn.R26); a refusal moves Queued to 
                Retrying, with a new reference behind queued
            mail, and Retrying to Kept.
        - suspend, at an incarnation's end, disposeActor and for each identity at Runtime disposal: Queued and
            Retrying rows go Waiting, rows with no lane included; Life rows close Recorded.
        - start, the one delivery point of every Start (@spec.Actors `model`, @spec.Actors.R10): Waiting goes
            Queued and Kept goes Retrying, in the order the rows were owed; then, lane by lane in lane-id order
            (`model`, Lane: the record-key order), each Held head with no row for its Attempt is owed unknown {
            Restored }, a row like any other from then on, saved with the owed record (@spec.WriteAhead.R5); a
            Releasing lane's Held head is released instead (evidence Released), since a releasing lane delivers
            nothing (I15). A boot rebuilds every acknowledged head as Held (@spec.Restore.R3). Once a queue is
            saved, a lane's queued commits are owed NotSent { Restored } before its head's row.
        - close: the only removal, Delivered or Recorded (as evidence, or letGo for a Kept row).

composition
    flow
        Design note, proved by the prototype. The lane is a table as data: a row (lane state)
        and a column (phase, with "by history" as one bit) pick one action
        (packages/flow-state-v3/prototypes/round-14/lane.ts). The commit fiber's Exit is
        classified in the driver, outside the fiber (round-14/driver.ts).

        Shared terms. This Spec owns ending (R2, R3), Attempt (R5), lane (R6) and owed row
        (`model`); @spec.Actors owns Start, Adoption and Life (its `model`); @spec.WriteAhead
        owns the records (@spec.WriteAhead.R4, @spec.WriteAhead.R5); @spec.Reads owns the read
        slot. Other Specs cite these and do not restate them.

        The owed ledger is the World's only holder of endings: the five functions in
        `algorithm` are the only code that builds, moves or removes a row, and `keptOn` is the
        only blocking read. Mail carries a reference to a row, never the ending. A move issues
        no write and no report. Records are projected from what the step touched
        (@spec.WriteAhead.R5, @spec.WriteAhead.R10), and every report is built from the step's
        acts in act order: a lane's cue with its states before and after, a row's change, a
        turn's verdict with its parts and members, a call, an incarnation, the Runtime's life.

realization typescript
    Design, agreed by the user, 2026-11-12 (consult round 3, Part 2); moved here from `composition`.
    `lane(phase, input)` is one total function written from `algorithm`'s cell table, an exhaustive match over Phase
        and the input, so a new policy adds cells, not branches. Phase variants replace the head's `sent` and
        `cancelled` flags and the ending booleans; a lane's id and key text are derived, never stored. Each policy's
        commit is its own cue (`CommitReject`, `CommitLatest`, `CommitSerialize`, `CommitCancel`), and a head's cell
        also reads how many commits are queued, for serialize's 64. A head that leaves promotes W's oldest commit as
        a new Unsent head; promoted outside a turn (a settled call, a store's answer), it meets TurnEnded at once. A
        displaced head is kept apart from its lane by the call or ticket it awaits (`World.displaced`), and its own
        cell classifies its answer. When the disposal starts, W's commits end before the lane's cells, so nothing
        promotes. The lane record saves W and the owed displaced Attempts (@spec.Restore.R3).
    `src/core/cells.ts` holds the table: `cell(state, cue)` is one exhaustive match over the cue and then the lane
        state (Idle, or a head's Phase), returning a `Move` as data; a pair the table marks impossible returns
        `Impossible`, which the applier raises as a defect. `LaneState` is `Idle | Head`: there is no Kept row, no
        `Keep` cue and no cell for a kept ending.
    Production's Unsent and Resending wait for their turn's end (cue TurnEnded), which takes them to Acknowledging
        or Recapturing when the identity persists, else to the wire; a landed batch invokes at once, so the model's
        acknowledged Unsent and captured Resending pass in that one cue. A settled call is one cue, `Answered`: it
        is classified by the phase it found, applied to the lane in that step, and owed.
    `src/core/ledger.ts` holds the owed ledger, opaque outside that module; mail carries a row's id. Every report is
        built by `evidenceOf(act)` in `src/core/evidence-of.ts`, the only builder of an Evidence. A step returns `{
        world, commands, evidence }`, its evidence built from its acts in act order as they happen (Life is
        @task.V3.T55's). The host builds only reports the core does not own.
    Effect features: `Data.taggedEnum` for Phase, Cue, Move, Delivery, Audience and Act (exhaustive `$match` is the
        table's totality check); `Brand` for `OwedId`, `AttemptId` and `LaneId`; `Option` for an absent lane,
        Attempt or row. Skipped: `Match` (taggedEnum's `$match` already gives exhaustiveness at no cost), `HashMap`
        and `Data` structs per lane (a turn's hot path; plain maps cost less), `Effect` itself (the core is pure), a
        linear `OwedId` and typestate on the World (a missing row is a no-op by rule).
    In the host: `Deferred` for dispose waiting on the core's disposal before `Scope.close`; `FiberMap`, `Clock` and
        `Scheduler` as before. The final write's share of the disposal's 5 s is the core's (@spec.Actors.R23).

coverage
    @R1
        enforced_by  [@I1, @I2, @I24]
        open_by      [@Q1]

    @R2
        enforced_by  [@I3, @I25]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I38, @I39]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I4, @I5, @I39]
        open_by      [@Q1]

    @R5
        enforced_by  [@I6, @I7, @I28, @I35, @I36]
        open_by      [@Q1]

    @R6
        enforced_by  [@I8, @I9, @I10, @I31, @I33]
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
        enforced_by  [@I15, @I16, @I27, @I29, @I30, @I31, @I32, @I34, @I37]
        open_by      [@Q1, @Q7]

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
        enforced_by  [@I12, @I20, @I32, @I40, @I41]
        open_by      [@Q1]

    @R15
        enforced_by  [@I21]
        open_by      [@Q1]

    @R16
        enforced_by  [@I12, @I15]
        open_by      [@Q1, @Q2]

    @R17
        enforced_by  [@I23]
        open_by      [@Q1]

tests
    T1  Three channels and the Attempt's ending: success, failure and unknown each map to their event; a definite 
        failure after an unknown send is StillUnknown. Planted fault: a failure
            delivered as a success. [@I3]
    T2  The Attempt: every send has one id; a definite failure then a new write mints a new id; after a restore, new 
        ids never equal a restored one (a fresh seed each boot, R5). Planted fault: a mint
            floor that counts only the head. [@I6, @I7]
    T3  Concurrency cells, one per policy: reject declines beside a Held head; latest supersedes a never-sent head; 
        serialize declines the 65th; cancel interrupts the wire. Cases `PAY-15`, `MED-01`, `REV8-PINS`, `R15-01`; 
        prototype
            lie `lie.serialize-as-latest`; wrong runtimes `lane.queue-unbounded`, `d118.commit-beside-kept`. [@I8, @I9]
    T4  Retry and promotion: retry keeps id and input; a refused head promotes what waits; an unknown never promotes. 
        Cases `PAY-04`, `REV8-H1`; planted faults: an unknown that promotes, a fresh mint on Held, a cancel that
            keeps Held. RetryLimit has no prototype wrong runtime (Q2). [@I11, @I12]
    T5  Key-less members: on an unkeyed operation outside an ending; in a keyed success handler a key-less cancel does 
        nothing; a key-less idle denies a kept ending. Cases `R15-02`, `REV9-EDGE`; wrong runtimes
            `d123.keyless-idle-heads-only`, `1b.r43-keyless-falls-back-to-key`, `r15b.keyless-success-names-key-lane`.
            [@I13, @I14]
    T6  Exactly one delivery, across refusal, reload and parking. Cases `DRV-02`, `PAY-15`; prototype lies 
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
        `PAY-15`, `STORE-05`; planted fault: treats the wire as never sent. [@I12, @I20]
    T10  Retired with R15 and I21 (`cancelAll` is deferred; revisit.md); not written. [@I21]
    T11  Release on leave: the wire is interrupted and nothing delivered; a Held head, a never-sent head and a waiting 
         re-send are each released, a Cancelling head that answers is released, and the lane ends Idle; a reload of a
             releasing lane delivers nothing and leaves no hold. Case `FRAG-06`; prototype lies
             `d154.moved-save-released`, `lie.released`; planted fault: a Held head that stays Held after the
             release. [@I12, @I15]
    T12  Store effects before the ending: a domain write's store effects are visible in the cut before its ending's 
         turn, whether the ending routes current or late. No prototype wrong runtime; planted fault: queues
             the ending first. [@I19]
    T13  Late results after cleanup: release a placement and a commit, then land their results; data, lanes and endings 
         are unchanged. No prototype wrong runtime. [@I23]
    T14  Members only: restore, hydration, activation and re-entry of a state whose earlier activation committed invoke 
         no commit; an adapter spy counts one invocation per minted, promoted or re-sent Attempt. No prototype wrong
             runtime. Planted fault: replays a commit on re-entry. [@I1]
    T15  Success writes: a success write is applied before its ending's event and never on failure or unknown; an 
         invalid write reports InvalidWrite and the commit still succeeds; a write over data that landed later marks it
             stale instead. No prototype case. [@I2, @I24]
    T16  Origins and unknown targets: an operation whose author failure tag is named Cancelled, with `notSent` and an 
         `unknown` record mapping Cancelled and `otherwise`; the author's failure reaches only the failure mapper, a
             declined commit only `notSent`, a cancelled send only the unknown record's Cancelled, and the commit's own
             unknown error reaches `otherwise` as Outcome { error }; after a reload with both rows saved, each still
             reaches the same mapper. A type test: a missing failure tag and a `failure.NotSent` key are errors. A bare
             operation's unknown leaves no Held lane (UnknownNotUncertain is @spec.Compile.T3's). Planted faults: Flow's
             Cancelled routed to the author's Cancelled tag; a row saved with channel failure for a NotSent. [@I4, @I5,
             @I39]
    T17  Member order: one turn listing cancel then commit on a Held lane, and one listing commit then cancel; each 
         member applies to the state the previous one left. Planted fault: applies
             members to the pre-turn lane. [@I10]
    T18  Ids across devices: two Runtimes with different session seeds, each on its own storage, mint writes to one 
         fake server keyed by Attempt id; no id repeats, and replaying one Runtime with its seed gives the same ids.
             Planted fault: the counter of Q4 that collides across two devices. [@I6]
    T19  Definite endings come from answers: a commit whose Effect never completes (`Effect.never`), one that succeeds 
         and one that fails with a tagged failure; a success or author failure is delivered only for the two that
             answered, and a runtime that turns a missing answer into a failure is caught (the planted fault). [@I25]
    T20  An owed retry re-sends: retry on a Held lane, with and without a later cancel in the same turn and with a 
         refused re-send capture; the adapter spy sees exactly one re-send with the same id only in the first case.
             Planted fault: drops the re-send. [@I26]
    T21  Every commit ends: generated member sequences over every policy; at quiescence each admitted commit is 
         waiting, Held or has exactly one ending, and each settled call has its Attempt's ending. Planted fault:
             drops a queued commit. [@I27]
    T22  A seed per boot: two boots of one scope with a host spy; each boot asks for its own seed and no Attempt id of 
         the second equals one on disk. Planted fault: saves and reuses its seed. The real
             host's seed is checked for its width, failing on a 32-bit seed. [@I28]
    T23  The ledger's rows: generated member sequences with refused turns; at every step's end the mail's ending 
         references are exactly the Queued and Retrying rows, every row closes at most once, and each row's reports
             are one Ended, then Parked and Unparked in pairs, then one Delivered or Recorded. Planted faults: a close 
                 with
             no report; a stale mail reference that delivers again. [@I29, @I30, @I34]
    T24  Two kept endings on one lane: two endings of one lane are each refused twice, and the jam stays on across the 
         next start; each gets exactly one try there, and both are heard once the jam clears at a later start. Planted
             faults: a keep that replaces, a start that skips Kept rows. [@I31]
    T25  Applied at settlement: a call succeeds and a cancel is admitted before the success's turn; the machine hears 
         the success and the lane is as the success left it. [@I32]
    T26  Only Kept blocks: under reject, latest and serialize, a commit on a key whose lane has a Kept row declines 
         Rejected; the same commit beside a Queued, a Retrying and a Waiting row mints, and beside a Kept row on its
             try at a start. [@I33]
    T27  Attempt ids keep their numbers: one script run with and without other ids minted between its commits gives the 
         same Attempt ids; each invoked Attempt's `mayHaveApplied` equals sentBefore(head), and no lane record holds the
             field. [@I35, @I36]
    T28  Nothing internal crosses: over every Story run, no report, snapshot or O.x.get row has a field holding a row 
         id, a lane id, a ticket, a timer, a record key or a Delivery tag; an ending with no Attempt is matched by
             actor, operation and order. Planted fault: a Delivered report carrying its row's id. [@I37]
    T29  Flow's values: every Flow.NotSent and Flow.Unknown tag is built, matched with Match.tag, encoded and decoded 
         by its Schema, and comes back with the same tag and fields; an owed row saved with each survives a reload as 
         that
             value. Planted fault: a value discriminated by `why`. [@I38]
    T30  An exact cancel: under serialize and under latest, a head A answers and B is promoted; a cancel with A's 
         handle records CancelMissed and B stays on the wire, while a key cancel cancels B. A handle that names the head
             cancels it as a key cancel would; a handle for a displaced Attempt under the cancel policy, a handle used 
                 with
             a key that names another lane, and a partial key that matches the handle's lane each behave by I40. A 
                 handle
             saved in memory names its Attempt after a reload: a Held head is released by it, an ended one gives
             CancelMissed. A type test: a handle of another operation is an error. Planted faults: a handle cancel that
             falls back to the key's current head; a handle that goes stale at a reload. [@I40]
    T31  A definite answer beats the cancel: a call on the wire is cancelled and then answers success; the machine 
         hears the success, its success write is applied and CancelMissed is recorded; the same with a failure; a call 
         whose
             fiber exits interrupted gives unknown { Cancelled } and Held; a displaced Cancelling Attempt under the 
                 cancel
             policy that answers success delivers it. Planted fault: a Cancelling head that turns every answer into
             unknown { Cancelled }. [@I20, @I41]
