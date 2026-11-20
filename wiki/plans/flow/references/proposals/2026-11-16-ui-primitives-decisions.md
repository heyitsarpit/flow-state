---
proposal ui-primitives-decisions
status merged 2026-11-16 [@plan.Machines, @plan.Runtime, @plan.React, @plan.Testing, @plan.Inspection, @spec.Turn, @spec.Actors, @spec.Compile, @spec.StaticCli, @spec.WriteAhead, @spec.Restore, @spec.Codec, @task.V3.T72, @task.V3.T76, @task.V3.T77, @task.V3.T78]
    accepted user 2026-11-16
    proposed 2026-11-16
---
# UI primitives: the user's decisions on the three passes (2026-11-16)

**Bottom line:** this file records only what the user accepted from the three UI-primitives passes, one decision
at a time, with the proposed wording each one gives a Plan. The decisions are merged into the Plans, Specs and Tasks named in the status line.
The conventions accepted here are taught in [wiki/conventions](../../../../conventions/README.md)
(@proposal.conventions, accepted); each
section below names its page.

**Read first:** @proposal.ui-primitives §6, @proposal.ui-primitives-generality §7,
@proposal.ui-primitives-idiom §3.

Marks: `existing`, `NEW`, `user-defined`.

## 0. Status

| Q   | Topic                                          | Source                         | Status       |
| --- | ---------------------------------------------- | ------------------------------ | ------------ |
| Q1  | `.each` fan-out                                | generality 2                   | accepted, A  |
| Q2  | per-key durations, `paused`, `armOn` tokens    | idiom 1, 2; first 2, 5         | accepted, A  |
| Q3  | declared view events (`emits`)                 | idiom 3; first 3; generality 5 | accepted, A  |
| Q4  | gesture state; send the result                 | idiom 4; first 4; generality 4 | accepted, A  |
| Q5  | declared `props`                               | idiom 5; generality 7          | accepted, D  |
| Q6  | services and commit-input ids stay conventions | idiom 6                        | accepted, A  |
| Q7  | cross-tab sync stays out of version 1          | generality 6                   | deferred     |
| Q8  | reusable primitives: host-supplied operations  | first 6                        | convention   |
| Q9  | build order and upstream tests                 | first 1, 7                     | in the Tasks |

## 1. Q1 and Q2: schedules and `.each`

**Why now:** the toaster, carousel and per-item timers kept clock stamps in memory and a `settle` call in ten
handlers, and `.each` fan-out was unspecified. Flow already owns deadlines across restore and hydration, so it
should own the time left too. Read @plan.Machines.O5, @plan.Machines.O3 (lane-only changes), @task.V3.T57.

- **Q1 A** [decided: user 2026-11-16]: clarify `.each` fan-out in @plan.Machines.O1 (-generality §7 decision 2).
- **Q2 A** [decided: user 2026-11-16]: a `paused` selector, plus `key` passed to `schedule` (-idiom §3 decisions 1, 2).
- **Q2a** [decided: user 2026-11-16]: `armOn` and `disarmOn` list event tokens and `Flow.entry` (§1.3.4).
- **Q2b** [decided: user 2026-11-16]: `armOn: [Flow.entry]` may sit beside `restartOn`, so a timer can start on entry
  and restart on change; today that pair is a construction error and `restartOn` alone is idle on entry.
- **Q2c** [decided: user 2026-11-16]: a timer stores one fact, `dueAt` while running and `left` while paused (G9); no
  `pausedAt` stamp, which restore and hydration would have to adjust.
- **Q2d** [decided: user 2026-11-16]: `paused` and `restartOn` stay two properties. `restartOn` starts over and drops the
  time left; `paused` holds it. A merged `{ run, version }` selector was rejected as a hybrid.

Q2 rejected B (`pauseOn`/`resumeOn` event lists) and C (both). Event lists cannot say "while a press is in flight"
or "while not visible", which come from lanes and memory, and seven overlapping pause reasons would need an app-kept
counter. `paused` replaces the idiom pass's name `pauseWhile`: it is a property next to `keys` and `schedule`.

