# Changes: companion to the Spec

`Changes.spec` holds the contract, the model, the tables and the pseudo-code of the turn walk. This file holds what
does not fit a Spec: a worked example, the problem classes, the principle ledger, the fit to today's code, the seams,
the open questions and holes, and the process notes. The whole is pre-coding analysis, proposed, and revisable
whenever building shows it wrong; changes go to `wiki/specs/specs.log`.

Paths are under `packages/flow-state-v3/` (`src/core/` unless they start with `src/`, `tests/` or `fixtures/`).
Pseudo-code in the Spec is conceptual. Each keyword in a code block below is marked existing, CHANGED, RENAMED, NEW or
user-defined.

## 1. Walkthrough: uploads, a frozen outline, and an emit

An editor holds a list of attachments. Each attachment is one copy of an `Upload` trait. An `Outline` trait lives
while the editor is in `EDITING` and is frozen, not dropped, in `PREVIEW`.

```ts
// existing in the Plan, unbuilt: trait, .each, .resumable, Flow.state, Flow.Callback, raise, notify, emit,
//   whenAbandoned, onEmit            existing: definition, machine, Flow.input, Flow.initial, O.x.commit, O.x.cancel
// user-defined: Upload, Outline, Editor, Attach, CancelAll, Preview, Back, Cancel, Done, onGone, send, autosave,
//   attachments, gone, uploads, outline, EDITING, PREVIEW
const Upload = trait(
  { id: "Upload", events: { Cancel: {} }, emits: { Done: { ref: Schema.String } },
    callbacks: { onGone: Flow.Callback({ ref: Schema.String }) },
    memory: { ref: Flow.input(Schema.String) }, operations: { send: SendFile } },
  ({ callbacks, emits, O }) => ({
    on: { Cancel: { emit: [emits.Done.from(({ memory }) => ({ ref: memory.ref }))],
                    notify: [callbacks.onGone.from(({ memory }) => ({ ref: memory.ref }))] } },
    whenAbandoned: [O.send.cancel],                       // a release: no callback
  }),
);
const Editor = definition({
  id: "Desk/Editor",
  states: { EDITING: Flow.state({ traits: { outline: Outline.resumable() } }), PREVIEW: {} },
  events: { Attach: { ref: Schema.String }, CancelAll: {}, Preview: {}, Back: {} },
  memory: { attachments: Flow.initial(Schema.Array(Schema.Struct({ ref: Schema.String })), []),
            gone: Flow.initial(Schema.Array(Schema.String), []) },
  traits: { uploads: Upload.each({ of: "attachments", by: "ref", max: 10 }) },
});
export const EditorMachine = machine(Editor, ({ S, E }) => ({
  default: S.EDITING,
  on: { Attach: { updateMemory: ({ event, memory }) => ({ attachments: [...memory.attachments, event] }) },
        CancelAll: { raise: [E.uploads.Cancel] } },
  states: { EDITING: { on: { Preview: S.PREVIEW } }, PREVIEW: { on: { Back: S.EDITING } } },
  traits: { uploads: { onGone: { updateMemory: ({ event, memory }) => ({
    attachments: memory.attachments.filter((a) => a.ref !== event.ref), gone: [...memory.gone, event.ref] }) } } },
}));
editor.onEmit({ uploads: { Done: ({ ref }, { key }) => rows.get(key)?.blur() } });
```

What the core does, with copies `r2`, `r1` in list order:

1. **`Attach r3`.** One turn with one part. Its patch changes `attachments`, so `reconcile` runs right after it:
   stored has no `uploads[r3]`, the list wants it, the step is `Start`. The applier mints its id, seeds its memory
   from the item, starts its schedules as a creation and publishes once.
2. **`CancelAll`.** The source raises `Cancel` into `uploads`: one part per live copy, in list order. Each copy's
   part emits `Done` and notifies `onGone`; the host's filling runs once per notify. It is the same alternative at
   the same address each time, so its patches fold: the second run reads the list the first one left. After the
   walk `reconcile` finds no key left in `attachments`: three `End(KeyGone)` steps, inside this turn. `whenAbandoned`
   lists only a release, so each copy's `send` lane is cancelled and no further part runs. The `Turn` holds seven
   parts, three emits and three ends, and publishes once: the published instances are exactly the ones the published
   list wants.
