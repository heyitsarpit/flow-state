# Proposal: `.each`, copies that follow a key list

Status: proposal, direction agreed by the user, under review. It answers [problem.md](problem.md) with candidate S1 from
[solutions.md](solutions.md), settles its three open questions (section 2), and models nine
real-world problems (section 3). It would replace proposal v4's rule 9 (`.list`). Syntax is v4's;
new words are marked `// new`.

## 1. The proposal

```ts
Trait.each(field, { key?, max? })   // new
```

- `field` names a memory field of the **same** definition or fragment that places the trait. It
  holds the keys: `ReadonlyArray<string>`, or `ReadonlyArray<Record>` with a string field named by
  `key`. The path is checked against the memory Schema (K6).
- **There is exactly one copy per key, in the field's order, in every published snapshot.**
  Membership is never commanded: the host adds and removes copies by writing its own field, in its
  own transitions, behind its own guards.
- `max` bounds the list. More keys than `max`, or a duplicate key, refuses the turn (`InvalidTurn`);
  the host's own guard gives the friendly reason. `max` is also how far Stories and `model()`
  explore.
- `.each` sits wherever a trait sits: the root's `traits`, or `Flow.state(…, { traits })`. On a
  node, copies live while the node is active; leaving ends them all and re-entering creates fresh
  ones from the keys (which, being host memory, are still there). `.resumable()` freezes them
  instead. A fragment may place `.each` over its own memory.

**Reading.** `s.memory.<name>` is the copies in key order, each `{ key, item?, …readable memory }`.
`item` is the host's element itself (same object, read-only) when the field holds records, so a view
never joins two lists. `s.schedules.<name>` is the same order, `{ key, …schedules }`.

**Addressing.**

- A view sends `E.<name>.key(k).Event(payload)`. A key not in the list is `Unhandled`.
- A host raise puts `key` in the mapper's result: `E.rows.Checked.from(({ event }) => ({ key: event.key, … }))`.
- **Every filling receives `key`** (and `item`): `input`, guards, callback handlers, their commit
  mappers. A commit started in a copy's filling remembers the key, and its outcome mappers receive
  it too: `success: E.Checked.from((r, { input, key }) => …)`.

**One filling for all copies**, in the machine as for any trait:

```ts
traits: {
  rows: {
    input: ({ key, item, memory }) => ({ … }),    // per-copy Flow.input fields
    resetOn: ({ item }) => item.version,           // optional, per copy
    guards: { … }, callbacks: { … },
  },
},
```

**Identity.** The key is public; a copy's life (its incarnation) is private. A delivery armed or
started under one life never reaches a later life of the same key: it is dropped with evidence, and
the rest of its turn commits (rule 8 holds). Incarnations appear only in Inspection and Stories
(`rows["row-2"]@1`), never in types, events or views.

**Removed from v4's rule 9:** built-in `Add` / `Remove`, minted keys, the `key` and `owner` options,
`canAdd` / `canRemove`, incarnations as API.

### 1.0 The whole idea in one example

Delete with undo in an inbox: deleting a message hides it at once and shows "Undo" for 5 seconds;
only then does the server delete run. Several can be pending, and any one can be undone. Lines
marked `// ← NEW` are the only new syntax; everything else is v4.

**The trait.** An ordinary v4 trait; it does not know it will have many copies.

```ts
// fragments.ts
import { Flow, trait } from "flow-state";
import { Duration } from "effect";

export const Undoable = (p: { window: Duration.Input }) =>
  trait(
    {
      id: "Undoable",
      events: { Undo: {} },                // the user clicks Undo
      internalEvents: { WindowOver: {} },  // the 5 seconds ran out
      callbacks: {
        onUndo: Flow.Callback({}),         // tells the host: keep the message
        onFinal: Flow.Callback({}),        // tells the host: delete it for real
      },
    },
    ({ E, callbacks }) => ({
      // Starts when the copy is created. Each copy has its own timer.
      schedules: { window: { schedule: p.window, send: E.WindowOver } },
      on: {
        Undo: { target: "self", notify: [callbacks.onUndo] },
        WindowOver: { target: "self", notify: [callbacks.onFinal] },
      },
    }),
  );
```

**The definition.** `.each("deleting")` means one copy per id in `deleting`. Add an id and a copy
appears; remove it and the copy, with its timer, is gone.

