# One `fragment()`: a fragment lives on a node

Status: research proposal, not accepted. Revised after rounds 1 and 2 (revision logs in sections 11
and 12). Evaluated against [principles.md](../principles.md) plus the problems the reviews added: L5
to L8, H4, H5, E4, E5, D5 to D7, T1 and T2. Prior art: [proposal.md](../proposal.md) and
[fragments.md](../../fragments.md) (D1–D13). Where this file and a plan differ, the plan wins; the
plan changes this proposal needs are listed in section 7.

## 1. The idea in one paragraph

There is one constructor, `fragment()`, and one lifecycle rule: **a fragment lives while its node is
active.** When its node is entered, the fragment gets fresh memory from its `input`. When the node is
left, its timers stop and its pending replies are fenced. What a fragment declares fixes where it
goes:

- **Step:** it has `states` or any `exit()`. It is placed as a host state, entered and left.
- **Always-there:** it has neither. It is embedded at the root of whatever places it.

Every fragment declares one contract, `props`: live values, guards, callbacks, requests (callbacks
the host must answer through one operation) and exits. The host supplies the whole contract in one
block at the placement. Each event list says who may send:

- `events`: anyone;
- `hostEvents`: only the placer;
- `internalEvents`: only the fragment's own schedules and replies.

A turn is still one fused transition that reads the pre-turn snapshot (Machines O3).

## 2. Verdict on the assumptions (short)

**The shape.** A fragment's kind is fixed by its own declarations: `states` or an `exit()` makes a
step, and neither makes it always-there. The types refuse any other placement at the placement line.
**Plainly, this is the split's placement rule under one name.**

What one constructor buys:

- One vocabulary and one rulebook. Contract, senders, turns and requests are identical for both
  kinds.
- The kind cannot disagree with the body. Adding a first `exit()` turns a fragment into a step, and
  every `embeds` line that used it becomes a type error.

What it costs:

- Principle 2's glance test. You learn the lifetime from two declarations (`states:`, `exit(`), not
  one word.
- Several rules are kind-specific because placement is. Rules 2, 3, 4 and 9 and the leaving rule
  differ by kind, though all follow from "a step's node is entered and left; a root is not".

`flow graph` and editor hover show the derived kind. Round 2's principles review favours two names;
every mechanism below carries over to the split unchanged.

| Prior decision | Verdict |
| --- | --- |
| D1–D3 nesting, readable nested names | keep |
| D4, D6 the fragment declares its contract | keep; exits and requests join the same `props` record |
| D5, D7 only exits end a fragment, taken only by it | keep; `exit()` is a prop kind |
| D9 the host cannot reach inside | keep |
| D10 host policy through declared guards | keep, stricter: guards always required; no guards on callback, exit or abandoned handlers |
| D11 only the host sends | **replace** with three sender lists declared by the fragment (from opus-split) |
| D12, D13 two constructors | **replace** with one constructor and a derived kind |
| version 2, no I/O in fragments | keep; I/O goes through requests: `callback(…).commit({…})` or `.lookup({…})` |

## 3. The API

### 3.1 Keywords

