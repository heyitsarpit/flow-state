spec Runtime
status        proposed
basis         Current Workflow owner Plans under workflow/plans/rewrite (proposed; not approved 
              as a set), plus the individually approved chat decisions cited by 
              affected Requirements; fresh preparation.
location      specs/runtime
provides      RuntimeSetup, Runtime, actor leases, actor handles, runtime.ready
derives_from  [
              @plan.ApplicationsAndActors.O1, @plan.ApplicationsAndActors.O2,
              @plan.ApplicationsAndActors.O3, @plan.ApplicationsAndActors.O4,
              @plan.ApplicationsAndActors.O5, @plan.ApplicationsAndActors.O6,
              @plan.ApplicationsAndActors.O7, @plan.ApplicationsAndActors.V1,
              @plan.ApplicationsAndActors.V2, @plan.ApplicationsAndActors.V3,
              @plan.ApplicationsAndActors.V4, @plan.ApplicationsAndActors.V5,
              @plan.ApplicationsAndActors.V6, @plan.ApplicationsAndActors.V7,
              @plan.Statecharts.O1, @plan.Statecharts.O2, @plan.Statecharts.V1,
              @plan.Statecharts.V2, @plan.ReactAndHosts.O1, @plan.ReactAndHosts.O2,
              @plan.ReactAndHosts.O3, @plan.ReactAndHosts.V1, @plan.ReactAndHosts.V2,
              @plan.ReactAndHosts.V3, @plan.PackageContract.O1, @plan.PackageContract.O2,
              @plan.PackageContract.O3, @plan.PackageContract.O4, @plan.PackageContract.V1,
              @plan.PackageContract.V2, @plan.PackageContract.V3, @plan.PackageContract.V4,
              @plan.Resources.O1, @plan.Resources.O2, @plan.Resources.O3, @plan.Resources.O4,
              @plan.Resources.V1, @plan.Resources.V2, @plan.Resources.V3, @plan.Resources.V4,
              @plan.Transactions.O1, @plan.Transactions.O2, @plan.Transactions.O3,
              @plan.Transactions.O4, @plan.Transactions.V1, @plan.Transactions.V2,
              @plan.Transactions.V3, @plan.Transactions.V4, @plan.Streams.O1,
              @plan.Streams.O2, @plan.Streams.O3, @plan.Streams.V1, @plan.Streams.V2,
              @plan.Streams.V3, @plan.Persistence.O1, @plan.Persistence.O2,
              @plan.Persistence.O3, @plan.Persistence.O4, @plan.Persistence.O5,
              @plan.Persistence.V1, @plan.Persistence.V2, @plan.Persistence.V3,
              @plan.Persistence.V4, @plan.Persistence.V5, @plan.StoriesAndModels.O1,
              @plan.StoriesAndModels.O2, @plan.StoriesAndModels.O3, @plan.StoriesAndModels.O4,
              @plan.StoriesAndModels.O5, @plan.StoriesAndModels.O6, @plan.StoriesAndModels.V1,
              @plan.StoriesAndModels.V2, @plan.StoriesAndModels.V3, @plan.StoriesAndModels.V4,
              @plan.StoriesAndModels.V5, @plan.StoriesAndModels.V6,
              @plan.InspectionAndArtifacts.O1, @plan.InspectionAndArtifacts.O2,
              @plan.InspectionAndArtifacts.O3, @plan.InspectionAndArtifacts.O4,
              @plan.InspectionAndArtifacts.O5, @plan.InspectionAndArtifacts.O6,
              @plan.InspectionAndArtifacts.V1, @plan.InspectionAndArtifacts.V2,
              @plan.InspectionAndArtifacts.V3, @plan.InspectionAndArtifacts.V4,
              @plan.InspectionAndArtifacts.V5, @plan.InspectionAndArtifacts.V6,
              @plan.DiagnosticsContract.O1, @plan.DiagnosticsContract.O2,
              @plan.DiagnosticsContract.O3, @plan.DiagnosticsContract.O4,
              @plan.DiagnosticsContract.O5, @plan.DiagnosticsContract.O6,
              @plan.DiagnosticsContract.V1, @plan.DiagnosticsContract.V2,
              @plan.DiagnosticsContract.V3, @plan.DiagnosticsContract.V4,
              @plan.DiagnosticsContract.V5
              ]