```ts
// inbox.definition.ts
import { definition, Flow } from "flow-state";
import { Schema } from "effect";
import { Mail } from "./mail.operations";
import { Undoable } from "./fragments";

export const Inbox = definition({
  id: "Mail/Inbox",
  states: ["READY"],
  events: { Delete: { id: Schema.String } },
  memory: {
    // Plain host data: the ids of messages waiting out their undo window.
    deleting: Flow.initial(Schema.Array(Schema.String), []),
  },
  traits: {
    undo: Undoable({ window: "5 seconds" }).each("deleting", { max: 50 }), // ← NEW: .each
  },
  operations: { Mail },
});
```

**The machine.** No `Add` or `Remove` events: the host edits its own array. One filling serves
every copy, and `key` says which copy is calling.

```ts
// inbox.machine.ts
import { deny, machine } from "flow-state";
import { Inbox } from "./inbox.definition";

export const InboxMachine = machine(Inbox, ({ S, O }) => ({
  default: S.READY,

  traits: {
    undo: {
      callbacks: {
        // The user undid: remove the id, so the copy and its timer are gone.
        onUndo: {
          target: "self",
          updateMemory: ({ memory, key }) => ({ deleting: memory.deleting.filter((id) => id !== key) }), // ← NEW: key
        },
        // Time ran out: remove the id and run the real delete.
        onFinal: {
          target: "self",
          updateMemory: ({ memory, key }) => ({ deleting: memory.deleting.filter((id) => id !== key) }), // ← NEW: key
          actions: [O.Mail.trash.commit(({ key }) => ({ id: key }))],                                      // ← NEW: key
        },
      },
    },
  },

  on: {
    // Adding a copy is adding an id. The host's own guard sets the rules.
    Delete: {
      target: "self",
      guard: ({ memory, event }) => !memory.deleting.includes(event.id) || deny("AlreadyDeleting"),
      updateMemory: ({ memory, event }) => ({ deleting: [...memory.deleting, event.id] }),
    },
  },
}));
```

**The view.**

```tsx
const deleting = useView(inbox, (s) => s.memory.deleting);
const undos = useView(inbox, (s) => s.memory.undo);          // one entry per copy, in order

const visible = messages.filter((m) => !deleting.includes(m.id));

{undos.map((u) => (
  <Snackbar key={u.key}                                        // ← NEW: key on each copy
    onUndo={() => inbox.send(E.undo.key(u.key).Undo())} />    // .key(k) already exists in v4
))}
```

Undo after the window closed is `Unhandled` (the id is gone), so `check()` disables the button.
Closing the tab mid-window: the ids and the armed deadline persist; on restore an overdue window
fires once and the delete runs.

**All the new syntax:**

| New | What it is |
| --- | --- |
| `.each(field, { key?, max? })` | place a trait once per entry of a memory field; `key` only when the field holds records; `max` caps the count |
| `key` (and `item`) in fillings | which copy is calling; `item` is the record itself when the field holds records |
| `key` (and `item`) on each copy in the view | `s.memory.undo[i].key` |

### 1.1 The turn (changes to v4 section 2.5)

Membership is reconciled **twice** per turn, so no snapshot ever shows a copy without a key or a key
without a copy:

1. **Before the walk** (step 3, with `resetOn`): pre-turn keys against the **source-updated** keys.
   - New key: a fresh copy, seeded lazily when first addressed. A source transition can add a key
     and raise into it in the same turn.
   - Removed key: the copy ends; its `onLeave` is fused into this turn, as v4 already does.
2. **At commit** (step 6, after patches): source-updated keys against the **committed** keys. This
   catches keys written by parts, such as a copy's own callback removing it.
   - New key: seeded from committed memory; its entry schedules armed.
   - Removed key: the copy is dropped and its schedules cancelled **in this commit**. Its `onLeave`,
     if filled, runs as a follow-up turn at the head of the mailbox (with pending resets), reading
     the copy's last memory.

A key removed and re-added inside **one** patch is unchanged. A key removed by the source and
re-added by a part is a new copy: two changes, two lives. A raise reaches only keys present in the
source-updated list; raising into a key that only a later part adds refuses the turn.

### 1.2 What does not break

| Constraint | How |
| --- | --- |
| **K2 static analysis, single graph** | The trait is analysed once and drawn as one node, "EmailRow × rowIds ≤ 5". The key field is a declared, typed path, not a runtime discovery. `flow check` checks the template and the host against its contract; Stories and `model()` explore up to `max` copies. |
| **K1 one turn** | Both reconciliations are inside the host's turn; a refusal anywhere refuses all of it. |
| **K3 no child actors** | Copies are traits. |
| **K4 one active leaf** | Copies have no states; a copy's mode is memory. |
| **K5 definition/machine** | `.each` and the key field are structure; `input`, fillings and membership writes are behaviour. |
| **K7 determinism** | Keys are host data, persisted and hydrated with it. Hosts mint keys from their own counters or domain ids (a lint flags `crypto.randomUUID()` in an update). |
| **K8 no fragment I/O** | Copies notify; the host commits, attributed to the copy's key. |
| **K9 locality** | Which copies exist is written on the placement; who may add or remove is written on the host's transitions. |

