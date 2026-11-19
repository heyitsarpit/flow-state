# UI primitives, third pass: are the existing-feature routes idiomatic? (proposed, 2026-11-16)

**Status (2026-11-20):** acted on: decided in
code:wiki/plans/flow/references/proposals/ui-primitives-decisions-2026-11-16.md. The text below is prior art.

**Bottom line (proposed):** four of the second pass's routes are clean or tolerable Flow code and confirm its drops:
gesture state kept out of the persisted machine, actions injected as services, ids carried in the commit's input,
and `.each` copies for constant per-item timers. Three are leaky and reach many unrelated scenarios, so each is a
case for a general feature after all:

- the pausable timer: `remaining` and `countingSince` stamps, kept in step by a `settle` call in ten handlers;
- one-shot view commands: a hand counter that the view must also remember;
- props mirrored into memory by a `Configure` event.

Each leaky route stores something Flow already owns elsewhere: schedule deadlines, its own outbound effects,
and provider-style context. Each also has a correctness defect that no Plan rule closes: negative banked time and
hydration skew; ids reset when an actor is recreated; and the first frame plus child effects running before
`Configure`. The proposed features are a keyed schedule that can pause, with `key` reaching its duration function;
declared view events (`emit`), as in XState v5; and declared `props`, delivered the way context already is. All
three keep the single graph, Stories and CLI inspection, because each is declared on the definition and runs on
existing queue and clock rules. Everything here is proposed.

**Why now:** the user asked whether the routes in `ui-primitives-generality-2026-11-16.md` are clean and idiomatic,
or hacky and leaking internal wiring, while still hoping for generality. A route that works but reads as wiring
reopens a feature; a clean one confirms the drop.

**Read first:** `ui-primitives-generality-2026-11-16.md` §2 and §7, @plan.Machines.O5 (schedules), @plan.Machines.O7
(onContext), @plan.Runtime.O5 (context delivery), @plan.ServerRendering.O3, `fixture-catalogue-2026-11-11.md` §3.

Marks: `existing (built)`, `existing (Plan)`, `NEW (proposed)`, `user-defined`. A `// WIRING` mark sits on every line
that carries a hand-made id or counter, a stamp, hand-computed time, a value copied only for a later step, a fact
stored only to trigger a view effect, or bookkeeping kept in step by hand.

## 1. Summary

| #   | Route (second pass)                  | Verdict     | Wiring            | Reach      | Recommendation        |
| --- | ------------------------------------ | ----------- | ----------------- | ---------- | --------------------- |
| W1  | pausable timer: banked time, soonest | leaky       | 17; 10 handlers   | 7+ apps    | NEW `pauseWhile`      |
| W2  | 0-or-1 `keys` timer; `.each` copies  | leaky; ok   | 4; 0              | 8 apps, 5S | `key` into `schedule` |
| W3  | gesture state in view or local actor | clean       | 0 (payload fix)   | 6          | keep; send `Move`     |
| W3b | menu hover state reset by hand       | tolerable   | 9 resets          | menus      | reset on Open now     |
| W4  | the app's action as a service        | clean       | 0                 | 26 of 29S  | keep                  |
| W5  | event fields in the commit input     | clean; tol. | ids 0; `closes` 5 | 7S         | keep                  |
| W6  | one-shot command `{ target, id }`    | leaky       | 4 per kind        | 11+        | NEW view events       |
| W7  | props by `Configure` event           | leaky       | 3 per prop set    | every prop | NEW declared `props`  |
| W8  | stored copies of derived values      | tolerable   | §2.8              | sketch     | fix in fixtures       |

"S" counts catalogue scenarios (S01 to S29). App and ui-sdk counts are named in each section.

## 2. Routes

### 2.1 W1: pausable timer (leaky)

What an author writes today, reduced to one toast list with no press lane. It is complete and runs on the Plan as
written:

