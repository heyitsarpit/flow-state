# Machine fragments: traits and subroutines

Status: proposal, not part of version 1. Evaluated against [principles.md](principles.md). Where
this file and a plan differ, the plan wins.

**What is settled:** the composition system is built from **fragments**, and fragments come in two
kinds, **traits** and **subroutines**, with the rules in sections 2 to 6. **What is not settled:**
every line of syntax. All code here is a working draft that shows the rules in one place; section 9
lists what is still open. Rules carried from the single-fragment proposal (prior art, not accepted;
[fragments.md](../fragments.md) section 13) cite its decision numbers, as "prior art D6".

## 1. The idea in one paragraph

A fragment is behaviour written once and placed into a machine when the machine is constructed. It
adds memory, events, schedules and transitions under an **instance name**, and the host stays one
actor with one mailbox, one turn and one plain snapshot. A **trait** is something the actor _has_:
always present, with no states of its own, and it never ends. A **subroutine** is something the
actor _goes into_: placed as one of the host's states, it may have states of its own, starts fresh
every time it is entered, and ends by returning one of its declared **exits**. Both declare a
contract: what they need from the host (values, callbacks, guards) and, for subroutines, how they
can end. The host supplies what is declared and cannot reach inside.

## 2. The two kinds

|                                    | Trait                                          | Subroutine                                                   |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| The actor…                         | _has_ it                                       | _goes into_ it                                               |
| Examples                           | field, toggle, cycle, stepper, draft, undo, debounce, cooldown, flash, pagination, search box, stopwatch | confirm, picker, hold to confirm, type to confirm, commit with retry, wizard step, two-factor, upload, poll, autosave |
| Placed in the host definition      | `embeds: { title: TitleField }`                 | `states: [{ DELETE_ASK: Confirm }]`                           |
| Instance name                      | the `embeds` key (`title`)                      | the state's name (`DELETE_ASK`)                               |
| States of its own                  | none (one active leaf per actor)               | allowed; they appear under its state (`SAVE.BACKOFF`)        |
| Lives                              | as long as the host                            | while the host is in its state                               |
| Memory                             | starts once, kept for the host's life          | fresh on every entry, removed on leaving                     |
| Schedules                          | run whenever the host runs                     | stop when its state is left                                  |
| Late operation results             | delivered                                      | rejected if they belong to an earlier entry                  |
| Ends                               | never                                          | only by taking one of its exits                              |
| Callback handlers in the host      | may act and may target host states             | may act, never target                                        |

One question decides the kind, and it is answered once, when the fragment is written: **does the
actor have it, or go into it?** The types refuse the other placement.

## 3. The contract

Everything a fragment needs or offers is declared by the fragment (prior art D6). The host adapts.

| Declared by the fragment | Kind of declaration             | Draft syntax                         | The host supplies                          |
| ------------------------ | ------------------------------- | ------------------------------------ | ------------------------------------------ |
| A value it reads         | value prop                      | `start: prop<string>()`              | a function of the host's snapshot          |
| A moment the host may act on | callback prop               | `onSettled: callback<{ value }>()`   | a handler: actions, memory updates, raises |
| A check only the host can make | guard prop                | `canEdit: guard()`                   | a guard returning `true` or `deny(code)`   |
| How it can end (subroutines) | exits                       | `exits: { Picked: { id }, Cancelled: {} }` | a host state, or a handler that targets one |

Rules:

1. **Values are read per callback,** as `({ props })`, like `memory`; they can change over time.
2. **Callbacks only ask.** A fragment calls `props.onX` (or `props.onX.from(f)` with a payload) in
   `actions`; the host's handler decides what happens. In a subroutine, callbacks never move the
   actor (prior art D5); only exits do.
3. **Guards are declared where refusal is safe** (prior art D10). Only the fragment knows which
   events may be refused: a hold-to-confirm can refuse `Press` but must always accept `Release`.
   The host writes the policy; the fragment decides where it applies. A host cannot add a check the
   fragment did not declare; the fix is to change the fragment.
4. **Exits are taken, never sent** (prior art D5, D7). A subroutine takes `exits.Picked` as a
   transition; no view, actor or host can produce an exit. The host maps every exit, and a missing
   one is a type error.
