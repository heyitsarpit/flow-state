# Collapsed sketch: proposal.md plus the best of proposal-v2

Status: code sketch only, not a proposal. It starts from [proposal.md](proposal.md) and keeps only
the v2 ideas that remove problems without new machinery. The big collapse: **fragments do no I/O
again.** The host runs every operation as an ordinary machine action and maps the outcomes onto the
fragment's internal events, as any machine does today.

**Kept from v2:** `trait` / `subroutine`; `input` frozen at entry (no live props); guards declared by
name; `callbacks` called with `notify`; `exits`; traits on any node with `.at`; one filling block per
instance; `story.machine`.

**Dropped from v2:** `requests`, `operation`, `results`, `kind`, `notSent`, `abandoned` and the
pending record, call ids, `hostEvents` (folded into `internalEvents`), Story `.cancel`.

**New keywords (11):** `trait`, `subroutine`, `traits`, `.at`, `guards`, `callbacks`, `notify`,
`exits`, `start`, `raise`, and `input` on fragments.

## Fragments

```ts
// fragments.ts
import { subroutine, trait, deny } from "flow-state";
import { Duration, Schema } from "effect";

// ── Debounce (trait): tells its host once, `wait` after the last Input ───────
export const Debounce = (p: { wait: Duration.Input }) =>
  trait(
    {
      id: "Debounce",
      internalEvents: { Input: {}, Due: {} },          // not from the UI: the host raises Input
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      callbacks: { onSettled: {} },
    },
    ({ E, callbacks }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.seq },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ seq: memory.seq + 1 }) },
        Due: { target: "self", notify: [callbacks.onSettled] },
      },
    }),
  );

// ── Field (trait): the user edits it; the host may set it ────────────────────
export const Field = <V, I>(value: Schema.Codec<V, I>, p: { validate: (v: V) => string | null }) =>
  trait(
    {
      id: "Field",
      input: { start: value },                          // frozen when the field activates
      events: { Changed: { value } },                   // the UI sends this
      internalEvents: { Set: { value } },               // only the host (e.g. a server value)
      memory: { value, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({ value: input.start, error: p.validate(input.start) }),
      guards: ["canEdit"],
      callbacks: { onChanged: { value } },
    },
    ({ guards, callbacks }) => ({
      on: {
        Changed: {
          target: "self",
          guard: guards.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
          notify: [callbacks.onChanged.from(({ event }) => ({ value: event.value }))],
        },
        Set: {
          target: "self",
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
      },
    }),
  );

// ── Confirm (subroutine): two ways out ───────────────────────────────────────
export const Confirm = subroutine(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    exits: { Confirmed: {}, Declined: {} },
  },
  ({ exits }) => ({
    on: { Yes: exits.Confirmed, No: exits.Declined },
  }),
);

// ── CommitWithRetry (subroutine): asks its host to send; retries only on Busy ─
// It does no I/O. It asks through onSend; the host commits and maps the outcome onto
// Sent / Busy / Refused / Unsure. The request is frozen at entry, so every retry sends the
// same thing (D2). Unsure is never retried.
export const CommitWithRetry = <R extends Schema.Struct.Fields>(
  request: R,
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  subroutine(
    {
      id: "CommitWithRetry",
      input: { request: Schema.Struct(request) },
      states: ["SENDING", "BACKOFF"],
      internalEvents: {
        Sent: {},
        Busy: { reason: Schema.String },
        Refused: { reason: Schema.String },
        Unsure: {},
        Retry: {},
      },
      memory: { request: Schema.Struct(request), attempts: Schema.Int },
      initial: ({ input }) => ({ request: input.request, attempts: 0 }),
      callbacks: { onSend: { request: Schema.Struct(request) } },
      exits: {
        Done: {},
        GaveUp: { reason: Schema.String },
        Rejected: { reason: Schema.String },
        Uncertain: {},
      },
    },
    ({ S, E, callbacks, exits }) => {
      const send = callbacks.onSend.from(({ memory }) => ({ request: memory.request }));
      return {
        default: S.SENDING,
        start: [send],                                  // the first send, on entry (notify only)
        states: {
          SENDING: {
            on: {
              Sent: exits.Done,
              Refused: exits.Rejected.from(({ event }) => ({ reason: event.reason })),
              Unsure: exits.Uncertain,
              Busy: [
                {
                  target: S.BACKOFF,
                  guard: ({ memory }) => memory.attempts < p.maxRetries || deny("NoRetriesLeft"),
                  updateMemory: ({ memory }) => ({ attempts: memory.attempts + 1 }),
                },
                exits.GaveUp.from(({ event }) => ({ reason: event.reason })),
              ],
            },
          },
          BACKOFF: {
            schedules: { retry: { schedule: p.backoff, send: E.Retry } },
            on: { Retry: { target: S.SENDING, notify: [send] } },
          },
        },
      };
    },
  );

// ── Poll (subroutine): no exits; it runs until its host leaves ───────────────
export const Poll = (p: { every: Duration.Input }) =>
  subroutine(
    {
      id: "Poll",
      states: ["WAITING", "REFRESHING"],
      internalEvents: { Tick: {}, Ok: {}, Failed: {} },
      callbacks: { onRefresh: {} },
    },
    ({ S, E, callbacks }) => ({
      default: S.WAITING,
      states: {
        WAITING: {
          schedules: { tick: { schedule: p.every, send: E.Tick } },
          on: { Tick: { target: S.REFRESHING, notify: [callbacks.onRefresh] } },
        },
        REFRESHING: { on: { Ok: S.WAITING, Failed: S.WAITING } },
      },
    }),
  );
```