## 2. The open questions, settled

### Q1. A copy that removes itself: no lag

The problem: a toast's `onGone` callback removes its own key, but v4 reconciled part-written state
(`resetOn`) only in a follow-up turn, so one published snapshot showed a toast whose key was gone.

**Settled: removals and additions written by parts apply at commit** (1.1, second pass). Removal can
always be applied, because it cannot refuse; only `onLeave`, which may write host memory, needs its
own turn, and it reads a captured copy of the memory it needs. The invariant "one copy per key in
every snapshot" holds without exceptions, and S2's advantage (Céu-style self-removal) is gone.

Follow-up worth considering separately: the same commit-time pass would remove `resetOn`'s
one-snapshot lag for part-written values. Not part of this proposal.

### Q2. Where keys come from: host memory only

**Settled: a memory field of the placing definition or fragment.** Not a selector function (the
graph could not show what drives the copies, and it would run on every turn), not activity data
(it changes outside the turn, breaking K1 and K7).

Data from outside reaches the key list through ordinary host events: an activity's `value` outcome,
an `onContext` reaction, a commit's success. Examples 3.4 and 3.5 do this.

Modelling showed the more important rule: **copies are for items with live behaviour, not for every
item.** A table of 2,000 issues keeps its rows in an activity; only the three rows currently
flashing an error have copies (3.6). Plain rows need nothing (3.9).

### Q3. Keys: strings, held bare or in records

**Settled: keys are strings.** A key appears in event envelopes, Story names, persistence and React
`key` props, and strings are the only type that is the same in all four. Numeric ids are written
`String(id)`.

The list may hold bare keys (`rowIds: string[]`) or records with a key field
(`.each("notices", { key: "id" })`). Records keep the host's data and the membership in one place,
so there is nothing to keep in sync, and the copy's view carries the record as `item`.

## 3. Real-world problems, modelled

Shared helpers used below: `list.filter((id) => id !== key)`, `upsert(list, record)`, and
`const denialOf = (ok: boolean, code: string) => (ok ? null : deny(code))`.

### 3.1 Team invites: rows that check with the server as you type

Up to five email rows. Each validates on every keystroke and asks the server "already a member?"
400 ms after typing stops. Rows can be removed while a check is in flight.

```ts
// fragments.ts
export const EmailRow = trait(
  {
    id: "EmailRow",
    events: { Changed: { value: Schema.String } },
    hostEvents: { Checked: { value: Schema.String, taken: Schema.Boolean } },
    internalEvents: { Quiet: {} },
    callbacks: { onQuiet: Flow.Callback({ value: Schema.String }) },
    memory: {
      value: Flow.initial(Schema.String, ""),
      error: Flow.initial(Schema.NullOr(Flow.Denial), null),
      checking: Flow.initial(Schema.Boolean, false),
    },
  },
  ({ E, callbacks }) => ({
    schedules: { quiet: { schedule: "400 millis", send: E.Quiet, armOn: [E.Changed] } }, // debounce
    on: {
      Changed: {
        target: "self",
        updateMemory: ({ event }) => ({
          value: event.value,
          error: denialOf(event.value === "" || event.value.includes("@"), "NotAnEmail"),
          checking: false,
        }),
      },
      Quiet: [
        {
          target: "self",
          guard: ({ memory }) => (memory.value !== "" && memory.error === null) || deny("NothingToCheck"),
          updateMemory: () => ({ checking: true }),
          notify: [callbacks.onQuiet.from(({ memory }) => ({ value: memory.value }))],
        },
        { target: "self" },
      ],
      Checked: [
        // A result for an older value is ignored: the user has typed since.
        {
          target: "self",
          guard: ({ memory, event }) => event.value === memory.value || deny("Stale"),
          updateMemory: ({ event }) => ({ checking: false, error: denialOf(!event.taken, "AlreadyMember") }),
        },
        { target: "self" },
      ],
    },
  }),
);
```