5. **Fragments do no I/O.** The host runs every operation and maps every outcome, including
   unknown, interrupt and defect, into the fragment's internal events or its own.

## 4. Encapsulation

1. **The host cannot reach inside** (prior art D9). It cannot handle a fragment's events in its own
   `on`, raise its internal events, write its memory, or change its transitions. It reaches a
   fragment only through what the fragment declares.
2. **Only the host sends into its fragments; anyone may read them** (prior art D11). A view or other
   actor sends the host's own events; the host forwards them. A fragment's memory and states are
   readable from outside (`s.memory.title.value`, `S.DELETE_ASK.is(s)`) and writable by nothing but
   the fragment.
3. **Internal events are the fragment's own.** Schedules inside the fragment and the host's
   operation outcome mappings produce them; nothing else does.
4. **Each level hides the one below** (prior art D1–D3, D9). A fragment that contains fragments
   supplies their props itself, so its host sees only its contract. Nested names stay readable
   (`memory.title.check.seq`) but are never writable.

## 5. Where things go

| What                                  | Where                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Placing a trait                       | host **definition**, `embeds`                                          |
| Placing a subroutine                  | host **definition**, `states`                                          |
| Supplying a trait's props             | host **machine**, `embeds.<name>.props`                                |
| Supplying a subroutine's props        | host **machine**, on the subroutine's state: `states.<NAME>.props`     |
| Mapping a subroutine's exits          | host **machine**, on the subroutine's state: `states.<NAME>.exits`     |
| Forwarding host events into a fragment | host **machine**, `on` with `raise` (draft; open)                     |
| The host's own logic                  | host **machine**, `on` and `states`                                    |

