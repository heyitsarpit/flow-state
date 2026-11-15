# UI primitives, second pass: which features are general (proposed, 2026-11-16)

**Bottom line (proposed):** add no new machine feature for the UI primitives. Five of the first pass's NEW items and
gaps can be written today or with planned features, and this file shows the code for each:

- the pausable timer: memory and a 0-or-1-key schedule;
- the per-item timer: `.each` copies;
- gesture state across reload: a local actor;
- operation ports: services;
- the mapper seeing its starting event: the commit's input.

Focus and other one-shot view commands also have a route: a stored request with an id. Many unrelated scenarios
need that, but it can be expressed, so it stays a convention. Only cross-tab sync can't be built, and
@plan.FlowState.C2 already puts multi-tab sharing out of version 1. The survey of all 15 Plans found more holes than
features:

- Machine input is identity, so a React prop held in `Flow.input` resets the actor (first-pass bugs in 4.2, 4.5,
  4.7).
- Raising a host event into every `.each` copy is unspecified (@plan.Machines.O1).
- Timestamps stored in memory escape the clock rules for reload and hydration.
- A shared actor left mid-gesture by an unmounted view resumes its timers on remount.
- Reload exists only in app Stories.

The one Plan change recommended is a clarification of `.each` fan-out, needed by six unrelated scenarios. Fragments
make five of the seven fixtures harder, help the menu, and are neutral for the tree.

**Why now:** the user wants features only where they are general and needed, judged against what machines cannot
already express. The first pass (`ui-primitives-2026-11-16.md`, committed at `e7f0f511`, unchanged here) proposed
four NEW items from one example each, and reached for fragments without a survey of every Plan.

**Read first:** `ui-primitives-2026-11-16.md` §4 and §6, @plan.Machines.O1 and O5, @plan.Operations.O3,
@plan.Runtime.O3, @plan.React.O2 and O3, `fixture-catalogue-2026-11-11.md` §3.

## 1. Plan survey