```ts
// invite.definition.ts
export const Invite = definition({
  id: "Team/Invite",
  states: ["EDITING", "SENDING", "SENT"],
  events: { AddRow: {}, RemoveRow: { key: Schema.String }, Send: {} },
  internalEvents: { Checked: { key: Schema.String, value: Schema.String, taken: Schema.Boolean }, Sent: {} },
  memory: {
    rowIds: Flow.initial(Schema.Array(Schema.String), ["row-1"]),
    nextRow: Flow.private(Flow.initial(Schema.Int, 2)),
  },
  traits: { rows: EmailRow.each("rowIds", { max: 5 }) },   // new: .each
  operations: { Team },
});

// invite.machine.ts
export const InviteMachine = machine(Invite, ({ S, E, O }) => {
  const check = O.Team.isMember.commit(({ payload }) => ({ email: payload.value }), {
    outcomes: { success: E.Checked.from((r, { input, key }) => ({ key, value: input.email, taken: r.member })) }, // new: key
  });
  const send = O.Team.invite.commit(({ memory }) => ({ emails: memory.rows.map((r) => r.value).filter((v) => v !== "") }), {
    outcomes: { success: E.Sent },
  });
  return {
    default: S.EDITING,
    traits: { rows: { callbacks: { onQuiet: { target: "self", actions: [check] } } } },
    on: {
      // Routed by key. For a row removed meanwhile, this raise is dropped with evidence; the turn commits.
      Checked: { target: "self", raise: [E.rows.Checked.from(({ event }) => event)] },
    },
    states: {
      EDITING: {
        on: {
          AddRow: {
            target: "self",
            guard: ({ memory }) => memory.rowIds.length < 5 || deny("FiveAtMost"),
            updateMemory: ({ memory }) => ({ rowIds: [...memory.rowIds, `row-${memory.nextRow}`], nextRow: memory.nextRow + 1 }),
          },
          RemoveRow: { target: "self", updateMemory: ({ memory, event }) => ({ rowIds: memory.rowIds.filter((id) => id !== event.key) }) },
          Send: {
            target: S.SENDING,
            guard: [
              ({ memory }) => memory.rows.some((r) => r.value !== "") || deny("NoInvites"),
              ({ memory }) => memory.rows.find((r) => r.error !== null)?.error ?? true, // forwards the row's reason
              ({ memory }) => memory.rows.every((r) => !r.checking) || deny("StillChecking"),
            ],
            actions: [send],
          },
        },
      },
      SENDING: { on: { Sent: S.SENT } },
      SENT: {},
    },
  };
});
```

```tsx
const rows = useView(invite, (s) => s.memory.rows);
{rows.map((r) => (
  <div key={r.key}>
    <input value={r.value} onChange={(e) => invite.send(E.rows.key(r.key).Changed({ value: e.target.value }))} />
    {r.checking ? <Spinner /> : r.error && <Hint denial={r.error} />}
    <button onClick={() => invite.send(E.RemoveRow({ key: r.key }))}>Remove</button>
  </div>
))}
```

### 3.2 Inbox: delete with a five-second undo, several at once

Written out in full in section 1.0.

### 3.3 Notifications: toasts that pause while hovered

Each toast leaves after 4 s, stays while hovered, restarts its 4 s when the pointer leaves, and has a
close button. At most five; a sixth pushes out the oldest.

```ts
export const Toast = (p: { show: Duration.Input }) =>
  trait(
    {
      id: "Toast",
      events: { Hover: {}, Unhover: {}, Close: {} },
      hostEvents: { Shown: {} },
      internalEvents: { Elapsed: {} },
      callbacks: { onGone: Flow.Callback({}) },
      memory: { hovered: Flow.initial(Schema.Boolean, false) },
    },
    ({ E, callbacks }) => ({
      // Armed when shown and again on every Unhover; a re-arm drops the earlier firing (P11).
      schedules: { dismiss: { schedule: p.show, send: E.Elapsed, armOn: [E.Shown, E.Unhover] } },
      on: {
        Shown: { target: "self" },
        Hover: { target: "self", updateMemory: () => ({ hovered: true }) },
        Unhover: { target: "self", updateMemory: () => ({ hovered: false }) },
        Close: { target: "self", notify: [callbacks.onGone] },
        Elapsed: [
          { target: "self", guard: ({ memory }) => !memory.hovered || deny("Hovered"), notify: [callbacks.onGone] },
          { target: "self" }, // fired while hovered: wait for Unhover to re-arm
        ],
      },
    }),
  );

// app.definition.ts (excerpt)
events: { Notify: { id: Schema.String, text: Schema.String, tone: Tone } },
memory: { notices: Flow.initial(Schema.Array(Notice), []) },             // Notice: { id, text, tone }
traits: { toasts: Toast({ show: "4 seconds" }).each("notices", { key: "id", max: 5 }) },

// app.machine.ts (excerpt)
traits: {
  toasts: { callbacks: { onGone: { target: "self", updateMemory: ({ memory, key }) => ({ notices: memory.notices.filter((n) => n.id !== key) }) } } },
},
on: {
  Notify: {
    target: "self",
    // The oldest falls out in the same patch (its onLeave is fused); the new one is shown in this turn.
    updateMemory: ({ memory, event }) => ({ notices: [...memory.notices, event].slice(-5) }),
    raise: [E.toasts.Shown.from(({ event }) => ({ key: event.id }))],
  },
},
```

