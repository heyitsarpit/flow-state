spec Turn
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in wiki/specs/specs.log.
              Written from the merged flow plans (proposed).
location      packages/flow-state-v3/src
provides      turn, check, snapshot, schedules, placements, onContext
derives_from  [
              @plan.Machines.O2, @plan.Machines.O3, @plan.Machines.O4, @plan.Machines.O5,
              @plan.Machines.O6, @plan.Machines.O7, @plan.Machines.O8, @plan.Machines.V3,
              @plan.Machines.V4, @plan.Machines.V5, @plan.Machines.V6, @plan.Machines.V7,
              @plan.Machines.V8, @plan.Machines.V9
              ]

requirements
    R1  One active leaf
        source  @plan.Machines.O2.
        must    Exactly one leaf is active, with the state rules the source sets.

    R2  Handler selection
        source  @plan.Machines.O2; @plan.Machines.O3.
        must    Each event selects its handler and alternative by the source's selection order,
                ending Denied or Unhandled after the root.

    R3  Self, re-entry and order
        source  @plan.Machines.O2.
        must    "self", re-entry, the unchanged boundary, and exit and entry order behave as the
                source states.

    R4  Subroutines and history
        source  @plan.Machines.O2.
        must    Subroutine states and history behave as the source states. S.X.history enters X's last active direct 
                child, recorded when X is exited, through that child's
                defaults; with none recorded it enters X's default leaf. A history target whose own move exits X
                reads the child that move exits, as SCXML records history before entry.

    R5  One turn
        source  @plan.Machines.O3.
        must    A turn runs the source's steps in order and publishes once; a pending reset runs
                first as its own turn.

    R6  Fragment incarnations in a turn
        source  @plan.Machines.O3.
        must    Fragment incarnations start, end and reset within a turn as the source's "select
                the parts" and "commit" steps state.

    R7  Two memory views
        source  @plan.Machines.O3.
        must    Every callback reads the memory, lanes and time the source's two memory views assign
                it.

    R8  Refused turn
        source  @plan.Machines.O3.
        must    A turn the source names invalid is refused whole, as the source states.

    R9  After publication
        source  @plan.Machines.O3; @plan.Machines.O6.
        must    Work after publication, and Unhandled and denied events, behave as the sources
                state.

    R10  Callback defects
        source  @plan.Machines.O3.
        must    Callback defects before and after commit behave as the source states.

    R11  Determinism
        source  @plan.Machines.O3.
        must    A turn is deterministic as the source states.

    R12  Guards
        source  @plan.Machines.O4.
        must    A guard receives { event, state, memory, props, context, schedules, operations } from the 
                pre-turn snapshot and returns true or deny(code, context?). false is a type error; 
                any other invalid return is a guard defect. A guard array passes only when all 
                pass; a state token in it passes when the pre-turn state is at or below it. An 
                operation's idle and retryable are guards over its lanes, under @spec.WriteLanes.

    R13  check
        source  @plan.Machines.O4.
        must    check(snapshot, event) runs selection, parts and validation with no effect: no
                memory update, admission, publication, evidence, mint, queue join, prediction,
                release or work. It returns Allowed when a transition would run; Denied with reasons
                when handlers exist and all decline or the turn would be refused (InvalidTurn);
                Unhandled when none exists.

                Reasons list each declined alternative, deepest level then authored order; a
                declined state token reads NotInState. Verdicts compare by Equal.equals. An old
                snapshot answers from its own captured values. A defective guard makes check throw
                GuardDefect without publishing an issue.

    R14  Schedule arming
        source  @plan.Machines.O5.
        must    A schedule with neither `armOn` nor `restartOn` starts on entry. `armOn` and `disarmOn` list event
                tokens, `armOn` also Flow.entry. `armOn` starts it on each accepted listed event,
                restarting it if running, and with Flow.entry also on entry. `disarmOn` stops it;
                stopping an idle schedule does nothing. Exit stops any schedule. Only
                `armOn: [Flow.entry]` may sit beside `restartOn`; a turn that does both arms once,
                from step one. An event in both lists, any other `armOn` with `restartOn`, or
                `armOn` on a keyed schedule is a construction error. A fixed delay outside 0 to
                the host timer's limit, 2^31 - 1 ms (`TIMER_LIMIT_MS`, a platform limit; so a fixed
                negative one) is a construction error (InvalidConfiguration,
                details.reason DelayOutOfRange). A computed finite negative delay counts as zero: due at
                once, fired once on the next turn, never in the arming turn. A computed delay that
                is NaN, infinite or over 2^31 - 1 ms refuses the turn. At creation, where no turn
                can be refused, that schedule alone stays unarmed with an InvalidTurn issue and the
                others arm.

                When no state from the routed one up to the root has a written handler for an event
                that an active schedule lists in `armOn` or `disarmOn`, the deepest such schedule's
                state handles it with an implicit unguarded { target: "self" }, so that event is not
                Unhandled; a written handler at any level is selected first, and an ancestor's
                handler is never shadowed. A schedule never counts the turn that arms it, and
                descendant changes and "self" keep its deadline, except that the event the schedule
                lists in `armOn` restarts it, the implicit "self" handler included.

    R15  Schedule firing
        source  @plan.Machines.O5.
        must    Each arming has an id; a firing from an earlier arming, or from an ended 
                activation, is never delivered. A Duration fires once; a Schedule fires each step 
                until complete. Equal deadlines enqueue by actor admission order, then outermost 
                state, then declaration order, each a separate turn. An overdue step fires once, 
                and the next delay starts at the actual firing. The host steps a multi-step
                Schedule and hands the core the next delay as data; a pause right after a firing
                holds the next step's full delay.

    R16  restartOn and keyed schedules
        source  @plan.Machines.O5.
        must    `restartOn` sets a silent baseline from the activating turn's after memory and
                leaves the schedule idle unless `armOn` lists Flow.entry. After each committed
                turn a changed selection under Equal.equals restarts only that schedule from its
                first step, dropping any `left`; equal values do nothing.

                A keyed schedule's keys come from the after memory and after lanes:

                - one timer per key, armed when the key appears, cancelled when it leaves, firing
                once with key;
                - a repeated key keeps its first position with `listRepair` evidence;
                - `restartOn` is evaluated per key;
                - `schedule`, `paused`, `restartOn` and `send` receive `key`, which is identity
                    only; a turn runs keys, then `restartOn`, then `paused`.

                Per-key timers persist by key with `dueAt` or `left`, and on restore the restored
                memory's keys win.

    R17  Schedules and use
        source  @plan.Machines.O5.
        must    Schedules fire only while their actor is used (@spec.Actors). A deadline due while
                unused waits; only the latest arming waits, and re-arming, disarming or exiting
                removes a waiting deadline. A local actor's use ends with the page: after a reload
                it is unused, and so its schedules wait, until it is used again (@spec.Actors.R7; ensuring alone is not 
                a use).

                On restore, resume or a returning use, a Duration keeps its deadline and fires once
                if overdue, waiting deadlines in deadline order; a paused timer keeps its `left`. A
                multi-step Schedule restarts at step one; a paused one first finishes its `left`. A
                resumable trait's schedules keep `dueAt` or `left` while frozen and fire once on
                return if overdue. Restored baselines are silent, and `keys` and `paused` are
                re-evaluated silently on restore, hydration and return.

    R18  Placements
        source  @plan.Machines.O6.
        must    After each turn an unchanged operation and key keep existing work; a changed key
                releases old work exactly once and starts new work; when false releases only that
                placement. A freeze releases a trait's placements and a thaw places them again.

                A live operation is placed in one state or trait incarnation at a time unless state
                tokens in when make placements exclusive (DuplicatePlacement); one operation uses
                one verb (VerbMismatch). Release failure reports once without blocking the
                transition.

    R19  Endings become later turns
        source  @plan.Machines.O6.
        must    Endings map to events on the declarer and run in later ordinary turns. value fires 
                only for a changed confirmed value under Equal.equals. Lane-only changes publish 
                captured lanes without running handlers, guards, updates, actions, schedule
                functions, restartOn, onContext or onProps, except that every lane change, a denied
                or unhandled ending's admission included, re-checks `keys` and `paused`; a defect
                there publishes one issue and keeps the previous values, and the lane change still
                publishes. Finite work starts only from an accepted transition's
                actions.

    R20  The owner test
        source  @plan.Machines.O6.
        must    A commit, lookup or retry is owned by the activation of the state its transition 
                names. At admission its ending is current, routed from the active leaf, if that 
                activation is alive; otherwise late, routed from the owner's nearest surviving 
                strict ancestor. An adopted ending and every unknown { Restored } are current from 
                the active leaf. Lateness is not transitive.

    R21  A late turn may not leave live work
        source  @plan.Machines.O6.
        must    In a late turn an alternative may not exit a state that owns other pending work, or
                an active subroutine (LateMayNotLeave). Pending work is every call owned by an
                activation it exits: an InFlight head and every queued commit, behind a Held head
                too, whatever the transition cancels.

                A Held head is not pending work. flow check errors on a late handler with no
                alternative that stays put at the owner state or its ancestors (@spec.StaticCli); a
                late ending landing while the owner is not re-entered, at an ancestor whose
                alternatives all leave, is denied at run time, an accepted risk (the runner's
                ruling).

    R22  Context reactions
        source  @plan.Machines.O7.
        must    `onContext` select sets a silent baseline at admission, a reload restore, adoption
                and hydration. Only context waves re-run it, the one wave a returning incarnation
                receives included (@spec.Actors.R9); memory-only changes do not. Equal selections are
                silent. Decision (agent, 2026-11-11): audit C13. Why: a reload restores a consistent
                saved world, while a return may have missed provider changes. Reverse: make the
                return silent too (spec-log.md, T42).

                A changed selection becomes the baseline even if when declines; with no when, or
                when true, its event enqueues after the context turn, in declaration order, in the
                one FIFO mailbox. A select, when or mapper defect publishes one issue, keeps the
                previous baseline and emits nothing. A baseline keeps the inputs it was read from,
                the slots and memory fields its select read, so a restore reads it again as it was,
                a kept one included. Reactions never change state directly.

    R23  Snapshot shape
        source  @plan.Machines.O8.
        must    A snapshot exposes state, memory, props, context, issues, lifecycle, schedules and
                operations; a timer shows `{ dueAt }` while running or `{ left }` while paused, never
                both, in Runtime Clock milliseconds, and `pausedBy` beside `left`.
                A fragment's memory slice sits under its instance name: undefined while inactive,
                present while frozen; .each copies are a keyed list.

                Every list of several things is a keyed list in key order, each entry with key; an
                entry that does not exist is absent, never a default. Outside types omit
                Flow.private fields. It has no input, methods or public revision.

    R24  Snapshot values
        source  @plan.Machines.O8.
        must    Snapshots are deeply frozen plain data. Reading an old snapshot never consults live 
                lanes. Unchanged parts keep identity across publications, the memory object included
                when no field changed; a changed Flow-owned container is a new copy, and opaque
                application values keep identity. Every value the Runtime admits (memory, a
                selection, a payload, a commit input, an action's key, a restored record's values)
                is immutable by contract: an update returns new containers, never writes in place.
                A dev or test host deep-freezes each admitted value, Maps, Sets, Dates and class
                instances included, so a write throws where it happens and is its turn's Defect;
                production admits values as they are (@plan.Pending.D29). A Map, Set or Date the
                app froze itself is trusted as immutable and not wrapped, as Immer freezes them in
                dev (the user, 2026-11-17, Q20 B).

    R25  Issues by source
        source  @plan.Machines.O8.
        must    A later success or release clears its own source's issue, never another source's. A 
                new incarnation inherits no issue.

    R26  A turn's verdict is an act
        source  @plan.Machines.O3; @plan.Inspection.O2.
        must    The turn returns its verdict as a value and reports nothing itself. The verdict is
                one of Accepted (from, to, parts, members), Unhandled, Denied (reasons) and
                Refused (a code). The step records it as one Turn act with the actor, the event
                and, for an ending's turn, the owed row it delivers (@spec.WriteLanes `model`).

                The Turn, Unhandled and Denied reports and a refusal's Issue are derived from that
                act, in act order, by the one function that builds a report (@spec.WriteLanes
                composition); no module writes a report, and none is placed among earlier ones
                after the fact. An ending's turn that is Accepted, Unhandled or Denied closes its
                row as delivered (R9); a Refused one leaves the row to its retry
                (@spec.Actors.R15). Decision (user, 2026-11-12): consult round 3, C1 and C2 step
                A4. Why: reports derived from acts cannot disagree with what ran. Reverse: restore
                R26 from commit `9405af2f`.

                `check` is computed by the same evaluation and yields no act. It keeps its public
                answer (R13): Accepted maps to Allowed, Refused to Denied with InvalidTurn, and
                Denied and Unhandled stay as they are. Decision (agent, 2026-11-12): check's public
                Allowed, Denied and Unhandled stay (a small public API). Why: it is check's
                published contract. Reverse: make check return the turn's verdict type.

    R27  Pause
        source  @plan.Machines.O5.
        must    `paused: { Reason: ({ key?, memory, props, context, operations }) => boolean }`
                names each reason; any true pauses the timer, and the snapshot shows `pausedBy`,
                the active reason names in declaration order, beside `left`. `paused` is always a
                record, never a bare function; reason names are a literal union, so `pausedBy` is
                typed. A turn runs keys,
                then `restartOn`, then `paused`, after each committed turn. True holds the time
                left of the current delay (`left = dueAt - now`, at least 0); false resumes from
                it (`dueAt = now + left`). Paused time never counts toward a delay; an unused
                actor, a frozen trait and a closed page still count. Arming or restarting while
                paused holds the full delay. A multi-step Schedule pauses inside its current
                delay, and its `attempt` does not advance. `disarmOn`, exit or a key leaving
                removes a paused timer; nothing fires later.

    R28  Props
        source  @plan.Machines.O1; @plan.Machines.O7.
        must    Only local actors take props. Every prop has a value before any use, its Schema's
                default. Props are never persisted or transferred. A props update is its own
                turn: it changes only props, then runs `onProps`, whose baseline is silent at
                admission and whose events queue in the one FIFO mailbox. Every reader of memory
                receives props from the same snapshot. A prop name may not collide with another
                name in the one namespace (@spec.Compile.R10).

    R29  Emits
        source  @plan.Machines.O2; @plan.React.O3.
        must    Any accepted transition may emit: a send, a firing, an ending, an `onContext` or
                `onProps` event; entry, exit and a refused turn never do. A copy that ends in the
                same turn still delivers. Each emit is recorded as `emit` evidence. An emit's payload mapper reads the 
                event, the before
                memory and props, and a mapper defect is a pre-commit defect. Emits queue per
                listener in turn order, are never stored, persisted, transferred or replayed, and
                are dropped when nobody listens and in server rendering. A fragment's emits are
                part of its summary.

    R30  A fan-out raise
        source  @plan.Machines.O1; @plan.Machines.O3.
        must    A raise into a trait placed with .each reaches every copy live at turn start, in
                key order. A copy with no handler on its active path is skipped with `Unhandled`
                evidence; a copy whose guards deny refuses the whole turn; with no live copies the
                raise does nothing and is recorded. Keys past `max` are dropped with `listRepair`
                evidence, never refused.