All 15 Plans were read: FlowState, Machines, Operations, Runtime, Persistence, EntityDomains, React, ServerRendering,
Testing, Inspection, Diagnostics, LazyFeatures, Package, CommandLine and Pending. Pending has no entry for any gap
here. Its D8 (the fake's call log) is what the stress invariants "one request per pause" and "no request for a branch
not wanted" need.

### 1.1 Per primitive

| Primitive    | Planned feature that simplifies                   | Hole it exposes                               |
| ------------ | ------------------------------------------------- | --------------------------------------------- |
| 4.1 Palette  | none; pending already derives from rows           | none                                          |
| 4.2 Combobox | mapper `{ input }` (@plan.Operations.O2)          | `readOnly: Flow.input` is identity (H1)       |
| 4.3 Toaster  | 0-or-1-key schedule with `restartOn` (§2.1)       | `.each` fan-out unspecified (H2)              |
| 4.4 Menu     | `closes` in the commit input (§2.2); a subroutine | exit filling's memory writes unspecified      |
| 4.5 Number   | flat states and `armOn` run today (§2.4)          | bounds as `Flow.input` (H1); stuck hold (H3)  |
| 4.6 Tree     | placements end loads by design (already used)     | a restored MOVING state; reload is app-only   |
| 4.7 Token    | a quiet schedule seals undo groups (§2.3)         | draft text as identity (H1); timestamps (H4)  |

Planned features that were checked and do not help:

- **EntityDomains for the combobox, tree or tree labels.** "Memory never holds a copy of a record field"
  (@plan.EntityDomains.O1). The tree edits its own outline, and the combobox needs its items in guards
  (`showsCreate`, `More`). Guards reading domain answers is unspecified. Domain reads keep no cancel of the entry
  (@plan.Operations.O7), so the combobox's cancel on Typed would be lost.
- **raise and notify for `closesOnActed` or `settle`.** Both are same-turn parts (@plan.Machines.O3). Neither carries
  an asynchronous ending.
- **`useNow`** (@plan.React.O4) only serves a countdown display. The machines read the turn's `now`.
- **LazyFeatures:** none of the seven is lazy code.

Planned features that help the tests rather than the machines:

- `check` in views drives the number input's disabled buttons and the palette's Escape rule (@plan.React.O4).
- `advance({ next })` steps to a named schedule (@plan.Testing.O2).
- Inspection lists schedules and waiting deadlines (@plan.Inspection.O1).
- `flow check` flags a late handler with no alternative that stays put (@plan.CommandLine.O5). It validates the
  root `Acted: {}` and `Created: {}` handlers.

### 1.2 Fragments: which fixtures get harder, which simpler

| Fixture     | With fragments | Why                                                                 |
| ----------- | -------------- | ------------------------------------------------------------------- |
| 4.1 Palette | harder         | hostEvents and summaries for no reuse; the action runs on a service |
| 4.2 Combo   | harder         | a lookup subroutine's memory is undefined once left: reopen loses   |
| 4.3 Toaster | harder         | `.each` loses a pushed-out toast's time, or needs fan-out (H2)      |
| 4.4 Menu    | simpler        | SUB_* as a subroutine clears `restingOn` and `pendingSub` on leave  |
| 4.5 Number  | harder         | nothing to reuse inside one field                                   |
| 4.6 Tree    | same           | a MOVING subroutine is restored like a state                        |
| 4.7 Token   | harder         | a per-token trait cannot rewrite the host's history; the host must  |

For the toaster, `.each` over the visible toasts ends a pushed-out copy and its time. Over all toasts, it needs
Pause raised into every copy, which is unspecified (H2).

The useful finding: a trait **can** report to its host. A callback port's filling is a host transition that may
update host memory (@plan.Machines.O2: "A callback never moves the host out of the fragment's placement node"). A
sidecar claimed otherwise; see §8.

## 2. Rewritten machines

Marks as in the first pass: `existing (built)`, `existing (Plan, Tn)`, `NEW (proposed)`, `user-defined`. No sketch
below uses a NEW item.

### 2.1 Toaster: one conditional timer, no `key` argument, no pause feature

Memory holds the facts: each toast's `remaining` and `countingSince`. `countingSince !== null` *is* "counting",
because `settle` writes it from visibility, pauses and the press lanes. A keyed schedule with zero or one key is a
timer that runs while a condition holds. Its function reads memory, and its `restartOn` re-arms it whenever the
soonest deadline changes.

```ts
// contracts.ts: pressAction as in the first pass (transaction, key ["id"], concurrency "reject")

// machine.ts
// user-defined: Toast, ToastType, PauseReason, ToasterMemory, visible, settle, closeIds, soonestLeft, dueIds
const ToastType = Schema.Literal("info", "success", "error", "loading");
const Toast = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  type: ToastType,
  duration: Schema.NullOr(Schema.Number),
  version: Schema.Number,
  remaining: Schema.NullOr(Schema.Number),
  countingSince: Schema.NullOr(Schema.Number),
});
const PauseReason = Schema.Literal("item-hover", "focus-in", "window-blur", "page-hide", "swipe", "detached");

const Toaster = definition({                                         // existing (built)
  id: "Toasts/Toaster",
  states: ["SHOWING"],
  events: {
    Show: { id: Schema.String, title: Schema.String, type: ToastType, ms: Schema.optional(Schema.Number) },
    Update: { id: Schema.String, title: Schema.String, type: ToastType },
    Dismiss: { id: Schema.NullOr(Schema.String) },
    Pause: { reason: PauseReason },
    Resume: { reason: PauseReason },
    Press: { id: Schema.String, action: Schema.String },
  },
  internalEvents: {
    Due: {},
    Pressed: { id: Schema.String },
    PressFailed: { id: Schema.String },
    PressUnsure: Flow.uncertain({ id: Schema.String }),               // existing (built)
  },
  memory: {
    maxVisible: Flow.initial(Schema.Number, 3),                        // existing (built)
    toasts: Flow.initial(Schema.Array(Toast), []),
    paused: Flow.initial(Schema.Array(PauseReason), []),
    focusRequest: Flow.initial(Schema.NullOr(Schema.Struct({ target: Schema.String, id: Schema.Number })), null),
  },
  operations: ({ E }) => ({
    press: pressAction.outcomes({
      success: E.Pressed.from((_v: void, { input }) => ({ id: input.id })),   // existing (Plan, T21): { input }
      failure: E.PressFailed.from((_e: unknown, { input }) => ({ id: input.id })),
      unknown: E.PressUnsure.from((_u, { input }) => ({ id: input.id })),
    }),
  }),
});

type ToastRow = typeof Toast.Type;
type ToasterMemory = typeof Toaster.Memory.Type;                       // existing (Plan, T17): Memory Schema

const visible = (m: ToasterMemory) => m.toasts.slice(0, m.maxVisible);

// After a change: toasts that stop counting bank their time; toasts that start get stamped.
const settle = (after: ToasterMemory, now: number, held: (id: string) => boolean) => {
  const counts = new Set(
    after.paused.length > 0 ? [] : visible(after).filter((t) => t.duration !== null && !held(t.id)).map((t) => t.id),
  );
  return after.toasts.map((t): ToastRow => {
    const spent = t.countingSince === null ? 0 : now - t.countingSince;
    const remaining = t.remaining === null ? null : t.remaining - spent;
    return { ...t, remaining, countingSince: counts.has(t.id) ? now : null };
  });
};
const soonestLeft = (m: ToasterMemory) =>
  Math.min(...m.toasts.filter((t) => t.countingSince !== null).map((t) => t.remaining ?? 0));
const dueIds = (m: ToasterMemory, now: number) =>
  m.toasts
    .filter((t) => t.countingSince !== null && (t.remaining ?? 0) - (now - t.countingSince) <= 0)
    .map((t) => t.id);
const closeIds = (m: ToasterMemory, ids: ReadonlyArray<string>, now: number, held: (id: string) => boolean) => {
  const first = m.toasts.findIndex((t) => ids.includes(t.id));
  const toasts = m.toasts.filter((t) => !ids.includes(t.id));
  const target = toasts[first]?.id ?? toasts[first - 1]?.id ?? "return";
  return {
    toasts: settle({ ...m, toasts }, now, held),
    focusRequest: { target, id: (m.focusRequest?.id ?? 0) + 1 },
  };
};

export const ToasterMachine = machine(Toaster, ({ S, E, O }) => {   // existing (built)
  const held = (operations: Operations) => (id: string) =>
    Option.match(O.press.get(operations, { id }), { onNone: () => false, onSome: (row) => row.pending });
  const fresh = (e: { readonly id: string; readonly title: string; readonly type: ToastRow["type"];
    readonly ms?: number }): ToastRow => {
    const duration = e.type === "loading" ? null : (e.ms ?? 5000);
    return { id: e.id, title: e.title, type: e.type, duration, version: 0, remaining: duration, countingSince: null };
  };
  return {
    default: S.SHOWING,
    states: {
      SHOWING: {
        schedules: {
          soonest: {
            keys: ({ memory }) =>                                      // existing (Plan, T57): keys
              memory.toasts.some((t) => t.countingSince !== null) ? [{ timer: "soonest" }] : [],
            schedule: ({ memory }) => soonestLeft(memory),             // existing (built): computed from memory
            restartOn: ({ memory }) =>                                 // existing (Plan, T57): per-key restartOn
              memory.toasts.filter((t) => t.countingSince !== null).map((t) => [t.id, t.remaining, t.countingSince]),
            send: E.Due,                                               // existing (built)
          },
        },
        on: {
          Show: {
            updateMemory: ({ memory, event, now, operations }) => {   // existing (Plan, T17): operations
              const exists = memory.toasts.some((t) => t.id === event.id);
              const toasts = exists
                ? memory.toasts.map((t) => (t.id === event.id ? { ...fresh(event), version: t.version + 1 } : t))
                : [fresh(event), ...memory.toasts];
              return { toasts: settle({ ...memory, toasts }, now, held(operations)) };
            },
          },
          Update: {
            guard: [({ memory, event }) => memory.toasts.some((t) => t.id === event.id) || deny("Gone")],
            updateMemory: ({ memory, event, now, operations }) => {
              const toasts = memory.toasts.map((t) =>
                t.id !== event.id ? t : { ...fresh(event), title: event.title, version: t.version + 1 },
              );
              return { toasts: settle({ ...memory, toasts }, now, held(operations)) };
            },
          },
          Dismiss: {
            updateMemory: ({ memory, event, now, operations }) =>
              closeIds(memory, event.id === null ? memory.toasts.map((t) => t.id) : [event.id], now, held(operations)),
          },
          Due: {
            updateMemory: ({ memory, now, operations }) => closeIds(memory, dueIds(memory, now), now, held(operations)),
          },
          Pause: {
            updateMemory: ({ memory, event, now, operations }) => {
              const paused = [...new Set([...memory.paused, event.reason])];
              return { paused, toasts: settle({ ...memory, paused }, now, held(operations)) };
            },
          },
          Resume: {
            updateMemory: ({ memory, event, now, operations }) => {
              const paused = memory.paused.filter((r) => r !== event.reason);
              return { paused, toasts: settle({ ...memory, paused }, now, held(operations)) };
            },
          },
          Press: {
            guard: [O.press.idle(({ event }) => ({ id: event.id }))],  // existing (built)
            updateMemory: ({ memory, event, now, operations }) => ({
              toasts: settle(memory, now, (id) => id === event.id || held(operations)(id)),
            }),
            actions: [O.press.commit(({ event }) => event)],           // existing (built)
          },
          Pressed: {
            updateMemory: ({ memory, event, now, operations }) => closeIds(memory, [event.id], now, held(operations)),
          },
          PressFailed: {
            updateMemory: ({ memory, now, operations }) => ({ toasts: settle(memory, now, held(operations)) }),
          },
          PressUnsure: {
            updateMemory: ({ memory, now, operations }) => ({ toasts: settle(memory, now, held(operations)) }),
          },
        },
      },
    },
  };
});
```

What changed from the first pass:

- The NEW `key` argument is gone: one timer for the soonest deadline replaces one timer per toast.
- `Expired { id }` became `Due`, which closes every toast whose time is up.
- `settle` no longer compares before and after; the stored `countingSince` is the before.
- `focusAfterClose` became a `focusRequest` with an id (H6).

One rule this relies on: a per-key `restartOn` recomputes the schedule function from the current memory when it
restarts. @plan.Machines.O5 says "restarts only that schedule from its first step at commit time", so that reading
is assumed. Without `keys`, today's production can do the same with two flat states, COUNTING and QUIET. Every
handler then needs a guarded alternative that targets one or the other, so `keys` is only shorter.

### 2.2 Menu: `closes` rides in the commit's input

@plan.Operations.O3: "select reads the turn's after memory and the event", and mappers receive
`(value, { input, attempt, progress, key })`. The first pass's claim that the commit "cannot carry the triggering
event's `closes`" was wrong. `closesOnActed` goes.

```ts
// contracts.ts
// user-defined: MenuApi, runItem
export const runItem = transaction({                                   // existing (built)
  id: "Menu/act",
  input: { item: Schema.String, closes: Schema.Boolean },              // `closes` is input; the key stays the item
  key: ["item"],
  concurrency: "reject",
  services: [MenuApi],
  commit: (input) => Effect.flatMap(Effect.service(MenuApi), (api) => api.act({ item: input.item })),
});

// machine.ts
const Menu = definition({
  id: "Menu/Menu",
  states: [{ CLOSED: ["IDLE", "PRESSING"] }, { OPEN: ["ROOT", "SUB_WAIT", "SUB_SHOWN", "SUB_CROSSING"] }],
  //       existing (Plan, T17): compound states
  events: {
    Open: { by: Schema.Literal("pointer", "keyboard", "touch") },
    TouchDown: {},
    TouchMoved: {},
    TouchUp: {},
    HoverItem: { key: Schema.String, sub: Schema.NullOr(Schema.String) },
    LeftTrigger: {},
    Heading: {},
    EnteredSub: {},
    ArrowRight: {},
    ArrowLeft: {},
    Escape: {},
    Tab: {},
    OutsidePress: {},
    TypeChar: { ch: Schema.String, labels: Schema.Array(Schema.Struct({ key: Schema.String, label: Schema.String })) },
    Pick: { key: Schema.String },
    Act: { key: Schema.String, closes: Schema.Boolean },
  },
  internalEvents: {
    LongPressDue: {},
    SubDue: {},
    SafeAreaDue: {},
    TypeaheadDue: {},
    Acted: { item: Schema.String, closes: Schema.Boolean },
    ActFailed: { item: Schema.String, reason: Schema.String },
    ActUnsure: Flow.uncertain({ item: Schema.String }),
  },
  memory: {
    highlighted: Flow.initial(Schema.NullOr(Schema.String), null),
    pendingSub: Flow.initial(Schema.NullOr(Schema.String), null),
    sub: Flow.initial(Schema.NullOr(Schema.String), null),
    restingOn: Flow.initial(Schema.NullOr(Schema.String), null),
    typed: Flow.initial(Schema.String, ""),
    errors: Flow.initial(Schema.Record({ key: Schema.String, value: Schema.String }), {}),
    focusRequest: Flow.initial(Schema.NullOr(Schema.Struct({ target: Schema.String, id: Schema.Number })), null),
  },
  operations: ({ E }) => ({
    act: runItem.outcomes({
      success: E.Acted.from((_v: void, { input }) => ({ item: input.item, closes: input.closes })),
      failure: E.ActFailed.from((e: { readonly message: string }, { input }) => ({
        item: input.item,
        reason: e.message,
      })),
      unknown: E.ActUnsure.from((_u, { input }) => ({ item: input.item })),
    }),
  }),
});

// user-defined: firstMatch, focusTrigger
const firstMatch = (labels: ReadonlyArray<{ readonly key: string; readonly label: string }>, typed: string) =>
  labels.find((l) => l.label.toLowerCase().startsWith(typed.toLowerCase()))?.key ?? null;
const focusTrigger = (memory: { readonly focusRequest: { readonly id: number } | null }) => ({
  focusRequest: { target: "trigger", id: (memory.focusRequest?.id ?? 0) + 1 },
});

export const MenuMachine = machine(Menu, ({ S, E, O }) => ({
  default: S.CLOSED,
  on: {
    Acted: {},                                                         // late ending: stays put
    ActFailed: { updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.item]: event.reason } }) },
    ActUnsure: { updateMemory: ({ memory, event }) => ({ errors: { ...memory.errors, [event.item]: "unknown" } }) },
  },
  states: {
    CLOSED: {
      default: S.CLOSED.IDLE,
      on: { Open: { target: S.OPEN.ROOT, updateMemory: () => ({ highlighted: null, sub: null }) } },
      states: {
        IDLE: { on: { TouchDown: S.CLOSED.PRESSING } },
        PRESSING: {
          schedules: { longPress: { schedule: "500 millis", send: E.LongPressDue } },   // existing (built)
          on: { LongPressDue: S.OPEN.ROOT, TouchMoved: S.CLOSED.IDLE, TouchUp: S.CLOSED.IDLE },
        },
      },
    },
    OPEN: {
      default: S.OPEN.ROOT,
      schedules: { typeahead: { schedule: "500 millis", send: E.TypeaheadDue, armOn: ["TypeChar"] } },
      on: {
        TypeChar: {
          updateMemory: ({ memory, event }) => {
            const typed = memory.typed + event.ch;
            return { typed, highlighted: firstMatch(event.labels, typed) ?? memory.highlighted };
          },
        },
        TypeaheadDue: { updateMemory: () => ({ typed: "" }) },
        Pick: { target: S.CLOSED, updateMemory: ({ memory }) => focusTrigger(memory) },
        Act: {
          guard: [O.act.idle(({ event }) => ({ item: event.key }))],
          updateMemory: ({ memory, event }) => ({
            errors: Object.fromEntries(Object.entries(memory.errors).filter(([k]) => k !== event.key)),
          }),
          actions: [O.act.commit(({ event }) => ({ item: event.key, closes: event.closes }))],
        },
        Acted: [
          {
            guard: [({ event }) => event.closes || deny("KeepsOpen")],
            target: S.CLOSED,
            updateMemory: ({ memory }) => focusTrigger(memory),
          },
          {},
        ],
        Tab: S.CLOSED,
        OutsidePress: S.CLOSED,
      },
      states: {
        ROOT: {
          on: {
            HoverItem: [
              {
                guard: [({ event }) => event.sub !== null || deny("NotASub")],
                target: S.OPEN.SUB_WAIT,
                updateMemory: ({ event }) => ({ highlighted: event.key, pendingSub: event.sub }),
              },
              { updateMemory: ({ event }) => ({ highlighted: event.key, pendingSub: null }) },
            ],
            ArrowRight: {
              guard: [({ memory }) => memory.pendingSub !== null || deny("NotASub")],
              target: S.OPEN.SUB_SHOWN,
              updateMemory: ({ memory }) => ({ sub: memory.pendingSub }),
            },
            Escape: { target: S.CLOSED, updateMemory: ({ memory }) => focusTrigger(memory) },
          },
        },
        SUB_WAIT: {
          schedules: { hoverDelay: { schedule: "100 millis", send: E.SubDue } },
          on: {
            SubDue: { target: S.OPEN.SUB_SHOWN, updateMemory: ({ memory }) => ({ sub: memory.pendingSub }) },
            LeftTrigger: { target: S.OPEN.ROOT, updateMemory: () => ({ pendingSub: null }) },
            HoverItem: {
              target: S.OPEN.ROOT,
              updateMemory: ({ event }) => ({ highlighted: event.key, pendingSub: null }),
            },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ pendingSub: null }) },
          },
        },
        SUB_SHOWN: {
          on: {
            Heading: S.OPEN.SUB_CROSSING,
            HoverItem: [
              {
                guard: [({ memory, event }) => event.key !== memory.highlighted || deny("SameTrigger")],
                target: S.OPEN.ROOT,
                updateMemory: ({ event }) => ({ highlighted: event.key, sub: null, pendingSub: null }),
              },
              {},
            ],
            ArrowLeft: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null }) },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null }) },
          },
        },
        SUB_CROSSING: {
          schedules: { safeArea: { schedule: "300 millis", send: E.SafeAreaDue } },
          on: {
            HoverItem: { updateMemory: ({ event }) => ({ restingOn: event.key }) },
            EnteredSub: { target: S.OPEN.SUB_SHOWN, updateMemory: () => ({ restingOn: null }) },
            SafeAreaDue: {
              target: S.OPEN.ROOT,
              updateMemory: ({ memory }) => ({ sub: null, highlighted: memory.restingOn, restingOn: null }),
            },
            Escape: { target: S.OPEN.ROOT, updateMemory: () => ({ sub: null, restingOn: null }) },
          },
        },
      },
    },
  },
}));
```

The cost: a view-only flag becomes part of the server call's input and of the persisted Attempt. Here that is
harmless; where it isn't, keep a per-item table in memory instead. The subroutine variant (SUB_* as
`subroutine(...)`) would drop the `restingOn` and `pendingSub` clears. It is not shown because whether an exit
filling may write host memory (`highlighted` back on the trigger) is unspecified in @plan.Machines.O2.