```tsx
{toasts.map((t) => (
  <Toast key={t.key} tone={t.item.tone} onMouseEnter={() => app.send(E.toasts.key(t.key).Hover())}
         onMouseLeave={() => app.send(E.toasts.key(t.key).Unhover())}>
    {t.item.text}<CloseButton onClick={() => app.send(E.toasts.key(t.key).Close())} />
  </Toast>
))}
```

`Shown` exists because v4's P7 leaves an `armOn` schedule idle on creation (see 4, gap 2).

### 3.4 Restaurant kitchen display: tickets that age

Orders arrive from the point of sale. Each ticket turns amber at 8 minutes and red at 12, measured
from when the order was **placed**. A cook taps Start, then Bump when it leaves the pass.

```ts
export const Ticket = (p: { warnAfter: number; lateAfter: number }) =>   // milliseconds
  trait(
    {
      id: "Ticket",
      events: { Start: {}, Bump: {} },
      internalEvents: { Warn: {}, Late: {} },
      callbacks: { onBumped: Flow.Callback({}), onLate: Flow.optional(Flow.Callback({})) },
      memory: {
        placedAt: Flow.input(Schema.Number),
        started: Flow.initial(Schema.Boolean, false),
        age: Flow.initial(Schema.Literal("fresh", "warn", "late"), "fresh"),
      },
    },
    ({ E, callbacks }) => ({
      // Deadlines come from the order's own time, so a re-created or restored ticket keeps them.
      schedules: {
        warn: { schedule: ({ memory, now }) => Math.max(0, memory.placedAt + p.warnAfter - now), send: E.Warn },
        late: { schedule: ({ memory, now }) => Math.max(0, memory.placedAt + p.lateAfter - now), send: E.Late },
      },
      on: {
        Start: { target: "self", guard: ({ memory }) => !memory.started || deny("Started"), updateMemory: () => ({ started: true }) },
        Bump: { target: "self", notify: [callbacks.onBumped] },
        Warn: { target: "self", updateMemory: () => ({ age: "warn" }) },
        Late: { target: "self", updateMemory: () => ({ age: "late" }), notify: [callbacks.onLate] },
      },
    }),
  );

// kitchen.definition.ts (excerpt)
internalEvents: { OrdersChanged: { orders: Schema.Array(Order) }, Bumped: { id: Schema.String } },  // Order: { id, placedAt, lines }
memory: {
  orders: Flow.initial(Schema.Array(Order), []),
  bumping: Flow.private(Flow.initial(Schema.Array(Schema.String), [])),   // bumped here, not yet gone upstream
},
traits: { tickets: Ticket({ warnAfter: 8 * 60_000, lateAfter: 12 * 60_000 }).each("orders", { key: "id", max: 200 }) },

// kitchen.machine.ts (excerpt)
activities: {
  open: O.Pos.openOrders.subscribe(({ context }) => ({ station: context.station }), {
    outcomes: { value: E.OrdersChanged.from((orders) => ({ orders })) },
  }),
},
traits: {
  tickets: {
    input: ({ item }) => ({ placedAt: item.placedAt }),
    callbacks: {
      onBumped: {
        target: "self",
        updateMemory: ({ memory, key }) => ({ orders: memory.orders.filter((o) => o.id !== key), bumping: [...memory.bumping, key] }),
        actions: [O.Pos.bump.commit(({ key }) => ({ orderId: key }), { outcomes: { success: E.Bumped.from((_, { input }) => ({ id: input.orderId })) } })],
      },
      onLate: { target: "self", actions: [O.Pos.flagLate.commit(({ key }) => ({ orderId: key }))] },
    },
  },
},
on: {
  // Server truth, minus what this screen has bumped and the server has not caught up with.
  OrdersChanged: { target: "self", updateMemory: ({ memory, event }) => ({ orders: event.orders.filter((o) => !memory.bumping.includes(o.id)) }) },
  Bumped: { target: "self", updateMemory: ({ memory, event }) => ({ bumping: memory.bumping.filter((id) => id !== event.id) }) },
},
```