requirements
    R1  Closed application authority
        source  @plan.ApplicationsAndActors.O1, @plan.ApplicationsAndActors.O2; 
                @plan.Statecharts.O1;
                @plan.PackageContract.O1 and @plan.PackageContract.O2.
        must    Admit only exact machines, tokens, descriptors, and declarations compiled into the 
                immutable AppPlan.
                Definition, machine, module, and app compilation remain inert. Consume their 
                validated static tables without re-decoding definitions or expanding the graph.

    R2  Identity domains
        source  @plan.ApplicationsAndActors.O1, @plan.ApplicationsAndActors.O2; 
                @plan.Persistence.O1.
        must    Keep exact machine identity, stable actor identity, Runtime-local opaque identity, 
                actor incarnation, operation descriptor/K, and Story recipe/run identity distinct.
                Stable refs use actor: followed by length-prefixed UTF-8 machine-ID and authored-ID 
                segments; persist is metadata, never identity.

    R3  Inert construction
        source  @plan.ApplicationsAndActors.O3; @plan.Persistence.O1.
        must    RuntimeSetup discovery and construct stay synchronous and service-free: no storage 
                access, Implementation acquisition, actor registration, work, or evidence.

    R4  One readiness result
        source  @plan.ApplicationsAndActors.O3.
        must    The first ready execution that wins admission starts one bootstrap; all later 
                executions observe its same terminal Exit without retry. Only if Runtime disposal 
                already closed admission before that first execution does ready observe the retained 
                terminal outcome without a bootstrap.
                ready is the sole public readiness Effect. Internal phases remain private.

    R5  Readiness cancellation ownership
        source  @plan.ApplicationsAndActors.O3.
        must    If disposal closes admission before ready is first executed, build nothing and 
                acquire no provider. Otherwise the first ready execution starts the bootstrap. 
                Interrupting a ready caller interrupts only that wait. Runtime disposal closes 
                admission and starts shared close before waiting for bootstrap rollback or cleanup. 
                Disposal racing bootstrap prevents subsequent handle escape, even if acquisition 
                completes late; readiness retains the terminal outcome.

    R6  Bootstrap sequence
        source  @plan.ApplicationsAndActors.O3, @plan.ApplicationsAndActors.O7; 
                @plan.ReactAndHosts.O1;
                @plan.Persistence.O1 and @plan.Persistence.O2.
        must    Prepare and validate detached persistence data, acquire Implementation, install 
                store/actors/operation facts, initialize fresh admissions and context baselines, 
                seal, activate, then expose handles.
                Restore providers before consumers. Detached preparation registers nothing and 
                initializes no actor.

    R7  Admission isolation
        source  @plan.ApplicationsAndActors.O3; @plan.ReactAndHosts.O1;
                approved chat decision: clean retry follows successful invisible 
                rollback.
        must    A failed unpublished admission exposes no partial handle, snapshot, generation, 
                registration, edge, work, or accepted evidence. Reverse staged ownership on 
                failure. All callers share that attempt’s failure. A later ensure may retry with 
                a new first input only after invisible rollback succeeds completely; failed 
                rollback retains terminal cleanup truth and cannot retry. After lease visibility 
                use production disposal.

    R8  Installed environment
        source  @plan.ApplicationsAndActors.O3; @plan.DiagnosticsContract.O2 and 
                @plan.DiagnosticsContract.O3;
                @plan.PackageContract.O1.
        must    Require complete inferred application requirements; remove only Flow-owned Scope 
                from consumer requirements.
                Acquire each provider once per Runtime and keep acquisition failure at readiness, 
                using Diagnostic for the full future Runtime target.
                Duplicate service identity rejects without an order-selected winner. Omitted 
                Implementation is valid only for never requirements.

    R9  Shared ensure
        source  @plan.ApplicationsAndActors.O3; @plan.ReactAndHosts.O2;
                approved chat decision: each cleanly rolled-back retry uses that 
                attempt’s first accepted input.
        must    Each stable identity has one shared lease and actor lifetime per Runtime. 
                Concurrent ensures join the same admission attempt. The first accepted input 
                wins within that attempt; later input is ignored. A cleanly rolled-back failed 
                attempt permits a later attempt with its own first accepted input. Conflicting 
                fixed bindings reject. Dropping a lease does not dispose or decrement ownership.

    R10  Lookup authority
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O5; 
                @plan.DiagnosticsContract.O2 and @plan.DiagnosticsContract.O3.
        must    getActor(ref) is a read-only exact registered lookup, succeeds with an ActorHandle, 
                creates/adopts nothing, acquires no lease, and grants no disposal authority. Missing, foreign, 
                mismatched, closing, disposed, or quarantined identities fail via the owning 
                canonical Diagnostic. Only a Failure Diagnostic with FlowUsageCode may project to 
                FlowUsageError at the synchronous JavaScript boundary. Exact reason-to-code/path/
                details mapping remains unspecified by the owner sources.
    R11  Fresh local actors
        source  @plan.ApplicationsAndActors.O2 and @plan.ApplicationsAndActors.O3;
                @plan.ReactAndHosts.O2 and @plan.ReactAndHosts.O3.
        must    createActor always returns a fresh opaque Runtime-local actor and lease, attached 
                before exposure.
                React render preparation is the only inert prepared-handle exception; it creates 
                the final ref, handle, initial snapshot, and bounded mailbox without live ownership.

    R12  Fixed provider graph
        source  @plan.ApplicationsAndActors.O3 and @plan.ApplicationsAndActors.O5; 
                @plan.ReactAndHosts.O2.
        must    Bind each declared context slot to one exact compatible provider ref before effects.
                Reject missing, ambiguous, foreign, mismatched, closing, disposed, tombstoned, 
                opaque-provider, or cyclic bindings atomically. After provider disposal closes 
                admission, no new consumer edge may bind that provider. Preserve fixed refs and 
                incarnations through suspension.

    R13  Fresh initialization
        source  @plan.Statecharts.O1; @plan.ApplicationsAndActors.O1.
        must    A fresh actor initializes memory exactly once from its accepted input, or uses 
                canonical empty memory, then resolves defaults and redirects to one active leaf.
                Initializer, selector, or redirect defects abort unpublished admission. Original 
                input is unavailable to later machine behavior.

    R14  Restoration continuity
        source  @plan.Persistence.O1, @plan.Persistence.O2, and @plan.Persistence.O3.
        must    Restore materialized memory, exact state, bindings, revisions, and permitted 
                operation facts without initializer, input, finite-work, or emission replay.
                Install a silent derived context baseline. Normalize pending outcomes and reconcile 
                continuing declarations under their owning Plans before exposure.

    R15  Command boundary
        source  @plan.ApplicationsAndActors.O3 and @plan.ApplicationsAndActors.O4; 
                @plan.PackageContract.O3.
        must    actor.send synchronously admits the exact typed event or reports synchronous 
                admission failure, and returns void.
                Public handles expose only ref, send, getSnapshot, and snapshots. They grant no 
                acknowledgment, disposal, mailbox, or operation-registry authority.

    R16  Bounded admission
        source  @plan.ApplicationsAndActors.O5 and @plan.ApplicationsAndActors.O7; 
                @plan.ReactAndHosts.O3; 
                @plan.DiagnosticsContract.O1;
                @plan.Transactions.O2 and @plan.Transactions.V2 (FIFO semantics only);
                approved chat decision: finite actor and serialized-transaction queues 
                reject overload before occurrence, work, or state mutation.
        must    Prepared actor queues support at least 64 commands. Prepared/active actor queues 
                and serialized transaction queues have documented finite limits; the 
                serialized-queue bound is an individually approved chat decision, not a rule 
                supplied by Transactions.O2. Full admission rejects with canonical 
                AdmissionOverloaded before occurrence, work, or state mutation. 
                Suspended/disposed actors never buffer commands. Numeric serialize limits and 
                capacity mechanism remain private.

    R17  Ordered actor decisions
        source  @plan.ApplicationsAndActors.O4; @plan.Resources.O1, @plan.Transactions.O1, and 
                @plan.Streams.O1.
        must    Events, timers, context refreshes, operation completions, and StoreFanout facts 
                enter the actor's one ordered production decision path.
                A no-handler or all-guards-decline event is a silent no-op, with no publication, 
                issue, evidence record, or consumed revision.

    R18  Pure turn planning
        source  @plan.Statecharts.O2; @plan.PackageContract.O2.
        must    Select the first authored eligible transition. Its guard, updateMemory, and actions 
                read the same pre-turn snapshot/event.
                A declined transition invokes none of its later callbacks. Shallow-merge 
                updateMemory once, then stabilize candidate redirects; actions cannot read 
                candidate state.
                can queries only pure eligibility and changes no truth or work.

    R19  State-path semantics
        source  @plan.Statecharts.O1 and @plan.Statecharts.O2.
        must    Publish one exact active leaf. Resolve root/compound defaults, outermost-to-leaf 
                redirects, and authored order without intermediate publications.
                Exact reentry releases and re-enters only its containing active boundary. Reject 
                foreign, inactive, or non-containing reentry, duplicate ancestor/descendant 
                handlers, and microstep 101.
                Recursive nodes share one actor; terminal-looking leaves remain ordinary leaves.

    R20  Complete action admission
        source  @plan.ApplicationsAndActors.O4; @plan.Resources.O1, @plan.Transactions.O1, and 
                @plan.Streams.O1.
        must    Materialize finite plans only after transition acceptance and validate the complete 
                batch before mutation or work.
                Invalid batches admit no valid prefix. Continuing declarations reconcile 
                separately; user Effects start only after publication.

    R21  Atomic publication
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O7; 
                @plan.Transactions.O1; @plan.Persistence.O3;
                @plan.InspectionAndArtifacts.O3.
        must    A successful turn exposes one indivisible actor/store cut. Observers cannot see its 
                store revision without the initiating committed actor snapshot.
                Commit, snapshot, evidence acceptance, and acknowledgment form an interruption-safe 
                boundary; post-commit publication cannot be abandoned or described as rollback.

    R22  Acknowledgment
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O6.
        must    Private Story dispatch settles once after the ordered decision; a publishing 
                decision settles after snapshot and evidence acceptance, before sinks or user 
                Effect settlement.
                A silent no-op settles without publication. Fatal termination settles every 
                current/buffered acknowledgment without replay.

    R23  Snapshot truth
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O7; 
                @plan.Streams.O1 and @plan.Streams.O2.
        must    getSnapshot and snapshots expose complete published current state: exact leaf, 
                memory, inherited context, lifecycle, issues, one public revision, observed store 
                revision, passive named readers, and timers.
                Slow readers may skip intermediate snapshots. Each reader and container retains its 
                captured cut; raw Cause, receipts, pending inventory, diagnostics, and a second 
                public revision are absent.

    R24  Stream lifecycle
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O5;
                @plan.Streams.O1 and @plan.Streams.O2;
                approved chat decision: prepared subscriptions replay immediately and 
                remain attached for activation.
        must    New subscriptions replay current truth without a read/subscribe gap. Prepared 
                subscriptions replay their prepared snapshot immediately and remain attached for 
                activation; suspended subscriptions replay suspended and complete. Disposal 
                emits/replays terminal truth before completion. A previously completed 
                subscription does not reopen on resume.

    R25  Contained planning defects
        source  @plan.Statecharts.O3; @plan.ApplicationsAndActors.O4 and 
                @plan.ApplicationsAndActors.O7; pending selector-wave behavior: 
                @plan.ApplicationsAndActors.Q1.
        must    A per-actor pre-commit authored-callback defect discards its entire candidate, 
                preserves prior state/memory/bindings/store truth, and publishes one issue-only 
                snapshot with ordered stable diagnostics. Admit no occurrence or external work 
                and do not retry that candidate at the same cut. This rule covers guard, memory, 
                action, redirect, key, target, timer, binding, and the actor’s own selector 
                callbacks. Provider-wave consumer selector failure and retry policy remain 
                unresolved at @plan.ApplicationsAndActors.Q1.

    R26  Invariant failure
        source  @plan.ApplicationsAndActors.O4.
        must    An invariant defect closes actor admission, finalizes owned work, settles 
                outstanding acknowledgments, and publishes disposed fatal/cleanup truth.
                Never expose a partial candidate or synthesize a terminal machine turn.

    R27  Full failure truth
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O6;
                @plan.DiagnosticsContract.O1 and @plan.DiagnosticsContract.O2.
        must    Retain Exit and complete Cause through supervision, classification, cleanup, and 
                evidence aggregation.
                Diagnostic precedence is defect, typed failure, then interruption-only; 
                empty/unclassifiable failure is invariant defect.
                Only FlowDisposeError and FlowStoryExecutionError carry raw Cause publicly. Lossy 
                squashing occurs only at an intentional final JS boundary.

    R28  Lifecycle authority
        source  @plan.ApplicationsAndActors.O5; @plan.ReactAndHosts.O2 and @plan.ReactAndHosts.O3.
        must    Actor lifecycle is prepared, active, suspended, or disposed. Only a lease or 
                Runtime shutdown disposes individually owned actors.
                Disposal is terminal; suspension retains the actor lifetime. Lifecycle publications 
                precede lifecycle evidence and do not create machine turns.

    R29  Suspension boundary
        source  @plan.ApplicationsAndActors.O5; @plan.ReactAndHosts.O3; @plan.Transactions.O3.
        must    Suspension closes command admission once, drains previously accepted commands FIFO, 
                releases attachments, interrupts unsettled finite work, then publishes suspended.
                Preserve ref, handle, domain truth, fixed logical edges, operation continuity, 
                cursors, pending truth, and absolute deadlines.
                Planned releases route no domain outcome. Suspended actors have no live attachment 
                resources.

    R30  Resume
        source  @plan.ApplicationsAndActors.O5; @plan.ReactAndHosts.O2 and @plan.ReactAndHosts.O3;
                @plan.Transactions.O3.
        must    Resume waits for finalizers, rechecks exact providers, reconciles current context 
                through the ordinary context path, reacquires continuing work, and reinstalls 
                absolute deadlines.
                Perform at most one overdue refresh; never replay input, initialization, committed 
                events, finite actions, or emissions.
                Cleanup defect blocks resume until owner/Runtime disposal. An unavailable fixed 
                provider leaves the actor suspended; never rebind or recreate that provider.

    R31  Dependent disposal
        source  @plan.ApplicationsAndActors.O5; @plan.ReactAndHosts.O2.
        must    Reject individual provider disposal while active or suspended consumers remain 
                bound, naming exact dependent refs and slot keys.
                Rejection leaves provider admission and lifetime unchanged. Runtime teardown closes 
                all admission and disposes in reverse dependency order.

    R32  Terminal cleanup truth
        source  @plan.ApplicationsAndActors.O3 and @plan.ApplicationsAndActors.O5; 
                @plan.DiagnosticsContract.O2;
                @plan.PackageContract.O4.
        must    Individual and Runtime disposal are asynchronous, idempotent, and join one cached 
                cleanup result.
                Stable terminal identity remains tombstoned for that Runtime. Failed cleanup 
                quarantines it: get, ensure, and repeated dispose retain and report the same 
                failure without rerunning cleanup.

    R33  Silent context baseline
        source  @plan.ApplicationsAndActors.O3; @plan.PackageContract.O2; @plan.ReactAndHosts.O3.
        must    Initial admission/restore selects complete inherited context silently from exact 
                providers and records initial onContext selections without emitting events.
                React attachment rechecks provisional identity/revisions without replacing prepared 
                memory or handle.

    R34  Context propagation
        source  @plan.ApplicationsAndActors.O5 and @plan.ApplicationsAndActors.O6; 
                @plan.ApplicationsAndActors.V5;
                @plan.PackageContract.O2;
                approved chat decisions: per-consumer causal closure and terminal 
                retirement of a blocked context lane.
        must    A context wakeup applies the latest complete context when it executes, using 
                exact provider refs and recording observed provider revisions. At each consumer 
                publication, every direct provider has incorporated or settled-unchanged all 
                earlier invalidations from shared upstream ancestors; no diamond mixes new and 
                unresolved old lineage. Equal selections stay silent. Changed onContext 
                selections receive current/previous and return one ordinary self-event or a 
                release sentinel. Propagation never directly invokes a domain transition. A 
                blocked head refresh retains its FIFO position; suspended/failing upstream may 
                hold later ordinary events. Terminal disposal may retire that blocked lane 
                without upstream recovery: retired facts do not execute or create finite 
                work/TurnRecords, and their acknowledgments settle once with terminal 
                non-success while cleanup/evidence drains.

    R35  Context debt and capture
        source  @plan.ApplicationsAndActors.O5 and @plan.ApplicationsAndActors.O6; 
                @plan.Persistence.O3; @plan.StoriesAndModels.O4.
        must    Capture starts between completed context waves. Suspended context debt makes the 
                selected cut a retryable ConcurrentCapture conflict until explicit resume or 
                recovery.
                Capture itself never progresses, clears, or silently waits out that debt.

    R36  Work ownership and fencing
        source  @plan.ApplicationsAndActors.O4 and @plan.ApplicationsAndActors.O5;
                @plan.Resources.O1 through @plan.Resources.O4; @plan.Transactions.O1 through 
                @plan.Transactions.O4;
                @plan.Streams.O1 through @plan.Streams.O3.
        must    Actor-owned asynchronous facts publish only through the mailbox after rechecking 
                incarnation, declaration/binding identity, applicable descriptor/K, generation, and 
                occurrence ordinal.
                Stale facts cannot mutate current truth or route events. Planned release settles 
                cleanup once without an authored interruption mapper.
                Resource/store/transaction/stream semantics remain owned by Operations; no 
                duplicate canonical store or generic work registry is introduced.

    R37  Timer macrosteps
        source  @plan.ApplicationsAndActors.O4; @plan.Statecharts.O4; 
                @plan.Transactions.O3 and @plan.Transactions.O4.
        must    Consume one due timer generation once, using its pre-turn snapshot and explicit 
                timer identity/deadline. Timer updateMemory and target-event updateMemory are 
                separate FIFO macrosteps. Append the explicit target only after timer 
                publication; previously queued work may intervene. Once due, an eligible target 
                cannot be silently lost because an ordinary mailbox is saturated; it remains 
                ordered after already-accepted work. Timer guard decline still publishes fired. 
                Compound deadlines survive descendant transitions and restart only at their 
                owning boundary’s reentry.

    R38  Global evidence
        source  @plan.InspectionAndArtifacts.O1, @plan.InspectionAndArtifacts.O3,
                and @plan.InspectionAndArtifacts.O6.
        must    Accept immutable committed TurnRecord and LifecycleRecord facts into one 
                Runtime-global order before acknowledgment.
                Sinks are bounded, asynchronous, observational, and may omit only retained prefixes 
                with truthful truncation. They cannot block, roll back, or mutate runtime truth.
                Runtime disposal drains accepted evidence after terminal lifecycle records.

    R39  Persistence capture membership
        source  @plan.Persistence.O1, @plan.Persistence.O2, and @plan.Persistence.O3.
        must    Persistence capture selects registered non-disposed persistable stable actors, 
                including 
                suspended/boot-restored actors, and their exact transitive stable-provider closure.
                A required opaque, nonpersistent, or filter-excluded provider rejects the whole 
                selected closure with NonDurableContextProvider; never promote, recreate, rebind, 
                or omit its consumer.

    R40  Capture consistency
        source  @plan.Persistence.O2 and @plan.Persistence.O3; @plan.StoriesAndModels.O4; 
                @plan.ApplicationsAndActors.O7; @plan.InspectionAndArtifacts.O3.
        must    Each capture atomically pins its own selected actor set and one coherent cut over 
                that selection's published snapshots, StoreState revision, and fixed 
                binding/provider revisions. Persistence selects its durable filtered 
                actor/store/context closure. Story selects its exact static run closure, including 
                selected local actors. Persistence retains durable actor issues with its actor 
                facts; its payload excludes Story pendingWork, TestClock time, and evidence. Story 
                capture includes pendingWork, TestClock now, actor issues, and the accepted 
                evidence-through sequence watermark; any retained records come from the existing 
                bounded Inspection sink and carry its truncation marker. The watermark identifies 
                the accepted prefix at the cut, while retained records may begin after truncation. 
                Do not retain unbounded global history or add wire fields. Reject closure changes, 
                mismatched/newer store observations, partial/orphan payloads, or incomplete waves 
                with retryable ConcurrentCapture. Unrelated state-only turns need not share one 
                instant. Story run.end captures before cleanup and lease release.
    R41  Observational capture
        source  @plan.Persistence.O3; @plan.StoriesAndModels.O4; @plan.InspectionAndArtifacts.O3.
        must    Capture performs no external work, time movement, actor 
                creation/restoration/disposal, live actor lookup from captured evidence, or 
                selected-context serialization as a second truth.

    R42  Counter capacity
        source  @plan.Resources.O1; @plan.Transactions.O1; @plan.InspectionAndArtifacts.O3.
        must    All revisions, generations, ordinals, and evidence sequences remain nonnegative 
                safe integers without reuse.
                Reserve sufficient mandatory terminal capacity before admission/restore or reject 
                before mutation. Ordinary work cannot spend terminal reserves.
                Restored high cursors are checked before installation; no post-publication overflow 
                is allowed.

    R43  Copy isolation
        source  @plan.ApplicationsAndActors.O2 and @plan.ApplicationsAndActors.O6; 
                @plan.Persistence.O1.
        must    Copy Flow-owned envelopes, records, arrays, key containers, readers, issue vectors, 
                and snapshots at their boundaries.
                Application-owned opaque values retain identity. Later Flow mutations cannot change 
                an earlier captured container or reader cut.

    R44  Passive consumers and host execution
        source  @plan.ReactAndHosts.O3 and @plan.ReactAndHosts.O4; @plan.Resources.O4; 
                @plan.Streams.O3.
        must    Passive selection replaces exact descriptor/K dependencies after evaluation and 
                reads one tear-free actor/store cut without creation, ownership, mutation, or work.
                Only Runtime bridges/final host adapters execute Effects; foreign Promises enter 
                once through named tryPromise adapters.
                Bridges use the installed environment and retain exact A/E/R until that boundary.

    R45  Persistence closeout
        source  @plan.Persistence.O1 and @plan.Persistence.O5; 
                @plan.ApplicationsAndActors.O5; @plan.ReactAndHosts.O4; 
                @plan.InspectionAndArtifacts.O3.
        must    Runtime shutdown stops persistence observation, finalizes the latest accepted 
                serialized write, drains owned finalizers/evidence, and releases 
                Implementation/provider ownership.
                A persistence write failure preserves committed runtime truth and the last 
                successful record; it cannot retroactively fail an actor turn.

    R46  Operational issue identity
        source  @plan.DiagnosticsContract.O1, @plan.DiagnosticsContract.O2, and 
                @plan.DiagnosticsContract.O4.
        must    Operational issues identify actor incarnation when present, source, and binding.
                Later success/release by that same owner clears its earlier operational summary 
                without attempt generation in the clearing identity.
                A later actor lifetime cannot clear, inherit, or republish earlier issues; ordered 
                stable diagnostics survive summary clearing.

    R47  Story capture membership
        source  @plan.StoriesAndModels.O4 and @plan.StoriesAndModels.V4; @plan.PackageContract.O4;
                @plan.InspectionAndArtifacts.O3.
        must    Story checkpoint/run.end captures its exact static closure: the implicit machine 
                actor or all app recipes, plus exact binding, target, and transitive-provider refs.
                Include selected local/opaque/nonpersistent actors without durable promotion; 
                persistence declarations and filters do not determine Story membership. Exclude 
                unrelated actors.

    R48  Projection-only decisions
        source  @plan.ApplicationsAndActors.O4; @plan.PackageContract.O3; @plan.Transactions.O4.
        must    A relevant projection-only fact rereads authoritative current facts and publishes 
                one complete projection snapshot without transition, guard, action, redirect, 
                memory-update, finite-work, or hidden-event evaluation.
                Projection delivery never admits/readmits a finite commit. Explicit mapped events 
                are later ordinary mailbox decisions, distinct from projection publication.