3. **The emits.** They are fields of the `Turn`, so nothing else records them. At the publication that shows the
   turn, the host calls the `uploads.Done` handler three times with each copy's key, after its world is set; a
   handler that throws is reported and stays.
4. **`Preview`.** The move leaves `EDITING`. `outline` is resumable, so the step is `Freeze`, not `End`: its memory
   and timers stay as they are, its alarms are cleared, and its slice stays in the snapshot. No `whenAbandoned` runs.
5. **An autosave write of the outline ends while it is frozen.** The owed row's audience is the subject `outline`,
   whose instance is not live: the row waits. Nothing is dropped and nothing is heard.
6. **`Back`.** `EDITING` has a new activation; a resumable trait's anchor ignores it, so the step is `Thaw`: the
   same instance, the same id. Its schedules hear `Wake` and then `Context`, an overdue `autosave` fires once, and
   the parked row is queued behind the turn.

Every step is a row of the tables in the Spec's `algorithm`, and the incarnation is written only by `apply`.

## 2. Required properties, in user terms

The Spec's R1 to R10 are these ten, in order; each invariant traces to one of them through its requirement.

- P1 One event, one result: an accepted event with everything it raises, notifies, exits, starts and ends shows as
  exactly one publication; a refused, denied or unhandled one changes nothing, and a refusal shows as one issue.
- P2 What is shown matches the facts: live instances are exactly those the published state, lists and reset values
  want; every frozen one is a resumable instance whose place was left and whose reset value has not changed.
- P3 Nothing owed is lost: a write's ending is heard by a live instance of the same subject or waits for one until
  the actor is forgotten; a read's ending is heard by the instance that started it or recorded as evidence.
- P4 Nothing is made up: no handler or timer runs for a frozen or gone instance; an abandoned instance is told
  once, in the turn that ends it, never for an exit or a freeze, and only while its host stays.
- P5 Nothing replays or crosses over: a reload, restore or thaw fires no start, no `whenAbandoned`, no emit; an id is
  never reused; a firing or a read's ending never reaches a later instance.
- P6 Order is the mailbox's: admission order; context and props events first; an emit's handler sees its turn's
  snapshot or a later one.
- P7 A broken callback breaks only its own turn or its own check.
- P8 A props update writes only props, in its place in the mailbox; an equal one is silent.
- P9 Things end in order: consumers before providers, children before hosts.
- P10 An event costs what it touches, not what exists.

## 3. Problem classes

A family is removed when a type or a signature cannot express a member, and handled when one table or one function
settles every member.

- **G1 A second applier.** Creation, the firing's pre-turn write, refusals, nine `publish` sites, spread writers.
  Removed: `Incarnation` carries a brand whose constructor only `apply.ts` holds; every other module returns a
  `Change` or a patch; `why` is a function of the `Change`'s tag.
- **G2 A follow-up kept as a flag.** Pending reset, `unsettled`, `context.owes` beside `Mail.Context`, the start
  path's own enqueue. Removed for instances: `reconcile` runs in the turn until stable. Handled at one point for
  context: `tx.owe` is the only way to queue a context update.
- **G3 Lifecycle written per case.** Three stale-owner checks, actor end apart from instance end, parked endings.
  Handled: the status table and holder table, total, with the root as the instance at `[]`; `locate` is the one
  stale check.
- **G4 One record, several homes.** Emit evidence, `Published`, emit order, listener owner, one memory record, six
  reader literals. Removed for emits: no evidence record but the turn's holds an emit. Handled for readers:
  `readsOf(incarnation, scope, view)` builds every callback's input.
- **G5 A cell of occasion by state never filled.** What each scope's schedules hear; freeze and thaw; props; an
  instance's start; a use returning. Handled: row C5 of the applier maps every `Change` to five occasions per scope.
- **G6 Per-step questions answered by scanning.** Mailbox copies and `shift`, the follow-up chain, the wave's scan,
  `consumersOf`, `dueNow`, `retire`, `pendingOwners`, `owners.cancel`, `chainOf`. Handled: each index is written by the
  function that writes its fact, in the same transition; `indexDrift` rebuilds every one and compares.
- **G7 Two writes in one turn.** A fan-in: several copies notify one host filling; a raise written twice; two copies
  whose leaving moves the state. Handled: the walk's write rule: one site per key and one site as the changer; a site
  reached again reads its own earlier writes.
- **G8 Ids that outlive what they name.** The mint against an instance id; a firing or a read's ending for a copy that
  left and came back; counters that restart. Removed for work: an instance's id is an `ActivationId`, minted at
  `Start`, never saved and never found by address.