A ticket keeps its copy across server updates because its key stays in the list; only orders that
appear or vanish create or end copies.

### 3.5 Device fleet: heartbeat watchdog with escalation

Devices report a heartbeat every few seconds. A device silent for 30 s is offline and opens an
alert; an alert nobody acknowledges in 10 minutes pages the on-call engineer. Devices are learned
from their first heartbeat.

```ts
export const Watchdog = (p: { silence: Duration.Input; escalateAfter: Duration.Input }) =>
  trait(
    {
      id: "Watchdog",
      events: { Acknowledge: {} },
      hostEvents: { Beat: {} },
      internalEvents: { Silent: {}, Escalate: {} },
      callbacks: {
        onOffline: Flow.Callback({}),
        onBack: Flow.optional(Flow.Callback({})),
        onEscalate: Flow.Callback({}),
      },
      memory: { status: Flow.initial(Schema.Literal("online", "offline", "acknowledged"), "online") },
    },
    ({ E, callbacks }) => ({
      schedules: {
        silence: { schedule: p.silence, send: E.Silent, armOn: [E.Beat] },          // every beat re-arms
        escalate: { schedule: p.escalateAfter, send: E.Escalate, armOn: [E.Silent] },
      },
      on: {
        Beat: [
          { target: "self", guard: ({ memory }) => memory.status !== "online" || deny("Online"), updateMemory: () => ({ status: "online" }), notify: [callbacks.onBack] },
          { target: "self" },
        ],
        Silent: { target: "self", updateMemory: () => ({ status: "offline" }), notify: [callbacks.onOffline] },
        Acknowledge: { target: "self", guard: ({ memory }) => memory.status === "offline" || deny("NotOffline"), updateMemory: () => ({ status: "acknowledged" }) },
        Escalate: [
          { target: "self", guard: ({ memory }) => memory.status === "offline" || deny("Handled"), notify: [callbacks.onEscalate] },
          { target: "self" }, // back online or acknowledged meanwhile
        ],
      },
    }),
  );

// fleet.definition.ts (excerpt)
events: { Decommission: { deviceId: Schema.String } },
internalEvents: { Heartbeat: { deviceId: Schema.String, at: Schema.Number } },
memory: { deviceIds: Flow.initial(Schema.Array(Schema.String), []) },
traits: { devices: Watchdog({ silence: "30 seconds", escalateAfter: "10 minutes" }).each("deviceIds", { max: 1000 }) },

// fleet.machine.ts (excerpt)
activities: {
  beats: O.Fleet.heartbeats.subscribe({}, { outcomes: { value: E.Heartbeat.from((h) => ({ deviceId: h.deviceId, at: h.at })) } }),
},
traits: {
  devices: {
    callbacks: {
      onOffline: { target: "self", actions: [O.Alerts.open.commit(({ key }) => ({ deviceId: key }))] },
      onBack: { target: "self", actions: [O.Alerts.resolve.commit(({ key }) => ({ deviceId: key }))] },
      onEscalate: { target: "self", actions: [O.Pager.page.commit(({ key }) => ({ deviceId: key, severity: "high" }))] },
    },
  },
},
on: {
  // A new device is added and beaten in one turn: the raise reaches its fresh copy (1.1, first pass).
  Heartbeat: {
    target: "self",
    updateMemory: ({ memory, event }) => (memory.deviceIds.includes(event.deviceId) ? {} : { deviceIds: [...memory.deviceIds, event.deviceId] }),
    raise: [E.devices.Beat.from(({ event }) => ({ key: event.deviceId }))],
  },
  Decommission: { target: "self", updateMemory: ({ memory, event }) => ({ deviceIds: memory.deviceIds.filter((id) => id !== event.deviceId) }) },
},
```

Decommissioning a device ends its copy, which cancels both timers: a removed device can never page
anyone. This is the L1 guarantee (timers stop with their owner) applied per copy.

### 3.6 Issue table: optimistic pins that flash on failure

A table of thousands of issues. Pinning is optimistic; if the server refuses, the row reverts and
shows the reason for 3 s. **Only the flashing rows have copies.**