## A host using all of them

```ts
// ticket.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { CommitWithRetry, Confirm, Debounce, Field, Poll } from "./fragments";

export const DeleteTicket = CommitWithRetry(
  { ticketId: Schema.String },
  { maxRetries: 3, backoff: "1 second" },
);

export const Ticket = definition({
  id: "Desk/Ticket",
  states: [
    "VIEWING",
    { ASK: Confirm },
    { DELETING: DeleteTicket },
    "DELETED",
    "UNSURE",
    { LIVE: Poll({ every: "30 seconds" }) },
  ],
  traits: {
    title: Field(Schema.String, { validate: (v) => (v.trim() ? null : "Required") }),
    settle: Debounce({ wait: "500 millis" }),         // at the root; .at("VIEWING") would scope it
  },
  events: { Delete: {}, Dismiss: {}, Watch: {}, StopWatching: {} },
  input: { ticketId: Schema.String, title: Schema.String, locked: Schema.Boolean },
  memory: {
    ticketId: Schema.String,
    original: Schema.String,
    locked: Schema.Boolean,
    error: Schema.NullOr(Schema.String),
  },
  initial: ({ input }) => ({
    ticketId: input.ticketId,
    original: input.title,
    locked: input.locked,
    error: null,
  }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket.machine.ts
import { machine, deny } from "flow-state";
import { Ticket } from "./ticket.definition";

export const TicketMachine = machine(Ticket, ({ S, E, O }) => {
  const saveTitle = O.Tickets.saveTitle.commit(({ memory }) => ({
    ticketId: memory.ticketId,
    title: memory.title.value,
  }));

  // The host's own commit, exactly as machines do today; its outcomes land in the fragment.
  const deleteTicket = O.Tickets.delete.commit(({ payload }) => payload.request, {
    outcomes: {
      success: E.DELETING.Sent,
      failure: {
        TicketLocked: E.DELETING.Busy.from(({ lockedBy }) => ({ reason: `Locked by ${lockedBy}` })),
        TicketMissing: E.DELETING.Refused.from(() => ({ reason: "Already deleted" })),
      },
      unknown: E.DELETING.Unsure,
      interrupt: E.DELETING.Unsure,
      defect: E.DELETING.Unsure,
    },
  });

  const refreshList = O.Tickets.list.refetch(({ memory }) => ({ ticketId: memory.ticketId }), {
    outcomes: { success: E.LIVE.Ok, failure: E.LIVE.Failed },
  });

  return {
    default: S.VIEWING,
    // one block per trait instance
    traits: {
      title: {
        input: ({ memory }) => ({ start: memory.original }),
        guards: { canEdit: ({ memory }) => !memory.locked || deny("Locked") },
        callbacks: { onChanged: { target: "self", raise: [E.settle.Input] } },
      },
      settle: {
        callbacks: { onSettled: { target: "self", actions: [saveTitle] } },
      },
    },
    states: {
      VIEWING: {
        on: {
          Delete: { target: S.ASK, guard: ({ memory }) => !memory.locked || deny("Locked") },
          Watch: S.LIVE,
        },
      },
      // one block per subroutine instance, on its state
      ASK: {
        exits: { Confirmed: S.DELETING, Declined: S.VIEWING },
      },
      DELETING: {
        input: ({ memory }) => ({ request: { ticketId: memory.ticketId } }),
        callbacks: { onSend: { target: "self", actions: [deleteTicket] } },
        exits: {
          Done: S.DELETED,
          GaveUp: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
          Rejected: { target: S.VIEWING, updateMemory: ({ payload }) => ({ error: payload.reason }) },
          Uncertain: S.UNSURE,
        },
      },
      DELETED: {},
      UNSURE: { on: { Dismiss: S.VIEWING } },
      LIVE: {
        callbacks: { onRefresh: { target: "self", actions: [refreshList] } },
        on: { StopWatching: S.VIEWING },               // leaving abandons the poll
      },
    },
  };
});
```