### 2.3 Token input: a quiet schedule seals undo groups; the identity bug fixed

Two first-pass defects go. `draft: Flow.input` made every draft text a different persisted actor (H1); the input is
now an id. `open.at` stored epoch times that no clock rule covers across reload (H4); a 500 ms `armOn` schedule now
seals the group, which is built today. COMPOSING now guards writes too.

```ts
// contracts.ts: resolveMention as in the first pass (resource keyed by id)

// machine.ts
// user-defined: Token, Piece, Entry, Hist, record, mapTokens, writable
const Token = Schema.Struct({
  id: Schema.String, ref: Schema.String, label: Schema.String, status: Schema.Literal("ready", "pending"),
});
const Piece = Schema.Union(Schema.String, Token);
const Entry = Schema.Array(Piece);

const Prompt = definition({
  id: "Prompt/Input",
  persist: true,                                                       // existing (built)
  states: ["EDITING", "COMPOSING"],
  events: {
    Edit: { value: Entry, group: Schema.Literal("insert", "delete") },
    InsertToken: { value: Entry, token: Token, load: Schema.Boolean },
    RemoveToken: { id: Schema.String },
    Undo: {},
    Redo: {},
    Seal: {},
    CompositionStart: {},
    CompositionEnd: { value: Entry },
    Configure: { readOnly: Schema.Boolean },
  },
  internalEvents: {
    Quiet: {},
    Resolved: { id: Schema.String, label: Schema.String },
    ResolveFailed: { id: Schema.String },
  },
  memory: {
    promptId: Flow.input(Schema.String),                               // existing (Plan, T17): identity only
    readOnly: Flow.initial(Schema.Boolean, false),
    value: Flow.initial(Entry, []),
    entries: Flow.initial(Schema.Array(Entry), [[]]),
    index: Flow.initial(Schema.Number, 0),
    group: Flow.initial(Schema.NullOr(Schema.Literal("insert", "delete")), null),
    loading: Flow.initial(Schema.Array(Token), []),
  },
  operations: ({ E }) => ({
    mention: resolveMention.outcomes({
      value: E.Resolved.from((v: { readonly label: string }, { key }) => ({ id: key.id, label: v.label })),
      failure: {
        MentionMissing: E.ResolveFailed.from((_e, { key }) => ({ id: key.id })),
        Defect: E.ResolveFailed.from((_e, { key }) => ({ id: key.id })),
        Interrupted: Flow.ignore,                                       // existing (Plan, T21)
      },
    }),
  }),
});

type Hist = {
  readonly entries: ReadonlyArray<typeof Entry.Type>;
  readonly index: number;
  readonly group: "insert" | "delete" | null;
};
const record = (h: Hist, value: typeof Entry.Type, group: "insert" | "delete" | null) => {
  const kept = h.entries.slice(0, h.index + 1);
  const joins = group !== null && h.group === group;
  const entries = joins ? [...kept.slice(0, -1), value] : [...kept, value].slice(-101);
  return { entries, index: entries.length - 1, group };
};
const mapTokens = (value: typeof Entry.Type, f: (t: typeof Token.Type) => typeof Token.Type | null) =>
  value.flatMap((p): ReadonlyArray<typeof Piece.Type> => {
    if (typeof p === "string") return [p];
    const t = f(p);
    return t === null ? [] : [t];
  });
const writable = ({ memory }: { readonly memory: { readonly readOnly: boolean } }) =>
  !memory.readOnly || deny("ReadOnly");

export const PromptMachine = machine(Prompt, ({ S, E, O }) => ({
  default: S.EDITING,
  activities: [                                                        // existing (Plan, T21)
    O.mention.subscribe.each(({ memory }) => memory.loading.map((t) => ({ id: t.id, ref: t.ref }))),
  ],
  on: {
    Configure: { updateMemory: ({ event }) => ({ readOnly: event.readOnly }) },
    Resolved: {
      updateMemory: ({ memory, event }) => {
        const settle = (t: typeof Token.Type) =>
          t.id === event.id ? { ...t, label: event.label, status: "ready" as const } : t;
        return {
          loading: memory.loading.filter((t) => t.id !== event.id),
          value: mapTokens(memory.value, settle),
          entries: memory.entries.map((e) => mapTokens(e, settle)),
        };
      },
    },
    ResolveFailed: {
      updateMemory: ({ memory, event }) => {
        const drop = (t: typeof Token.Type) => (t.id === event.id ? null : t);
        return {
          loading: memory.loading.filter((t) => t.id !== event.id),
          value: mapTokens(memory.value, drop),
          entries: memory.entries.map((e) => mapTokens(e, drop)),
        };
      },
    },
  },
  states: {
    EDITING: {
      schedules: { quiet: { schedule: "500 millis", send: E.Quiet, armOn: ["Edit"] } },   // existing (built)
      on: {
        Edit: {
          guard: [writable],
          updateMemory: ({ memory, event }) => ({ value: event.value, ...record(memory, event.value, event.group) }),
        },
        Quiet: { updateMemory: () => ({ group: null }) },
        InsertToken: {
          guard: [writable],
          updateMemory: ({ memory, event }) => ({
            value: event.value,
            ...record(memory, event.value, null),
            loading: event.load ? [...memory.loading, event.token] : memory.loading,
          }),
        },
        RemoveToken: {
          guard: [writable],
          updateMemory: ({ memory, event }) => {
            const value = mapTokens(memory.value, (t) => (t.id === event.id ? null : t));
            return { value, ...record(memory, value, null) };
          },
        },
        Undo: {
          guard: [writable, ({ memory }) => memory.index > 0 || deny("NothingToUndo")],
          updateMemory: ({ memory }) => ({
            index: memory.index - 1,
            value: memory.entries[memory.index - 1],
            group: null,
          }),
        },
        Redo: {
          guard: [writable, ({ memory }) => memory.index < memory.entries.length - 1 || deny("NothingToRedo")],
          updateMemory: ({ memory }) => ({
            index: memory.index + 1,
            value: memory.entries[memory.index + 1],
            group: null,
          }),
        },
        Seal: { updateMemory: () => ({ group: null }) },
        CompositionStart: { guard: [writable], target: S.COMPOSING },
      },
    },
    COMPOSING: {
      on: {
        Edit: { guard: [writable], updateMemory: ({ event }) => ({ value: event.value }) },
        CompositionEnd: {
          guard: [writable],
          target: S.EDITING,
          updateMemory: ({ memory, event }) => ({ value: event.value, ...record(memory, event.value, null) }),
        },
      },
    },
  },
}));
```

