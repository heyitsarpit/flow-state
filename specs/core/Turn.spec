spec Turn
status        proposed
basis         A guide, revisable whenever building shows it wrong; each change and its
              reason is recorded in specs/spec-log.md.
              Written from the merged flow plans (proposed); split per spec-split.md there.
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
        must    Exactly one leaf is active. Substates share the actor's memory, context and 
                lifetime. Reaching a leaf with no handlers does not complete or dispose the actor.

    R2  Handler selection
        source  @plan.Machines.O2; @plan.Machines.O3.
        must    The active leaf's handler is tried first, then each ancestor up to the root. At 
                each level the first passing or unguarded alternative wins; if all decline, the 
                next ancestor is tried. With no enabled transition nothing changes and no work 
                starts. After the root the event is Denied when a handler existed, else Unhandled. 
                A child's refusal inside a selected alternative never falls through: it refuses the 
                turn.

    R3  Self, re-entry and order
        source  @plan.Machines.O2.
        must    "self", or an omitted target, changes no state, restarts no work and keeps the
                activation, at the root too. An explicit target re-enters itself if active, as a new
                activation; targeting an active ancestor re-enters it through its defaults.

                Below the unchanged boundary, states exit deepest first and the path to the target
                enters outermost first; work at and above the boundary survives. Parents' activities
                start before children's and stop after them. Defaults reach a leaf in one
                publication with no intermediate work or snapshot.

    R4  Subroutines and history
        source  @plan.Machines.O2.
        must    A subroutine state is entered at its default; it is left by an exit, or abandoned 
                by a transition that exits it. Host events fall through to its ancestors, and an 
                ancestor's "self" does not abandon it. Every exit is filled and leaves the 
                subroutine's state. S.X.history targets X's last active child or its default and 
                restores control only.

    R5  One turn
        source  @plan.Machines.O3.
        must    A turn runs admit, select the source, select the parts, seed and compute, validate, 
                commit. One transition and everything it raises, notifies, exits, resets and leaves 
                is one turn and one publication. A pending reset from the last commit runs first, 
                as its own follow-up turn.

    R6  Fragment incarnations in a turn
        source  @plan.Machines.O3.
        must    Before the walk resetOn runs, and a changed trait gets a new incarnation, or ends 
                if its reset value becomes absent. After the walk each .each field's final list 
                decides membership. whenAbandoned runs for every incarnation the turn ends, fused 
                into that turn. At commit, resetOn is re-evaluated into pending resets.

    R7  Two memory views
        source  @plan.Machines.O3.
        must    Guards, payload mappers and `updateMemory` read the pre-turn snapshot. Commit and
                lookup selects, key selects, schedule functions, keys, `restartOn`, placement
                selects and when, and optimistic read the after memory. `resetOn` and input fillers
                read the before-walk memory.

                Lane reads (operations, get, idle, retryable) in guards, selects and `updateMemory`
                see the pre-turn lanes with the turn's own ending admitted; keys, when, placement
                selects and published rows see the lanes with this turn's members applied. Each
                patch shallow-merges once. Updates, action parameters and send mappers receive one
                now per turn; guards receive no time.

    R8  Rejected turn
        source  @plan.Machines.O3.
        must    An invalid action, a failing after-memory select or an invalid duration rejects the 
                whole turn: prior state and memory stay, no action runs, and one issue-only 
                snapshot names the code. A value that cannot be encoded never rejects a turn.

    R9  After publication
        source  @plan.Machines.O3.
        must    After publication, exited work releases, entered work starts, then finite actions 
                start. Unhandled and denied events publish nothing of the turn's own, change no 
                revision and start no work. An ending admitted at the turn's first step keeps its 
                lane effects and counts as delivered even when the event is then Denied or 
                Unhandled, and lane-only changes publish captured lanes (@plan.Machines.O6).

    R10  Callback defects
        source  @plan.Machines.O3.
        must    A pre-commit callback defect (guard, update, select, key, send payload, schedule,
                restartOn, placement select, when) preserves prior state, memory, context and store,
                starts no work, publishes one issue-only snapshot naming the callback and path, and
                is not retried for that input.

                A post-commit mapper, placeholder, optimistic-data or write callback defect
                publishes one issue, enqueues no event, applies no partial write batch, and neither
                rolls back nor retries.

    R11  Determinism
        source  @plan.Machines.O3.
        must    The same snapshot, event, Clock and seeded randomness give the same result, without 
                consulting host wall time.

    R12  Guards
        source  @plan.Machines.O4.
        must    A guard receives { event, state, memory, context, schedules, operations } from the 
                pre-turn snapshot and returns true or deny(code, context?). false is a type error; 
                any other invalid return is a guard defect. A guard array passes only when all 
                pass; a state token in it passes when the pre-turn state is at or below it. An 
                operation's idle and retryable are guards over its lanes, under the WriteLanes Spec.

    R13  check
        source  @plan.Machines.O4.
        must    check(snapshot, event) runs selection, parts and validation with no effect: no
                memory update, admission, publication, evidence, mint, queue join, prediction,
                release or work. It returns Allowed when a transition would run; Denied with reasons
                when handlers exist and all decline or the turn would be rejected (InvalidTurn);
                Unhandled when none exists.

                Reasons list each declined alternative, deepest level then authored order; a
                declined state token reads NotInState. Verdicts compare by Equal.equals. An old
                snapshot answers from its own captured values. A defective guard makes check throw
                GuardDefect without publishing an issue.

    R14  Schedule arming
        source  @plan.Machines.O5.
        must    A schedule without `armOn` starts on entry. `armOn` starts it on each accepted
                listed event, restarting it if running, and with Flow.entry also on entry.
                `disarmOn` stops it; stopping an idle schedule does nothing. Exit stops any
                schedule. An event in both lists, `armOn` with `restartOn`, or `armOn` on a keyed
                schedule is a construction error.

                A node with no written handler for an event that an active schedule lists in `armOn`
                or `disarmOn` handles it with an implicit unguarded { target: "self" }, so that
                event is not Unhandled there. A schedule never counts the turn that arms it, and
                descendant changes and "self" keep its deadline.

    R15  Schedule firing
        source  @plan.Machines.O5.
        must    Each arming has an id; a firing from an earlier arming, or from an ended 
                activation, is never delivered. A Duration fires once; a Schedule fires each step 
                until complete. Equal deadlines enqueue by actor admission order, then outermost 
                state, then declaration order, each a separate turn. An overdue step fires once, 
                and the next delay starts at the actual firing.

    R16  restartOn and keyed schedules
        source  @plan.Machines.O5.
        must    `restartOn` sets a silent baseline from the activating turn's after memory and
                leaves the schedule idle. After each committed turn a changed selection under
                Equal.equals restarts only that schedule from its first step; equal values do
                nothing.

                A keyed schedule's keys come from the after memory and after lanes:

                - one timer per key, armed when the key appears, cancelled when it leaves, firing
                once with key;
                - a repeated key keeps its first position with `listRepair` evidence;
                - `restartOn` is evaluated per key.

                Per-key timers persist by key with `dueAt`, and on restore the restored memory's
                keys win.

    R17  Schedules and use
        source  @plan.Machines.O5.
        must    Schedules fire only while their actor is used (Actors Spec). A deadline due while
                unused waits; only the latest arming waits, and re-arming, disarming or exiting
                removes a waiting deadline.

                On restore, resume or a returning use, a Duration keeps its deadline and fires once
                if overdue, waiting deadlines in deadline order; a multi-step Schedule restarts at
                step one. A resumable trait's schedules keep `dueAt` while frozen and fire once on
                return if overdue. Restored baselines are silent.

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
                captured lanes without running handlers, guards, updates, actions, schedules, 
                restartOn or onContext. Finite work starts only from an accepted transition's 
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
                alternative that stays put at the owner state or its ancestors (StaticCli Spec); a
                late ending landing while the owner is not re-entered, at an ancestor whose
                alternatives all leave, is denied at run time, an accepted risk (the runner's
                ruling).

    R22  Context reactions
        source  @plan.Machines.O7.
        must    `onContext` select sets a silent baseline at admission, restore, adoption and
                hydration. Only context waves re-run it; memory-only changes do not. Equal
                selections are silent.

                A changed selection becomes the baseline even if when declines; with no when, or
                when true, its event enqueues after the context turn, in declaration order, in the
                one FIFO mailbox. A select, when or mapper defect publishes one issue, keeps the
                previous baseline and emits nothing. Reactions never change state directly.

    R23  Snapshot shape
        source  @plan.Machines.O8.
        must    A snapshot exposes state, memory, context, issues, lifecycle, schedules and
                operations. A fragment's memory slice sits under its instance name: undefined while
                inactive, present while frozen; .each copies are a keyed list.

                Every list of several things is a keyed list in key order, each entry with key; an
                entry that does not exist is absent, never a default. Outside types omit
                Flow.private fields. It has no input, methods or public revision.

    R24  Snapshot values
        source  @plan.Machines.O8.
        must    Snapshots are deeply frozen plain data. Reading an old snapshot never consults live 
                lanes. Unchanged parts keep identity across publications; Flow-owned containers are 
                copied, opaque application values keep identity.

    R25  Issues by source
        source  @plan.Machines.O8.
        must    A later success or release clears its own source's issue, never another source's. A 
                new incarnation inherits no issue.

