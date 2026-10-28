# Proposal: `.each`, copies that follow a key list

Status: accepted and recorded in proposal v4 (rule 9, section 2.5, sign-in, invites), after four
reviews (section 6). It answers [problem.md](problem.md) with candidate S1 from
[solutions.md](solutions.md) and replaces v4's former `.list` draft. Syntax is v4's; lines marked `// ← NEW` are new.

## 1.0 The whole idea in one example

Delete with undo in an inbox: deleting a message hides it at once and shows "Undo" for 5 seconds;
only then does the server delete run. Several can be pending, and any one can be undone.

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

**The definition.** `.each("deleting", …)` means one copy per id in `deleting`. Add an id and a copy
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
  internalEvents: { Trashed: { id: Schema.String }, TrashFailed: { id: Schema.String } },
  memory: {
    deleting: Flow.initial(Schema.Array(Schema.String), []),   // in their undo window
    trashing: Flow.initial(Schema.Array(Schema.String), []),   // sent to the server, not confirmed
    trashError: Flow.initial(Schema.NullOr(Schema.String), null),
  },
  traits: {
    undo: Undoable({ window: "5 seconds" }).each("deleting", { max: 50 }), // ← NEW: .each
  },
  operations: { Mail },
});
```

**The machine.** No `Add` or `Remove` events: the host edits its own arrays. One filling serves
every copy, and `key` says which copy is calling.

```ts
// inbox.machine.ts
import { deny, machine } from "flow-state";
import { Inbox } from "./inbox.definition";

export const InboxMachine = machine(Inbox, ({ S, E, O }) => {
  const trash = O.Mail.trash.commit(({ key }) => ({ id: key }), {           // ← NEW: key
    outcomes: {
      success: E.Trashed.from((_, { input }) => ({ id: input.id })),
      failure: E.TrashFailed.from((_, { input }) => ({ id: input.id })),
      unknown: E.TrashFailed.from((_, { input }) => ({ id: input.id })),
    },
  });

  return {
    default: S.READY,

    traits: {
      undo: {
        callbacks: {
          // The user undid: remove the id, so the copy and its timer are gone.
          onUndo: {
            target: "self",
            updateMemory: ({ memory, key }) => ({                            // ← NEW: key
              deleting: memory.deleting.filter((id) => id !== key),
            }),
          },
          // Time ran out: move the id from "deleting" to "trashing" and run the real delete.
          onFinal: {
            target: "self",
            updateMemory: ({ memory, key }) => ({                            // ← NEW: key
              deleting: memory.deleting.filter((id) => id !== key),
              trashing: [...memory.trashing, key],
            }),
            actions: [trash],
          },
        },
      },
    },

    on: {
      // Adding a copy is adding an id. The host's own guards set the rules.
      Delete: {
        target: "self",
        guard: [
          ({ memory, event }) => !memory.deleting.includes(event.id) || deny("AlreadyDeleting"),
          ({ memory }) => memory.deleting.length < 50 || deny("TooManyPending"),
        ],
        updateMemory: ({ memory, event }) => ({ deleting: [...memory.deleting, event.id] }),
      },
      Trashed: {
        target: "self",
        updateMemory: ({ memory, event }) => ({ trashing: memory.trashing.filter((id) => id !== event.id) }),
      },
      // The message comes back, with a notice.
      TrashFailed: {
        target: "self",
        updateMemory: ({ memory, event }) => ({
          trashing: memory.trashing.filter((id) => id !== event.id),
          trashError: event.id,
        }),
      },
    },
  };
});
```

**The view.**

```tsx
const hidden = useView(inbox, (s) => [...s.memory.deleting, ...s.memory.trashing]);
const undos = useView(inbox, (s) => s.memory.undo);           // one entry per copy, in order

const visible = messages.filter((m) => !hidden.includes(m.id));