open
    Q1  Executable checks are not built.
        outcome  When its slice is built, each test below is written as the cheapest check that fully
                 covers it (a compile-time test, a run rule applied to every Story run, a Story test
                 or a pure core test) in `packages/flow-state-v3/tests/`, and each rule gets a
                 planted fault in `tests/faults.ts` that `nub run faults` must catch; until then
                 every Requirement's evidence is open.

    Q2  No Story test or planted fault exists yet for check(), onContext, restartOn, keyed schedules, exit and entry 
        order, or equal-deadline order.
        outcome  Those cases are written first, each with its planted fault (Q1).

    Q3  Which Diagnostic code a refused turn's issue carries is not stated by the plans; InvalidTurn is check()'s 
        denial code, not a Diagnostic code (@spec.Diagnostics.R4).
        outcome  Phase 4 names it, and this Spec records it as a change.

model
    PreTurn = the snapshot at admission, with the turn's own ending admitted.

    After = the memory the turn publishes: new incarnations' initial memory, then every patch in 
        expansion order, after list repair.

    Activation = one entry of a state, ended by its exit; a re-entry is a new Activation.

    Boundary = for a handler at H targeting T: H if the target is "self" or T is a strict descendant 
        of H, otherwise the nearest proper ancestor of T that also contains H. An explicit target
        naming H itself is a re-entry, so its Boundary is H's parent. Decision (agent, 2026-11-11):
        audit C21. Why: so I4 and I5 agree. Reverse: give "self" the parent's Boundary and reword I4
        (spec-log.md, T42).

    Used = the use relation of @spec.Actors for the actor.

