# Fragment contract syntax: versions compared

Companion to [fragments.md](fragments.md). A fragment's contract is how its host gives it what it
needs and learns what happened. This file records the syntax versions tried, keeps two for
comparison (the original and the latest), and says which should stay. [fragments.md](fragments.md)
and [fragment-examples.md](fragment-examples.md) still use the original syntax.

## The versions tried

| Version               | Values in                     | Signals out                                                                                    | Ending a mounted fragment                      | Verdict                                                                                                                    |
| --------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 1. Slots and exits    | `slots: { delay: "value" }`   | `"action"`, `"activity"`, `"guard"` slots; `commitSlot(...)` with events like `"save.Success"` | `exits` and `X.Done`                           | Too many concepts; slot kinds are strings; operations run inside the fragment; needs `entry` actions and dotted event keys |
| 2. Inputs and outputs | `inputs` (Schemas)            | `outputs`, `Out.Saved`                                                                         | outputs whose host handler leaves the mount    | Removed I/O from fragments, but "output" and `Out` read as nothing in particular                                           |
| 3. Context and slots  | `context`                     | `slots`                                                                                        | slots whose host handler leaves the mount      | Wrong reuse: machine context means a value selected from a provider actor, not from a containing host                      |
| 4. Props and slots    | `props`                       | `slots`                                                                                        | slots whose host handler leaves the mount      | Two names for what React calls one thing                                                                                   |
| 5. Props only         | `props: { delay: prop<T>() }` | `props: { onSave: callback<P>() }`                                                             | a callback whose host handler leaves the mount | **Kept**                                                                                                                   |

What each step removed:

- **1 → 2:** fragments stop running operations. The host owns every subscription, commit and side
  effect; activity and commit slots disappear, and so do `entry` actions and dotted event keys.
- **2 → 3:** values are read in each callback, like memory, because they change over time; the
  build function runs once and only holds fixed structure (`S`, `E`).
- **3 → 4:** the name `context` returns to its one meaning.
- **4 → 5:** values and callbacks are both props, as in React. Exits stop being a separate concept:
  an exit is a callback whose host handler targets another state.
- **Throughout:** props and callbacks are plain TypeScript types, not Schemas. Schemas belong where
  data crosses a boundary that must be validated or encoded (events from outside, persisted memory,
  exported traces); props are computed and consumed in the same turn.

## The two kept for comparison

Both versions implement the same `AutoSave` fragment, mounted as `NOTE` in a notes machine. It
autosaves after a delay the host chooses, only while the user may edit, only if the server copy has
not changed underneath, through the host's save operation, tells the host when a save landed, and
hands control back on close or failure. The host definition is the same in both:

```ts
states: ["LIST", { NOTE: AutoSave(Schema.String, { empty: "" }) }, "ERROR"],
```

### Version 1: slots and exits (original)

```ts
export const AutoSave = <V extends Schema.Top>(value: V, p: { empty: V["Type"] }) =>
  fragment(
    {
      id: "AutoSave",
      states: ["EDITING", "SAVING"],
      events: { Changed: { value }, Close: {} },
      internalEvents: { Due: {} },
      memory: { draft: value, saved: value },
      initial: () => ({ draft: p.empty, saved: p.empty }),
      slots: {
        delay: "value",
        canSave: "guard",
        remote: "activity",
        saved: "action",
        save: commitSlot({ success: value, failures: { Rejected: { reason: Schema.String } } }),
      },
      exits: { Closed: {}, Failed: { reason: Schema.String } },
    },
    ({ S, E, X, slots }) => ({
      default: S.EDITING,
      activities: { server: slots.remote },
      on: { Close: X.Closed },
      states: {
        EDITING: {
          schedules: {
            autosave: {
              schedule: slots.delay,
              send: E.Due,
              restartOn: ({ memory }) => memory.draft,
            },
          },
          on: {
            Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.value }) },
            Due: {
              target: S.SAVING,
              guard: [
                slots.canSave,
                ({ activities, memory }) =>
                  activities.server?.data === memory.saved || deny("ChangedOnServer"),
              ],
            },
          },
        },
        SAVING: {
          entry: [slots.save],
          on: {
            "save.Success": {
              target: S.EDITING,
              updateMemory: ({ event }) => ({ saved: event.value }),
              actions: [slots.saved],
            },
            "save.Rejected": X.Failed.from(({ event }) => ({ reason: event.reason })),
          },
        },
      },
    }),
  );
```

```ts
// host machine
NOTE: {
  slots: {
    delay: ({ memory }) => memory.prefs.autosaveDelay,
    canSave: ({ context }) => context.canEdit || deny("ReadOnly"),
    remote: O.Notes.byId.subscribe(noteKey),
    saved: send(ToastsRef, Toasts.E.Push.from(() => ({ text: "Saved" }))),
    save: O.Notes.save
      .commit(({ memory }) => ({ ...noteKey({ memory }), body: memory.NOTE.draft }))
      .as({ ValidationFailed: "Rejected" }),
  },
  exits: {
    Closed: S.LIST,
    Failed: { target: S.ERROR, updateMemory: ({ event }) => ({ error: event.reason }) },
  },
},
```