```ts
// user-defined: Toast, Toaster, settle, soonestLeft, dueIds, Show, Pause, Resume, Due, SHOWING
const Toast = Schema.Struct({
  id: Schema.String,
  duration: Schema.Number,
  remaining: Schema.Number,                                         // WIRING: banked time, kept by hand
  countingSince: Schema.NullOr(Schema.Number),                      // WIRING: stamp
});
const Toaster = definition({                                        // existing (built)
  id: "Toasts/Toaster",
  states: ["SHOWING"],
  events: { Show: { id: Schema.String, ms: Schema.Number }, Pause: {}, Resume: {} },
  internalEvents: { Due: {} },
  memory: {
    toasts: Flow.initial(Schema.Array(Toast), []),                  // existing (built)
    paused: Flow.initial(Schema.Boolean, false),
  },
});
type M = typeof Toaster.Memory.Type;                                // existing (Plan): Memory Schema
const settle = (m: M, now: number) =>                               // WIRING: must run in every handler
  m.toasts.map((t) => ({
    ...t,
    remaining: t.countingSince === null ? t.remaining : t.remaining - (now - t.countingSince), // WIRING: time math
    countingSince: m.paused ? null : now,                           // WIRING: stamp
  }));
const soonestLeft = (m: M) =>                                       // WIRING: hand "soonest"
  Math.min(...m.toasts.filter((t) => t.countingSince !== null).map((t) => t.remaining));
const dueIds = (m: M, now: number) =>                               // WIRING: same time math again
  m.toasts.filter((t) => t.countingSince !== null && t.remaining - (now - t.countingSince) <= 0).map((t) => t.id);

export const ToasterMachine = machine(Toaster, ({ S, E }) => ({    // existing (built)
  default: S.SHOWING,
  states: {
    SHOWING: {
      schedules: {
        soonest: {
          keys: ({ memory }) =>                                     // existing (Plan): keys
            memory.toasts.some((t) => t.countingSince !== null) ? [{ timer: "soonest" }] : [], // WIRING: fake key
          schedule: ({ memory }) => soonestLeft(memory),            // existing (built)
          restartOn: ({ memory }) =>                                // existing (Plan): restartOn
            memory.toasts.map((t) => [t.id, t.remaining, t.countingSince]), // WIRING: stamps as a fingerprint
          send: E.Due,                                              // existing (built)
        },
      },
      on: {
        Show: {
          updateMemory: ({ memory, event, now }) => {
            const toasts = [
              { id: event.id, duration: event.ms, remaining: event.ms, countingSince: null },
              ...memory.toasts,
            ];
            return { toasts: settle({ ...memory, toasts }, now) };  // WIRING: settle call
          },
        },
        Pause: {
          updateMemory: ({ memory, now }) => ({ paused: true, toasts: settle({ ...memory, paused: true }, now) }),
        },
        Resume: {
          updateMemory: ({ memory, now }) => ({ paused: false, toasts: settle({ ...memory, paused: false }, now) }),
        },
        Due: {
          updateMemory: ({ memory, now }) => {
            const gone = dueIds(memory, now);
            return { toasts: settle({ ...memory, toasts: memory.toasts.filter((t) => !gone.includes(t.id)) }, now) };
          },
        },
      },
    },
  },
}));
```

**Wiring.** In this reduced form, 12 of about 45 lines are wiring. In the full §2.1 machine there are 17 wiring
lines, and `settle` is called from 10 handlers (Show, Update, Pause, Resume, Press, PressFailed, PressUnsure, and
through `closeIds` Dismiss, Due and Pressed). A new handler that changes visibility, pauses or lanes and forgets
`settle` leaves a stale stamp, and nothing reports it.

**Verdict: leaky.** It reads as clock bookkeeping, not as "count down while visible and not paused". It also has
defects that no Plan rule closes:

1. **Negative banked time.** A `Show` processed after the soonest deadline but before `Due` banks a negative
   `remaining`. `soonestLeft` then arms a negative duration. @plan.Machines.O5 says an invalid duration rejects the
   turn, and does not say whether a negative one is invalid. So `Show` is either refused or the timer fires at once.
2. **Hydration skew.** @plan.ServerRendering.O3 transfers shared actors whatever their persist flag, and subtracts
   a nonnegative elapsed time from *schedule* delays only. `countingSince` is a server-epoch stamp the client
   subtracts from its own `now`. The second pass's H4 says the toaster is not server-rendered. A flash toast shown
   by a server action before redirect is a common case where it is.
3. **A lane-only change has no turn.** `held` reads press lanes, but `settle` runs only on mapped endings. An
   unmapped NotSent ending (optional per @plan.Operations.O3) leaves a toast paused with no turn to resume it.

The second pass's argument that `pauseOn` "would not remove `settle`, because banked time must stay in memory for
the progress bar" does not hold. Armed schedules already expose `dueAt` in the snapshot (@plan.Machines.O5, O8), so
a paused schedule can expose its time left the same way. `useNow` (@plan.React.O4) drives the bar.

**Reach.** Catalogue: 0. S24 keeps a wall-clock deadline, and S20 stops by leaving a state. ui-sdk: toaster, carousel
autoplay (first pass §1). Apps: slideshow, quiz question timer with pause, workout interval timer, game turn timer,
video ad countdown, session-idle warning that pauses while an upload runs. That is seven unrelated shapes, all
"countdown that freezes while a condition holds".