open
    Q1  Full public production assembly and complete Runtime proof remain open.
        outcome  Owner modules and focused proofs exist, but the production package route through
                 runtimeSetup, ready, admission, actor decisions, capture, Story, and disposal has not
                 been proven against this complete contract. T1-T51 are integrated production-proof
                 obligations. Module integration proves only its named boundary; a separate final
                 package-assembly gate imports the supported public package export route. Document
                 validation and type tests do not prove behavior.

    RK1  Progress depends on cooperative external cleanup and continued Effect scheduling.
        outcome  Owned completion waits for finalizers; an adapter that never finalizes prevents
                 completion. Fencing prevents late publication but cannot reverse remote effects.

    RK2  Private implementation choices remain proposals pending independent checks and human 
         review.
        outcome  This Spec is not implementation authorization, public API promotion, or product
                 cutover evidence.

model
    ReadingRule = requirements, I-prefixed invariants, and test expectations follow current owner
        Plans and the individually approved chat decisions cited in affected Requirements. Owner
        Plans remain proposed; unresolved owner questions remain open and are not answered here.

    ProposalRule = every representation, DP-prefixed predicate, algorithm, boundary, file 
        suggestion, and realization proposes HOW; no private choice becomes a compatibility
        constraint without agreement.

    ContractBoundaries = publication exposes one complete snapshot; admission returns/rejects work; 
        terminal completion finishes owned cleanup and retains its result.

    ActorIncarnation = one Runtime-qualified actor lifetime, independent of a reusable stable ref. 
        Binding = one fixed context slot/provider incarnation or one continuing-operation
        declaration identity.

    ContextDebt = an accepted provider publication not yet incorporated or settled-unchanged in a 
        consumer's complete context. Wakeups carry invalidation, not selected values.

    RuntimeState = Constructed | Booting | Ready | Failed | Disposing | Disposed, all private. 
        Disposing is private coordination within the Plan's closed-admission disposal boundary.

    Shell = appPlan + persistence configuration + one bootstrap result/fiber + one installed 
        environment + actor registry + context graph + terminal/evidence budget + evidence prefix +
        disposal result.

    ManagedClose = NotRequested | Running(shared close Exit) | Done(retained close Exit); Shell 
        owns this joinable result independently of the managed scope it closes.

    CaptureSelection = PersistenceSelection(validated durable filtered closure) | 
        StorySelection(exact static run closure, including local actors); neither grants creation
        or progress authority.

    RegistryEntry = Admitting(firstInput,fixedBindings) | Live(actor,sharedLease) | 
        Closing(actor,result) | Tombstone(result). Failed cleanup is a Tombstone retaining its
        classified Exit.

    ActorCell = incarnation, immutable published snapshot, private machine cursor, mailbox, command 
        gate, attachment completion, desired declarations, retained operation/timer cursors.
        Prepared cells remain detached from the registered graph.

    CommandGate = Prepared | Open | ClosingForSuspend | Closed | Terminal. Public lifecycle and 
        command gate differ while admitted commands drain.

    MailFact = Event | TimerDue | StoreChanged | ContextWake | OperationFact | Reconcile | 
        LifecycleBarrier. Each carries actor incarnation and any applicable generation/dependency
        fence.

    TurnPlan = pure candidate domain truth + complete materialized intentions. CommitPlan = 
        validated private store patch + actor patch + desired ownership changes + immutable
        evidence; neither is a second mutable owner.

    Budget = a vector of counter credits: actor publication, machine turn, global sequence, store 
        revision, and per-identity generation/ordinal. Reservations are private, checked facts tied
        to their owner epoch.

invariants
    I1  At every ordinary admission boundary, the Runtime is ready and the exact machine belongs to 
        its sealed AppPlan. [@R1, @R4, @R6]

    I2  At every lookup/admission boundary, stable equality is exact machine ID plus authored ID 
        within one Runtime; persist and input do not affect equality. [@R2, @R9]

    I3  At all visible boundaries, an opaque ref resolves only within its creating Runtime and is 
        never durable identity. [@R2, @R11]

    I4  Before the first ready execution, acquired services, registered actors, storage calls, and 
        accepted runtime evidence are empty. [@R3]

    I5  At every ready observation, bootstrap has at most one start and at most one terminal Exit. 
        [@R4]

    I6  At caller cancellation, the shared bootstrap's ownership is unchanged. [@R5]

    I7  After Runtime admission closes for disposal, no later bootstrap/admission can expose a 
        lease; if disposal wins before readiness, no build or provider acquisition starts and ready
        returns the retained terminal outcome. [@R5, @R7]

    I8  At first handle escape, detached validation, Implementation acquisition, full installation, 
        context baseline, graph seal, and activation have completed in that order. [@R6]

    I9  At failed pre-visibility admission completion, no introduced 
        actor/edge/registration/work/evidence is externally observable; retry begins only after 
        successful invisible rollback. [@R7]

    I10  At installed-environment boundaries, every required application service is present exactly 
         once and no unresolved input requirement is erased. [@R8]

    I11  At every stable ensure completion, all successful callers in that attempt share one lease 
         and incarnation with that attempt’s first accepted input. [@R9]

    I12  At every rejected ensure with conflicting bindings, the winning input, bindings, actor, 
         and ownership are unchanged. [@R9, @R12]

    I13  At every getActor completion, registry membership, ownership, and active work equal their 
         pre-call values. [@R10]

    I14  At every binding publication, each declared slot resolves to exactly its fixed compatible 
         provider incarnation and the graph is acyclic. [@R12]

    I15  At first fresh activation, the actor has one initializer invocation and one exact resolved 
         leaf. [@R13]

    I16  At restore/resume boundaries, initializer and original-input invocation counts have not 
         increased. [@R14, @R30]

    I17  At every command rejection, the rejected item has created no occurrence, revision, or 
         adapter work. [@R15, @R16]

    I18  At every admission boundary, retained commands and queued serialized attempts do not 
         exceed their documented limits. [@R16]

    I19  At every actor decision, all earlier admitted non-coalescible facts have their ordered 
         decision first. [@R17]

    I20  At a silent no-op acknowledgment, state, memory, store revision, snapshot revision, 
         issues, and evidence prefix equal the preceding published cut. [@R17, @R22]

    I21  During planning, every authored transition callback sees the same pre-turn domain truth; 
         no callback observes a partially updated candidate. [@R18]

    I22  At every machine publication, redirects have stabilized within 100 microsteps and state 
         names one exact definition-derived leaf. [@R19]

    I23  At an invalid candidate's rejection, no accepted prefix of its action batch or desired 
         ownership changes exists. [@R20, @R25]

    I24  At every externally observable store cut initiated by an actor, the corresponding complete 
         initiating actor snapshot is already visible. [@R21]

    I25  At every publishing acknowledgment, that publication's immutable evidence is already 
         accepted globally and its user Effects need not have settled. [@R22, @R38]

    I26  At every terminal actor boundary, all admitted private acknowledgments have exactly one 
         terminal result. [@R22, @R26]

    I27  At every snapshot read, all fields and readers describe one published actor/store cut. 
         [@R23, @R43]

    I28  At every snapshot observation, there is one public actor revision and no raw Cause or 
         causal inventory masquerading as domain state. [@R23, @R27]

    I29  At stream registration/publication boundaries, a subscriber receives current-or-newer 
         truth without losing the registration cut. [@R24]

    I30  After stream terminal delivery, that subscription never emits again, including after actor 
         resume. [@R24]

    I31  At a contained per-actor pre-commit defect publication, prior domain/binding/store truth 
         remains and only publication revision/issues/evidence change. [@R25]

    I32  After invariant-failure admission close, no buffered or late fact can commit domain truth. 
         [@R26, @R36]

    I33  At failure classification, the retained Exit/Cause still distinguishes defects, typed 
         failures, interruption, and cleanup reasons. [@R27]

    I34  At every visible lifecycle boundary, the actor follows prepared→active, active↔suspended, 
         or any non-disposed→disposed; disposed has no successor. [@R28]

    I35  At a suspended publication, accepted pre-close commands have drained and live 
         attachment-resource count is zero. [@R29]

    I36  At every suspended observation, exact ref, handle, memory, fixed logical provider edges, 
         cursors, and absolute timer deadlines remain from that incarnation. [@R29]

    I37  At successful resume, all preceding attachment finalizers have completed and no finite 
         action/emission has been replayed. [@R30]

    I38  At blocked individual disposal, provider lifecycle and admission remain unchanged and 
         every blocking active/suspended edge is identified. [@R31]

    I39  At every stable terminal lookup/ensure/repeated-dispose, terminal identity and retained 
         cleanup failure cannot be replaced by a fresh admission or success. [@R32]

    I40  At initial context-baseline publication, all slots derive from exact providers and no 
         baseline onContext event exists. [@R33]

    I41  At context application, all selected slots come from the latest complete accepted provider 
         cut available to that decision, with exact observed revisions. [@R34]

    I42  At every successful selected capture, that closure has no unresolved context debt or 
         propagation wave. [@R35, @R40]

    I43  At every asynchronous completion publication, all applicable 
         actor/binding/operation/generation fences still match current ownership. [@R36]

    I44  At every timer target admission, its timer generation is already consumed and its fired 
         publication precedes the target event; an eligible target remains retained through mailbox 
         saturation. [@R37]

    I45  At every accepted evidence boundary, sequence numbers are unique and strictly increasing 
         across machine and lifecycle records. [@R38]

    I46  At every sink omission, all omitted accepted records form a prefix and the marker names 
         the greatest omitted sequence. [@R38]

    I47  At every successful persistence capture, every included durable consumer has all required 
         persistable selected stable providers. [@R39]

    I48  At every capture success, actor observedStoreRevision is no newer than its one captured 
         StoreState revision and no actor/store commit is half-published. [@R40]

    I49  At every capture failure/success, capture has not advanced Clock, domain truth, 
         membership, external work, or context progress. [@R41]

    I50  At every mutating boundary, all spent and reserved counter values fit safe-integer 
         capacity, with sufficient unspent mandatory terminal credits remaining. [@R42]

    I51  At every late observation of an earlier Flow container/reader, subsequent Flow updates 
         cannot alter that earlier cut. [@R43]

    I52  At every passive read completion, actor/store membership, ownership, freshness, revisions, 
         and work have not changed. [@R44]

    I53  At Runtime disposal completion, owned cleanup, latest accepted persistence write, and 
         accepted evidence have terminal outcomes. [@R45]

    I54  At every post-publication storage failure, committed actor/store truth and last successful 
         durable record remain intact. [@R45]

    I57  At each consumer context publication, every direct provider has incorporated or 
         settled-unchanged all earlier invalidations from shared upstream ancestors; no diamond 
         mixes new and unresolved old lineage. [@R34]

    I58  At a blocked head context wakeup, no later ordinary actor fact has its decision before 
         that wakeup resolves or terminal disposal aborts the actor. [@R17, @R34]

    I59  At every operational issue clear, the cleared summary belongs to the same actor 
         incarnation/source/binding, never another lifetime or owner. [@R46]

    I60  At every successful Story checkpoint/run.end capture, included actors equal the static 
         machine/recipe/binding/target/transitive-provider closure, independently of durability 
         metadata. [@R47]

    I61  After a provider's disposal admission-close linearizes, no later binding publication 
         creates a new edge to that provider incarnation. [@R12, @R31]

    I62  At every projection-only publication, state, memory, machine-turn cursor, and finite-work 
         admission retain their preceding committed values; transition/guard/action/redirect/memory 
         callbacks and hidden events were not evaluated. [@R48]

    I63  At a terminal readiness result when disposal won before readiness commit, the relevant 
         managed-close has completed and its failure Cause is retained in that result. [@R4, @R5, 
         @R27]