### Version 5: props (latest)

```ts
export const AutoSave = <V>(value: Schema.Codec<V>, p: { empty: V }) =>
  fragment(
    {
      id: "AutoSave",
      states: ["EDITING", "SAVING"],
      events: { Changed: { value }, Close: {} },
      internalEvents: { Due: {}, Succeeded: { value }, Rejected: { reason: Schema.String } },
      memory: { draft: value, saved: value },
      initial: () => ({ draft: p.empty, saved: p.empty }),
      props: {
        delay: prop<Duration.Input>(), // a value the fragment reads
        server: prop<V | null>(),
        onSave: callback<{ value: V }>(), // something the fragment calls
        onSaved: callback<{ value: V }>(),
        onClose: callback(),
        onFailed: callback<{ reason: string }>(),
      },
    },
    ({ S, E, props }) => ({
      default: S.EDITING,
      on: { Close: { actions: [props.onClose] } },
      states: {
        EDITING: {
          schedules: {
            autosave: {
              schedule: ({ props }) => props.delay,
              send: E.Due,
              restartOn: ({ memory }) => memory.draft,
            },
          },
          on: {
            Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.value }) },
            Due: {
              target: S.SAVING,
              guard: ({ props, memory }) =>
                props.server === memory.saved || deny("ChangedOnServer"),
              actions: [props.onSave.from(({ memory }) => ({ value: memory.draft }))],
            },
          },
        },
        SAVING: {
          on: {
            Succeeded: {
              target: S.EDITING,
              updateMemory: ({ event }) => ({ saved: event.value }),
              actions: [props.onSaved.from(({ event }) => event)],
            },
            Rejected: { actions: [props.onFailed.from(({ event }) => event)] },
          },
        },
      },
    }),
  );
```

```ts
// host machine
const saveNote = O.Notes.save.commit(({ memory, event }) => ({ ...noteKey({ memory }), body: event.value }), {
  outcomes: {
    success: E.NOTE.Succeeded.from((note) => ({ value: note.body })),
    failure: { ValidationFailed: E.NOTE.Rejected.from((e) => ({ reason: e.message })) },
  },
});

NOTE: {
  activities: { note: O.Notes.byId.subscribe(noteKey) },
  guards: { Due: ({ context }) => context.canEdit || deny("ReadOnly") },
  props: {
    delay: ({ memory }) => memory.prefs.autosaveDelay,
    server: ({ activities }) => activities.note?.data?.body ?? null,
    onSave: { target: "self", actions: [saveNote] },
    onSaved: { target: "self", actions: [toastSaved] },
    onClose: S.LIST, // leaves the mount: what version 1 called an exit
    onFailed: { target: S.ERROR, updateMemory: ({ event }) => ({ error: event.reason }) },
  },
},
```

## Review: which stays

**Version 5 stays.** Compared with version 1:

|                                 | Version 1                                               | Version 5                                                           |
| ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Concepts in the contract        | slots (five kinds), exits                               | props (values and callbacks)                                        |
| How kinds are declared          | strings and a special constructor                       | `prop<T>()` and `callback<P>()`                                     |
| Where I/O lives                 | partly inside the fragment (activity and commit slots)  | only in the host                                                    |
| New rules for machines          | `entry` actions, dotted event keys, slot outcome events | none                                                                |
| Host policy on a fragment event | a guard slot the fragment must anticipate               | `guards: { Due: … }` on the mount, which any fragment event accepts |
| Ending a mounted fragment       | `exits`, mapped separately                              | a callback whose handler targets another state                      |
| Familiar model                  | none                                                    | React props and callbacks                                           |

What version 5 costs:

- **The host writes the commit's outcome mapping**, as it does for any commit today. Version 1's
  commit slot hid that behind `.as({...})`.
- **The fragment declares its own result events** (`Succeeded`, `Rejected`) for the host to map
  outcomes onto, instead of receiving them from a slot.

Static analysis is unchanged by version 5. A callback prop is resolved when the host is
constructed and merged with the host's handler into one transition, so the graph sees an ordinary
edge and a turn still has one publication. Value props are selectors read before the turn, like
guards. Types flow one way: the fragment declares its props, the definition places the fragment,
and the machine's bindings are typed from the definition.

## Still open

1. **A callback's target versus the fragment's target.** If a fragment transition targets one of
   its own states and calls a callback whose host handler targets a host state, which applies?
   Proposed: the host's target wins (that is what makes a callback an exit), and `flow check`
   errors when both are set.
2. **Unhandled callbacks.** Must every callback be bound? Proposed: callbacks that can leave the
   mount must be bound; others warn when unbound and otherwise do nothing.
3. **Helper names.** `prop<T>()` and `callback<P>()`, and whether callback names must start with
   `on`.