{undos.map((u) => (
  <Snackbar key={u.key}                                         // ← NEW: key on each copy
    onUndo={() => inbox.send(E.undo.key(u.key).Undo())} />     // .key(k) carried over from v4's lists
))}
```

Undo after the window closed is `Unhandled`: the id is gone, so the snackbar is gone too.

**All the new syntax:**

| New | What it is |
| --- | --- |
| `.each(field, { max, by? })` | place a trait once per entry of a memory field; `max` caps the count; `by` names the key field when entries are records |
| `key` and `item` in fillings | which copy is calling, and its entry (the record, or the key string itself) |
| `key` and `item` on each copy in the view | `s.memory.undo[i].key` |

## 1. The rules

### 1.1 Placement

```ts
Trait.each(field, { max, by? })   // new
```

- `field` names a memory field of the **same** definition or fragment that places the trait. It
  holds `ReadonlyArray<string>`, or records with a string field named by `by`
  (`.each("notices", { by: "id", max: 5 })`). The path and `by` are type-checked.
- **One copy per key, in the field's order, in every published snapshot.** Membership is never
  commanded: the host writes its own field, in its own transitions, behind its own guards.
- `max` is required. It caps the list (1.3) and keeps the shape finite for tooling.
- `.each` sits wherever a trait sits: the root's `traits`, or `Flow.state(…, { traits })`. On a
  node, copies live while the node is active. Leaving ends them; re-entering creates fresh ones
  from the keys still in memory. With `.resumable()` they freeze instead (1.5).
- A trait placed with `.each` may not itself place `.each` (nested lists are out of scope, 4).
- `key` and `item` are reserved: a trait placed with `.each` may not name memory fields so.

### 1.2 Reading, addressing and fillings

- **Reading.** `s.memory.<name>` is the copies in key order, each `{ key, item, …readable memory }`.
  `item` is the host's entry itself (same object): the record, or the key string. If the key field
  is `Flow.private`, copies show `key` only. `s.schedules.<name>` follows the same order.
- **Addressing.** A view sends `E.<name>.key(k).Event(payload)`; a key not in the list is
  `Unhandled`. A host raise puts `key` in the mapper's result:
  `E.rows.Checked.from(({ event }) => ({ key: event.key, … }))`.
- **Fillings.** One filling serves every copy, in the machine as for any trait. Every part of it
  receives `key` and `item`: `input`, `resetOn` (per copy), guards, callback handlers and their
  commit mappers. A commit started in a copy's filling remembers its key and life; its outcome
  mappers receive `key` (`success: E.X.from((r, { input, key }) => …)`). A commit started anywhere
  else has no `key`; using it there is a type error.

### 1.3 The turn (changes to v4 section 2.5)

1. **During the walk** (step 3), raises see the **source-updated** list, as `resetOn` does. A
   source transition can add a key and raise into the new copy in the same turn.
2. **After the walk** (step 4), the turn's **final list** is known: the pre-turn list with the
   source's patch and every part's patch applied in expansion order. Every patch reads pre-turn
   memory, so nothing runs twice. The final list decides membership for this turn:
   - a key gone from it ends its copy **in this turn**: schedules cancelled at commit, `whenAbandoned`
     fused after the walk as v4 does for every ending (rule 6). Nothing is queued for later;
   - a key new in it, and not yet seeded by the walk, is seeded from the final memory and its
     entry schedules arm at commit;
   - a copy created and ended in the same turn is never published and gets no `whenAbandoned`.
3. **Repair, never refuse.** Before validation (step 5), the final list is repaired: a duplicate
   key keeps its first entry; keys beyond `max` are dropped, keeping the first `max`. Each repair
   is recorded as evidence and warned about in Stories. A list problem never refuses a turn, so it
   can never lose a delivery (rule 8). Hosts still write guards for friendly reasons
   (`deny("TooManyPending")`).
4. **Raise into an absent key.** In a turn sourced by a delivery (rule 8's list), the part is
   dropped with evidence and the rest commits. In any other turn it refuses, as in v4.
5. **`whenAbandoned` fillings of a list's copies may not write that list's field.** The writer of the
   field already decided; a second writer is the existing overlapping-keys defect.

### 1.4 Identity

- The key is public; each copy's **life** is private. A key's lives are numbered by a counter that
  persists with the actor and never goes back, so a later life is always distinguishable.
- A delivery (a commit outcome, a timer firing) reaches the life it was started or armed under.
  If that life is dead **and a life of the same key was created earlier in the same turn**, it
  reaches that new life (v4's in-turn rule; the sign-in in 3.7 relies on it). Otherwise it is
  dropped with evidence, and the rest of its turn commits.
- A view event addresses a key, not a life: a click rendered for an old copy reaches the current
  one. This is normal mailbox behaviour.
- Removing and re-adding a key **in one patch** changes nothing. To restart a copy, give it a new
  key or a per-copy `resetOn` (3.3 and 3.6 do).
- Copies that arm timers for the same instant fire in list order at arming.
- Lives appear only in Inspection and Stories (`rows["row-2"]@1`, keys escaped), never in types,
  events or views.

### 1.5 Frozen copies, persistence, hydration

- **`.resumable()` on a node.** While the node is inactive its copies are frozen, but membership is
  still reconciled every turn. A key removed while frozen ends its copy in that turn (`whenAbandoned`
  reads the frozen memory). A key added while frozen gets its copy on re-entry. A key removed and
  re-added while frozen is a new life.
- **Persistence.** The key list is the truth. Each copy persists by key with its life number,
  memory and armed deadlines. On restore, a copy whose key is gone is dropped with evidence, a key
  without a copy is seeded fresh, and the list is repaired (1.3). Pending work is never deferred to
  an unpersisted follow-up turn, because none exists (1.3).
- **Hydration** restores copies from the persisted snapshot and never re-runs `input`.
- A constant `Flow.initial` longer than `max` is a construction error.

### 1.6 What static analysis sees, and what it does not

`flow check` and `flow graph` see the **shape**: one node per placement ("Undoable × deleting ≤ 50"),
the key path and type, `max`, the template's contract summary, its raise and callback edges, and
rule 8 totality, checked once for all copies. The single graph is unchanged.

They do **not** see membership: which transitions add or remove keys, or whether a raise will find
its key, because `updateMemory` is an opaque function. That is runtime data, as in every system
in the prior art. Stories show it, and `flow check` reports Story-derived warnings (a repair in 1.3,
a dropped raise) as it already does for read-after-write. `model()` explores up to
`explore: { <name>: n }` copies per list (default 2), not `max`.

### 1.7 What does not break

| Constraint | How |
| --- | --- |
| **K1 one turn** | Membership is decided inside the host's turn, from the final list; nothing is deferred. |
| **K2 static analysis, single graph** | One node per placement; template analysed once; membership is Story-checked (1.6). |
| **K3 no child actors** | Copies are traits. |
| **K4 one active leaf** | Copies have no states; a copy's mode is memory. |
| **K5 definition/machine** | `.each`, the field and `max` are structure; `input`, fillings and membership writes are behaviour. |
| **K6 types** | Field path, `by`, `key` and `item` are typed; `key` outside a copy filling is a type error. |
| **K7 determinism** | Keys are host data; lives are persisted counters; timer ties follow list order. |
| **K8 no fragment I/O** | Copies notify; the host commits, attributed to the copy's key and life. |
| **K9 locality** | Which copies exist is written on the placement; who may add or remove is written on the host's transitions. |

## 2. The open questions, settled

### Q1. A copy that removes itself: no lag, no follow-up turn

A toast's `onGone` callback removes its own key. The turn's final list already lacks the key, so
the copy ends in that same turn, with its `whenAbandoned` fused (1.3, step 2). No snapshot shows a copy
without a key, and nothing waits in an unpersisted follow-up turn.

### Q2. Where keys come from: host memory only

A memory field of the placing definition or fragment. Not a selector function (the graph could
not show what drives the copies), not activity data (it changes outside the turn). Data from
outside reaches the list through ordinary host events: an activity's `value` outcome, an
`onContext` reaction, a commit's outcome.

Memory holds **keys and the facts a copy is created from** (an order's `placedAt`), not copies of
server rows. And copies are for items with **live behaviour**, not every item: a table of 2,000
issues has copies only for the few rows flashing an error (3.6).

### Q3. Keys: strings, held bare or in records

Keys are strings: they appear in event envelopes, Story names, persistence and React `key` props.
Numeric ids are written `String(id)`. The list holds bare keys, or records with a key field named
by `by`, so the host's data and the membership live in one place.

## 3. Real-world problems, modelled

Each example defines any helper it uses in its own file. Omitted outcomes (`interrupt`, `defect`)
publish an actor issue, as Machines O6 says; outcomes the state waits on are always mapped.

### 3.1 Team invites: rows that check with the server as you type

Up to five email rows. Each validates on every keystroke and asks the server "already a member?"
400 ms after typing stops. Rows can be removed while a check is in flight.

```ts
// fragments.ts
const emailShape = (v: string) => (v === "" || v.includes("@") ? null : deny("NotAnEmail"));