owner RuntimeShell
    lifetime  one construct result; owns bootstrap, registered identity, graph, installed 
              environment, evidence order, and cleanup result.
    state     Private Shell and RegistryEntry values from model. Context edges and budget/evidence 
              state remain here rather than becoming additional lifetime registries.
              DP1 At shell operation boundaries, a stable registry key has exactly one entry; 
              Live/Closing/Tombstone retain one incarnation and lease authority.
              DP2 Admitting entries retain their first input/fixed bindings. Entry promotion is one 
              synchronous decision; losing callers cannot overwrite it.
              DP3 Every registered actor holds one reserved terminal publication and lifecycle 
              sequence credit. Ordinary reservations exclude these credits.
              DP4 Graph authority epoch changes on admission/removal and provider admission-close; 
              fixed edge records carry 
              provider and consumer incarnation. Capture leases pin selected entries against 
              removal. Provider eligibility and edge installation share the atomic close authority; 
              Closing is ineligible even while its snapshot remains active.
              DP5 Accepted immutable evidence is the sole ordered history; per-sink cursors/rings 
              are projections of its accepted prefix, never competing truth.

    invariants
        I55  At shell terminal completion, every registered actor has a terminal cleanup outcome 
             and no later ready/ensure/bridge run can reopen admission. [@R5, @R32, @R45]

owner ActorEngine
    lifetime  one actor incarnation; preparation creates only detached plain state, attachment owns 
              Effect resources.
    state     Private ActorCell. One mailbox consumer changes actor truth; synchronous ingress only 
              validates and appends.
              DP6 At mailbox boundaries, head/tail/count describe exactly the retained FIFO facts; 
              a reserved control/completion slot is not available to public commands.
              DP7 An actor has at most one executing decision and at most one pending wake task for 
              its current attachment epoch.
              DP8 Published actor root and its captured immutable StoreRoot/readers change only 
              inside the shared publication gate.
              DP9 Every live declaration/finite occurrence has one owned scoped execution and 
              matching fence before its start gate opens.
              DP10 Terminal/suspended stream listeners are detached after terminal offer; latest 
              snapshot remains in the actor cell for later replay.

    invariants
        I56  At every post-publication reconciliation start, the desired ownership plan refers to 
             an already committed actor revision. [@R20, @R21, @R36]

operations
    runtimeSetup(configuration) -> RuntimeSetup
        ensures  Validate/retain inert AppPlan, complete typed Implementation, and optional 
                 persistence provider. No effects occur. [@R3, @R8]

    construct() -> Runtime
        ensures  Return one service-free shell with no ordinary actor handles. [@R3]

    ready() -> Effect<void, Diagnostic>
        ensures  Join the shell-owned bootstrap Exit; caller interruption releases only that 
                 waiter. [@R4, @R5]

    ensureActor(ref, inputAndBindings) -> Lease
        requires  Ready, exact stable ref, admitted machine, valid provider graph, and sufficient 
                  counters/queue capacity.
        ensures   Return existing winner/shared lease or atomically create/activate the fresh 
                  winner; ignore later input and reject conflicting bindings. [@R7, @R9]

    getActor(ref) -> ActorHandle
        ensures  Read-only exact registered lookup; missing/foreign/mismatched/closing/disposed/
                 quarantined refs fail through canonical owner-defined Diagnostic values. [@R10, @R32]

    createActor(machine, inputAndBindings) -> Lease
        ensures  Attach a new opaque incarnation using the same admission path, without stable 
                 identity. [@R11]

    send(event) -> void
        ensures  Synchronous bounded FIFO admission or synchronous owned Diagnostic projection; no 
                 execution/ack return. [@R15, @R16]

    dispatchAcknowledged(actor, event) -> Effect<void, Diagnostic>
        ensures  Package-private Story entry creates one admission acknowledgment and waits only 
                 for its ordered production decision. [@R22]

    prepare(machine, constructionTuple) -> PreparedHandle
        ensures  Package-private React preparation creates plain detached final 
                 identity/memory/mailbox once; no live registration, scopes, or evidence. [@R11, 
                 @R33]

    attachOrResume(preparedOrSuspended) -> Effect<void, Diagnostic>
        ensures  Host-only attachment waits cleanup, validates fixed providers, installs/reconciles 
                 baseline, and activates the same actor. [@R29, @R30, @R33]

    suspend(actor) -> Effect<void, Diagnostic>
        ensures  Close command gate synchronously, drain accepted FIFO, release attachments, then 
                 publish suspended. [@R29]

    disposeLease() -> Promise<void>
        ensures  Final JS projection of one cached internal disposal Exit; blocked dependents 
                 reject before starting terminal cleanup. [@R31, @R32]

    disposeRuntime() -> Promise<void>
        ensures  Close all admission, cancel bootstrap, dispose actors in reverse dependency order, 
                 flush/drain, and return one retained cleanup result. [@R5, @R32, @R45]

    capture(selection: CaptureSelection) -> Effect<Capture, Diagnostic>
        ensures  Package-private barrier observation of the established persistence or Story 
                 selection; closure/debt conflict rejects without driving progress. [@R35, @R39, 
                 @R40, @R41]

