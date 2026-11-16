# UI primitives: merge guide for Q1, Q2, Q3 and Q5 (2026-11-16, proposed)

**Bottom line:** this guide lists every Plan and Spec record that the accepted Q1, Q2, Q3 and Q5 decisions change.
For each record it gives the current text, the proposed replacement and the records that must change with it.
Nothing is merged yet, and every replacement below is proposed. Before any merge, the user should look at three
things:

- the accepted wording choices (§5): W1 to W10 accepted (decisions §9.3), W1 narrowed; no format number in the Plans;
- Q5e's "props from the use that brings it back": settled by R9, a ref on a machine with props is a type error and
  refused at construction (§6);
- five built checks (four test locations and the `busyRefused` fixture Story) that assert the old negative-delay
  rule (§7).

**Read first:** [the decisions log](ui-primitives-decisions-2026-11-16.md) §1, §2, §4 and §9 to §9.4 (§9 wins
where
it revises).

Quotes are exact, with the file's leading indent (and a Spec's `must` label) dropped. Line numbers are as of
2026-11-16. Decision ids: Q1, Q1a, Q2, Q2a–Q2f, G1–G10, Q3, Q3a–Q3e, Q5, Q5a–Q5h, R1–R7 and "batch" (the §9
companion edits).

## 1. What changes, by count

| File                 | Records changed                                          | Count |
| -------------------- | -------------------------------------------------------- | ----- |
| Machines.plan        | O1 (5 places), O2, O3 (5 places), O4, O5 (8), O6, O7, O8, V4, V6, V8, V9 | 12 |
| Runtime.plan         | O3, O4, O5, V4, V5                                       | 5     |
| React.plan           | O2, O3, O4, V2, V3                                       | 5     |
| Testing.plan         | O1, O2                                                   | 2     |
| Inspection.plan      | O1, O4, O6                                               | 3     |
| CommandLine.plan     | O1                                                       | 1     |
| Persistence.plan     | O2, O3, O5                                               | 3     |
| ServerRendering.plan | O3, O4, O5                                               | 3     |
| Diagnostics.plan     | O2                                                       | 1     |
| Turn.spec            | R12, R14–R17, R19, R23, I34, T6, T12; new R27–R30, I37–I39, T25–T27 | 10 + 10 new |
| WriteAhead.spec      | R4                                                       | 1     |
| Restore.spec         | T6                                                       | 1     |
| Codec.spec           | R5                                                       | 1     |
| Compile.spec         | R10, R16                                                 | 2     |
| StaticCli.spec       | R5                                                       | 1     |
| Actors.spec          | R6, R7, R18                                              | 3     |

**No merge:**

- **Q4:** interaction state is a convention (Q4b says "no Plan line").
- **Q6a–c:** services and commit-input ids are already Plan behaviour; the rest is convention.
- **Q7:** cross-tab sync is deferred to `revisit.md`.
- **Q8:** reusable primitives are a docs convention built on existing API.
- **W8:** where a stored value lives is a fixture and docs convention.
- **LazyFeatures, Operations, EntityDomains, FlowState, Package and Pending:** no text depends on props, emits or
  pause. `useOnEmit` takes a handle, and a handle exists only after adoption.

## 2. Plans

### @plan.Machines.O1: definitions, fragments, `.each`, one namespace

From: Q5, Q5c, Q5g, R1, R2; Q3, Q3c; Q1, Q1a, R4; batch (Records).

(a) Current (Machines.plan:25-27):

> A definition requires id, states and events, and may declare `internalEvents`, memory, traits, operations,
> context and persist. persist defaults to false; persist: true on the definition makes the machine's shared
> actors persisted (@plan.Persistence.O2). states is an ordered list of leaf names, single-key compounds

Proposed: the second line becomes "context, `props`, `onProps`, `emits` and persist. persist defaults …". Add a new
paragraph after line 46 (the TwoDefaults paragraph):

> `props` is a record of Schema fields that the outside world sets and the machine only reads. Every prop has a value
> before any use, its Schema's default; how the Schema declares it is the author's choice. Props are never persisted
> or transferred, and only local actors take them (`useActor`, `createActor`, `Story.machine`); a shared actor's
> outside configuration is context or input. `emits` is a record from emit names to Schema field records; {} means
> no payload.

(b) Current (Machines.plan:75-76):

> Nodes may declare on, activities and schedules, and fill each placed fragment in one block (traits under
> traits.name where placed, a subroutine on its state); only the root may declare `onContext`. A definition's

Proposed: "… only the root may declare `onContext` and `onProps`. A definition's".

(c) Current (Machines.plan:82-84 and 89-91):

> A fragment declares id, events, `hostEvents` (raised only by its direct host), `internalEvents` (from its own
> schedules or operation endings), guards (Flow.Guard), callbacks (Flow.Callback), exits (Flow.Exit, subroutines
> only), memory, child traits, operations and, for a subroutine, states and default; ports are required unless