```tsx
// TicketPanel.tsx
import { useView } from "flow-state/react";
import { Ticket } from "./ticket.definition";

export function TicketPanel({ ticket }: { ticket: Actor<typeof TicketMachine> }) {
  const title = useView(ticket, (s) => s.memory.title.value);
  const error = useView(ticket, (s) => s.memory.title.error ?? s.memory.error);
  const asking = useView(ticket, (s) => Ticket.S.ASK.is(s));
  const retrying = useView(ticket, (s) => Ticket.S.DELETING.BACKOFF.is(s));

  return (
    <>
      <input
        value={title}
        onChange={(e) => ticket.send(Ticket.E.title.Changed({ value: e.target.value }))}
      />
      {error && <p role="alert">{error}</p>}
      {asking ? (
        <dialog open>
          <button onClick={() => ticket.send(Ticket.E.ASK.Yes())}>Delete</button>
          <button onClick={() => ticket.send(Ticket.E.ASK.No())}>Keep</button>
        </dialog>
      ) : (
        <button onClick={() => ticket.send(Ticket.E.Delete())}>Delete ticket</button>
      )}
      {retrying && <p role="status">Ticket is locked. Retrying…</p>}
      {/* ticket.send(Ticket.E.title.Set(…))    ← type error: internal, host only */}
      {/* ticket.send(Ticket.E.DELETING.Sent()) ← type error: internal, host only */}
    </>
  );
}
```

## Testing a fragment alone

```ts
// commit-with-retry.test.ts
import { story } from "flow-state/testing";
import { DeleteTicket } from "./ticket.definition";

// The harness plays the host: it fills every port, records callback calls,
// and may send the fragment's internal events.
const givesUp = story
  .machine(DeleteTicket, { id: "CommitWithRetry/gives-up" })
  .enter({ request: { ticketId: "T-1" } })            // start: onSend #1
  .send(DeleteTicket.E.Busy({ reason: "Locked" }))
  .process()
  .advanceToNextTimer().process()                      // onSend #2
  .send(DeleteTicket.E.Busy({ reason: "Locked" }))
  .process()
  .advanceToNextTimer().process()                      // onSend #3
  .send(DeleteTicket.E.Unsure())
  .process()
  .checkpoint("end");

test("retries the frozen request on Busy, and stops on Unsure", async () => {
  const run = await givesUp.run();
  expect(run.calls.onSend).toEqual(Array(3).fill({ request: { ticketId: "T-1" } }));
  expect(run.checkpoints.end.exit).toEqual({ exit: "Uncertain", payload: {} });
});
```

## The rules, in eight lines

1. A **trait** has no states, sits in `traits` (root, or a node with `.at`), and lives while its node is active.
2. A **subroutine** sits in `states`, is fresh on every entry, and ends only by an exit or when the host leaves.
3. `events` come from anyone; `internalEvents` come only from the fragment and its host, never the UI.
4. `input` is filled by the host and frozen when the fragment activates.
5. A fragment declares `guards`, `callbacks` and `exits`; the host fills every one in one block per instance.
6. A callback never leaves its placement node; an exit must. `start` notifies on entry and does nothing else.
7. Fragments do no I/O: the host runs operations and maps outcomes onto the fragment's internal events.
8. A transition plus what it notifies and raises is one turn; if any part is refused, the whole turn is refused.

## What this gives up against proposal-v2

- **H4:** the host's outcome mapping can still send `unknown` to `Busy` and retry an uncertain write, as any machine can today.
- **L5 / L7:** leaving `DELETING` mid-commit follows the Operations plan's existing machine rules; no fragment `abandoned` record.
- **H3 (minor):** the host could raise a fragment's own timer events (`Due`), because host-only and internal are one list.