### 1.2 Q1: `.each` fan-out (proposed wording for @plan.Machines.O1)

*Refined in §9, R4.*

> A raise into a trait placed with `.each` reaches every live copy, in key order. One copy's refusal refuses the
> whole turn, as for any addressed child (@plan.Machines.O3).

```ts
on: { PauseAll: { raise: ["uploads.Pause"] } } // existing: raise; user-defined: uploads, Pause; NEW: reaches every copy
```

> Keys past `max` are dropped with `listRepair` evidence; a raise reaches only live copies (Q1a).

### 1.3 Q2: per-key durations and `paused` (proposed wording for @plan.Machines.O5)

*`paused` is a record of named reasons with `pausedBy` in the snapshot: §9.2, R13.*

> Every function of a keyed schedule receives `key`. `schedule` returns a Duration.Input or a Schedule, as now.
> `paused: ({ key?, memory, context, operations }) => boolean` is re-checked after keys and `restartOn`, after each
> committed turn and each lane-only change. True holds the time left of the current delay; false resumes from it.
> Paused time never counts toward a delay. A paused schedule shows `left` in place of `dueAt`, is persisted and
> transferred with `left` unchanged, and is skipped by `advance({ next })`. `armOn` and `disarmOn` list event tokens
> and `Flow.entry`; `armOn: [Flow.entry]` may be combined with `restartOn`.

#### 1.3.1 `key` reaches `schedule`

```ts
const lengths = { info: "4 seconds", error: "10 seconds" } as const // user-defined

expire: {
  keys: ({ memory }) => memory.toasts.map((t) => ({ id: t.id })),   // existing
  schedule: ({ key, memory }) => lengths[kindOf(memory, key.id)],   // NEW: key; returns Duration.Input
  send: E.Expired.from(({ key }) => ({ id: key.id })),              // existing
}
```

A Schedule per key works the same way:
`schedule: ({ key, memory }) => memory.retryAfter[key.id] ?? Schedule.exponential("500 millis")`.

#### 1.3.2 `paused`, unkeyed

```ts
autoplay: {
  schedule: "5 seconds",
  send: E.Tick,
  armOn: [Flow.entry, E.Tick, E.Go],      // existing, as tokens
  paused: ({ memory }) => memory.hovered, // NEW: paused
}
```

#### 1.3.3 `paused`, keyed

```ts
paused: ({ key, memory }) => memory.hovered || indexOf(memory, key.id) >= 3, // NEW: paused, receives key
```

#### 1.3.4 `armOn` as tokens

The Plan's reference apps already write tokens (`references/checkout/features/Pay/pay.machine.ts:381`,
`references/dispatch-desk/features/Tickets/editor/autosave.trait.ts:64-65`); this makes it the stated rule, in step
with `send: E.Tick`.

### 1.4 Rules the wording settles

- **G1 Lane-only change:** re-checks `keys` and `paused` only. @plan.Machines.O3's lane-only paragraph gains this
  exception; otherwise a press ending with no mapped event leaves a toast paused.
- **G2 What a key is:** identity only, because a key is also the Story and inspection address.
- **G3 Which functions get `key`:** all of a keyed schedule's: `schedule`, `paused`, `restartOn`, `send`.
- **G4 Order in a turn:** keys, then `restartOn`, then `paused`.
- **G5 Which time counts:** an unused actor, a frozen trait and a closed page still count; paused time doesn't.
- **G6 Multi-step Schedule:** pauses inside its current delay; `attempt` doesn't advance.
- **G7 Arming or restarting while paused:** the full delay, held; the arming turn still never counts.
- **G8 `disarmOn`, exit or a key leaving:** removes the paused timer; nothing fires later.
- **G9 Snapshot and guards:** a timer shows `{ dueAt }` or `{ left }`, never both; guards see it.
- **G10 Stories and tools:** `advance({ next })` skips paused timers (`NoDeadline` if all are); traces add pause
  and resume under "schedule"; `flow explain` lists what `paused` reads.