**Prior art.** Nobody has a primitive for this: XState `after` re-arms on re-entry and cannot pause
(`codebases/xstate/packages/core/src/stateUtils.ts`, getDelayedTransitions). Effect has `Effect.sleep`,
`Fiber.interrupt` and `Latch` but no pause (`codebases/effect-v4/packages/effect/src/Latch.ts:372`). vue-sonner
does the same arithmetic by hand (`node_modules/vue-sonner/src/packages/Toast.vue:441-456`). That library code
is the wiring this route copies. Flow differs from them because it already owns deadlines across persistence and hydration.

**Proposed feature: `pauseWhile` on a keyed schedule** (decision 1; it needs decision 2):

```ts
// after: the whole toaster timer
SHOWING: {
  schedules: {
    expire: {                                                       // user-defined: expire
      keys: ({ memory }) => memory.toasts.map((t) => ({ id: t.id })), // existing (Plan): keys
      schedule: ({ key, memory }) => durationOf(memory, key.id),    // NEW (proposed): key reaches schedule
      pauseWhile: ({ key, memory, operations }) =>                  // NEW (proposed): pauseWhile
        memory.paused || !isVisible(memory, key.id) || isPressing(operations, key.id), // user-defined helpers
      send: E.Expired.from(({ key }) => ({ id: key.id })),          // existing (built)
    },
  },
  on: {
    Show: {
      updateMemory: ({ memory, event }) => ({ toasts: [{ id: event.id, duration: event.ms }, ...memory.toasts] }),
    },
    Pause: { updateMemory: () => ({ paused: true }) },
    Resume: { updateMemory: () => ({ paused: false }) },
    Expired: { updateMemory: ({ memory, event }) => ({ toasts: memory.toasts.filter((t) => t.id !== event.id) }) },
  },
}
```

- Dropped: `remaining`, `countingSince`, `settle` and its ten call sites, `soonestLeft`, `dueIds`, the fake key and
  the stamp fingerprint.
- Added: one predicate, evaluated like `restartOn`, after each committed turn on the after memory and lanes.
  `true` stops the clock and keeps the time left; `false` resumes with it. The snapshot shows `dueAt` while it runs
  and `left` while it is paused.
- Flow owns: the time left; persistence of it by key (as for `dueAt` today); the nonnegative transfer adjustment
  (@plan.ServerRendering.O3, unchanged); the "delayed, never counts the arming turn" rule. Lane-only changes must
  re-evaluate it, as `keys` already must (they read after lanes).
- Checks: static, because it is declared on the node. Stories use TestClock advance (@plan.Testing.O2), and
  `advance({ next })` skips paused keys. Inspection lists paused keys with `left` (@plan.Inspection.O1). It changes
  no turn or graph rule.
- Unkeyed use is the same field on a plain schedule: a carousel `autoplay` with
  `pauseWhile: ({ memory }) => memory.hovered`.

### 2.2 W2: the 0-or-1-key timer, or `.each` copies (fake key leaky; `.each` clean)

The 0-or-1 `keys` form (§2.1 above, `[{ timer: "soonest" }]`) uses a key as a boolean. A reader must decode
why a "keyed" schedule has one synthetic key. The alternative the second pass names, two flat states COUNTING and
QUIET, puts a guarded alternative on every handler. Both are workarounds for one missing piece: a duration that
depends on which item it is for.

`.each` copies are clean when every copy has the same constant duration. This is the catalogue's own form, and
nothing is kept in step:

```ts
// S15, as the catalogue writes it (fixture-catalogue §3 S15)
const Row = trait(declaration({                                     // existing (Plan): trait, declaration
  internalEvents: { Blurred: {} },
  memory: { rowId: Flow.input(Schema.String) },                     // existing (Plan): identity
}), ({ E }) => ({ schedules: { blur: { schedule: "2 seconds", send: E.Blurred } } })) // existing (built)
// host
traits: { rows: Row.each({ of: "rowIds", max: 50 }) }               // existing (Plan): .each
```