invariants
    I1  At every publication exactly one leaf is active. [@R1]

    I2  The selected alternative is the first passing one at the deepest level that has one; no level below it has a 
        passing alternative. [@R2]

    I3  A turn whose child part refuses publishes no transition of its own: it publishes only I14's one issue-only 
        snapshot. [@R2, @R5]

    I4  A "self" transition leaves the set of live Activations unchanged. [@R3, @R4]

    I5  Every Activation at or above the Boundary is the same before and after the turn; every entered state is a new 
        Activation. [@R3, @R4]

    I6  Exits are ordered deepest first and entries outermost first; a parent's activity starts before and stops after 
        each child's. [@R3]

    I9  Each turn publishes at most once, and an accepted transition with all its parts publishes exactly once. [@R5]

    I10  A pending reset runs as a turn of its own before the next admitted event. [@R5, @R6]

    I11  Every incarnation the turn ends has run whenAbandoned in that same turn. [@R6]

    I12  Every read @plan.Machines.O3 lists for PreTurn returns PreTurn values; every read it lists for After
        returns After values. [@R7, @R12]

    I14  A refused or pre-commit-defective turn leaves state, memory, context and store equal to PreTurn and starts no 
         work; it publishes exactly one issue-only snapshot. [@R8, @R10]

    I15  An Unhandled or Denied event changes no state, memory or revision of its own and starts no work; an ending 
         admitted in that turn has already applied its lane effects at settlement (@spec.WriteLanes.R10) and its owed
        row closes as delivered. [@R9]

    I16  A post-commit defect never undoes the committed state and never applies part of a write batch. [@R10]

    I17  turn(snapshot, event, clock, seed) is a function: equal arguments give equal results. [@R11]

    I18  check(s, e) leaves the Runtime unchanged, is Allowed exactly when handling e at s would run a transition, and 
         on an old snapshot s gives the same verdict whatever has happened since, from s's own captured values.
        [@R12, @R13]

    I20  A delivered firing carries the id of its schedule's latest arming, and its activation is alive. [@R15, @R16]

    I21  A schedule's first firing is strictly after the turn that armed it. [@R14]

    I22  An overdue Duration fires exactly once on resume. [@R15, @R17]

    I23  While an actor is not Used, no schedule of it fires; at most one waiting deadline exists per schedule. [@R17]

    I24  For a placement whose operation and key are unchanged across a turn, its work is the same work; a changed key 
         releases the old work exactly once. [@R18]

    I25  A value outcome fires only when the confirmed value differs, under Equal.equals, from the value the placement 
         last mapped. [@R19]

    I26  An ending is routed from the active leaf iff its owner Activation is alive, or it is adopted or unknown { 
         Restored }. [@R20]

    I27  A late turn never exits an Activation that owns an InFlight head or a queued commit. [@R21]

    I28  An onContext event is enqueued only after a context wave (a returning incarnation's one wave included) changed 
         its selection, and the baseline then equals that selection. [@R22]

    I29  A published snapshot is never mutated afterwards. [@R23, @R24]

    I30  A part of a snapshot whose content is unchanged is the same object in the next snapshot. [@R24]

    I31  An issue is cleared only by its own source; a new incarnation's first snapshot has no issue. [@R25]

    I32  Firings with equal deadlines are admitted as separate turns, ordered by actor admission order, then outermost 
         state, then declaration order. [@R15]

    I33  A multi-step Schedule's next delay is counted from the previous step's actual firing, and an overdue step 
         fires once. [@R15]

    I34  A `restartOn` schedule restarts from its first step exactly after a committed turn whose selection differs 
         from its baseline under Equal.equals, never at its activating turn or a restore, and only that schedule
        restarts; a restart drops any `left`. [@R16, @R17]

    I35  A keyed schedule has exactly one live timer per key in the after memory and after lanes: armed when the key 
         appears, cancelled when it leaves, and each firing carries its key. [@R16]

    I37  A timer holds `dueAt` or `left`, never both; paused time never moves `dueAt`. [@R23, @R27]

    I38  Every lane change re-checks `keys` and `paused` and runs no other schedule work. [@R19, @R27]

    I39  An emit is delivered at most once per listener, after its turn, never from a refused turn or a replay. [@R29]

owner Acts
    lifetime  one step. Design, agreed by the user, 2026-11-12 (consult round 3, C1 and C2); I36 moved here from
              `invariants`, id kept.
    state     the step's acts, in act order

    invariants
        I36  Every admitted event's turn yields exactly one Turn act carrying its verdict, and the turn's Turn, 
             Unhandled, Denied and Issue reports are exactly what that act derives, in the order of the step's acts.
            [@R26]

composition
    flow
        Design note, proved by the prototype. The turn is pure and runs on a working copy, so a
        refusal is one assignment and a commit one publication
        (packages/flow-state-v3/prototypes/round-14/turn.ts). It is called by a pure step that
        takes time and ids from its environment and returns the next world, at most one
        publication and commands (round-14/step.ts); only the driver performs effects.

        Shared terms. Ending, Attempt, lane and owed row are @spec.WriteLanes's terms; Start and
        Life are @spec.Actors's.

realization typescript
    Design, agreed by the user, 2026-11-12 (the production layout of @task.V3.T16, consult round 3); moved here from
        `composition`.

    `runTurn` (src/core/turn.ts) is the pure turn: selection, guards, the memory patch, selects and armings,
        returning a TurnResult; it never touches the world.

    `step` (src/core/step.ts) composes one step from modules over one working state (src/core/tx.ts): the owed
        ledger, lanes, answers, incarnations, serve and the Runtime's life, each `make*(tx, ...)`. No module persists
        or reports: the step marks the records it changed and a Capture writes them (@spec.WriteAhead realization), and
        it derives its reports from its acts (R26; @spec.WriteLanes realization). A world a step returns is handed to 
            the next step,
        which writes in place the maps that world alone holds, so a step costs what it changes; a reader that keeps a
        world (a Story's cut) retains it, and every other map is copied once, on its first write in the step. Indexes
        (each identity's lanes, the lane awaiting each call or ticket, each provider's consumers, each ticket's
        silence) are kept by the operation that changes their facts. Ids come from its counter and the boot's seed.

    The driver (src/host/driver.ts) runs commands with Effect: every call, timer and persistence wake is a keyed fiber
        in one FiberMap owned by the Runtime's Scope, sleeping on Effect's Clock and run on its Scheduler, which a
        test provides; Disarm interrupts the key's fiber. Arm, Disarm and Fired stay data, so a
        replay needs no host.

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1]

    @R2
        enforced_by  [@I2, @I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I5, @I6]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I4, @I5]
        open_by      [@Q1]

    @R5
        enforced_by  [@I3, @I9, @I10]
        open_by      [@Q1]

    @R6
        enforced_by  [@I10, @I11]
        open_by      [@Q1]

    @R7
        enforced_by  [@I12]
        open_by      [@Q1]

    @R8
        enforced_by  [@I14]
        open_by      [@Q1]

    @R9
        enforced_by  [@I15]
        open_by      [@Q1]

    @R10
        enforced_by  [@I14, @I16]
        open_by      [@Q1]

    @R11
        enforced_by  [@I17]
        open_by      [@Q1]

    @R12
        enforced_by  [@I12, @I18]
        open_by      [@Q1]

    @R13
        enforced_by  [@I18]
        open_by      [@Q1, @Q2]

    @R14
        enforced_by  [@I21]
        open_by      [@Q1]

    @R15
        enforced_by  [@I20, @I22, @I32, @I33]
        open_by      [@Q1, @Q2]

    @R16
        enforced_by  [@I20, @I34, @I35]
        open_by      [@Q1, @Q2]

    @R17
        enforced_by  [@I22, @I23, @I34]
        open_by      [@Q1]

    @R18
        enforced_by  [@I24]
        open_by      [@Q1]

    @R19
        enforced_by  [@I25, @I38]
        open_by      [@Q1]

    @R20
        enforced_by  [@I26]
        open_by      [@Q1]

    @R21
        enforced_by  [@I27]
        open_by      [@Q1]

    @R22
        enforced_by  [@I28]
        open_by      [@Q1, @Q2]

    @R23
        enforced_by  [@I29, @I37], snapshot types
        open_by      [@Q1]

    @R24
        enforced_by  [@I29, @I30]
        open_by      [@Q1]

    @R25
        enforced_by  [@I31]
        open_by      [@Q1]

    @R26
        enforced_by  [@I36]
        open_by      [@Q1]

    @R27
        enforced_by  [@I37, @I38]
        open_by      [@Q1]

    @R28
        enforced_by  [@I12]
        open_by      [@Q1]

    @R29
        enforced_by  [@I39]
        open_by      [@Q1]

    @R30
        enforced_by  [@I14]
        open_by      [@Q1]