Pausing touches only the wait. An Effect Schedule is a step function `(now, input) => [output, delay]` whose
caller sleeps (`codebases/effect-v4/packages/effect/src/Schedule.ts`, `toStep`, `toStepWithMetadata`); Effect has
no pause, and its gate (`Latch`) is boolean state, not events. Flow pauses its own timer: `left = dueAt - now` on
pause, `dueAt = now + left` on resume, and the step state is kept.

### 1.5 Open questions [decided: user 2026-11-16]

None open. Closed:

- **Q1a A:** keys past `max` on `.each` are dropped with `listRepair` evidence, never refused; a fan-out raise
  reaches only live copies. The old design said so ("Repair, never refuse", machine-design.md at commit
  `20986677`); the Plan lost the sentence.
- **Q2e A:** `left` is milliseconds on the Runtime Clock, as `dueAt`, `armedAt` and `firedAt` are.
- **Q2f A:** *(refined in §9, R5)* a zero or negative delay counts as zero: due at once, fired once on the next turn,
  never in the arming
  turn, like an overdue deadline; NaN stays invalid and rejects the arming turn. A server expiry already past is
  normal (clock skew, a slow answer). Effect 4 Durations may be negative (`effect/src/Duration.ts:4`).
- The old design also passed `key` to `schedule` (machine-design.md:2412 at `20986677`), so Q2 restores it.

### 1.6 Build gaps for @task.V3.T57

- `ScheduleConfig.schedule`'s function returns only a number (`packages/flow-state-v3/src/definition.ts:134`); the
  Plan allows a Duration.Input or a Schedule.
- `armOn` takes event names as strings (`definition.ts:136`; `fixtures/pay/machine.ts:384`), not tokens.
- No keyed schedules, `restartOn`, `disarmOn` or Effect Schedules are built yet.

## 2. Q3: declared view events (`emits`)

Conventions: @convention.view-commands.

**Why now:** a view reacts to state, but some commands depend on the cause or must repeat in the same state (focus
return after Escape only, focus the first invalid field on every failed submit). Today they are stored as a request
plus a counter in memory, which replays after a reload and resets when the actor is recreated.

- **Q3-name**, accepted for now by the user: the family is `emits` (declared), `emit` (transition part), reached in
  the body as `emits.Focus(...)` like `callbacks.onFaded`, with no token letter. Rejected: `cue` (unclear),
  `notify`/`notification` (`notify` is the in-turn fragment-to-host callback), `announce` (aria-live meaning).

```ts
emits: { Focus: { target: Schema.Literal("trigger", "first") } },          // NEW: emits
Escape: { target: S.CLOSED, emit: [emits.Focus({ target: "trigger" })] },  // NEW: emit, emits.Focus
useOnEmit(menu, { Focus: ({ target }) => refs[target].current?.focus() }) // NEW (proposed name): useOnEmit
```

Note: `declaration(...)` in the idiom pass's S15 snippet is not Flow API; a trait takes a plain
object (`references/dispatch-desk/features/Tickets/queue/row-flash.trait.ts`).

### 2.1 Decisions [decided: user 2026-11-16]

- **Q3 A:** add declared `emits`.
- **Q3a A:** *(reworded in §9, R6)* in React an emit is delivered after the render that shows its turn's snapshot;
  elsewhere after commit,
  in order. Never stored, persisted, transferred or replayed; dropped when nobody listens.
- **Q3c A:** a fragment declares its emits in its contract (part of its summary); a view hears them under the
  instance name, `useOnEmit(filters, { search: { Focus } })`, and an `.each` copy passes its `key`. Only a live
  incarnation emits, only from an accepted transition.
- **Q3d A:** the payload mapper reads the event and the before memory, like `raise` and `notify`.
- **Q3e A:** `useOnEmit(actor, handlers)` and `actor.onEmit(handlers)`; handlers are a typed record, and the hook
  calls the latest render's handler.

### 2.2 Open questions

None.

## 3. Q4: short-lived interaction state [decided: user 2026-11-16]

Conventions: @convention.interaction-state.