algorithm
    notation
        Pseudocode names below are proposed private operations, not Effect APIs or additional 
            public surfaces.
        atomic means one non-suspending host section with no authored callback, sink callback, or 
            consumer wake inside it.
        Managed effects own scheduling, external work, and finalization. Pure functions own 
            compilation consumption, projections, turn planning, and graph validation.

    bootstrap
        if Runtime disposal already closed admission before first ready, return the retained 
            terminal readiness outcome without starting a build or acquiring providers
        otherwise on first ready execution, atomically move Constructed→Booting and obtain the one 
            lazy managed environment
        one Shell-owned bootstrap observer starts the managed lazy build, which runs 
            prepareDetached(persistence, appPlan)
        if decode/identity/version/closure/headroom fails: retain Diagnostic failure; install 
            nothing
        acquire the complete Implementation only after detached preparation succeeds
        stage StoreKernel prepared state and registered actors in provider-first order
        for each fresh actor: initialize once; for restored actors: install materialized 
            memory/cursors
        derive silent exact context baselines; validate all pending ownership plans without 
            starting adapters
        reserve actor/store/evidence terminal capacity for the whole staged graph
        seal and logically activate the staged graph; retain start/restore records without 
            accepting visible evidence
        return the installed Context from the managed layer without starting user work
        the Shell-owned observer awaits the build Exit; it need not contain a concurrently running 
            external managed-close outcome
        atomically choose readiness commit versus disposal close-request; readiness success may 
            commit only if disposal has not won
        if disposal won, await the Shell-retained managed-close Exit and combine its Cause with 
            canceled/failed build truth before caching readiness
        otherwise on success publish staged lifecycle cuts/evidence, cache success, and promote 
            Ready; an uncontended failed build completes reverse staged cleanup before failure
            caching
        only ready success schedules continuing work; all terminal results wake ready callers after 
            their required cleanup boundary
        on any failure/interruption: close escape gate; reverse actor/edge/store ownership, then 
            acquired providers
        the Shell observer retains the complete resulting Exit in its own one-shot result, 
            independent of any caller and of ManagedRuntime.contextEffect replacement on disposal
        disposal atomically closes admission and installs one shared ManagedClose result, then 
            starts that external close before joining the bootstrap observer
        the observer joins the same close result and preserves both build and close failures before 
            terminal readiness; repeated calls reuse both cached outcomes

    ordinary actor admission
        synchronously reject Runtime-not-ready/disposed, foreign machine/ref, or terminal identity
        actor.send from the current decision callback follows normal bounded admission; if accepted, 
            enqueue FIFO after that decision without nested planning, commit, or publication
        reject nested direct state-changing Runtime operations from pure planning/selector callbacks; 
            actor.send remains the queued bounded mailbox offer
        if an existing stable winner has identical fixed bindings: return its shared lease; never 
            inspect replacement input
        if bindings conflict: reject without touching the winner
        validate first input/provenance and complete provider graph against the current membership 
            epoch
        run pure initialization/default/redirect/context selection against immutable provider 
            snapshots
        materialize continuing descriptions; validate their identities and reserve their bounded 
            work/cleanup cost
        construct detached ActorCell, immutable snapshots/readers, shared lease, and 
            publication/evidence data
        preallocate all ordinary/terminal credits before registry, StoreState, or evidence mutation
        atomic under graph/publication authority: recheck provider incarnation, graph epoch, open 
            provider admission gate, and closure facts; only then install actor, fixed edges, and
            validated StoreKernel changes
        reject a Closing provider even while its last published lifecycle is active; rejected edge 
            admission creates no ownership or work
        publish the activated actor/store cut and accept lifecycle evidence; promote registry entry 
            to Live
        release publication gate, then schedule actor work and notify consumers; return the lease 
            last
        if preparation fails: discard candidate and reverse only acquired invisible ownership; 
            share this attempt's failure, and permit a later ensure with a new first input only if
            rollback completes successfully; retained rollback failure is terminal
        if a post-visibility attachment fails: production cleanup retains issues/tombstone; never 
            delete identity to retry
        synchronous admissions execute without await; concurrent host callers therefore see the 
            first promoted winner
        an internal asynchronous bootstrap admission shares the Admitting entry and result instead 
            of constructing again

    mailbox
        use one bounded plain FIFO for prepared and active actors; keep the same queue across 
            attachment
        offer: validate exact event and lifecycle gate; check count/counter budget; copy envelope; 
            append; scheduleWake
        scheduleWake uses the captured Effect dispatcher and one coalesced flag; it never runs the 
            consumer inline
        the scoped consumer drains one fact at a time, with a cooperative scheduling yield between 
            decisions
        its empty wait uses Deferred/callback ownership; canceling the wait removes only that 
            consumer registration
        operation completion capacity is reserved when admitting work, not discovered after 
            external settlement
        StoreChanged facts may combine only adjacent projection facts by newest revision and union 
            of exact refs
        lifecycle, terminal, cancellation, mapped events, and stream-terminal facts never coalesce
        priority is FIFO among admitted facts; reserved cleanup/control admission does not reorder 
            accepted machine decisions
        a blocked context head retains its position; later ordinary facts cannot pass it
        terminal owner disposal may abort that wait, settle queued acknowledgments, and clean up 
            without resolving context
        shutdown/fatal paths first close ingress, then settle every acknowledgment, then end the 
            consumer

    projection-only decision
        at mailbox head validate actor/binding/generation fences; discard stale or unrelated facts
        reread authoritative StoreKernel and actor-owned operation facts, never historical fanout 
            payload as current truth
        build one complete snapshot with permitted projection/issues/publication changes; retain 
            state, memory, and machine-turn cursor
        publish using the existing gate without 
            transition/guard/action/redirect/memory-update/finite-work/hidden-event evaluation
        never call the ordinary event planner or admit/readmit finite work
        a separately established explicit mapped event is queued only as a later ordinary fact 
            after projection publication
        adjacent projection facts may coalesce; explicit mapped events never coalesce

    plan and commit one event
        save one immutable pre-turn actor root and its StoreRoot; install Runtime callback guard
        locate compiled active-path handler; reject ambiguous ancestor/descendant configuration at 
            compilation
        evaluate guards in authored order; on decline skip that transition's update/actions
        if none wins: settle ordered silent no-op and return its unused reservations
        evaluate winning updateMemory and actions from the saved pre-turn root/event
        shallow-merge memory once; apply target/exact reentry and defaults to detached candidate
        stabilize active-path redirects outermost-to-leaf, preserving authored order; reject step 
            101
        materialize and validate the entire finite batch and normalized continuing descriptions
        remove callback guard; create one private CommitPlan including actor/store patches and 
            immutable evidence
        preallocate publication, sequence, generation, ordinal, internal-queue, and terminal-credit 
            changes
        atomic under shared DehydrateBarrier publication gate:
            recheck actor incarnation, admitted command/ownership epoch, StoreState revision, and 
                every generation fact
            ClosingForSuspend rejects new offers but still permits facts admitted before its close 
                barrier
            commit StoreKernel replacement root and actor replacement root as one observer-excluded 
                cut
            accept prebuilt immutable TurnRecord with reserved global sequence
            record private acknowledgment outcome exactly once after the complete cut and evidence 
                acceptance
            append preallocated Reconcile without waking the consumer
        outside the gate: complete its Deferred, notify snapshot readers, schedule the next 
            decision, then release StoreFanout facts
        Deferred completion can resume callers synchronously; never complete it while the 
            publication gate is held
        post-publication reconcile consumes the committed desired plan; it cannot rerun planning 
            callbacks or roll back truth
        on a callback defect before commit: discard candidate, then use reserved issue-only 
            publication and diagnostic evidence
        on internal invariant defect: use terminal reserve; close admission, fence work, finalize, 
            publish disposed fatal truth
        no await, cancellation boundary, allocation, user callback, or external notification may 
            split commit from evidence acceptance

    reconcile work
        compare declaration slot/kind/descriptor/K with the committed desired binding; equal 
            identity retains generation and pinned P
        release removed/changed bindings child-to-parent; await required finalizers before 
            replacement acquisition
        acquire entered compound declarations parent-to-child; onMemory activation/reentry uses 
            previous undefined, later reconciliation uses the preceding selection
        install new actor/binding/occurrence fence and reserve one terminal-result mailbox slot
        fork Effect.scoped work whose first instruction waits on a closed start gate
        register the returned fiber with the existing keyed FiberMap or independent FiberSet before 
            opening that gate
        serialized transaction policy uses one scoped bounded Queue worker per live exact 
            descriptor/K lane
        insert/cancel queued P in FIFO; canceled queued attempts settle without adapter execution
        classify Effect.exit of adapter work; append a fenced completion fact through its reserved 
            capacity
        immediately before completion publication, compare all current 
            incarnation/binding/generation/ordinal fences
        stale completion finalizes only its own bounded evidence and returns reserved capacity; it 
            routes nothing current
        normal finite failure/defect/interruption remain distinct operation facts, not worker 
            supervisor failures
        final ownership release fences shared work before interruption and follows Operations 
            final-owner policy

    timer
        retain owner boundary, generation, startedAt, absolute dueAt, and consumed flag; installed 
            wait uses Runtime Clock
        on due: append TimerDue(incarnation,generation); stale or already-delivered generation does 
            nothing
        at dequeue mark that due delivery privately consumed before callbacks; duplicate due facts 
            cannot retry it
        callback defect uses issue-only prior public truth and never rearms that same generation
        plan the timer guard/update from its own pre-turn root; validate its explicit target event
        commit consumed/fired timer fact and optional shallow memory patch; publish before 
            scheduling target
        if timer guard accepts: append the target event at current FIFO tail using reserved 
            internal capacity
        target later plans its own updateMemory from then-current truth; queued events may intervene
        descendant changes retain an unchanged compound timer; exact owner exit/reentry 
            cancels/replaces generation
        suspension cancels installed waits but retains deadlines; resume installs at most one 
            overdue due fact

    context waves
        enforce per-consumer causal closure from R34/I57; provider-wave selector-failure and retry 
            behavior remains unresolved at @plan.ApplicationsAndActors.Q1
        preserve FIFO for a blocked head as required by @plan.ApplicationsAndActors.O5
        keep dirty/settled state on the existing exact binding DAG; do not create a parallel 
            actor-lifetime registry
        before a provider publication wakes consumers, synchronously mark every reachable dependent 
            dirty
        precompute the affected closure before publication; recheck membership epoch under the 
            gate, then install marks
        an actor has at most one retained ContextWake; additional invalidations update dirty state 
            without moving its FIFO position
        suspended actors retain dirty debt and exact edges without installing live subscriptions or 
            wake fibers
        at head ContextWake, inspect each direct provider's current dirty/settled status and exact 
            incarnation
        if any direct provider has upstream debt, suspend this head decision on graph-settlement 
            notification
        keep later ordinary facts behind it; do not spin, move ticket to tail, drive upstream, or 
            process captured values
        when providers settle, schedule the blocked consumer once through its attachment dispatcher
        once all direct providers are settled, synchronously read their latest complete immutable 
            snapshots
        evaluate all slot projections and onContext selections against that one complete vector 
            outside the publication gate
        if a callback defects: retain prior context, issue-only publish once for that input cut, 
            and retain unresolved debt
        a later provider change or explicit recovery may supply a new cut; never retry the same 
            defective candidate automatically
        if the complete vector validates, atomically install all selected slots and exact observed 
            provider revisions
        if selected context is Object.is/fixed-record-equal: publish nothing, but settle private 
            revision/debt metadata
        otherwise publish one complete context/projection snapshot; enqueue returned onContext 
            events as later ordinary facts
        notify downstream that this actor settled even when its selected value did not change
        settlement concerns inherited-context projection only; an onContext self-event remains a 
            later ordinary decision whose authored memory/state reaction need not have completed
        clear this actor's dirty state only for invalidations represented by its successful vector; 
            later marks remain pending
        synchronous evaluation/commit has no await; competing provider publication cannot 
            interleave within it
        reject nested direct state-changing Runtime operations from pure planning/selector callbacks; 
            actor.send follows normal bounded admission and queues FIFO for a later turn
        no graph-wide atomic publication is required: other actors can show different complete cuts 
            while the wave remains open
        capture conflicts until the selected closure has no dirty/blocked participants
        diamond argument: A invalidation marks B,C,D before any wake; D cannot pass while either B 
            or C owes A
        B/C equal-value settlement clears their debt and notifies D; D therefore need not wait for 
            a value-change publication

    snapshots
        retain one current immutable snapshot pointer; create no subscriber queues during actor 
            construction
        snapshots consumption uses Stream.callback with bufferSize 1 and strategy sliding
        its scoped registration performs add-listener and offer-current in one actor-owned 
            synchronous section
        if lifecycle is suspended/disposed: offer current, end that queue, and do not register for 
            future changes
        a publication first replaces the pointer, then offers the same complete cut to registered 
            sliding queues
        terminal/suspended publication offers its final snapshot, calls Queue.endUnsafe, and 
            detaches listeners
        end preserves the final queued value; shutdown is reserved for subscriber interruption 
            cleanup
        listener cleanup removes only that subscriber. Resume creates future subscriptions, never 
            reopens completed ones

    suspension and resume
        close public command gate immediately; append one lifecycle barrier after pre-close 
            admitted facts
        blocked context heads retain FIFO; suspension may wait for upstream recovery, while owner 
            disposal can terminate
        after the drain barrier: fence finite work, interrupt/join it, close streams without domain 
            mapping
        release registrations, timers, subscriptions, and continuing activities in reverse 
            acquisition/path order
        retain logical edges and continuity; publish suspended only after cleanup, including any 
            cleanup issue
        cache attachment cleanup Exit; a defect blocks resume and does not initiate a replacement 
            lifetime
        resume waits that Exit; reject failure or invalid fixed provider without changing suspended 
            truth
        reattach same actor; reconcile provider changes via the ordinary context path; reacquire 
            continuing work
        reinstall absolute timers, publish resume lifecycle, reopen command admission at the 
            activation boundary

    individual disposal
        prepare the exact dependent view/diagnostic, then atomically recheck its graph epoch and 
            active/suspended dependents under the same authority as edge installation
        if blocked: return BlockedByDependents with copied refs/slot keys and unchanged provider 
            state/gate
        otherwise in that same decision close provider admission, advance graph authority epoch, 
            invalidate work/capability epochs, and transition Live→Closing
        no later edge installation can pass that gate while cleanup awaits; reverse ordering 
            installs the consumer first and blocks provider disposal unchanged
        one cached internal Effect Exit owns cleanup; later callers await/read it without 
            reexecuting finalizers
        abort blocked mailbox waits, settle current/buffered acknowledgments, interrupt/join work, 
            and detach attachments
        perform StoreKernel final-owner cleanup and logical-edge removal under the shared barrier
        aggregate cleanup failures; publish one complete terminal snapshot plus LifecycleRecord 
            with terminal credits
        store Tombstone(fullExit), retaining the terminal actor snapshot and stable identity
        project success or FlowDisposeError only at JS disposal/lookup/ensure boundary; preserve 
            canonical Diagnostic internally

    evidence and issues
        build immutable records/diagnostics from committed facts; allocate global sequence capacity 
            before publication
        atomic acceptance advances only the global prefix cursor and installs already-prepared sink 
            deliveries
        keep each sink's retained/delivery ring bounded; overflow discards only its oldest prefix 
            and advances its marker
        no unbounded global record queue or actor-lifetime attempt history is retained
        process user sink callbacks only after acknowledgment; callback failure detaches that sink 
            and retains its local failure
        drain waits only through the captured accepted prefix; shutdown captures its final prefix 
            after terminal lifecycle records
        operational summary key is incarnation/source/binding; occurrence diagnostics may 
            additionally carry attempt generation
        same-owner later success/release removes that key's summary, while copied stable 
            diagnostics remain in bounded ordered evidence
        new actor incarnations receive empty owner summaries and cannot mutate a former 
            incarnation's records

    Runtime disposal
        atomically close Runtime/actor ingress and revoke trusted host-write leases before awaiting 
            anything
        if bootstrap is pending: install/start the one external ManagedClose before waiting for the 
            observer; closure initiation may trigger cancellation
        never wait for staged rollback before starting close; never acquire providers while closing
        join staged rollback after close has started and before releasing its acquired providers; 
            retain both rollback and close outcomes
        pending-bootstrap branch joins staged rollback without exposing its actors/lifecycle 
            evidence; do not repeat ordinary visible-actor teardown for those invisible owners
        the following visible-actor teardown applies when readiness committed before disposal, 
            preserving its already-cached readiness result
        freeze membership, order its DAG in reverse provider dependency order, dispose consumers 
            before providers
        individual dependency rejection is replaced by the whole-Runtime owned teardown schedule, 
            never by rebinding
        attempt every owned cleanup even when an earlier one fails; retain deterministic ordered 
            diagnostics/full Cause
        stop persistence observation; finalize latest accepted serialized write; drain evidence 
            through final lifecycle prefix
        close remaining actor workers and fanout/sink attachments; start or join the same retained 
            ManagedClose for the managed environment/Implementation scope, never a fresh native
            close call
        cache one combined disposal Exit; repeated disposal returns it, including failure

    capture
        consume CaptureSelection from its owner; do not derive one membership policy for both 
            consumers
        PersistenceSelection establishes registered durable declarations/filter and their exact 
            provider closure; required opaque/nonpersistent/excluded providers reject with
            NonDurableContextProvider
        StorySelection establishes the implicit machine actor or every app recipe plus exact 
            binding/target/transitive-provider refs before capture; allow selected
            local/opaque/nonpersistent actors without promotion or persistence filtering
        validate selection provenance/current membership, exclude unrelated actors, and never 
            ensure/get or materialize missing members
        acquire read leases for the selected membership epoch; observe wave/debt status without 
            progressing it
        if selected closure owes context or has a blocked/suspended debt: fail ConcurrentCapture 
            and release leases
        enter StoreKernel's shared barrier only between complete commit/publication windows
        capture one immutable StoreRoot and revision; copy each selected actor's complete published 
            snapshot and binding vector
        require membership/fixed-binding epochs unchanged and every observedStoreRevision <= 
            captured store revision
        for Story only, capture TestClock now, pendingWork, actor issues, and the accepted-through 
            evidence sequence watermark with that cut; retained evidence records come only from the
            existing bounded Inspection sink and preserve its truncation marker
        Persistence serializes only its durable closure and never adds Story fields or evidence
        leave barrier; serialize copied Flow structure through the owning codec outside the gate
        on mismatch: discard whole capture and return ConcurrentCapture; never retry by driving work
        release read leases on every exit; successful Story run.end is copied before caller 
            releases actor leases/cleanup

    counter accounting
        MAX = Number.MAX_SAFE_INTEGER; each counter owner stores next/used and outstanding 
            ordinary/terminal credits
        reserve delta vector only if for every counter used + reserved + delta <= MAX, checking by 
            subtraction
        an accepted actor reserves one terminal publication and one terminal lifecycle sequence 
            before visible admission
        every newly owned store generation reserves its final cancellation/fence increment; 
            StoreKernel reports this cost
        each cleanup batch reserves its StoreState revision; aggregate its bounded terminal patch 
            before mutation
        ordinary turn reservations include its potential issue-only or successful publication, 
            evidence, ordinals, and staged generations
        a silent no-op returns all unused credits; issue-only consumes publication/evidence but no 
            machine-turn/store credit
        restored cursors seed used; calculate terminal costs from decoded selected actors/work 
            before installing any root
        growing ownership must reserve the incremental cleanup cost before admission; releasing 
            ownership returns unused credits
        exhausted ordinary credits reject before effects; already admitted work can still 
            fence/finalize with its reserved credits
        final fatal/dispose publication aggregates cleanup issues into one terminal cut; no 
            synthetic machine turn consumes a terminal credit
        permanent tombstones retain identity but no additional terminal obligation; global/actor 
            counters never reset