Placement is structure (it produces `S`, `E` and the UI's types), so it is in the definition.
Supplying is behaviour (it refers to `S`, `E` and `O`), so it is in the machine.

## 6. Lifecycle guarantees (subroutines)

These come from the kind; no author writes them.

1. **Fresh on entry.** Memory comes from `initial` every time the state is entered.
2. **Stopped on leaving.** Schedules and anything waiting inside stop when the state is left.
3. **Late results rejected.** Each entry has a generation; an operation outcome mapped into the
   subroutine from an earlier entry is dropped and reported to inspection.
4. **Entered at the start.** From outside, only the subroutine's state can be targeted
   (`S.DELETE_ASK`), never one of its inner states, so it always starts from its default state.

## 7. Full example (draft syntax)

A ticket editor with a title field (a trait, containing a debounce trait), a delete confirmation
(a subroutine) and a delete that retries while the ticket is locked (a subroutine with states).

```ts
// fragments.ts
import { trait, subroutine, prop, callback, guard, deny } from "flow-state";
import { Schema, Duration } from "effect";

// ── Debounce (trait): fires once, `wait` after the last Input ───────────────
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      events: { Input: {} },
      internalEvents: { Due: {} },
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      props: { onSettled: callback() },
    },
    ({ E, props }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.seq },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ seq: memory.seq + 1 }) },
        Due: { target: "self", actions: [props.onSettled] },
      },
    }),
  );

// ── TitleField (trait): a value, a guard, and a debounced "settled" signal ──
export const TitleField = trait(
  {
    id: "TitleField",
    embeds: { check: Debounce({ wait: "300 millis" }) },   // a trait inside a trait
    events: { Set: { value: Schema.String } },
    memory: { value: Schema.String },
    props: {
      start: prop<string>(),
      onSettled: callback<{ value: string }>(),
      canEdit: guard(),
    },
    initial: ({ props }) => ({ value: props.start }),
  },
  ({ E, props }) => ({
    embeds: {
      // TitleField supplies its child's props; its host never sees Debounce's contract
      check: {
        props: {
          onSettled: { actions: [props.onSettled.from(({ memory }) => ({ value: memory.value }))] },
        },
      },
    },
    on: {
      Set: {
        target: "self",
        guard: props.canEdit,
        updateMemory: ({ event }) => ({ value: event.value }),
        raise: [E.check.Input],
      },
    },
  }),
);

// ── Confirm (subroutine): one state, two ways out ───────────────────────────
export const Confirm = subroutine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },
  },
  ({ exits }) => ({
    on: {
      Yes: exits.Confirmed,
      No: exits.Declined,
    },
  }),
);

// ── CommitWithRetry (subroutine): sends, backs off while busy, gives up ─────
export const CommitWithRetry = (p: { maxRetries: number; backoff: Duration.Input }) =>
  subroutine(
    {
      id: "CommitWithRetry",
      states: ["SENDING", "BACKOFF"],
      internalEvents: { Succeeded: {}, Busy: {}, Retry: {} },
      memory: { attempts: Schema.Int },
      initial: () => ({ attempts: 0 }),
      props: { onSend: callback() },
      exits: { Done: {}, GaveUp: {} },
    },
    ({ S, E, props, exits }) => ({
      default: S.SENDING,
      states: {
        SENDING: {
          on: {
            Succeeded: exits.Done,
            Busy: [
              {
                target: exits.GaveUp,
                guard: ({ memory }) => memory.attempts >= p.maxRetries || deny("RetriesLeft"),
              },
              { target: S.BACKOFF, updateMemory: ({ memory }) => ({ attempts: memory.attempts + 1 }) },
            ],
          },
        },
        BACKOFF: {
          schedules: { retry: { schedule: p.backoff, send: E.Retry } },
          on: { Retry: { target: S.SENDING, actions: [props.onSend] } },
        },
      },
    }),
  );
```

```ts
// ticket-editor.definition.ts: structure
import { definition } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm, TitleField } from "./fragments";

export const TicketEditor = definition({
  id: "Desk/TicketEditor",
  states: [
    "VIEWING",
    { DELETE_ASK: Confirm },
    { DELETING: CommitWithRetry({ maxRetries: 3, backoff: "2 seconds" }) },
    "DELETED",
  ],
  embeds: { title: TitleField },
  events: {
    Delete: {},
    SetTitle: { value: Schema.String },
    ConfirmDelete: {},
    CancelDelete: {},
  },
  input: { ticketId: Schema.String, title: Schema.String, locked: Schema.Boolean },
  memory: { ticketId: Schema.String, original: Schema.String, locked: Schema.Boolean },
  initial: ({ input }) => ({ ticketId: input.ticketId, original: input.title, locked: input.locked }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-editor.machine.ts: behaviour
import { machine, deny } from "flow-state";
import { TicketEditor } from "./ticket-editor.definition";

export const TicketEditorMachine = machine(TicketEditor, ({ S, E, O }) => {
  const checkTitle = O.Tickets.titleTaken.refetch(({ payload }) => ({ title: payload.value }));
  const deleteTicket = O.Tickets.delete.commit(({ memory }) => ({ ticketId: memory.ticketId }), {
    outcomes: {
      success: E.DELETING.Succeeded,
      failure: { TicketLocked: E.DELETING.Busy },
    },
  });

  return {
    default: S.VIEWING,
    embeds: {
      title: {
        props: {
          start: ({ memory }) => memory.original,
          onSettled: { actions: [checkTitle] },
          canEdit: ({ memory }) => !memory.locked || deny("Locked"),
        },
      },
    },
    on: {
      SetTitle: { target: "self", raise: [E.title.Set.from(({ event }) => ({ value: event.value }))] },
    },
    states: {
      VIEWING: { on: { Delete: S.DELETE_ASK } },
      DELETE_ASK: {
        on: {
          ConfirmDelete: { target: "self", raise: [E.DELETE_ASK.Yes] },
          CancelDelete: { target: "self", raise: [E.DELETE_ASK.No] },
        },
        exits: { Confirmed: S.DELETING, Declined: S.VIEWING },
      },
      DELETING: {
        props: { onSend: { actions: [deleteTicket] } },
        exits: { Done: S.DELETED, GaveUp: S.VIEWING },
      },
      DELETED: {},
    },
  };
});
```

```tsx
// a component: sends the host's events, reads fragments directly
editor.send(TicketEditor.E.SetTitle({ value: "New title" }));
editor.send(TicketEditor.E.Delete());
editor.send(TicketEditor.E.ConfirmDelete());
// editor.send(TicketEditor.E.title.Set({ value: "x" }));   // type error: only the host sends into title
useView(editor, (s) => s.memory.title.value);
useView(editor, (s) => TicketEditor.S.DELETING.BACKOFF.is(s));
useView(editor, (s) => s.memory.DELETING?.attempts);       // present only while DELETING
```

The first entry into `DELETING` does not send yet: how the first `onSend` happens without entry
actions is open (section 9, async results).

### Keywords in the draft

| Kind                       | Words                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New                        | `trait`, `subroutine`, `embeds`, `exits`, `props`, `prop`, `callback`, `guard()`, `.from`, `payload` (a callback's or exit's data), `raise` (open)                                      |
| Existing in the plans      | `definition`, `machine`, `states`, `events`, `internalEvents`, `memory`, `initial`, `input`, `operations`, `default`, `on`, `target`, `guard`, `updateMemory`, `actions`, `schedules`, `restartOn`, `outcomes`, `deny`, `S`, `E`, `O` |
| Author-chosen              | every other name (`Debounce`, `title`, `DELETE_ASK`, `onSettled`, `canEdit`, `Confirmed`, …)                                                                                             |

## 8. Against the problems in principles.md

| Problem                               | How this proposal answers it                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| L1 stale timers                       | prevented for subroutines (stopped on leaving); traits' timers live with the host by design     |
| L2 late results                       | prevented for subroutines (generations)                                                         |
| L3 leftover memory                    | prevented for subroutines (fresh on entry); traits keep memory by design                        |
| L4 no way out                         | **open**: whether the host may always leave a subroutine's state with its own event            |
| E1 broken invariants                  | prevented: no reaching inside; guards only where the fragment declared them                     |
| E2 interfaces growing with depth      | prevented: each level supplies its children's props; names readable, never writable             |
| E3 hidden endings                     | prevented: only exits end a subroutine, and they are written in the subroutine                  |
| H1 bypassed policy                    | prevented: only the host sends into fragments                                                   |
| H2 unforeseen checks                  | allowed, by choice: the fix is to declare the guard in the fragment                             |
| H3 faked results                      | prevented: exits are never sendable; internal events come only from the fragment and outcome mappings |
| D1 drifting copies                    | prevented: fragment memory is readable, so nothing is copied                                    |
| D2, D3 live values, feedback loops    | **open**: async results (section 9)                                                             |
| D4 unmapped outcomes                  | the host maps every outcome; exhaustiveness rules are open with async results                    |
| A1 forwarding that compounds          | **allowed today**: each level re-declares and forwards; `exposes` is open                       |
| A2 blocks that look unrelated         | **open**: inputs (`on` + `raise`) and exits sit apart                                            |
| A3 conditional rules                  | prevented: each kind has its own rules                                                          |
| A4 overloaded words                   | avoided: `trait` and `subroutine` are unused in the plans                                       |
| A5 I/O inside fragments               | prevented: fragments do no I/O                                                                  |
| A6 silence discovered late            | partly: missing exits are type errors; required versus optional props is open                  |

## 9. Open

In review order:

1. **Leaving a subroutine from outside (L4).** May the host always leave the subroutine's state
   with its own event (navigate away, cancel, log out), abandoning it with the section 6
   guarantees? Without it, `Poll` can never stop.
2. **Inputs through nesting (A1, A2).** Forwarding at every level with `on` + `raise`, a `forward`
   block, or `exposes` listing which inner events outsiders may send at their full path.
3. **How the host handles exits.** The `exits` block on the subroutine's state (draft), or `on`.
4. **Required and optional props (A6).** `.optional`, and what an unbound optional callback does.
5. **Schema or TypeScript types for prop shapes.** Events, memory and exits use Schema; props
   use TypeScript generics in the draft.
6. **`raise`:** its ordering within a turn and whether a fragment may raise into its children.
7. **Async results (D2, D3, D4):** how a subroutine's first send happens without entry actions,
   how outcomes reach a fragment, and capturing the confirmed request for retries.
8. **Testing a fragment alone:** running a trait or subroutine with supplied props, recording
   callback calls, exits taken and denials.
9. **Function names.** Whether `trait`, `subroutine` and `fragment` become functions, and the
   names of `embeds`, `props`, `prop`, `callback`, `guard()` and `exits`.