export const EmailRow = trait(
  {
    id: "EmailRow",
    events: { Changed: { value: Schema.String } },
    // taken: null means the check itself failed; the server checks again on send.
    hostEvents: { Checked: { value: Schema.String, taken: Schema.NullOr(Schema.Boolean) } },
    internalEvents: { Quiet: {} },
    guards: { canEdit: Flow.optional(Flow.Guard) },
    callbacks: { onQuiet: Flow.Callback({ value: Schema.String }) },
    memory: {
      value: Flow.initial(Schema.String, ""),
      error: Flow.initial(Schema.NullOr(Flow.Denial), null),
      checking: Flow.initial(Schema.Boolean, false),
    },
  },
  ({ E, guards, callbacks }) => ({
    schedules: { quiet: { schedule: "400 millis", send: E.Quiet, armOn: [E.Changed] } }, // debounce
    on: {
      Changed: {
        target: "self",
        guard: guards.canEdit,
        updateMemory: ({ event }) => ({ value: event.value, error: emailShape(event.value), checking: false }),
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
          updateMemory: ({ event }) => ({
            checking: false,
            error: event.taken === true ? deny("AlreadyMember") : null,
          }),
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
  internalEvents: {
    Checked: { key: Schema.String, value: Schema.String, taken: Schema.NullOr(Schema.Boolean) },
    Sent: {},
    SendFailed: {},
  },
  memory: {
    rowIds: Flow.initial(Schema.Array(Schema.String), ["row-1"]),
    nextRow: Flow.private(Flow.initial(Schema.Int, 2)),
    sendFailed: Flow.initial(Schema.Boolean, false),
  },
  traits: { rows: EmailRow.each("rowIds", { max: 5 }) },          // ← NEW
  operations: { Team },
});

// invite.machine.ts
export const InviteMachine = machine(Invite, ({ S, E, O }) => {
  const couldNotCheck = E.Checked.from((_, { input, key }) => ({ key, value: input.email, taken: null })); // ← NEW: key
  const check = O.Team.isMember.commit(({ payload }) => ({ email: payload.value }), {
    outcomes: {
      success: E.Checked.from((r, { input, key }) => ({ key, value: input.email, taken: r.member })),     // ← NEW: key
      failure: couldNotCheck,
      notSent: couldNotCheck,
      unknown: couldNotCheck,
    },
  });
  const send = O.Team.invite.commit(
    ({ memory }) => ({ emails: memory.rows.map((r) => r.value).filter((v) => v !== "") }),
    { outcomes: { success: E.Sent, failure: E.SendFailed, notSent: E.SendFailed, unknown: E.SendFailed } },
  );

  return {
    default: S.EDITING,
    traits: {
      rows: {
        guards: { canEdit: ({ state }) => S.EDITING.is(state) || deny("NotEditing") },
        callbacks: { onQuiet: { target: "self", actions: [check] } },
      },
    },
    on: {
      // Routed by key. For a row removed meanwhile, this raise is dropped with evidence (1.3).
      Checked: {
        target: "self",
        raise: [E.rows.Checked.from(({ event }) => ({ key: event.key, value: event.value, taken: event.taken }))],
      },
    },
    states: {
      EDITING: {
        on: {
          AddRow: {
            target: "self",
            guard: ({ memory }) => memory.rowIds.length < 5 || deny("FiveAtMost"),
            updateMemory: ({ memory }) => ({
              rowIds: [...memory.rowIds, `row-${memory.nextRow}`],
              nextRow: memory.nextRow + 1,
            }),
          },
          RemoveRow: {
            target: "self",
            updateMemory: ({ memory, event }) => ({ rowIds: memory.rowIds.filter((k) => k !== event.key) }),
          },
          Send: {
            target: S.SENDING,
            guard: [
              ({ memory }) => memory.rows.some((r) => r.value !== "") || deny("NoInvites"),
              ({ schedules }) => schedules.rows.every((r) => r.quiet === undefined) || deny("StillTyping"),
              ({ memory }) => memory.rows.every((r) => !r.checking) || deny("StillChecking"),
              ({ memory }) => memory.rows.find((r) => r.error !== null)?.error ?? true, // the row's own reason
            ],
            updateMemory: () => ({ sendFailed: false }),
            actions: [send],
          },
        },
      },
      SENDING: {
        on: {
          Sent: S.SENT,
          SendFailed: { target: S.EDITING, updateMemory: () => ({ sendFailed: true }) },
        },
      },
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

### 3.2 Inbox: delete with a five-second undo

Written out in full in section 1.0.

### 3.3 Notifications: toasts that pause while hovered

Each toast leaves after 4 s, stays while hovered, restarts its 4 s when the pointer leaves, and has
a close button. At most five; a sixth pushes out the oldest. The same id again refreshes its toast.

```ts
export const Toast = (p: { show: Duration.Input }) =>
  trait(
    {
      id: "Toast",
      events: { Hover: {}, Unhover: {}, Close: {} },
      internalEvents: { Elapsed: {} },
      callbacks: { onGone: Flow.Callback({}) },
      memory: { hovered: Flow.initial(Schema.Boolean, false) },
    },
    ({ E, callbacks }) => ({
      // Starts when the toast appears and again on every Unhover; a re-arm drops the earlier firing (P11).
      schedules: { dismiss: { schedule: p.show, send: E.Elapsed, armOn: [Flow.entry, E.Unhover] } },
      on: {
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

// app.definition.ts (excerpt). This actor is not persisted, so `hovered` never outlives the page.
events: { Notify: { id: Schema.String, text: Schema.String, tone: Tone } },
memory: { notices: Flow.initial(Schema.Array(Notice), []) },                       // Notice: { id, text, tone, at }
traits: { toasts: Toast({ show: "4 seconds" }).each("notices", { by: "id", max: 5 }) }, // ← NEW

// app.machine.ts (excerpt)
const upsert = (list: ReadonlyArray<Notice>, n: Notice) =>
  list.some((x) => x.id === n.id) ? list.map((x) => (x.id === n.id ? n : x)) : [...list, n];

traits: {
  toasts: {
    resetOn: ({ item }) => item.at,   // a repeated id gets a fresh toast, so its 4 s start again
    callbacks: {
      onGone: { target: "self", updateMemory: ({ memory, key }) => ({ notices: memory.notices.filter((n) => n.id !== key) }) },
    },
  },
},
on: {
  Notify: {
    target: "self",
    // The oldest falls out in the same patch (its whenAbandoned is fused). A repeated id replaces its
    // notice, and its new `at` resets that toast.
    updateMemory: ({ memory, event, now }) => ({ notices: upsert(memory.notices, { ...event, at: now }).slice(-5) }),
  },
},
```

```tsx
{toasts.map((t) => (
  <Toast key={t.key} tone={t.item.tone}
         onMouseEnter={() => app.send(E.toasts.key(t.key).Hover())}
         onMouseLeave={() => app.send(E.toasts.key(t.key).Unhover())}>
    {t.item.text}
    <CloseButton onClick={() => app.send(E.toasts.key(t.key).Close())} />
  </Toast>
))}
```

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
      // Deadlines come from the order's own time (Machines O5 schedule function), so a re-created
      // or restored ticket keeps them.
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
// Memory keeps keys and the one fact a ticket is created from, not the order (Q2).
internalEvents: { OrdersChanged: { orders: Schema.Array(Order) }, BumpFailed: { id: Schema.String } },
memory: {
  tickets: Flow.initial(Schema.Array(TicketKey), []),   // TicketKey: { id, placedAt }
  bumping: Flow.initial(Schema.Array(TicketKey), []),   // bumped here, still listed upstream
},
traits: {
  // max is far above a real rush; past it the runtime keeps the first 300 and records evidence (1.3).
  tickets: Ticket({ warnAfter: 8 * 60_000, lateAfter: 12 * 60_000 }).each("tickets", { by: "id", max: 300 }),
},

// kitchen.machine.ts (excerpt)
const keyOf = (o: Order) => ({ id: o.id, placedAt: o.placedAt });

activities: {
  open: O.Pos.openOrders.subscribe(({ context }) => ({ station: context.station }), {
    outcomes: { value: E.OrdersChanged.from((orders) => ({ orders })) },
  }),
},
traits: {
  tickets: {
    input: ({ item }) => ({ placedAt: item.placedAt }),                          // ← NEW: item
    callbacks: {
      onBumped: {
        target: "self",
        updateMemory: ({ memory, key, item }) => ({
          tickets: memory.tickets.filter((t) => t.id !== key),
          bumping: [...memory.bumping, item],
        }),
        actions: [O.Pos.bump.commit(({ key }) => ({ orderId: key }), {
          outcomes: {
            failure: E.BumpFailed.from((_, { input }) => ({ id: input.orderId })),
            unknown: E.BumpFailed.from((_, { input }) => ({ id: input.orderId })),
          },
        })],
      },
      // flagLate is idempotent on the server: every screen at the station may send it.
      onLate: { target: "self", actions: [O.Pos.flagLate.commit(({ key }) => ({ orderId: key }))] },
    },
  },
},
on: {
  // Server truth, minus what this screen bumped. A bumped order leaves `bumping` only when the
  // server list stops showing it, so it can never flash back.
  OrdersChanged: {
    target: "self",
    updateMemory: ({ memory, event }) => {
      const listed = (id: string) => event.orders.some((o) => o.id === id);
      const bumping = memory.bumping.filter((b) => listed(b.id));
      return {
        bumping,
        tickets: event.orders.filter((o) => !bumping.some((b) => b.id === o.id)).map(keyOf),
      };
    },
  },
  // A failed bump puts the ticket back at once, with its original placedAt.
  BumpFailed: {
    target: "self",
    updateMemory: ({ memory, event }) => ({
      bumping: memory.bumping.filter((b) => b.id !== event.id),
      tickets: [...memory.tickets, ...memory.bumping.filter((b) => b.id === event.id)]
        .sort((a, b) => a.placedAt - b.placedAt),
    }),
  },
},
```

A ticket keeps its copy across server updates because its key stays in the list. One that comes
back after a failed bump is a new life with the same deadlines, because they come from `placedAt`.
The view reads each order's lines from the `open` activity by `key`.

### 3.5 Device fleet: heartbeat watchdog with escalation

Devices report a heartbeat every few seconds. A device silent for 30 s is offline and opens an
alert; an alert nobody acknowledges in 10 minutes pages the on-call engineer. Devices are learned
from their first heartbeat and can be decommissioned.

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
          {
            target: "self",
            guard: ({ memory }) => memory.status !== "online" || deny("Online"),
            updateMemory: () => ({ status: "online" }),
            notify: [callbacks.onBack],
          },
          { target: "self" },
        ],
        Silent: { target: "self", updateMemory: () => ({ status: "offline" }), notify: [callbacks.onOffline] },
        Acknowledge: {
          target: "self",
          guard: ({ memory }) => memory.status === "offline" || deny("NotOffline"),
          updateMemory: () => ({ status: "acknowledged" }),
        },
        Escalate: [
          { target: "self", guard: ({ memory }) => memory.status === "offline" || deny("Handled"), notify: [callbacks.onEscalate] },
          { target: "self" }, // back online or acknowledged meanwhile
        ],
      },
    }),
  );

// fleet.definition.ts (excerpt). This actor is not persisted: after a restart, devices are
// relearned from heartbeats, so a restart never marks the whole fleet offline at once.
events: { Decommission: { deviceId: Schema.String } },
internalEvents: { Heartbeat: { deviceId: Schema.String, at: Schema.Number }, PageFailed: { deviceId: Schema.String } },
memory: {
  deviceIds: Flow.initial(Schema.Array(Schema.String), []),
  decommissioned: Flow.initial(Schema.Array(Schema.String), []),
  pageFailures: Flow.initial(Schema.Array(Schema.String), []),   // shown as a banner
},
traits: { devices: Watchdog({ silence: "30 seconds", escalateAfter: "10 minutes" }).each("deviceIds", { max: 2000 }) },

// fleet.machine.ts (excerpt)
// Alerts operations use "serialize" concurrency per deviceId, so an open and a resolve land in order.
activities: {
  beats: O.Fleet.heartbeats.subscribe({}, {
    outcomes: { value: E.Heartbeat.from((h) => ({ deviceId: h.deviceId, at: h.at })) },
  }),
},
traits: {
  devices: {
    callbacks: {
      onOffline: { target: "self", actions: [O.Alerts.open.commit(({ key }) => ({ deviceId: key }))] },
      onBack: { target: "self", actions: [O.Alerts.resolve.commit(({ key }) => ({ deviceId: key }))] },
      onEscalate: {
        target: "self",
        actions: [O.Pager.page.commit(({ key }) => ({ deviceId: key, severity: "high" }), {
          outcomes: {
            failure: E.PageFailed.from((_, { input }) => ({ deviceId: input.deviceId })),
            unknown: E.PageFailed.from((_, { input }) => ({ deviceId: input.deviceId })),
          },
        })],
      },
    },
  },
},
on: {
  Heartbeat: [
    {
      // A new device is added and beaten in one turn: the raise reaches its fresh copy (1.3).
      target: "self",
      guard: ({ memory, event }) => !memory.decommissioned.includes(event.deviceId) || deny("Decommissioned"),
      updateMemory: ({ memory, event }) =>
        memory.deviceIds.includes(event.deviceId) ? {} : { deviceIds: [...memory.deviceIds, event.deviceId] },
      raise: [E.devices.Beat.from(({ event }) => ({ key: event.deviceId }))],
    },
    { target: "self" }, // a decommissioned device still beating is ignored
  ],
  Decommission: {
    target: "self",
    updateMemory: ({ memory, event }) => ({
      deviceIds: memory.deviceIds.filter((id) => id !== event.deviceId),
      decommissioned: [...memory.decommissioned, event.deviceId],
    }),
    actions: [O.Alerts.resolve.commit(({ event }) => ({ deviceId: event.deviceId }))],
  },
  PageFailed: {
    target: "self",
    updateMemory: ({ memory, event }) => ({ pageFailures: [...memory.pageFailures, event.deviceId] }),
  },
},
```

Decommissioning ends the copy and cancels both timers: a removed device can never page anyone.

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
internalEvents: { PinFailed: { id: Schema.String, tag: Schema.String } },
memory: { flashes: Flow.initial(Schema.Array(FlashNote), []) },     // FlashNote: { id, tag, at }
traits: { flashes: Flash({ for: "3 seconds" }).each("flashes", { by: "id", max: 20 }) },

// issues.machine.ts (excerpt)
const upsert = (list: ReadonlyArray<FlashNote>, f: FlashNote) => [...list.filter((x) => x.id !== f.id), f];

const pin = O.Issues.setPinned.commit(({ event }) => ({ id: event.id, pinned: true }), {
  optimistic: [pinRowInList],   // the setData write from v4's issue list example (P13)
  revertOnUnknown: true,
  outcomes: {
    failure: E.PinFailed.from((e, { input }) => ({ id: input.id, tag: e._tag })),
    notSent: E.PinFailed.from((_, { input }) => ({ id: input.id, tag: "NotSent" })),
    unknown: E.PinFailed.from((_, { input }) => ({ id: input.id, tag: "Unknown" })),
  },
});

traits: {
  flashes: {
    resetOn: ({ item }) => item.at,   // ← NEW: per copy. A second failure restarts that row's 3 s.
    callbacks: {
      onOver: { target: "self", updateMemory: ({ memory, key }) => ({ flashes: memory.flashes.filter((f) => f.id !== key) }) },
    },
  },
},
on: {
  Pin: {
    target: "self",
    guard: (g) => !O.Issues.setPinned.pending(g, { id: g.event.id }) || deny("PinInFlight"),
    actions: [pin],
  },
  // Keeps the newest 20; `now` is the turn's clock (Machines O3).
  PinFailed: {
    target: "self",
    updateMemory: ({ memory, event, now }) => ({ flashes: upsert(memory.flashes, { id: event.id, tag: event.tag, at: now }).slice(-20) }),
  },
},
```

```tsx
const flashing = useView(app, (s) => s.memory.flashes);  // a handful of copies, not a copy per row
<IssueRow issue={issue} flash={messageFor(flashing.find((f) => f.key === issue.id)?.item.tag)} />
```

### 3.7 Two-factor sign-in: a lockout per challenge, surviving Back

v4's sign-in (section 3.1 of v4) with `.each`. Only the changes are shown; the rest of v4's machine
stays. A challenge gets a copy at its **first strike**, so going Back and re-entering the password
many times never fills the list.

```ts
// signin.definition.ts (excerpt)
memory: {
  challengeId: Flow.initial(Schema.String, ""),
  struck: Flow.private(Flow.initial(Schema.Array(Schema.String), [])),   // challenges with a strike
},
traits: { challenges: Lockout({ limit: 3, length: "5 minutes" }).each("struck", { max: 20 }) },

// signin.machine.ts (excerpt)
const union = (list: ReadonlyArray<string>, id: string) => (list.includes(id) ? list : [...list, id]);
const forget = ({ memory, key }) => ({ struck: memory.struck.filter((id) => id !== key) });

traits: {
  challenges: {
    callbacks: {
      onLocked: [ /* v4's two alternatives, unchanged */ ],
      // Unlocked: back to entering if this is the current challenge, and forget it either way.
      onUnlocked: [
        {
          target: S.TWO_FACTOR.ENTERING,
          guard: [S.TWO_FACTOR.LOCKED_OUT, ({ memory, key }) => key === memory.challengeId || deny("OtherChallenge")],
          updateMemory: (g) => ({ ...forget(g), error: null }),
        },
        { target: "self", updateMemory: forget },
      ],
    },
  },
},

// In VERIFYING, a wrong code adds the challenge (if new) and strikes it in one turn.
CodeWrong: {
  target: S.TWO_FACTOR.ENTERING,           // v4's LOCKED_OUT alternative before this one is unchanged
  updateMemory: ({ memory }) => ({ struck: union(memory.struck, memory.challengeId), error: "WrongCode" }),
  raise: [E.challenges.Strike.from(({ memory }) => ({ key: memory.challengeId }))],
},

// Signed in: every lockout is forgotten.
CodeAccepted: { target: S.SIGNED_IN, updateMemory: () => ({ struck: [] }) },

// A late WrongCode after Back re-adds its challenge and strikes it in one turn. The strike was
// started under the old life; the in-turn rule (1.4) delivers it to the new one.
abandoned: [
  {
    guard: [
      ({ state }) => !S.SIGNED_IN.is(state) || deny("SignedIn"),
      ({ payload }) => payload.tag === "WrongCode" || deny("NotWrong"),
    ],
    updateMemory: ({ memory, payload }) => ({ struck: union(memory.struck, payload.input.challengeId) }),
    raise: [E.challenges.Strike.from(({ payload }) => ({ key: payload.input.challengeId }))],
  },
  {},
],
```

`strikesOf` from v4 is unchanged: a challenge without a copy has 0 strikes.

### 3.8 Spreadsheet-style editing: several inline editors with autosave

Any number of rows can be open for editing at once. Each keeps a draft and autosaves 2 s after the
last keystroke. Closing a row with unsaved changes saves first, and the row closes only when the
save succeeds; a failed save keeps it open with an error.

```ts
export const InlineEditor = (p: { autosave: Duration.Input }) =>
  trait(
    {
      id: "InlineEditor",
      events: { Changed: { draft: Schema.String }, Close: {} },
      hostEvents: { Saved: { draft: Schema.String }, SaveFailed: {} },
      internalEvents: { Quiet: {} },
      callbacks: { onSave: Flow.Callback({ draft: Schema.String }), onClosed: Flow.Callback({}) },
      memory: {
        draft: Flow.input(Schema.String),
        saved: Flow.private(Flow.initial(Schema.String, ({ draft }) => draft)),
        closing: Flow.initial(Schema.Boolean, false),
        failed: Flow.initial(Schema.Boolean, false),
      },
    },
    ({ E, callbacks }) => {
      const save = callbacks.onSave.from(({ memory }) => ({ draft: memory.draft }));
      return {
        schedules: { quiet: { schedule: p.autosave, send: E.Quiet, armOn: [E.Changed] } },
        on: {
          Changed: {
            target: "self",
            guard: ({ memory }) => !memory.closing || deny("Closing"),
            updateMemory: ({ event }) => ({ draft: event.draft, failed: false }),
          },
          Quiet: [
            { target: "self", guard: ({ memory }) => memory.draft !== memory.saved || deny("Clean"), notify: [save] },
            { target: "self" },
          ],
          Close: [
            // Unsaved changes: save first; Saved closes the row.
            { target: "self", guard: ({ memory }) => memory.draft !== memory.saved || deny("Clean"), updateMemory: () => ({ closing: true }), notify: [save] },
            { target: "self", notify: [callbacks.onClosed] },
          ],
          Saved: [
            {
              target: "self",
              guard: ({ memory, event }) => (memory.closing && event.draft === memory.draft) || deny("KeepOpen"),
              updateMemory: ({ event }) => ({ saved: event.draft }),
              notify: [callbacks.onClosed],
            },
            { target: "self", updateMemory: ({ event }) => ({ saved: event.draft }) },
          ],
          SaveFailed: { target: "self", updateMemory: () => ({ failed: true, closing: false }) },
        },
      };
    },
  );

// sheet.definition.ts (excerpt)
events: { Open: { id: Schema.String, title: Schema.String } },   // the view sends the title it shows
internalEvents: { Saved: { id: Schema.String, draft: Schema.String }, SaveFailed: { id: Schema.String } },
memory: { editing: Flow.initial(Schema.Array(OpenRow), []) },     // OpenRow: { id, title }
traits: { editors: InlineEditor({ autosave: "2 seconds" }).each("editing", { by: "id", max: 50 }) },

// sheet.machine.ts (excerpt)
// Rows.rename uses "serialize" concurrency per id, so saves of one row land in order.
const save = O.Rows.rename.commit(({ key, payload }) => ({ id: key, title: payload.draft }), {
  outcomes: {
    success: E.Saved.from((_, { input }) => ({ id: input.id, draft: input.title })),
    failure: E.SaveFailed.from((_, { input }) => ({ id: input.id })),
    unknown: E.SaveFailed.from((_, { input }) => ({ id: input.id })),
  },
});

traits: {
  editors: {
    input: ({ item }) => ({ draft: item.title }),                                  // ← NEW: item
    callbacks: {
      onSave: { target: "self", actions: [save] },
      onClosed: { target: "self", updateMemory: ({ memory, key }) => ({ editing: memory.editing.filter((r) => r.id !== key) }) },
    },
  },
},
on: {
  Open: {
    target: "self",
    guard: [
      ({ memory, event }) => !memory.editing.some((r) => r.id === event.id) || deny("AlreadyOpen"),
      ({ memory }) => memory.editing.length < 50 || deny("TooManyOpen"),
    ],
    updateMemory: ({ memory, event }) => ({ editing: [...memory.editing, { id: event.id, title: event.title }] }),
  },
  // Both are dropped with evidence if the row closed meanwhile (1.3).
  Saved: { target: "self", raise: [E.editors.Saved.from(({ event }) => ({ key: event.id, draft: event.draft }))] },
  SaveFailed: { target: "self", raise: [E.editors.SaveFailed.from(({ event }) => ({ key: event.id }))] },
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
    guard: [
      ({ memory, event }) => memory.lines.some((l) => l.sku === event.sku) || deny("NotInCart"),
      ({ event }) => (event.qty >= 1 && event.qty <= 99) || deny("QtyRange", { min: 1, max: 99 }),
    ],
    updateMemory: ({ memory, event }) => ({ lines: memory.lines.map((l) => (l.sku === event.sku ? { ...l, qty: event.qty } : l)) }),
  },
},
```

**A plain upload queue**: per-file retry and "is it running?" are operations features: keyed
commits, `retry` (P4, one Attempt per P15) and `.pending(g, { fileId })`. Reach for `.each` when a
file has **its own timer or rules**: a visible "retrying in 5 s" countdown, pause and resume per
file, or a parallel-upload limit with a queue per file.

## 4. Open items and gaps

1. **Per-copy subscriptions.** A watchlist where each row holds its own live quote cannot start one
   subscription per key; activities are named, not keyed. Keyed activities would be a Machines O6
   change, separate from this proposal.
2. **Arm on creation and on an event.** Closed: `armOn: [Flow.entry, E.Unhover]` (v4 P7). The
   toast (3.3) no longer needs a `Shown` event.
3. **Raising into every copy.** "Acknowledge all alerts" cannot be one raise. Possible form:
   `E.devices.all.Acknowledge`. Left open until a case needs it.
4. **Several copies writing the key field in one turn.** Two parts that both filter the list from
   pre-turn memory overlap, which is v4's existing overlapping-keys defect. It needs a turn that
   reaches two copies' callbacks, which none of the examples do. If one appears, list edits
   (`remove: [key]`) instead of patches would compose.
5. **Commit joining across lives.** If Operations joins a second start with the same parameters
   into an in-flight commit, the outcome must be delivered to each starter's life. To check
   against the Operations plan.
6. **Nested `.each`.** Out of scope (1.1). Addressing would be `E.outer.key(a).inner.key(b)`.
7. **`resetOn` lag.** The final-list idea in 1.3 could also apply to part-written `resetOn`
   values, removing v4's last one-snapshot lag. Separate decision.

## 5. Plan changes this needs, if accepted

| Where | Change |
| --- | --- |
| v4 rule 9 | Replaced by section 1 of this file. |
| v4 rule 1 | "A reset on a list resets every instance" becomes per-copy `resetOn` on `.each` fillings. |
| v4 rule 6, 2.5 steps 3–6 | The final list (1.3): membership decided after the walk, `whenAbandoned` fused for every ending, repair before validation. |
| v4 rule 12 | List repairs and dropped raises join the Story-derived `flow check` warnings. |
| Operations O2 (P1) | Outcome mappers of a commit started in a copy also receive `key`. |
| Operations O3, Persistence (P12, P19) | A commit's descriptor and Attempt carry the copy's key and life. `orphaned` has no copy, so it never receives `key`. |
| Persistence | Copies persist by key with a life counter (1.5). |
| Testing (`model()`) | `explore: { <name>: n }`, default 2 (1.6). |
| CommandLine | `flow graph` draws one node per placement with its field and `max`. |
| Inspection | Copies named `name["key"]@life`, keys escaped. |

Removed words: `.list`, `Add`, `Remove`, `canAdd`, `canRemove`, `owner`, minted keys.
Added: `.each(field, { max, by? })`, `key` and `item` in fillings and copy views, `key` in outcome
mappers of commits started from a copy, `explore` in `model()`.

## 6. Changes after review

From [reviews/each-runtime-correctness.md](reviews/each-runtime-correctness.md),
[reviews/each-constraints.md](reviews/each-constraints.md),
[reviews/each-examples.md](reviews/each-examples.md) and
[reviews/each-simplicity.md](reviews/each-simplicity.md):

- **A list problem never refuses a turn.** Duplicates and keys past `max` are repaired with
  evidence, so a server delivery or timer can never be lost to them (runtime B1, constraints F2,
  examples X1). Raise into an absent key keeps v4's split: dropped in delivery turns, refused
  otherwise.
- **No follow-up turn.** Membership is decided from the turn's final list, after the walk, so a
  copy that removes itself ends in the same turn with `whenAbandoned` fused (runtime B2, M3, M6;
  constraints F3).
- **v4's in-turn re-add rule is back** (runtime B3, constraints F4); lives are a persisted counter.
- Frozen copies, persistence, hydration, timer ties and key escaping are specified (runtime M1, M5,
  m1, m4, m5; constraints F9).
- What static analysis sees and does not see is stated; `model()` gets its own `explore` bound
  (constraints F1, F5). Nested `.each` is out of scope (F6). Plan changes are listed (F7).
- `max` is required; the record key option is `by`, so `key` has one meaning; `item` is always
  present; `key` and `item` are reserved names (simplicity M1, M2, minors).
- Examples: every outcome the state waits on is mapped (examples X2); removals wait for the server
  where data could be lost (X3: inbox `trashing`, kitchen `bumping`, editors close on `Saved`);
  invites check for armed debounces before Send; toasts upsert repeated ids; the watchdog ignores
  decommissioned devices and is not persisted; sign-in adds a challenge on its first strike,
  unlocks to `ENTERING`, and clears on success; memory holds keys, not server rows (F8); only APIs
  in v4 and the plans are used (`now` from `updateMemory`, v4's `optimistic` form, `input` from
  the entry).
- Not taken: letting a commit started in a copy name the copy's event directly (simplicity M3).
  The relay through a host event is explicit and keeps rule 8 visible; revisit if it proves noisy.
- Toasts start with `armOn: [Flow.entry, E.Unhover]` and restart for a repeated id through a
  per-copy `resetOn`, replacing the `Shown` event (v4 P7, after the schedule-trigger spike).