> Each fragment carries an inferred summary (per event: callbacks notified, exits taken, totality; whenAbandoned's
> callbacks; its and its children's write operations and their Effect requirements), part of its type; hosts are
> checked against summaries, never bodies. Fragments may not declare context, `onContext`, send or persist.

Proposed:

- Line 84 becomes "only), memory, emits, child traits, operations and, …".
- Lines 89-91 become:

> Each fragment carries an inferred summary (per event: callbacks notified, exits taken, emits, totality;
> whenAbandoned's callbacks; its and its children's write operations and their Effect requirements), part of its
> type; hosts are checked against summaries, never bodies. Fragments may not declare context, `onContext`, `props`,
> `onProps`, send or persist; a fragment is configured by input and host events.

(d) Current (Machines.plan:97):

> - T.each({ of, max, by? }) places one copy per key of a host memory field.

Proposed: keep the line. Add after the `resetOn` paragraph (line 101):

> A raise into a trait placed with .each reaches every copy live at turn start, in key order. A copy with no handler
> on its active path is skipped with `Unhandled` evidence; a copy whose guards deny refuses the whole turn; with no
> live copies the raise does nothing and is recorded. Keys past `max` are dropped with `listRepair` evidence, never
> refused.

(e) Current (Machines.plan:103-104):

> Trait instance names, operation names, state names and memory keys share one namespace; a collision rejects; key
> and item are reserved memory names in a trait placed with .each.

Proposed:

> Trait instance names, operation names, state names, memory keys, prop names and emit names share one namespace; a
> collision rejects; key and item are reserved memory names in a trait placed with .each.

Knock-on:

- @spec.Compile.R10 (the namespace line) and @spec.Compile.R16 (the data view).
- @plan.Diagnostics.O2 (the reason examples).
- @spec.Turn.R30 (new).

### @plan.Machines.O2: `emit` is a transition part

From: Q3, Q3d, Q5f, R3; batch (Emits).

Current (Machines.plan:152):

> on maps an event name to a token, { target?, guard?, updateMemory?, actions?, raise?, notify? }, or an ordered

Proposed: "{ target?, guard?, updateMemory?, actions?, raise?, notify?, emit? }". Add after line 158:

> `emit: [emits.X(payload)]` tells the actor's listeners something once. Any accepted transition emits: a send, a
> firing, an ending, an `onContext` or `onProps` event. Entry, exit and a refused turn never do. A copy that ends in
> the same turn still delivers. Delivery is @plan.React.O3; emits are never stored, persisted, transferred or
> replayed.

Knock-on: @spec.Turn.R29 (new).

### @plan.Machines.O3: turns

From: R4; G1 (widened in the batch); Q3d, R3; R5; batch (Emits, Records).

(a) Current (Machines.plan:184-187): "Admit (runtime only): a pending reset from the last commit runs first as its
own follow-up turn; otherwise the …". Proposed: add a sentence after line 187:

> A props update is its own turn: it changes only props, then runs `onProps` (@O7).

(b) Current (Machines.plan:194-195):

> after the root the event is Denied (a handler existed) or Unhandled, and nothing of the turn's own changes,
> though an ending admitted at step one keeps its lane effects and counts as delivered.

Proposed: "… keeps its lane effects, counts as delivered and re-checks `keys` and `paused` (@O6)."

(c) Current (Machines.plan:198-200):

> exits, depth first in written order; every selected alternative fixes its target. Before the walk `resetOn` runs
> and changed traits get a new incarnation, or end if absent. If an addressed child has no handler or all its
> alternatives decline, the part refuses the whole turn.

Proposed: add "A raise into a trait placed with .each is the one exception (@O1)."

(d) Current (Machines.plan:211-212 and 214-216):

> Two memory views. Before, the pre-turn snapshot, is read by every guard, every payload mapper (raise, notify,
> exits, whenAbandoned) and every `updateMemory`.

> After, the memory the turn publishes (new incarnations' initial memory, then every patch in expansion order,
> after list repair), is read by work that only starts or times things: commit and lookup selects, member key
> selects, schedule functions, keys, `restartOn`, placement selects and when, and optimistic (captured at start).

Proposed:

- Line 211-212: "… every payload mapper (raise, notify, emit, exits, whenAbandoned) and every `updateMemory`.
  Every reader of memory receives props from the same snapshot."
- Line 216: "selects, schedule functions, keys, `restartOn`, `paused`, placement selects and when, …".

(e) Current (Machines.plan:226-228 and 235-237):

> One invalid action, a failing after-memory select or an invalid duration rejects the whole turn like a
> pre-commit defect: prior state and memory stay, no action runs, and one issue-only snapshot names the code;
> check() reports it as Denied with code InvalidTurn.

> A pre-commit callback defect preserves prior state, memory, context and store truth, starts no work and
> publishes one issue-only snapshot naming the callback and path. It is not retried for that input. This includes
> guards, updates, selects, keys, send payloads, schedules, `restartOn`, placement selects and when predicates.

Proposed:

- "an invalid duration" becomes "an invalid duration (@O5)".
- The list on line 237 becomes "guards, updates, selects, keys, send and emit payloads, schedules, `restartOn`,
  `paused`, placement selects and when predicates."

Knock-on: @spec.Turn.R19 and @spec.Turn.R14.

### @plan.Machines.O4: guards and check read props

From: Q5f, R3.

Current (Machines.plan:249):

> A guard receives { event, state, memory, context, schedules, operations } from the pre-turn snapshot and returns

Proposed: "A guard receives { event, state, memory, props, context, schedules, operations } from the pre-turn
snapshot and returns". check needs no new words: it already answers from the snapshot, which now carries props (O8).

Knock-on: @spec.Turn.R12.

### @plan.Machines.O5: schedules

From: Q2, Q2a–Q2f, G1–G10, R5; batch (Multi-step, Restore, Same turn).

(a) Current (Machines.plan:277-279):

> A node or fragment body declares schedules: { name: { schedule, send, armOn?, disarmOn?, restartOn?, keys? } }.
> schedule is a Duration.Input, an Effect Schedule, or ({ memory, context, now }) => either, reading the after
> memory of its arming turn with that turn's now.

Proposed:

> A node or fragment body declares schedules:
> { name: { schedule, send, armOn?, disarmOn?, restartOn?, keys?, paused? } }. schedule is a Duration.Input, an
> Effect Schedule, or ({ key?, memory, props, context, now }) => either, reading the after memory of its arming turn
> with that turn's now. Every function of a keyed schedule (`schedule`, `paused`, `restartOn`, `send`) receives
> `key`, which is identity only.

(b) Current (Machines.plan:281):

> An invalid duration or schedule rejects the arming turn with the pre-commit defect behavior of @O3. send is this

Proposed:

> A fixed negative duration is a construction error. A computed zero or negative delay counts as zero: due at once,
> fired once on the next turn, never in the arming turn. A computed NaN, infinite or over 2^31 - 1 ms delay rejects
> the arming turn with the pre-commit defect behavior of @O3. send is this

(c) Current (Machines.plan:284-285, end): "Armed schedules expose `dueAt` in the snapshot (@O8)." Proposed: "Armed
schedules expose `{ dueAt }` while running and `{ left }` while paused, never both, and `pausedBy` beside `left`;
`left` is milliseconds on the Runtime Clock (@O8)."

(d) Current (Machines.plan:287-290):

> A schedule without `armOn` starts on entry. armOn: [...] starts it on each accepted listed event, raised ones
> included, accepted anywhere on the active path, restarting it if running; with Flow.entry in the list it also
> starts on entry (its owner's state entered, trait created or reset, never a thaw), otherwise it is idle on
> entry. disarmOn: [events] stops it on each accepted listed event; stopping an idle schedule does nothing.

Proposed: start with "A schedule without `armOn` starts on entry. `armOn` and `disarmOn` list event tokens, `armOn`
also `Flow.entry`." The rest is unchanged.

(e) Current (Machines.plan:292):

> Exit stops any schedule. An event in both lists, or `armOn` with `restartOn`, is a construction error. Every

Proposed: "Exit stops any schedule. An event in both lists is a construction error; only `armOn: [Flow.entry]` may sit
beside `restartOn`, and any other `armOn` with `restartOn` is a construction error; a turn that does both arms once,
from step one. Every".

(f) Current (Machines.plan:301-302):

> restartOn({ memory, context }) establishes a silent baseline from the activating turn's after memory and leaves
> the schedule idle on entry. After each committed turn, a changed selection under Equal.equals restarts only that

Proposed: "restartOn({ key?, memory, props, context }) … and leaves the schedule idle on entry unless `armOn` lists
Flow.entry. After each committed turn, a changed selection … restarts only that". Add at the end of the paragraph:
"Restarting drops any time left."

(g) New paragraph after line 304:

> `paused: { Reason: ({ key?, memory, props, context, operations }) => boolean }` names each reason; any true pauses
> the timer; the snapshot shows `pausedBy`, the active reason names in declaration order, beside `left`. A turn runs
> keys, then `restartOn`, then `paused`, after each committed turn. Every lane change, including a denied or
> unhandled ending's admission,
> re-checks `keys` and `paused`. True holds the time left of the current delay (`left = dueAt - now`, at least 0);
> false resumes from it (`dueAt = now + left`). Paused time never counts toward a delay; an unused actor, a frozen
> trait and a closed page still count. Arming or restarting while paused holds the full delay. A pause right after a
> firing holds the next step's full delay. A multi-step Schedule pauses inside its current delay, and its `attempt`
> does not advance. `disarmOn`, exit or a key leaving removes a paused timer; nothing fires later.

(h) Current (Machines.plan:309-311):

> evaluated per key, ({ key, memory }) => value; `armOn` on a keyed schedule is a construction error.
>
> Per-key timers persist by key with `dueAt`, and on restore the restored memory's keys win.

Proposed: "({ key, memory, props }) => value", and "Per-key timers persist by key with `dueAt` or `left`, …".

(i) Current (Machines.plan:316-320):

> On restore, resume, a return after an end, or a use returning to an actor whose schedules waited, a Duration
> preserves its deadline and fires once if overdue, waiting deadlines in deadline order; a multi-step Schedule
> restarts at step one. A resumable trait's schedules keep `dueAt` while frozen and fire once on return if
> overdue. Restored `restartOn` baselines are silent. Hydration activation is @plan.ServerRendering.O5;
> deterministic time is @plan.Testing.O2.

Proposed:

> On restore, resume, a return after an end, or a use returning to an actor whose schedules waited, a Duration
> preserves its deadline and fires once if overdue, waiting deadlines in deadline order; a paused timer keeps its
> `left`. A multi-step Schedule restarts at step one; a paused one first finishes its `left`. The host steps a
> Schedule and hands the core the next delay as data. A resumable trait's schedules keep `dueAt` or `left` while
> frozen and fire once on return if overdue. Restored `restartOn` baselines are silent, and `keys` and `paused` are
> re-evaluated silently on restore, hydration and return. Hydration activation is @plan.ServerRendering.O5;
> deterministic time is @plan.Testing.O2.

Knock-on:

- @spec.Turn.R14, R15, R16 and R17, plus the new R27.
- @plan.Persistence.O2 and O3, @spec.WriteAhead.R4.
- @plan.ServerRendering.O5.
- @plan.Testing.O2.

### @plan.Machines.O6: lane-only changes

From: G1, batch (G1 widened).

Current (Machines.plan:344-345):

> Lane-only changes publish captured lanes without running handlers, guards, updates, actions, schedules,
> `restartOn` or `onContext`. Finite work starts only from an accepted transition's actions; operation action

Proposed:

> Lane-only changes publish captured lanes without running handlers, guards, updates, actions, schedule functions,
> `restartOn`, `onContext` or `onProps`, except that every lane change re-checks `keys` and `paused` (@O5); a defect
> there publishes one issue and keeps the previous values, and the lane change still publishes. Finite work starts
> only from an accepted transition's actions; operation action

Knock-on: @spec.Turn.R19.

### @plan.Machines.O7: `onProps`

From: Q5 D, batch (Records).

Current (Machines.plan:365):

> A change in context can raise an event into an actor, and a reaction never changes state directly.

Proposed: "A change in context or props can raise an event into an actor, and a reaction never changes state
directly." Add a final paragraph:

> Machine-level onProps: [{ select, when?, event }] is shaped like onContext, with select({ props, memory }). A props
> update is its own turn that changes only props; onProps then runs, so a reaction can repair memory against
> shrinking props. Its baseline is silent at admission; equal selections under Equal.equals are silent; defects
> behave as for onContext; its events queue in the one FIFO mailbox.

Add to the same record, after the `onProps` paragraph: "Props reuse context's delivery; only the source differs: the
owner at the call site, never saved." (R8)

### @plan.Machines.O8: the snapshot

From: Q5, R3; Q2c, G9.

Current (Machines.plan:380-381): "A snapshot is deeply frozen plain data showing state, memory, context, issues,
lifecycle, schedules / and operations." Current (Machines.plan:387): "… schedules (armed schedules with dueAt, keyed
schedules as keyed lists) …".

Proposed:

- The summary line becomes "showing state, memory, props, context, issues, lifecycle, schedules and operations."
- Line 383 gains "props (current values)," after memory.
- The schedules clause becomes "schedules (armed schedules with `{ dueAt }` or `{ left }`, never both, and `pausedBy`
  beside `left`; keyed schedules as keyed lists)".

Knock-on: @spec.Turn.R23, @plan.React.O4.

### @plan.Machines verification

Current (Machines.plan:408-409, 411-412, 415, 416): V4, V6, V8, V9 as written. Proposed additions:

- **V4** adds "props in every memory reader, emit sources and an emit mapper's pre-commit defect, a props-only turn,
  and the .each fan-out raise (skip, deny, no copies)".
- **V6** adds "armOn tokens, `armOn: [Flow.entry]` beside restartOn, per-key durations, paused (hold, resume, keyed,
  overdue,
  multi-step, lane-only resume, restore re-evaluation) and a computed negative delay".