Debt, handled one by one: the stored fact behind an event's, an ending's or a reaction's issue stays a map by source
until the issue view derives it; `Values` stays the erased memory type at every scope.

## 4. Principle ledger

- One owner per state, one writer per field: held; `apply` for the incarnation by a brand, `reconcile` decides
  instances, `tx` owns mail.
- Store facts, derive views: held; `why`, awake, `item`, the subject, the grace, `owes` and the issues are derived;
  `outcomes` is the fact behind them.
- Explicit states: held; `Status`, `Change`, `PartCause`, `EndCause`, `Where`; the five `Option`s of `routeOf` no longer
  choose a publisher.
- One decision per subject per occasion: held; one `reconcile` result per round, one `apply` per change.
- Total tables: held; the instances table has nine cells, the trigger table eighteen, the applier sixty-three; each
  "nothing" is named.
- Survives a reload: held; each instance's status, reset value and memory are saved by address; ids, places and
  alarms are re-derived (I14).
- Same rule at every scope: held; the root is the instance at `[]`.
- One equality and one codec per fact: held; a reset value and a key use the canonical text of the declared Schema;
  props use `sameValue`.
- A throw changes only its own check: held; the family rule.
- Simple: traded once; the fold is a rule the Plan did not have; it replaces a refusal that depends on how many
  copies leave.
- Effect at the edges: held; the core adds no Effect; the host keeps one sleep and its Owners.
- Cheap operations over the graph: held, with one stated exception (a chain of dependent ends); the one scan left on
  a hot path is `settling`, over a consumer's own providers.

Checked against the fixtures:

- **number-input:** `lastCommit: { seq, value }` (`fixtures/number-input/machines/stepper.ts`) is an emit kept as a
  counter; `Configure` mirrors props. A hold that repeats emits per turn, and a reload emits nothing.
- **command-palette:** `Configure` stays an event: a shared actor takes no props. `Ran` becomes an emit.
- **home:** `sensors` with a keyed `poll` schedule is the catalog's `Sensor` under `.each`: each copy's schedule is its
  own scope, and "Room raises `Pause` into sensors" is W10.
- **shop:** `Cart.lines`, `wanted` and `errors` by line id are `CartLine` copies; the "clear cart" raise with lines
  that tell the cart is `desk/clear-two`'s shape.
- **sync:** the catalog's `RateLimit` trait pausing `Repo`'s schedules is the notify of the schedules rule.
- **wizard and sign-in:** the hold group and the handle-save group are subroutines; flattening them into the one tree
  keeps `history` targets working (`fixtures/player/machines/player.ts` is the existing use).
- **player:** `Household.pending` drains one room per turn by a self-send: a serial loop, not a fan-out; it stays
  mail, and the loop guard bounds it.
- **session:** eleven counters fed by `onContext` are consumers of one wave each; `consumers` in start order keeps
  their order without a sort.

## 5. Fit to today's code

Each kept function was checked against the new types; callers of each changed or deleted one are listed. Verdicts:
keep, change, rewrite, delete. Use this list to tell which code is redundant or superseded.

Turn area (`src/core/`):

- code:packages/flow-state-v3/src/core/walk.ts#levelsOf, code:packages/flow-state-v3/src/core/turn-arms.ts#disarmedBy
  change: read `Node.chain` and the per-scope indexes.
- code:packages/flow-state-v3/src/core/walk.ts#accept
  rewrite: becomes `visit` and row 7; about 75 lines.
- code:packages/flow-state-v3/src/core/walk.ts#runTurn
  change: the walk; callers `serve.ts` and `turn.test.ts`; the Plan's `check()` is to call it too.
- code:packages/flow-state-v3/src/core/turn-arms.ts#armingsOf
  change: per part scope, for entered states and `armOn` only; the call in `incarnations.ts` goes.
- code:packages/flow-state-v3/src/core/walk.ts#TurnResult, code:packages/flow-state-v3/src/core/turn.ts#TurnInput
  change: `Accepted { turn }`; `props`, `instances`, `at`.
- code:packages/flow-state-v3/src/core/turn.ts#sendOf, code:packages/flow-state-v3/src/core/turn.ts#resolve
  keep: they read the record `readsOf` builds.