open
    Q1  Executable checks are not built.
        outcome  Phase 3 writes each test below as an oracle behind the Port, with its wrong 
                 runtime; until then every Requirement's evidence is open.

    Q2  The prototype has no case for check(), onContext, restartOn, keyed schedules, exit and entry order, or 
        equal-deadline order. outcome Phase 3 writes those cases and their wrong runtimes first.

    Q3  Which Diagnostic code a rejected turn's issue carries is not stated by the plans; InvalidTurn is check()'s 
        denial code, not a Diagnostic code (Diagnostics Spec R4).
        outcome  Phase 4 names it, and this Spec records it as a change.

model
    PreTurn = the snapshot at admission, with the turn's own ending admitted.

    After = the memory the turn publishes: new incarnations' initial memory, then every patch in 
        expansion order, after list repair.

    Activation = one entry of a state, ended by its exit; a re-entry is a new Activation.

    Boundary = for a handler at H targeting T: H if T is a strict descendant of H, otherwise the 
        nearest proper ancestor of T that also contains H.

    Used = the Actors Spec's use relation for the actor.

invariants
    I1  At every publication exactly one leaf is active. [@R1]

    I2  The selected alternative is the first passing one at the deepest level that has one; no level below it has a 
        passing alternative. [@R2]

    I3  A turn whose child part refuses publishes nothing of its own. [@R2, @R5]

    I4  A "self" transition leaves the set of live Activations unchanged. [@R3]

    I5  Every Activation at or above the Boundary is the same before and after the turn; every entered state is a new 
        Activation. [@R3]

    I6  Exits are ordered deepest first and entries outermost first; a parent's activity starts before and stops after 
        each child's. [@R3]

    I7  No snapshot is published whose active state is not a leaf. [@R3, @R5]

    I8  An ancestor's "self" never abandons a subroutine, and a callback never moves the host out of the fragment's 
        placement node. [@R4]

    I9  Each turn publishes at most once, and an accepted transition with all its parts publishes exactly once. [@R5]

    I10  A pending reset runs as a turn of its own before the next admitted event. [@R5, @R6]

    I11  Every incarnation the turn ends has run whenAbandoned in that same turn. [@R6]

    I12  Every read listed for PreTurn returns PreTurn values; every read listed for After returns After values. [@R7]

    I13  All now values passed within one turn are equal. [@R7]

    I14  A rejected or pre-commit-defective turn leaves state, memory, context and store equal to PreTurn and starts no 
         work; it publishes exactly one issue-only snapshot. [@R8, @R10]

    I15  An Unhandled or Denied event changes no state, memory or revision of its own and starts no work; an ending 
         admitted in that turn still applies its lane effects and counts as delivered. [@R9]

    I16  A post-commit defect never undoes the committed state and never applies part of a write batch. [@R10]

    I17  turn(snapshot, event, clock, seed) is a function: equal arguments give equal results. [@R11]

    I18  check(s, e) leaves the Runtime unchanged, and check(s, e) is Allowed exactly when handling e at s would run a 
         transition. [@R13]

    I19  For every guard g: g's result is a function of its captured inputs. [@R12, @R13]

    I20  A delivered firing carries the id of its schedule's latest arming, and its activation is alive. [@R15]

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

    I28  An onContext event is enqueued only after a context wave changed its selection, and the baseline then equals 
         that selection. [@R22]

    I29  A published snapshot is never mutated afterwards. [@R24]

    I30  A part of a snapshot whose content is unchanged is the same object in the next snapshot. [@R24]

    I31  An issue is cleared only by its own source; a new incarnation's first snapshot has no issue. [@R25]