- **V8** adds "onProps baselines and memory repair".
- **V9** adds "props and `{ left }` in frozen snapshots".

### @plan.Runtime.O3: local actors take props; emit listeners are not uses

From: R1, R2; Q3e; batch (Emits).

Current (Runtime.plan:105-106):

> A failed admission leaves nothing behind, so a later ensure may retry. runtime.createActor(machine, { input })
> always creates a new local actor that cannot persist or be a send target and lives until disposed.

Proposed:

> A failed admission leaves nothing behind, so a later ensure may retry. runtime.createActor(machine, { input,
> props }) always creates a new local actor that cannot persist or be a send target and lives until disposed. Only
> local actors take props; ensureActor and actorRef take none. `actorRef` on a machine that declares props is a type
> error and InvalidConfiguration at construction (R9).

Add: "Local handles also expose `setProps(partial)`, and `createActor(machine, { input, props })` takes props; shared
handles have none." (R10)

Current (Runtime.plan:108): "Handles expose send, `getSnapshot` and snapshots; a handle follows the identity, not the
incarnation." Proposed: "Handles expose send, `getSnapshot`, snapshots and `onEmit(handlers)`; …".

Current (Runtime.plan:116): "lookups, views and sends are not uses." Proposed: "lookups, views, sends, `onEmit` and
`useOnEmit` are not uses."