- code:packages/flow-state-v3/src/core/serve.ts#turn
  change (head) and delete (accepted branch, about 110 lines: rows C1 to C7 move to `apply.ts`); the head builds the
  trigger and the reads through `readsOf`; each result is a `Change`.
- `packages/flow-state-v3/src/core/serve.ts#raised`, code:packages/flow-state-v3/src/core/serve.ts#refusal
  replaced by the changes `Refused` and `Unturned` that `apply` applies.
- code:packages/flow-state-v3/src/core/serve.ts#routeOf
  keep: its five `Option`s feed the trigger of a `Change`; no publisher reads them.
- code:packages/flow-state-v3/src/core/serve.ts#pendingOwners
  change: computed on the first `owns` call of a late turn.
- code:packages/flow-state-v3/src/core/serve.ts#serveEnding
  change: audience by `locate`; its refusal is `Change.Refused`.
- `packages/flow-state-v3/src/core/serve.ts#deferred`, code:packages/flow-state-v3/src/core/serve.ts#drain,
  code:packages/flow-state-v3/src/core/serve.ts#followUps
  change: peek, not take and put back; a queue with a head index.
- `packages/flow-state-v3/src/core/step.ts#fired`
  rewrite: `tick`; `Input` gains `Props` and `Tick`, `Create` gains `props`, `Fired` goes.

State and mail:

- `tx.ts` mail functions (about lines 355-478): rewrite as the mailbox of the Spec; callers are in `serve.ts`,
  `context.ts`, `ledger.ts`, `incarnations.ts`, `disposal.ts` and `step.ts`.
- code:packages/flow-state-v3/src/core/tx.ts#putIncarnation
  change: takes an `Applied` value; keeps `consumers` in start order; after the change `apply.ts` alone calls it.
- `tx.ts` timers (about lines 312-352): change: the alarm heap and `Command.Wake`.
- code:packages/flow-state-v3/src/core/tx.ts#draft: keep; `mintActivation` also mints instance ids.
- code:packages/flow-state-v3/src/core/incarnations.ts#start
  rewrite: `begin` and `apply(Begin)`; callers `ensure` and `createLocal`.
- `packages/flow-state-v3/src/core/incarnations.ts#setIncarnation`,
  `packages/flow-state-v3/src/core/incarnations.ts#publish`
  delete: row C2 and row C6.
- code:packages/flow-state-v3/src/core/incarnations.ts, code:packages/flow-state-v3/src/core/incarnations.ts#end,
  code:packages/flow-state-v3/src/core/incarnations.ts#dispose
  change: `apply(End)`; `schedules.stopAll` is row C5's drop.
- code:packages/flow-state-v3/src/core/incarnations.ts#graces
  change: a view over the alarms; writes no incarnation.
- `packages/flow-state-v3/src/core/incarnations.ts#fireWaiting`
  change: row C7 of `Use`; its `Mail.Firing` loses `track`.
- code:packages/flow-state-v3/src/core/incarnations.ts#deliver
  change: its `Mail.Event` names the root.
- code:packages/flow-state-v3/src/core/incarnations.ts#ensure,
  code:packages/flow-state-v3/src/core/incarnations.ts#release
  keep: a first or last use raises `Change.Use`.

Context, firings, disposal:

- code:packages/flow-state-v3/src/core/context.ts#selected, code:packages/flow-state-v3/src/core/context.ts#react,
  code:packages/flow-state-v3/src/core/context.ts#bind, code:packages/flow-state-v3/src/core/context.ts#restore,
  code:packages/flow-state-v3/src/core/context.ts#baselinesOf, code:packages/flow-state-v3/src/core/context.ts#owes
  change: pure deciders that return slots, baselines, events and failures and read `context.slots`; no `withIssue`,
  no put.
- `packages/flow-state-v3/src/core/context.ts#failing`, code:packages/flow-state-v3/src/core/context.ts#raise,
  code:packages/flow-state-v3/src/core/context.ts#clear, code:packages/flow-state-v3/src/core/context.ts#keep,
  code:packages/flow-state-v3/src/core/context.ts#settle
  delete: outcomes are written by row C2.
- code:packages/flow-state-v3/src/core/context.ts#update, `packages/flow-state-v3/src/core/context.ts#quiet`
  change: `inputsOf` builds `Change.Inputs`.
- code:packages/flow-state-v3/src/core/context.ts#wave
  change: reads `consumers` and calls `tx.owe`.