composition
    flow
        Concerns:
        AppPlan is the existing static authority. RuntimeShell owns lifecycle, identity/graph, 
            environment, and global ordering.
        ActorEngine owns one actor decision stream and publication. Turn planning is a pure 
            transformer, not another owner.
        StoreKernel and StoreFanout are consumed operation capabilities from Operations; 
            persistence/evidence sinks/hosts retain their Plan-owned contracts.
        Context scheduling and evidence budgeting remain Shell concerns because they share 
            membership/lifetime/global sequence; no extra service layer is required.
        Protocol meanings:
        CompiledAppPlan establishes validated closed identities, static handler/default/declaration 
            tables, service closure, and provider-slot types.
        PreparedBoot establishes decoded app/version/plan identity, structural bounds, detached 
            actor/store values, and restore cursors; it grants no installed authority.
        AdmissionCandidate establishes pure initialized/restored domain truth and complete proposed 
            bindings; changing membership/providers still require recheck.
        StorePatch establishes validated descriptor/K targets, base revision, generations, exact 
            changed refs, and computed cleanup costs; StoreKernel alone publishes it.
        PublicationCut contains immutable actor root plus immutable StoreRoot/readers, counter 
            reservation, and prebuilt evidence. It is private and one-use by owner epoch.
        OperationFact contains exact fence, retained classified Exit, and immutable result data. It 
            establishes what completed, not current publication authority.
        ContextWake names actor/graph invalidation only; latest selected values are acquired at 
            application time, never serialized into stale ticket payloads.
        CaptureLease pins the established persistence or Story selection incarnations and fixed 
            edges through one cut; it
            grants no actor creation/disposal or work authority.

    boundaries
        compilation_to_setup
            protocol  CompiledAppPlan through pure Result<validated value, Diagnostic>.
            facts     Exact literals, closed declarations, and raw inferred R remain intact.
            hides     Private schemas, token construction, handler compilation, and index layout.

        persistence_to_bootstrap
            protocol  PreparedBoot through Effect<detached data, Diagnostic, storage requirements>.
            facts     Decoded app/version/identity/bounds; no registration/store 
                      installation/adapter work.
            hides     Wire layout and codec traversal; bootstrap retains ordering policy.

        shell_to_actor
            protocol  AdmissionCandidate plus exact provider identities and reserved 
                      cleanup/publication capacity.
            facts     Valid pure actor state and current checked graph; return final Lease or 
                      Diagnostic.
            hides     Registry cells, ref encoding, closure traversal, and observer release 
                      choreography.

        planner_to_store
            protocol  Complete private intentions and captured base -> validated StorePatch/cost or 
                      Diagnostic.
            facts     Whole-batch validity and exact generation requirements; no valid prefix on 
                      failure.
            hides     Canonical storage/overlays/generation representation; StoreKernel retains all 
                      mutation authority.

        actor_store_publication
            protocol  PublicationCut consumes one owner-epoch reservation under shared synchronous 
                      exclusion.
            facts     Complete actor/store truth plus accepted evidence before acknowledgment.
            hides     Root swaps, counter accounting, and shared barrier implementation; invokes no 
                      external code.

        actor_to_work
            protocol  Committed declaration/occurrence plus unopened start gate -> Effect with 
                      authored A/E/R and owned Scope.
            facts     Existing owner/fence and committed desired truth before adapter start.
            hides     FiberMap/FiberSet/Queue coordination; operation kernels retain family 
                      semantics.

        store_to_actor
            protocol  Monotonic exact changed-ref invalidations through StoreFanout to mailbox.
            facts     Initiating publication/ack precede delivery; actor rereads current StoreState.
            hides     Canonical representation and affected-actor index; no historical payload 
                      claims current truth.

        provider_to_consumer
            protocol  ContextWake plus graph dirty/settled metadata, exact refs, and latest 
                      complete provider vector.
            facts     Pending ancestry is visible before consumer refresh acceptance; equal 
                      settlement wakes dependents.
            hides     DAG traversal/debt bookkeeping; maps events only through the ordinary mailbox.

        publication_to_sink
            protocol  Immutable accepted record plus one Runtime-global sequence.
            facts     Only committed cuts; local sink failure cannot mutate or roll back accepted 
                      truth.
            hides     Ring/cursor/truncation/drain mechanics; sinks perform asynchronous 
                      observation only.

        runtime_to_capture
            protocol  CaptureLease and immutable observed cut -> artifact/Story data or Diagnostic.
            facts     Exact selected closure, one completed StoreRoot, no context debt, no hidden 
                      progress.
            hides     Read leases/barrier checks; callers need no coordination with live owners.

    uses
        local_owner_factories
            role   Proposed runtime/shell.ts owns lifecycle/graph/environment; runtime/actor.ts 
                   owns actor/mailbox/attachments; runtime/turn.ts handles pure planning.
            reuse  Keep helpers beside their concern. Extract context/publication only if 
                   implementation cohesion warrants it; no pass-through owners/re-export files are 
                   needed.

        existing_contracts
            role   Reuse shared Diagnostic, exact identity/canonical-key codecs, AppPlan tables, 
                   operation protocols, and StoreKernel.
            reuse  Implementation is absent: these are contract reuse commitments, not observed 
                   code reuse. No new canonical store or service bag is proposed.

        command_coordination
            role   Plain bounded FIFO for inert preparation/synchronous ingress; scoped Effect 
                   consumer for work/cleanup.
            reuse  A global Effect Queue requires current fiber construction and cannot directly 
                   satisfy render preparation; retain operation serialize Queue where its laws fit.

        latest_snapshot_stream
            role   One retained immutable snapshot cell plus scoped sliding-one callback queues.
            reuse  SubscriptionRef current-plus-changes defaults do not directly supply bounded 
                   latest-only terminal replay; the proposal adds only the missing 
                   termination/replay law.

        environment_and_planning
            role   One managed installed environment closes R; local pure planners consume explicit 
                   data.
            reuse  Avoid a mutable application service bag and new planning services; planning has 
                   no capabilities, clock, asynchrony, or lifetime.

rules
    publication   The shared gate excludes capture and passive external observation through the 
                  entire actor/store/evidence acceptance. No callbacks, I/O, allocation, scheduler 
                  wake, or await runs inside.
    reentrancy    Runtime callback guard rejects nested direct state-changing Runtime operations 
                  during pure planning/selector callbacks. A public send from a callback follows 
                  normal bounded admission and queues FIFO for a later decision; read-only captured 
                  snapshot use remains allowed.
    interruption  Prepare and adapter work stay interruptible. Publication/ownership installation 
                  is a short masked section; cleanup is owned independently of canceled waiters.
    failure       Expected errors remain Diagnostic E at runtime-owned boundaries; adapter typed 
                  operation failures remain their family outcomes until classified. 
                  Defects/interruption remain Cause lanes.
    freshness     Recompute current context and StoreState at wake/commit. A queued invalidation is 
                  never proof that its historical payload is still authoritative.
    boundedness   Public mailbox offers reject full; internal terminal/completion/control capacity 
                  is reserved before admission. Sinks retain bounded prefixes; active histories 
                  retain only current ownership/cursors plus bounded inspection evidence.
    progress      No automatic retry of callback-defective candidates. Capture returns conflicts. 
                  Clock movement does not itself process Story work. Blocked context FIFO progress 
                  awaits explicit upstream resolution.
    verification  Exercise the actual consumer public boundary with the real production Runtime and 
                  real internal modules. Substitute only named external services, storage, and Clock; 
                  use deterministic gates for races. Never substitute Runtime, actor engine, store/
                  fanout, evidence, or Story owners when claiming those boundaries. Type tests may 
                  compile public values. Module integration proves only its named scope; the separate 
                  final package-assembly proof imports the supported public package export route.

realization effect-v4
    Version authority is packages/flow-state-rewrite/package.json, nub.lock, and 
        dependency-evidence/effect/package.json: Effect 4.0.0-rc.112.
    All source anchors below are within dependency-evidence/effect/src/. They establish APIs and 
        library semantics, not behavior of the proposed Runtime.
    Plain TypeScript/Result handles compiled-plan consumption, exact identities, graph traversal, 
        immutable candidate construction, equality, and turn planning.
    Private owner factories encapsulate Shell/Actor state; introduce Context.Service only for an 
        existing substitutable operation/storage/application capability crossing levels.
    Schema owns untrusted persisted structure and canonical admission once; trusted tagged 
        lifecycle values use ordinary discriminated unions or Data.TaggedEnum, without duplicate
        private validators.
    One lazy ManagedRuntime owns the installed application environment. One Shell-owned bootstrap 
        observer owns the public ready result; reusable workflows return Effects and never run them.
    The Runtime bridge starts that observer once behind an unopened start Deferred, stores its 
        fiber handle, then opens the gate after owner installation. Caller fibers only await the
        shared result.
    The observer awaits the managed build Exit, then atomically checks readiness commit versus 
        disposal close-request. If disposal won, join the retained external ManagedClose Exit
        before combining/caching readiness truth. Later ready calls replay that cached Exit even
        after disposal.
    Runtime disposal installs one joinable ManagedClose result and starts its external close before 
        joining the observer. The observer may await that same close; do not interrupt it before
        retaining both outcomes. Repeated close callers share the result/finalizers.
    First ready execution captures its Clock service and Effect scheduler/dispatcher at the Runtime 
        host boundary.
    Clock capture is necessary: ManagedRuntime.contextEffect forwards currentScheduler to its new 
        build fiber, but does not inherit the caller's service Context.
    Construct the lazy bootstrap layer as Layer.effectContext(program), where program first 
        prepares detached data, then yields Layer.build(completeImplementationLayer).
    Layer.build returns Context; explicitly provide that Context to install/initialize operations, 
        then return it merged with the private installed-runtime capability.
    Supply the captured Clock to the bootstrap program and retain Clock.Clock and 
        Scheduler.Scheduler in its returned Context for later managed bridge/actor runs.
    This internal capture preserves Story TestClock and deterministic scheduling without inventing 
        a public clock option or widening application RequirementsOf.
    Do not merge/provide the Implementation layer outside this sequential program: eager layer 
        construction could acquire services before detached preparation.
    Do not wrap successful bootstrap in an outer Effect.scoped: its environment must survive ready 
        completion in the owning layer scope.
    API anchors: Layer.effectContext Layer.ts:1479; Layer.build Layer.ts:800; Context.merge 
        Context.ts:1815; Context.add Context.ts:989; Effect.clockWith Effect.ts:22151; Clock.Clock
        Clock.ts:189; Scheduler.Scheduler Scheduler.ts:78.
    ManagedRuntime.contextEffect creates one buildFiber and awaits its full Exit; caller 
        interruption removes only that wait. Its managed scope owns the build fiber.
    An uncontended failed build closes its layer scope, but native contextEffect does not join a 
        concurrent external close. The parallel root can complete the build observer before an
        interruption-masked phase finalizes; never infer complete cleanup from build Exit alone.
    API/semantic anchors: ManagedRuntime.ts:286-324 and 342-345; Layer.ts:333-344; 
        internal/effect.ts:3779-3789 and 3815-3826.
    Combine retained build/close failures using Cause.combine and Exit.failCause, preserving 
        distinct reasons and classification precedence. Anchors: Cause.ts:756 and Exit.ts:246. The
        external close never waits for the observer; it starts before either participant joins it.
    For an already-ready Runtime, shutdown finishes visible-actor teardown using installed services 
        before final managed disposal under an external shutdown Effect. Pending bootstrap instead
        uses its shared managed-close and private staged rollback branch.
    Cache the resulting disposal Exit in Shell/lease state. Scope.close marks Closed before 
        finalizers and does not repeat their failure; ManagedRuntime.disposeEffect alone cannot
        satisfy retained failure/quarantine.
    Anchors: ManagedRuntime.ts:342-345; internal/effect.ts:3779-3826. ManagedRuntime root scope is 
        parallel, so reverse-dependency actor order remains explicit.
    Synchronous ensure/create activation installs logical attachment, owner state, and scheduled 
        execution before returning. It never waits for user resource acquisition; those scoped
        Effects start after publication.
    Actor render preparation/synchronous admission uses a plain bounded FIFO because Queue.make 
        requires a current fiber dispatcher and has no public makeUnsafe constructor.
    Use one scoped consumer with Effect.callback/Deferred for empty waits. Capture 
        Fiber.currentDispatcher once; schedule coalesced wakes using scheduleTask after owner
        mutations finish.
    Deferred.makeUnsafe creates a one-shot gate without execution. Deferred.doneUnsafe may 
        synchronously resume a waiter, so open start gates/complete acknowledgments only outside
        publication/registry mutation.
    Anchors: Queue.ts:448-456; Deferred.ts:140 and 1648-1661; Effect.ts:1667-1673; 
        internal/effect.ts:1102-1141; Fiber.ts:78-79; Scheduler.ts:57-60.
    Work executes inside Effect.scoped; acquisition uses Effect.acquireRelease. FiberMap owns keyed 
        cancel replacement; FiberSet owns independent allow work; scoped Queue workers own
        serialize policy.
    Every adapter program first awaits a closed start Deferred. Commit/register its owner/fence 
        before opening it; interruption while closed starts no adapter.
    FiberMap.run/FiberSet.run start before inserting the returned fiber, and their implementations 
        do not forward the public startImmediately option. That option/onFiberStart is not the
        ownership handshake.
    Replacing a FiberMap entry requests interruption without awaiting finalizers. Explicitly await 
        required release before opening a replacement gate; use awaitEmpty for drains, not join's
        failure/closure supervision.
    Anchors: FiberMap.ts:450-461 and 1366-1383; FiberSet.ts:687-700 and 890-891; 
        internal/effect.ts:5413-5437; Effect.scoped Effect.ts:12815.
    Snapshot Stream uses Stream.callback(registration,{bufferSize:1,strategy:"sliding"}); the 
        callback queue is created under each consuming stream Scope.
    Registration uses acquireRelease around one synchronous add-listener/offer-current section. 
        Publication offers with Queue.offerUnsafe; terminal publication offers final truth then
        Queue.endUnsafe.
    Queue.endUnsafe retains queued final state until drained; Queue.shutdown is 
        subscriber-interruption cleanup and discards pending values.
    Anchors: Stream.ts:694-700; Channel.ts:459-473; Queue.ts:708-725, 1000-1014, 1109, and 
        1191-1198. No actor-time subscriber queue construction or unbounded per-reader replay is
        needed.
    Prepared actor/store revisions start at zero; first operation ordinal/generation and global 
        evidence sequence are one. Restored cursors retain their values.
    Effect Clock owns epoch-millisecond time and timers; retain absolute deadlines, validate 
        integer public timestamps, and use TestClock in production-boundary Story proofs.
    Sequential scopes release in reverse acquisition order and collect finalizer Exits; no manual 
        child Scope or AbortController lifetime tree is proposed.
    Effect.exit/onExit retain complete truth. Named tryPromise adapters own foreign 
        rejection/cancellation translation once; no Effect.promise or nested service runner is
        permitted.
    Workload/cost model: let V/E be registered actor/provider edges, d one actor's static 
        declarations, m its admitted batch, and r matched StoreFanout dependencies.
    Compile indexes once. An event plans O(active depth + redirect steps + m + d), with depth <=10 
        and redirect steps <=100; do not traverse AppPlan per callback.
    Graph validation/capture is O(V+E) over the affected closure; eager invalidation marks only 
        reachable dependents. It adds dirtiness bookkeeping to prevent mixed lineage.
    StoreFanout indexes exact descriptor/K dependencies so unrelated actors receive no store wake; 
        a recipient rereads current state rather than retaining old revision payloads.
    One pending context wake and one sliding snapshot value per subscriber remove repeated work 
        without dropping ordinary events or terminal facts.
    Predicted retained space is current actor state + O(V+E) graph + bounded queued/admitted work + 
        current operation cursors + configured sink rings + O(subscribers) latest cells.
    Stable tombstones grow with explicitly admitted stable identities during one Runtime; this is 
        required identity history, not a reusable terminal-attempt registry.
    Queue proposals: start with 64 ordinary-command slots, matching the prepared minimum. The 
        serialized transaction queue has an individually approved finite bound; Transactions O2/V2
        supplies FIFO semantics but not that bound. Keep its numeric choice private; do not infer it
        from the prepared minimum.
    Internal completion/timer-target/control credit is separately reserved before ownership; 
        admission rejects if that credit cannot be bounded. Streaming producers backpressure rather
        than dropping mapped/terminal facts.
    There is no numerical latency/throughput target in the approved inputs. Validate 
        saturation/burst memory and traversal costs before claiming performance; current complexity
        figures are analytical predictions.
    Causal interpretation evidence supplied by coordinator: AlienSignals 
        c00e63969bf261fc5dce31fae70cb9a90912b06e marks Pending before effect flushing and validates
        upstream computed values on read.
    Primary source URLs and exact commit/file anchors are recorded in 
        author-evidence/author-record.md.
    Runtime cannot copy synchronous pull into suspended/failing actor execution. Transfer only the 
        causal law: pending ancestors are visible before refresh acceptance and equal-value
        settlement releases downstream debt.