```ts
export const Flash = (p: { for: Duration.Input }) =>
  trait(
    { id: "Flash", internalEvents: { Over: {} }, callbacks: { onOver: Flow.Callback({}) } },
    ({ E, callbacks }) => ({
      schedules: { over: { schedule: p.for, send: E.Over } },
      on: { Over: { target: "self", notify: [callbacks.onOver] } },
    }),
  );

// issues.definition.ts (excerpt)
internalEvents: { PinFailed: { id: Schema.String, reason: Flow.Denial, at: Schema.Number } },
memory: { flashes: Flow.initial(Schema.Array(FlashNote), []) },     // FlashNote: { id, reason, at }
traits: { flashes: Flash({ for: "3 seconds" }).each("flashes", { key: "id", max: 20 }) },

// issues.machine.ts (excerpt)
traits: {
  flashes: {
    resetOn: ({ item }) => item.at,   // a second failure on a flashing row restarts its 3 s
    callbacks: { onOver: { target: "self", updateMemory: ({ memory, key }) => ({ flashes: memory.flashes.filter((f) => f.id !== key) }) } },
  },
},
on: {
  Pin: {
    target: "self",
    guard: (g) => !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"),
    actions: [O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: true }), {
      optimistic: true,
      outcomes: { failure: E.PinFailed.from((e, { input, now }) => ({ id: input.id, reason: deny(e._tag), at: now })) },
    })],
  },
  PinFailed: { target: "self", updateMemory: ({ memory, event }) => ({ flashes: upsert(memory.flashes, event) }) },
},
```

```tsx
const flashing = useView(app, (s) => s.memory.flashes);  // a handful of copies, not a copy per row
<IssueRow issue={issue} flash={flashing.find((f) => f.key === issue.id)?.item.reason} />
```

### 3.7 Two-factor sign-in: a lockout per challenge, surviving Back

v4's sign-in (section 3.1) restated with `.each`. Strikes and a 5-minute lockout belong to a
challenge; going Back and returning keeps them.

```ts
// definition (excerpt)
memory: { challengeIds: Flow.private(Flow.initial(Schema.Array(Schema.String), [])) },
traits: { challenges: Lockout({ limit: 3, length: "5 minutes" }).each("challengeIds", { max: 10 }) },

// machine (excerpt)
traits: {
  challenges: {
    // An unlocked challenge is forgotten: its copy ends with it.
    callbacks: { onUnlocked: { target: "self", updateMemory: ({ memory, key }) => ({ challengeIds: memory.challengeIds.filter((id) => id !== key) }) } },
  },
},
on: {
  PasswordAccepted: {
    target: S.TWO_FACTOR,
    updateMemory: ({ memory, event }) => ({ challengeId: event.challengeId, challengeIds: union(memory.challengeIds, [event.challengeId]) }),
  },
},
// A late WrongCode re-adds its challenge and strikes it in one turn; the strike reaches the fresh copy.
abandoned: [{
  guard: [({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"), ({ payload }) => payload.tag === "WrongCode" || deny("NotWrong")],
  updateMemory: ({ memory, payload }) => ({ challengeIds: union(memory.challengeIds, [payload.input.challengeId]) }),
  raise: [E.challenges.Strike.from(({ payload }) => ({ key: payload.input.challengeId }))],
}, {}],
```

### 3.8 Spreadsheet-style editing: several inline editors with autosave

Any number of rows can be open for editing at once. Each keeps a draft and autosaves 2 s after the
last keystroke; closing a row with unsaved changes saves first.