Knock-on: @spec.Actors.R6 and R7.

### @plan.Runtime.O4: props updates in the mailbox

From: Q5d; batch (Records).

Current (Runtime.plan:177-178):

> Each actor processes events one at a time; its mailbox is FIFO in admission order, and user sends, call endings,
> stream deliveries, timer firings and `onContext` events queue together. A call's ending is queued at settlement

Proposed: "… stream deliveries, timer firings, `onContext` events and props updates queue together. …".

Current (Runtime.plan:198): "Endings, schedule firings and context updates are never dropped: …". Proposed:
"Endings, schedule firings, context updates and props updates are never dropped: …". Add: "Before attach, a local
actor holds one replaceable pending props update, outside the send and mailbox bounds, never dropped." (W4)

### @plan.Runtime.O5: FIFO place

Current (Runtime.plan:271):

> A context update keeps its place in the FIFO queue; later events never overtake it.

Proposed: "A context or props update keeps its place in the FIFO queue; later events never overtake it."

### @plan.Runtime verification

- **V4** (Runtime.plan:361) adds "props passed to ensureActor, actorRef or useActorByRef are a type error".
- **V5** (Runtime.plan:369) adds "props updates in FIFO order, never dropped".

### @plan.React.O2: hooks and props

From: R1, R2, Q5d.

Current (React.plan:29-32):

> useActor(machine, options?) returns a local actor handle for the component incarnation: fresh memory and state,
> with the write lanes of its local identity (machine, input by Equal.equals) adopted, so a remounted or revealed
> local actor with the same input receives its predecessor's lanes. useActorByRef(ref, options) ensures a shared
> actor and returns a handle for a non-null ref; any options object, including {}, selects ensure.

Proposed: "useActor(machine, { input?, props? }) returns …" (rest unchanged) and add "useActorByRef takes no props; a
props option is a type error."

Current (React.plan:41-44): "Before attachment, ensure returns a stable handle with a pure snapshot: default states,
the memory built from / the Flow.input fields, constant Flow.initial values and computed initials, available passive
provider context, …". Proposed: after "computed initials," insert "this render's props (Schema defaults for those
not given),".

Current (React.plan:58): "Local input is read once; changing local machine or input / requires a keyed remount and
emits a development diagnostic." Proposed: insert after "Local input is read once;": "props are read on every render;
a changed value under Equal.equals queues one props update from a layout effect, in FIFO order with sends;". Add after
it:
"`setProps(partial)` merges;
`useActor` passes its whole props each render, so an omitted field returns to its default (W5). Before attach, one
replaceable pending props update, outside the send and mailbox bounds, never dropped (W4)."

### @plan.React.O3: emit delivery

From: Q3a (as reworded by R6), Q3c, Q3e; batch (Emits).

Current (React.plan:75-77):

> A snapshots subscription completes when its subscriber stops or after the terminal snapshot of `disposeActor`,
> forget or Runtime disposal. Subscribers hear one notify per task: the first slice end in a task notifies, and
> later ones in that task coalesce into one in the next task.

Proposed: keep it, and add after it:

> useOnEmit(actor, handlers) and actor.onEmit(handlers) take a typed record of handlers; the hook calls the latest
> render's handler. Emits queue per listener in turn order. In React they are delivered after the commit of the
> first render whose snapshot is at or after their turn, and queued emits flush in order; a discarded render
> delivers nothing. Outside React they are delivered after their turn publishes, in order. An emit is never stored,
> persisted, transferred or replayed, and is dropped when nobody listens or in server rendering. A fragment's emits
> are heard under its instance name, useOnEmit(filters, { search: { Focus } }); an .each copy's handler receives its
> key. Listening is not a use (@plan.Runtime.O3).

### @plan.React.O4: selectors see props

Current (React.plan:102):

> Selectors read frozen state, memory (Flow.private fields omitted from the view types), context, issues,

Proposed: "Selectors read frozen state, memory (…), props, context, issues,". Line 106: "keeps its last state, memory,
props and context".

### @plan.React verification

- **V2** (React.plan:127) adds "render-time props in the pre-attach snapshot".
- **V3** (React.plan:129) adds "props updates in FIFO order; emits delivered after the committing render, never from a
  discarded one, flushed in order".

### @plan.Testing.O1: Story options, steps and records

From: R1, R2; batch (Records); Q3.

Current (Testing.plan:13-14):

> Story.machine(machine, { id, input?, context?, fixtures?, world?, seed? }) tests one fresh actor; input and
> context are required exactly when declared and have their declared types.

Proposed: "{ id, input?, context?, props?, fixtures?, world?, seed? } … have their declared types; props are optional
and start from their defaults."

Steps (Testing.plan:35): "machine Stories `setContext`, dispose() and ensure()" becomes "machine Stories `setContext`,
`props(values)`, dispose() and ensure()". App Stories get no props step, because shared actors take none.

Current (Testing.plan:58-60) is the setContext paragraph. Add after it:

> Focused props(values) sets the actor's props as a production props update: a changed value is its own turn that
> runs `onProps`, and an equal value is silent. `props(partial)` calls `setProps`, which merges.