`.each` is not clean for the toaster. Pushed-out toasts lose their time when their membership ends (the second
pass's H2). `of` must be a stored `visibleIds` field, a derived value stored. Pause needs fan-out, which is
unspecified.

**Wiring:** fake key 1, `soonestLeft` 2, `dueIds` 3, stamp fingerprint 2 (shared with W1).

**Reach of a per-key duration.** Catalogue keyed durations are all constant: S07, S15, S23, S28, S29. Apps where the
duration comes from the item: per-type toast durations, a cart or seat hold with a server `expiresAt`, Retry-After
per key, auction end times, disappearing messages, snooze reminders, per-widget refresh rates. That is 8 shapes.

**Verdict and proposal.** @plan.Machines.O5 already passes `key` to `restartOn` and to the send metadata. Withholding
it from `schedule` is the inconsistency that forces the fake key. Passing it is small, keeps locality (the duration
sits next to the key it is for), and changes no graph rule: `schedule` is already a function of the after memory.
Recommended (decision 2), against the second pass's decision 3.

```ts
// before: a constant only, or a fake key with soonestLeft
holds: { keys: ({ memory }) => memory.holds.map((h) => ({ id: h.id })), schedule: "15 minutes", send: E.Expire }
// after
holds: {
  keys: ({ memory }) => memory.holds.map((h) => ({ id: h.id })),     // existing (Plan)
  schedule: ({ key, memory }) => untilExpiry(memory, key.id),       // NEW (proposed): key; user-defined: untilExpiry
  send: E.Expire.from(({ key }) => ({ id: key.id })),               // existing (built)
}
```

`untilExpiry` reading a server `expiresAt` minus `now` is a stored timestamp. Prefer the server's remaining
duration, per the second pass's H4.

### 2.3 W3: gesture state in the view or a local actor (clean); menu hover state (tolerable)

Gesture state outside the persisted machine is what React and Sonner do. vue-sonner keeps drag offsets in component
refs and sends only the result (`Toast.vue:194-240`). Local actors are not persisted, not transferred, and not send
targets (@plan.Persistence.O2, @plan.ServerRendering.O3, @plan.Runtime.O3). The persisted tree receives one event:

```ts
// tree.ts
const Files = definition({                                          // existing (built)
  id: "Files/Tree",
  persist: true,                                                    // existing (built)
  states: ["BROWSING"],
  events: { Move: { id: Schema.String, parent: Schema.String, index: Schema.Number } }, // user-defined: Move
  memory: { nodes: Flow.initial(Schema.Array(Node), []) },          // user-defined: Node
});
// view: pointer state is React state; on drop
// existing (built): send, typed event constructors
onDrop={() => files.send(Files.events.Move({ id: drag.id, parent: over.parent, index: over.index }))}
```

**Wiring:** none. The second pass's decision 4 sends `Reorder { nodes }`, a whole outline copied at drag start.
A rename made during the drag is then reverted by the drop: a lost update, which is copied state. Send the move,
not the list (decision 4).

**Menu hover state (W3b)** is a different case. `pendingSub` and `restingOn` live in the menu's memory and are
cleared by hand in 9 places. `typed` is cleared only by a timer that exit stops (@plan.Machines.O5, "Exit stops any
schedule"). Two traces in §2.2 show the drift:

1. Hover an item with a submenu, let the submenu open, press Escape twice, reopen, press ArrowRight. The submenu
   opens from a stale `pendingSub` with nothing highlighted.
2. Type "x", close the menu within 500 ms, reopen, type "a". The menu searches for "xa".

**Verdict: tolerable.** The memory is local, the fix is one reset list on `Open`, and the second pass already names
the clean form: SUB_* as a state-placed fragment, whose memory is fresh per incarnation. That waits on
@plan.Machines.O2 saying whether an exit filling may write host memory. No new feature is needed.

```ts
// before
on: { Open: { target: S.OPEN.ROOT, updateMemory: () => ({ highlighted: null, sub: null }) } }
// after (tolerable now)
on: { Open: { target: S.OPEN.ROOT, updateMemory: () => ({ highlighted: null, sub: null, pendingSub: null,
  restingOn: null, typed: "" }) } }
```

**Reach:** menu, menubar, navigation menu, context menu and select: every ui-sdk primitive with a hover or typeahead
buffer.

### 2.4 W4: the app's action as a service (clean)

```ts
// library: palette.ts
export class CommandsApi extends Context.Service<CommandsApi, {      // existing (built): Effect service
  readonly run: (input: { readonly command: string }) => Effect.Effect<void, CommandFailed>
}>()("Palette/CommandsApi") {}
export const runCommand = transaction({                              // existing (built)
  id: "Palette/run",
  input: { command: Schema.String },
  key: ["command"],
  concurrency: "reject",
  services: [CommandsApi],
  commit: (input) => Effect.flatMap(Effect.service(CommandsApi), (api) => api.run(input)),
});
// app
const AppCommands = Layer.succeed(CommandsApi, { run: ({ command }) => commands[command]() }) // user-defined
```

**Wiring:** none. This is Effect's own injection (services and Layers), and the boot refuses a missing service
by name (@plan.Operations.O1). It maps to XState's `machine.provide`.

The adversary's drift, a service that reads an "ambient" target from a Ref so that a retry acts on the wrong document,
is a broken service rather than a fault of the route. @plan.Operations.O1 already requires the key to name the
server thing. **Verdict: clean.** **Reach:** 26 of 29 catalogue scenarios call a shape's own service. Every library
fragment that runs an app action does too.

### 2.5 W5: event fields in the commit input (clean for ids; tolerable for view flags)

```ts
export const runItem = transaction({                                 // existing (built)
  id: "Menu/act",
  input: { item: Schema.String, closes: Schema.Boolean },            // WIRING: `closes` rides only for the mapper
  key: ["item"],
  concurrency: "reject",
  services: [MenuApi],                                               // user-defined: MenuApi
  commit: (input) => Effect.flatMap(Effect.service(MenuApi), (api) => api.act({ item: input.item })),
});
// in the definition
act: runItem.outcomes({
  success: E.Acted.from((_v: void, { input }) => ({ item: input.item, closes: input.closes })), // WIRING: copy
  failure: E.ActFailed.from((e: { readonly message: string }, { input }) => ({ item: input.item, reason: e.message })),
  unknown: E.ActUnsure.from((_u, { input }) => ({ item: input.item })),
}),
// in the machine
Act: { actions: [O.act.commit(({ event }) => ({ item: event.key, closes: event.closes }))] }, // WIRING: copy
Acted: [{ guard: [({ event }) => event.closes || deny("KeepsOpen")], target: S.CLOSED }, {}], // WIRING: read back
```

**Ids are clean.** The id names the server thing and is the operation's key. This is TanStack Query's
`onSuccess(data, variables)` (`codebases/tanstack-query/packages/query-core/src/types.ts:1117-1122`, called with the
call's own variables at `mutation.ts:246-250`). Reach: S03, S04, S08, S10, S14, S16 and S23.

**View flags are tolerable.** `closes` is not part of the server call; it is copied through three places so the
mapper can hand it back, and it is persisted with the Attempt. The drift is narrow: an Attempt restored as
`unknown` never runs the success mapper, so the flag is never read. That is correct (the outcome is unknown). The
route is local and obvious, and the second pass already names the alternative, a per-item table in memory. No
feature. **Reach** of view flags is low: the menu and the navigation menu.

### 2.6 W6: one-shot view command as a stored request with an id (leaky)

```ts
// definition memory
focusRequest: Flow.initial(                                          // existing (built); WIRING: fact for a view effect
  Schema.NullOr(Schema.Struct({ target: Schema.String, id: Schema.Number })), null),
// machine
const focusTrigger = (memory: { readonly focusRequest: { readonly id: number } | null }) => ({ // user-defined
  focusRequest: { target: "trigger", id: (memory.focusRequest?.id ?? 0) + 1 },                // WIRING: counter
});
Escape: { target: S.CLOSED, updateMemory: ({ memory }) => focusTrigger(memory) },
// view
const request = useView(menu, (s) => s.memory.focusRequest);         // existing (Plan): useView
const applied = useRef(0);                                           // WIRING: last applied id
useEffect(() => {
  if (request !== null && request.id !== applied.current) {          // WIRING: dedupe by id
    applied.current = request.id;
    refs[request.target]?.focus();
  }
}, [request]);
```

**Wiring:** 4 lines per command kind, split across machine and view. The counter must be copied into every machine
that focuses: the second pass has two identical copies, toaster and menu.

**Verdict: leaky.** Memory, which holds facts, stores an event, so it carries the problems of stored events:

1. **Replay after reload.** A persisted machine restores `{ id: 5 }`, the view's ref starts at 0, and the stale focus
   is applied again. The second pass's G6 accepts this as a cost.
2. **Reset after recreation.** If a shared actor ends after its grace and is created again, the counter restarts at 1
   while a view that stayed mounted still remembers 5. The next request is then ignored. This needs a view that
   reads the actor without holding it; @plan.React.O2 lookup "neither subscribes nor holds a use".
3. **Equal requests.** Without the id, a repeated target does not re-fire (`Equal.equals`, @plan.React.O4). The id
   exists only to defeat Flow's own comparison.

**Reach (11+):** focus after close (menu, toaster, dialog, popover, navigation menu); focus the first invalid field
(checkout, S06 wizard step); scroll to newest (chat S04, S29's `Highlight` into History, which stores `anchor` as a
level fact); announce results (combobox, toasts); return focus after a link dialog (editor); focus the row a key
reached (tree); select all text on an error (form).

**Prior art.** XState v5 `emit` with `actor.on(type, fn)`, which is a typed outbound channel that never touches the
snapshot. Elm's `Browser.Dom.focus` command. React's own guidance keeps focus as an effect on a ref, not as state.

**Proposed feature: declared view events** (decision 3):

```ts
// before: focusRequest field, focusTrigger counter, view ref and dedupe (above)
// after
const Menu = definition({
  id: "Menu/Menu",
  emits: { Focus: { target: Schema.Literal("trigger", "first") } }, // NEW (proposed): emits
  // states, events and memory as before, with no focusRequest
});
Escape: { target: S.CLOSED, emit: [V.Focus({ target: "trigger" })] }, // NEW (proposed): emit, V
// view
useEmitted(menu, "Focus", ({ target }) => refs[target]?.focus());     // NEW (proposed): useEmitted
```

- Dropped: the memory field, the counter, the view's last-applied ref, and the reload replay.
- Semantics: a transition part, run like `notify` (@plan.Machines.O3): returned as data with the turn, delivered
  after commit, in order, to the views subscribed at that moment. It is never stored, persisted, transferred or
  replayed. With no subscriber it is dropped, which is right for a one-shot command.
- Checks: declared per definition, so `flow explain` lists the emits of each transition and the graph stays single.
  Stories assert them as they assert sends. The core stays pure, since an emit is data.
- Not a channel to other machines: those use `notify`. This only replaces stored facts that exist to trigger a view.

### 2.7 W7: props by `Configure` event (leaky)

```ts
// definition
events: { Configure: { min: Schema.Number, max: Schema.Number, step: Schema.Number, wheel: Schema.Boolean } },
memory: {
  min: Flow.initial(Schema.Number, 0),                               // WIRING: mirror of a prop
  max: Flow.initial(Schema.Number, 100),                             // WIRING: mirror of a prop
  step: Flow.initial(Schema.Number, 1),                              // WIRING: mirror of a prop
  wheel: Flow.initial(Schema.Boolean, false),                        // WIRING: mirror of a prop
},
// machine
Configure: { updateMemory: ({ event }) => ({ min: event.min, max: event.max, step: event.step, wheel: event.wheel }) },
// view
const stepper = useActor(StepperMachine);                            // existing (Plan): local actor
useEffect(() => {                                                    // WIRING: deps must match the event
  stepper.send(Stepper.events.Configure({ min, max, step, wheel }));
}, [min, max, step, wheel]);
```

**Wiring:** a memory mirror per prop, one `Configure` handler, and a view effect whose dependency list must match
the event.

**Verdict: leaky.** It is XState's standard answer: input is read once
(`codebases/xstate/packages/core/src/createActor.ts:267`), and `useActorRef` ignores later input
(`codebases/xstate/packages/xstate-react/src/useActorRef.ts:29-50`). But the
prop reaches the machine late and can drift:

1. **The first frame is wrong.** The pure pre-attach snapshot (@plan.React.O2) shows the defaults. A `readOnly` prompt
   renders editable, and a stepper renders `max: 100` until the effect runs.
2. **Child effects run before the parent's.** A child's mount-time send reaches the actor before `Configure`
   (sends buffer FIFO, @plan.React.O3). Then a write passes `readOnly: false`, and the persisted prompt keeps it.
3. **Two views on one shared actor** each send their own `Configure`; the last one wins, silently. @plan.Runtime.O3
   rejects the same conflict for context (`ConflictingActorRef`), but nothing catches it for an event.
4. **The mirror does not re-check what depends on it.** A new `max` below `value` leaves `value` out of range until
   the next step (second pass §2.4).

**Reach:** every configurable widget. Ui-sdk: combobox `readOnly`, number `min`/`max`/`step`/`wheel`, token
`readOnly`, toaster `maxVisible` (it has no update path today), menu `disabled` items, tree `expandOnSelect`.
Catalogue: S28 and S29 put changing values in `Flow.input` (S28 `draft`, S29 Autosave `value`), the bug this route
was meant to fix. Every app form field with `disabled` or bounds does the same.

**Prior art in Flow itself.** Context already is "a value from outside, compared with `Equal.equals`, present in the
pre-attach snapshot, read by guards and schedules, delivered in FIFO order, with a declared event on change"
(@plan.Runtime.O5, @plan.Machines.O7). Props differ only in where they come from: the view, not a provider.

**Proposed feature: declared `props`** (decision 5):

```ts
// after
const Stepper = definition({
  id: "Number/Stepper",
  props: { min: Schema.Number, max: Schema.Number, step: Schema.Number, wheel: Schema.Boolean }, // NEW (proposed)
  onProps: [{ select: ({ props }) => [props.min, props.max], event: "Bounds" }],  // NEW (proposed), as onContext
  states: ["IDLE", "HOLD_DELAY", "HOLD_REPEAT", "WHEELING"],
  events: { Press: { direction: Direction, size: Size }, Release: {}, Bounds: {} },  // user-defined
  memory: { value: Flow.initial(Schema.NullOr(Schema.Number), null) },
});
// guards, updateMemory and schedules read props next to memory and context
Wheel: { guard: [({ props }) => props.wheel || deny("WheelOff")] },                // NEW (proposed): props
Bounds: { updateMemory: ({ memory, props }) => ({ value: clamp(memory.value, props) }) }, // user-defined: clamp
// view
const stepper = useActor(StepperMachine, { props: { min, max, step, wheel } });   // NEW (proposed): props option
```

- Dropped: the memory mirrors, `Configure` and its handler, and the view effect.
- Semantics: the props exist at creation, so the first frame is right. A change compares with `Equal.equals` and is
  queued as a props update in FIFO order, so later events never overtake it. That is @plan.Runtime.O5's rule,
  reused. Props are never memory and are never persisted; each attach supplies them. On a shared ref, two different
  prop values reject as context does.
- Checks: declared Schema, so the CLI shows props in the snapshot, and Stories pass them like input with a
  `props({ ... })` step. The core receives them as data. One graph.
- Flow owns: ordering against sends, the first-frame value, conflict detection. It is one feature for every widget,
  not one example.

### 2.8 W8: other wiring in the rewritten machines (tolerable; fix in the fixtures)

These sketch choices store values that other fields already determine (AGENTS.md: "store facts, derive views"). Each
can be fixed with existing features; none needs a new one:

- **Prompt `value` beside `entries[index]`.** It is a mirror except during COMPOSING. Store a `composing` draft only
  in that state.
- **Prompt token in three places** (`value`, every history entry, `loading`), with a `load` flag that must agree
  with `status`. `RemoveToken` does not touch `loading`, and an Interrupted lookup is ignored, so it keeps
  resolving. Derive the activity's keys from the pending tokens in `entries` and drop `loading`.
- **Stepper `text` beside `value`, and `direction`/`size` rewritten by every caller of `stepped`.** Fold them into
  `stepped`'s return.
- **Toaster `version`** has no reader. With decision 1 it becomes `restartOn` for `Update`.
- **Toaster `Update`** loses a custom `ms`: `fresh(event)` defaults it to 5000. This is a sketch bug.
- **Decision 1 snippet** in the second pass calls `countingStamp`, which is never defined.

## 3. Decisions for the user

1. **Add `pauseWhile` to schedules (keyed or not).** **Recommended: yes**, user's call (public API). It removes 17
   wiring lines and three unclosed defects from the toaster, and serves carousel, slideshow, quiz, workout, game
   and ad timers. Flow already owns deadlines across persistence and hydration.

   ```ts
   // before: remaining + countingSince per toast; settle(...) in 10 handlers; soonestLeft; dueIds; stamp restartOn
   soonest: { keys: ({ memory }) => (anyCounting(memory) ? [{ timer: "soonest" }] : []),
     schedule: ({ memory }) => soonestLeft(memory), restartOn: ({ memory }) => stamps(memory), send: E.Due }
   // after
   expire: { keys: ({ memory }) => memory.toasts.map((t) => ({ id: t.id })),          // existing (Plan)
     schedule: ({ key, memory }) => durationOf(memory, key.id),                       // NEW (decision 2)
     pauseWhile: ({ key, memory, operations }) => !counts(memory, operations, key.id), // NEW (proposed)
     send: E.Expired.from(({ key }) => ({ id: key.id })) }                            // existing (built)
   ```

2. **Pass `key` to a keyed schedule's `schedule` function.** **Recommended: yes**, a small consistency amendment
   (`restartOn` and send metadata already get it). This reverses the second pass's decision 3. It removes the fake
   0-or-1 key, and serves 8 per-item-duration shapes.

   ```ts
   // before: schedule: "15 minutes"            (constant only)
   // after:  schedule: ({ key, memory }) => leftFor(memory, key.id)   // NEW (proposed): key
   ```

3. **Add declared view events (`emits`, `emit`, `useEmitted`).** **Recommended: yes**, user's call. It replaces
   `focusRequest` counters in 11+ scenarios and removes reload replay. Prior art: XState v5 `emit`/`actor.on`.

   ```ts
   // before: focusRequest: { target, id: (m.focusRequest?.id ?? 0) + 1 }  plus a view ref deduping ids
   // after:  Escape: { target: S.CLOSED, emit: [V.Focus({ target: "trigger" })] }   // NEW (proposed)
   //         useEmitted(menu, "Focus", ({ target }) => refs[target]?.focus())        // NEW (proposed)
   ```

4. **Gesture state stays out of persisted machines; send the result, not a copied list.** **Recommended: yes.** It
   confirms the second pass's decision 4 but changes its payload. Also add the menu's `Open` reset list now.

   ```ts
   // before: events: { Reorder: { nodes: Schema.Array(Node) } }
   // after:  events: { Move: { id: Schema.String, parent: Schema.String, index: Schema.Number } }
   ```

5. **Add declared `props` delivered like context.** **Recommended: yes**, user's call (large). It replaces
   `Configure` mirrors in every configurable widget, and fixes the first frame, effect ordering and silent
   shared-actor conflicts. If it is declined, keep `Configure` and add a computed initial for the first frame
   where a local actor allows it.

   ```ts
   // before: min: Flow.initial(Schema.Number, 0); Configure: { min, max, step, wheel }; a view effect sends it
   // after:  props: { min: Schema.Number, max: Schema.Number, step: Schema.Number, wheel: Schema.Boolean } // NEW
   //         useActor(StepperMachine, { props: { min, max, step, wheel } })                            // NEW
   ```

6. **Keep services (W4) and commit-input ids (W5) as the convention.** **Recommended: yes.** View flags in the
   input stay tolerable; no feature.

   ```ts
   // before (first pass): NEW operation ports; closesOnActed
   // after: services: [CommandsApi]; input: { item, closes }; success mapper reads { input }   // existing
   ```

## 4. Sidecar log

Four read-only Haiku sidecars (effort high): a wiring sweep, prior art, reach, and an adversary. Each claim below
was checked against the proposal, the Plans or the cited code.

| Sidecar   | Claim                                          | Log      | Why                                        |
| --------- | ---------------------------------------------- | -------- | ------------------------------------------ |
| wiring    | `settle` is called from 10 handlers            | accepted | counted in second pass lines 213-258       |
| wiring    | Toaster `version` has no reader                | accepted | read §2.1                                  |
| wiring    | `Update` resets a custom `ms` to 5000          | accepted | `fresh(event)` has no `ms` (lines 189, 220)|
| wiring    | Menu `pendingSub` survives close               | accepted | traced lines 367, 413, 418, 448            |
| wiring    | Menu `typed` survives close                    | accepted | exit stops schedules; Open resets 2 fields |
| wiring    | `RemoveToken` leaves the token in `loading`    | accepted | lines 599-605 have no `loading`            |
| wiring    | Stepper Blur mid-hold is unhandled             | changed  | Cancel from view cleanup covers it (H3)    |
| wiring    | `restartOn` comment mismatches its function    | accepted | lines 201-202; harmless with one key       |
| prior art | XState `after` cannot pause                    | accepted | stateUtils getDelayedTransitions           |
| prior art | Effect has no pause primitive                  | accepted | my grep: no "pause" in Schedule, Clock,    |
|           |                                                |          | Fiber, Latch, Effect                       |
| prior art | vue-sonner banks remaining time by hand        | accepted | Toast.vue:441-456                          |
| prior art | XState input is read once                      | accepted | createActor.ts:267; useActorRef.ts:29-50   |
| prior art | TanStack onSuccess gets the call's variables   | accepted | types.ts:1117-1122; mutation.ts:246-250    |
| prior art | no local request-id focus pattern              | accepted | cited XState v5 `emit` and Elm instead     |
| reach     | pausable timer in 0 catalogue scenarios        | accepted | S24 deadline; S20 leaves a state           |
| reach     | catalogue keyed timers are all constant        | accepted | S07, S15, S23, S28, S29                    |
| reach     | S28 and S29 put changing values in input       | accepted | catalogue lines 1752, 1853                 |
| reach     | one-shot command explicit only in S29          | changed  | widened with ui-sdk and app shapes         |
| reach     | second pass's S04/S06 focus is not in catalogue| accepted | counted as app patterns                    |
| adversary | negative banked time arms a negative duration  | accepted | no clamp; Machines O5 silent on negatives  |
| adversary | restart skew accumulates per turn              | rejected | the core turn is synchronous               |
| adversary | hydration skews `countingSince`                | accepted | ServerRendering O3 adjusts schedules only  |
| adversary | `.each` loses a pushed-out toast's time        | accepted | the second pass's H2                       |
| adversary | `Reorder { nodes }` reverts a rename           | accepted | whole-list payload; decision 4             |
| adversary | an ambient-target service misroutes a retry    | changed  | a service bug; Operations O1 key rule      |
| adversary | restored `unknown` never applies `closes`      | changed  | correct for an unknown outcome             |
| adversary | focus counter resets on actor recreation       | changed  | needs a non-holding reader; kept as a risk |
| adversary | `Configure` lands after a child's write        | accepted | FIFO buffer, child-first effects (React O3)|
| adversary | two views' `Configure` compete silently        | accepted | context rejects this (Runtime O3)          |
| adversary | an unmapped NotSent leaves a toast paused      | accepted | `held` reads lanes; no turn runs `settle`  |