coverage
    @R1
        enforced_by  [@I1], compiled AppPlan admission; proposed Shell boundary
        open_by      [@Q1]

    @R2
        enforced_by  [@I2, @I3], shared exact identity codecs
        open_by      [@Q1]

    @R3
        enforced_by  [@I4], inert setup/construct boundary
        open_by      [@Q1]

    @R4
        enforced_by  [
                     @I5,
                     @I63
                     ], Shell-owned build result joined with retained managed-close Exit when 
                     disposal wins
        open_by      [@Q1]

    @R5
        enforced_by  [
                     @I6,
                     @I7,
                     @I55,
                     @I63
                     ], shared caller-independent readiness/managed-close results
        open_by      [@Q1]

    @R6
        enforced_by  [@I8], proposed sequential bootstrap program
        open_by      [@Q1]

    @R7
        enforced_by  [@I9], proposed staged admission and reverse cleanup
        open_by      [@Q1]

    @R8
        enforced_by  [@I10], typed Implementation closure and runtime acquisition
        open_by      [@Q1]

    @R9
        enforced_by  [@I11, @I12], proposed one stable registry entry/shared lease
        open_by      [@Q1]

    @R10
        enforced_by  [@I13, @I39], exact lookup-only boundary
        open_by      [@Q1]

    @R11
        enforced_by  [@I3, @I8], proposed detached preparation/immediate admission paths
        open_by      [@Q1]

    @R12
        enforced_by  [@I12, @I14, @I61], atomic DAG/provider-close admission checks
        open_by      [@Q1]

    @R13
        enforced_by  [@I15], one fresh-memory/default/redirect admission
        open_by      [@Q1]

    @R14
        enforced_by  [@I16, @I40], detached restore plus operation-owner normalization
        open_by      [@Q1]

    @R15
        enforced_by  [@I17], synchronous bounded send and closed handle surface
        open_by      [@Q1]

    @R16
        enforced_by  [@I17, @I18], mailbox/serialize capacity checked before admission
        open_by      [@Q1]

    @R17
        enforced_by  [@I19, @I20, @I58], one proposed actor decision stream
        open_by      [@Q1]

    @R18
        enforced_by  [@I21], pure TurnPlan over saved pre-turn truth
        open_by      [@Q1]

    @R19
        enforced_by  [@I22], compiled paths and bounded redirect stabilization
        open_by      [@Q1]

    @R20
        enforced_by  [@I23, @I56], complete candidate validation and post-publication reconcile
        open_by      [@Q1]

    @R21
        enforced_by  [@I24], shared actor/store publication barrier
        open_by      [@Q1]

    @R22
        enforced_by  [@I20, @I25, @I26], private one-shot ordered acknowledgment
        open_by      [@Q1]

    @R23
        enforced_by  [@I27, @I28, @I51], complete immutable published roots/readers
        open_by      [@Q1]

    @R24
        enforced_by  [@I29, @I30], proposed scoped sliding current-value stream
        open_by      [@Q1]

    @R25
        enforced_by  [@I23, @I31], pre-commit defect containment
        open_by      [@Q1]

    @R26
        enforced_by  [@I26, @I32], terminal close/fence/finalize path
        open_by      [@Q1]

    @R27
        enforced_by  [@I28, @I33, @I63], retained build/close Causes and final host classification
        open_by      [@Q1]

    @R28
        enforced_by  [@I34], one lifecycle owner and lease authority
        open_by      [@Q1]

    @R29
        enforced_by  [@I35, @I36], close/drain/release suspension boundary
        open_by      [@Q1]

    @R30
        enforced_by  [@I16, @I37], same-incarnation finalizer barrier/resume
        open_by      [@Q1]

    @R31
        enforced_by  [@I38, @I61], atomic dependent view/provider-close authority
        open_by      [@Q1]

    @R32
        enforced_by  [@I39, @I55], cached full cleanup Exit and stable Tombstone
        open_by      [@Q1]

    @R33
        enforced_by  [@I40], silent provider-derived baseline
        open_by      [@Q1]

    @R34
        enforced_by  [@I41, @I57, @I58], per-consumer causal closure and blocked-head FIFO
        open_by      [@Q1]

    @R35
        enforced_by  [@I42], selected-closure wave/debt observation
        open_by      [@Q1]

    @R36
        enforced_by  [@I43, @I56], current owner fences and Operations contracts
        open_by      [@Q1]

    @R37
        enforced_by  [@I44], consumed timer generation and later explicit target event
        open_by      [@Q1]

    @R38
        enforced_by  [@I25, @I45, @I46], shell-owned evidence prefix and bounded sink projections
        open_by      [@Q1]

    @R39
        enforced_by  [@I47], exact static durable provider closure
        open_by      [@Q1]

    @R40
        enforced_by  [@I42, @I48], one shared barrier cut and selected read leases
        open_by      [@Q1]

    @R41
        enforced_by  [@I49], observational capture boundary
        open_by      [@Q1]

    @R42
        enforced_by  [@I50], proposed pre-admission ordinary/terminal credit vector
        open_by      [@Q1]

    @R43
        enforced_by  [@I27, @I51], copied Flow structure and captured reader cuts
        open_by      [@Q1]

    @R44
        enforced_by  [@I52], passive exact-key reads and installed host bridge
        open_by      [@Q1]

    @R45
        enforced_by  [@I53, @I54], Runtime-owned ordered persistence/evidence/finalizer closeout
        open_by      [@Q1]

    @R46
        enforced_by  [
                     @I59
                     ], incarnation-qualified operational summaries and immutable stable evidence
        open_by      [@Q1]

    @R47
        enforced_by  [@I60], static Story selection independent of durable persistence selection
        open_by      [@Q1]

    @R48
        enforced_by  [@I62], explicit projection-only mailbox decision
        open_by      [@Q1]