A token's `id` comes from the event, which the view mints. A Story supplies fixed ids, so runs replay.

### 2.4 Number input: flat, on production today

Compound states and multi-step `Schedule`s are not needed. `armOn: [Flow.entry, "Tick"]` re-arms a Duration on
every tick. Bounds arrive by event, not `Flow.input` (H1). Everything below is built today.

```ts
// machine.ts
// user-defined: StepperMemory, sizeOf, next, canStep, stepped, commit, parse, press, release
const Direction = Schema.Literal(-1, 1);
const Size = Schema.Literal("step", "large", "small");

const Stepper = definition({                                          // existing (built)
  id: "Number/Stepper",
  states: ["IDLE", "HOLD_DELAY", "HOLD_REPEAT", "WHEELING"],
  events: {
    Configure: { min: Schema.Number, max: Schema.Number, step: Schema.Number, wheel: Schema.Boolean },
    Press: { direction: Direction, size: Size },
    Release: {},
    Cancel: {},
    Wheel: { direction: Direction },
    Typed: { text: Schema.String },
    Blur: {},
    Set: { value: Schema.NullOr(Schema.Number) },
  },
  internalEvents: { RepeatDue: {}, Tick: {}, WheelDue: {} },
  memory: {
    min: Flow.initial(Schema.Number, 0),                              // existing (built)
    max: Flow.initial(Schema.Number, 100),
    step: Flow.initial(Schema.Number, 1),
    wheel: Flow.initial(Schema.Boolean, false),
    value: Flow.initial(Schema.NullOr(Schema.Number), null),
    text: Flow.initial(Schema.String, ""),
    startValue: Flow.initial(Schema.NullOr(Schema.Number), null),
    committed: Flow.initial(Schema.NullOr(Schema.Number), null),
    direction: Flow.initial(Direction, 1),
    size: Flow.initial(Size, "step"),
  },
});

type StepperMemory = {
  readonly min: number; readonly max: number; readonly step: number; readonly value: number | null;
  readonly startValue: number | null; readonly committed: number | null;
  readonly direction: -1 | 1; readonly size: "step" | "large" | "small";
};
const sizeOf = (m: StepperMemory) => (m.size === "large" ? m.step * 10 : m.size === "small" ? m.step / 10 : m.step);
const next = (m: StepperMemory) => {
  const raw = (m.value ?? 0) + m.direction * sizeOf(m);
  return Math.min(m.max, Math.max(m.min, Math.round(raw / sizeOf(m)) * sizeOf(m)));
};
const canStep = (m: StepperMemory) => m.value === null || next(m) !== m.value || deny("AtBound");
const stepped = (m: StepperMemory) => ({ value: next(m), text: String(next(m)), startValue: m.startValue ?? m.value });
const commit = (m: StepperMemory) => ({
  committed: m.startValue !== null && m.value !== m.startValue ? m.value : m.committed,
  startValue: null,
});
const parse = (m: StepperMemory, text: string) => {
  const n = Number(text);
  return text.trim() !== "" && Number.isFinite(n) && n >= m.min && n <= m.max ? n : null;
};

export const StepperMachine = machine(Stepper, ({ S, E }) => {       // existing (built)
  const release = { target: S.IDLE, updateMemory: ({ memory }: { readonly memory: StepperMemory }) => commit(memory) };
  return {
    default: S.IDLE,
    on: {
      Configure: {
        updateMemory: ({ event }) => ({ min: event.min, max: event.max, step: event.step, wheel: event.wheel }),
      },
      Set: {
        updateMemory: ({ event }) => ({
          value: event.value, text: event.value === null ? "" : String(event.value), startValue: null,
          committed: event.value,
        }),
      },
    },
    states: {
      IDLE: {
        on: {
          Press: {
            guard: [({ memory, event }) => canStep({ ...memory, direction: event.direction, size: event.size })],
            target: S.HOLD_DELAY,
            updateMemory: ({ memory, event }) => ({
              ...stepped({ ...memory, direction: event.direction, size: event.size }),
              direction: event.direction,
              size: event.size,
            }),
          },
          Wheel: {
            guard: [
              ({ memory }) => memory.wheel || deny("WheelOff"),
              ({ memory, event }) => canStep({ ...memory, direction: event.direction, size: "step" }),
            ],
            target: S.WHEELING,
            updateMemory: ({ memory, event }) => ({
              ...stepped({ ...memory, direction: event.direction, size: "step" }),
              direction: event.direction,
              size: "step",
            }),
          },
          Typed: {
            updateMemory: ({ memory, event }) => {
              const parsed = parse(memory, event.text);
              return parsed === null
                ? { text: event.text }
                : { text: event.text, value: parsed, startValue: memory.startValue ?? memory.value };
            },
          },
          Blur: {
            updateMemory: ({ memory }) => ({
              ...commit(memory),
              text: memory.value === null ? "" : String(memory.value),
            }),
          },
        },
      },
      HOLD_DELAY: {
        schedules: { delay: { schedule: "400 millis", send: E.RepeatDue } },       // existing (built): on entry
        on: { RepeatDue: S.HOLD_REPEAT, Release: release, Cancel: release },
      },
      HOLD_REPEAT: {
        schedules: { repeat: { schedule: "60 millis", send: E.Tick, armOn: [Flow.entry, "Tick"] } },
        on: {
          Tick: [
            { guard: [({ memory }) => canStep(memory)], updateMemory: ({ memory }) => stepped(memory) },
            release,
          ],
          Release: release,
          Cancel: release,
        },
      },
      WHEELING: {
        schedules: { settle: { schedule: "300 millis", send: E.WheelDue, armOn: [Flow.entry, "Wheel"] } },
        on: {
          Wheel: {
            guard: [({ memory, event }) => canStep({ ...memory, direction: event.direction, size: "step" })],
            updateMemory: ({ memory, event }) => ({
              ...stepped({ ...memory, direction: event.direction, size: "step" }),
              direction: event.direction,
            }),
          },
          WheelDue: release,
          Blur: release,
        },
      },
    },
  };
});
```