Same record, in the paragraph on Story options: "`setProps(partial)` merges; `useActor` passes its whole props each
render, so an omitted field returns to its default; the Story `props(...)` step calls `setProps`." (W5, R10)

Current (Testing.plan:40):

> In a fragment Story, notifications (whenAbandoned's included) are callback records and exits are exit records,

Proposed: append "; in every Story, an accepted turn's emits are emit records, in turn order, heard or not."

### @plan.Testing.O2: advance and paused timers

From: G10; batch (Same turn).

Current (Testing.plan:95-98):

> advance(d) moves time to now plus a finite nonnegative Duration.Input, stopping and settling at every deadline
> on the way, at most 100,000 deadlines (StoryTurnLimit with reason Advance). advance({ next: address }) moves to
> the earliest unfrozen deadline the address matches (NoDeadline if none); advance({ to }) to an epoch millisecond
> at or after now; advance(d, { suspended }) models a page in the background, firing the tab's overdue timers.

Proposed:

- "the earliest unfrozen, unpaused deadline the address matches (NoDeadline if none)".
- Append: "advance(d) and advance({ to }) never fire a paused timer, and paused time never counts."
- Add: "Schedule records carry pause and resume with their reason names." (R13; also Testing O1's records)

### @plan.Inspection.O1: the Model

From: Q3c, Q5, R3; G10.

Current (Inspection.plan:24-27):

> The Model lists the app and entries (eager or lazy), each machine's schemas, states, transitions, guards with
> their possible deny codes, actions (each naming the operation it commits or reads), schedules, placements,
> outcome edges, context reads and persistence opt-ins; fragments, .each copies, fused transitions and contract
> summaries (fragment operations included) under their instance names; every operation with its contract, verb,

Proposed: "each machine's schemas (props and emits included), …, schedules (with keys and `restartOn`
declared, and each pause reason by name), …; … contract summaries (fragment operations and emits included) …".

Line 39 ("per actor its state, revision, mailbox depth, / schedules,"): proposed "per actor its state, props,
revision, mailbox depth, schedules (running with dueAt, paused with left and `pausedBy`),".

### @plan.Inspection.O4: event kinds

From: batch (Records); G10.

Current (Inspection.plan:119-120): "Event kinds cover machines (turn, …; lifecycle; life, …; admission; send;
schedule; context; callback; exit; listRepair; drop; issue; / diagnostic)". Proposed:

- "schedule" becomes "schedule (arm, fire, restart, pause, resume, disarm; pause and resume carry their reason
  names)".
- Insert "emit (name, payload, instance and copy key)" after "callback".
- A props update is a turn with cause props, not a new kind.

Current (Inspection.plan:128): "A Story's records take 21 kinds in one list." Proposed: add `emit`; the count is an
open choice (§5, W8).

Knock-on: Inspection V5 (one Story per kind) gains emit, pause and resume.

### @plan.Inspection.O6: renderers

Current (Inspection.plan:185-186): "Text prints each machine's states, / transitions, guards with deny codes, outcome
edges, schedules and sends". Proposed: "… outcome edges, schedules, emits and sends".

Current (Inspection.plan:193): "The sections are a closed list of normalized events by kind: transitions, sends,
schedules, lifecycle, resources". Proposed: "transitions, sends, emits, schedules (with pause and resume),
lifecycle, resources".

### @plan.CommandLine.O1: graph and explain

From: Q3; G10; batch (`flow explain`).

Current (CommandLine.plan:33-34): "fillings, schedule triggers and `whenAbandoned` / callbacks are edges; what data
cannot say is listed as unseen". Proposed: "fillings, schedule triggers, `emit` parts and `whenAbandoned` callbacks
are edges; …".

Current (CommandLine.plan:38-39): "each schedule's path to a / write," Proposed: "each schedule's path to a write and
whether it declares `keys` and `restartOn`; explain lists each schedule's pause reasons by name (S2, §9)".

### @plan.Persistence.O2: what survives reload

From: Q2c, G9; batch (Saved format, Restore); Q5e as revised by R1.

Current (Persistence.plan:52):