tests
    T1  Through definition/machine/module/app and runtimeSetup, admit exact listed machines; reject 
        duplicate IDs/values/tooling owners, foreign tokens, and unlisted machines before any 
        service call. Include 256-byte/control/surrogate name boundaries and state depths 
        ten/eleven; assert exact literal compile contracts. [@R1, @I1]
    T2  Through actorRef and Runtime public operations, distinguish 
        delimiter-like/composed/decomposed/non-ASCII names, stable versus opaque refs, foreign 
        Runtime refs, and persist metadata. Equal spelling shares only within one Runtime; P 
        changes never redefine descriptor/K identity. [@R2, @I2, @I3]
    T3  Construct two runtimes with instrumented storage/application services. Before ready 
        execution assert zero reads/acquisitions/actors/work/evidence; each later runtime acquires 
        only its own environment. [@R3, @I4]
    T4  Gate Implementation acquisition, start concurrent ready Effects, then 
        succeed/fail/die/interrupt the owned build in separate cases. All non-canceled waiters 
        observe the identical terminal class and later ready does not reacquire. [@R4, @I5]
    T5  Gate one Implementation acquisition and start two ready calls. Wait until the second caller 
        joins the shared bootstrap, then interrupt the first and assert the same bootstrap/acquisition 
        continues; release it and assert the second caller succeeds once without restart. Dispose 
        before first ready and assert no build/provider acquisition and retained terminal readiness. 
        Race disposal with build, release build first, and assert close starts without waiting for 
        rollback, staged rollback settles before provider release, all acquired owners release once, 
        and no late handle escapes. [@R5, @I6, @I7, @I55]
    T6  Use real persistence restoration with a storage/codec/service probe log. Assert detached 
        decode before Implementation, store/providers before consumers, silent baselines before 
        activation, and zero user adapters/escaped handles before the full seal barrier. Fail each 
        acquisition/install position and assert reverse cleanup. [@R6, @I8]
    T7  Through ensure/create and the production Runtime, cause initializer/selector/redirect/batch 
        defects before visibility. Gate concurrent callers on one failed attempt and assert they share 
        its failure; no actor lookup, store generation, evidence, work, or logical edge escapes. After 
        successful invisible rollback, retry the same ref with a different first input and assert the 
        fresh attempt initializes from that retry input and succeeds. After a visible lease, fail cleanup 
        and assert retained terminal truth; failed rollback cannot retry. [@R7, @I9]
    T8  Compile never/complete/superset/partial/unresolved Implementation cases through public 
        setup. Reject duplicate service identity; readiness acquisition failure stays Diagnostic 
        and does not appear as resource/transaction outcome. Assert exactly one provider 
        acquisition/release per Runtime. [@R8, @I10]
    T9  Issue equal-ref ensures with distinct inputs and exact bindings, including concurrent 
        ready/admission races. Assert one initializer, one handle/lease/incarnation, first input 
        memory, ignored later input, and rejection of conflicting fixed bindings without replacing 
        the winner. [@R9, @I11, @I12]
    T10  Through getActor, exercise one exact admitted ref and missing, foreign, mismatched, 
         closing, tombstoned/disposed, and quarantined refs. The admitted ref returns its exact 
         ActorHandle; invalid refs fail via the canonical Diagnostic, with only Failure plus 
         FlowUsageCode projecting to FlowUsageError at the synchronous JavaScript boundary. Do not 
         treat a miss as undefined or invent a code/path/details mapping. Compare public snapshots and 
         adapter/evidence counts before/after; lookup creates no work or disposal authority. 
         [@R10, @I13, @I39]
    T11  Create two local actors from one machine; refs/memory/lifetimes differ. In the real React 
         host prepare, abandon, commit, StrictMode suspend/resume: final handle/ref remains stable, 
         abandoned preparation starts nothing, and createActor is attached immediately. [@R11, @I3, 
         @I8]
    T12  Admit provider diamonds and reject 
         missing/ambiguous/foreign/mismatched/tombstoned/opaque/cyclic bindings. Mutate provider 
         availability between preparation and commit using host gates; assert no partial edge or 
         actor escapes. [@R12, @I14]
    T13  Fresh-create with one memory counter and nested defaults/redirects. Assert one initializer 
         and final exact leaf, with no intermediate callback work/publication; failed 
         initializer/redirect leaves no actor. [@R13, @I15]
    T14  Persist, dispose Runtime, restore into a fresh production Runtime with complete fixture 
         Implementation. Assert restored memory/state/cursors and silent derived context, zero 
         initializer/input/finite/emission replay, fresh continuing generations, and fail-closed 
         missing executable P. [@R14, @I16, @I40]
    T15  Call actor.send while adapter work is gated; assert return is undefined synchronously. 
         Invalid event/lifecycle admission throws the stable Diagnostic projection before adapter, 
         occurrence, revision, or evidence change. Declaration proofs reject forbidden handle 
         methods. [@R15, @I17]
    T16  Fill the documented prepared/active actor-command queue and the finite 
         serialized-transaction queue separately through public events while a controlled consumer 
         is blocked. The next eligible admission reports AdmissionOverloaded before 
         occurrence/work/state change; drain/refill preserves FIFO and rejected work never reaches 
         adapters. Suspended/disposed commands are never retained. Keep serialize capacity numeric 
         choice private. [@R16, @I17, @I18]
    T17  Mix public commands, due timers, StoreFanout, operation completions, and provider updates 
         using TestClock/gated services. From a current decision callback, issue two accepted public 
         sends and assert both run FIFO after that decision. Observe ordered snapshots/evidence and 
         silent unknown/declined events with unchanged revisions/issues. [@R17, @I19, @I20]
    T18  Through a machine with ordered guards, updateMemory, actions, and redirects, log 
         callback-visible state/memory. Assert pre-turn reads, one merge, first eligible winner, no 
         declined branch later callbacks, and repeated can with no work/publication. [@R18, @I21]
    T19  Exercise compound descendant transitions, ancestor redirects, exact reentry, and ordinary 
         terminal-looking leaves. Reject foreign/inactive/outside reentry, ambiguous handlers, and 
         redirect 101; leaf/matches and activity/timer retention follow the declared boundary. 
         [@R19, @I22]
    T20  Return one valid finite plan followed by an invalid plan. Assert zero valid-prefix adapter 
         calls, occurrences, store mutations, or activity changes; after a fully valid batch, gate 
         the first user Effect instruction and assert it observes the initiating published snapshot 
         before executing. [@R20, @I23, @I56]
    T21  Use public actor snapshots, passive operation readers, Story checkpoint, a second 
         subscribed actor, and accepted evidence records/watermarks during initiating 
         setData/transaction promotion. Every observed initiating store revision includes its actor 
         snapshot and accepted record; capture is before or after the whole cut, never between. 
         [@R21, @I24]
    T22  Story send on publishing/no-op/contained-defect events acknowledges in the required order 
         while a user adapter and sink remain gated. Fatal/Runtime disposal during buffered sends 
         settles every acknowledgment once without replay. [@R22, @I25, @I26]
    T23  Hold an old snapshot and named readers, then change canonical 
         data/overlays/lifecycle/issues. Old cuts stay stable, latest snapshots are complete, and 
         declaration/runtime checks expose no raw Cause, causal inventory, or second public 
         revision. [@R23, @I27, @I28]
    T24  Register snapshot streams at publication races, stall a reader through several turns, 
         suspend/resume/dispose, and register late. Assert current-or-newer replay, permitted 
         skipped intermediate values, and terminal delivery before completion. Register a prepared 
         subscription and assert immediate replay of its exact prepared snapshot before activation. 
         A completed subscription never reopens on resume. [@R24, @I29, @I30]
    T25  Inject each settled per-actor authored callback defect at the public 
         transition/context/timer boundary. Assert prior domain/binding/store truth, one issue-only 
         active snapshot/diagnostic, no occurrence/adapter prefix, and no automatic retry at the 
         same cut. Keep provider-wave consumer-selector failure behavior open under 
         @plan.ApplicationsAndActors.Q1. [@R25, @I23, @I31]
    T26  Exercise a production-observable invariant failure using a failing installed owner 
         boundary, not a test-only actor mutation. Admission closes, queued acknowledgments fail, 
         finite work finalizes, and terminal fatal/cleanup snapshot/lifecycle evidence appears 
         without terminal TurnRecord. The harness capability remains to be built. [@R26, @I26, @I32]
    T27  Drive typed failure, die, interruption-only, mixed Cause reasons, and failing finalizers 
         through ready/work/dispose/Story boundaries. Assert precedence, complete cleanup truth, 
         exact allowed raw-Cause wrappers, and no raw Cause in snapshots. [@R27, @I28, @I33]
    T28  Through lease, Runtime, React attachment, and handle APIs, exercise every allowed 
         lifecycle transition and rejected successor. Assert no handle-based disposal and no 
         lifecycle-generated machine revision/TurnRecord. [@R28, @I34]
    T29  Queue commands before suspend close, send after close, and gate finalizers. Assert 
         accepted FIFO drains, later send rejects, suspended appears only after cleanup, no live 
         attachment remains, and all continuity/deadline fields retain their incarnation values. 
         [@R29, @I35, @I36]
    T30  Resume after controlled downtime/provider changes and after cleanup failure in separate 
         runs. Assert finalizer wait, one overdue refresh, continuing reacquisition, ordinary 
         context update, no input/finite/emission replay, and blocked failed resume retaining 
         suspended truth. [@R30, @I16, @I37]
    T31  Dispose a provider with active/suspended consumers. Assert precise refs/slot diagnostics 
         and unchanged provider gate; after consumer disposal, provider succeeds. Runtime shutdown 
         releases the diamond consumers before providers on all exit classes. [@R31, @I38]
    T32  Gate and then fail one cleanup; concurrent/repeated lease/Runtime disposal joins once and 
         reports the same full failure. Stable get/ensure preserve quarantine in that Runtime, 
         while a fresh Runtime can create a new incarnation. [@R32, @I39, @I55]
    T33  Admit/restore/attach a consumer while changing a prepared provisional provider cut. Assert 
         all slots use current exact provider truth, initial onContext mapper is silent, and 
         prepared memory/handle is never replaced. [@R33, @I40]
    T34  Diamond A→B,C→D: invalidate A before either consumer refresh, let B settle first and hold 
         C. D retains prior complete context and its head wake blocks later events. Resolve C 
         changed and unchanged in separate runs; D recomputes the latest complete vector once. After 
         unchanged settlement clears debt, assert selected capture succeeds without capture-driven 
         progress. Add A2 before release and assert no stale ticket payload or mixed lineage. Separately 
         dispose D while that head is blocked with an accepted ordinary event behind it: neither retired 
         fact executes or creates work/TurnRecord, each acknowledgment settles once with terminal 
         non-success, prior committed snapshot stays intact, and cleanup/evidence drain without 
         upstream recovery. [@R34, @I41, @I57, @I58]
    T35  Suspend C in the diamond, change A, and checkpoint the selected closure repeatedly. Each 
         capture returns retryable ConcurrentCapture without driving time/work. Explicit 
         resume/recovery settles debt; capture then succeeds. Leave provider-wave selector-failure 
         debt policy to @plan.ApplicationsAndActors.Q1. [@R35, @I42]
    T36  Through the real Resource, Transaction, and Stream operation owners, run one 
         Runtime-to-mailbox fencing case for each family. Race cancel/replacement/suspend/dispose 
         with late success/failure from an abort-ignoring named external adapter. Assert no stale 
         current mutation/event, exactly-once settlement/release, actor-local overlays, and truthful 
         post-irreversible unknown/reconciliation-required status. Substitute only named external 
         adapters, storage, and Clock. [@R36, @I43, @I56]
    T37  With TestClock, fill an ordinary actor mailbox before a due timer target becomes eligible. 
         Timer update increments memory and target event increments it again; queue another ordinary 
         event between them. Assert fired publication precedes target, each merge reads its own 
         pre-turn memory, one due generation fires once, the target remains retained despite 
         saturation and runs once in FIFO order, and compound deadline survives unrelated descendant 
         changes. [@R37, @I44]
    T38  Attach bounded sinks at early/late points, gate one/fail another, 
         overflow/clear/drain/dispose, and interleave actors/lifecycle. Assert one global order, 
         exact prefix marker including capacity zero, ack independent of sink processing, and final 
         evidence drained after lifecycle disposal. [@R38, @I25, @I45, @I46]
    T39  Capture persistable consumer with stable persistent provider, then 
         opaque/nonpersistent/filter-excluded direct/transitive providers. Success includes exact 
         closure; each rejected closure is NonDurableContextProvider with no promotion or omitted 
         consumer. Include boot-restored/suspended members and exclude unrelated/local/tombstoned 
         actors. [@R39, @I47]
    T40  Through persistence and Story checkpoint/run.end, race each selection's membership/provider 
         changes and store/actor publication. Assert each operation uses its own actor selection and 
         coherent cut; do not require the two capture cuts to be identical. Persistence retains its 
         durable facts/issues and excludes Story pendingWork, TestClock time, and evidence. Story uses 
         its exact static closure and includes pendingWork, TestClock now, actor issues, and the 
         accepted-through evidence watermark with the bounded sink's truncation marker/retained prefix. 
         Mixed cuts reject ConcurrentCapture without partial artifacts; run.end precedes cleanup. 
         [@R40, @I42, @I48]
    T41  Capture with instrumented storage/adapters/Clock and held actor identities. Assert capture 
         creates/disposes/restores nothing, starts no adapter, advances no time, performs no 
         captured-evidence live lookup, and serializes no independent selected-context source. 
         [@R41, @I49]
    T42  Restore valid near-MAX cursors through real persistence, then admit work at sufficient and 
         insufficient terminal headroom. Exercise each independently allocated counter without 
         changing more than one exhaustion case at once. Rejection leaves all roots unchanged; 
         accepted work can still cancel/dispose with safe unique counters and terminal evidence. 
         Seed only through legitimate persisted inputs; if any needed counter cannot be seeded, 
         report that proof/harness gap under Q1 instead of adding a test-only setter. No-op returns 
         unused capacity. [@R42, @I50]
    T43  Mutate caller-owned Flow envelopes/key containers and later Flow-owned 
         snapshots/records/readers through normal subsequent operations. Captured copies retain 
         their cut; application opaque payload identity stays equal. [@R43, @I27, @I51]
    T44  Through useView and snapshot named readers, switch exact resource keys, miss an entry, 
         throw a selector, and publish unrelated/matching dependencies. Assert replaced dependency 
         set, Object.is/fixed-record equality, same-cut exception memoization, and no actor/store 
         creation/work. Run bridge Effects against the installed services/TestClock without nested 
         runners. [@R44, @I52]
    T45  Gate serialized persistence writes and finalizers while disposing Runtime. Assert latest 
         accepted write finishes without older overwrite, failed writes preserve 
         runtime/last-success truth, all accepted evidence drains, and combined shutdown failure 
         retains cleanup classification. [@R45, @I53, @I54]
    T46  Generate bounded public sequences of ensure/get/send/provider changes/Story 
         process/TestClock movement/suspend/resume/dispose/capture. Compare invariants and allowed 
         outcomes against an independent small contract model; retain seeds and minimize violating 
         traces. Substitute only declared external services/storage, never Runtime, ActorEngine, 
         StoreKernel, fanout, or evidence owners.
    T47  Fail attempt one and succeed/release later by the same owner, then create a later Runtime 
         incarnation. Assert only the original owner's operational summary clears, stable ordered 
         diagnostics remain truthful, and the later lifetime cannot inherit or clear them. [@R46, 
         @I59]
    T48  Through public story.machine and app Story recipe/send/checkpoint/run APIs, capture the 
         implicit local machine actor and a persist-false local recipe with exact 
         binding/target/transitive providers. Checkpoint/run.end includes exactly that Story 
         closure, excludes unrelated actors, and neither promotes identity nor applies persistence 
         filters. Persistence selection still rejects incompatible durable closure under T39. 
         [@R47, @I60]
    T49  Gate a provider's finalizer after disposal closes admission while its snapshot remains 
         active. Consumer creation bound to it rejects before edges/work/store/evidence. Reverse 
         the order: admit consumer first, then provider disposal rejects precise dependents with 
         unchanged gate. [@R12, @R31, @I61]
    T50  Through production Runtime/operation APIs, deliver StoreFanout and unmapped stream 
         emissions while counting authored transition/guard/action/redirect/updateMemory callbacks 
         and finite adapter starts. Only permitted projection/publication truth changes; counters 
         stay zero, domain state/memory/machine cursor stay fixed, and no hidden event appears. A 
         separately configured explicit mapping runs its ordinary event later after projection 
         publication. [@R48, @I62]
    T51  Gate an interruption-masked bootstrap phase and failing release separately. Dispose before 
         first ready and assert no build/provider acquisition and a retained terminal ready result. 
         During bootstrap disposal, assert close starts before staged rollback finishes, rollback 
         settles before provider release, and readiness/disposal retain cleanup defect plus 
         cancellation truth. Repeated calls never rerun finalizers. The dependency-only join probe 
         verifies selected rc.112 composition, not this future product proof. [@R4, @R5, @R27, @I63]