The view sends `Cancel` from its effect cleanup, so a shared stepper never keeps repeating after its field leaves
(H3).

## 3. Holes the survey found

| Id | Hole                                                           | Reach    | Handling                         |
| -- | -------------------------------------------------------------- | -------- | -------------------------------- |
| H1 | `Flow.input` is identity; a changing prop in it is a new actor | general  | convention: props by event       |
| H2 | raising a host event into every `.each` copy is unspecified    | general  | Plan clarification (decision 2)  |
| H3 | a shared actor mid-gesture resumes timers after its view left  | general  | convention: cancel on cleanup    |
| H4 | timestamps in memory escape the reload and SSR clock rules     | narrow   | convention: prefer schedules     |
| H5 | an app-wide actor nobody uses drops sends (`NoRecord`)         | general  | the Plan's rule: use it at root  |
| H6 | a level fact (`focused: "x"`) does not re-fire on repeat       | general  | convention: a request with an id |
| H7 | reload is an app Story step only; machine Stories cannot       | fixtures | reloading fixtures are app ones  |

- **H1.** "A machine's input fields are read-only ... since they name the actor" (@plan.Machines.O1). "Changing
  local machine or input requires a keyed remount" (@plan.React.O2). The first pass put `readOnly` (4.2), `min`,
  `max`, `step` and `wheel` (4.5) and the draft text (4.7) in `Flow.input`. The fix uses existing features:
  identity in `Flow.input`, props in memory, and a `Configure` event sent from a React effect on change. XState
  v5's `input` is read once in the same way, and its guidance is to send events when props change.