- code:packages/flow-state-v3/src/core/context.ts#settling: keep.
- code:packages/flow-state-v3/src/core/firings.ts#fire, code:packages/flow-state-v3/src/core/firings.ts#firing
  rewrite: no write before the send; `Change.Settled`; the stale check is `locate`.
- code:packages/flow-state-v3/src/core/firings.ts#recheckLanes
  change: `Change.Lanes` per moved subject.
- code:packages/flow-state-v3/src/core/disposal.ts#started, code:packages/flow-state-v3/src/core/disposal.ts#end,
  `packages/flow-state-v3/src/core/disposal.ts#consumersFirst`
  change: `endOrder`; one `apply(End)` per identity.

Tree, ledger, world, evidence, host:

- code:packages/flow-state-v3/src/core/tree.ts#moveOf, code:packages/flow-state-v3/src/core/tree.ts#historyAfter
  keep: a subroutine's states are states of the one tree.
- `packages/flow-state-v3/src/core/tree.ts#chainOf`, `packages/flow-state-v3/src/core/tree.ts#leafOf`
  delete, as `Types` (`DerivedFields`) states: every caller reads `Node.chain` or `Node.leaf`, and the two scans live
  on only as the reference in `Types`' index test (T5). The walk's callers move with this Spec's build.
- code:packages/flow-state-v3/src/core/ledger.ts#Audience, code:packages/flow-state-v3/src/core/ledger.ts#live,
  code:packages/flow-state-v3/src/core/ledger.ts#onRecord, code:packages/flow-state-v3/src/core/ledger.ts#suspend,
  code:packages/flow-state-v3/src/core/ledger.ts#start, code:packages/flow-state-v3/src/core/ledger.ts#restore
  change: per subject; `live` is `locate`; `owe`, `tryOne`, `close`, `wait` keep.
- code:packages/flow-state-v3/src/core/following.ts#following: change: a `Props` case in its chain function.
- code:packages/flow-state-v3/src/core/world.ts#Incarnation, code:packages/flow-state-v3/src/core/world.ts#OwnedBy,
  code:packages/flow-state-v3/src/core/world.ts#Mail, code:packages/flow-state-v3/src/core/world.ts#Command
  change: as the Spec's model; `withIssue`, `withIssues`, `withoutIssue` go with their callers.
- code:packages/flow-state-v3/src/core/world.ts#indexesOf, code:packages/flow-state-v3/src/core/world.ts#indexDrift
  change: every index of the Spec's `realization`.
- `evidence.ts` and `evidence-of.ts`: change: the turn's record and `Published`; the public `Emit` and `listRepair`
  records are projections.
- `identity.ts`, `slots.ts`: keep.
- code:packages/flow-state-v3/src/host/driver.ts#perform, code:packages/flow-state-v3/src/host/driver.ts#ownerOf
  change: `Wake`; an Owner per `(incarnation, scope)`; the emit consumer; the inspector sink guarded.
- code:packages/flow-state-v3/src/host/owners/owners.ts#cancel
  change: a map from fork key to owner.
- New files: `apply.ts`, `walk.ts`, `instances.ts`, `reads.ts`, `mailbox.ts`, `alarms.ts`, `turns-of.ts`,
  `src/host/emits.ts`.

Readers of each changed type outside the entries above; each is a mechanical edit the build must not miss:

- `Incarnation.context`, `.issues`: `persist.ts`, `src/host/snapshot.ts`.
- `Audience`: `answers.ts`, `lanes.ts`, `lane-moves.ts`, `persist.ts`.
- `Mail.Firing`, `Timer.Schedule` (`track`): `schedules.ts`, `schedule-plan.ts`, `src/host/inspect.ts`.
- the turn's record and `Published`: `src/host/trace.ts`, `src/host/testing/select.ts`, `src/host/testing/run.ts`.
- any of them, as fault text: `tests/*-faults.ts`; each `find` string that names a changed symbol is re-pointed in the
  same change.

By count, the turn area keeps about 1,450 of 1,873 lines and the incarnation area about 1,050 of 1,406; the rewrites
are `accept`, the accepted branch, `start`, `fired` and the mail functions. Cost figures (`draft` ownership: a map is
copied once per run of steps; the mailbox array recurs per step) are in the Spec's `realization`.

## 6. Seams with other Specs

The Spec's `composition` states what `Changes` offers and needs. In short:

- `Schedules`: row C5 is the one caller of `pass`, once per scope; `Schedules` owns `decide`, `fire`, the saved
  schedules and the occasion selection.