| Kind | Words |
| --- | --- |
| **New (27)** | `fragment`; `embeds` (and its `{ fragment, input }` form); `props`; `hostEvents`; `prop(schema)`; `guard()`; `callback(fields?)`; `.optional()`; `.commit({ success, failure, notSent, uncertain })`; `.lookup({ success, failure, broken })`; the reply kinds `notSent`, `uncertain`, `broken`; `exit(fields?)`; `start`; `raise`; `.enter(…)` on a state token; `operation`; `abandoned`; `reply` (the binding's token argument); the outcome literal `"pending"`; `story.fragment` with `.reply`, `.raise`, `.leave`; `run.calls`; `run.end.exit` |
| **Existing in the plans** | `definition`, `machine`, `states`, `events`, `internalEvents`, `input` (same meaning: activation input), `memory`, `initial`, `operations`, `default`, `on`, `target`, `"self"`, `guard`, `updateMemory`, `actions`, `activities`, `schedules`, `restartOn`, `send` (schedule field), `outcomes`, `success`, `failure`, `commit`, `retry`, `lookup`, `refetch`, `subscribe`, `cancel`, `.from`, `deny`, `check`, `Attempt`, `S`, `E`, `O`, `story`, `useView`, `Actor`. `.commit` and `.lookup` on a callback keep the plans' meaning: "bound to a commit (or retry)", "bound to a lookup (or refetch)" |
| **Author-chosen** | every other name: `Field`, `Debounce`, `Confirm`, `CommitWithRetry`, `Reconcile`, `Poll`, `AddressStep`, `title`, `DELETING`, `changed`, `settled`, `canEdit`, `submit`, `refresh`, `verify`, `check`, `done`, `Succeeded`, … |

In **host** handlers (callback, exit and abandoned handlers, and `.enter` and operation selects),
`event` is the *declared* payload of that callback, exit or request, or the host's own triggering
event. It is never the fragment's internal event (D9).

### 3.2 The fragments

```ts
// fragments/field.ts — always there (no states, no exits)
import { fragment, guard, callback } from "flow-state";
import { Schema } from "effect";

export const Field = <A>(value: Schema.Codec<A>, p: { validate: (v: A) => string | null }) =>
  fragment(
    {
      id: "Field",
      input: { start: value },                       // supplied where it is placed; read by initial
      events: { Changed: { value }, Blurred: {} },   // anyone who can send to the host
      hostEvents: { Set: { value } },                // only the placer, by raise
      memory: { value, touched: Schema.Boolean, error: Schema.NullOr(Schema.String) },
      initial: ({ input }) => ({
        value: input.start,
        touched: false,
        error: p.validate(input.start),
      }),
      props: {
        canEdit: guard(),                            // required: the placer spells out its policy
        changed: callback({ value }).optional(),     // unbound: nothing happens
      },
    },
    ({ props }) => ({
      on: {
        Changed: {
          target: "self",
          guard: props.canEdit,
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
          actions: [props.changed.from(({ event }) => ({ value: event.value }))],
        },
        Set: {
          target: "self",
          updateMemory: ({ event }) => ({ value: event.value, error: p.validate(event.value) }),
        },
        Blurred: { target: "self", updateMemory: () => ({ touched: true }) },
      },
    }),
  );

export const isValid = (f: { error: string | null }) => f.error === null;
export const visibleError = (f: { touched: boolean; error: string | null }) =>
  f.touched ? f.error : null;
```

```ts
// fragments/debounce.ts — always there
import { fragment, callback } from "flow-state";
import { Duration, Schema } from "effect";

// Calls `settled` once, `wait` after the last Input. The restartOn baseline is taken when the
// fragment's node is entered, and nothing can raise Input in that same turn (rule 14), so the
// first Input always restarts the schedule (T2).
export const Debounce = (p: { wait: Duration.Input }) =>
  fragment(
    {
      id: "Debounce",
      hostEvents: { Input: {} },        // only the placer raises it; handled unguarded, so total
      internalEvents: { Due: {} },      // only the schedule below sends it
      memory: { seq: Schema.Int },
      initial: () => ({ seq: 0 }),
      props: { settled: callback() },   // required
    },
    ({ E, props }) => ({
      schedules: {
        settle: { schedule: p.wait, send: E.Due, restartOn: ({ memory }) => memory.seq },
      },
      on: {
        Input: { target: "self", updateMemory: ({ memory }) => ({ seq: memory.seq + 1 }) },
        Due: { target: "self", actions: [props.settled] },
      },
    }),
  );
```

```ts
// fragments/confirm.ts — a step (it has exits)
import { fragment, exit } from "flow-state";

export const Confirm = fragment(
  {
    id: "Confirm",
    events: { Yes: {}, No: {} },
    props: { confirmed: exit(), declined: exit() },
  },
  ({ props }) => ({
    on: {
      Yes: props.confirmed,
      No: props.declined,
    },
  }),
);
```

```ts
// fragments/commit-with-retry.ts — a step
import { fragment, callback, exit, deny, Attempt } from "flow-state";
import { Duration, Schema } from "effect";

// Sends the request it was entered with. Retries only what certainly did not reach the server:
// Busy (a definite failure) and notSent (never invoked). Anything uncertain (unknown, adapter
// interrupt, defect) ends through `uncertain` with its Attempt, and is never resent (H5).
export const CommitWithRetry = <R>(
  request: Schema.Codec<R>,
  p: { maxRetries: number; backoff: Duration.Input },
) =>
  fragment(
    {
      id: "CommitWithRetry",
      states: ["SENDING", "BACKOFF"],
      input: { request },                              // fixed for this entry (D2)
      internalEvents: {
        Succeeded: {},
        Busy: {},
        Rejected: { reason: Schema.String },
        NotSent: {},
        Uncertain: { attempt: Attempt },
        RetryDue: {},
      },
      memory: { request, retries: Schema.Int },
      initial: ({ input }) => ({ request: input.request, retries: 0 }),
      props: {
        submit: callback({ request }).commit({
          success: "Succeeded",            // host maps the success value onto this
          failure: ["Busy", "Rejected"],   // host maps each of its error tags onto one of these
          notSent: "NotSent",              // runtime: declined admission, cancel before invocation, unacknowledged restore
          uncertain: "Uncertain",          // runtime: unknown, interrupt, defect, acknowledged restore, a throwing mapper
        }),
        done: exit(),
        failed: exit({ reason: Schema.String }),
        uncertain: exit({ attempt: Attempt }),
      },
    },
    ({ S, E, props }) => {
      const retryOrGiveUp = [
        {
          target: S.BACKOFF,
          guard: ({ memory }) => memory.retries < p.maxRetries || deny("RetriesExhausted"),
          updateMemory: ({ memory }) => ({ retries: memory.retries + 1 }),
        },
        // unguarded last alternative: a reply can never be declined (rule 15)
        { target: props.failed.from(() => ({ reason: "Could not get through after retrying" })) },
      ];
      return {
        default: S.SENDING,
        // joins the transition that enters this step; reads only this entry's input
        start: { actions: [props.submit.from(({ input }) => ({ request: input.request }))] },
        states: {
          SENDING: {
            on: {
              Succeeded: props.done,
              Rejected: { target: props.failed.from(({ event }) => ({ reason: event.reason })) },
              Uncertain: { target: props.uncertain.from(({ event }) => ({ attempt: event.attempt })) },
              Busy: retryOrGiveUp,
              NotSent: retryOrGiveUp,
            },
          },
          BACKOFF: {
            schedules: {
              retry: {
                schedule: ({ memory }) => Duration.times(p.backoff, 2 ** (memory.retries - 1)),
                send: E.RetryDue,
              },
            },
            on: {
              RetryDue: {
                target: S.SENDING,
                actions: [props.submit.from(({ memory }) => ({ request: memory.request }))],
              },
            },
          },
        },
      };
    },
  );
```

```ts
// fragments/reconcile.ts — a step: finds out what happened to an uncertain commit
import { fragment, callback, exit, Attempt } from "flow-state";

export const Reconcile = fragment(
  {
    id: "Reconcile",
    states: ["CHECKING", "UNSURE"],
    input: { attempt: Attempt },
    events: { CheckAgain: {} },
    internalEvents: { Landed: {}, Refused: {}, NotChecked: {}, StillUnknown: { attempt: Attempt } },
    memory: { attempt: Attempt },
    initial: ({ input }) => ({ attempt: input.attempt }),
    props: {
      // bound to O.x.retry, which reuses the Attempt's id and input (Operations O3)
      check: callback({ attempt: Attempt }).commit({
        success: "Landed",
        failure: ["Refused"],
        notSent: "NotChecked",
        uncertain: "StillUnknown",
      }),
      landed: exit(),
      refused: exit(),
    },
  },
  ({ S, props }) => ({
    default: S.CHECKING,
    start: { actions: [props.check.from(({ input }) => ({ attempt: input.attempt }))] },
    states: {
      CHECKING: {
        on: {
          Landed: props.landed,
          Refused: props.refused,
          NotChecked: { target: S.UNSURE },
          StillUnknown: { target: S.UNSURE, updateMemory: ({ event }) => ({ attempt: event.attempt }) },
        },
      },
      UNSURE: {
        on: {
          CheckAgain: {
            target: S.CHECKING,
            actions: [props.check.from(({ memory }) => ({ attempt: memory.attempt }))],
          },
        },
      },
    },
  }),
);
```

Reconcile resends after `uncertain`, which looks like what check 4 forbids. It is not: `check` is
bound to `O.x.retry` with the same Attempt, so the runtime reuses the Attempt id and a known result
settles without a second write. Check 4 applies to callbacks bound to `O.x.commit`, which mints a new
Attempt.

```ts
// fragments/poll.ts — a step (it has states). No exits: it runs until its host leaves.
import { fragment, callback } from "flow-state";
import { Duration, Schema } from "effect";

export const Poll = (p: { every: Duration.Input; maxBackoff: Duration.Input }) =>
  fragment(
    {
      id: "Poll",
      states: ["WAITING", "REFRESHING"],
      internalEvents: { Tick: {}, Refreshed: {}, RefreshFailed: {} },
      memory: { failures: Schema.Int },
      initial: () => ({ failures: 0 }),
      props: {
        refresh: callback().lookup({
          success: "Refreshed",
          failure: ["RefreshFailed"],
          broken: "RefreshFailed",           // runtime: defect, interrupt, restore, a throwing mapper
        }),
      },
    },
    ({ S, E, props }) => ({
      default: S.WAITING,
      states: {
        WAITING: {
          schedules: {
            tick: {
              schedule: ({ memory }) =>
                Duration.min(Duration.times(p.every, 2 ** memory.failures), p.maxBackoff),
              send: E.Tick,
            },
          },
          on: { Tick: { target: S.REFRESHING, actions: [props.refresh] } },
        },
        REFRESHING: {
          on: {
            Refreshed: { target: S.WAITING, updateMemory: () => ({ failures: 0 }) },
            RefreshFailed: {
              target: S.WAITING,
              updateMemory: ({ memory }) => ({ failures: memory.failures + 1 }),
            },
          },
        },
      },
    }),
  );
```

```ts
// fragments/address-step.ts — a step that embeds two fragments
import { fragment, callback, exit, deny } from "flow-state";
import { Schema } from "effect";
import { Field, isValid } from "./field";

export const Address = Schema.Struct({ street: Schema.String, city: Schema.String });
const required = (v: string) => (v.trim() === "" ? "Required" : null);

export const AddressStep = fragment(
  {
    id: "AddressStep",
    states: ["FILLING", "VERIFYING"],
    input: { saved: Address },
    embeds: {
      // seeded from this step's input on every entry of the step
      street: { fragment: Field(Schema.String, { validate: required }), input: ({ input }) => ({ start: input.saved.street }) },
      city: { fragment: Field(Schema.String, { validate: required }), input: ({ input }) => ({ start: input.saved.city }) },
    },
    events: { Next: {}, Back: {} },
    internalEvents: { Verified: {}, Unverifiable: { reason: Schema.String }, CheckBroken: {} },
    memory: { candidate: Address, problem: Schema.NullOr(Schema.String) },
    initial: ({ input }) => ({ candidate: input.saved, problem: null }),
    props: {
      verify: callback({ address: Address }).lookup({
        success: "Verified",
        failure: ["Unverifiable"],
        broken: "CheckBroken",
      }),
      next: exit({ address: Address }),
      back: exit({ draft: Address }),             // leaving early still hands back what was typed (D7)
    },
  },
  ({ S, props }) => ({
    default: S.FILLING,
    // AddressStep binds its children's contracts; its host never sees Field's props (D9)
    embeds: {
      street: { props: { canEdit: ({ state }) => state === "FILLING" || deny("Verifying") } },
      city: { props: { canEdit: ({ state }) => state === "FILLING" || deny("Verifying") } },
    },
    on: {
      Back: {
        target: props.back.from(({ memory }) => ({
          draft: { street: memory.street.value, city: memory.city.value },
        })),
      },
    },
    states: {
      FILLING: {
        on: {
          Next: {
            target: S.VERIFYING,
            guard: ({ memory }) => (isValid(memory.street) && isValid(memory.city)) || deny("Invalid"),
            // the address being verified is captured; the exit hands back this copy, not live fields
            updateMemory: ({ memory }) => ({
              candidate: { street: memory.street.value, city: memory.city.value },
              problem: null,
            }),
            actions: [
              props.verify.from(({ memory }) => ({
                address: { street: memory.street.value, city: memory.city.value },
              })),
            ],
          },
        },
      },
      VERIFYING: {
        on: {
          Next: { target: "self", guard: () => deny("Verifying") },   // refused on purpose, visible to check()
          Verified: { target: props.next.from(({ memory }) => ({ address: memory.candidate })) },
          Unverifiable: { target: S.FILLING, updateMemory: ({ event }) => ({ problem: event.reason }) },
          CheckBroken: {
            target: S.FILLING,
            updateMemory: () => ({ problem: "We could not check this address; try again" }),
          },
        },
      },
    },
  }),
);
```

In a placer's guard binding, `state` is the placer's own state path. For `AddressStep` that is
`"FILLING" | "VERIFYING"`, just as `memory` is the step's own slice.

### 3.3 Host 1: a ticket editor (validated field, debounce, confirm, commit with retry)

```ts
// ticket-editor.definition.ts — structure: produces S, E and the UI's types
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { Field } from "./fragments/field";
import { Debounce } from "./fragments/debounce";
import { Confirm } from "./fragments/confirm";
import { CommitWithRetry } from "./fragments/commit-with-retry";
import { TicketsDomain } from "./tickets.domain";

export const DeleteRequest = Schema.Struct({ ticketId: Schema.String });

export const TicketEditor = definition({
  id: "Desk/TicketEditor",
  states: [
    "VIEWING",
    { DELETE_ASK: Confirm },
    { DELETING: CommitWithRetry(DeleteRequest, { maxRetries: 3, backoff: "1 second" }) },
    "DELETED",
    "DELETE_UNKNOWN",
  ],
  embeds: {
    // seeded from host input in the definition, so initial memory needs no machine (Machines O1)
    title: {
      fragment: Field(Schema.String, { validate: (v) => (v.trim() === "" ? "Required" : null) }),
      input: ({ input }) => ({ start: input.title }),
    },
    titleCheck: Debounce({ wait: "300 millis" }),
  },
  events: { Delete: {}, CancelDelete: {}, Dismiss: {} },
  input: { ticketId: Schema.String, title: Schema.String, locked: Schema.Boolean },
  memory: {
    ticketId: Schema.String,
    locked: Schema.Boolean,
    checkedTitle: Schema.NullOr(Schema.String),
    deleteError: Schema.NullOr(Schema.String),
    unsettled: Schema.NullOr(Attempt),      // an abandoned delete still in flight (L7)
    mayBeDeleted: Schema.NullOr(Attempt),   // a delete whose result is success or uncertain
  },
  initial: ({ input }) => ({
    ticketId: input.ticketId,
    locked: input.locked,
    checkedTitle: null,
    deleteError: null,
    unsettled: null,
    mayBeDeleted: null,
  }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-editor.machine.ts — behaviour: one block per placement
import { machine, deny } from "flow-state";
import { TicketEditor } from "./ticket-editor.definition";

export const TicketEditorMachine = machine(TicketEditor, ({ S, E, O }) => ({
  default: S.VIEWING,
  activities: {
    taken: O.Tickets.titleTaken.subscribe(({ memory }) =>
      memory.checkedTitle === null ? null : { title: memory.checkedTitle },
    ),
  },
  embeds: {
    title: {
      props: {
        canEdit: ({ memory }) => !memory.locked || deny("Locked"),
        changed: { raise: [E.titleCheck.Input] },
      },
    },
    titleCheck: {
      props: {
        // Due arrives in its own later turn, so title.value is current here
        settled: { updateMemory: ({ memory }) => ({ checkedTitle: memory.title.value }) },
      },
    },
  },
  states: {
    VIEWING: {
      on: {
        Delete: {
          target: S.DELETE_ASK,
          guard: ({ memory }) =>
            memory.locked ? deny("Locked") : memory.unsettled !== null ? deny("DeletePending") : true,
        },
      },
    },
    DELETE_ASK: {
      props: {
        // a step with input is entered by naming its input; bare S.DELETING is a type error
        confirmed: S.DELETING.enter(({ memory }) => ({ request: { ticketId: memory.ticketId } })),
        declined: S.VIEWING,
      },
    },
    DELETING: {
      props: {
        submit: {
          // reply tokens exist only here; a commit select reads only the request (D2)
          operation: ({ reply }) =>
            O.Tickets.delete.commit(({ event }) => event.request, {
              outcomes: {
                success: reply.Succeeded,
                failure: {
                  TicketLocked: reply.Busy,
                  TicketNotFound: reply.Rejected.from(() => ({ reason: "This ticket no longer exists" })),
                },
              },
            }),
          // runs with "pending" inside the departure turn, then once more with the final outcome
          abandoned: {
            updateMemory: ({ event, memory }) => {
              if (event.outcome === "pending") return { unsettled: event.attempt };
              const settled = memory.unsettled?.id === event.attempt.id ? { unsettled: null } : {};
              return event.outcome === "success" || event.outcome === "uncertain"
                ? { ...settled, mayBeDeleted: event.attempt }
                : settled;                     // failure or notSent: never clobbers another Attempt
            },
          },
        },
        done: S.DELETED,
        failed: { target: S.VIEWING, updateMemory: ({ event }) => ({ deleteError: event.reason }) },
        uncertain: {
          target: S.DELETE_UNKNOWN,
          updateMemory: ({ event }) => ({ mayBeDeleted: event.attempt }),
        },
      },
      // the host may always leave a step; this abandons it
      on: {
        CancelDelete: {
          target: S.VIEWING,
          actions: [O.Tickets.delete.cancel(({ memory }) => ({ ticketId: memory.ticketId }))],
        },
      },
    },
    DELETED: {},
    DELETE_UNKNOWN: {
      on: { Dismiss: { target: S.VIEWING, updateMemory: () => ({ mayBeDeleted: null }) } },
    },
  },
}));
```

```tsx
// ticket-editor.view.tsx — sends at the same path it reads
import type { Actor } from "flow-state";
import { useView } from "flow-state/react";
import { TicketEditor } from "./ticket-editor.definition";
import { visibleError } from "./fragments/field";

export function TicketEditorView({ editor }: { editor: Actor<typeof TicketEditor> }) {
  const title = useView(editor, (s) => s.memory.title.value);
  const titleError = useView(editor, (s) => visibleError(s.memory.title));
  const taken = useView(editor, (s) => s.activities.taken?.data === true);
  const asking = useView(editor, (s) => TicketEditor.S.DELETE_ASK.is(s));
  const deleting = useView(editor, (s) => TicketEditor.S.DELETING.is(s));
  const retrying = useView(editor, (s) => TicketEditor.S.DELETING.BACKOFF.is(s));
  const retries = useView(editor, (s) => s.memory.DELETING?.retries ?? 0);   // absent outside DELETING
  const deleteError = useView(editor, (s) => s.memory.deleteError);
  const pending = useView(editor, (s) => s.memory.unsettled !== null);
  const mayBeDeleted = useView(editor, (s) => s.memory.mayBeDeleted !== null);

  return (
    <form>
      <input
        value={title}
        onChange={(e) => editor.send(TicketEditor.E.title.Changed({ value: e.target.value }))}
        onBlur={() => editor.send(TicketEditor.E.title.Blurred())}
      />
      {titleError && <p>{titleError}</p>}
      {taken && <p>Another ticket has this title.</p>}
      <button type="button" disabled={pending} onClick={() => editor.send(TicketEditor.E.Delete())}>
        Delete
      </button>
      {asking && (
        <>
          <button type="button" onClick={() => editor.send(TicketEditor.E.DELETE_ASK.Yes())}>Yes, delete</button>
          <button type="button" onClick={() => editor.send(TicketEditor.E.DELETE_ASK.No())}>Keep it</button>
        </>
      )}
      {deleting && (
        <button type="button" onClick={() => editor.send(TicketEditor.E.CancelDelete())}>Stop</button>
      )}
      {retrying && <p>Ticket is locked, retrying ({retries})…</p>}
      {pending && <p>A stopped delete is still finishing.</p>}
      {deleteError && <p>{deleteError}</p>}
      {mayBeDeleted && <p>The delete may have gone through. Refresh before trying again.</p>}
      {/* editor.send(TicketEditor.E.title.Set({ value: "x" }))  type error: Set is a hostEvent        */}
      {/* editor.send(TicketEditor.E.titleCheck.Input())         type error: Input is a hostEvent      */}
      {/* editor.send(TicketEditor.E.DELETING.Succeeded())       type error: an internal (reply) event */}
    </form>
  );
}
```

### 3.4 Host 2: a queue that polls until the user leaves

```ts
// ticket-queue.definition.ts
import { definition } from "flow-state";
import { Schema } from "effect";
import { Poll } from "./fragments/poll";
import { TicketsDomain } from "./tickets.domain";

export const TicketQueue = definition({
  id: "Desk/TicketQueue",
  // Poll has no input and no start, so it may be a default (rule 4)
  states: [{ LIVE: Poll({ every: "10 seconds", maxBackoff: "2 minutes" }) }, "PAUSED"],
  events: { Pause: {}, Resume: {} },
  input: { queueId: Schema.String },
  memory: { queueId: Schema.String },
  initial: ({ input }) => ({ queueId: input.queueId }),
  operations: { Tickets: TicketsDomain },
});
```

```ts
// ticket-queue.machine.ts
import { machine } from "flow-state";
import { TicketQueue } from "./ticket-queue.definition";

export const TicketQueueMachine = machine(TicketQueue, ({ S, O }) => ({
  default: S.LIVE,
  activities: { list: O.Tickets.list.subscribe(({ memory }) => ({ queueId: memory.queueId })) },
  states: {
    LIVE: {
      props: {
        // a lookup binding may read host memory for its key; reads should be current
        refresh: {
          operation: ({ reply }) =>
            O.Tickets.list.refetch(({ memory }) => ({ queueId: memory.queueId }), {
              outcomes: { success: reply.Refreshed, failure: reply.RefreshFailed },  // one untagged error type
            }),
        },
      },
      // L4: the host leaves with its own event; Poll's timer stops and a late refresh is fenced
      on: { Pause: S.PAUSED },
    },
    PAUSED: { on: { Resume: S.LIVE } },
  },
}));
```

```tsx
// ticket-queue.view.tsx
import type { Actor } from "flow-state";
import { useView } from "flow-state/react";
import { TicketQueue } from "./ticket-queue.definition";

export function TicketQueueView({ queue }: { queue: Actor<typeof TicketQueue> }) {
  const tickets = useView(queue, (s) => s.activities.list?.data ?? []);
  const live = useView(queue, (s) => TicketQueue.S.LIVE.is(s));
  const refreshing = useView(queue, (s) => TicketQueue.S.LIVE.REFRESHING.is(s));
  const failures = useView(queue, (s) => s.memory.LIVE?.failures ?? 0);

  return (
    <section>
      {live ? (
        <button onClick={() => queue.send(TicketQueue.E.Pause())}>Pause updates</button>
      ) : (
        <button onClick={() => queue.send(TicketQueue.E.Resume())}>Resume updates</button>
      )}
      {refreshing && <span>Refreshing…</span>}
      {failures > 0 && <span>Refresh failed {failures} times; backing off.</span>}
      <ul>{tickets.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </section>
  );
}
```

### 3.5 Host 3: checkout wizard → address step → two fields, with reconciliation

```ts
// checkout.definition.ts
import { definition, Attempt } from "flow-state";
import { Schema } from "effect";
import { Address, AddressStep } from "./fragments/address-step";
import { Confirm } from "./fragments/confirm";
import { CommitWithRetry } from "./fragments/commit-with-retry";
import { Reconcile } from "./fragments/reconcile";
import { OrdersDomain } from "./orders.domain";
import { GeoDomain } from "./geo.domain";

export const PlaceOrderRequest = Schema.Struct({ cartId: Schema.String, address: Address });

export const Checkout = definition({
  id: "Shop/Checkout",
  states: [
    "CART",
    { ADDRESS: AddressStep },
    { REVIEW: Confirm },
    { PLACING: CommitWithRetry(PlaceOrderRequest, { maxRetries: 2, backoff: "2 seconds" }) },
    { RECONCILING: Reconcile },
    "PLACED",
    "FAILED",
  ],
  events: { Begin: {}, StartOver: {} },
  input: { cartId: Schema.String, address: Address },
  memory: {
    cartId: Schema.String,
    address: Address,                        // the host keeps each step's result and hands it back
    error: Schema.NullOr(Schema.String),
    unsettled: Schema.NullOr(Attempt),
  },
  initial: ({ input }) => ({ cartId: input.cartId, address: input.address, error: null, unsettled: null }),
  operations: { Orders: OrdersDomain, Geo: GeoDomain },
});
```

```ts
// checkout.machine.ts
import { machine } from "flow-state";
import { Checkout } from "./checkout.definition";

export const CheckoutMachine = machine(Checkout, ({ S, O }) => {
  const enterAddress = S.ADDRESS.enter(({ memory }) => ({ saved: memory.address }));
  // one abandoned record shape for both commit placements: never clobbers another Attempt
  const track = {
    updateMemory: ({ event, memory }) =>
      event.outcome === "pending"
        ? { unsettled: event.attempt }
        : memory.unsettled?.id === event.attempt.id
          ? { unsettled: null }
          : {},
  };
  const orderOutcomes = (reply) => ({
    success: reply.success,
    failure: {
      CartBusy: reply.busy,
      OutOfStock: reply.refused.from(() => ({ reason: "Something in your cart sold out" })),
      PaymentDeclined: reply.refused.from(() => ({ reason: "Your payment was declined" })),
    },
  });

  return {
    default: S.CART,
    states: {
      CART: { on: { Begin: enterAddress } },
      ADDRESS: {
        props: {
          verify: {
            operation: ({ reply }) =>
              O.Geo.verifyAddress.lookup(({ event }) => event.address, {
                outcomes: {
                  success: reply.Verified,
                  failure: { Undeliverable: reply.Unverifiable.from(({ reason }) => ({ reason })) },
                },
              }),
          },
          next: { target: S.REVIEW, updateMemory: ({ event }) => ({ address: event.address }) },
          back: { target: S.CART, updateMemory: ({ event }) => ({ address: event.draft }) },
        },
      },
      REVIEW: {
        props: {
          // the exit handler supplies the next step's input; nothing reads a stale copy (D6)
          confirmed: S.PLACING.enter(({ memory }) => ({
            request: { cartId: memory.cartId, address: memory.address },
          })),
          declined: enterAddress,                  // ADDRESS re-enters fresh, seeded from what was kept
        },
      },
      PLACING: {
        props: {
          submit: {
            operation: ({ reply }) =>
              O.Orders.place.commit(({ event }) => event.request, {
                outcomes: orderOutcomes({
                  success: reply.Succeeded,
                  busy: reply.Busy,
                  refused: reply.Rejected,
                }),
              }),
            abandoned: track,
          },
          done: S.PLACED,
          failed: { target: S.FAILED, updateMemory: ({ event }) => ({ error: event.reason }) },
          // the fragment, not the host, decided that uncertain never resends: no double order (H4, H5)
          uncertain: S.RECONCILING.enter(({ event }) => ({ attempt: event.attempt })),
        },
      },
      RECONCILING: {
        props: {
          check: {
            // retry reuses the Attempt: a landed order is found, never placed twice
            operation: ({ reply }) =>
              O.Orders.place.retry(({ event }) => event.attempt, {
                outcomes: {
                  success: reply.Landed,
                  failure: { CartBusy: reply.Refused, OutOfStock: reply.Refused, PaymentDeclined: reply.Refused },
                },
              }),
            abandoned: track,
          },
          landed: S.PLACED,
          refused: { target: S.FAILED, updateMemory: () => ({ error: "Your order was not placed" }) },
        },
      },
      PLACED: {},
      FAILED: { on: { StartOver: { target: S.REVIEW, updateMemory: () => ({ error: null }) } } },
    },
  };
});
```

`orderOutcomes` is a plain helper that builds the `outcomes` record. Its argument is typed from the
`reply` tokens, so a failure tag can still map only onto a failure-kind reply.

```tsx
// checkout.view.tsx — two levels deep, with no forwarding anywhere
import type { Actor } from "flow-state";
import { useView } from "flow-state/react";
import { Checkout } from "./checkout.definition";
import { visibleError } from "./fragments/field";

export function CheckoutView({ checkout }: { checkout: Actor<typeof Checkout> }) {
  const step = useView(checkout, (s) => Checkout.S.root.child(s));
  const street = useView(checkout, (s) => s.memory.ADDRESS?.street);       // present only in ADDRESS
  const city = useView(checkout, (s) => s.memory.ADDRESS?.city);
  const verifying = useView(checkout, (s) => Checkout.S.ADDRESS.VERIFYING.is(s));
  const problem = useView(checkout, (s) => s.memory.ADDRESS?.problem ?? null);
  const unsure = useView(checkout, (s) => Checkout.S.RECONCILING.UNSURE.is(s));
  const error = useView(checkout, (s) => s.memory.error);

  if (step === "CART") return <button onClick={() => checkout.send(Checkout.E.Begin())}>Checkout</button>;
  if (step === "ADDRESS" && street && city)
    return (
      <form onSubmit={(e) => { e.preventDefault(); checkout.send(Checkout.E.ADDRESS.Next()); }}>
        <input
          value={street.value}
          disabled={verifying}
          onChange={(e) => checkout.send(Checkout.E.ADDRESS.street.Changed({ value: e.target.value }))}
          onBlur={() => checkout.send(Checkout.E.ADDRESS.street.Blurred())}
        />
        {visibleError(street) && <p>{visibleError(street)}</p>}
        <input
          value={city.value}
          disabled={verifying}
          onChange={(e) => checkout.send(Checkout.E.ADDRESS.city.Changed({ value: e.target.value }))}
          onBlur={() => checkout.send(Checkout.E.ADDRESS.city.Blurred())}
        />
        {visibleError(city) && <p>{visibleError(city)}</p>}
        {problem && <p>{problem}</p>}
        <button type="button" onClick={() => checkout.send(Checkout.E.ADDRESS.Back())}>Back</button>
        <button type="submit" disabled={verifying}>Next</button>
      </form>
    );
  if (step === "REVIEW")
    return (
      <>
        <button onClick={() => checkout.send(Checkout.E.REVIEW.Yes())}>Place order</button>
        <button onClick={() => checkout.send(Checkout.E.REVIEW.No())}>Change address</button>
      </>
    );
  if (step === "PLACING") return <p>Placing your order…</p>;
  if (step === "RECONCILING")
    return unsure ? (
      <>
        <p>We could not confirm your order yet.</p>
        <button onClick={() => checkout.send(Checkout.E.RECONCILING.CheckAgain())}>Check again</button>
      </>
    ) : (
      <p>Checking whether your order went through…</p>
    );
  if (step === "FAILED")
    return <><p>{error}</p><button onClick={() => checkout.send(Checkout.E.StartOver())}>Try again</button></>;
  return <p>Order placed.</p>;
}
```

Under D11 forwarding, `Checkout` declared four host events and forwarded each to `ADDRESS`, which
forwarded each again to `street` or `city`. A missing or guarded forwarding line dropped keystrokes,
and with an invariant input such as `Release` it broke the fragment (E4). Here the UI sends `Changed`
straight to the field. The only refusal is the guard that `AddressStep` supplies to its own children.

### 3.6 Testing a fragment alone

`story.fragment(fragment, { id, input?, props })` builds a harness host:

- A step is the harness's only state, entered with `input`. An always-there fragment is embedded at
  the harness root.
- Live props and guards take fixed values (`true` or `deny("Code")`), because Stories accept no
  arbitrary callbacks.
- Callback calls, exits and abandoned records are recorded in `run.calls` and `run.end.exit`.

Story commands:

- `.raise(event)` plays the placer and accepts only the fragment's `hostEvents`.
- `.reply(callback, outcome)` answers the pending call with one form, an outcome by kind:
  `{ success: payload }`, `{ failure: { Busy: payload } }`, `{ notSent: {} }`, `{ uncertain: {} }`
  (the harness supplies the call's Attempt), or `{ broken: {} }`. It fails if no call is pending.
- `.leave()` abandons a step.

**Testing O3/O5 amendment, named:** `.reply` exists only on `story.fragment`. A fragment Story's
boundary is the fragment's contract, and a reply is an input at that boundary. Host Stories still
obtain every outcome from fixtures. The fixture-backed alternative is listed in section 8.

```ts
import { story } from "flow-state/testing";
import { check, deny } from "flow-state";
import { expect, test } from "vitest";
import { CommitWithRetry } from "./fragments/commit-with-retry";
import { Debounce } from "./fragments/debounce";
import { AddressStep } from "./fragments/address-step";
import { DeleteRequest } from "./ticket-editor.definition";

test("CommitWithRetry retries what was not sent, then gives up", async () => {
  const commit = CommitWithRetry(DeleteRequest, { maxRetries: 1, backoff: "1 second" });
  const run = await story
    .fragment(commit, { id: "commit-gives-up", input: { request: { ticketId: "t1" } }, props: {} })
    .process()                                       // start submits once
    .reply("submit", { failure: { Busy: {} } })
    .process()
    .advance("1 second")
    .process()                                       // the retry submits the same captured request
    .reply("submit", { notSent: {} })
    .process()
    .run();
  expect(run.calls.submit).toEqual([{ request: { ticketId: "t1" } }, { request: { ticketId: "t1" } }]);
  expect(run.end.exit).toEqual({ name: "failed", payload: { reason: "Could not get through after retrying" } });
});

test("CommitWithRetry never resends after an uncertain outcome", async () => {
  const commit = CommitWithRetry(DeleteRequest, { maxRetries: 3, backoff: "1 second" });
  const run = await story
    .fragment(commit, { id: "commit-uncertain", input: { request: { ticketId: "t1" } }, props: {} })
    .process()
    .reply("submit", { uncertain: {} })
    .process()
    .run();
  expect(run.calls.submit).toHaveLength(1);
  expect(run.end.exit).toMatchObject({ name: "uncertain" });
});

test("CommitWithRetry records an abandoned call as pending, then settled", async () => {
  const commit = CommitWithRetry(DeleteRequest, { maxRetries: 1, backoff: "1 second" });
  const run = await story
    .fragment(commit, { id: "commit-abandoned", input: { request: { ticketId: "t1" } }, props: {} })
    .process()
    .leave()
    .reply("submit", { success: {} })                 // the outside call is still pending
    .process()
    .run();
  expect(run.end.exit).toBeUndefined();
  expect(run.calls.abandoned).toMatchObject([
    { callback: "submit", outcome: "pending" },
    { callback: "submit", outcome: "success" },
  ]);
});

test("Debounce settles once, after the last input", async () => {
  const debounce = Debounce({ wait: "300 millis" });
  const run = await story
    .fragment(debounce, { id: "debounce-settles", props: {} })
    .raise(debounce.E.Input())
    .process()
    .advance("200 millis")
    .raise(debounce.E.Input())
    .process()
    .advance("300 millis")
    .process()
    .run();
  expect(run.calls.settled).toHaveLength(1);
});

test("AddressStep refuses edits while verifying", async () => {
  const run = await story
    .fragment(AddressStep, {
      id: "address-locked-while-verifying",
      input: { saved: { street: "1 Main St", city: "Springfield" } },
      props: {},
    })
    .send(AddressStep.E.Next())
    .process()
    .checkpoint("verifying")
    .run();
  expect(check(run.checkpoints.verifying.snapshot, AddressStep.E.street.Changed({ value: "x" })))
    .toMatchObject({ _tag: "Denied", reasons: [{ code: "Verifying" }] });
  expect(run.calls.verify).toEqual([{ address: { street: "1 Main St", city: "Springfield" } }]);
});
```

## 4. Rules (25)

**Kind, placement and lifetime**

1. `fragment(config, build)` is the only constructor.
   - Config: `id`, `input`, `states`, `events`, `hostEvents`, `internalEvents`, `memory`,
     `initial`, `embeds`, `props`.
   - Build receives `{ S, E, props }` and returns `default`, `states`, `on`, `schedules`,
     `embeds` bindings and `start`.
   - A fragment declares no `operations`, `context` or `activities`.
2. **Kind comes from declarations.** `states` or any `exit()` makes a step, placed only in a
   `states` list. Neither makes an always-there fragment, placed only in `embeds`. The instance name
   may not equal a host memory key, event or state name.
3. **A fragment lives while its node is active.** On entry, memory comes from `initial({ input })`.
   On exit, schedules stop and memory is removed. An always-there fragment's node is its placer's
   root.
4. Only a step's own node can be targeted from outside. A step with `input` or `start` is never a
   default child at any level, because no transition enters it there.

**Input and live values**

5. `input` is a Schema record read by `initial` and `start`.
   - Embedded: the placer's definition (or fragment config) maps its own `input` to it with
     `{ fragment, input }`.
   - Step: every transition into it uses `S.X.enter(({ memory, context, event }) => input)`. A bare
     target into a step with input is a type error.
6. `prop(schema)` is a live value, read as `({ props })` wherever memory is read. Use `input` for
   what must stay fixed for the activation, `prop` for what must stay current.

**The contract**

7. Contract members are `prop`, `guard()`, `callback()`, `callback().commit({…})`,
   `callback().lookup({…})` and `exit()`. Every member is required. Only a plain callback may be
   `.optional()` (unbound does nothing).
8. The host binds the whole contract in one `props` block at the placement. Callback, exit and
   abandoned handlers carry no guards.
9. **A callback handler never leaves the fragment's node; an exit handler must; an abandoned handler
   never targets.** So an always-there fragment's callbacks may move the host, and a step's cannot.
10. Every declared shape is a Schema field record. Guards, selectors and handlers are functions.

**Who may send**

11. `events` may be sent by anyone who can send to the host. `hostEvents` may only be raised by the
    placer. `internalEvents` come only from this fragment's schedules and replies, each from exactly
    one source. `raise` targets only `hostEvents` of a fragment the writer placed directly.

**One turn, fused**

12. A turn is one fused transition (Machines O3). It is made of:
    - the received event's transition;
    - the handlers of the callbacks and exits it calls;
    - `initial` and `start` of every step it enters;
    - the handlers of the events it raises;
    - in a departure turn, the `"pending"` run of `abandoned` (rule 22).

    Every part reads the pre-turn snapshot plus its own event. Callback handlers read a fragment's
    new value from `event`, not from fragment memory.
13. If any part declines, or a raised event is unhandled, the whole transition declines and falls
    through to ancestors as in Machines O2. `check()` evaluates the same composition.
14. A transition raises at most once per instance. It never raises into a fragment it enters or
    leaves (enter with `input` instead, T2). Static raise cycles are construction errors.
15. **Terminal deliveries are total.** Transitions triggered by a reply, a schedule firing or a
    host exit handler can never decline. In every state that handles them, the last alternative is
    unguarded, and every raise they reach targets a `hostEvent` handled unguarded in every state of
    its fragment.
16. `start` joins every transition that enters a step and reads only that entry's `input`.

**Requests**

17. A request declares its kind and its replies:
    - `.commit({ success, failure, notSent, uncertain })`;
    - `.lookup({ success, failure, broken })`.

    `success` is one event and `failure` one or more. `notSent` and `broken` are payload-free.
    `uncertain` carries `{ attempt: Attempt }`. A `success` or `uncertain` event serves no other kind.
18. Only a machine binds requests, as `{ operation: ({ reply }) => …, abandoned }`.
    - A fragment that places a child with a request relays it to its own request of the same kind,
      fields and reply names (`submit: props.submit`).
    - A `.commit` request binds `O.x.commit` or `O.x.retry`, its select receives only `{ event }`,
      and `abandoned` is required.
    - A `.lookup` request binds `O.x.lookup` or `O.x.refetch`, and its select also reads `memory` and
      `context`.
    - `outcomes` maps exactly `success` and every failure tag, onto the matching kind.
19. **The runtime maps the rest.**
    - Commit: `unknown`, `interrupt`, `defect`, a restore with an acknowledged Attempt, and a
      throwing host mapper all go to `uncertain`. Declined admission (`reject`), cancel before
      invocation and a restore with no acknowledged Attempt go to `notSent` (Persistence O6).
    - Lookup: `defect`, `interrupt`, restore and a throwing mapper go to `broken`.

    A projection (select) defect rejects the turn before admission, so no call exists.
20. One outstanding call per request. A second call while one is pending is a `flow check` error,
    and a runtime defect if reached.
21. Each node entry has a generation, persisted with the snapshot. A reply from an earlier generation
    is fenced.
22. **Abandonment.**
    - When a transition leaves a step while one of its commit calls is pending, `abandoned` runs
      fused into that transition with `{ callback, outcome: "pending", attempt }`. When the call
      settles, it runs once more, as an ordinary later turn at the machine root, with the final kind.
      It may update memory and run actions, never target (E5).
    - Entering the same placement again declines with `PreviousCallUnsettled` until that call
      settles (L7).
    - Abandoned lookup replies are recorded in evidence only.
23. Server values reach a fragment only as reply events, never as its public edit events (D3).

**Leaving**

24. The host may always leave a step with its own events, from the step's node `on` or an ancestor.
    That abandons the step: no exit, and rules 3 and 22 clean up.
25. `flow check` mirrors every type error above for untyped construction, and adds the checks in
    section 6.

## 5. Against the problems

"Prevents" means a type error, a construction error or a `flow check` error at the line that causes
it, or a guarantee the runtime gives with no author code. Anything weaker is "by convention",
"reduces" or "allows".

| # | Verdict | How |
| --- | --- | --- |
| L1 stale timers | prevents | schedules belong to the fragment's node (rule 3) |
| L2 late results | prevents | persisted generations fence replies (rule 21) |
| L3 leftover memory | prevents | memory comes from `input` on every entry, and a fragment that must be fresh is a step that the types refuse to embed |
| L4 no way out | prevents | the host may always leave (rule 24); check 10 flags a step with no exit and no host way out |
| L5 abandoned effects | prevents | `abandoned` is required on every commit binding (type) and receives every settled outcome |
| L6 silent admission | prevents, with Operations amendment | declined or pre-invocation-cancelled calls answer `notSent`, a required reply kind (rule 19) |
| L7 departure gap | prevents for the same placement; by convention across placements | re-entering a placement waits for its abandoned call (rule 22). The synchronous `"pending"` record lets guards refuse other routes to the same operation, but writing that guard is the author's job |
| L8 phantom replies | prevents | replies come only from the admitted call's outcomes; one call per request; select defects reject before admission; `.reply` in Stories fails with no pending call |
| E1 broken invariants | prevents | `events` reach the fragment directly; the only refusal is a declared guard; handlers cannot refuse |
| E2 interfaces growing with depth | prevents for hosts | hosts bind and raise only into direct children; requests relay one level at a time. The UI couples to inner names for sends, as it already does for reads |
| E3 hidden endings | prevents | only exits end a step; callback handlers cannot leave the node (type) |
| E4 refusal by forwarding | prevents | nothing forwards `events`; `hostEvents` are refusable by declaration |
| E5 preempting late handlers | prevents | `abandoned` cannot target (type) |
| H1 bypassed policy | author decides | a `hostEvents` input cannot be sent by the UI; an `events` input meets only a declared guard |
| H2 unforeseen checks | allows, by choice | the fix is to declare a guard or move the input to `hostEvents` |
| H3 faked results | prevents | exits are taken only by the fragment; internal events cannot be raised or sent; reply tokens exist only inside the binding |
| H4 mislabelled results | prevents | kinds are typed; the host maps only success and failure tags; the runtime maps the rest (rules 17–19) |
| H5 interrupt as not sent | prevents | `interrupt` and `defect` go to `uncertain`, never `notSent` (runtime). Check 4 errors when an `uncertain` handler can reach a new call of the same commit request |
| D1 drifting copies | prevents | fragment memory is readable everywhere |
| D2 live values too late | prevents in the host; by convention in the fragment | a commit select sees only `event` (type); `input` is fixed per entry. A fragment could still resend a live `prop` |
| D3 feedback loops | by convention | server values arrive only as reply events (rule 23); a fragment can still wire one into a save |
| D4 unmapped outcomes | prevents | every kind is mapped by host, runtime or type; replies must be handled where pending (check 2); terminal deliveries cannot decline (rule 15) |
| D5 restore in flight | prevents, with plan changes | persisted generations; restore follows Persistence O6 (rule 19) |
| D6 same-turn seeding | reduces | `.enter` reads the triggering event or exit payload; a field updated by the same transition still reads its old value, unchecked |
| D7 drafts on abnormal endings | by convention | exits can carry drafts; abandonment drops fragment memory |
| T1 partial turns | prevents | any declining part declines the whole transition, and `check()` agrees (rule 13) |
| T2 schedule baseline traps | prevents | no raise into a fragment entered by the same transition (rule 14) |
| A1 forwarding that compounds | prevents for UI inputs | `events` go direct; `hostEvents` need one placer line per level |
| A2 unrelated blocks | prevents | one `props` record in the fragment, one block at the placement |
| A3 conditional rules | reduces | one rulebook; four rules differ by kind, all following from placement (section 2) |
| A4 overloaded words | mostly avoided | `input`, `.commit` and `.lookup` keep their plan meanings |
| A5 I/O inside fragments | prevents | fragments declare no operations |
| A6 silence discovered late | prevents | everything required; only plain callbacks may be optional, and `flow graph` lists them unbound |

## 6. What `flow check` and `flow graph` can check

Everything below is data at construction: placements, contracts, bindings, targets, request kinds,
raise lists, `start` and `.enter`. Guards and selectors stay opaque; deny codes come from types.

**Errors**

1. Every type error in section 4, mirrored for untyped construction (rule 25).
2. A reply event unhandled in a fragment state reachable while its call is pending.
3. A request callable again while its call is pending.
4. A path from an `uncertain` reply handler to a new call of the same request when that request is
   bound to `O.x.commit` (H5). Calls bound to `O.x.retry` are exempt: they reuse the Attempt.
5. A terminal delivery (reply, schedule firing, host exit handler) that can decline: a guarded last
   alternative, or a raise into a non-total `hostEvent` (rule 15).
6. A raise into a non-child, a non-`hostEvent`, a fragment entered or left by the same transition,
   twice into one instance, or around a static cycle.
7. A step with `input` or `start` as a default child.
8. An internal event with no source or two sources.
9. Instance names colliding with host names; expanded state paths over ten segments.

**Warnings**

10. A step with no exit taken and no host transition out (stuck, L4), plus the existing stuck-state
    warning for host states.
11. A raise into a fragment state that may not handle it. The message says the whole transition
    would decline and fall through to an ancestor handler, which `check()` may then report as
    Allowed.
12. Unreachable fragment states; declared exits no transition takes.
13. A public fragment event unhandled in a reachable fragment state.
14. Leaving a step while a commit may be pending, with no cancel action.
15. A declared guard used on no transition; a declared callback never called.
16. A fragment placed in only one machine.

**Graph and explain**

17. `flow graph` draws each fragment as a collapsible node tagged `{ id, instance, kind }`.
    - Exits are labelled edges, and host abandonment is drawn from the node boundary.
    - Replies run from the call to their handlers, marked with their kind.
    - `abandoned` runs from the node to the root handler.
18. `flow explain` lists a fused transition's parts: callbacks called, host handlers joined, steps
    entered with their `input`, `start` actions, raises and the `"pending"` abandoned run.
19. Unbound optional callbacks are listed per placement.

## 7. Compared with proposal.md, and plan changes

**Adds:**
- one constructor with a derived kind;
- `hostEvents`;
- `input`, with `.enter` and the definition-side `{ fragment, input }`;
- `exit()` in `props`;
- requests with a declared kind (`.commit`, `.lookup`) and runtime-owned uncertain kinds;
- `abandoned` with a synchronous `"pending"` run;
- `start`;
- fused `raise` with whole-transition decline and total terminal deliveries;
- `story.fragment`.

**Removes:**
- `trait`/`subroutine`;
- D11 forwarding for public inputs;
- the separate `exits` block;
- `initial({ props })`;
- optional guards;
- host mapping of `unknown`/`interrupt`/`defect`;
- the `payload` keyword.

**Plan changes (complete list):**

- **Machines O1/O2:**
  - `fragment`, `embeds`, `hostEvents`, steps, `.enter`, `start`, instance names and the derived
    kind;
  - a step with input or start cannot be a default;
  - re-entry declines with `PreviousCallUnsettled`.
- **Machines O3:** one pre-turn read is kept; it gains the fused parts list (including the
  `"pending"` abandoned run), whole-transition decline on raise, and total terminal deliveries.
  The settled `abandoned` run is a **new turn source**: an ordinary later turn whose handler is
  scoped to the machine root.
- **Operations O2:**
  - replies to a fragment are fenced, not delivered to the later state;
  - when bound to a request, `success` and every failure tag **must** be mapped, against O2's
    "each outcomes member is optional";
  - a throwing outcome mapper delivers `uncertain` or `broken` instead of an issue only.
- **Operations O3:** `notSent` for `reject`-declined or pre-invocation-cancelled calls bound to a
  request; payload-only selects in commit bindings; `O.x.retry` as a commit-kind binding.
- **Persistence O6:** a restored pending request follows the Attempt rule (acknowledged →
  `uncertain`, else `notSent`; reads → `broken`); generations persist. Fragment ids and versions
  go into the saved shape and the SSR digest.
- **Testing O1/O3/O5:** `story.fragment` with `.raise`, `.reply` and `.leave`. `.reply` is an
  injection at the fragment boundary only.
- **CommandLine O5, Inspection:** the checks above, the `kind` tag, and abandonment and fencing
  evidence.

## 8. Possible cuts (for the user to decide; none applied)

From [round2-simplicity.md](../reviews/round2-simplicity.md) section 2, with the losses corrected by
[round2-correctness.md](../reviews/round2-correctness.md) section 8.

| # | Cut | What it simplifies | Use cases that break | Problems it reopens |
| --- | --- | --- | --- | --- |
| 1 | Live `prop` | 1 word, rule 6, the D2 convention gap in fragments | Paginate `hasMore`-style live reads, permission flags that change | D1 (values pushed in as copies) |
| 2 | Lookup requests (reads go back to host activities or host-mapped refetches) | `.lookup`, `broken`, the read restore rule, read select rules | Poll and AddressStep `verify` owning their replies | D4 for reads; **understated before:** H3 and H4 for reads (a host could fake `Verified`), L2 for reads, D5 (a pending read at restore strands the step) |
| 3 | `story.fragment` | 5 identifiers and the Testing amendment | Testing alone without a hand-written harness | Principle 10. The **fixture-backed variant** (one binding per Story plus a Layer, as codex) removes only the amendment, not the feature |
| 4 | `raise` + `hostEvents` + whole-transition decline (as a bundle) | 3 words, rules 11 (part), 13–15, 2 checks | Debounce fed by the host; policy-first inputs (`Set`) | H1, E4 (if forwarding returns); cutting only the decline reopens T1 |
| 5 | Requests with fencing, abandonment and restore | about 10 words, rules 17–22, 5 checks, most plan amendments | Every I/O-driven step | L2, L5, L6, L7, L8, D2, D4, D5, H3, H4, H5 (all return in host code) |

Also available, from the cross-proposal list:

| # | Cut | What it simplifies | What breaks | Reopens |
| --- | --- | --- | --- | --- |
| 6 | Steps inside fragments | relay, nested generations, nested `abandoned` routing | composite steps (a wizard step that contains a confirm) | prior-art D1, A1 inside composites |
| 7 | Forbid abandoning a step with a commit in flight | the `abandoned` route | leaving mid-commit | **understated before:** L4 fully for hung adapters, and a post-invocation cancel still reports `unknown` that needs a route, so the protocol does not disappear; L7 vanishes |
| 8 | Always-there callbacks that move the host | rule 9's first clause | idle timeout → LOCKED from an always-there fragment | none; the workaround is a step |
| 9 | `start` | 1 word, rule 16, the default rule | self-contained first sends | A7, D2, and L8 (the one-outstanding check spans two owners) |

## 9. Honest weaknesses

1. **The kind is read from two declarations, not one word.** This is the split's rule under one
   name, and round 2 favours two names.
2. **No inline single-fragment step.** "A Field while RENAMING" needs a small step wrapper with exits.
3. **The UI couples to inner names** (`E.ADDRESS.street.Changed`), as reads already do.
4. **H1 is the author's choice** of `events` or `hostEvents`.
5. **Re-entry waits for a hung commit.** Rule 22 refuses re-entering a placement until its abandoned
   call settles. An adapter that never settles blocks that placement (not the actor) for good.
6. **A defect in fragment code in a reply-triggered transition** (a throwing `.from`) rejects the
   turn under Machines O3, and the reply is lost. Rule 15 covers declines, not defects; the host can
   still leave.
7. **`start` is an entry action by another name,** limited to steps.
8. **D6 partly open; D3, D7 and D2 inside fragments are conventions.**
9. **Fragment Stories inject replies** (a named Testing amendment). Reviewers favour fixtures.
10. **Type cost:** derived kinds, kind-typed reply tokens, relay typing and nested `E` paths push on
    inference. The S1 spike must test them first.

## 10. Counts

| | New keywords | Numbered rules | Checks (errors + warnings) |
| --- | --- | --- | --- |
| Round 1 | ~25 | 26 (+ ~4 in prose) | 17 |
| Round 2 | 27 | 25 | 16 |

The drops removed `payload`, the second `.reply` form, the separate check lines that restated type
errors, rule 13 and the restated parts of rules 17 and 26. Correctness fixes added:
- `notSent`, `uncertain` and `broken` (replacing host-visible `defect`, `interrupt` and `unknown`);
- `.lookup`, which declares the request kind;
- the `"pending"` outcome;
- the Story `.raise`;
- the terminal-totality rule.

## 11. Revision log (round 1)

| Finding | Change |
| --- | --- |
| C-B1, H4: replies not tied to outcome kinds | Typed reply kinds; the host maps only success and failure tags (opus-split); tokens exist only as the binding argument |
| C-B2, L5: abandoned commit dropped | Required non-targeting `abandoned` route (codex) |
| C-B3, L6: silent admission | Answered by a reply kind (codex) |
| C-M1: `initial({ props })` broke the split | Schema `input`; definition-side `{ fragment, input }`; `.enter` for steps |
| C-M2: H1 overclaimed; optional guards silent | `hostEvents` (opus-split); guards always required |
| C-M3: whole-turn rejection invisible | Kept; warning plus `check()` codes. Rejected an optional-raise marker (escape hatch, no failure case) |
| C-M4: D2 not enforced | Payload-only commit selects; `input` fixed per entry |
| C-M5: restore unspecified | Persisted generations and restore rules |
| C-m1, C-m2, C-m3 | Guard signature fixed; `candidate` captured; dead end then kept |
| C-m4, P2: step model rewrote O3 | Replaced with one fused transition |
| P1: either placement | Kind derived from declarations; one placement per kind |
| P3: derived event ownership | Three declared sender lists |
| P6: `.reply` vs Testing O3 | Kept with a named amendment |
| P8, P9, P11 | Callback/exit distinction stated; renames; embedded Story harness |
| Yardstick L5, L6, H4, D5, D6, D7, T1, T2, E4 | Added |

## 12. Revision log (round 2)

Findings from `reviews/round2-correctness.md` (C2), `round2-principles.md` (P2) and
`round2-simplicity.md` (S2).

| Finding | Change |
| --- | --- |
| C2-B1, H5: `interrupt` retried as "not sent" (double order) | Commit kinds are now `success`, `failure`, `notSent`, `uncertain`. The runtime sends `interrupt`, `defect` and `unknown` to `uncertain` with the Attempt, and only guaranteed non-invocation to `notSent` (borrowed from opus-split). CommitWithRetry never resends after `uncertain`. Check 4 errors on any such path. |
| C2-M1, L7: departure gap | `abandoned` runs synchronously with `"pending"` in the departure turn (from codex-split 4.5), in the one-handler shape `{ outcome, attempt }`. Re-entering the same placement now declines until the call settles. TicketEditor's Delete guard reads the record. |
| C2-M2: abandoned handler clobbered an Attempt | Handlers clear only a matching Attempt id and return `{}` otherwise (TicketEditor, and Checkout's shared `track`). |
| C2-m1: fallthrough after decline | Stated in rule 13 and in warning 11's message. |
| C2-m3: no `O.x.retry` path | Added a `Reconcile` step bound to `O.Orders.place.retry`. Checkout's uncertain exit enters it with the Attempt from the exit payload (borrowed from sonnet-split UNSURE and codex reconcile flows). |
| P2-1: restore contradicted Persistence O6 | An acknowledged Attempt → `uncertain`; none → `notSent`; reads → `broken` (rule 19). |
| P2-2: request kind implied; unlisted amendments | The kind is declared (`.commit` / `.lookup`). Section 7 lists required mappings against Operations O2, the settled `abandoned` run as a new turn source scoped to the machine root, mapper defects and `retry` bindings. The relay rule (rule 18) keeps every binding at a machine, so the abandoned handler's owner is never a left step. |
| P2-3: projection defects; terminal deliveries | A throwing host mapper delivers `uncertain` or `broken`. A select defect rejects before admission (rule 19). Terminal-totality rule 15 and check 5 come from codex-split. Fragment-code defects in reply transitions remain a weakness (9.6). |
| P2-4: nested step defaults; Story hostEvents | A step with input or start may not be a default at any level (rule 4). `story.fragment` gains `.raise` for `hostEvents`, and a Debounce Story was added. |
| P2-5: two `.reply` forms | One form, by kind. Kept injection rather than fixtures; fixtures are listed as cut 3's variant for the user to decide. |
| P2 minor: A3 overstated | A3 is now "reduces", and section 2 names the kind-specific rules. |
| P2 minor: abandoned `attempt` nullability | It is always present and non-null. |
| P2 minor: AddressStep tripped warning 13 | VERIFYING handles `Next` with an explicit `deny("Verifying")`. |
| P2 minor: `event` and `payload` both used | `payload` is dropped; host handlers use `event` for the declared payload. |
| Yardstick L7, H5, E5, L8 | Added to section 5. L7 is "prevents for the same placement; by convention across placements". |
| S2 drops applied | One `.reply` form; `raise` only into `hostEvents`; type-mirroring checks collapsed into rule 25 and check 1 (untyped construction runs the same checks); rule 13 and the restated parts of rules 17 and 26 removed; `payload` → `event` under the stated condition. |
| S2 drops not applied | **Two constructor names:** the round rules keep this proposal single, and section 2 states the cost. **Imply empty declarations** (cross drop 8): correctness section 8 says it reopens L4 and L1 with derived kinds (Poll would become always-there). |
| S2 feature cuts | Not applied. Listed in section 8 with the corrected losses (cuts 2 and 7 were understated). |
| Rejected: fixture-backed fragment Stories | Kept `.reply` with a named Testing amendment. Fixtures need a binding plus a Layer per Story for the same boundary; the user can choose cut 3's variant. |
| Not addressed: "self" counting as a state change | That finding applies to proposals with an "at most one part may target" rule; this proposal has none. |