- **H2.** `T.each({ of, max, by? })` and "Select the parts: walk raises, the child transitions they select"
  (@plan.Machines.O1, O3) never say whether one raise or host event reaches all copies. `max` has no stated meaning
  either. Scenarios that need "to all copies":
  - upload manager pause all (S03);
  - ticket panels saving every field on leave (S29);
  - a toaster pausing every countdown (4.3);
  - inbox mark all read (S18 rows as copies);
  - a kanban column cancelling its cards' moves (S22);
  - thermostats taking a whole-house setback (S23).

  Six unrelated scenarios.
- **H3.** "During the grace ... schedules wait" and "while nothing uses it, its schedules wait" (@plan.React.O3,
  @plan.Runtime.O3). A shared stepper in HOLD_REPEAT, or a tree in MOVING, resumes when a view comes back. Local
  actors end after the grace, so only shared ones are hit. The convention is that a view which starts a gesture
  ends it in its effect cleanup.
- **H4.** @plan.ServerRendering.O5 adjusts resource ages and schedule deadlines, not memory. A `countingSince`
  that crosses a hydration or a clock change gives negative spent time. The toaster is neither persisted nor
  server-rendered, so it is safe. The token input's `open.at` was the real case, and §2.3 removes it. The rule:
  when a duration can be a schedule, make it one.
- **H5.** A send to an ended, non-persisted actor is dropped (`NoRecord`, @plan.Runtime.O4), and "retain does not
  exist: an actor that must outlive a screen is used from where it should live" (@plan.Runtime.O3). The toaster,
  a connection status and a notifications counter are used from the root layout. This is already the Plan's answer.
- **H6.** "Selected values compare with Equal.equals" (@plan.React.O4). Focusing "the next toast" twice in a row
  with the same id does not re-run an effect, and a persisted `focused` is re-applied after reload. A request
  `{ target, id }` whose id increases fixes the first. A view that remembers the last id it applied fixes the
  second.
- **H7.** Testing O1 lists `reload`, `openTab` and `closeTab` under app Stories only. The tree and token Stories
  with reload must be app Stories. No change is needed.

## 4. Generality test, gap by gap

Reach counts three pools: the catalogue's S01 to S29, the 15 ui-sdk primitives not chosen, and ten app patterns
(editor, chat, checkout, dashboard, offline sync, media player, wizard, video call, form autosave, game timer). The
app-pattern rows are judgment, not repo evidence. "Behaviour reach" counts scenarios that have the behaviour.
"Feature need" counts those that cannot be written without the feature.

### G1. A schedule that pauses and keeps its time left

- **Expressible:** yes. §2.1 keeps `remaining` and `countingSince` in memory and arms one timer while anything
  counts. Built today with two flat states, or shorter with planned `keys`.
- **Behaviour reach (7):** toaster, carousel autoplay, game timer, media ad countdown, slideshow, quiz question
  timer with pause, workout interval timer.
  - Not this behaviour: S24 timed exam keeps a wall-clock deadline, the opposite. S07 polling and S20 player ticks
    re-arm instead.
- **Feature need:** 0.
- **Prior art:**
  - XState v5 delayed transitions cannot pause; the common answer keeps elapsed time in context.
  - Effect's `Effect.sleep` and `Schedule` have no pause; a fiber is interrupted and restarted.
  - Toast libraries such as react-hot-toast and Sonner keep remaining-time arithmetic in their own state.
  - Web Animations has `pause()`, but for animation, not logic.
- **Verdict:** convention, no feature. A `pauseOn` would not even remove `settle`, because elapsed time must still
  be banked in memory for the view's progress bar.

### G2. A keyed schedule's function receiving its key

- **Expressible:** yes, in two ways.
  - One timer for the soonest key (§2.1). This fits whenever firing order matters more than identity.
  - `.each` copies (@plan.Machines.O1), each with an unkeyed schedule over its own memory; a copy's callback port
    reports the expiry to the host (@plan.Machines.O2).

  Only the keyed form is shorter.