> - schedule deadlines (keyed schedules' per-key timers by key with `dueAt`),

Proposed:

> - schedule timers, each `{ dueAt }` while running or `{ left }` while paused (keyed schedules' per-key timers by
>   key),

Add after line 63: "On restore, `keys` and `paused` are re-evaluated silently, like `restartOn` baselines."

### @plan.Persistence.O3: record format

From: batch (Saved format).

Current (Persistence.plan:126-127):

> back to the last good capture when necessary. Older writes never replace newer committed state. Every actor and
> lane record carries Flow's record format (1 to 4).

Proposed: "… carries Flow's record format. The paused-timer record (`{ name, key?, left }`) is a new format step; an
older record's timers read as `dueAt` through the pure step (@O5)." See §6 for the "1 to 4".

### @plan.Persistence.O5: versions exclude props

From: Q5e, R1.

Current (Persistence.plan:228-230):

> **Versions.** An actor's identity version and each operation key's fingerprint compare every field's type side
> (checks by representation) and encoded side, ignoring other annotations, under Flow's format-tagged encodings
> (@plan.Runtime.O3). A saved actor record of another identity version is an old-version record: listed at `ready`

Proposed: insert after "(@plan.Runtime.O3).": "Props and emits are in no saved shape or version: they are never
saved."

### @plan.ServerRendering.O3: transfer list and shape digest

From: Q2c; batch (Hydration); R1.

Current (ServerRendering.plan:52-55):

> Transfer actor state and memory, each placement with the entry version it last mapped, confirmed resource and
> entity data, loaded pages and `hasMore`, entity staleness, each latest stream row's last and baseline, the
> stream partition (its bookmark), and remaining schedule delays with `restartOn` baselines. Write lanes are never
> hydrated; only resource entries are.

Proposed: "… and remaining schedule delays (a paused timer's `left` unchanged) with `restartOn` baselines. Props and
emits never transfer. Write lanes …".

Current (ServerRendering.plan:59): "each stream position field's Schema, and lazy entry ids; it excludes deny codes
and lazy code, so client and". Proposed: "… it excludes deny codes, props and emits Schemas, and lazy code, …"
(open choice W6).

### @plan.ServerRendering.O4: no emits in server rendering

Current (ServerRendering.plan:115-116):

> Rendering, including a discarded render, changes no store and starts no work, subscriptions, schedules,
> persistence writes or evidence. Hydrated actors obey admission under @plan.Runtime.O3 and @plan.Runtime.O5;

Proposed: "… persistence writes or evidence, and delivers no emit. Hydrated actors …".

### @plan.ServerRendering.O5: activation

Current (ServerRendering.plan:150-152):

> Streams open new sessions; client rows start Connecting, and a latest row shows its transferred last. Schedules
> subtract the same nonnegative elapsed time from their remaining delay; an overdue schedule fires once at
> activation, never in a burst or merely because its baseline was restored.

Proposed: "… Running schedules subtract the same nonnegative elapsed time from their remaining delay, and a paused one
keeps its `left`; an overdue schedule fires once …; `keys` and `paused` are re-evaluated silently at activation."

### @plan.Diagnostics.O2: reasons, no new code

From: Q5g, R1, R5.

Current (Diagnostics.plan:60-62):

> - InvalidConfiguration (@plan.Machines.O1, @plan.Runtime.O1, @plan.Operations.O1, @plan.LazyFeatures.O2,
>   @plan.Package.O3, @plan.EntityDomains.O1): fix the declaration named by path; details.reason names the rule,
>   such as a duplicate id or an undeclared patch entity.

Proposed: "… such as a duplicate id, a prop or emit name that collides in the one namespace, a fixed delay out of
range (DelayOutOfRange) or an undeclared patch entity." `ConflictingProps` is not added (R1 dropped it). Add:
"`actorRef` on a machine that declares props is a type error and InvalidConfiguration at construction." (R9)

## 3. Specs

### @spec.Turn.R12: guards

Current (Turn.spec:70): "A guard receives { event, state, memory, context, schedules, operations } from the".
Proposed: "{ event, state, memory, props, context, schedules, operations }".

### @spec.Turn.R14: schedule arming

From: Q2a, Q2b, R5; batch (Same turn).

Current (Turn.spec:91-100):

> A schedule without `armOn` starts on entry. `armOn` starts it on each accepted
> listed event, restarting it if running, and with Flow.entry also on entry.
> `disarmOn` stops it; stopping an idle schedule does nothing. Exit stops any
> schedule. An event in both lists, `armOn` with `restartOn`, or `armOn` on a keyed
> schedule is a construction error. A fixed delay outside 0 to 2^31 - 1 ms is a
> construction error (InvalidConfiguration, details.reason DelayOutOfRange); a computed
> one outside it, negative or not finite refuses the turn. At creation, where no turn
> can be refused, that schedule alone stays unarmed with an InvalidTurn issue and the
> others arm.

Proposed:

> A schedule without `armOn` starts on entry. `armOn` and `disarmOn` list event tokens,
> `armOn` also Flow.entry. `armOn` starts it on each accepted listed event, restarting it
> if running, and with Flow.entry also on entry. `disarmOn` stops it; stopping an idle
> schedule does nothing. Exit stops any schedule. Only `armOn: [Flow.entry]` may sit
> beside `restartOn`; a turn that does both arms once, from step one. An event in both
> lists, any other `armOn` with `restartOn`, or `armOn` on a keyed schedule, is a
> construction error. A fixed delay outside 0 to 2^31 - 1 ms is a construction error
> (InvalidConfiguration, details.reason DelayOutOfRange). A computed negative delay
> counts as zero: due at once, fired once on the next turn. A computed delay that is
> NaN, infinite or over 2^31 - 1 ms refuses the turn. At creation, where no turn can be
> refused, that schedule alone stays unarmed with an InvalidTurn issue and the others
> arm.

### @spec.Turn.R15: schedule firing

Current (Turn.spec:112-113): "… An overdue step fires once, / and the next delay starts at the actual firing."
Proposed: append "The host steps a multi-step Schedule and hands the core the next delay as data; a pause right after
a firing holds the next step's full delay."

### @spec.Turn.R16: restartOn and keyed schedules

Current (Turn.spec:117-120):

> `restartOn` sets a silent baseline from the activating turn's after memory and
> leaves the schedule idle. After each committed turn a changed selection under
> Equal.equals restarts only that schedule from its first step; equal values do
> nothing.

Proposed: "… leaves the schedule idle unless `armOn` lists Flow.entry. … restarts only that schedule from its first
step, dropping any `left`; …". Lines 124-127 gain a bullet: "`schedule`, `paused`, `restartOn` and `send` receive
`key`; a turn runs keys, then `restartOn`, then `paused`."

Current (Turn.spec:129-130): "Per-key timers persist by key with `dueAt`, and on restore the restored memory's /
keys win." Proposed: "… with `dueAt` or `left`, …".

### @spec.Turn.R17: schedules and use

Current (Turn.spec:140-143):

> On restore, resume or a returning use, a Duration keeps its deadline and fires once
> if overdue, waiting deadlines in deadline order; a multi-step Schedule restarts at
> step one. A resumable trait's schedules keep `dueAt` while frozen and fire once on
> return if overdue. Restored baselines are silent.

Proposed:

> On restore, resume or a returning use, a Duration keeps its deadline and fires once
> if overdue, waiting deadlines in deadline order; a paused timer keeps its `left`. A
> multi-step Schedule restarts at step one; a paused one first finishes its `left`. A
> resumable trait's schedules keep `dueAt` or `left` while frozen and fire once on
> return if overdue. Restored baselines are silent, and `keys` and `paused` are
> re-evaluated silently on restore, hydration and return.

### @spec.Turn.R19: lane-only changes

Current (Turn.spec:159-161): "Lane-only changes publish / captured lanes without running handlers, guards, updates,
actions, schedules, / restartOn or onContext." Proposed: "… schedule functions, restartOn, onContext or onProps,
except that every lane change, a denied or unhandled ending's admission included, re-checks `keys` and `paused`; a
defect there publishes one issue and keeps the previous values, and the lane change still publishes."

### @spec.Turn.R23: snapshot shape

Current (Turn.spec:201): "A snapshot exposes state, memory, context, issues, lifecycle, schedules and". Proposed:
"A snapshot exposes state, memory, props, context, issues, lifecycle, schedules and operations; a timer shows
`{ dueAt }` while running or `{ left }` while paused, never both, in Runtime Clock milliseconds, and `pausedBy`
beside `left`."

### New @spec.Turn.R27–R30 (after R26)

- **R27 Pause** (source @plan.Machines.O5): the text of Machines O5 (g), in Spec wording: `paused: { Reason: ({ key?,
  memory, props, context, operations }) => boolean }` names each reason; any true pauses the timer; the snapshot shows
  `pausedBy`, the active reason names in declaration order, beside `left`.
- **R28 Props** (source @plan.Machines.O1, O7): local actors only; Schema defaults before any use; never persisted or
  transferred; a props update is its own turn, then `onProps`; every memory reader receives props from the same
  snapshot; a prop name may not collide in the one namespace.
- **R29 Emits** (source @plan.Machines.O2, @plan.React.O3): sources, mapper reads and pre-commit defect, delivery
  order, never stored or replayed, dropped with no listener and in server rendering, fragment emits in the summary.
- **R30 .each fan-out raise** (source @plan.Machines.O1, O3): the text of Machines O1 (d).

### @spec.Turn invariants and tests

- **I34** (Turn.spec:349-351): append "; a restart drops any `left`".
- **New I37:** a timer holds `dueAt` or `left`, never both; paused time never moves `dueAt`.
- **New I38:** every lane change re-checks `keys` and `paused` and runs no other schedule work.
- **New I39:** an emit is delivered at most once per listener, after its turn, never from a refused turn or a replay.
  (I36 is taken; it lives under `owner Acts`.)
- **T6** (Turn.spec:514): "an out-of-range schedule delay (negative, non-finite or past 2^31 - 1 ms; 0 ms is
  allowed)" becomes "an out-of-range computed schedule delay (non-finite or past 2^31 - 1 ms; zero or negative counts
  as zero)". The planted fault "an unbounded schedule delay" stays; add "a computed negative delay refused".