composition
    flow
        Design note, proved by the prototype. The turn is pure and runs on a working copy, so a
        refusal is one assignment and a commit one publication
        (packages/flow-state-v3/prototypes/round-14/turn.ts). It is called by a pure step that
        takes time and ids from its environment and returns the next world, at most one
        publication and commands (round-14/step.ts); only the driver performs effects.

coverage
    @R1
        enforced_by  [@I1]
        open_by      [@Q1]

    @R2
        enforced_by  [@I2, @I3]
        open_by      [@Q1]

    @R3
        enforced_by  [@I4, @I5, @I6, @I7]
        open_by      [@Q1, @Q2]

    @R4
        enforced_by  [@I8]
        open_by      [@Q1]

    @R5
        enforced_by  [@I3, @I7, @I9, @I10]
        open_by      [@Q1]

    @R6
        enforced_by  [@I10, @I11]
        open_by      [@Q1]

    @R7
        enforced_by  [@I12, @I13]
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
        enforced_by  [@I19]
        open_by      [@Q1]

    @R13
        enforced_by  [@I18, @I19]
        open_by      [@Q1, @Q2]

    @R14
        enforced_by  [@I21]
        open_by      [@Q1]

    @R15
        enforced_by  [@I20, @I22]
        open_by      [@Q1, @Q2]

    @R16
        enforced_by  [@I20]
        open_by      [@Q1, @Q2]

    @R17
        enforced_by  [@I22, @I23]
        open_by      [@Q1]

    @R18
        enforced_by  [@I24]
        open_by      [@Q1]

    @R19
        enforced_by  [@I25]
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
        enforced_by  [@I29], snapshot types
        open_by      [@Q1]

    @R24
        enforced_by  [@I29, @I30]
        open_by      [@Q1]

    @R25
        enforced_by  [@I31]
        open_by      [@Q1]