- **Behaviour reach (8):** per-type toast durations, seat or cart holds with their own expiry, reminders and
  snooze, auction end times, disappearing messages, Retry-After per key, an OTP resend cooldown per channel, and
  dashboard widgets with their own refresh rates.
  - Every keyed duration in the catalogue is constant: S07, S15, S23, S28 and S29.
- **Feature need:** 0.
- **Prior art:**
  - XState v5 `delays` are functions of `{ context, event }`, and per-item timers live in spawned child actors.
  - BullMQ gives each job its own delay.

  Both map to `.each`.
- **Verdict:** no feature. It is the closest call, since @plan.Machines.O5 already passes `key` to `restartOn` and
  send metadata. Decision 3 offers it as a consistency amendment, recommended against.

### G3. Gesture state kept out of a restored record

- **Expressible:** yes. The gesture lives where it belongs, either in the view (pointer state) or in a local actor
  (`useActor`, not persisted, @plan.Persistence.O2). The persisted actor receives only the result. A local actor
  cannot be a send target (@plan.Runtime.O3), so the view relays Drop. See decision 4.
- **Behaviour reach (6):**
  - tree move and resizable drag;
  - wizard (S06) with a confirm dialog open;
  - editor with a find bar open;
  - checkout with a payment sheet open;
  - kanban (S22) mid-drag.
- **Feature need:** 0.
- **Prior art:**
  - Zustand's `partialize` and redux-persist's blacklist exclude fields.
  - XState's `getPersistedSnapshot` saves the whole snapshot.

  Field exclusion breaks Flow's complete-capture rule (@plan.Persistence.O3): a restored state could lack the
  memory it needs, such as MOVING with no `moveStart`.
- **Verdict:** convention: persisted machines hold durable facts, and transient view state lives elsewhere.

### G4. Operation ports on fragments

- **Expressible:** yes. A reusable palette fragment declares its own `runCommand` contract, whose commit calls a
  service, `CommandsApi`. The app supplies that service as a Layer (@plan.Operations.O1, @plan.Runtime.O2).
  Endings reach the host through callback ports (@plan.Machines.O2).
- **Behaviour reach:** reuse only. Navigation menu, palette, toaster actions and any library fragment that runs an
  app action.
- **Feature need:** 0.
- **Prior art:** XState `machine.provide({ actors, actions })` swaps implementations. Effect's answer is services
  and Layers, which Flow already uses.
- **Verdict:** no feature.

### G5. A success mapper seeing its starting event

- **Expressible:** yes. Put the event's fields in the commit's input (§2.2). The mapper receives `{ input }`
  (@plan.Operations.O3).
- **Behaviour reach:** the menu's close-on-act, the navigation menu, and S03 and S16 (their ids already ride in
  the input).
- **Feature need:** 0.
- **Prior art:** TanStack Query's `onSuccess(data, variables)` hands back the input, not the event. XState's
  `invoke` takes `input` from the event, and `onDone` sees only the output.
- **Verdict:** no feature.

### G6. One-shot view commands (focus, scroll, announce)

- **Expressible:** yes. A memory request `{ target, id }` with an increasing id (§2.1, §2.2). The view applies it
  when the id is new.
- **Behaviour reach (11):**
  - focus after close: menu, toaster, dialog, navigation menu;
  - focus the first invalid field: checkout;
  - focus a new step: wizard;
  - scroll to the newest message: chat, S04;
  - announcements: combobox results, toasts;
  - return focus after a link dialog: editor;
  - focus the row a key reached: tree.
- **Feature need:** 0. The cost is one field per command kind, and a stale request after reload in a persisted
  machine (the view must remember the last applied id).
- **Prior art:**
  - XState v5 `emit()` with `actor.on(...)` is a view-event channel.
  - Elm sends focus as a command (`Browser.Dom.focus`).
  - React Aria keeps focus in the view (`FocusScope`).
- **Verdict:** convention now. It is the only gap with wide reach and real cost, so decision 5 asks whether to
  watch it in the demo.

### G7. Cross-tab live sync of a saved value

- **Expressible:** not inside Flow. A second tab saves and restores nothing (@plan.Persistence.O7), and the `Store`
  contract has no change feed (@plan.Persistence.O1). An app can bridge it: a `storage` or `BroadcastChannel`
  listener sends an event into a shared actor. That works because a shared actor is a send target.