**Why now:** the first pass kept a drag in the persisted tree (a reload restores half a move), the second sent a
whole copied outline on drop (a lost update), and the menu clears hover and typeahead fields by hand in 9 places.
No API change: a convention and fixture fixes.

- **Q4 A:** frame-rate data (pointer moves) stays in refs and is written to the DOM, never as events; gesture
  milestones with timing (long-press) go to a local actor, so the Runtime Clock and Stories control them; the
  persisted machine receives one change event, `Move { id, parent, index }`, never a copied list.
- **Q4a A:** the menu's short-lived fields (`highlighted`, `pendingSub`, `restingOn`, `typed`) live in a trait
  placed on OPEN, `Flow.state(["ROOT", "SUB_SHOWN"], { traits: { nav: MenuNav } })`; each opening starts fresh.
- **Q4b A:** the convention lives here and in the docs' patterns guide when the fixtures are built; no Plan line.
- **Q4c A:** once the trait and local actor are built, a bench case times a menu open with 30 hovers and a drag of
  5 milestones.

Prior art: XState's tiles example sends only mouse milestones but resets hover state with hand-written `assign`
actions (`codebases/xstate/examples/tiles/src/tilesMachine.ts:37-46`); XState has no state-scoped context, and
`getPersistedSnapshot` saves the whole context. Rejected: a `Flow.transient` memory marker (a trait on the state
already gives fresh memory), coalesced events (frame-rate data stays out), a gesture primitive (DOM work).

Open questions: none.

## 4. Q5: declared `props` [decided: user 2026-11-16]

Conventions: @convention.where-a-value-lives,
@convention.controlled-values.

**Why now:** configurable widgets mirror parent props into memory through a `Configure` event sent from an effect:
the first frame shows defaults, a child's mount-time send overtakes it, two views overwrite each other silently, and
the copies get persisted.

Rule of thumb: a value whose change should give a new actor is input; one that keeps the same actor and changes how
it behaves is a prop; one the machine changes is memory (possibly started from input); one from another actor is
context.

```ts
memory: { value: Flow.input(Schema.Number) },                                // existing: input starts memory
props: { min: Schema.Number, max: Schema.Number, disabled: Schema.Boolean }, // NEW: props, not memory
Press: { guard: [({ memory, props }) => memory.value < props.max || deny("AtMax")] }, // NEW: guards read props
onProps: [{ select: ({ props }) => props.disabled, when: (now) => now, event: "Disabled" }], // NEW: as onContext
useActor(StepperMachine, { input: { value: 1 }, props: { min: 1, max: stock, disabled: saving } }) // NEW: props
```

- **Q5 D:** declared `props`, read-only to the machine, changed only by the outside world, with `onProps` reactions
  shaped like `onContext`. Rejected: the `Configure` event, props in every payload, view-fed context slots.
- **Q5a:** *(revised in §9, R1 and R2)* every use supplies props (a view's `useActor` or `useActorByRef`, the host's
  `ensure`, a Story's
  `props({...})` step); the last value stays while no use is attached.
- **Q5b:** *(replaced in §9, R1)* different props from two uses of one shared actor reject with `ConflictingProps`
  (proposed name), as
  `ConflictingActorRef` does for context.
- **Q5c:** root-only in version 1, as context is; a fragment gets configuration through input and host events.
  Revisited with Q8.
- **Q5d:** the pre-attach snapshot uses render-time props, so the first frame is right; updates queue from a layout
  effect, keep their FIFO place and compare with `Equal.equals`. Prior art: ui-sdk's `follow` and `setOptions`
  (`codebases/ui-sdk/packages/core/src/foundation/kernel/primitive.ts:364`).
- **Q5e:** never persisted or transferred; a restored or hydrated actor gets props from the use that brings it back.
- **Q5f:** *(widened in §9, R3)* guards, `updateMemory` and payload mappers (including `emit`) read `props`; this
  widens Q3d. A controlled
  value is a prop paired with an emit (`props: { value }`, `emits: { Change }`).