- `Records`: an `instances` partition in the actor record; lanes and rows carry their subject inside the `work`
  record; `Begin` reconciles whatever batch landed.
- `Operations`: reads keyed by scope id; lanes keyed by subject; `Freeze` interrupts life-held calls and owes waiting
  lookups an `Interrupted` row; entries' `collectDue`, `releaseDue` and `stepEnds`; the ending's three cells of the
  applier (`afterTry` per change).
- `Host`: `Mail.Event.at` and how a view addresses a fragment's event; `onEmit`, `setProps`; the publication that
  calls the emit listeners; the one wake; a hydration as `Begin`; the hidden page stays at the edge.
- `Types`: the derived rows (props, emits, instance memory, keys, slot names, reset value, callback inputs, the unions).

## 7. Open questions

Each had two traces where behaviour differs; the recommendation is first. "Answered" means a correctness call settled
by the solutions pass (still the agent's, revisable); "proposed" means a user call, not decided. Items 4 and 10 and
the hidden page were decided by the user 2026-11-22, all as recommended (A).

1. **Instances settle inside the turn, in rounds.** Answered A: no follow-up turn, no pending flag. Departs from
   @plan.Machines.O3's "pending reset ... as its own follow-up turn". B (a follow-up turn with `unsettled`) publishes a
   list without `r2` beside a live copy `r2`, and needs a flag and a rule for a reload between.
2. **A site reached again folds its own writes.** Answered A. B (any second write refuses) makes a list of two uploads
   impossible to clear when each copy's leaving patches `gone`; C (every part reads every earlier write) makes a
   guard's meaning depend on walk order.
3. **Who a raise reaches.** Answered A: the instances live after the source's own patch. B reaches only copies live at
   turn start: `Attach` adding `r3` then raising `Begin` would leave `r3` unstarted for that turn.
4. **A reset value is a key.** [decided: user 2026-11-22] A: the slot's declaration names `resetOn`'s Schema, and
   the value is encoded by it and made canonical text, as a schedule's `restartOn` is; the string-or-number limit is
   dropped. Before: any value by `Equal.equals`, so a `Date` saved as a string resets the trait on every reload.
   Why: one rule with `restartOn`. Reverse: B keeps any value by `Equal.equals`.

   ```ts
   // limited form: resetOn: ({ memory }) => memory.openedAt.getTime()           // only a string or a number
   // after:        resetOn: Schema.DateFromString   // NEW, declared beside the slot, as restartOn is
   //               in the body: resetOn: ({ memory }) => memory.openedAt        // typed by the declaration
   ```
5. **When `whenAbandoned`'s callbacks run.** Answered A: only inside a turn and only into a host that stays; releases
   at every end but an exit and a dropped slot. B (a last turn before an actor's end) publishes a patch once and
   discards it.
6. **An instance's id is an activation id.** Answered A: one counter, never saved; the host names work by
   `(IncarnationId, ActivationId)`. B (a seeded instance id) adds a second id beside the scope id.
7. **One host wake.** Answered A: `Wake` and `Tick` replace `Arm`, `Disarm` and `Fired`; B keeps one host timer per
   alarm and the heap only orders firings (keeps the Story clock and 13 driver faults as they are).
8. **An instance's entry arms never refuse the host's turn.** Answered A, as a scoped extension: an instance's start
   is a creation; a bad delay is `Refused` with an issue. B refuses `Attach` until the schedule is fixed.
9. **`resetOn` reads memory only.** Answered A. B (props and context too) makes a props update that changes a reset
   value need a turn to run the ended trait's callbacks in.
10. **`Published` carries the incarnation; `why` has three values.** [decided: user 2026-11-22] A: `Published {
    actor, incarnation, why }`, `why` is `Begin`, `Turn` or `Other`, an end is `Finished`. B: `{ actor, state, memory,
    why }` with a fourth value `End`, which leaves instance memory, props and issues out of the one record a rule
    reads and gives `End` no assigner. Why: a fourth `why` would have no assigner. Reverse: B.

    ```ts
    // before: Published { actor, state, memory, why }      // why: "Begin" | "Turn" | "Other" | "End"
    // after:  Published { actor, incarnation, why }        // why: "Begin" | "Turn" | "Other"; an end is Finished
    ```
11. **Front mail is served with its change.** Answered A. B lets the drain yield between a props update and its
    reaction's turn: a carousel shrinks and a step ends with `index` past `count`.
12. **A repeated `.each` key.** Answered A: repaired, the first stays, with `listRepair` evidence. B refuses: a server
    returning one line twice would refuse every turn that writes the list.
13. **`Context` after every `Wake`, without the "differs" test.** Answered A: the results equal `Schedules`' rule;
    its "differs" test is the specification and the unconditional pass is its implementation.

**Hidden page.** [decided: user 2026-11-22] Not a core input in v1: timers keep their deadlines, a throttled wake
fires each overdue timer once, and the edge's drain and capture cover a freeze. Why: an autosave keeps saving.
Reverse: a hidden input and a row in every scope's table.

Proposed here, to be accepted by the user: the work-command order of a step (releases before starts); the alarm
kind order at one instant; the wave skip; a raise counts nothing toward the loop guard; the names `apply`,
`Change`, `Unturned`, `reconcile`, `Applied`, `locate`, `Segment`, `PartCause`; an `Instance` without `fragment`,
`schedules`, `parked` or `scope`, and `Instances` in address order.

## 8. Open holes

- **H1. The revised tables were not run through a model.** The Spec's T1 is the package check that runs them; an
  obligation of @task.V3.T119 before its build.
- **H2. Seven invariants had no mechanical check.** Each is now a first failing check of the Spec's T1 or a planted
  fault of T13; I12 is the shared `alarmsMatch` (T14).
- **H3. Closed.** A `resetOn` that throws under `Begin` is `StoredSource.Slot` of `Operations`, by the family rule.
- **H4. A lazy fragment's adoption.** A build-time choice in @task.V3.T48's description (the Spec's Q7).
- **H5. How a view addresses a fragment's public event.** `Host` owns it (its Q6).
- **H6. The public face of `Published.incarnation` and of the `Turn` in evidence.** `Host` owns the faces.
- **H7. A chain of dependent ends costs a reconcile per copy.** Decided: a stated cost (the Spec's Q8); the bench
  holds a case of it in @task.V3.T109.
- **H8. The readers outside the area were found by one grep.** Decided: the type checker finds the rest once the
  superseded types are deleted, so no further survey is needed.
- **H9, H10. The command order, the alarm kind order and the wave skip.** A build-time choice in @task.V3.T119's
  description (the Spec's Q9).

## 9. Process notes

- **Reload kept coming back, one slot kind at a time.** Reviews found a return after a reload with no wave, then
  `Date` slots, then an undefined slot, then a first entry. Reload was never an atom of a table; here it is (the
  Spec's T3 and I14).
- **A rule was pinned at one reader of four.** `byStart` orders dependents, a wave and disposal; reversing start
  order passed the whole suite before that.
- **Failure handling per kind failed twice**; the fix judged every fiber in one place. The applier is the same move
  for the incarnation.
- **A one-shape fixture hid an order bug** (every test machine had one reaction): the alphabet uses several shapes.
- **Requirements reviews found the most**; the cheap review is the early one.
- **Three concept designs written apart gave one fact three homes**; the Spec states each fact once.
- **A sweep's finding is a lead until someone reads the code.** One finding handed over as the core of the index layer
  was wrong as stated: `draft` copies a map once per run of steps, not once per step.
- **Tables and pseudo-code are two statements of one rule; only running them shows where they differ.** An
  executable model found a start dropped and an end told nothing in the first draft's pseudo-code.

How to build it, after the Schedules build order:

1. `Change` and `apply` first, with today's behaviour: one part, no instances, `why` derived. Every existing test
   stays green; the first failing check is the type test that a spread of `Incarnation` outside `apply.ts` does not
   compile. This unblocks root emits and the judge before any walk exists.
2. The mailbox, the alarm heap and `indexDrift` over every index: no behaviour changes; the bench says what it bought.
3. `reconcile`, the rounds and the holder table as data, with the closure of T1 over hand-built compiled slots and
   the oracle of T4: the first failing rows are the nine cells of the instances table. Review here, before any
   wiring: a blind derivation of the rows and an adversary on I1, I8 and I9.
4. The walk with the write rule; `desk/clear-two` red first. Then the holder table wired per subject.
5. Props and emits on top, then freeze and thaw with the schedule occasions, then the record partition with I14 as its
   first failing check.
6. One review of the code against the tables. A second failure of one class after that goes to a fresh agent with the
   problem and the findings, not this text.