- **Behaviour reach (5):** theme and preferences, logout across tabs (S13's session), a cart badge across tabs
  (S14 is one tab), unread counts, and feature flags.
- **Feature need:** 5. Every one of them, if Flow owns it.
- **Prior art:** TanStack Query's experimental `broadcastQueryClient`; Zustand and Redux leave it to app code with
  the `storage` event.
- **Verdict:** excluded by @plan.FlowState.C2 ("Exclude ... multi-tab sharing, sync engines"). This proposal does
  not reopen it; decision 6.

## 5. Recommendations, ranked by reach

Features that cannot be built today or as planned **and** that many unrelated scenarios need: **none.**

Plan changes that are not features:

1. **Clarify `.each` fan-out (H2)**, reach 6. Say in @plan.Machines.O1 whether a host event, or a raise addressed
   to a trait placed with `.each`, reaches every copy, and what `max` means. Settle it in @task.V3.T57. Pending is
   where an amendment would wait (@plan.Pending).

Conventions for fixture and demo code, each shown in §2:

- props by `Configure` event, never `Flow.input` (H1);
- view requests with an id (H6, G6);
- end a gesture on view cleanup (H3);
- prefer a schedule to a stored timestamp (H4);
- app-wide actors used from the root (H5);
- transient view state outside persisted machines (G3);
- view-only flags in the commit's input (G5);
- services for injected actions (G4);
- memory plus one conditional timer for pausable time (G1, G2).

Nothing goes to `revisit.md`.

## 6. Corrections to the first pass

| First pass                                             | Correction                                                 |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| 4.4: the commit cannot carry `closes`; decision 5      | it can, through the input (§2.2)                          |
| 4.3: per-toast keyed timers need NEW `key`; decision 5 | one conditional timer needs no key (§2.1)                 |
| 4.3: `pauseOn` would remove `settle`; decision 2       | it would not; banked time stays in memory                |
| decision 4: NEW non-restored state                     | a local actor or view state; no feature                   |
| decision 6: NEW operation ports                        | services already inject the action                        |
| 4.2: the Close veto needs a "NEW host port"            | `Flow.Guard` exists (@plan.Machines.O1)                   |
| 4.2, 4.5, 4.7: props in `Flow.input`                   | identity only; props by event (H1)                        |
| 4.7: `open.at` stored in memory                        | a quiet schedule (§2.3)                                   |
| 4.7: COMPOSING edits skip the read-only guard          | guarded (§2.3)                                            |
| 4.5: needs T17 and T57                                 | runs on production today, flat (§2.4)                     |

## 7. Decisions for the user

1. **Drop the first pass's NEW items.** **Recommended: yes.** Each one has a route above.

   ```ts
   // before (first pass, 4.3): NEW key argument, one timer per toast
   expire: { keys: ({ memory }) => counting(memory).map((t) => ({ id: t.id })),
     schedule: ({ key, memory }) => remainingOf(memory, key.id), send: E.Expired.from((m) => ({ id: m.key.id })) }
   // after (§2.1): existing (Plan, T57) keys; existing (built) computed schedule
   soonest: { keys: ({ memory }) => (anyCounting(memory) ? [{ timer: "soonest" }] : []),
     schedule: ({ memory }) => soonestLeft(memory), restartOn: ({ memory }) => countingStamp(memory), send: E.Due }
   ```

2. **Clarify `.each` fan-out in @plan.Machines.O1** (via @plan.Pending, settled in T57). **Recommended: yes.** It is
   the one general hole.

   ```ts
   // before: unspecified whether this reaches one copy, every copy, or is a construction error
   on: { PauseAll: { raise: ["uploads.Pause"] } }       // existing (Plan): raise; user-defined: uploads, Pause
   // after (proposed wording): a raise into a trait placed with .each reaches every live copy, in key order;
   // a copy's refusal refuses the whole turn, as for any addressed child (@plan.Machines.O3)
   on: { PauseAll: { raise: ["uploads.Pause"] } }
   ```

3. **A keyed schedule's function receiving `key`.** **Recommended: no.** One conditional timer or `.each` covers
   all eight scenarios, and the catalogue's keyed durations are all constant. Keep it out unless a fixture proves
   both routes awkward.

   ```ts
   // before (Plan): key reaches restartOn and send metadata only
   holds: { keys: ({ memory }) => memory.holds.map((h) => ({ id: h.id })), schedule: "15 minutes", send: E.Expire }
   // rejected after: schedule: ({ key, memory }) => dueOf(memory, key.id)  // NEW (proposed), not recommended
   ```

4. **Gesture state: a local actor or view state, never a persisted state.** **Recommended: yes**, as the tree and
   resizable convention.

   ```ts
   // before (first pass, 4.6): MOVING inside the persisted Files machine; a reload restores a half-done move
   states: ["BROWSING", "MOVING"]
   // after: the persisted tree keeps facts; the view (or a useActor local actor) holds the move and sends the result
   events: { Reorder: { nodes: Schema.Array(Node) } }   // user-defined; sent once on Drop
   ```

5. **One-shot view commands stay a convention.** **Recommended: yes**, with the demo watching how many request
   fields accumulate. Revisit only if the demo shows the same pain in many screens.

   ```ts
   // before (first pass): a level fact, which does not re-fire when repeated
   focusAfterClose: Flow.initial(Schema.NullOr(Schema.String), null)
   // after: a request with an increasing id; the view applies each id once
   focusRequest: Flow.initial(Schema.NullOr(Schema.Struct({ target: Schema.String, id: Schema.Number })), null)
   ```

6. **Cross-tab sync stays out of version 1** (@plan.FlowState.C2). **Recommended: yes.** An app that needs it
   bridges the browser event into a shared actor.

   ```ts
   // before: nothing; a second tab never hears the theme change
   // after (app code, not Flow): the view forwards the browser's event
   window.addEventListener("storage", (e) => e.key === "theme" && prefs.send({ _tag: "Synced", theme: e.newValue }))
   ```

7. **Props by event.** **Recommended: yes.** Fix 4.2, 4.5 and 4.7 when the fixtures are built.

   ```ts
   // before (first pass, 4.5): min: Flow.input(Schema.Number) — a new min is a new actor
   // after (§2.4): min: Flow.initial(Schema.Number, 0); Configure: { min, max, step, wheel } sent on prop change
   ```

## 8. Sidecar log

Four read-only Haiku sidecars (effort high): Plan survey half 1 (Machines, Operations, Runtime, Persistence,
EntityDomains), Plan survey half 2 (the other ten), scenario count, and an adversary expressing each gap. Each claim
used was checked against the Plan text or built code.

| Sidecar   | Claim                                                   | Log      | Why                                 |
| --------- | ------------------------------------------------------- | -------- | ----------------------------------- |
| survey 1  | the mapper gets `{ input }`; `closesOnActed` can go     | accepted | @plan.Operations.O3 mappers         |
| survey 1  | a trait's expiry cannot reach its host                  | rejected | callback fillings are transitions   |
| survey 1  | `.each` membership ends a pushed-out copy's time        | accepted | @plan.Machines.O3 membership        |
| survey 1  | raise fan-out to copies and `max` are unspecified       | accepted | silent in @plan.Machines.O1, O3     |
| survey 1  | `Flow.input` props reset the actor                      | accepted | @plan.Machines.O1, @plan.React.O2   |
| survey 1  | `draft: Flow.input` makes each draft its own actor      | accepted | @plan.Runtime.O3 identity           |
| survey 1  | a lookup subroutine forgets items on reopen             | accepted | slices undefined while inactive     |
| survey 1  | services cover a fragment running the app's action      | accepted | @plan.Operations.O1 services        |
| survey 1  | an app-wide toaster drops sends while unused            | changed  | true (@plan.Runtime.O4); now H5     |
| survey 2  | grace and Activity can't be driven from a Story         | changed  | local actors only; no fixture hole  |
| survey 2  | reload is app-only                                      | accepted | @plan.Testing.O1 step lists         |
| survey 2  | memory timestamps escape the hydration clock rules      | accepted | SSR O5: ages and schedules only     |
| survey 2  | a shared gesture resumes after unmount                  | accepted | @plan.React.O3, @plan.Runtime.O3    |
| survey 2  | Pending has no entry for any gap                        | accepted | read `Pending.plan`                 |
| survey 2  | COMPOSING skips the read-only guard                     | accepted | first-pass 4.7 sketch               |
| scenarios | G1 to G6 needed by 0 of 54 scenarios; G7 by preferences | changed  | kept zero; widened G7's reach       |
| scenarios | catalogue keyed durations are all constant              | accepted | S07, S15, S23, S28, S29 sketches    |
| adversary | G1 with one timer and a `2^31 - 1` sentinel             | changed  | `keys` or flat states, no sentinel  |
| adversary | G5 through the commit input                             | accepted | §2.2                                |
| adversary | G6 through a request with a sequence number             | accepted | §2.1, §2.2                          |
| adversary | the built mapper ignores its context today              | accepted | `machine.ts` passes `{}`; T21       |

The rejected claim rests on @plan.Machines.O2 ("A callback never moves the host out of the fragment's placement
node") and the Compile spec's "a fragment callback whose target moves the host": a callback port's filling is a host
transition. "Callbacks compute values only" in @plan.Machines.O1 is about the JavaScript functions in a machine's
configuration.
