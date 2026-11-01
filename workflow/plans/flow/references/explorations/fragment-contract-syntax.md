# Fragment contract syntax: decision record

How the fragment contract in [fragments.md](fragments.md) was chosen. The current baseline is
props plus exits: value props `prop<T>()`, callback props `callback<P>()`, and declared `exits`
(fragments.md section 14). Full examples live in
[fragment-examples.md](fragment-examples.md); this file keeps only the history and the reasons.

## Versions tried

| Version               | Values in                   | Signals out                                                                                    | Ending a mounted fragment                                       | Verdict                                                                                                           |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1. Slots and exits    | `slots: { delay: "value" }` | `"action"`, `"activity"`, `"guard"` slots; `commitSlot(...)` with events like `"save.Success"` | `exits` and `X.Done`                                            | Too many concepts; slot kinds as strings; I/O inside the fragment; needed `entry` actions and dotted outcome keys |
| 2. Inputs and outputs | `inputs` (Schemas)          | `outputs`, `Out.Saved`                                                                         | outputs whose host handler leaves                               | Removed I/O from fragments, but "output" and `Out` did not say what was happening                                 |
| 3. Context and slots  | `context`                   | `slots`                                                                                        | slots whose host handler leaves                                 | Wrong reuse: machine context means a value selected from a provider actor, not from a containing host             |
| 4. Props and slots    | `props`                     | `slots`                                                                                        | slots whose host handler leaves                                 | Two names for what React calls one thing                                                                          |
| 5. Props only         | `prop<T>()`                 | `callback<P>()`                                                                                | a callback whose host handler targets a state outside the mount | Superseded                                                                                                        |
| 6. Props and exits    | `prop<T>()`                 | `callback<P>()`, acting only                                                                   | declared `exits`, taken as `exits.Confirmed`                    | **Baseline** (fragments.md section 14)                                                                            |

## Why each step

- **1 → 2: fragments stop doing I/O.** The host owns every subscription, commit and side effect. A
  fragment asks through callbacks and learns results through its own internal events, which the
  host's outcome mappings target. Activity and commit slots, `entry` actions and dotted outcome
  keys disappear.
- **2 → 3: values are read per callback.** They change over time, so they are read like `memory`,
  as `({ props })`; the build function runs once and holds only fixed structure (`S`, `E`).
- **3 → 4: `context` keeps its one meaning**, a value selected from a provider actor.
- **4 → 5: values and callbacks are both props**, as in React. Exits stop being a separate concept:
  an exit is a callback whose host handler targets a state outside the mount.
- **Throughout: props are TypeScript types, not Schemas.** Schemas belong where data crosses a
  boundary that must be validated or encoded; props are computed and consumed within one turn.

## The same contract, before and after

Version 1 declared what the host must supply by kind, and ran the operation itself:

```ts
// fragment
slots: {
  delay: "value",
  canSave: "guard",
  remote: "activity",
  saved: "action",
  save: commitSlot({ success: value, failures: { Rejected: { reason: Schema.String } } }),
},
exits: { Closed: {}, Failed: { reason: Schema.String } },
// inside: SAVING: { entry: [slots.save], on: { "save.Success": …, "save.Rejected": X.Failed.from(…) } }

// host
NOTE: {
  slots: {
    delay: ({ memory }) => memory.prefs.autosaveDelay,
    canSave: ({ context }) => context.canEdit || deny("ReadOnly"),
    remote: O.Notes.byId.subscribe(noteKey),
    saved: toastSaved,
    save: O.Notes.save.commit(noteInput).as({ ValidationFailed: "Rejected" }),
  },
  exits: { Closed: S.LIST, Failed: { target: S.ERROR, updateMemory: ({ event }) => ({ error: event.reason }) } },
},
```

Version 5 declares values and callbacks, and the host does all I/O (full code in the catalogue's
`AutoSave`):

```ts
// fragment
internalEvents: { Due: {}, Succeeded: { value }, Rejected: { reason: Schema.String }, Uncertain: {} },
props: {
  loaded: prop<V>(),
  server: prop<V>(),
  delay: prop<Duration.Input>(),
  onSave: callback<{ value: V }>(),
  onSaved: callback<{ value: V }>(),
  onFailed: callback<{ reason: string }>(),
  onClose: callback(),
},

// host
NOTE: {
  props: {
    loaded: ({ memory }) => memory.body,
    server: ({ activities, memory }) => activities.note?.data?.body ?? memory.body,
    delay: ({ memory }) => memory.prefs.autosaveDelay,
    onSave: { actions: [saveNote] }, // saveNote maps success, failure and unknown onto E.NOTE.*
    onSaved: { actions: [toastSaved] },
    onFailed: { updateMemory: ({ payload }) => ({ error: payload.reason }) },
    onClose: { target: S.LIST },
  },
  guards: { Due: ({ context }) => context.canEdit || deny("ReadOnly") },
},
```

|                          | Version 1                                 | Version 5                                     |
| ------------------------ | ----------------------------------------- | --------------------------------------------- |
| Concepts in the contract | five slot kinds, exits                    | props: values and callbacks                   |
| Declaring kinds          | strings and a special constructor         | `prop<T>()`, `callback<P>()`                  |
| Where I/O lives          | partly inside the fragment                | only in the host                              |
| Host policy              | a guard slot the fragment must anticipate | `guards` injected into any fragment event     |
| Ending a mount           | `exits`, mapped separately                | a callback whose handler targets a host state |
| Familiar model           | none                                      | React props and callbacks                     |

## What version 5 costs

- **The host writes each commit's outcome mapping**, including `unknown`, as for any commit.
- **The fragment declares its own result events** for those mappings to target.
- **New machine rules are still needed**, not fewer: combined transitions with a stated order,
  injected guards, raising, and mount generations for fencing (fragments.md section 7). Version 5
  only removes the I/O-shaped ones from version 1 (`entry` actions, slot outcome events, dotted
  outcome keys).

## Version 6: exits come back

Under version 5 a fragment's handler said `target: "self"` while its host's callback handler moved
the actor out of the mount, so the fragment's code did not show that it ends. Version 6 restores
version 1's exits with a readable accessor (`exits.Confirmed` instead of `X.Confirmed`): only exits
end a mount, and callbacks only act. Reasons and rejected alternatives are D5 and D7 in
fragments.md section 13.