- **Q5g:** a prop and a memory field may not share a name; construction rejects it.
- **Q5h:** keep the names `input` and `props` (XState's and React's meanings). Not renamed: an operation's commit
  input, which reads clearly in place.

Open questions: none.

## 5. Q6: app actions as services; what an ending knows [decided: user 2026-11-16]

Conventions: @convention.app-actions,
@convention.what-an-ending-knows.

**Why now:** reusable machines must run the app's own action, and an ending must know which call it belongs to.
Checked against `packages/flow-state-v3/src/host/runtime.ts`, the fixtures and both reference apps.

- **Q6a A:** app actions are Effect services in the one Runtime Layer (built: `runtime.ts:195-204`, `:274-292`;
  used by `references/checkout/app/setup.ts` and `references/dispatch-desk/app/setup.ts`). It replaced
  `machine.provide`, removed on 2026-10-26 (D15, commits `41709517` and `ec022be0`). Two instances that need
  different implementations of one service go to Q8.
- **Q6b A:** ids ride the call's input, and outcome mappers read them from `{ input }` (Operations O3).
- **Q6c A:** view flags come from props or memory, never the call's input. The input holds what the ending must
  know as of the call's start (saved with the Attempt); props and memory hold current configuration.
- **Q6d A:** keep the `services` list on contracts, the only runtime record of a contract's needs once `R` is
  erased in Compiled (lazy features rely on it); build the boot's refusal by name; add the list to the reference
  apps' contracts.

Build gaps:

- G1: no boot check refuses an operation whose service the Layer lacks; only the type checks it.
- G2: nothing in `src` reads a contract's `services` list; the reference contracts omit it
  (`references/checkout/features/Pay/pay.contracts.ts`).
- G3: outcome mappers get only the value (`packages/flow-state-v3/src/core/serve.ts:177`), not
  `{ input, key, attempt }`.

Open questions: none.

## 6. Q7: cross-tab sync (deferred) [decided: user 2026-11-16]

Conventions: @convention.cross-tab-bridge.

Cross-tab sync stays out of version 1 (@plan.FlowState.C2, @plan.Persistence.O7).
The recommendations below are recorded to revisit, not merged into the Plans; `revisit.md` holds the entry.

- Uses: theme and preferences, sign-out across tabs, a cart badge, unread counts, feature flags. The dispatch desk
  already leaves sign-out to the auth library (`references/dispatch-desk/app/host.ts:118`).
- Recommended interim convention: host code, typed both ways, with no echo.

```ts
SetTheme: {                                                                // user-defined: the user's change
  updateMemory: ({ event }) => ({ theme: event.theme }),
  emit: [emits.Changed.from(({ event }) => ({ theme: event.theme }))],     // Q3: emit only on a user change
},
Synced: { updateMemory: ({ event }) => ({ theme: event.theme }) },         // no emit, so no echo
// app/host.ts (app code)
const prefs = runtime.ensureActor(PrefsRef)
const channel = new BroadcastChannel("prefs")
prefs.onEmit({ Changed: (v) => channel.postMessage(v) })
channel.onmessage = (e) => prefs.send(Prefs.E.Synced(decodeTheme(e.data))) // decoded with Schema at the boundary
```

- A second tab saves nothing (O7); its change reaches the owner tab as `Synced`, and the owner saves it.
- Rejected: a `storage` listener in the view (untyped, echoes); a `stream` contract for the channel (streams carry
  server-session semantics a `BroadcastChannel` lacks).

## 7. Q8: reusable primitives (a convention for the docs) [decided: user 2026-11-16]

Conventions: @convention.reusable-primitives.

A convention for the examples and the docs' patterns guide, built on what Flow
already has or has accepted; no Plan or code change and no Task. The first pass (decision 6) asked for operation
ports; the factory below replaces them.

A library ships a primitive as a factory: a function that takes the app's own contract and returns a machine (or a
trait). The library fixes the port's input and error type; the app maps its errors with `Effect.mapError`.