tests
    T1  Self and re-entry: a call started in a state, then "self", then an explicit re-entry of that state; after self 
        the call ends current, after re-entry it ends late. Cases `PAY-07`, `R14-FIX-01`; wrong runtimes 
        `audit-1.r14-reentry-keeps-activation`, `a3.r14-explicit-reentry-keeps-activation`, 
        `a3.r14-reenters-the-parent`. [@I4, @I5]
    T2  Exit and entry order: a three-level tree with an activity per level and a transition across two branches; the 
        recorded stop and start order is deepest-first exits, then outermost-first entries. No prototype case; phase 3 
        writes one with a wrong runtime that enters innermost first. [@I6, @I7]
    T3  Subroutines and history: exit, abandonment, an ancestor's self, history re-entry. Case `FRAG-10`; wrong runtime 
        `1b.r14-history-reentry-keeps-activation` (a history re-entry that keeps the activation). [@I8]
    T4  One publication: a transition that raises into two traits and resets a third publishes exactly one snapshot; a 
        child's refusal publishes none. Case `FRAG-17`. [@I3, @I9]
    T5  Before and after memory: a schedule function and a commit select read the value the turn wrote; a guard and a 
        mapper read the old one. Case `PAY-16`; wrong runtime `pay16.schedule-reads-pre-transition-memory`. [@I12]
    T6  Rejected turns: a zero-length schedule and overlapping keys reject the turn: state unchanged, one issue-only 
        snapshot, and check() answers Denied with InvalidTurn (Q3 names the issue's code). Case `REV4-H4`; wrong 
        runtimes `pinsb.schedule-unbounded`, `pinsa.overlapping-keys-allowed`. An unencodable value does not reject; 
        wrong runtime `pinsb.nan-carried-as-null`. [@I14]
    T7  Callback defects: a throwing guard, select and key each keep the prior snapshot with one issue naming the 
        callback path, and the same input is not retried (case `R12-DEFECT`). A throwing post-commit mapper publishes 
        one issue and no event. [@I14, @I16]
    T8  Determinism: run one reference scenario twice on a controlled clock and seed; the turn records are equal, and a 
        host clock jump between runs changes nothing. [@I13, @I17]
    T9  check agreement: for every (state, event) pair of the reference machines, check's verdict equals what handling 
        does, and a Runtime spy sees no effect from check; a stored old snapshot answers from its captured values. No 
        prototype case. [@I18, @I19]
    T10  Schedules: armOn, disarmOn, exit, a re-armed debounce, a stale firing after re-arming. Cases `REAL-03`, 
         `FRAG-17`, `LIFE-16`; wrong runtimes `pinsa.left-state-schedule-kept`, `life.grace-unfenced`. [@I20, @I21]
    T11  Waiting while unused and overdue: cases `LIFE-14`, `FRAG-18`; wrong runtimes `life.schedule-fires-unused`, 
         `life.waiting-survives-re-arm`, `life.waiting-never-wakes`, `life.waiting-lost-at-end`, 
         `m2.q1-reset-keeps-timers`. [@I22, @I23]
    T12  restartOn and keyed schedules: a changed selection restarts only its schedule; equal values do nothing; a key 
         leaving cancels its timer. No prototype case. [@I20]
    T13  Placements: a key change releases once and opens the new key; a non-key change keeps the session; a throwing 
         select keeps it with one issue. Case `P1-S`; wrong runtimes `p1s.key-not-in-identity`, 
         `p1s.select-throw-releases`. [@I24]
    T14  Owner test: lies `k.late-as-current`, `k.restored-from-root` and `g.late-unhandled` must each fail a named 
         check; lateness: wrong runtime `a2.lateness-transitive`. [@I26]
    T15  LateMayNotLeave: a late exit beside an InFlight head or queued commit is denied; beside a Held head it is 
         allowed. Cases `R14-FIX-01`, `R15-01`; wrong runtimes `misc.late-always-leaves`, `misc.late-leaves-queued`, 
         `audit-1.r15-held-head-is-live`, `audit-1.r15-queue-behind-held-not-live`, and for an active subroutine 
         `audit-1.r15-subroutine-ignored`. [@I27]
    T16  onContext: a provider change wave with an equal selection, a changed one with when declining, and a throwing 
         select. No prototype case. [@I28]
    T17  Snapshots: writing into a published snapshot fails; a later publication reuses unchanged parts by identity. 
         Lies `w.patch-in-place`, `w.row-in-place`; absent entries: wrong runtime `f.absent-is-placed`. [@I29, @I30]
    T18  Issues: two sources raise issues; one source's success clears only its own; a new incarnation starts with 
         none. No prototype wrong runtime. [@I31]
    T19  One leaf and selection: generated event sequences over the reference machines; every snapshot's state is a 
         complete leaf path, and the chosen alternative equals an independent reference model of selection (deepest 
         level first, first passing). No prototype wrong runtime; phase 3 writes one that tries the root first. [@I1, 
         @I2]
    T20  Pending resets and whenAbandoned: a commit changes a trait's reset value; the reset runs as its own turn 
         before the next event; a leave that ends a trait runs whenAbandoned in the leaving turn. Case `FRAG-02`; phase 
         3 writes the wrong runtimes. [@I10, @I11]
    T21  Denied and Unhandled: a lane ending admitted where every alternative declines applies its lane effects, counts 
         as delivered, and changes no state or revision; an unhandled public event publishes nothing. Cases `STORE-04`, 
         `R14-F-01`; phase 3 writes the wrong runtime that drops the lane effects. [@I15]
    T22  value only on change: a placement receives equal confirmed data twice and an optimistic change; value fires 
         once. No prototype case for resources; phase 3 writes this test and its wrong runtime. [@I25]