tests
    T1  Self and re-entry: a call started in a state, then "self", then an explicit re-entry of that state; after self 
        the call ends current, after re-entry it ends late.
            Planted faults: a re-entry that keeps the activation (also when explicit); a re-entry of the parent.
            [@I4, @I5]
    T2  Exit and entry order: a three-level tree with an activity per level and a transition across two branches; the 
        recorded stop and start order is deepest-first exits, then outermost-first entries. No test yet; phase 3
            writes one with a planted fault that enters innermost first. [@I6, @I1]
    T3  Subroutines and history: exit, abandonment, an ancestor's self, history re-entry. Planted fault: a history 
        re-entry that keeps the activation. [@I4, @I5]
    T4  One publication: a transition that raises into two traits and resets a third publishes exactly one snapshot; a 
        child's refusal publishes only the issue-only snapshot, with none of the parent's patch. [@I3, @I9]
    T5  Before and after memory: a schedule function and a commit select read the value the turn wrote; a guard and a 
        mapper read the old one. Planted fault: a schedule that reads the pre-transition memory. [@I12]
    T6  Refused turns: an out-of-range computed schedule delay (non-finite or past 2^31 - 1 ms; zero or negative counts 
        as zero) and
            overlapping keys (two raises writing one key; construction rejects those pruning cannot separate,
                @spec.Compile.R13, so this is the run-time check) refuse the turn: state unchanged, one issue-only 
                    snapshot, and check() answers Denied
                    with InvalidTurn (Q3 names the issue's code).
                    Planted faults: an unbounded schedule delay; a computed negative delay refused;
                    overlapping keys allowed. An unencodable value does not
                        refuse;
                    planted fault: a NaN carried as null. [@I14]
    T7  Callback defects: a throwing guard, select and key each keep the prior snapshot with one issue naming the 
        callback path, and the same input is not retried. A throwing post-commit mapper publishes one issue and no 
        event. [@I14, @I16]
    T8  Determinism: run one reference scenario twice on a controlled clock and seed; the turn records are equal, and a 
        host clock jump between runs changes nothing. [@I17]
    T9  check agreement: for every (state, event) pair of the reference machines, check's verdict equals what handling 
        does, and a Runtime spy sees no effect from check; a stored old snapshot answers from its captured values. No
            test yet. [@I18]
    T10  Schedules: armOn, disarmOn, exit, a re-armed debounce, a stale firing after re-arming. Planted faults: a 
         schedule of a left state kept; a grace not fenced. [@I20, @I21]
    T11  Waiting while unused and overdue. Planted faults: a schedule that fires while unused; a waiting schedule that 
         survives a re-arm, never
             wakes or is lost at the end; a reset that keeps timers. [@I22, @I23]
    T12  restartOn and keyed schedules: a changed selection restarts only its schedule; equal values do nothing; a key 
         leaving cancels its timer, a repeated key keeps one timer, and a restore does not restart a restartOn
             schedule; an unkeyed `armOn: [Flow.entry]` beside restartOn; key in schedule and paused. No test yet.
             [@I20, @I34, @I35]
    T13  Placements: a key change releases once and opens the new key; a non-key change keeps the session; a throwing 
         select keeps it with one issue.
             Planted faults: a key not part of the identity; a throwing select that releases. [@I24]
    T14  Owner test: a late ending routed as current, an unknown { Restored } routed from the root, and a late ending 
         left Unhandled must each fail the check
             as planted faults. [@I26]
    T15  LateMayNotLeave: a late exit beside an InFlight head or queued commit is denied; beside a Held head it is 
         allowed.
             Planted faults: a late exit that always leaves; one that leaves beside a queued commit; a Held head taken
             as live; a queue behind a Held head taken as not live; an active subroutine ignored. [@I27]
    T16  onContext: a provider change wave with an equal selection, a changed one with when declining, and a throwing 
         select. No test yet. [@I28]
    T17  Snapshots: writing into a published snapshot fails; a later publication reuses unchanged parts by identity. 
         Planted faults: a patch or row written in place; an absent entry treated as placed. [@I29, @I30]
    T18  Issues: two sources raise issues; one source's success clears only its own; a new incarnation starts with 
         none. No planted fault yet. [@I31]
    T19  One leaf and selection: generated event sequences over the reference machines; every snapshot's state is a 
         complete leaf path, and the chosen alternative equals an independent reference model of selection (deepest 
         level first, first passing). No planted fault yet; phase 3 writes one that tries the root first. [@I1, @I2]
    T20  Pending resets and whenAbandoned: a commit changes a trait's reset value; the reset runs as its own turn 
         before the next event; a leave that ends a trait runs whenAbandoned in the leaving turn. Phase
             3 writes the planted faults. [@I10, @I11]
    T21  Denied and Unhandled: a lane ending admitted where every alternative declines applies its lane effects, counts 
         as delivered (its owed row closes), and changes no state or revision; an unhandled public event publishes 
         nothing. Phase 3 writes the planted fault that drops the lane effects. [@I15]
    T22  value only on change: a placement receives equal confirmed data twice and an optimistic change; value fires 
         once. No test for resources yet; phase 3 writes this test and its planted fault. [@I25]
    T23  Equal deadlines and step delays: two actors and two nested states arm schedules due at one instant; the 
         firings are separate turns in admission, outermost-state, then declaration order. A Schedule step fired late 
         counts its next delay from the actual firing. No test yet (Q2); phase 3 writes the planted faults.
             [@I32, @I33]
    T24  Verdicts as acts: an accepted, an unhandled, a denied and a refused turn each give one Turn act, and the 
         report stream derived from the acts equals the stream before the change, byte for byte, over every Story run;
             check() on each answers Allowed, Unhandled, Denied, and Denied with InvalidTurn. Wrong runtimes: an 
                 Unhandled
             turn that yields no act; a refusal's Issue reported before its Turn. [@I36, @I18]
    T25  Paused schedules: hold and resume, keyed, overdue, multi-step, lane-only resume, restore re-evaluation; paused 
         time never counts, a restart drops `left`, a `left` timer never moves `dueAt`. No test yet; phase 3 writes the
             planted faults. [@I37, @I38, @I34]
    T26  Props: every memory reader sees props from one snapshot, a props-only turn runs `onProps`, a shrinking prop is 
         repaired by its reaction, and an actor with no use has Schema defaults. No test yet. [@I12]
    T27  Emits and fan-out raises: an emit from each source and never from entry, exit or a refused turn, a mapper 
         defect refusing the turn, no replay; a fan-out raise skips a copy with no handler, is refused by a denying
             copy and does nothing with no copies. No test yet. [@I39, @I14]