```ts
export const menu = <R>(config: {
  readonly id: string
  readonly act: Transaction<{ item: typeof Schema.String }, void, MenuActionFailed, R>
}) => machine(definition({ id: config.id, /* states, events, props, emits */
  operations: ({ E }) => ({ act: config.act.outcomes({ /* success, failure, unknown */ }) }) }), body)

export const FileMenu = menu({ id: "App/FileMenu", act: fileAct }) // the action sits next to the menu
export const EditMenu = menu({ id: "App/EditMenu", act: editAct })
```

- Each call is a declared machine with its own id, so the graph stays static; `R` reaches the Runtime Layer's type.
- It closes Q6a's gap: two menus with different actions are two factory calls, not one dispatching service.
- Q5c stands: a library primitive used alone is a root machine with props; a fragment factory takes input and host
  events.
- Rejected: operation ports or `.with` (`machine.provide` again, dropped as D15), a service dispatched by instance
  id (the action far from the menu), emit and relay (two actors, pending sent back through the view).
- Prior art: ui-sdk's per-instance `onAction` and `load`
  (`codebases/ui-sdk/packages/core/src/components/menu/menu.ts:239`), factories that create XState machines.
- Unverified: a generic contract passing through `definition()` with exhaustive `failure:` typing. Check it when the
  example is written; a failure there is a type fix, not a feature.

## 8. W8: where a stored value belongs (a convention for the docs) [decided: user 2026-11-16]

Conventions: @convention.where-a-value-lives.

All accepted; a convention for the fixtures and the docs, no Plan change. The
idiom pass's W8 fixes are symptoms of six rules:

- **R1** a value other fields determine is derived by a helper or selector, never stored;
- **R2** a value meaningful in one state lives in a trait placed on that state, or in the view; never a nullable
  mode field;
- **R3** a value that only tells the outside world is an `emit`;
- **R4** the parent's configuration is `props`;
- **R5** the status of a server-backed thing is read from its operation rows (`O.x.get(s, key)`);
- **R6** a counter that only defeats equality is replaced by selecting the real content, or by an emit.

Accepted sub-points:

- **W8a A:** R1 to R6 are the fixture convention and a docs guide.
- **W8b A:** the stepper's typed text is view-owned; the machine gets `Typed { text }` and updates `value` when it
  parses. Ported display-text scenarios become view tests.
- **W8c A:** a prompt token's status comes from the mention lookup's rows; entries store `{ id, ref, label? }`;
  failed tokens are hidden by the selector, so undo brings one back as failed (differs from ui-sdk, which deletes it).
- **W8d A:** the toaster's `restartOn` selects a toast's `{ title, type }`; an `Update` that changes nothing does not
  restart it; `version` goes. `duration` is written only by `Show`; `keys` leave out `loading` toasts.
- **W8e A:** fixture notes for @task.V3.T72 (toaster, menu) and @task.V3.T73 (prompt; token input); @task.V3.T71's
  built stepper
  migrates `Configure` to props and `committed` to an emit once those are built. The Task edits wait for the user.

Per primitive: prompt drops `value`, `loading`, token `status` and `readOnly` (a prop), and its composing draft moves
to a trait on COMPOSING; stepper drops `min`, `max`, `step`, `wheel` (props), `text` (view), `committed` (emit), and
writes `hold: { direction, size }` once on `Press`; `startValue` moves into a trait on a compound ADJUSTING state
once @task.V3.T17 lands. Toaster drops `remaining`, `countingSince` (Q2), `version`, `maxVisible` (context, §9 R1) and
`focusRequest` (an emit); `paused: PauseReason[]` stays, a real fact.

## 9. Review round: fixes before merging [decided: user 2026-11-16]

**Why now:** an Opus review with four Haiku sidecars checked Q1, Q2, Q3 and Q5 against the Plans, Specs and v3 code;
none needs a redesign, but none could merge as worded. Key citations were re-read before this round. All accepted.