- **T12** (Turn.spec:535-537): add "`armOn: [Flow.entry]` beside restartOn; key in schedule and paused".
- **New T25** paused schedules, **T26** props, **T27** emits and fan-out raises.

### @spec.WriteAhead.R4: the actor record

Current (WriteAhead.spec:46): "schedule deadlines (keyed timers by key with dueAt), restartOn
baselines, revisions,". Proposed: "schedule timers (`{ name, key?, dueAt }` while running or `{ name, key?, left }`
while paused), restartOn baselines, revisions,". Append to R4: "It holds no props and no emit."

### @spec.Restore.T6 and @spec.Codec.R5: the format step

- **Restore.T6** (Restore.spec:314): "format 1 restores as it was" becomes "an older format restores through the pure
  step, its timers read as `dueAt`; the current format restores as written, a `left` timer included". Add the
  planted fault "an old timer read as `left`".
- **Codec.R5** (Codec.spec:55-57): "today 1 (@spec.WriteAhead.R9); no / migration step is written before a release
  exists" becomes "the current format (@spec.WriteAhead.R9); the paused-timer step is the first migration step
  (@spec.Restore.R5)". Restore.R5 itself (lines 86-87) needs no change.

### @spec.Compile.R10 and R16

- **R10** (Compile.spec:93-94): "Instance names, operation names, state names and memory / keys share one
  namespace" becomes "Instance names, operation names, state names, memory keys, prop names and emit names share one
  namespace". Line 89 "It may not declare context, `onContext`, send or persist" adds `props` and `onProps`.
- **R16** (Compile.spec:144-145): "each memory field with its Schema, / source and privacy, each operation's key
  fields" becomes "each memory field with its Schema, source and privacy, each prop and emit with its Schema, each
  operation's key fields"; "each fragment's kind, events and ports" becomes "kind, events, emits and ports".

### @spec.StaticCli.R5

Current (StaticCli.spec:54-56): "Fillings, schedule triggers and `whenAbandoned` callbacks / are edges". Proposed:
"Fillings, schedule triggers, `emit` parts and `whenAbandoned` callbacks are edges". R6 gains "explain lists each
schedule's pause reasons by name" (S2).

### @spec.Actors.R6, R7, R18

- **R6** (Actors.spec:75): "createActor always creates a new local actor" becomes "createActor, given optional
  props, always creates a new local actor".
- **R7** (Actors.spec:83): "ensureActor alone, getSnapshot, lookups, views and sends are not uses" becomes
  "…, views, sends and emit listeners are not uses".
- **R18** (Actors.spec:232-233): "Baselines are silent at admission, adoption, hydration and a / reload restore" gains
  "; `keys` and `paused` are re-evaluated silently at the same points".

## 4. Ordering: what must land together

1. **Props as one batch.** Machines O1, O3(a), O3(d), O4, O7 and O8; Runtime O3, O4 and O5; React O2 and O4;
   Testing O1; Turn R12, R23 and R28; Actors R6 and R7; Compile R10 and R16; Diagnostics O2. It also takes Runtime O3's
   handle member `setProps`, the R9 construction refusal and CommandLine O5 (`PropWithoutDefault`, the ref check).
   Each cites the others, and a half-merge leaves guards reading a field no snapshot carries.
2. **Emits as one batch.** Machines O1(c), O2 and O3(e); React O3; Runtime O3; Testing O1; Inspection O1, O4 and O6;
   CommandLine O1; ServerRendering O4; Turn R29; StaticCli R5, R6, R10 and R11; CommandLine O5 (an undeclared emit,
   `UnusedEmit`).
3. **Pause and the saved format together.** Machines O5, O6 and O8; Turn R14–R19 and R27; Persistence O2, O3 and
   O5; WriteAhead R4; Restore T6; Codec R5; ServerRendering O3 and O5; Testing O2; Actors R18. G9's `{ left }` needs
   the record format and the transfer rule in the same merge.
4. **Fan-out alone.** Machines O1(d) and O3(c), and Turn R30. It also takes CommandLine O1 and O5
   (`FanOutNeverHandled`).
5. **Negative delay, a small batch.** Machines O5(b), Turn R14 and Turn T6, and CommandLine O5 (a fixed negative
   delay). It lands with batch 3, or alone if T57 needs it sooner.

## 5. Open wording choices (for the user)

- **W1. `armOn` beside `restartOn`.** Q2b names `armOn: [Flow.entry]`. Pick: only Flow.entry (decisions §9.3); any
  other `armOn` with `restartOn` stays a construction error.
- **W2. `flow explain` and `paused`.** The Plans give explain no read analysis of closures (CommandLine.plan:52-54,
  "read each machine's compiled data view"). Pick: explain lists each schedule's pause reasons by name (S2); drop
  "what paused reads" from G10.