```ts
export const InlineEditor = (p: { autosave: Duration.Input }) =>
  trait(
    {
      id: "InlineEditor",
      events: { Changed: { draft: Schema.String }, Close: {} },
      hostEvents: { Saved: { draft: Schema.String } },
      internalEvents: { Quiet: {} },
      callbacks: { onSave: Flow.Callback({ draft: Schema.String }), onClose: Flow.Callback({ draft: Schema.NullOr(Schema.String) }) },
      memory: {
        draft: Flow.input(Schema.String),
        saved: Flow.private(Flow.initial(Schema.String, ({ draft }) => draft)),
      },
    },
    ({ E, callbacks }) => ({
      schedules: { quiet: { schedule: p.autosave, send: E.Quiet, armOn: [E.Changed] } },
      on: {
        Changed: { target: "self", updateMemory: ({ event }) => ({ draft: event.draft }) },
        Quiet: [
          { target: "self", guard: ({ memory }) => memory.draft !== memory.saved || deny("Clean"), notify: [callbacks.onSave.from(({ memory }) => ({ draft: memory.draft }))] },
          { target: "self" },
        ],
        Saved: { target: "self", updateMemory: ({ event }) => ({ saved: event.draft }) },
        // Hands the host any unsaved draft; the host saves it and removes the row.
        Close: { target: "self", notify: [callbacks.onClose.from(({ memory }) => ({ draft: memory.draft !== memory.saved ? memory.draft : null }))] },
      },
    }),
  );

// sheet.definition.ts (excerpt)
events: { Open: { id: Schema.String } },
internalEvents: { Saved: { id: Schema.String, draft: Schema.String } },
memory: { editing: Flow.initial(Schema.Array(Schema.String), []) },
traits: { editors: InlineEditor({ autosave: "2 seconds" }).each("editing", { max: 50 }) },

// sheet.machine.ts (excerpt)
const save = O.Rows.rename.commit(({ key, payload }) => ({ id: key, title: payload.draft }), {
  outcomes: { success: E.Saved.from((_, { input }) => ({ id: input.id, draft: input.title })) },
});
traits: {
  editors: {
    input: ({ key, activities }) => ({ draft: titleOf(activities.rows, key) }),
    callbacks: {
      onSave: { target: "self", actions: [save] },
      onClose: [
        { target: "self", guard: ({ payload }) => payload.draft !== null || deny("Clean"),
          updateMemory: ({ memory, key }) => ({ editing: memory.editing.filter((id) => id !== key) }), actions: [save] },
        { target: "self", updateMemory: ({ memory, key }) => ({ editing: memory.editing.filter((id) => id !== key) }) },
      ],
    },
  },
},
on: {
  Open: { target: "self", guard: ({ memory, event }) => !memory.editing.includes(event.id) || deny("Open"), updateMemory: ({ memory, event }) => ({ editing: [...memory.editing, event.id] }) },
  // A save that lands after its row closed is dropped with evidence: nothing is left to update.
  Saved: { target: "self", raise: [E.editors.Saved.from(({ event }) => ({ key: event.id, draft: event.draft }))] },
},
```

If only **one** row may be open at a time, this is not a collection: one `InlineEditor` with
`resetOn: ({ memory }) => memory.editingId` works in v4 today.

### 3.9 Where `.each` is not needed

**Shopping cart lines** (C6): values and rules, nothing running per line.

```ts
memory: { lines: Flow.initial(Schema.Array(Line), []) },        // Line: { sku, qty, price }
on: {
  SetQty: {
    target: "self",
    guard: ({ event }) => (event.qty >= 1 && event.qty <= 99) || deny("QtyRange", { min: 1, max: 99 }),
    updateMemory: ({ memory, event }) => ({ lines: memory.lines.map((l) => (l.sku === event.sku ? { ...l, qty: event.qty } : l)) }),
  },
},
```

**An upload queue**: per-file retry, progress and "is it running?" are already operations
features: keyed commits, `retry` (P13), `.pending(g, { fileId })` and the Attempt's lane. A copy
would only mirror them. Reach for `.each` when a copy has **its own timers or rules**, not for
server work alone.

## 4. Gaps found while modelling

1. **Per-copy subscriptions.** A stock watchlist where each row holds its own live quote cannot
   start one subscription per key; activities are named, not keyed. A single subscription over all
   symbols works but restarts whenever the list changes. Keyed activities would be a Machines O6
   change, separate from this proposal.
2. **Arm on creation and on an event.** v4's P7 leaves an `armOn` schedule idle on entry, so the
   toast (3.3) needs a `Shown` raise on creation. Allowing entry in `armOn` would remove that line;
   it is a general schedule question, not a collection one.
3. **Raising into every copy.** "Acknowledge all alerts" cannot be one raise; a raise addresses one
   key. Clearing a list is easy (write the field); broadcasting an event is not. Possible form:
   `E.devices.all.Acknowledge`. Left open until a case needs it.
4. **`resetOn` lag.** Commit-time reconciliation (Q1) could apply to part-written `resetOn` values
   too, removing the last one-snapshot lag. Separate decision.

## 5. Changes to proposal v4 if accepted

- Rule 9 is replaced by section 1 of this file; section 2.5 gains the two reconciliation passes.
- Removed words: `.list`, `Add`, `Remove`, `canAdd`, `canRemove`, `owner`, minted keys.
  Added: `.each(field, { key?, max? })`, `key` and `item` in fillings and copy views, `key` in
  outcome mappers of commits started from a copy.
- Sign-in (3.1 of v4) uses 3.7 above; the invite list (3.3 of v4) uses 3.1 above.
- Section 7 item 0 closes; gaps 1–4 above join section 7.