- **R1 (Q5b):** props only on local actors in version 1: `useActor`, `createActor`, `Story.machine`.
  `useActorByRef` takes no props (a type error); a shared actor's outside configuration stays context or input, so
  the toaster's `maxVisible` is context. `ConflictingProps` is dropped. Why: two views re-render a commit apart, and
  `ensureActor` alone is not a use and takes no input (@plan.Runtime.O3).
- **R2 (Q5a):** every prop has a value before any use, on restore and on hydration: its Schema's default. How the
  Schema declares it is the author's choice (the user).
- **R3 (Q5f):** the snapshot shows `props`; every reader of memory (guards, `updateMemory`, mappers, schedule
  functions, `keys`, `paused`, `restartOn`, `check(s, event)`) receives props from the same snapshot.
- **R4 (Q1):** a fan-out raise reaches every copy live at turn start, in key order. A copy with no handler on its
  active path is skipped with `Unhandled` evidence; a copy whose guards deny refuses the turn; with no live copies the
  raise does nothing and is recorded. This is the one exception to @plan.Machines.O3's "an addressed child with no
  handler refuses the whole turn"; the old design had it (machine-design.md:597-598 at `20986677^`).
- **R5 (Q2f):** a fixed negative delay stays a construction error; a computed negative counts as zero; NaN,
  ±Infinity and over 2^31-1 ms still refuse the turn. Pausing an overdue timer holds `left` at 0. Changes
  @spec.Turn.R14 and the built checks (`src/compile-body.ts`, `src/core/turn.ts`).
- **R6 (Q3a):** emits queue per listener in turn order and are delivered after the commit of the first render whose
  snapshot is at or after their turn; discarded renders deliver nothing; queued emits flush in order. Why:
  notifications coalesce per task (@plan.React.O3).
- **R7 (controlled values):** a controlled value's emit carries the intent (`Change { by }`) and the parent applies
  it; an absolute value repeats when hold-repeat outruns the parent's render.

Companion edits, accepted as one batch:

- **G1 widened:** every lane change, including a denied or unhandled ending's admission, re-checks `keys` and
  `paused`; a defect there publishes one issue and keeps the previous values; the lane change still publishes. The
  rule also lives in @spec.Turn.R19.
- **Saved format:** a deadline record is `{ name, key?, dueAt } | { name, key?, left }`, with the next format step
  and a pure upgrade (old records read as `dueAt`); @plan.Persistence and @spec.WriteAhead say so.
- **Hydration:** paused timers transfer `left` unchanged (@plan.ServerRendering.O5).
- **Multi-step Schedule:** the host steps it and hands the core the next delay as data; a paused one restores with
  its `left`, then continues from step one.
- **Restore:** on restore, hydration and return, `keys` and `paused` are re-evaluated silently, like `restartOn`
  baselines.
- **Same turn:** `armOn` with `restartOn` arms once, from step one; a pause right after a firing holds the next
  step's full delay; `advance(d)` and `advance({ to })` never fire paused timers.
- **Emits:** any accepted transition emits (user send, firing, outcome, `onContext` or `onProps` event), never entry,
  exit or a refused turn; a copy that ends in the same turn still delivers; a mapper defect is pre-commit; emits are
  dropped in server rendering; `useOnEmit` and `actor.onEmit` are not uses.
- **Records:** an `emit` evidence and trace kind (@plan.Inspection, @plan.Testing); fragment summaries carry emits;
  the one-namespace rule includes prop and emit names; a `props(...)` Story step; a props update is its own turn,
  changing only props, then running `onProps`, which repairs memory against shrinking props.
- **`flow explain`:** lists what `paused` reads from source analysis (@plan.CommandLine), or drops it from G10 if
  that analysis cannot.
- **Build gap for @task.V3.T57:** `armOn` tokens are filtered out and read as `Flow.entry`
  (`src/compile-body.ts`, the `armOn` filter).

### 9.1 Props: the settled model [decided: user 2026-11-16]