- **W3. "Continues from step one".** For a paused multi-step Schedule restored with `left`, pick: it fires when
  `left` runs out, and the next delay comes from step one.
- **W4. A props update before attach.** Pick: one replaceable pending update, outside the 64-send buffer and the
  1,024 mailbox bound, never dropped.
- **W5. `props` option shape.** Pick: partial, so a missing prop takes its default. `setProps(partial)` merges;
  `useActor` passes its whole props each render, so an omitted field returns to its default; the Story `props(...)`
  step calls `setProps`.
- **W6. Server rendering shape digest.** Pick: it excludes props and emits Schemas, because neither is transferred.
- **W7. Record format number.** Pick: name no number in the Plans; the code holds it (see §6).
- **W8. Inspection's "21 kinds".** Pick: add `emit`; pause and resume are phases of "schedule". Recount against the
  code at merge time.
- **W9. Turn.spec ids.** Pick: new R27–R30, I37–I39 and T25–T27 in Turn.spec, not a new Schedules Spec.
- **W10. `paused` inputs.** Pick: `{ key?, memory, props, context, operations }`, matching §1.3 plus R3.

## 6. Contradictions found

- **Q5e is stale, settled by R9.** It says "a restored or hydrated actor gets props from the use that brings it
  back". By R1 only local actors take props, and local actors never persist or transfer (Persistence.plan:45), so no
  restored actor ever has props. R2 (Schema defaults) is the working rule. A ref on a machine with props is a type
  error and refused at construction, so no shared machine has props.
- **The record format number is already inconsistent.** Persistence.plan:127 says "(1 to 4)", while Codec.spec:56
  and the code (`src/core/record.ts:20`, `FORMAT = 1`) say 1. W7 avoids repeating either.
- **Q2f and R5 split the negative delay.** §1.5's Q2f says "a zero or negative delay counts as zero"; R5 keeps a
  fixed negative as a construction error. This guide follows R5.
- **§1.2's "one copy's refusal refuses the whole turn"** is replaced by R4. Only a guard denial refuses.
- **Decisions §1.3.4** cites `autosave.trait.ts:65` as an `armOn` example; that line is `disarmOn` (`armOn` is at
  :64). §1.6's line numbers drifted (`definition.ts:278`, `:280`).

## 7. Build gaps, routed (proposed; Tasks are not edited)

Each line: the gap, where it is, the decision, then the proposed owner.

- **@task.V3.T57** (schedules, `.each`):
  - a computed negative delay refuses (`src/core/turn.ts:271`; R5);
  - tests and a fixture assert that refusal (`tests/turn/refusal.test.ts:16`,
    `tests/write-lanes/ending-delivery.test.ts:18-24`, `fixtures/pay/stories.ts:33` with retry -1; R5); refuse with
    NaN or an over-range delay instead;
  - `armOn` drops non-strings and reads them as Flow.entry (`src/compile-body.ts:236-259`; Q2a);
  - no `restartOn`, `disarmOn`, keyed schedules, Effect Schedules or `paused` (`src/definition.ts:277-282`; Q2);
  - the `schedule` function returns only a number and gets no `key` or props (`src/definition.ts:278`,
    `src/core/compiled.ts:115`; Q2, R3);
  - timers are keyed by schedule name, with no key and no `left` (`src/core/incarnations.ts:36-50`; Q2c);
  - no `.each` or fan-out raise (nothing in `src`; R4);
  - no pause or resume evidence (`src/core/evidence.ts:67`; G10).
- **@task.V3.T56** (record migration): the saved deadline is `{ name, dueAt, send }` at format 1 with no step
  (`src/core/vocabulary.ts:52-56`, `src/core/record.ts:20`; batch).
- **@task.V3.T76 (props) and @task.V3.T77 (emits)**: no props, `onProps`, emits, `emit` or `onEmit` anywhere in
  `src`; `GuardInput` has no props (`src/core/compiled.ts:23-27`; Q3, Q5, R3).
- **@task.V3.T49** (inspection): the closed evidence union has no `emit` kind (`src/core/evidence.ts:67`,
  `src/host/trace.ts`; batch).
- **@task.V3.T29** (the rest of Story): no `props` step; `advance` lacks `{ next }` and `{ to }`
  (`src/host/testing/steps.ts:44-57`; G10).
- **@task.V3.T30** (React): `useActor` props and `useOnEmit` (not built; R1, R6).
- **@task.V3.T78 migrates T71's stepper** (T71 is done and never changes); T72's toaster reads `maxVisible` from
  context; the palette keeps `Configure` (R12; W8e, R1).

## 8. Later decisions

R8 to R13 (decisions log §9.1 and §9.2) are folded into the records above; R11 (a write that must survive a reload
belongs to a shared, persisted actor) is a docs convention with no Plan text.

## 9. Static analysis additions (decisions log §9.4, S2–S8)

No user API; these extend the CLI records the guide already touches.

- **@plan.CommandLine.O1 (graph):** extend the edge sentence proposed above to "fillings, schedule triggers (armed by
  event tokens), `emit` parts, `onProps` reactions, a fan-out raise's edge per copy state (handled or skipped) and
  `whenAbandoned` callbacks are edges". **(explain):** add "each schedule's pause reasons by name, each transition's
  emits, and the copy denials that can refuse a fan-out raise". This settles W2.
- **@plan.CommandLine.O1 (story list --coverage):** add "pause reasons never active, emits never produced, and fan-out
  copies never skipped" to the coverage list.
- **@plan.CommandLine.O5 (errors):** add "an emit part naming an undeclared emit; a prop without a default
  (`PropWithoutDefault`, proposed name, found from the Schema's structure); `actorRef` on a machine that declares
  props; a fixed negative delay".
- **@plan.CommandLine.O5 (warnings):** add "`UnusedEmit` (proposed name): an emit no transition emits;
  `FanOutNeverHandled` (proposed name): a fan-out raise whose event no state of the copy handles".
- **@spec.StaticCli.R5, R6, R10, R11:** the same edge, explain, error and warning lines.
- **No Plan text:** S8 (literal factory ids) is in `wiki/conventions/reusable-primitives.md`.


**F3 (the user, 2026-11-16):** the merge lands directly in the Plans and Specs, following §4's batches, done by
another session; Task edits follow the merge.