Props inject state that does not come from a machine: the owning component's values. Shared actors, reached by a ref
(a singleton or one actor per identity), have no owner, so they take outside state through input (which actor),
context (another machine's state) or an event (app code that is not a machine), and the machine decides how to act.

- **R8:** props reuse context's delivery (FIFO, `Equal.equals`, one update per change, never saved, a reaction that
  enqueues an event); only the source differs. Context is wired statically between actors and checked as a graph at
  admission ("call sites never supply wiring", @plan.Runtime.O1); props come from the owner at the call site.
- **R9:** `actorRef` and `useActorByRef` on a machine that declares props is a type error, also refused at
  construction. This settles Q5e: a shared machine with props cannot exist.
- **R10:** a local handle has `setProps(partial)`; `runtime.createActor(m, { input, props })` takes props at creation.
  `useActor` and the Story `props()` step call `setProps`; shared handles have none.
- **R11:** a write that must survive a reload belongs to a shared, persisted actor; a local actor's lanes never
  persist (@plan.Persistence.O2).
- **R12:** the palette fixture (@task.V3.T71) keeps `Configure`: it is a shared, persisted actor, where an event that
  writes memory is the right route. The docs show the split design instead: a local palette with props, and a
  persisted actor owning command runs. Settles the Task proposal's U1 and U2.

### 9.2 `paused` names its reasons [decided: user 2026-11-16]

- **R13:** `paused` is a record of named reasons, each a function returning a boolean; any true pauses the timer.
  The snapshot shows `pausedBy`, every active reason in declaration order, beside `left`; reason names are a literal
  union, so `pausedBy` is typed. It is always a record, never a bare function. Rejected: a `runWhile` guard list with
  `deny` codes (running is the default and a pause the exception, so the property names the exception). Replaces
  the function form in §1.3 and the examples above; every other Q2 rule stands.

```ts
paused: {
  Hovered: ({ memory }) => memory.hovered,
  Hidden: ({ key, memory, context }) => indexOf(memory, key.id) >= context.maxVisible, // shared toaster: context (R1)
  Pressing: ({ key, operations }) => isPressing(operations, key.id),
},
// snapshot: { left: 2400, pausedBy: ["Hidden"] }
```

### 9.3 Merge guide and Task proposal items [decided: user 2026-11-16]

- **W1–W10:** the merge guide's picks (its §5), except W1: only `armOn: [Flow.entry]` may sit beside `restartOn`, as
  Q2b accepted. With R13, W2 becomes: `flow explain` lists each schedule's pause reasons by name.
- **Record format (W7):** the Plans name no format number; @plan.Persistence's "(1 to 4)" goes in the merge, and the
  code and @spec.Codec hold the number.
- **F1:** @task.V3.T72 moves from P3 to P4. **F2:** T76 (props), T77 (emits) and T78 (stepper migration) join P4.
- **F3:** the merge lands directly in the Plans and Specs, following the merge guide's batches; not through
  @plan.Pending. Another session does the merge, not this one (the user, 2026-11-16).

### 9.4 Static analysis pass [decided: user 2026-11-16]

- **S1 rejected:** keyed schedules keep the `keys` closure with no declared key fields.
- **S2–S8 accepted:** no user API; the CLI reads what is already accepted. S2: `explain`, `graph` and Story coverage
  list each schedule's pause reasons (R13). S3: emit parts are graph and `explain` edges (fragment emits under the
  instance path); warning `UnusedEmit` (declared, never emitted); construction error for an undeclared emit; coverage
  lists emits no Story produces. S4: a fan-out raise is one edge per copy state, handled or skipped (R4); `explain`
  names copy denials that refuse the turn; warning `FanOutNeverHandled` (no copy state handles the event). S5:
  construction error `PropWithoutDefault` (found from the Schema's structure, as `TwoDefaults` is); `flow check`
  reports a ref on a machine with props (R9); `onProps` reactions are edges. S6: `armOn`/`disarmOn` tokens are
  "arms schedule" edges once the token bug is fixed. S7: `flow check` reports a fixed negative delay with its path.
  S8: factory ids stay literal (`<Id extends string>`), in `wiki/conventions/reusable-primitives.md`. The three new
  diagnostics go in @plan.CommandLine.O5 and @spec.StaticCli.

Open questions: none.
